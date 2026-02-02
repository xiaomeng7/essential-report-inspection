/**
 * Derive Findings from Raw Inspection Data (Frontend Version)
 * 
 * Evaluates conditions against inspection.raw to generate findings array.
 * Based on mappings/raw_to_finding_candidates.yml structure.
 * 
 * This function only determines IF a finding should be triggered, not the report text.
 */

/**
 * Finding derived from raw data
 */
export type DerivedFinding = {
  id: string;
  priority: string;
};

/**
 * Condition rule structure
 */
type ConditionRule = {
  field: string;
  condition: "equals" | "not_equals" | "exists" | "contains" | "not_contains" | "greater_than" | "less_than";
  value?: unknown;
  compare_field?: string; // For comparing two fields
};

/**
 * Finding rule structure
 */
type FindingRule = {
  finding_id: string;
  priority: "IMMEDIATE" | "RECOMMENDED_0_3_MONTHS" | "PLAN_MONITOR";
  when: ConditionRule;
};

/**
 * Extract value from Answer object (handles nested Answer objects)
 * Raw structure: { "value": ..., "status": "answered" }
 */
function extractValue(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    const answerValue = (v as { value: unknown }).value;
    if (typeof answerValue === "object" && answerValue !== null && "value" in (answerValue as object)) {
      return extractValue(answerValue);
    }
    return answerValue;
  }
  return v;
}

/**
 * Get field value from raw object by path (e.g., "job.address")
 * Supports array indexing: "rcd_tests.exceptions[].result"
 */
function getFieldValue(raw: Record<string, unknown>, fieldPath: string): unknown[] {
  const parts = fieldPath.split(".");
  let current: unknown = raw;
  const results: unknown[] = [];
  
  // Handle array notation like "exceptions[].result"
  const arrayMatch = fieldPath.match(/^(.+)\[\]\.(.+)$/);
  if (arrayMatch) {
    const [, arrayPath, itemField] = arrayMatch;
    const arrayParts = arrayPath.split(".");
    let arrayCurrent: unknown = raw;
    
    for (const part of arrayParts) {
      if (arrayCurrent == null || typeof arrayCurrent !== "object") return [];
      arrayCurrent = (arrayCurrent as Record<string, unknown>)[part];
    }
    
    const arrayValue = extractValue(arrayCurrent);
    if (Array.isArray(arrayValue)) {
      return arrayValue.map(item => {
        if (typeof item === "object" && item !== null) {
          return extractValue((item as Record<string, unknown>)[itemField]);
        }
        return null;
      }).filter(v => v !== null);
    }
    return [];
  }
  
  // Regular path traversal
  for (const part of parts) {
    if (current == null || typeof current !== "object") return [];
    current = (current as Record<string, unknown>)[part];
  }
  
  const value = extractValue(current);
  if (value !== null && value !== undefined) {
    results.push(value);
  }
  
  return results;
}

/**
 * Check if a value exists (not null/undefined)
 */
function fieldExists(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/**
 * Check if a value contains a substring (for strings) or includes an element (for arrays)
 */
function valueContains(value: unknown, search: unknown): boolean {
  if (value == null || search == null) return false;
  
  const searchStr = String(search);
  
  if (typeof value === "string") {
    return value.includes(searchStr);
  }
  
  if (Array.isArray(value)) {
    return value.some(item => String(item) === searchStr || String(item).includes(searchStr));
  }
  
  return String(value).includes(searchStr);
}

/**
 * Evaluate a single condition against raw data
 */
function evaluateCondition(
  raw: Record<string, unknown>,
  rule: ConditionRule
): boolean {
  const fieldValues = getFieldValue(raw, rule.field);
  
  // For array fields, check if ANY element matches
  if (fieldValues.length === 0) {
    return false;
  }
  
  // Handle compare_field (comparing two fields)
  if (rule.compare_field) {
    const compareValues = getFieldValue(raw, rule.compare_field);
    if (compareValues.length === 0) return false;
    
    const fieldVal = fieldValues[0];
    const compareVal = compareValues[0];
    
    if (rule.condition === "less_than") {
      return Number(fieldVal) < Number(compareVal);
    }
    if (rule.condition === "greater_than") {
      return Number(fieldVal) > Number(compareVal);
    }
    return false;
  }
  
  // Check if ANY value in the array matches the condition
  return fieldValues.some(fieldValue => {
    switch (rule.condition) {
      case "equals":
        // Use loose equality for comparison (handles type coercion)
        return fieldValue == rule.value;
      
      case "not_equals":
        return fieldValue != rule.value;
      
      case "exists":
        const exists = fieldExists(fieldValue);
        return rule.value === true ? exists : !exists;
      
      case "contains":
        return valueContains(fieldValue, rule.value);
      
      case "not_contains":
        if (Array.isArray(fieldValue)) {
          return !fieldValue.some(item => String(item) === String(rule.value));
        }
        return !valueContains(fieldValue, rule.value);
      
      case "greater_than":
        return Number(fieldValue) > Number(rule.value);
      
      case "less_than":
        return Number(fieldValue) < Number(rule.value);
      
      default:
        console.warn(`Unknown condition: ${rule.condition}`);
        return false;
    }
  });
}

/**
 * Hardcoded finding rules based on mappings/raw_to_finding_candidates.yml
 * Frontend version doesn't read files, so rules are embedded here
 */
const FINDING_RULES: FindingRule[] = [
  // Switchboard
  { finding_id: "ASBESTOS_RISK", priority: "IMMEDIATE", when: { field: "switchboard.asbestos_suspected", condition: "equals", value: "yes" } },
  { finding_id: "THERMAL_STRESS_ACTIVE", priority: "IMMEDIATE", when: { field: "switchboard.signs_of_overheating", condition: "equals", value: "yes" } },
  { finding_id: "ARCING_EVIDENCE_PRESENT", priority: "IMMEDIATE", when: { field: "switchboard.burn_marks_or_carbon", condition: "equals", value: "yes" } },
  { finding_id: "MATERIAL_DEGRADATION", priority: "IMMEDIATE", when: { field: "switchboard.water_ingress", condition: "equals", value: "yes" } },
  { finding_id: "BOARD_AT_CAPACITY", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "switchboard.board_at_capacity", condition: "equals", value: true } },
  { finding_id: "NO_EXPANSION_MARGIN", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "switchboard.spare_ways_available", condition: "equals", value: "no" } },
  { finding_id: "LABELING_POOR", priority: "PLAN_MONITOR", when: { field: "switchboard.labelling_quality", condition: "equals", value: "poor" } },
  { finding_id: "NON_STANDARD_WORK", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "switchboard.non_standard_or_diy_observed", condition: "equals", value: true } },
  { finding_id: "NO_RCD_PROTECTION", priority: "IMMEDIATE", when: { field: "switchboard.protection_types_present", condition: "not_contains", value: "rcd" } },
  { finding_id: "NO_RCD_PROTECTION", priority: "IMMEDIATE", when: { field: "switchboard.protection_types_present", condition: "not_contains", value: "rcbo" } },
  
  // RCD Tests
  { finding_id: "NO_RCD_PROTECTION", priority: "IMMEDIATE", when: { field: "rcd_tests.performed", condition: "equals", value: false } },
  { finding_id: "RCD_TEST_FAIL_OR_UNSTABLE", priority: "IMMEDIATE", when: { field: "rcd_tests.exceptions[].result", condition: "equals", value: "fail" } },
  { finding_id: "RCD_TRIP_TIME_SLOW", priority: "IMMEDIATE", when: { field: "rcd_tests.exceptions[].trip_time_ms", condition: "greater_than", value: 300 } },
  
  // GPO Tests (GPO_MECHANICAL_LOOSE is derived from per-room table when room has issue loose/no_power etc.; no separate checkbox)
  { finding_id: "DAMAGED_OUTLET_OR_SWITCH", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "gpo_tests.exceptions[].issue_type", condition: "equals", value: "damaged" } },
  { finding_id: "GPO_EARTH_FAULT", priority: "IMMEDIATE", when: { field: "gpo_tests.exceptions[].issue_type", condition: "equals", value: "no_earth" } },
  { finding_id: "POLARITY_ISSUE_DETECTED", priority: "IMMEDIATE", when: { field: "gpo_tests.summary.polarity_pass", condition: "less_than", compare_field: "gpo_tests.summary.total_gpo_tested" } },
  
  // Earthing
  { finding_id: "MEN_NOT_VERIFIED", priority: "IMMEDIATE", when: { field: "earthing.men_link_confirmed", condition: "equals", value: "no" } },
  { finding_id: "EARTH_DEGRADED", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "earthing.main_earth_conductor_intact", condition: "equals", value: "no" } },
  { finding_id: "EARTHING_RESISTANCE_HIGH", priority: "IMMEDIATE", when: { field: "earthing.earthing_resistance_measured", condition: "greater_than", value: 1.0 } },
  { finding_id: "BONDING_TO_WATER_GAS_NOT_VERIFIED", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "earthing.bonding_water_gas_verified", condition: "equals", value: "no" } },
  
  // Lighting
  { finding_id: "FITTING_OVERHEAT", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "lighting.issues_observed", condition: "equals", value: "heat_damage" } },
  { finding_id: "LIGHT_FITTING_NONCOMPLIANT_OR_UNSAFE", priority: "IMMEDIATE", when: { field: "lighting.fittings_noncompliant", condition: "equals", value: true } },
  
  // Smoke Alarms
  { finding_id: "SMOKE_ALARMS_MISSING", priority: "IMMEDIATE", when: { field: "smoke_alarms.present", condition: "equals", value: false } },
  { finding_id: "SMOKE_ALARMS_EXPIRED", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "smoke_alarms.expired", condition: "equals", value: true } },
  { finding_id: "SMOKE_ALARMS_NOT_INTERCONNECTED", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "smoke_alarms.interconnected", condition: "equals", value: false } },
  { finding_id: "SMOKE_ALARMS_LOCATION_NONCOMPLIANT_SUSPECTED", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "smoke_alarms.location_compliant", condition: "equals", value: "no" } },
  
  // Thermal Imaging
  { finding_id: "THERMAL_NOT_PERFORMED", priority: "PLAN_MONITOR", when: { field: "thermal_imaging.performed", condition: "equals", value: false } },
  { finding_id: "THERMAL_HOTSPOT_DETECTED_MINOR", priority: "RECOMMENDED_0_3_MONTHS", when: { field: "thermal_imaging.hotspots_detected", condition: "equals", value: "minor" } },
  { finding_id: "THERMAL_HOTSPOT_DETECTED_MAJOR", priority: "IMMEDIATE", when: { field: "thermal_imaging.hotspots_detected", condition: "equals", value: "major" } },
  
  // Assets
  { finding_id: "BATTERY_THERMAL", priority: "IMMEDIATE", when: { field: "assets.battery_thermal", condition: "equals", value: true } },
  // EV_UNSEGREGATED_LOAD requires combined condition (handled below)
  
  // Access Limitations
  { finding_id: "ACCESS_LIMITATION_ROOF_VOID_NOT_ACCESSED", priority: "PLAN_MONITOR", when: { field: "access.roof_accessible", condition: "equals", value: false } },
  { finding_id: "ACCESS_LIMITATION_SUBFLOOR_NOT_ACCESSED", priority: "PLAN_MONITOR", when: { field: "access.underfloor_accessible", condition: "equals", value: false } },
  { finding_id: "ACCESS_LIMITATION_SUBFLOOR_NOT_ACCESSED", priority: "PLAN_MONITOR", when: { field: "access.underfloor_accessible", condition: "equals", value: "not_accessible" } },
];

/**
 * Derive findings from raw inspection data
 * 
 * @param raw Raw inspection data from inspection.raw
 * @returns Array of derived findings with id and priority only
 */
export function deriveFindings(raw: Record<string, unknown>): DerivedFinding[] {
  const findings: DerivedFinding[] = [];
  const foundIds = new Set<string>(); // Avoid duplicates
  
  // Evaluate each rule
  for (const rule of FINDING_RULES) {
    // Skip if already found (avoid duplicates)
    if (foundIds.has(rule.finding_id)) {
      continue;
    }
    
    // Evaluate condition
    if (evaluateCondition(raw, rule.when)) {
      findings.push({
        id: rule.finding_id,
        priority: rule.priority,
      });
      foundIds.add(rule.finding_id);
    }
  }
  
  // Handle special combined conditions
  
  // EV_UNSEGREGATED_LOAD: requires assets.has_ev_charger === true AND assets.ev_charger_segregated === false
  const hasEvCharger = getFieldValue(raw, "assets.has_ev_charger")[0];
  const evChargerSegregated = getFieldValue(raw, "assets.ev_charger_segregated")[0];
  if (hasEvCharger === true && evChargerSegregated === false && !foundIds.has("EV_UNSEGREGATED_LOAD")) {
    findings.push({
      id: "EV_UNSEGREGATED_LOAD",
      priority: "IMMEDIATE",
    });
    foundIds.add("EV_UNSEGREGATED_LOAD");
  }
  
  // TEST_DATA_INCOMPLETE: requires rcd_tests.performed === false AND gpo_tests.performed === false
  const rcdPerformed = getFieldValue(raw, "rcd_tests.performed")[0];
  const gpoPerformed = getFieldValue(raw, "gpo_tests.performed")[0];
  if (rcdPerformed === false && gpoPerformed === false && !foundIds.has("TEST_DATA_INCOMPLETE")) {
    findings.push({
      id: "TEST_DATA_INCOMPLETE",
      priority: "PLAN_MONITOR",
    });
    foundIds.add("TEST_DATA_INCOMPLETE");
  }
  
  return findings;
}
