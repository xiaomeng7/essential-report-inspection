#!/usr/bin/env node
/**
 * 修复 docx 模板中被 Word 分割到多个 <w:t> 的占位符
 * 
 * 用法: node scripts/fix-docx-tags.mjs input.docx output.docx
 * 
 * 依赖: npm install jszip fast-xml-parser
 */

import fs from 'fs';
import JSZip from 'jszip';
// 注意：虽然导入了 fast-xml-parser，但为了简化实现和保持性能，
// 我们使用正则表达式来提取和修改 <w:t> 节点。
// 这是因为 Word XML 结构相对固定，正则表达式足够可靠且更高效。

// 配置 XML 解析器
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  parseAttributeValue: false,
  trimValues: false,
  ignoreNameSpace: false,
  parseTrueNumberOnly: false,
};

const builderOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  suppressEmptyNode: false,
  format: false, // 保持原始格式
};

/**
 * 检查文本是否包含完整的占位符
 */
function isCompletePlaceholder(text) {
  return /\{\{[A-Z0-9_]+\}\}/.test(text);
}

/**
 * 从 XML 字符串中提取所有 <w:t> 节点及其位置信息
 */
function extractTextNodes(xmlString) {
  const nodes = [];
  // 匹配 <w:t> 标签，包括属性（如 xml:space="preserve"）
  const regex = /<w:t(\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let match;
  
  while ((match = regex.exec(xmlString)) !== null) {
    nodes.push({
      fullTag: match[0],
      attributes: match[1] || '',
      content: match[2],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  return nodes;
}

/**
 * 合并跨多个 <w:t> 节点的占位符
 */
function mergeSplitPlaceholders(xmlContent) {
  const textNodes = extractTextNodes(xmlContent);
  const fixes = [];
  const fixedPlaceholders = new Set();
  
  // 查找跨节点的占位符
  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];
    
    // 如果节点包含 {{ 但不完整
    if (node.content.includes('{{') && !isCompletePlaceholder(node.content)) {
      // 提取开始部分（例如 "{{PROP"）
      const openMatch = node.content.match(/\{\{([A-Z0-9_]*)$/);
      if (!openMatch) continue;
      
      const openPart = openMatch[1];
      let accumulatedParts = [node.content];
      let endNodeIndex = i;
      let found = false;
      
      // 向后查找后续节点，直到找到 }}
      for (let j = i + 1; j < textNodes.length && j < i + 100; j++) {
        const nextNode = textNodes[j];
        accumulatedParts.push(nextNode.content);
        
        // 检查是否包含 }}
        if (nextNode.content.includes('}}')) {
          // 提取结束部分（例如 "TYPE}}"）
          const closeMatch = nextNode.content.match(/^([A-Z0-9_]*)\}\}/);
          if (closeMatch) {
            const closePart = closeMatch[1];
            const fullPlaceholder = `{{${openPart}${closePart}}}`;
            
            // 验证是否是有效的占位符名称
            if (/^[A-Z0-9_]{2,}$/.test(openPart + closePart)) {
              fixes.push({
                startNodeIndex: i,
                endNodeIndex: j,
                openPart,
                closePart,
                fullPlaceholder,
                accumulatedParts,
              });
              
              fixedPlaceholders.add(fullPlaceholder);
              found = true;
              break;
            }
          }
        }
      }
    }
  }
  
  // 按从后往前的顺序应用修复（避免索引偏移）
  fixes.sort((a, b) => b.startNodeIndex - a.startNodeIndex);
  
  let modifiedXml = xmlContent;
  let fixCount = 0;
  
  // 应用每个修复
  for (const fix of fixes) {
    // 重新提取节点（因为之前的修复可能已经改变了 XML）
    const currentNodes = extractTextNodes(modifiedXml);
    
    // 找到对应的节点（通过内容匹配）
    let startNode = null;
    let endNode = null;
    
    // 查找开始节点（包含 openPart）
    for (const node of currentNodes) {
      if (node.content.includes('{{' + fix.openPart) && !isCompletePlaceholder(node.content)) {
        startNode = node;
        break;
      }
    }
    
    if (!startNode) continue;
    
    // 查找结束节点（包含 closePart + }}）
    let foundEnd = false;
    for (let i = 0; i < currentNodes.length; i++) {
      const node = currentNodes[i];
      if (node.startIndex <= startNode.startIndex) continue;
      
      if (node.content.includes(fix.closePart + '}}')) {
        endNode = node;
        foundEnd = true;
        break;
      }
    }
    
    if (!foundEnd || !endNode) continue;
    
    // 构建新的第一个节点的内容
    const beforePlaceholder = startNode.content.replace(/\{\{[A-Z0-9_]*$/, '');
    const newFirstContent = beforePlaceholder + fix.fullPlaceholder;
    
    // 替换第一个节点
    const newFirstTag = `<w:t${startNode.attributes}>${newFirstContent}</w:t>`;
    modifiedXml = 
      modifiedXml.substring(0, startNode.startIndex) +
      newFirstTag +
      modifiedXml.substring(startNode.endIndex);
    
    // 重新提取节点以更新索引
    const updatedNodes = extractTextNodes(modifiedXml);
    
    // 找到更新后的结束节点位置
    let updatedEndNode = null;
    for (const node of updatedNodes) {
      if (node.startIndex > startNode.startIndex && 
          node.content.includes(fix.closePart + '}}')) {
        updatedEndNode = node;
        break;
      }
    }
    
    if (!updatedEndNode) continue;
    
    // 清空 endNode（它包含占位符的结束部分）
    // 注意：startNode 已经包含完整的占位符了，所以只需要清空 endNode
    if (updatedEndNode && updatedEndNode.startIndex > startNode.startIndex) {
      const tagMatch = modifiedXml.substring(updatedEndNode.startIndex, updatedEndNode.endIndex)
        .match(/^(<w:t[^>]*>)(.*?)(<\/w:t>)$/);
      if (tagMatch) {
        // 保留结束部分之前的内容（如果有）
        const content = tagMatch[2];
        const afterPlaceholder = content.replace(/^[A-Z0-9_]*\}\}/, '');
        const emptyTag = tagMatch[1] + afterPlaceholder + tagMatch[3];
        modifiedXml = 
          modifiedXml.substring(0, updatedEndNode.startIndex) +
          emptyTag +
          modifiedXml.substring(updatedEndNode.endIndex);
      }
    }
    
    // 如果 startNode 和 endNode 之间还有其他节点，也需要清空
    const nodesBetween = updatedNodes.filter(n => 
      n.startIndex > startNode.endIndex && 
      n.startIndex < updatedEndNode.startIndex
    );
    
    // 按从后往前的顺序清空（避免索引偏移）
    nodesBetween.sort((a, b) => b.startIndex - a.startIndex);
    
    for (const node of nodesBetween) {
      const tagMatch = modifiedXml.substring(node.startIndex, node.endIndex)
        .match(/^(<w:t[^>]*>)(.*?)(<\/w:t>)$/);
      if (tagMatch) {
        const emptyTag = tagMatch[1] + '' + tagMatch[3];
        modifiedXml = 
          modifiedXml.substring(0, node.startIndex) +
          emptyTag +
          modifiedXml.substring(node.endIndex);
      }
    }
    
    fixCount++;
  }
  
  return {
    fixedXml: modifiedXml,
    fixCount,
    fixedPlaceholders: Array.from(fixedPlaceholders),
  };
}

/**
 * 处理单个 XML 文件
 */
function processXmlFile(xmlContent, fileName) {
  console.log(`\n处理文件: ${fileName}`);
  console.log(`  原始大小: ${xmlContent.length} 字节`);
  
  const result = mergeSplitPlaceholders(xmlContent);
  
  console.log(`  修复了 ${result.fixCount} 个被分割的占位符`);
  if (result.fixedPlaceholders.length > 0) {
    console.log(`  修复的占位符列表:`);
    result.fixedPlaceholders.forEach((ph, i) => {
      console.log(`    ${i + 1}. ${ph}`);
    });
  }
  console.log(`  修复后大小: ${result.fixedXml.length} 字节`);
  
  return result;
}

/**
 * 验证输出文件是否还有被分割的占位符
 */
function validateOutput(xmlContent, fileName) {
  // 查找 "{{TEXT</w:t>...<w:t>TEXT}}" 模式
  const splitPattern = /\{\{([A-Z0-9_]+)<\/w:t>[\s\S]{0,2000}<w:t[^>]*>([A-Z0-9_]+)\}\}/g;
  const matches = [];
  let match;
  
  while ((match = splitPattern.exec(xmlContent)) !== null) {
    matches.push({
      placeholder: `{{${match[1]}${match[2]}}}`,
      position: match.index,
    });
  }
  
  if (matches.length > 0) {
    console.warn(`\n⚠️  警告: ${fileName} 中仍存在 ${matches.length} 个可能被分割的占位符:`);
    matches.slice(0, 10).forEach((m, i) => {
      console.warn(`    ${i + 1}. ${m.placeholder} (位置: ${m.position})`);
    });
    if (matches.length > 10) {
      console.warn(`    ... 还有 ${matches.length - 10} 个`);
    }
    return false;
  }
  
  return true;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('用法: node scripts/fix-docx-tags.mjs <input.docx> <output.docx>');
    process.exit(1);
  }
  
  const inputPath = args[0];
  const outputPath = args[1];
  
  // 检查输入文件是否存在
  if (!fs.existsSync(inputPath)) {
    console.error(`错误: 输入文件不存在: ${inputPath}`);
    process.exit(1);
  }
  
  try {
    console.log(`读取输入文件: ${inputPath}`);
    const inputBuffer = fs.readFileSync(inputPath);
    const zip = await JSZip.loadAsync(inputBuffer);
    
    // 需要处理的 XML 文件列表
    const xmlFiles = [];
    
    // 添加 document.xml
    if (zip.files['word/document.xml']) {
      xmlFiles.push('word/document.xml');
    }
    
    // 添加所有 header*.xml
    Object.keys(zip.files).forEach(fileName => {
      if (fileName.startsWith('word/header') && fileName.endsWith('.xml')) {
        xmlFiles.push(fileName);
      }
    });
    
    // 添加所有 footer*.xml
    Object.keys(zip.files).forEach(fileName => {
      if (fileName.startsWith('word/footer') && fileName.endsWith('.xml')) {
        xmlFiles.push(fileName);
      }
    });
    
    console.log(`\n找到 ${xmlFiles.length} 个 XML 文件需要处理`);
    
    let totalFixCount = 0;
    const allFixedPlaceholders = new Set();
    
    // 处理每个 XML 文件
    for (const xmlFile of xmlFiles) {
      const xmlContent = await zip.files[xmlFile].async('string');
      const result = processXmlFile(xmlContent, xmlFile);
      
      // 更新 ZIP 中的文件
      zip.file(xmlFile, result.fixedXml);
      
      totalFixCount += result.fixCount;
      result.fixedPlaceholders.forEach(ph => allFixedPlaceholders.add(ph));
    }
    
    // 生成输出文件
    console.log(`\n生成输出文件: ${outputPath}`);
    const outputBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    
    fs.writeFileSync(outputPath, outputBuffer);
    
    // 总结
    console.log(`\n${'='.repeat(60)}`);
    console.log(`修复完成！`);
    console.log(`  总修复次数: ${totalFixCount}`);
    console.log(`  修复的占位符数量（去重）: ${allFixedPlaceholders.size}`);
    if (allFixedPlaceholders.size > 0) {
      console.log(`  占位符列表:`);
      Array.from(allFixedPlaceholders).sort().forEach((ph, i) => {
        console.log(`    ${i + 1}. ${ph}`);
      });
    }
    console.log(`${'='.repeat(60)}`);
    
    // 验证输出文件
    console.log(`\n验证输出文件...`);
    const outputZip = await JSZip.loadAsync(outputBuffer);
    let allValid = true;
    
    for (const xmlFile of xmlFiles) {
      const xmlContent = await outputZip.files[xmlFile].async('string');
      if (!validateOutput(xmlContent, xmlFile)) {
        allValid = false;
      }
    }
    
    if (allValid) {
      console.log(`\n✅ 验证通过: 输出文件中没有发现被分割的占位符`);
    } else {
      console.log(`\n⚠️  验证警告: 输出文件中可能仍存在被分割的占位符`);
    }
    
  } catch (error) {
    console.error(`\n错误: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 运行主函数
main().catch(error => {
  console.error('未处理的错误:', error);
  process.exit(1);
});
