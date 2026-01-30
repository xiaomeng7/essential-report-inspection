#!/usr/bin/env node
/**
 * 使用 pandoc 将 Markdown 文件转换为 Word 文档
 * 
 * 使用方法：
 *   node scripts/markdown-to-word-pandoc.ts <markdown-file> [output-file] [--reference-doc=style.docx]
 * 
 * 示例：
 *   node scripts/markdown-to-word-pandoc.ts report.md final-report.docx --reference-doc=report-style.docx
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
 * 查找参考文档路径
 */
function findReferenceDoc(referenceDoc?: string): string | undefined {
  if (!referenceDoc) {
    return undefined;
  }
  
  // 尝试多个可能的路径
  const possiblePaths = [
    referenceDoc, // 直接路径
    path.join(process.cwd(), referenceDoc),
    path.join(__dirname, "..", referenceDoc),
    path.join(__dirname, "..", "netlify", "functions", referenceDoc),
    path.join(process.cwd(), "netlify", "functions", referenceDoc),
  ];
  
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  console.warn(`⚠️  参考文档未找到: ${referenceDoc}`);
  return undefined;
}

/**
 * 使用 pandoc 将 Markdown 转换为 Word
 */
function convertMarkdownToWord(
  markdownPath: string,
  outputPath?: string,
  referenceDoc?: string
): void {
  // 检查 pandoc
  if (!checkPandoc()) {
    console.error("❌ 错误: pandoc 未安装");
    console.error("");
    console.error("请安装 pandoc:");
    console.error("  macOS: brew install pandoc");
    console.error("  Ubuntu/Debian: sudo apt-get install pandoc");
    console.error("  Windows: choco install pandoc");
    console.error("  或访问: https://pandoc.org/installing.html");
    process.exit(1);
  }
  
  // 检查输入文件
  if (!fs.existsSync(markdownPath)) {
    console.error(`❌ 错误: Markdown 文件不存在: ${markdownPath}`);
    process.exit(1);
  }
  
  // 确定输出路径
  const output = outputPath || markdownPath.replace(/\.md$/, ".docx");
  
  // 构建 pandoc 命令
  const commandParts = [
    "pandoc",
    markdownPath,
    "-o",
    output,
  ];
  
  // 添加参考文档（如果提供）
  const refDocPath = findReferenceDoc(referenceDoc);
  if (refDocPath) {
    commandParts.push("--reference-doc", refDocPath);
    console.log(`📄 使用参考文档: ${refDocPath}`);
  } else if (referenceDoc) {
    console.warn(`⚠️  参考文档未找到，将不使用样式参考文档`);
  }
  
  // 执行转换
  console.log(`🔄 正在转换: ${markdownPath} → ${output}`);
  console.log(`📝 命令: ${commandParts.join(" ")}`);
  
  try {
    execSync(commandParts.join(" "), {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    console.log(`✅ 转换成功: ${output}`);
  } catch (error) {
    console.error(`❌ 转换失败:`, error);
    process.exit(1);
  }
}

/**
 * 解析命令行参数
 */
function parseArgs(): { markdown: string; output?: string; referenceDoc?: string } {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error("❌ 错误: 请提供 Markdown 文件路径");
    console.error("");
    console.error("使用方法:");
    console.error("  node scripts/markdown-to-word-pandoc.ts <markdown-file> [output-file] [--reference-doc=style.docx]");
    console.error("");
    console.error("示例:");
    console.error("  node scripts/markdown-to-word-pandoc.ts report.md final-report.docx --reference-doc=report-style.docx");
    process.exit(1);
  }
  
  const markdown = args[0];
  let output: string | undefined;
  let referenceDoc: string | undefined;
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--reference-doc=")) {
      referenceDoc = arg.substring("--reference-doc=".length);
    } else if (!output && !arg.startsWith("--")) {
      output = arg;
    }
  }
  
  return { markdown, output, referenceDoc };
}

/**
 * 主函数
 */
function main() {
  const { markdown, output, referenceDoc } = parseArgs();
  convertMarkdownToWord(markdown, output, referenceDoc);
}

main();
