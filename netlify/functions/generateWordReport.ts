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
import { buildReportMarkdown } from "./lib/buildReportMarkdown.js";
import { markdownToHtml } from "./lib/markdownToHtml.js";
import { renderDocx } from "./lib/renderDocx.js";

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
 * Build cover data (6 fields only) for Word template
 * Used for Markdown-based report generation
 * 
 * @param inspection Inspection data
 * @param event Optional HandlerEvent for loading configs
 * @returns Cover data with 6 basic fields
 */
async function buildCoverData(
  inspection: StoredInspection,
  event?: HandlerEvent
): Promise<Record<string, string>> {
  const defaultText = await loadDefaultText(event);
  const raw = inspection.raw;
  
  const inspectionId = inspection.inspection_id || defaultText.INSPECTION_ID;
  
  const createdAt = getFieldValue(raw, "created_at");
  const assessmentDate = createdAt 
    ? new Date(createdAt).toISOString().split('T')[0]
    : (new Date().toISOString().split('T')[0] || defaultText.ASSESSMENT_DATE);
  
  const propertyAddress = getFieldValue(raw, "job.address") || defaultText.PROPERTY_ADDRESS;
  const propertyType = getFieldValue(raw, "job.property_type") || defaultText.PROPERTY_TYPE;
  const preparedFor = getFieldValue(raw, "client.name") || getFieldValue(raw, "client.client_type") || defaultText.PREPARED_FOR;
  const preparedBy = getFieldValue(raw, "signoff.technician_name") || defaultText.PREPARED_BY;
  
  return {
    INSPECTION_ID: inspectionId,
    ASSESSMENT_DATE: assessmentDate,
    PREPARED_FOR: preparedFor,
    PREPARED_BY: preparedBy,
    PROPERTY_ADDRESS: propertyAddress,
    PROPERTY_TYPE: propertyType,
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
 * 
 * @deprecated This function is kept for backward compatibility.
 * For new Markdown-based reports, use buildCoverData + buildReportMarkdown instead.
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
    
    // Load responses for Markdown generation
    const responses = await loadResponses(event);
    
    // Build computed fields (for Markdown generation)
    const reportData = await buildReportData(inspection, event);
    const riskRating = reportData.immediate.length > 0 ? "HIGH" : 
                      (reportData.recommended.length > 0 ? "MODERATE" : "LOW");
    const overallStatus = `${riskRating} RISK`;
    
    // Load executive summary templates
    const executiveSummaryTemplates = await loadExecutiveSummaryTemplates(event);
    let executiveSummary: string;
    if (riskRating === "HIGH") {
      executiveSummary = executiveSummaryTemplates.HIGH || "This property presents a high electrical risk profile.";
    } else if (riskRating === "MODERATE") {
      executiveSummary = executiveSummaryTemplates.MODERATE || "This property presents a moderate electrical risk profile.";
    } else {
      let lowRiskSummary = executiveSummaryTemplates.LOW || "This property presents a low electrical risk profile.";
      if (reportData.plan.length > 0) {
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
    
    const computed = {
      OVERALL_STATUS: overallStatus,
      RISK_RATING: riskRating,
      EXECUTIVE_SUMMARY: executiveSummary,
      CAPEX_RANGE: "To be confirmed", // Can be enhanced later
    };
    
    console.log("Computed fields:", computed);
    
    // Build cover data (6 fields only)
    const coverData = await buildCoverData(inspection, event);
    console.log("Cover data built:", Object.keys(coverData));
    
    // Generate Markdown report
    console.log("Generating Markdown report...");
    const markdown = buildReportMarkdown({
      inspection,
      findings: inspection.findings,
      responses,
      computed,
    });
    console.log("Markdown generated, length:", markdown.length);
    
    // Convert Markdown to HTML
    console.log("Converting Markdown to HTML...");
    const html = markdownToHtml(markdown);
    console.log("HTML generated, length:", html.length);
    
    // Prepare data for renderDocx
    const templateData = {
      ...coverData,
      REPORT_BODY_HTML: html,
    };
    
    // Load Word template (use report-template-md.docx if available, otherwise fallback to report-template.docx)
    let templateBuffer: Buffer;
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
    for (const templatePath of possibleMdPaths) {
      if (fs.existsSync(templatePath)) {
        console.log(`✅ Found report-template-md.docx at: ${templatePath}`);
        templateBuffer = fs.readFileSync(templatePath);
        foundMdTemplate = true;
        break;
      }
    }
    
    if (!foundMdTemplate) {
      console.log("⚠️ report-template-md.docx not found in any location, using report-template.docx");
      console.log("⚠️ Searched paths:", possibleMdPaths);
      templateBuffer = loadWordTemplate();
    }
    
    // Check if template contains REPORT_BODY_HTML placeholder
    // This is a required protection: throw error if placeholder is missing
    // Note: Word may split placeholders across XML nodes, so we check for the text content
    const zip = new PizZip(templateBuffer);
    const documentXml = zip.files["word/document.xml"]?.asText() || "";
    
    // Check for REPORT_BODY_HTML in various forms
    // 1. Direct match (most common)
    // 2. Case-insensitive match
    // 3. Check if it might be split across XML nodes (look for parts)
    const hasPlaceholder = documentXml.includes("REPORT_BODY_HTML") || 
                          documentXml.includes("report_body_html") ||
                          documentXml.includes("Report_Body_Html");
    
    if (!hasPlaceholder) {
      // Try to extract a sample of the document to help debug
      const sampleXml = documentXml.substring(0, 2000);
      console.error("❌ 模板中未找到 {{REPORT_BODY_HTML}} 占位符");
      console.error("文档 XML 长度:", documentXml.length);
      console.error("文档 XML 前 2000 字符:", sampleXml);
      console.error("请确保模板文件 report-template-md.docx 中包含 {{REPORT_BODY_HTML}} 占位符");
      throw new Error("模板中未找到 {{REPORT_BODY_HTML}} 占位符。请在模板正文插入 {{REPORT_BODY_HTML}}。");
    }
    console.log("✅ Template contains {{REPORT_BODY_HTML}} placeholder");
    
    // Use renderDocx to generate Word document
    console.log("Rendering Word document with renderDocx...");
    const outBuffer = await renderDocx(templateBuffer, templateData);
    console.log("Word document generated, size:", outBuffer.length, "bytes");
    
    // Log debug info (only in dev environment)
    if (process.env.NETLIFY_DEV === "true" || process.env.NODE_ENV === "development") {
      console.log("=== Debug Info ===");
      console.log("Findings counts:", {
        immediate: reportData.immediate.length,
        recommended: reportData.recommended.length,
        plan: reportData.plan.length,
        limitations: reportData.limitations.length,
      });
      console.log("Markdown preview (first 1200 chars):", markdown.substring(0, 1200));
      console.log("HTML preview (first 1200 chars):", html.substring(0, 1200));
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
