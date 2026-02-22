import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";
import {
  buildFindingPagesHtmlFromMerged,
  validateMergedFindingPagesHtml,
} from "../netlify/functions/lib/reportEngine/findings/buildFindingPagesHtmlFromMerged";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_PHASE7A_FINDINGS",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

function testMergedFindingsHtmlStructure(): void {
  const inspectionId = "TEST_PHASE7A_FINDINGS";
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "rewireable fuse" } },
      rcd_coverage: { value: "partial" },
      visible_thermal_stress: { value: "yes" },
      lifecycle: { photo_ids: ["P101", "P102"] },
    }),
    profile: "owner",
    modules: ["lifecycle"],
  });

  const findings = plan.merged.findings;
  assert(findings.length > 0, "Phase7A test requires merged findings output");

  const html = buildFindingPagesHtmlFromMerged(findings, {
    inspectionId,
    baseUrl: "https://example.test",
    signingSecret: "secret-for-tests",
  });

  const validation = validateMergedFindingPagesHtml(html, findings.length);
  assert(validation.valid, `Merged findings html validation failed: ${validation.errors.join("; ")}`);

  const linkCount = (html.match(/<a\s+href=/g) || []).length;
  const expectedLinks = findings.reduce((sum, f) => sum + (Array.isArray(f.evidenceRefs) ? f.evidenceRefs.length : 0), 0);
  if (expectedLinks > 0) {
    assert(linkCount === expectedLinks, `Evidence links count mismatch: expected ${expectedLinks}, got ${linkCount}`);
  }

  assert(html.includes("SENTINEL_FINDINGS_V1"), "sentinel must exist");
  assert((html.match(/page-break-before:always/g) || []).length >= findings.length, "page break markers missing");
  assert(!/\bundefined\b/i.test(html), "forbidden token 'undefined' found");
  assert(!/\|[-—]{3,}\|/.test(html), "forbidden markdown table separator found");
  assert(!/###/.test(html), "forbidden markdown heading found");
  assert(!/<h2/i.test(html), "forbidden <h2> tag found in finding pages");
}

function main(): void {
  testMergedFindingsHtmlStructure();
  console.log("✅ Phase7A merged findings HTML tests passed");
}

main();
