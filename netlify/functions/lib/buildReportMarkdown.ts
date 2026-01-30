/**
 * 构建报告 Markdown 内容
 * 
 * 将 inspection、findings、responses 和 computed 字段组合成完整的 Markdown 报告
 * 确保所有字段都有值，不会出现 undefined
 */

import type { StoredInspection } from "./store.js";

export type ComputedFields = {
  OVERALL_STATUS?: string;
  RISK_RATING?: string;
  CAPEX_RANGE?: string;
  EXECUTIVE_SUMMARY?: string;
  [key: string]: any;
};

export type BuildReportMarkdownParams = {
  inspection: StoredInspection;
  findings: Array<{ id: string; priority: string; title?: string; observed?: string; facts?: string }>;
  responses: {
    findings?: Record<string, {
      title?: string;
      why_it_matters?: string;
      recommended_action?: string;
      planning_guidance?: string;
    }>;
    defaults?: Record<string, string>;
  };
  computed: ComputedFields;
};

/**
 * 将 priority 映射为 emoji 和文本
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
  return "🟡"; // 默认
}

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
 * 构建报告 Markdown
 * 
 * 报告结构：
 * 1. Purpose
 * 2. Executive Summary
 * 3. Priority 表
 * 4. Scope/Limits
 * 5. Findings 循环
 * 6. Thermal Imaging
 * 7. CapEx
 * 8. Options
 * 9. Disclaimer
 * 10. Closing
 */
export function buildReportMarkdown(params: BuildReportMarkdownParams): string {
  const { inspection, findings, responses, computed } = params;
  const findingsMap = responses.findings || {};
  const raw = inspection.raw || {};
  
  const md: string[] = [];
  
  // ========================================================================
  // 1. Purpose
  // ========================================================================
  md.push("# Electrical Property Health Assessment");
  md.push("");
  md.push("## Purpose");
  md.push("");
  md.push("This report provides a comprehensive assessment of the electrical condition of the property, identifying safety concerns, compliance issues, and maintenance recommendations based on a visual inspection and electrical testing performed in accordance with applicable standards.");
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 2. Executive Summary
  // ========================================================================
  md.push("## Executive Summary");
  md.push("");
  
  // 风险等级
  const riskRating = computed.RISK_RATING || "MODERATE";
  const riskEmoji = getRiskEmoji(riskRating);
  const overallStatus = computed.OVERALL_STATUS || `${riskRating} RISK`;
  
  md.push(`### Risk Level: ${riskEmoji} ${overallStatus}`);
  md.push("");
  
  // Executive Summary 正文
  const executiveSummary = computed.EXECUTIVE_SUMMARY || 
    "This property presents a moderate electrical risk profile at the time of inspection. Some issues were identified that may require attention.";
  md.push(executiveSummary);
  md.push("");
  
  // Key Decision Signals（根据 findings 计数生成）
  md.push("### Key Decision Signals");
  md.push("");
  
  const immediateCount = findings.filter(f => f.priority === "IMMEDIATE").length;
  const recommendedCount = findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS").length;
  const planCount = findings.filter(f => f.priority === "PLAN_MONITOR").length;
  
  if (immediateCount === 0) {
    md.push("- No immediate safety hazards detected");
  } else {
    md.push(`- ${immediateCount} immediate safety concern(s) requiring urgent attention`);
  }
  
  if (recommendedCount > 0) {
    md.push(`- ${recommendedCount} recommended action(s) should be planned within 0-3 months`);
  }
  
  if (planCount > 0) {
    md.push(`- ${planCount} item(s) identified for ongoing monitoring`);
  }
  
  md.push("");
  
  // Financial Planning Snapshot
  md.push("### Financial Planning Snapshot");
  md.push("");
  const capexRange = computed.CAPEX_RANGE || "To be confirmed";
  md.push(`**Estimated Capital Expenditure Range:** ${capexRange}`);
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 3. Priority 表
  // ========================================================================
  md.push("## Priority Summary");
  md.push("");
  md.push("| Priority | Count | Description |");
  md.push("|----------|-------|-------------|");
  md.push(`| 🔴 Immediate | ${immediateCount} | Safety concerns requiring urgent attention |`);
  md.push(`| 🟡 Recommended (0-3 months) | ${recommendedCount} | Items requiring short-term planned action |`);
  md.push(`| 🟢 Planning & Monitoring | ${planCount} | Items for ongoing monitoring |`);
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 4. Scope/Limits
  // ========================================================================
  md.push("## Scope & Limitations");
  md.push("");
  
  const limitations = inspection.limitations || [];
  if (limitations.length > 0) {
    md.push("### Limitations");
    md.push("");
    limitations.forEach(limitation => {
      md.push(`- ${limitation}`);
    });
    md.push("");
  } else {
    md.push("No significant limitations were identified during this assessment.");
    md.push("");
  }
  
  // Access information
  const switchboardAccessible = getFieldValue(raw, "access.switchboard_accessible");
  const roofAccessible = getFieldValue(raw, "access.roof_accessible");
  const underfloorAccessible = getFieldValue(raw, "access.underfloor_accessible");
  
  md.push("### Access");
  md.push("");
  md.push(`- Switchboard: ${switchboardAccessible === "true" ? "Accessible" : "Not accessible"}`);
  md.push(`- Roof space: ${roofAccessible === "true" ? "Accessible" : "Not accessible"}`);
  md.push(`- Underfloor: ${underfloorAccessible === "true" ? "Accessible" : "Not accessible"}`);
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 5. Findings 循环
  // ========================================================================
  md.push("## Detailed Findings");
  md.push("");
  
  if (findings.length === 0) {
    md.push("No findings were identified during this assessment.");
    md.push("");
  } else {
    // 按优先级分组
    const immediateFindings = findings.filter(f => f.priority === "IMMEDIATE");
    const recommendedFindings = findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS");
    const planFindings = findings.filter(f => f.priority === "PLAN_MONITOR");
    
    // Immediate Findings
    if (immediateFindings.length > 0) {
      md.push("### Immediate Safety Concerns");
      md.push("");
      immediateFindings.forEach((finding, index) => {
        md.push(`#### ${index + 1}. Asset Component — ${getFindingTitle(finding, findingsMap)}`);
        md.push("");
        md.push(`**Priority:** ${getPriorityEmoji(finding.priority)} Immediate`);
        md.push("");
        
        // Observed Condition
        const observed = finding.observed || finding.facts || 
          (findingsMap[finding.id]?.title || finding.title || finding.id.replace(/_/g, " "));
        md.push(`**Observed Condition:** ${observed}`);
        md.push("");
        
        // Risk Interpretation
        const whyItMatters = findingsMap[finding.id]?.why_it_matters || 
          "This issue may pose safety, compliance, or operational risks if left unaddressed.";
        md.push(`**Risk Interpretation:** ${whyItMatters}`);
        md.push("");
        
        // Recommended Action
        const recommendedAction = findingsMap[finding.id]?.recommended_action;
        if (recommendedAction) {
          md.push(`**Recommended Action:** ${recommendedAction}`);
          md.push("");
        }
        
        // Planning Guidance（可选）
        const planningGuidance = findingsMap[finding.id]?.planning_guidance;
        if (planningGuidance) {
          md.push(`**Planning Guidance:** ${planningGuidance}`);
          md.push("");
        }
        
        md.push("---");
        md.push("");
      });
    }
    
    // Recommended Findings
    if (recommendedFindings.length > 0) {
      md.push("### Recommended Actions (0-3 Months)");
      md.push("");
      recommendedFindings.forEach((finding, index) => {
        md.push(`#### ${index + 1}. Asset Component — ${getFindingTitle(finding, findingsMap)}`);
        md.push("");
        md.push(`**Priority:** ${getPriorityEmoji(finding.priority)} Recommended (0-3 months)`);
        md.push("");
        
        const observed = finding.observed || finding.facts || 
          (findingsMap[finding.id]?.title || finding.title || finding.id.replace(/_/g, " "));
        md.push(`**Observed Condition:** ${observed}`);
        md.push("");
        
        const whyItMatters = findingsMap[finding.id]?.why_it_matters || 
          "This item requires attention in the short term to maintain safety and compliance.";
        md.push(`**Risk Interpretation:** ${whyItMatters}`);
        md.push("");
        
        const recommendedAction = findingsMap[finding.id]?.recommended_action;
        if (recommendedAction) {
          md.push(`**Recommended Action:** ${recommendedAction}`);
          md.push("");
        }
        
        const planningGuidance = findingsMap[finding.id]?.planning_guidance;
        if (planningGuidance) {
          md.push(`**Planning Guidance:** ${planningGuidance}`);
          md.push("");
        }
        
        md.push("---");
        md.push("");
      });
    }
    
    // Plan Findings
    if (planFindings.length > 0) {
      md.push("### Planning & Monitoring");
      md.push("");
      planFindings.forEach((finding, index) => {
        md.push(`#### ${index + 1}. Asset Component — ${getFindingTitle(finding, findingsMap)}`);
        md.push("");
        md.push(`**Priority:** ${getPriorityEmoji(finding.priority)} Planning & Monitoring`);
        md.push("");
        
        const observed = finding.observed || finding.facts || 
          (findingsMap[finding.id]?.title || finding.title || finding.id.replace(/_/g, " "));
        md.push(`**Observed Condition:** ${observed}`);
        md.push("");
        
        const whyItMatters = findingsMap[finding.id]?.why_it_matters || 
          "This item can be monitored over time and addressed during routine maintenance.";
        md.push(`**Risk Interpretation:** ${whyItMatters}`);
        md.push("");
        
        const planningGuidance = findingsMap[finding.id]?.planning_guidance;
        if (planningGuidance) {
          md.push(`**Planning Guidance:** ${planningGuidance}`);
          md.push("");
        }
        
        md.push("---");
        md.push("");
      });
    }
  }
  
  // ========================================================================
  // 6. Test Data & Technical Notes
  // ========================================================================
  md.push("## Test Data & Technical Notes");
  md.push("");
  
  const testSummary = getFieldValue(raw, "rcd_tests.summary") || 
    getFieldValue(raw, "gpo_tests.summary") ||
    "";
  
  if (testSummary) {
    md.push("### Test Summary");
    md.push("");
    md.push(testSummary);
    md.push("");
  } else {
    md.push("No test data captured for this assessment.");
    md.push("");
  }
  
  // Technical Notes
  const technicalNotes = getFieldValue(raw, "signoff.office_notes_internal") ||
    getFieldValue(raw, "access.notes") ||
    "";
  
  if (technicalNotes) {
    md.push("### Technical Notes");
    md.push("");
    md.push(technicalNotes);
    md.push("");
  }
  
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 7. Thermal Imaging
  // ========================================================================
  md.push("## Thermal Imaging");
  md.push("");
  
  const thermalData = getFieldValue(raw, "thermal") || "";
  if (thermalData) {
    md.push(thermalData);
  } else {
    md.push("No thermal imaging data captured for this assessment.");
  }
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 8. CapEx
  // ========================================================================
  md.push("## Capital Expenditure Planning");
  md.push("");
  
  if (computed.CAPEX_RANGE && computed.CAPEX_RANGE !== "To be confirmed") {
    md.push(`**Estimated Range:** ${computed.CAPEX_RANGE}`);
    md.push("");
    md.push("This estimate is based on the identified findings and assumes standard market rates. Actual costs may vary based on contractor selection, material availability, and site-specific conditions.");
  } else {
    md.push("Capital expenditure estimates will be provided upon request based on detailed quotations from licensed electrical contractors.");
  }
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 9. Options
  // ========================================================================
  md.push("## Options & Next Steps");
  md.push("");
  md.push("1. **Immediate Actions:** Address all immediate safety concerns as soon as possible.");
  md.push("2. **Short-term Planning:** Plan and complete recommended actions within 0-3 months.");
  md.push("3. **Ongoing Monitoring:** Monitor planning items and address during routine maintenance.");
  md.push("4. **Follow-up Assessment:** Consider a follow-up assessment after completing recommended actions.");
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 10. Disclaimer
  // ========================================================================
  md.push("## Disclaimer");
  md.push("");
  md.push("This report is based on a visual inspection and limited electrical testing of accessible areas only. It does not constitute a comprehensive electrical audit or guarantee the absence of defects. Some issues may only become apparent during more detailed testing or when systems are under load.");
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 11. Closing
  // ========================================================================
  md.push("## Closing");
  md.push("");
  
  const technicianName = getFieldValue(raw, "signoff.technician_name") || "Licensed Electrician";
  const assessmentDate = getFieldValue(raw, "created_at") || new Date().toISOString();
  const formattedDate = new Date(assessmentDate).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  
  md.push(`Prepared by: ${technicianName}`);
  md.push(`Assessment Date: ${formattedDate}`);
  md.push("");
  md.push("For questions or clarifications regarding this report, please contact the inspection provider.");
  md.push("");
  
  return md.join("\n");
}

/**
 * 获取 finding 的友好标题
 */
function getFindingTitle(
  finding: { id: string; title?: string },
  findingsMap: Record<string, { title?: string }>
): string {
  return findingsMap[finding.id]?.title || 
    finding.title || 
    finding.id.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}
