import PizZip from "pizzip";
import fs from "fs";

/**
 * Fix split placeholders in Word template XML
 * Word sometimes splits placeholders across XML nodes when formatting is applied
 * This function merges them back into continuous placeholders
 */
export function fixWordTemplate(buffer: Buffer): Buffer {
  try {
    const zip = new PizZip(buffer);
    
    // Read document.xml
    const documentXml = zip.files["word/document.xml"];
    if (!documentXml) {
      console.warn("⚠️ word/document.xml not found in template, skipping fix");
      return buffer;
    }
    
    let xmlContent = documentXml.asText();
    const originalLength = xmlContent.length;
    console.log("Original XML length:", originalLength);
    
    // List of placeholders that are known to be split
    // Format: { splitPattern: fullPlaceholder }
    const placeholderFixes: Record<string, string> = {
      // Core findings placeholders
      "{{IMME</w:t></w:r><w:r><w:t>INGS}}": "{{IMMEDIATE_FINDINGS}}",
      "{{RECO</w:t></w:r><w:r><w:t>INGS}}": "{{RECOMMENDED_FINDINGS}}",
      "{{PLAN</w:t></w:r><w:r><w:t>INGS}}": "{{PLAN_FINDINGS}}",
      "{{URGE</w:t></w:r><w:r><w:t>INGS}}": "{{URGENT_FINDINGS}}",
      
      // Basic info placeholders
      "{{PROP</w:t></w:r><w:r><w:t>TYPE}}": "{{PROPERTY_TYPE}}",
      "{{ASSE</w:t></w:r><w:r><w:t>DATE}}": "{{ASSESSMENT_DATE}}",
      "{{ASSE</w:t></w:r><w:r><w:t>POSE}}": "{{ASSESSMENT_PURPOSE}}",
      "{{PREP</w:t></w:r><w:r><w:t>_FOR}}": "{{PREPARED_FOR}}",
      "{{PREP</w:t></w:r><w:r><w:t>D_BY}}": "{{PREPARED_BY}}",
      
      // Report content placeholders
      "{{EXEC</w:t></w:r><w:r><w:t>RAPH}}": "{{EXECUTIVE_SUMMARY}}",
      "{{OVER</w:t></w:r><w:r><w:t>ADGE}}": "{{OVERALL_STATUS}}",
      "{{RISK</w:t></w:r><w:r><w:t>ADGE}}": "{{RISK_RATING}}",
      "{{RISK</w:t></w:r><w:r><w:t>TORS}}": "{{RISK_RATING_FACTORS}}",
      "{{RISK</w:t></w:r><w:r><w:t>FACTORS}}": "{{RISK_FACTORS}}",
      "{{LIMI</w:t></w:r><w:r><w:t>TION}}": "{{LIMITATIONS}}",
      "{{LIMI</w:t></w:r><w:r><w:t>TIONS}}": "{{LIMITATIONS}}",
      "{{TEST</w:t></w:r><w:r><w:t>MARY}}": "{{TEST_SUMMARY}}",
      "{{TECH</w:t></w:r><w:r><w:t>OTES}}": "{{TECHNICAL_NOTES}}",
      "{{GENE</w:t></w:r><w:r><w:t>OTES}}": "{{GENERAL_NOTES}}",
      "{{CAPI</w:t></w:r><w:r><w:t>ABLE}}": "{{CAPITAL_PLANNING}}",
      "{{NEXT</w:t></w:r><w:r><w:t>TEPS}}": "{{NEXT_STEPS}}",
      
      // Also handle cases where the split might be in different positions
      // Pattern: {{PART1</w:t></w:r><w:r><w:t>PART2}}
      // We'll use a more general regex approach for these
    };
    
    // Apply specific fixes
    let fixCount = 0;
    for (const [splitPattern, fullPlaceholder] of Object.entries(placeholderFixes)) {
      const regex = new RegExp(splitPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = xmlContent.match(regex);
      if (matches) {
        xmlContent = xmlContent.replace(regex, fullPlaceholder);
        fixCount += matches.length;
        console.log(`✅ Fixed ${matches.length} occurrence(s) of ${fullPlaceholder}`);
      }
    }
    
    // General pattern: {{TEXT1</w:t></w:r><w:r><w:t>TEXT2}}
    // This catches any remaining split placeholders
    // Note: The pattern might have optional whitespace or other XML elements between the parts
    const generalPattern = /\{\{([A-Z_]+)<\/w:t><\/w:r>(?:<w:r[^>]*>)?<w:t>([A-Z_]+)\}\}/g;
    const generalMatches = xmlContent.match(generalPattern);
    if (generalMatches) {
      console.log(`⚠️ Found ${generalMatches.length} additional split placeholders with general pattern:`);
      generalMatches.forEach((match, index) => {
        const part1Match = match.match(/\{\{([A-Z_]+)</);
        const part2Match = match.match(/>([A-Z_]+)\}\}/);
        if (part1Match && part2Match) {
          const part1 = part1Match[1];
          const part2 = part2Match[1];
          // Try to reconstruct the full placeholder name
          const possibleNames = [
            `${part1}${part2}`,
            `${part1}_${part2}`,
            `${part1}ERTY_${part2}`,
            `${part1}MENT_${part2}`,
            // Add more patterns as needed
          ];
          console.log(`  ${index + 1}. ${match} -> Try: ${possibleNames.join(', ')}`);
        }
      });
      
      // Replace with reconstructed names (you may need to adjust this based on actual patterns)
      xmlContent = xmlContent.replace(generalPattern, (match) => {
        const part1Match = match.match(/\{\{([A-Z_]+)</);
        const part2Match = match.match(/>([A-Z_]+)\}\}/);
        if (part1Match && part2Match) {
          const part1 = part1Match[1];
          const part2 = part2Match[1];
          // Common reconstruction patterns
          // Common reconstruction patterns based on error logs
          if (part1 === "PROP" && part2 === "TYPE") return "{{PROPERTY_TYPE}}";
          if (part1 === "ASSE" && part2 === "DATE") return "{{ASSESSMENT_DATE}}";
          if (part1 === "ASSE" && part2 === "POSE") return "{{ASSESSMENT_PURPOSE}}";
          if (part1 === "PREP" && part2 === "_FOR") return "{{PREPARED_FOR}}";
          if (part1 === "PREP" && part2 === "D_BY") return "{{PREPARED_BY}}";
          if (part1 === "IMME" && part2 === "INGS") return "{{IMMEDIATE_FINDINGS}}";
          if (part1 === "RECO" && part2 === "INGS") return "{{RECOMMENDED_FINDINGS}}";
          if (part1 === "PLAN" && part2 === "INGS") return "{{PLAN_FINDINGS}}";
          if (part1 === "URGE" && part2 === "INGS") return "{{URGENT_FINDINGS}}";
          if (part1 === "EXEC" && part2 === "RAPH") return "{{EXECUTIVE_SUMMARY}}";
          if (part1 === "OVER" && part2 === "ADGE") return "{{OVERALL_STATUS}}";
          if (part1 === "RISK" && part2 === "ADGE") return "{{RISK_RATING}}";
          if (part1 === "RISK" && part2 === "TORS") return "{{RISK_RATING_FACTORS}}";
          if (part1 === "LIMI" && (part2 === "TION" || part2 === "TIONS")) return "{{LIMITATIONS}}";
          if (part1 === "TEST" && part2 === "MARY") return "{{TEST_SUMMARY}}";
          if (part1 === "TECH" && part2 === "OTES") return "{{TECHNICAL_NOTES}}";
          if (part1 === "GENE" && part2 === "OTES") return "{{GENERAL_NOTES}}";
          if (part1 === "CAPI" && part2 === "ABLE") return "{{CAPITAL_PLANNING}}";
          if (part1 === "NEXT" && part2 === "TEPS") return "{{NEXT_STEPS}}";
          
          // Log unknown patterns for debugging
          console.warn(`⚠️ Unknown split pattern: ${part1} + ${part2}, keeping as-is`);
          // Fallback: try to combine parts (may not be correct, but better than split)
          return `{{${part1}${part2}}}`;
        }
        return match;
      });
      fixCount += generalMatches.length;
    }
    
    if (fixCount > 0) {
      console.log(`✅ Fixed ${fixCount} split placeholder(s) in total`);
      
      // Update the zip file
      zip.file("word/document.xml", xmlContent);
      
      // Generate new buffer
      const fixedBuffer = zip.generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      
      console.log(`✅ Template fixed: ${originalLength} -> ${fixedBuffer.length} bytes`);
      return fixedBuffer;
    } else {
      console.log("ℹ️ No split placeholders found, template is clean");
      return buffer;
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("❌ Error fixing Word template:", errorMsg);
    // Return original buffer if fix fails
    return buffer;
  }
}
