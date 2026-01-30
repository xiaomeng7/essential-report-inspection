/**
 * Derive Findings from Raw Inspection Data (Backend Version)
 * 
 * Reads mappings/raw_to_finding_candidates.yml and evaluates conditions
 * against inspection.raw to generate findings array.
 * 
 * Supported condition operators:
 * - equals: field value equals the specified value
 * - not_equals: field value does not equal the specified value
 * - exists: field exists (not null/undefined)
 * - contains: field value contains the specified substring (for strings/arrays)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

// Get __dirname equivalent for ES modules
let __dirname: string;
try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else {
    __dirname = process.cwd();
  }
} catch (e) {
  console.warn("Could not determine __dirname from import.meta.url, using process.cwd()");
  __dirname = process.cwd();
}

/**
 * Finding derived from raw data
 */
export type DerivedFinding = {
  id: string;
  priority: string;
  title?: string;
};

/**
 * Condition rule from YAML
 */
type ConditionRule = {
  field: string;
  operator: "equals" | "not_equals" | "exists" | "contains";
  value: unknown;
};

/**
 * Finding rule from YAML
 */
type FindingRule = {
  id: string;
  priority?: string;
  title?: string;
  conditions: ConditionRule[];
};

/**
 * Extract value from Answer object (handles nested Answer objects)
 */
function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
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
 */
function getFieldValue(raw: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let current: unknown = raw;
  
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return extractValue(current);
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
    return value.some(item => {
      const itemStr = String(item);
      return itemStr.includes(searchStr);
    });
  }
  
  // For objects, check if any property value contains the search string
  if (typeof value === "object") {
    return Object.values(value).some(val => {
      const valStr = String(val);
      return valStr.includes(searchStr);
    });
  }
  
  return String(value).includes(searchStr);
}

/**
 * Evaluate a single condition against raw data
 */
function evaluateCondition(
  raw: Record<string, unknown>,
  condition: ConditionRule
): boolean {
  const fieldValue = getFieldValue(raw, condition.field);
  
  switch (condition.operator) {
    case "equals":
      // Use loose equality for comparison (handles type coercion)
      return fieldValue == condition.value;
    
    case "not_equals":
      return fieldValue != condition.value;
    
    case "exists":
      // If value is true, check existence; if false, check non-existence
      const exists = fieldExists(fieldValue);
      return condition.value === true ? exists : !exists;
    
    case "contains":
      return valueContains(fieldValue, condition.value);
    
    default:
      console.warn(`Unknown operator: ${condition.operator}`);
      return false;
  }
}

// Cache for finding rules
let findingRulesCache: FindingRule[] | null = null;

/**
 * Load finding rules from YAML file
 */
function loadFindingRules(): FindingRule[] {
  if (findingRulesCache) {
    return findingRulesCache;
  }
  
  const possiblePaths = [
    path.join(__dirname, "..", "..", "..", "mappings", "raw_to_finding_candidates.yml"),
    path.join(__dirname, "..", "..", "mappings", "raw_to_finding_candidates.yml"),
    path.join(process.cwd(), "mappings", "raw_to_finding_candidates.yml"),
    path.join(process.cwd(), "netlify", "functions", "mappings", "raw_to_finding_candidates.yml"),
    "/opt/build/repo/mappings/raw_to_finding_candidates.yml",
    "/opt/build/repo/netlify/functions/mappings/raw_to_finding_candidates.yml",
  ];
  
  for (const mappingPath of possiblePaths) {
    try {
      if (fs.existsSync(mappingPath)) {
        const content = fs.readFileSync(mappingPath, "utf8");
        const data = yaml.load(content) as { finding_rules?: FindingRule[] };
        if (data.finding_rules && Array.isArray(data.finding_rules)) {
          console.log(`✅ Loaded finding rules from: ${mappingPath}`);
          findingRulesCache = data.finding_rules;
          return findingRulesCache;
        }
      }
    } catch (e) {
      console.warn(`Failed to load finding rules from ${mappingPath}:`, e);
      continue;
    }
  }
  
  console.warn("⚠️ Could not load raw_to_finding_candidates.yml, using empty rules");
  findingRulesCache = [];
  return findingRulesCache;
}

/**
 * Derive findings from raw inspection data
 * 
 * @param raw Raw inspection data from inspection.raw
 * @returns Array of derived findings
 */
export function deriveFindings(raw: Record<string, unknown>): DerivedFinding[] {
  const rules = loadFindingRules();
  const findings: DerivedFinding[] = [];
  
  for (const rule of rules) {
    // All conditions must be met (AND logic)
    const allConditionsMet = rule.conditions.every(condition => 
      evaluateCondition(raw, condition)
    );
    
    if (allConditionsMet) {
      findings.push({
        id: rule.id,
        priority: rule.priority || "RECOMMENDED_0_3_MONTHS", // Default to RECOMMENDED if not specified
        title: rule.title,
      });
    }
  }
  
  return findings;
}

/**
 * Derive findings and merge with existing findings (avoid duplicates)
 * 
 * @param raw Raw inspection data
 * @param existingFindings Existing findings array
 * @returns Merged findings array without duplicates
 */
export function deriveAndMergeFindings(
  raw: Record<string, unknown>,
  existingFindings: Array<{ id: string }>
): DerivedFinding[] {
  const derived = deriveFindings(raw);
  const existingIds = new Set(existingFindings.map(f => f.id));
  
  // Only include derived findings that don't already exist
  return derived.filter(finding => !existingIds.has(finding.id));
}
