import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";
import { applyMergedOverrides, INJECTION_REASON } from "../netlify/functions/lib/reportEngine/injection/applyMergedOverrides";
import {
  aggregateReportEngineTelemetry,
  buildReportEngineTelemetry,
  emitReportEngineTelemetry,
} from "../netlify/functions/lib/reportEngine/telemetry/telemetry";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_PHASE8_TELEMETRY",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

function main(): void {
  const planMerged = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "old cb" } },
      lifecycle: { photo_ids: ["P901"] },
      measured: { load_current: { value: "42" }, high_load_devices: { value: "EV charger" } },
      loads: { ev_charger: { value: "yes" } },
    }),
    profile: "owner",
    modules: ["energy", "lifecycle"],
  });

  const overrideMerged = applyMergedOverrides(
    {
      FINDING_PAGES_HTML: "<p>legacy</p>",
      CAPEX_TABLE_ROWS: "| Year 1-2 | legacy | AUD $1,000 - $2,000 |",
      CAPEX_SNAPSHOT: "AUD $1,000 - $2,000",
    } as Record<string, unknown>,
    planMerged,
    {
      mode: "legacy",
      injection: { findings: true, capex: true },
      hasExplicitModules: true,
      inspectionId: "TEST_PHASE8_TELEMETRY",
      baseUrl: "https://example.test",
      signingSecret: "secret-for-tests",
    }
  );

  const mergedTelemetry = buildReportEngineTelemetry({
    reportId: "TEST_PHASE8_TELEMETRY",
    profile: "owner",
    modules: ["energy", "lifecycle"],
    injectionMode: "merged_all",
    slotSourceMap: overrideMerged.slotSourceMap,
    plan: planMerged,
  });

  assert(mergedTelemetry.reportId === "TEST_PHASE8_TELEMETRY", "telemetry reportId mismatch");
  assert(mergedTelemetry.modules.length === 2, "telemetry modules mismatch");
  assert(typeof mergedTelemetry.timestamp === "number", "telemetry timestamp missing");
  assert(mergedTelemetry.mergedMetrics.findingsCount >= 1, "telemetry findingsCount should be >=1");
  assert(mergedTelemetry.mergedMetrics.capexRowCount >= 1, "telemetry capexRowCount should be >=1");
  assert(mergedTelemetry.slotSourceMap.FINDING_PAGES_HTML?.source === "merged", "findings slot source should be merged");
  assert(
    mergedTelemetry.validationFlags.mergedFindingsValidationPassed === true,
    "mergedFindingsValidationPassed should be true for valid merged findings"
  );
  const planLegacy = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "post-2010" } },
    }),
    profile: "investor",
  });
  const overrideLegacy = applyMergedOverrides(
    {
      FINDING_PAGES_HTML: "<p>legacy</p>",
      CAPEX_TABLE_ROWS: "| Year 1-2 | legacy | AUD $1,000 - $2,000 |",
      CAPEX_SNAPSHOT: "AUD $1,000 - $2,000",
    } as Record<string, unknown>,
    planLegacy,
    {
      mode: "legacy",
      injection: { findings: true, capex: true },
      hasExplicitModules: false,
    }
  );
  const legacyTelemetry = buildReportEngineTelemetry({
    reportId: "TEST_PHASE8_TELEMETRY_LEGACY",
    profile: "investor",
    modules: [],
    injectionMode: "legacy",
    slotSourceMap: overrideLegacy.slotSourceMap,
    plan: planLegacy,
  });
  assert(
    legacyTelemetry.fallbackReasons.includes(INJECTION_REASON.NO_EXPLICIT_MODULES),
    "legacy telemetry fallbackReasons should include NO_EXPLICIT_MODULES"
  );

  // fallbackReasons should ignore applied/default reasons.
  const hasAppliedReason = mergedTelemetry.fallbackReasons.some((r) => r === INJECTION_REASON.MERGED_CAPEX_APPLIED);
  assert(!hasAppliedReason, "fallbackReasons should not contain applied reason");

  // Capture telemetry JSON emission format.
  let captured = "";
  const originalLog = console.log;
  try {
    console.log = (...args: unknown[]) => {
      captured = args.map((x) => String(x)).join(" ");
    };
    emitReportEngineTelemetry(mergedTelemetry);
  } finally {
    console.log = originalLog;
  }
  assert(captured.startsWith("[REPORT_ENGINE_TELEMETRY]"), "telemetry log prefix mismatch");
  assert(captured.includes("\"slotSourceMap\""), "telemetry JSON should include slotSourceMap");

  const aggregate = aggregateReportEngineTelemetry([legacyTelemetry, mergedTelemetry]);
  assert(aggregate.totalReports === 2, "aggregate totalReports should be 2");
  assert(aggregate.moduleUsage.energyCount === 1, "aggregate energyCount mismatch");
  assert(aggregate.moduleUsage.lifecycleCount === 1, "aggregate lifecycleCount mismatch");
  assert(aggregate.injectionRatio.mergedFindings >= 0, "aggregate mergedFindings ratio missing");

  console.log("✅ Phase8 telemetry tests passed");
}

main();
