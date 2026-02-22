import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";
import { applyMergedOverrides } from "../netlify/functions/lib/reportEngine/injection/applyMergedOverrides";
import { renderDocxByMergingCoverAndBody } from "../netlify/functions/lib/renderDocx";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_PHASE7_DOCX_E2E",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

async function main(): Promise<void> {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "rewireable fuse" } },
      rcd_coverage: { value: "partial" },
      visible_thermal_stress: { value: "yes" },
      lifecycle: { photo_ids: ["P801", "P802"] },
    }),
    profile: "owner",
    modules: ["lifecycle"],
    options: { narrativeDensity: "standard" },
  });

  const override = applyMergedOverrides(
    {
      FINDING_PAGES_HTML: "<p>Legacy findings html</p>",
    } as Record<string, unknown>,
    plan,
    {
      mode: "legacy",
      injection: { findings: true },
      hasExplicitModules: true,
      inspectionId: "TEST_PHASE7_DOCX_E2E",
      baseUrl: "https://example.test",
      signingSecret: "secret-for-tests",
    }
  );

  const findingsHtml = String(override.templateData.FINDING_PAGES_HTML || "");
  const findingsCount = plan.merged.findings.length;
  assert(findingsCount > 0, "Docx E2E requires merged findings");

  const templateCandidates = [
    path.join(process.cwd(), "report-template-md.docx"),
    path.join(process.cwd(), "netlify", "functions", "report-template-md.docx"),
    path.join(process.cwd(), "report-template.docx"),
    path.join(process.cwd(), "netlify", "functions", "report-template.docx"),
  ];
  const templatePath = templateCandidates.find((p) => fs.existsSync(p));
  assert(Boolean(templatePath), `Missing template, checked: ${templateCandidates.join(", ")}`);
  const templateBuffer = fs.readFileSync(templatePath as string);

  const mergedReportHtml = `
  <!doctype html><html><body>
  <h2>Observations and evidence</h2>
  ${findingsHtml}
  <h2>Terms, limitations and legal framework</h2>
  <p>Standard terms apply.</p>
  </body></html>`;
  const legacyReportHtml = `
  <!doctype html><html><body>
  <h2>Observations and evidence</h2>
  <p>Legacy findings html</p>
  <h2>Terms, limitations and legal framework</h2>
  <p>Standard terms apply.</p>
  </body></html>`;

  const renderXml = async (html: string): Promise<string> => {
    const output = await renderDocxByMergingCoverAndBody(
      templateBuffer,
      {
        INSPECTION_ID: "TEST_PHASE7_DOCX_E2E",
        ASSESSMENT_DATE: "2026-02-03",
        PREPARED_FOR: "Test Client",
        PREPARED_BY: "Test Inspector",
        PROPERTY_ADDRESS: "123 Test Street",
        PROPERTY_TYPE: "House",
        ASSESSMENT_PURPOSE: "Decision-support assessment.",
      },
      html,
      "phase7-docx-e2e"
    );
    const zip = new PizZip(output);
    return zip.files["word/document.xml"]?.asText?.() || "";
  };

  const baselineXml = await renderXml(legacyReportHtml);
  const docXml = await renderXml(mergedReportHtml);
  assert(docXml.length > 0, "document.xml should exist");

  // 1) Sentinel should not leak as visible text in final DOCX.
  assert(!docXml.includes("SENTINEL_FINDINGS_V1"), "Sentinel leaked into final document.xml");

  // 2) Forbidden tokens should not regress relative to legacy DOCX output.
  const forbiddenPatterns = [/\bundefined\b/gi, /\|[-—]{3,}\|/g, /###/g, /<h2/gi];
  for (const pattern of forbiddenPatterns) {
    const mergedCount = (docXml.match(pattern) || []).length;
    const baselineCount = (baselineXml.match(pattern) || []).length;
    assert(
      mergedCount <= baselineCount,
      `Forbidden token count regressed: pattern=${pattern}, merged=${mergedCount}, baseline=${baselineCount}`
    );
  }

  // 3) Major header duplicate check at DOCX level.
  const headerCount = (docXml.match(/Terms, limitations and legal framework/g) || []).length;
  const baselineHeaderCount = (baselineXml.match(/Terms, limitations and legal framework/g) || []).length;
  assert(headerCount <= Math.max(1, baselineHeaderCount), "Major header duplicated in final document.xml");

  // 4) h3/h4 heading mapping sanity check (avoid heading pollution).
  const heading1Count = (docXml.match(/w:pStyle w:val="Heading1"/g) || []).length;
  const heading2Count = (docXml.match(/w:pStyle w:val="Heading2"/g) || []).length;
  assert(heading1Count <= 2, `Unexpected Heading1 count: ${heading1Count}`);
  assert(heading2Count <= 4, `Unexpected Heading2 count: ${heading2Count}`);

  // 5) Page break compatibility check.
  const pageBreaks = (docXml.match(/w:br[^>]*w:type="page"/g) || []).length;
  const renderedBreaks = (docXml.match(/w:lastRenderedPageBreak/g) || []).length;
  assert(
    pageBreaks + renderedBreaks >= Math.max(0, findingsCount - 1),
    `Insufficient page breaks in docx: findings=${findingsCount}, pageBreaks=${pageBreaks}, renderedBreaks=${renderedBreaks}`
  );

  console.log("✅ Phase7 preflight DOCX E2E checks passed");
}

main();
