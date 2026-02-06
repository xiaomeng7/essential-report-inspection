#!/usr/bin/env tsx
/**
 * Fill missing 9-dimension values for all ~149 finding IDs
 * 
 * 9 Dimensions:
 * 1. safety: HIGH | MODERATE | LOW
 * 2. urgency: IMMEDIATE | SHORT_TERM | LONG_TERM
 * 3. liability: HIGH | MEDIUM | LOW
 * 4. budget_low: number (AUD)
 * 5. budget_high: number (AUD)
 * 6. priority: IMMEDIATE | RECOMMENDED_0_3_MONTHS | PLAN_MONITOR
 * 7. severity: 1-5
 * 8. likelihood: 1-5
 * 9. escalation: HIGH | MODERATE | LOW
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const rulesPath = path.join(__dirname, "..", "rules.yml");
const profilesPath = path.join(__dirname, "..", "profiles", "finding_profiles.yml");
const responsesPath = path.join(__dirname, "..", "netlify", "functions", "responses.yml");

type FindingCategory =
  | "LIFE_SAFETY_FIRE"
  | "SHOCK_EXPOSURE"
  | "SWITCHBOARD_PROTECTION"
  | "EARTHING_BONDING"
  | "MECHANICAL_DAMAGE"
  | "MOISTURE_WATER_PROXIMITY"
  | "NON_STANDARD_WORK"
  | "ROOF_SPACE_CABLES_LIGHTING"
  | "DOCUMENTATION_META"
  | "HAZMAT_SPECIALIST";

// Default 9D vectors per category
const CATEGORY_DEFAULTS: Record<FindingCategory, {
  safety: "HIGH" | "MODERATE" | "LOW";
  urgency: "IMMEDIATE" | "SHORT_TERM" | "LONG_TERM";
  liability: "HIGH" | "MEDIUM" | "LOW";
  priority: "IMMEDIATE" | "RECOMMENDED_0_3_MONTHS" | "PLAN_MONITOR";
  severity: 1 | 2 | 3 | 4 | 5;
  likelihood: 1 | 2 | 3 | 4 | 5;
  escalation: "HIGH" | "MODERATE" | "LOW";
}> = {
  LIFE_SAFETY_FIRE: {
    safety: "HIGH",
    urgency: "IMMEDIATE",
    liability: "HIGH",
    priority: "IMMEDIATE",
    severity: 4,
    likelihood: 4,
    escalation: "HIGH",
  },
  SHOCK_EXPOSURE: {
    safety: "HIGH",
    urgency: "IMMEDIATE",
    liability: "HIGH",
    priority: "IMMEDIATE",
    severity: 5,
    likelihood: 4,
    escalation: "HIGH",
  },
  SWITCHBOARD_PROTECTION: {
    safety: "MODERATE",
    urgency: "SHORT_TERM",
    liability: "HIGH",
    priority: "RECOMMENDED_0_3_MONTHS",
    severity: 3,
    likelihood: 3,
    escalation: "MODERATE",
  },
  EARTHING_BONDING: {
    safety: "MODERATE",
    urgency: "SHORT_TERM",
    liability: "MEDIUM",
    priority: "RECOMMENDED_0_3_MONTHS",
    severity: 3,
    likelihood: 2,
    escalation: "MODERATE",
  },
  MECHANICAL_DAMAGE: {
    safety: "MODERATE",
    urgency: "SHORT_TERM",
    liability: "MEDIUM",
    priority: "RECOMMENDED_0_3_MONTHS",
    severity: 2,
    likelihood: 3,
    escalation: "MODERATE",
  },
  MOISTURE_WATER_PROXIMITY: {
    safety: "MODERATE",
    urgency: "SHORT_TERM",
    liability: "MEDIUM",
    priority: "RECOMMENDED_0_3_MONTHS",
    severity: 2,
    likelihood: 2,
    escalation: "MODERATE",
  },
  NON_STANDARD_WORK: {
    safety: "MODERATE",
    urgency: "SHORT_TERM",
    liability: "HIGH",
    priority: "RECOMMENDED_0_3_MONTHS",
    severity: 3,
    likelihood: 3,
    escalation: "MODERATE",
  },
  ROOF_SPACE_CABLES_LIGHTING: {
    safety: "LOW",
    urgency: "LONG_TERM",
    liability: "LOW",
    priority: "PLAN_MONITOR",
    severity: 2,
    likelihood: 2,
    escalation: "LOW",
  },
  DOCUMENTATION_META: {
    safety: "LOW",
    urgency: "LONG_TERM",
    liability: "LOW",
    priority: "PLAN_MONITOR",
    severity: 1,
    likelihood: 1,
    escalation: "LOW",
  },
  HAZMAT_SPECIALIST: {
    safety: "HIGH",
    urgency: "IMMEDIATE",
    liability: "HIGH",
    priority: "IMMEDIATE",
    severity: 4,
    likelihood: 2,
    escalation: "MODERATE",
  },
};

/**
 * Classify a finding into a category based on ID, title, and context
 */
function classifyFinding(
  findingId: string,
  title: string,
  whyItMatters: string,
  recommendedAction?: string
): FindingCategory {
  const idUpper = findingId.toUpperCase();
  const titleLower = title.toLowerCase();
  const whyLower = whyItMatters.toLowerCase();
  const actionLower = recommendedAction?.toLowerCase() || "";

  // HAZMAT_SPECIALIST
  if (
    idUpper.includes("ASBESTOS") ||
    titleLower.includes("asbestos") ||
    whyLower.includes("asbestos") ||
    actionLower.includes("specialist") ||
    actionLower.includes("further assessment")
  ) {
    return "HAZMAT_SPECIALIST";
  }

  // DOCUMENTATION_META
  if (
    idUpper.startsWith("ALL_") ||
    idUpper.includes("_PRESENT") ||
    idUpper.includes("_RECORDED") ||
    idUpper.includes("LOCATION_PHOTOGRAPHED") ||
    idUpper.includes("NO_ADVICE_") ||
    idUpper.includes("CHECKLIST_ITEMS_COMPLETED") ||
    idUpper.includes("REQUIRED_PHOTOS_UPLOADED") ||
    titleLower.includes("all checklist") ||
    titleLower.includes("all required photos") ||
    titleLower.includes("present") ||
    actionLower.includes("documentation") ||
    actionLower.includes("recorded for")
  ) {
    return "DOCUMENTATION_META";
  }

  // LIFE_SAFETY_FIRE
  if (
    idUpper.includes("ALARM") ||
    idUpper.includes("SMOKE") ||
    idUpper.includes("FIRE") ||
    idUpper.includes("OVERHEAT") ||
    idUpper.includes("BURN") ||
    idUpper.includes("THERMAL") ||
    idUpper.includes("BATTERY_THERMAL") ||
    titleLower.includes("alarm") ||
    titleLower.includes("smoke") ||
    titleLower.includes("fire") ||
    titleLower.includes("overheat") ||
    titleLower.includes("burn") ||
    titleLower.includes("thermal") ||
    whyLower.includes("fire") ||
    whyLower.includes("overheating") ||
    whyLower.includes("burn") ||
    actionLower.includes("immediate rectification")
  ) {
    return "LIFE_SAFETY_FIRE";
  }

  // SHOCK_EXPOSURE
  if (
    idUpper.includes("EXPOSED") ||
    idUpper.includes("BARE") ||
    idUpper.includes("SHOCK") ||
    idUpper.includes("EARTH_FAULT") ||
    idUpper.includes("NO_RCD") ||
    idUpper.includes("ARCING") ||
    idUpper.includes("MATERIAL_DEGRADATION") ||
    titleLower.includes("exposed") ||
    titleLower.includes("bare") ||
    titleLower.includes("shock") ||
    titleLower.includes("earth fault") ||
    titleLower.includes("arcing") ||
    whyLower.includes("shock") ||
    whyLower.includes("exposed conductor") ||
    whyLower.includes("bare") ||
    whyLower.includes("electric shock")
  ) {
    return "SHOCK_EXPOSURE";
  }

  // SWITCHBOARD_PROTECTION
  if (
    idUpper.includes("SWITCHBOARD") ||
    idUpper.includes("BOARD") ||
    idUpper.includes("RCD") ||
    idUpper.includes("RCBO") ||
    idUpper.includes("MAIN_SWITCH") ||
    idUpper.includes("SUPPLY") ||
    idUpper.includes("PROTECTION") ||
    idUpper.includes("CIRCUIT_BREAKER") ||
    idUpper.includes("FUSE") ||
    titleLower.includes("switchboard") ||
    titleLower.includes("rcd") ||
    titleLower.includes("rcbo") ||
    titleLower.includes("main switch") ||
    whyLower.includes("switchboard") ||
    whyLower.includes("rcd") ||
    whyLower.includes("protection")
  ) {
    return "SWITCHBOARD_PROTECTION";
  }

  // EARTHING_BONDING
  if (
    idUpper.includes("EARTH") ||
    idUpper.includes("MEN") ||
    idUpper.includes("BONDING") ||
    idUpper.includes("GROUND") ||
    titleLower.includes("earth") ||
    titleLower.includes("men") ||
    titleLower.includes("bonding") ||
    whyLower.includes("earthing") ||
    whyLower.includes("bonding")
  ) {
    return "EARTHING_BONDING";
  }

  // MECHANICAL_DAMAGE
  if (
    idUpper.includes("MECHANICAL") ||
    idUpper.includes("LOOSE") ||
    idUpper.includes("CRACKED") ||
    idUpper.includes("BROKEN") ||
    idUpper.includes("DAMAGE") ||
    idUpper.includes("DEGRADED") ||
    titleLower.includes("loose") ||
    titleLower.includes("cracked") ||
    titleLower.includes("broken") ||
    titleLower.includes("damage") ||
    whyLower.includes("mechanical") ||
    whyLower.includes("loose") ||
    whyLower.includes("cracked")
  ) {
    return "MECHANICAL_DAMAGE";
  }

  // MOISTURE_WATER_PROXIMITY
  if (
    idUpper.includes("MOISTURE") ||
    idUpper.includes("WATER") ||
    idUpper.includes("STAINING") ||
    idUpper.includes("DAMP") ||
    titleLower.includes("moisture") ||
    titleLower.includes("water") ||
    titleLower.includes("staining") ||
    whyLower.includes("moisture") ||
    whyLower.includes("water") ||
    whyLower.includes("proximity to water")
  ) {
    return "MOISTURE_WATER_PROXIMITY";
  }

  // NON_STANDARD_WORK
  if (
    idUpper.includes("NON_STANDARD") ||
    idUpper.includes("TAPED") ||
    idUpper.includes("DIY") ||
    idUpper.includes("NON_MODERN") ||
    titleLower.includes("non-standard") ||
    titleLower.includes("taped") ||
    titleLower.includes("diy") ||
    whyLower.includes("non-standard") ||
    whyLower.includes("taped connection")
  ) {
    return "NON_STANDARD_WORK";
  }

  // ROOF_SPACE_CABLES_LIGHTING
  if (
    idUpper.includes("ROOF") ||
    idUpper.includes("CEILING") ||
    idUpper.includes("ATTIC") ||
    idUpper.includes("VOID") ||
    idUpper.includes("INSULATION_CONTACT") ||
    idUpper.includes("TRANSFORMER") ||
    idUpper.includes("LIGHTING") ||
    idUpper.includes("CABLE") ||
    titleLower.includes("roof") ||
    titleLower.includes("ceiling") ||
    titleLower.includes("insulation contact") ||
    titleLower.includes("transformer") ||
    whyLower.includes("roof") ||
    whyLower.includes("insulation contact")
  ) {
    return "ROOF_SPACE_CABLES_LIGHTING";
  }

  // Default fallback
  return "DOCUMENTATION_META";
}

console.log("📖 Loading source files...");
const rulesData = yaml.load(fs.readFileSync(rulesPath, "utf8")) as any;
const profilesData = yaml.load(fs.readFileSync(profilesPath, "utf8")) as any;
const responsesData = yaml.load(fs.readFileSync(responsesPath, "utf8")) as any;

// Collect all finding IDs
const allIds = new Set<string>();
if (rulesData.findings) Object.keys(rulesData.findings).forEach((k) => allIds.add(k));
if (rulesData.hard_overrides) {
  Object.keys(rulesData.hard_overrides).forEach((k) => {
    if (k !== "priority_bucket" && k !== "findings" && rulesData.hard_overrides![k]) allIds.add(k);
  });
}
if (profilesData.finding_profiles) Object.keys(profilesData.finding_profiles).forEach((k) => allIds.add(k));
if (responsesData.findings) Object.keys(responsesData.findings).forEach((k) => allIds.add(k));

console.log(`📊 Found ${allIds.size} unique finding IDs`);

// Helper to get rules entry
const getRulesEntry = (id: string) => {
  const ho = rulesData.hard_overrides?.[id] as { safety?: string; urgency?: string; liability?: string } | undefined;
  if (ho && typeof ho === "object") return ho;
  return rulesData.findings?.[id];
};

const updated: string[] = [];
const ambiguous: Array<{ id: string; category: FindingCategory; reason: string }> = [];

// Process each finding
for (const findingId of Array.from(allIds).sort()) {
  const pf = profilesData.finding_profiles?.[findingId];
  const resp = responsesData.findings?.[findingId];
  const rulesEntry = getRulesEntry(findingId);

  const title = pf?.messaging?.title || resp?.title || findingId.replace(/_/g, " ");
  const whyItMatters = pf?.messaging?.why_it_matters || resp?.why_it_matters || "";
  const recommendedAction = resp?.recommended_action || "";
  const actionLower = recommendedAction.toLowerCase();

  // Classify
  const category = classifyFinding(findingId, title, whyItMatters, recommendedAction);
  const defaults = CATEGORY_DEFAULTS[category];

  // Check what needs to be filled
  let needsUpdate = false;
  const updates: Record<string, unknown> = {};

  // Ensure finding_profiles entry exists
  if (!profilesData.finding_profiles) {
    profilesData.finding_profiles = {};
  }
  if (!profilesData.finding_profiles[findingId]) {
    profilesData.finding_profiles[findingId] = {
      category: "OTHER",
      default_priority: defaults.priority,
      risk: {
        safety: defaults.safety,
        compliance: "LOW",
        escalation: defaults.escalation,
      },
      budget: "horizon",
      messaging: {
        title,
        why_it_matters: whyItMatters || "This condition may affect electrical safety, reliability, or maintainability depending on severity and location.",
      },
      disclaimer_line: "",
    };
    needsUpdate = true;
    updates["created"] = true;
  }

  const profile = profilesData.finding_profiles[findingId];

  // Fill missing fields
  // 1. safety (from rules or default)
  const safety = rulesEntry?.safety || profile.risk?.safety || defaults.safety;
  if (!profile.risk) profile.risk = {};
  if (!profile.risk.safety || profile.risk.safety !== safety) {
    profile.risk.safety = safety;
    needsUpdate = true;
    updates["safety"] = safety;
  }

  // 2. urgency (from rules, add to profile if missing)
  const urgency = rulesEntry?.urgency || defaults.urgency;
  if (!profile.urgency) {
    profile.urgency = urgency;
    needsUpdate = true;
    updates["urgency"] = urgency;
  }

  // 3. liability (from rules, add to profile if missing)
  const liability = rulesEntry?.liability || defaults.liability;
  if (!profile.liability) {
    profile.liability = liability;
    needsUpdate = true;
    updates["liability"] = liability;
  }

  // 4. priority (from profile or responses or default)
  const priority = profile.default_priority || resp?.default_priority || defaults.priority;
  if (!profile.default_priority || profile.default_priority !== priority) {
    profile.default_priority = priority;
    needsUpdate = true;
    updates["priority"] = priority;
  }

  // 5. severity (1-5, add if missing)
  if (profile.risk_severity == null || typeof profile.risk_severity !== "number" || profile.risk_severity < 1 || profile.risk_severity > 5) {
    profile.risk_severity = defaults.severity;
    needsUpdate = true;
    updates["severity"] = defaults.severity;
  }

  // 6. likelihood (1-5, add if missing)
  if (profile.likelihood == null || typeof profile.likelihood !== "number" || profile.likelihood < 1 || profile.likelihood > 5) {
    profile.likelihood = defaults.likelihood;
    needsUpdate = true;
    updates["likelihood"] = defaults.likelihood;
  }

  // 7. escalation (from profile risk.escalation or default)
  if (!profile.risk.escalation || profile.risk.escalation !== defaults.escalation) {
    profile.risk.escalation = defaults.escalation;
    needsUpdate = true;
    updates["escalation"] = defaults.escalation;
  }

  // 8-9. budget_low and budget_high (from responses.yml or default based on category)
  // Default budget ranges by category (AUD)
  const budgetDefaults: Record<FindingCategory, { low: number; high: number }> = {
    LIFE_SAFETY_FIRE: { low: 200, high: 800 },
    SHOCK_EXPOSURE: { low: 300, high: 1000 },
    SWITCHBOARD_PROTECTION: { low: 500, high: 2000 },
    EARTHING_BONDING: { low: 400, high: 1500 },
    MECHANICAL_DAMAGE: { low: 100, high: 500 },
    MOISTURE_WATER_PROXIMITY: { low: 200, high: 800 },
    NON_STANDARD_WORK: { low: 300, high: 1200 },
    ROOF_SPACE_CABLES_LIGHTING: { low: 200, high: 1000 },
    DOCUMENTATION_META: { low: 0, high: 0 },
    HAZMAT_SPECIALIST: { low: 500, high: 2000 },
  };

  const budgetDefault = budgetDefaults[category];
  const budgetLow = resp?.budgetary_range?.low ?? budgetDefault.low;
  const budgetHigh = resp?.budgetary_range?.high ?? budgetDefault.high;

  if (profile.budgetary_range?.low == null || profile.budgetary_range.low !== budgetLow) {
    if (!profile.budgetary_range) profile.budgetary_range = {};
    profile.budgetary_range.low = budgetLow;
    needsUpdate = true;
    updates["budget_low"] = budgetLow;
  }
  if (profile.budgetary_range?.high == null || profile.budgetary_range.high !== budgetHigh) {
    if (!profile.budgetary_range) profile.budgetary_range = {};
    profile.budgetary_range.high = budgetHigh;
    needsUpdate = true;
    updates["budget_high"] = budgetHigh;
  }

  // Apply adjustments based on priority/context
  if (priority === "IMMEDIATE" && profile.risk_severity < 4) {
    profile.risk_severity = 4;
    needsUpdate = true;
    updates["severity_adjusted"] = 4;
  }
  if (rulesEntry?.urgency === "IMMEDIATE" && profile.likelihood < 4) {
    profile.likelihood = 4;
    needsUpdate = true;
    updates["likelihood_adjusted"] = 4;
  }
  if (actionLower.includes("monitor") || actionLower.includes("no immediate")) {
    if (profile.risk_severity > 2) {
      profile.risk_severity = 2;
      needsUpdate = true;
      updates["severity_adjusted"] = 2;
    }
    if (profile.likelihood > 2) {
      profile.likelihood = 2;
      needsUpdate = true;
      updates["likelihood_adjusted"] = 2;
    }
  }

  if (needsUpdate) {
    updated.push(findingId);
    if (category === "DOCUMENTATION_META" && !findingId.includes("ALL_") && !findingId.includes("PRESENT")) {
      ambiguous.push({
        id: findingId,
        category,
        reason: "Defaulted to DOCUMENTATION_META - may need review",
      });
    }
  }
}

console.log(`\n✅ Processed ${allIds.size} findings`);
console.log(`   - Updated: ${updated.length}`);
console.log(`   - Ambiguous: ${ambiguous.length}`);

if (ambiguous.length > 0) {
  console.log(`\n⚠️  Ambiguous classifications (first 10):`);
  ambiguous.slice(0, 10).forEach(({ id, category, reason }) => {
    console.log(`   - ${id}: ${category} (${reason})`);
  });
  if (ambiguous.length > 10) {
    console.log(`   ... and ${ambiguous.length - 10} more`);
  }
}

// Write back
console.log("\n💾 Writing updated finding_profiles.yml...");
const updatedYaml = yaml.dump(profilesData, {
  lineWidth: 120,
  indent: 2,
  quotingType: '"',
  forceQuotes: false,
  sortKeys: false,
});

fs.writeFileSync(profilesPath, updatedYaml, "utf8");
console.log("✅ Done!");

// Summary
console.log("\n📋 Summary:");
console.log(`   File: ${profilesPath}`);
console.log(`   Total findings: ${allIds.size}`);
console.log(`   Findings updated: ${updated.length}`);
if (updated.length > 0) {
  console.log(`   Updated IDs (first 30):`);
  updated.slice(0, 30).forEach((id) => console.log(`     - ${id}`));
  if (updated.length > 30) {
    console.log(`     ... and ${updated.length - 30} more`);
  }
}
console.log(`   Ambiguous cases: ${ambiguous.length}`);
