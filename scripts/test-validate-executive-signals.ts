/**
 * Test script for validateExecutiveSignals function
 */

import { validateExecutiveSignals } from "../src/lib/executiveSignals.js";

console.log("=== Testing validateExecutiveSignals ===\n");

// Test 1: Complete bullets (should pass validation)
console.log("Test 1: Complete bullets (should pass validation)");
const test1 = [
  "If these 3 urgent concerns are not addressed, they may escalate into more significant safety risks or liability exposure over the next 6-12 months.",
  "While these items require attention, they do not represent an immediate emergency that would prevent continued use of the property under normal conditions.",
  "These risks represent a manageable risk that can be addressed within standard asset planning cycles.",
  "Capital expenditure provision of $5,000 to $15,000 should be allocated for addressing the identified conditions.",
];
const validated1 = validateExecutiveSignals(test1);
console.log("Input:", test1.length, "bullets");
console.log("Output:", validated1.length, "bullets");
console.log("All required types present:", 
  validated1.length === test1.length ? "✅ Yes" : "❌ No (added missing)");
console.log("");

// Test 2: Missing "If not addressed"
console.log("Test 2: Missing 'If not addressed'");
const test2 = [
  "The current condition does not present an immediate or urgent risk.",
  "These items represent a manageable risk that can be incorporated into normal asset planning cycles.",
  "Capital expenditure provision should be planned based on detailed quotations.",
];
const validated2 = validateExecutiveSignals(test2);
console.log("Input:", test2.length, "bullets");
console.log("Output:", validated2.length, "bullets");
const hasIfNotAddressed2 = validated2.some(b => 
  b.toLowerCase().includes("if not addressed") || 
  b.toLowerCase().includes("are not addressed")
);
console.log("Has 'If not addressed':", hasIfNotAddressed2 ? "✅ Yes" : "❌ No");
console.log("");

// Test 3: Missing "why not immediate"
console.log("Test 3: Missing 'why not immediate'");
const test3 = [
  "If the identified conditions are not addressed, they may impact compliance confidence.",
  "These items represent a manageable risk that can be incorporated into normal asset planning cycles.",
  "Capital expenditure provision should be planned based on detailed quotations.",
];
const validated3 = validateExecutiveSignals(test3);
console.log("Input:", test3.length, "bullets");
console.log("Output:", validated3.length, "bullets");
const hasWhyNotImmediate3 = validated3.some(b =>
  b.toLowerCase().includes("not immediate") ||
  b.toLowerCase().includes("no immediate hazard") ||
  b.toLowerCase().includes("does not present an immediate")
);
console.log("Has 'why not immediate':", hasWhyNotImmediate3 ? "✅ Yes" : "❌ No");
console.log("");

// Test 4: Missing "manageable risk"
console.log("Test 4: Missing 'manageable risk'");
const test4 = [
  "If the identified conditions are not addressed, they may impact compliance confidence.",
  "The current condition does not present an immediate or urgent risk.",
  "Capital expenditure provision should be planned based on detailed quotations.",
];
const validated4 = validateExecutiveSignals(test4);
console.log("Input:", test4.length, "bullets");
console.log("Output:", validated4.length, "bullets");
const hasManageableRisk4 = validated4.some(b =>
  b.toLowerCase().includes("manageable risk")
);
console.log("Has 'manageable risk':", hasManageableRisk4 ? "✅ Yes" : "❌ No");
console.log("");

// Test 5: Missing CapEx provisioning
console.log("Test 5: Missing CapEx provisioning");
const test5 = [
  "If the identified conditions are not addressed, they may impact compliance confidence.",
  "The current condition does not present an immediate or urgent risk.",
  "These items represent a manageable risk that can be incorporated into normal asset planning cycles.",
];
const validated5 = validateExecutiveSignals(test5);
console.log("Input:", test5.length, "bullets");
console.log("Output:", validated5.length, "bullets");
const hasCapEx5 = validated5.some(b =>
  b.toLowerCase().includes("capex") ||
  b.toLowerCase().includes("capital expenditure") ||
  b.toLowerCase().includes("provision")
);
console.log("Has CapEx provisioning:", hasCapEx5 ? "✅ Yes" : "❌ No");
console.log("");

// Test 6: Empty array (should add all defaults)
console.log("Test 6: Empty array (should add all defaults)");
const test6: string[] = [];
const validated6 = validateExecutiveSignals(test6);
console.log("Input:", test6.length, "bullets");
console.log("Output:", validated6.length, "bullets");
console.log("Bullets:");
validated6.forEach((bullet, i) => {
  console.log(`  ${i + 1}. ${bullet.substring(0, 80)}...`);
});
console.log("");

// Test 7: All missing (should add all defaults)
console.log("Test 7: All missing (should add all defaults)");
const test7 = [
  "Some generic statement about the property.",
];
const validated7 = validateExecutiveSignals(test7);
console.log("Input:", test7.length, "bullets");
console.log("Output:", validated7.length, "bullets");
const hasAllRequired = {
  ifNotAddressed: validated7.some(b => b.toLowerCase().includes("if not addressed") || b.toLowerCase().includes("are not addressed")),
  whyNotImmediate: validated7.some(b => b.toLowerCase().includes("not immediate") || b.toLowerCase().includes("does not present an immediate")),
  manageableRisk: validated7.some(b => b.toLowerCase().includes("manageable risk")),
  capex: validated7.some(b => b.toLowerCase().includes("capex") || b.toLowerCase().includes("capital expenditure") || b.toLowerCase().includes("provision")),
};
console.log("All required types present:", Object.values(hasAllRequired).every(v => v) ? "✅ Yes" : "❌ No");
console.log("  - If not addressed:", hasAllRequired.ifNotAddressed ? "✅" : "❌");
console.log("  - Why not immediate:", hasAllRequired.whyNotImmediate ? "✅" : "❌");
console.log("  - Manageable risk:", hasAllRequired.manageableRisk ? "✅" : "❌");
console.log("  - CapEx provisioning:", hasAllRequired.capex ? "✅" : "❌");
console.log("");

console.log("✅ All validation tests completed!");
