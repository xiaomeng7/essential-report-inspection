/**
 * 构建报告 Markdown 内容
 *
 * 严格遵循 REPORT_STRUCTURE.md 的页面顺序
 * 确保所有部分都有值，不会出现 undefined
 *
 * Pipeline: buildStructuredReport → assertReportReady → renderReportFromSlots → markdownToHtml
 */

const VERSION = "2026-01-31-v1";

import type { StoredInspection } from "./store";
import type { CanonicalInspection } from "./normalizeInspection";
import { loadDefaultText } from "./defaultTextLoader";
import { loadFindingProfiles, getFindingProfile } from "./findingProfilesLoader";
import { generateFindingPages, type Finding, type Response } from "./generateFindingPages";
import { markdownToHtml } from "./markdownToHtml";
import type { HandlerEvent } from "@netlify/functions";
import type { StructuredReport } from "./reportContract";
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

export type ComputedFields = {
  OVERALL_STATUS?: string;
  RISK_RATING?: string;
  CAPEX_RANGE?: string;
  EXECUTIVE_SUMMARY?: string;
  EXECUTIVE_DECISION_SIGNALS?: string;
  CAPEX_SNAPSHOT?: string;
  CAPEX_TABLE_ROWS?: string;
  [key: string]: any;
};

export type BuildReportMarkdownParams = {
  inspection: StoredInspection;
  canonical: CanonicalInspection;
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
  event?: HandlerEvent;
};

/**
 * Page break marker: HTML-friendly so Word/HTML renderers respect it (with blank lines)
 */
const PAGE_BREAK = "\n\n<div class=\"page-break\" style=\"page-break-after:always;\"></div>\n\n";

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
      connectLambda(event as any);
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
 * Load Terms and Conditions from DEFAULT_TERMS.md
 */
async function loadTermsAndConditions(): Promise<string> {
  const possiblePaths = [
    path.join(__dirname, "..", "..", "DEFAULT_TERMS.md"),
    path.join(__dirname, "..", "DEFAULT_TERMS.md"),
    path.join(process.cwd(), "DEFAULT_TERMS.md"),
    path.join(process.cwd(), "netlify", "functions", "DEFAULT_TERMS.md"),
    "/opt/build/repo/DEFAULT_TERMS.md",
    "/opt/build/repo/netlify/functions/DEFAULT_TERMS.md",
  ];
  
  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        console.log(`✅ Loaded Terms and Conditions from: ${filePath}`);
        return content;
      }
    } catch (e) {
      console.warn(`Failed to load DEFAULT_TERMS.md from ${filePath}:`, e);
      continue;
    }
  }
  
  // Fallback to hardcoded default
  console.warn("⚠️ DEFAULT_TERMS.md not found, using hardcoded fallback");
  return `# TERMS & CONDITIONS OF ASSESSMENT

## 1. Australian Consumer Law (ACL) Acknowledgement
Our services come with guarantees that cannot be excluded under the Australian Consumer Law (ACL).  
Nothing in this Report or these Terms seeks to exclude, restrict, or modify any consumer guarantees that cannot lawfully be excluded.

## 2. Nature & Scope of Professional Opinion
This Assessment is a point-in-time, non-destructive, visual and functional review of accessible electrical components only.  
It is non-intrusive and non-exhaustive, and does not constitute a compliance certificate, an electrical safety certificate, an engineering report, a structural inspection, or a guarantee of future performance.

## 3. Decision-Support Only – No Repair Advice
This Report is provided solely as a risk identification and asset planning tool.  
It does not prescribe a scope of rectification works, provide quotations, endorse or appoint contractors, or certify statutory compliance.

## 4. Framework Statement
This assessment does not eliminate risk, but provides a structured framework for managing it.`;
}

/**
 * Convert HTML finding pages to Markdown (simplified conversion)
 */
function htmlToMarkdown(html: string): string {
  // Remove HTML tags and convert to Markdown
  let md = html
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<[^>]+>/g, "") // Remove remaining HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
  
  // Clean up multiple newlines
  md = md.replace(/\n{3,}/g, "\n\n");
  
  return md.trim();
}

/**
 * Section 1: Cover Page
 */
function buildCoverSection(canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  const addr = canonical.property_address || defaultText.PROPERTY_ADDRESS || "-";
  const client = canonical.prepared_for || defaultText.PREPARED_FOR || "-";
  const date = canonical.assessment_date || defaultText.ASSESSMENT_DATE || "-";
  const inspId = canonical.inspection_id || defaultText.INSPECTION_ID || "-";
  const preparedBy = canonical.prepared_by || defaultText.PREPARED_BY || "-";

  md.push('<h2 class="page-title">Page 1 | Cover</h2>');
  md.push("");
  md.push("# ELECTRICAL ASSET RISK & FINANCIAL FORECAST");
  md.push("");
  md.push("Electrical Property Health Assessment");
  md.push("");
  md.push("<table class=\"kv\">");
  md.push(`<tr><td class=\"k\">Property Address</td><td>${addr}</td></tr>`);
  md.push(`<tr><td class=\"k\">Client</td><td>${client}</td></tr>`);
  md.push(`<tr><td class=\"k\">Assessment Date</td><td>${date}</td></tr>`);
  md.push(`<tr><td class=\"k\">Inspection ID</td><td>${inspId}</td></tr>`);
  md.push(`<tr><td class=\"k\">Prepared By</td><td>${preparedBy}</td></tr>`);
  md.push("</table>");
  md.push("");
  md.push("<p class=\"small\">Independent – No Repair Services Provided</p>");
  md.push("");

  return md.join("\n");
}

/**
 * Section 2: Document Purpose & How to Read This Report
 */
function buildPurposeSection(defaultText: any): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 2 | Document Purpose & How to Read This Report</h2>');
  md.push("");
  
  // First paragraph (Purpose): only use PURPOSE_PARAGRAPH; append one sentence at end (do not rewrite whole paragraph)
  const purposeText = defaultText.PURPOSE_PARAGRAPH || 
    "This report provides a comprehensive assessment of the electrical condition of the property, identifying safety concerns, compliance issues, and maintenance recommendations based on a visual inspection and electrical testing performed in accordance with applicable standards.";
  md.push(purposeText + " This report is designed to support decisions where technical expertise, financial exposure, and long-term asset planning intersect.");
  md.push("");
  
  // Second paragraph (How to Read): use HOW_TO_READ_PARAGRAPH || HOW_TO_READ_TEXT || fallback
  md.push(defaultText.HOW_TO_READ_PARAGRAPH || defaultText.HOW_TO_READ_TEXT ||
    "This report is a decision-support document designed to assist property owners, investors, and asset managers in understanding the electrical risk profile of the property and planning for future capital expenditure.");
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 3: Executive Summary (One-Page Only)
 */
function buildExecutiveSummarySection(computed: ComputedFields, findings: Array<{ priority: string }>, defaultText: any): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 3 | Executive Summary (One-Page Only)</h2>');
  md.push("");
  
  // Overall Status / Risk Level: unified emoji badge (🟢 Low / 🟡 Moderate / 🔴 Elevated), no bracket labels
  const rawStatus = (computed.OVERALL_STATUS || computed.RISK_RATING || defaultText.OVERALL_STATUS || "").toUpperCase();
  const riskLevelBadge =
    rawStatus.includes("ELEVATED") || rawStatus.includes("HIGH") ? "🔴 Elevated" :
    rawStatus.includes("MODERATE") || rawStatus.includes("MODERATE RISK") ? "🟡 Moderate" :
    rawStatus.includes("LOW") ? "🟢 Low" : "🟡 Moderate";
  md.push(`### Overall Status: ${riskLevelBadge}`);
  md.push("");
  
  // Executive Decision Signals
  const executiveSignals = computed.EXECUTIVE_DECISION_SIGNALS || computed.EXECUTIVE_SUMMARY || 
    defaultText.EXECUTIVE_SUMMARY || 
    "This property presents a moderate electrical risk profile at the time of inspection.";
  
  md.push(executiveSignals);
  md.push("");
  
  // CapEx Snapshot
  const capexSnapshot = computed.CAPEX_SNAPSHOT || computed.CAPEX_RANGE || "To be confirmed";
  md.push(`### Financial Planning Snapshot`);
  md.push(`**Estimated Capital Expenditure Range:** ${capexSnapshot}`);
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 3A: What This Means for You (NEW - Gold Sample inspired)
 */
function buildWhatThisMeansSection(
  findings: Array<{ id: string; priority: string; title?: string }>,
  responses: any,
  defaultText: any
): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 4 | What This Means for You</h2>');
  md.push("");
  
  // Group findings by priority
  const urgent = findings.filter(f => 
    f.priority === "IMMEDIATE" || 
    f.priority === "URGENT" ||
    f.priority === "IMMEDIATE_SAFETY_CRITICAL"
  );
  
  const budgetary = findings.filter(f => 
    f.priority === "RECOMMENDED" || 
    f.priority === "RECOMMENDED_0_3_MONTHS" ||
    f.priority === "SHORT_TERM"
  );
  
  const monitor = findings.filter(f => 
    f.priority === "PLAN" || 
    f.priority === "PLAN_MONITOR" ||
    f.priority === "MONITOR"
  );
  
  // 1. What requires action now
  md.push("### What requires action now");
  if (urgent.length === 0) {
    md.push("**No urgent liability risks identified.**");
    md.push("");
    md.push("No immediate safety concerns were detected at the time of assessment. This provides a stable foundation for planned electrical management.");
  } else {
    md.push("The following items should be addressed as soon as practically possible:");
    md.push("");
    urgent.forEach(f => {
      const resp = responses?.findings?.[f.id];
      const timeline = resp?.timeline || "immediately";
      const reason = resp?.why_it_matters || "to reduce liability risk";
      md.push(`- **${f.title || f.id}** should be addressed ${timeline} ${reason}.`);
    });
  }
  md.push("");
  
  // 2. What should be planned (to avoid future disruption)
  md.push("### What should be planned (to avoid future disruption)");
  if (budgetary.length === 0) {
    md.push("No planned items identified at this time. The electrical installation is operating within acceptable parameters.");
  } else {
    md.push("These items do not represent active faults, but **modernisation or upgrades are recommended** to improve safety margins and avoid reactive call-outs:");
    md.push("");
    budgetary.forEach(f => {
      const resp = responses?.findings?.[f.id];
      const timeline = resp?.timeline || "within 12 months";
      const reason = resp?.why_it_matters || "to reduce future risk";
      md.push(`- **${f.title || f.id}** recommended ${timeline} ${reason}.`);
    });
  }
  md.push("");
  
  // 3. What can wait (monitor)
  md.push("### What can wait (monitor)");
  if (monitor.length === 0) {
    md.push("All identified items warrant planned attention. No items are suitable for indefinite deferral.");
  } else {
    md.push("These items can be addressed during next renovation or scheduled electrical works:");
    md.push("");
    monitor.forEach(f => {
      const resp = responses?.findings?.[f.id];
      const context = resp?.planning_guidance || "during next scheduled electrical works";
      md.push(`- **${f.title || f.id}** can be addressed ${context}.`);
    });
  }
  md.push("");
  
  // 4. Decision confidence statement
  md.push("### Decision confidence statement");
  md.push(defaultText.DECISION_CONFIDENCE_STATEMENT || 
    "This report is intended to **reduce decision uncertainty**. If you obtain contractor quotes, you can use the observations and priorities here to challenge scope creep and avoid unnecessary upgrades. " +
    "The risk interpretations are designed to help you distinguish between urgent liability risks and planned capital expenditure opportunities.");
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 4: Priority Overview (Single Table)
 */
function buildPriorityOverviewSection(findings: Array<{ priority: string }>): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 5 | Priority Overview</h2>');
  md.push("");
  
  const immediateCount = findings.filter(f => f.priority === "IMMEDIATE" || f.priority === "URGENT").length;
  const recommendedCount = findings.filter(f => f.priority === "RECOMMENDED_0_3_MONTHS" || f.priority === "RECOMMENDED").length;
  const planCount = findings.filter(f => f.priority === "PLAN_MONITOR" || f.priority === "PLAN").length;
  
  md.push("| Priority Level | Meaning | Investor Interpretation |");
  md.push("|---------------|---------|------------------------|");
  md.push("| 🔴 Urgent Liability Risk | Action required to reduce safety or legal exposure | Do not defer |");
  md.push("| 🟡 Budgetary Provision Recommended | No immediate risk, plan within asset cycle | Include in forward planning |");
  md.push("| 🟢 Acceptable | No action required at this stage | Monitor only |");
  md.push("");
  // Count summary below table (emoji only, no bracket labels)
  md.push(`*🔴 Urgent: ${immediateCount} | 🟡 Recommended: ${recommendedCount} | 🟢 Acceptable: ${planCount}*`);
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 5: Assessment Scope & Limitations
 */
function buildScopeSection(inspection: StoredInspection, canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 6 | Assessment Scope & Limitations</h2>');
  md.push("");
  
  // Scope
  md.push(defaultText.SCOPE_SECTION || defaultText.SCOPE_TEXT ||
    "This assessment is based on a visual inspection and limited electrical testing of accessible areas only. It provides a framework for managing electrical risk within acceptable parameters.");
  md.push("");
  
  // Limitations
  md.push("### Limitations");
  md.push("");
  const limitations = inspection.limitations || [];
  if (limitations.length > 0) {
    limitations.forEach(limitation => {
      md.push(`- ${limitation}`);
    });
  } else {
    md.push(defaultText.LIMITATIONS || 
      "Areas that are concealed, locked, or otherwise inaccessible were not inspected.");
  }
  md.push("");
  md.push("This assessment does not eliminate risk, but provides a structured framework for managing it.");
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 6: Observed Conditions & Risk Interpretation (Dynamic Pages)
 */
async function buildObservedConditionsSection(
  inspection: StoredInspection,
  canonical: CanonicalInspection,
  findings: Array<{ id: string; priority: string; title?: string; observed?: string; facts?: string }>,
  event?: HandlerEvent,
  baseUrl?: string,
  signingSecret?: string
): Promise<string> {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 7 | Observed Conditions & Risk Interpretation</h2>');
  md.push("");
  
  if (findings.length === 0) {
    md.push("No findings were identified during this assessment.");
    md.push("");
    return md.join("\n");
  }
  
  // Load profiles and responses
  const responses = await loadResponses(event);
  const responsesMap: Record<string, Response> = responses.findings || {};
  const profilesMap = loadFindingProfiles();
  
  // Convert findings to Finding type
  const findingList: Finding[] = findings.map(f => ({
    id: f.id,
    priority: f.priority,
    title: f.title,
    observed: f.observed,
    facts: f.facts,
    photo_ids: (f as any).photo_ids,
  }));
  
  // Convert profiles to FindingProfile map
  const profiles: Record<string, any> = {};
  for (const finding of findingList) {
    profiles[finding.id] = getFindingProfile(finding.id);
  }
  
  for (let i = 0; i < findingList.length; i++) {
    const oneFinding = findingList[i];
    const result = await generateFindingPages(
      [oneFinding],
      profiles,
      responsesMap,
      inspection.raw || {},
      canonical.test_data || {},
      inspection.inspection_id,
      event,
      baseUrl,
      signingSecret
    );
    md.push(result.html);
    
    // Add page break after each finding (except the last one)
    if (i < findingList.length - 1) {
      md.push(PAGE_BREAK);
    }
  }
  
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 7: Thermal Imaging Analysis (If Applicable)
 */
function buildThermalImagingSection(canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 8 | Thermal Imaging Analysis (If Applicable)</h2>');
  md.push("");
  
  const testData = canonical.test_data || {};
  const thermalData = (testData as any)?.thermal_imaging || (testData as any)?.thermal;
  
  if (thermalData) {
    md.push(String(thermalData));
  } else {
    md.push(defaultText.THERMAL_VALUE_STATEMENT || defaultText.THERMAL_METHOD ||
      "Thermal imaging analysis provides a non-invasive method for identifying potential electrical issues that may not be visible during standard visual inspection. No thermal imaging data was captured for this assessment.");
  }
  md.push("");
  
  return md.join("\n");
}

/**
 * Get timeline based on priority (fallback when profile timeline is missing)
 */
function getTimelineFromPriority(priority: string): string {
  const upper = priority.toUpperCase();
  if (upper === "IMMEDIATE") return "Now";
  if (upper === "URGENT") return "0–3 months";
  if (upper === "RECOMMENDED_0_3_MONTHS" || upper === "RECOMMENDED") return "12–24 months";
  if (upper === "PLAN_MONITOR" || upper === "PLAN") return "Next renovation";
  return "To be confirmed";
}

/**
 * Get priority display text
 */
function getPriorityDisplayText(priority: string): string {
  const upper = priority.toUpperCase();
  if (upper === "IMMEDIATE") return "IMMEDIATE";
  if (upper === "URGENT") return "URGENT";
  if (upper === "RECOMMENDED_0_3_MONTHS" || upper === "RECOMMENDED") return "RECOMMENDED";
  if (upper === "PLAN_MONITOR" || upper === "PLAN") return "PLAN";
  return priority;
}

/**
 * Get observed condition summary from finding data
 */
function getObservedConditionSummary(
  finding: { id: string; priority: string; title?: string; observed?: string; facts?: string },
  response?: { observed_condition?: string | string[] },
  profile?: any
): string {
  // Try response.observed_condition first
  if (response?.observed_condition) {
    if (Array.isArray(response.observed_condition)) {
      return response.observed_condition.join(". ").substring(0, 100);
    }
    return String(response.observed_condition).substring(0, 100);
  }
  
  // Try finding.observed
  if (finding.observed) {
    return String(finding.observed).substring(0, 100);
  }
  
  // Try finding.facts
  if (finding.facts) {
    return String(finding.facts).substring(0, 100);
  }
  
  // Fallback to profile messaging or title
  if (profile?.messaging?.why_it_matters) {
    return String(profile.messaging.why_it_matters).substring(0, 100);
  }
  
  return "Condition observed during inspection";
}

/**
 * Section 8: 5-Year Capital Expenditure (CapEx) Roadmap
 */
/** Replace newlines with space and escape HTML for table cell content */
function cellText(s: string): string {
  return String(s)
    .replace(/\n/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .trim();
}

function buildCapExRoadmapSection(
  computed: ComputedFields,
  defaultText: any,
  findings: Array<{ id: string; priority: string; title?: string; observed?: string; facts?: string }>,
  responses: { findings?: Record<string, any> }
): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 10 | 5-Year Capital Expenditure (CapEx) Roadmap</h2>');
  md.push("");
  
  // Filter findings that should appear in CapEx roadmap
  const relevantFindings = findings.filter(f => {
    const priority = f.priority || "";
    return priority === "IMMEDIATE" || 
           priority === "URGENT" || 
           priority === "RECOMMENDED_0_3_MONTHS" || 
           priority === "RECOMMENDED" ||
           priority === "PLAN_MONITOR" ||
           priority === "PLAN";
  });
  
  md.push("<table>");
  md.push("<thead><tr>");
  md.push('<th style="width:22%">Asset Item</th>');
  md.push('<th style="width:30%">Current Condition</th>');
  md.push('<th style="width:12%">Priority</th>');
  md.push('<th style="width:16%">Suggested Timeline</th>');
  md.push('<th style="width:20%">Budgetary Range</th>');
  md.push("</tr></thead>");
  md.push("<tbody>");
  
  if (relevantFindings.length === 0) {
    md.push("<tr>");
    md.push("<td>-</td>");
    md.push("<td>No capital expenditure items identified</td>");
    md.push("<td>-</td>");
    md.push("<td>-</td>");
    md.push("<td>-</td>");
    md.push("</tr>");
  } else {
    for (const finding of relevantFindings) {
      const profile = getFindingProfile(finding.id);
      const response = responses.findings?.[finding.id];
      
      const assetItem = profile.asset_component || 
                        profile.messaging?.title || 
                        finding.title || 
                        finding.id.replace(/_/g, " ");
      const currentCondition = getObservedConditionSummary(finding, response, profile);
      const priority = getPriorityDisplayText(finding.priority || "PLAN");
      const timeline = profile.timeline || getTimelineFromPriority(finding.priority || "PLAN");
      
      let budgetaryRange = "Pending";
      if (profile.budget_range) {
        budgetaryRange = String(profile.budget_range);
      } else if (response?.budget_range_text) {
        budgetaryRange = String(response.budget_range_text);
      } else if (
        response?.budget_range_low != null &&
        response?.budget_range_high != null &&
        !Number.isNaN(Number(response.budget_range_low)) &&
        !Number.isNaN(Number(response.budget_range_high))
      ) {
        budgetaryRange = `AUD $${response.budget_range_low}–$${response.budget_range_high}`;
      } else if (profile.budget_band) {
        const band = profile.budget_band.toUpperCase();
        const ranges: Record<string, string> = {
          LOW: "AUD $100–$500",
          MED: "AUD $500–$2,000",
          HIGH: "AUD $2,000–$10,000",
        };
        budgetaryRange = ranges[band] || "Pending";
      }
      
      md.push("<tr>");
      md.push(`<td>${cellText(assetItem)}</td>`);
      md.push(`<td>${cellText(currentCondition)}</td>`);
      md.push(`<td>${cellText(priority)}</td>`);
      md.push(`<td>${cellText(timeline)}</td>`);
      md.push(`<td>${cellText(budgetaryRange)}</td>`);
      md.push("</tr>");
    }
  }
  
  md.push("</tbody>");
  md.push("</table>");
  md.push("");
  md.push("**Indicative market benchmarks provided for financial provisioning only. Not a quotation or scope of works.**");
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 9: Decision Pathways (NEW - Gold Sample 4-option format)
 */
function buildDecisionPathwaysSection(defaultText: any): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 11 | Owner Decision Pathways</h2>');
  md.push("");
  
  md.push(defaultText.DECISION_PATHWAYS_INTRO || 
    "This report provides a framework for managing electrical risk within acceptable parameters. " +
    "Based on the findings and priorities outlined in this report, you can choose one of the following pathways:");
  md.push("");
  
  // Option A - Monitor only
  md.push("### Option A — Monitor only");
  md.push(defaultText.DECISION_PATHWAY_MONITOR || 
    "Take no action now. Reassess in 12 months or at the next tenancy turnover. " +
    "This option is suitable when all findings are classified as 'Monitor / Acceptable' and there are no immediate or recommended actions.");
  md.push("");
  
  // Option B - Planned upgrades
  md.push("### Option B — Planned upgrades");
  md.push(defaultText.DECISION_PATHWAY_PLANNED || 
    "Budget and schedule the planned items within the suggested windows to reduce reactive maintenance. " +
    "This approach allows you to manage costs proactively and avoid emergency call-outs. " +
    "Use the CapEx Roadmap in this report to inform your forward planning and budget provisioning.");
  md.push("");
  
  // Option C - Independent rectification
  md.push("### Option C — Independent rectification");
  md.push(defaultText.DECISION_PATHWAY_INDEPENDENT || 
    "Use this report to brief any contractor of your choice. Request itemised scope aligned to priorities. " +
    "The observations and risk interpretations in this report are designed to help you challenge scope creep " +
    "and ensure that any quotes you receive are aligned with the actual risk profile of the property.");
  md.push("");
  
  // Option D - Management plan integration
  md.push("### Option D — Management plan integration");
  md.push(defaultText.DECISION_PATHWAY_MANAGEMENT_PLAN || 
    "Delegate coordination, quotation review, and completion verification to a management plan (Standard or Premium). " +
    "This option provides end-to-end management of electrical works, from contractor briefing through to quality assurance and compliance documentation. " +
    "Contact the inspection provider for details on management plan options.");
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 10: Important Legal Limitations & Disclaimer (Terms & Conditions)
 */
async function buildTermsSection(): Promise<string> {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 12 | Important Legal Limitations & Disclaimer (Terms & Conditions)</h2>');
  md.push("");
  const terms = await loadTermsAndConditions();
  md.push(terms);
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 11: Closing Statement
 */
function buildClosingSection(canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 13 | Closing Statement</h2>');
  md.push("");
  
  const technicianName = canonical.prepared_by || defaultText.PREPARED_BY || "Licensed Electrician";
  const assessmentDate = canonical.assessment_date || defaultText.ASSESSMENT_DATE || new Date().toISOString();
  
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
      formattedDate = assessmentDate;
    }
  } catch (e) {
    formattedDate = assessmentDate;
  }
  
  md.push(`Prepared by: ${technicianName}`);
  md.push(`Assessment Date: ${formattedDate}`);
  md.push("");
  md.push("This report provides clarity where uncertainty previously existed.");
  md.push("");
  
  return md.join("\n");
}

/**
 * Extract value from nested Answer object structure
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
  return v;
}

/**
 * Get nested field value from object
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  
  return extractValue(current);
}

/**
 * Section 12: Appendix – Test Data & Technical Notes
 */
function buildAppendixSection(canonical: CanonicalInspection, defaultText: any): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 9 | Test Data & Technical Notes</h2>');
  md.push("");
  
  const testData = canonical.test_data || {};
  
  // Ensure required sub-objects exist (at least empty objects)
  const rcdTests = (testData.rcd_tests || {}) as Record<string, unknown>;
  const gpoTests = (testData.gpo_tests || {}) as Record<string, unknown>;
  const earthing = (testData.earthing || {}) as Record<string, unknown>;
  
  // Collect test measurements for table
  const testMeasurements: Array<{ test: string; parameter: string; value: string; unit: string }> = [];
  
  // Extract RCD test data
  const rcdPerformed = extractValue(rcdTests.performed);
  if (rcdPerformed === true || rcdPerformed === "true" || rcdPerformed === "yes") {
    const summary = rcdTests.summary as Record<string, unknown> | undefined;
    if (summary) {
      const totalTested = extractValue(summary.total_tested);
      const totalPass = extractValue(summary.total_pass) || 0;
      const totalFail = extractValue(summary.total_fail) || 0;
      if (totalTested !== undefined && Number(totalTested) > 0) {
        testMeasurements.push({
          test: "RCD Testing",
          parameter: "Devices Tested",
          value: `${totalPass}/${Number(totalTested)} passed`,
          unit: ""
        });
      }
    }
    
    // Extract RCD exceptions with trip times (exceptions may be array or { value: [...] })
    const exceptionsRaw = rcdTests.exceptions;
    const exceptions = Array.isArray(exceptionsRaw) ? exceptionsRaw : (typeof exceptionsRaw === "object" && exceptionsRaw !== null && Array.isArray((exceptionsRaw as any).value)) ? (exceptionsRaw as any).value : [];
    if (exceptions.length > 0) {
      exceptions.forEach((exc: any) => {
        const location = extractValue(exc.location) || "Unknown";
        const tripTime = extractValue(exc.trip_time) || extractValue(exc.trip_time_ms);
        const testCurrent = extractValue(exc.test_current) || extractValue(exc.test_current_ma);
        const result = extractValue(exc.result);
        
        if (tripTime !== undefined) {
          testMeasurements.push({
            test: `RCD (${location})`,
            parameter: "Trip Time",
            value: String(tripTime),
            unit: "ms"
          });
        }
        if (testCurrent !== undefined) {
          testMeasurements.push({
            test: `RCD (${location})`,
            parameter: "Test Current",
            value: String(testCurrent),
            unit: "mA"
          });
        }
      });
    }
  } else {
    // RCD tests not performed - show "not captured"
    testMeasurements.push({
      test: "RCD Testing",
      parameter: "Status",
      value: "Not captured",
      unit: ""
    });
  }
  
  // Extract GPO test data
  const gpoPerformed = extractValue(gpoTests.performed);
  if (gpoPerformed === true || gpoPerformed === "true" || gpoPerformed === "yes") {
    const summary = gpoTests.summary as Record<string, unknown> | undefined;
    if (summary) {
      const totalTested = extractValue(summary.total_tested) || extractValue(summary.total_outlets_tested) || extractValue(summary.total_gpo_tested);
      const polarityPass = extractValue(summary.polarity_pass_count) || extractValue(summary.polarity_pass) || 0;
      const earthPass = extractValue(summary.earth_present_pass_count) || extractValue(summary.earth_present_pass) || 0;
      
      if (totalTested !== undefined && Number(totalTested) > 0) {
        testMeasurements.push({
          test: "GPO Testing",
          parameter: "Polarity Check",
          value: `${polarityPass}/${Number(totalTested)} passed`,
          unit: ""
        });
        testMeasurements.push({
          test: "GPO Testing",
          parameter: "Earth Continuity",
          value: `${earthPass}/${Number(totalTested)} passed`,
          unit: ""
        });
      }
    }
  } else {
    // GPO tests not performed - show "not captured"
    testMeasurements.push({
      test: "GPO Testing",
      parameter: "Status",
      value: "Not captured",
      unit: ""
    });
  }
  
  // Extract earthing data (support resistance, earth_resistance, earthing_resistance_measured)
  const earthResistance = extractValue(earthing.resistance) || extractValue(earthing.earth_resistance) || extractValue(earthing.earthing_resistance_measured);
  if (earthResistance !== undefined) {
    testMeasurements.push({
      test: "Earthing",
      parameter: "Earth Resistance",
      value: String(earthResistance),
      unit: "Ω"
    });
  } else {
    // Earthing data not captured - show "not captured"
    testMeasurements.push({
      test: "Earthing",
      parameter: "Earth Resistance",
      value: "Not captured",
      unit: ""
    });
  }
  
  // Extract insulation resistance (if available)
  const insulationResistance = extractValue(testData.insulation_resistance);
  if (insulationResistance !== undefined) {
    testMeasurements.push({
      test: "Insulation",
      parameter: "Resistance",
      value: String(insulationResistance),
      unit: "MΩ"
    });
  }
  
  // Always render test data table (even if all show "not captured")
  md.push("### Test Data");
  md.push("");
  md.push("| Test | Parameter | Value | Unit |");
  md.push("|------|-----------|-------|------|");
  testMeasurements.forEach(measurement => {
    md.push(`| ${measurement.test} | ${measurement.parameter} | ${measurement.value} | ${measurement.unit} |`);
  });
  md.push("");
  
  // Technical Notes (filter placeholder-like values such as "call to confirm")
  md.push("### Technical Notes");
  md.push("");
  const rawTechnicalNotes = canonical.technician_notes || defaultText.TECHNICAL_NOTES ||
    "This assessment is based on a visual inspection and limited electrical testing of accessible areas only. Some areas may not have been accessible during the inspection.";
  const isPlaceholderOnly = rawTechnicalNotes && /^(call to confirm|tbc|to be confirmed|pending|n\/a|\s*)$/i.test(String(rawTechnicalNotes).trim());
  const technicalNotes = (rawTechnicalNotes?.trim() && !isPlaceholderOnly)
    ? rawTechnicalNotes
    : "This assessment is based on a visual inspection and limited electrical testing of accessible areas only. Some areas may not have been accessible during the inspection.";
  md.push(technicalNotes);
  md.push("");
  
  return md.join("\n");
}

/**
 * Slot-only Markdown skeleton per REPORT OUTPUT CONTRACT v1
 */
const REPORT_SKELETON = `{{COVER_SECTION}}

<div class="page-break" style="page-break-after:always;"></div>

## Document Purpose & How to Read This Report

{{ASSESSMENT_PURPOSE}}

SENTINEL_PURPOSE_V1

<div class="page-break" style="page-break-after:always;"></div>

## Executive Summary (One-Page Only)

### Overall Electrical Risk Rating
{{OVERALL_STATUS_BADGE}} {{OVERALL_STATUS}}

### Key Decision Signals
{{EXECUTIVE_DECISION_SIGNALS}}

### Financial Planning Snapshot
{{CAPEX_SNAPSHOT}}

<div class="page-break" style="page-break-after:always;"></div>

## Priority Overview

{{PRIORITY_TABLE_ROWS}}

<div class="page-break" style="page-break-after:always;"></div>

## Assessment Scope & Limitations

{{SCOPE_SECTION}}

{{LIMITATIONS_SECTION}}

<div class="page-break" style="page-break-after:always;"></div>

## Observed Conditions & Risk Interpretation

SENTINEL_FINDINGS_V1

{{FINDING_PAGES_HTML}}

<div class="page-break" style="page-break-after:always;"></div>

## Thermal Imaging Analysis

{{THERMAL_SECTION}}

<div class="page-break" style="page-break-after:always;"></div>

## Test Data & Technical Notes

{{TEST_DATA_SECTION}}

{{TECHNICAL_NOTES}}

<div class="page-break" style="page-break-after:always;"></div>

## 5-Year Capital Expenditure (CapEx) Roadmap

{{CAPEX_TABLE_ROWS}}

{{CAPEX_DISCLAIMER_LINE}}

<div class="page-break" style="page-break-after:always;"></div>

## Decision Pathways

SENTINEL_DECISION_V1

{{DECISION_PATHWAYS}}

<div class="page-break" style="page-break-after:always;"></div>

## Important Legal Limitations & Disclaimer (Terms & Conditions)

{{TERMS_AND_CONDITIONS}}

<div class="page-break" style="page-break-after:always;"></div>

## Closing Statement

{{CLOSING_STATEMENT}}
`;

/**
 * Render Markdown from StructuredReport using slot-only skeleton
 */
export function renderReportFromSlots(report: StructuredReport): string {
  let out = REPORT_SKELETON;
  for (const [key, val] of Object.entries(report)) {
    const slot = `{{${key}}}`;
    out = out.split(slot).join(String(val ?? ""));
  }
  return out;
}

export type BuildStructuredReportParams = BuildReportMarkdownParams & {
  coverData: Record<string, string>;
  reportData: Record<string, unknown>;
  baseUrl?: string;
  signingSecret?: string;
};

/**
 * Assemble StructuredReport (single source of truth) from inspection, canonical, computed, coverData, reportData.
 * Does not write prose directly; only assembles field values.
 */
export async function buildStructuredReport(
  params: BuildStructuredReportParams
): Promise<StructuredReport> {
  console.log("[report] buildReportMarkdown VERSION=" + VERSION);
  const { inspection, canonical, findings, responses, computed, event, coverData, reportData, baseUrl, signingSecret } =
    params;
  const defaultText = await loadDefaultText(event);

  const observedConditions = await buildObservedConditionsSection(
    inspection,
    canonical,
    findings,
    event,
    baseUrl,
    signingSecret
  );
  const termsContent = await loadTermsAndConditions();

  const scopeOnly =
    defaultText.SCOPE_SECTION ||
    defaultText.SCOPE_TEXT ||
    "This assessment is based on a visual inspection and limited electrical testing of accessible areas only.";
  const limitationsList = inspection.limitations?.length
    ? inspection.limitations.map((l) => `- ${l}`).join("\n")
    : defaultText.LIMITATIONS || "Areas that are concealed, locked, or otherwise inaccessible were not inspected.";
  const limitationsOnly = limitationsList + "\n\nThis assessment does not eliminate risk, but provides a structured framework for managing it.";

  const purposeText =
    defaultText.PURPOSE_PARAGRAPH ||
    "This report provides a comprehensive assessment of the electrical condition of the property.";
  const howToRead =
    defaultText.HOW_TO_READ_PARAGRAPH ||
    defaultText.HOW_TO_READ_TEXT ||
    "This report is a decision-support document designed to assist property owners, investors, and asset managers.";
  const assessmentPurpose = `${purposeText} ${howToRead}`;

  const priorityOverview = buildPriorityOverviewSection(findings);
  const thermalSection = buildThermalImagingSection(canonical, defaultText);
  const appendixSection = buildAppendixSection(canonical, defaultText);
  const appendixParts = appendixSection.split("### Technical Notes");
  const testDataSection = (appendixParts[0] || "").replace(/<h2[^>]*>.*?<\/h2>\s*/s, "").trim() || "Test data not captured.";
  const technicalNotesPart = (appendixParts[1] || "").trim() || defaultText.TECHNICAL_NOTES || "This assessment is based on a visual inspection and limited electrical testing of accessible areas only.";
  const capexSection = buildCapExRoadmapSection(computed, defaultText, findings, responses);
  const capexTableRows = capexSection.split(/\*\*Indicative market/)[0]?.trim() || capexSection;
  const capexDisclaimer = "Provided for financial provisioning only. Not a quotation or scope of works.";
  const decisionPathways =
    defaultText.DECISION_PATHWAYS_SECTION ||
    defaultText.DECISION_PATHWAYS_TEXT ||
    "This report provides a framework for managing risk, not removing it.";
  const closingSection = buildClosingSection(canonical, defaultText);
  const coverSection = buildCoverSection(canonical, defaultText);

  return {
    COVER_SECTION: coverSection,
    INSPECTION_ID: coverData.INSPECTION_ID || canonical.inspection_id || "-",
    ASSESSMENT_DATE: coverData.ASSESSMENT_DATE || canonical.assessment_date || "-",
    PREPARED_FOR: coverData.PREPARED_FOR || canonical.prepared_for || "-",
    PREPARED_BY: coverData.PREPARED_BY || canonical.prepared_by || "-",
    PROPERTY_ADDRESS: coverData.PROPERTY_ADDRESS || canonical.property_address || "-",
    PROPERTY_TYPE: coverData.PROPERTY_TYPE || canonical.property_type || "Not specified",
    ASSESSMENT_PURPOSE: coverData.ASSESSMENT_PURPOSE || assessmentPurpose,
    OVERALL_STATUS: String(reportData.OVERALL_STATUS ?? computed.OVERALL_STATUS ?? "MODERATE RISK"),
    OVERALL_STATUS_BADGE: String(reportData.OVERALL_STATUS_BADGE ?? computed.RISK_RATING ?? "🟡 Moderate"),
    EXECUTIVE_DECISION_SIGNALS: String(reportData.EXECUTIVE_DECISION_SIGNALS ?? computed.EXECUTIVE_DECISION_SIGNALS ?? computed.EXECUTIVE_SUMMARY ?? defaultText.EXECUTIVE_SUMMARY ?? "• No immediate safety hazards detected. Conditions can be managed within standard asset planning cycles."),
    CAPEX_SNAPSHOT: (() => {
      const raw = reportData.CAPEX_SNAPSHOT ?? computed.CAPEX_SNAPSHOT ?? computed.CAPEX_RANGE ?? "AUD $0 – $0 (indicative, planning only)";
      const s = String(raw);
      if (!s || s.includes("undefined") || s.trim() === "") return "To be confirmed (indicative, planning only)";
      return s;
    })(),
    PRIORITY_TABLE_ROWS: String(reportData.PRIORITY_TABLE_ROWS ?? priorityOverview),
    PRIORITY_COUNTS: {
      immediate: findings.filter((f) => f.priority === "IMMEDIATE" || f.priority === "URGENT").length,
      recommended: findings.filter((f) => f.priority === "RECOMMENDED_0_3_MONTHS" || f.priority === "RECOMMENDED").length,
      plan: findings.filter((f) => f.priority === "PLAN_MONITOR" || f.priority === "PLAN").length,
    },
    SCOPE_SECTION: scopeOnly || defaultText.SCOPE_SECTION || "This assessment is non-invasive and limited to accessible areas only.",
    LIMITATIONS_SECTION: limitationsOnly,
    FINDING_PAGES_HTML: observedConditions,
    THERMAL_SECTION: thermalSection,
    CAPEX_TABLE_ROWS: capexTableRows,
    CAPEX_DISCLAIMER_LINE: String(reportData.CAPEX_DISCLAIMER_LINE ?? capexDisclaimer),
    DECISION_PATHWAYS: decisionPathways,
    TERMS_AND_CONDITIONS: String(reportData.TERMS_AND_CONDITIONS ?? termsContent),
    TEST_DATA_SECTION: testDataSection,
    TECHNICAL_NOTES: technicalNotesPart,
    CLOSING_STATEMENT: closingSection,
  } as StructuredReport;
}

/**
 * Build report HTML following strict REPORT_STRUCTURE.md order
 *
 * Uses StructuredReport + slot-only skeleton when available.
 * Falls back to legacy section concatenation for backward compatibility.
 */
export async function buildReportHtml(params: BuildReportMarkdownParams): Promise<string> {
  const { inspection, canonical, findings, computed, event } = params;
  
  // Load default text
  const defaultText = await loadDefaultText(event);
  
  const sections: string[] = [];
  
  // 1. Cover
  sections.push(buildCoverSection(canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 2. Document Purpose & How to Read This Report
  sections.push(buildPurposeSection(defaultText));
  sections.push(PAGE_BREAK);
  
  // 3. Executive Summary (One-Page Only)
  sections.push(buildExecutiveSummarySection(computed, findings, defaultText));
  sections.push(PAGE_BREAK);
  
  // 3A. What This Means for You (NEW - Gold Sample inspired)
  sections.push(buildWhatThisMeansSection(findings, params.responses, defaultText));
  sections.push(PAGE_BREAK);
  
  // 4. Priority Overview (Single Table)
  sections.push(buildPriorityOverviewSection(findings));
  sections.push(PAGE_BREAK);
  
  // 5. Assessment Scope & Limitations
  sections.push(buildScopeSection(inspection, canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 6. Observed Conditions & Risk Interpretation (Dynamic Pages)
  // This section already contains HTML from generateFindingPages
  const observedConditions = await buildObservedConditionsSection(inspection, canonical, findings, event);
  sections.push(observedConditions);
  sections.push(PAGE_BREAK);
  
  // 7. Thermal Imaging Analysis (If Applicable)
  sections.push(buildThermalImagingSection(canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 8. Test Data & Technical Notes
  sections.push(buildAppendixSection(canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 9. 5-Year Capital Expenditure (CapEx) Roadmap
  sections.push(buildCapExRoadmapSection(computed, defaultText, findings, params.responses));
  sections.push(PAGE_BREAK);
  
  // 10. Decision Pathways (was Investor Options & Next Steps)
  sections.push(buildDecisionPathwaysSection(defaultText));
  sections.push(PAGE_BREAK);
  
  // 11. Important Legal Limitations & Disclaimer (Terms & Conditions)
  const terms = await buildTermsSection();
  sections.push(terms);
  sections.push(PAGE_BREAK);
  
  // 12. Closing Statement (last section, no PAGE_BREAK after)
  sections.push(buildClosingSection(canonical, defaultText));
  
  // Combine all sections (mix of Markdown and HTML)
  const mixedContent = sections.join("");
  
  // Convert Markdown parts to HTML (HTML parts pass through unchanged due to html: true)
  const html = markdownToHtml(mixedContent);
  
  return html;
}

/**
 * @deprecated Use buildReportHtml instead. This function is kept for backward compatibility.
 */
export async function buildReportMarkdown(params: BuildReportMarkdownParams): Promise<string> {
  return buildReportHtml(params);
}
