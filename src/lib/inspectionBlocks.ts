/**
 * Logical blocks for inspection flow: on-site execution order.
 *
 * Order: Job & Client → Main Load → Stress Test → Optional Circuit → Snapshot Intake
 *        → Access → Internal Rooms → Switchboard & RCD → Earthing & External → ...
 *
 * Virtual steps (energy_main_load, energy_stress, energy_enhanced, snapshot_intake)
 * have empty sectionIds and are rendered by Wizard with custom UI.
 */

export type BlockDef = {
  id: string;
  title: string;
  titleEn: string;
  sectionIds: string[];
};

/** Virtual step IDs (no FIELD_DICTIONARY sections; Wizard renders custom UI). */
export const VIRTUAL_STEP_IDS = new Set([
  "energy_main_load",
  "energy_stress",
  "energy_enhanced",
  "snapshot_intake",
]);

/** Wizard step order: matches on-site execution sequence. */
export const WIZARD_PAGES: BlockDef[] = [
  { id: "job_client", title: "Job & Client Context", titleEn: "Job & Client Context", sectionIds: ["S0_START_CONTEXT"] },
  { id: "energy_main_load", title: "Main Load & Voltage", titleEn: "Main Load & Voltage", sectionIds: [] },
  { id: "energy_stress", title: "Load Stress Test", titleEn: "Load Stress Test", sectionIds: [] },
  { id: "energy_enhanced", title: "Optional Circuit Breakdown", titleEn: "Optional Circuit Breakdown", sectionIds: [] },
  { id: "snapshot_intake", title: "Snapshot Intake (Optional)", titleEn: "Snapshot Intake (Optional)", sectionIds: [] },
  { id: "access", title: "Access & Limitations", titleEn: "Access & Limitations", sectionIds: ["S1_ACCESS_LIMITATIONS"] },
  {
    id: "internal_rooms",
    title: "Internal Rooms",
    titleEn: "Internal Rooms",
    sectionIds: ["S7B_LIGHTING_BY_ROOM", "S7A_GPO_BY_ROOM", "S8_GPO_LIGHTING_EXCEPTIONS"],
  },
  {
    id: "switchboard_rcd",
    title: "Switchboard & RCD",
    titleEn: "Safety Device Functional Tests",
    sectionIds: [
      "S2_SUPPLY_OVERVIEW",
      "S2_MAIN_SWITCH",
      "S2_SWITCHBOARD_OVERVIEW",
      "S2_METERBOX",
      "S3_SWITCHBOARD_CAPACITY_LABELS",
      "S5_RCD_TESTS_SUMMARY",
      "S6_RCD_TESTS_EXCEPTIONS",
    ],
  },
  {
    id: "earthing_external",
    title: "Earthing & External",
    titleEn: "Earthing & External",
    sectionIds: ["S4_EARTHING_MEN", "S4_CABLES_LEGACY", "S3F_ROOF_SPACE", "S3G_EXTERIOR_GARAGE"],
  },
  {
    id: "other_internal",
    title: "Kitchen, Bathrooms & Other",
    titleEn: "Kitchen, Bathrooms & Other",
    sectionIds: ["S3C_KITCHEN", "S3D_BATHROOMS", "S3E_LAUNDRY", "S3H_SMOKE_ALARMS", "S3I_GENERAL_OBSERVATIONS"],
  },
  { id: "assets", title: "Solar, Battery & High Load", titleEn: "Solar, Battery & High Load", sectionIds: ["S9_SOLAR_BATTERY_EV", "S9B_POOL_HIGH_LOAD"] },
  { id: "measured", title: "Measured Data", titleEn: "Measured Data", sectionIds: ["S5A_MEASURED_DATA"] },
  { id: "thermal", title: "Thermal Imaging (Premium)", titleEn: "Thermal Imaging (Premium)", sectionIds: ["S_THERMAL"] },
  { id: "exceptions", title: "Exceptions & Client Statements", titleEn: "Exceptions & Client Statements", sectionIds: ["S6_EXCEPTIONS_COMPLETION"] },
  { id: "signoff", title: "Sign-off", titleEn: "Sign-off", sectionIds: ["S10_SIGNOFF"] },
];

/** Block order and grouping; kept for getBlockForSection (now maps to wizard page). */
export const INSPECTION_BLOCKS: BlockDef[] = WIZARD_PAGES;

export function getBlocks() {
  return INSPECTION_BLOCKS;
}

export function getBlockForSection(sectionId: string): BlockDef | undefined {
  return WIZARD_PAGES.find((b) => b.sectionIds.includes(sectionId));
}

export function getWizardPages(): BlockDef[] {
  return WIZARD_PAGES;
}
