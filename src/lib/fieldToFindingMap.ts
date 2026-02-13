/**
 * Maps field keys (with on_issue_capture) to finding IDs.
 * Used to upload issue detail photos to the correct finding.
 * 
 * Based on CHECKLIST_TO_FINDINGS_MAP.json and field semantics.
 */

export const FIELD_TO_FINDING: Record<string, string> = {
  // Switchboard issues
  "switchboard.signs_of_overheating": "THERMAL_STRESS_ACTIVE",
  "switchboard.burn_marks_or_carbon": "ARCING_EVIDENCE_PRESENT",
  "switchboard.water_ingress": "MATERIAL_DEGRADATION",
  "switchboard.asbestos_suspected": "ASBESTOS_RISK",
  "switchboard.dust_insect_contamination": "MATERIAL_DEGRADATION",
  "switchboard.grease_oil_contamination": "MATERIAL_DEGRADATION",
  "switchboard.loose_components_visible": "GPO_MECHANICAL_LOOSE",
  "switchboard.cracked_brittle_insulation": "MATERIAL_DEGRADATION",
  "switchboard.unprotected_cable_entries": "NON_STANDARD_WORK",
  "switchboard.exposed_single_insulated": "NON_STANDARD_WORK",
  "switchboard.incorrect_colour_identification": "NON_STANDARD_WORK",
  "switchboard.ceramic_fuse_holders_present": "CERAMIC_FUSE_HOLDER_VISIBLE",
  "switchboard.rewireable_fuses_present": "REWIREABLE_FUSES_PRESENT",
  "switchboard.mixed_old_new_devices": "NON_STANDARD_WORK",

  // Earthing issues
  "earthing.bare_earth_in_use": "EARTH_DEGRADED",
  "earthing.earth_neutral_mixed_downstream": "EARTH_DEGRADED",

  // GPO issues

  // Internal installation - count fields (number > 0 = issue)
  "internal.power_point_moves_count": "GPO_MECHANICAL_LOOSE",
  "internal.cracks_visible_count": "MATERIAL_DEGRADATION",
  "internal.burn_marks_count": "THERMAL_STRESS_ACTIVE",
  "internal.plug_disengages_count": "GPO_MECHANICAL_LOOSE",

  // RCD fail count
  "rcd_tests.summary.total_fail": "GPO_EARTH_FAULT",

  // Internal installation - power points & switches
  "internal.surface_warm_to_touch": "FITTING_OVERHEAT",
  "internal.switch_plate_cracked": "SWITCH_ARCING",
  "internal.switch_body_moves": "GPO_MECHANICAL_LOOSE",
  "internal.unusual_audible_sound": "SWITCH_ARCING",
  "internal.light_fitting_moves": "FITTING_OVERHEAT",
  "internal.bare_wire_visible": "NON_STANDARD_WORK",

  // Kitchen
  "internal.kitchen.gpo_switches_grease_oil": "FITTING_OVERHEAT",

  // Bathroom
  "internal.bathroom.moisture_staining": "MATERIAL_DEGRADATION",

  // Roof space
  "internal.roof.insulation_contact": "THERMAL_STRESS_ACTIVE",
  "internal.roof.non_modern_cable": "MATERIAL_DEGRADATION",
  "internal.roof.taped_connection": "NON_STANDARD_WORK",
  "internal.roof.transformer_on_insulation": "THERMAL_STRESS_ACTIVE",

  // Exterior
  "internal.exterior.cover_broken_missing": "MATERIAL_DEGRADATION",
  "internal.exterior.flexible_lead_fixed": "NON_STANDARD_WORK",

  // General observations
  "internal.general.ceramic_fuse_holder_visible": "CERAMIC_FUSE_HOLDER_VISIBLE",
  "internal.general.bakelite_ceramic_visible": "MATERIAL_DEGRADATION",
  "internal.general.non_standard_wiring": "NON_STANDARD_WORK",
  "internal.general.cable_damage_visible": "MATERIAL_DEGRADATION",

  // Solar/Battery
  "assets.solar.inverter_alarm": "PV_ISOLATION_UNVERIFIED",
  "assets.battery.heat_swelling_odour": "BATTERY_THERMAL",
};

/**
 * Get the finding ID for a field key
 */
export function getFindingForField(fieldKey: string): string | undefined {
  return FIELD_TO_FINDING[fieldKey];
}

/**
 * Get all field keys that map to a specific finding
 */
export function getFieldsForFinding(findingId: string): string[] {
  return Object.entries(FIELD_TO_FINDING)
    .filter(([, fid]) => fid === findingId)
    .map(([key]) => key);
}
