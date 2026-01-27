import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
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
  
  console.log("Loading Word template for test...");
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

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { 
      statusCode: 405, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    console.log("testWordBlob handler started");
    
    // Load Word template
    const templateBuffer = loadWordTemplate();
    
    // Test data for template
    const testData = {
      INSPECTION_ID: "TEST-001",
      ASSESSMENT_DATE: "2026-01-27",
      PREPARED_FOR: "Test Client",
      PREPARED_BY: "Better Home Technology Pty Ltd",
      PROPERTY_ADDRESS: "123 Test Street",
      PROPERTY_TYPE: "Residential",
      IMMEDIATE_FINDINGS: "1. Test finding 1\n2. Test finding 2",
      RECOMMENDED_FINDINGS: "1. Test recommended finding",
      PLAN_FINDINGS: "None identified.",
      LIMITATIONS: "Standard limitations apply.",
      REPORT_VERSION: "1.0",
      OVERALL_STATUS: "Test Status",
    };
    
    console.log("Test data prepared:", Object.keys(testData));
    
    // Generate Word document
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    doc.setData(testData);
    doc.render();
    
    // Generate buffer
    const buffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    
    console.log("Word document generated, size:", buffer.length, "bytes");
    
    // Save to Netlify Blob
    const blobKey = "reports/TEST-001.docx";
    await saveWordDoc(blobKey, buffer, event);
    console.log("Word document saved to Blob:", blobKey);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        key: blobKey,
        message: "Test Word document generated and saved successfully"
      })
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    console.error("Error in testWordBlob:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to generate test Word document",
        message: errorMessage
      })
    };
  }
};
