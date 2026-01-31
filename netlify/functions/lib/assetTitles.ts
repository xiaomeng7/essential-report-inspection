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
  const idAsTitle = findingId.replace(/_/g, " ");
  if (assetComponentFromProfile && assetComponentFromProfile.trim() !== idAsTitle) {
    return assetComponentFromProfile.trim();
  }
  if (findingTitle && findingTitle.trim()) return findingTitle.trim();
  return toTitleCase(idAsTitle);
}
