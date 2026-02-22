import { pickFirst, toNumber, getByPath, extractValue } from "./common";

type Coverage = "measured" | "observed" | "declared" | "unknown";

export type EnhancedCircuit = {
  label: string;
  category?: string;
  measuredCurrentA?: number;
  evidenceCoverage?: Coverage;
};

export type EnhancedCircuitsSignals = {
  circuits: EnhancedCircuit[];
  tariff?: {
    rate_c_per_kwh?: number;
    supply_c_per_day?: number;
  };
  coverage?: Coverage;
  sources?: Partial<Record<"circuits" | "tariffRate" | "tariffSupply", string[]>>;
};

function classify(path: string): Coverage {
  if (/(energy_v2|measured|stress_test|test_data\.measured)/i.test(path)) return "measured";
  if (/(snapshot|observed|inspection)/i.test(path)) return "observed";
  if (/(job\.|loads\.|assets_)/i.test(path)) return "declared";
  return "unknown";
}

function toCircuits(raw: Record<string, unknown>): { circuits: EnhancedCircuit[]; path?: string } {
  const candidates = ["energy_v2.circuits", "stress_test.circuits", "energy.stress_test.circuits", "circuits"];
  for (const path of candidates) {
    const value = getByPath(raw, path);
    if (!Array.isArray(value)) continue;
    const circuits = value
      .map((item, idx) => {
        const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        const measuredCurrentA = toNumber(extractValue(row.measuredCurrentA ?? row.currentA ?? row.current ?? row.amps));
        if (measuredCurrentA === undefined) return undefined;
        const label = String(extractValue(row.label ?? row.name ?? row.circuit) ?? `Circuit ${idx + 1}`).trim();
        const category = String(extractValue(row.category ?? row.group) ?? "").trim().toLowerCase() || undefined;
        return {
          label,
          category,
          measuredCurrentA,
          evidenceCoverage: classify(path),
        } satisfies EnhancedCircuit;
      })
      .filter((x): x is EnhancedCircuit => Boolean(x));
    if (circuits.length > 0) return { circuits, path };
  }
  return { circuits: [] };
}

export function extractEnhancedCircuits(rawUnknown: unknown): EnhancedCircuitsSignals {
  if (!rawUnknown || typeof rawUnknown !== "object") return { circuits: [], coverage: "unknown", sources: {} };
  const raw = rawUnknown as Record<string, unknown>;
  const circuitParsed = toCircuits(raw);
  const tariffRate = pickFirst(raw, [
    "energy_v2.tariff.rate_c_per_kwh",
    "tariffs.rate_c_per_kwh",
    "energy.tariffs.rate_c_per_kwh",
    "snapshot_intake.tariffs.rate_c_per_kwh",
  ]);
  const tariffSupply = pickFirst(raw, [
    "energy_v2.tariff.supply_c_per_day",
    "tariffs.supply_c_per_day",
    "energy.tariffs.supply_c_per_day",
    "snapshot_intake.tariffs.supply_c_per_day",
  ]);

  const sources: NonNullable<EnhancedCircuitsSignals["sources"]> = {};
  if (circuitParsed.path) sources.circuits = [circuitParsed.path];
  if (tariffRate.path) sources.tariffRate = [tariffRate.path];
  if (tariffSupply.path) sources.tariffSupply = [tariffSupply.path];

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
    circuits: circuitParsed.circuits,
    tariff: {
      rate_c_per_kwh: toNumber(tariffRate.value),
      supply_c_per_day: toNumber(tariffSupply.value),
    },
    coverage,
    sources,
  };
}
