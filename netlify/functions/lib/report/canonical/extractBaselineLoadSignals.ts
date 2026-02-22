import { pickFirst, toBoolean, toNumber } from "./common";

type Coverage = "measured" | "observed" | "declared" | "unknown";

export type BaselineLoadSignals = {
  phaseSupply?: "single" | "three" | "unknown";
  voltageV?: number;
  mainSwitchA?: number;
  stressTest?: {
    performed?: boolean;
    durationSec?: number;
    totalCurrentA?: number;
    currentA_L1?: number;
    currentA_L2?: number;
    currentA_L3?: number;
  };
  coverage?: Coverage;
  sources?: Partial<Record<"phaseSupply" | "voltageV" | "mainSwitchA" | "performed" | "durationSec" | "totalCurrentA" | "currentA_L1" | "currentA_L2" | "currentA_L3", string[]>>;
};

function parsePhase(value: unknown): "single" | "three" | "unknown" | undefined {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (/(three|3|triphase|three-phase)/.test(s)) return "three";
  if (/(single|1|single-phase)/.test(s)) return "single";
  return "unknown";
}

function classify(path: string): Coverage {
  if (/(measured|stress_test|load_baseline|energy_v2)/i.test(path)) return "measured";
  if (/(snapshot|inspection|observed)/i.test(path)) return "observed";
  if (/(job\.|loads\.|client\.|lead\.)/i.test(path)) return "declared";
  return "unknown";
}

function collectSource(
  key: NonNullable<BaselineLoadSignals["sources"]> extends Record<infer K, unknown> ? K : never,
  pickedPath: string | undefined,
  sources: NonNullable<BaselineLoadSignals["sources"]>
): void {
  if (!pickedPath) return;
  const prev = sources[key] ?? [];
  sources[key] = [...prev, pickedPath];
}

export function extractBaselineLoadSignals(rawUnknown: unknown): BaselineLoadSignals {
  if (!rawUnknown || typeof rawUnknown !== "object") return { coverage: "unknown", sources: {} };
  const raw = rawUnknown as Record<string, unknown>;

  const phase = pickFirst(raw, [
    "load_baseline.phaseSupply",
    "energy_v2.supply.phaseSupply",
    "job.supply_phase",
    "electrical.supply.phase",
    "supply.phase",
    "measured.phase",
  ]);
  const voltage = pickFirst(raw, [
    "load_baseline.voltageV",
    "energy_v2.supply.voltageV",
    "measured.voltage",
    "test_data.measured.voltage",
    "electrical.supply.voltage",
    "supply.voltage",
  ]);
  const mainSwitch = pickFirst(raw, [
    "load_baseline.mainSwitchA",
    "energy_v2.supply.mainSwitchA",
    "switchboard.main_switch_rating",
    "main_switch.rating",
    "job.main_switch_rating",
    "measured.main_switch_rating",
  ]);
  const performed = pickFirst(raw, ["load_baseline.stressTest.performed", "energy_v2.stressTest.performed"]);
  const durationSec = pickFirst(raw, [
    "load_baseline.stressTest.durationSec",
    "energy_v2.stressTest.durationSec",
    "stress_test.duration_sec",
  ]);
  const totalCurrentA = pickFirst(raw, [
    "load_baseline.stressTest.totalCurrentA",
    "energy_v2.stressTest.totalCurrentA",
    "stress_test.total_current_a",
    "measured.load_current",
    "test_data.measured.load_current",
    "measured.clamp_current",
    "electrical.load_current",
  ]);
  const currentA_L1 = pickFirst(raw, ["load_baseline.stressTest.currentA_L1", "energy_v2.stressTest.currentA_L1"]);
  const currentA_L2 = pickFirst(raw, ["load_baseline.stressTest.currentA_L2", "energy_v2.stressTest.currentA_L2"]);
  const currentA_L3 = pickFirst(raw, ["load_baseline.stressTest.currentA_L3", "energy_v2.stressTest.currentA_L3"]);

  const sources: NonNullable<BaselineLoadSignals["sources"]> = {};
  collectSource("phaseSupply", phase.path, sources);
  collectSource("voltageV", voltage.path, sources);
  collectSource("mainSwitchA", mainSwitch.path, sources);
  collectSource("performed", performed.path, sources);
  collectSource("durationSec", durationSec.path, sources);
  collectSource("totalCurrentA", totalCurrentA.path, sources);
  collectSource("currentA_L1", currentA_L1.path, sources);
  collectSource("currentA_L2", currentA_L2.path, sources);
  collectSource("currentA_L3", currentA_L3.path, sources);

  const coverageCandidates = Object.values(sources)
    .flat()
    .map((p) => classify(p));
  const coverage: Coverage = coverageCandidates.includes("measured")
    ? "measured"
    : coverageCandidates.includes("observed")
    ? "observed"
    : coverageCandidates.includes("declared")
    ? "declared"
    : "unknown";

  return {
    phaseSupply: parsePhase(phase.value),
    voltageV: toNumber(voltage.value),
    mainSwitchA: toNumber(mainSwitch.value),
    stressTest: {
      performed: toBoolean(performed.value),
      durationSec: toNumber(durationSec.value),
      totalCurrentA: toNumber(totalCurrentA.value),
      currentA_L1: toNumber(currentA_L1.value),
      currentA_L2: toNumber(currentA_L2.value),
      currentA_L3: toNumber(currentA_L3.value),
    },
    coverage,
    sources,
  };
}
