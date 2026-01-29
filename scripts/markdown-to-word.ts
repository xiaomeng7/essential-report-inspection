#!/usr/bin/env node
/**
 * 将 Markdown 文件转换为 Word 文档
 * 
 * 使用方法：
 *   npm run markdown-to-word test-report.md
 *   或
 *   tsx scripts/markdown-to-word.ts test-report.md
 * 
 * 需要安装 pandoc：
 *   macOS: brew install pandoc
 *   Linux: sudo apt-get install pandoc
 *   Windows: choco install pandoc
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 检查 pandoc 是否已安装
 */
function checkPandoc(): boolean {
  try {
    execSync("pandoc --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * 使用 pandoc 将 Markdown 转换为 Word
 */
function convertMarkdownToWord(markdownPath: string, outputPath?: string): void {
  if (!fs.existsSync(markdownPath)) {
    throw new Error(`Markdown 文件不存在: ${markdownPath}`);
  }
  
  const output = outputPath || markdownPath.replace(/\.md$/, ".docx");
  
  console.log(`📄 输入文件: ${markdownPath}`);
  console.log(`📄 输出文件: ${output}`);
  
  try {
    // 使用 pandoc 转换
    execSync(`pandoc "${markdownPath}" -o "${output}" --reference-doc=/System/Library/Templates/Paper\ Template.dotx 2>/dev/null || pandoc "${markdownPath}" -o "${output}"`, {
      stdio: "inherit"
    });
    
    console.log(`✅ Word 文档已生成: ${output}`);
  } catch (error) {
    console.error("❌ 转换失败:", error);
    throw error;
  }
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("使用方法:");
    console.log("  npm run markdown-to-word <markdown-file>");
    console.log("  或");
    console.log("  tsx scripts/markdown-to-word.ts <markdown-file>");
    console.log("");
    console.log("示例:");
    console.log("  npm run markdown-to-word test-report.md");
    process.exit(1);
  }
  
  const markdownFile = args[0];
  const outputFile = args[1]; // 可选
  
  // 检查 pandoc
  if (!checkPandoc()) {
    console.error("❌ 错误: 未找到 pandoc");
    console.error("");
    console.error("请先安装 pandoc:");
    console.error("  macOS:   brew install pandoc");
    console.error("  Linux:   sudo apt-get install pandoc");
    console.error("  Windows: choco install pandoc");
    console.error("");
    console.error("或者使用在线工具:");
    console.error("  https://www.markdowntoword.com/");
    console.error("  https://cloudconvert.com/md-to-docx");
    process.exit(1);
  }
  
  // 转换文件
  try {
    const fullPath = path.isAbsolute(markdownFile) 
      ? markdownFile 
      : path.join(process.cwd(), markdownFile);
    
    convertMarkdownToWord(fullPath, outputFile);
  } catch (error) {
    console.error("❌ 错误:", error);
    process.exit(1);
  }
}

main();
