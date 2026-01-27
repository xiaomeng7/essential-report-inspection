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
  // Try multiple paths - prioritize netlify/functions directory (where it's copied during build)
  const possiblePaths = [
    // First try: same directory as the function (netlify/functions/)
    path.join(__dirname, "report-template.docx"),
    // Second try: parent directory (netlify/)
    path.join(__dirname, "..", "report-template.docx"),
    // Third try: project root (for local dev)
    path.join(process.cwd(), "report-template.docx"),
    // Fourth try: netlify/functions from project root
    path.join(process.cwd(), "netlify", "functions", "report-template.docx"),
    // Fifth try: Netlify build environment
    "/opt/build/repo/report-template.docx",
    "/opt/build/repo/netlify/functions/report-template.docx",
    // Fallback: relative to current working directory
    path.join(process.cwd(), "..", "report-template.docx"),
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
    const templateBuffer = loadWordTemplate();
    
    // Prepare data for template
    const templateData = prepareWordData(
      inspection.inspection_id,
      inspection.raw,
      inspection.findings,
      inspection.limitations
    );
    
    console.log("Template data prepared:", Object.keys(templateData));
    
    // Generate Word document
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    // Set template variables
    doc.setData(templateData);
    
    try {
      doc.render();
    } catch (error) {
      const e = error as { properties?: { name: string; message: string } };
      console.error("Error rendering template:", e);
      if (e.properties && e.properties.name === "RenderError") {
        throw new Error(`Template rendering error: ${e.properties.message}`);
      }
      throw error;
    }
    
    // Generate buffer
    const buffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    
    console.log("Word document generated, size:", buffer.length, "bytes");
    
    // Save to Netlify Blob
    const blobKey = `word/${inspection_id}.docx`;
    await saveWordDoc(blobKey, buffer, event);
    console.log("Word document saved to Blob:", blobKey);
    
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
    console.error("Error generating Word document:", e);
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
