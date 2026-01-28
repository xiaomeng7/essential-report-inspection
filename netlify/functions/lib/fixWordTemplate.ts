import PizZip from "pizzip";
import fs from "fs";

/**
 * Fix split placeholders in Word template XML
 * Word sometimes splits placeholders across XML nodes when formatting is applied
 * This function merges them back into continuous placeholders
 */
/**
 * Fix split placeholders in a single XML content string
 */
function fixXmlContent(xmlContent: string, fileName: string): { fixed: string; count: number } {
  const originalLength = xmlContent.length;
  let fixCount = 0;
  
  // More flexible pattern: handles various XML structures between split parts
  // Pattern matches: {{TEXT1</w:t></w:r>...<w:r>...<w:t>TEXT2}}
  // The ... can be any XML content (attributes, other elements, etc.)
  // We use a non-greedy match to find the shortest match between the parts
  // This handles cases like:
  // - {{PROP</w:t></w:r><w:r><w:t>TYPE}}
  // - {{PROP</w:t></w:r><w:r><w:rPr>...</w:rPr><w:t>TYPE}}
  // - {{PROP</w:t></w:r><w:r w:rsidR="..."><w:t>TYPE}}
  const splitPattern = /\{\{([A-Z_]+)<\/w:t><\/w:r>[\s\S]*?<w:r[^>]*>[\s\S]*?<w:t[^>]*>([A-Z_]+)\}\}/g;
  
  // First, find all matches to log them
  const matches: Array<{ match: string; part1: string; part2: string }> = [];
  let match;
  while ((match = splitPattern.exec(xmlContent)) !== null) {
    matches.push({
      match: match[0],
      part1: match[1],
      part2: match[2]
    });
  }
  
  if (matches.length > 0) {
    console.log(`📋 Found ${matches.length} split placeholder(s) in ${fileName}:`);
    matches.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.part1}...${m.part2}`);
    });
  }
  
  // Mapping of known split patterns to full placeholders
  const placeholderMap: Record<string, string> = {
    "PROP|TYPE": "PROPERTY_TYPE",
    "ASSE|DATE": "ASSESSMENT_DATE",
    "ASSE|POSE": "ASSESSMENT_PURPOSE",
    "PREP|_FOR": "PREPARED_FOR",
    "PREP|D_BY": "PREPARED_BY",
    "IMME|INGS": "IMMEDIATE_FINDINGS",
    "RECO|INGS": "RECOMMENDED_FINDINGS",
    "PLAN|INGS": "PLAN_FINDINGS",
    "URGE|INGS": "URGENT_FINDINGS",
    "EXEC|RAPH": "EXECUTIVE_SUMMARY",
    "OVER|ADGE": "OVERALL_STATUS",
    "RISK|ADGE": "RISK_RATING",
    "RISK|TORS": "RISK_RATING_FACTORS",
    "LIMI|TION": "LIMITATIONS",
    "LIMI|TIONS": "LIMITATIONS",
    "TEST|MARY": "TEST_SUMMARY",
    "TECH|OTES": "TECHNICAL_NOTES",
    "GENE|OTES": "GENERAL_NOTES",
    "CAPI|ABLE": "CAPITAL_PLANNING",
    "NEXT|TEPS": "NEXT_STEPS",
  };
  
  // Replace all split placeholders
  xmlContent = xmlContent.replace(splitPattern, (fullMatch, part1, part2) => {
    const key = `${part1}|${part2}`;
    const fullName = placeholderMap[key];
    
    if (fullName) {
      fixCount++;
      console.log(`  ✅ Fixed: ${part1}...${part2} -> {{${fullName}}}`);
      return `{{${fullName}}}`;
    } else {
      console.warn(`  ⚠️ Unknown pattern: ${part1}...${part2}, trying to combine`);
      // Fallback: try to combine (may not be correct)
      return `{{${part1}${part2}}}`;
    }
  });
  
  if (fixCount > 0) {
    console.log(`✅ Fixed ${fixCount} split placeholder(s) in ${fileName}`);
  }
  
  return { fixed: xmlContent, count: fixCount };
}

export function fixWordTemplate(buffer: Buffer): Buffer {
  try {
    const zip = new PizZip(buffer);
    let totalFixCount = 0;
    
    // Fix document.xml
    const documentXml = zip.files["word/document.xml"];
    if (documentXml) {
      const result = fixXmlContent(documentXml.asText(), "word/document.xml");
      zip.file("word/document.xml", result.fixed);
      totalFixCount += result.count;
    } else {
      console.warn("⚠️ word/document.xml not found in template");
    }
    
    // Fix all header XML files
    Object.keys(zip.files).forEach(fileName => {
      if (fileName.startsWith("word/header") && fileName.endsWith(".xml")) {
        const headerXml = zip.files[fileName];
        if (headerXml) {
          const result = fixXmlContent(headerXml.asText(), fileName);
          zip.file(fileName, result.fixed);
          totalFixCount += result.count;
        }
      }
    });
    
    // Fix all footer XML files
    Object.keys(zip.files).forEach(fileName => {
      if (fileName.startsWith("word/footer") && fileName.endsWith(".xml")) {
        const footerXml = zip.files[fileName];
        if (footerXml) {
          const result = fixXmlContent(footerXml.asText(), fileName);
          zip.file(fileName, result.fixed);
          totalFixCount += result.count;
        }
      }
    });
    
    if (totalFixCount > 0) {
      console.log(`✅ Fixed ${totalFixCount} split placeholder(s) in total across all XML files`);
      
      // Generate new buffer
      const fixedBuffer = zip.generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      
      console.log(`✅ Template fixed: ${buffer.length} -> ${fixedBuffer.length} bytes`);
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
