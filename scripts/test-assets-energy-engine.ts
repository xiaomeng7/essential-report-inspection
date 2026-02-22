import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_ASSETS_ENERGY_ENGINE",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

function testInvestorSolarSummaryLine(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      loads: { solar: "present" },
      energy_v2: { supply: { mainSwitchA: 63 }, stressTest: { totalCurrentA: 32 } },
    }),
    profile: "investor",
    modules: ["energy"],
    options: { narrativeDensity: "detailed" },
  });
  const joined = plan.merged.executiveSummary.map((x) => x.text).join("\n");
  assert(/Solar:\s*Present/i.test(joined), "investor executive 应包含 Solar: Present");
}

function testOwnerBatteryOverviewFinding(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      loads: { battery: "installed" },
      energy_v2: { supply: { mainSwitchA: 63 }, stressTest: { totalCurrentA: 30 } },
    }),
    profile: "owner",
    modules: ["energy"],
    options: { narrativeDensity: "detailed" },
  });
  assert(
    plan.merged.findings.some((f) => f.key === "DISTRIBUTED_ENERGY_ASSETS_OVERVIEW"),
    "owner + hasBattery 应包含 DISTRIBUTED_ENERGY_ASSETS_OVERVIEW"
  );
}

function testReadinessOnHighStressWithEvUnknown(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      // hasEv 未声明 -> unknown
      energy_v2: { supply: { mainSwitchA: 100 }, stressTest: { totalCurrentA: 86 } },
    }),
    profile: "owner",
    modules: ["energy"],
    options: { narrativeDensity: "detailed" },
  });
  assert(
    plan.merged.findings.some((f) => f.key === "EV_SOLAR_BATTERY_READINESS_NOTE"),
    "high stress + EV planned/unknown 应触发 EV_SOLAR_BATTERY_READINESS_NOTE"
  );
}

function testMonitoringOnHighStressWithAnyAsset(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      job: { solar: "yes" },
      energy_v2: { supply: { mainSwitchA: 100 }, stressTest: { totalCurrentA: 84 } },
    }),
    profile: "owner",
    modules: ["energy"],
    options: { narrativeDensity: "detailed" },
  });
  assert(
    plan.merged.findings.some((f) => f.key === "CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION"),
    "任一资产 + high stress 应触发 CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION"
  );
}

function main(): void {
  testInvestorSolarSummaryLine();
  testOwnerBatteryOverviewFinding();
  testReadinessOnHighStressWithEvUnknown();
  testMonitoringOnHighStressWithAnyAsset();
  console.log("✅ Assets energy engine tests passed");
}

main();
