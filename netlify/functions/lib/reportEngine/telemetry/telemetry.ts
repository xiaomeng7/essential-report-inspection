import type { ReportPlan } from "../types";
import type { SlotSourceMap } from "../injection/applyMergedOverrides";
import { INJECTION_REASON } from "../injection/applyMergedOverrides";
import type { ReportEngineTelemetry, ReportEngineTelemetryAggregate } from "./telemetryTypes";

type BuildTelemetryInput = {
  reportId: string;
  profile: string;
  modules: string[];
  injectionMode: string;
  slotSourceMap: SlotSourceMap;
  plan: ReportPlan;
};

function isFallbackReason(reason?: string): boolean {
  if (!reason) return false;
  if (reason === INJECTION_REASON.DEFAULT_LEGACY_MODE) return false;
  if (reason === INJECTION_REASON.INJECTION_FLAG_DISABLED) return false;
  if (reason.endsWith("_APPLIED")) return false;
  return true;
}

function countCapexTbd(rows: Array<{ text: string; amountIsTbd?: boolean }>): number {
  let count = 0;
  for (const row of rows) {
    if (row.amountIsTbd === true || /\bTBD\b/i.test(String(row.text || ""))) {
      count += 1;
    }
  }
  return count;
}

export function buildReportEngineTelemetry(input: BuildTelemetryInput): ReportEngineTelemetry {
  const fallbackReasons = Object.values(input.slotSourceMap)
    .filter((slot) => slot.source === "legacy" && isFallbackReason(slot.reason))
    .map((slot) => String(slot.reason))
    .filter(Boolean);

  const findingsReason = input.slotSourceMap.FINDING_PAGES_HTML?.reason || "";
  const capexReasonRows = input.slotSourceMap.CAPEX_TABLE_ROWS?.reason || "";
  const capexReasonSnapshot = input.slotSourceMap.CAPEX_SNAPSHOT?.reason || "";

  return {
    reportId: input.reportId,
    profile: input.profile,
    modules: input.modules,
    injectionMode: input.injectionMode,
    slotSourceMap: input.slotSourceMap,
    fallbackReasons: [...new Set(fallbackReasons)],
    mergedMetrics: {
      findingsCount: input.plan.merged.findings.length,
      capexRowCount: input.plan.merged.capexRows.length,
      capexTbdCount: countCapexTbd(input.plan.merged.capexRows),
    },
    validationFlags: {
      mergedFindingsValidationPassed: !String(findingsReason).startsWith(INJECTION_REASON.MERGED_FINDINGS_VALIDATION_FAILED),
      mergedCapexValidationPassed:
        capexReasonRows !== INJECTION_REASON.MERGED_CAPEX_EMPTY &&
        capexReasonSnapshot !== INJECTION_REASON.MERGED_CAPEX_EMPTY,
    },
    timestamp: Date.now(),
  };
}

export function emitReportEngineTelemetry(telemetry: ReportEngineTelemetry): void {
  // Lightweight JSON log for production observability; can be shipped to DB/SaaS later.
  console.log("[REPORT_ENGINE_TELEMETRY]", JSON.stringify(telemetry));
}

export function aggregateReportEngineTelemetry(records: ReportEngineTelemetry[]): ReportEngineTelemetryAggregate {
  const total = records.length || 1;
  const count = (pred: (t: ReportEngineTelemetry) => boolean) => records.filter(pred).length;
  const rate = (n: number) => n / total;

  const slotMergedCount = (slot: string) => count((t) => t.slotSourceMap?.[slot]?.source === "merged");
  const fallbackReasonCount = (token: string) =>
    count((t) => (t.fallbackReasons || []).some((r) => String(r).startsWith(token)));

  const capexRowsTotal = records.reduce((s, t) => s + (t.mergedMetrics.capexRowCount || 0), 0);
  const capexTbdTotal = records.reduce((s, t) => s + (t.mergedMetrics.capexTbdCount || 0), 0);
  const findingsValidationFail = count((t) => t.validationFlags.mergedFindingsValidationPassed === false);

  const energyCount = count((t) => t.modules.includes("energy"));
  const lifecycleCount = count((t) => t.modules.includes("lifecycle"));
  const bothCount = count((t) => t.modules.includes("energy") && t.modules.includes("lifecycle"));

  return {
    totalReports: records.length,
    injectionRatio: {
      legacyMode: rate(count((t) => t.injectionMode === "legacy")),
      mergedExecWtmMode: rate(count((t) => t.injectionMode === "merged_exec+wtm")),
      mergedCapex: rate(slotMergedCount("CAPEX_TABLE_ROWS")),
      mergedFindings: rate(slotMergedCount("FINDING_PAGES_HTML")),
    },
    slotCoverage: {
      whatThisMeansMerged: rate(slotMergedCount("WHAT_THIS_MEANS_SECTION")),
      executiveMerged: rate(slotMergedCount("EXECUTIVE_DECISION_SIGNALS")),
      capexMerged: rate(slotMergedCount("CAPEX_TABLE_ROWS")),
      findingsMerged: rate(slotMergedCount("FINDING_PAGES_HTML")),
    },
    fallbackRate: {
      NO_EXPLICIT_MODULES: rate(fallbackReasonCount(INJECTION_REASON.NO_EXPLICIT_MODULES)),
      MERGED_FINDINGS_VALIDATION_FAILED: rate(fallbackReasonCount(INJECTION_REASON.MERGED_FINDINGS_VALIDATION_FAILED)),
      INJECTION_FLAG_DISABLED: rate(fallbackReasonCount(INJECTION_REASON.INJECTION_FLAG_DISABLED)),
      MERGED_CAPEX_EMPTY: rate(fallbackReasonCount(INJECTION_REASON.MERGED_CAPEX_EMPTY)),
    },
    moduleUsage: {
      energyCount,
      lifecycleCount,
      energyAndLifecycleTogetherRatio: rate(bothCount),
    },
    capexTbdRatio: capexRowsTotal > 0 ? capexTbdTotal / capexRowsTotal : 0,
    findingsValidationFailureRatio: rate(findingsValidationFail),
  };
}
