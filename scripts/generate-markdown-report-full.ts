#!/usr/bin/env node
/**
 * 完整版：生成 Markdown 格式的报告（使用实际的 buildWordTemplateData 函数）
 * 
 * 使用方法（需要先编译 TypeScript）：
 *   1. npm run build
 *   2. node --loader ts-node/esm scripts/generate-markdown-report-full.ts
 * 
 * 或者使用简化版（test-markdown-report.mjs）：
 *   npm run test:markdown
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildReportData, buildWordTemplateData } from "../netlify/functions/generateWordReport.js";
import type { StoredInspection } from "../netlify/functions/lib/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 将 WordTemplateData 转换为 Markdown 格式
 */
function generateMarkdownReport(templateData: any): string {
  const md: string[] = [];
  
  // Header
  md.push("# Electrical Property Health Assessment");
  md.push("");
  md.push(`**Report ID:** ${templateData.INSPECTION_ID}`);
  md.push(`**Assessment Date:** ${templateData.ASSESSMENT_DATE}`);
  md.push(`**Prepared For:** ${templateData.PREPARED_FOR}`);
  md.push(`**Prepared By:** ${templateData.PREPARED_BY}`);
  md.push(`**Property Address:** ${templateData.PROPERTY_ADDRESS}`);
  md.push(`**Property Type:** ${templateData.PROPERTY_TYPE}`);
  md.push("");
  md.push("---");
  md.push("");
  
  // Overall Status
  md.push("## Overall Electrical Status");
  md.push("");
  md.push(`**${templateData.OVERALL_STATUS}**`);
  md.push("");
  
  // Executive Summary
  md.push("## Executive Summary");
  md.push("");
  md.push(templateData.EXECUTIVE_SUMMARY.split("\n").map((line: string) => line.trim()).filter((line: string) => line).join("\n\n"));
  md.push("");
  md.push("---");
  md.push("");
  
  // Risk Rating
  md.push("## Risk Assessment");
  md.push("");
  md.push(`**Risk Rating:** ${templateData.RISK_RATING}`);
  md.push(`**Risk Factors:** ${templateData.RISK_RATING_FACTORS}`);
  md.push("");
  md.push("---");
  md.push("");
  
  // Immediate Findings
  md.push("## Immediate Safety Concerns");
  md.push("");
  if (templateData.IMMEDIATE_FINDINGS && !templateData.IMMEDIATE_FINDINGS.includes("No immediate safety risks")) {
    md.push(templateData.IMMEDIATE_FINDINGS.split("\n").map((line: string) => {
      if (line.startsWith("•")) return line;
      return line.trim();
    }).filter((line: string) => line).join("\n\n"));
  } else {
    md.push(templateData.IMMEDIATE_FINDINGS);
  }
  md.push("");
  md.push(`*${templateData.PRIORITY_IMMEDIATE_DESC}*`);
  md.push(`*${templateData.PRIORITY_IMMEDIATE_INTERP}*`);
  md.push("");
  md.push("---");
  md.push("");
  
  // Recommended Findings
  md.push("## Recommended Actions (0-3 Months)");
  md.push("");
  if (templateData.RECOMMENDED_FINDINGS && !templateData.RECOMMENDED_FINDINGS.includes("No items requiring")) {
    md.push(templateData.RECOMMENDED_FINDINGS.split("\n").map((line: string) => {
      if (line.startsWith("•")) return line;
      return line.trim();
    }).filter((line: string) => line).join("\n\n"));
  } else {
    md.push(templateData.RECOMMENDED_FINDINGS);
  }
  md.push("");
  md.push(`*${templateData.PRIORITY_RECOMMENDED_DESC}*`);
  md.push(`*${templateData.PRIORITY_RECOMMENDED_INTERP}*`);
  md.push("");
  md.push("---");
  md.push("");
  
  // Plan Findings
  md.push("## Planning & Monitoring");
  md.push("");
  if (templateData.PLAN_FINDINGS && !templateData.PLAN_FINDINGS.includes("No additional items")) {
    md.push(templateData.PLAN_FINDINGS.split("\n").map((line: string) => {
      if (line.startsWith("•")) return line;
      return line.trim();
    }).filter((line: string) => line).join("\n\n"));
  } else {
    md.push(templateData.PLAN_FINDINGS);
  }
  md.push("");
  md.push(`*${templateData.PRIORITY_PLAN_DESC}*`);
  md.push(`*${templateData.PRIORITY_PLAN_INTERP}*`);
  md.push("");
  md.push("---");
  md.push("");
  
  // Limitations
  md.push("## Limitations");
  md.push("");
  md.push(templateData.LIMITATIONS.split("\n").map((line: string) => {
    if (line.startsWith("•")) return line;
    return line.trim();
  }).filter((line: string) => line).join("\n\n"));
  md.push("");
  md.push("---");
  md.push("");
  
  // Technical Notes
  md.push("## Technical Notes");
  md.push("");
  md.push(templateData.TECHNICAL_NOTES);
  md.push("");
  md.push(`**Test Summary:** ${templateData.TEST_SUMMARY}`);
  md.push("");
  md.push("---");
  md.push("");
  
  // Footer
  md.push(`*Report Version: ${templateData.REPORT_VERSION}*`);
  md.push(`*Generated: ${new Date().toISOString()}*`);
  
  return md.join("\n");
}

/**
 * 创建测试用的 inspection 数据
 */
function createTestInspection(): StoredInspection {
  const samplePath = path.join(__dirname, "..", "sample-inspection.json");
  let raw: Record<string, unknown> = {};
  
  if (fs.existsSync(samplePath)) {
    try {
      const content = fs.readFileSync(samplePath, "utf8");
      raw = JSON.parse(content);
    } catch (e) {
      console.warn("Failed to load sample-inspection.json, using default");
    }
  }
  
  // 创建测试 findings
  const findings = [
    {
      id: "MEN_NOT_VERIFIED",
      priority: "IMMEDIATE",
      title: "MEN Link Not Verified"
    },
    {
      id: "PARTIAL_RCD_COVERAGE",
      priority: "RECOMMENDED_0_3_MONTHS",
      title: "Partial RCD Coverage"
    },
    {
      id: "LABELING_POOR",
      priority: "PLAN_MONITOR",
      title: "Poor Labeling"
    }
  ];
  
  return {
    inspection_id: "EH-2026-01-TEST",
    raw,
    report_html: "",
    findings,
    limitations: ["Roof space not accessible", "Underfloor area locked"]
  };
}

/**
 * 主函数
 */
async function main() {
  console.log("🚀 开始生成 Markdown 报告（完整版）...");
  
  try {
    // 创建测试数据
    const inspection = createTestInspection();
    console.log("✅ 测试数据创建完成");
    console.log(`   Inspection ID: ${inspection.inspection_id}`);
    console.log(`   Findings: ${inspection.findings.length}`);
    
    // 构建报告数据
    console.log("\n📊 构建报告数据...");
    const reportData = await buildReportData(inspection);
    console.log("✅ 报告数据构建完成");
    console.log(`   Immediate: ${reportData.immediate.length}`);
    console.log(`   Recommended: ${reportData.recommended.length}`);
    console.log(`   Plan: ${reportData.plan.length}`);
    
    // 构建 Word 模板数据
    console.log("\n📝 构建 Word 模板数据...");
    const templateData = await buildWordTemplateData(inspection, reportData);
    console.log("✅ 模板数据构建完成");
    console.log(`   Risk Rating: ${templateData.RISK_RATING}`);
    console.log(`   Overall Status: ${templateData.OVERALL_STATUS}`);
    
    // 生成 Markdown
    console.log("\n📄 生成 Markdown...");
    const markdown = generateMarkdownReport(templateData);
    
    // 保存 Markdown 文件
    const outputPath = path.join(__dirname, "..", "test-report.md");
    fs.writeFileSync(outputPath, markdown, "utf8");
    console.log(`✅ Markdown 报告已保存到: ${outputPath}`);
    
    // 显示前 500 个字符预览
    console.log("\n📋 报告预览（前 500 字符）:");
    console.log("---");
    console.log(markdown.substring(0, 500));
    console.log("...");
    console.log("---");
    
    console.log("\n✅ 完成！");
    console.log(`\n📄 完整报告: ${outputPath}`);
    console.log("\n💡 转换为 Word 的方法：");
    console.log("   1. 使用 pandoc: pandoc test-report.md -o test-report.docx");
    console.log("   2. 使用在线工具: https://www.markdowntoword.com/");
    console.log("   3. 在 Word 中直接打开 .md 文件");
    
  } catch (error) {
    console.error("❌ 错误:", error);
    if (error instanceof Error) {
      console.error("   消息:", error.message);
      console.error("   堆栈:", error.stack);
    }
    process.exit(1);
  }
}

main();
