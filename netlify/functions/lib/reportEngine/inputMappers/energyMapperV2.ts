import type { EnergyCircuitV2, EnergyInputV2, EnergyTariffsV2 } from "../contracts/energyV2";
import { resolveTariffConfig } from "../../config/tariffs";

type Coverage = "measured" | "observed" | "declared" | "unknown";

export type EnergyMappedV2 = {
  energy?: EnergyInputV2;
  evidenceRefs: string[];
  sources: Partial<Record<"phase" | "voltageV" | "mainSwitchA" | "totalCurrentA" | "durationSec" | "tariffRate" | "tariffSupply", string>>;
  evidenceCoverage: Coverage;
  usedLegacyFallbackCircuit: boolean;
};

function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    return extractValue((v as { value: unknown }).value);
  }
  return undefined;
}

function getByPath(raw: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = raw;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return extractValue(cur);
}

function first(raw: Record<string, unknown>, paths: string[]): { value?: unknown; source?: string } {
  for (const path of paths) {
    const value = getByPath(raw, path);
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return { value, source: path };
    }
  }
  return {};
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parsePhase(value: unknown): "single" | "three" | "unknown" {
  const s = String(value || "").toLowerCase();
  if (!s) return "unknown";
  if (/(three|3|triphase|three-phase)/.test(s)) return "three";
  if (/(single|1|single-phase)/.test(s)) return "single";
  return "unknown";
}

function parseBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (["true", "yes", "1", "on", "y"].includes(s)) return true;
  if (["false", "no", "0", "off", "n"].includes(s)) return false;
  return undefined;
}

function parseCoverageFromPath(path?: string): Coverage {
  if (!path) return "unknown";
  if (/(measured|test_data\.measured|stress_test|circuits\.\d+\.measured)/i.test(path)) return "measured";
  if (/(observed|inspection|snapshot_intake)/i.test(path)) return "observed";
  if (/(job\.|lead\.|client\.|loads\.|assets\.)/i.test(path)) return "declared";
  return "observed";
}

function toAppliances(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(extractValue(x) ?? "").trim()).filter(Boolean).slice(0, 12);
  }
  if (typeof value === "string") {
    return value.split(/[,;/|]/g).map((x) => x.trim()).filter(Boolean).slice(0, 12);
  }
  return [];
}

function toCircuits(raw: Record<string, unknown>): EnergyCircuitV2[] {
  const candidates = [
    "energy_v2.circuits",
    "stress_test.circuits",
    "energy.stress_test.circuits",
    "test_data.measured.circuits",
    "measured.circuits",
    "circuits",
  ];
  for (const path of candidates) {
    const value = getByPath(raw, path);
    if (!Array.isArray(value)) continue;
    const circuits = value
      .map((item, idx) => {
        const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const measuredCurrentA = toNumber(extractValue(row.measuredCurrentA ?? row.currentA ?? row.current ?? row.amps));
        if (!measuredCurrentA || measuredCurrentA <= 0) return undefined;
        const label = String(extractValue(row.label ?? row.name ?? row.circuit) ?? `Circuit ${idx + 1}`).trim();
        const categoryRaw = String(extractValue(row.category ?? row.group) ?? "").trim().toLowerCase();
        const category = categoryRaw || undefined;
        return {
          label,
          measuredCurrentA,
          category,
          evidenceCoverage: parseCoverageFromPath(path),
        } as EnergyCircuitV2;
      })
      .filter((x): x is EnergyCircuitV2 => Boolean(x));
    if (circuits.length > 0) return circuits;
  }
  return [];
}

export function mapEnergyInputV2(raw: Record<string, unknown>): EnergyMappedV2 {
  const phase = first(raw, ["energy_v2.supply.phaseSupply", "stress_test.phase", "energy.supply.phase", "job.supply_phase", "electrical.supply.phase"]);
  const voltageV = first(raw, ["energy_v2.supply.voltageV", "stress_test.voltage_v", "energy.supply.voltage_v", "electrical.supply.voltage", "measured.voltage", "test_data.measured.voltage"]);
  const voltageL1V = first(raw, ["energy_v2.supply.voltageL1V"]);
  const voltageL2V = first(raw, ["energy_v2.supply.voltageL2V"]);
  const voltageL3V = first(raw, ["energy_v2.supply.voltageL3V"]);
  const mainSwitchA = first(raw, ["energy_v2.supply.mainSwitchA", "energy.supply.mainSwitchA", "switchboard.main_switch_rating", "main_switch.rating", "job.main_switch_rating", "measured.main_switch_rating"]);
  const performed = first(raw, ["energy_v2.stressTest.performed"]);
  const totalCurrentA = first(raw, ["energy_v2.stressTest.totalCurrentA", "stress_test.total_current_a", "energy.stress_test.total_current_a", "measured.load_current", "test_data.measured.load_current", "measured.clamp_current", "electrical.load_current"]);
  const currentA_L1 = first(raw, ["energy_v2.stressTest.currentA_L1"]);
  const currentA_L2 = first(raw, ["energy_v2.stressTest.currentA_L2"]);
  const currentA_L3 = first(raw, ["energy_v2.stressTest.currentA_L3"]);
  const durationSec = first(raw, ["energy_v2.stressTest.durationSec", "stress_test.duration_sec", "energy.stress_test.duration_sec"]);
  const notTestedReasonsRaw = getByPath(raw, "energy_v2.stressTest.notTestedReasons");
  const rateCPerKwh = first(raw, ["energy_v2.tariff.rate_c_per_kwh", "tariffs.rate_c_per_kwh", "energy.tariffs.rate_c_per_kwh", "snapshot_intake.tariffs.rate_c_per_kwh"]);
  const supplyCPerDay = first(raw, ["energy_v2.tariff.supply_c_per_day", "tariffs.supply_c_per_day", "energy.tariffs.supply_c_per_day", "snapshot_intake.tariffs.supply_c_per_day"]);
  const appliances = first(raw, ["energy_v2.appliances", "appliances", "high_load_devices", "loads.high_demand", "test_data.measured.high_load_devices", "measured.high_load_devices"]);

  const circuits = toCircuits(raw);
  let usedLegacyFallbackCircuit = false;
  const totalCurrent = toNumber(totalCurrentA.value);
  if (circuits.length === 0 && totalCurrent && totalCurrent > 0) {
    usedLegacyFallbackCircuit = true;
    circuits.push({
      label: "Main Load Snapshot",
      measuredCurrentA: totalCurrent,
      category: "main",
      evidenceCoverage: parseCoverageFromPath(totalCurrentA.source),
    });
  }

  const evidenceRefs = [
    phase.source,
    voltageV.source,
    voltageL1V.source,
    voltageL2V.source,
    voltageL3V.source,
    mainSwitchA.source,
    totalCurrentA.source,
    currentA_L1.source,
    currentA_L2.source,
    currentA_L3.source,
    durationSec.source,
    rateCPerKwh.source,
    supplyCPerDay.source,
    ...(circuits.length > 0 ? ["circuits[]"] : []),
  ].filter((x): x is string => Boolean(x));

  if (evidenceRefs.length === 0 && circuits.length === 0) {
    return {
      evidenceRefs: [],
      sources: {},
      evidenceCoverage: "unknown",
      usedLegacyFallbackCircuit: false,
    };
  }

  const coverageCandidates: Coverage[] = [
    parseCoverageFromPath(phase.source),
    parseCoverageFromPath(voltageV.source),
    parseCoverageFromPath(mainSwitchA.source),
    parseCoverageFromPath(totalCurrentA.source),
    ...circuits.map((c) => c.evidenceCoverage),
  ];
  const evidenceCoverage: Coverage = coverageCandidates.includes("measured")
    ? "measured"
    : coverageCandidates.includes("observed")
    ? "observed"
    : coverageCandidates.includes("declared")
    ? "declared"
    : "unknown";

  const tariffResolved = resolveTariffConfig({
    rate_c_per_kwh: toNumber(rateCPerKwh.value),
    supply_c_per_day: toNumber(supplyCPerDay.value),
  });

  return {
    energy: {
      supply: {
        phaseSupply: parsePhase(phase.value),
        voltageV: toNumber(voltageV.value),
        voltageL1V: toNumber(voltageL1V.value),
        voltageL2V: toNumber(voltageL2V.value),
        voltageL3V: toNumber(voltageL3V.value),
        mainSwitchA: toNumber(mainSwitchA.value),
      },
      stressTest: {
        performed: parseBool(performed.value) ?? true,
        totalCurrentA: totalCurrent,
        currentA_L1: toNumber(currentA_L1.value),
        currentA_L2: toNumber(currentA_L2.value),
        currentA_L3: toNumber(currentA_L3.value),
        durationSec: toNumber(durationSec.value),
        notTestedReasons: Array.isArray(notTestedReasonsRaw)
          ? notTestedReasonsRaw.map((x) => String(extractValue(x) ?? "").trim()).filter(Boolean)
          : undefined,
      },
      circuits,
      appliances: toAppliances(appliances.value),
      tariffs: {
        rateCPerKwh: tariffResolved.rate_c_per_kwh,
        supplyCPerDay: tariffResolved.supply_c_per_day,
        notes: tariffResolved.notes,
      },
    },
    evidenceRefs,
    sources: {
      phase: phase.source,
      voltageV: voltageV.source,
      mainSwitchA: mainSwitchA.source,
      totalCurrentA: totalCurrentA.source,
      durationSec: durationSec.source,
      tariffRate: rateCPerKwh.source,
      tariffSupply: supplyCPerDay.source,
    },
    evidenceCoverage,
    usedLegacyFallbackCircuit,
  };
}
