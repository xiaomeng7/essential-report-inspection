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
 * Executive summary templates for different risk ratings
 */
export type ExecutiveSummaryTemplates = {
  LOW: string;
  MODERATE: string;
  HIGH: string;
};

// Cache for executive summary templates
let templatesCache: ExecutiveSummaryTemplates | null = null;

/**
 * Find the path to EXECUTIVE_SUMMARY_TEMPLATES.md
 */
function findTemplatesPath(): string {
  const possiblePaths = [
    path.join(__dirname, "EXECUTIVE_SUMMARY_TEMPLATES.md"),
    path.join(__dirname, "..", "EXECUTIVE_SUMMARY_TEMPLATES.md"),
    path.join(process.cwd(), "EXECUTIVE_SUMMARY_TEMPLATES.md"),
    path.join(process.cwd(), "netlify", "functions", "EXECUTIVE_SUMMARY_TEMPLATES.md"),
    "/opt/build/repo/EXECUTIVE_SUMMARY_TEMPLATES.md",
    "/opt/build/repo/netlify/functions/EXECUTIVE_SUMMARY_TEMPLATES.md",
  ];
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  return possiblePaths[0];
}

/**
 * Parse Markdown file and extract executive summary templates
 * Expected format:
 * 
 * # Executive Summary Templates
 * 
 * ## LOW RISK
 * [content]
 * 
 * ## MODERATE RISK
 * [content]
 * 
 * ## HIGH RISK
 * [content]
 */
function parseTemplatesFile(content: string): ExecutiveSummaryTemplates {
  const lines = content.split("\n");
  const result: Partial<ExecutiveSummaryTemplates> = {};
  let currentKey: "LOW" | "MODERATE" | "HIGH" | null = null;
  let currentValue: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and main header
    if (!line || line === "# Executive Summary Templates") {
      continue;
    }
    
    // Check for risk rating header (## LOW RISK, ## MODERATE RISK, ## HIGH RISK)
    const headerMatch = line.match(/^##\s+(LOW|MODERATE|HIGH)\s+RISK$/i);
    if (headerMatch) {
      // Save previous key-value pair
      if (currentKey && currentValue.length > 0) {
        result[currentKey] = currentValue.join("\n").trim();
      }
      
      // Start new key-value pair
      const key = headerMatch[1].toUpperCase() as "LOW" | "MODERATE" | "HIGH";
      currentKey = key;
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
  
  return result as ExecutiveSummaryTemplates;
}

/**
 * Get default templates with fallback values
 */
function getDefaultTemplates(parsed: Partial<ExecutiveSummaryTemplates>): ExecutiveSummaryTemplates {
  return {
    LOW: parsed.LOW || "This property presents a low electrical risk profile at the time of inspection. No immediate safety hazards or compliance-critical issues were identified.",
    MODERATE: parsed.MODERATE || "This property presents a moderate electrical risk profile based on the findings identified during the assessment. While no immediate safety hazards were identified, several items were noted that require attention in the short to medium term.",
    HIGH: parsed.HIGH || "This property presents a high electrical risk profile at the time of inspection. One or more issues were identified that may pose safety, compliance, or operational risks if left unaddressed. Immediate attention is recommended.",
  };
}

/**
 * Load executive summary templates from EXECUTIVE_SUMMARY_TEMPLATES.md
 * Tries blob store first (if event is provided), then falls back to file system
 * 
 * @param event Optional HandlerEvent for accessing blob store
 * @returns ExecutiveSummaryTemplates object with templates for LOW, MODERATE, and HIGH risk
 */
export async function loadExecutiveSummaryTemplates(event?: HandlerEvent): Promise<ExecutiveSummaryTemplates> {
  // Return cached value if available
  if (templatesCache) {
    return templatesCache;
  }
  
  // Try blob store first (if event is provided)
  if (event) {
    try {
      const { connectLambda, getStore } = await import("@netlify/blobs");
      connectLambda(event);
      const store = getStore({ name: "config", consistency: "eventual" });
      const blobContent = await store.get("EXECUTIVE_SUMMARY_TEMPLATES.md", { type: "text" });
      if (blobContent) {
        try {
          const parsed = parseTemplatesFile(blobContent);
          templatesCache = getDefaultTemplates(parsed);
          console.log("✅ Executive summary templates loaded from blob store");
          return templatesCache;
        } catch (e) {
          console.warn("Failed to parse executive summary templates from blob:", e);
        }
      }
    } catch (e) {
      console.warn("Failed to access blob store for executive summary templates:", e);
    }
  }
  
  // Fallback to file system
  const filePath = findTemplatesPath();
  let parsed: Partial<ExecutiveSummaryTemplates> = {};
  
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      parsed = parseTemplatesFile(content);
      console.log("✅ Executive summary templates loaded from:", filePath);
    } catch (e) {
      console.error("❌ Failed to load executive summary templates file:", e);
      console.warn("⚠️ Using fallback default templates");
    }
  } else {
    console.warn(`⚠️ EXECUTIVE_SUMMARY_TEMPLATES.md not found at ${filePath}, using fallback default templates`);
  }
  
  // Apply fallbacks and cache
  templatesCache = getDefaultTemplates(parsed);
  return templatesCache;
}

/**
 * Clear the templates cache (useful for testing or reloading)
 */
export function clearTemplatesCache(): void {
  templatesCache = null;
}
