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
      measured: { load_current: { value: 52 } },
      switchboard: { main_switch_rating: { value: 63 } },
      high_load_devices: { value: "Air Conditioner, Hot Water" },
    }),
    profile: "investor",
    // no explicit modules
  });

  assert(
    baselinePlan.merged.executiveSummary.every((x) => !x.key.startsWith("energy.")),
    "Energy output should not appear without explicit module selection"
  );

  const energyPlan = buildReportPlan({
    inspection: makeInspection({
      measured: { load_current: { value: 52 } },
      switchboard: { main_switch_rating: { value: 63 } },
      high_load_devices: { value: "Air Conditioner, Hot Water" },
      ev_charger_present: { value: "yes" },
    }),
    profile: "investor",
    modules: ["energy"],
  });

  assert(
    energyPlan.merged.executiveSummary.some((x) => x.key.startsWith("energy.exec.")),
    "Energy executive summary contribution missing under explicit selection"
  );
  assert(
    energyPlan.merged.whatThisMeans.some((x) => x.key.startsWith("energy.wtm.")),
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
    energyPlan.merged.findings.every((f) => f.evidenceCoverage && f.evidenceCoverage !== "unknown"),
    "Energy findings should carry evidenceCoverage from mapper"
  );
}

function testEnergyDeterminism(): void {
  const req = {
    inspection: makeInspection({
      measured: { load_current: { value: 41 }, voltage: { value: 236 } },
      switchboard: { main_switch_rating: { value: 63 } },
      job: { supply_phase: { value: "Single Phase" } },
      high_load_devices: { value: "Air Conditioner, EV Charger" },
      solar_present: { value: "yes" },
    }),
    profile: "owner" as const,
    modules: ["energy"] as const,
  };
  const a = JSON.stringify(buildReportPlan(req).merged);
  const b = JSON.stringify(buildReportPlan(req).merged);
  assert(a === b, "Energy merged output is not deterministic");
}

function main(): void {
  testEnergyExplicitSelectionOnly();
  testEnergyDeterminism();
  console.log("✅ Phase4 Energy tests passed");
}

main();
