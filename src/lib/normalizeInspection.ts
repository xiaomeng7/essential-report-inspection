/**
 * Normalize Inspection Data (Frontend Version)
 * 
 * Maps raw inspection.raw fields to canonical field names.
 * This provides a canonical layer to avoid direct dependency on raw field names in report generation code.
 * 
 * Based on INSPECTION_RAW_STRUCTURE.md structure.
 */

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
 */
function getFieldValue(raw: Record<string, unknown>, fieldPath: string): unknown {
  const parts = fieldPath.split(".");
  let current: unknown = raw;
  
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  
  return extractValue(current);
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
 * Normalization result
 */
export type NormalizeResult = {
  inspection_id: string;
  assessment_date: string;
  prepared_for: string;
  prepared_by: string;
  property_address: string;
  property_type: string;
  technician_notes: string;
  test_data: Record<string, unknown>;
  missing_fields: string[];
};

/**
 * Field mapping configuration
 * Maps canonical fields to candidate paths in raw data (in priority order)
 */
const FIELD_MAPPINGS: Record<string, string[]> = {
  inspection_id: [
    "inspection_id",
    "id",
  ],
  assessment_date: [
    "created_at",
    "assessment_date",
    "date",
    "timestamp",
  ],
  prepared_for: [
    "job.client_type",
    "job.prepared_for",
    "client.name",
    "client.client_type",
  ],
  prepared_by: [
    "signoff.technician_name",
    "technician.name",
    "technician_name",
    "prepared_by",
  ],
  property_address: [
    "job.address",
    "address",
    "property.address",
    "location.address",
  ],
  property_type: [
    "job.property_type",
    "property_type",
    "property.type",
  ],
  technician_notes: [
    "signoff.office_notes_internal",
    "access.notes",
    "notes",
    "technician_notes",
    "internal_notes",
  ],
  test_data: [
    // test_data is a composite object combining rcd_tests, gpo_tests, etc.
    // We'll build it from multiple sources
  ],
};

/**
 * Build test_data object from raw inspection data
 */
function buildTestData(raw: Record<string, unknown>): Record<string, unknown> {
  const testData: Record<string, unknown> = {};
  
  // Extract RCD tests
  const rcdTests = getFieldValue(raw, "rcd_tests");
  if (rcdTests && typeof rcdTests === "object" && rcdTests !== null) {
    testData.rcd_tests = rcdTests;
  }
  
  // Extract GPO tests
  const gpoTests = getFieldValue(raw, "gpo_tests");
  if (gpoTests && typeof gpoTests === "object" && gpoTests !== null) {
    testData.gpo_tests = gpoTests;
  }
  
  // Extract earthing data
  const earthing = getFieldValue(raw, "earthing");
  if (earthing && typeof earthing === "object" && earthing !== null) {
    testData.earthing = earthing;
  }
  
  // Extract thermal imaging
  const thermalImaging = getFieldValue(raw, "thermal_imaging");
  if (thermalImaging && typeof thermalImaging === "object" && thermalImaging !== null) {
    testData.thermal_imaging = thermalImaging;
  }
  
  // Extract access information (for test context)
  const access = getFieldValue(raw, "access");
  if (access && typeof access === "object" && access !== null) {
    testData.access = access;
  }
  
  return testData;
}

/**
 * Normalize inspection raw data to canonical fields
 * 
 * @param raw Raw inspection data from inspection.raw
 * @param inspection_id Inspection ID (passed separately as it may not be in raw)
 * @returns Normalized canonical data with missing_fields array
 */
export function normalizeInspection(
  raw: Record<string, unknown>,
  inspection_id: string
): NormalizeResult {
  const missingFields: string[] = [];
  
  // Helper to get a canonical field value
  const getCanonicalValue = (fieldName: string): string | Record<string, unknown> => {
    if (fieldName === "test_data") {
      const testData = buildTestData(raw);
      if (Object.keys(testData).length === 0) {
        missingFields.push(fieldName);
        return {};
      }
      return testData;
    }
    
    const candidates = FIELD_MAPPINGS[fieldName] || [];
    
    // Special handling for inspection_id
    if (fieldName === "inspection_id") {
      return inspection_id || "";
    }
    
    // Try each candidate path
    for (const candidatePath of candidates) {
      const value = getFieldValue(raw, candidatePath);
      if (value !== null && value !== undefined && value !== "") {
        // Handle assessment_date formatting
        if (fieldName === "assessment_date") {
          try {
            const date = new Date(value as string);
            if (!isNaN(date.getTime())) {
              return date.toISOString().split('T')[0]; // YYYY-MM-DD format
            }
          } catch (e) {
            // Keep original value if date parsing fails
          }
        }
        return String(value);
      }
    }
    
    // No value found
    missingFields.push(fieldName);
    return "";
  };
  
  // Build canonical object
  const canonical: NormalizeResult = {
    inspection_id: getCanonicalValue("inspection_id") as string,
    assessment_date: getCanonicalValue("assessment_date") as string,
    prepared_for: getCanonicalValue("prepared_for") as string,
    prepared_by: getCanonicalValue("prepared_by") as string,
    property_address: getCanonicalValue("property_address") as string,
    property_type: getCanonicalValue("property_type") as string,
    technician_notes: getCanonicalValue("technician_notes") as string,
    test_data: getCanonicalValue("test_data") as Record<string, unknown>,
    missing_fields: missingFields,
  };
  
  // Ensure inspection_id is always set
  if (!canonical.inspection_id) {
    canonical.inspection_id = inspection_id || "";
  }
  
  // Ensure all string fields are never undefined (use empty string or null)
  if (canonical.assessment_date === undefined) canonical.assessment_date = "";
  if (canonical.prepared_for === undefined) canonical.prepared_for = "";
  if (canonical.prepared_by === undefined) canonical.prepared_by = "";
  if (canonical.property_address === undefined) canonical.property_address = "";
  if (canonical.property_type === undefined) canonical.property_type = "";
  if (canonical.technician_notes === undefined) canonical.technician_notes = "";
  if (canonical.test_data === undefined) canonical.test_data = {};
  
  return canonical;
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
