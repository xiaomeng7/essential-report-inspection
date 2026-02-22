import { prepareSubmissionRaw } from "../netlify/functions/lib/report/prepareSubmissionRaw";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testPrepareSubmissionRaw(): void {
  const payload = {
    job: {
      supply_phase: { value: "single" },
      address: { value: "REDACTED" },
      address_place_id: { value: "test-place-id" },
      address_components: { value: { suburb: "Adelaide", state: "SA", postcode: "5000" } },
    },
    snapshot_intake: {
      occupancyType: { value: "owner_occupied" },
      primaryGoal: { value: "reduce_bill" },
    },
    energy_v2: {
      supply: {
        phaseSupply: { value: "single" },
        voltageV: { value: "230" },
        mainSwitchA: { value: "63" },
      },
      stressTest: {
        performed: { value: true },
        durationSec: { value: "60" },
        totalCurrentA: { value: "47" },
      },
      circuits: [
        {
          label: { value: "Hot Water" },
          category: { value: "hot_water" },
          measuredCurrentA: { value: "16" },
          evidenceCoverage: { value: "measured" },
        },
      ],
      tariff: {
        rate_c_per_kwh: { value: "42" },
        supply_c_per_day: { value: "120" },
      },
    },
  } as Record<string, unknown>;

  const prepared = prepareSubmissionRaw(payload);
  const snapshot = prepared.snapshot_intake as Record<string, unknown>;
  const energy = prepared.energy_v2 as Record<string, any>;

  assert(snapshot.occupancyType === "owner_occupied", "snapshot_intake occupancyType should be normalized");
  assert(snapshot.primaryGoal === "energy", "snapshot_intake primaryGoal should be normalized");
  assert(energy.supply.phaseSupply === "single", "energy_v2 phaseSupply should be normalized");
  assert(energy.stressTest.totalCurrentA === 47, "energy_v2 totalCurrentA should be normalized");
  assert(Array.isArray(energy.circuits) && energy.circuits.length === 1, "energy_v2 circuits should be preserved");
}

function main(): void {
  testPrepareSubmissionRaw();
  console.log("✅ submitInspection raw preparation e2e test passed");
}

main();
