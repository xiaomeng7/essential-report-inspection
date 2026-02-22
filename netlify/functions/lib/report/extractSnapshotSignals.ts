export type SnapshotSignals = {
  occupancyType?: "owner_occupied" | "investment" | "tenant";
  profile?: "owner" | "investor" | "tenant";
  profileDeclared?: "owner" | "investor" | "unsure";
  primaryGoal?: "risk" | "energy" | "balanced" | "reduce_bill" | "reduce_risk" | "plan_upgrade";
  billBand?: string;
  billUploadWilling?: boolean;
  allElectricNoGas?: boolean;
  tenantChangeSoon?: boolean;
  managerMode?: string;
  portfolioSizeBand?: string;
  devices?: string[];
  symptoms?: string[];
  hasEv?: boolean;
  hasSolar?: boolean;
  hasBattery?: boolean;
  coverage?: "declared" | "observed" | "unknown";
  sources?: Partial<
    Record<
      | "occupancyType"
      | "profile"
      | "profileDeclared"
      | "primaryGoal"
      | "billBand"
      | "billUploadWilling"
      | "allElectricNoGas"
      | "tenantChangeSoon"
      | "managerMode"
      | "portfolioSizeBand"
      | "devices"
      | "symptoms"
      | "hasEv"
      | "hasSolar"
      | "hasBattery",
      string
    >
  >;
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

function getRawByPath(raw: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = raw;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function pickFirst(raw: Record<string, unknown>, paths: string[]): { value?: string; path?: string } {
  for (const p of paths) {
    const v = getByPath(raw, p);
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return { value: String(v).trim(), path: p };
    }
  }
  return {};
}

function normalizeOccupancyType(value?: string): SnapshotSignals["occupancyType"] {
  const s = (value || "").trim().toLowerCase();
  if (!s) return undefined;
  if (/(owner_occupied|owner-occupied|owner occupied|owneroccupied|owner)/.test(s)) return "owner_occupied";
  if (/(investment|investor|landlord)/.test(s)) return "investment";
  if (/(tenant|renter|renting)/.test(s)) return "tenant";
  return undefined;
}

function normalizeProfile(value?: string): SnapshotSignals["profile"] {
  const s = (value || "").trim().toLowerCase();
  if (!s) return undefined;
  if (/(investment|investor|landlord)/.test(s)) return "investor";
  if (/(owner_occupied|owner-occupied|owner occupied|owneroccupied|owner)/.test(s)) return "owner";
  if (/(tenant|renter|renting)/.test(s)) return "tenant";
  return undefined;
}

function normalizeProfileDeclared(value?: string): SnapshotSignals["profileDeclared"] {
  const s = (value || "").trim().toLowerCase();
  if (!s) return undefined;
  if (/(investment|investor|landlord)/.test(s)) return "investor";
  if (/(owner_occupied|owner-occupied|owner occupied|owneroccupied|owner)/.test(s)) return "owner";
  if (/(unsure|both|not sure|unknown)/.test(s)) return "unsure";
  return undefined;
}

function normalizePrimaryGoal(value?: string): SnapshotSignals["primaryGoal"] {
  const s = (value || "").trim().toLowerCase();
  if (!s) return undefined;
  if (/^(risk)$/i.test(s)) return "risk";
  if (/^(energy)$/i.test(s)) return "energy";
  if (/^(balanced)$/i.test(s)) return "balanced";
  if (/(reduce_bill|reduce-bill|bill)/.test(s)) return "reduce_bill";
  if (/(reduce_risk|reduce-risk)/.test(s)) return "reduce_risk";
  if (/(plan_upgrade|plan-upgrade|upgrade)/.test(s)) return "plan_upgrade";
  return undefined;
}

function parseBool(value?: string): boolean | undefined {
  if (!value) return undefined;
  if (/^(true|yes|1|on|present|installed)$/i.test(value)) return true;
  if (/^(false|no|0|off|none)$/i.test(value)) return false;
  return undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const out = value
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter(Boolean);
    return out.length ? Array.from(new Set(out)) : undefined;
  }
  if (typeof value === "string") {
    const out = value
      .split(/[,\n;|]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return out.length ? Array.from(new Set(out)) : undefined;
  }
  return undefined;
}

function hasToken(list: string[] | undefined, token: string): boolean {
  if (!list?.length) return false;
  const t = token.toLowerCase();
  return list.some((item) => item.toLowerCase() === t);
}

function classifySource(path: string): "declared" | "observed" {
  if (/(test_data|measured|inspection|observed)/i.test(path)) return "observed";
  return "declared";
}

export function extractSnapshotSignals(rawUnknown: unknown): SnapshotSignals {
  if (!rawUnknown || typeof rawUnknown !== "object") {
    return { coverage: "unknown", sources: {} };
  }
  const raw = rawUnknown as Record<string, unknown>;

  const profile = pickFirst(raw, [
    "snapshot_intake.profile",
    "snapshot.profile",
    "lead.profile",
    "client.profile",
    "profile",
    "job.profile",
  ]);
  const profileDeclared = pickFirst(raw, [
    "snapshot_intake.profileDeclared",
    "snapshot_intake.profile_declared",
    "snapshot.profileDeclared",
    "lead.profileDeclared",
    "profileDeclared",
  ]);
  const occupancy = pickFirst(raw, [
    "snapshot_intake.occupancyType",
    "snapshot_intake.occupancy_type",
    "snapshot.occupancyType",
    "snapshot.occupancy_type",
    "lead.occupancyType",
    "lead.occupancy_type",
    "client.occupancyType",
    "client.occupancy_type",
    "occupancyType",
    "occupancy_type",
    "job.occupancyType",
    "job.occupancy_type",
  ]);
  const goal = pickFirst(raw, [
    "snapshot_intake.primaryGoal",
    "snapshot_intake.focus",
    "snapshot.primaryGoal",
    "snapshot.focus",
    "lead.primaryGoal",
    "lead.focus",
    "client.primaryGoal",
    "client.focus",
    "primaryGoal",
    "focus",
    "job.primaryGoal",
    "job.primary_goal",
  ]);
  const billBand = pickFirst(raw, [
    "snapshot_intake.billBand",
    "snapshot_intake.bill_band",
    "snapshot.billBand",
    "lead.billBand",
    "billBand",
  ]);
  const billUploadWilling = pickFirst(raw, [
    "snapshot_intake.billUploadWilling",
    "snapshot.billUploadWilling",
    "lead.billUploadWilling",
    "billUploadWilling",
  ]);
  const allElectricNoGas = pickFirst(raw, [
    "snapshot_intake.allElectricNoGas",
    "snapshot.allElectricNoGas",
    "lead.allElectricNoGas",
    "allElectricNoGas",
  ]);
  const tenantChangeSoon = pickFirst(raw, [
    "snapshot_intake.tenantChangeSoon",
    "snapshot.tenantChangeSoon",
    "lead.tenantChangeSoon",
    "tenantChangeSoon",
  ]);
  const managerMode = pickFirst(raw, [
    "snapshot_intake.managerMode",
    "snapshot_intake.investorManagerMode",
    "snapshot.managerMode",
    "lead.managerMode",
    "managerMode",
  ]);
  const portfolioSizeBand = pickFirst(raw, [
    "snapshot_intake.portfolioSizeBand",
    "snapshot.portfolioSizeBand",
    "lead.portfolioSizeBand",
    "portfolioSizeBand",
  ]);
  const ev = pickFirst(raw, [
    "snapshot_intake.hasEv",
    "snapshot.hasEv",
    "lead.hasEv",
    "client.hasEv",
    "ev_charger_present",
    "job.ev",
    "loads.ev_charger",
  ]);
  const solar = pickFirst(raw, [
    "snapshot_intake.hasSolar",
    "snapshot.hasSolar",
    "lead.hasSolar",
    "client.hasSolar",
    "solar_present",
    "job.solar",
    "loads.solar",
  ]);
  const battery = pickFirst(raw, [
    "snapshot_intake.hasBattery",
    "snapshot.hasBattery",
    "lead.hasBattery",
    "client.hasBattery",
    "battery_present",
    "job.battery",
    "loads.battery",
  ]);
  const devicesPath = [
    "snapshot_intake.devices",
    "snapshot.devices",
    "lead.devices",
    "devices",
  ].find((p) => getRawByPath(raw, p) !== undefined);
  const symptomsPath = [
    "snapshot_intake.symptoms",
    "snapshot.symptoms",
    "lead.symptoms",
    "symptoms",
  ].find((p) => getRawByPath(raw, p) !== undefined);
  const devices = normalizeStringArray(devicesPath ? getRawByPath(raw, devicesPath) : undefined);
  const symptoms = normalizeStringArray(symptomsPath ? getRawByPath(raw, symptomsPath) : undefined);

  const sources: SnapshotSignals["sources"] = {};
  if (profile.path) sources.profile = profile.path;
  if (profileDeclared.path) sources.profileDeclared = profileDeclared.path;
  if (occupancy.path) sources.occupancyType = occupancy.path;
  if (goal.path) sources.primaryGoal = goal.path;
  if (billBand.path) sources.billBand = billBand.path;
  if (billUploadWilling.path) sources.billUploadWilling = billUploadWilling.path;
  if (allElectricNoGas.path) sources.allElectricNoGas = allElectricNoGas.path;
  if (tenantChangeSoon.path) sources.tenantChangeSoon = tenantChangeSoon.path;
  if (managerMode.path) sources.managerMode = managerMode.path;
  if (portfolioSizeBand.path) sources.portfolioSizeBand = portfolioSizeBand.path;
  if (devicesPath) sources.devices = devicesPath;
  if (symptomsPath) sources.symptoms = symptomsPath;
  if (ev.path) sources.hasEv = ev.path;
  if (solar.path) sources.hasSolar = solar.path;
  if (battery.path) sources.hasBattery = battery.path;

  const sourceKinds = Object.values(sources).map((p) => classifySource(String(p)));
  const coverage: SnapshotSignals["coverage"] =
    sourceKinds.includes("observed") ? "observed" :
    sourceKinds.includes("declared") ? "declared" :
    "unknown";

  return {
    profile: normalizeProfile(profile.value),
    profileDeclared: normalizeProfileDeclared(profileDeclared.value),
    occupancyType: normalizeOccupancyType(occupancy.value),
    primaryGoal: normalizePrimaryGoal(goal.value),
    billBand: billBand.value,
    billUploadWilling: parseBool(billUploadWilling.value),
    allElectricNoGas: parseBool(allElectricNoGas.value),
    tenantChangeSoon: parseBool(tenantChangeSoon.value),
    managerMode: managerMode.value,
    portfolioSizeBand: portfolioSizeBand.value,
    devices,
    symptoms,
    hasEv: parseBool(ev.value) ?? hasToken(devices, "ev"),
    hasSolar: parseBool(solar.value) ?? hasToken(devices, "solar"),
    hasBattery: parseBool(battery.value) ?? hasToken(devices, "battery"),
    coverage,
    sources,
  };
}
