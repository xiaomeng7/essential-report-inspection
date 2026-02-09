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
  { keywords: ["SWITCHBOARD", "MAIN_SWITCH", "SERVICE_FUSE", "BOARD_AT_CAPACITY", "NO_EXPANSION_MARGIN", "LABELING"], value: "switchboard" },
  { keywords: ["EARTH", "MEN_", "BONDING", "GROUND", "EARTH_DEGRADED", "EARTH_PIN"], value: "earthing" },
  { keywords: ["RCD", "RCBO", "TEST_BUTTON", "TRIP_TIME", "RCD_TEST", "NO_RCD_PROTECTION"], value: "rcd" },
  { keywords: ["LIGHT", "LAMP", "FITTING", "CEILING", "EXTERIOR_LIGHT", "SWITCH_ARCING"], value: "lighting" },
  { keywords: ["GPO", "POWER_POINT", "OUTLET", "PLUG_", "SOCKET", "GPO_EARTH_FAULT", "GPO_MECHANICAL"], value: "power" },
  { keywords: ["SMOKE_ALARM", "ALARM_SOUNDED", "TYPE_OBSERVED_PHOTOELECTRIC", "UNIT_TESTED_AS_INTERCONNECTED"], value: "smoke_alarm" },
  { keywords: ["ROOF_SPACE", "TRANSFORMER", "INSULATION_CONTACT", "ROOF_"], value: "roof_space" },
  { keywords: ["THERMAL", "HEAT_DAMAGE", "SURFACE_FEELS_ABNORMALLY", "OVERHEATING", "THERMAL_STRESS", "HOTSPOT"], value: "thermal" },
  { keywords: ["COOKTOP", "OVEN", "RANGEHOOD", "RANGE_HOOD", "SUPPLY_CABLE_LOCATED", "DISHWASHER", "WASHING_MACHINE", "DRYER", "EXHAUST_FAN", "HEATED_TOWEL"], value: "appliances" },
  { keywords: ["CABLE", "WIRING", "INSULATION", "FLEXIBLE_LEAD", "TAPED_CONNECTION", "BARE_METAL", "CABLE_DAMAGE"], value: "cabling" },
  { keywords: ["ASBESTOS", "COVER_BROKEN", "CERAMIC_FUSE", "BAKELITE", "DAMAGE_CORROSION"], value: "other" }, // Hazards -> other
  { keywords: ["EXTENSION_LEAD", "POWER_BOARD", "NUMBER_OF_POWER"], value: "other" }, // Portable -> other
  { keywords: ["GARAGE_DOOR", "LOCATION_PHOTOGRAPHED", "MANUFACTURE_DATE", "ALL_CHECKLIST", "ALL_REQUIRED_PHOTOS", "NO_ADVICE", "LIMITATION"], value: "other" },
];

/** Ordered rules: first matching keyword wins. */
const SPACE_GROUP_RULES: Array<{ keywords: string[]; value: string }> = [
  { keywords: ["KITCHEN", "COOKTOP", "OVEN", "RANGEHOOD", "DISHWASHER"], value: "kitchen" },
  { keywords: ["BATHROOM", "BATH_", "SHOWER", "SINK_", "WATER_TAP", "HEATED_TOWEL"], value: "bathroom" },
  { keywords: ["LIVING", "COMMON"], value: "living" },
  { keywords: ["BEDROOM", "BED_"], value: "bedroom" },
  { keywords: ["EXTERIOR", "OUTDOOR", "OUTSIDE"], value: "exterior" },
  { keywords: ["ROOF_SPACE", "ROOF_", "CEILING", "ATTIC", "VOID"], value: "roof_space" },
  { keywords: ["SWITCHBOARD", "MAIN_SWITCH", "METER", "METERBOX"], value: "switchboard_area" },
  { keywords: ["LAUNDRY", "WASHING_MACHINE", "DRYER"], value: "laundry" },
  { keywords: ["GARAGE", "CARPORT"], value: "garage" },
  { keywords: ["POWER_POINT", "OUTLET", "LIGHT_", "GPO"], value: "general" }, // Default fallback
];

/** Tag rules: all matching keywords add that tag (no first-match). */
const TAG_RULES: Array<{ keywords: string[]; tag: string }> = [
  { keywords: ["SAFETY", "ALARM", "RCD", "EARTH_PIN", "BURN_", "HEAT_DAMAGE", "ASBESTOS", "HAZARD"], tag: "safety" },
  { keywords: ["COMPLIANCE", "LIABILITY", "MEN_", "LABEL", "CLEARANCE", "NON_STANDARD"], tag: "compliance" },
  { keywords: ["THERMAL", "HEAT_", "OVERHEAT", "SURFACE_FEELS", "THERMAL_STRESS", "HOTSPOT"], tag: "thermal" },
  { keywords: ["WATER", "MOISTURE", "BATHROOM", "SINK", "WEATHERPROOF", "WET"], tag: "moisture" },
  { keywords: ["CABLE", "WIRING", "INSULATION", "DAMAGE_VISIBLE", "BARE_METAL", "CABLE_DAMAGE"], tag: "cabling" },
  { keywords: ["SWITCHBOARD", "FUSE", "BOARD", "MAIN_SWITCH"], tag: "switchboard" },
  { keywords: ["EARTH", "MEN_", "BONDING", "GROUND"], tag: "earthing" },
  { keywords: ["RCD", "RCBO", "RESIDUAL"], tag: "rcd" },
  { keywords: ["LIGHT", "LAMP", "FITTING", "SWITCH"], tag: "lighting" },
  { keywords: ["GPO", "POWER_POINT", "OUTLET", "SOCKET"], tag: "power" },
  { keywords: ["COOKTOP", "OVEN", "RANGEHOOD", "DISHWASHER", "WASHING_MACHINE", "DRYER", "APPLIANCE"], tag: "appliance" },
  { keywords: ["BUDGET", "CAPEX", "COST", "BUDGETARY"], tag: "budget" },
  { keywords: ["IMMEDIATE", "URGENT", "CRITICAL"], tag: "urgent" },
  { keywords: ["CERAMIC_FUSE", "BAKELITE", "LEGACY", "OLD"], tag: "legacy" },
  { keywords: ["ASBESTOS", "HAZARD", "DANGEROUS"], tag: "hazard" },
];

/**
 * Classify a finding by ID. First-match for system_group and space_group; all matching tag rules applied.
 */
export function classifyFinding(findingId: string): FindingClassification {
  const idLower = findingId.trim();
  const idNorm = idLower.toUpperCase().replace(/-/g, "_");

  let system_group = "other";
  for (const rule of SYSTEM_GROUP_RULES) {
    if (rule.keywords.some((k) => idNorm.includes(k))) {
      system_group = rule.value;
      break;
    }
  }

  let space_group = "general";
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
