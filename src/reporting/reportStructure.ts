/**
 * Report Structure Contract
 * 
 * This file defines the Gold standard report structure as an ordered array.
 * Each page represents a section of the report with its required fields and rendering function reference.
 * 
 * This is a structural contract only - rendering implementations are defined elsewhere.
 */

/**
 * Report page definition
 */
export type ReportPage = {
  /** Unique identifier for the page */
  id: string;
  
  /** Display title of the page */
  title: string;
  
  /** Description of what decision purpose this page serves */
  description: string;
  
  /** Array of field names that must exist in the data for this page */
  requiredFields: string[];
  
  /** String reference to the rendering function (not implementation) */
  renderFunction: string;
};

/**
 * Gold standard report structure - ordered array of pages
 * 
 * Pages must follow this exact order:
 * 1. COVER
 * 2. PURPOSE_AND_HOW_TO_READ
 * 3. EXECUTIVE_SUMMARY
 * 4. PRIORITY_OVERVIEW
 * 5. SCOPE_AND_LIMITATIONS
 * 6. OBSERVED_CONDITIONS (dynamic, multiple pages)
 * 7. THERMAL_IMAGING
 * 8. CAPEX_ROADMAP
 * 9. DECISION_PATHWAYS
 * 10. TERMS_AND_CONDITIONS
 * 11. APPENDIX
 */
export const REPORT_PAGES: ReportPage[] = [
  {
    id: "COVER",
    title: "Cover Page",
    description: "Provides basic identification information (property address, client name, assessment date, inspection ID, prepared by) to establish report context and ownership.",
    requiredFields: [
      "PROPERTY_ADDRESS",
      "PREPARED_FOR",
      "CLIENT_NAME", // Alias
      "ASSESSMENT_DATE",
      "INSPECTION_ID",
      "REPORT_ID", // Alias
      "PREPARED_BY",
      "REPORT_VERSION"
    ],
    renderFunction: "renderCoverPage"
  },
  
  {
    id: "PURPOSE_AND_HOW_TO_READ",
    title: "Document Purpose & How to Read This Report",
    description: "Explains the report's purpose as a decision-support document and guides readers on how to interpret the findings. Sets expectations for investors and asset managers.",
    requiredFields: [
      "PURPOSE_PARAGRAPH",
      "HOW_TO_READ_PARAGRAPH",
      "HOW_TO_READ_TEXT", // Alias
      "WHAT_THIS_MEANS_TEXT" // Alias
    ],
    renderFunction: "renderPurposeAndHowToRead"
  },
  
  {
    id: "EXECUTIVE_SUMMARY",
    title: "Executive Summary",
    description: "Provides high-level risk assessment and key decision signals for executives. Includes overall status badge, executive decision signals, and CapEx snapshot to support immediate decision-making.",
    requiredFields: [
      "OVERALL_STATUS_BADGE",
      "EXECUTIVE_DECISION_SIGNALS",
      "EXEC_SUMMARY_TEXT", // Alias
      "EXECUTIVE_SUMMARY", // Alternative format
      "CAPEX_SNAPSHOT",
      "OVERALL_STATUS", // Metadata
      "RISK_RATING" // Metadata
    ],
    renderFunction: "renderExecutiveSummary"
  },
  
  {
    id: "PRIORITY_OVERVIEW",
    title: "Priority Overview",
    description: "Presents a summary table of findings grouped by priority level (Immediate, Recommended, Plan). Enables quick assessment of urgency distribution without reading individual findings.",
    requiredFields: [
      "PRIORITY_TABLE_ROWS"
    ],
    renderFunction: "renderPriorityOverview"
  },
  
  {
    id: "SCOPE_AND_LIMITATIONS",
    title: "Assessment Scope & Limitations",
    description: "Defines what was inspected and what was not, establishing the boundaries of the assessment. Critical for understanding the scope of decision support and managing expectations about what risks may exist outside the assessment.",
    requiredFields: [
      "SCOPE_SECTION",
      "SCOPE_TEXT", // Alias
      "LIMITATIONS_SECTION"
    ],
    renderFunction: "renderScopeAndLimitations"
  },
  
  {
    id: "OBSERVED_CONDITIONS",
    title: "Observed Conditions & Risk Interpretation",
    description: "Dynamic section with one page per finding. Each finding provides detailed analysis including asset component, observed condition, evidence, risk interpretation, priority classification, and budgetary planning range. Supports detailed risk assessment and capital planning decisions.",
    requiredFields: [
      "DYNAMIC_FINDING_PAGES",
      "DYNAMIC_FINDING_PAGES_HTML" // HTML format alternative
    ],
    renderFunction: "renderObservedConditions"
  },
  
  {
    id: "THERMAL_IMAGING",
    title: "Thermal Imaging Analysis",
    description: "Presents thermal imaging findings if applicable. Explains the value of thermal imaging as a non-invasive decision support tool and any thermal anomalies detected. Helps identify potential issues not visible during standard visual inspection.",
    requiredFields: [
      "THERMAL_METHOD",
      "THERMAL_FINDINGS",
      "THERMAL_VALUE_STATEMENT"
    ],
    renderFunction: "renderThermalImaging"
  },
  
  {
    id: "CAPEX_ROADMAP",
    title: "5-Year Capital Expenditure (CapEx) Roadmap",
    description: "Provides indicative financial ranges for planned capital expenditure. Supports financial provisioning and budgeting decisions. Includes disclaimer that figures are for planning only, not quotations.",
    requiredFields: [
      "CAPEX_TABLE_ROWS",
      "CAPEX_DISCLAIMER_LINE",
      "CAPEX_RANGE" // Metadata
    ],
    renderFunction: "renderCapExRoadmap"
  },
  
  {
    id: "DECISION_PATHWAYS",
    title: "Investor Options & Next Steps",
    description: "Presents decision pathways and options for addressing identified risks. Supports strategic planning by framing risk management as a framework rather than elimination. Helps investors understand their options.",
    requiredFields: [
      "DECISION_PATHWAYS_SECTION",
      "DECISION_PATHWAYS_TEXT" // Alias
    ],
    renderFunction: "renderDecisionPathways"
  },
  
  {
    id: "TERMS_AND_CONDITIONS",
    title: "Important Legal Limitations & Disclaimer",
    description: "Establishes legal positioning and limitations of the report. Clarifies that the report is decision-support only, not a compliance certificate or repair quotation. Manages legal liability and sets expectations.",
    requiredFields: [
      "TERMS_AND_CONDITIONS",
      "TERMS_AND_CONDITIONS_TEXT" // Alias
    ],
    renderFunction: "renderTermsAndConditions"
  },
  
  {
    id: "APPENDIX",
    title: "Appendix – Test Results Summary",
    description: "Provides technical test data and notes for reference. Supports detailed technical review and verification. Includes test summary and technical notes for completeness.",
    requiredFields: [
      "TEST_SUMMARY",
      "TECHNICAL_NOTES",
      "APPENDIX_TEST_NOTES_TEXT", // Alias
      "METHODOLOGY_TEXT", // Additional context
      "RISK_FRAMEWORK_TEXT" // Additional context
    ],
    renderFunction: "renderAppendix"
  }
];

/**
 * Get a page by its ID
 */
export function getPageById(id: string): ReportPage | undefined {
  return REPORT_PAGES.find(page => page.id === id);
}

/**
 * Get all required fields across all pages
 */
export function getAllRequiredFields(): string[] {
  const allFields = new Set<string>();
  REPORT_PAGES.forEach(page => {
    page.requiredFields.forEach(field => allFields.add(field));
  });
  return Array.from(allFields).sort();
}

/**
 * Validate that all required fields for a page are present in the data
 */
export function validatePageFields(
  pageId: string,
  data: Record<string, unknown>
): { valid: boolean; missing: string[] } {
  const page = getPageById(pageId);
  if (!page) {
    return { valid: false, missing: [`Page ${pageId} not found`] };
  }
  
  const missing: string[] = [];
  page.requiredFields.forEach(field => {
    if (!(field in data) || data[field] === undefined || data[field] === null || data[field] === "") {
      missing.push(field);
    }
  });
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get page index (0-based) for ordering
 */
export function getPageIndex(pageId: string): number {
  return REPORT_PAGES.findIndex(page => page.id === pageId);
}
