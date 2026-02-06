#!/usr/bin/env tsx
/**
 * Script to add missing recommended_action fields to findings in responses.yml
 * Uses standardized action archetypes for consistency
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Action archetype templates (EN only - file is en-AU)
const ACTION_TEMPLATES = {
  A: "Immediate rectification by a licensed electrician is recommended. This condition presents a potential safety risk and should not be deferred.",
  B: "Rectification is recommended in the near term to reduce the likelihood of progressive deterioration or future safety issues.",
  C: "No immediate rectification is required. This item can be addressed as part of planned electrical maintenance or future upgrade works.",
  D: "No immediate action is required at this time. Ongoing monitoring is recommended, with reassessment during future inspections or if site conditions change.",
  E: "No action is required. This item has been recorded for documentation and compliance purposes.",
  F: "Further assessment by a licensed electrician or appropriately qualified specialist is recommended before any works are undertaken.",
} as const;

type ActionArchetype = keyof typeof ACTION_TEMPLATES;

/**
 * Classify a finding into an action archetype based on its ID, title, and why_it_matters
 */
function classifyActionArchetype(
  findingId: string,
  title: string,
  whyItMatters: string,
  defaultPriority?: string
): ActionArchetype {
  const idUpper = findingId.toUpperCase();
  const titleLower = title.toLowerCase();
  const whyLower = whyItMatters.toLowerCase();

  // F: Asbestos or specialist assessment required
  if (
    idUpper.includes("ASBESTOS") ||
    titleLower.includes("asbestos") ||
    whyLower.includes("asbestos") ||
    whyLower.includes("specialist") ||
    whyLower.includes("qualified specialist")
  ) {
    return "F";
  }

  // E: Meta/record items
  if (
    idUpper.startsWith("ALL_") ||
    idUpper.includes("_PRESENT") ||
    idUpper.includes("_RECORDED") ||
    idUpper.includes("LOCATION_PHOTOGRAPHED") ||
    idUpper.includes("NO_ADVICE_") ||
    idUpper.includes("CHECKLIST_ITEMS_COMPLETED") ||
    idUpper.includes("REQUIRED_PHOTOS_UPLOADED") ||
    titleLower.includes("all checklist") ||
    titleLower.includes("all required photos")
  ) {
    return "E";
  }

  // A: Immediate safety risks
  // Check default_priority first - if IMMEDIATE, it's likely A
  if (defaultPriority === "IMMEDIATE") {
    // But exclude asbestos (F) and meta items (E) which might have IMMEDIATE but need different handling
    if (!idUpper.includes("ASBESTOS") && !idUpper.startsWith("ALL_")) {
      return "A";
    }
  }
  
  if (
    idUpper.includes("SHOCK") ||
    idUpper.includes("FIRE") ||
    idUpper.includes("OVERHEAT") ||
    (idUpper.includes("BURN") && !idUpper.includes("BAKELITE")) ||
    idUpper.includes("EXPOSED") ||
    idUpper.includes("ARCING") ||
    idUpper.includes("THERMAL_STRESS") ||
    idUpper.includes("NO_RCD") ||
    idUpper.includes("EARTH_FAULT") ||
    idUpper.includes("SMOKE_ALARM_FAILURE") ||
    idUpper.includes("BATTERY_THERMAL") ||
    idUpper.includes("EV_UNSEGREGATED") ||
    idUpper.includes("MEN_NOT_VERIFIED") ||
    idUpper.includes("SUPPLY_NO_MAIN_ISOLATION") ||
    idUpper.includes("MATERIAL_DEGRADATION") ||
    (titleLower.includes("burn") && !titleLower.includes("bakelite")) ||
    titleLower.includes("overheat") ||
    titleLower.includes("exposed") ||
    titleLower.includes("arcing") ||
    (titleLower.includes("thermal") && !titleLower.includes("imaging")) ||
    titleLower.includes("no rcd") ||
    titleLower.includes("earth fault") ||
    whyLower.includes("shock") ||
    whyLower.includes("fire") ||
    whyLower.includes("overheating") ||
    (whyLower.includes("burn") && !whyLower.includes("bakelite")) ||
    whyLower.includes("exposed conductor") ||
    whyLower.includes("abnormally warm")
  ) {
    return "A";
  }

  // D: Monitoring/observation only
  if (
    idUpper.includes("MOISTURE") ||
    idUpper.includes("STAINING") ||
    idUpper.includes("GREASE") ||
    idUpper.includes("RESIDUE") ||
    idUpper.includes("INSULATION_CONTACT") ||
    titleLower.includes("moisture") ||
    titleLower.includes("staining") ||
    titleLower.includes("grease") ||
    titleLower.includes("residue") ||
    whyLower.includes("observation") ||
    whyLower.includes("monitoring") ||
    (whyLower.includes("insulation contact") && !whyLower.includes("damage"))
  ) {
    return "D";
  }

  // B: Mechanical issues, loose, cracked, non-standard (but not clearly dangerous)
  // Check for cable damage first (but exclude if it's clearly dangerous like exposed)
  if (
    (idUpper.includes("CABLE") && idUpper.includes("DAMAGE")) ||
    (idUpper.includes("CABLE") && idUpper.includes("SUPPORT")) ||
    (idUpper.includes("CABLE") && idUpper.includes("NON_MODERN")) ||
    idUpper.includes("MECHANICAL") ||
    idUpper.includes("LOOSE") ||
    idUpper.includes("CRACKED") ||
    idUpper.includes("BROKEN") ||
    idUpper.includes("TAPED") ||
    idUpper.includes("NON_STANDARD") ||
    idUpper.includes("DEGRADED") ||
    titleLower.includes("loose") ||
    titleLower.includes("cracked") ||
    titleLower.includes("broken") ||
    titleLower.includes("taped") ||
    titleLower.includes("non-standard") ||
    (titleLower.includes("damage") && !titleLower.includes("exposed")) ||
    whyLower.includes("mechanical") ||
    whyLower.includes("loose") ||
    whyLower.includes("cracked") ||
    whyLower.includes("taped connection") ||
    whyLower.includes("non-standard wiring") ||
    (whyLower.includes("cable damage") && !whyLower.includes("exposed"))
  ) {
    return "B";
  }

  // C: Legacy/old but serviceable, capacity upgrades, planned maintenance
  if (
    idUpper.includes("LEGACY") ||
    idUpper.includes("OLD") ||
    idUpper.includes("CAPACITY") ||
    idUpper.includes("MARGIN") ||
    idUpper.includes("EXPANSION") ||
    idUpper.includes("UPGRADE") ||
    idUpper.includes("CERAMIC") ||
    idUpper.includes("REWIREABLE") ||
    idUpper.includes("BAKELITE") ||
    (idUpper.includes("CABLE") && idUpper.includes("NON_MODERN")) ||
    titleLower.includes("legacy") ||
    titleLower.includes("old") ||
    titleLower.includes("capacity") ||
    titleLower.includes("ceramic") ||
    titleLower.includes("rewireable") ||
    titleLower.includes("bakelite") ||
    titleLower.includes("non modern") ||
    whyLower.includes("legacy") ||
    whyLower.includes("old but serviceable") ||
    whyLower.includes("capacity") ||
    whyLower.includes("non-modern")
  ) {
    return "C";
  }
  
  // D: Default for PLAN_MONITOR priority (unless already classified)
  if (defaultPriority === "PLAN_MONITOR") {
    return "D";
  }

  // Default to D (monitoring) if unclear
  return "D";
}

const responsesPath = path.join(__dirname, "..", "netlify", "functions", "responses.yml");

console.log("📖 Reading responses.yml...");
const fileContent = fs.readFileSync(responsesPath, "utf8");
const data = yaml.load(fileContent) as any;

if (!data.findings) {
  console.error("❌ No 'findings' key found in YAML");
  process.exit(1);
}

const findings = data.findings;
const findingIds = Object.keys(findings);
console.log(`📊 Found ${findingIds.length} findings`);

// Track statistics
let missingCount = 0;
let addedCount = 0;
const ambiguous: Array<{ id: string; archetype: ActionArchetype; reason: string }> = [];

// Process each finding
for (const findingId of findingIds) {
  const finding = findings[findingId];
  
  const title = finding.title || findingId.replace(/_/g, " ");
  const whyItMatters = finding.why_it_matters || "";
  const defaultPriority = finding.default_priority;
  
  // Classify the finding
  const archetype = classifyActionArchetype(findingId, title, whyItMatters, defaultPriority);
  const expectedAction = ACTION_TEMPLATES[archetype];
  
  // Check if recommended_action is missing or incorrect
  const currentAction = finding.recommended_action || "";
  const isMissing = !currentAction || currentAction.trim() === "";
  const isIncorrect = !isMissing && !currentAction.includes(expectedAction.substring(0, 30)); // Check if it matches expected template
  
  if (isMissing || isIncorrect) {
    if (isMissing) missingCount++;
    
    // Add/update the recommended_action
    finding.recommended_action = expectedAction;
    addedCount++;
    
    // Track ambiguous cases (where classification might need review)
    if (
      archetype === "D" && // Default fallback
      !findingId.includes("MONITOR") &&
      !findingId.includes("OBSERVATION") &&
      defaultPriority !== "PLAN_MONITOR"
    ) {
      ambiguous.push({
        id: findingId,
        archetype,
        reason: `Defaulted to monitoring (D) - may need review`,
      });
    }
  }
}

console.log(`\n✅ Processed ${findingIds.length} findings`);
console.log(`   - Missing recommended_action: ${missingCount}`);
console.log(`   - Added recommended_action: ${addedCount}`);

if (ambiguous.length > 0) {
  console.log(`\n⚠️  ${ambiguous.length} findings classified as ambiguous (may need manual review):`);
  ambiguous.slice(0, 10).forEach(({ id, archetype, reason }) => {
    console.log(`   - ${id}: ${archetype} (${reason})`);
  });
  if (ambiguous.length > 10) {
    console.log(`   ... and ${ambiguous.length - 10} more`);
  }
}

// Add developer note at top of findings section
if (!data.meta.notes || !data.meta.notes.includes("recommended_action")) {
  const existingNotes = data.meta.notes || "";
  data.meta.notes = `${existingNotes}\nRecommended actions use standardized archetypes: A (Immediate Safety), B (Prompt Rectification), C (Planned Maintenance), D (Monitoring), E (Documentation Only), F (Further Assessment).`;
}

// Write back to file
console.log("\n💾 Writing updated responses.yml...");
const updatedYaml = yaml.dump(data, {
  lineWidth: 120,
  indent: 2,
  quotingType: '"',
  forceQuotes: false,
  sortKeys: false,
});

fs.writeFileSync(responsesPath, updatedYaml, "utf8");
console.log("✅ Done! Updated responses.yml");

// Summary
console.log("\n📋 Summary:");
console.log(`   File: ${responsesPath}`);
console.log(`   Findings updated: ${addedCount}`);
console.log(`   Ambiguous cases: ${ambiguous.length}`);
