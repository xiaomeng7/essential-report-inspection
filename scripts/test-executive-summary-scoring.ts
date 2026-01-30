/**
 * Test script to verify Executive Summary can access overall_level and capex_range_total
 */

import { 
  computeOverall,
  convertProfileForScoring,
  type FindingForScoring
} from "../netlify/functions/lib/scoring.js";
import { loadFindingProfiles, getFindingProfile } from "../netlify/functions/lib/findingProfilesLoader.js";

// Mock findings
const mockFindings: FindingForScoring[] = [
  { id: "SWITCHBOARD_CERAMIC_FUSES_PRESENT", priority: "IMMEDIATE" },
  { id: "SWITCHBOARD_NO_RCD_PROTECTION", priority: "RECOMMENDED" },
  { id: "SWITCHBOARD_AGED_EQUIPMENT", priority: "PLAN" },
];

async function testExecutiveSummaryScoring() {
  console.log("=== Testing Executive Summary Scoring Integration ===\n");
  
  // Load finding profiles
  const profiles = loadFindingProfiles();
  console.log(`✅ Loaded ${Object.keys(profiles).length} finding profiles\n`);
  
  // Convert profiles to scoring format
  const profilesForScoring: Record<string, any> = {};
  for (const finding of mockFindings) {
    const profile = getFindingProfile(finding.id);
    if (profile) {
      profilesForScoring[finding.id] = convertProfileForScoring(profile);
      console.log(`Finding: ${finding.id}`);
      console.log(`  - severity: ${profilesForScoring[finding.id].severity}`);
      console.log(`  - likelihood: ${profilesForScoring[finding.id].likelihood}`);
      console.log(`  - budget_band: ${profilesForScoring[finding.id].budget_band}`);
      console.log(`  - budget: ${JSON.stringify(profilesForScoring[finding.id].budget)}`);
      console.log(`  - category: ${profilesForScoring[finding.id].category}`);
      console.log("");
    }
  }
  
  // Compute overall score
  const overallScore = computeOverall(mockFindings, profilesForScoring);
  
  console.log("=== Overall Score Results ===");
  console.log(`overall_level: ${overallScore.overall_level}`);
  console.log(`badge: ${overallScore.badge}`);
  console.log(`aggregate_score: ${overallScore.aggregate_score}`);
  console.log(`capex_low: ${overallScore.capex_low}`);
  console.log(`capex_high: ${overallScore.capex_high}`);
  console.log(`capex_incomplete: ${overallScore.capex_incomplete}`);
  console.log(`dominant_risk: ${JSON.stringify(overallScore.dominant_risk)}`);
  console.log("");
  
  // Simulate Executive Summary usage
  console.log("=== Executive Summary Usage ===");
  const OVERALL_STATUS = overallScore.badge || "🟡 Moderate";
  const CAPEX_SNAPSHOT = (overallScore.capex_low > 0 || overallScore.capex_high > 0)
    ? `AUD $${overallScore.capex_low} – $${overallScore.capex_high}`
    : "AUD $0 – $0";
  
  console.log(`OVERALL_STATUS: ${OVERALL_STATUS}`);
  console.log(`CAPEX_SNAPSHOT: ${CAPEX_SNAPSHOT}`);
  console.log("");
  
  // Verify values are accessible
  if (overallScore.overall_level && (overallScore.capex_low > 0 || overallScore.capex_high > 0)) {
    console.log("✅ SUCCESS: Executive Summary can access overall_level and capex_range_total");
  } else {
    console.log("⚠️  WARNING: Some values may be missing or zero");
  }
  
  console.log("");
  console.log("✅ Test completed!");
}

testExecutiveSummaryScoring().catch(console.error);
