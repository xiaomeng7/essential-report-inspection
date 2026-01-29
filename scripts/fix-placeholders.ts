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
 * 扫描所有 XML 文件（document.xml, header*.xml, footer*.xml）
 */
export function hasSplitPlaceholders(buffer: Buffer): boolean {
  try {
    const zip = new PizZip(buffer);

    const targets = Object.keys(zip.files).filter((name) =>
      name === "word/document.xml" ||
      (/^word\/header\d+\.xml$/.test(name)) ||
      (/^word\/footer\d+\.xml$/.test(name))
    );

    const badPattern = /\{\{[A-Z0-9_]+<\/w:t>|[A-Z0-9_]+\}\}<\/w:t>/;

    for (const fileName of targets) {
      const f = zip.files[fileName];
      if (!f) continue;
      const xml = f.asText();
      if (badPattern.test(xml)) return true;
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
 * 只合并 <w:t> 内容，不破坏 XML 结构
 */
function fixXmlContent(xmlContent: string, fileName: string): { fixed: string; count: number } {
  let fixCount = 0;
  let modified = false;
  
  // 1. 用正则提取所有 <w:t ...>TEXT</w:t> 的 match 列表
  const tPattern = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
  const tNodes: Array<{
    fullMatch: string;
    startIndex: number;
    endIndex: number;
    attrs: string;
    text: string;
  }> = [];
  
  let match;
  tPattern.lastIndex = 0;
  while ((match = tPattern.exec(xmlContent)) !== null) {
    tNodes.push({
      fullMatch: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      attrs: match[1] || '',
      text: match[2] || ''
    });
  }
  
  if (tNodes.length === 0) {
    return { fixed: xmlContent, count: 0 };
  }
  
  // 2. 顺序扫描，把文本拼到一个缓冲区 acc
  // 3. 一旦 acc 中出现 {{ 并且后面出现 }}，就识别出一个完整 tag
  // 4. 将 tag 写入第一个参与的 <w:t>，将后续参与的 <w:t> 清空
  
  let fixedXml = xmlContent;
  let acc = '';
  let tagStartIndex = -1; // 当前占位符开始的 <w:t> 索引
  let tagStartPos = -1; // 当前占位符在 acc 中的开始位置
  
  // 从后往前处理，避免索引偏移
  for (let i = tNodes.length - 1; i >= 0; i--) {
    const tNode = tNodes[i];
    const text = tNode.text;
    
    // 将当前文本添加到缓冲区（从后往前，所以是 prepend）
    acc = text + acc;
    
    // 检查 acc 中是否有完整的占位符 {{...}}
    const placeholderMatch = acc.match(/\{\{([^}]+)\}\}/);
    
    if (placeholderMatch) {
      // 找到完整占位符
      const fullPlaceholder = placeholderMatch[0];
      const placeholderStart = acc.indexOf(fullPlaceholder);
      const placeholderEnd = placeholderStart + fullPlaceholder.length;
      
      // 规范化占位符（去掉内部空白）
      const normalizedPlaceholder = normalizePlaceholderText(fullPlaceholder);
      
      // 找到参与这个占位符的所有 <w:t> 节点
      let charPos = 0;
      let firstTIndex = -1;
      let lastTIndex = -1;
      
      // 从当前节点往前找，找到所有参与占位符的节点
      for (let j = i; j >= 0 && charPos < placeholderEnd; j--) {
        const nodeText = tNodes[j].text;
        const nodeStart = charPos;
        const nodeEnd = charPos + nodeText.length;
        
        // 检查这个节点是否参与占位符
        if (nodeStart < placeholderEnd && nodeEnd > placeholderStart) {
          if (lastTIndex === -1) lastTIndex = j;
          firstTIndex = j;
        }
        
        charPos += nodeText.length;
      }
      
      if (firstTIndex !== -1 && lastTIndex !== -1) {
        // 修复：将占位符写入第一个节点，清空后续节点
        modified = true;
        fixCount++;
        
        // 从后往前替换，避免索引偏移
        for (let j = lastTIndex; j >= firstTIndex; j--) {
          const node = tNodes[j];
          
          if (j === firstTIndex) {
            // 第一个节点：写入完整规范化后的占位符
            // 转义 XML 特殊字符（但保留 {{ 和 }}）
            const escapedText = normalizedPlaceholder
              .replace(/&(?!amp;|lt;|gt;)/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            const newTNode = `<w:t${node.attrs}>${escapedText}</w:t>`;
            fixedXml = fixedXml.substring(0, node.startIndex) + 
                      newTNode + 
                      fixedXml.substring(node.endIndex);
          } else {
            // 后续节点：清空文本
            const newTNode = `<w:t${node.attrs}></w:t>`;
            fixedXml = fixedXml.substring(0, node.startIndex) + 
                      newTNode + 
                      fixedXml.substring(node.endIndex);
          }
        }
        
        // 从 acc 中移除已处理的占位符
        acc = acc.substring(0, placeholderStart) + acc.substring(placeholderEnd);
        tagStartIndex = -1;
        tagStartPos = -1;
      }
    } else {
      // 检查是否有开始的 {{ 但没有结束的 }}
      const openMatch = acc.match(/\{\{([^}]*)$/);
      if (openMatch && tagStartIndex === -1) {
        tagStartIndex = i;
        tagStartPos = acc.length - openMatch[0].length;
      }
    }
  }
  
  if (modified) {
    console.log(`✅ 在 ${fileName} 中修复了 ${fixCount} 个被分割的占位符`);
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
