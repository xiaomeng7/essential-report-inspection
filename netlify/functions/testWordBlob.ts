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
      // According to docxtemplater docs, MultiError has error.properties.errors array
      let errorsArray: any[] | null = null;
      
      // Method 1: Properties.errors (most common for MultiError)
      if (e.properties && e.properties.errors && Array.isArray(e.properties.errors)) {
        errorsArray = e.properties.errors;
        console.log("Found errors via e.properties.errors:", errorsArray.length);
      }
      // Method 2: Direct errors property
      else if (e.errors && Array.isArray(e.errors)) {
        errorsArray = e.errors;
        console.log("Found errors via e.errors:", errorsArray.length);
      }
      // Method 3: Check nested properties
      else if (e.properties && typeof e.properties === 'object') {
        // Try to find errors in any property
        for (const key in e.properties) {
          if (Array.isArray(e.properties[key])) {
            console.log(`Found array in e.properties.${key}:`, e.properties[key].length);
            // Check if it looks like an errors array
            const arr = e.properties[key];
            if (arr.length > 0 && (arr[0].properties || arr[0].id || arr[0].message)) {
              errorsArray = arr;
              console.log("Using this array as errors:", errorsArray.length);
              break;
            }
          }
        }
      }
      // Method 4: Check if error itself is an array-like structure
      else if (Array.isArray(e)) {
        errorsArray = e;
        console.log("Error itself is an array:", errorsArray.length);
      }
      
      // Log what we found
      if (!errorsArray) {
        console.error("Could not find errors array. Error structure:", {
          hasErrors: !!e.errors,
          hasProperties: !!e.properties,
          propertiesKeys: e.properties ? Object.keys(e.properties) : [],
          errorKeys: Object.keys(e),
          errorType: e.constructor?.name,
          errorName: e.name
        });
      }
      
      // Check if it's a duplicate tag error (Word XML splitting issue)
      if (errorsArray && errorsArray.length > 0) {
        console.error(`Found ${errorsArray.length} error(s) in template:`);
        const errorDetails: string[] = [];
        
        errorsArray.forEach((err: any, index: number) => {
          // Extract error info - docxtemplater errors have properties nested
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
          console.error(`Error ${index + 1} full object:`, JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
          
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
          console.error(`Template has ${duplicateErrors.length} duplicate tag error(s) (Word split tags across XML nodes):`);
          
          // Group errors by tag to identify which tags are split
          const tagGroups: Record<string, Array<{type: string, context: string, offset: number}>> = {};
          duplicateErrors.forEach((err: any) => {
            // Extract error properties (may be nested)
            const errId = err.id || err.properties?.id;
            const errContext = err.context || err.properties?.context || "";
            const errOffset = err.offset || err.properties?.offset;
            
            // Try to identify the full tag name from partial contexts
            let tagKey = "UNKNOWN";
            if (errContext) {
              // For open tags like "{{PROP", try to find matching close tag
              if (errId === "duplicate_open_tag" && errContext.startsWith("{{")) {
                tagKey = errContext;
              }
              // For close tags like "TYPE}}", try to find matching open tag
              else if (errId === "duplicate_close_tag" && errContext.endsWith("}}")) {
                tagKey = errContext;
              }
            }
            
            if (!tagGroups[tagKey]) {
              tagGroups[tagKey] = [];
            }
            tagGroups[tagKey].push({
              type: errId,
              context: errContext,
              offset: errOffset
            });
          });
          
          // Try to reconstruct full tag names by matching open/close pairs
          const affectedTags = new Set<string>();
          Object.entries(tagGroups).forEach(([key, errors]) => {
            const openTag = errors.find(e => e.type === "duplicate_open_tag");
            const closeTag = errors.find(e => e.type === "duplicate_close_tag");
            
            if (openTag && closeTag) {
              // Try to reconstruct: "{{PROP" + "ERTY_TYPE}}" = "{{PROPERTY_TYPE}}"
              const openPart = openTag.context.replace("{{", "");
              const closePart = closeTag.context.replace("}}", "");
              // Find common patterns
              if (openPart === "PROP" && closePart === "TYPE") {
                affectedTags.add("PROPERTY_TYPE");
              } else if (openPart === "PREP" && closePart === "_FOR") {
                affectedTags.add("PREPARED_FOR");
              } else if (openPart === "ASSE" && closePart === "DATE") {
                affectedTags.add("ASSESSMENT_DATE");
              } else if (openPart === "INSP" && closePart === "ID") {
                affectedTags.add("INSPECTION_ID");
              } else if (openPart === "OVER" && closePart === "ADGE") {
                affectedTags.add("OVERALL_STATUS");
              } else if (openPart === "EXEC" && closePart === "RAPH") {
                affectedTags.add("EXECUTIVE_SUMMARY");
              } else if (openPart === "RISK" && closePart === "ADGE") {
                affectedTags.add("RISK_RATING");
              } else if (openPart === "RISK" && closePart === "TORS") {
                affectedTags.add("RISK_RATING_FACTORS");
              } else if (openPart === "IMME" && closePart === "INGS") {
                affectedTags.add("IMMEDIATE_FINDINGS");
              } else if (openPart === "URGE" && closePart === "INGS") {
                affectedTags.add("URGENT_FINDINGS");
              } else if (openPart === "RECO" && closePart === "INGS") {
                affectedTags.add("RECOMMENDED_FINDINGS");
              } else if (openPart === "PLAN" && closePart === "INGS") {
                affectedTags.add("PLAN_FINDINGS");
              } else if (openPart === "TEST" && closePart === "MARY") {
                affectedTags.add("TEST_SUMMARY");
              } else if (openPart === "TECH" && closePart === "OTES") {
                affectedTags.add("TECHNICAL_NOTES");
              } else {
                affectedTags.add(`${openPart}...${closePart}`);
              }
            }
            
            errors.forEach((err: any) => {
              console.error(`  - ${err.type}: ${err.context} (offset ${err.offset})`);
            });
          });
          
          const tagList = Array.from(affectedTags).join(", ");
          detailedErrorMsg = 
            `Word template has ${duplicateErrors.length} tag(s) split across XML nodes. ` +
            `Affected tags: ${tagList || 'UNKNOWN'}. ` +
            `This happens when Word splits text nodes (e.g., when formatting is applied mid-tag). ` +
            `SOLUTION: In your Word template (report-template.docx), ensure ALL placeholders like {{TAG_NAME}} ` +
            `are typed in a SINGLE continuous text run without any formatting changes in the middle. ` +
            `To fix: Select each placeholder entirely, then apply formatting uniformly, or retype it without formatting. ` +
            `Make sure to save the file after fixing. ` +
            `\n\nError details:\n${errorDetails.join('\n')}`;
        } else {
          // Other docxtemplater errors
          detailedErrorMsg = 
            `Docxtemplater error: ${errorMsg}\n\n` +
            `Found ${errorsArray.length} error(s) in template:\n${errorDetails.join('\n')}`;
        }
      } else {
        // Try to extract any error information from the error object
        console.error("Error structure:", {
          hasErrors: !!e.errors,
          hasProperties: !!e.properties,
          hasPropertiesErrors: !!(e.properties && e.properties.errors),
          errorKeys: Object.keys(e),
          errorMessage: errorMsg,
          errorName: e.name,
          errorStack: e.stack
        });
        
        // Try to stringify the entire error object for debugging
        try {
          const errorStr = JSON.stringify(e, Object.getOwnPropertyNames(e), 2);
          console.error("Full error object:", errorStr);
          detailedErrorMsg = 
            `Docxtemplater error: ${errorMsg}\n\n` +
            `Error type: ${e.name || 'Unknown'}\n` +
            `Please check Netlify function logs for full error details.\n` +
            `Common causes:\n` +
            `- Placeholder tags split across XML nodes (e.g., {{TAG}} has formatting in the middle)\n` +
            `- Invalid placeholder syntax\n` +
            `- Missing closing braces\n\n` +
            `Full error (first 500 chars):\n${errorStr.substring(0, 500)}`;
        } catch (jsonErr) {
          detailedErrorMsg = 
            `Docxtemplater error: ${errorMsg}\n\n` +
            `Could not parse error details. Please check Netlify function logs.\n` +
            `Common causes:\n` +
            `- Placeholder tags split across XML nodes (e.g., {{TAG}} has formatting in the middle)\n` +
            `- Invalid placeholder syntax\n` +
            `- Missing closing braces`;
        }
      }
      
      throw new Error(detailedErrorMsg);
    }
    
    console.log("Setting template data...");
    try {
      doc.setData(testData);
      console.log("✅ Template data set successfully");
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to set template data:", errorMsg);
      throw new Error(`Failed to set template data: ${errorMsg}`);
    }
    
    console.log("Rendering template...");
    try {
      doc.render();
      console.log("✅ Template rendered successfully");
    } catch (e: any) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("❌ Failed to render template:", errorMsg);
      
      // Check for rendering errors (similar to instantiation errors)
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
    
    // Try to extract more details from the error
    let detailedMessage = errorMessage;
    if (e instanceof Error && e.message) {
      detailedMessage = e.message;
    }
    
    // Log full error for debugging
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
        error: "Failed to generate test Word document",
        message: detailedMessage,
        // Include error details if available
        ...(e instanceof Error && e.stack ? { stack: e.stack.substring(0, 500) } : {})
      })
    };
  }
};
