import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveWordDoc, get, type StoredInspection } from "./lib/store";

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
        const content = fs.readFileSync(templatePath);
        console.log("✅ Successfully loaded Word template from:", templatePath);
        console.log("Template size:", content.length, "bytes");
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
    
    // Load Word template
    const templateBuffer = loadWordTemplate();
    
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
    console.log("Creating PizZip instance...");
    let zip: any;
    try {
      zip = new PizZip(templateBuffer);
      console.log("✅ PizZip created successfully");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to create PizZip:", errorMsg);
      throw new Error(`Failed to create PizZip: ${errorMsg}`);
    }
    
    console.log("Creating Docxtemplater instance...");
    let doc: any;
    try {
      doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });
      console.log("✅ Docxtemplater created successfully");
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
          detailedErrorMsg = 
            `Word template has ${duplicateErrors.length} tag(s) split across XML nodes. ` +
            `Please check Netlify function logs for details. ` +
            `SOLUTION: In your Word template (report-template.docx), ensure ALL placeholders like {{TAG_NAME}} ` +
            `are typed in a SINGLE continuous text run without any formatting changes in the middle. ` +
            `\n\nError details:\n${errorDetails.join('\n')}`;
        } else {
          detailedErrorMsg = 
            `Docxtemplater error: ${errorMsg}\n\n` +
            `Found ${errorsArray.length} error(s) in template:\n${errorDetails.join('\n')}`;
        }
      }
      
      throw new Error(detailedErrorMsg);
    }
    
    console.log("Setting template data...");
    try {
      // Log what we're setting
      console.log("Setting data with keys:", Object.keys(templateData));
      console.log("Sample values:", {
        INSPECTION_ID: templateData.INSPECTION_ID,
        IMMEDIATE_FINDINGS_length: templateData.IMMEDIATE_FINDINGS.length,
        RECOMMENDED_FINDINGS_length: templateData.RECOMMENDED_FINDINGS.length,
        PLAN_FINDINGS_length: templateData.PLAN_FINDINGS.length,
        LIMITATIONS_length: templateData.LIMITATIONS.length,
      });
      
      doc.setData(templateData);
      console.log("✅ Template data set successfully");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to set template data:", errorMsg);
      console.error("Template data that failed:", JSON.stringify(templateData, null, 2));
      throw new Error(`Failed to set template data: ${errorMsg}`);
    }
    
    console.log("Rendering template...");
    try {
      doc.render();
      console.log("✅ Template rendered successfully");
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
