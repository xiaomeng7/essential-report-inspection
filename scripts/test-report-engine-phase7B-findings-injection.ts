import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";
import { applyMergedOverrides, INJECTION_REASON } from "../netlify/functions/lib/reportEngine/injection/applyMergedOverrides";
import { renderReportFromSlots } from "../netlify/functions/lib/buildReportMarkdown";
import type { StructuredReport } from "../netlify/functions/lib/reportContract";
import { assertEvidenceStructure } from "../netlify/functions/lib/reportContract";
import { countMajorHeaderDuplicates } from "../netlify/functions/lib/reportEngine/injection/compatibilityContract";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_PHASE7B_FINDINGS",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

function baseTemplateData(): Record<string, string> {
  return {
    FINDING_PAGES_HTML: "<p>Legacy findings html</p>",
    WHAT_THIS_MEANS_SECTION: "Legacy WTM",
    EXECUTIVE_DECISION_SIGNALS: "• Legacy exec",
    CAPEX_TABLE_ROWS: "| Year 1-2 | Legacy row | AUD $1,000 - $2,000 |",
    CAPEX_SNAPSHOT: "AUD $1,000 - $2,000",
  };
}

function toStructuredReport(data: Record<string, string>): StructuredReport {
  return {
    INSPECTION_ID: "TEST_PHASE7B_FINDINGS",
    ASSESSMENT_DATE: "2026-02-03",
    PREPARED_FOR: "Test Client",
    PREPARED_BY: "Test Inspector",
    PROPERTY_ADDRESS: "123 Test Street",
    PROPERTY_TYPE: "House",
    ASSESSMENT_PURPOSE: "Decision-support assessment.",
    OVERALL_STATUS: "MODERATE RISK",
    OVERALL_STATUS_BADGE: "🟡 Moderate",
    EXECUTIVE_DECISION_SIGNALS: data.EXECUTIVE_DECISION_SIGNALS || "• Legacy exec",
    CAPEX_SNAPSHOT: data.CAPEX_SNAPSHOT || "To be confirmed",
    PRIORITY_TABLE_ROWS: "",
    WHAT_THIS_MEANS_SECTION: data.WHAT_THIS_MEANS_SECTION || "Legacy WTM",
    SCOPE_SECTION: "Scope",
    LIMITATIONS_SECTION: "Limitations",
    FINDING_PAGES_HTML: data.FINDING_PAGES_HTML || "<p>Legacy findings html</p>",
    THERMAL_SECTION: "No thermal issues.",
    CAPEX_TABLE_ROWS: data.CAPEX_TABLE_ROWS || "",
    CAPEX_DISCLAIMER_LINE: "Indicative only.",
    DECISION_PATHWAYS: "- Pathway",
    TERMS_AND_CONDITIONS: "Standard terms apply.",
    TEST_DATA_SECTION: "Not captured.",
    TECHNICAL_NOTES: "Notes",
    CLOSING_STATEMENT: "End",
  };
}

function testFindingsInjectionSwitching(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "rewireable fuse" } },
      lifecycle: { photo_ids: ["P301", "P302"] },
    }),
    profile: "owner",
    modules: ["lifecycle"],
  });

  const off = applyMergedOverrides(baseTemplateData(), plan, {
    mode: "legacy",
    injection: { findings: false },
    hasExplicitModules: true,
    inspectionId: "TEST_PHASE7B_FINDINGS",
    baseUrl: "https://example.test",
    signingSecret: "secret-for-tests",
  });
  assert(off.slotSourceMap.FINDING_PAGES_HTML.source === "legacy", "inject_findings=false should keep legacy source");

  const on = applyMergedOverrides(baseTemplateData(), plan, {
    mode: "legacy",
    injection: { findings: true },
    hasExplicitModules: true,
    inspectionId: "TEST_PHASE7B_FINDINGS",
    baseUrl: "https://example.test",
    signingSecret: "secret-for-tests",
  });
  assert(on.slotSourceMap.FINDING_PAGES_HTML.source === "merged", "inject_findings=true should switch to merged");
  assert(String(on.templateData.FINDING_PAGES_HTML).includes("SENTINEL_FINDINGS_V1"), "merged findings must contain sentinel");
  assert(
    (String(on.templateData.FINDING_PAGES_HTML).match(/page-break-before:always/g) || []).length >= plan.merged.findings.length,
    "merged findings should include page breaks"
  );
}

function testSafetyGuardWhenNoExplicitModules(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "rewireable fuse" } },
      lifecycle: { photo_ids: ["P401"] },
    }),
    profile: "owner",
  });
  const result = applyMergedOverrides(baseTemplateData(), plan, {
    mode: "legacy",
    injection: { findings: true },
    hasExplicitModules: false,
    inspectionId: "TEST_PHASE7B_FINDINGS",
    baseUrl: "https://example.test",
    signingSecret: "secret-for-tests",
  });
  assert(result.slotSourceMap.FINDING_PAGES_HTML.source === "legacy", "no explicit modules must keep findings in legacy");
  assert(
    result.slotSourceMap.FINDING_PAGES_HTML.reason === INJECTION_REASON.NO_EXPLICIT_MODULES,
    "guard reason should be recorded when no explicit modules"
  );
}

function testEvidenceLinksAndGuardChain(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "pre-1970" } },
      switchboard: { type: { value: "old cb" } },
      lifecycle: { photo_ids: ["P501", "P502", "P503"] },
    }),
    profile: "tenant",
    modules: ["lifecycle"],
  });

  const on = applyMergedOverrides(baseTemplateData(), plan, {
    mode: "legacy",
    injection: { findings: true },
    hasExplicitModules: true,
    inspectionId: "TEST_PHASE7B_FINDINGS",
    baseUrl: "https://example.test",
    signingSecret: "secret-for-tests",
  });
  const html = String(on.templateData.FINDING_PAGES_HTML || "");
  const expectedLinks = plan.merged.findings.reduce((sum, f) => sum + (f.evidenceRefs?.length || 0), 0);
  const actualLinks = (html.match(/<a\s+href=/g) || []).length;
  if (expectedLinks > 0) {
    assert(actualLinks === expectedLinks, `evidence links mismatch expected=${expectedLinks} actual=${actualLinks}`);
  }

  const failures: Array<{ rule: string; field?: string; message: string }> = [];
  assertEvidenceStructure(html, failures);
  assert(failures.length === 0, `evidence structure guard failed: ${failures.map((f) => f.message).join("; ")}`);
}

function testMajorHeaderNoDuplication(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "1990-2010" } },
      switchboard: { type: { value: "old cb" } },
      lifecycle: { photo_ids: ["P601"] },
    }),
    profile: "owner",
    modules: ["lifecycle"],
  });
  const on = applyMergedOverrides(baseTemplateData(), plan, {
    mode: "legacy",
    injection: { findings: true },
    hasExplicitModules: true,
    inspectionId: "TEST_PHASE7B_FINDINGS",
    baseUrl: "https://example.test",
    signingSecret: "secret-for-tests",
  });
  const markdown = renderReportFromSlots(toStructuredReport(on.templateData as Record<string, string>));
  const counts = countMajorHeaderDuplicates(markdown);
  for (const [header, count] of Object.entries(counts)) {
    assert(count <= 1, `major header duplicated: ${header}`);
  }
}

function main(): void {
  testFindingsInjectionSwitching();
  testSafetyGuardWhenNoExplicitModules();
  testEvidenceLinksAndGuardChain();
  testMajorHeaderNoDuplication();
  console.log("✅ Phase7B findings injection tests passed");
}

main();
