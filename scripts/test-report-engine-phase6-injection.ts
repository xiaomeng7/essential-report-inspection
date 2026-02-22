import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";
import { applyMergedOverrides } from "../netlify/functions/lib/reportEngine/injection/applyMergedOverrides";
import { renderReportFromSlots } from "../netlify/functions/lib/buildReportMarkdown";
import type { StructuredReport } from "../netlify/functions/lib/reportContract";
import { countMajorHeaderDuplicates } from "../netlify/functions/lib/reportEngine/injection/compatibilityContract";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_PHASE6_INJECTION",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

function baseTemplateData(): Record<string, string> {
  return {
    WHAT_THIS_MEANS_SECTION: "Legacy what-this-means",
    WHAT_THIS_MEANS_TEXT: "Legacy what-this-means",
    EXECUTIVE_DECISION_SIGNALS: "• Legacy executive signal",
    EXEC_SUMMARY_TEXT: "• Legacy executive signal",
    EXECUTIVE_SUMMARY: "Legacy executive summary",
  };
}

function toStructuredReport(data: Record<string, string>): StructuredReport {
  return {
    INSPECTION_ID: "TEST_PHASE6_INJECTION",
    ASSESSMENT_DATE: "2026-02-03",
    PREPARED_FOR: "Test Client",
    PREPARED_BY: "Test Inspector",
    PROPERTY_ADDRESS: "123 Test Street",
    PROPERTY_TYPE: "House",
    ASSESSMENT_PURPOSE: "Decision-support assessment.",
    OVERALL_STATUS: "MODERATE RISK",
    OVERALL_STATUS_BADGE: "🟡 Moderate",
    EXECUTIVE_DECISION_SIGNALS: data.EXECUTIVE_DECISION_SIGNALS || "• Legacy executive signal",
    CAPEX_SNAPSHOT: "To be confirmed",
    PRIORITY_TABLE_ROWS: "",
    WHAT_THIS_MEANS_SECTION: data.WHAT_THIS_MEANS_SECTION || "Legacy what-this-means",
    SCOPE_SECTION: "Scope",
    LIMITATIONS_SECTION: "Limitations",
    FINDING_PAGES_HTML: "<p>No findings were identified during this assessment.</p>",
    THERMAL_SECTION: "No thermal issues.",
    CAPEX_TABLE_ROWS: "",
    CAPEX_DISCLAIMER_LINE: "Indicative only.",
    DECISION_PATHWAYS: "- Pathway",
    TERMS_AND_CONDITIONS: "Standard terms apply.",
    TEST_DATA_SECTION: "Not captured.",
    TECHNICAL_NOTES: "Notes",
    CLOSING_STATEMENT: "End",
  };
}

function testSlotSingleSourceAssertion(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "rewireable fuse" } },
      lifecycle: { photo_ids: ["P1"] },
    }),
    profile: "investor",
    modules: ["lifecycle"],
  });
  const result = applyMergedOverrides(baseTemplateData(), plan, {
    mode: "merged_what_this_means",
  });
  assert(result.slotSourceMap.WHAT_THIS_MEANS_SECTION.source === "merged", "WTM slot source should be merged");
  assert(
    result.templateData.WHAT_THIS_MEANS_SECTION !== "Legacy what-this-means",
    "WTM content should be replaced by merged content"
  );
}

function testNoDuplicateHeaderAssertion(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "old cb" } },
      lifecycle: { photo_ids: ["P2"] },
    }),
    profile: "owner",
    modules: ["lifecycle"],
  });
  const injected = applyMergedOverrides(baseTemplateData(), plan, {
    mode: "merged_exec+wtm",
  });

  const markdown = renderReportFromSlots(toStructuredReport(injected.templateData as Record<string, string>));
  const counts = countMajorHeaderDuplicates(markdown);
  for (const [header, count] of Object.entries(counts)) {
    assert(count <= 1, `Major header duplicated: ${header}`);
  }
}

function testLegacyVsMergedShadowCompare(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "pre-1970" } },
      switchboard: { type: { value: "ceramic fuse" } },
      lifecycle: { photo_ids: ["P3"] },
    }),
    profile: "investor",
    modules: ["lifecycle"],
  });
  const baseline = baseTemplateData();
  const off = applyMergedOverrides(baseline, plan, { mode: "legacy" });
  const on = applyMergedOverrides(baseline, plan, { mode: "merged_exec+wtm" });

  assert(
    JSON.stringify(off.templateData) === JSON.stringify(baseline),
    "Legacy mode should keep template data unchanged"
  );

  const baselineKeys = Object.keys(off.templateData).sort().join("|");
  const injectedKeys = Object.keys(on.templateData).sort().join("|");
  assert(baselineKeys === injectedKeys, "Injection should not add/remove template structure keys");
  assert(
    String(on.templateData.EXECUTIVE_DECISION_SIGNALS) !== String(off.templateData.EXECUTIVE_DECISION_SIGNALS) ||
      String(on.templateData.WHAT_THIS_MEANS_SECTION) !== String(off.templateData.WHAT_THIS_MEANS_SECTION),
    "Merged mode should change at least one target slot"
  );
}

function main(): void {
  testSlotSingleSourceAssertion();
  testNoDuplicateHeaderAssertion();
  testLegacyVsMergedShadowCompare();
  console.log("✅ Phase6 Injection tests passed");
}

main();
