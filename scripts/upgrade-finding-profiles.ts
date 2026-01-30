#!/usr/bin/env node
/**
 * Upgrade finding_profiles.yml from responses.yml
 * 
 * Converts responses.yml structure to new finding_profiles.yml structure:
 * - category
 * - default_priority
 * - risk: { safety, compliance, escalation }
 * - budget: low | high | horizon
 * - messaging: { title, why_it_matters, if_not_addressed, planning_guidance }
 * - disclaimer_line
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Map existing categories from finding_profiles.yml
const CATEGORY_MAP: Record<string, string> = {
  SHOCK: "SHOCK",
  FIRE: "FIRE",
  LIFE_SAFETY: "LIFE_SAFETY",
  COMPLIANCE: "COMPLIANCE",
  LEGACY: "LEGACY",
  RELIABILITY: "RELIABILITY",
  DATA_QUALITY: "DATA_QUALITY",
  OTHER: "OTHER",
};

// Map compliance level to risk.compliance
function mapCompliance(compliance: string): "HIGH" | "MEDIUM" | "LOW" {
  if (compliance === "HIGH") return "HIGH";
  if (compliance === "MEDIUM") return "MEDIUM";
  return "LOW";
}

// Map default_risk (0-10) to risk.safety
function mapSafety(risk: number): "HIGH" | "MODERATE" | "LOW" {
  if (risk >= 7) return "HIGH";
  if (risk >= 4) return "MODERATE";
  return "LOW";
}

// Map default_risk to risk.escalation
function mapEscalation(risk: number): "HIGH" | "MODERATE" | "LOW" {
  if (risk >= 8) return "HIGH";
  if (risk >= 5) return "MODERATE";
  return "LOW";
}

// Map default_budget (0-5) to budget level
function mapBudget(budget: number): "low" | "high" | "horizon" {
  if (budget >= 4) return "high";
  if (budget >= 2) return "low";
  return "horizon";
}

// Extract if_not_addressed from risk_interpretation
function extractIfNotAddressed(riskInterpretation: string): string {
  if (!riskInterpretation) return "";
  
  // Look for "If this condition is not addressed" or similar patterns
  const patterns = [
    /If this condition is not addressed[^.]*\./i,
    /If not addressed[^.]*\./i,
    /If this is not addressed[^.]*\./i,
  ];
  
  for (const pattern of patterns) {
    const match = riskInterpretation.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  // Fallback: extract first sentence containing "if not"
  const sentences = riskInterpretation.split(/[.!?]+/);
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes("if not")) {
      return sentence.trim() + ".";
    }
  }
  
  return "";
}

async function main() {
  // Load existing finding_profiles.yml
  const profilesPath = path.join(__dirname, "..", "profiles", "finding_profiles.yml");
  const profilesContent = fs.readFileSync(profilesPath, "utf8");
  const profilesData = yaml.load(profilesContent) as any;
  const oldProfiles = profilesData.finding_profiles || {};
  
  // Load responses.yml
  const responsesPath = path.join(__dirname, "..", "responses.yml");
  const responsesContent = fs.readFileSync(responsesPath, "utf8");
  const responsesData = yaml.load(responsesContent) as any;
  const responses = responsesData.findings || {};
  
  // Build new profiles
  const newProfiles: Record<string, any> = {};
  
  // Process each finding
  for (const [findingId, response] of Object.entries(responses as Record<string, any>)) {
    const oldProfile = oldProfiles[findingId] || {};
    
    // Extract if_not_addressed from risk_interpretation
    const riskInterpretation = response.risk_interpretation || "";
    const ifNotAddressed = extractIfNotAddressed(riskInterpretation) || 
                          "If this condition is not addressed, it may impact long-term reliability or compliance confidence.";
    
    // Build new profile structure
    newProfiles[findingId] = {
      category: oldProfile.category || "OTHER",
      default_priority: response.default_priority || oldProfile.default_priority || "PLAN_MONITOR",
      risk: {
        safety: mapSafety(oldProfile.default_risk || 3),
        compliance: mapCompliance(oldProfile.compliance || "LOW"),
        escalation: mapEscalation(oldProfile.default_risk || 3),
      },
      budget: mapBudget(oldProfile.default_budget || 1),
      messaging: {
        title: response.title || findingId.replace(/_/g, " "),
        why_it_matters: response.why_it_matters || 
                       "This condition may affect electrical safety, reliability, or compliance depending on severity and location.",
        if_not_addressed: ifNotAddressed,
        planning_guidance: response.planning_guidance || 
                          "This can be factored into future capital planning cycles without immediate urgency.",
      },
      disclaimer_line: response.disclaimer_line || "",
    };
  }
  
  // Add any findings from old profiles that aren't in responses.yml
  for (const [findingId, oldProfile] of Object.entries(oldProfiles)) {
    if (!newProfiles[findingId]) {
      newProfiles[findingId] = {
        category: oldProfile.category || "OTHER",
        default_priority: oldProfile.default_priority || "PLAN_MONITOR",
        risk: {
          safety: mapSafety(oldProfile.default_risk || 3),
          compliance: mapCompliance(oldProfile.compliance || "LOW"),
          escalation: mapEscalation(oldProfile.default_risk || 3),
        },
        budget: mapBudget(oldProfile.default_budget || 1),
        messaging: {
          title: findingId.replace(/_/g, " "),
          why_it_matters: oldProfile.notes || 
                         "This condition may affect electrical safety, reliability, or compliance depending on severity and location.",
          if_not_addressed: "If this condition is not addressed, it may impact long-term reliability or compliance confidence.",
          planning_guidance: "This can be factored into future capital planning cycles without immediate urgency.",
        },
        disclaimer_line: "",
      };
    }
  }
  
  // Write new finding_profiles.yml
  const newContent = {
    version: "2.0",
    meta: {
      description: "Finding profiles for Better Home electrical asset risk & capital planning reports.",
      updated: new Date().toISOString().split('T')[0],
      structure: {
        risk: "Three dimensions: safety (HIGH|MODERATE|LOW), compliance (HIGH|MEDIUM|LOW), escalation (HIGH|MODERATE|LOW)",
        budget: "Three levels: low, high, horizon",
        messaging: "All text content for report generation",
      },
    },
    finding_profiles: newProfiles,
  };
  
  const outputPath = path.join(__dirname, "..", "profiles", "finding_profiles.yml");
  fs.writeFileSync(outputPath, yaml.dump(newContent, { 
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
  }), "utf8");
  
  console.log(`✅ Upgraded finding_profiles.yml with ${Object.keys(newProfiles).length} findings`);
  console.log(`📝 Output: ${outputPath}`);
}

main().catch(console.error);
