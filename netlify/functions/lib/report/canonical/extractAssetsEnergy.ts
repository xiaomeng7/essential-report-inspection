import { pickFirst, toBoolean } from "./common";

type Coverage = "measured" | "observed" | "declared" | "unknown";

export type AssetsEnergySignals = {
  hasSolar?: boolean;
  hasBattery?: boolean;
  hasEv?: boolean;
  coverage?: Coverage;
  sources?: Partial<Record<"hasSolar" | "hasBattery" | "hasEv", string[]>>;
};

function classify(path: string): Coverage {
  if (/(assets_energy|snapshot_intake|loads\.|job\.|_present)/i.test(path)) return "declared";
  if (/(inspection|observed)/i.test(path)) return "observed";
  return "unknown";
}

function collect(
  key: keyof NonNullable<AssetsEnergySignals["sources"]>,
  path: string | undefined,
  sources: NonNullable<AssetsEnergySignals["sources"]>
): void {
  if (!path) return;
  sources[key] = [...(sources[key] ?? []), path];
}

export function extractAssetsEnergy(rawUnknown: unknown): AssetsEnergySignals {
  if (!rawUnknown || typeof rawUnknown !== "object") return { coverage: "unknown", sources: {} };
  const raw = rawUnknown as Record<string, unknown>;

  const solar = pickFirst(raw, [
    "assets_energy.hasSolar",
    "assets_energy.has_solar",
    "snapshot_intake.hasSolar",
    "loads.solar",
    "job.solar",
    "solar_present",
  ]);
  const battery = pickFirst(raw, [
    "assets_energy.hasBattery",
    "assets_energy.has_battery",
    "snapshot_intake.hasBattery",
    "loads.battery",
    "job.battery",
    "battery_present",
  ]);
  const ev = pickFirst(raw, [
    "assets_energy.hasEv",
    "assets_energy.has_ev",
    "snapshot_intake.hasEv",
    "loads.ev_charger",
    "job.ev",
    "ev_charger_present",
  ]);

  const sources: NonNullable<AssetsEnergySignals["sources"]> = {};
  collect("hasSolar", solar.path, sources);
  collect("hasBattery", battery.path, sources);
  collect("hasEv", ev.path, sources);

  const coverageCandidates = Object.values(sources)
    .flat()
    .map((p) => classify(p));
  const coverage: Coverage = coverageCandidates.includes("declared")
    ? "declared"
    : coverageCandidates.includes("observed")
    ? "observed"
    : "unknown";

  return {
    hasSolar: toBoolean(solar.value),
    hasBattery: toBoolean(battery.value),
    hasEv: toBoolean(ev.value),
    coverage,
    sources,
  };
}
