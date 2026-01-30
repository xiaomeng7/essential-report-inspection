/**
 * 构建报告 Markdown 内容
 * 
 * 严格遵循 REPORT_STRUCTURE.md 的页面顺序
 * 确保所有部分都有值，不会出现 undefined
 */

import type { StoredInspection } from "./store";
import type { CanonicalInspection } from "./normalizeInspection";
import { loadDefaultText } from "./defaultTextLoader";
import { loadFindingProfiles, getFindingProfile } from "./findingProfilesLoader";
import { generateFindingPages, type Finding, type Response } from "./generateFindingPages";
import type { HandlerEvent } from "@netlify/functions";
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

export type ComputedFields = {
  OVERALL_STATUS?: string;
  RISK_RATING?: string;
  CAPEX_RANGE?: string;
  EXECUTIVE_SUMMARY?: string;
  EXECUTIVE_DECISION_SIGNALS?: string;
  CAPEX_SNAPSHOT?: string;
  CAPEX_TABLE_ROWS?: string;
  [key: string]: any;
};

export type BuildReportMarkdownParams = {
  inspection: StoredInspection;
  canonical: CanonicalInspection;
  findings: Array<{ id: string; priority: string; title?: string; observed?: string; facts?: string }>;
  responses: {
    findings?: Record<string, {
      title?: string;
      why_it_matters?: string;
      recommended_action?: string;
      planning_guidance?: string;
    }>;
    defaults?: Record<string, string>;
  };
  computed: ComputedFields;
  event?: HandlerEvent;
};

/**
 * Page break marker (used consistently across the project)
 */
const PAGE_BREAK = "\n\n---\n\n";

// Cache for responses.yml
let responsesCache: any = null;

/**
 * Load responses.yml (local implementation)
 */
async function loadResponses(event?: HandlerEvent): Promise<any> {
  if (responsesCache) {
    return responsesCache;
  }

  // Try blob store first (if event is provided)
  if (event) {
    try {
      const { connectLambda, getStore } = await import("@netlify/blobs");
      connectLambda(event);
      const store = getStore({ name: "config", consistency: "eventual" });
      const blobContent = await store.get("responses.yml", { type: "text" });
      if (blobContent) {
        try {
          responsesCache = yaml.load(blobContent) as any;
          console.log("✅ Loaded responses.yml from blob store");
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
    path.join(__dirname, "..", "..", "responses.yml"),
    path.join(process.cwd(), "responses.yml"),
    path.join(process.cwd(), "netlify", "functions", "responses.yml"),
    "/opt/build/repo/responses.yml",
  ];

  for (const responsesPath of possiblePaths) {
    try {
      if (fs.existsSync(responsesPath)) {
        const content = fs.readFileSync(responsesPath, "utf8");
        responsesCache = yaml.load(content) as any;
        console.log(`✅ Loaded responses.yml from: ${responsesPath}`);
        return responsesCache;
      }
    } catch (e) {
      console.warn(`Failed to load responses.yml from ${responsesPath}:`, e);
      continue;
    }
  }

  console.warn("⚠️ Could not load responses.yml, using fallback");
  responsesCache = { findings: {}, defaults: {} };
  return responsesCache;
}

/**
 * Load Terms and Conditions from DEFAULT_TERMS.md
 */
async function loadTermsAndConditions(): Promise<string> {
  const possiblePaths = [
    path.join(__dirname, "..", "..", "DEFAULT_TERMS.md"),
    path.join(__dirname, "..", "DEFAULT_TERMS.md"),
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
  
  // Fallback to hardcoded default
  console.warn("⚠️ DEFAULT_TERMS.md not found, using hardcoded fallback");
  return `# TERMS & CONDITIONS OF ASSESSMENT

## 1. Australian Consumer Law (ACL) Acknowledgement
Our services come with guarantees that cannot be excluded under the Australian Consumer Law (ACL).  
Nothing in this Report or these Terms seeks to exclude, restrict, or modify any consumer guarantees that cannot lawfully be excluded.

## 2. Nature & Scope of Professional Opinion
This Assessment is a point-in-time, non-destructive, visual and functional review of accessible electrical components only.  
It is non-intrusive and non-exhaustive, and does not constitute a compliance certificate, an electrical safety certificate, an engineering report, a structural inspection, or a guarantee of future performance.

## 3. Decision-Support Only – No Repair Advice
This Report is provided solely as a risk identification and asset planning tool.  
It does not prescribe a scope of rectification works, provide quotations, endorse or appoint contractors, or certify statutory compliance.

## 4. Framework Statement
This assessment does not eliminate risk, but provides a structured framework for managing it.`;
}

/**
 * Convert HTML finding pages to Markdown (simplified conversion)
 */
function htmlToMarkdown(html: string): string {
  // Remove HTML tags and convert to Markdown
  let md = html
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<[^>]+>/g, "") // Remove remaining HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
  
  // Clean up multiple newlines
  md = md.replace(/\n{3,}/g, "\n\n");
  
  return md.trim();
}

/**
 * Section 1: Cover Page
 */
function buildCoverSection(canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  
  md.push("# Electrical Property Health Assessment");
  md.push("");
  md.push(`**Property Address:** ${canonical.property_address || defaultText.PROPERTY_ADDRESS || "-"}`);
  md.push(`**Client:** ${canonical.prepared_for || defaultText.PREPARED_FOR || "-"}`);
  md.push(`**Assessment Date:** ${canonical.assessment_date || defaultText.ASSESSMENT_DATE || "-"}`);
  md.push(`**Inspection ID:** ${canonical.inspection_id || defaultText.INSPECTION_ID || "-"}`);
  md.push(`**Prepared By:** ${canonical.prepared_by || defaultText.PREPARED_BY || "-"}`);
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 2: Document Purpose & How to Read This Report
 */
function buildPurposeSection(defaultText: any): string {
  const md: string[] = [];
  
  md.push("## Document Purpose & How to Read This Report");
  md.push("");
  md.push(defaultText.PURPOSE_PARAGRAPH || defaultText.HOW_TO_READ_PARAGRAPH || 
    "This report provides a comprehensive assessment of the electrical condition of the property, identifying safety concerns, compliance issues, and maintenance recommendations based on a visual inspection and electrical testing performed in accordance with applicable standards.");
  md.push("");
  md.push(defaultText.HOW_TO_READ_PARAGRAPH || defaultText.HOW_TO_READ_TEXT ||
    "This report is a decision-support document designed to assist property owners, investors, and asset managers in understanding the electrical risk profile of the property and planning for future capital expenditure.");
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 3: Executive Summary (One-Page Only)
 */
function buildExecutiveSummarySection(computed: ComputedFields, findings: Array<{ priority: string }>, defaultText: any): string {
  const md: string[] = [];
  
  md.push("## Executive Summary");
  md.push("");
  
  // Overall Status Badge
  const overallStatus = computed.OVERALL_STATUS || computed.RISK_RATING || defaultText.OVERALL_STATUS || "MODERATE RISK";
  md.push(`### Overall Status: ${overallStatus}`);
  md.push("");
  
  // Executive Decision Signals
  const executiveSignals = computed.EXECUTIVE_DECISION_SIGNALS || computed.EXECUTIVE_SUMMARY || 
    defaultText.EXECUTIVE_SUMMARY || 
    "This property presents a moderate electrical risk profile at the time of inspection.";
  
  md.push(executiveSignals);
  md.push("");
  
  // CapEx Snapshot
  const capexSnapshot = computed.CAPEX_SNAPSHOT || computed.CAPEX_RANGE || "To be confirmed";
  md.push(`### Financial Planning Snapshot`);
  md.push(`**Estimated Capital Expenditure Range:** ${capexSnapshot}`);
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 4: Priority Overview (Single Table)
 */
function buildPriorityOverviewSection(findings: Array<{ priority: string }>): string {
  const md: string[] = [];
  
  md.push("## Priority Overview");
  md.push("");
  
  const immediateCount = findings.filter(f => f.priority === "IMMEDIATE").length;
  const recommendedCount = findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS").length;
  const planCount = findings.filter(f => f.priority === "PLAN_MONITOR").length;
  
  md.push("| Priority | Count | Description |");
  md.push("|----------|-------|-------------|");
  md.push(`| 🔴 Immediate | ${immediateCount} | Urgent Liability Risk |`);
  md.push(`| 🟡 Recommended (0-3 months) | ${recommendedCount} | Budgetary Provision Recommended |`);
  md.push(`| 🟢 Planning & Monitoring | ${planCount} | Acceptable |`);
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 5: Assessment Scope & Limitations
 */
function buildScopeSection(inspection: StoredInspection, canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  
  md.push("## Assessment Scope & Limitations");
  md.push("");
  
  // Scope
  md.push(defaultText.SCOPE_SECTION || defaultText.SCOPE_TEXT ||
    "This assessment is based on a visual inspection and limited electrical testing of accessible areas only. It provides a framework for managing electrical risk within acceptable parameters.");
  md.push("");
  
  // Limitations
  md.push("### Limitations");
  md.push("");
  const limitations = inspection.limitations || [];
  if (limitations.length > 0) {
    limitations.forEach(limitation => {
      md.push(`- ${limitation}`);
    });
  } else {
    md.push(defaultText.LIMITATIONS || 
      "Areas that are concealed, locked, or otherwise inaccessible were not inspected.");
  }
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 6: Observed Conditions & Risk Interpretation (Dynamic Pages)
 */
async function buildObservedConditionsSection(
  inspection: StoredInspection,
  canonical: CanonicalInspection,
  findings: Array<{ id: string; priority: string; title?: string; observed?: string; facts?: string }>,
  event?: HandlerEvent
): Promise<string> {
  const md: string[] = [];
  
  md.push("## Observed Conditions & Risk Interpretation");
  md.push("");
  
  if (findings.length === 0) {
    md.push("No findings were identified during this assessment.");
    md.push("");
    return md.join("\n");
  }
  
  // Load profiles and responses
  const responses = await loadResponses(event);
  const responsesMap: Record<string, Response> = responses.findings || {};
  const profilesMap = loadFindingProfiles();
  
  // Convert findings to Finding type
  const findingList: Finding[] = findings.map(f => ({
    id: f.id,
    priority: f.priority,
    title: f.title,
    observed: f.observed,
    facts: f.facts,
    photo_ids: (f as any).photo_ids,
  }));
  
  // Convert profiles to FindingProfile map
  const profiles: Record<string, any> = {};
  for (const finding of findingList) {
    profiles[finding.id] = getFindingProfile(finding.id);
  }
  
  // Generate finding pages using strict generator
  const result = generateFindingPages(
    findingList,
    profiles,
    responsesMap,
    inspection.raw || {},
    canonical.test_data || {}
  );
  
  // Convert HTML to Markdown
  const findingPagesMarkdown = htmlToMarkdown(result.html);
  
  md.push(findingPagesMarkdown);
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 7: Thermal Imaging Analysis (If Applicable)
 */
function buildThermalImagingSection(canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  
  md.push("## Thermal Imaging Analysis");
  md.push("");
  
  const testData = canonical.test_data || {};
  const thermalData = (testData as any)?.thermal_imaging || (testData as any)?.thermal;
  
  if (thermalData) {
    md.push(String(thermalData));
  } else {
    md.push(defaultText.THERMAL_VALUE_STATEMENT || defaultText.THERMAL_METHOD ||
      "Thermal imaging analysis provides a non-invasive method for identifying potential electrical issues that may not be visible during standard visual inspection. No thermal imaging data was captured for this assessment.");
  }
  md.push("");
  
  return md.join("\n");
}

/**
 * Get timeline based on priority (fallback when profile timeline is missing)
 */
function getTimelineFromPriority(priority: string): string {
  const upper = priority.toUpperCase();
  if (upper === "IMMEDIATE") return "Now";
  if (upper === "URGENT") return "0–3 months";
  if (upper === "RECOMMENDED_0_3_MONTHS" || upper === "RECOMMENDED") return "12–24 months";
  if (upper === "PLAN_MONITOR" || upper === "PLAN") return "Next renovation";
  return "To be confirmed";
}

/**
 * Get priority display text
 */
function getPriorityDisplayText(priority: string): string {
  const upper = priority.toUpperCase();
  if (upper === "IMMEDIATE") return "IMMEDIATE";
  if (upper === "URGENT") return "URGENT";
  if (upper === "RECOMMENDED_0_3_MONTHS" || upper === "RECOMMENDED") return "RECOMMENDED";
  if (upper === "PLAN_MONITOR" || upper === "PLAN") return "PLAN";
  return priority;
}

/**
 * Get observed condition summary from finding data
 */
function getObservedConditionSummary(
  finding: { id: string; priority: string; title?: string; observed?: string; facts?: string },
  response?: { observed_condition?: string | string[] },
  profile?: any
): string {
  // Try response.observed_condition first
  if (response?.observed_condition) {
    if (Array.isArray(response.observed_condition)) {
      return response.observed_condition.join(". ").substring(0, 100);
    }
    return String(response.observed_condition).substring(0, 100);
  }
  
  // Try finding.observed
  if (finding.observed) {
    return String(finding.observed).substring(0, 100);
  }
  
  // Try finding.facts
  if (finding.facts) {
    return String(finding.facts).substring(0, 100);
  }
  
  // Fallback to profile messaging or title
  if (profile?.messaging?.why_it_matters) {
    return String(profile.messaging.why_it_matters).substring(0, 100);
  }
  
  return "Condition observed during inspection";
}

/**
 * Section 8: 5-Year Capital Expenditure (CapEx) Roadmap
 */
function buildCapExRoadmapSection(
  computed: ComputedFields,
  defaultText: any,
  findings: Array<{ id: string; priority: string; title?: string; observed?: string; facts?: string }>,
  responses: { findings?: Record<string, any> }
): string {
  const md: string[] = [];
  
  md.push("## 5-Year Capital Expenditure (CapEx) Roadmap");
  md.push("");
  
  // Filter findings that should appear in CapEx roadmap
  const relevantFindings = findings.filter(f => {
    const priority = f.priority || "";
    return priority === "IMMEDIATE" || 
           priority === "URGENT" || 
           priority === "RECOMMENDED_0_3_MONTHS" || 
           priority === "RECOMMENDED" ||
           priority === "PLAN_MONITOR" ||
           priority === "PLAN";
  });
  
  if (relevantFindings.length === 0) {
    md.push("| Asset Item | Current Condition | Priority | Suggested Timeline | Budgetary Range |");
    md.push("|------------|-------------------|----------|-------------------|-----------------|");
    md.push("| - | No capital expenditure items identified | - | - | - |");
    md.push("");
    md.push("**Indicative market benchmarks provided for financial provisioning only. Not a quotation or scope of works.**");
    md.push("");
    return md.join("\n");
  }
  
  // Build table header
  md.push("| Asset Item | Current Condition | Priority | Suggested Timeline | Budgetary Range |");
  md.push("|------------|-------------------|----------|-------------------|-----------------|");
  
  // Build table rows for each finding
  for (const finding of relevantFindings) {
    const profile = getFindingProfile(finding.id);
    const response = responses.findings?.[finding.id];
    
    // Asset Item: asset_component from profile
    const assetItem = profile.asset_component || 
                      profile.messaging?.title || 
                      finding.title || 
                      finding.id.replace(/_/g, " ");
    
    // Current Condition: observed_condition summary
    const currentCondition = getObservedConditionSummary(finding, response, profile);
    
    // Priority
    const priority = getPriorityDisplayText(finding.priority || "PLAN");
    
    // Suggested Timeline: timeline from profile; fallback based on priority
    const timeline = profile.timeline || getTimelineFromPriority(finding.priority || "PLAN");
    
    // Budgetary Range: budget_range from profile; if missing, show "Pending"
    let budgetaryRange = "Pending";
    if (profile.budget_range) {
      budgetaryRange = String(profile.budget_range);
    } else if (response?.budget_range_text) {
      budgetaryRange = String(response.budget_range_text);
    } else if (response?.budget_range_low !== undefined && response?.budget_range_high !== undefined) {
      budgetaryRange = `AUD $${response.budget_range_low}–$${response.budget_range_high}`;
    } else if (profile.budget_band) {
      // Generate from budget_band if available
      const band = profile.budget_band.toUpperCase();
      const ranges: Record<string, string> = {
        LOW: "AUD $100–$500",
        MED: "AUD $500–$2,000",
        HIGH: "AUD $2,000–$10,000",
      };
      budgetaryRange = ranges[band] || "Pending";
    }
    
    // Escape pipe characters in table cells
    const escapeCell = (text: string) => String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
    
    md.push(`| ${escapeCell(assetItem)} | ${escapeCell(currentCondition)} | ${escapeCell(priority)} | ${escapeCell(timeline)} | ${escapeCell(budgetaryRange)} |`);
  }
  
  md.push("");
  
  // Footer disclaimer
  md.push("**Indicative market benchmarks provided for financial provisioning only. Not a quotation or scope of works.**");
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 9: Decision Pathways (was Investor Options & Next Steps)
 */
function buildDecisionPathwaysSection(defaultText: any): string {
  const md: string[] = [];
  
  md.push("## Decision Pathways");
  md.push("");
  
  md.push(defaultText.DECISION_PATHWAYS_SECTION || defaultText.DECISION_PATHWAYS_TEXT ||
    "This report provides a framework for managing electrical risk within acceptable parameters. Investors and asset managers should consider the following decision pathways:\n\n" +
    "1. **Immediate Actions:** Address all immediate safety concerns as soon as possible.\n" +
    "2. **Short-term Planning:** Plan and complete recommended actions within 0-3 months.\n" +
    "3. **Ongoing Monitoring:** Monitor planning items and address during routine maintenance.\n" +
    "4. **Follow-up Assessment:** Consider a follow-up assessment after completing recommended actions.");
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 10: Important Legal Limitations & Disclaimer (Terms & Conditions)
 */
async function buildTermsSection(): Promise<string> {
  const md: string[] = [];
  
  md.push("## Important Legal Limitations & Disclaimer");
  md.push("");
  
  const terms = await loadTermsAndConditions();
  md.push(terms);
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 11: Closing Statement
 */
function buildClosingSection(canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  
  md.push("## Closing Statement");
  md.push("");
  
  const technicianName = canonical.prepared_by || defaultText.PREPARED_BY || "Licensed Electrician";
  const assessmentDate = canonical.assessment_date || defaultText.ASSESSMENT_DATE || new Date().toISOString();
  
  // Format date
  let formattedDate: string;
  try {
    const date = new Date(assessmentDate);
    if (!isNaN(date.getTime())) {
      formattedDate = date.toLocaleDateString("en-AU", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } else {
      formattedDate = assessmentDate;
    }
  } catch (e) {
    formattedDate = assessmentDate;
  }
  
  md.push(`Prepared by: ${technicianName}`);
  md.push(`Assessment Date: ${formattedDate}`);
  md.push("");
  md.push(defaultText.CLOSING_STATEMENT ||
    "For questions or clarifications regarding this report, please contact the inspection provider.");
  md.push("");
  
  return md.join("\n");
}

/**
 * Extract value from nested Answer object structure
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
 * Get nested field value from object
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return extractValue(current);
}

/**
 * Section 12: Appendix – Test Data & Technical Notes
 */
function buildAppendixSection(canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  
  md.push("## Appendix – Test Data & Technical Notes");
  md.push("");
  
  const testData = canonical.test_data || {};
  
  // Collect test measurements for table
  const testMeasurements: Array<{ test: string; parameter: string; value: string; unit: string }> = [];
  
  // Extract RCD test data
  const rcdTests = testData.rcd_tests as Record<string, unknown> | undefined;
  if (rcdTests) {
    const performed = extractValue(rcdTests.performed);
    if (performed === true || performed === "true" || performed === "yes") {
      const summary = rcdTests.summary as Record<string, unknown> | undefined;
      if (summary) {
        const totalTested = extractValue(summary.total_tested);
        const totalPass = extractValue(summary.total_pass) || 0;
        const totalFail = extractValue(summary.total_fail) || 0;
        if (totalTested !== undefined && Number(totalTested) > 0) {
          testMeasurements.push({
            test: "RCD Testing",
            parameter: "Devices Tested",
            value: `${totalPass}/${Number(totalTested)} passed`,
            unit: ""
          });
        }
      }
      
      // Extract RCD exceptions with trip times
      const exceptions = rcdTests.exceptions;
      if (Array.isArray(exceptions)) {
        exceptions.forEach((exc: any) => {
          const location = extractValue(exc.location) || "Unknown";
          const tripTime = extractValue(exc.trip_time);
          const testCurrent = extractValue(exc.test_current);
          const result = extractValue(exc.result);
          
          if (tripTime !== undefined) {
            testMeasurements.push({
              test: `RCD (${location})`,
              parameter: "Trip Time",
              value: String(tripTime),
              unit: "ms"
            });
          }
          if (testCurrent !== undefined) {
            testMeasurements.push({
              test: `RCD (${location})`,
              parameter: "Test Current",
              value: String(testCurrent),
              unit: "mA"
            });
          }
        });
      }
    }
  }
  
  // Extract GPO test data
  const gpoTests = testData.gpo_tests as Record<string, unknown> | undefined;
  if (gpoTests) {
    const performed = extractValue(gpoTests.performed);
    if (performed === true || performed === "true" || performed === "yes") {
      const summary = gpoTests.summary as Record<string, unknown> | undefined;
      if (summary) {
        const totalTested = extractValue(summary.total_tested) || extractValue(summary.total_outlets_tested);
        const polarityPass = extractValue(summary.polarity_pass_count) || 0;
        const earthPass = extractValue(summary.earth_present_pass_count) || 0;
        
        if (totalTested !== undefined && Number(totalTested) > 0) {
          testMeasurements.push({
            test: "GPO Testing",
            parameter: "Polarity Check",
            value: `${polarityPass}/${Number(totalTested)} passed`,
            unit: ""
          });
          testMeasurements.push({
            test: "GPO Testing",
            parameter: "Earth Continuity",
            value: `${earthPass}/${Number(totalTested)} passed`,
            unit: ""
          });
        }
      }
    }
  }
  
  // Extract earthing data
  const earthing = testData.earthing as Record<string, unknown> | undefined;
  if (earthing) {
    const earthResistance = extractValue(earthing.resistance) || extractValue(earthing.earth_resistance);
    if (earthResistance !== undefined) {
      testMeasurements.push({
        test: "Earthing",
        parameter: "Earth Resistance",
        value: String(earthResistance),
        unit: "Ω"
      });
    }
  }
  
  // Extract insulation resistance (if available)
  const insulationResistance = extractValue(testData.insulation_resistance);
  if (insulationResistance !== undefined) {
    testMeasurements.push({
      test: "Insulation",
      parameter: "Resistance",
      value: String(insulationResistance),
      unit: "MΩ"
    });
  }
  
  // Render test data section
  if (testMeasurements.length > 0) {
    md.push("### Test Data");
    md.push("");
    md.push("| Test | Parameter | Value | Unit |");
    md.push("|------|-----------|-------|------|");
    testMeasurements.forEach(measurement => {
      md.push(`| ${measurement.test} | ${measurement.parameter} | ${measurement.value} | ${measurement.unit} |`);
    });
    md.push("");
  } else {
    // No test data available - render default paragraph
    md.push("### Test Data");
    md.push("");
    const defaultTestDataText = defaultText.TEST_DATA_DEFAULT || defaultText.TEST_SUMMARY ||
      "This assessment is non-destructive and limited to accessible areas only. Testing performed included visual inspection and functional checks of accessible electrical components. Full certification testing, including comprehensive insulation resistance testing, earth continuity verification, and detailed RCD performance analysis, is outside the scope of this assessment. Detailed test results and measurements are available upon request from licensed electrical contractors.";
    md.push(defaultTestDataText);
    md.push("");
  }
  
  // Technical Notes
  md.push("### Technical Notes");
  md.push("");
  const technicalNotes = canonical.technician_notes || defaultText.TECHNICAL_NOTES ||
    "This assessment is based on a visual inspection and limited electrical testing of accessible areas only. Some areas may not have been accessible during the inspection.";
  md.push(technicalNotes);
  md.push("");
  
  return md.join("\n");
}

/**
 * Build report Markdown following strict REPORT_STRUCTURE.md order
 */
export async function buildReportMarkdown(params: BuildReportMarkdownParams): Promise<string> {
  const { inspection, canonical, findings, computed, event } = params;
  
  // Load default text
  const defaultText = await loadDefaultText(event);
  
  const sections: string[] = [];
  
  // 1. Cover
  sections.push(buildCoverSection(canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 2. Document Purpose & How to Read This Report
  sections.push(buildPurposeSection(defaultText));
  sections.push(PAGE_BREAK);
  
  // 3. Executive Summary (One-Page Only)
  sections.push(buildExecutiveSummarySection(computed, findings, defaultText));
  sections.push(PAGE_BREAK);
  
  // 4. Priority Overview (Single Table)
  sections.push(buildPriorityOverviewSection(findings));
  sections.push(PAGE_BREAK);
  
  // 5. Assessment Scope & Limitations
  sections.push(buildScopeSection(inspection, canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 6. Observed Conditions & Risk Interpretation (Dynamic Pages)
  const observedConditions = await buildObservedConditionsSection(inspection, canonical, findings, event);
  sections.push(observedConditions);
  sections.push(PAGE_BREAK);
  
  // 7. Thermal Imaging Analysis (If Applicable)
  sections.push(buildThermalImagingSection(canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 8. 5-Year Capital Expenditure (CapEx) Roadmap
  sections.push(buildCapExRoadmapSection(computed, defaultText, findings, params.responses));
  sections.push(PAGE_BREAK);
  
  // 9. Decision Pathways (was Investor Options & Next Steps)
  sections.push(buildDecisionPathwaysSection(defaultText));
  sections.push(PAGE_BREAK);
  
  // 10. Important Legal Limitations & Disclaimer (Terms & Conditions)
  const terms = await buildTermsSection();
  sections.push(terms);
  sections.push(PAGE_BREAK);
  
  // 11. Closing Statement
  sections.push(buildClosingSection(canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 12. Appendix (Optional)
  sections.push(buildAppendixSection(canonical, defaultText));
  
  return sections.join("");
}
