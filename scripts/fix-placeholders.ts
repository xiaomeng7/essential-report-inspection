#!/usr/bin/env node
/**
 * 独立的占位符修复脚本
 * 用于修复 Word 模板中被分割的占位符
 * 
 * 使用方法：
 *   npx tsx scripts/fix-placeholders.ts <模板文件路径> [输出文件路径]
 *   如果不提供输出路径，会覆盖原文件
 */

import fs from "fs";
import path from "path";
import PizZip from "pizzip";

/**
 * 检查占位符是否被分割
 * 使用多种模式来检测被分割的占位符
 */
export function hasSplitPlaceholders(buffer: Buffer): boolean {
  try {
    const zip = new PizZip(buffer);
    const documentXml = zip.files["word/document.xml"];
    if (!documentXml) {
      return false;
    }
    
    const xmlContent = documentXml.asText();
    
    // 模式1: {{TEXT</w:t> 或 <w:t>{{TEXT</w:t>
    const pattern1 = /(?:<w:t[^>]*>)?\{\{[A-Z0-9_]+<\/w:t>/g;
    if (pattern1.test(xmlContent)) {
      return true;
    }
    
    // 模式2: TEXT}}</w:t> 或 <w:t>TEXT}}</w:t>
    const pattern2 = /[A-Z0-9_]+\}\}<\/w:t>/g;
    if (pattern2.test(xmlContent)) {
      // 检查前面是否有对应的开始标签
      const matches = xmlContent.match(pattern2);
      if (matches) {
        for (const match of matches) {
          const closePart = match.replace(/}}\<\/w:t>/, '');
          // 查找前面是否有对应的开始部分
          const beforeMatch = xmlContent.substring(0, xmlContent.indexOf(match));
          if (beforeMatch.match(new RegExp(`\\{\\{[A-Z0-9_]*${closePart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/w:t>`))) {
            return true;
          }
        }
      }
    }
    
    // 模式3: 查找不完整的开始标签和结束标签对
    const incompleteOpenPattern = /<w:t[^>]*>\{\{([A-Z0-9_]+)<\/w:t>/g;
    const incompleteClosePattern = /<w:t[^>]*>([A-Z0-9_]+)\}\}<\/w:t>/g;
    
    const openMatches = Array.from(xmlContent.matchAll(incompleteOpenPattern));
    const closeMatches = Array.from(xmlContent.matchAll(incompleteClosePattern));
    
    if (openMatches.length > 0 || closeMatches.length > 0) {
      return true;
    }
    
    return false;
  } catch (e) {
    console.error("检查占位符时出错:", e);
    return false;
  }
}

/**
 * 修复单个 XML 文件中的分割占位符
 */
function fixXmlContent(xmlContent: string, fileName: string): { fixed: string; count: number } {
  let fixCount = 0;
  
  const splitPlaceholders: Array<{
    startIndex: number;
    endIndex: number;
    fullMatch: string;
    textParts: string[];
    combinedName: string;
  }> = [];
  
  // 策略1: 查找 {{TEXT</w:t>...<w:t>MORE_TEXT}} 模式
  const openPattern = /\{\{([^<]*?)<\/w:t>/g;
  let openMatch;
  
  while ((openMatch = openPattern.exec(xmlContent)) !== null) {
    const startIndex = openMatch.index;
    const firstPart = openMatch[1];
    
    if (firstPart.includes('}}')) {
      continue;
    }
    
    const searchStart = openMatch.index + openMatch[0].length;
    const searchEnd = Math.min(xmlContent.length, searchStart + 2000);
    const searchArea = xmlContent.substring(searchStart, searchEnd);
    
    const textParts = [firstPart];
    const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let foundClosing = false;
    let endOffset = 0;
    
    textPattern.lastIndex = 0;
    const searchAreaMatches = searchArea.matchAll(textPattern);
    
    for (const match of searchAreaMatches) {
      const text = match[1];
      textParts.push(text);
      
      if (text.includes('}}')) {
        foundClosing = true;
        const closingIndex = text.indexOf('}}');
        textParts[textParts.length - 1] = text.substring(0, closingIndex);
        endOffset = match.index! + match[0].indexOf('}}') + 2;
        break;
      }
    }
    
    if (foundClosing && textParts.length > 1) {
      const combinedName = textParts.join('');
      
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
  
  // 策略2: 查找 <w:t>{{TEXT</w:t>...<w:t>MORE_TEXT}}</w:t> 模式
  const strategy2Pattern = /<w:t[^>]*>\{\{([^<}]*?)<\/w:t>/g;
  let strategy2Match;
  
  while ((strategy2Match = strategy2Pattern.exec(xmlContent)) !== null) {
    const startIndex = strategy2Match.index;
    const firstPart = strategy2Match[1];
    
    if (firstPart.includes('}}')) {
      continue;
    }
    
    const searchStart = strategy2Match.index + strategy2Match[0].length;
    const searchEnd = Math.min(xmlContent.length, searchStart + 2000);
    const searchArea = xmlContent.substring(searchStart, searchEnd);
    
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
  
  // 策略3: 查找不完整的开始和结束标签
  // 改进：更准确地匹配开始和结束片段
  const incompleteOpenPattern = /(?:<w:t[^>]*>)?\{\{([A-Z0-9_]+)<\/w:t>/g;
  const incompleteClosePattern = /<w:t[^>]*>([A-Z0-9_]+)\}\}<\/w:t>/g;
  
  const openFragments: Array<{ index: number; text: string; matchEnd: number; fullMatch: string }> = [];
  const closeFragments: Array<{ index: number; text: string; matchEnd: number; fullMatch: string }> = [];
  
  let match;
  incompleteOpenPattern.lastIndex = 0;
  while ((match = incompleteOpenPattern.exec(xmlContent)) !== null) {
    openFragments.push({
      index: match.index,
      text: match[1],
      matchEnd: match.index + match[0].length,
      fullMatch: match[0]
    });
  }
  
  incompleteClosePattern.lastIndex = 0;
  while ((match = incompleteClosePattern.exec(xmlContent)) !== null) {
    closeFragments.push({
      index: match.index,
      text: match[1],
      matchEnd: match.index + match[0].length,
      fullMatch: match[0]
    });
  }
  
  // 改进匹配逻辑：更智能地匹配开始和结束片段
  openFragments.forEach(openFrag => {
    // 查找最近的结束片段
    const nearbyCloses = closeFragments
      .filter(closeFrag => {
        const distance = closeFrag.index - openFrag.matchEnd;
        return distance > 0 && distance < 2000;
      })
      .sort((a, b) => a.index - b.index);
    
    for (const closeFrag of nearbyCloses) {
      const distance = closeFrag.index - openFrag.matchEnd;
      const between = xmlContent.substring(openFrag.matchEnd, closeFrag.index);
      
      // 检查中间是否只有 XML 标签和占位符文本
      const betweenText = between.replace(/<[^>]+>/g, '').trim();
      const hasNonPlaceholderText = betweenText.length > 0 && !betweenText.match(/^[A-Z0-9_\s]*$/);
      
      if (hasNonPlaceholderText) {
        continue; // 跳过，中间有其他文本
      }
      
      // 提取中间的所有文本部分
      const textParts = [openFrag.text];
      const betweenTextPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      let betweenMatch;
      betweenTextPattern.lastIndex = 0;
      while ((betweenMatch = betweenTextPattern.exec(between)) !== null) {
        const text = betweenMatch[1].trim();
        if (text && text.match(/^[A-Z0-9_]*$/)) {
          textParts.push(text);
        }
      }
      textParts.push(closeFrag.text);
      
      const combinedName = textParts.join('');
      
      // 验证组合后的名称是否有效
      if (/^[A-Z0-9_]{2,}$/.test(combinedName)) {
        const startIndex = openFrag.index;
        const endIndex = closeFrag.matchEnd;
        
        // 检查是否已经存在类似的修复
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
          break; // 找到匹配后跳出，避免重复匹配
        }
      }
    }
  });
  
  if (splitPlaceholders.length > 0) {
    console.log(`📋 在 ${fileName} 中找到 ${splitPlaceholders.length} 个被分割的占位符:`);
    splitPlaceholders.forEach((sp, i) => {
      console.log(`  ${i + 1}. ${sp.textParts.join('...')} -> {{${sp.combinedName}}}`);
    });
    
    const sorted = [...splitPlaceholders].sort((a, b) => b.startIndex - a.startIndex);
    
    let fixedXml = xmlContent;
    sorted.forEach((sp) => {
      fixedXml = fixedXml.substring(0, sp.startIndex) + 
                 `{{${sp.combinedName}}}` + 
                 fixedXml.substring(sp.endIndex);
      fixCount++;
    });
    
    console.log(`✅ 修复了 ${fixCount} 个被分割的占位符`);
    return { fixed: fixedXml, count: fixCount };
  } else {
    console.log(`✅ ${fileName} 中没有发现被分割的占位符`);
    return { fixed: xmlContent, count: 0 };
  }
}

/**
 * 基于错误信息修复占位符
 * 当检测函数无法识别时，使用 Docxtemplater 的错误信息来修复
 */
export function fixWordTemplateFromErrors(
  buffer: Buffer, 
  errors: Array<{ id?: string; context?: string }>
): Buffer {
  try {
    const zip = new PizZip(buffer);
    const documentXml = zip.files["word/document.xml"];
    if (!documentXml) {
      return buffer;
    }
    
    let xmlContent = documentXml.asText();
    let fixCount = 0;
    
    // 提取开始和结束片段
    const openTags = new Set<string>();
    const closeTags = new Set<string>();
    
    errors.forEach((err) => {
      if (err.id === "duplicate_open_tag" && err.context) {
        let fragment = err.context.replace("{{", "").trim();
        if (fragment) {
          openTags.add(fragment);
        }
      } else if (err.id === "duplicate_close_tag" && err.context) {
        let fragment = err.context.replace("}}", "").trim();
        if (fragment) {
          closeTags.add(fragment);
        }
      }
    });
    
    // 已知的占位符映射
    const knownMappings: Record<string, string> = {
      "PROP|TYPE": "PROPERTY_TYPE",
      "ASSE|POSE": "ASSESSMENT_PURPOSE",
      "ASSE|DATE": "ASSESSMENT_DATE",
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
    
    // 匹配开始和结束片段
    const matchedPairs: Array<{ openPart: string; closePart: string; fullName: string }> = [];
    
    openTags.forEach((openPart) => {
      closeTags.forEach((closePart) => {
        const key = `${openPart}|${closePart}`;
        let fullName = knownMappings[key];
        
        if (!fullName) {
          // 尝试直接组合
          const combined = `${openPart}${closePart}`;
          if (/^[A-Z0-9_]{2,}$/.test(combined)) {
            fullName = combined;
          } else {
            // 尝试用下划线连接
            const combinedWithUnderscore = `${openPart}_${closePart}`;
            if (/^[A-Z0-9_]{2,}$/.test(combinedWithUnderscore)) {
              fullName = combinedWithUnderscore;
            }
          }
        }
        
        if (fullName) {
          matchedPairs.push({ openPart, closePart, fullName });
        }
      });
    });
    
    // 应用修复
    const fixes: Array<{ start: number; end: number; replacement: string }> = [];
    
    matchedPairs.forEach(({ openPart, closePart, fullName }) => {
      const escapedOpen = openPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedClose = closePart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // 多种模式匹配
      const patterns = [
        // {{OPEN</w:t>...<w:t>CLOSE}}
        new RegExp(`\\{\\{${escapedOpen}</w:t>([\\s\\S]{0,2000})<w:t[^>]*>${escapedClose}\\}\\}`, 'g'),
        // <w:t>{{OPEN</w:t>...<w:t>CLOSE}}</w:t>
        new RegExp(`<w:t[^>]*>\\{\\{${escapedOpen}</w:t>([\\s\\S]{0,2000})<w:t[^>]*>${escapedClose}\\}\\}</w:t>`, 'g'),
      ];
      
      patterns.forEach((pattern) => {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(xmlContent)) !== null) {
          fixes.push({
            start: match.index,
            end: match.index + match[0].length,
            replacement: pattern === patterns[1] ? `<w:t>{{${fullName}}}</w:t>` : `{{${fullName}}}`
          });
        }
      });
    });
    
    // 从后往前应用修复
    fixes.sort((a, b) => b.start - a.start);
    
    // 去重（相同位置只修复一次）
    const uniqueFixes: typeof fixes = [];
    const seenStarts = new Set<number>();
    fixes.forEach(fix => {
      if (!seenStarts.has(fix.start)) {
        seenStarts.add(fix.start);
        uniqueFixes.push(fix);
      }
    });
    
    uniqueFixes.forEach(fix => {
      xmlContent = xmlContent.substring(0, fix.start) + 
                  fix.replacement + 
                  xmlContent.substring(fix.end);
      fixCount++;
    });
    
    if (fixCount > 0) {
      zip.file("word/document.xml", xmlContent);
      const fixedBuffer = zip.generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      console.log(`✅ 基于错误信息修复了 ${fixCount} 个占位符`);
      return fixedBuffer;
    }
    
    return buffer;
  } catch (e) {
    console.error("基于错误信息修复时出错:", e);
    return buffer;
  }
}

/**
 * 修复 Word 模板中的分割占位符
 */
export function fixWordTemplate(buffer: Buffer): Buffer {
  try {
    const zip = new PizZip(buffer);
    let totalFixCount = 0;
    
    // 修复 document.xml
    const documentXml = zip.files["word/document.xml"];
    if (documentXml) {
      const result = fixXmlContent(documentXml.asText(), "word/document.xml");
      zip.file("word/document.xml", result.fixed);
      totalFixCount += result.count;
    }
    
    // 修复所有 header XML 文件
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
    
    // 修复所有 footer XML 文件
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
      console.log(`✅ 总共修复了 ${totalFixCount} 个被分割的占位符`);
      
      const fixedBuffer = zip.generate({
        type: "nodebuffer",
        compression: "DEFLATE",
      });
      
      return fixedBuffer;
    } else {
      console.log("ℹ️ 没有发现被分割的占位符，模板是干净的");
      return buffer;
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error("❌ 修复 Word 模板时出错:", errorMsg);
    return buffer;
  }
}

/**
 * 主函数（命令行使用）
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error("用法: npx tsx scripts/fix-placeholders.ts <模板文件路径> [输出文件路径]");
    process.exit(1);
  }
  
  const inputPath = args[0];
  const outputPath = args[1] || inputPath;
  
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 错误: 输入文件不存在: ${inputPath}`);
    process.exit(1);
  }
  
  console.log("=".repeat(60));
  console.log("🔧 Word 模板占位符修复脚本");
  console.log("=".repeat(60));
  console.log(`\n输入文件: ${inputPath}`);
  console.log(`输出文件: ${outputPath}\n`);
  
  // 读取模板
  console.log("📖 读取模板文件...");
  const originalBuffer = fs.readFileSync(inputPath);
  console.log(`   ✅ 文件大小: ${originalBuffer.length} bytes`);
  
  // 检查是否有被分割的占位符
  console.log("\n🔍 检查占位符...");
  const hasSplit = hasSplitPlaceholders(originalBuffer);
  if (!hasSplit) {
    console.log("   ✅ 没有发现被分割的占位符，无需修复");
    process.exit(0);
  }
  
  console.log("   ⚠️  发现被分割的占位符，开始修复...");
  
  // 修复
  console.log("\n🔧 修复占位符...");
  const fixedBuffer = fixWordTemplate(originalBuffer);
  
  // 再次检查
  console.log("\n🔍 验证修复结果...");
  const stillHasSplit = hasSplitPlaceholders(fixedBuffer);
  if (stillHasSplit) {
    console.log("   ⚠️  警告: 修复后仍然存在被分割的占位符");
  } else {
    console.log("   ✅ 验证通过: 没有发现被分割的占位符");
  }
  
  // 保存
  console.log(`\n💾 保存修复后的模板到: ${outputPath}`);
  fs.writeFileSync(outputPath, fixedBuffer);
  console.log(`   ✅ 已保存`);
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ 修复完成！");
  console.log("=".repeat(60));
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}
