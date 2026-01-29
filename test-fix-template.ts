import fs from "fs";
import PizZip from "pizzip";
import { fixWordTemplate, hasSplitPlaceholders } from "./scripts/fix-placeholders.js";

// Test script to verify template fix logic
const templatePath = "./report-template-with-placeholders.docx";

if (!fs.existsSync(templatePath)) {
  console.error(`Template not found: ${templatePath}`);
  process.exit(1);
}

console.log("Loading template...");
const originalBuffer = fs.readFileSync(templatePath);
console.log(`Original size: ${originalBuffer.length} bytes`);

// Extract XML to inspect
const zip = new PizZip(originalBuffer);
const documentXml = zip.files["word/document.xml"];
if (documentXml) {
  const xmlContent = documentXml.asText();
  console.log(`\nXML content length: ${xmlContent.length} bytes`);
  
  // Look for split patterns
  const splitPatterns = [
    /\{\{([A-Z_]+)<\/w:t><\/w:r><w:r><w:t>([A-Z_]+)\}\}/g,
    /\{\{([A-Z_]+)<\/w:t><\/w:r><w:r[^>]*><w:t>([A-Z_]+)\}\}/g,
    /\{\{([A-Z_]+)<\/w:t><\/w:r><w:r[^>]*><w:t[^>]*>([A-Z_]+)\}\}/g,
    /\{\{([A-Z_]+)<\/w:t><\/w:r>[\s\S]*?<w:r[^>]*>[\s\S]*?<w:t[^>]*>([A-Z_]+)\}\}/g,
  ];
  
  console.log("\nSearching for split placeholders...");
  splitPatterns.forEach((pattern, i) => {
    pattern.lastIndex = 0;
    const matches = xmlContent.match(pattern);
    if (matches) {
      console.log(`Pattern ${i + 1} found ${matches.length} matches:`);
      matches.slice(0, 5).forEach((m, j) => {
        console.log(`  ${j + 1}. ${m.substring(0, 100)}...`);
      });
    }
  });
  
  // Look for partial matches
  const partialPattern = /\{\{[A-Z_]+<\/w:t><\/w:r>/g;
  const partialMatches = xmlContent.match(partialPattern);
  if (partialMatches) {
    console.log(`\nFound ${partialMatches.length} partial matches (open tag only):`);
    partialMatches.slice(0, 10).forEach((m, i) => {
      console.log(`  ${i + 1}. ${m}`);
    });
    
    // Try to find the corresponding close tags
    console.log("\nTrying to find corresponding close tags...");
    partialMatches.slice(0, 5).forEach((openTag, i) => {
      const part1 = openTag.match(/\{\{([A-Z_]+)</)?.[1];
      if (part1) {
        // Look for close tag after this open tag
        const openIndex = xmlContent.indexOf(openTag);
        const afterOpen = xmlContent.substring(openIndex + openTag.length);
        const closeMatch = afterOpen.match(/<w:r[^>]*><w:t[^>]*>([A-Z_]+)\}\}/);
        if (closeMatch) {
          console.log(`  ${i + 1}. ${part1}...${closeMatch[1]} (found close tag)`);
        } else {
          console.log(`  ${i + 1}. ${part1}... (no close tag found nearby)`);
        }
      }
    });
  }
  
  // Show a sample of the XML around a split placeholder
  const sampleIndex = xmlContent.indexOf("{{PROP");
  if (sampleIndex >= 0) {
    const sample = xmlContent.substring(Math.max(0, sampleIndex - 50), Math.min(xmlContent.length, sampleIndex + 200));
    console.log(`\nSample XML around {{PROP:`);
    console.log(sample);
  }
}

console.log("\n\nApplying fix...");
const fixedBuffer = fixWordTemplate(originalBuffer);
console.log(`Fixed size: ${fixedBuffer.length} bytes`);

// Save fixed template for inspection
const outputPath = "./report-template-fixed.docx";
fs.writeFileSync(outputPath, fixedBuffer);
console.log(`\nFixed template saved to: ${outputPath}`);

// Verify fix by checking again
const stillHasSplit = hasSplitPlaceholders(fixedBuffer);
if (stillHasSplit) {
  console.log(`\n⚠️ WARNING: Still found split placeholders after fix!`);
} else {
  console.log(`\n✅ No split placeholders found after fix!`);
}
