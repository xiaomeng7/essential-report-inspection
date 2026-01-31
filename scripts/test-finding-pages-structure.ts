/**
 * Test script to verify finding pages structure
 * Validates that each finding page follows the exact format:
 * 1. Asset Component
 * 2. Observed Condition
 * 3. Evidence
 * 4. Risk Interpretation
 * 5. Priority Classification
 * 6. Budgetary Planning Range
 */

import { generateFindingPages, type Finding, type Response } from "../netlify/functions/lib/generateFindingPages.js";
import { loadFindingProfiles, getFindingProfile } from "../netlify/functions/lib/findingProfilesLoader.js";

console.log("=== Testing Finding Pages Structure ===\n");

// Mock test data
const mockFindings: Finding[] = [
  {
    id: "TEST_FINDING_1",
    priority: "RECOMMENDED_0_3_MONTHS",
    title: "Test Finding 1",
  },
];

const mockProfiles: Record<string, any> = {};
mockFindings.forEach(finding => {
  mockProfiles[finding.id] = getFindingProfile(finding.id);
});

const mockResponses: Record<string, Response> = {
  TEST_FINDING_1: {
    title: "Test Finding",
    observed_condition: "Test condition observed.",
    why_it_matters: "This condition affects electrical safety.",
    risk_interpretation: "If this condition is not addressed, it may impact long-term reliability. This risk does not present an immediate hazard and can be managed within normal asset planning cycles.",
  },
};

// Test 1: Verify structure order
console.log("Test 1: Verify page structure order");
try {
  const result = await generateFindingPages(
    mockFindings,
    mockProfiles,
    mockResponses,
    {},
    {}
  );
  
  if (result.errors.length > 0) {
    console.log("  ❌ Validation errors found:");
    result.errors.forEach(err => {
      console.log(`    - Finding ${err.findingId}: ${err.field} - ${err.message}`);
    });
  } else {
    console.log("  ✅ No validation errors");
  }
  
  // Check HTML structure
  const html = result.html;
  const sections = [
    "Asset Component",
    "Observed Condition",
    "Evidence",
    "Risk Interpretation",
    "Priority Classification",
    "Budgetary Planning Range",
  ];
  
  let lastIndex = -1;
  let orderCorrect = true;
  sections.forEach((section, index) => {
    const currentIndex = html.indexOf(`<h3`, lastIndex + 1);
    if (currentIndex === -1 || currentIndex < lastIndex) {
      console.log(`  ❌ Section "${section}" not found in correct order`);
      orderCorrect = false;
    } else {
      const sectionText = html.substring(currentIndex, currentIndex + 200);
      if (!sectionText.includes(section)) {
        console.log(`  ❌ Section "${section}" not found`);
        orderCorrect = false;
      } else {
        console.log(`  ✅ Section "${section}" found at position ${currentIndex}`);
      }
      lastIndex = currentIndex;
    }
  });
  
  if (orderCorrect) {
    console.log("  ✅ All sections in correct order");
  }
  
} catch (error) {
  console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
}

// Test 2: Verify Risk Interpretation validation
console.log("\nTest 2: Verify Risk Interpretation validation");
try {
  const invalidFinding: Finding[] = [{
    id: "TEST_INVALID",
    priority: "RECOMMENDED_0_3_MONTHS",
  }];
  
  const invalidProfile = getFindingProfile("TEST_INVALID");
  const invalidProfiles: Record<string, any> = {
    TEST_INVALID: invalidProfile,
  };
  
  const invalidResponses: Record<string, Response> = {
    TEST_INVALID: {
      risk_interpretation: "Short.", // Only 1 sentence, missing "if not addressed", missing "why not immediate"
    },
  };
  
  try {
    const result = await generateFindingPages(
      invalidFinding,
      invalidProfiles,
      invalidResponses,
      {},
      {}
    );
    
    if (result.errors.length > 0) {
      console.log("  ✅ Validation correctly caught errors:");
      result.errors.forEach(err => {
        console.log(`    - Finding ${err.findingId}: ${err.field} - ${err.message}`);
      });
    } else {
      console.log("  ❌ Validation should have caught errors but didn't");
    }
  } catch (error) {
    console.log("  ✅ Validation correctly threw error:", error instanceof Error ? error.message : String(error));
  }
} catch (error) {
  console.log(`  ❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
}

// Test 3: Verify Budget Range always renders
console.log("\nTest 3: Verify Budget Range always renders");
try {
  const findingWithoutBudget: Finding[] = [{
    id: "TEST_NO_BUDGET",
    priority: "PLAN_MONITOR",
  }];
  
  const profileWithoutBudget = getFindingProfile("TEST_NO_BUDGET");
  // Remove budget_range to test fallback
  const profile = { ...profileWithoutBudget, budget_range: "" };
  const profiles: Record<string, any> = {
    TEST_NO_BUDGET: profile,
  };
  
  const responses: Record<string, Response> = {
    TEST_NO_BUDGET: {},
  };
  
  const result = await generateFindingPages(
    findingWithoutBudget,
    profiles,
    responses,
    {},
    {}
  );
  
  if (result.html.includes("Budgetary Planning Range")) {
    console.log("  ✅ Budgetary Planning Range section found");
    
    // Check if it has a value (not empty)
    const budgetMatch = result.html.match(/Budgetary Planning Range[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    if (budgetMatch && budgetMatch[1].trim().length > 0) {
      console.log(`  ✅ Budget range has value: "${budgetMatch[1].trim().substring(0, 50)}..."`);
    } else {
      console.log("  ❌ Budget range is empty");
    }
  } else {
    console.log("  ❌ Budgetary Planning Range section not found");
  }
} catch (error) {
  console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
}

console.log("\n✅ All structure tests completed!");
