/**
 * Maps section IDs to possible finding IDs (from CHECKLIST_TO_FINDINGS_MAP).
 * Used after submit to assign staged section photos to actual findings.
 */

const SECTION_TO_FINDINGS: Record<string, string[]> = {
  S2_SUPPLY_OVERVIEW: [],
  S2_MAIN_SWITCH: [],
  S2_SWITCHBOARD_OVERVIEW: [
    "ASBESTOS_RISK",
    "THERMAL_STRESS_ACTIVE",
    "ARCING_EVIDENCE_PRESENT",
    "MATERIAL_DEGRADATION",
  ],
  S2_METERBOX: ["CERAMIC_FUSE_HOLDER_VISIBLE", "REWIREABLE_FUSES_PRESENT"],
  S3_SWITCHBOARD_CAPACITY_LABELS: [
    "BOARD_AT_CAPACITY",
    "NO_EXPANSION_MARGIN",
    "LABELING_POOR",
    "NON_STANDARD_WORK",
  ],
  S4_EARTHING_MEN: ["MEN_NOT_VERIFIED", "EARTH_DEGRADED"],
  S4_CABLES_LEGACY: [],
  S5_RCD_TESTS_SUMMARY: ["NO_RCD_PROTECTION", "GPO_EARTH_FAULT"],
  S6_RCD_TESTS_EXCEPTIONS: ["GPO_EARTH_FAULT"],
  S7A_GPO_BY_ROOM: [
    "GPO_MECHANICAL_LOOSE",
    "FITTING_OVERHEAT",
    "SWITCH_ARCING",
  ],
  S8_GPO_LIGHTING_EXCEPTIONS: [
    "GPO_MECHANICAL_LOOSE",
    "FITTING_OVERHEAT",
    "SWITCH_ARCING",
  ],
  S7B_LIGHTING_BY_ROOM: ["FITTING_OVERHEAT", "SWITCH_ARCING"],
  S3B_LIGHTING_SWITCHES: ["SWITCH_ARCING", "FITTING_OVERHEAT"],
  S3C_KITCHEN: [],
  S3D_BATHROOMS: [],
  S3E_LAUNDRY: [],
  S3F_ROOF_SPACE: [],
  S3G_EXTERIOR_GARAGE: [],
  S3H_SMOKE_ALARMS: [],
  S3I_GENERAL_OBSERVATIONS: [],
  S9_SOLAR_BATTERY_EV: [
    "BATTERY_THERMAL",
    "EV_UNSEGREGATED_LOAD",
    "PV_ISOLATION_UNVERIFIED",
  ],
  S9B_POOL_HIGH_LOAD: [],
  S5A_MEASURED_DATA: [],
  S6_EXCEPTIONS_COMPLETION: [],
};

export function getPossibleFindingsForSection(sectionId: string): string[] {
  return SECTION_TO_FINDINGS[sectionId] ?? [];
}

/**
 * Given staged photos per section and actual findings from the server,
 * returns list of { finding_id, caption, dataUrl } for upload (max 2 per finding).
 */
export function assignStagedPhotosToFindings(
  stagedPhotosBySection: Record<string, Array<{ caption: string; dataUrl: string }>>,
  actualFindingIds: string[]
): Array<{ finding_id: string; caption: string; dataUrl: string }> {
  const actualSet = new Set(actualFindingIds);
  const result: Array<{ finding_id: string; caption: string; dataUrl: string }> = [];
  const usedPerFinding: Record<string, number> = {};
  const MAX_PER_FINDING = 2;

  for (const sectionId of Object.keys(stagedPhotosBySection)) {
    const photos = stagedPhotosBySection[sectionId] ?? [];
    if (photos.length === 0) continue;
    const possible = getPossibleFindingsForSection(sectionId);
    const matching = possible.filter((f) => actualSet.has(f));
    if (matching.length === 0) continue;
    let photoIdx = 0;
    for (const findingId of matching) {
      if (photoIdx >= photos.length) break;
      const used = usedPerFinding[findingId] ?? 0;
      const slots = Math.min(MAX_PER_FINDING - used, photos.length - photoIdx);
      for (let i = 0; i < slots; i++) {
        const p = photos[photoIdx];
        result.push({
          finding_id: findingId,
          caption: p.caption || "Photo evidence",
          dataUrl: p.dataUrl,
        });
        photoIdx += 1;
      }
      usedPerFinding[findingId] = (usedPerFinding[findingId] ?? 0) + slots;
    }
    while (photoIdx < photos.length && matching.length > 0) {
      const fid = matching[0];
      if ((usedPerFinding[fid] ?? 0) >= MAX_PER_FINDING) break;
      const p = photos[photoIdx];
      result.push({
        finding_id: fid,
        caption: p.caption || "Photo evidence",
        dataUrl: p.dataUrl,
      });
      usedPerFinding[fid] = (usedPerFinding[fid] ?? 0) + 1;
      photoIdx++;
    }
  }
  return result;
}
