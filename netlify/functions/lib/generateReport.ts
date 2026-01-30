/**
 * 生成完整的 Markdown 报告
 * 
 * 严格遵守：
 * - REPORT_STRUCTURE.md：报告结构（10个部分）
 * - REPORT_GENERATION_RULES.md：非协商性规则
 * - DEFAULT_REPORT_TEXT.md：默认文本库
 * 
 * 输入：
 * - inspection.raw：原始检查数据
 * - findings：发现数组
 * - responses.yml：标准化文本响应
 * 
 * 输出：
 * - 完整的 Markdown 字符串
 */

import type { StoredInspection } from "./store.js";
import { loadDefaultText } from "./defaultTextLoader.js";
import { loadExecutiveSummaryTemplates } from "./executiveSummaryLoader.js";
import { loadResponses } from "../generateWordReport.js";

export type GenerateReportParams = {
  inspection: StoredInspection;
  findings: Array<{ 
    id: string; 
    priority: string; 
    title?: string; 
    observed?: string; 
    facts?: string;
  }>;
  responses: {
    findings?: Record<string, {
      title?: string;
      why_it_matters?: string;
      recommended_action?: string;
      planning_guidance?: string;
      observed_condition?: string;
      evidence?: string;
      risk_interpretation?: string;
      budgetary_range?: string;
    }>;
    defaults?: Record<string, string>;
  };
  event?: any; // HandlerEvent for loading configs
};

/**
 * 提取字段值（处理嵌套对象）
 */
function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    const answerValue = (v as { value: unknown }).value;
    if (typeof answerValue === "object" && answerValue !== null && "value" in (answerValue as object)) {
      return extractValue(answerValue);
    }
    return answerValue;
  }
  return undefined;
}

/**
 * 从 inspection.raw 获取字段值
 */
function getFieldValue(raw: Record<string, unknown>, fieldPath: string): string {
  const parts = fieldPath.split(".");
  let current: unknown = raw;
  
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  
  const value = extractValue(current);
  return value != null ? String(value) : "";
}

/**
 * 将 priority 映射为 Priority Classification
 */
function getPriorityClassification(priority: string): string {
  switch (priority) {
    case "IMMEDIATE":
      return "Urgent Liability Risk";
    case "RECOMMENDED_0_3_MONTHS":
      return "Budgetary Provision Recommended";
    case "PLAN_MONITOR":
      return "Acceptable";
    default:
      return "Acceptable";
  }
}

/**
 * 将 priority 映射为 emoji
 */
function getPriorityEmoji(priority: string): string {
  switch (priority) {
    case "IMMEDIATE":
      return "🔴";
    case "RECOMMENDED_0_3_MONTHS":
      return "🟡";
    case "PLAN_MONITOR":
      return "🟢";
    default:
      return "⚪";
  }
}

/**
 * 将风险等级映射为 emoji
 */
function getRiskEmoji(riskRating: string): string {
  const upper = riskRating.toUpperCase();
  if (upper.includes("HIGH")) return "🔴";
  if (upper.includes("MODERATE")) return "🟡";
  if (upper.includes("LOW")) return "🟢";
  return "🟡";
}

/**
 * 获取 finding 的友好标题（Asset Component）
 */
function getAssetComponent(finding: { id: string; title?: string }, findingsMap: Record<string, any>): string {
  const response = findingsMap[finding.id];
  if (response?.title) {
    // 提取简短名词短语（去除描述性文字）
    const title = response.title;
    // 如果标题包含 "—" 或 ":", 取第一部分
    const shortTitle = title.split(/[—:]/)[0].trim();
    return shortTitle || title;
  }
  return finding.title || finding.id.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * 生成 EXECUTIVE_DECISION_SIGNALS
 * 必须满足非协商性规则：
 * - 至少一句话说明：如果不采取行动会发生什么
 * - 至少一句话说明：为什么这种情况不是立即或紧急风险
 * - 至少一句话说明：为什么风险可以在正常的资产规划周期内管理
 * - 禁止：技术组件名称、标准引用、检查式摘要
 */
function generateExecutiveDecisionSignals(
  immediateCount: number,
  recommendedCount: number,
  planCount: number,
  riskRating: string
): string[] {
  const signals: string[] = [];
  
  if (immediateCount > 0) {
    // 有立即风险的情况
    signals.push(
      `If these ${immediateCount} immediate concern${immediateCount > 1 ? 's' : ''} are not addressed, they may escalate into more significant liability exposure or operational disruption over the next 6-12 months.`
    );
    signals.push(
      `While these items require attention, they do not represent an immediate emergency that would prevent continued use of the property under normal conditions.`
    );
    signals.push(
      `These risks can be managed within standard asset planning cycles, allowing for proper budgeting and contractor engagement without urgent disruption.`
    );
  } else if (recommendedCount > 0) {
    // 只有推荐风险的情况
    signals.push(
      `If the ${recommendedCount} identified item${recommendedCount > 1 ? 's' : ''} are not addressed within the next 12-24 months, they may impact compliance confidence or increase future maintenance costs.`
    );
    signals.push(
      `The current condition does not present an immediate or urgent risk that would prevent normal property operations or tenancy.`
    );
    signals.push(
      `These items can be incorporated into normal asset planning cycles, allowing for strategic budgeting and planned maintenance without immediate urgency.`
    );
  } else {
    // 低风险情况
    signals.push(
      `If routine maintenance is not maintained over the next 3-5 years, some of the observed conditions may gradually impact long-term reliability or compliance confidence.`
    );
    signals.push(
      `The current condition presents no immediate or urgent risk that would impact property operations, tenancy, or insurance coverage.`
    );
    signals.push(
      `Any future considerations can be managed within normal asset planning cycles, with ample time for budgeting and strategic decision-making.`
    );
  }
  
  return signals;
}

/**
 * 生成完整的 Markdown 报告
 * 
 * 严格按照 REPORT_STRUCTURE.md 的顺序：
 * 1. Document Purpose & How to Read This Report
 * 2. Executive Summary (One-Page Only)
 * 3. Priority Overview (Single Table, No Repetition)
 * 4. Assessment Scope & Limitations
 * 5. Observed Conditions & Risk Interpretation（循环：每个 finding 一节）
 * 6. Thermal Imaging Analysis (If Applicable)
 * 7. 5-Year Capital Expenditure (CapEx) Roadmap
 * 8. Investor Options & Next Steps
 * 9. Important Legal Limitations & Disclaimer
 * 10. Closing Statement
 */
export async function buildMarkdownReport(params: GenerateReportParams): Promise<string> {
  const { inspection, findings, responses, event } = params;
  const findingsMap = responses.findings || {};
  const raw = inspection.raw || {};
  
  // 加载默认文本和模板
  const defaultText = await loadDefaultText(event);
  const executiveSummaryTemplates = await loadExecutiveSummaryTemplates(event);
  
  // 计算风险评级
  const immediateCount = findings.filter(f => f.priority === "IMMEDIATE").length;
  const recommendedCount = findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS").length;
  const planCount = findings.filter(f => f.priority === "PLAN_MONITOR").length;
  
  const riskRating = immediateCount > 0 ? "HIGH" : 
                    (recommendedCount > 0 ? "MODERATE" : "LOW");
  const overallStatus = `${riskRating} RISK`;
  
  // 生成 Executive Summary
  let executiveSummary: string;
  if (riskRating === "HIGH") {
    executiveSummary = executiveSummaryTemplates.HIGH || defaultText.EXECUTIVE_SUMMARY;
  } else if (riskRating === "MODERATE") {
    executiveSummary = executiveSummaryTemplates.MODERATE || defaultText.EXECUTIVE_SUMMARY;
  } else {
    let lowRiskSummary = executiveSummaryTemplates.LOW || defaultText.EXECUTIVE_SUMMARY;
    if (planCount > 0) {
      const firstParagraphEnd = lowRiskSummary.indexOf("\n\n");
      if (firstParagraphEnd > 0) {
        const firstPart = lowRiskSummary.substring(0, firstParagraphEnd);
        const secondPart = lowRiskSummary.substring(firstParagraphEnd);
        executiveSummary = `${firstPart}\n\nA small number of non-urgent maintenance observations were noted. These do not require immediate action but should be addressed as part of routine property upkeep to maintain long-term reliability and compliance confidence.\n\n${secondPart}`;
      } else {
        executiveSummary = `${lowRiskSummary}\n\nA small number of non-urgent maintenance observations were noted. These do not require immediate action but should be addressed as part of routine property upkeep to maintain long-term reliability and compliance confidence.`;
      }
    } else {
      executiveSummary = lowRiskSummary;
    }
  }
  
  const md: string[] = [];
  
  // ========================================================================
  // 1. Document Purpose & How to Read This Report
  // ========================================================================
  md.push("# Electrical Asset Risk & Financial Forecast Report");
  md.push("");
  md.push("## Document Purpose & How to Read This Report");
  md.push("");
  md.push("This report is a **decision-support document** designed to assist property owners, investors, and asset managers in understanding the electrical risk profile of the property and planning for future capital expenditure.");
  md.push("");
  md.push("**This report is NOT:**");
  md.push("- An inspection report");
  md.push("- A compliance certificate");
  md.push("- A repair quotation");
  md.push("");
  md.push("**How to use this report:**");
  md.push("- Read the Executive Summary first for a high-level overview");
  md.push("- Review the Priority Overview table to understand the distribution of findings");
  md.push("- Each finding is presented as an independent section with observed conditions, evidence, and risk interpretation");
  md.push("- Use the CapEx Roadmap for financial planning purposes only");
  md.push("- Consult with licensed electrical contractors for detailed quotations and scope of works");
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 2. Executive Summary (One-Page Only)
  // ========================================================================
  md.push("## Executive Summary");
  md.push("");
  
  // Risk Level
  const riskEmoji = getRiskEmoji(riskRating);
  md.push(`### Risk Level: ${riskEmoji} ${overallStatus}`);
  md.push("");
  
  // Executive Summary 正文
  md.push(executiveSummary);
  md.push("");
  
  // EXECUTIVE_DECISION_SIGNALS（必须遵守非协商性规则）
  md.push("### Executive Decision Signals");
  md.push("");
  const decisionSignals = generateExecutiveDecisionSignals(immediateCount, recommendedCount, planCount, riskRating);
  decisionSignals.forEach(signal => {
    md.push(`- ${signal}`);
  });
  md.push("");
  
  // Financial Planning Snapshot
  md.push("### Financial Planning Snapshot");
  md.push("");
  const capexRange = "To be confirmed"; // Can be enhanced later
  md.push(`**Estimated Capital Expenditure Range:** ${capexRange}`);
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 3. Priority Overview (Single Table, No Repetition)
  // ========================================================================
  md.push("## Priority Overview");
  md.push("");
  md.push("| Priority | Count | Classification |");
  md.push("|----------|-------|----------------|");
  md.push(`| 🔴 Immediate | ${immediateCount} | Urgent Liability Risk |`);
  md.push(`| 🟡 Recommended (0-3 months) | ${recommendedCount} | Budgetary Provision Recommended |`);
  md.push(`| 🟢 Planning & Monitoring | ${planCount} | Acceptable |`);
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 4. Assessment Scope & Limitations
  // ========================================================================
  md.push("## Assessment Scope & Limitations");
  md.push("");
  
  // Scope
  md.push("### Scope");
  md.push("");
  md.push("This assessment is based on a visual inspection and limited electrical testing of accessible areas only. It provides a framework for managing electrical risk within acceptable parameters.");
  md.push("");
  
  // Limitations
  const limitations = inspection.limitations || [];
  if (limitations.length > 0) {
    md.push("### Limitations");
    md.push("");
    limitations.forEach(limitation => {
      md.push(`- ${limitation}`);
    });
    md.push("");
  } else {
    md.push("### Limitations");
    md.push("");
    md.push(defaultText.LIMITATIONS || "This assessment is non-invasive and limited to accessible areas only.");
    md.push("");
  }
  
  // Access Information
  md.push("### Access Information");
  md.push("");
  const switchboardAccessible = getFieldValue(raw, "access.switchboard_accessible");
  const roofAccessible = getFieldValue(raw, "access.roof_accessible");
  const underfloorAccessible = getFieldValue(raw, "access.underfloor_accessible");
  
  md.push(`- **Switchboard:** ${switchboardAccessible === "true" ? "Accessible" : "Not accessible"}`);
  md.push(`- **Roof space:** ${roofAccessible === "true" ? "Accessible" : "Not accessible"}`);
  md.push(`- **Underfloor:** ${underfloorAccessible === "true" ? "Accessible" : "Not accessible"}`);
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 5. Observed Conditions & Risk Interpretation（循环：每个 finding 一节）
  // ========================================================================
  md.push("## Observed Conditions & Risk Interpretation");
  md.push("");
  
  if (findings.length === 0) {
    md.push("No findings were identified during this assessment.");
    md.push("");
  } else {
    // 按优先级排序：IMMEDIATE → RECOMMENDED → PLAN
    const sortedFindings = [...findings].sort((a, b) => {
      const priorityOrder: Record<string, number> = {
        "IMMEDIATE": 1,
        "RECOMMENDED_0_3_MONTHS": 2,
        "PLAN_MONITOR": 3,
      };
      return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
    });
    
    sortedFindings.forEach((finding, index) => {
      const response = findingsMap[finding.id] || {};
      const assetComponent = getAssetComponent(finding, findingsMap);
      const priorityEmoji = getPriorityEmoji(finding.priority);
      const priorityClassification = getPriorityClassification(finding.priority);
      
      // 每个 finding 作为独立的一节
      md.push(`### ${index + 1}. ${assetComponent}`);
      md.push("");
      
      // ========================================================================
      // 固定输出顺序（严格遵守 REPORT_GENERATION_RULES.md）
      // ========================================================================
      
      // 1. Asset Component（简短名词短语）
      md.push("#### Asset Component");
      md.push(assetComponent);
      md.push("");
      
      // 2. Observed Condition（客观描述，无意见）
      md.push("#### Observed Condition");
      // observed_condition 可能是数组或字符串
      let observedCondition: string;
      if (Array.isArray(response.observed_condition)) {
        observedCondition = response.observed_condition.join(" ");
      } else if (typeof response.observed_condition === "string") {
        observedCondition = response.observed_condition;
      } else {
        observedCondition = finding.observed || 
                           finding.facts || 
                           response.title ||
                           "Condition observed during inspection.";
      }
      md.push(observedCondition);
      md.push("");
      
      // 3. Evidence（来自 observed_condition）
      md.push("#### Evidence");
      // Evidence 应该来自 observed_condition 数组
      let evidence: string;
      if (Array.isArray(response.observed_condition) && response.observed_condition.length > 0) {
        // 使用 observed_condition 数组作为证据
        evidence = response.observed_condition.join(". ");
        if (!evidence.endsWith(".")) {
          evidence += ".";
        }
      } else if (response.evidence) {
        evidence = response.evidence;
      } else if (finding.facts) {
        evidence = finding.facts;
      } else {
        evidence = "Visual inspection and limited electrical testing performed in accordance with applicable standards.";
      }
      md.push(evidence);
      md.push("");
      
      // 4. Risk Interpretation（必须遵守非协商性规则）
      md.push("#### Risk Interpretation");
      let riskInterpretation = response.risk_interpretation || response.why_it_matters || "";
      
      // 确保包含 "if not addressed" 逻辑
      if (!riskInterpretation.toLowerCase().includes("if not addressed") && 
          !riskInterpretation.toLowerCase().includes("if not")) {
        const ifNotAddressed = response.why_it_matters || 
                              "If this condition is not addressed, it may impact long-term reliability or compliance confidence.";
        riskInterpretation = `${ifNotAddressed}\n\n${riskInterpretation || "This risk can be managed within normal asset planning cycles."}`;
      }
      
      // 确保最少 2 句话
      const sentences = riskInterpretation.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length < 2) {
        riskInterpretation += " This can be factored into future capital planning cycles without immediate urgency.";
      }
      
      md.push(riskInterpretation);
      md.push("");
      
      // 5. Priority Classification
      md.push("#### Priority Classification");
      md.push(`${priorityEmoji} ${priorityClassification}`);
      md.push("");
      
      // 6. Budgetary Planning Range（仅指示性财务范围，无建议）
      md.push("#### Budgetary Planning Range");
      
      // 格式化 budgetary_range
      let budgetaryRangeText: string;
      if (response.budgetary_range) {
        // budgetary_range 可能是对象 {low, high, currency, note} 或字符串
        if (typeof response.budgetary_range === "object" && response.budgetary_range !== null) {
          const range = response.budgetary_range as { low?: number; high?: number; currency?: string; note?: string };
          const currency = range.currency || "AUD";
          const low = range.low;
          const high = range.high;
          
          if (low !== undefined && high !== undefined) {
            budgetaryRangeText = `${currency} $${low} – $${high} (indicative, planning only)`;
            if (range.note) {
              budgetaryRangeText += `. ${range.note}`;
            }
          } else {
            budgetaryRangeText = defaultText.BUDGETARY_RANGE_DEFAULT || 
                                "Indicative market benchmark range to be confirmed through contractor quotations.";
          }
        } else {
          // 如果是字符串，直接使用
          budgetaryRangeText = String(response.budgetary_range);
        }
      } else {
        // 使用默认文本
        budgetaryRangeText = defaultText.BUDGETARY_RANGE_DEFAULT || 
                            "Indicative market benchmark range to be confirmed through contractor quotations.";
      }
      
      md.push(budgetaryRangeText);
      md.push("");
      
      md.push("---");
      md.push("");
    });
  }
  
  // ========================================================================
  // 6. Thermal Imaging Analysis (If Applicable)
  // ========================================================================
  md.push("## Thermal Imaging Analysis");
  md.push("");
  
  const thermalData = getFieldValue(raw, "thermal") || "";
  if (thermalData) {
    // 必须解释为什么热成像增加了风险识别的价值（非协商性规则）
    md.push("Thermal imaging analysis provides a non-invasive method for identifying potential electrical issues that may not be visible during standard visual inspection.");
    md.push("");
    md.push("This technology adds value to risk identification by detecting abnormal heat patterns that may indicate:");
    md.push("- Overloaded circuits or connections");
    md.push("- Loose or deteriorating electrical connections");
    md.push("- Potential failure points before they become critical");
    md.push("");
    md.push("The following thermal imaging data was captured during this assessment:");
    md.push("");
    md.push(thermalData);
  } else {
    md.push("No thermal imaging data was captured for this assessment.");
    md.push("");
    md.push("Thermal imaging can provide additional value as a non-invasive decision support tool by identifying potential issues that may not be visible during standard visual inspection.");
  }
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 7. 5-Year Capital Expenditure (CapEx) Roadmap
  // ========================================================================
  md.push("## 5-Year Capital Expenditure (CapEx) Roadmap");
  md.push("");
  
  // 必须包含免责声明（非协商性规则）
  md.push("**Important:** All figures provided in this section are indicative market benchmarks for financial provisioning purposes only. They are not quotations or scope of works.");
  md.push("");
  
  if (capexRange && capexRange !== "To be confirmed") {
    md.push(`**Estimated Capital Expenditure Range:** ${capexRange}`);
    md.push("");
    md.push("This estimate is based on the identified findings and assumes standard market rates. Actual costs may vary based on contractor selection, material availability, and site-specific conditions.");
  } else {
    md.push("Capital expenditure estimates will be provided upon request based on detailed quotations from licensed electrical contractors.");
  }
  md.push("");
  md.push("**Disclaimer:** Provided for financial provisioning only. Not a quotation or scope of works.");
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 8. Investor Options & Next Steps
  // ========================================================================
  md.push("## Investor Options & Next Steps");
  md.push("");
  
  md.push("### Immediate Actions");
  md.push("");
  if (immediateCount > 0) {
    md.push(`Address the ${immediateCount} item${immediateCount > 1 ? 's' : ''} classified as Urgent Liability Risk. These items may impact liability exposure or operational reliability if not addressed.`);
  } else {
    md.push("No immediate actions are required. The property can continue normal operations.");
  }
  md.push("");
  
  md.push("### Short-term Planning (0-3 months)");
  md.push("");
  if (recommendedCount > 0) {
    md.push(`Consider incorporating the ${recommendedCount} recommended item${recommendedCount > 1 ? 's' : ''} into your asset planning cycle. These can be budgeted and scheduled within normal planning cycles.`);
  } else {
    md.push("No short-term planning items are required at this time.");
  }
  md.push("");
  
  md.push("### Ongoing Monitoring");
  md.push("");
  if (planCount > 0) {
    md.push(`Monitor the ${planCount} item${planCount > 1 ? 's' : ''} identified for ongoing monitoring. These can be addressed during routine maintenance cycles.`);
  } else {
    md.push("No ongoing monitoring items were identified.");
  }
  md.push("");
  
  md.push("### Follow-up Assessment");
  md.push("");
  md.push("Consider a follow-up assessment after completing recommended actions to verify improvements and update the risk profile.");
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 9. Important Legal Limitations & Disclaimer
  // ========================================================================
  md.push("## Important Legal Limitations & Disclaimer");
  md.push("");
  
  // 必须包含法律定位（非协商性规则）
  md.push("**Risk Management Framework:**");
  md.push("");
  md.push("This assessment provides a framework for managing electrical risk within acceptable parameters. It does not eliminate risk, but rather identifies areas where proactive management can reduce potential liability and operational disruption.");
  md.push("");
  md.push("**Limitations:**");
  md.push("");
  md.push("- This report is based on a visual inspection and limited electrical testing of accessible areas only.");
  md.push("- It does not constitute a comprehensive electrical audit or guarantee the absence of defects.");
  md.push("- Some issues may only become apparent during more detailed testing or when systems are under load.");
  md.push("- This report is not a compliance certificate or repair quotation.");
  md.push("- All financial estimates are indicative only and not binding quotations.");
  md.push("");
  md.push("**Use of Information:**");
  md.push("");
  md.push("This report is intended for decision support and financial planning purposes. For detailed technical assessments, repair quotations, or compliance certification, consult with licensed electrical contractors and relevant authorities.");
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 10. Closing Statement
  // ========================================================================
  md.push("## Closing Statement");
  md.push("");
  
  const technicianName = getFieldValue(raw, "signoff.technician_name") || defaultText.PREPARED_BY;
  const assessmentDate = getFieldValue(raw, "created_at") || new Date().toISOString();
  const formattedDate = new Date(assessmentDate).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  
  md.push(`**Prepared by:** ${technicianName}`);
  md.push(`**Assessment Date:** ${formattedDate}`);
  md.push(`**Report Version:** ${defaultText.REPORT_VERSION || "1.0"}`);
  md.push("");
  md.push("For questions or clarifications regarding this report, please contact the inspection provider.");
  md.push("");
  md.push("---");
  md.push("");
  md.push("*End of Report*");
  
  return md.join("\n");
}
