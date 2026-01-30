/**
 * Single Source of Truth: Placeholder Map for Word Template
 * 
 * This file defines all placeholders used in Gold_Sample_Ideal_Report_Template.docx
 * and provides default values to ensure no placeholder renders as "undefined".
 */

/**
 * Complete ReportData type matching all placeholders in the Word template
 * All fields are strings to ensure compatibility with Docxtemplater
 */
export type ReportData = {
  // Page 1 – Cover
  PROPERTY_ADDRESS: string;
  CLIENT_NAME: string; // Alias for PREPARED_FOR
  PREPARED_FOR: string; // Primary field name
  ASSESSMENT_DATE: string;
  REPORT_ID: string; // Alias for INSPECTION_ID
  INSPECTION_ID: string; // Primary field name
  REPORT_VERSION: string;
  PREPARED_BY: string;
  
  // Page 2 – Purpose & How to Read
  PURPOSE_PARAGRAPH: string;
  HOW_TO_READ_TEXT: string; // Alias for HOW_TO_READ_PARAGRAPH
  HOW_TO_READ_PARAGRAPH: string; // Primary field name
  WHAT_THIS_MEANS_TEXT: string; // Alias for HOW_TO_READ_PARAGRAPH
  
  // Page 3 – Executive Summary
  OVERALL_STATUS_BADGE: string;
  EXEC_SUMMARY_TEXT: string; // Alias for EXECUTIVE_DECISION_SIGNALS
  EXECUTIVE_DECISION_SIGNALS: string; // Primary field name
  EXECUTIVE_SUMMARY: string; // Alternative format
  CAPEX_SNAPSHOT: string;
  
  // Page 4 – Priority Overview
  PRIORITY_TABLE_ROWS: string;
  
  // Page 5 – Scope & Limitations
  SCOPE_TEXT: string; // Alias for SCOPE_SECTION
  SCOPE_SECTION: string; // Primary field name
  LIMITATIONS_SECTION: string;
  
  // Pages 6–10 – Observed Conditions (Dynamic Finding Pages)
  DYNAMIC_FINDING_PAGES: string; // Markdown/Text format
  DYNAMIC_FINDING_PAGES_HTML: string; // HTML format (if needed)
  
  // Page 11 – Thermal Imaging
  THERMAL_METHOD: string;
  THERMAL_FINDINGS: string;
  THERMAL_VALUE_STATEMENT: string;
  
  // Page 12 – CapEx Roadmap
  CAPEX_TABLE_ROWS: string;
  CAPEX_DISCLAIMER_LINE: string;
  
  // Page 13 – Decision Pathways
  DECISION_PATHWAYS_TEXT: string; // Alias for DECISION_PATHWAYS_SECTION
  DECISION_PATHWAYS_SECTION: string; // Primary field name
  
  // Page 14 – Terms & Conditions
  TERMS_AND_CONDITIONS_TEXT: string; // Alias for TERMS_AND_CONDITIONS
  TERMS_AND_CONDITIONS: string; // Primary field name
  
  // Page 15 – Closing
  CLOSING_STATEMENT: string;
  
  // Additional sections
  METHODOLOGY_TEXT: string;
  RISK_FRAMEWORK_TEXT: string;
  APPENDIX_TEST_NOTES_TEXT: string; // Alias for TEST_SUMMARY or TECHNICAL_NOTES
  TEST_SUMMARY: string;
  TECHNICAL_NOTES: string;
  
  // Additional metadata (for compatibility)
  OVERALL_STATUS: string;
  RISK_RATING: string;
  CAPEX_RANGE: string;
  REPORT_BODY_HTML: string; // Full HTML report body (if using HTML-based template)
};

/**
 * Default values for all placeholders
 * These ensure no placeholder ever renders as "undefined"
 */
export const DEFAULT_PLACEHOLDER_VALUES: ReportData = {
  // Page 1 – Cover
  PROPERTY_ADDRESS: "-",
  CLIENT_NAME: "-",
  PREPARED_FOR: "-",
  ASSESSMENT_DATE: "-",
  REPORT_ID: "-",
  INSPECTION_ID: "-",
  REPORT_VERSION: "1.0",
  PREPARED_BY: "-",
  
  // Page 2 – Purpose & How to Read
  PURPOSE_PARAGRAPH: "This report provides a comprehensive assessment of the electrical condition of the property, identifying safety concerns, compliance issues, and maintenance recommendations based on a visual inspection and electrical testing performed in accordance with applicable standards.",
  HOW_TO_READ_TEXT: "This report is a decision-support document designed to assist property owners, investors, and asset managers in understanding the electrical risk profile of the property and planning for future capital expenditure.",
  HOW_TO_READ_PARAGRAPH: "This report is a decision-support document designed to assist property owners, investors, and asset managers in understanding the electrical risk profile of the property and planning for future capital expenditure.",
  WHAT_THIS_MEANS_TEXT: "This report is a decision-support document designed to assist property owners, investors, and asset managers in understanding the electrical risk profile of the property and planning for future capital expenditure.",
  
  // Page 3 – Executive Summary
  OVERALL_STATUS_BADGE: "🟡 Moderate",
  EXEC_SUMMARY_TEXT: "• No immediate safety hazards detected. Conditions can be managed within standard asset planning cycles.",
  EXECUTIVE_DECISION_SIGNALS: "• No immediate safety hazards detected. Conditions can be managed within standard asset planning cycles.",
  EXECUTIVE_SUMMARY: "This property presents a moderate electrical risk profile at the time of inspection.",
  CAPEX_SNAPSHOT: "AUD $0 – $0",
  
  // Page 4 – Priority Overview
  PRIORITY_TABLE_ROWS: "",
  
  // Page 5 – Scope & Limitations
  SCOPE_TEXT: "This assessment is non-invasive and limited to accessible areas only.",
  SCOPE_SECTION: "This assessment is non-invasive and limited to accessible areas only.",
  LIMITATIONS_SECTION: "Areas that are concealed, locked, or otherwise inaccessible were not inspected.",
  
  // Pages 6–10 – Observed Conditions
  DYNAMIC_FINDING_PAGES: "No findings were identified during this assessment.",
  DYNAMIC_FINDING_PAGES_HTML: "<p>No findings were identified during this assessment.</p>",
  
  // Page 11 – Thermal Imaging
  THERMAL_METHOD: "Thermal imaging was performed using non-invasive infrared technology to identify potential electrical issues.",
  THERMAL_FINDINGS: "No significant thermal anomalies were detected during the inspection.",
  THERMAL_VALUE_STATEMENT: "Thermal imaging provides valuable non-invasive decision support for risk identification.",
  
  // Page 12 – CapEx Roadmap
  CAPEX_TABLE_ROWS: "",
  CAPEX_DISCLAIMER_LINE: "Provided for financial provisioning only. Not a quotation or scope of works.",
  
  // Page 13 – Decision Pathways
  DECISION_PATHWAYS_TEXT: "This report provides a framework for managing risk, not removing it.",
  DECISION_PATHWAYS_SECTION: "This report provides a framework for managing risk, not removing it.",
  
  // Page 14 – Terms & Conditions
  TERMS_AND_CONDITIONS_TEXT: "Terms and conditions apply. Please refer to the full terms document.",
  TERMS_AND_CONDITIONS: "Terms and conditions apply. Please refer to the full terms document.",
  
  // Page 15 – Closing
  CLOSING_STATEMENT: "For questions or clarifications regarding this report, please contact the inspection provider.",
  
  // Additional sections
  METHODOLOGY_TEXT: "This assessment is based on a visual inspection and limited electrical testing of accessible areas only.",
  RISK_FRAMEWORK_TEXT: "Risks are assessed based on safety, compliance, and escalation factors, with priority classifications ranging from immediate action required to acceptable for ongoing monitoring.",
  APPENDIX_TEST_NOTES_TEXT: "Test data and technical notes are provided in the appendix section.",
  TEST_SUMMARY: "Test data and technical notes are provided in the appendix section.",
  TECHNICAL_NOTES: "Technical notes and limitations are documented throughout this report.",
  
  // Additional metadata
  OVERALL_STATUS: "MODERATE RISK",
  RISK_RATING: "MODERATE",
  CAPEX_RANGE: "To be confirmed",
  REPORT_BODY_HTML: "",
};

/**
 * List of all placeholder keys (for validation)
 */
export const ALL_PLACEHOLDER_KEYS = Object.keys(DEFAULT_PLACEHOLDER_VALUES) as Array<keyof ReportData>;

/**
 * Required placeholders that must have non-empty values
 * These are critical fields that should never be empty or undefined
 */
export const REQUIRED_PLACEHOLDERS: Array<keyof ReportData> = [
  "PROPERTY_ADDRESS",
  "PREPARED_FOR",
  "ASSESSMENT_DATE",
  "INSPECTION_ID",
  "PREPARED_BY",
  "OVERALL_STATUS_BADGE",
  "EXECUTIVE_DECISION_SIGNALS",
  "CAPEX_SNAPSHOT",
  "TERMS_AND_CONDITIONS",
  "DYNAMIC_FINDING_PAGES",
  "CLOSING_STATEMENT",
] as const;

/**
 * Optional placeholders that can be empty strings
 * These are fields that may not always have content
 */
export const OPTIONAL_PLACEHOLDERS: Array<keyof ReportData> = [
  "PRIORITY_TABLE_ROWS",
  "CAPEX_TABLE_ROWS",
  "REPORT_BODY_HTML",
  "DYNAMIC_FINDING_PAGES_HTML",
] as const;

/**
 * Validate report data against placeholder map
 * Returns lists of missing required and optional placeholders
 */
export function validateReportDataAgainstPlaceholderMap(
  data: Partial<ReportData>
): { missingRequired: string[]; missingOptional: string[] } {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  
  // Check all placeholders
  for (const key of ALL_PLACEHOLDER_KEYS) {
    const value = data[key];
    const isEmpty = value === undefined || value === null || value === "";
    
    if (REQUIRED_PLACEHOLDERS.includes(key)) {
      if (isEmpty) {
        missingRequired.push(key);
      }
    } else if (OPTIONAL_PLACEHOLDERS.includes(key)) {
      if (isEmpty) {
        missingOptional.push(key);
      }
    } else {
      // Other fields should have values but are not strictly required
      if (isEmpty) {
        missingOptional.push(key);
      }
    }
  }
  
  return { missingRequired, missingOptional };
}

/**
 * Ensure all required placeholders are present and non-empty
 * @param data Partial ReportData object
 * @returns Complete ReportData with all fields populated
 */
export function ensureAllPlaceholders(data: Partial<ReportData>): ReportData {
  const result: ReportData = { ...DEFAULT_PLACEHOLDER_VALUES };
  
  // Override with provided data (convert all to strings)
  for (const key in data) {
    const value = data[key as keyof ReportData];
    if (value !== undefined && value !== null) {
      // Convert to string, but allow empty strings for optional fields
      const stringValue = String(value);
      const isOptional = OPTIONAL_PLACEHOLDERS.includes(key as keyof ReportData);
      
      // For required fields, use default if empty
      if (!isOptional && stringValue === "") {
        // Keep default value
        continue;
      }
      
      result[key as keyof ReportData] = stringValue;
    }
  }
  
  // Ensure aliases are synchronized
  if (data.PREPARED_FOR) {
    result.CLIENT_NAME = String(data.PREPARED_FOR);
  }
  if (data.INSPECTION_ID) {
    result.REPORT_ID = String(data.INSPECTION_ID);
  }
  if (data.HOW_TO_READ_PARAGRAPH) {
    result.HOW_TO_READ_TEXT = String(data.HOW_TO_READ_PARAGRAPH);
    result.WHAT_THIS_MEANS_TEXT = String(data.HOW_TO_READ_PARAGRAPH);
  }
  if (data.EXECUTIVE_DECISION_SIGNALS) {
    result.EXEC_SUMMARY_TEXT = String(data.EXECUTIVE_DECISION_SIGNALS);
  }
  if (data.SCOPE_SECTION) {
    result.SCOPE_TEXT = String(data.SCOPE_SECTION);
  }
  if (data.DECISION_PATHWAYS_SECTION) {
    result.DECISION_PATHWAYS_TEXT = String(data.DECISION_PATHWAYS_SECTION);
  }
  if (data.TERMS_AND_CONDITIONS) {
    result.TERMS_AND_CONDITIONS_TEXT = String(data.TERMS_AND_CONDITIONS);
  }
  if (data.DYNAMIC_FINDING_PAGES) {
    // Convert markdown to HTML if needed (basic conversion)
    result.DYNAMIC_FINDING_PAGES_HTML = String(data.DYNAMIC_FINDING_PAGES)
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br/>")
      .replace(/^/, "<p>")
      .replace(/$/, "</p>");
  }
  
  // Validate and log warnings
  const validation = validateReportDataAgainstPlaceholderMap(result);
  
  if (validation.missingRequired.length > 0) {
    console.warn("⚠️ Missing required placeholders:", validation.missingRequired.join(", "));
    // Fill missing required fields with defaults
    for (const key of validation.missingRequired) {
      result[key] = DEFAULT_PLACEHOLDER_VALUES[key];
    }
  }
  
  if (validation.missingOptional.length > 0) {
    console.log("ℹ️ Missing optional placeholders:", validation.missingOptional.join(", "));
  }
  
  return result;
}
