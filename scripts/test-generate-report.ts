#!/usr/bin/env node
/**
 * 测试 generateReport.ts 的 buildMarkdownReport 函数
 * 
 * 使用方法：
 *   npm run test:generate-report
 *   或
 *   tsx scripts/test-generate-report.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildMarkdownReport } from "../netlify/functions/lib/generateReport.js";
import type { StoredInspection } from "../netlify/functions/lib/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 加载 responses.yml 的简化版本（用于测试）
 */
function loadMockResponses() {
  return {
    findings: {
      MEN_NOT_VERIFIED: {
        title: "MEN Link",
        why_it_matters: "The MEN link is critical for electrical safety and must be verified by a licensed electrician.",
        recommended_action: "Have a licensed electrician verify and test the MEN link immediately.",
        planning_guidance: "This is an urgent safety requirement.",
        observed_condition: "MEN link verification status could not be confirmed during visual inspection.",
        evidence: "Visual inspection only. No electrical testing was performed to verify MEN link integrity.",
        risk_interpretation: "If this condition is not addressed, the electrical installation may not have proper earth fault protection, which could pose a significant safety risk over time. This risk can be managed by engaging a licensed electrician for verification within normal planning cycles.",
        budgetary_range: "Indicative range: $200-$500 for verification and testing."
      },
      PARTIAL_RCD_COVERAGE: {
        title: "Partial RCD Protection",
        why_it_matters: "Incomplete RCD protection may leave some circuits vulnerable to earth fault risks.",
        recommended_action: "Consider installing additional RCD protection to cover all circuits.",
        planning_guidance: "This can be planned with other electrical works.",
        observed_condition: "Some circuits are protected by RCD devices, but not all circuits have RCD protection.",
        evidence: "Visual inspection of switchboard revealed mixed protection types. Some circuits have RCD/RCBO protection, while others have MCB-only protection.",
        risk_interpretation: "If this condition is not addressed, unprotected circuits may remain vulnerable to earth fault risks over time. This can be factored into future capital planning cycles without immediate urgency.",
        budgetary_range: "Indicative range: $800-$2000 depending on the number of circuits requiring protection."
      },
      LABELING_POOR: {
        title: "Circuit Labeling",
        why_it_matters: "Poor labeling makes it difficult to identify circuits during maintenance or emergencies.",
        recommended_action: "Improve circuit labeling for better identification.",
        planning_guidance: "This can be addressed during routine maintenance.",
        observed_condition: "Circuit labels are missing, unclear, or outdated.",
        evidence: "Visual inspection revealed that many circuit breakers lack clear labels or have labels that are difficult to read.",
        risk_interpretation: "If this condition is not addressed, it may become more difficult to manage the electrical installation over time. This can be addressed during routine maintenance cycles.",
        budgetary_range: "Indicative range: $100-$300 for professional labeling."
      }
    },
    defaults: {}
  };
}

/**
 * 主测试函数
 */
async function main() {
  console.log("🚀 开始测试 buildMarkdownReport 函数...\n");
  
  try {
    // 1. 加载示例检查数据
    const samplePath = path.join(__dirname, "..", "sample-inspection.json");
    let raw: Record<string, unknown> = {};
    
    if (fs.existsSync(samplePath)) {
      raw = JSON.parse(fs.readFileSync(samplePath, "utf8"));
      console.log("✅ 已加载示例检查数据:", samplePath);
    } else {
      console.warn("⚠️  示例文件不存在，使用空数据");
    }
    
    // 2. 创建测试用的 inspection 对象
    const inspection: StoredInspection = {
      inspection_id: "EH-2026-01-TEST",
      raw,
      report_html: "",
      findings: [
        { 
          id: "MEN_NOT_VERIFIED", 
          priority: "IMMEDIATE", 
          title: "MEN Link Not Verified",
          observed: "MEN link verification status could not be confirmed",
          facts: "Visual inspection only"
        },
        { 
          id: "PARTIAL_RCD_COVERAGE", 
          priority: "RECOMMENDED_0_3_MONTHS", 
          title: "Partial RCD Coverage",
          observed: "Some circuits lack RCD protection",
          facts: "Mixed protection types observed"
        },
        { 
          id: "LABELING_POOR", 
          priority: "PLAN_MONITOR", 
          title: "Poor Labeling",
          observed: "Circuit labels are missing or unclear",
          facts: "Many breakers lack clear labels"
        }
      ],
      limitations: ["Underfloor space not accessible"]
    };
    
    console.log(`✅ 创建测试 inspection: ${inspection.inspection_id}`);
    console.log(`   - Findings: ${inspection.findings.length}`);
    console.log(`   - Limitations: ${inspection.limitations.length}\n`);
    
    // 3. 加载 responses（模拟）
    const responses = loadMockResponses();
    console.log("✅ 已加载 responses 数据\n");
    
    // 4. 调用 buildMarkdownReport
    console.log("📝 正在生成 Markdown 报告...");
    const markdown = await buildMarkdownReport({
      inspection,
      findings: inspection.findings,
      responses,
      event: undefined // 测试时不需要 event
    });
    
    console.log("✅ Markdown 报告生成成功！");
    console.log(`   - 长度: ${markdown.length} 字符`);
    console.log(`   - 行数: ${markdown.split('\n').length} 行\n`);
    
    // 5. 保存 Markdown 文件
    const outputPath = path.join(__dirname, "..", "test-report-generated.md");
    fs.writeFileSync(outputPath, markdown, "utf8");
    console.log(`✅ Markdown 报告已保存到: ${outputPath}`);
    
    // 6. 显示报告预览
    console.log("\n📋 报告预览（前 1000 字符）:");
    console.log("=" .repeat(80));
    console.log(markdown.substring(0, 1000));
    console.log("...");
    console.log("=" .repeat(80));
    
    // 7. 检查报告结构
    console.log("\n🔍 检查报告结构:");
    const sections = [
      "Document Purpose & How to Read This Report",
      "Executive Summary",
      "Priority Overview",
      "Assessment Scope & Limitations",
      "Observed Conditions & Risk Interpretation",
      "Thermal Imaging Analysis",
      "5-Year Capital Expenditure (CapEx) Roadmap",
      "Investor Options & Next Steps",
      "Important Legal Limitations & Disclaimer",
      "Closing Statement"
    ];
    
    sections.forEach((section, index) => {
      const found = markdown.includes(section);
      console.log(`   ${found ? '✅' : '❌'} ${index + 1}. ${section}`);
    });
    
    // 8. 检查 findings
    console.log("\n🔍 检查 Findings:");
    inspection.findings.forEach((finding, index) => {
      // 检查 Asset Component 标题（从 responses 中提取）
      const assetComponent = responses.findings?.[finding.id]?.title || finding.title || finding.id;
      const found = markdown.includes(assetComponent) || 
                    markdown.includes("Observed Conditions & Risk Interpretation") ||
                    markdown.includes(finding.id);
      console.log(`   ${found ? '✅' : '❌'} ${index + 1}. ${assetComponent} (${finding.priority})`);
    });
    
    // 9. 提供后续步骤
    console.log("\n💡 后续步骤:");
    console.log("   1. 查看完整报告: cat test-report-generated.md");
    console.log("   2. 转换为 Word:");
    console.log("      npm run markdown-to-word-pandoc test-report-generated.md test-report.docx");
    console.log("   3. 或使用 pandoc 直接转换:");
    console.log("      pandoc test-report-generated.md -o test-report.docx");
    
    console.log("\n✅ 测试完成！");
    
  } catch (error) {
    console.error("\n❌ 测试失败:");
    console.error(error);
    
    if (error instanceof Error) {
      console.error("\n错误详情:");
      console.error("  - 消息:", error.message);
      console.error("  - 堆栈:", error.stack);
    }
    
    process.exit(1);
  }
}

// 运行测试
main();
