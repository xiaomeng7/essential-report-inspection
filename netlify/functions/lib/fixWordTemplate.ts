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
