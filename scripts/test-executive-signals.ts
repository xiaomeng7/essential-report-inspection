/**
 * Test script for Executive Decision Signals generator
 */

import { generateExecutiveSignals } from "../src/lib/executiveSignals.js";

console.log("=== Testing Executive Decision Signals Generator ===\n");

// Test 1: ELEVATED level with immediate findings
console.log("Test 1: ELEVATED level with immediate findings");
const test1 = generateExecutiveSignals({
  overall_level: "ELEVATED",
  counts: {
    immediate: 2,
    urgent: 1,
    recommended: 3,
    plan: 5,
  },
  capex: {
    low: 5000,
    high: 15000,
  },
  topFindings: [
    { id: "MEN_NOT_VERIFIED", title: "MEN Not Verified", priority: "IMMEDIATE", score: 15.5 },
    { id: "NO_RCD_PROTECTION", title: "No RCD Protection", priority: "IMMEDIATE", score: 12.3 },
  ],
  dominantRisk: "safety",
});

console.log("Bullets:", test1.bullets.length);
test1.bullets.forEach((bullet, i) => {
  console.log(`  ${i + 1}. ${bullet}`);
});
console.log("\nif_not_addressed:", test1.if_not_addressed);
console.log("why_not_immediate:", test1.why_not_immediate);
console.log("manageable_risk:", test1.manageable_risk);
console.log("");

// Test 2: MODERATE level with recommended findings
console.log("Test 2: MODERATE level with recommended findings");
const test2 = generateExecutiveSignals({
  overall_level: "MODERATE",
  counts: {
    immediate: 0,
    urgent: 0,
    recommended: 4,
    plan: 8,
  },
  capex: {
    low: 2000,
    high: 8000,
  },
  topFindings: [
    { id: "PARTIAL_RCD_COVERAGE", title: "Partial RCD Coverage", priority: "RECOMMENDED_0_3_MONTHS", score: 8.2 },
  ],
  dominantRisk: "compliance",
});

console.log("Bullets:", test2.bullets.length);
test2.bullets.forEach((bullet, i) => {
  console.log(`  ${i + 1}. ${bullet}`);
});
console.log("");

// Test 3: LOW level with plan findings
console.log("Test 3: LOW level with plan findings");
const test3 = generateExecutiveSignals({
  overall_level: "LOW",
  counts: {
    immediate: 0,
    urgent: 0,
    recommended: 0,
    plan: 6,
  },
  capex: {
    low: 0,
    high: 0,
  },
  topFindings: [
    { id: "LABELING_POOR", title: "Poor Labeling", priority: "PLAN_MONITOR", score: 2.1 },
  ],
});

console.log("Bullets:", test3.bullets.length);
test3.bullets.forEach((bullet, i) => {
  console.log(`  ${i + 1}. ${bullet}`);
});
console.log("");

// Test 4: Verify hard rules
console.log("Test 4: Verify hard rules compliance");
const test4 = generateExecutiveSignals({
  overall_level: "MODERATE",
  counts: {
    immediate: 1,
    urgent: 0,
    recommended: 2,
    plan: 3,
  },
  capex: {
    low: 3000,
    high: 10000,
  },
  topFindings: [],
});

console.log("Bullets count:", test4.bullets.length, "(should be 3-5)");
console.log("\nBullets content:");
test4.bullets.forEach((bullet, i) => {
  console.log(`  ${i + 1}. ${bullet}`);
});

const hasIfNotAddressed = test4.bullets.some(b => 
  b.includes("If not addressed") || 
  b.includes("are not addressed") ||
  b.includes("is not maintained")
);
const hasNotImmediate = test4.bullets.some(b => 
  b.toLowerCase().includes("not immediate") || 
  b.toLowerCase().includes("no immediate hazard") ||
  b.toLowerCase().includes("no immediate emergency") ||
  b.toLowerCase().includes("does not present an immediate")
);
const hasManageableRisk = test4.bullets.some(b => 
  b.toLowerCase().includes("manageable risk")
);
const hasCapEx = test4.bullets.some(b => 
  b.includes("CapEx") || 
  b.includes("capEx") || 
  b.includes("Capital expenditure") ||
  b.includes("provision")
);

console.log("\nHard rules compliance:");
console.log("  ✓ Has 'If not addressed':", hasIfNotAddressed);
console.log("  ✓ Has 'not immediate' or 'no immediate hazard':", hasNotImmediate);
console.log("  ✓ Has 'manageable risk':", hasManageableRisk);
console.log("  ✓ Has 'CapEx' or 'provision':", hasCapEx);

if (!hasIfNotAddressed || !hasNotImmediate || !hasManageableRisk || !hasCapEx) {
  console.log("\n❌ Some hard rules are not met!");
} else {
  console.log("\n✅ All hard rules are met!");
}

console.log("\n✅ All tests completed!");
