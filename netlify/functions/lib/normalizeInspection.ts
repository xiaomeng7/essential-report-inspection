/**
 * Normalize Inspection Data (Backend Version)
 * 
 * Maps raw inspection.raw fields to canonical field names using mappings/raw_to_canonical.yml
 * This provides a canonical layer to avoid direct dependency on raw field names in report generation code.
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
  return undefined;
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

// Cache for mappings
let mappingsCache: Record<string, { candidates: string[] }> | null = null;

/**
 * Load raw_to_canonical.yml mappings
 */
function loadMappings(): Record<string, { candidates: string[] }> {
  if (mappingsCache) {
    return mappingsCache;
  }
  
  const possiblePaths = [
    path.join(__dirname, "..", "..", "..", "mappings", "raw_to_canonical.yml"),
    path.join(__dirname, "..", "..", "mappings", "raw_to_canonical.yml"),
    path.join(process.cwd(), "mappings", "raw_to_canonical.yml"),
    path.join(process.cwd(), "netlify", "functions", "mappings", "raw_to_canonical.yml"),
    "/opt/build/repo/mappings/raw_to_canonical.yml",
    "/opt/build/repo/netlify/functions/mappings/raw_to_canonical.yml",
  ];
  
  for (const mappingPath of possiblePaths) {
    try {
      if (fs.existsSync(mappingPath)) {
        const content = fs.readFileSync(mappingPath, "utf8");
        const data = yaml.load(content) as { canonical_fields?: Record<string, { candidates: string[] }> };
        if (data.canonical_fields) {
          console.log(`✅ Loaded canonical mappings from: ${mappingPath}`);
          mappingsCache = data.canonical_fields;
          return mappingsCache;
        }
      }
    } catch (e) {
      console.warn(`Failed to load mappings from ${mappingPath}:`, e);
      continue;
    }
  }
  
  console.warn("⚠️ Could not load raw_to_canonical.yml, using empty mappings");
  mappingsCache = {};
  return mappingsCache;
}

/**
 * Canonical inspection data structure
 */
export type CanonicalInspection = {
  inspection_id: string;
  assessment_date: string;
  prepared_for: string;
  prepared_by: string;
  property_address: string;
  property_type: string;
  technician_notes: string;
  test_data: Record<string, unknown>;
};

/**
 * Normalize inspection raw data to canonical fields
 * 
 * @param raw Raw inspection data from inspection.raw
 * @param inspection_id Inspection ID (passed separately as it may not be in raw)
 * @returns Object with canonical fields and missingFields array
 */
export function normalizeInspection(
  raw: Record<string, unknown>,
  inspection_id: string
): { canonical: CanonicalInspection; missingFields: string[] } {
  const mappings = loadMappings();
  const canonical: Partial<CanonicalInspection> = {};
  const missingFields: string[] = [];
  
  // Process each canonical field
  for (const [canonicalField, mapping] of Object.entries(mappings)) {
    const candidates = mapping.candidates || [];
    let value: unknown = undefined;
    
    // Try each candidate key in order
    for (const candidateKey of candidates) {
      const candidateValue = getFieldValue(raw, candidateKey);
      if (candidateValue !== undefined && candidateValue !== null && candidateValue !== "") {
        value = candidateValue;
        break; // Found a value, stop searching
      }
    }
    
    // Handle special case: inspection_id (use provided parameter)
    if (canonicalField === "inspection_id") {
      value = inspection_id || value;
    }
    
    // Handle special case: assessment_date (format as date string)
    if (canonicalField === "assessment_date" && value) {
      try {
        const date = new Date(value as string);
        if (!isNaN(date.getTime())) {
          value = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
      } catch (e) {
        // Keep original value if date parsing fails
      }
    }
    
    // Set canonical value (use empty string or null instead of undefined)
    if (value === undefined) {
      // For test_data, preserve as empty object if not found
      if (canonicalField === "test_data") {
        (canonical as any)[canonicalField] = {};
      } else {
        (canonical as any)[canonicalField] = "";
        missingFields.push(canonicalField);
      }
    } else {
      // For test_data, preserve as object
      if (canonicalField === "test_data" && typeof value === "object" && value !== null) {
        (canonical as any)[canonicalField] = value;
      } else {
        (canonical as any)[canonicalField] = String(value);
      }
    }
  }
  
  // Ensure inspection_id is always set
  if (!canonical.inspection_id) {
    canonical.inspection_id = inspection_id || "";
  }
  
  // Ensure all required fields exist
  const result: CanonicalInspection = {
    inspection_id: canonical.inspection_id || inspection_id || "",
    assessment_date: canonical.assessment_date || "",
    prepared_for: canonical.prepared_for || "",
    prepared_by: canonical.prepared_by || "",
    property_address: canonical.property_address || "",
    property_type: canonical.property_type || "",
    technician_notes: canonical.technician_notes || "",
    test_data: canonical.test_data || {},
  };
  
  return { canonical: result, missingFields };
}

/**
 * Get a canonical field value (with type safety)
 */
export function getCanonicalField(
  canonical: CanonicalInspection,
  field: keyof CanonicalInspection
): string {
  const value = canonical[field];
  if (value === null || value === undefined) {
    return "";
  }
  if (field === "test_data") {
    return ""; // test_data is an object, not a string
  }
  return String(value);
}

/**
 * Get canonical test_data as object
 */
export function getCanonicalTestData(
  canonical: CanonicalInspection
): Record<string, unknown> {
  return canonical.test_data || {};
}
