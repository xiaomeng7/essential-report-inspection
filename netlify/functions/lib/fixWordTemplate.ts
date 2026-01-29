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
  
  // Find all split placeholders: {{ followed by </w:t> (indicating a split)
  // A split placeholder starts with {{ and contains </w:t> before the closing }}
  const splitPlaceholders: Array<{
    startIndex: number;
    endIndex: number;
    fullMatch: string;
    textParts: string[];
    combinedName: string;
  }> = [];
  
  // Find all occurrences of {{ followed by </w:t> (indicating a split)
  // But exclude cases where the placeholder is already complete ({{TEXT}})
  const openPattern = /\{\{([^<]*?)<\/w:t>/g;
  let openMatch;
  
  while ((openMatch = openPattern.exec(xmlContent)) !== null) {
    const startIndex = openMatch.index;
    const firstPart = openMatch[1];
    
    // Skip if this is already a complete placeholder (ends with }})
    if (firstPart.includes('}}')) {
      continue;
    }
    
    // Search forward from this position to find the closing }}
    const searchStart = openMatch.index + openMatch[0].length;
    const searchEnd = Math.min(xmlContent.length, searchStart + 2000);
    const searchArea = xmlContent.substring(searchStart, searchEnd);
    
    // Extract all text parts from <w:t> tags until we find }}
    const textParts = [firstPart];
    const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let textMatch;
    let foundClosing = false;
    let endOffset = 0;
    
    // Reset regex lastIndex for the search area
    textPattern.lastIndex = 0;
    const searchAreaMatches = searchArea.matchAll(textPattern);
    
    for (const match of searchAreaMatches) {
      const text = match[1];
      textParts.push(text);
      
      // Check if this part contains the closing }}
      if (text.includes('}}')) {
        foundClosing = true;
        // Extract the part before }}
        const closingIndex = text.indexOf('}}');
        textParts[textParts.length - 1] = text.substring(0, closingIndex);
        endOffset = match.index! + match[0].indexOf('}}') + 2;
        break;
      }
    }
    
    if (foundClosing && textParts.length > 1) {
      // Combine all parts to get the full placeholder name
      const combinedName = textParts.join('');
      
      // Only process if it looks like a valid placeholder name (A-Z, _, numbers)
      // and has at least 2 characters
      if (/^[A-Z0-9_]{2,}$/.test(combinedName)) {
        const endIndex = searchStart + endOffset;
        const fullMatch = xmlContent.substring(startIndex, endIndex);
        
        splitPlaceholders.push({
          startIndex,
          endIndex,
          fullMatch,
          textParts,
          combinedName
        });
      }
    }
  }
  
  if (splitPlaceholders.length > 0) {
    console.log(`📋 Found ${splitPlaceholders.length} split placeholder(s) in ${fileName}:`);
    splitPlaceholders.forEach((sp, i) => {
      console.log(`  ${i + 1}. Parts: [${sp.textParts.map(p => `"${p}"`).join(', ')}] -> ${sp.combinedName}`);
    });
    
    // Replace in reverse order to avoid index shifting
    const sorted = [...splitPlaceholders].sort((a, b) => b.startIndex - a.startIndex);
    
    sorted.forEach((sp) => {
      xmlContent = xmlContent.substring(0, sp.startIndex) + 
                   `{{${sp.combinedName}}}` + 
                   xmlContent.substring(sp.endIndex);
      fixCount++;
      console.log(`  ✅ Fixed: ${sp.textParts.join('...')} -> {{${sp.combinedName}}}`);
    });
    
    console.log(`✅ Fixed ${fixCount} split placeholder(s) in ${fileName}`);
  } else {
    console.log(`   ✅ No split placeholder patterns found in ${fileName}`);
  }
  
  return { fixed: xmlContent, count: fixCount };
}

/**
 * Fix split placeholders based on docxtemplater error information
 * This function extracts placeholder fragments from error messages and fixes them
 */
export function fixWordTemplateFromErrors(buffer: Buffer, errors: Array<{ context?: string; id?: string }>): Buffer {
  console.log("🔧 fixWordTemplateFromErrors() called, buffer size:", buffer.length, "bytes");
  console.log(`   Processing ${errors.length} error(s)...`);
  
  try {
    const zip = new PizZip(buffer);
    const documentXml = zip.files["word/document.xml"];
    if (!documentXml) {
      console.warn("⚠️ word/document.xml not found in template");
      return buffer;
    }
    
    let xmlContent = documentXml.asText();
    let fixCount = 0;
    
    // Extract placeholder fragments from errors
    const openTags = new Set<string>();
    const closeTags = new Set<string>();
    
    errors.forEach((err) => {
      if (err.id === "duplicate_open_tag" && err.context) {
        // Remove {{ from context to get the fragment
        const fragment = err.context.replace(/^\{\{/, "");
        if (fragment) {
          openTags.add(fragment);
        }
      } else if (err.id === "duplicate_close_tag" && err.context) {
        // Remove }} from context to get the fragment
        const fragment = err.context.replace(/\}\}$/, "");
        if (fragment) {
          closeTags.add(fragment);
        }
      }
    });
    
    console.log(`   Found ${openTags.size} open tag fragment(s): ${Array.from(openTags).join(", ")}`);
    console.log(`   Found ${closeTags.size} close tag fragment(s): ${Array.from(closeTags).join(", ")}`);
    
    // Try to match open and close fragments to form complete placeholders
    // Common patterns: PROP + TYPE = PROPERTY_TYPE, ASSE + DATE = ASSESSMENT_DATE, etc.
    const knownMappings: Record<string, string> = {
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
    };
    
    // Find and fix split placeholders
    const fixes: Array<{ pattern: RegExp; replacement: string }> = [];
    
    openTags.forEach((openPart) => {
      closeTags.forEach((closePart) => {
        const key = `${openPart}|${closePart}`;
        const fullName = knownMappings[key];
        
        if (fullName) {
          // Create a pattern to find the split placeholder
          // Pattern: {{OPEN_PART</w:t>...<w:t>CLOSE_PART}}
          const pattern = new RegExp(
            `\\{\\{${openPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</w:t>[\\s\\S]{0,2000}<w:t[^>]*>${closePart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`,
            'g'
          );
          
          fixes.push({
            pattern,
            replacement: `{{${fullName}}}`
          });
          
          console.log(`   ✅ Will fix: ${openPart}...${closePart} -> {{${fullName}}}`);
        }
      });
    });
    
    // Apply fixes
    fixes.forEach(({ pattern, replacement }) => {
      const matches = xmlContent.match(pattern);
      if (matches) {
        xmlContent = xmlContent.replace(pattern, replacement);
        fixCount += matches.length;
        console.log(`   ✅ Fixed ${matches.length} occurrence(s) of split placeholder`);
      }
    });
    
    if (fixCount > 0) {
      zip.file("word/document.xml", xmlContent);
      
      const fixedBuffer = zip.generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      
      console.log(`✅ Fixed ${fixCount} split placeholder(s) based on error information`);
      console.log(`✅ Template fixed: ${buffer.length} -> ${fixedBuffer.length} bytes`);
      return fixedBuffer;
    } else {
      console.log("ℹ️ No fixes applied based on error information");
      return buffer;
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("❌ Error fixing Word template from errors:", errorMsg);
    return buffer;
  }
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
