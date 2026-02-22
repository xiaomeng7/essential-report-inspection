export type AssetsEnergySignals = {
  hasSolar?: boolean;
  hasBattery?: boolean;
  hasEv?: boolean;
  coverage?: "declared" | "observed" | "unknown";
  sources?: Partial<Record<"hasSolar" | "hasBattery" | "hasEv", string>>;
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

function pickFirst(raw: Record<string, unknown>, paths: string[]): { value?: string; path?: string } {
  for (const path of paths) {
    const v = getByPath(raw, path);
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return { value: String(v).trim(), path };
    }
  }
  return {};
}

function parseBool(value?: string): boolean | undefined {
  if (!value) return undefined;
  const s = value.trim().toLowerCase();
  if (["true", "yes", "1", "on", "present", "installed"].includes(s)) return true;
  if (["false", "no", "0", "off", "none", "absent"].includes(s)) return false;
  return undefined;
}

function classifyCoverage(paths: string[]): AssetsEnergySignals["coverage"] {
  if (paths.length === 0) return "unknown";
  if (paths.some((p) => /(loads\.|job\.|assets_energy\.)/i.test(p))) return "declared";
  return "observed";
}

export function extractAssetsEnergy(rawUnknown: unknown): AssetsEnergySignals {
  if (!rawUnknown || typeof rawUnknown !== "object") return { coverage: "unknown", sources: {} };
  const raw = rawUnknown as Record<string, unknown>;

  const solar = pickFirst(raw, [
    "assets_energy.hasSolar",
    "assets_energy.has_solar",
    "loads.solar",
    "job.solar",
    "solar_present",
  ]);
  const battery = pickFirst(raw, [
    "assets_energy.hasBattery",
    "assets_energy.has_battery",
    "loads.battery",
    "job.battery",
    "battery_present",
  ]);
  const ev = pickFirst(raw, [
    "assets_energy.hasEv",
    "assets_energy.has_ev",
    "loads.ev_charger",
    "job.ev",
    "ev_charger_present",
  ]);

  const sources: AssetsEnergySignals["sources"] = {};
  if (solar.path) sources.hasSolar = solar.path;
  if (battery.path) sources.hasBattery = battery.path;
  if (ev.path) sources.hasEv = ev.path;
  const coverage = classifyCoverage(Object.values(sources).filter(Boolean) as string[]);

  return {
    hasSolar: parseBool(solar.value),
    hasBattery: parseBool(battery.value),
    hasEv: parseBool(ev.value),
    coverage,
    sources,
  };
}
