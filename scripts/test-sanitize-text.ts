/**
 * Test script for sanitizeText function
 */

import { sanitizeText, sanitizeObject } from "../netlify/functions/lib/sanitizeText.js";

function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      // For arrays, sanitize each element
      sanitized[key] = value.map(item => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          return sanitizeObject(item);
        }
        return sanitizeText(item);
      });
    } else if (typeof value === "object" && value !== null) {
      // For nested objects, recursively sanitize
      sanitized[key] = sanitizeObject(value);
    } else {
      // For primitives, sanitize directly
      sanitized[key] = sanitizeText(value);
    }
  }
  
  return sanitized as T;
}

console.log("=== Testing sanitizeText ===\n");

// Test 1: null/undefined
console.log("Test 1: null/undefined");
console.log("  null ->", JSON.stringify(sanitizeText(null)));
console.log("  undefined ->", JSON.stringify(sanitizeText(undefined)));
console.log("");

// Test 2: number/boolean
console.log("Test 2: number/boolean");
console.log("  123 ->", sanitizeText(123));
console.log("  true ->", sanitizeText(true));
console.log("  false ->", sanitizeText(false));
console.log("");

// Test 3: Array
console.log("Test 3: Array");
console.log("  [1, 2, 3] ->", JSON.stringify(sanitizeText([1, 2, 3])));
console.log("  ['a', 'b', 'c'] ->", JSON.stringify(sanitizeText(['a', 'b', 'c'])));
console.log("  ['line1', 'line2'] ->", JSON.stringify(sanitizeText(['line1', 'line2'])));
console.log("");

// Test 4: NBSP replacement
console.log("Test 4: NBSP replacement");
const nbspText = "Hello\u00A0World";
console.log("  Input:", JSON.stringify(nbspText));
console.log("  Output:", JSON.stringify(sanitizeText(nbspText)));
console.log("");

// Test 5: Line ending normalization
console.log("Test 5: Line ending normalization");
const crlfText = "Line1\r\nLine2\rLine3\nLine4";
console.log("  Input:", JSON.stringify(crlfText));
console.log("  Output:", JSON.stringify(sanitizeText(crlfText)));
console.log("");

// Test 6: Control characters removal
console.log("Test 6: Control characters removal");
const controlText = "Hello\x00World\x01Test\nKeep\n\tTab";
console.log("  Input:", JSON.stringify(controlText));
console.log("  Output:", JSON.stringify(sanitizeText(controlText)));
console.log("  Has \\n:", sanitizeText(controlText).includes("\n") ? "✅ Yes" : "❌ No");
console.log("  Has \\t:", sanitizeText(controlText).includes("\t") ? "✅ Yes" : "❌ No");
console.log("");

// Test 7: Object sanitization
console.log("Test 7: Object sanitization");
const testObj = {
  name: "Test\u00A0Name",
  age: 25,
  active: true,
  tags: ["tag1", "tag2"],
  description: "Line1\r\nLine2",
  nested: {
    value: "Nested\u00A0Value",
    count: 10,
  },
};
const sanitizedObj = sanitizeObject(testObj);
console.log("  Original:", JSON.stringify(testObj, null, 2));
console.log("  Sanitized:", JSON.stringify(sanitizedObj, null, 2));
console.log("");

// Test 8: Array of objects
console.log("Test 8: Array of objects");
const arrayOfObjects = [
  { name: "Item1\u00A0", value: 1 },
  { name: "Item2", value: 2 },
];
const sanitizedArray = sanitizeObject({ items: arrayOfObjects });
console.log("  Original:", JSON.stringify(arrayOfObjects, null, 2));
console.log("  Sanitized:", JSON.stringify(sanitizedArray, null, 2));
console.log("");

// Test 9: Emoji risk markers replacement
console.log("Test 9: Emoji risk markers replacement");
const emojiText = "Risk Level: 🟢 Low Risk 🟡 Moderate Risk 🔴 High Risk";
console.log("  Input:", emojiText);
const emojiResult = sanitizeText(emojiText);
console.log("  Output:", emojiResult);
console.log("  Has [LOW]:", emojiResult.includes("[LOW]") ? "✅ Yes" : "❌ No");
console.log("  Has [MODERATE]:", emojiResult.includes("[MODERATE]") ? "✅ Yes" : "❌ No");
console.log("  Has [ELEVATED]:", emojiResult.includes("[ELEVATED]") ? "✅ Yes" : "❌ No");
console.log("  No emoji:", !emojiResult.includes("🟢") && !emojiResult.includes("🟡") && !emojiResult.includes("🔴") ? "✅ Yes" : "❌ No");
console.log("");

// Test 10: Replace '⸻' with '---'
console.log("Test 10: Replace '⸻' with '---'");
const separatorText = "Section 1⸻Section 2⸻Section 3";
console.log("  Input:", separatorText);
const separatorResult = sanitizeText(separatorText);
console.log("  Output:", separatorResult);
console.log("  Has '---':", separatorResult.includes("---") ? "✅ Yes" : "❌ No");
console.log("  No '⸻':", !separatorResult.includes("⸻") ? "✅ Yes" : "❌ No");
console.log("");

// Test 11: Smart quotes normalization
console.log("Test 11: Smart quotes normalization");
// Use actual smart quote Unicode characters (U+2018, U+2019, U+201C, U+201D)
const smartQuotesText = "He said \u2018Hello\u2019 and \u201CGoodbye\u201D. Also \u2018test\u2019 and \u201Ctest\u201D.";
console.log("  Input:", JSON.stringify(smartQuotesText));
const quotesResult = sanitizeText(smartQuotesText);
console.log("  Output:", JSON.stringify(quotesResult));
console.log("  Has normal single quotes:", quotesResult.includes("'") && !quotesResult.includes("\u2018") && !quotesResult.includes("\u2019") ? "✅ Yes" : "❌ No");
console.log("  Has normal double quotes:", quotesResult.includes('"') && !quotesResult.includes("\u201C") && !quotesResult.includes("\u201D") ? "✅ Yes" : "❌ No");
console.log("  No smart quotes:", !quotesResult.includes("\u2018") && !quotesResult.includes("\u2019") && !quotesResult.includes("\u201C") && !quotesResult.includes("\u201D") ? "✅ Yes" : "❌ No");
console.log("");

// Test 12: Preserve line breaks
console.log("Test 12: Preserve line breaks");
const lineBreakText = "Line 1\nLine 2\nLine 3";
console.log("  Input:", JSON.stringify(lineBreakText));
const lineBreakResult = sanitizeText(lineBreakText);
console.log("  Output:", JSON.stringify(lineBreakResult));
console.log("  Has \\n:", lineBreakResult.includes("\n") ? "✅ Yes" : "❌ No");
console.log("  Line count:", lineBreakResult.split("\n").length);
console.log("");

// Test 13: Combined test (emoji + smart quotes + control chars)
console.log("Test 13: Combined test");
// Use actual smart quote Unicode character (U+2018)
const combinedText = "Risk: 🟡 Moderate\nQuote: \u2018Smart quote\u2019\nControl: Hello\x00World⸻Separator";
console.log("  Input:", JSON.stringify(combinedText));
const combinedResult = sanitizeText(combinedText);
console.log("  Output:", JSON.stringify(combinedResult));
console.log("  Has [MODERATE]:", combinedResult.includes("[MODERATE]") ? "✅ Yes" : "❌ No");
console.log("  Has normal quote:", combinedResult.includes("'") && !combinedResult.includes("\u2018") && !combinedResult.includes("\u2019") ? "✅ Yes" : "❌ No");
console.log("  Has '---':", combinedResult.includes("---") ? "✅ Yes" : "❌ No");
console.log("  No control chars:", !combinedResult.includes("\x00") ? "✅ Yes" : "❌ No");
console.log("  Preserves \\n:", combinedResult.includes("\n") ? "✅ Yes" : "❌ No");
console.log("");

// Test 14: HTML content sanitization
console.log("Test 14: HTML content sanitization");
// Use actual smart quote Unicode character (U+2018)
const htmlContent = "<p>Risk Level: 🟢 Low</p><p>Quote: \u2018test\u2019</p><p>Separator⸻</p>";
console.log("  Input:", JSON.stringify(htmlContent));
const htmlResult = sanitizeText(htmlContent);
console.log("  Output:", JSON.stringify(htmlResult));
console.log("  Has [LOW]:", htmlResult.includes("[LOW]") ? "✅ Yes" : "❌ No");
console.log("  Has normal quote:", htmlResult.includes("'") && !htmlResult.includes("\u2018") && !htmlResult.includes("\u2019") ? "✅ Yes" : "❌ No");
console.log("  Has '---':", htmlResult.includes("---") ? "✅ Yes" : "❌ No");
console.log("");

console.log("✅ All sanitizeText tests completed!");
