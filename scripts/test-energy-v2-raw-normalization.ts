import { normalizeEnergyV2 } from "../netlify/functions/lib/report/normalizeEnergyV2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testCanonicalEnergyV2Path(): void {
  const raw = {
    energy_v2: {
      supply: { phaseSupply: { value: "single" }, voltageV: { value: "230" }, mainSwitchA: { value: "63" } },
      stressTest: { performed: { value: true }, durationSec: { value: "60" }, totalCurrentA: { value: "47" } },
      circuits: [
        { label: { value: "Hot Water" }, category: { value: "hot_water" }, measuredCurrentA: { value: "16" }, evidenceCoverage: { value: "measured" } },
        { label: { value: "A-C" }, category: { value: "ac" }, measuredCurrentA: { value: "18" }, evidenceCoverage: { value: "declared" } },
      ],
      tariff: { rate_c_per_kwh: { value: "42" }, supply_c_per_day: { value: "120" } },
    },
  } as Record<string, unknown>;

  const normalized = normalizeEnergyV2(raw) as Record<string, any>;
  assert(normalized.supply.phaseSupply === "single", "phaseSupply normalize failed");
  assert(normalized.stressTest.totalCurrentA === 47, "totalCurrentA normalize failed");
  assert(Array.isArray(normalized.circuits) && normalized.circuits.length === 2, "circuits normalize failed");
  assert(normalized.tariff.rate_c_per_kwh === 42, "tariff rate normalize failed");
}

function testLegacyFallbackPath(): void {
  const raw = {
    job: { supply_phase: { value: "three" } },
    energy_v2: {
      stressTest: { totalCurrentA: { value: "55" } },
    },
  } as Record<string, unknown>;
  const normalized = normalizeEnergyV2(raw) as Record<string, any>;
  assert(normalized.supply.phaseSupply === "three", "legacy supply phase fallback failed");
  assert(normalized.supply.voltageV === undefined, "three-phase should not force single voltage default");
  assert(normalized.stressTest.durationSec === 60, "default duration should be 60");
}

function main(): void {
  testCanonicalEnergyV2Path();
  testLegacyFallbackPath();
  console.log("✅ energy_v2 raw normalization tests passed");
}

main();
