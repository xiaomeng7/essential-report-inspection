/**
 * Test script for placeholder fallback strategy
 */

import { 
  ensureAllPlaceholders,
  validateReportDataAgainstPlaceholderMap,
  DEFAULT_PLACEHOLDER_VALUES,
  REQUIRED_PLACEHOLDERS,
  OPTIONAL_PLACEHOLDERS,
  type ReportData
} from "../src/reporting/placeholderMap";

// Mock the functions
function sanitizeText(input: unknown): string {
  if (input == null) return "";
  if (Array.isArray(input)) return input.map(item => sanitizeText(item)).join("\n");
  if (typeof input === "number" || typeof input === "boolean") return String(input);
  if (typeof input === "object") return String(input);
  if (typeof input === "string") {
    let sanitized = input.replace(/\u00A0/g, " ");
    sanitized = sanitized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
    return sanitized;
  }
  return String(input);
}

const REQUIRED_KEYS = [
  "PROPERTY_ADDRESS",
  "PREPARED_FOR",
  "ASSESSMENT_DATE",
  "PREPARED_BY",
  "INSPECTION_ID",
  "OVERALL_STATUS_BADGE",
  "EXECUTIVE_DECISION_SIGNALS",
  "CAPEX_SNAPSHOT",
  "TERMS_AND_CONDITIONS",
  "REPORT_BODY_HTML",
] as const;

const DEFAULT_PLACEHOLDER_VALUES: Record<string, string> = {
  PROPERTY_ADDRESS: "-",
  PREPARED_FOR: "-",
  ASSESSMENT_DATE: "-",
  PREPARED_BY: "-",
  INSPECTION_ID: "-",
  OVERALL_STATUS_BADGE: "🟡 Moderate",
  EXECUTIVE_DECISION_SIGNALS: "• No immediate safety hazards detected.",
  CAPEX_SNAPSHOT: "AUD $0 – $0",
  TERMS_AND_CONDITIONS: "Terms and conditions apply.",
  REPORT_BODY_HTML: "",
};

function applyPlaceholderFallback<T extends Record<string, any>>(data: T): Record<string, string> {
  const result: Record<string, string> = {};
  
  // First, convert all existing values to strings
  for (const [key, value] of Object.entries(data)) {
    if (value == null) {
      result[key] = "";
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => sanitizeText(item)).join("\n");
    } else if (typeof value === "object") {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = sanitizeText(value);
    }
  }
  
  // Then, ensure all required keys exist with non-empty values
  for (const key of REQUIRED_KEYS) {
    if (!(key in result) || result[key] === "" || result[key] == null) {
      result[key] = DEFAULT_PLACEHOLDER_VALUES[key] || "-";
      console.log(`  ⚠️ Placeholder ${key} was missing or empty, using default`);
    }
  }
  
  return result;
}

console.log("=== Testing Placeholder Fallback Strategy ===\n");

// Test 1: Complete data (should pass through)
console.log("Test 1: Complete data");
const test1 = {
  PROPERTY_ADDRESS: "123 Main St",
  PREPARED_FOR: "John Doe",
  ASSESSMENT_DATE: "2026-01-29",
  PREPARED_BY: "Tech Name",
  INSPECTION_ID: "TEST-001",
  OVERALL_STATUS_BADGE: "🟢 Low",
  EXECUTIVE_DECISION_SIGNALS: "• Test signals",
  CAPEX_SNAPSHOT: "AUD $1000 – $5000",
  TERMS_AND_CONDITIONS: "Test terms",
  REPORT_BODY_HTML: "<p>Test HTML</p>",
};
const result1 = applyPlaceholderFallback(test1);
console.log("  All required keys present:", REQUIRED_KEYS.every(k => k in result1) ? "✅" : "❌");
console.log("  No undefined values:", Object.values(result1).every(v => v !== undefined) ? "✅" : "❌");
console.log("");

// Test 2: Missing keys (should add defaults)
console.log("Test 2: Missing keys");
const test2 = {
  PROPERTY_ADDRESS: "123 Main St",
  PREPARED_FOR: "John Doe",
  // Missing ASSESSMENT_DATE, PREPARED_BY, etc.
};
const result2 = applyPlaceholderFallback(test2);
console.log("  Missing keys filled:", REQUIRED_KEYS.every(k => k in result2) ? "✅" : "❌");
console.log("  ASSESSMENT_DATE default:", result2.ASSESSMENT_DATE === "-" ? "✅" : "❌");
console.log("  PREPARED_BY default:", result2.PREPARED_BY === "-" ? "✅" : "❌");
console.log("");

// Test 3: Empty/null values (should use defaults)
console.log("Test 3: Empty/null values");
const test3 = {
  PROPERTY_ADDRESS: "",
  PREPARED_FOR: null,
  ASSESSMENT_DATE: undefined,
  OVERALL_STATUS_BADGE: "   ", // Only whitespace
};
const result3 = applyPlaceholderFallback(test3);
console.log("  Empty values replaced:", result3.PROPERTY_ADDRESS !== "" ? "✅" : "❌");
console.log("  Null values replaced:", result3.PREPARED_FOR !== null && result3.PREPARED_FOR !== "" ? "✅" : "❌");
console.log("  Undefined values replaced:", result3.ASSESSMENT_DATE !== undefined ? "✅" : "❌");
console.log("");

// Test 4: Non-string values (should convert to string)
console.log("Test 4: Non-string values");
const test4 = {
  PROPERTY_ADDRESS: 12345,
  PREPARED_FOR: true,
  ASSESSMENT_DATE: ["2026", "01", "29"],
  CAPEX_SNAPSHOT: { low: 1000, high: 5000 },
};
const result4 = applyPlaceholderFallback(test4);
console.log("  Number converted:", typeof result4.PROPERTY_ADDRESS === "string" ? "✅" : "❌");
console.log("  Boolean converted:", typeof result4.PREPARED_FOR === "string" ? "✅" : "❌");
console.log("  Array converted:", typeof result4.ASSESSMENT_DATE === "string" ? "✅" : "❌");
console.log("  Object converted:", typeof result4.CAPEX_SNAPSHOT === "string" ? "✅" : "❌");
console.log("");

// Test 5: All values are strings
console.log("Test 5: All values are strings");
const test5 = {
  PROPERTY_ADDRESS: "123 Main St",
  PREPARED_FOR: "John Doe",
  ASSESSMENT_DATE: "2026-01-29",
  NUMBER_FIELD: 123,
  BOOLEAN_FIELD: true,
  ARRAY_FIELD: [1, 2, 3],
  OBJECT_FIELD: { a: 1 },
};
const result5 = applyPlaceholderFallback(test5);
const allStrings = Object.values(result5).every(v => typeof v === "string");
console.log("  All values are strings:", allStrings ? "✅" : "❌");
console.log("");

// Test 6: Test validateReportDataAgainstPlaceholderMap
console.log("Test 6: Test validateReportDataAgainstPlaceholderMap");
const test6 = {
  PROPERTY_ADDRESS: "123 Main St",
  PREPARED_FOR: "John Doe",
  // Missing ASSESSMENT_DATE, INSPECTION_ID, etc.
};
const validation6 = validateReportDataAgainstPlaceholderMap(test6);
console.log("  Missing required:", validation6.missingRequired.length > 0 ? "✅" : "❌");
console.log("  Missing optional:", validation6.missingOptional.length > 0 ? "✅" : "❌");
console.log("  Required fields:", validation6.missingRequired.join(", "));
console.log("");

// Test 7: Test ensureAllPlaceholders with validation
console.log("Test 7: Test ensureAllPlaceholders with validation");
const test7 = {
  PROPERTY_ADDRESS: "123 Main St",
  PREPARED_FOR: "John Doe",
  TERMS_AND_CONDITIONS: "Custom terms text",
  // Missing other required fields
};
const result7 = ensureAllPlaceholders(test7);
const validation7 = validateReportDataAgainstPlaceholderMap(result7);
console.log("  All required fields present:", validation7.missingRequired.length === 0 ? "✅" : "❌");
console.log("  TERMS_AND_CONDITIONS preserved:", result7.TERMS_AND_CONDITIONS === "Custom terms text" ? "✅" : "❌");
console.log("  TERMS_AND_CONDITIONS_TEXT synced:", result7.TERMS_AND_CONDITIONS_TEXT === "Custom terms text" ? "✅" : "❌");
console.log("");

// Test 8: Test Terms & Conditions mapping
console.log("Test 8: Test Terms & Conditions mapping");
const test8 = {
  TERMS_AND_CONDITIONS: "Test Terms Content",
};
const result8 = ensureAllPlaceholders(test8);
console.log("  TERMS_AND_CONDITIONS:", result8.TERMS_AND_CONDITIONS !== "" && result8.TERMS_AND_CONDITIONS !== undefined ? "✅" : "❌");
console.log("  TERMS_AND_CONDITIONS_TEXT:", result8.TERMS_AND_CONDITIONS_TEXT === result8.TERMS_AND_CONDITIONS ? "✅" : "❌");
console.log("");

// Test 9: Test no undefined values
console.log("Test 9: Test no undefined values");
const test9 = {
  PROPERTY_ADDRESS: "123 Main St",
  PREPARED_FOR: "John Doe",
};
const result9 = ensureAllPlaceholders(test9);
const hasUndefined = Object.values(result9).some(v => v === undefined);
console.log("  No undefined values:", !hasUndefined ? "✅" : "❌");
console.log("  All values are strings:", Object.values(result9).every(v => typeof v === "string") ? "✅" : "❌");
console.log("");

console.log("✅ All placeholder fallback tests completed!");
