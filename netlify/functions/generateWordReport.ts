import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveWordDoc, get, type StoredInspection } from "./lib/store";
import { fixWordTemplate, hasSplitPlaceholders } from "../../scripts/fix-placeholders";

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
          const doc = new Docxtemplater(fixedZip, {
            paragraphLoop: true,
            linebreaks: true,
          });
          
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
                // Use the fix script to repair split placeholders
                const fixedBuffer = fixWordTemplate(content);
                
                // Try again with fixed template
                const retryZip = new PizZip(fixedBuffer);
                const retryDoc = new Docxtemplater(retryZip, {
                  paragraphLoop: true,
                  linebreaks: true,
                });
                
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

export function buildReportData(inspection: StoredInspection): ReportData {
  // Group findings by priority
  const immediate: string[] = [];
  const recommended: string[] = [];
  const plan: string[] = [];
  
  inspection.findings.forEach((finding) => {
    const title = finding.title || finding.id.replace(/_/g, " ");
    if (finding.priority === "IMMEDIATE") {
      immediate.push(title);
    } else if (finding.priority === "RECOMMENDED_0_3_MONTHS") {
      recommended.push(title);
    } else if (finding.priority === "PLAN_MONITOR") {
      plan.push(title);
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
    
    // Build unified report data
    const reportData = buildReportData(inspection);
    console.log("Report data built:", {
      immediate: reportData.immediate.length,
      recommended: reportData.recommended.length,
      plan: reportData.plan.length,
      limitations: reportData.limitations.length
    });
    
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
    
    // Format findings as bullet-point text with defaults for empty arrays
    const immediateText = formatFindingsText(
      reportData.immediate,
      "No immediate safety risks were identified at the time of inspection."
    );
    
    const recommendedText = formatFindingsText(
      reportData.recommended,
      "No items requiring monitoring or planned attention were identified at the time of inspection."
    );
    
    const planText = formatFindingsText(
      reportData.plan,
      "No items requiring action were identified at the time of inspection."
    );
    
    const limitationsText = formatFindingsText(
      reportData.limitations,
      "No material limitations were noted beyond standard non-invasive constraints."
    );
    
    // Prepare template data - use real inspection_id and findings data
    // Note: Ensure placeholder names match exactly what's in the Word template
    const templateData: Record<string, string> = {
      INSPECTION_ID: inspection_id,
      ASSESSMENT_DATE: new Date().toISOString().split('T')[0], // Current date in YYYY-MM-DD format
      PREPARED_FOR: "", // TODO: Extract from inspection data
      PREPARED_BY: "Better Home Technology Pty Ltd", // Default value
      PROPERTY_ADDRESS: "", // TODO: Extract from inspection data
      PROPERTY_TYPE: "", // TODO: Extract from inspection data
      IMMEDIATE_FINDINGS: immediateText,
      RECOMMENDED_FINDINGS: recommendedText,
      PLAN_FINDINGS: planText,
      LIMITATIONS: limitationsText,
      REPORT_VERSION: "1.0",
      OVERALL_STATUS: "", // TODO: Calculate from findings
      EXECUTIVE_SUMMARY: "", // TODO: Generate from inspection data
      RISK_RATING: "", // TODO: Calculate from findings
      RISK_RATING_FACTORS: "", // TODO: Extract from inspection data
      URGENT_FINDINGS: "", // TODO: Extract from inspection findings (if different from immediate)
      TEST_SUMMARY: "", // TODO: Extract from inspection data
      TECHNICAL_NOTES: "", // TODO: Extract from inspection data
    };
    
    // Log all template data for debugging
    console.log("Template data prepared:", Object.keys(templateData));
    console.log("Template data values:", {
      INSPECTION_ID: templateData.INSPECTION_ID,
      IMMEDIATE_FINDINGS: templateData.IMMEDIATE_FINDINGS.substring(0, 200),
      RECOMMENDED_FINDINGS: templateData.RECOMMENDED_FINDINGS.substring(0, 200),
      PLAN_FINDINGS: templateData.PLAN_FINDINGS.substring(0, 200),
      LIMITATIONS: templateData.LIMITATIONS.substring(0, 200),
    });
    
    // Log findings counts for verification
    console.log("Findings counts:", {
      immediate: reportData.immediate.length,
      recommended: reportData.recommended.length,
      plan: reportData.plan.length,
      limitations: reportData.limitations.length
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
      doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });
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
            const fixedBuffer = fixWordTemplate(templateBuffer);
            
            // Try again with the fixed template
            console.log("🔧 Retrying Docxtemplater creation with fixed template...");
            const fixedZip = new PizZip(fixedBuffer);
            const retryDoc = new Docxtemplater(fixedZip, {
              paragraphLoop: true,
              linebreaks: true,
            });
            
            console.log("✅ Successfully fixed template and created Docxtemplater instance!");
            doc = retryDoc;
            zip = fixedZip; // Update zip reference for later use
            templateBuffer = fixedBuffer; // Update buffer reference
          } catch (retryError: any) {
            console.error("❌ Retry after fix failed:", retryError.message);
            detailedErrorMsg = 
              `Word template has ${duplicateErrors.length} tag(s) split across XML nodes. ` +
              `Automatic fix attempted but failed. ` +
              `Please check Netlify function logs for details. ` +
              `SOLUTION: In your Word template (report-template.docx), ensure ALL placeholders like {{TAG_NAME}} ` +
              `are typed in a SINGLE continuous text run without any formatting changes in the middle. ` +
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
        }
        if (extraTags.length > 0) {
          console.warn("⚠️ Tags in data but not in template:", extraTags);
          console.warn("⚠️ These tags will be ignored. Please add them to the Word template or remove them from the data.");
        }
        
        // Log what we're providing
        console.log("Setting data with keys:", Object.keys(templateData));
        console.log("Sample values:", {
          INSPECTION_ID: templateData.INSPECTION_ID,
          IMMEDIATE_FINDINGS_length: templateData.IMMEDIATE_FINDINGS.length,
          RECOMMENDED_FINDINGS_length: templateData.RECOMMENDED_FINDINGS.length,
          PLAN_FINDINGS_length: templateData.PLAN_FINDINGS.length,
          LIMITATIONS_length: templateData.LIMITATIONS.length,
        });
      } catch (tagErr) {
        console.log("Could not get tags before render:", tagErr);
      }
      
      // Use new API: render() with data directly (setData is deprecated)
      doc.render(templateData);
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
