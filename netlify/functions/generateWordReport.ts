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

/**
 * Load responses.yml file (standardized text templates for findings)
 * Tries blob store first, then falls back to file system
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
          content = fixWordTemplate(content);
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
          
          // Use docxtemplater's getTags() method to get all recognized tags
          try {
            const tags = doc.getTags();
            console.log("📋 Found placeholders via doc.getTags():", JSON.stringify(tags, null, 2));
            
            // Extract tag names from the tags structure
            const tagNames: string[] = [];
            if (tags && typeof tags === 'object') {
              // Check document tags
              if (tags.document && tags.document.tags) {
                Object.keys(tags.document.tags).forEach(tag => tagNames.push(tag));
              }
              // Check header tags
              if (tags.headers && Array.isArray(tags.headers)) {
                tags.headers.forEach((header: any) => {
                  if (header.tags) {
                    Object.keys(header.tags).forEach(tag => tagNames.push(tag));
                  }
                });
              }
              // Check footer tags
              if (tags.footers && Array.isArray(tags.footers)) {
                tags.footers.forEach((footer: any) => {
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
export type ReportData = {
  inspection_id: string;
  immediate: string[];
  recommended: string[];
  plan: string[];
  limitations: string[];
};

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
};

/**
 * Build report data from inspection - unified data structure for HTML and Word
 * Returns findings grouped by priority
 */
export async function buildReportData(inspection: StoredInspection, event?: HandlerEvent): Promise<ReportData> {
  const responses = await loadResponses(event);
  const findingsMap = responses.findings || {};
  
  // Group findings by priority and use standardized text from responses.yml
  const immediate: string[] = [];
  const recommended: string[] = [];
  const plan: string[] = [];
  
  inspection.findings.forEach((finding) => {
    const findingCode = finding.id;
    const findingResponse = findingsMap[findingCode];
    
    // Use standardized text from responses.yml if available, otherwise fallback to title or id
    let findingText: string;
    if (findingResponse && findingResponse.title) {
      findingText = findingResponse.title;
    } else {
      findingText = finding.title || findingCode.replace(/_/g, " ");
    }
    
    if (finding.priority === "IMMEDIATE") {
      immediate.push(findingText);
    } else if (finding.priority === "RECOMMENDED_0_3_MONTHS") {
      recommended.push(findingText);
    } else if (finding.priority === "PLAN_MONITOR") {
      plan.push(findingText);
    }
  });
  
  return {
    inspection_id: inspection.inspection_id,
    immediate,
    recommended,
    plan,
    limitations: inspection.limitations || [],
  };
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
 */
export async function buildWordTemplateData(
  inspection: StoredInspection,
  reportData: ReportData,
  event?: HandlerEvent
): Promise<WordTemplateData> {
  // Load all data sources
  const defaultText = await loadDefaultText(event);
  const responses = await loadResponses(event);
  const findingsMap = responses.findings || {};
  const raw = inspection.raw;
  
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
  
  // Format findings by priority
  const immediateFindings: string[] = [];
  const recommendedFindings: string[] = [];
  const planFindings: string[] = [];
  
  inspection.findings.forEach((finding) => {
    const formattedFinding = formatFindingWithDetails(finding);
    
    if (finding.priority === "IMMEDIATE") {
      immediateFindings.push(formattedFinding);
    } else if (finding.priority === "RECOMMENDED_0_3_MONTHS") {
      recommendedFindings.push(formattedFinding);
    } else if (finding.priority === "PLAN_MONITOR") {
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
  
  // OVERALL_STATUS
  let overallStatus: string;
  if (reportData.immediate.length > 0) {
    overallStatus = "Requires Immediate Attention";
  } else if (reportData.recommended.length > 0) {
    overallStatus = "Requires Recommended Actions";
  } else if (reportData.plan.length > 0) {
    overallStatus = "Satisfactory - Plan Monitoring";
  } else {
    overallStatus = defaultText.OVERALL_STATUS; // Priority 3 fallback
  }
  
  // RISK_RATING
  let riskRating: string;
  if (reportData.immediate.length > 0) {
    riskRating = "HIGH";
  } else if (reportData.recommended.length > 0) {
    riskRating = "MODERATE";
  } else {
    riskRating = defaultText.RISK_RATING; // Priority 3 fallback
  }
  
  // EXECUTIVE_SUMMARY
  const executiveSummaryParts: string[] = [];
  if (reportData.immediate.length > 0) {
    executiveSummaryParts.push(`${reportData.immediate.length} immediate safety concern(s) identified requiring urgent attention.`);
  }
  if (reportData.recommended.length > 0) {
    executiveSummaryParts.push(`${reportData.recommended.length} recommended action(s) for short-term planning.`);
  }
  if (reportData.plan.length > 0) {
    executiveSummaryParts.push(`${reportData.plan.length} item(s) identified for ongoing monitoring.`);
  }
  const executiveSummary = executiveSummaryParts.length > 0
    ? executiveSummaryParts.join(" ")
    : defaultText.EXECUTIVE_SUMMARY; // Priority 3 fallback
  
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
    console.log("generateWordReport handler started");
    
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
    
    // Get inspection data from store
    console.log("Fetching inspection data...");
    const inspection = await get(inspection_id, event);
    
    if (!inspection) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Inspection not found" })
      };
    }
    
    console.log("Inspection data retrieved:", {
      inspection_id: inspection.inspection_id,
      findings_count: inspection.findings.length,
      limitations_count: inspection.limitations.length
    });
    
    // Build unified report data (for HTML report)
    const reportData = await buildReportData(inspection, event);
    console.log("Report data built:", {
      immediate: reportData.immediate.length,
      recommended: reportData.recommended.length,
      plan: reportData.plan.length,
      limitations: reportData.limitations.length
    });
    
    // Build Word template data with three-tier priority system
    const templateData = await buildWordTemplateData(inspection, reportData, event);
    console.log("Word template data built with all placeholders:", Object.keys(templateData));
    
    // Load Word template (fixWordTemplate is already called inside loadWordTemplate if needed)
    let templateBuffer = loadWordTemplate();
    
    // Double-check for split placeholders before generating
    console.log("🔍 Final check for split placeholders before generating...");
    if (hasSplitPlaceholders(templateBuffer)) {
      console.log("⚠️  Found split placeholders in final check, applying fix...");
      const beforeFix = templateBuffer.length;
      templateBuffer = fixWordTemplate(templateBuffer);
      console.log(`✅ Fixed template: ${beforeFix} -> ${templateBuffer.length} bytes`);
      
      // Verify again
      if (hasSplitPlaceholders(templateBuffer)) {
        console.warn("⚠️  Warning: Still found split placeholders after final fix");
      } else {
        console.log("✅ Final verification passed: No split placeholders found");
      }
    } else {
      console.log("✅ Final check passed: No split placeholders found");
    }
    
    // Log template data for debugging
    console.log("Template data prepared:", Object.keys(templateData));
    console.log("Template data sample:", {
      INSPECTION_ID: templateData.INSPECTION_ID,
      IMMEDIATE_FINDINGS: templateData.IMMEDIATE_FINDINGS.substring(0, 200),
      RECOMMENDED_FINDINGS: templateData.RECOMMENDED_FINDINGS.substring(0, 200),
      PLAN_FINDINGS: templateData.PLAN_FINDINGS.substring(0, 200),
      OVERALL_STATUS: templateData.OVERALL_STATUS,
      RISK_RATING: templateData.RISK_RATING,
    });
    
    // Generate Word document
    console.log("🔧 STEP 3: Creating PizZip instance from fixed template...");
    console.log(`   Template buffer size: ${templateBuffer.length} bytes`);
    let zip: any;
    try {
      zip = new PizZip(templateBuffer);
      console.log("✅ STEP 3 completed: PizZip created successfully");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to create PizZip:", errorMsg);
      throw new Error(`Failed to create PizZip: ${errorMsg}`);
    }
    
    console.log("🔧 STEP 4: Creating Docxtemplater instance...");
    console.log("   This is where split placeholder errors would occur if fix didn't work");
    let doc: any;
    try {
      doc = new Docxtemplater(zip, docOptions);
      console.log("✅ STEP 4 completed: Docxtemplater created successfully");
    } catch (e: any) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to create Docxtemplater:", errorMsg);
      
      // Log full error object for debugging
      try {
        console.error("Full error object:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
      } catch (jsonErr) {
        console.error("Could not stringify error object:", jsonErr);
        console.error("Error object keys:", Object.keys(e));
        console.error("Error object:", e);
      }
      
      // Build detailed error message
      let detailedErrorMsg = `Failed to create Docxtemplater: ${errorMsg}`;
      
      // Try multiple ways to access error details
      let errorsArray: any[] | null = null;
      
      if (e.properties && e.properties.errors && Array.isArray(e.properties.errors)) {
        errorsArray = e.properties.errors;
        console.log("Found errors via e.properties.errors:", errorsArray.length);
      } else if (e.errors && Array.isArray(e.errors)) {
        errorsArray = e.errors;
        console.log("Found errors via e.errors:", errorsArray.length);
      }
      
      if (errorsArray && errorsArray.length > 0) {
        console.error(`Found ${errorsArray.length} error(s) in template:`);
        const errorDetails: string[] = [];
        
        errorsArray.forEach((err: any, index: number) => {
          const errProperties = err.properties || {};
          const errInfo = {
            name: err.name || errProperties.name,
            message: err.message || errProperties.message,
            id: err.id || errProperties.id,
            context: err.context || errProperties.context,
            file: err.file || errProperties.file,
            offset: err.offset || errProperties.offset,
            explanation: err.explanation || errProperties.explanation
          };
          console.error(`Error ${index + 1}:`, errInfo);
          const errorId = errInfo.id || errInfo.name || 'unknown';
          const errorMsg = errInfo.message || errInfo.explanation || 'no message';
          const errorContext = errInfo.context || 'none';
          errorDetails.push(`Error ${index + 1}: ${errorId} - ${errorMsg} (context: ${errorContext})`);
        });
        
        const duplicateErrors = errorsArray.filter((err: any) => {
          const errId = err.id || err.properties?.id;
          return errId === "duplicate_open_tag" || errId === "duplicate_close_tag";
        });
        
        if (duplicateErrors.length > 0) {
          // Try to fix the template using the fix script
          console.log(`🔧 Attempting to fix template based on ${duplicateErrors.length} duplicate tag error(s)...`);
          try {
            // 首先尝试常规修复
            let fixedBuffer = fixWordTemplate(templateBuffer);
            
            // 如果常规修复没有效果，使用基于错误信息的修复
            const errorInfo = duplicateErrors.map((err: any) => ({
              id: err.id || err.properties?.id,
              context: err.context || err.properties?.context
            }));
            fixedBuffer = fixWordTemplateFromErrors(fixedBuffer, errorInfo);
            
            // Try again with the fixed template
            console.log("🔧 Retrying Docxtemplater creation with fixed template...");
            const fixedZip = new PizZip(fixedBuffer);
            const retryDoc = new Docxtemplater(fixedZip, docOptions);
            
            console.log("✅ Successfully fixed template and created Docxtemplater instance!");
            doc = retryDoc;
            zip = fixedZip; // Update zip reference for later use
            templateBuffer = fixedBuffer; // Update buffer reference
          } catch (retryError: any) {
            console.error("❌ Retry after fix failed:", retryError.message);
            detailedErrorMsg =
              `Docxtemplater delimiter mismatch: your template uses {{TAG}} but Docxtemplater is using default {TAG}. ` +
              `Fix: set delimiters: { start: "{{", end: "}}" } when creating Docxtemplater (including retry).` +
              `\n\nError details:\n${errorDetails.join('\n')}`;
            throw new Error(detailedErrorMsg);
          }
        } else {
          detailedErrorMsg = 
            `Docxtemplater error: ${errorMsg}\n\n` +
            `Found ${errorsArray.length} error(s) in template:\n${errorDetails.join('\n')}`;
          throw new Error(detailedErrorMsg);
        }
      } else {
        throw new Error(detailedErrorMsg);
      }
    }
    
    console.log("Rendering template with data...");
    try {
      // Before rendering, get all tags that docxtemplater recognizes
      try {
        const tags = doc.getTags();
        console.log("📋 Tags recognized by docxtemplater before render:", JSON.stringify(tags, null, 2));
        
        // Extract tag names from the tags structure
        const tagNames: string[] = [];
        if (tags && typeof tags === 'object') {
          // Check document tags
          if (tags.document && tags.document.tags) {
            Object.keys(tags.document.tags).forEach(tag => tagNames.push(tag));
          }
          // Check header tags
          if (tags.headers && Array.isArray(tags.headers)) {
            tags.headers.forEach((header: any) => {
              if (header.tags) {
                Object.keys(header.tags).forEach(tag => tagNames.push(tag));
              }
            });
          }
          // Check footer tags
          if (tags.footers && Array.isArray(tags.footers)) {
            tags.footers.forEach((footer: any) => {
              if (footer.tags) {
                Object.keys(footer.tags).forEach(tag => tagNames.push(tag));
              }
            });
          }
        }
        
        console.log("📋 Extracted tag names:", tagNames);
        
        // Check which tags we're providing data for
        const providedTags = Object.keys(templateData);
        const missingTags = tagNames.filter((tag: string) => !providedTags.includes(tag));
        const extraTags = providedTags.filter(tag => !tagNames.includes(tag));
        
        if (tagNames.length === 0) {
          console.warn("⚠️ WARNING: No tags found in Word template! The template may not have any {{PLACEHOLDER}} tags.");
          console.warn("⚠️ Please check the Word template file and ensure it contains placeholders like {{INSPECTION_ID}}, {{IMMEDIATE_FINDINGS}}, etc.");
        }
        
        if (missingTags.length > 0) {
          console.warn("⚠️ Tags in template but not in data:", missingTags);
          // Add default empty string values for missing tags to prevent "undefined" in output
          missingTags.forEach((tag: string) => {
            templateData[tag] = "";
            console.log(`   Added default empty value for missing tag: ${tag}`);
          });
        }
        if (extraTags.length > 0) {
          console.warn("⚠️ Tags in data but not in template:", extraTags);
          console.warn("⚠️ These tags will be ignored. Please add them to the Word template or remove them from the data.");
        }
        
        // Ensure all values are strings (convert undefined/null to empty string)
        Object.keys(templateData).forEach(key => {
          const value = templateData[key];
          if (value == null || value === undefined) {
            templateData[key] = "";
            console.log(`   Converted undefined/null to empty string for: ${key}`);
          } else if (typeof value !== "string") {
            templateData[key] = String(value);
          }
        });
        
        // Log what we're providing
        console.log("Setting data with keys:", Object.keys(templateData));
        console.log("Sample values:", {
          INSPECTION_ID: templateData.INSPECTION_ID,
          IMMEDIATE_FINDINGS_length: templateData.IMMEDIATE_FINDINGS?.length || 0,
          RECOMMENDED_FINDINGS_length: templateData.RECOMMENDED_FINDINGS?.length || 0,
          PLAN_FINDINGS_length: templateData.PLAN_FINDINGS?.length || 0,
          LIMITATIONS_length: templateData.LIMITATIONS?.length || 0,
        });
      } catch (tagErr) {
        console.log("Could not get tags before render:", tagErr);
        // Even if we can't get tags, ensure all values are strings
        Object.keys(templateData).forEach(key => {
          const value = templateData[key];
          if (value == null || value === undefined) {
            templateData[key] = "";
          } else if (typeof value !== "string") {
            templateData[key] = String(value);
          }
        });
      }
      
      // Use new API: render() with data directly (setData is deprecated)
      // Convert WordTemplateData to Record<string, string> for docxtemplater
      const renderData: Record<string, string> = { ...templateData };
      doc.render(renderData);
      console.log("✅ Template rendered successfully");
      
      // After rendering, check what was actually replaced
      try {
        const renderedText = doc.getFullText();
        console.log("Rendered text sample (first 1000 chars):", renderedText.substring(0, 1000));
        
        // Check if placeholders are still present (meaning they weren't replaced)
        const remainingPlaceholders = renderedText.match(/\{\{[^}]+\}\}/g);
        if (remainingPlaceholders && remainingPlaceholders.length > 0) {
          const uniqueRemaining = Array.from(new Set(remainingPlaceholders));
          console.warn("⚠️ Found unreplaced placeholders in rendered text:", uniqueRemaining);
        } else {
          console.log("✅ No unreplaced placeholders found in rendered text");
        }
      } catch (textErr) {
        console.warn("Could not get rendered text:", textErr);
      }
    } catch (e: any) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to render template:", errorMsg);
      
      if (e.errors && Array.isArray(e.errors)) {
        console.error(`Found ${e.errors.length} rendering error(s):`);
        e.errors.forEach((err: any, index: number) => {
          console.error(`Error ${index + 1}:`, {
            name: err.name,
            message: err.message,
            id: err.id,
            context: err.context,
            file: err.file,
            offset: err.offset,
            explanation: err.explanation
          });
        });
      }
      
      throw new Error(`Failed to render template: ${errorMsg}`);
    }
    
    console.log("Generating buffer...");
    let buffer: Buffer;
    try {
      buffer = doc.getZip().generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      console.log("✅ Word document generated, size:", buffer.length, "bytes");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to generate buffer:", errorMsg);
      throw new Error(`Failed to generate buffer: ${errorMsg}`);
    }
    
    // Save to Netlify Blob
    const blobKey = `reports/${inspection_id}.docx`;
    await saveWordDoc(blobKey, buffer, event);
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
