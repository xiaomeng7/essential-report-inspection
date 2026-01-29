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
 */
export function hasSplitPlaceholders(buffer: Buffer): boolean {
  try {
    const zip = new PizZip(buffer);
    const documentXml = zip.files["word/document.xml"];
    if (!documentXml) {
      return false;
    }
    
    const xmlContent = documentXml.asText();
    // 查找被分割的占位符模式：{{TEXT</w:t>...<w:t>MORE_TEXT}}
    const splitPattern = /\{\{[A-Z0-9_]+<\/w:t>/g;
    return splitPattern.test(xmlContent);
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
  
  openFragments.forEach(openFrag => {
    closeFragments.forEach(closeFrag => {
      const distance = closeFrag.index - openFrag.matchEnd;
      if (distance > 0 && distance < 2000) {
        const between = xmlContent.substring(openFrag.matchEnd, closeFrag.index);
        const betweenText = between.replace(/<[^>]+>/g, '').trim();
        if (betweenText.length > 0 && !betweenText.match(/^[A-Z0-9_]*$/)) {
          return;
        }
        
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
        
        if (/^[A-Z0-9_]{2,}$/.test(combinedName)) {
          const startIndex = openFrag.index;
          const endIndex = closeFrag.matchEnd;
          
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
