import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";
import { PREFLIGHT_WARNING_CODE } from "../netlify/functions/lib/report/preflight/assertReportInputs";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_UNIFIED_ENGINES",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

function testInvestorBaselineOnly(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: 41, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
    }),
    profile: "investor",
  });
  assert(plan.merged.findings.some((f) => f.id === "LOAD_STRESS_TEST_RESULT"), "investor baseline only 必有 LOAD_STRESS_TEST_RESULT");
  assert(
    plan.merged.executiveSummary.some((x) => x.text.includes("Peak load:")),
    "investor baseline only executive 应包含 Peak load:"
  );
}

function testOwnerBaselineWithCircuits(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: 47, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
      energy_v2: {
        circuits: [
          { label: "Hot Water", category: "hot_water", measuredCurrentA: 16 },
          { label: "A-C", category: "ac", measuredCurrentA: 18 },
        ],
        tariff: { rate_c_per_kwh: 42, supply_c_per_day: 120 },
      },
    }),
    profile: "owner",
  });
  assert(plan.merged.findings.some((f) => f.id === "CIRCUIT_CONTRIBUTION_BREAKDOWN"), "owner + circuits 应有 CIRCUIT_CONTRIBUTION_BREAKDOWN");
  assert(plan.merged.findings.some((f) => f.id === "ESTIMATED_COST_BAND"), "owner + circuits 应有 ESTIMATED_COST_BAND");
}

function testInvestorCircuitsFiltered(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: 47, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
      energy_v2: {
        circuits: [
          { label: "Hot Water", category: "hot_water", measuredCurrentA: 16 },
          { label: "A-C", category: "ac", measuredCurrentA: 18 },
        ],
        tariff: { rate_c_per_kwh: 42, supply_c_per_day: 120 },
      },
    }),
    profile: "investor",
  });
  assert(!plan.merged.findings.some((f) => f.id === "CIRCUIT_CONTRIBUTION_BREAKDOWN"), "investor 默认应过滤 CIRCUIT_CONTRIBUTION_BREAKDOWN");
  assert(!plan.merged.findings.some((f) => f.id === "ESTIMATED_COST_BAND"), "investor 默认应过滤 ESTIMATED_COST_BAND");
}

function testCostBandStructureAndTariffSource(): void {
  const withDefaultTariff = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: 47, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
      energy_v2: {
        circuits: [
          { label: "Hot Water", category: "hot_water", measuredCurrentA: 16 },
          { label: "A-C", category: "ac", measuredCurrentA: 18 },
        ],
      },
    }),
    profile: "owner",
  });
  const defaultCostFinding = withDefaultTariff.merged.findings.find((f) => f.id === "ESTIMATED_COST_BAND");
  assert(Boolean(defaultCostFinding), "owner + circuits + default tariff 应有 ESTIMATED_COST_BAND");
  const defaultHtml = String(defaultCostFinding?.html || "");
  assert(defaultHtml.includes("What we measured"), "ESTIMATED_COST_BAND 应包含 What we measured");
  assert(defaultHtml.includes("Assumptions used"), "ESTIMATED_COST_BAND 应包含 Assumptions used");
  assert(defaultHtml.includes("What you can do next"), "ESTIMATED_COST_BAND 应包含 What you can do next");
  assert(defaultHtml.includes("default estimate"), "default tariff 场景应显示 default estimate");

  const withCustomerTariff = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: 47, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
      energy_v2: {
        circuits: [
          { label: "Hot Water", category: "hot_water", measuredCurrentA: 16 },
          { label: "A-C", category: "ac", measuredCurrentA: 18 },
        ],
        tariff: { rate_c_per_kwh: 55, supply_c_per_day: 130 },
      },
    }),
    profile: "owner",
  });
  const customerCostFinding = withCustomerTariff.merged.findings.find((f) => f.id === "ESTIMATED_COST_BAND");
  assert(String(customerCostFinding?.html || "").includes("customer provided"), "customer tariff 场景应显示 customer provided");
}

function testInvestorAssetsSummaryAndOverviewFilter(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      snapshot_intake: { hasSolar: true },
      measured: { load_current: 35, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
    }),
    profile: "investor",
  });
  assert(
    plan.merged.executiveSummary.some((x) => x.text.includes("Energy assets —")),
    "investor hasSolar=true executive 应包含 Energy assets —"
  );
  assert(
    !plan.merged.findings.some((f) => f.id === "DISTRIBUTED_ENERGY_ASSETS_OVERVIEW"),
    "investor hasSolar=true overview 不应出现"
  );
}

function testOwnerSolarOverview(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      snapshot_intake: { hasSolar: true },
      measured: { load_current: 35, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
    }),
    profile: "owner",
  });
  assert(plan.merged.findings.some((f) => f.id === "DISTRIBUTED_ENERGY_ASSETS_OVERVIEW"), "owner + hasSolar=true 应有 DISTRIBUTED_ENERGY_ASSETS_OVERVIEW");
}

function testReadinessOnHighStressEvUnknown(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      energy_v2: {
        supply: { mainSwitchA: 100, voltageV: 230 },
        stressTest: { totalCurrentA: 88 },
      },
      // hasEv unknown
    }),
    profile: "owner",
  });
  assert(plan.merged.findings.some((f) => f.id === "EV_SOLAR_BATTERY_READINESS_NOTE"), "stress high + hasEv unknown 应触发 readiness note");
}

function testLegacyOnlyBaselineNonEmpty(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: { value: "38" } },
      switchboard: { main_switch_rating: { value: "63A" } },
    }),
    profile: "owner",
  });
  assert(plan.merged.findings.length > 0, "legacy-only raw 也应输出 baseline findings");
  assert(plan.merged.findings.some((f) => f.id === "LOAD_STRESS_TEST_RESULT"), "legacy-only raw 应包含 LOAD_STRESS_TEST_RESULT");
  const exec = plan.merged.executiveSummary.map((x) => x.text).join("\n");
  assert(/Peak load:|insufficient/i.test(exec), "legacy-only baseline executive 应有 Peak load 或 insufficient 提示");
}

function testLegacyRawNoStressShowsInsufficientExecutive(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      job: { address: "No stress data case" },
    }),
    profile: "investor",
  });
  const exec = plan.merged.executiveSummary.map((x) => x.text).join("\n");
  assert(exec.includes("insufficient"), "legacy raw no stress 应提示 insufficient");
  assert(plan.debug?.preflight?.flags.baseline_insufficient === true, "legacy raw no stress 应标记 baseline_insufficient");
  assert(
    (plan.debug?.preflight?.summary.warningCounts?.[PREFLIGHT_WARNING_CODE.BASELINE_INSUFFICIENT] ?? 0) === 1,
    "legacy raw no stress 应有 BASELINE_INSUFFICIENT=1"
  );
  assert(plan.debug?.preflight?.summary.severity === "high", "legacy raw no stress severity 应为 high");
}

function testPreflightEnhancedInsufficientForOwner(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: 40, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
      energy_v2: {
        circuits: [{ label: "OnlyOne", category: "other", measuredCurrentA: 6 }],
      },
    }),
    profile: "owner",
  });
  assert(
    (plan.debug?.preflight?.summary.warningCounts?.[PREFLIGHT_WARNING_CODE.ENHANCED_INSUFFICIENT] ?? 0) === 1,
    "owner circuits<2 & no tariff 应有 ENHANCED_INSUFFICIENT=1"
  );
}

function testPreflightTariffDefaultUsed(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: 46, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
      energy_v2: {
        circuits: [
          { label: "Hot Water", category: "hot_water", measuredCurrentA: 16 },
          { label: "A-C", category: "ac", measuredCurrentA: 18 },
        ],
      },
    }),
    profile: "owner",
  });
  assert(
    (plan.debug?.preflight?.summary.warningCounts?.[PREFLIGHT_WARNING_CODE.TARIFF_DEFAULT_USED] ?? 0) === 1,
    "default tariff 场景应有 TARIFF_DEFAULT_USED=1"
  );
}

function testReadinessBlockedWarning(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      snapshot_intake: { primaryGoal: "plan_upgrade" },
      // assets coverage remains unknown and stress not high
      measured: { voltage: 230 },
    }),
    profile: "owner",
  });
  assert(
    (plan.debug?.preflight?.summary.warningCounts?.[PREFLIGHT_WARNING_CODE.READINESS_TRIGGER_BLOCKED_BY_UNKNOWN_COVERAGE] ?? 0) === 1,
    "assets coverage unknown 且 stress 非高时应有 READINESS_TRIGGER_BLOCKED... warning"
  );
}

function testEnhancedSkipReasonSummary(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: 40, voltage: 230 },
      switchboard: { main_switch_rating: 63 },
      energy_v2: {
        enhancedSkipReason: { code: "time_insufficient", note: "Site access window was too short to capture full circuits." },
      },
    }),
    profile: "owner",
  });
  assert(plan.debug?.preflight?.summary.enhancedSkipped === true, "skip reason 存在时 enhancedSkipped 应为 true");
  assert(plan.debug?.preflight?.summary.enhancedSkipCode === "time_insufficient", "enhancedSkipCode 应匹配 time_insufficient");
}

function testSubscriptionLeadSummary(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      snapshot_intake: { hasSolar: true },
      energy_v2: {
        supply: { mainSwitchA: 100, voltageV: 230 },
        stressTest: { totalCurrentA: 92 },
        circuits: [
          { label: "Main", category: "other", measuredCurrentA: 30, evidenceCoverage: "declared" },
          { label: "A-C", category: "ac", measuredCurrentA: 20, evidenceCoverage: "declared" },
        ],
      },
    }),
    profile: "owner",
  });
  assert(plan.debug?.preflight?.summary.subscriptionLead === true, "owner high severity 应触发 subscriptionLead");
  assert((plan.debug?.preflight?.summary.subscriptionLeadReasons?.length ?? 0) > 0, "subscriptionLeadReasons 应非空");
}

function main(): void {
  testInvestorBaselineOnly();
  testOwnerBaselineWithCircuits();
  testInvestorCircuitsFiltered();
  testCostBandStructureAndTariffSource();
  testInvestorAssetsSummaryAndOverviewFilter();
  testOwnerSolarOverview();
  testReadinessOnHighStressEvUnknown();
  testLegacyOnlyBaselineNonEmpty();
  testLegacyRawNoStressShowsInsufficientExecutive();
  testPreflightEnhancedInsufficientForOwner();
  testPreflightTariffDefaultUsed();
  testReadinessBlockedWarning();
  testEnhancedSkipReasonSummary();
  testSubscriptionLeadSummary();
  console.log("✅ unified engines architecture tests passed");
}

main();
