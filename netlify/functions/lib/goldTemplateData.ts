/**
 * 为 Gold_Report_Template.docx 构建全部 45 个占位符数据
 * 数据来源：buildCoverData、buildReportData、loadDefaultText、findings + responses
 */

import type { HandlerEvent } from "@netlify/functions";
import type { StoredInspection } from "./store";
import { buildCoverData, buildReportData, loadResponses } from "../generateWordReport";
import { loadDefaultText } from "./defaultTextLoader";
import { loadTermsAndConditions } from "./defaultTextLoader";
import { getFindingProfile, generateBudgetRangeFromBand } from "./findingProfilesLoader";
import { normalizeInspection } from "./normalizeInspection";
import { calibrateReportCopy } from "./reportCopyCalibration";
import { buildAppendixSection } from "./buildReportMarkdown";

/** Gold 模板占位符键（45 个） */
export const GOLD_PLACEHOLDER_KEYS = [
  "PROPERTY_ADDRESS", "CLIENT_NAME", "ASSESSMENT_DATE", "REPORT_ID",
  "OVERALL_RISK_LABEL", "EXECUTIVE_SUMMARY_PARAGRAPH", "CAPEX_RANGE", "CAPEX_NOTE", "DECISION_CONFIDENCE_STATEMENT",
  "ACTION_NOW_SUMMARY", "PLANNED_WORK_SUMMARY", "MONITOR_ITEMS_SUMMARY",
  "SCOPE_BULLETS", "INDEPENDENCE_STATEMENT", "METHODOLOGY_OVERVIEW_TEXT",
  "DYNAMIC_FINDING_PAGES", "RISK_FRAMEWORK_NOTES", "APPENDIX_CONTENT",
  "CAPEX_ITEM_1", "CAPEX_ITEM_2", "CAPEX_ITEM_3", "CAPEX_ITEM_4", "CAPEX_ITEM_5",
  "CAPEX_CONDITION_1", "CAPEX_CONDITION_2", "CAPEX_CONDITION_3", "CAPEX_CONDITION_4", "CAPEX_CONDITION_5",
  "CAPEX_PRIORITY_1", "CAPEX_PRIORITY_2", "CAPEX_PRIORITY_3", "CAPEX_PRIORITY_4", "CAPEX_PRIORITY_5",
  "CAPEX_TIMELINE_1", "CAPEX_TIMELINE_2", "CAPEX_TIMELINE_3", "CAPEX_TIMELINE_4", "CAPEX_TIMELINE_5",
  "CAPEX_BUDGET_1", "CAPEX_BUDGET_2", "CAPEX_BUDGET_3", "CAPEX_BUDGET_4", "CAPEX_BUDGET_5",
  "OWNER_OPTIONS_TEXT", "LEGAL_DISCLAIMER_TEXT",
] as const;

export type GoldTemplateData = Record<string, string>;

function emptyStr(s: unknown): string {
  if (s == null || s === undefined) return "";
  const t = String(s).trim();
  return t === "undefined" ? "" : t;
}

/** 优先级标签（Gold 模板用） */
function priorityLabel(priority: string): string {
  if (priority === "IMMEDIATE" || priority === "URGENT") return "Urgent liability risk";
  if (priority === "RECOMMENDED_0_3_MONTHS" || priority === "RECOMMENDED") return "Budgetary provision recommended";
  return "Monitor / Acceptable";
}

/** 从 findings + responses 构建 CapEx 表前 5 行（每行 item, condition, priority, timeline, budget） */
function buildCapExRows(
  findings: Array<{ id: string; priority: string; title?: string }>,
  findingsMap: Record<string, any>
): Array<{ item: string; condition: string; priority: string; timeline: string; budget: string }> {
  const relevant = findings.filter(f => 
    f.priority === "IMMEDIATE" || f.priority === "URGENT" ||
    f.priority === "RECOMMENDED_0_3_MONTHS" || f.priority === "PLAN_MONITOR"
  );
  const rows: Array<{ item: string; condition: string; priority: string; timeline: string; budget: string }> = [];
  for (let i = 0; i < 5; i++) {
    const f = relevant[i];
    if (!f) {
      rows.push({ item: "", condition: "", priority: "", timeline: "", budget: "" });
      continue;
    }
    const resp = findingsMap[f.id] || {};
    const profile = getFindingProfile(f.id);
    const item = resp?.title || profile?.messaging?.title || f.title || f.id.replace(/_/g, " ");
    const condition = resp?.observed_condition || "As identified";
    const priority = priorityLabel(f.priority);
    let timeline = resp?.timeline || "6–18 months";
    if (f.priority === "IMMEDIATE" || f.priority === "URGENT") timeline = "0–3 months";
    else if (f.priority === "RECOMMENDED_0_3_MONTHS") timeline = "0–12 months";
    let budget = "To be confirmed";
    if (resp?.budgetary_range && typeof resp.budgetary_range === "object") {
      const lo = resp.budgetary_range.low;
      const hi = resp.budgetary_range.high;
      if (lo != null || hi != null) budget = `AUD $${lo ?? 0}–$${hi ?? 0}`;
    } else if (resp?.budget_range_text) budget = resp.budget_range_text;
    else if (profile?.budget_band) budget = generateBudgetRangeFromBand(profile.budget_band as "LOW" | "MED" | "HIGH");
    else budget = "AUD $200–$800 (indicative)";
    rows.push({ item, condition, priority, timeline, budget });
  }
  return rows;
}

/** 构建 ACTION_NOW / PLANNED / MONITOR 摘要（纯文本） */
function buildActionSummaries(
  findings: Array<{ id: string; priority: string; title?: string }>,
  findingsMap: Record<string, any>
): { actionNow: string; planned: string; monitor: string } {
  const urgent = findings.filter(f => f.priority === "IMMEDIATE" || f.priority === "URGENT");
  const recommended = findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS");
  const plan = findings.filter(f => f.priority === "PLAN_MONITOR");

  const fmt = (list: typeof findings, def: string): string => {
    if (list.length === 0) return def;
    return list.map(f => {
      const r = findingsMap[f.id];
      const title = r?.title || f.title || f.id.replace(/_/g, " ");
      return `• ${title}`;
    }).join("\n");
  };

  return {
    actionNow: urgent.length === 0
      ? "No urgent liability risks identified."
      : fmt(urgent, ""),
    planned: recommended.length === 0
      ? "No planned items identified at this time."
      : fmt(recommended, ""),
    monitor: plan.length === 0
      ? "All identified items warrant planned attention."
      : fmt(plan, ""),
  };
}

/** 构建 DYNAMIC_FINDING_PAGES 纯文本（每 finding 一节） */
function buildDynamicFindingPagesText(
  findings: Array<{ id: string; priority: string; title?: string; location?: string }>,
  findingsMap: Record<string, any>
): string {
  if (findings.length === 0) return "No findings were identified during this assessment.";
  const lines: string[] = [];
  for (const f of findings) {
    const r = findingsMap[f.id] || {};
    const title = r?.title || f.title || f.id.replace(/_/g, " ");
    const loc = f.location ? ` (${f.location})` : "";
    const priority = priorityLabel(f.priority);
    lines.push(`${title}${loc}\nPriority: ${priority}`);
    if (r?.why_it_matters) lines.push(`Why it matters: ${r.why_it_matters}`);
    if (r?.recommended_action) lines.push(`Recommended action: ${r.recommended_action}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

/**
 * 为 Gold_Report_Template.docx 构建全部占位符数据
 */
export async function buildGoldTemplateData(
  inspection: StoredInspection,
  event?: HandlerEvent
): Promise<GoldTemplateData> {
  const defaultText = await loadDefaultText(event);
  const coverData = await buildCoverData(inspection, event);
  const reportData = await buildReportData(inspection, event, { forGoldTemplate: true });
  const responses = await loadResponses(event);
  const findingsMap = responses.findings || {};
  const findings = inspection.findings || [];
  const { canonical } = normalizeInspection(inspection.raw || {}, inspection.inspection_id);

  const summaries = buildActionSummaries(findings, findingsMap);
  const capexRows = buildCapExRows(findings, findingsMap);
  const dynamicPages = buildDynamicFindingPagesText(findings, findingsMap);

  // Full test details for Appendix (RCD, GPO, earthing, insulation, technical notes)
  const appendixTestSection = buildAppendixSection(canonical, defaultText);
  const appendixLimitations = inspection.limitations?.length
    ? "Limitations:\n" + inspection.limitations.map((l: string) => `• ${l}`).join("\n") + "\n\n"
    : "";
  const technicalNotes = emptyStr(reportData.TECHNICAL_NOTES ?? defaultText.TECHNICAL_NOTES ?? "Technical notes: as per inspection.");
  const appendixContent = appendixLimitations + appendixTestSection + (technicalNotes ? "\n\n" + technicalNotes : "");

  let legalDisclaimer = "";
  try {
    legalDisclaimer = loadTermsAndConditions();
  } catch {
    legalDisclaimer = defaultText.terms_and_conditions_markdown || "Terms and conditions apply.";
  }
  // 简化为纯文本（去掉 Markdown 标题等）
  legalDisclaimer = legalDisclaimer.replace(/^#+\s*/gm, "").trim();

  const overallRiskLabel = (reportData.OVERALL_STATUS || reportData.RISK_RATING || "MODERATE")
    .replace(/🟢|🟡|🔴/g, "").trim() || "MODERATE";

  const data: GoldTemplateData = {
    // 封面（4）
    PROPERTY_ADDRESS: emptyStr(coverData.PROPERTY_ADDRESS ?? reportData.PROPERTY_ADDRESS ?? canonical.property_address),
    CLIENT_NAME: emptyStr(coverData.PREPARED_FOR ?? reportData.CLIENT_NAME ?? canonical.prepared_for),
    ASSESSMENT_DATE: emptyStr(coverData.ASSESSMENT_DATE ?? reportData.ASSESSMENT_DATE),
    REPORT_ID: emptyStr(coverData.INSPECTION_ID ?? reportData.REPORT_ID ?? inspection.inspection_id),

    // 执行摘要（5）
    OVERALL_RISK_LABEL: overallRiskLabel,
    EXECUTIVE_SUMMARY_PARAGRAPH: emptyStr(reportData.EXECUTIVE_SUMMARY ?? reportData.EXECUTIVE_DECISION_SIGNALS ?? defaultText.EXECUTIVE_SUMMARY),
    CAPEX_RANGE: emptyStr(reportData.CAPEX_RANGE ?? reportData.CAPEX_SNAPSHOT ?? "To be confirmed"),
    CAPEX_NOTE: emptyStr(reportData.CAPEX_DISCLAIMER_LINE ?? defaultText.CAPEX_DISCLAIMER_FOOTER ?? "Indicative, planning only."),
    DECISION_CONFIDENCE_STATEMENT: emptyStr(defaultText.DECISION_CONFIDENCE_STATEMENT ?? "This report is intended to reduce decision uncertainty. Use the observations and priorities here to inform contractor quotes and planning."),

    // 行动摘要（3）
    ACTION_NOW_SUMMARY: summaries.actionNow,
    PLANNED_WORK_SUMMARY: summaries.planned,
    MONITOR_ITEMS_SUMMARY: summaries.monitor,

    // 范围与方法（3）
    SCOPE_BULLETS: emptyStr(reportData.SCOPE_SECTION ?? defaultText.SCOPE_SECTION ?? "Visual inspection and limited electrical testing of accessible areas only."),
    INDEPENDENCE_STATEMENT: emptyStr(defaultText.INDEPENDENCE_STATEMENT ?? "100% Independent – No Conflict of Interest. No repair services provided."),
    METHODOLOGY_OVERVIEW_TEXT: emptyStr(reportData.METHODOLOGY_TEXT ?? defaultText.METHODOLOGY_TEXT ?? "Assessment based on visual inspection and limited testing of accessible areas."),

    // 正文与附录（3）
    DYNAMIC_FINDING_PAGES: dynamicPages,
    RISK_FRAMEWORK_NOTES: emptyStr(reportData.RISK_FRAMEWORK_TEXT ?? defaultText.RISK_FRAMEWORK_TEXT ?? "Findings are prioritised by safety/legal exposure first, then reliability and budget planning."),
    APPENDIX_CONTENT: appendixContent,

    // CapEx 表（25）
    ...Object.fromEntries(
      [1, 2, 3, 4, 5].flatMap(i => {
        const r = capexRows[i - 1];
        return [
          [`CAPEX_ITEM_${i}`, r?.item ?? ""],
          [`CAPEX_CONDITION_${i}`, r?.condition ?? ""],
          [`CAPEX_PRIORITY_${i}`, r?.priority ?? ""],
          [`CAPEX_TIMELINE_${i}`, r?.timeline ?? ""],
          [`CAPEX_BUDGET_${i}`, r?.budget ?? ""],
        ];
      })
    ),

    // 结尾（2）
    OWNER_OPTIONS_TEXT: emptyStr(reportData.DECISION_PATHWAYS_SECTION ?? defaultText.DECISION_PATHWAYS_SECTION ?? "Options: address urgent items first; plan recommended items into CapEx; monitor acceptable items."),
    LEGAL_DISCLAIMER_TEXT: legalDisclaimer,
  };

  // 确保所有键均为字符串且无 undefined
  for (const k of GOLD_PLACEHOLDER_KEYS) {
    if (!(k in data)) data[k] = "";
    data[k] = emptyStr(data[k]);
  }
  // Calibrate copy: tone, legal/financial wording, formatting (no structure change, no new content)
  return calibrateReportCopy(data);
}
