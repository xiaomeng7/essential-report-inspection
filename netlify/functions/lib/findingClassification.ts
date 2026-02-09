/**
 * Automatic finding classification: system_group, space_group, tags.
 * First-match wins for system_group and space_group; tags from all matching keyword rules.
 */

export type FindingClassification = {
  system_group: string;
  space_group: string;
  tags: string[];
};

/** Ordered rules: first matching keyword in findingId (case-insensitive) wins. */
const SYSTEM_GROUP_RULES: Array<{ keywords: string[]; value: string }> = [
  { keywords: ["SWITCHBOARD", "MAIN_SWITCH", "SERVICE_FUSE", "MEN_LINK", "RCD_", "RCBO", "RCD_TEST"], value: "Switchboard" },
  { keywords: ["RCD", "RCBO", "TEST_BUTTON", "TRIP_TIME"], value: "RCD" },
  { keywords: ["GPO", "POWER_POINT", "OUTLET", "PLUG_", "SOCKET"], value: "GPO" },
  { keywords: ["CABLE", "WIRING", "INSULATION", "FLEXIBLE_LEAD", "TAPED_CONNECTION"], value: "Cabling" },
  { keywords: ["THERMAL", "HEAT_DAMAGE", "SURFACE_FEELS_ABNORMALLY", "OVERHEATING"], value: "Thermal" },
  { keywords: ["LIGHT", "LAMP", "FITTING", "CEILING", "EXTERIOR_LIGHT"], value: "Lighting" },
  { keywords: ["SMOKE_ALARM", "ALARM_SOUNDED", "TYPE_OBSERVED_PHOTOELECTRIC", "UNIT_TESTED_AS_INTERCONNECTED"], value: "Safety" },
  { keywords: ["COOKTOP", "OVEN", "RANGEHOOD", "RANGE_HOOD", "SUPPLY_CABLE_LOCATED", "DISHWASHER", "WASHING_MACHINE", "DRYER", "EXHAUST_FAN", "HEATED_TOWEL"], value: "Appliances" },
  { keywords: ["BATHROOM", "BATH_", "SHOWER", "SINK_", "WATER_TAP", "HORIZONTAL_DISTANCE", "WEATHERPROOF"], value: "Wet areas" },
  { keywords: ["ROOF_SPACE", "TRANSFORMER", "INSULATION_CONTACT"], value: "Roof space" },
  { keywords: ["ASBESTOS", "COVER_BROKEN", "CERAMIC_FUSE", "BAKELITE", "DAMAGE_CORROSION"], value: "Hazards" },
  { keywords: ["EXTENSION_LEAD", "POWER_BOARD", "NUMBER_OF_POWER"], value: "Portable" },
  { keywords: ["GARAGE_DOOR", "LOCATION_PHOTOGRAPHED", "MANUFACTURE_DATE", "ALL_CHECKLIST", "ALL_REQUIRED_PHOTOS", "NO_ADVICE", "LIMITATION"], value: "Other" },
];

/** Ordered rules: first matching keyword wins. */
const SPACE_GROUP_RULES: Array<{ keywords: string[]; value: string }> = [
  { keywords: ["EXTERIOR", "OUTDOOR", "ROOF_", "OUTSIDE"], value: "External" },
  { keywords: ["BATHROOM", "BATH_", "SHOWER", "KITCHEN", "SINK_", "COOKTOP", "OVEN", "RANGEHOOD"], value: "Internal" },
  { keywords: ["GARAGE", "ROOF_SPACE"], value: "Ancillary" },
  { keywords: ["SWITCHBOARD", "MAIN_SWITCH", "METER"], value: "Switchboard" },
  { keywords: ["POWER_POINT", "OUTLET", "LIGHT_", "GPO"], value: "General" },
];

/** Tag rules: all matching keywords add that tag (no first-match). */
const TAG_RULES: Array<{ keywords: string[]; tag: string }> = [
  { keywords: ["SAFETY", "ALARM", "RCD", "EARTH_PIN", "BURN_", "HEAT_DAMAGE", "ASBESTOS"], tag: "safety" },
  { keywords: ["COMPLIANCE", "LIABILITY", "MEN_", "LABEL", "CLEARANCE"], tag: "compliance" },
  { keywords: ["THERMAL", "HEAT_", "OVERHEAT", "SURFACE_FEELS"], tag: "thermal" },
  { keywords: ["WATER", "MOISTURE", "BATHROOM", "SINK", "WEATHERPROOF"], tag: "moisture" },
  { keywords: ["CABLE", "WIRING", "INSULATION", "DAMAGE_VISIBLE", "BARE_METAL"], tag: "cabling" },
  { keywords: ["SWITCHBOARD", "FUSE", "RCD", "RCBO"], tag: "switchboard" },
  { keywords: ["BUDGET", "CAPEX", "COST"], tag: "budget" },
  { keywords: ["IMMEDIATE", "URGENT", "CRITICAL"], tag: "urgent" },
];

/**
 * Classify a finding by ID. First-match for system_group and space_group; all matching tag rules applied.
 */
export function classifyFinding(findingId: string): FindingClassification {
  const idLower = findingId.trim();
  const idNorm = idLower.toUpperCase().replace(/-/g, "_");

  let system_group = "Other";
  for (const rule of SYSTEM_GROUP_RULES) {
    if (rule.keywords.some((k) => idNorm.includes(k))) {
      system_group = rule.value;
      break;
    }
  }

  let space_group = "General";
  for (const rule of SPACE_GROUP_RULES) {
    if (rule.keywords.some((k) => idNorm.includes(k))) {
      space_group = rule.value;
      break;
    }
  }

  const tags: string[] = [];
  const tagSet = new Set<string>();
  for (const rule of TAG_RULES) {
    if (rule.keywords.some((k) => idNorm.includes(k))) {
      if (!tagSet.has(rule.tag)) {
        tagSet.add(rule.tag);
        tags.push(rule.tag);
      }
    }
  }

  return { system_group, space_group, tags };
}
