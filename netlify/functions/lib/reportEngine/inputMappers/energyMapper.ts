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

function getFirstValue(raw: Record<string, unknown>, candidates: string[]): { value?: string; source?: string } {
  for (const path of candidates) {
    const v = getByPath(raw, path);
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return { value: String(v).trim(), source: path };
    }
  }
  return {};
}

function parseDeviceList(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/[,;/|]/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export type EnergyInput = {
  phaseSupply?: string;
  voltageV?: string;
  mainSwitchA?: string;
  clampLoadA?: string;
  highLoadDevices: string[];
  hasEv: boolean;
  hasSolar: boolean;
  hasBattery: boolean;
};

export type EnergyMapped = {
  energy?: EnergyInput;
  evidenceRefs: string[];
  evidenceCoverage: "measured" | "observed" | "declared" | "unknown";
};

/**
 * Energy input mapper (Phase 4):
 * - Extracts only verifiable inputs from inspection.raw
 * - Returns normalized energy input + evidence refs + coverage level
 */
export function mapEnergyInput(raw: Record<string, unknown>): EnergyMapped {
  const phase = getFirstValue(raw, [
    "job.supply_phase",
    "electrical.supply.phase",
    "supply.phase",
    "test_data.measured.phase",
    "measured.phase",
  ]);
  const voltage = getFirstValue(raw, [
    "electrical.supply.voltage",
    "supply.voltage",
    "test_data.measured.voltage",
    "measured.voltage",
  ]);
  const mainSwitch = getFirstValue(raw, [
    "switchboard.main_switch_rating",
    "main_switch.rating",
    "job.main_switch_rating",
    "test_data.measured.main_switch_rating",
    "measured.main_switch_rating",
  ]);
  const clampLoad = getFirstValue(raw, [
    "test_data.measured.load_current",
    "measured.load_current",
    "measured.clamp_current",
    "electrical.load_current",
  ]);

  const highLoad = getFirstValue(raw, [
    "high_load_devices",
    "loads.high_demand",
    "test_data.measured.high_load_devices",
    "measured.high_load_devices",
  ]);
  const ev = getFirstValue(raw, ["ev_charger_present", "job.ev", "loads.ev_charger"]);
  const solar = getFirstValue(raw, ["solar_present", "job.solar", "loads.solar"]);
  const battery = getFirstValue(raw, ["battery_present", "job.battery", "loads.battery"]);

  const hasEv = /^(true|yes|1|present|installed)$/i.test(ev.value || "");
  const hasSolar = /^(true|yes|1|present|installed)$/i.test(solar.value || "");
  const hasBattery = /^(true|yes|1|present|installed)$/i.test(battery.value || "");
  const highLoadDevices = parseDeviceList(highLoad.value);

  const evidenceRefs = [
    phase.source,
    voltage.source,
    mainSwitch.source,
    clampLoad.source,
    highLoad.source,
    ev.source,
    solar.source,
    battery.source,
  ].filter((x): x is string => Boolean(x));

  if (evidenceRefs.length === 0) {
    return { evidenceRefs: [], evidenceCoverage: "unknown" };
  }

  const measuredHits = [voltage.source, clampLoad.source, mainSwitch.source]
    .filter((x) => Boolean(x))
    .filter((x) => /(measured|test_data\.measured)/.test(String(x))).length;
  const declaredHits = [ev.source, solar.source, battery.source]
    .filter((x) => Boolean(x))
    .filter((x) => /(job\.|loads\.)/.test(String(x))).length;

  let evidenceCoverage: "measured" | "observed" | "declared" | "unknown" = "observed";
  if (measuredHits > 0) evidenceCoverage = "measured";
  else if (declaredHits > 0) evidenceCoverage = "declared";

  return {
    energy: {
      phaseSupply: phase.value,
      voltageV: voltage.value,
      mainSwitchA: mainSwitch.value,
      clampLoadA: clampLoad.value,
      highLoadDevices,
      hasEv,
      hasSolar,
      hasBattery,
    },
    evidenceRefs,
    evidenceCoverage,
  };
}
