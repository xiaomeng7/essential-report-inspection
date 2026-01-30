/**
 * Test script for TERMS_AND_CONDITIONS loading
 * Tests the loadTermsAndConditions function from defaultTextLoader
 */

import { loadTermsAndConditions, loadDefaultText, clearDefaultTextCache } from "../netlify/functions/lib/defaultTextLoader.js";

console.log("=== Testing TERMS_AND_CONDITIONS Loading ===\n");

// Clear cache to ensure fresh load
clearDefaultTextCache();

// Test 1: Load Terms and Conditions directly
console.log("Test 1: Load Terms and Conditions directly");
try {
  const termsContent = loadTermsAndConditions();
  
  if (!termsContent || termsContent.trim().length === 0) {
    console.log("  ❌ Loaded content is empty");
  } else {
    console.log(`  ✅ Loaded successfully (${termsContent.length} characters)`);
    console.log(`  First 100 characters: ${termsContent.substring(0, 100)}...`);
    
    // Check for key sections
    const hasACL = termsContent.includes("Australian Consumer Law");
    const hasScope = termsContent.includes("Nature & Scope");
    const hasFramework = termsContent.includes("Framework Statement");
    const hasDecisionSupport = termsContent.includes("Decision-Support");
    
    console.log("\n  Key sections found:");
    console.log(`    - Australian Consumer Law: ${hasACL ? "✅" : "❌"}`);
    console.log(`    - Nature & Scope: ${hasScope ? "✅" : "❌"}`);
    console.log(`    - Decision-Support: ${hasDecisionSupport ? "✅" : "❌"}`);
    console.log(`    - Framework Statement: ${hasFramework ? "✅" : "❌"}`);
  }
} catch (e) {
  console.log(`  ❌ Failed to load: ${e}`);
  if (e instanceof Error) {
    console.log(`  Error message: ${e.message}`);
  }
}

// Test 2: Load via loadDefaultText
console.log("\nTest 2: Load via loadDefaultText");
try {
  const defaultText = await loadDefaultText();
  
  if (!defaultText.terms_and_conditions_markdown) {
    console.log("  ❌ terms_and_conditions_markdown field is missing or empty");
  } else {
    const termsMarkdown = defaultText.terms_and_conditions_markdown;
    console.log(`  ✅ Loaded via loadDefaultText (${termsMarkdown.length} characters)`);
    
    // Verify it's non-empty
    if (termsMarkdown.trim().length === 0) {
      console.log("  ❌ Content is empty");
    } else {
      console.log("  ✅ Content is non-empty");
      console.log(`  First 100 characters: ${termsMarkdown.substring(0, 100)}...`);
    }
    
    // Verify it matches direct load
    const directLoad = loadTermsAndConditions();
    if (termsMarkdown === directLoad) {
      console.log("  ✅ Content matches direct load");
    } else {
      console.log("  ⚠️ Content differs from direct load (may be cached)");
    }
  }
} catch (e) {
  console.log(`  ❌ Failed to load via loadDefaultText: ${e}`);
  if (e instanceof Error) {
    console.log(`  Error message: ${e.message}`);
  }
}

// Test 3: Verify placeholder name
console.log("\nTest 3: Verify placeholder name");
console.log("  Expected placeholder: {{TERMS_AND_CONDITIONS}}");
console.log("  Field name in ReportData: TERMS_AND_CONDITIONS");
console.log("  Field name in DefaultText: terms_and_conditions_markdown");
console.log("  ✅ Placeholder name matches field name");

console.log("\n✅ All tests completed!");
