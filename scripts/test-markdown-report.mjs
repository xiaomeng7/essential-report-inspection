#!/usr/bin/env node
/**
 * 生成 Markdown 格式的报告（简化版，使用 .mjs 可直接运行）
 * 
 * 使用方法：
 *   node scripts/test-markdown-report.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 由于是 ES module，我们需要使用动态导入
async function main() {
  console.log("🚀 开始生成 Markdown 报告...");
  
  try {
    // 动态导入 TypeScript 模块（需要先编译）
    // 或者直接在这里实现逻辑
    
    // 读取示例数据
    const samplePath = path.join(__dirname, "..", "sample-inspection.json");
    let raw = {};
    
    if (fs.existsSync(samplePath)) {
      raw = JSON.parse(fs.readFileSync(samplePath, "utf8"));
    }
    
    // 创建测试数据
    const inspection = {
      inspection_id: "EH-2026-01-TEST",
      raw,
      report_html: "",
      findings: [
        { id: "MEN_NOT_VERIFIED", priority: "IMMEDIATE", title: "MEN Link Not Verified" },
        { id: "PARTIAL_RCD_COVERAGE", priority: "RECOMMENDED_0_3_MONTHS", title: "Partial RCD Coverage" },
        { id: "LABELING_POOR", priority: "PLAN_MONITOR", title: "Poor Labeling" }
      ],
      limitations: ["Roof space not accessible"]
    };
    
    // 模拟 templateData（实际应该调用 buildWordTemplateData）
    const templateData = {
      INSPECTION_ID: inspection.inspection_id,
      ASSESSMENT_DATE: new Date().toISOString().split('T')[0],
      PREPARED_FOR: "Test Client",
      PREPARED_BY: "Better Home Technology Pty Ltd",
      PROPERTY_ADDRESS: raw.job?.address?.value || "123 Example St",
      PROPERTY_TYPE: raw.job?.property_type?.value || "House",
      IMMEDIATE_FINDINGS: "• MEN Link Not Verified\n\nWhy it matters: The MEN link is critical for electrical safety.\n\nRecommended action: Have a licensed electrician verify and test the MEN link immediately.",
      RECOMMENDED_FINDINGS: "• Partial RCD Coverage\n\nWhy it matters: Incomplete RCD protection may leave some circuits vulnerable.\n\nRecommended action: Install additional RCD protection.\n\nPlanning guidance: This can be planned with other electrical works.",
      PLAN_FINDINGS: "• Poor Labeling\n\nWhy it matters: Poor labeling makes it difficult to identify circuits.\n\nPlanning guidance: Improve labeling during routine maintenance.",
      LIMITATIONS: "• Roof space not accessible",
      URGENT_FINDINGS: "• MEN Link Not Verified",
      REPORT_VERSION: "1.0",
      OVERALL_STATUS: "HIGH RISK",
      OVERALL_ELECTRICAL_STATUS: "HIGH RISK",
      EXECUTIVE_SUMMARY: "This property presents a high electrical risk profile at the time of inspection.\n\nOne or more issues were identified that may pose safety, compliance, or operational risks if left unaddressed.",
      RISK_RATING: "HIGH",
      RISK_RATING_FACTORS: "1 immediate safety concern(s)",
      PRIORITY_IMMEDIATE_DESC: "Immediate safety concerns require urgent attention.",
      PRIORITY_IMMEDIATE_INTERP: "These items pose immediate safety risks and should be addressed as soon as possible.",
      PRIORITY_RECOMMENDED_DESC: "Recommended actions should be planned and completed within 0-3 months.",
      PRIORITY_RECOMMENDED_INTERP: "These items require attention in the short term.",
      PRIORITY_PLAN_DESC: "Items identified for ongoing monitoring.",
      PRIORITY_PLAN_INTERP: "These items can be monitored over time.",
      TEST_SUMMARY: "Electrical safety inspection completed in accordance with applicable standards.",
      TECHNICAL_NOTES: "Limitations: Roof space not accessible; This is a non-invasive visual inspection limited to accessible areas."
    };
    
    // 生成 Markdown
    const md = generateMarkdownReport(templateData);
    
    // 保存文件
    const outputPath = path.join(__dirname, "..", "test-report.md");
    fs.writeFileSync(outputPath, md, "utf8");
    
    console.log(`✅ Markdown 报告已保存到: ${outputPath}`);
    console.log("\n📋 报告预览（前 500 字符）:");
    console.log("---");
    console.log(md.substring(0, 500));
    console.log("...");
    console.log("---");
    
    console.log("\n💡 转换为 Word 的方法：");
    console.log("   1. 使用 pandoc: pandoc test-report.md -o test-report.docx");
    console.log("   2. 使用在线工具: https://www.markdowntoword.com/");
    console.log("   3. 在 Word 中直接打开 .md 文件");
    
  } catch (error) {
    console.error("❌ 错误:", error);
    process.exit(1);
  }
}

function generateMarkdownReport(templateData) {
  const md = [];
  
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
  md.push(templateData.EXECUTIVE_SUMMARY.split("\n").map(line => line.trim()).filter(line => line).join("\n\n"));
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
    md.push(templateData.IMMEDIATE_FINDINGS.split("\n").map(line => {
      if (line.startsWith("•")) return line;
      return line.trim();
    }).filter(line => line).join("\n\n"));
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
    md.push(templateData.RECOMMENDED_FINDINGS.split("\n").map(line => {
      if (line.startsWith("•")) return line;
      return line.trim();
    }).filter(line => line).join("\n\n"));
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
    md.push(templateData.PLAN_FINDINGS.split("\n").map(line => {
      if (line.startsWith("•")) return line;
      return line.trim();
    }).filter(line => line).join("\n\n"));
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
  md.push(templateData.LIMITATIONS.split("\n").map(line => {
    if (line.startsWith("•")) return line;
    return line.trim();
  }).filter(line => line).join("\n\n"));
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

main();
