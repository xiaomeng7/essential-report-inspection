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

import type { StoredInspection } from "./store";
import { loadDefaultText } from "./defaultTextLoader";
import { loadExecutiveSummaryTemplates } from "./executiveSummaryLoader";
import { loadResponses, buildReportData, type ReportData } from "../generateWordReport";
import { normalizeInspection, type CanonicalInspection } from "./normalizeInspection";
import { getFindingProfile } from "./findingProfilesLoader";
import { tagFindingsWithOTR, getCoveredOTRCategories, getCoveredOTRTests, type FindingWithOTR } from "./otrMapping";

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
  
  // Normalize inspection raw data to canonical fields
  const { canonical, missingFields } = normalizeInspection(inspection.raw || {}, inspection.inspection_id);
  if (missingFields.length > 0) {
    console.warn(`⚠️ Missing canonical fields: ${missingFields.join(", ")}`);
  }
  
  // Tag findings with OTR metadata (internal only, not visible to technicians)
  const findingsWithOTR: FindingWithOTR[] = tagFindingsWithOTR(findings);
  const coveredOTRCategories = getCoveredOTRCategories(findingsWithOTR);
  const testData = canonical.test_data || {};
  const coveredOTRTests = getCoveredOTRTests(testData);
  
  // 加载默认文本和模板
  const defaultText = await loadDefaultText(event);
  const executiveSummaryTemplates = await loadExecutiveSummaryTemplates(event);
  
  // 计算 CapEx summary（供 Executive Summary 和 CapEx Roadmap 使用）
  const reportData = await buildReportData(inspection, event);
  const capexLow = reportData.capex_low_total;
  const capexHigh = reportData.capex_high_total;
  const capexCurrency = reportData.capex_currency || "AUD";
  const capexNote = reportData.capex_note;
  
  // 使用从 finding profiles 计算的风险评级
  const riskRating = reportData.RISK_RATING;
  const overallStatus = reportData.OVERALL_STATUS;
  
  // 保留计数用于其他用途
  const immediateCount = findings.filter(f => f.priority === "IMMEDIATE").length;
  const recommendedCount = findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS").length;
  const planCount = findings.filter(f => f.priority === "PLAN_MONITOR").length;
  
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
  
  // Use CapEx summary (already calculated above)
  if (capexLow === 0 && capexHigh === 0) {
    md.push(`**Estimated Capital Expenditure Range:** ${capexCurrency} $0 – $0`);
    md.push("");
    md.push(`*${capexNote}*`);
  } else {
    md.push(`**Estimated Capital Expenditure Range:** ${capexCurrency} $${capexLow} – $${capexHigh} (indicative, planning only)`);
    if (capexNote) {
      md.push("");
      md.push(`*${capexNote}*`);
    }
  }
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
  
  // OTR/AS3000 Alignment Statement (internal mapping, decision-support tone)
  if (coveredOTRCategories.length > 0 || coveredOTRTests.length > 0) {
    md.push("This inspection includes visual inspection and testing aligned with AS/NZS 3000:2018 (Wiring Rules) and OTR Verification of Electrical Installation requirements. The assessment covers the following areas:");
    md.push("");
    
    if (coveredOTRCategories.length > 0) {
      const categoryLabels: Record<string, string> = {
        general: "General visual inspection",
        consumer_mains: "Consumer mains and service connections",
        switchboards: "Switchboards, enclosures, and protection devices",
        wiring_systems: "Wiring systems, cables, and installation methods",
        electrical_equipment: "Electrical equipment, appliances, and accessories",
        earthing: "Earthing, MEN connection, and bonding",
      };
      
      md.push("- " + coveredOTRCategories.map(cat => categoryLabels[cat] || cat).join("\n- "));
      md.push("");
    }
    
    if (coveredOTRTests.length > 0) {
      const testLabels: Record<string, string> = {
        earth_continuity: "Earth continuity testing",
        insulation_resistance: "Insulation resistance testing",
        polarity: "Polarity testing",
        earth_fault_loop_impedance: "Earth fault loop impedance assessment",
        rcd_tests: "RCD testing",
        men_connection: "MEN connection verification",
      };
      
      md.push("Mandatory test concepts covered:");
      md.push("- " + coveredOTRTests.map(test => testLabels[test] || test).join("\n- "));
      md.push("");
    }
    
    md.push("*Note: This report is a decision-support document and does not constitute a compliance certificate or regulatory enforcement judgment.*");
    md.push("");
  }
  
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
  
  // Access Information (from test_data if available, otherwise empty)
  const testData = canonical.test_data || {};
  const switchboardAccessible = (testData as any)?.access?.switchboard_accessible;
  const roofAccessible = (testData as any)?.access?.roof_accessible;
  const underfloorAccessible = (testData as any)?.access?.underfloor_accessible;
  
  md.push("### Access Information");
  md.push("");
  md.push(`- **Switchboard:** ${switchboardAccessible === "true" || switchboardAccessible === true ? "Accessible" : "Not accessible"}`);
  md.push(`- **Roof space:** ${roofAccessible === "true" || roofAccessible === true ? "Accessible" : "Not accessible"}`);
  const underfloorLabel =
    underfloorAccessible === "not_applicable"
      ? "N/A (no underfloor)"
      : underfloorAccessible === "true" || underfloorAccessible === true || underfloorAccessible === "accessible"
        ? "Accessible"
        : "Not accessible";
  md.push(`- **Underfloor:** ${underfloorLabel}`);
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 5. Observed Conditions & Risk Interpretation（循环：每个 finding 一节）
  // ========================================================================
  md.push("## Observed Conditions & Risk Interpretation");
  md.push("");
  
  if (findingsWithOTR.length === 0) {
    md.push("No findings were identified during this assessment.");
    md.push("");
  } else {
    // Use findings with OTR metadata, sorted by priority
    const sortedFindings = [...findingsWithOTR].sort((a, b) => {
      const priorityOrder: Record<string, number> = {
        "IMMEDIATE": 1,
        "RECOMMENDED_0_3_MONTHS": 2,
        "PLAN_MONITOR": 3,
      };
      return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
    });
    
    sortedFindings.forEach((finding, index) => {
      // 获取 finding profile（新结构）
      const profile = getFindingProfile(finding.id);
      
      // 使用 profile.messaging.title（不再只用 responses.yml title）
      const assetComponent = profile.messaging?.title || 
                            findingsMap[finding.id]?.title || 
                            finding.title || 
                            finding.id.replace(/_/g, " ");
      const priorityEmoji = getPriorityEmoji(finding.priority);
      const priorityClassification = getPriorityClassification(finding.priority);
      
      // 每个 finding 作为独立的一节
      md.push(`### ${index + 1}. ${assetComponent}`);
      md.push("");
      
      // ========================================================================
      // 固定输出顺序（严格遵守 REPORT_GENERATION_RULES.md）
      // ========================================================================
      
      // 1. Asset Component（title）
      md.push("#### Asset Component");
      md.push(assetComponent);
      md.push("");
      
      // 2. Observed Condition（来自 raw evidence 或默认一句）
      md.push("#### Observed Condition");
      let observedCondition: string;
      
      // 优先从 responses.yml 读取（保持向后兼容）
      const response = findingsMap[finding.id] || {};
      if (Array.isArray(response.observed_condition) && response.observed_condition.length > 0) {
        observedCondition = response.observed_condition.join(". ");
        if (!observedCondition.endsWith(".")) {
          observedCondition += ".";
        }
      } else if (typeof response.observed_condition === "string") {
        observedCondition = response.observed_condition;
      } else {
        // 尝试从 raw 读取 observed/facts
        observedCondition = finding.observed || 
                           finding.facts || 
                           `${assetComponent} was observed during the visual inspection.`;
      }
      md.push(observedCondition);
      md.push("");
      
      // 3. Evidence（如果 raw 没有就写 "No photographic evidence captured at time of assessment."）
      md.push("#### Evidence");
      let evidence: string = "No photographic evidence captured at time of assessment.";
      
      // 尝试从 raw 读取 photo_ids 或 evidence
      const rawForEvidence = inspection.raw || {};
      const testDataForEvidence = canonical.test_data || {};
      
      // 检查是否有 photo_ids（可能在 finding 对象中，或在 raw 的各个 section 中）
      const findingPhotoIds = (finding as any)?.photo_ids || (finding as any)?.evidence?.photo_ids;
      
      // 尝试从 raw 的各个 section 查找 photo_ids
      let sectionPhotoIds: unknown = undefined;
      const findingIdLower = finding.id.toLowerCase();
      
      // 辅助函数：从对象中获取嵌套值（支持数组）
      function getNestedValue(obj: unknown, path: string): unknown {
        const parts = path.split(".");
        let current: unknown = obj;
        for (const part of parts) {
          if (current == null || typeof current !== "object") return undefined;
          current = (current as Record<string, unknown>)[part];
        }
        return extractValue(current);
      }
      
      // 检查常见的位置
      const possiblePaths = [
        `${findingIdLower}.photo_ids`,
        `exceptions.${findingIdLower}.photo_ids`,
        `rcd_tests.exceptions.photo_ids`,
        `gpo_tests.exceptions.photo_ids`,
      ];
      
      for (const path of possiblePaths) {
        const value = getNestedValue(rawForEvidence, path) || getNestedValue(testDataForEvidence, path);
        if (value && (Array.isArray(value) || typeof value === "string")) {
          sectionPhotoIds = value;
          break;
        }
      }
      
      if (findingPhotoIds && Array.isArray(findingPhotoIds) && findingPhotoIds.length > 0) {
        evidence = `Photo evidence provided: ${findingPhotoIds.join(", ")}.`;
      } else if (sectionPhotoIds) {
        if (Array.isArray(sectionPhotoIds) && sectionPhotoIds.length > 0) {
          evidence = `Photo evidence provided: ${sectionPhotoIds.join(", ")}.`;
        } else if (typeof sectionPhotoIds === "string" && sectionPhotoIds.trim().length > 0) {
          evidence = sectionPhotoIds;
        }
      }
      
      // 如果还没有 evidence，尝试其他来源
      if (evidence === "No photographic evidence captured at time of assessment.") {
        if (finding.facts && finding.facts.trim().length > 0) {
          evidence = finding.facts;
        } else if (Array.isArray(response.observed_condition) && response.observed_condition.length > 0) {
          // 使用 observed_condition 作为证据
          evidence = response.observed_condition.join(". ");
          if (!evidence.endsWith(".")) {
            evidence += ".";
          }
        }
      }
      
      md.push(evidence);
      md.push("");
      
      // 4. Risk Interpretation（必须包含 why_it_matters + if_not_addressed）
      md.push("#### Risk Interpretation");
      
      // 使用 profile.messaging 中的 why_it_matters 和 if_not_addressed
      const whyItMatters = profile.messaging?.why_it_matters || 
                          response.why_it_matters || 
                          "This condition may affect electrical safety, reliability, or compliance depending on severity and location.";
      
      const ifNotAddressed = profile.messaging?.if_not_addressed || 
                            response.risk_interpretation?.match(/If.*not.*addressed[^.]*\./i)?.[0] ||
                            "If this condition is not addressed, it may impact long-term reliability or compliance confidence.";
      
      // 组合 why_it_matters + if_not_addressed
      let riskInterpretation = `${whyItMatters}\n\n${ifNotAddressed}`;
      
      // 确保最少 2 句话
      const sentences = riskInterpretation.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length < 2) {
        riskInterpretation += " This risk can be managed within normal asset planning cycles.";
      }
      
      md.push(riskInterpretation);
      md.push("");
      
      // 5. Priority Classification（由 priority）
      md.push("#### Priority Classification");
      md.push(`${priorityEmoji} ${priorityClassification}`);
      md.push("");
      
      // 6. Budgetary Planning Range（由 budget 级别映射区间）
      md.push("#### Budgetary Planning Range");
      
      // 使用 profile.budget 映射到预算区间
      const budgetLevel = profile.budget || "horizon";
      let budgetaryRangeText: string;
      
      // budget 级别映射到预算区间
      const budgetRanges: Record<string, { low: number; high: number }> = {
        horizon: { low: 0, high: 0 },      // 长期规划，无具体预算
        low: { low: 200, high: 1000 },      // 低预算范围
        high: { low: 2000, high: 10000 },   // 高预算范围
      };
      
      // 如果 responses.yml 中有 budgetary_range，优先使用（向后兼容）
      if (response.budgetary_range) {
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
            // Fallback to budget level mapping
            const mappedRange = budgetRanges[budgetLevel] || budgetRanges.horizon;
            if (mappedRange.low === 0 && mappedRange.high === 0) {
              budgetaryRangeText = defaultText.BUDGETARY_RANGE_DEFAULT || 
                                  "Indicative market benchmark range to be confirmed through contractor quotations.";
            } else {
              budgetaryRangeText = `AUD $${mappedRange.low} – $${mappedRange.high} (indicative, planning only)`;
            }
          }
        } else {
          budgetaryRangeText = String(response.budgetary_range);
        }
      } else {
        // 使用 budget level 映射
        const mappedRange = budgetRanges[budgetLevel] || budgetRanges.horizon;
        if (mappedRange.low === 0 && mappedRange.high === 0) {
          budgetaryRangeText = defaultText.BUDGETARY_RANGE_DEFAULT || 
                              "Indicative market benchmark range to be confirmed through contractor quotations.";
        } else {
          budgetaryRangeText = `AUD $${mappedRange.low} – $${mappedRange.high} (indicative, planning only)`;
        }
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
  
  // Thermal data from test_data if available
  const testDataForThermal = canonical.test_data || {};
  const thermalData = (testDataForThermal as any)?.thermal || "";
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
  // 6.5. Test Data & Technical Notes（强制兜底规则）
  // ========================================================================
  md.push("## Test Data & Technical Notes");
  md.push("");
  
  // TEST_SUMMARY（强制兜底规则：永不输出 undefined）
  md.push("### Test Summary");
  md.push("");
  const testDataForSummary = canonical.test_data || {};
  const rawForSummary = inspection.raw || {};
  
  // 显式判断：尝试从 raw 读取测试摘要
  let testSummary: string = ""; // 初始化为空字符串，确保不是 undefined
  
  const rcdSummary = (testDataForSummary as any)?.rcd_tests?.summary || 
                     getFieldValue(rawForSummary, "rcd_tests.summary");
  const gpoSummary = (testDataForSummary as any)?.gpo_tests?.summary || 
                     getFieldValue(rawForSummary, "gpo_tests.summary");
  
  // 显式判断：如果有实际数据，使用实际数据
  if (rcdSummary && String(rcdSummary).trim().length > 0) {
    const summaries: string[] = [];
    summaries.push(`RCD Testing: ${String(rcdSummary)}`);
    if (gpoSummary && String(gpoSummary).trim().length > 0) {
      summaries.push(`GPO Testing: ${String(gpoSummary)}`);
    }
    testSummary = summaries.join(". ");
  } else if (gpoSummary && String(gpoSummary).trim().length > 0) {
    testSummary = `GPO Testing: ${String(gpoSummary)}`;
  }
  
  // 强制兜底：如果无数据，使用默认文本
  if (!testSummary || testSummary.trim().length === 0) {
    testSummary = defaultText.TEST_SUMMARY || 
                  "Electrical safety inspection completed in accordance with applicable standards.";
  }
  
  // 确保不是 undefined
  testSummary = String(testSummary || "");
  md.push(testSummary);
  md.push("");
  
  // TECHNICAL_NOTES（强制兜底规则：永不输出 undefined）
  md.push("### Technical Notes");
  md.push("");
  let technicalNotes: string = ""; // 初始化为空字符串，确保不是 undefined
  
  // 显式判断：尝试从 canonical 读取 technician_notes
  const canonicalNotes = canonical.technician_notes || "";
  if (canonicalNotes && String(canonicalNotes).trim().length > 0) {
    technicalNotes = String(canonicalNotes);
  } else {
    // 显式判断：尝试从 raw 读取
    const rawNotes = getFieldValue(rawForSummary, "signoff.office_notes_internal") ||
                     getFieldValue(rawForSummary, "access.notes");
    if (rawNotes && String(rawNotes).trim().length > 0) {
      technicalNotes = String(rawNotes);
    }
  }
  
  // 强制兜底：如果无数据，使用默认文本
  if (!technicalNotes || technicalNotes.trim().length === 0) {
    technicalNotes = defaultText.TECHNICAL_NOTES || 
                     "This is a non-invasive visual inspection limited to accessible areas.";
  }
  
  // 确保不是 undefined
  technicalNotes = String(technicalNotes || "");
  md.push(technicalNotes);
  md.push("");
  md.push("---");
  md.push("");
  
  // ========================================================================
  // 7. 5-Year Capital Expenditure (CapEx) Roadmap（强制兜底规则）
  // ========================================================================
  md.push("## 5-Year Capital Expenditure (CapEx) Roadmap");
  md.push("");
  
  // 强制兜底：免责声明（使用默认文本，永不 undefined）
  const capexDisclaimer = defaultText.CAPEX_DISCLAIMER || 
                          "**Important:** All figures provided in this section are indicative market benchmarks for financial provisioning purposes only. They are not quotations or scope of works.";
  md.push(String(capexDisclaimer));
  md.push("");
  
  // 显式判断：Use CapEx summary (already calculated above)
  // 确保所有变量都不是 undefined
  const safeCapexLow = typeof capexLow === "number" ? capexLow : 0;
  const safeCapexHigh = typeof capexHigh === "number" ? capexHigh : 0;
  const safeCapexCurrency = String(capexCurrency || "AUD");
  const safeCapexNote = String(capexNote || "");
  
  // 显式判断：是否有 CapEx 数据
  const hasCapExData = safeCapexLow > 0 || safeCapexHigh > 0;
  
  if (!hasCapExData) {
    // 无数据情况：使用默认文本，保留页面结构
    md.push(`**Estimated Capital Expenditure Range:** ${safeCapexCurrency} $0 – $0`);
    md.push("");
    
    // 强制兜底：使用默认文本
    const capexNoDataText = defaultText.CAPEX_NO_DATA || 
                            "Capital expenditure estimates will be provided upon request based on detailed quotations from licensed electrical contractors.";
    md.push(String(capexNoDataText));
  } else {
    // 有数据情况：显示实际范围
    md.push(`**Estimated Capital Expenditure Range:** ${safeCapexCurrency} $${safeCapexLow} – $${safeCapexHigh} (indicative, planning only)`);
    md.push("");
    
    // 显式判断：如果有 note，显示 note
    if (safeCapexNote && safeCapexNote.trim().length > 0) {
      md.push(safeCapexNote);
      md.push("");
    }
    
    // 添加说明文本（固定内容，不依赖数据）
    md.push("This estimate is based on the identified findings and assumes standard market rates. Actual costs may vary based on contractor selection, material availability, and site-specific conditions.");
  }
  
  md.push("");
  
  // 强制兜底：免责声明 footer（使用默认文本，永不 undefined）
  const capexDisclaimerFooter = defaultText.CAPEX_DISCLAIMER_FOOTER || 
                                "**Disclaimer:** Provided for financial provisioning only. Not a quotation or scope of works.";
  md.push(String(capexDisclaimerFooter));
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
  
  // Use canonical fields
  const technicianName = canonical.prepared_by || defaultText.PREPARED_BY;
  const assessmentDate = canonical.assessment_date || new Date().toISOString();
  
  // Format date
  let formattedDate: string;
  try {
    const date = new Date(assessmentDate);
    if (!isNaN(date.getTime())) {
      formattedDate = date.toLocaleDateString("en-AU", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } else {
      formattedDate = assessmentDate; // Use as-is if parsing fails
    }
  } catch (e) {
    formattedDate = assessmentDate; // Use as-is if formatting fails
  }
  
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
