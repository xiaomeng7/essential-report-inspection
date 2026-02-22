import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";
import {
  applyMergedOverrides,
  computeCapexSnapshotFromRows,
  dedupeCapexRows,
  INJECTION_REASON,
  renderCapexRowsMarkdown,
} from "../netlify/functions/lib/reportEngine/injection/applyMergedOverrides";
import { renderReportFromSlots } from "../netlify/functions/lib/buildReportMarkdown";
import type { StructuredReport } from "../netlify/functions/lib/reportContract";
import { countMajorHeaderDuplicates } from "../netlify/functions/lib/reportEngine/injection/compatibilityContract";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_PHASE6_5_CAPEX",
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
    CAPEX_TABLE_ROWS: "| Year 1-2 | Legacy capex row | AUD $1,000 - $2,000 |",
    CAPEX_SNAPSHOT: "AUD $1,000 - $2,000",
  };
}

function toStructuredReport(data: Record<string, string>): StructuredReport {
  return {
    INSPECTION_ID: "TEST_PHASE6_5_CAPEX",
    ASSESSMENT_DATE: "2026-02-03",
    PREPARED_FOR: "Test Client",
    PREPARED_BY: "Test Inspector",
    PROPERTY_ADDRESS: "123 Test Street",
    PROPERTY_TYPE: "House",
    ASSESSMENT_PURPOSE: "Decision-support assessment.",
    OVERALL_STATUS: "MODERATE RISK",
    OVERALL_STATUS_BADGE: "🟡 Moderate",
    EXECUTIVE_DECISION_SIGNALS: data.EXECUTIVE_DECISION_SIGNALS || "• Legacy executive signal",
    CAPEX_SNAPSHOT: data.CAPEX_SNAPSHOT || "To be confirmed",
    PRIORITY_TABLE_ROWS: "",
    WHAT_THIS_MEANS_SECTION: data.WHAT_THIS_MEANS_SECTION || "Legacy what-this-means",
    SCOPE_SECTION: "Scope",
    LIMITATIONS_SECTION: "Limitations",
    FINDING_PAGES_HTML: "<p>No findings were identified during this assessment.</p>",
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

function testDefaultLegacyCompatibility(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      switchboard: { main_switch_rating: { value: "63A" } },
      measured: { load_current: { value: "41" } },
    }),
    profile: "investor",
  });
  const baseline = baseTemplateData();
  const result = applyMergedOverrides(baseline, plan, { mode: "legacy" });
  assert(result.slotSourceMap.CAPEX_TABLE_ROWS.source === "legacy", "Legacy mode capex rows source must be legacy");
  assert(result.slotSourceMap.CAPEX_SNAPSHOT.source === "legacy", "Legacy mode capex snapshot source must be legacy");
  assert(result.templateData.CAPEX_TABLE_ROWS === baseline.CAPEX_TABLE_ROWS, "Legacy capex rows should stay unchanged");
  assert(result.templateData.CAPEX_SNAPSHOT === baseline.CAPEX_SNAPSHOT, "Legacy capex snapshot should stay unchanged");
}

function testEnergyCapexInjectionAndDeterminism(): void {
  const req = {
    inspection: makeInspection({
      switchboard: { main_switch_rating: { value: "63A" } },
      measured: { load_current: { value: "48" }, high_load_devices: { value: "EV charger, ducted AC" } },
      loads: { ev_charger: { value: "yes" } },
      energy_v2: {
        circuits: [
          { label: "EV charger", category: "ev", measuredCurrentA: 22, evidenceCoverage: "measured" },
          { label: "Air Conditioning", category: "ac", measuredCurrentA: 18, evidenceCoverage: "measured" },
        ],
      },
    }),
    profile: "investor" as const,
    modules: ["energy"] as const,
  };
  const planA = buildReportPlan(req);
  const planB = buildReportPlan(req);
  assert(JSON.stringify(planA.merged.capexRows) === JSON.stringify(planB.merged.capexRows), "Merged capex rows must be deterministic");

  const deduped = dedupeCapexRows(planA.merged.capexRows);
  const rowKeys = deduped.map((x) => x.rowKey || "");
  assert(rowKeys.every((k) => /^capex:[a-z]+:[a-z0-9-]+$/.test(k)), "All capex rowKey must match capex:<moduleId>:<slug>");
  assert(new Set(rowKeys).size === rowKeys.length, "Capex rowKey must be unique after dedupe");

  const result = applyMergedOverrides(baseTemplateData(), planA, {
    mode: "legacy",
    injection: { capex: true },
    hasExplicitModules: true,
  });
  assert(result.slotSourceMap.CAPEX_TABLE_ROWS.source === "merged", "Capex rows source should be merged");
  assert(result.slotSourceMap.CAPEX_SNAPSHOT.source === "merged", "Capex snapshot source should be merged");
  assert(String(result.templateData.CAPEX_TABLE_ROWS).includes("| Year "), "Merged capex rows should be markdown table rows");
}

function testSafetyGuardNoExplicitModules(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      switchboard: { main_switch_rating: { value: "63A" } },
      measured: { load_current: { value: "48" } },
    }),
    profile: "investor",
  });
  const baseline = baseTemplateData();
  const result = applyMergedOverrides(baseline, plan, {
    mode: "legacy",
    injection: { capex: true },
    hasExplicitModules: false,
  });
  assert(result.slotSourceMap.CAPEX_TABLE_ROWS.source === "legacy", "No explicit modules should keep capex rows in legacy");
  assert(result.slotSourceMap.CAPEX_SNAPSHOT.source === "legacy", "No explicit modules should keep capex snapshot in legacy");
  assert(
    result.slotSourceMap.CAPEX_TABLE_ROWS.reason === INJECTION_REASON.NO_EXPLICIT_MODULES,
    "No explicit modules should include guard reason in slot source"
  );
  assert(result.templateData.CAPEX_TABLE_ROWS === baseline.CAPEX_TABLE_ROWS, "Capex rows should remain legacy under safety guard");
}

function testForbiddenTokensAndHeaderUniqueness(): void {
  const rows = dedupeCapexRows([
    {
      key: "r1",
      text: "| Year 0-1 | Planning | TBD |",
      rowKey: "capex:energy:planning",
      moduleId: "energy",
      sortKey: "energy.capex.001",
    },
  ]);
  const rowsMarkdown = renderCapexRowsMarkdown(rows);
  const snapshot = computeCapexSnapshotFromRows(rows);
  const corpus = `${rowsMarkdown}\n${snapshot}`;
  assert(!/\bundefined\b/i.test(corpus), "Forbidden token 'undefined' found in capex output");
  assert(!/<h[1-6][^>]*>/i.test(corpus), "HTML leakage detected in capex output");

  const report = toStructuredReport({
    ...baseTemplateData(),
    CAPEX_TABLE_ROWS: rowsMarkdown,
    CAPEX_SNAPSHOT: snapshot,
  });
  const markdown = renderReportFromSlots(report);
  const counts = countMajorHeaderDuplicates(markdown);
  for (const [header, count] of Object.entries(counts)) {
    assert(count <= 1, `Major header duplicated: ${header}`);
  }
}

function main(): void {
  testDefaultLegacyCompatibility();
  testEnergyCapexInjectionAndDeterminism();
  testSafetyGuardNoExplicitModules();
  testForbiddenTokensAndHeaderUniqueness();
  console.log("✅ Phase6.5 CapEx injection tests passed");
}

main();
