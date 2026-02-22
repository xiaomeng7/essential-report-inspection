import type { SnapshotOccupancyType, SnapshotPrimaryGoal } from "../../../../src/lib/reportSelectionPolicy";

export type SnapshotIntake = {
  occupancyType: SnapshotOccupancyType;
  primaryGoal: SnapshotPrimaryGoal;
  profile?: "owner" | "investor" | "tenant";
  profileDeclared?: "owner" | "investor" | "unsure";
  billBand?: string;
  billUploadWilling?: boolean;
  allElectricNoGas?: boolean;
  tenantChangeSoon?: boolean;
  managerMode?: string;
  portfolioSizeBand?: string;
  devices?: string[];
  symptoms?: string[];
  concerns?: string[];
  hasEv?: boolean;
  hasSolar?: boolean;
  hasBattery?: boolean;
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
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

function firstString(raw: Record<string, unknown>, paths: string[]): string | undefined {
  for (const p of paths) {
    const v = getByPath(raw, p);
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return undefined;
}

function firstBool(raw: Record<string, unknown>, paths: string[]): boolean | undefined {
  for (const p of paths) {
    const v = getByPath(raw, p);
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      if (/^(true|yes|1|on|present|installed)$/i.test(v.trim())) return true;
      if (/^(false|no|0|off|none)$/i.test(v.trim())) return false;
    }
  }
  return undefined;
}

function normalizeOccupancyType(raw?: string): SnapshotOccupancyType {
  const s = (raw || "").trim().toLowerCase();
  if (/(owner_occupied|owner-occupied|owner occupied|owneroccupied)/.test(s)) return "owner_occupied";
  if (/(tenant|renter|renting)/.test(s)) return "tenant";
  return "investment";
}

function normalizePrimaryGoal(raw?: string): SnapshotPrimaryGoal {
  const s = (raw || "").trim().toLowerCase();
  if (/(risk|reduce_risk|reduce-risk)/.test(s)) return "risk";
  if (/(energy|reduce_bill|reduce-bill|bill)/.test(s)) return "energy";
  if (/(plan_upgrade|plan-upgrade|upgrade)/.test(s)) return "balanced";
  return "balanced";
}

function normalizeConcerns(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);
  if (!list.length) return undefined;
  return Array.from(new Set(list));
}

function normalizeStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .map((x) => (x == null ? "" : String(x).trim()))
    .filter(Boolean);
  if (!out.length) return undefined;
  return Array.from(new Set(out));
}

function normalizeProfile(raw?: string): SnapshotIntake["profile"] {
  const s = (raw || "").trim().toLowerCase();
  if (/(investment|investor|landlord)/.test(s)) return "investor";
  if (/(owner_occupied|owner-occupied|owner occupied|owneroccupied|owner)/.test(s)) return "owner";
  if (/(tenant|renter|renting)/.test(s)) return "tenant";
  return undefined;
}

function normalizeProfileDeclared(raw?: string): SnapshotIntake["profileDeclared"] {
  const s = (raw || "").trim().toLowerCase();
  if (/(investment|investor|landlord)/.test(s)) return "investor";
  if (/(owner_occupied|owner-occupied|owner occupied|owneroccupied|owner)/.test(s)) return "owner";
  if (/(unsure|both|not sure|unknown)/.test(s)) return "unsure";
  return undefined;
}

export function normalizeSnapshotIntake(input: unknown): SnapshotIntake {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

  const occupancyType = normalizeOccupancyType(
    firstString(raw, [
      "snapshot_intake.occupancyType",
      "snapshot_intake.occupancy_type",
      "snapshot.occupancyType",
      "snapshot.occupancy_type",
      "lead.occupancyType",
      "lead.occupancy_type",
      "client.occupancyType",
      "client.occupancy_type",
      "job.occupancyType",
      "job.occupancy_type",
      "occupancyType",
      "occupancy_type",
    ])
  );

  const primaryGoal = normalizePrimaryGoal(
    firstString(raw, [
      "snapshot_intake.primaryGoal",
      "snapshot_intake.focus",
      "snapshot.primaryGoal",
      "snapshot.focus",
      "lead.primaryGoal",
      "lead.focus",
      "client.primaryGoal",
      "client.focus",
      "job.primaryGoal",
      "job.primary_goal",
      "primaryGoal",
      "focus",
    ])
  );

  const hasEv = firstBool(raw, [
    "snapshot_intake.hasEv",
    "snapshot.hasEv",
    "assets.has_ev_charger",
    "loads.ev_charger",
    "hasEv",
  ]);
  const hasSolar = firstBool(raw, [
    "snapshot_intake.hasSolar",
    "snapshot.hasSolar",
    "assets.has_solar_pv",
    "loads.solar",
    "hasSolar",
  ]);
  const hasBattery = firstBool(raw, [
    "snapshot_intake.hasBattery",
    "snapshot.hasBattery",
    "assets.has_battery",
    "loads.battery",
    "hasBattery",
  ]);
  const billUploadWilling = firstBool(raw, [
    "snapshot_intake.billUploadWilling",
    "snapshot.billUploadWilling",
    "lead.billUploadWilling",
    "billUploadWilling",
  ]);
  const allElectricNoGas = firstBool(raw, [
    "snapshot_intake.allElectricNoGas",
    "snapshot.allElectricNoGas",
    "lead.allElectricNoGas",
    "allElectricNoGas",
  ]);
  const tenantChangeSoon = firstBool(raw, [
    "snapshot_intake.tenantChangeSoon",
    "snapshot.tenantChangeSoon",
    "lead.tenantChangeSoon",
    "tenantChangeSoon",
  ]);
  const profile = normalizeProfile(
    firstString(raw, ["snapshot_intake.profile", "snapshot.profile", "lead.profile", "profile"])
  );
  const profileDeclared = normalizeProfileDeclared(
    firstString(raw, ["snapshot_intake.profileDeclared", "snapshot_intake.profile_declared", "profileDeclared"])
  );
  const billBand = firstString(raw, ["snapshot_intake.billBand", "snapshot.billBand", "lead.billBand", "billBand"]);
  const managerMode = firstString(raw, [
    "snapshot_intake.managerMode",
    "snapshot_intake.investorManagerMode",
    "snapshot.managerMode",
    "lead.managerMode",
    "managerMode",
  ]);
  const portfolioSizeBand = firstString(raw, [
    "snapshot_intake.portfolioSizeBand",
    "snapshot.portfolioSizeBand",
    "lead.portfolioSizeBand",
    "portfolioSizeBand",
  ]);
  const devices =
    normalizeStringArray(getByPath(raw, "snapshot_intake.devices")) ??
    normalizeStringArray(getByPath(raw, "snapshot.devices")) ??
    normalizeStringArray(getByPath(raw, "devices"));
  const symptoms =
    normalizeStringArray(getByPath(raw, "snapshot_intake.symptoms")) ??
    normalizeStringArray(getByPath(raw, "snapshot.symptoms")) ??
    normalizeStringArray(getByPath(raw, "symptoms"));

  const concerns =
    normalizeConcerns(getByPath(raw, "snapshot_intake.concerns")) ??
    normalizeConcerns(getByPath(raw, "snapshot.concerns")) ??
    normalizeConcerns(getByPath(raw, "concerns"));

  const contact = {
    name:
      firstString(raw, ["snapshot_intake.contact.name", "lead.name", "client.name", "job.customer_name"]) ||
      undefined,
    phone:
      firstString(raw, ["snapshot_intake.contact.phone", "lead.phone", "client.phone", "job.phone"]) ||
      undefined,
    email:
      firstString(raw, ["snapshot_intake.contact.email", "lead.email", "client.email", "job.email"]) ||
      undefined,
    address:
      firstString(raw, ["snapshot_intake.contact.address", "lead.address", "client.address", "job.address"]) ||
      undefined,
  };

  const out: SnapshotIntake = {
    occupancyType,
    primaryGoal,
  };
  if (concerns && concerns.length) out.concerns = concerns;
  if (profile) out.profile = profile;
  if (profileDeclared) out.profileDeclared = profileDeclared;
  if (billBand) out.billBand = billBand;
  if (billUploadWilling !== undefined) out.billUploadWilling = billUploadWilling;
  if (allElectricNoGas !== undefined) out.allElectricNoGas = allElectricNoGas;
  if (tenantChangeSoon !== undefined) out.tenantChangeSoon = tenantChangeSoon;
  if (managerMode) out.managerMode = managerMode;
  if (portfolioSizeBand) out.portfolioSizeBand = portfolioSizeBand;
  if (devices && devices.length) out.devices = devices;
  if (symptoms && symptoms.length) out.symptoms = symptoms;
  if (hasEv !== undefined) out.hasEv = hasEv;
  if (hasSolar !== undefined) out.hasSolar = hasSolar;
  if (hasBattery !== undefined) out.hasBattery = hasBattery;
  if (contact.name || contact.phone || contact.email || contact.address) out.contact = contact;
  return out;
}
