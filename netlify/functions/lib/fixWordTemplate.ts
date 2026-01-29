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
  
  // Strategy 1: Find placeholders that start with {{ but are split across <w:t> tags
  // Pattern: {{TEXT</w:t>...<w:t>MORE_TEXT}}
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
  
  // Strategy 2: Find placeholders that start with {{ in one <w:t> tag and end with }} in another
  // This handles cases where the entire opening {{ is in one tag and closing }} is in another
  // Pattern: <w:t>{{TEXT</w:t>...<w:t>MORE_TEXT}}</w:t>
  const strategy2Pattern = /<w:t[^>]*>\{\{([^<}]*?)<\/w:t>/g;
  let strategy2Match;
  
  while ((strategy2Match = strategy2Pattern.exec(xmlContent)) !== null) {
    const startIndex = strategy2Match.index;
    const firstPart = strategy2Match[1];
    
    // Skip if this is already a complete placeholder
    if (firstPart.includes('}}')) {
      continue;
    }
    
    // Search forward to find the closing }}
    const searchStart = strategy2Match.index + strategy2Match[0].length;
    const searchEnd = Math.min(xmlContent.length, searchStart + 2000);
    const searchArea = xmlContent.substring(searchStart, searchEnd);
    
    // Look for }} in subsequent <w:t> tags
    const textParts = [firstPart];
    const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let foundClosing = false;
    let endOffset = 0;
    
    textPattern.lastIndex = 0;
    const searchAreaMatches = searchArea.matchAll(textPattern);
    
    for (const match of searchAreaMatches) {
      const text = match[1];
      if (text.includes('}}')) {
        const closingIndex = text.indexOf('}}');
        textParts.push(text.substring(0, closingIndex));
        foundClosing = true;
        // Calculate the end position relative to searchStart
        endOffset = match.index! + match[0].indexOf('}}') + 2;
        break;
      } else {
        textParts.push(text);
      }
    }
    
    if (foundClosing && textParts.length > 1) {
      const combinedName = textParts.join('');
      
      if (/^[A-Z0-9_]{2,}$/.test(combinedName)) {
        const endIndex = searchStart + endOffset;
        const fullMatch = xmlContent.substring(startIndex, endIndex);
        
        // Check if this is already in our list (avoid duplicates)
        const isDuplicate = splitPlaceholders.some(sp => 
          sp.startIndex === startIndex && sp.endIndex === endIndex
        );
        
        if (!isDuplicate) {
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
  }
  
  // Strategy 3: Find incomplete opening tags {{TEXT that don't have closing }}
  // and incomplete closing tags TEXT}} that don't have opening {{
  // This handles cases where {{ and }} are in separate <w:t> tags
  // Pattern: <w:t>{{PROP</w:t>...<w:t>TYPE}}</w:t>
  const incompleteOpenPattern = /<w:t[^>]*>\{\{([A-Z0-9_]+)<\/w:t>/g;
  const incompleteClosePattern = /<w:t[^>]*>([A-Z0-9_]+)\}\}<\/w:t>/g;
  
  const openFragments: Array<{ index: number; text: string; matchEnd: number }> = [];
  const closeFragments: Array<{ index: number; text: string; matchEnd: number }> = [];
  
  let match;
  while ((match = incompleteOpenPattern.exec(xmlContent)) !== null) {
    openFragments.push({
      index: match.index,
      text: match[1],
      matchEnd: match.index + match[0].length
    });
  }
  
  while ((match = incompleteClosePattern.exec(xmlContent)) !== null) {
    closeFragments.push({
      index: match.index,
      text: match[1],
      matchEnd: match.index + match[0].length
    });
  }
  
  // Try to match open and close fragments that are close to each other
  // and form a valid placeholder name when combined
  openFragments.forEach(openFrag => {
    closeFragments.forEach(closeFrag => {
      // Check if they're within reasonable distance (e.g., 2000 chars)
      const distance = closeFrag.index - openFrag.matchEnd;
      if (distance > 0 && distance < 2000) {
        // Extract the content between the fragments
        const between = xmlContent.substring(openFrag.matchEnd, closeFrag.index);
        
        // Check if between contains only XML tags (no other text content)
        // This ensures we're matching fragments that are part of the same placeholder
        const betweenText = between.replace(/<[^>]+>/g, '').trim();
        if (betweenText.length > 0 && !betweenText.match(/^[A-Z0-9_]*$/)) {
          // If there's non-placeholder text between, skip this match
          return;
        }
        
        // Extract all text parts between the fragments
        const textParts = [openFrag.text];
        const betweenTextPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let betweenMatch;
        while ((betweenMatch = betweenTextPattern.exec(between)) !== null) {
          const text = betweenMatch[1].trim();
          if (text && text.match(/^[A-Z0-9_]*$/)) {
            textParts.push(text);
          }
        }
        textParts.push(closeFrag.text);
        
        const combinedName = textParts.join('');
        
        // Validate: must be a valid placeholder name
        if (/^[A-Z0-9_]{2,}$/.test(combinedName)) {
          const startIndex = openFrag.index;
          const endIndex = closeFrag.matchEnd;
          
          // Check if this is already in our list (avoid duplicates)
          const isDuplicate = splitPlaceholders.some(sp => 
            Math.abs(sp.startIndex - startIndex) < 50 && 
            Math.abs(sp.endIndex - endIndex) < 50
          );
          
          if (!isDuplicate) {
            splitPlaceholders.push({
              startIndex,
              endIndex,
              fullMatch: xmlContent.substring(startIndex, endIndex),
              textParts,
              combinedName
            });
          }
        }
      }
    });
  });
  
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
      const errId = err.id;
      const errContext = err.context;
      
      if (errId === "duplicate_open_tag" && errContext) {
        // Context might be "{{PROP" or "PROP", handle both cases
        let fragment = errContext;
        if (fragment.startsWith("{{")) {
          fragment = fragment.substring(2);
        }
        if (fragment) {
          openTags.add(fragment);
          console.log(`   Extracted open tag fragment: "${fragment}" from context "${errContext}"`);
        }
      } else if (errId === "duplicate_close_tag" && errContext) {
        // Context might be "TYPE}}" or "TYPE", handle both cases
        let fragment = errContext;
        if (fragment.endsWith("}}")) {
          fragment = fragment.substring(0, fragment.length - 2);
        }
        if (fragment) {
          closeTags.add(fragment);
          console.log(`   Extracted close tag fragment: "${fragment}" from context "${errContext}"`);
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
      "CAPI|ABLE": "CAPABLE",
      "NEXT|TEPS": "NEXT_STEPS",
      "GENE|OTES": "GENERAL_NOTES",
    };
    
    // Apply fixes using a more robust approach
    // Build matched pairs first
    const matchedPairs: Array<{ openPart: string; closePart: string; fullName: string }> = [];
    
    openTags.forEach((openPart) => {
      closeTags.forEach((closePart) => {
        const key = `${openPart}|${closePart}`;
        let fullName = knownMappings[key];
        
        if (!fullName) {
          const combined = `${openPart}${closePart}`;
          if (/^[A-Z0-9_]{2,}$/.test(combined)) {
            fullName = combined;
          } else {
            const combinedWithUnderscore = `${openPart}_${closePart}`;
            if (/^[A-Z0-9_]{2,}$/.test(combinedWithUnderscore)) {
              fullName = combinedWithUnderscore;
            }
          }
        }
        
        if (fullName) {
          matchedPairs.push({ openPart, closePart, fullName });
          console.log(`   ✅ Will fix: ${openPart}...${closePart} -> {{${fullName}}}`);
        }
      });
    });
    
    // Collect all matches first, then replace from end to start to avoid index shifting
    const matchesToFix: Array<{ start: number; end: number; replacement: string; description: string }> = [];
    
    matchedPairs.forEach(({ openPart, closePart, fullName }) => {
      const escapedOpen = openPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedClose = closePart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Try multiple patterns to catch different XML structures
      const patterns = [
        // Pattern 1: {{OPEN</w:t>...<w:t>CLOSE}}
        {
          regex: new RegExp(`\\{\\{${escapedOpen}</w:t>([\\s\\S]{0,2000})<w:t[^>]*>${escapedClose}\\}\\}`, 'g'),
          replacement: `{{${fullName}}}`,
          desc: `{{${openPart}}...${closePart}}`
        },
        // Pattern 2: <w:t>{{OPEN</w:t>...<w:t>CLOSE}}</w:t>
        {
          regex: new RegExp(`<w:t[^>]*>\\{\\{${escapedOpen}</w:t>([\\s\\S]{0,2000})<w:t[^>]*>${escapedClose}\\}\\}</w:t>`, 'g'),
          replacement: `<w:t>{{${fullName}}}</w:t>`,
          desc: `<w:t>{{${openPart}}...${closePart}}</w:t>`
        },
        // Pattern 3: OPEN</w:t>...<w:t>CLOSE}} (missing opening {{)
        {
          regex: new RegExp(`${escapedOpen}</w:t>([\\s\\S]{0,2000})<w:t[^>]*>${escapedClose}\\}\\}`, 'g'),
          replacement: `{{${fullName}}}`,
          desc: `${openPart}...${closePart}}`
        },
        // Pattern 4: {{OPEN</w:t>...<w:t>CLOSE (missing closing }})
        {
          regex: new RegExp(`\\{\\{${escapedOpen}</w:t>([\\s\\S]{0,2000})<w:t[^>]*>${escapedClose}`, 'g'),
          replacement: `{{${fullName}}}`,
          desc: `{{${openPart}}...${closePart}`
        },
      ];
      
      patterns.forEach(({ regex, replacement, desc }) => {
        let match;
        // Reset regex lastIndex
        regex.lastIndex = 0;
        while ((match = regex.exec(xmlContent)) !== null) {
          matchesToFix.push({
            start: match.index,
            end: match.index + match[0].length,
            replacement,
            description: `${openPart}...${closePart} -> ${fullName} (${desc})`
          });
        }
      });
    });
    
    // Sort by start index descending to replace from end to start
    matchesToFix.sort((a, b) => b.start - a.start);
    
    // Remove duplicates (same start position)
    const uniqueMatches: typeof matchesToFix = [];
    const seenStarts = new Set<number>();
    matchesToFix.forEach(match => {
      if (!seenStarts.has(match.start)) {
        seenStarts.add(match.start);
        uniqueMatches.push(match);
      }
    });
    
    // Apply fixes from end to start
    uniqueMatches.forEach(match => {
      xmlContent = xmlContent.substring(0, match.start) + 
                  match.replacement + 
                  xmlContent.substring(match.end);
      fixCount++;
      console.log(`   ✅ Fixed: ${match.description}`);
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
      // Add debug logging
      if (matchedPairs.length > 0) {
        console.log(`   Debug: Found ${matchedPairs.length} potential fix(es), but none matched XML structure`);
        // Log sample XML around first error location
        const sampleStart = Math.max(0, 130);
        const sampleEnd = Math.min(xmlContent.length, 170);
        console.log(`   Sample XML (chars ${sampleStart}-${sampleEnd}):`, JSON.stringify(xmlContent.substring(sampleStart, sampleEnd)));
        // Also try to find the actual structure
        const propIndex = xmlContent.indexOf('PROP');
        if (propIndex >= 0) {
          const contextStart = Math.max(0, propIndex - 20);
          const contextEnd = Math.min(xmlContent.length, propIndex + 50);
          console.log(`   Context around 'PROP' (index ${propIndex}):`, JSON.stringify(xmlContent.substring(contextStart, contextEnd)));
        }
      }
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
