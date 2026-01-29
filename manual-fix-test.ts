#!/usr/bin/env node
/**
 * 手动测试 Word 模板修复脚本
 * 
 * 使用方法：
 *   npx tsx manual-fix-test.ts
 *   或
 *   npx tsx manual-fix-test.ts <模板文件路径>
 */

import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import { fixWordTemplate, hasSplitPlaceholders } from "./scripts/fix-placeholders.js";

// 默认模板路径
const DEFAULT_TEMPLATE = "./netlify/functions/report-template.docx";

// 获取模板路径
const templatePath = process.argv[2] || DEFAULT_TEMPLATE;

console.log("=".repeat(60));
console.log("🔧 Word 模板修复脚本 - 手动测试");
console.log("=".repeat(60));
console.log(`\n模板文件: ${templatePath}\n`);

// 检查文件是否存在
if (!fs.existsSync(templatePath)) {
  console.error(`❌ 错误: 模板文件不存在: ${templatePath}`);
  console.error(`\n请提供正确的模板文件路径，例如：`);
  console.error(`  npx tsx manual-fix-test.ts ./report-template.docx`);
  process.exit(1);
}

// 读取原始模板
console.log("📖 步骤 1: 读取原始模板...");
const originalBuffer = fs.readFileSync(templatePath);
console.log(`   ✅ 文件大小: ${originalBuffer.length} bytes`);

// 检查原始模板中的分割占位符
console.log("\n📋 步骤 2: 检查原始模板中的分割占位符...");
const hasSplit = hasSplitPlaceholders(originalBuffer);
console.log(`   ${hasSplit ? `⚠️  找到被分割的占位符` : "✅ 没有找到被分割的占位符"}`);

// 应用修复
console.log("\n🔧 步骤 3: 应用修复脚本...");
const fixedBuffer = fixWordTemplate(originalBuffer);
console.log(`   ✅ 修复后大小: ${fixedBuffer.length} bytes`);

// 检查修复后的模板
console.log("\n📋 步骤 4: 检查修复后的模板...");
const stillHasSplit = hasSplitPlaceholders(fixedBuffer);

if (stillHasSplit) {
  console.log(`   ⚠️  仍然找到被分割的占位符！`);
} else {
  console.log("   ✅ 没有找到被分割的占位符！修复成功！");
}

// 保存修复后的模板
const outputPath = templatePath.replace(/\.docx$/, "-fixed.docx");
console.log(`\n💾 步骤 5: 保存修复后的模板...`);
fs.writeFileSync(outputPath, fixedBuffer);
console.log(`   ✅ 已保存到: ${outputPath}`);

// 显示一些 XML 样本
console.log("\n📄 步骤 6: 显示 XML 样本（前 500 字符）...");
const originalZip = new PizZip(originalBuffer);
const originalXml = originalZip.files["word/document.xml"];
if (originalXml) {
  const originalXmlContent = originalXml.asText();
  const sampleIndex = originalXmlContent.indexOf("{{PROP");
  if (sampleIndex >= 0) {
    const sample = originalXmlContent.substring(
      Math.max(0, sampleIndex - 50),
      Math.min(originalXmlContent.length, sampleIndex + 200)
    );
    console.log("\n   原始 XML 样本：");
    console.log("   " + sample.replace(/\n/g, "\n   "));
    
    const fixedZip = new PizZip(fixedBuffer);
    const fixedXml = fixedZip.files["word/document.xml"];
    if (fixedXml) {
      const fixedXmlContent = fixedXml.asText();
      const fixedSampleIndex = fixedXmlContent.indexOf("{{PROP");
      if (fixedSampleIndex >= 0) {
        const fixedSample = fixedXmlContent.substring(
          Math.max(0, fixedSampleIndex - 50),
          Math.min(fixedXmlContent.length, fixedSampleIndex + 200)
        );
        console.log("\n   修复后 XML 样本：");
        console.log("   " + fixedSample.replace(/\n/g, "\n   "));
      }
    }
  }
}

console.log("\n" + "=".repeat(60));
console.log("✅ 测试完成！");
console.log("=".repeat(60));
console.log(`\n修复后的模板已保存到: ${outputPath}`);
console.log("你可以用这个文件替换原始模板文件。\n");
