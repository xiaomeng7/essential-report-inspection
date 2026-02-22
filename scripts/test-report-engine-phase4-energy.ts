import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_PHASE4_ENERGY",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

function testEnergyExplicitSelectionOnly(): void {
  const baselinePlan = buildReportPlan({
    inspection: makeInspection({
      stress_test: {
        total_current_a: { value: 58 },
      },
    }),
    profile: "investor",
    // no enhanced circuit/tariff evidence in canonical path
  });

  assert(
    baselinePlan.merged.executiveSummary.every((x) => !x.key.startsWith("energy.exec")),
    "Enhanced energy output should not appear without sufficient enhanced signals"
  );
}

function testOwnerStressAndCircuitOutput(): void {
  const energyPlan = buildReportPlan({
    inspection: makeInspection({
      stress_test: {
        total_current_a: { value: 52 },
        duration_sec: { value: 90 },
      },
      energy: {
        supply: {
          phase: { value: "single" },
          voltage_v: { value: 230 },
          mainSwitchA: { value: 63 },
        },
      },
      circuits: [
        { label: "Air Conditioning", measuredCurrentA: 20, category: "cooling" },
        { label: "Hot Water", measuredCurrentA: 16, category: "heating" },
        { label: "Lighting", measuredCurrentA: 8, category: "lighting" },
      ],
      high_load_devices: { value: "Air Conditioner, Hot Water" },
    }),
    profile: "owner",
    modules: ["energy"],
  });

  assert(
    energyPlan.merged.executiveSummary.some((x) => x.key.startsWith("energy.exec.v2.")),
    "Energy executive summary contribution missing under explicit selection"
  );
  assert(
    energyPlan.merged.executiveSummary.some((x) => x.text.includes("kW") && x.text.includes("AUD $")),
    "Energy executive summary should include peak kW and cost band"
  );
  assert(
    energyPlan.merged.executiveSummary.some((x) => x.text.includes("contributors")),
    "Energy executive summary should include top contributors"
  );
  assert(
    energyPlan.merged.whatThisMeans.some((x) => x.key.startsWith("energy.wtm.v2.")),
    "Energy what-this-means contribution missing under explicit selection"
  );
  assert(
    energyPlan.merged.capexRows.length > 0,
    "Energy capex rows should be generated from verifiable signals"
  );
  assert(
    energyPlan.merged.capexRows.every((r) => typeof r.rowKey === "string" && r.rowKey.startsWith("capex:energy:")),
    "Energy capex rows must carry global rowKey"
  );
  assert(
    energyPlan.merged.findings.some((f) => f.id === "LOAD_STRESS_TEST_RESULT"),
    "Missing LOAD_STRESS_TEST_RESULT finding"
  );
  assert(
    energyPlan.merged.findings.some((f) => f.id === "CIRCUIT_CONTRIBUTION_BREAKDOWN"),
    "Missing CIRCUIT_CONTRIBUTION_BREAKDOWN finding"
  );
}

function testInvestmentHighStressOutput(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      stress_test: {
        total_current_a: { value: 88 },
      },
      energy: {
        supply: {
          phase: { value: "single" },
          mainSwitchA: { value: 100 },
          voltage_v: { value: 230 },
        },
      },
      circuits: [
        { label: "Air Conditioning", measuredCurrentA: 33 },
        { label: "Pool Pump", measuredCurrentA: 18 },
        { label: "Hot Water", measuredCurrentA: 20 },
      ],
    }),
    profile: "investor",
    modules: ["energy"],
  });
  assert(
    plan.merged.whatThisMeans.some((x) => /capacity|headroom/i.test(x.text)),
    "Investor output should emphasize capacity planning"
  );
  assert(
    plan.merged.findings.some((f) =>
      f.id === "CONTINUOUS_MONITORING_UPGRADE" || f.id === "CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION"
    ),
    "High stress ratio should trigger monitoring recommendation/justification"
  );
}

function testLegacyFallbackFromClampOnly(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: { value: 41 } },
      switchboard: { main_switch_rating: { value: 63 } },
    }),
    profile: "owner",
    modules: ["energy"],
  });
  assert(plan.merged.executiveSummary.length > 0, "Legacy clamp-only input should still produce output");
  assert(
    plan.merged.findings.some((f) => f.id === "LOAD_STRESS_TEST_RESULT"),
    "Legacy clamp-only input should still produce stress finding"
  );
  const ids = plan.merged.findings.map((f) => f.id);
  const stressIdx = ids.indexOf("LOAD_STRESS_TEST_RESULT");
  const circuitIdx = ids.indexOf("CIRCUIT_CONTRIBUTION_BREAKDOWN");
  if (circuitIdx >= 0) {
    assert(stressIdx <= circuitIdx, "Finding order should keep stress test result before circuit contribution");
  } else {
    assert(stressIdx >= 0, "Legacy clamp-only should still preserve baseline stress finding");
  }
}

function testDeterminism(): void {
  const req = {
    inspection: makeInspection({
      stress_test: { total_current_a: { value: 49 } },
      energy: { supply: { phase: { value: "single" }, voltage_v: { value: 230 }, mainSwitchA: { value: 63 } } },
      circuits: [
        { label: "Air Conditioning", measuredCurrentA: 18 },
        { label: "Hot Water", measuredCurrentA: 15 },
      ],
    }),
    profile: "owner" as const,
    modules: ["energy"] as const,
  };
  assert(JSON.stringify(buildReportPlan(req).merged) === JSON.stringify(buildReportPlan(req).merged), "Energy v2 output is not deterministic");
}

function main(): void {
  testEnergyExplicitSelectionOnly();
  testOwnerStressAndCircuitOutput();
  testInvestmentHighStressOutput();
  testLegacyFallbackFromClampOnly();
  testDeterminism();
  console.log("✅ Phase4 Energy tests passed");
}

main();
