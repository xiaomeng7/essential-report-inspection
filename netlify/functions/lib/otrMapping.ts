/**
 * OTR/AS3000 Mapping and Tagging
 * 
 * Internal mapping layer that tags findings and test data with OTR categories
 * and AS/NZS 3000 references. This is used ONLY for report generation.
 * Technicians do NOT see OTR wording.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import type { StoredFinding } from "./store";

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

type OTRMapping = {
  version: string;
  description: string;
  otr_categories: Record<string, {
    description: string;
    sections: string[];
    fields: string[];
    as3000_references: string[];
  }>;
  otr_tests: Record<string, {
    description: string;
    test_fields: string[];
    as3000_reference: string;
    otr_category: string;
  }>;
  finding_to_otr_category: Record<string, string>;
  finding_to_as3000: Record<string, string>;
};

let mappingCache: OTRMapping | null = null;

/**
 * Load OTR/AS3000 mapping from YAML file
 */
function loadOTRMapping(): OTRMapping {
  if (mappingCache) {
    return mappingCache;
  }

  const possiblePaths = [
    path.join(__dirname, "..", "..", "..", "mappings", "otr_as3000_mapping.yml"),
    path.join(__dirname, "..", "..", "mappings", "otr_as3000_mapping.yml"),
    path.join(process.cwd(), "mappings", "otr_as3000_mapping.yml"),
    path.join(process.cwd(), "netlify", "functions", "mappings", "otr_as3000_mapping.yml"),
    "/opt/build/repo/mappings/otr_as3000_mapping.yml",
    "/opt/build/repo/netlify/functions/mappings/otr_as3000_mapping.yml",
  ];

  for (const mappingPath of possiblePaths) {
    try {
      if (fs.existsSync(mappingPath)) {
        const content = fs.readFileSync(mappingPath, "utf8");
        const data = yaml.load(content) as OTRMapping;
        console.log(`✅ Loaded OTR/AS3000 mapping from: ${mappingPath}`);
        mappingCache = data;
        return mappingCache;
      }
    } catch (e) {
      console.warn(`Failed to load OTR mapping from ${mappingPath}:`, e);
      continue;
    }
  }

  console.warn("⚠️ Could not load otr_as3000_mapping.yml, using empty mapping");
  mappingCache = {
    version: "1.0",
    description: "Empty mapping",
    otr_categories: {},
    otr_tests: {},
    finding_to_otr_category: {},
    finding_to_as3000: {},
  };
  return mappingCache;
}

/**
 * Extended finding type with OTR metadata (backward compatible)
 */
export type FindingWithOTR = StoredFinding & {
  observed?: string;
  facts?: string;
  otr_category?: string;
  as3000_reference?: string;
};

/**
 * Tag findings with OTR category and AS3000 reference
 * 
 * @param findings Array of findings to tag
 * @returns Array of findings with OTR metadata added
 */
export function tagFindingsWithOTR(findings: StoredFinding[]): FindingWithOTR[] {
  const mapping = loadOTRMapping();
  
  return findings.map(finding => {
    const otr_category = mapping.finding_to_otr_category[finding.id];
    const as3000_reference = mapping.finding_to_as3000[finding.id];
    
    return {
      ...finding,
      ...(otr_category && { otr_category }),
      ...(as3000_reference && { as3000_reference }),
    };
  });
}

/**
 * Get OTR category for a finding ID
 */
export function getOTRCategoryForFinding(findingId: string): string | undefined {
  const mapping = loadOTRMapping();
  return mapping.finding_to_otr_category[findingId];
}

/**
 * Get AS3000 reference for a finding ID
 */
export function getAS3000ReferenceForFinding(findingId: string): string | undefined {
  const mapping = loadOTRMapping();
  return mapping.finding_to_as3000[findingId];
}

/**
 * Get OTR test category for a test field path
 */
export function getOTRTestCategory(testFieldPath: string): string | undefined {
  const mapping = loadOTRMapping();
  
  for (const [testName, testInfo] of Object.entries(mapping.otr_tests)) {
    if (testInfo.test_fields.some(field => {
      // Support exact match or prefix match (for array fields)
      return testFieldPath === field || testFieldPath.startsWith(field.replace("[]", ""));
    })) {
      return testInfo.otr_category;
    }
  }
  
  return undefined;
}

/**
 * Get AS3000 reference for a test field path
 */
export function getAS3000ReferenceForTest(testFieldPath: string): string | undefined {
  const mapping = loadOTRMapping();
  
  for (const [testName, testInfo] of Object.entries(mapping.otr_tests)) {
    if (testInfo.test_fields.some(field => {
      return testFieldPath === field || testFieldPath.startsWith(field.replace("[]", ""));
    })) {
      return testInfo.as3000_reference;
    }
  }
  
  return undefined;
}

/**
 * Get all OTR categories covered by the inspection
 */
export function getCoveredOTRCategories(findings: FindingWithOTR[]): string[] {
  const categories = new Set<string>();
  
  for (const finding of findings) {
    if (finding.otr_category) {
      categories.add(finding.otr_category);
    }
  }
  
  return Array.from(categories).sort();
}

/**
 * Check if inspection covers OTR mandatory test concepts
 */
export function getCoveredOTRTests(testData: Record<string, unknown>): string[] {
  const mapping = loadOTRMapping();
  const coveredTests: string[] = [];
  
  // Check each test type
  for (const [testName, testInfo] of Object.entries(mapping.otr_tests)) {
    const hasTest = testInfo.test_fields.some(field => {
      const fieldPath = field.replace("[]", "");
      const parts = fieldPath.split(".");
      let current: unknown = testData;
      
      for (const part of parts) {
        if (current == null || typeof current !== "object") return false;
        current = (current as Record<string, unknown>)[part];
      }
      
      return current !== null && current !== undefined;
    });
    
    if (hasTest) {
      coveredTests.push(testName);
    }
  }
  
  return coveredTests;
}
