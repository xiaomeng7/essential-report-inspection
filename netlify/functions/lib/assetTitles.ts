/**
 * Asset-oriented display titles (Gold Sample: "Main Switchboard" not "SWITCHBOARD_AGED").
 * Shared by generateFindingPages and buildReportMarkdown for consistent report titles.
 */

export const ASSET_TITLE_MAP: Record<string, string> = {
  SWITCHBOARD_AGED_ORIGINAL: "Main Switchboard – Ageing Components",
  SWITCHBOARD_NO_RCD_OR_RCBO: "Main Switchboard – RCD/RCBO Protection",
  SWITCHBOARD_NO_RCBO: "Main Switchboard – RCBO Protection",
  SWITCHBOARD_CERAMIC_FUSES_PRESENT: "Main Switchboard – Ceramic Fuses",
  SWITCHBOARD_REWIREABLE_FUSES_PRESENT: "Main Switchboard – Rewireable Fuses",
  SWITCHBOARD_LABELING_INCOMPLETE: "Main Switchboard – Labeling",
  SWITCHBOARD_CLEARANCES_OR_ACCESS_ISSUE: "Main Switchboard – Clearances or Access",
  SWITCHBOARD_ENCLOSURE_DAMAGED: "Main Switchboard – Enclosure",
  SWITCHBOARD_CONTAMINATION: "Main Switchboard – Cleanliness",
  SMOKE_ALARMS_EXPIRED: "Smoke Alarms – Service Life",
  SMOKE_ALARMS_MISSING: "Smoke Alarms – Missing",
  SMOKE_ALARMS_NOT_INTERCONNECTED: "Smoke Alarms – Interconnection",
  LIGHTING_CIRCUITS_NO_RCD: "Lighting Circuits – RCD Protection",
  GPO_LOOSE_MOUNTING: "Power Points – Loose or Damaged",
  POWER_POINTS_LOOSE_OR_DAMAGED: "Power Points – Loose or Damaged",
};

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Generate asset-condition hybrid title for custom findings (Strategy 1: Asset-Condition Hybrid).
 * Replaces generic "General Observation" with professional, specific titles.
 * Format: [Asset Area] – [Condition Type]
 * 
 * @param finding - Finding with location, observed, title
 * @returns Professional asset-condition hybrid title (e.g. "Living Room Outlets – Mechanical Looseness")
 */
export function generateCustomFindingTitle(
  finding: { id?: string; title?: string; observed?: string; location?: string }
): string {
  const location = finding.location?.trim() || "Property";
  const observed = (finding.observed || finding.title || "").toLowerCase();
  
  // Extract condition type from observed text using keyword matching
  let conditionType = "Condition Noted";
  
  if (observed.includes("loose") || observed.includes("mechanical")) {
    conditionType = "Mechanical Looseness";
  } else if (observed.includes("overheat") || observed.includes("thermal") || observed.includes("heat") || observed.includes("warm")) {
    conditionType = "Thermal Concern";
  } else if (observed.includes("water") || observed.includes("moisture") || observed.includes("damp")) {
    conditionType = "Water Ingress Risk";
  } else if (observed.includes("cable") || observed.includes("wiring") || observed.includes("conductor")) {
    conditionType = "Cabling Concern";
  } else if (observed.includes("label") || observed.includes("marking") || observed.includes("identification")) {
    conditionType = "Documentation Gap";
  } else if (observed.includes("damage") || observed.includes("worn") || observed.includes("deteriorat")) {
    conditionType = "Physical Degradation";
  } else if (observed.includes("non-standard") || observed.includes("diy") || observed.includes("modified")) {
    conditionType = "Installation Anomaly";
  } else if (observed.includes("burn") || observed.includes("scorch") || observed.includes("carbon")) {
    conditionType = "Thermal Damage";
  } else if (observed.includes("rust") || observed.includes("corros")) {
    conditionType = "Corrosion";
  } else if (observed.includes("access") || observed.includes("clearance")) {
    conditionType = "Access Limitation";
  } else if (observed.includes("age") || observed.includes("ageing") || observed.includes("old")) {
    conditionType = "Component Ageing";
  } else if (observed.includes("protect") && observed.includes("rcd")) {
    conditionType = "RCD Protection Gap";
  } else if (observed.includes("earth") || observed.includes("ground")) {
    conditionType = "Earthing Concern";
  }
  
  return `${location} – ${conditionType}`;
}

/**
 * Get asset-oriented display title for a finding.
 * @param findingId - e.g. SWITCHBOARD_AGED_ORIGINAL
 * @param assetComponentFromProfile - profile.asset_component or profile.messaging?.title
 * @param findingTitle - optional title from inspection
 */
export function getAssetDisplayTitle(
  findingId: string,
  assetComponentFromProfile?: string | null,
  findingTitle?: string | null
): string {
  const fromMap = ASSET_TITLE_MAP[findingId];
  if (fromMap) return fromMap;
  // Never show "UNKNOWN FINDING FALLBACK" in production reports
  if (assetComponentFromProfile && /UNKNOWN\s*FINDING\s*FALLBACK/i.test(String(assetComponentFromProfile).trim())) {
    assetComponentFromProfile = undefined;
  }
  const idAsTitle = findingId.replace(/_/g, " ");
  if (assetComponentFromProfile && assetComponentFromProfile.trim() !== idAsTitle) {
    return assetComponentFromProfile.trim();
  }
  if (findingTitle && findingTitle.trim()) return findingTitle.trim();
  return toTitleCase(idAsTitle);
}
