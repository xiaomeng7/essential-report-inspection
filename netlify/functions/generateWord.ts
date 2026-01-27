import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { get } from "./lib/store";
import { saveWordDoc } from "./lib/store";

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

// Helper function to extract value from Answer object
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
  return String(v);
}

// Prepare data for Word template
function prepareWordData(
  inspectionId: string,
  raw: Record<string, unknown>,
  findings: Array<{ id: string; priority: string; title?: string }>,
  limitations: string[]
): Record<string, unknown> {
  // Extract basic info
  const job = raw.job as Record<string, unknown> | undefined;
  const address = extractValue(job?.address) as string | undefined;
  const technicianName = extractValue(job?.technician_name) as string | undefined;
  const assessmentDate = extractValue(job?.assessment_date) as string | undefined;
  
  // Format date
  let formattedDate = "";
  if (assessmentDate) {
    try {
      const date = new Date(assessmentDate);
      formattedDate = date.toLocaleDateString("en-AU", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch (e) {
      formattedDate = String(assessmentDate);
    }
  }
  
  // Group findings by priority
  const immediateFindings = findings.filter(f => f.priority === "IMMEDIATE");
  const recommendedFindings = findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS");
  const planFindings = findings.filter(f => f.priority === "PLAN_MONITOR");
  
  // Format findings as text
  const formatFindings = (findingsList: Array<{ id: string; priority: string; title?: string }>) => {
    if (findingsList.length === 0) return "None identified.";
    return findingsList.map((f, i) => `${i + 1}. ${f.title || f.id}`).join("\n");
  };
  
  // Format limitations
  const limitationsText = limitations.length > 0 
    ? limitations.map((l, i) => `${i + 1}. ${l}`).join("\n")
    : "Standard limitations apply as per assessment scope.";
  
  return {
    INSPECTION_ID: inspectionId,
    ASSESSMENT_DATE: formattedDate || new Date().toLocaleDateString("en-AU"),
    PREPARED_FOR: extractValue(job?.prepared_for) as string || "Client",
    PREPARED_BY: technicianName || "Technician",
    PROPERTY_ADDRESS: address || "Property Address",
    PROPERTY_TYPE: extractValue(job?.property_type) as string || "Residential",
    
    IMMEDIATE_FINDINGS: formatFindings(immediateFindings),
    RECOMMENDED_FINDINGS: formatFindings(recommendedFindings),
    PLAN_FINDINGS: formatFindings(planFindings),
    
    LIMITATIONS: limitationsText,
    
    // Additional fields that might be in template
    REPORT_VERSION: "1.0",
    OVERALL_STATUS: immediateFindings.length > 0 ? "Requires Immediate Attention" : "Acceptable",
  };
}

// Load Word template
function loadWordTemplate(): Buffer {
  // Try multiple paths - prioritize same directory as function (where included_files places it)
  const possiblePaths = [
    // First try: same directory as the function file (netlify/functions/)
    // This is where included_files will place the template
    path.join(__dirname, "report-template.docx"),
    // Second try: current working directory (for Netlify Functions runtime)
    path.join(process.cwd(), "report-template.docx"),
    // Third try: netlify/functions subdirectory from cwd
    path.join(process.cwd(), "netlify", "functions", "report-template.docx"),
    // Fourth try: parent directory (netlify/)
    path.join(__dirname, "..", "report-template.docx"),
    // Fifth try: Netlify build environment paths
    "/opt/build/repo/report-template.docx",
    "/opt/build/repo/netlify/functions/report-template.docx",
    // Fallback: relative paths
    path.join(process.cwd(), "..", "report-template.docx"),
    "./report-template.docx",
    "./netlify/functions/report-template.docx",
  ];
  
  console.log("Loading Word template...");
  console.log("process.cwd():", process.cwd());
  console.log("__dirname:", __dirname);
  console.log("Will try", possiblePaths.length, "paths");
  
  for (const templatePath of possiblePaths) {
    try {
      if (!templatePath || typeof templatePath !== "string" || templatePath.includes("undefined")) {
        console.log("Skipping invalid path:", templatePath);
        continue;
      }
      
      console.log("Trying to load template from:", templatePath);
      if (fs.existsSync(templatePath)) {
        const content = fs.readFileSync(templatePath);
        console.log("✅ Successfully loaded Word template from:", templatePath);
        console.log("Template size:", content.length, "bytes");
        return content;
      } else {
        console.log("❌ Template not found at:", templatePath);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.warn(`❌ Failed to load template from ${templatePath}:`, errorMsg);
      continue;
    }
  }
  
  console.error("❌ Could not load report-template.docx from any path");
  console.error("Tried", possiblePaths.length, "paths");
  console.error("Current working directory:", process.cwd());
  console.error("__dirname:", __dirname);
  throw new Error("Could not load report-template.docx from any path");
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    console.log("GenerateWord handler started");
    const body = JSON.parse(event.body || "{}");
    const { inspection_id } = body;

    if (!inspection_id) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "inspection_id is required" })
      };
    }

    // Get inspection data from store
    console.log("Fetching inspection data for:", inspection_id);
    const inspection = await get(inspection_id, event);
    
    if (!inspection) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Inspection not found" })
      };
    }

    // Load Word template
    console.log("Loading Word template...");
    let templateBuffer: Buffer;
    try {
      templateBuffer = loadWordTemplate();
      console.log("✅ Template loaded successfully, size:", templateBuffer.length, "bytes");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to load template:", errorMsg);
      throw new Error(`Failed to load Word template: ${errorMsg}`);
    }
    
    // Prepare data for template
    console.log("Preparing template data...");
    const templateData = prepareWordData(
      inspection.inspection_id,
      inspection.raw,
      inspection.findings,
      inspection.limitations
    );
    
    console.log("Template data prepared:", Object.keys(templateData));
    console.log("Template data sample:", JSON.stringify(templateData, null, 2).substring(0, 500));
    
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
      console.error("Full error object:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
      
      // Check if it's a duplicate tag error (Word XML splitting issue)
      if (e.errors && Array.isArray(e.errors)) {
        console.error(`Found ${e.errors.length} error(s) in template:`);
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
        
        const duplicateErrors = e.errors.filter((err: any) => 
          err.id === "duplicate_open_tag" || err.id === "duplicate_close_tag"
        );
        
        if (duplicateErrors.length > 0) {
          console.error(`Template has ${duplicateErrors.length} duplicate tag error(s) (Word split tags across XML nodes):`);
          const affectedTags = new Set<string>();
          duplicateErrors.forEach((err: any) => {
            // Extract tag name from context
            const tagMatch = err.context?.match(/\{\{([^}]+)\}\}/);
            const tagName = tagMatch ? tagMatch[1] : err.context;
            affectedTags.add(tagName);
            console.error(`  - Tag: ${tagName}`);
            console.error(`    Error: ${err.name} - ${err.message}`);
            console.error(`    File: ${err.file}, Offset: ${err.offset}`);
            console.error(`    Context: ${err.context}`);
            if (err.explanation) {
              console.error(`    Explanation: ${err.explanation}`);
            }
          });
          
          const tagList = Array.from(affectedTags).join(", ");
          throw new Error(
            `Word template has ${duplicateErrors.length} tag(s) split across XML nodes: ${tagList}. ` +
            `This happens when Word splits text nodes (e.g., when formatting is applied mid-tag). ` +
            `SOLUTION: In your Word template (report-template.docx), ensure ALL placeholders like {{TAG_NAME}} ` +
            `are typed in a SINGLE continuous text run without any formatting changes in the middle. ` +
            `To fix: Select each placeholder entirely, then apply formatting uniformly, or retype it without formatting.`
          );
        }
        
        // Handle other types of errors
        const otherErrors = e.errors.filter((err: any) => 
          err.id !== "duplicate_open_tag" && err.id !== "duplicate_close_tag"
        );
        if (otherErrors.length > 0) {
          console.error(`Template has ${otherErrors.length} other error(s):`);
          otherErrors.forEach((err: any) => {
            console.error(`  - ${err.name}: ${err.message}`);
            console.error(`    Context: ${err.context}, File: ${err.file}`);
          });
          
          const errorMessages = otherErrors.map((err: any) => err.message).join("; ");
          throw new Error(
            `Word template has errors: ${errorMessages}. ` +
            `Please check your template file and ensure all placeholders are correctly formatted.`
          );
        }
      }
      
      throw new Error(`Failed to create Docxtemplater: ${errorMsg}`);
    }
    
    // Set template variables
    console.log("Setting template data...");
    try {
      doc.setData(templateData);
      console.log("✅ Template data set successfully");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to set template data:", errorMsg);
      throw new Error(`Failed to set template data: ${errorMsg}`);
    }
    
    // Render template
    console.log("Rendering template...");
    try {
      doc.render();
      console.log("✅ Template rendered successfully");
    } catch (error) {
      const e = error as { properties?: { name: string; message: string; explanation?: string; file?: string } };
      console.error("❌ Error rendering template:", e);
      if (e.properties) {
        const errorDetails = {
          name: e.properties.name,
          message: e.properties.message,
          explanation: e.properties.explanation,
          file: e.properties.file
        };
        console.error("Template error details:", JSON.stringify(errorDetails));
        throw new Error(`Template rendering error: ${e.properties.message}${e.properties.explanation ? ` - ${e.properties.explanation}` : ""}`);
      }
      throw error;
    }
    
    // Generate buffer
    console.log("Generating Word document buffer...");
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
      throw new Error(`Failed to generate Word document buffer: ${errorMsg}`);
    }
    
    // Save to Netlify Blob
    console.log("Saving to Netlify Blob...");
    const blobKey = `word/${inspection_id}.docx`;
    try {
      await saveWordDoc(blobKey, buffer, event);
      console.log("✅ Word document saved to Blob:", blobKey);
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to save to Blob:", errorMsg);
      throw new Error(`Failed to save Word document to Blob: ${errorMsg}`);
    }
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        inspection_id: inspection_id,
        blob_key: blobKey,
        message: "Word document generated and saved successfully"
      })
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    const errorStack = e instanceof Error ? e.stack : undefined;
    console.error("Error generating Word document:", e);
    console.error("Error stack:", errorStack);
    console.error("Error details:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to generate Word document",
        message: errorMessage,
        stack: process.env.NETLIFY_DEV ? errorStack : undefined // Only include stack in dev
      })
    };
  }
};
