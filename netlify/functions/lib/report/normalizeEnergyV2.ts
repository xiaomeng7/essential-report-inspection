function extractAnswerValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    return extractAnswerValue((v as { value: unknown }).value);
  }
  return undefined;
}

function getPath(raw: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = raw;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function num(v: unknown): number | undefined {
  const extracted = extractAnswerValue(v);
  if (typeof extracted === "number" && Number.isFinite(extracted)) return extracted;
  if (typeof extracted === "string") {
    const n = Number(extracted.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function bool(v: unknown): boolean | undefined {
  const extracted = extractAnswerValue(v);
  if (typeof extracted === "boolean") return extracted;
  if (typeof extracted === "number") return extracted !== 0;
  const s = String(extracted ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (["true", "yes", "1", "on", "y"].includes(s)) return true;
  if (["false", "no", "0", "off", "n"].includes(s)) return false;
  return undefined;
}

export function normalizeEnergyV2(raw: Record<string, unknown>): Record<string, unknown> {
  const phaseRaw = String(
    extractAnswerValue(getPath(raw, "energy_v2.supply.phaseSupply")) ??
      extractAnswerValue(getPath(raw, "job.supply_phase")) ??
      "single"
  ).toLowerCase();
  const phaseSupply = /three|3/.test(phaseRaw) ? "three" : "single";
  const circuitsRaw = getPath(raw, "energy_v2.circuits");
  const circuits = Array.isArray(circuitsRaw)
    ? circuitsRaw
        .map((row, index) => {
          const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
          return {
            label: String(extractAnswerValue(r.label) ?? `Circuit ${index + 1}`),
            category: String(extractAnswerValue(r.category) ?? "other"),
            measuredCurrentA: num(extractAnswerValue(r.measuredCurrentA)),
            evidenceCoverage: String(extractAnswerValue(r.evidenceCoverage) ?? "measured"),
          };
        })
    : [];

  return {
    supply: {
      phaseSupply,
      voltageV: num(getPath(raw, "energy_v2.supply.voltageV")) ?? (phaseSupply === "three" ? undefined : 230),
      voltageL1V: num(getPath(raw, "energy_v2.supply.voltageL1V")),
      voltageL2V: num(getPath(raw, "energy_v2.supply.voltageL2V")),
      voltageL3V: num(getPath(raw, "energy_v2.supply.voltageL3V")),
      mainSwitchA: num(getPath(raw, "energy_v2.supply.mainSwitchA")),
    },
    stressTest: {
      performed: bool(getPath(raw, "energy_v2.stressTest.performed")) ?? true,
      durationSec: num(getPath(raw, "energy_v2.stressTest.durationSec")) ?? 60,
      totalCurrentA: num(getPath(raw, "energy_v2.stressTest.totalCurrentA")),
      currentA_L1: num(getPath(raw, "energy_v2.stressTest.currentA_L1")),
      currentA_L2: num(getPath(raw, "energy_v2.stressTest.currentA_L2")),
      currentA_L3: num(getPath(raw, "energy_v2.stressTest.currentA_L3")),
      notTestedReasons: (() => {
        const v = getPath(raw, "energy_v2.stressTest.notTestedReasons");
        if (!Array.isArray(v)) return undefined;
        return v.map((x) => String(extractAnswerValue(x) ?? "").trim()).filter(Boolean);
      })(),
    },
    circuits,
    tariff: {
      rate_c_per_kwh: num(getPath(raw, "energy_v2.tariff.rate_c_per_kwh")),
      supply_c_per_day: num(getPath(raw, "energy_v2.tariff.supply_c_per_day")),
    },
    enhancedSkipReason: {
      code: String(
        extractAnswerValue(getPath(raw, "energy_v2.enhancedSkipReason.code")) ??
          extractAnswerValue(getPath(raw, "energy_v2.enhancedSkipReason.reason")) ??
          ""
      ).trim(),
      note: String(extractAnswerValue(getPath(raw, "energy_v2.enhancedSkipReason.note")) ?? "").trim(),
    },
  };
}
