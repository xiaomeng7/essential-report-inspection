import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import yaml from "js-yaml";
import { saveWordDoc, get, type StoredInspection } from "./lib/store";
import { fixWordTemplate, hasSplitPlaceholders, fixWordTemplateFromErrors } from "../../scripts/fix-placeholders";
import { loadDefaultText } from "./lib/defaultTextLoader";
import { loadExecutiveSummaryTemplates } from "./lib/executiveSummaryLoader";
import { buildReportHtml, buildStructuredReport, renderReportFromSlots } from "./lib/buildReportMarkdown";
import { markdownToHtml } from "./lib/markdownToHtml";
import { assertReportReady } from "./lib/reportContract";
import { renderDocx } from "./lib/renderDocx";
import { sha1 } from "./lib/fingerprint";
import { getSanitizeFingerprint, resetSanitizeFingerprint } from "./lib/sanitizeText";
import { normalizeInspection, type CanonicalInspection } from "./lib/normalizeInspection";
import { loadFindingProfiles, getFindingProfile, type FindingProfile } from "./lib/findingProfilesLoader";
import { getEffectiveFinding } from "./lib/getEffectiveFindingData";
import { computeOverall, convertProfileForScoring, findingScore, type FindingForScoring } from "./lib/scoring";
import { generateExecutiveSignals, type TopFinding } from "./lib/executiveSignals";
import { generateDynamicFindingPages } from "./lib/generateDynamicFindingPages";
import { getBaseUrl } from "./lib/baseUrl";
import { enrichFindingsWithCalculatedPriority } from "./lib/customFindingPriority";
import { loadFindingDimensionsGlobal } from "./configAdmin";
import { derivePropertySignals } from "./lib/derivePropertySignals";
import { customDimensionsToFindingDimensions, profileToFindingDimensions, overallHealthToRiskLabel } from "./lib/dimensionsToPropertySignals";
import type { CustomFindingDimensions } from "./lib/customFindingPriority";
import type { FindingDimensions } from "./lib/derivePropertySignals";
import type { ReportData as PlaceholderReportData } from "../../src/reporting/placeholderMap";
import { buildTemplateDataWithLegacyPath } from "./lib/reportEngine";
import { 
  ensureAllPlaceholders, 
  DEFAULT_PLACEHOLDER_VALUES as PLACEHOLDER_DEFAULTS,
  validateReportDataAgainstPlaceholderMap
} from "../../src/reporting/placeholderMap";

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

// Docxtemplater options - must match template delimiters {{ }}
const docOptions = {
  paragraphLoop: true,
  linebreaks: true,
  delimiters: { start: "{{", end: "}}" },
};

// Cache for responses.yml
let responsesCache: any = null;

const DOCX_BODY_MIN_LENGTH = 20000;

/** Detect if a placeholder tag (e.g. "REPORT_BODY_HTML") is split across Word XML w:t runs. */
function detectSplitTag(documentXml: string, tagName: string): boolean {
  // If doesn't contain the tag name at all, not split (just missing)
  if (!documentXml.includes(tagName)) return false;
  // If contains full placeholder "{{TAG}}", it's continuous (not split)
  const fullTag = "{{" + tagName + "}}";
  if (documentXml.includes(fullTag)) return false;
  // If contains tag name but not full placeholder, likely split across nodes
  return true;
}

/** Verify generated docx has body content (not ASTEXT / merge failure). Reads word/document.xml inside zip. */
function verifyDocxBody(
  zip: { files: Record<string, { asText?: () => string }> },
  opts?: { minLength?: number }
): { ok: boolean; reason?: string; documentXmlLength?: number } {
  const docEntry = zip.files["word/document.xml"];
  const xml = docEntry ? (docEntry.asText?.() ?? "") : "";
  const minLen = opts?.minLength ?? DOCX_BODY_MIN_LENGTH;
  if (xml.length < minLen) {
    return { ok: false, reason: "body content missing, likely ASTEXT or merge failed. document.xml length=" + xml.length + " (min " + minLen + ")" };
  }
  const hasBodyMarker =
    xml.includes("Executive Summary") ||
    xml.includes("Executive") ||
    xml.includes("Evidence") ||
    xml.includes("Observed Condition") ||
    xml.includes("Observed");
  if (!hasBodyMarker) {
    return { ok: false, reason: "body content missing, likely ASTEXT or merge failed. document.xml length=" + xml.length + ", hasBodyMarker=false" };
  }
  return { ok: true, documentXmlLength: xml.length };
}

/**
 * Required placeholder keys from PLACEHOLDER_MAP.md
 * These keys must exist in the data passed to Docxtemplater
 */
const REQUIRED_KEYS = [
  // Page 1 – Cover
  "PROPERTY_ADDRESS",
  "PREPARED_FOR",
  "ASSESSMENT_DATE",
  "PREPARED_BY",
  "INSPECTION_ID",
  // Page 2 – Purpose
  "PURPOSE_PARAGRAPH",
  "HOW_TO_READ_PARAGRAPH",
  // Page 3 – Executive Summary
  "OVERALL_STATUS_BADGE",
  "EXECUTIVE_DECISION_SIGNALS",
  "CAPEX_SNAPSHOT",
  // Page 4 – Priority Overview (Table)
  "PRIORITY_TABLE_ROWS",
  // Page 5 – Scope & Limitations
  "SCOPE_SECTION",
  "LIMITATIONS_SECTION",
  // Pages 6–10 – Observed Conditions (Dynamic)
  "DYNAMIC_FINDING_PAGES",
  // Page 11 – Thermal Imaging
  "THERMAL_METHOD",
  "THERMAL_FINDINGS",
  "THERMAL_VALUE_STATEMENT",
  // Page 12 – CapEx Roadmap
  "CAPEX_TABLE_ROWS",
  "CAPEX_DISCLAIMER_LINE",
  // Page 13 – Decision Pathways
  "DECISION_PATHWAYS_SECTION",
  // Page 14 – Terms & Conditions
  "TERMS_AND_CONDITIONS",
  // Page 15 – Closing
  "CLOSING_STATEMENT",
  // Additional common placeholders
  "REPORT_BODY_HTML",
  "OVERALL_STATUS",
  "RISK_RATING",
  "EXECUTIVE_SUMMARY",
  "CAPEX_RANGE",
] as const;

/**
 * Default values for required placeholders
 */
const DEFAULT_PLACEHOLDER_VALUES: Record<string, string> = {
  PROPERTY_ADDRESS: "-",
  PREPARED_FOR: "-",
  ASSESSMENT_DATE: "-",
  PREPARED_BY: "-",
  INSPECTION_ID: "-",
  PURPOSE_PARAGRAPH: "This report provides a comprehensive assessment of the electrical condition of the property, identifying safety concerns, compliance issues, and maintenance recommendations based on a visual inspection and electrical testing performed in accordance with applicable standards.",
  HOW_TO_READ_PARAGRAPH: "This report is a decision-support document designed to assist property owners, investors, and asset managers in understanding the electrical risk profile of the property and planning for future capital expenditure.",
  OVERALL_STATUS_BADGE: "🟡 Moderate",
  EXECUTIVE_DECISION_SIGNALS: "• No immediate safety hazards detected. Conditions can be managed within standard asset planning cycles.",
  CAPEX_SNAPSHOT: "AUD $0 – $0",
  PRIORITY_TABLE_ROWS: "",
  SCOPE_SECTION: "This assessment is non-invasive and limited to accessible areas only.",
  LIMITATIONS_SECTION: "Areas that are concealed, locked, or otherwise inaccessible were not inspected.",
  DYNAMIC_FINDING_PAGES: "No findings were identified during this assessment.",
  THERMAL_METHOD: "Thermal imaging was performed using non-invasive infrared technology to identify potential electrical issues.",
  THERMAL_FINDINGS: "No significant thermal anomalies were detected during the inspection.",
  THERMAL_VALUE_STATEMENT: "Thermal imaging provides valuable non-invasive decision support for risk identification.",
  CAPEX_TABLE_ROWS: "",
  CAPEX_DISCLAIMER_LINE: "Provided for financial provisioning only. Not a quotation or scope of works.",
  DECISION_PATHWAYS_SECTION: "This report provides a framework for managing risk, not removing it.",
  TERMS_AND_CONDITIONS: "Terms and conditions apply. Please refer to the full terms document.",
  CLOSING_STATEMENT: "For questions or clarifications regarding this report, please contact the inspection provider.",
  REPORT_BODY_HTML: "",
  OVERALL_STATUS: "MODERATE RISK",
  RISK_RATING: "MODERATE",
  EXECUTIVE_SUMMARY: "This property presents a moderate electrical risk profile at the time of inspection.",
  CAPEX_RANGE: "To be confirmed",
};

/**
 * Apply placeholder fallback strategy
 * Ensures all required keys exist and all values are strings
 */
function applyPlaceholderFallback<T extends Record<string, any>>(data: T): Record<string, string> {
  const result: Record<string, string> = {};
  
  // First, convert all existing values to strings
  for (const [key, value] of Object.entries(data)) {
    if (value == null) {
      result[key] = "";
    } else if (Array.isArray(value)) {
      // Arrays: join with newlines and sanitize
      result[key] = value.map(item => sanitizeText(item)).join("\n");
    } else if (typeof value === "object") {
      // Objects: convert to JSON string
      result[key] = JSON.stringify(value);
    } else {
      // Primitives: convert to string
      result[key] = sanitizeText(value);
    }
  }
  
  // Then, ensure all required keys exist with non-empty values
  for (const key of REQUIRED_KEYS) {
    if (!(key in result) || result[key] === "" || result[key] == null) {
      // Use default value if available, otherwise use "-"
      result[key] = DEFAULT_PLACEHOLDER_VALUES[key] || "-";
      console.warn(`⚠️ Placeholder ${key} was missing or empty, using default: "${result[key].substring(0, 50)}..."`);
    }
  }
  
  return result;
}

/**
 * Sanitize text for Docxtemplater
 * 
 * Rules:
 * - null/undefined -> ""
 * - number/boolean -> String(x)
 * - Array -> join with "\n" and sanitize each element
 * - Replace NBSP \u00A0 with regular space
 * - Remove control characters (keep \n and \t)
 * - Normalize line endings: \r\n and \r -> \n
 */
function sanitizeText(input: unknown): string {
  // Handle null/undefined
  if (input == null) {
    return "";
  }
  
  // Handle arrays
  if (Array.isArray(input)) {
    return input.map(item => sanitizeText(item)).join("\n");
  }
  
  // Handle number/boolean
  if (typeof input === "number" || typeof input === "boolean") {
    return String(input);
  }
  
  // Handle objects (convert to string representation)
  if (typeof input === "object") {
    return String(input);
  }
  
  // Handle string
  if (typeof input === "string") {
    let sanitized = input;
    
    // Replace NBSP (\u00A0) with regular space
    sanitized = sanitized.replace(/\u00A0/g, " ");
    
    // Normalize line endings: \r\n and \r -> \n
    sanitized = sanitized.replace(/\r\n/g, "\n");
    sanitized = sanitized.replace(/\r/g, "\n");
    
    // Remove control characters (keep \n and \t)
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
    
    return sanitized;
  }
  
  // Fallback: convert to string
  return String(input);
}

/**
 * Assert no undefined values in template data and replace with safe defaults
 */
function assertNoUndefined(data: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Handle undefined or string "undefined"
    if (value === undefined || value === "undefined" || value === null) {
      // Special handling for key fields
      if (key === "ASSESSMENT_PURPOSE") {
        safe[key] = "Decision-support risk & capital planning";
      } else if (key === "CAPEX_SNAPSHOT") {
        safe[key] = "TBC (indicative, planning only)";
      } else if (key === "CAPEX_RANGE_LOW" || key === "CAPEX_RANGE_HIGH") {
        // These will be handled together below
        safe[key] = "TBC";
      } else if (typeof value === "number" || key.toLowerCase().includes("count") || key.toLowerCase().includes("number")) {
        safe[key] = 0;
      } else {
        safe[key] = "-";
      }
    } else if (Array.isArray(value)) {
      safe[key] = value.map(item => 
        item === undefined || item === "undefined" ? "-" : item
      );
    } else if (typeof value === "object" && value !== null) {
      safe[key] = assertNoUndefined(value);
    } else {
      safe[key] = value;
    }
  }
  
  // Special handling for CAPEX fields: ensure both LOW and HIGH are set, or generate unified range
  if (safe.CAPEX_RANGE_LOW === "TBC" || safe.CAPEX_RANGE_HIGH === "TBC" || 
      safe.CAPEX_RANGE_LOW === undefined || safe.CAPEX_RANGE_HIGH === undefined ||
      safe.CAPEX_RANGE_LOW === "-" || safe.CAPEX_RANGE_HIGH === "-") {
    // If either is missing, set both to TBC format
    if (!safe.CAPEX_SNAPSHOT || safe.CAPEX_SNAPSHOT === "-" || safe.CAPEX_SNAPSHOT === "undefined") {
      safe.CAPEX_SNAPSHOT = "AUD $TBC – $TBC";
    }
    // Ensure CAPEX_RANGE_LOW and CAPEX_RANGE_HIGH are set
    if (safe.CAPEX_RANGE_LOW === "TBC" || safe.CAPEX_RANGE_LOW === undefined || safe.CAPEX_RANGE_LOW === "-") {
      safe.CAPEX_RANGE_LOW = "TBC";
    }
    if (safe.CAPEX_RANGE_HIGH === "TBC" || safe.CAPEX_RANGE_HIGH === undefined || safe.CAPEX_RANGE_HIGH === "-") {
      safe.CAPEX_RANGE_HIGH = "TBC";
    }
  }
  
  // Ensure ASSESSMENT_PURPOSE is set
  if (!safe.ASSESSMENT_PURPOSE || safe.ASSESSMENT_PURPOSE === "-" || safe.ASSESSMENT_PURPOSE === "undefined") {
    safe.ASSESSMENT_PURPOSE = "Decision-support risk & capital planning";
  }
  
  // Ensure CAPEX_SNAPSHOT is set
  if (!safe.CAPEX_SNAPSHOT || safe.CAPEX_SNAPSHOT === "-" || safe.CAPEX_SNAPSHOT === "undefined") {
    safe.CAPEX_SNAPSHOT = "TBC (indicative, planning only)";
  }
  
  return safe;
}

/**
 * Recursively sanitize all values in an object
 */
function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      // For arrays, sanitize each element
      sanitized[key] = value.map(item => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          return sanitizeObject(item);
        }
        return sanitizeText(item);
      });
    } else if (typeof value === "object" && value !== null) {
      // For nested objects, recursively sanitize
      sanitized[key] = sanitizeObject(value);
    } else {
      // For primitives, sanitize directly
      sanitized[key] = sanitizeText(value);
    }
  }
  
  return sanitized as T;
}

/**
 * Build CapEx roadmap table rows from findings and profiles
 * Groups findings by timeline and generates a 5-year roadmap table
 */
function buildCapExTableRows(
  findings: Array<{ id: string; priority: string; title?: string; budget_low?: number; budget_high?: number }>,
  profilesForScoring: Record<string, any>,
  findingsMap: Record<string, any>
): string {
  // Only Urgent + Budgetary (exclude Acceptable / PLAN_MONITOR)
  const relevantFindings = findings.filter(f => {
    const priority = f.priority || "";
    return priority === "IMMEDIATE" || priority === "URGENT" || priority === "RECOMMENDED_0_3_MONTHS";
  });
  
  if (relevantFindings.length === 0) {
    return "| Year | Item | Indicative Range |\n|------|------|------------------|\n| - | No capital expenditure items identified | - |";
  }
  
  // Group findings by timeline
  const timelineGroups: Record<string, Array<{
    title: string;
    budgetRange: string;
    priority: string;
  }>> = {
    "Year 1 (0–3 months)": [],
    "Year 1 (3–12 months)": [],
    "Year 2–3": [],
    "Year 4–5": [],
    "Future planning": [],
  };
  
  for (const finding of relevantFindings) {
    const profile = profilesForScoring[finding.id] || {};
    const response = findingsMap[finding.id];
    
    const title = response?.title || profile.messaging?.title || finding.title || finding.id.replace(/_/g, " ");

    // Prefer custom budget_low/budget_high when present; else response/profile/band
    let budgetRange = "To be confirmed";
    if (typeof finding.budget_low === "number" && typeof finding.budget_high === "number") {
      budgetRange = formatCapExRangeWithCommas(finding.budget_low, finding.budget_high);
    } else if (response?.budget_range_text) {
      budgetRange = response.budget_range_text;
    } else if (response?.budget_range_low !== undefined && response?.budget_range_high !== undefined) {
      budgetRange = formatCapExRangeWithCommas(response.budget_range_low, response.budget_range_high);
    } else if (profile.budget_range) {
      budgetRange = profile.budget_range;
    } else if (profile.budget_band) {
      const band = profile.budget_band || "LOW";
      const ranges: Record<string, string> = {
        LOW: "AUD $500 – $2,000",
        MED: "AUD $2,000 – $5,000",
        HIGH: "AUD $5,000 – $15,000",
      };
      budgetRange = ranges[band] || "To be confirmed";
    }

    // Get timeline from profile
    const timeline = profile.timeline || "6–18 months";
    const priority = finding.priority || "PLAN_MONITOR";
    
    // Map timeline to year group
    let yearGroup: string;
    if (timeline.includes("0–3") || timeline.includes("0-3") || priority === "IMMEDIATE" || priority === "URGENT") {
      yearGroup = "Year 1 (0–3 months)";
    } else if (timeline.includes("3–12") || timeline.includes("3-12") || timeline.includes("6–12") || timeline.includes("6-12") || priority === "RECOMMENDED_0_3_MONTHS") {
      yearGroup = "Year 1 (3–12 months)";
    } else if (timeline.includes("18") || timeline.includes("2–3") || timeline.includes("2-3")) {
      yearGroup = "Year 2–3";
    } else if (timeline.includes("4–5") || timeline.includes("4-5") || timeline.includes("5")) {
      yearGroup = "Year 4–5";
    } else if (timeline.includes("renovation") || timeline.includes("Future") || timeline.includes("Next")) {
      yearGroup = "Future planning";
    } else {
      // Default to Year 2–3 for unclear timelines
      yearGroup = "Year 2–3";
    }
    
    timelineGroups[yearGroup].push({
      title,
      budgetRange,
      priority,
    });
  }
  
  // Build table rows
  const rows: string[] = [];
  rows.push("| Year | Item | Indicative Range |");
  rows.push("|------|------|------------------|");
  
  // Output groups in order
  const groupOrder = [
    "Year 1 (0–3 months)",
    "Year 1 (3–12 months)",
    "Year 2–3",
    "Year 4–5",
    "Future planning",
  ];
  
  for (const group of groupOrder) {
    const items = timelineGroups[group];
    if (items.length === 0) continue;
    
    // Sort by priority (IMMEDIATE > URGENT > RECOMMENDED > PLAN)
    items.sort((a, b) => {
      const priorityOrder: Record<string, number> = {
        IMMEDIATE: 0,
        URGENT: 1,
        RECOMMENDED_0_3_MONTHS: 2,
        PLAN_MONITOR: 3,
      };
      return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
    });
    
    for (const item of items) {
      rows.push(`| ${group} | ${item.title} | ${item.budgetRange} |`);
    }
  }
  
  if (rows.length === 2) {
    // Only header rows, no data
    rows.push("| - | No capital expenditure items identified | - |");
  }
  
  return rows.join("\n");
}

/**
 * Build Test Summary and Technical Notes from canonical test_data with mandatory fallback
 * Ensures these sections never output undefined values
 */
function buildTestDataAndNotes(
  testData: Record<string, unknown>,
  technicianNotes: string,
  limitations: string[],
  defaultText: Record<string, string>
): { testSummary: string; technicalNotes: string } {
  // Build Test Summary from test_data
  const testSummaryParts: string[] = [];
  
  // Extract RCD test summary
  const rcdTests = testData.rcd_tests as Record<string, unknown> | undefined;
  if (rcdTests) {
    const performed = rcdTests.performed;
    if (performed === true || performed === "true" || performed === "yes") {
      const summary = rcdTests.summary as Record<string, unknown> | undefined;
      if (summary) {
        const totalTested = summary.total_tested || summary.total_tested;
        const totalPass = summary.total_pass || 0;
        const totalFail = summary.total_fail || 0;
        if (totalTested !== undefined) {
          testSummaryParts.push(`RCD Testing: ${totalTested} device(s) tested. ${totalPass} passed, ${totalFail} failed.`);
        }
      } else {
        testSummaryParts.push("RCD Testing: Performed (details not available).");
      }
    }
  }
  
  // Extract GPO test summary (support gpo_tests.rooms → summary when summary missing; exclude not_accessible rooms)
  const gpoTests = testData.gpo_tests as Record<string, unknown> | undefined;
  if (gpoTests) {
    const performed = gpoTests.performed;
    if (performed === true || performed === "true" || performed === "yes") {
      let summary = gpoTests.summary as Record<string, unknown> | undefined;
      const rooms = gpoTests.rooms as Array<Record<string, unknown>> | undefined;
      const accessibleRooms = Array.isArray(rooms) ? rooms.filter((r: Record<string, unknown>) => r?.room_access !== "not_accessible") : [];
      const notAccessibleCount = Array.isArray(rooms) ? rooms.filter((r: Record<string, unknown>) => r?.room_access === "not_accessible").length : 0;
      if (!summary && accessibleRooms.length > 0) {
        const totalTested = accessibleRooms.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.tested_count) || 0), 0);
        const passSum = accessibleRooms.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.pass_count) || 0), 0);
        summary = { total_gpo_tested: totalTested, polarity_pass: passSum, earth_present_pass: passSum };
      }
      if (summary) {
        const totalTested = Number(summary.total_tested ?? summary.total_outlets_tested ?? summary.total_gpo_tested ?? 0);
        if (totalTested > 0) {
          const polarityPass = summary.polarity_pass_count ?? summary.polarity_pass ?? 0;
          const earthPass = summary.earth_present_pass_count ?? summary.earth_present_pass ?? 0;
          testSummaryParts.push(`GPO Testing: ${totalTested} outlet(s) tested. Polarity: ${polarityPass} passed, Earth: ${earthPass} passed.`);
        }
      } else {
        testSummaryParts.push("GPO Testing: Performed (details not available).");
      }
      if (notAccessibleCount > 0) {
        testSummaryParts.push(`Potential risk: ${notAccessibleCount} room(s) not accessible – GPO testing could not be performed in those areas.`);
      }
    }
  }
  
  // Extract earthing data
  const earthing = testData.earthing as Record<string, unknown> | undefined;
  if (earthing) {
    const earthResistance = earthing.resistance || earthing.earth_resistance || earthing.earth_resistance_ohm;
    if (earthResistance !== undefined) {
      testSummaryParts.push(`Earthing: Resistance measured at ${earthResistance} Ω.`);
    }
  }
  
  // Extract measured data (FIELD_DICTIONARY v1.1 Section S5A)
  const measured = testData.measured as Record<string, unknown> | undefined;
  if (measured) {
    // Supply voltage measurements
    const voltageL1NoLoad = measured.supply_voltage_l1_noload as number | undefined;
    const voltageL1Load = measured.supply_voltage_l1_load as number | undefined;
    if (voltageL1NoLoad !== undefined || voltageL1Load !== undefined) {
      const voltageStr = voltageL1NoLoad !== undefined && voltageL1Load !== undefined
        ? `L1: ${voltageL1NoLoad}V (no-load) / ${voltageL1Load}V (load)`
        : voltageL1NoLoad !== undefined
          ? `L1: ${voltageL1NoLoad}V (no-load)`
          : `L1: ${voltageL1Load}V (load)`;
      testSummaryParts.push(`Supply Voltage: ${voltageStr}.`);
    }
    
    // Load current measurements
    const loadCurrentL1 = measured.load_current_l1 as number | undefined;
    const loadCurrentNeutral = measured.load_current_neutral as number | undefined;
    if (loadCurrentL1 !== undefined) {
      let currentStr = `L1: ${loadCurrentL1}A`;
      if (loadCurrentNeutral !== undefined) {
        currentStr += `, N: ${loadCurrentNeutral}A`;
      }
      testSummaryParts.push(`Load Current: ${currentStr}.`);
    }
    
    // Earth resistance from measured (if not already captured from earthing)
    const measuredEarthResistance = measured.earth_resistance_ohm as number | undefined;
    if (measuredEarthResistance !== undefined && !earthing?.earth_resistance_ohm) {
      const method = measured.earth_test_method as string | undefined;
      const methodStr = method ? ` (${method} method)` : "";
      testSummaryParts.push(`Earth Resistance: ${measuredEarthResistance} Ω${methodStr}.`);
    }
    
    // MEN continuity
    const menContinuity = measured.men_continuity as string | undefined;
    if (menContinuity) {
      testSummaryParts.push(`MEN Continuity: ${menContinuity === "pass" ? "Pass" : menContinuity === "fail" ? "Fail" : menContinuity}.`);
    }
    
    // Thermal imaging
    const thermalAmbient = measured.thermal_ambient_temp as number | undefined;
    const thermalMaxSwitch = measured.thermal_max_main_switch_temp as number | undefined;
    const thermalDeltaT = measured.thermal_delta_t as number | undefined;
    if (thermalAmbient !== undefined || thermalMaxSwitch !== undefined || thermalDeltaT !== undefined) {
      const thermalParts: string[] = [];
      if (thermalAmbient !== undefined) thermalParts.push(`Ambient: ${thermalAmbient}°C`);
      if (thermalMaxSwitch !== undefined) thermalParts.push(`Max Switch: ${thermalMaxSwitch}°C`);
      if (thermalDeltaT !== undefined) thermalParts.push(`ΔT: ${thermalDeltaT}°C`);
      testSummaryParts.push(`Thermal Imaging: ${thermalParts.join(", ")}.`);
    }
    
    // Insulation resistance
    const insulationResistance = measured.insulation_resistance_mohm as number | undefined;
    if (insulationResistance !== undefined) {
      testSummaryParts.push(`Insulation Resistance: ${insulationResistance} MΩ.`);
    }
    
    // Main earthing conductor size
    const mecSize = measured.main_earthing_conductor_size_mm2 as number | undefined;
    if (mecSize !== undefined) {
      testSummaryParts.push(`Main Earthing Conductor: ${mecSize} mm².`);
    }
  }
  
  // Build final test summary with mandatory fallback
  const testSummary = testSummaryParts.length > 0
    ? testSummaryParts.join(" ")
    : (defaultText.TEST_SUMMARY || "Electrical testing was performed in accordance with standard inspection procedures. Detailed test results are available upon request.");
  
  // Build Technical Notes combining technician notes and limitations
  const technicalNotesParts: string[] = [];
  
  // Add technician notes if available
  if (technicianNotes && technicianNotes.trim()) {
    technicalNotesParts.push(`Technician Notes: ${technicianNotes.trim()}`);
  }
  
  // Add limitations
  if (limitations && limitations.length > 0) {
    technicalNotesParts.push(`Limitations: ${limitations.join("; ")}`);
  }
  
  // Add access information from test_data if available
  const access = testData.access as Record<string, unknown> | undefined;
  if (access) {
    const accessNotes: string[] = [];
    if (access.switchboard_accessible === false) {
      accessNotes.push("Switchboard not accessible");
    }
    if (access.roof_accessible === false) {
      accessNotes.push("Roof space not accessible");
    }
    const uf = access.underfloor_accessible;
    if (uf === false || uf === "not_accessible") {
      accessNotes.push("Underfloor not accessible");
    } else if (uf === "not_applicable") {
      accessNotes.push("Underfloor: N/A (no subfloor)");
    }
    if (accessNotes.length > 0) {
      technicalNotesParts.push(`Access Constraints: ${accessNotes.join("; ")}`);
    }
  }
  
  // Build final technical notes with mandatory fallback
  const technicalNotes = technicalNotesParts.length > 0
    ? technicalNotesParts.join("\n\n")
    : (defaultText.TECHNICAL_NOTES || "This assessment is based on a visual inspection and limited electrical testing of accessible areas only. Some areas may not have been accessible during the inspection.");
  
  return { testSummary, technicalNotes };
}

/**
 * Load Terms and Conditions from DEFAULT_TERMS.md
 * Tries multiple possible locations, falls back to hardcoded default if file not found
 */
async function loadTermsAndConditions(): Promise<string> {
  const possiblePaths = [
    path.join(__dirname, "DEFAULT_TERMS.md"),
    path.join(__dirname, "..", "DEFAULT_TERMS.md"),
    path.join(__dirname, "..", "..", "DEFAULT_TERMS.md"),
    path.join(process.cwd(), "DEFAULT_TERMS.md"),
    path.join(process.cwd(), "netlify", "functions", "DEFAULT_TERMS.md"),
    "/opt/build/repo/DEFAULT_TERMS.md",
    "/opt/build/repo/netlify/functions/DEFAULT_TERMS.md",
  ];
  
  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        console.log(`✅ Loaded Terms and Conditions from: ${filePath}`);
        return content;
      }
    } catch (e) {
      console.warn(`Failed to load DEFAULT_TERMS.md from ${filePath}:`, e);
      continue;
    }
  }
  
  // Fallback to hardcoded default Terms and Conditions (from DEFAULT_TERMS.md)
  console.warn("⚠️ DEFAULT_TERMS.md not found, using hardcoded fallback");
  return `# TERMS & CONDITIONS OF ASSESSMENT

## 1. Australian Consumer Law (ACL) Acknowledgement
Our services come with guarantees that cannot be excluded under the Australian Consumer Law (ACL).  
Nothing in this Report or these Terms seeks to exclude, restrict, or modify any consumer guarantees that cannot lawfully be excluded.

## 2. Nature & Scope of Professional Opinion
This Assessment is a point-in-time, non-destructive, visual and functional review of accessible electrical components only.  
It is non-intrusive and non-exhaustive, and does not constitute:
- a compliance certificate,
- an electrical safety certificate,
- an engineering report,
- a structural inspection, or
- a guarantee of future performance.

No representation is made that all defects, latent conditions, or future failures have been identified.

## 3. Decision-Support Only – No Repair Advice
This Report is provided solely as a risk identification and asset planning tool.  
It does not:
- prescribe a scope of rectification works,
- provide quotations,
- endorse or appoint contractors, or
- certify statutory compliance.

Any budgetary figures or planning horizons included are indicative market benchmarks only, provided to assist financial provisioning and decision-making, not as repair advice or binding cost guidance.

## 4. Independence & Conflict-Free Position
This Assessment is conducted independently of any repair, upgrade, or installation services.  
Better Home Technology Pty Ltd does not undertake rectification works arising from this Report.  
This separation exists to preserve independence, objectivity, and financial neutrality of the findings.

## 5. Exclusive Reliance & Confidentiality
This Report has been prepared solely for the Client named in the Report for the purpose of informed asset and risk management.  
No duty of care is owed to any third party. No third party (including purchasers, insurers, financiers, or agents) may rely upon this Report without express written consent.

## 6. Limitation of Liability & Exclusion of Consequential Loss
To the maximum extent permitted by law, Better Home Technology Pty Ltd excludes liability for any indirect or consequential loss arising from reliance on this Report, including but not limited to:
- loss of rental income,
- business interruption,
- property downtime, or
- alleged diminution of asset value.

## 7. Hazardous Materials (Including Asbestos)
Our technicians are not licensed asbestos assessors. No testing for hazardous materials has been conducted.  
Where materials suspected to contain asbestos are observed, they are treated as such and no intrusive inspection is performed.

## 8. Statutory Compliance Disclaimer
This Report is a risk management and decision-support tool only.  
It does not constitute any state-based mandatory electrical compliance inspection, rental safety certification, or statutory approval unless expressly stated otherwise in writing.

## 9. Framework Statement
This assessment does not eliminate risk, but provides a structured framework for managing it.`;
}

/**
 * Load responses.yml file (standardized text templates for findings)
 * Tries blob store first, then falls back to file system
 */
export async function loadResponses(event?: HandlerEvent): Promise<any> {
  if (responsesCache) {
    return responsesCache;
  }

  // Try blob store first (if event is provided)
  if (event) {
    try {
      const { connectLambda, getStore } = await import("@netlify/blobs");
      connectLambda(event as any);
      const store = getStore({ name: "config", consistency: "eventual" });
      const blobContent = await store.get("responses.yml", { type: "text" });
      if (blobContent) {
        try {
          responsesCache = yaml.load(blobContent) as any;
          const raw = typeof blobContent === "string" ? blobContent : String(blobContent);
          console.log("[report-fp] responses source: blob length:", raw.length, "sha1:", sha1(raw));
          return responsesCache;
        } catch (e) {
          console.warn("Failed to parse responses from blob:", e);
        }
      }
    } catch (e) {
      console.warn("Failed to access blob store for responses:", e);
    }
  }

  // Fallback to file system
  const possiblePaths = [
    path.join(__dirname, "responses.yml"),
    path.join(__dirname, "..", "..", "responses.yml"),
    path.join(process.cwd(), "responses.yml"),
    path.join(process.cwd(), "netlify", "functions", "responses.yml"),
    "/opt/build/repo/responses.yml",
    "/opt/build/repo/netlify/functions/responses.yml",
  ];

  for (const responsesPath of possiblePaths) {
    try {
      if (fs.existsSync(responsesPath)) {
        const content = fs.readFileSync(responsesPath, "utf8");
        responsesCache = yaml.load(content) as any;
        console.log("[report-fp] responses source: fs path:", responsesPath, "length:", content.length, "sha1:", sha1(content));
        return responsesCache;
      }
    } catch (e) {
      console.warn(`Failed to load responses.yml from ${responsesPath}:`, e);
      continue;
    }
  }

  console.warn("[report-fp] responses source: fallback (empty)");
  responsesCache = { findings: {}, defaults: {} };
  return responsesCache;
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
 * Extract field value from inspection.raw by path (e.g., "job.address")
 */
function getFieldValue(raw: Record<string, unknown>, fieldPath: string): string {
  const parts = fieldPath.split(".");
  let current: unknown = raw;
  
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  
  const value = extractValue(current);
  return value != null ? String(value) : "";
}

// Load Word template
function loadWordTemplate(): Buffer {
  const possiblePaths = [
    path.join(__dirname, "report-template.docx"),
    path.join(__dirname, "..", "report-template.docx"),
    path.join(process.cwd(), "report-template.docx"),
    path.join(process.cwd(), "netlify", "functions", "report-template.docx"),
    "/opt/build/repo/report-template.docx",
    "/opt/build/repo/netlify/functions/report-template.docx",
  ];
  
  console.log("Loading Word template...");
  console.log("process.cwd():", process.cwd());
  console.log("__dirname:", __dirname);
  
  for (const templatePath of possiblePaths) {
    try {
      if (!templatePath || typeof templatePath !== "string" || templatePath.includes("undefined")) {
        continue;
      }
      
      console.log("Trying to load template from:", templatePath);
      if (fs.existsSync(templatePath)) {
        let content = fs.readFileSync(templatePath);
        console.log("✅ Successfully loaded Word template from:", templatePath);
        console.log("Template size:", content.length, "bytes");
        
        // Check for split placeholders and fix if needed
        console.log("🔍 Checking for split placeholders...");
        if (hasSplitPlaceholders(content)) {
          console.log("⚠️  Found split placeholders, applying fix...");
          const beforeFixSize = content.length;
          content = fixWordTemplate(content) as any;
          console.log(`✅ Fixed template: ${beforeFixSize} -> ${content.length} bytes`);
          
          // Verify fix
          if (hasSplitPlaceholders(content)) {
            console.warn("⚠️  Warning: Still found split placeholders after fix, but continuing...");
          } else {
            console.log("✅ Verification passed: No split placeholders found after fix");
          }
        } else {
          console.log("✅ No split placeholders found, template is clean");
        }
        
        const fixedZip = new PizZip(content);
        
        // Extract and log all placeholders in the template for debugging
        try {
          const doc = new Docxtemplater(fixedZip, docOptions);
          
          // Use docxtemplater's getTags() method to get all recognized tags (if available)
          try {
            const tags = (doc as { getTags?: () => unknown }).getTags?.();
            console.log("📋 Found placeholders via doc.getTags():", JSON.stringify(tags, null, 2));
            
            // Extract tag names from the tags structure
            const tagNames: string[] = [];
            const tagsObj = tags as { document?: { tags?: Record<string, unknown> }; headers?: Array<{ tags?: Record<string, unknown> }>; footers?: Array<{ tags?: Record<string, unknown> }> } | null;
            if (tagsObj && typeof tagsObj === 'object') {
              // Check document tags
              if (tagsObj.document && tagsObj.document.tags) {
                Object.keys(tagsObj.document.tags).forEach(tag => tagNames.push(tag));
              }
              // Check header tags
              if (tagsObj.headers && Array.isArray(tagsObj.headers)) {
                tagsObj.headers.forEach((header: any) => {
                  if (header.tags) {
                    Object.keys(header.tags).forEach(tag => tagNames.push(tag));
                  }
                });
              }
              // Check footer tags
              if (tagsObj.footers && Array.isArray(tagsObj.footers)) {
                tagsObj.footers.forEach((footer: any) => {
                  if (footer.tags) {
                    Object.keys(footer.tags).forEach(tag => tagNames.push(tag));
                  }
                });
              }
            }
            
            console.log("📋 Extracted tag names from template:", tagNames);
            
            if (tagNames.length === 0) {
              console.warn("⚠️ WARNING: No placeholders found in Word template!");
              console.warn("⚠️ The template file may not contain any {{PLACEHOLDER}} tags.");
              console.warn("⚠️ Please verify the Word template has placeholders like {{INSPECTION_ID}}, {{IMMEDIATE_FINDINGS}}, etc.");
            }
          } catch (tagsErr) {
            console.log("Could not get tags via doc.getTags():", tagsErr);
          }
          
          // Try to get full text and extract placeholders manually
          try {
            const fullText = doc.getFullText();
            console.log("Full text sample (first 1000 chars):", fullText.substring(0, 1000));
            
            // Extract placeholders using regex
            const placeholderRegex = /\{\{([^}]+)\}\}/g;
            const placeholders = new Set<string>();
            let match;
            while ((match = placeholderRegex.exec(fullText)) !== null) {
              placeholders.add(match[1].trim());
            }
            
            const foundPlaceholders = Array.from(placeholders).sort();
            console.log("📋 Found placeholders via regex from fullText:", foundPlaceholders);
            
            if (foundPlaceholders.length === 0) {
              console.warn("⚠️ WARNING: No {{PLACEHOLDER}} patterns found in template text!");
              console.warn("⚠️ This suggests the Word template may not have any placeholders, or they are in a format docxtemplater cannot read.");
            }
          } catch (textErr) {
            console.warn("Could not extract placeholders from full text:", textErr);
          }
        } catch (extractErr: any) {
          console.warn("Could not extract placeholders from template:", extractErr);
          
          // Try to fix template using error information if it's a duplicate tag error
          const errorMsg = extractErr instanceof Error ? extractErr.message : String(extractErr);
          let errorsArray: any[] | null = null;
          
          if (extractErr.properties && extractErr.properties.errors && Array.isArray(extractErr.properties.errors)) {
            errorsArray = extractErr.properties.errors;
          } else if (extractErr.errors && Array.isArray(extractErr.errors)) {
            errorsArray = extractErr.errors;
          }
          
          if (errorsArray && errorsArray.length > 0) {
            console.log(`loadWordTemplate: Found ${errorsArray.length} error(s), checking for duplicate tags...`);
            const duplicateErrors = errorsArray.filter((err: any) => {
              const errId = err.id || err.properties?.id;
              const isDuplicate = errId === "duplicate_open_tag" || errId === "duplicate_close_tag";
              if (isDuplicate) {
                console.log(`   Found duplicate error: id=${errId}, context=${err.context || err.properties?.context}`);
              }
              return isDuplicate;
            });
            
            console.log(`loadWordTemplate: Found ${duplicateErrors.length} duplicate tag error(s) out of ${errorsArray.length} total`);
            
            if (duplicateErrors.length > 0) {
              console.log(`🔧 loadWordTemplate: Found duplicate tag errors, attempting to fix template...`);
              try {
                // 首先尝试常规修复
                let fixedBuffer = fixWordTemplate(content);
                
                // 如果常规修复没有效果，使用基于错误信息的修复
                const errorInfo = duplicateErrors.map((err: any) => ({
                  id: err.id || err.properties?.id,
                  context: err.context || err.properties?.context
                }));
                fixedBuffer = fixWordTemplateFromErrors(fixedBuffer, errorInfo);
                
                // Try again with fixed template
                const retryZip = new PizZip(fixedBuffer);
                const retryDoc = new Docxtemplater(retryZip, docOptions);
                
                console.log("✅ loadWordTemplate: Successfully fixed template and created Docxtemplater instance!");
                // Return the fixed content
                return fixedBuffer;
              } catch (retryError: any) {
                console.error("❌ loadWordTemplate: Retry after fix failed:", retryError.message);
                // Continue to return original content, let main handler try again
              }
            }
          }
        }
        
        // Return the fixed content
        return content;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to load template from ${templatePath}:`, errorMsg);
      continue;
    }
  }
  
  throw new Error("Could not load report-template.docx from any path");
}

// Build report data from inspection - unified data structure for HTML and Word
export type ExtendedFinding = {
  id: string;
  priority: string;
  title: string;
  risk_safety: "HIGH" | "MODERATE" | "LOW";
  risk_compliance: "HIGH" | "MEDIUM" | "LOW";
  risk_escalation: "HIGH" | "MODERATE" | "LOW";
  budget: "low" | "high" | "horizon";
  category: string;
};

/**
 * Internal report data structure (for backward compatibility)
 * Used by buildWordTemplateData and other legacy functions
 */
export type InternalReportData = {
  inspection_id: string;
  immediate: string[];
  recommended: string[];
  plan: string[];
  limitations: string[];
  capex_low_total: number;
  capex_high_total: number;
  capex_currency: string;
  capex_note: string;
  // Extended findings with risk/budget scores
  extended_findings: ExtendedFinding[];
  // Overall risk assessment
  overall_risk_level: "Low" | "Moderate" | "Elevated";
  RISK_RATING: string;
  OVERALL_STATUS: string;
  OVERALL_STATUS_BADGE: string;
  // Executive Decision Signals
  EXECUTIVE_DECISION_SIGNALS: string;
  // CapEx Snapshot
  CAPEX_SNAPSHOT: string;
  // Terms and Conditions
  TERMS_AND_CONDITIONS: string;
  // Dynamic Finding Pages
  DYNAMIC_FINDING_PAGES: string;
};

/**
 * @deprecated Use PlaceholderReportData from placeholderMap.ts instead
 * This type is kept for backward compatibility only
 */
export type ReportData = InternalReportData;

/**
 * Word template placeholder data structure
 * All fields must be strings, never undefined/null
 */
export type WordTemplateData = {
  // Basic information (Priority 1: from inspection.raw)
  INSPECTION_ID: string;
  ASSESSMENT_DATE: string;
  PREPARED_FOR: string;
  PREPARED_BY: string;
  PROPERTY_ADDRESS: string;
  PROPERTY_TYPE: string;
  
  // Findings sections (Priority 1: from findings + responses.yml)
  IMMEDIATE_FINDINGS: string;
  RECOMMENDED_FINDINGS: string;
  PLAN_FINDINGS: string;
  LIMITATIONS: string;
  URGENT_FINDINGS: string;
  
  // Report metadata (Priority 2: calculated from findings count)
  REPORT_VERSION: string;
  OVERALL_STATUS: string;
  OVERALL_ELECTRICAL_STATUS: string; // Alias for OVERALL_STATUS (for Word template compatibility)
  EXECUTIVE_SUMMARY: string;
  RISK_RATING: string;
  RISK_RATING_FACTORS: string;
  
  // Priority interpretations (Priority 2: calculated)
  PRIORITY_IMMEDIATE_DESC: string;
  PRIORITY_IMMEDIATE_INTERP: string;
  PRIORITY_RECOMMENDED_DESC: string;
  PRIORITY_RECOMMENDED_INTERP: string;
  PRIORITY_PLAN_DESC: string;
  PRIORITY_PLAN_INTERP: string;
  
  // Technical sections (Priority 1/2/3)
  TEST_SUMMARY: string;
  TECHNICAL_NOTES: string;
  
  // Dynamic Finding Pages (Pages 6–10)
  DYNAMIC_FINDING_PAGES: string;
};

/** Finding with optional custom budget (for CapEx aggregation). */
type FindingForCapEx = { id: string; priority: string; budget_low?: number; budget_high?: number };

/**
 * Format CapEx range as "AUD $X – $Y" with comma-separated thousands (no duplicated currency).
 */
function formatCapExRangeWithCommas(low: number, high: number, currency = "AUD"): string {
  const lo = Number.isFinite(low) ? low : 0;
  const hi = Number.isFinite(high) ? high : 0;
  return `${currency} $${lo.toLocaleString("en-US")} – $${hi.toLocaleString("en-US")}`;
}

/**
 * Calculate CapEx summary from findings (0–5 year horizon).
 * Only includes items with priority in {Urgent, Budgetary}; excludes Acceptable (PLAN_MONITOR).
 * For custom findings, prefers budget_low/budget_high when provided; else uses responses.yml budgetary_range.
 */
function calculateCapExSummary(
  findings: FindingForCapEx[],
  findingsMap: Record<string, any>
): { low_total: number; high_total: number; currency: string; note: string } {
  let lowTotal = 0;
  let highTotal = 0;
  let currency = "AUD";
  const notes: string[] = [];
  let hasAnyRange = false;

  const relevantFindings = findings.filter(
    f => f.priority === "IMMEDIATE" || f.priority === "URGENT" || f.priority === "RECOMMENDED_0_3_MONTHS"
  );

  relevantFindings.forEach((finding) => {
    const hasCustom = typeof finding.budget_low === "number" && typeof finding.budget_high === "number";
    let low = 0;
    let high = 0;
    let rangeCurrency: string | undefined;
    let rangeNote: string | undefined;

    if (hasCustom) {
      low = finding.budget_low!;
      high = finding.budget_high!;
      rangeCurrency = "AUD";
    } else {
      const response = findingsMap[finding.id];
      // Note: budgetary_range is not part of FindingMessage type, but may exist in YAML fallback
      const responseAny = response as any;
      const range = responseAny?.budgetary_range;
      if (typeof range === "object" && range !== null) {
        low = typeof range.low === "number" ? range.low : 0;
        high = typeof range.high === "number" ? range.high : 0;
        rangeCurrency = range.currency;
        rangeNote = range.note;
      }
    }

    if (low > 0 || high > 0) {
      lowTotal += low;
      highTotal += high;
      hasAnyRange = true;
      if (rangeCurrency) currency = rangeCurrency;
      if (rangeNote) notes.push(rangeNote);
    }
  });

  if (!hasAnyRange || (lowTotal === 0 && highTotal === 0)) {
    return {
      low_total: 0,
      high_total: 0,
      currency: "AUD",
      note: "No budgetary estimates available. Detailed quotations required from licensed electrical contractors."
    };
  }

  const combinedNote = notes.length > 0
    ? `Indicative ranges based on ${relevantFindings.length} finding(s). ${notes.slice(0, 2).join("; ")}`
    : `Indicative ranges based on ${relevantFindings.length} finding(s).`;

  return {
    low_total: lowTotal,
    high_total: highTotal,
    currency,
    note: combinedNote
  };
}

export type BuildReportDataOptions = {
  /** When true, skip REPORT_BODY_HTML / placeholder validation logs (used when building for Gold template) */
  forGoldTemplate?: boolean;
};

/**
 * Build complete Word template placeholder data from inspection
 * Returns all placeholders used in Gold_Sample_Ideal_Report_Template.docx
 * All fields are guaranteed to be strings (never undefined)
 */
export async function buildReportData(
  inspection: StoredInspection,
  event?: HandlerEvent,
  options?: BuildReportDataOptions
): Promise<PlaceholderReportData & Pick<InternalReportData, "capex_low_total" | "capex_high_total" | "capex_currency" | "capex_note">> {
  // Global 9-dim overrides (Config → 9 维全局) apply to all reports
  const globalOverrides = event ? await loadFindingDimensionsGlobal(event) : {};
  // Enrich findings with priority_calculated (custom) and priority_final (all); use for report
  const findings = await enrichFindingsWithCalculatedPriority(inspection, event, { globalOverrides: globalOverrides as Record<string, import("./lib/customFindingPriority").FindingDimensionsDebugOverride> });
  const effectivePriority = (f: { priority_final?: string; priority?: string }) => f.priority_final ?? f.priority ?? "PLAN_MONITOR";
  /** Findings with .priority set to effective (for functions that only read .priority) */
  const findingsWithEffectivePriority = findings.map(f => ({ ...f, priority: effectivePriority(f) }));

  // Load messages: DB-first, YAML-fallback
  const { getFindingMessagesBatch } = await import("./lib/getFindingMessage");
  const findingIds = findings.map((f) => f.id);
  const findingsMap = await getFindingMessagesBatch(findingIds);

  // Effective data: DB override first, else YAML/responses (for copy and 9 dims)
  const effectiveMap = new Map<string, Awaited<ReturnType<typeof getEffectiveFinding>>>();
  try {
    for (const f of findings) {
      if (!effectiveMap.has(f.id)) {
        const ef = await getEffectiveFinding(f.id);
        if (ef) effectiveMap.set(f.id, ef);
      }
    }
  } catch (e) {
    console.warn("[buildReportData] getEffectiveFinding fallback to YAML:", e);
  }

  // Load finding profiles (fallback when effective missing)
  const profiles = loadFindingProfiles();
  
  // Group findings by priority and use standardized text from responses.yml or effective definition
  const immediate: string[] = [];
  const recommended: string[] = [];
  const plan: string[] = [];
  const extendedFindings: ExtendedFinding[] = [];
  
  // Track risk scores for overall risk calculation
  const urgentFindings: ExtendedFinding[] = [];
  const recommendedFindings: ExtendedFinding[] = [];
  
  findings.forEach((finding) => {
    const findingCode = finding.id;
    const priority = effectivePriority(finding);
    const findingResponse = findingsMap[findingCode];
    const effective = effectiveMap.get(findingCode);
    
    // Copy/title: effective definition first, else responses.yml, else profile
    let findingText: string;
    if (effective?.definition?.title_en) {
      findingText = effective.definition.title_en;
    } else if (findingResponse && findingResponse.title) {
      findingText = findingResponse.title;
    } else {
      findingText = finding.title || findingCode.replace(/_/g, " ");
    }
    
    const profile = getFindingProfile(findingCode);
    const findingTitle = effective?.definition?.title_en ?? profile.messaging?.title ?? findingText;
    const dims = effective?.dimensions;
    
    // Create extended finding (use priority_final for report); 9 dims from effective else profile
    const extendedFinding: ExtendedFinding = {
      id: findingCode,
      priority,
      title: findingTitle,
      risk_safety: dims?.safety ?? profile.risk?.safety ?? "LOW",
      risk_compliance: dims?.liability ?? profile.risk?.compliance ?? "LOW",
      risk_escalation: dims?.escalation ?? profile.risk?.escalation ?? "LOW",
      budget: profile.budget || "horizon",
      category: profile.category || "OTHER",
    };
    
    extendedFindings.push(extendedFinding);
    
    // Group by priority for text lists (use priority_final)
    if (priority === "IMMEDIATE" || priority === "URGENT") {
      immediate.push(findingText);
      urgentFindings.push(extendedFinding);
    } else if (priority === "RECOMMENDED_0_3_MONTHS") {
      recommended.push(findingText);
      recommendedFindings.push(extendedFinding);
    } else if (priority === "PLAN_MONITOR") {
      plan.push(findingText);
    }
  });
  
  // Use new Priority × Risk × Budget scoring model (priority_final)
  const findingsForScoring: FindingForScoring[] = findings.map(f => ({
    id: f.id,
    priority: effectivePriority(f),
  }));
  
  // Convert profiles to scoring format; prefer effective/custom budget_low/high, else responses.yml
  const profilesForScoring: Record<string, any> = {};
  for (const finding of findings) {
    const profile = getFindingProfile(finding.id);
    const response = findingsMap[finding.id];
    const effective = effectiveMap.get(finding.id);
    const scoringProfile = convertProfileForScoring(profile);
    // Note: budgetary_range is not part of FindingMessage type, but may exist in YAML fallback
    const responseAny = response as any;

    if (typeof finding.budget_low === "number" && typeof finding.budget_high === "number") {
      scoringProfile.budget = { low: finding.budget_low, high: finding.budget_high };
    } else if (effective?.dimensions?.budget_low != null || effective?.dimensions?.budget_high != null) {
      scoringProfile.budget = {
        low: typeof effective.dimensions.budget_low === "number" ? effective.dimensions.budget_low : 0,
        high: typeof effective.dimensions.budget_high === "number" ? effective.dimensions.budget_high : 0,
      };
    } else if (responseAny?.budgetary_range && typeof responseAny.budgetary_range === "object") {
      const range = responseAny.budgetary_range;
      if (range.low !== undefined || range.high !== undefined) {
        scoringProfile.budget = {
          low: typeof range.low === "number" ? range.low : 0,
          high: typeof range.high === "number" ? range.high : 0,
        };
      }
    }

    profilesForScoring[finding.id] = scoringProfile;
  }
  
  // Compute overall score using new model
  const overallScore = computeOverall(findingsForScoring, profilesForScoring);
  
  // Calculate top findings: compute score for each finding and sort by score (descending), take top 3
  const findingsWithScores: Array<{ finding: typeof findings[0], score: number, title: string }> = [];
  for (const finding of findings) {
    const profile = profilesForScoring[finding.id];
    const pri = effectivePriority(finding);
    const score = findingScore(profile || {}, pri);
    
    // Get title from response or profile or finding
    const response = findingsMap[finding.id];
    const profileObj = getFindingProfile(finding.id);
    const title = profileObj.messaging?.title || response?.title || finding.title || finding.id.replace(/_/g, " ");
    
    findingsWithScores.push({ finding, score, title });
  }
  
  // Sort by score descending and take top 3
  const topFindings: TopFinding[] = findingsWithScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => ({
      id: item.finding.id,
      title: item.title,
      priority: effectivePriority(item.finding),
      score: item.score,
    }));
  
  // Count findings by priority (use priority_final)
  const counts = {
    immediate: findings.filter(f => effectivePriority(f) === "IMMEDIATE").length,
    urgent: findings.filter(f => effectivePriority(f) === "URGENT").length,
    recommended: findings.filter(f => effectivePriority(f) === "RECOMMENDED_0_3_MONTHS").length,
    plan: findings.filter(f => effectivePriority(f) === "PLAN_MONITOR").length,
  };
  
  // Generate Executive Decision Signals
  // Convert dominant_risk array to single value for compatibility
  // Use first element if available, or map category to old format
  // CapEx summary and formatted range (before executive signals so we pass capex_formatted, no duplicate currency)
  const CAPEX_SNAPSHOT_EARLY = overallScore.CAPEX_SNAPSHOT;
  const capexSummaryEarly =
    overallScore.CAPEX_LOW != null || overallScore.CAPEX_HIGH != null
      ? {
          low_total: overallScore.CAPEX_LOW ?? overallScore.capex_low,
          high_total: overallScore.CAPEX_HIGH ?? overallScore.capex_high,
          currency: "AUD",
          note: `Indicative ranges based on ${findingsForScoring.length} finding(s).`,
        }
      : calculateCapExSummary(findingsWithEffectivePriority, findingsMap);
  const CAPEX_RANGE_STRING =
    (capexSummaryEarly.low_total > 0 || capexSummaryEarly.high_total > 0)
      ? formatCapExRangeWithCommas(capexSummaryEarly.low_total, capexSummaryEarly.high_total, capexSummaryEarly.currency || "AUD")
      : "To be confirmed";

  let dominantRiskForSignals: "safety" | "compliance" | "escalation" | undefined = undefined;
  if (overallScore.dominant_risk && overallScore.dominant_risk.length > 0) {
    const firstRisk = overallScore.dominant_risk[0].toUpperCase();
    if (firstRisk === "SAFETY" || firstRisk === "SHOCK" || firstRisk === "FIRE" || firstRisk === "LIFE_SAFETY") {
      dominantRiskForSignals = "safety";
    } else if (firstRisk === "COMPLIANCE") {
      dominantRiskForSignals = "compliance";
    } else if (firstRisk === "ESCALATION" || firstRisk === "RELIABILITY" || firstRisk === "LEGACY") {
      dominantRiskForSignals = "escalation";
    }
  }

  const executiveSignals = generateExecutiveSignals({
    overall_level: overallScore.overall_level,
    counts,
    capex: {
      low: overallScore.capex_low,
      high: overallScore.capex_high,
    },
    capex_incomplete: overallScore.capex_incomplete,
    topFindings,
    dominantRisk: overallScore.dominant_risk.length > 0 ? overallScore.dominant_risk : dominantRiskForSignals,
    capex_formatted: CAPEX_RANGE_STRING,
    time_horizon: "0–5 years",
  });

  // Format EXECUTIVE_DECISION_SIGNALS: bullets with "• " prefix, joined by newlines (max 4 bullets)
  const EXECUTIVE_DECISION_SIGNALS = executiveSignals.bullets
    .map(bullet => `• ${bullet}`)
    .join("\n") || "• No immediate safety hazards detected. Conditions can be managed within standard asset planning cycles.";
  
  // Map overall_level to old format for compatibility (used when property signals not applied)
  let overallRiskLevelFromScoring: "Low" | "Moderate" | "Elevated";
  switch (overallScore.overall_level) {
    case "ELEVATED":
      overallRiskLevelFromScoring = "Elevated";
      break;
    case "MODERATE":
      overallRiskLevelFromScoring = "Moderate";
      break;
    case "LOW":
      overallRiskLevelFromScoring = "Low";
      break;
    default:
      overallRiskLevelFromScoring = "Moderate";
  }

  // Property signals: D1–D9 from standard + custom → OVERALL_RISK_LABEL (deterministic)
  const completedById = new Map<string, CustomFindingDimensions & { id?: string }>();
  const completedList = (inspection.raw?.custom_findings_completed as Array<CustomFindingDimensions & { id?: string }>) ?? [];
  for (const c of completedList) {
    if (c?.id) completedById.set(String(c.id), c);
  }
  const dimensionsList: FindingDimensions[] = [];
  for (const f of findings) {
    const customDims = completedById.get(f.id);
    if (customDims) {
      dimensionsList.push(customDimensionsToFindingDimensions(customDims));
    } else {
      dimensionsList.push(profileToFindingDimensions(getFindingProfile(f.id)));
    }
  }
  let OVERALL_RISK_LABEL: "Low" | "Moderate" | "Elevated";
  if (dimensionsList.length > 0) {
    const propertySignals = derivePropertySignals(dimensionsList);
    OVERALL_RISK_LABEL = overallHealthToRiskLabel(propertySignals.overall_health);
    const hasUrgentLiability = findings.some(
      (f) => effectivePriority(f) === "IMMEDIATE" || effectivePriority(f) === "URGENT"
    );
    if (hasUrgentLiability && OVERALL_RISK_LABEL === "Low") OVERALL_RISK_LABEL = "Moderate";
  } else {
    OVERALL_RISK_LABEL = overallRiskLevelFromScoring;
  }

  // Generate RISK_RATING / OVERALL_STATUS / OVERALL_STATUS_BADGE from scoring model
  const RISK_RATING = overallScore.badge || "🟡 Moderate";
  const OVERALL_STATUS = overallScore.badge || "🟡 Moderate";
  const OVERALL_STATUS_BADGE = overallScore.badge || "🟡 Moderate";

  const CAPEX_SNAPSHOT = CAPEX_SNAPSHOT_EARLY;
  const capexSummary = capexSummaryEarly;

  // Load Terms and Conditions
  const TERMS_AND_CONDITIONS = await loadTermsAndConditions();
  
  const photoBaseUrl = getBaseUrl(event);
  const photoSigningSecret = process.env.REPORT_PHOTO_SIGNING_SECRET;
  console.log("[report] photo baseUrl:", photoBaseUrl);
  const inspectionWithEffectivePriority = { ...inspection, findings: findingsWithEffectivePriority };
  const DYNAMIC_FINDING_PAGES = await generateDynamicFindingPages(inspectionWithEffectivePriority, event, photoBaseUrl, photoSigningSecret);
  
  // Load default text for additional fields
  const defaultText = await loadDefaultText(event);
  
  // Normalize inspection to get canonical fields
  const { canonical } = normalizeInspection(inspection.raw || {}, inspection.inspection_id);
  
  // Format assessment_date
  let assessmentDate = canonical.assessment_date || defaultText.ASSESSMENT_DATE || new Date().toISOString().split('T')[0];
  if (assessmentDate && !assessmentDate.includes("-")) {
    try {
      const date = new Date(assessmentDate);
      if (!isNaN(date.getTime())) {
        assessmentDate = date.toISOString().split('T')[0];
      }
    } catch (e) {
      // Keep original value
    }
  }
  
  // Build Test Summary and Technical Notes from canonical test_data with mandatory fallback
  const { testSummary, technicalNotes } = buildTestDataAndNotes(
    canonical.test_data || {},
    canonical.technician_notes || "",
    inspection.limitations || [],
    defaultText
  );
  
  // Build priority table rows
  const priorityTableRows: string[] = [];
  if (immediate.length > 0) {
    priorityTableRows.push(`| 🔴 Immediate Action Required | ${immediate.length} | Urgent Liability Risk |`);
  }
  if (recommended.length > 0) {
    priorityTableRows.push(`| 🟡 Planning & Budgeting | ${recommended.length} | Budgetary Provision Recommended |`);
  }
  if (plan.length > 0) {
    priorityTableRows.push(`| 🟢 Planning & Monitoring | ${plan.length} | Acceptable |`);
  }
  const PRIORITY_TABLE_ROWS = priorityTableRows.join("\n");
  
  // Build limitations section
  const LIMITATIONS_SECTION = inspection.limitations && inspection.limitations.length > 0
    ? inspection.limitations.join("; ")
    : "Areas that are concealed, locked, or otherwise inaccessible were not inspected.";
  
  // Build CapEx table rows from findings and profiles (use enriched findings with priority_final)
  const CAPEX_TABLE_ROWS = buildCapExTableRows(
    findingsWithEffectivePriority,
    profilesForScoring,
    findingsMap
  );
  
  const CAPEX_RANGE = CAPEX_RANGE_STRING;
  
  // Build executive summary
  const EXECUTIVE_SUMMARY = executiveSignals.bullets.join(" ") || "This property presents a moderate electrical risk profile at the time of inspection.";
  
  // Build placeholder data object
  const placeholderData: Partial<PlaceholderReportData> = {
    // Page 1 – Cover
    PROPERTY_ADDRESS: canonical.property_address || defaultText.PROPERTY_ADDRESS || "-",
    CLIENT_NAME: canonical.prepared_for || defaultText.PREPARED_FOR || "-",
    PREPARED_FOR: canonical.prepared_for || defaultText.PREPARED_FOR || "-",
    ASSESSMENT_DATE: assessmentDate,
    REPORT_ID: inspection.inspection_id || "-",
    INSPECTION_ID: inspection.inspection_id || "-",
    REPORT_VERSION: defaultText.REPORT_VERSION || "1.0",
    PREPARED_BY: canonical.prepared_by || defaultText.PREPARED_BY || "-",
    
    // Page 2 – Purpose & How to Read
    PURPOSE_PARAGRAPH: defaultText.PURPOSE_PARAGRAPH || PLACEHOLDER_DEFAULTS.PURPOSE_PARAGRAPH,
    HOW_TO_READ_TEXT: defaultText.HOW_TO_READ_PARAGRAPH || PLACEHOLDER_DEFAULTS.HOW_TO_READ_TEXT,
    HOW_TO_READ_PARAGRAPH: defaultText.HOW_TO_READ_PARAGRAPH || PLACEHOLDER_DEFAULTS.HOW_TO_READ_PARAGRAPH,
    WHAT_THIS_MEANS_TEXT: defaultText.HOW_TO_READ_PARAGRAPH || PLACEHOLDER_DEFAULTS.WHAT_THIS_MEANS_TEXT,
    
    // Page 3 – Executive Summary
    OVERALL_STATUS_BADGE: OVERALL_STATUS_BADGE,
    EXEC_SUMMARY_TEXT: EXECUTIVE_DECISION_SIGNALS,
    EXECUTIVE_DECISION_SIGNALS: EXECUTIVE_DECISION_SIGNALS,
    EXECUTIVE_SUMMARY: EXECUTIVE_SUMMARY,
    CAPEX_SNAPSHOT: CAPEX_SNAPSHOT,
    
    // Page 4 – Priority Overview
    PRIORITY_TABLE_ROWS: PRIORITY_TABLE_ROWS,
    
    // Page 5 – Scope & Limitations
    SCOPE_TEXT: defaultText.SCOPE_SECTION || PLACEHOLDER_DEFAULTS.SCOPE_TEXT,
    SCOPE_SECTION: defaultText.SCOPE_SECTION || PLACEHOLDER_DEFAULTS.SCOPE_SECTION,
    LIMITATIONS_SECTION: LIMITATIONS_SECTION,
    
    // Pages 6–10 – Observed Conditions
    DYNAMIC_FINDING_PAGES: DYNAMIC_FINDING_PAGES,
    DYNAMIC_FINDING_PAGES_HTML: DYNAMIC_FINDING_PAGES
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br/>")
      .replace(/^/, "<p>")
      .replace(/$/, "</p>"),
    
    // Page 11 – Thermal Imaging
    THERMAL_METHOD: defaultText.THERMAL_METHOD || PLACEHOLDER_DEFAULTS.THERMAL_METHOD,
    THERMAL_FINDINGS: defaultText.THERMAL_FINDINGS || PLACEHOLDER_DEFAULTS.THERMAL_FINDINGS,
    THERMAL_VALUE_STATEMENT: defaultText.THERMAL_VALUE_STATEMENT || PLACEHOLDER_DEFAULTS.THERMAL_VALUE_STATEMENT,
    
    // Page 12 – CapEx Roadmap
    CAPEX_TABLE_ROWS: CAPEX_TABLE_ROWS,
    CAPEX_DISCLAIMER_LINE: defaultText.CAPEX_DISCLAIMER_LINE || PLACEHOLDER_DEFAULTS.CAPEX_DISCLAIMER_LINE,
    
    // Page 13 – Decision Pathways
    DECISION_PATHWAYS_TEXT: defaultText.DECISION_PATHWAYS_SECTION || PLACEHOLDER_DEFAULTS.DECISION_PATHWAYS_TEXT,
    DECISION_PATHWAYS_SECTION: defaultText.DECISION_PATHWAYS_SECTION || PLACEHOLDER_DEFAULTS.DECISION_PATHWAYS_SECTION,
    
    // Page 14 – Terms & Conditions
    TERMS_AND_CONDITIONS_TEXT: TERMS_AND_CONDITIONS,
    TERMS_AND_CONDITIONS: TERMS_AND_CONDITIONS,
    
    // Page 15 – Closing
    CLOSING_STATEMENT: defaultText.CLOSING_STATEMENT || PLACEHOLDER_DEFAULTS.CLOSING_STATEMENT,
    
    // Additional sections
    METHODOLOGY_TEXT: defaultText.METHODOLOGY_TEXT || PLACEHOLDER_DEFAULTS.METHODOLOGY_TEXT,
    RISK_FRAMEWORK_TEXT: defaultText.RISK_FRAMEWORK_TEXT || PLACEHOLDER_DEFAULTS.RISK_FRAMEWORK_TEXT,
    APPENDIX_TEST_NOTES_TEXT: testSummary || defaultText.TEST_SUMMARY || PLACEHOLDER_DEFAULTS.APPENDIX_TEST_NOTES_TEXT,
    TEST_SUMMARY: testSummary || defaultText.TEST_SUMMARY || PLACEHOLDER_DEFAULTS.TEST_SUMMARY,
    TECHNICAL_NOTES: technicalNotes || defaultText.TECHNICAL_NOTES || PLACEHOLDER_DEFAULTS.TECHNICAL_NOTES,
    
    // Additional metadata (OVERALL_RISK_LABEL from property signals + urgent floor)
    OVERALL_RISK_LABEL: OVERALL_RISK_LABEL,
    OVERALL_STATUS: OVERALL_STATUS,
    RISK_RATING: RISK_RATING,
    CAPEX_RANGE: CAPEX_RANGE,
    REPORT_BODY_HTML: "", // Will be populated by markdownToHtml if needed
  };
  
  // Use ensureAllPlaceholders to guarantee all fields are present and non-empty
  const completeData = ensureAllPlaceholders(placeholderData, { skipValidationLog: options?.forGoldTemplate });
  
  // Validate against placeholder map and log warnings (skip when building for Gold template)
  const validation = validateReportDataAgainstPlaceholderMap(completeData);
  
  if (validation.missingRequired.length > 0) {
    if (!options?.forGoldTemplate) {
      console.warn("⚠️ CRITICAL: Missing required placeholders after ensureAllPlaceholders:", validation.missingRequired.join(", "));
    }
    for (const key of validation.missingRequired) {
      (completeData as any)[key] = PLACEHOLDER_DEFAULTS[key] || "-";
    }
  }
  
  if (validation.missingOptional.length > 0 && !options?.forGoldTemplate) {
    console.log("ℹ️ Optional placeholders not populated:", validation.missingOptional.join(", "));
  }
  
  // Ensure Terms & Conditions is always populated
  if (!completeData.TERMS_AND_CONDITIONS || completeData.TERMS_AND_CONDITIONS === "") {
    console.warn("⚠️ TERMS_AND_CONDITIONS is empty, using default");
    completeData.TERMS_AND_CONDITIONS = PLACEHOLDER_DEFAULTS.TERMS_AND_CONDITIONS;
    completeData.TERMS_AND_CONDITIONS_TEXT = PLACEHOLDER_DEFAULTS.TERMS_AND_CONDITIONS;
  }
  
  // Sanitize all values before returning
  const sanitized = sanitizeObject(completeData);
  
  // Final validation: ensure no undefined values
  for (const key in sanitized) {
    if (sanitized[key as keyof PlaceholderReportData] === undefined) {
      console.error(`❌ ERROR: ${key} is still undefined after sanitization!`);
      (sanitized as any)[key] = PLACEHOLDER_DEFAULTS[key as keyof typeof PLACEHOLDER_DEFAULTS] || "-";
    }
  }
  
  // Attach capex totals for consumers (e.g. generateReport Markdown)
  (sanitized as Record<string, unknown>).capex_low_total = capexSummaryEarly.low_total;
  (sanitized as Record<string, unknown>).capex_high_total = capexSummaryEarly.high_total;
  (sanitized as Record<string, unknown>).capex_currency = capexSummaryEarly.currency || "AUD";
  (sanitized as Record<string, unknown>).capex_note = capexSummaryEarly.note ?? "";
  
  return sanitized as PlaceholderReportData & Pick<InternalReportData, "capex_low_total" | "capex_high_total" | "capex_currency" | "capex_note">;
}

/**
 * Build cover data (6 fields only) for Word template
 * Used for Markdown-based report generation
 * 
 * @param inspection Inspection data
 * @param event Optional HandlerEvent for loading configs
 * @returns Cover data with 6 basic fields
 */
export async function buildCoverData(
  inspection: StoredInspection,
  event?: HandlerEvent
): Promise<Record<string, string>> {
  const defaultText = await loadDefaultText(event);
  
  const raw = inspection.raw || {};
  const { canonical } = normalizeInspection(raw, inspection.inspection_id);
  
  const inspectionId =
    canonical.inspection_id || inspection.inspection_id || defaultText.INSPECTION_ID || "-";
  
  // Format assessment_date; fallback: canonical → raw paths → defaultText → "-"
  let assessmentDate =
    canonical.assessment_date ||
    getFieldValue(raw, "created_at") ||
    getFieldValue(raw, "assessment_date") ||
    getFieldValue(raw, "date") ||
    defaultText.ASSESSMENT_DATE ||
    "";
  if (assessmentDate && !assessmentDate.includes("-")) {
    try {
      const date = new Date(assessmentDate);
      if (!isNaN(date.getTime())) {
        assessmentDate = date.toISOString().split("T")[0];
      }
    } catch (e) {
      // Keep original value
    }
  }
  if (!assessmentDate) assessmentDate = "-";
  
  const preparedFor =
    canonical.prepared_for ||
    getFieldValue(raw, "job.prepared_for") ||
    getFieldValue(raw, "client.name") ||
    defaultText.PREPARED_FOR ||
    "-";
  
  const propertyAddress =
    canonical.property_address ||
    getFieldValue(raw, "job.address") ||
    getFieldValue(raw, "address") ||
    defaultText.PROPERTY_ADDRESS ||
    "-";
  
  // PROPERTY_TYPE: canonical then raw then "Not specified"
  const propertyType =
    canonical.property_type ||
    getFieldValue(raw, "job.property_type") ||
    getFieldValue(raw, "property_type") ||
    getFieldValue(raw, "property.type") ||
    defaultText.PROPERTY_TYPE ||
    "Not specified";
  
  const preparedBy =
    canonical.prepared_by ||
    getFieldValue(raw, "signoff.technician_name") ||
    getFieldValue(raw, "prepared_by") ||
    defaultText.PREPARED_BY ||
    "-";
  
  // ASSESSMENT_PURPOSE: from raw first, then fixed default (filter "undefined" string)
  let assessmentPurpose =
    getFieldValue(raw, "assessment_purpose") ||
    getFieldValue(raw, "job.assessment_purpose") ||
    getFieldValue(raw, "purpose") ||
    "";
  if (!assessmentPurpose || assessmentPurpose === "undefined" || assessmentPurpose.trim() === "") {
    assessmentPurpose = "Decision-support electrical risk & CapEx planning assessment";
  }
  
  const coverData = {
    INSPECTION_ID: inspectionId,
    ASSESSMENT_DATE: assessmentDate,
    PREPARED_FOR: preparedFor,
    PREPARED_BY: preparedBy,
    PROPERTY_ADDRESS: propertyAddress,
    PROPERTY_TYPE: propertyType,
    ASSESSMENT_PURPOSE: assessmentPurpose,
  };
  
  // Sanitize all values before returning
  return sanitizeObject(coverData);
}

/**
 * Build Word template data with three-tier priority system:
 * 
 * Priority 1 (Highest):
 * - inspection.raw (basic fields)
 * - findings + responses.yml (title + why_it_matters + recommended_action)
 * 
 * Priority 2 (Calculated):
 * - Calculated from findings count:
 *   OVERALL_STATUS, RISK_RATING, EXECUTIVE_SUMMARY, PRIORITY_*_INTERP
 * 
 * Priority 3 (Fallback):
 * - DEFAULT_REPORT_TEXT.md default values
 * 
 * @param inspection Inspection data
 * @param reportData Findings grouped by priority
 * @param event Optional HandlerEvent for loading configs
 * @returns Complete Word template data with all placeholders as strings
 * 
 * @deprecated This function is kept for backward compatibility.
 * For new Markdown-based reports, use buildCoverData + buildReportMarkdown instead.
 */
export async function buildWordTemplateData(
  inspection: StoredInspection,
  reportData: InternalReportData,
  event?: HandlerEvent
): Promise<WordTemplateData> {
  // Load all data sources
  const defaultText = await loadDefaultText(event);
  const raw = inspection.raw;

  // Load messages: DB-first, YAML-fallback
  const findings = reportData.findings || [];
  const findingIds = findings.map((f) => f.id);
  const { getFindingMessagesBatch } = await import("./lib/getFindingMessage");
  const findingsMap = await getFindingMessagesBatch(findingIds);
  
  // ========================================================================
  // PRIORITY 1: inspection.raw (basic fields)
  // ========================================================================
  const inspectionId = inspection.inspection_id || defaultText.INSPECTION_ID;
  
  const createdAt = getFieldValue(raw, "created_at");
  const assessmentDate = createdAt 
    ? new Date(createdAt).toISOString().split('T')[0]
    : (new Date().toISOString().split('T')[0] || defaultText.ASSESSMENT_DATE);
  
  const propertyAddress = getFieldValue(raw, "job.address") || defaultText.PROPERTY_ADDRESS;
  const propertyType = getFieldValue(raw, "job.property_type") || defaultText.PROPERTY_TYPE;
  const preparedFor = getFieldValue(raw, "client.name") || getFieldValue(raw, "client.client_type") || defaultText.PREPARED_FOR;
  const preparedBy = getFieldValue(raw, "signoff.technician_name") || defaultText.PREPARED_BY;
  
  // ========================================================================
  // PRIORITY 1: findings + responses.yml
  // Uses all available fields: title, why_it_matters, recommended_action, planning_guidance
  // Format varies based on finding.priority:
  //   - IMMEDIATE: Emphasizes why_it_matters + recommended_action (urgent)
  //   - RECOMMENDED_0_3_MONTHS: Includes all fields, emphasizes recommended_action + planning_guidance
  //   - PLAN_MONITOR: Emphasizes planning_guidance, includes why_it_matters + recommended_action
  // ========================================================================
  
  /**
   * Format finding with full details from responses.yml
   * Uses all available fields: title, why_it_matters, recommended_action, planning_guidance
   * Format varies based on finding priority
   */
  function formatFindingWithDetails(finding: { id: string; title?: string; priority: string }): string {
    const findingCode = finding.id;
    const findingResponse = findingsMap[findingCode];
    
    // Get title (always required)
    const title = findingResponse?.title || finding.title || findingCode.replace(/_/g, " ");
    
    // Build finding text based on priority
    const parts: string[] = [];
    
    // Always start with title
    parts.push(title);
    
    // Get priority for conditional formatting
    const priority = finding.priority;
    
    // IMMEDIATE: Emphasize why_it_matters and recommended_action (urgent)
    if (priority === "IMMEDIATE") {
      if (findingResponse?.why_it_matters) {
        parts.push(`\n\nWhy it matters: ${findingResponse.why_it_matters}`);
      }
      if (findingResponse?.recommended_action) {
        parts.push(`\n\nRecommended action: ${findingResponse.recommended_action}`);
      }
      // Planning guidance is less critical for immediate items, but include if available
      if (findingResponse?.planning_guidance) {
        parts.push(`\n\nPlanning guidance: ${findingResponse.planning_guidance}`);
      }
    }
    // RECOMMENDED_0_3_MONTHS: Include all fields with emphasis on recommended_action and planning_guidance
    else if (priority === "RECOMMENDED_0_3_MONTHS") {
      if (findingResponse?.why_it_matters) {
        parts.push(`\n\nWhy it matters: ${findingResponse.why_it_matters}`);
      }
      if (findingResponse?.recommended_action) {
        parts.push(`\n\nRecommended action: ${findingResponse.recommended_action}`);
      }
      if (findingResponse?.planning_guidance) {
        parts.push(`\n\nPlanning guidance: ${findingResponse.planning_guidance}`);
      }
    }
    // PLAN_MONITOR: Emphasize planning_guidance, include why_it_matters and recommended_action
    else if (priority === "PLAN_MONITOR") {
      if (findingResponse?.why_it_matters) {
        parts.push(`\n\nWhy it matters: ${findingResponse.why_it_matters}`);
      }
      if (findingResponse?.planning_guidance) {
        parts.push(`\n\nPlanning guidance: ${findingResponse.planning_guidance}`);
      }
      if (findingResponse?.recommended_action) {
        parts.push(`\n\nRecommended action: ${findingResponse.recommended_action}`);
      }
    }
    // Fallback: Include all fields if priority doesn't match
    else {
      if (findingResponse?.why_it_matters) {
        parts.push(`\n\nWhy it matters: ${findingResponse.why_it_matters}`);
      }
      if (findingResponse?.recommended_action) {
        parts.push(`\n\nRecommended action: ${findingResponse.recommended_action}`);
      }
      if (findingResponse?.planning_guidance) {
        parts.push(`\n\nPlanning guidance: ${findingResponse.planning_guidance}`);
      }
    }
    
    return parts.join("");
  }
  
  const effectiveP = (f: { priority_final?: string; priority?: string }) => f.priority_final ?? f.priority ?? "PLAN_MONITOR";
  const immediateFindings: string[] = [];
  const recommendedFindings: string[] = [];
  const planFindings: string[] = [];

  inspection.findings.forEach((finding) => {
    const pri = effectiveP(finding);
    const findingWithPriority = { ...finding, priority: pri };
    const formattedFinding = formatFindingWithDetails(findingWithPriority);
    if (pri === "IMMEDIATE" || pri === "URGENT") {
      immediateFindings.push(formattedFinding);
    } else if (pri === "RECOMMENDED_0_3_MONTHS") {
      recommendedFindings.push(formattedFinding);
    } else if (pri === "PLAN_MONITOR") {
      planFindings.push(formattedFinding);
    }
  });
  
  // Format as bullet-point text
  const immediateText = immediateFindings.length > 0
    ? immediateFindings.map(f => `• ${f}`).join("\n\n")
    : defaultText.IMMEDIATE_FINDINGS;
  
  const recommendedText = recommendedFindings.length > 0
    ? recommendedFindings.map(f => `• ${f}`).join("\n\n")
    : defaultText.RECOMMENDED_FINDINGS;
  
  const planText = planFindings.length > 0
    ? planFindings.map(f => `• ${f}`).join("\n\n")
    : defaultText.PLAN_FINDINGS;
  
  // Limitations
  const limitationsText = reportData.limitations.length > 0
    ? reportData.limitations.map(l => `• ${l}`).join("\n")
    : defaultText.LIMITATIONS;
  
  // Urgent findings (same as immediate)
  const urgentFindings = immediateText || defaultText.URGENT_FINDINGS;
  
  // ========================================================================
  // PRIORITY 2: Calculated from findings count
  // ========================================================================
  
  // RISK_RATING - Calculate based on immediate and recommended findings count
  // Logic: 
  // - If immediate findings exist → HIGH
  // - Else if recommended findings exist → MODERATE
  // - Else (no findings or only plan findings) → LOW (default)
  let riskRating: string;
  if (reportData.immediate.length > 0) {
    riskRating = "HIGH";
  } else if (reportData.recommended.length > 0) {
    riskRating = "MODERATE";
  } else {
    // Default to LOW if no immediate or recommended findings
    // This includes cases where findings array is empty or only contains plan findings
    riskRating = "LOW";
  }
  
  // Ensure RISK_RATING is never undefined
  if (!riskRating || riskRating.trim() === "") {
    riskRating = "LOW"; // Final fallback
  }
  
  // OVERALL_STATUS - Display as "LOW RISK" / "MODERATE RISK" / "HIGH RISK"
  const overallStatus = `${riskRating} RISK`;
  
  // EXECUTIVE_SUMMARY - Load templates and select based on RISK_RATING
  // For LOW RISK, customize based on whether plan findings exist
  const executiveSummaryTemplates = await loadExecutiveSummaryTemplates(event);
  let executiveSummary: string;
  
  // Select template based on calculated RISK_RATING
  if (riskRating === "HIGH") {
    executiveSummary = executiveSummaryTemplates.HIGH || defaultText.EXECUTIVE_SUMMARY;
  } else if (riskRating === "MODERATE") {
    executiveSummary = executiveSummaryTemplates.MODERATE || defaultText.EXECUTIVE_SUMMARY;
  } else {
    // LOW RISK - customize based on plan findings
    let lowRiskSummary = executiveSummaryTemplates.LOW || defaultText.EXECUTIVE_SUMMARY;
    
    // If there are plan findings, insert additional paragraph about maintenance observations
    if (reportData.plan.length > 0) {
      // Insert maintenance observations paragraph after the first paragraph
      const firstParagraphEnd = lowRiskSummary.indexOf("\n\n");
      if (firstParagraphEnd > 0) {
        const firstPart = lowRiskSummary.substring(0, firstParagraphEnd);
        const secondPart = lowRiskSummary.substring(firstParagraphEnd);
        executiveSummary = `${firstPart}\n\nA small number of non-urgent maintenance observations were noted. These do not require immediate action but should be addressed as part of routine property upkeep to maintain long-term reliability and compliance confidence.\n\n${secondPart}`;
      } else {
        // If no double newline found, append the paragraph
        executiveSummary = `${lowRiskSummary}\n\nA small number of non-urgent maintenance observations were noted. These do not require immediate action but should be addressed as part of routine property upkeep to maintain long-term reliability and compliance confidence.`;
      }
    } else {
      executiveSummary = lowRiskSummary;
    }
  }
  
  // Ensure EXECUTIVE_SUMMARY is never undefined
  if (!executiveSummary || executiveSummary.trim() === "") {
    executiveSummary = defaultText.EXECUTIVE_SUMMARY; // Final fallback
  }
  
  // RISK_RATING_FACTORS
  const riskFactors: string[] = [];
  if (reportData.immediate.length > 0) {
    riskFactors.push(`${reportData.immediate.length} immediate safety concern(s)`);
  }
  if (reportData.recommended.length > 0) {
    riskFactors.push(`${reportData.recommended.length} recommended action(s)`);
  }
  const riskRatingFactors = riskFactors.length > 0
    ? riskFactors.join(", ")
    : defaultText.RISK_RATING_FACTORS; // Priority 3 fallback
  
  // PRIORITY_*_INTERP (Priority interpretations)
  const priorityImmediateDesc = reportData.immediate.length > 0
    ? `Immediate safety concerns require urgent attention to prevent potential hazards.`
    : defaultText.PRIORITY_IMMEDIATE_DESC || "No immediate safety concerns identified.";
  
  const priorityImmediateInterp = reportData.immediate.length > 0
    ? `These items pose immediate safety risks and should be addressed as soon as possible, typically within 24-48 hours.`
    : defaultText.PRIORITY_IMMEDIATE_INTERP || "No immediate action required.";
  
  const priorityRecommendedDesc = reportData.recommended.length > 0
    ? `Recommended actions should be planned and completed within 0-3 months to maintain safety standards.`
    : defaultText.PRIORITY_RECOMMENDED_DESC || "No recommended actions identified.";
  
  const priorityRecommendedInterp = reportData.recommended.length > 0
    ? `These items require attention in the short term to prevent potential issues from developing into more serious problems.`
    : defaultText.PRIORITY_RECOMMENDED_INTERP || "No short-term actions required.";
  
  const priorityPlanDesc = reportData.plan.length > 0
    ? `Items identified for ongoing monitoring and future planning.`
    : defaultText.PRIORITY_PLAN_DESC || "No items identified for planning or monitoring.";
  
  const priorityPlanInterp = reportData.plan.length > 0
    ? `These items can be monitored over time and addressed during routine maintenance or future upgrades.`
    : defaultText.PRIORITY_PLAN_INTERP || "No ongoing monitoring required.";
  
  // ========================================================================
  // PRIORITY 3: Default values (fallback)
  // ========================================================================
  
  // REPORT_VERSION (hardcoded, but can be overridden by defaultText)
  const reportVersion = defaultText.REPORT_VERSION || "1.0";
  
  // TEST_SUMMARY (Priority 3 fallback)
  const testSummary = defaultText.TEST_SUMMARY;
  
  // TECHNICAL_NOTES (combine limitations with default)
  const technicalNotesParts: string[] = [];
  if (reportData.limitations.length > 0) {
    technicalNotesParts.push(`Limitations: ${reportData.limitations.join("; ")}`);
  }
  technicalNotesParts.push(defaultText.TECHNICAL_NOTES);
  const technicalNotes = technicalNotesParts.join(" ");
  
  // ========================================================================
  // Return complete Word template data
  // ========================================================================
  return {
    // Basic information (Priority 1)
    INSPECTION_ID: inspectionId,
    ASSESSMENT_DATE: assessmentDate,
    PREPARED_FOR: preparedFor,
    PREPARED_BY: preparedBy,
    PROPERTY_ADDRESS: propertyAddress,
    PROPERTY_TYPE: propertyType,
    
    // Findings sections (Priority 1)
    IMMEDIATE_FINDINGS: immediateText,
    RECOMMENDED_FINDINGS: recommendedText,
    PLAN_FINDINGS: planText,
    LIMITATIONS: limitationsText,
    URGENT_FINDINGS: urgentFindings,
    
    // Report metadata (Priority 2)
    REPORT_VERSION: reportVersion,
    OVERALL_STATUS: overallStatus,
    OVERALL_ELECTRICAL_STATUS: overallStatus, // Alias for OVERALL_STATUS (for Word template compatibility)
    EXECUTIVE_SUMMARY: executiveSummary,
    RISK_RATING: riskRating,
    RISK_RATING_FACTORS: riskRatingFactors,
    
    // Priority interpretations (Priority 2)
    PRIORITY_IMMEDIATE_DESC: priorityImmediateDesc,
    PRIORITY_IMMEDIATE_INTERP: priorityImmediateInterp,
    PRIORITY_RECOMMENDED_DESC: priorityRecommendedDesc,
    PRIORITY_RECOMMENDED_INTERP: priorityRecommendedInterp,
    PRIORITY_PLAN_DESC: priorityPlanDesc,
    PRIORITY_PLAN_INTERP: priorityPlanInterp,
    
    // Technical sections (Priority 1/2/3)
    TEST_SUMMARY: testSummary,
    TECHNICAL_NOTES: technicalNotes,
    
    // Dynamic Finding Pages (will be populated from reportData)
    DYNAMIC_FINDING_PAGES: "", // Placeholder, will be replaced by reportData.DYNAMIC_FINDING_PAGES
  };
}

// Format array as bullet-point text for Word document
function formatFindingsText(items: string[], defaultText: string): string {
  if (items.length === 0) {
    return defaultText;
  }
  return items.map(item => `• ${item}`).join("\n");
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    resetSanitizeFingerprint();
    const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    console.log("[report][RUN_ID]", RUN_ID, "handler started");

    const buildRef = process.env.COMMIT_REF ?? process.env.CONTEXT ?? process.env.BRANCH ?? "?";
    let pkgVersion = "?";
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
      pkgVersion = pkg.version ?? "?";
    } catch {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"));
        pkgVersion = pkg.version ?? "?";
      } catch {
        // ignore
      }
    }
    console.log("[report-fp] BUILD COMMIT_REF/CONTEXT/BRANCH:", buildRef, "package.version:", pkgVersion);

    // Extract inspection_id from query string or POST body
    let inspection_id: string | undefined;
    
    if (event.httpMethod === "GET") {
      const params = new URLSearchParams(event.rawQuery || "");
      inspection_id = params.get("inspection_id") || undefined;
    } else if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      inspection_id = body.inspection_id;
    }
    
    if (!inspection_id || typeof inspection_id !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "inspection_id is required" })
      };
    }
    
    console.log("Generating Word report for inspection_id:", inspection_id);
    
    // Get inspection data from store (try strong consistency to avoid stale photo_ids)
    console.log("Fetching inspection data...");
    let inspection = await get(inspection_id, event, true);
    if (!inspection) {
      inspection = await get(inspection_id, event);
    }
    
    if (!inspection) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Inspection not found" })
      };
    }

    const findingsWithPhotos = (inspection.findings || []).filter((f: any) => Array.isArray(f.photo_ids) && f.photo_ids.length > 0).length;
    const photosByFinding: Record<string, number> = {};
    for (const f of inspection.findings || []) {
      photosByFinding[f.id] = Array.isArray((f as any).photo_ids) ? (f as any).photo_ids.length : 0;
    }
    console.log("[photo-fp] inspection.findings photo summary: " + (inspection.findings || []).map((f) => `${f.id}=${photosByFinding[f.id] ?? 0}`).join(", "));
    console.log("[report-fp] inspection loaded id=" + inspection.inspection_id + " findings=" + (inspection.findings?.length ?? 0) + " findings_with_photos=" + findingsWithPhotos + " photos_by_finding=" + JSON.stringify(photosByFinding));
    console.log("[report][RUN_ID]", RUN_ID, "after load inspection", {
      inspection_id: inspection.inspection_id,
      findings_count: inspection.findings.length,
      limitations_count: inspection.limitations.length
    });
    
    // Load responses for Markdown generation
    const responses = await loadResponses(event);
    
    // Build computed fields (for Markdown generation); use enriched findings for consistency with reportData
    const { templateData: reportData } = await buildTemplateDataWithLegacyPath(
      {
        inspection,
        profile: "investor",
      },
      () => buildReportData(inspection, event)
    );
    const globalOverridesForHandler = event ? await loadFindingDimensionsGlobal(event) : {};
    const enrichedFindings = await enrichFindingsWithCalculatedPriority(inspection, event, {
      globalOverrides: globalOverridesForHandler as Record<string, import("./lib/customFindingPriority").FindingDimensionsDebugOverride>,
    });
    const handlerEffectivePriority = (f: { priority_final?: string; priority?: string }) => f.priority_final ?? f.priority ?? "PLAN_MONITOR";
    const handlerFindingsWithPriority = enrichedFindings.map(f => ({ ...f, priority: handlerEffectivePriority(f) }));

    const riskRating = reportData.RISK_RATING;
    const overallStatus = reportData.OVERALL_STATUS;

    const findingsMap = responses.findings || {};
    const findingsForScoring: FindingForScoring[] = handlerFindingsWithPriority.map(f => ({
      id: f.id,
      priority: f.priority || "PLAN_MONITOR",
    }));
    const profilesForScoring: Record<string, any> = {};
    for (const finding of handlerFindingsWithPriority) {
      const profile = getFindingProfile(finding.id);
      const response = findingsMap[finding.id];
      const scoringProfile = convertProfileForScoring(profile);
      if (typeof (finding as any).budget_low === "number" && typeof (finding as any).budget_high === "number") {
        scoringProfile.budget = { low: (finding as any).budget_low, high: (finding as any).budget_high };
      } else {
        // Note: budgetary_range is not part of FindingMessage type, but may exist in YAML fallback
        const responseAny = response as any;
        if (responseAny?.budgetary_range && typeof responseAny.budgetary_range === "object") {
          const range = responseAny.budgetary_range;
          if (range.low !== undefined || range.high !== undefined) {
            scoringProfile.budget = {
              low: typeof range.low === "number" ? range.low : 0,
              high: typeof range.high === "number" ? range.high : 0,
            };
          }
        }
      }
      profilesForScoring[finding.id] = scoringProfile;
    }
    const overallScore = computeOverall(findingsForScoring, profilesForScoring);

    const executiveSummaryTemplates = await loadExecutiveSummaryTemplates(event);
    let executiveSummary: string;

    const planCount = handlerFindingsWithPriority.filter(f => f.priority === "PLAN_MONITOR").length;
    
    if (riskRating === "HIGH") {
      executiveSummary = executiveSummaryTemplates.HIGH || "This property presents a high electrical risk profile.";
    } else if (riskRating === "MODERATE") {
      executiveSummary = executiveSummaryTemplates.MODERATE || "This property presents a moderate electrical risk profile.";
    } else {
      let lowRiskSummary = executiveSummaryTemplates.LOW || "This property presents a low electrical risk profile.";
      if (planCount > 0) {
        const firstParagraphEnd = lowRiskSummary.indexOf("\n\n");
        if (firstParagraphEnd > 0) {
          const firstPart = lowRiskSummary.substring(0, firstParagraphEnd);
          const secondPart = lowRiskSummary.substring(firstParagraphEnd);
          executiveSummary = `${firstPart}\n\nA small number of non-urgent maintenance observations were noted. These do not require immediate action but should be addressed as part of routine property upkeep to maintain long-term reliability and compliance confidence.\n\n${secondPart}`;
        } else {
          executiveSummary = `${lowRiskSummary}\n\nA small number of non-urgent maintenance observations were noted. These do not require immediate action but should be addressed as part of routine property upkeep to maintain long-term reliability and compliance confidence.`;
        }
      } else {
        executiveSummary = lowRiskSummary;
      }
    }
    
    // Use CAPEX_RANGE from reportData
    const capexRange = reportData.CAPEX_RANGE || "To be confirmed";
    
    const computed = {
      OVERALL_STATUS: overallStatus,
      RISK_RATING: riskRating,
      EXECUTIVE_SUMMARY: executiveSummary,
      CAPEX_RANGE: capexRange,
      CAPEX_SNAPSHOT: reportData.CAPEX_SNAPSHOT || capexRange,
      EXECUTIVE_DECISION_SIGNALS: reportData.EXECUTIVE_DECISION_SIGNALS || executiveSummary,
    };
    
    console.log("Computed fields:", computed);
    
    // Normalize inspection raw data to canonical fields
    const { canonical, missingFields } = normalizeInspection(inspection.raw || {}, inspection.inspection_id);
    if (missingFields.length > 0) {
      console.warn(`⚠️ Missing canonical fields: ${missingFields.join(", ")}`);
    }
    console.log("✅ Canonical data normalized:", Object.keys(canonical));
    
    // Build cover data (6 fields only)
    const coverData = await buildCoverData(inspection, event);
    console.log("Cover data built:", Object.keys(coverData));
    
    // Generate HTML report: StructuredReport → preflight → slot-only markdown → HTML
    console.log("[report][RUN_ID]", RUN_ID, "before buildReportMarkdown/buildReportHtml");
    let reportHtml: string;
    try {
      const baseUrl = getBaseUrl(event);
      const signingSecret = process.env.REPORT_PHOTO_SIGNING_SECRET;
      const structuredReport = await buildStructuredReport({
        inspection: { ...inspection, findings: handlerFindingsWithPriority },
        canonical,
        findings: handlerFindingsWithPriority,
        responses,
        computed,
        event,
        coverData,
        reportData: reportData as Record<string, unknown>,
        baseUrl,
        signingSecret,
      });
      assertReportReady(structuredReport);
      reportHtml = markdownToHtml(renderReportFromSlots(structuredReport));
    } catch (preflightError: unknown) {
      const msg = preflightError instanceof Error ? preflightError.message : String(preflightError);
      console.log("[report][RUN_ID]", RUN_ID, "buildReportMarkdown/buildReportHtml FAILED:", msg);
      if (msg.includes("Report preflight failed")) {
        console.error("Report preflight failed:", msg);
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Report preflight failed", message: msg }),
        };
      }
      throw preflightError;
    }
    console.log("[report][RUN_ID]", RUN_ID, "after buildReportMarkdown/buildReportHtml, length:", reportHtml.length);
    
    // Prepare data for renderDocx (cover fields + body + explicit template keys)
    const capExSnapshotRaw = reportData.CAPEX_SNAPSHOT ?? computed.CAPEX_SNAPSHOT ?? computed.CAPEX_RANGE ?? "";
    const capExSnapshot =
      !capExSnapshotRaw || String(capExSnapshotRaw).includes("undefined") || String(capExSnapshotRaw).trim() === ""
        ? "To be confirmed (indicative, planning only)"
        : String(capExSnapshotRaw);

    // Extract v1.1 test data placeholders from canonical (FIELD_DICTIONARY v1.1)
    const testData = canonical.test_data || {};
    const rcdTests = (testData.rcd_tests || {}) as Record<string, unknown>;
    const gpoTests = (testData.gpo_tests || {}) as Record<string, unknown>;
    const earthing = (testData.earthing || {}) as Record<string, unknown>;
    const extractTd = (v: unknown): string => {
      if (v == null) return "";
      if (typeof v === "object" && "value" in (v as object)) return String((v as { value: unknown }).value ?? "");
      return String(v);
    };
    const rcdPerformed = extractTd(rcdTests.performed);
    const rcdSummary = (rcdTests.summary || {}) as Record<string, unknown>;
    const gpoPerformed = extractTd(gpoTests.performed);
    const gpoSummary = (gpoTests.summary || {}) as Record<string, unknown>;
    const earthOhms = extractTd(earthing.resistance) || extractTd(earthing.earth_resistance) || "";
    const insulMohm = extractTd(testData.insulation_resistance) || "";
    const photoTtl = process.env.REPORT_PHOTO_TTL_SECONDS || "604800";

    const rawTemplateData: Record<string, string | number> = {
      INSPECTION_ID: String(coverData.INSPECTION_ID ?? ""),
      ASSESSMENT_DATE: String(coverData.ASSESSMENT_DATE ?? ""),
      PREPARED_FOR: String(coverData.PREPARED_FOR ?? ""),
      PREPARED_BY: String(coverData.PREPARED_BY ?? ""),
      PROPERTY_ADDRESS: String(coverData.PROPERTY_ADDRESS ?? ""),
      PROPERTY_TYPE: String(coverData.PROPERTY_TYPE ?? ""),
      ASSESSMENT_PURPOSE: String(coverData.ASSESSMENT_PURPOSE ?? "Decision-support electrical risk & CapEx planning assessment"),
      REPORT_VERSION: String(reportData.REPORT_VERSION ?? "1.0"),
      REPORT_BODY_HTML: reportHtml,
      TERMS_AND_CONDITIONS: String(reportData.TERMS_AND_CONDITIONS ?? ""),
      DYNAMIC_FINDING_PAGES: String(reportData.DYNAMIC_FINDING_PAGES ?? ""),
      OVERALL_STATUS_BADGE: String(reportData.OVERALL_STATUS_BADGE ?? overallStatus ?? ""),
      EXECUTIVE_DECISION_SIGNALS: String(reportData.EXECUTIVE_DECISION_SIGNALS ?? executiveSummary ?? ""),
      CAPEX_SNAPSHOT: capExSnapshot,
      RISK_RATING: String(reportData.RISK_RATING ?? riskRating ?? ""),
      OVERALL_STATUS: String(reportData.OVERALL_STATUS ?? overallStatus ?? ""),
      CAPEX_RANGE_LOW: overallScore.CAPEX_LOW ?? 0,
      CAPEX_RANGE_HIGH: overallScore.CAPEX_HIGH ?? 0,
      // v1.1 Appendix – Test Data & Technical Notes (FIELD_DICTIONARY v1.1)
      TEST_DATA_SECTION_HTML: String(reportData.TEST_DATA_SECTION_HTML ?? ""),
      RCD_TESTS_PERFORMED: (rcdPerformed === "true" || rcdPerformed === "yes" || rcdPerformed === "1") ? "yes" : "not captured",
      RCD_TOTAL_TESTED: String(rcdSummary.total_tested ?? "0"),
      RCD_TOTAL_PASS: String(rcdSummary.total_pass ?? "0"),
      RCD_TOTAL_FAIL: String(rcdSummary.total_fail ?? "0"),
      RCD_EXCEPTIONS_TABLE: String(reportData.RCD_EXCEPTIONS_TABLE ?? ""),
      GPO_TESTS_PERFORMED: (gpoPerformed === "true" || gpoPerformed === "yes" || gpoPerformed === "1") ? "yes" : "not captured",
      GPO_TOTAL_TESTED: String(gpoSummary.total_tested ?? gpoSummary.total_outlets_tested ?? gpoSummary.total_gpo_tested ?? "0"),
      GPO_POLARITY_PASS_COUNT: String(gpoSummary.polarity_pass_count ?? gpoSummary.polarity_pass ?? "0"),
      GPO_EARTH_PRESENT_PASS_COUNT: String(gpoSummary.earth_present_pass_count ?? gpoSummary.earth_present_pass ?? "0"),
      EARTH_RESISTANCE_OHMS: earthOhms || "not captured",
      INSULATION_RESISTANCE_MOHM: insulMohm || "not captured",
      TECHNICAL_NOTES: String(reportData.TECHNICAL_NOTES ?? PLACEHOLDER_DEFAULTS.TECHNICAL_NOTES),
      PHOTO_EVIDENCE_ENABLED: process.env.REPORT_PHOTO_SIGNING_SECRET ? "true" : "false",
      PHOTO_LINK_TTL_SECONDS: String(photoTtl),
    };
    
    // Assert no undefined values before sanitization
    const safeTemplateData = assertNoUndefined(rawTemplateData);
    
    // Sanitize and apply placeholder fallback strategy
    const sanitized = sanitizeObject(safeTemplateData);
    let templateData = applyPlaceholderFallback(sanitized);
    // Merge with PLACEHOLDER_DEFAULTS so any v1.1 key has fallback (no undefined)
    const merged: Record<string, string> = {};
    for (const k of Object.keys(PLACEHOLDER_DEFAULTS) as Array<keyof typeof PLACEHOLDER_DEFAULTS>) {
      const v = templateData[k];
      merged[k] = (v !== undefined && v !== null && String(v) !== "undefined") ? String(v) : (PLACEHOLDER_DEFAULTS[k] ?? "-");
    }
    for (const [k, v] of Object.entries(templateData)) {
      if (!(k in merged)) merged[k] = String(v ?? "");
    }
    templateData = merged;
    
    // [DEV] Log template keys and key field values to ensure no undefined
    const templateKeys = Object.keys(templateData);
    const keyFields = [
      "INSPECTION_ID",
      "ASSESSMENT_DATE",
      "PREPARED_FOR",
      "PROPERTY_ADDRESS",
      "PROPERTY_TYPE",
      "ASSESSMENT_PURPOSE",
      "REPORT_VERSION",
      "REPORT_BODY_HTML",
      "CAPEX_SNAPSHOT",
      "TERMS_AND_CONDITIONS",
    ] as const;
    const sampleValues: Record<string, unknown> = {};
    for (const k of keyFields) {
      const v = templateData[k];
      sampleValues[k] = v === undefined ? "[undefined]" : (typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "…" : v);
    }
    console.log("[DEV] templateData keys:", templateKeys.length, templateKeys.sort().join(", "));
    console.log("[DEV] templateData sample (no undefined):", JSON.stringify(sampleValues, null, 0));
    const undefinedKeys2 = Object.entries(templateData).filter(([, v]) => v === undefined).map(([k]) => k);
    if (undefinedKeys2.length > 0) {
      console.log("[report-fp] placeholder undefined keys:", undefinedKeys2.join(", "));
    } else {
      console.log("[report-fp] placeholder: no undefined keys");
    }
    const sf = getSanitizeFingerprint();
    console.log("[report-fp] sanitize callCount:", sf.count, "preserveEmoji:", sf.preserveEmoji);
    for (const f of inspection.findings) {
      const count = (f as any).photo_ids && Array.isArray((f as any).photo_ids) ? (f as any).photo_ids.length : 0;
      console.log("[report-fp] photo finding.id:", f.id, "photo_ids:", count);
    }

    // Load Word template (use report-template-md.docx if available, otherwise fallback to report-template.docx)
    let templateBuffer!: Buffer;
    const mdTemplatePath = path.join(__dirname, "report-template-md.docx");
    
    // Try multiple possible paths for report-template-md.docx
    const possibleMdPaths = [
      mdTemplatePath,
      path.join(process.cwd(), "netlify", "functions", "report-template-md.docx"),
      path.join(process.cwd(), "report-template-md.docx"),
      "/opt/build/repo/netlify/functions/report-template-md.docx",
      "/opt/build/repo/report-template-md.docx",
    ];
    
    let foundMdTemplate = false;
    let templatePathHit = "";
    for (const templatePath of possibleMdPaths) {
      if (fs.existsSync(templatePath)) {
        templatePathHit = templatePath;
        templateBuffer = fs.readFileSync(templatePath);
        foundMdTemplate = true;
        break;
      }
    }
    if (foundMdTemplate) {
      console.log("[report-fp] template path:", templatePathHit, "buffer.length:", templateBuffer!.length, "sha1:", sha1(templateBuffer!));
    }
    
    if (!foundMdTemplate) {
      console.error("❌ report-template-md.docx not found in any location!");
      console.error("Searched paths:", possibleMdPaths);
      console.error("This means the Markdown-based report generation cannot work.");
      console.error("Please ensure report-template-md.docx is copied to netlify/functions/ during build.");
      throw new Error("找不到 report-template-md.docx 模板文件。请确保构建时复制了该文件到 netlify/functions/ 目录。");
    }
    
    // Check if template contains REPORT_BODY_HTML placeholder
    // This is a required protection: throw error if placeholder is missing
    // Note: Word may split placeholders across XML nodes, so we check for the text content
    const templateZip = new PizZip(templateBuffer);
    const templateDocumentXml = templateZip.files["word/document.xml"]?.asText() || "";
    console.log("[docx-diag][RUN_ID=" + RUN_ID + "] templateDocumentXmlLength=" + templateDocumentXml.length);
    
    // P0: REPORT_BODY_HTML is REQUIRED - template must contain continuous placeholder
    const templatePathForError = foundMdTemplate ? templatePathHit : possibleMdPaths[0];
    const hasPlaceholder = templateDocumentXml.includes("REPORT_BODY_HTML") ||
      templateDocumentXml.includes("report_body_html") ||
      templateDocumentXml.includes("Report_Body_Html");

    if (!hasPlaceholder) {
      // Detect split placeholder: tag name exists but full {{TAG}} doesn't
      const isSplit = detectSplitTag(templateDocumentXml, "REPORT_BODY_HTML");
      if (isSplit) {
        throw new Error("TEMPLATE_TAG_SPLIT: REPORT_BODY_HTML is split across Word XML runs. Re-enter {{REPORT_BODY_HTML}} as continuous text in template.");
      }
      throw new Error("TEMPLATE_MISSING_TAG: REPORT_BODY_HTML not found in template. path=" + templatePathForError);
    }

    console.log("[docx-diag][RUN_ID=" + RUN_ID + "] template placeholder check: REPORT_BODY_HTML present (continuous)");
    
    // Hard assertions before renderDocx
    const undefKeys = Object.entries(templateData).filter(([, v]) => v === undefined).map(([k]) => k);
    if (undefKeys.length > 0) {
      throw new Error(`[report] templateData has undefined values: ${undefKeys.join(", ")}`);
    }
    if (!reportHtml.includes("SENTINEL_FINDINGS_V1")) {
      throw new Error("[report] reportHtml must contain SENTINEL_FINDINGS_V1; possible old buildReportMarkdown");
    }
    if (reportHtml.includes("Photo P") && !reportHtml.includes("<a href=")) {
      throw new Error("[report] reportHtml has Photo P but missing <a href=; Evidence links broken");
    }

    // [report-fp] Fingerprint block (all logs prefixed [report-fp])
    const undefKeysFp = Object.entries(templateData).filter(([, v]) => v === undefined).map(([k]) => k);
    const sfFp = getSanitizeFingerprint();
    console.log("[report-fp] BUILD COMMIT_REF:", process.env.COMMIT_REF ?? "?", "CONTEXT:", process.env.CONTEXT ?? "?", "BRANCH:", process.env.BRANCH ?? "?");
    console.log("[report-fp] responses: (see loadResponses log above)");
    console.log("[report-fp] reportStyles.css: (see markdownToHtml log above)");
    console.log("[report-fp] report-template-md.docx path:", templatePathHit || "?", "buffer.length:", templateBuffer?.length ?? 0, "sha1:", foundMdTemplate ? sha1(templateBuffer) : "?");
    console.log("[report-fp] sanitize callCount:", sfFp.count, "preserveEmoji:", sfFp.preserveEmoji);
    console.log("[report-fp] templateData undefined keys:", undefKeysFp.length === 0 ? "[] (OK)" : undefKeysFp.join(", "));
    if (undefKeysFp.length > 0) {
      console.warn("[report-fp] WARN: templateData has undefined keys, must be empty for production");
    }

    // [photo-fp] Verify REPORT_BODY_HTML contains links before renderDocx
    const html = String(templateData.REPORT_BODY_HTML ?? "");
    const reportHtmlLength = html.length;
    if (reportHtmlLength < 5000) {
      throw new Error("REPORT_BODY_HTML_EMPTY_OR_TOO_SMALL: length=" + reportHtmlLength + " (min 5000). Report body cannot be empty.");
    }
    console.log("[docx-diag][RUN_ID=" + RUN_ID + "] reportHtmlLength=" + reportHtmlLength);
    const hasA = html.includes("<a ");
    const hasViewPhoto = html.includes("View photo");
    const linkMatches = html.match(/<a\s+href=/g);
    const linkCount = linkMatches ? linkMatches.length : 0;
    console.log("[photo-fp] html link check: hasA=" + hasA + " count=" + linkCount + " hasViewPhoto=" + hasViewPhoto);

    // debug=1 or DEBUG_DOCX=1: save reportHtml to file for inspection (转换前的 HTML)
    const wantDebugSave = process.env.DEBUG_DOCX === "1" ||
      (event.httpMethod === "GET" && new URLSearchParams(event.rawQuery || "").get("debug") === "1");
    if (wantDebugSave) {
      const debugPath = path.join(process.cwd(), "output", "debug-report-html.html");
      try {
        fs.mkdirSync(path.dirname(debugPath), { recursive: true });
        fs.writeFileSync(debugPath, reportHtml, "utf8");
        console.log("[docx-diag] DEBUG_DOCX=1: saved reportHtml to " + debugPath);
      } catch (e) {
        console.warn("[docx-diag] DEBUG_DOCX=1: failed to save:", e);
      }
    }

    console.log("[report][RUN_ID]", RUN_ID, "before renderDocx");
    
    // USE NEW RENDERING PATH: merge cover + body without placeholder injection
    // Old path (renderDocx with HTML_MERGE) failed because placeholder injection didn't work
    // New path: render cover separately, convert HTML to DOCX, then merge
    const { renderDocxByMergingCoverAndBody } = await import("./lib/renderDocx");
    const outBuffer = await renderDocxByMergingCoverAndBody(
      templateBuffer,
      templateData,
      reportHtml,
      RUN_ID
    );
    
    console.log("[report][RUN_ID]", RUN_ID, "after renderDocx, size:", outBuffer.length, "bytes");

    // Structure visibility validation: ensure docx body is present (not ASTEXT / merge failure)
    const docZip = new PizZip(outBuffer);
    const bodyCheck = verifyDocxBody(docZip, { minLength: DOCX_BODY_MIN_LENGTH });
    if (!bodyCheck.ok) {
      throw new Error("DOCX_RENDER_FAILED: " + bodyCheck.reason);
    }
    console.log("[docx-diag][RUN_ID=" + RUN_ID + "] docx body validation OK (document.xml length=" + bodyCheck.documentXmlLength + ", contains body markers)");

    // Dev-only: verify DOCX contains hyperlinks when input had <a href>
    if (process.env.NETLIFY_DEV === "true" || process.env.NODE_ENV === "development") {
      const hadAnchor = (reportHtml || "").includes("<a ") && (reportHtml || "").includes("href=");
      if (hadAnchor) {
        const zip = new PizZip(outBuffer);
        let found = false;
        let diag = "";
        for (const [name, file] of Object.entries(zip.files)) {
          if (name.endsWith(".xml") || name.endsWith(".mht")) {
            const text = (file as { asText?: () => string }).asText?.() || "";
            if (/w:hyperlink/i.test(text)) {
              found = true;
              diag = `w:hyperlink in ${name}`;
              break;
            }
            if (/href\s*=\s*["']?https?:/i.test(text)) {
              found = true;
              diag = `href= in ${name}`;
              break;
            }
          }
        }
        if (!found) {
          console.error("[report] ⚠️ HYPERLINK VERIFY FAILED: input had <a href> but DOCX contains no w:hyperlink or href= in xml/mht parts");
          console.error("[report] Files:", Object.keys(zip.files).join(", "));
        } else {
          console.log("[report] ✅ Hyperlink verify OK:", diag);
        }
      }
    }
    
    if (process.env.NETLIFY_DEV === "true" || process.env.NODE_ENV === "development") {
      const immediateCount = handlerFindingsWithPriority.filter(f => f.priority === "IMMEDIATE" || f.priority === "URGENT").length;
      const recommendedCount = handlerFindingsWithPriority.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS").length;
      const planCount = handlerFindingsWithPriority.filter(f => f.priority === "PLAN_MONITOR").length;
      console.log("=== Debug Info ===");
      console.log("Findings counts (priority_final):", {
        immediate: immediateCount,
        recommended: recommendedCount,
        plan: planCount,
        limitations: inspection.limitations.length,
      });
      console.log("HTML preview (first 1200 chars):", reportHtml.substring(0, 1200));
    }
    
    // Save to Netlify Blob
    const blobKey = `reports/${inspection_id}.docx`;
    await saveWordDoc(blobKey, outBuffer, event);
    console.log("Word document saved to Blob:", blobKey);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        inspection_id: inspection_id,
        message: "Word document generated and saved successfully"
      })
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    console.error("Error in generateWordReport:", e);
    
    try {
      console.error("Full error object:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
    } catch (jsonErr) {
      console.error("Could not stringify error:", jsonErr);
      console.error("Error object:", e);
    }
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to generate Word document",
        message: errorMessage
      })
    };
  }
};
