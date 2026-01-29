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
 * 使用段落级别检测：如果段落中合并后的文本包含完整的占位符，但原始 XML 中占位符被分割，则返回 true
 */
export function hasSplitPlaceholders(buffer: Buffer): boolean {
  try {
    const zip = new PizZip(buffer);
    const documentXml = zip.files["word/document.xml"];
    if (!documentXml) {
      return false;
    }
    
    const xmlContent = documentXml.asText();
    
    // 检查所有段落：如果段落中有多个 <w:t> 节点，且合并后的文本包含占位符，则可能被分割
    const paragraphPattern = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
    let match;
    
    while ((match = paragraphPattern.exec(xmlContent)) !== null) {
      const paraContent = match[1];
      
      // 提取段落中的所有 <w:t> 节点
      const tPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      const tNodes: string[] = [];
      let tMatch;
      
      while ((tMatch = tPattern.exec(paraContent)) !== null) {
        tNodes.push(tMatch[1]);
      }
      
      // 如果有多个文本节点，检查合并后是否有占位符
      if (tNodes.length > 1) {
        const mergedText = tNodes.join('');
        
        // 检查合并后的文本是否包含完整的占位符
        if (/\{\{[^}]+\}\}/.test(mergedText)) {
          // 检查原始 XML 中占位符是否被分割
          // 模式1: {{TEXT</w:t> 或 <w:t>{{TEXT</w:t>
          if (/(?:<w:t[^>]*>)?\{\{[A-Z0-9_]+<\/w:t>/.test(paraContent)) {
            return true;
          }
          
          // 模式2: TEXT}}</w:t>
          if (/[A-Z0-9_]+\}\}<\/w:t>/.test(paraContent)) {
            return true;
          }
          
          // 模式3: 不完整的开始和结束标签
          if (/<w:t[^>]*>\{\{([A-Z0-9_]+)<\/w:t>/.test(paraContent) || 
              /<w:t[^>]*>([A-Z0-9_]+)\}\}<\/w:t>/.test(paraContent)) {
            return true;
          }
        }
      }
    }
    
    return false;
  } catch (e) {
    console.error("检查占位符时出错:", e);
    return false;
  }
}

/**
 * 规范化占位符文本：去掉 {{...}} 内部的所有空白字符
 */
function normalizePlaceholderText(text: string): string {
  // 匹配 {{...}} 并去掉内部的所有空白（空格、换行、Tab等）
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, inner) => {
    // 去掉内部所有空白字符
    const cleaned = inner.replace(/\s+/g, '');
    return `{{${cleaned}}}`;
  });
}

/**
 * 修复单个 XML 文件中的分割占位符
 * 使用段落级别合并策略：在段落级别合并所有 <w:t> 节点
 */
function fixXmlContent(xmlContent: string, fileName: string): { fixed: string; count: number } {
  let fixCount = 0;
  let modified = false;
  
  // 匹配段落：<w:p>...</w:p>
  // 使用非贪婪匹配，确保每个段落单独处理
  const paragraphPattern = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
  
  let fixedXml = xmlContent;
  const paragraphs: Array<{ match: string; startIndex: number; endIndex: number }> = [];
  
  // 收集所有段落
  let match;
  paragraphPattern.lastIndex = 0;
  while ((match = paragraphPattern.exec(xmlContent)) !== null) {
    paragraphs.push({
      match: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  
  // 从后往前处理段落，避免索引偏移
  paragraphs.reverse().forEach(({ match: paraMatch, startIndex, endIndex }) => {
    // 提取段落内的所有 <w:t> 节点（使用相对于段落的索引）
    const tPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    const tNodes: Array<{ match: string; text: string; relativeIndex: number; attrs: string }> = [];
    
    let tMatch;
    tPattern.lastIndex = 0;
    while ((tMatch = tPattern.exec(paraMatch)) !== null) {
      const attrs = tMatch[0].match(/<w:t([^>]*)>/)?.[1] || '';
      tNodes.push({
        match: tMatch[0],
        text: tMatch[1],
        relativeIndex: tMatch.index,
        attrs
      });
    }
    
    if (tNodes.length === 0) {
      return; // 没有文本节点，跳过
    }
    
    // 拼接段落所有文本
    const fullText = tNodes.map(t => t.text).join('');
    
    // 规范化占位符（去掉内部空白）
    const fixedText = normalizePlaceholderText(fullText);
    
    // 检查是否有占位符被分割
    // 如果合并后的文本包含完整占位符，但原始 XML 中占位符被分割，则需要修复
    const hasPlaceholders = /\{\{[^}]+\}\}/.test(fullText);
    const hasSplitInOriginal = /(?:<w:t[^>]*>)?\{\{[A-Z0-9_]+<\/w:t>/.test(paraMatch) || 
                                /[A-Z0-9_]+\}\}<\/w:t>/.test(paraMatch) ||
                                /<w:t[^>]*>\{\{([A-Z0-9_]+)<\/w:t>/.test(paraMatch) ||
                                /<w:t[^>]*>([A-Z0-9_]+)\}\}<\/w:t>/.test(paraMatch);
    
    // 如果有占位符且被分割，或者文本被规范化了，则需要修复
    if (hasPlaceholders && (hasSplitInOriginal || fullText !== fixedText)) {
      modified = true;
      fixCount++;
      
      // 构建新的段落：保留第一个 <w:t> 的属性和完整文本，其余 <w:t> 清空
      let newParagraph = paraMatch;
      
      // 从后往前替换，避免索引偏移
      for (let i = tNodes.length - 1; i >= 0; i--) {
        const tNode = tNodes[i];
        
        if (i === 0) {
          // 第一个节点：写入完整规范化后的文本
          // 转义 XML 特殊字符
          const escapedText = fixedText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          const newTNode = `<w:t${tNode.attrs}>${escapedText}</w:t>`;
          newParagraph = newParagraph.substring(0, tNode.relativeIndex) + 
                        newTNode + 
                        newParagraph.substring(tNode.relativeIndex + tNode.match.length);
        } else {
          // 其余节点：清空文本
          const newTNode = `<w:t${tNode.attrs}></w:t>`;
          newParagraph = newParagraph.substring(0, tNode.relativeIndex) + 
                        newTNode + 
                        newParagraph.substring(tNode.relativeIndex + tNode.match.length);
        }
      }
      
      // 替换原段落
      fixedXml = fixedXml.substring(0, startIndex) + 
                 newParagraph + 
                 fixedXml.substring(endIndex);
    }
  });
  
  if (modified) {
    console.log(`✅ 在 ${fileName} 中修复了 ${fixCount} 个段落的占位符`);
    return { fixed: fixedXml, count: fixCount };
  } else {
    console.log(`✅ ${fileName} 中没有发现需要修复的占位符`);
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
