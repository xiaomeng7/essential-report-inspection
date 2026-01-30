#!/usr/bin/env node
/**
 * 升级 responses.yml 中每个 finding 的结构
 * 
 * 新结构：
 * - title (保持不变)
 * - observed_condition (array)
 * - why_it_matters (保留)
 * - risk_interpretation (新增，必须包含 if-not-addressed 逻辑，至少两句)
 * - priority_rationale (新增，解释 why not immediate)
 * - planning_guidance (保留)
 * - budgetary_range {low, high, currency, note} (新增，对象格式)
 * - default_priority (新增)
 * - disclaimer_line (保留)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 根据 why_it_matters 生成 risk_interpretation
 */
function generateRiskInterpretation(whyItMatters: string, title: string): string {
  // 确保包含 if-not-addressed 逻辑，至少两句
  const sentences: string[] = [];
  
  // 第一句：if not addressed 的后果
  if (whyItMatters.toLowerCase().includes("safety") || whyItMatters.toLowerCase().includes("risk")) {
    sentences.push(`If this condition is not addressed, it may pose safety risks or increase liability exposure over time.`);
  } else if (whyItMatters.toLowerCase().includes("reliability") || whyItMatters.toLowerCase().includes("maintainability")) {
    sentences.push(`If this condition is not addressed, it may impact long-term reliability or operational efficiency.`);
  } else {
    sentences.push(`If this condition is not addressed, it may affect electrical safety, reliability, or compliance over time.`);
  }
  
  // 第二句：为什么可以在正常规划周期内管理
  sentences.push(`This risk can be managed within normal asset planning cycles, allowing for proper budgeting and contractor engagement without immediate urgency.`);
  
  return sentences.join(" ");
}

/**
 * 根据 priority 生成 priority_rationale
 */
function generatePriorityRationale(priority: string, whyItMatters: string): string {
  switch (priority) {
    case "IMMEDIATE":
      return "This item requires immediate attention due to potential safety risks or liability exposure that could escalate if not addressed promptly.";
    case "RECOMMENDED_0_3_MONTHS":
      return "While this condition does not present an immediate emergency, addressing it within 0-3 months helps prevent escalation and maintains compliance confidence.";
    case "PLAN_MONITOR":
      return "This condition does not present an immediate or urgent risk and can be monitored over time, allowing for strategic planning and budgeting.";
    default:
      return "This condition can be managed within normal asset planning cycles without immediate urgency.";
  }
}

/**
 * 根据 finding 类型生成默认 budgetary_range
 */
function generateBudgetaryRange(findingId: string, title: string): { low: number; high: number; currency: string; note: string } {
  // 根据 finding 类型估算范围
  const id = findingId.toLowerCase();
  
  if (id.includes("men") || id.includes("earthing") || id.includes("bonding")) {
    return { low: 200, high: 500, currency: "AUD", note: "Verification and testing" };
  } else if (id.includes("rcd") || id.includes("protection")) {
    return { low: 800, high: 2000, currency: "AUD", note: "Depending on number of circuits" };
  } else if (id.includes("switchboard") || id.includes("board")) {
    return { low: 2000, high: 8000, currency: "AUD", note: "Depending on size and complexity" };
  } else if (id.includes("cable") || id.includes("wiring")) {
    return { low: 500, high: 2000, currency: "AUD", note: "Depending on extent of work" };
  } else if (id.includes("alarm") || id.includes("smoke")) {
    return { low: 100, high: 300, currency: "AUD", note: "Per unit" };
  } else if (id.includes("damage") || id.includes("repair")) {
    return { low: 200, high: 1000, currency: "AUD", note: "Depending on component and extent" };
  } else if (id.includes("outlet") || id.includes("power_point") || id.includes("gpo")) {
    return { low: 150, high: 400, currency: "AUD", note: "Per outlet" };
  } else {
    return { low: 200, high: 1000, currency: "AUD", note: "Indicative range, to be confirmed with contractor quotation" };
  }
}

/**
 * 根据 finding ID 推断默认 priority
 */
function inferDefaultPriority(findingId: string): string {
  const id = findingId.toLowerCase();
  
  // IMMEDIATE 优先级
  if (id.includes("men") || id.includes("exposed") || id.includes("arcing") || 
      id.includes("thermal") || id.includes("burn") || id.includes("asbestos") ||
      id.includes("no_rcd") || id.includes("earth_fault") || id.includes("smoke_alarm_failure")) {
    return "IMMEDIATE";
  }
  
  // RECOMMENDED 优先级
  if (id.includes("rcd") || id.includes("partial") || id.includes("degraded") ||
      id.includes("legacy") || id.includes("capacity") || id.includes("mechanical")) {
    return "RECOMMENDED_0_3_MONTHS";
  }
  
  // PLAN_MONITOR 优先级（默认）
  return "PLAN_MONITOR";
}

/**
 * 从 why_it_matters 和 recommended_action 生成 observed_condition 数组
 */
function generateObservedCondition(title: string, whyItMatters: string, recommendedAction?: string): string[] {
  const conditions: string[] = [];
  
  // 基于 title 生成基础观察
  conditions.push(`${title} was observed during the visual inspection.`);
  
  // 如果有 recommended_action，可以添加更多细节
  if (recommendedAction && recommendedAction.length > 20) {
    // 从 recommended_action 提取关键信息
    if (recommendedAction.toLowerCase().includes("verify") || recommendedAction.toLowerCase().includes("test")) {
      conditions.push("Verification or testing may be required to confirm the condition.");
    }
  }
  
  return conditions;
}

/**
 * 升级单个 finding
 */
function upgradeFinding(findingId: string, finding: any): any {
  const upgraded: any = {
    title: finding.title || findingId.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
  };
  
  // observed_condition (array)
  upgraded.observed_condition = generateObservedCondition(
    upgraded.title,
    finding.why_it_matters || "",
    finding.recommended_action
  );
  
  // why_it_matters (保留)
  upgraded.why_it_matters = finding.why_it_matters || "This condition may affect electrical safety, reliability, or maintainability depending on severity and location.";
  
  // risk_interpretation (新增)
  upgraded.risk_interpretation = generateRiskInterpretation(upgraded.why_it_matters, upgraded.title);
  
  // priority_rationale (新增)
  const defaultPriority = inferDefaultPriority(findingId);
  upgraded.priority_rationale = generatePriorityRationale(defaultPriority, upgraded.why_it_matters);
  
  // planning_guidance (保留)
  upgraded.planning_guidance = finding.planning_guidance || "This can be planned with other electrical works to minimise disruption.";
  
  // budgetary_range (新增)
  upgraded.budgetary_range = generateBudgetaryRange(findingId, upgraded.title);
  
  // default_priority (新增)
  upgraded.default_priority = defaultPriority;
  
  // disclaimer_line (保留)
  upgraded.disclaimer_line = finding.disclaimer_line || "";
  
  return upgraded;
}

/**
 * 主函数
 */
function main() {
  const responsesPath = path.join(__dirname, "..", "responses.yml");
  const backupPath = path.join(__dirname, "..", "responses.yml.backup");
  
  console.log("🚀 开始升级 responses.yml...");
  
  // 1. 读取原始文件
  console.log("📖 读取 responses.yml...");
  const content = fs.readFileSync(responsesPath, "utf8");
  const data = yaml.load(content) as any;
  
  // 2. 创建备份
  console.log("💾 创建备份文件...");
  fs.writeFileSync(backupPath, content, "utf8");
  console.log(`✅ 备份已保存到: ${backupPath}`);
  
  // 3. 升级 findings
  console.log("🔄 升级 findings...");
  const upgradedFindings: Record<string, any> = {};
  let count = 0;
  
  for (const [findingId, finding] of Object.entries(data.findings || {})) {
    upgradedFindings[findingId] = upgradeFinding(findingId, finding as any);
    count++;
  }
  
  console.log(`✅ 已升级 ${count} 个 findings`);
  
  // 4. 构建新的数据结构
  const upgradedData = {
    meta: data.meta || {},
    defaults: data.defaults || {},
    findings: upgradedFindings
  };
  
  // 5. 更新 meta 信息
  upgradedData.meta.version = "v2.0";
  upgradedData.meta.updated = new Date().toISOString().split('T')[0];
  upgradedData.meta.notes = "Upgraded structure with observed_condition, risk_interpretation, priority_rationale, budgetary_range, and default_priority";
  
  // 6. 写入新文件
  console.log("💾 写入升级后的文件...");
  const yamlContent = yaml.dump(upgradedData, {
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
    sortKeys: false
  });
  
  fs.writeFileSync(responsesPath, yamlContent, "utf8");
  console.log(`✅ 升级完成！文件已保存到: ${responsesPath}`);
  
  // 7. 显示示例
  const firstFindingId = Object.keys(upgradedFindings)[0];
  console.log("\n📋 示例 finding 结构:");
  console.log("=" .repeat(80));
  console.log(yaml.dump({ [firstFindingId]: upgradedFindings[firstFindingId] }, { indent: 2 }));
  console.log("=" .repeat(80));
}

main();
