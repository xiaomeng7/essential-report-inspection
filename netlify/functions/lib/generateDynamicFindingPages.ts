/**
 * 生成 DYNAMIC_FINDING_PAGES 文本块（向后兼容）
 * 
 * 这个函数现在委托给新的 generateFindingPages 函数，它强制执行精确的结构。
 */

import type { StoredInspection } from "./store";
import { loadFindingProfiles, type FindingProfile } from "./findingProfilesLoader";
import { normalizeInspection } from "./normalizeInspection";
import type { HandlerEvent } from "@netlify/functions";
import { generateFindingPages, type Finding, type Response } from "./generateFindingPages";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

// Get __dirname equivalent for ES modules
let __dirname: string;
try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else {
    __dirname = process.cwd();
  }
} catch (e) {
  console.warn("Could not determine __dirname from import.meta.url, using process.cwd()");
  __dirname = process.cwd();
}

// Cache for responses.yml
let responsesCache: any = null;

/**
 * Load responses.yml (local implementation)
 */
async function loadResponses(event?: HandlerEvent): Promise<any> {
  if (responsesCache) {
    return responsesCache;
  }

  // Try blob store first (if event is provided)
  if (event) {
    try {
      const { connectLambda, getStore } = await import("@netlify/blobs");
      connectLambda(event);
      const store = getStore({ name: "config", consistency: "eventual" });
      const blobContent = await store.get("responses.yml", { type: "text" });
      if (blobContent) {
        try {
          responsesCache = yaml.load(blobContent) as any;
          console.log("✅ Loaded responses.yml from blob store");
          return responsesCache;
        } catch (e) {
          console.warn("Failed to parse responses from blob:", e);
        }
      }
    } catch (e) {
      console.warn("Failed to access blob store for responses:", e);
    }
  }

  // Fallback to file system
  const possiblePaths = [
    path.join(__dirname, "..", "..", "responses.yml"),
    path.join(process.cwd(), "responses.yml"),
    path.join(process.cwd(), "netlify", "functions", "responses.yml"),
    "/opt/build/repo/responses.yml",
  ];

  for (const responsesPath of possiblePaths) {
    try {
      if (fs.existsSync(responsesPath)) {
        const content = fs.readFileSync(responsesPath, "utf8");
        responsesCache = yaml.load(content) as any;
        console.log(`✅ Loaded responses.yml from: ${responsesPath}`);
        return responsesCache;
      }
    } catch (e) {
      console.warn(`Failed to load responses.yml from ${responsesPath}:`, e);
      continue;
    }
  }

  console.warn("⚠️ Could not load responses.yml, using fallback");
  responsesCache = { findings: {}, defaults: {} };
  return responsesCache;
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
      return "🟢";
  }
}

/**
 * 根据 priority 获取默认预算区间
 */
function getDefaultBudgetRange(priority: string): { low: number; high: number } {
  switch (priority) {
    case "IMMEDIATE":
      return { low: 500, high: 5000 };
    case "RECOMMENDED_0_3_MONTHS":
      return { low: 200, high: 2000 };
    case "PLAN_MONITOR":
      return { low: 100, high: 1000 };
    default:
      return { low: 0, high: 0 };
  }
}

/**
 * 生成单个 finding 的页面内容
 */
function generateFindingPage(
  finding: { id: string; priority: string; title?: string; observed?: string; facts?: string },
  index: number,
  responses: Record<string, any>,
  inspection: StoredInspection,
  canonical: any
): string {
  const lines: string[] = [];
  
  // 获取 finding profile
  const profile = getFindingProfile(finding.id);
  const response = responses[finding.id] || {};
  
  // Asset Component (from profile.asset_component)
  const assetComponent = profile.asset_component || 
                         profile.messaging?.title || 
                         response.title || 
                         finding.title || 
                         finding.id.replace(/_/g, " ");
  
  const priorityEmoji = getPriorityEmoji(finding.priority);
  const priorityClassification = getPriorityClassification(finding.priority);
  
  // 1. Asset Component
  lines.push(`### ${index + 1}. ${assetComponent}`);
  lines.push("");
  lines.push("#### Asset Component");
  lines.push(assetComponent);
  lines.push("");
  
  // 2. Observed Condition
  lines.push("#### Observed Condition");
  let observedCondition: string;
  
  if (Array.isArray(response.observed_condition) && response.observed_condition.length > 0) {
    observedCondition = response.observed_condition.join(". ");
    if (!observedCondition.endsWith(".")) {
      observedCondition += ".";
    }
  } else if (typeof response.observed_condition === "string") {
    observedCondition = response.observed_condition;
  } else {
    observedCondition = finding.observed || 
                       finding.facts || 
                       `${assetComponent} was observed during the visual inspection.`;
  }
  lines.push(observedCondition);
  lines.push("");
  
  // 3. Evidence（使用 profile.evidence_requirements 或默认）
  lines.push("#### Evidence");
  let evidence: string = "No additional evidence captured beyond visual observation.";
  
  // 尝试从 raw 读取 photo_ids 或 evidence
  const rawForEvidence = inspection.raw || {};
  const testDataForEvidence = canonical.test_data || {};
  
  // 检查是否有 photo_ids
  const findingPhotoIds = (finding as any)?.photo_ids || (finding as any)?.evidence?.photo_ids;
  
  // 辅助函数：从对象中获取嵌套值
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
  const findingIdLower = finding.id.toLowerCase();
  const possiblePaths = [
    `${findingIdLower}.photo_ids`,
    `exceptions.${findingIdLower}.photo_ids`,
    `rcd_tests.exceptions.photo_ids`,
    `gpo_tests.exceptions.photo_ids`,
  ];
  
  let sectionPhotoIds: unknown = undefined;
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
  if (evidence === "No additional evidence captured beyond visual observation.") {
    if (finding.facts && finding.facts.trim().length > 0) {
      evidence = finding.facts;
    } else if (Array.isArray(response.observed_condition) && response.observed_condition.length > 0) {
      // 使用 observed_condition 作为证据
      evidence = response.observed_condition.join(". ");
      if (!evidence.endsWith(".")) {
        evidence += ".";
      }
    } else if (profile.evidence_requirements && profile.evidence_requirements.length > 0) {
      // 使用 profile.evidence_requirements 作为证据说明
      evidence = `Evidence requirements: ${profile.evidence_requirements.join(", ")}.`;
    }
  }
  
  lines.push(evidence);
  lines.push("");
  
  // 4. Risk Interpretation（>=2句，包含 if not addressed）
  lines.push("#### Risk Interpretation");
  
  const whyItMatters = profile.messaging?.why_it_matters || 
                      response.why_it_matters || 
                      "This condition may affect electrical safety, reliability, or compliance depending on severity and location.";
  
  const ifNotAddressed = profile.messaging?.if_not_addressed || 
                        response.risk_interpretation?.match(/If.*not.*addressed[^.]*\./i)?.[0] ||
                        "If this condition is not addressed, it may impact long-term reliability or compliance confidence.";
  
  // 组合 why_it_matters + if_not_addressed
  let riskInterpretation = `${whyItMatters}\n\n${ifNotAddressed}`;
  
  // 确保最少 2 句话，且包含 if not addressed
  const sentences = riskInterpretation.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const hasIfNotAddressed = /if.*not.*addressed/i.test(riskInterpretation);
  
  if (sentences.length < 2 || !hasIfNotAddressed) {
    if (!hasIfNotAddressed) {
      riskInterpretation += " If this condition is not addressed over time, it may gradually impact long-term reliability or compliance confidence.";
    }
    if (sentences.length < 2) {
      riskInterpretation += " This risk can be managed within normal asset planning cycles.";
    }
  }
  
  lines.push(riskInterpretation);
  lines.push("");
  
  // 5. Priority Classification（使用 profile.priority）
  lines.push("#### Priority Classification");
  const effectivePriority = profile.priority || finding.priority;
  const priorityEmojiForProfile = getPriorityEmoji(effectivePriority === "IMMEDIATE" ? "IMMEDIATE" : 
                                                   effectivePriority === "RECOMMENDED" ? "RECOMMENDED_0_3_MONTHS" : 
                                                   "PLAN_MONITOR");
  const priorityClassificationForProfile = getPriorityClassification(effectivePriority === "IMMEDIATE" ? "IMMEDIATE" : 
                                                                      effectivePriority === "RECOMMENDED" ? "RECOMMENDED_0_3_MONTHS" : 
                                                                      "PLAN_MONITOR");
  lines.push(`${priorityEmojiForProfile} ${priorityClassificationForProfile}`);
  lines.push("");
  
  // 6. Budgetary Planning Range（优先使用 profile.budget_range）
  lines.push("#### Budgetary Planning Range");
  
  let budgetaryRangeText: string;
  
  // 优先使用 profile.budget_range
  if (profile.budget_range && profile.budget_range.trim().length > 0) {
    budgetaryRangeText = profile.budget_range;
  }
  // 其次使用 budget_range_text（简单字符串格式）
  else if (response.budget_range_text && typeof response.budget_range_text === "string") {
    budgetaryRangeText = response.budget_range_text;
  }
  // 再次使用 budget_range_low 和 budget_range_high
  else if (response.budget_range_low !== undefined && response.budget_range_high !== undefined) {
    const currency = response.budget_range_currency || "AUD";
    budgetaryRangeText = `${currency} $${response.budget_range_low} – $${response.budget_range_high}`;
    if (response.budget_range_note) {
      budgetaryRangeText += `. ${response.budget_range_note}`;
    }
  }
  // 再次使用现有的 budgetary_range 对象（向后兼容）
  else if (response.budgetary_range) {
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
        // Fallback to profile.budget_range
        budgetaryRangeText = profile.budget_range || "Indicative market benchmark range to be confirmed through contractor quotations.";
      }
    } else {
      budgetaryRangeText = String(response.budgetary_range);
    }
  }
  // 最后使用 profile.budget_range（应该总是有值）
  else {
    budgetaryRangeText = profile.budget_range || "Indicative market benchmark range to be confirmed through contractor quotations.";
  }
  
  lines.push(budgetaryRangeText);
  lines.push("");
  
  // 7. Timeline（如果 profile.timeline 存在）
  if (profile.timeline && profile.timeline.trim().length > 0) {
    lines.push("#### Timeline");
    lines.push(profile.timeline);
    lines.push("");
  }
  
  // 8. Disclaimer（如果 profile.disclaimer_line 存在）
  if (profile.disclaimer_line && profile.disclaimer_line.trim().length > 0) {
    lines.push("#### Disclaimer");
    lines.push(profile.disclaimer_line);
    lines.push("");
  }
  
  lines.push("---");
  lines.push("");
  
  return lines.join("\n");
}

/**
 * 生成 DYNAMIC_FINDING_PAGES HTML 内容（使用新的严格验证函数）
 */
export async function generateDynamicFindingPages(
  inspection: StoredInspection,
  event?: HandlerEvent
): Promise<string> {
  const responses = await loadResponses(event);
  const responsesMap: Record<string, Response> = responses.findings || {};
  
  // Load finding profiles
  const profilesMap = loadFindingProfiles();
  
  // Normalize inspection
  const { canonical } = normalizeInspection(inspection.raw || {}, inspection.inspection_id);
  
  // Convert findings to Finding type
  const findings: Finding[] = inspection.findings.map(f => ({
    id: f.id,
    priority: f.priority,
    title: f.title,
    observed: f.observed,
    facts: f.facts,
    photo_ids: (f as any).photo_ids,
  }));
  
  // Convert profiles to FindingProfile map (use getFindingProfile to ensure normalization)
  const { getFindingProfile } = await import("./findingProfilesLoader.js");
  const profiles: Record<string, FindingProfile> = {};
  for (const finding of findings) {
    profiles[finding.id] = getFindingProfile(finding.id);
  }
  
  // Generate finding pages with strict validation
  const result = generateFindingPages(
    findings,
    profiles,
    responsesMap,
    inspection.raw || {},
    canonical.test_data || {}
  );
  
  // Errors are already thrown by generateFindingPages, but we check anyway for safety
  if (result.errors.length > 0) {
    // This should not happen as generateFindingPages throws, but log if it does
    console.error(`❌ Found ${result.errors.length} validation error(s) in finding pages (should have been thrown):`);
    result.errors.forEach(err => {
      console.error(`  - Finding ${err.findingId}: ${err.field} - ${err.message}`);
    });
    throw new Error(
      `Finding pages validation failed for ${result.errors.length} finding(s). ` +
      `First error: Finding ${result.errors[0].findingId} - ${result.errors[0].field}: ${result.errors[0].message}`
    );
  }
  
  return result.html;
}
