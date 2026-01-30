/**
 * Test script for EXECUTIVE_DECISION_SIGNALS validation rules
 */

import { 
  generateExecutiveSignals,
  validateExecutiveSignals,
  type ExecutiveSignalsInput
} from "../netlify/functions/lib/executiveSignals.js";

console.log("=== Testing EXECUTIVE_DECISION_SIGNALS Validation Rules ===\n");

// Test 1: Complete bullets (should pass all rules)
console.log("Test 1: Complete bullets (should pass all rules)");
const test1 = [
  "If these conditions are not addressed within the next 12-24 months, they may impact compliance confidence.",
  "The current condition does not present an immediate or urgent risk that would prevent normal property operations.",
  "These items represent a manageable risk that can be incorporated into normal asset planning cycles.",
  "Capital expenditure provision should be planned based on detailed quotations.",
];
const validated1 = validateExecutiveSignals(test1);
console.log("  Input:", test1.length, "bullets");
console.log("  Output:", validated1.length, "bullets");
const rules1 = {
  hasIfNotAddressed: validated1.some(b => 
    b.toLowerCase().includes("if not addressed") || 
    b.toLowerCase().includes("if deferred") ||
    b.toLowerCase().includes("if left unresolved") ||
    b.toLowerCase().includes("are not addressed")
  ),
  hasWhyNotImmediate: validated1.some(b =>
    b.toLowerCase().includes("not immediate") ||
    b.toLowerCase().includes("does not present an immediate")
  ),
  hasManageableRisk: validated1.some(b =>
    b.toLowerCase().includes("manageable risk") ||
    b.toLowerCase().includes("planned intervention") ||
    b.toLowerCase().includes("can be managed")
  ),
};
console.log("  All rules satisfied:", Object.values(rules1).every(v => v) ? "✅" : "❌");
console.log("");

// Test 2: Missing "if not addressed" style
console.log("Test 2: Missing 'if not addressed' style");
const test2 = [
  "The current condition does not present an immediate risk.",
  "These items represent a manageable risk.",
  "Capital expenditure provision should be planned.",
];
const validated2 = validateExecutiveSignals(test2);
console.log("  Input:", test2.length, "bullets");
console.log("  Output:", validated2.length, "bullets");
const hasIfNotAddressed2 = validated2.some(b => 
  b.toLowerCase().includes("if not addressed") ||
  b.toLowerCase().includes("if deferred") ||
  b.toLowerCase().includes("if left unresolved") ||
  b.toLowerCase().includes("are not addressed")
);
console.log("  Has 'if not addressed' style:", hasIfNotAddressed2 ? "✅" : "❌");
console.log("");

// Test 3: Missing "why not immediate"
console.log("Test 3: Missing 'why not immediate'");
const test3 = [
  "If these conditions are not addressed, they may impact compliance.",
  "These items represent a manageable risk.",
  "Capital expenditure provision should be planned.",
];
const validated3 = validateExecutiveSignals(test3);
console.log("  Input:", test3.length, "bullets");
console.log("  Output:", validated3.length, "bullets");
const hasWhyNotImmediate3 = validated3.some(b =>
  b.toLowerCase().includes("not immediate") ||
  b.toLowerCase().includes("no immediate hazard") ||
  b.toLowerCase().includes("does not present an immediate")
);
console.log("  Has 'why not immediate':", hasWhyNotImmediate3 ? "✅" : "❌");
console.log("");

// Test 4: Missing "manageable risk / planned intervention"
console.log("Test 4: Missing 'manageable risk / planned intervention'");
const test4 = [
  "If these conditions are not addressed, they may impact compliance.",
  "The current condition does not present an immediate risk.",
  "Capital expenditure provision should be planned.",
];
const validated4 = validateExecutiveSignals(test4);
console.log("  Input:", test4.length, "bullets");
console.log("  Output:", validated4.length, "bullets");
const hasManageableRisk4 = validated4.some(b =>
  b.toLowerCase().includes("manageable risk") ||
  b.toLowerCase().includes("planned intervention") ||
  b.toLowerCase().includes("can be managed") ||
  b.toLowerCase().includes("planning cycles")
);
console.log("  Has 'manageable risk / planned intervention':", hasManageableRisk4 ? "✅" : "❌");
console.log("");

// Test 5: All missing (should add all defaults)
console.log("Test 5: All missing (should add all defaults)");
const test5 = [
  "Some generic statement about the property.",
];
const validated5 = validateExecutiveSignals(test5);
console.log("  Input:", test5.length, "bullets");
console.log("  Output:", validated5.length, "bullets");
const rules5 = {
  hasIfNotAddressed: validated5.some(b => 
    b.toLowerCase().includes("if not addressed") ||
    b.toLowerCase().includes("if deferred") ||
    b.toLowerCase().includes("if left unresolved") ||
    b.toLowerCase().includes("are not addressed")
  ),
  hasWhyNotImmediate: validated5.some(b =>
    b.toLowerCase().includes("not immediate") ||
    b.toLowerCase().includes("does not present an immediate")
  ),
  hasManageableRisk: validated5.some(b =>
    b.toLowerCase().includes("manageable risk") ||
    b.toLowerCase().includes("planned intervention") ||
    b.toLowerCase().includes("can be managed")
  ),
};
console.log("  All rules satisfied:", Object.values(rules5).every(v => v) ? "✅" : "❌");
console.log("  - If not addressed:", rules5.hasIfNotAddressed ? "✅" : "❌");
console.log("  - Why not immediate:", rules5.hasWhyNotImmediate ? "✅" : "❌");
console.log("  - Manageable risk:", rules5.hasManageableRisk ? "✅" : "❌");
console.log("");

// Test 6: Variant phrases
console.log("Test 6: Variant phrases (if deferred, if left unresolved)");
const test6 = [
  "If these items are deferred, they may impact future operations.",
  "The condition presents no immediate hazard to occupants.",
  "Planned intervention can address these concerns within normal cycles.",
];
const validated6 = validateExecutiveSignals(test6);
console.log("  Input:", test6.length, "bullets");
console.log("  Output:", validated6.length, "bullets");
console.log("  Validated bullets:");
validated6.forEach((b, i) => console.log(`    ${i + 1}. ${b.substring(0, 70)}...`));
const rules6 = {
  hasIfNotAddressed: validated6.some(b => {
    const lower = b.toLowerCase();
    return lower.includes("if deferred") ||
           lower.includes("items are deferred") ||
           lower.includes("are deferred") ||
           lower.includes("if left unresolved") ||
           lower.includes("if not addressed") ||
           lower.includes("are not addressed");
  }),
  hasWhyNotImmediate: validated6.some(b => {
    const lower = b.toLowerCase();
    return lower.includes("no immediate hazard") ||
           lower.includes("not immediate") ||
           lower.includes("does not present an immediate");
  }),
  hasManageableRisk: validated6.some(b => {
    const lower = b.toLowerCase();
    return lower.includes("planned intervention") ||
           lower.includes("manageable risk") ||
           lower.includes("can be managed");
  }),
};
console.log("  Rules check:");
console.log("    - If not addressed:", rules6.hasIfNotAddressed ? "✅" : "❌");
console.log("    - Why not immediate:", rules6.hasWhyNotImmediate ? "✅" : "❌");
console.log("    - Manageable risk:", rules6.hasManageableRisk ? "✅" : "❌");
console.log("  All rules satisfied:", Object.values(rules6).every(v => v) ? "✅" : "❌");
console.log("");

// Test 7: Verify signals never become "inspection summary"
console.log("Test 7: Verify signals never become 'inspection summary'");
const inspectionSummaryBullets = [
  "During inspection, the inspector found several conditions that require attention.",
  "Visual inspection identified issues with the switchboard.",
  "Testing revealed compliance issues with AS/NZS standards.",
  "The RCD protection was found to be inadequate.",
];
const validated7 = validateExecutiveSignals(inspectionSummaryBullets);
console.log("  Input (inspection summary style):", inspectionSummaryBullets.length, "bullets");
console.log("  Output:", validated7.length, "bullets");
const hasInspectionLanguage = validated7.some(b => {
  const lower = b.toLowerCase();
  return lower.includes("inspection found") ||
         lower.includes("inspector observed") ||
         lower.includes("during inspection") ||
         lower.includes("visual inspection") ||
         lower.includes("testing revealed") ||
         lower.includes("as/nzs") ||
         lower.includes("rcbo") ||
         lower.includes("rcd") ||
         lower.includes("switchboard");
});
console.log("  Contains inspection summary language:", hasInspectionLanguage ? "❌ FAIL" : "✅ PASS");
console.log("");

// Test 8: Test generateExecutiveSignals with scoring outputs
console.log("Test 8: Test generateExecutiveSignals with scoring outputs");
const test8Input: ExecutiveSignalsInput = {
  overall_level: "MODERATE",
  counts: {
    immediate: 0,
    urgent: 0,
    recommended: 3,
    plan: 5,
  },
  capex: {
    low: 2000,
    high: 8000,
  },
  capex_incomplete: false,
  topFindings: [
    { id: "FINDING_1", title: "Partial RCD Coverage", priority: "RECOMMENDED", score: 8.2 },
    { id: "FINDING_2", title: "Aged Equipment", priority: "PLAN", score: 3.1 },
  ],
  dominantRisk: ["COMPLIANCE", "RELIABILITY"],
};
const test8Result = generateExecutiveSignals(test8Input);
console.log("  Generated bullets:", test8Result.bullets.length);
test8Result.bullets.forEach((bullet, i) => {
  console.log(`    ${i + 1}. ${bullet.substring(0, 80)}...`);
});

const test8Rules = {
  hasConsequencePhrase: test8Result.bullets.some(b => {
    const lower = b.toLowerCase();
    return lower.includes("if not addressed") ||
           lower.includes("if deferred") ||
           lower.includes("may escalate") ||
           lower.includes("may impact");
  }),
  hasWhyNotImmediate: test8Result.bullets.some(b => {
    const lower = b.toLowerCase();
    return lower.includes("not immediate") ||
           lower.includes("does not present an immediate") ||
           lower.includes("presents no immediate");
  }),
  hasManageableRisk: test8Result.bullets.some(b => {
    const lower = b.toLowerCase();
    return lower.includes("manageable risk") ||
           lower.includes("planning cycles") ||
           lower.includes("asset planning");
  }),
  hasCapEx: test8Result.bullets.some(b => {
    const lower = b.toLowerCase();
    return lower.includes("capex") ||
           lower.includes("capital expenditure") ||
           lower.includes("provision");
  }),
  noInspectionSummary: !test8Result.bullets.some(b => {
    const lower = b.toLowerCase();
    return lower.includes("inspection found") ||
           lower.includes("inspector observed") ||
           lower.includes("during inspection") ||
           lower.includes("visual inspection");
  }),
};
console.log("  Rules check:");
console.log("    - Has consequence phrase:", test8Rules.hasConsequencePhrase ? "✅" : "❌");
console.log("    - Has 'why not immediate':", test8Rules.hasWhyNotImmediate ? "✅" : "❌");
console.log("    - Has 'manageable risk':", test8Rules.hasManageableRisk ? "✅" : "❌");
console.log("    - Has CapEx/provisioning:", test8Rules.hasCapEx ? "✅" : "❌");
console.log("    - No inspection summary language:", test8Rules.noInspectionSummary ? "✅" : "❌");
console.log("  All rules satisfied:", Object.values(test8Rules).every(v => v) ? "✅" : "❌");
console.log("");

// Test 9: Test with capex_incomplete flag
console.log("Test 9: Test with capex_incomplete flag");
const test9Input: ExecutiveSignalsInput = {
  overall_level: "ELEVATED",
  counts: {
    immediate: 1,
    urgent: 2,
    recommended: 2,
    plan: 1,
  },
  capex: {
    low: 5000,
    high: 15000,
  },
  capex_incomplete: true,  // Some findings missing budget ranges
  topFindings: [
    { id: "FINDING_1", title: "Critical Safety Issue", priority: "IMMEDIATE", score: 15.5 },
  ],
  dominantRisk: ["SAFETY"],
};
const test9Result = generateExecutiveSignals(test9Input);
const hasIncompleteNote = test9Result.bullets.some(b => 
  b.toLowerCase().includes("note:") && b.toLowerCase().includes("quotations")
);
console.log("  Has note about incomplete budget:", hasIncompleteNote ? "✅" : "❌");
console.log("");

// Test 10: Test deterministic fallback when all bullets are inspection summary
console.log("Test 10: Test deterministic fallback");
const allInspectionSummary = [
  "The inspection found multiple issues with the electrical system.",
  "Visual inspection identified non-compliance with AS/NZS 3000.",
  "Testing revealed RCD trip times exceeding standards.",
  "The switchboard requires immediate attention.",
];
const validated10 = validateExecutiveSignals(allInspectionSummary);
console.log("  Input (all inspection summary):", allInspectionSummary.length, "bullets");
console.log("  Output:", validated10.length, "bullets");
const stillHasInspectionLanguage = validated10.some(b => {
  const lower = b.toLowerCase();
  return lower.includes("inspection found") ||
         lower.includes("inspector observed") ||
         lower.includes("during inspection") ||
         lower.includes("visual inspection") ||
         lower.includes("testing revealed") ||
         lower.includes("as/nzs") ||
         lower.includes("rcd") ||
         lower.includes("switchboard");
});
console.log("  Still contains inspection language:", stillHasInspectionLanguage ? "❌ FAIL" : "✅ PASS");
console.log("  Validated bullets:");
validated10.forEach((b, i) => console.log(`    ${i + 1}. ${b.substring(0, 70)}...`));
console.log("");

console.log("✅ All validation tests completed!");
