import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { HandlerEvent } from "@netlify/functions";

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

/**
 * Default text structure for Word template placeholders
 * All placeholders must have a default value to prevent undefined in output
 */
export type DefaultText = {
  // Basic information
  INSPECTION_ID: string;
  ASSESSMENT_DATE: string;
  PREPARED_FOR: string;
  PREPARED_BY: string;
  PROPERTY_ADDRESS: string;
  PROPERTY_TYPE: string;
  
  // Findings sections
  IMMEDIATE_FINDINGS: string;
  RECOMMENDED_FINDINGS: string;
  PLAN_FINDINGS: string;
  LIMITATIONS: string;
  URGENT_FINDINGS: string;
  
  // Report metadata
  REPORT_VERSION: string;
  OVERALL_STATUS: string;
  EXECUTIVE_SUMMARY: string;
  RISK_RATING: string;
  RISK_RATING_FACTORS: string;
  
  // Technical sections
  TEST_SUMMARY: string;
  TECHNICAL_NOTES: string;
  
  // Capital Expenditure sections
  CAPEX_DISCLAIMER: string;
  CAPEX_DISCLAIMER_FOOTER: string;
  CAPEX_NO_DATA: string;
  
  // Priority interpretations
  PRIORITY_IMMEDIATE_DESC: string;
  PRIORITY_IMMEDIATE_INTERP: string;
  PRIORITY_RECOMMENDED_DESC: string;
  PRIORITY_RECOMMENDED_INTERP: string;
  PRIORITY_PLAN_DESC: string;
  PRIORITY_PLAN_INTERP: string;
  
  // Terms and Conditions
  terms_and_conditions_markdown: string;
  
  // Additional placeholders (for future use)
  [key: string]: string;
};

// Cache for default text
let defaultTextCache: DefaultText | null = null;

// Cache for terms and conditions
let termsCache: string | null = null;

/**
 * Load DEFAULT_TERMS.md from file system
 * Tries root-level first, then netlify/functions/ fallback path
 * 
 * @returns Terms and conditions markdown content, or fallback default text
 */
function loadTermsAndConditionsMarkdown(): string {
  // Return cached value if available
  if (termsCache !== null) {
    return termsCache;
  }
  
  // Try root-level first, then netlify/functions/ fallback
  const possiblePaths = [
    path.join(process.cwd(), "DEFAULT_TERMS.md"),
    path.join(__dirname, "..", "..", "DEFAULT_TERMS.md"),
    path.join(__dirname, "..", "DEFAULT_TERMS.md"),
    path.join(process.cwd(), "netlify", "functions", "DEFAULT_TERMS.md"),
    "/opt/build/repo/DEFAULT_TERMS.md",
    "/opt/build/repo/netlify/functions/DEFAULT_TERMS.md",
  ];
  
  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        console.log(`✅ Loaded DEFAULT_TERMS.md from: ${filePath}`);
        termsCache = content;
        return termsCache;
      }
    } catch (e) {
      console.warn(`Failed to load DEFAULT_TERMS.md from ${filePath}:`, e);
      continue;
    }
  }
  
  // Fallback to hardcoded default Terms and Conditions
  console.warn("⚠️ DEFAULT_TERMS.md not found, using hardcoded fallback");
  const fallback = `# TERMS & CONDITIONS OF ASSESSMENT

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
  
  termsCache = fallback;
  return termsCache;
}

/**
 * Find the path to DEFAULT_TEXT_LIBRARY.md or DEFAULT_REPORT_TEXT.md
 * Tries multiple possible locations, prioritizing DEFAULT_TEXT_LIBRARY.md
 */
function findDefaultTextPath(): string {
  // First try DEFAULT_TEXT_LIBRARY.md (preferred)
  const libraryPaths = [
    path.join(__dirname, "DEFAULT_TEXT_LIBRARY.md"),
    path.join(__dirname, "..", "DEFAULT_TEXT_LIBRARY.md"),
    path.join(process.cwd(), "DEFAULT_TEXT_LIBRARY.md"),
    path.join(process.cwd(), "netlify", "functions", "DEFAULT_TEXT_LIBRARY.md"),
    "/opt/build/repo/DEFAULT_TEXT_LIBRARY.md",
    "/opt/build/repo/netlify/functions/DEFAULT_TEXT_LIBRARY.md",
  ];
  
  for (const filePath of libraryPaths) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  // Fallback to DEFAULT_REPORT_TEXT.md
  const reportPaths = [
    path.join(__dirname, "DEFAULT_REPORT_TEXT.md"),
    path.join(__dirname, "..", "DEFAULT_REPORT_TEXT.md"),
    path.join(process.cwd(), "DEFAULT_REPORT_TEXT.md"),
    path.join(process.cwd(), "netlify", "functions", "DEFAULT_REPORT_TEXT.md"),
    "/opt/build/repo/DEFAULT_REPORT_TEXT.md",
    "/opt/build/repo/netlify/functions/DEFAULT_REPORT_TEXT.md",
  ];
  
  for (const filePath of reportPaths) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  // Return the first library path as default (will fail gracefully if file doesn't exist)
  return libraryPaths[0];
}

/**
 * Parse Markdown file and extract placeholder values
 * Expected format:
 * 
 * # Default Report Text
 * 
 * ## Word Template Placeholders
 * 
 * ### INSPECTION_ID
 * N/A
 * 
 * ### ASSESSMENT_DATE
 * Date not available
 * 
 * ...
 */
function parseMarkdownFile(content: string): DefaultText {
  const lines = content.split("\n");
  const result: Partial<DefaultText> = {};
  let currentKey: string | null = null;
  let currentValue: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and headers
    if (!line || line.startsWith("#")) {
      continue;
    }
    
    // Check for placeholder header (### PLACEHOLDER_NAME)
    const headerMatch = line.match(/^###\s+([A-Z_][A-Z0-9_]*)$/);
    if (headerMatch) {
      // Save previous key-value pair
      if (currentKey && currentValue.length > 0) {
        result[currentKey] = currentValue.join("\n").trim();
      }
      
      // Start new key-value pair
      currentKey = headerMatch[1];
      currentValue = [];
      continue;
    }
    
    // Collect value lines (skip if no current key)
    if (currentKey) {
      currentValue.push(line);
    }
  }
  
  // Save last key-value pair
  if (currentKey && currentValue.length > 0) {
    result[currentKey] = currentValue.join("\n").trim();
  }
  
  return result as DefaultText;
}

/**
 * Get default text with fallback values
 * Returns a complete DefaultText object with all required keys
 */
function getDefaultTextWithFallbacks(parsed: Partial<DefaultText>): DefaultText {
  return {
    // Basic information
    INSPECTION_ID: parsed.INSPECTION_ID || "N/A",
    ASSESSMENT_DATE: parsed.ASSESSMENT_DATE || "Date not available",
    PREPARED_FOR: parsed.PREPARED_FOR || "Client information not provided",
    PREPARED_BY: parsed.PREPARED_BY || "Better Home Technology Pty Ltd",
    PROPERTY_ADDRESS: parsed.PROPERTY_ADDRESS || "Address not provided",
    PROPERTY_TYPE: parsed.PROPERTY_TYPE || "Property type not specified",
    
    // Findings sections
    IMMEDIATE_FINDINGS: parsed.IMMEDIATE_FINDINGS || "No immediate safety risks were identified at the time of inspection.",
    RECOMMENDED_FINDINGS: parsed.RECOMMENDED_FINDINGS || "No items requiring short-term planned action were identified at the time of inspection.",
    PLAN_FINDINGS: parsed.PLAN_FINDINGS || "No additional items were identified for planning or monitoring at this time.",
    LIMITATIONS: parsed.LIMITATIONS || "This assessment is non-invasive and limited to accessible areas only.",
    URGENT_FINDINGS: parsed.URGENT_FINDINGS || parsed.IMMEDIATE_FINDINGS || "No immediate safety risks were identified at the time of inspection.",
    
    // Report metadata
    REPORT_VERSION: parsed.REPORT_VERSION || "1.0",
    OVERALL_STATUS: parsed.OVERALL_STATUS || "LOW RISK",
    EXECUTIVE_SUMMARY: parsed.EXECUTIVE_SUMMARY || "No significant issues identified during this inspection.",
    RISK_RATING: parsed.RISK_RATING || "LOW",
    RISK_RATING_FACTORS: parsed.RISK_RATING_FACTORS || "No significant risk factors identified",
    
    // Technical sections
    TEST_SUMMARY: parsed.TEST_SUMMARY || "Electrical safety inspection completed in accordance with applicable standards.",
    TECHNICAL_NOTES: parsed.TECHNICAL_NOTES || "This is a non-invasive visual inspection limited to accessible areas.",
    
    // Capital Expenditure sections
    CAPEX_DISCLAIMER: parsed.CAPEX_DISCLAIMER || "**Important:** All figures provided in this section are indicative market benchmarks for financial provisioning purposes only. They are not quotations or scope of works.",
    CAPEX_DISCLAIMER_FOOTER: parsed.CAPEX_DISCLAIMER_FOOTER || "**Disclaimer:** Provided for financial provisioning only. Not a quotation or scope of works.",
    CAPEX_NO_DATA: parsed.CAPEX_NO_DATA || "Capital expenditure estimates will be provided upon request based on detailed quotations from licensed electrical contractors.",
    
    // Priority interpretations
    PRIORITY_IMMEDIATE_DESC: parsed.PRIORITY_IMMEDIATE_DESC || "No immediate safety concerns identified.",
    PRIORITY_IMMEDIATE_INTERP: parsed.PRIORITY_IMMEDIATE_INTERP || "No immediate action required.",
    PRIORITY_RECOMMENDED_DESC: parsed.PRIORITY_RECOMMENDED_DESC || "No recommended actions identified.",
    PRIORITY_RECOMMENDED_INTERP: parsed.PRIORITY_RECOMMENDED_INTERP || "No short-term actions required.",
    PRIORITY_PLAN_DESC: parsed.PRIORITY_PLAN_DESC || "No items identified for planning or monitoring.",
    PRIORITY_PLAN_INTERP: parsed.PRIORITY_PLAN_INTERP || "No ongoing monitoring required.",
    
    // Terms and Conditions (loaded from DEFAULT_TERMS.md)
    terms_and_conditions_markdown: loadTermsAndConditionsMarkdown(),
    
    // Include any additional keys from parsed object
    ...parsed,
  };
}

/**
 * Load default text from DEFAULT_REPORT_TEXT.md
 * Tries blob store first (if event is provided), then falls back to file system
 * 
 * @param event Optional HandlerEvent for accessing blob store
 * @returns DefaultText object with all placeholder default values
 */
export async function loadDefaultText(event?: HandlerEvent): Promise<DefaultText> {
  // Return cached value if available
  if (defaultTextCache) {
    return defaultTextCache;
  }
  
  // Try blob store first (if event is provided)
  if (event) {
    try {
      const { connectLambda, getStore } = await import("@netlify/blobs");
      connectLambda(event);
      const store = getStore({ name: "config", consistency: "eventual" });
      const blobContent = await store.get("DEFAULT_REPORT_TEXT.md", { type: "text" });
      if (blobContent) {
        try {
          const parsed = parseMarkdownFile(blobContent);
          defaultTextCache = getDefaultTextWithFallbacks(parsed);
          console.log("✅ Default text loaded from blob store");
          return defaultTextCache;
        } catch (e) {
          console.warn("Failed to parse default text from blob:", e);
        }
      }
    } catch (e) {
      console.warn("Failed to access blob store for default text:", e);
    }
  }
  
  // Fallback to file system
  const filePath = findDefaultTextPath();
  let parsed: Partial<DefaultText> = {};
  
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      parsed = parseMarkdownFile(content);
      console.log("✅ Default text loaded from:", filePath);
    } catch (e) {
      console.error("❌ Failed to load default text file:", e);
      console.warn("⚠️ Using fallback default values");
    }
  } else {
    console.warn(`⚠️ DEFAULT_REPORT_TEXT.md not found at ${filePath}, using fallback default values`);
  }
  
  // Apply fallbacks and cache
  defaultTextCache = getDefaultTextWithFallbacks(parsed);
  return defaultTextCache;
}

/**
 * Clear the default text cache (useful for testing or reloading)
 */
export function clearDefaultTextCache(): void {
  defaultTextCache = null;
  termsCache = null;
}

/**
 * Load Terms and Conditions markdown directly
 * Exported for direct use if needed
 */
export function loadTermsAndConditions(): string {
  return loadTermsAndConditionsMarkdown();
}
