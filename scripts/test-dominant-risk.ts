/**
 * Test script for dominantRisk calculation in scoring model
 */

import { computeOverall, type FindingForScoring } from "../src/lib/scoring.js";

console.log("=== Testing dominantRisk Calculation ===\n");

// Test 1: Safety dominant
console.log("Test 1: Safety should be dominant");
const test1Findings: FindingForScoring[] = [
  { id: "FINDING_1", priority: "IMMEDIATE" },
  { id: "FINDING_2", priority: "RECOMMENDED_0_3_MONTHS" },
];

const test1Profiles = {
  FINDING_1: {
    risk: { safety: 5, compliance: 2, escalation: 2 }, // High safety
    budget: { low: 0, high: 0 },
  },
  FINDING_2: {
    risk: { safety: 4, compliance: 3, escalation: 2 }, // High safety
    budget: { low: 0, high: 0 },
  },
};

const result1 = computeOverall(test1Findings, test1Profiles);
console.log("Weighted contributions:");
console.log("  Safety: 5*3 + 4*2 =", 5*3 + 4*2, "(expected: 23)");
console.log("  Compliance: 2*3 + 3*2 =", 2*3 + 3*2, "(expected: 12)");
console.log("  Escalation: 2*3 + 2*2 =", 2*3 + 2*2, "(expected: 10)");
console.log("Dominant Risk:", result1.dominantRisk, "(expected: safety)");
console.log("");

// Test 2: Compliance dominant
console.log("Test 2: Compliance should be dominant");
const test2Findings: FindingForScoring[] = [
  { id: "FINDING_1", priority: "IMMEDIATE" },
  { id: "FINDING_2", priority: "RECOMMENDED_0_3_MONTHS" },
];

const test2Profiles = {
  FINDING_1: {
    risk: { safety: 2, compliance: 5, escalation: 2 }, // High compliance
    budget: { low: 0, high: 0 },
  },
  FINDING_2: {
    risk: { safety: 3, compliance: 4, escalation: 2 }, // High compliance
    budget: { low: 0, high: 0 },
  },
};

const result2 = computeOverall(test2Findings, test2Profiles);
console.log("Weighted contributions:");
console.log("  Safety: 2*3 + 3*2 =", 2*3 + 3*2, "(expected: 12)");
console.log("  Compliance: 5*3 + 4*2 =", 5*3 + 4*2, "(expected: 23)");
console.log("  Escalation: 2*3 + 2*2 =", 2*3 + 2*2, "(expected: 10)");
console.log("Dominant Risk:", result2.dominantRisk, "(expected: compliance)");
console.log("");

// Test 3: Escalation dominant
console.log("Test 3: Escalation should be dominant");
const test3Findings: FindingForScoring[] = [
  { id: "FINDING_1", priority: "IMMEDIATE" },
  { id: "FINDING_2", priority: "RECOMMENDED_0_3_MONTHS" },
];

const test3Profiles = {
  FINDING_1: {
    risk: { safety: 2, compliance: 2, escalation: 5 }, // High escalation
    budget: { low: 0, high: 0 },
  },
  FINDING_2: {
    risk: { safety: 3, compliance: 2, escalation: 4 }, // High escalation
    budget: { low: 0, high: 0 },
  },
};

const result3 = computeOverall(test3Findings, test3Profiles);
console.log("Weighted contributions:");
console.log("  Safety: 2*3 + 3*2 =", 2*3 + 3*2, "(expected: 12)");
console.log("  Compliance: 2*3 + 2*2 =", 2*3 + 2*2, "(expected: 10)");
console.log("  Escalation: 5*3 + 4*2 =", 5*3 + 4*2, "(expected: 23)");
console.log("Dominant Risk:", result3.dominantRisk, "(expected: escalation)");
console.log("");

// Test 4: Tie-breaking (safety >= compliance >= escalation)
console.log("Test 4: Tie-breaking - safety should win when equal");
const test4Findings: FindingForScoring[] = [
  { id: "FINDING_1", priority: "IMMEDIATE" },
];

const test4Profiles = {
  FINDING_1: {
    risk: { safety: 5, compliance: 5, escalation: 3 }, // Safety = Compliance > Escalation
    budget: { low: 0, high: 0 },
  },
};

const result4 = computeOverall(test4Findings, test4Profiles);
console.log("Weighted contributions:");
console.log("  Safety: 5*3 =", 5*3, "(expected: 15)");
console.log("  Compliance: 5*3 =", 5*3, "(expected: 15)");
console.log("  Escalation: 3*3 =", 3*3, "(expected: 9)");
console.log("Dominant Risk:", result4.dominantRisk, "(expected: safety, due to tie-breaking)");
console.log("");

// Test 5: All equal (should default to safety)
console.log("Test 5: All equal - should default to safety");
const test5Findings: FindingForScoring[] = [
  { id: "FINDING_1", priority: "PLAN_MONITOR" },
];

const test5Profiles = {
  FINDING_1: {
    risk: { safety: 3, compliance: 3, escalation: 3 }, // All equal
    budget: { low: 0, high: 0 },
  },
};

const result5 = computeOverall(test5Findings, test5Profiles);
console.log("Weighted contributions:");
console.log("  Safety: 3*1 =", 3*1, "(expected: 3)");
console.log("  Compliance: 3*1 =", 3*1, "(expected: 3)");
console.log("  Escalation: 3*1 =", 3*1, "(expected: 3)");
console.log("Dominant Risk:", result5.dominantRisk, "(expected: safety, due to tie-breaking)");
console.log("");

console.log("✅ All dominantRisk tests completed!");
