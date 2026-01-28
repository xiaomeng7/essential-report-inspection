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
  
  console.log(`🔍 Analyzing ${fileName} (${originalLength} bytes)...`);
  
  // More flexible pattern: handles various XML structures between split parts
  // Pattern matches: {{TEXT1</w:t></w:r>...<w:r>...<w:t>TEXT2}}
  // The ... can be any XML content (attributes, other elements, etc.)
  // We use a non-greedy match to find the shortest match between the parts
  // This handles cases like:
  // - {{PROP</w:t></w:r><w:r><w:t>TYPE}}
  // - {{PROP</w:t></w:r><w:r><w:rPr>...</w:rPr><w:t>TYPE}}
  // - {{PROP</w:t></w:r><w:r w:rsidR="..."><w:t>TYPE}}
  // Try multiple patterns to catch different XML structures
  const patterns = [
    // Pattern 1: Simple case with no attributes
    /\{\{([A-Z_]+)<\/w:t><\/w:r><w:r><w:t>([A-Z_]+)\}\}/g,
    // Pattern 2: With attributes on w:r
    /\{\{([A-Z_]+)<\/w:t><\/w:r><w:r[^>]*><w:t>([A-Z_]+)\}\}/g,
    // Pattern 3: With attributes on w:t
    /\{\{([A-Z_]+)<\/w:t><\/w:r><w:r[^>]*><w:t[^>]*>([A-Z_]+)\}\}/g,
    // Pattern 4: With w:rPr or other elements between
    /\{\{([A-Z_]+)<\/w:t><\/w:r>[\s\S]*?<w:r[^>]*>[\s\S]*?<w:t[^>]*>([A-Z_]+)\}\}/g,
  ];
  
  let allMatches: Array<{ match: string; part1: string; part2: string; patternIndex: number }> = [];
  
  patterns.forEach((pattern, patternIndex) => {
    pattern.lastIndex = 0; // Reset regex
    let match;
    while ((match = pattern.exec(xmlContent)) !== null) {
      // Check if this match overlaps with an existing match (prefer shorter matches)
      const existingMatch = allMatches.find(m => 
        m.match.includes(match![1]) && m.match.includes(match![2])
      );
      if (!existingMatch || match[0].length < existingMatch.match.length) {
        if (existingMatch) {
          // Remove the longer match
          allMatches = allMatches.filter(m => m !== existingMatch);
        }
        allMatches.push({
          match: match[0],
          part1: match[1],
          part2: match[2],
          patternIndex
        });
      }
    }
  });
  
  const matches = allMatches;
  
  if (matches.length > 0) {
    console.log(`📋 Found ${matches.length} split placeholder(s) in ${fileName}:`);
    matches.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.part1}...${m.part2} (sample: ${m.match.substring(0, 100)}...)`);
    });
  } else {
    // Try to find any placeholders that might be split differently
    const testPattern = /\{\{[A-Z_]+<\/w:t><\/w:r>/g;
    const testMatches = xmlContent.match(testPattern);
    if (testMatches && testMatches.length > 0) {
      console.log(`⚠️ Found ${testMatches.length} potential split placeholder(s) (open tag pattern) in ${fileName}, but regex didn't match full pattern`);
      console.log(`   Sample: ${testMatches[0]}`);
    }
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
  
  // Replace all split placeholders (process in reverse order to avoid index shifting)
  // Sort matches by position (descending) to replace from end to start
  const sortedMatches = [...matches].sort((a, b) => {
    const aIndex = xmlContent.indexOf(a.match);
    const bIndex = xmlContent.indexOf(b.match);
    return bIndex - aIndex; // Reverse order
  });
  
  sortedMatches.forEach((m) => {
    const key = `${m.part1}|${m.part2}`;
    const fullName = placeholderMap[key];
    
    if (fullName) {
      // Escape the match string for regex replacement
      const escapedMatch = m.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      xmlContent = xmlContent.replace(escapedMatch, `{{${fullName}}}`);
      fixCount++;
      console.log(`  ✅ Fixed: ${m.part1}...${m.part2} -> {{${fullName}}}`);
    } else {
      console.warn(`  ⚠️ Unknown pattern: ${m.part1}...${m.part2}, trying to combine`);
      // Fallback: try to combine (may not be correct)
      const escapedMatch = m.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      xmlContent = xmlContent.replace(escapedMatch, `{{${m.part1}${m.part2}}}`);
      fixCount++;
    }
  });
  
  if (fixCount > 0) {
    console.log(`✅ Fixed ${fixCount} split placeholder(s) in ${fileName}`);
  }
  
  return { fixed: xmlContent, count: fixCount };
}

export function fixWordTemplate(buffer: Buffer): Buffer {
  console.log("🔧 fixWordTemplate() called, buffer size:", buffer.length, "bytes");
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
