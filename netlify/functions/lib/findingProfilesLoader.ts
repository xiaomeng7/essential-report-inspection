/**
 * Load Finding Profiles from YAML
 * 
 * Loads profiles/finding_profiles.yml which contains default_risk, default_budget,
 * compliance, and category for each finding ID.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

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
 * Finding profile structure (v2.0+)
 */
export type FindingProfile = {
  category: string;
  default_priority: "IMMEDIATE" | "RECOMMENDED_0_3_MONTHS" | "PLAN_MONITOR";
  risk: {
    safety: "HIGH" | "MODERATE" | "LOW";
    compliance: "HIGH" | "MEDIUM" | "LOW";
    escalation: "HIGH" | "MODERATE" | "LOW";
  };
  budget: "low" | "high" | "horizon";
  messaging: {
    title: string;
    why_it_matters: string;
    if_not_addressed: string;
    planning_guidance: string;
  };
  disclaimer_line: string;
  // New fields (v2.0+)
  asset_component: string;
  evidence_requirements: string[];
  risk_severity: number; // 1-5
  likelihood: number; // 1-5
  priority: "IMMEDIATE" | "RECOMMENDED" | "PLAN";
  budget_band: "LOW" | "MED" | "HIGH";
  budget_range: string; // e.g., "AUD $350–$450"
  timeline: string; // e.g., "0–3 months" / "6–18 months" / "Next renovation"
};

/**
 * Category defaults structure
 */
export type CategoryDefaults = {
  risk_severity: number;
  likelihood: number;
  priority: "IMMEDIATE" | "RECOMMENDED" | "PLAN";
  budget_band: "LOW" | "MED" | "HIGH";
  timeline: string;
  evidence_requirements: string[];
};

/**
 * Category defaults map
 */
export type CategoryDefaultsMap = Record<string, CategoryDefaults>;

/**
 * Finding profiles map
 */
export type FindingProfiles = Record<string, FindingProfile>;

// Cache for finding profiles
let profilesCache: FindingProfiles | null = null;

// Cache for category defaults
let categoryDefaultsCache: CategoryDefaultsMap | null = null;

/**
 * Load category defaults from YAML file
 */
export function loadCategoryDefaults(): CategoryDefaultsMap {
  if (categoryDefaultsCache) {
    return categoryDefaultsCache;
  }
  
  const possiblePaths = [
    path.join(__dirname, "..", "..", "..", "profiles", "finding_profiles.yml"),
    path.join(__dirname, "..", "..", "profiles", "finding_profiles.yml"),
    path.join(process.cwd(), "profiles", "finding_profiles.yml"),
    path.join(process.cwd(), "netlify", "functions", "profiles", "finding_profiles.yml"),
    "/opt/build/repo/profiles/finding_profiles.yml",
    "/opt/build/repo/netlify/functions/profiles/finding_profiles.yml",
  ];
  
  for (const profilePath of possiblePaths) {
    try {
      if (fs.existsSync(profilePath)) {
        const content = fs.readFileSync(profilePath, "utf8");
        const data = yaml.load(content) as { category_defaults?: CategoryDefaultsMap };
        if (data.category_defaults) {
          categoryDefaultsCache = data.category_defaults;
          return categoryDefaultsCache;
        }
      }
    } catch (e) {
      console.warn(`Failed to load category defaults from ${profilePath}:`, e);
      continue;
    }
  }
  
  // Return empty defaults if not found
  categoryDefaultsCache = {};
  return categoryDefaultsCache;
}

/**
 * Load finding profiles from YAML file
 */
export function loadFindingProfiles(): FindingProfiles {
  if (profilesCache) {
    return profilesCache;
  }
  
  const possiblePaths = [
    path.join(__dirname, "..", "..", "..", "profiles", "finding_profiles.yml"),
    path.join(__dirname, "..", "..", "profiles", "finding_profiles.yml"),
    path.join(process.cwd(), "profiles", "finding_profiles.yml"),
    path.join(process.cwd(), "netlify", "functions", "profiles", "finding_profiles.yml"),
    "/opt/build/repo/profiles/finding_profiles.yml",
    "/opt/build/repo/netlify/functions/profiles/finding_profiles.yml",
  ];
  
  for (const profilePath of possiblePaths) {
    try {
      if (fs.existsSync(profilePath)) {
        const content = fs.readFileSync(profilePath, "utf8");
        const data = yaml.load(content) as { finding_profiles?: Record<string, any> };
        if (data.finding_profiles) {
          console.log(`✅ Loaded finding profiles from: ${profilePath}`);
          
          // Normalize profiles with category defaults
          const categoryDefaults = loadCategoryDefaults();
          const normalizedProfiles: FindingProfiles = {};
          
          for (const [findingId, rawProfile] of Object.entries(data.finding_profiles)) {
            normalizedProfiles[findingId] = normalizeProfile(rawProfile, categoryDefaults, findingId);
          }
          
          profilesCache = normalizedProfiles;
          return profilesCache;
        }
      }
    } catch (e) {
      console.warn(`Failed to load finding profiles from ${profilePath}:`, e);
      continue;
    }
  }
  
  console.warn("⚠️ Could not load finding_profiles.yml, using empty profiles");
  profilesCache = {};
  return profilesCache;
}

/**
 * Normalize a profile by merging category defaults
 */
function normalizeProfile(
  rawProfile: any,
  categoryDefaults: CategoryDefaultsMap,
  findingId: string
): FindingProfile {
  const category = rawProfile.category || "OTHER";
  const categoryDefault = categoryDefaults[category] || categoryDefaults["OTHER"] || getDefaultCategoryDefaults();
  
  // Map priority from old format to new format
  const mapPriority = (oldPriority: string): "IMMEDIATE" | "RECOMMENDED" | "PLAN" => {
    if (oldPriority === "IMMEDIATE") return "IMMEDIATE";
    if (oldPriority === "RECOMMENDED_0_3_MONTHS" || oldPriority === "RECOMMENDED") return "RECOMMENDED";
    return "PLAN";
  };
  
  // Get asset_component from messaging.title or generate from findingId
  const assetComponent = rawProfile.asset_component || 
                         rawProfile.messaging?.title || 
                         findingId.replace(/_/g, " ");
  
  // Get priority from profile or category default
  const priority = rawProfile.priority 
    ? mapPriority(rawProfile.priority)
    : (rawProfile.default_priority 
        ? mapPriority(rawProfile.default_priority)
        : categoryDefault.priority);
  
  // Get budget_range from profile or generate from budget_band
  const budgetRange = rawProfile.budget_range || 
                      generateBudgetRangeFromBand(rawProfile.budget_band || categoryDefault.budget_band);
  
  return {
    category: category,
    default_priority: rawProfile.default_priority || "PLAN_MONITOR",
    risk: rawProfile.risk || {
      safety: "LOW",
      compliance: "LOW",
      escalation: "LOW",
    },
    budget: rawProfile.budget || "horizon",
    messaging: rawProfile.messaging || {
      title: assetComponent,
      why_it_matters: "This condition may affect electrical safety, reliability, or compliance depending on severity and location.",
      if_not_addressed: "If this condition is not addressed, it may impact long-term reliability or compliance confidence.",
      planning_guidance: "This can be factored into future capital planning cycles without immediate urgency.",
    },
    disclaimer_line: rawProfile.disclaimer_line || "",
    // New fields with category defaults
    asset_component: assetComponent,
    evidence_requirements: rawProfile.evidence_requirements || categoryDefault.evidence_requirements || ["Visual inspection"],
    risk_severity: rawProfile.risk_severity !== undefined ? rawProfile.risk_severity : categoryDefault.risk_severity,
    likelihood: rawProfile.likelihood !== undefined ? rawProfile.likelihood : categoryDefault.likelihood,
    priority: priority,
    budget_band: rawProfile.budget_band || categoryDefault.budget_band,
    budget_range: budgetRange,
    timeline: rawProfile.timeline || categoryDefault.timeline,
  };
}

/**
 * Generate budget range from budget band
 */
export function generateBudgetRangeFromBand(band: "LOW" | "MED" | "HIGH"): string {
  switch (band) {
    case "LOW":
      return "AUD $100–$500";
    case "MED":
      return "AUD $500–$2,000";
    case "HIGH":
      return "AUD $2,000–$10,000";
    default:
      return "AUD $100–$1,000";
  }
}

/**
 * Get default category defaults
 */
function getDefaultCategoryDefaults(): CategoryDefaults {
  return {
    risk_severity: 2,
    likelihood: 2,
    priority: "PLAN",
    budget_band: "LOW",
    timeline: "6–18 months",
    evidence_requirements: ["Visual inspection"],
  };
}

/**
 * Get profile for a finding ID, with fallback to default
 */
export function getFindingProfile(findingId: string): FindingProfile {
  const profiles = loadFindingProfiles();
  const profile = profiles[findingId];
  
  if (profile) {
    return profile;
  }
  
  // Fallback to UNKNOWN_FINDING_FALLBACK if available
  const fallback = profiles["UNKNOWN_FINDING_FALLBACK"];
  if (fallback) {
    console.warn(`⚠️ No profile found for ${findingId}, using fallback`);
    return fallback;
  }
  
  // Ultimate fallback
  const categoryDefaults = loadCategoryDefaults();
  const defaultDefaults = categoryDefaults["OTHER"] || getDefaultCategoryDefaults();
  
  return {
    category: "OTHER",
    default_priority: "PLAN_MONITOR",
    risk: {
      safety: "LOW",
      compliance: "LOW",
      escalation: "LOW",
    },
    budget: "horizon",
    messaging: {
      title: findingId.replace(/_/g, " "),
      why_it_matters: "This condition may affect electrical safety, reliability, or compliance depending on severity and location.",
      if_not_addressed: "If this condition is not addressed, it may impact long-term reliability or compliance confidence.",
      planning_guidance: "This can be factored into future capital planning cycles without immediate urgency.",
    },
    disclaimer_line: "",
    asset_component: findingId.replace(/_/g, " "),
    evidence_requirements: defaultDefaults.evidence_requirements,
    risk_severity: defaultDefaults.risk_severity,
    likelihood: defaultDefaults.likelihood,
    priority: defaultDefaults.priority,
    budget_band: defaultDefaults.budget_band,
    budget_range: generateBudgetRangeFromBand(defaultDefaults.budget_band),
    timeline: defaultDefaults.timeline,
  };
}
