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
import { getAssetDisplayTitle } from "./assetTitles";
import { sanitizeForClientReport, replaceMockTextForProduction } from "./sanitizeText";
import { generateFindingPages, type Finding, type Response } from "./generateFindingPages";
import { buildComputedFields } from "./buildComputedFields";
import { dedupeSentences } from "./textDedupe";
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
  findings: Array<{ id: string; priority: string; title?: string; observed?: string; facts?: string; photo_ids?: string[] }>;
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
 * Section 2: Document Purpose & How to Read This Report (Gold Sample format)
 */
function buildPurposeSection(defaultText: any): string {
  const md: string[] = [];
  
  md.push('<h2 class="page-title">Page 2 | Document Purpose & How to Read This Report</h2>');
  md.push("");
  
  // Document Purpose
  md.push("## Document Purpose");
  md.push("");
  const purposeText = defaultText.PURPOSE_PARAGRAPH || 
    "This report provides a comprehensive assessment of the electrical condition of the property, identifying safety concerns, compliance issues, and maintenance recommendations based on a visual inspection and electrical testing performed in accordance with applicable standards.";
  md.push(purposeText + " This report is designed to support decisions where technical expertise, financial exposure, and long-term asset planning intersect.");
  md.push("");
  
  // What this report IS NOT
  md.push("### What This Report Is NOT");
  md.push("");
  md.push("- An inspection report with pass/fail certification");
  md.push("- A compliance certificate");
  md.push("- A repair quotation or scope of works");
  md.push("");
  
  // How to Read This Report (NEW - Gold Sample format)
  md.push("## How to Read This Report");
  md.push("");
  md.push("This report is designed to help you make electrical decisions with clarity and confidence. It separates:");
  md.push("");
  md.push("- **(a)** what was observed");
  md.push("- **(b)** what it means from a risk perspective");
  md.push("- **(c)** what to plan for financially");
  md.push("");
  
  // Recommended Reading Order (NEW - Gold Sample)
  md.push("### Recommended Reading Order");
  md.push("");
  md.push("Most owners should:");
  md.push("");
  md.push("1. **Start with Pages 3-4** (Executive Summary + What This Means for You)");
  md.push("2. **Use the CapEx Roadmap** (Page 10) to set a realistic budget provision for the next 0–5 years");
  md.push("3. **Read the Evidence section** (Page 7) only if you want the underlying observations and photos");
  md.push("");
  
  return md.join("\n");
}

/**
 * Section 2.5: How We Assess Risk — 9 dimensions explained (investor-focused, supports trust & upsell)
 */
function buildHowWeAssessRiskSection(): string {
  const md: string[] = [];
  md.push('<h2 class="page-title">How We Assess Risk</h2>');
  md.push("");
  md.push("Each finding in this report has been evaluated across **9 independent risk dimensions** using a structured assessment framework. This ensures priorities reflect actual risk exposure—not subjective judgment or sales incentives.");
  md.push("");
  md.push("### The 9 Risk Dimensions");
  md.push("");
  md.push("| Dimension | What We Evaluate | Why It Matters |");
  md.push("|------------|------------------|----------------|");
  md.push("| **Safety Impact** | Could this cause injury or fire if left unaddressed? | Liability exposure |");
  md.push("| **Escalation Risk** | Will the condition worsen over time or remain stable? | Future cost volatility |");
  md.push("| **Time Flexibility** | Can this be planned into a scheduled maintenance cycle? | Operational disruption |");
  md.push("| **Compliance Risk** | Does this create regulatory or insurance documentation gaps? | Transaction readiness |");
  md.push("| **Tenant Disruption** | Will fixing this require vacant possession or cause inconvenience? | Rental continuity |");
  md.push("| **Asset Value Impact** | Could this affect property valuation or marketability? | Exit strategy |");
  md.push("| **Cost Predictability** | Is the repair cost stable or subject to scope creep? | Budget confidence |");
  md.push("| **Observability** | Is the issue visible or will it surprise a buyer's inspector? | Negotiation risk |");
  md.push("| **Planning Value** | Does addressing this create strategic leverage (e.g. bundle with reno)? | Capital efficiency |");
  md.push("");
  md.push("### How Priorities Are Determined");
  md.push("");
  md.push("- **🔴 Urgent:** High safety impact + immediate action required (rare: only a small share of findings).");
  md.push("- **🟡 Recommended:** Moderate risk + planning flexibility → best addressed within 6–18 months in scheduled work.");
  md.push("- **🟢 Acceptable:** Low risk + stable condition → monitor at next inspection or renovation trigger.");
  md.push("");
  md.push("_By separating what was observed from what it means, you can challenge contractor quotes, prioritise capital spend, and avoid emotional decision-making. Each finding's Risk Assessment Profile (see individual pages) shows the underlying logic._");
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
  
  // Priority Snapshot (NEW - Gold Sample)
  md.push("### Priority Snapshot");
  md.push("");
  const immediateCount = findings.filter(f => f.priority === "IMMEDIATE" || f.priority === "URGENT").length;
  const recommendedCount = findings.filter(f => f.priority === "RECOMMENDED" || f.priority === "RECOMMENDED_0_3_MONTHS").length;
  const planCount = findings.filter(f => f.priority === "PLAN" || f.priority === "PLAN_MONITOR" || f.priority === "MONITOR").length;
  
  md.push("| Priority | Meaning | Investor Interpretation |");
  md.push("|----------|---------|-------------------------|");
  md.push("| 🔴 Urgent liability risk | Immediate action required | Do not defer. Treat as time-critical risk control. |");
  md.push("| 🟡 Budgetary provision recommended | No active fault, but upgrade advisable | Plan into CapEx and schedule within window. |");
  md.push("| 🟢 Monitor / Acceptable | No action required at this stage | Keep on watchlist; avoid unnecessary spend now. |");
  md.push("");
  md.push(`*This assessment identified: ${immediateCount} urgent, ${recommendedCount} recommended, ${planCount} acceptable items*`);
  md.push("");
  
  // CapEx Snapshot
  const capexSnapshot = computed.CAPEX_SNAPSHOT || computed.CAPEX_RANGE || "To be confirmed";
  md.push(`### Financial Planning Snapshot`);
  md.push(`**Estimated Capital Expenditure Range:** ${capexSnapshot}`);
  md.push("");
  
  return md.join("\n");
}

/**
 * Priority Snapshot table (Gold Sample format) - 3-column table for Executive Summary
 */
function buildPrioritySnapshotTable(findings: Array<{ priority: string }>): string {
  const immediateCount = findings.filter(f => f.priority === "IMMEDIATE" || f.priority === "URGENT").length;
  const recommendedCount = findings.filter(f => f.priority === "RECOMMENDED" || f.priority === "RECOMMENDED_0_3_MONTHS").length;
  const planCount = findings.filter(f => f.priority === "PLAN" || f.priority === "PLAN_MONITOR" || f.priority === "MONITOR").length;
  const md: string[] = [];
  md.push("| Priority | Meaning | Investor Interpretation |");
  md.push("|----------|---------|-------------------------|");
  md.push("| Urgent liability risk | Immediate action required to reduce safety/legal exposure | Do not defer. Treat as time-critical risk control. |");
  md.push("| Budgetary provision recommended | No active fault detected, but upgrade is advisable within an asset cycle | Plan into CapEx and schedule within the stated window. |");
  md.push("| Monitor / Acceptable | No action required at this stage; revisit at next review or renovation | Keep on watchlist; avoid unnecessary spend now. |");
  md.push("");
  md.push(`*This assessment identified: ${immediateCount} urgent, ${recommendedCount} recommended, ${planCount} acceptable items*`);
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
      const profile = getFindingProfile(f.id);
      const displayTitle = getAssetDisplayTitle(f.id, profile.asset_component || profile.messaging?.title, f.title);
      const resp = responses?.findings?.[f.id];
      const timeline = resp?.timeline || "immediately";
      const reason = sanitizeForClientReport(resp?.why_it_matters) || "to reduce liability risk";
      md.push(`- **${displayTitle}** should be addressed ${timeline} ${reason}.`);
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
      const profile = getFindingProfile(f.id);
      const displayTitle = getAssetDisplayTitle(f.id, profile.asset_component || profile.messaging?.title, f.title);
      const resp = responses?.findings?.[f.id];
      const timeline = resp?.timeline || "within 12 months";
      const reason = sanitizeForClientReport(resp?.why_it_matters) || "to reduce future risk";
      md.push(`- **${displayTitle}** recommended ${timeline} ${reason}.`);
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
      const profile = getFindingProfile(f.id);
      const displayTitle = getAssetDisplayTitle(f.id, profile.asset_component || profile.messaging?.title, f.title);
      const resp = responses?.findings?.[f.id];
      const context = sanitizeForClientReport(resp?.planning_guidance) || "during next scheduled electrical works";
      md.push(`- **${displayTitle}** can be addressed ${context}.`);
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
  findings: Array<{ id: string; priority: string; title?: string; observed?: string; facts?: string; location?: string }>,
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
  
  // Load profiles and messages (DB-first, YAML-fallback)
  const findingIds = findings.map((f) => f.id);
  const { getFindingMessagesBatch } = await import("./getFindingMessage");
  const responsesMap: Record<string, Response> = await getFindingMessagesBatch(findingIds);
  const profilesMap = loadFindingProfiles();
  
  // Convert findings to Finding type (preserve photo_ids, location for custom title "Asset–Condition" display)
  const findingList: Finding[] = findings.map(f => ({
    id: f.id,
    priority: f.priority,
    title: f.title,
    observed: f.observed,
    facts: f.facts,
    photo_ids: f.photo_ids ?? (f as any).photo_ids,
    location: (f as any).location,
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
 * Methodology overview (Gold Sample Section 5)
 */
function buildMethodologySection(defaultText: any): string {
  const md: string[] = [];
  md.push("- Visual review of accessible components (switchboard, outlets, smoke alarms, visible cabling, labels).");
  md.push("- Functional checks where appropriate (RCD test button, sample outlet polarity/earth continuity where accessible).");
  md.push("- Thermal imaging (if performed) to identify abnormal heat signatures under typical load conditions.");
  md.push("- Risk classification based on likelihood of escalation + consequence to safety/legal exposure + timing flexibility.");
  md.push("");
  return md.join("\n");
}

/** Risk indicator → interpretation ( Premium thermal module ) */
const THERMAL_INTERPRETATION: Record<string, string> = {
  GREEN: "No significant abnormal heat signatures observed at the time of inspection.",
  AMBER: "Moderate temperature variance observed; may indicate increased resistance and warrants monitoring.",
  RED: "Abnormal heat signature observed; further investigation recommended as a priority.",
};
/** Risk indicator → recommended action */
const THERMAL_RECOMMENDED_ACTION: Record<string, string> = {
  GREEN: "No immediate action required; retain as baseline for future comparison.",
  AMBER: "Schedule targeted inspection/retightening within 3–6 months.",
  RED: "Arrange investigation and rectification as soon as practicable.",
};
/** Planning guidance (same for all; bundle with maintenance) */
const THERMAL_PLANNING_GUIDANCE = "Consider bundling with switchboard work, RCD upgrades, or planned maintenance where practical.";

/**
 * Section 7: Thermal Imaging Analysis (Premium – THERMAL RISK SCREENING)
 * Renders only if raw.thermal.enabled=true AND raw.thermal.captures.length>0.
 */
function buildThermalImagingSection(
  inspection: StoredInspection,
  canonical: CanonicalInspection,
  defaultText: any
): string {
  const raw = inspection?.raw as Record<string, unknown> | undefined;
  const thermalRaw = raw?.thermal as Record<string, unknown> | undefined;
  const enabled = !!thermalRaw?.enabled;
  const captures = Array.isArray(thermalRaw?.captures) ? (thermalRaw.captures as Record<string, unknown>[]) : [];

  if (!enabled || captures.length === 0) {
    return (
      '<h2 class="page-title">Page 8 | Thermal Imaging Analysis (If Applicable)</h2>\n\n' +
      (defaultText.THERMAL_VALUE_STATEMENT ||
        defaultText.THERMAL_METHOD ||
        "Thermal imaging analysis provides a non-invasive method for identifying potential electrical issues that may not be visible during standard visual inspection. No thermal imaging data was captured for this assessment.")
    );
  }

  const ambient = thermalRaw?.ambient_c != null ? Number(thermalRaw.ambient_c) : null;
  const device = typeof thermalRaw?.device === "string" ? String(thermalRaw.device) : "";

  const parts: string[] = [];
  parts.push('<h2 class="page-title">THERMAL RISK SCREENING</h2>');
  parts.push("");

  // Executive Snapshot table
  parts.push('<h3>Executive Snapshot</h3>');
  parts.push('<table><thead><tr><th>Area</th><th>Max Temp</th><th>Ambient</th><th>Delta</th><th>Risk Indicator</th></tr></thead><tbody>');
  for (const cap of captures) {
    const area = String(cap.area ?? "");
    const max = cap.max_temp_c != null ? String(cap.max_temp_c) : "";
    const amb = ambient != null ? String(ambient) : "";
    const delta = cap.delta_c != null ? String(cap.delta_c) : "";
    const risk = String(cap.risk_indicator ?? "").toUpperCase() || "";
    parts.push(`<tr><td>${escapeHtml(area)}</td><td>${escapeHtml(max)}</td><td>${escapeHtml(amb)}</td><td>${escapeHtml(delta)}</td><td>${escapeHtml(risk)}</td></tr>`);
  }
  parts.push("</tbody></table>");
  parts.push("");

  for (const cap of captures) {
    const area = String(cap.area ?? "");
    const capId = String(cap.id ?? "");
    const max = cap.max_temp_c != null ? Number(cap.max_temp_c) : null;
    const delta = cap.delta_c != null ? Number(cap.delta_c) : null;
    const risk = String(cap.risk_indicator ?? "").toUpperCase();
    const interp = THERMAL_INTERPRETATION[risk] || THERMAL_INTERPRETATION.GREEN;
    const action = THERMAL_RECOMMENDED_ACTION[risk] || THERMAL_RECOMMENDED_ACTION.GREEN;

    parts.push(`<h3>${escapeHtml(area)} — Thermal Capture ${escapeHtml(capId)}</h3>`);
    parts.push('<div class="thermal-tile" style="margin-bottom:1.5em;">');
    parts.push('<p><strong>Data:</strong> Max ' + (max != null ? max : "-") + " °C; Ambient " + (ambient != null ? ambient : "-") + " °C; Delta " + (delta != null ? delta : "-") + " °C; Risk: " + escapeHtml(risk || "-") + "</p>");
    parts.push("<p><strong>Interpretation:</strong> " + escapeHtml(interp) + "</p>");
    parts.push("<p><strong>Recommended Action:</strong> " + escapeHtml(action) + "</p>");
    parts.push("<p><strong>Planning Guidance:</strong> " + THERMAL_PLANNING_GUIDANCE + "</p>");
    parts.push('<p style="color:#666;font-size:0.9em;">Thermal and visible images: Photo ' + escapeHtml(String(cap.thermal_photo_id || "-")) + " / Photo " + escapeHtml(String(cap.visible_photo_id || "-")) + " (view via report link if available).</p>");
    parts.push("</div>");
    parts.push("");
  }

  if (device) {
    parts.push("<p><em>Device: " + escapeHtml(device) + "</em></p>");
    parts.push("");
  }

  return parts.join("\n");
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Get timeline based on priority (Gold Sample format - month ranges)
 */
function getTimelineFromPriority(priority: string): string {
  const upper = priority.toUpperCase();
  if (upper === "IMMEDIATE") return "0–1 month";
  if (upper === "URGENT") return "0–3 months";
  if (upper === "RECOMMENDED_0_3_MONTHS" || upper === "RECOMMENDED") return "6–18 months";
  if (upper === "PLAN_MONITOR" || upper === "PLAN") return "Next renovation";
  return "To be confirmed";
}

/**
 * Get priority display text (Gold Sample format - investor labels)
 */
function getPriorityDisplayText(priority: string): string {
  const upper = priority.toUpperCase();
  if (upper === "IMMEDIATE" || upper === "URGENT") return "Urgent liability risk";
  if (upper === "RECOMMENDED_0_3_MONTHS" || upper === "RECOMMENDED") return "Budgetary provision recommended";
  if (upper === "PLAN_MONITOR" || upper === "PLAN") return "Monitor / Acceptable";
  return "Monitor / Acceptable";
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
  
  // Fallback to profile messaging or title — never show developer-facing text
  const whyMatters = profile?.messaging?.why_it_matters;
  if (whyMatters && sanitizeForClientReport(whyMatters)) {
    return sanitizeForClientReport(whyMatters)!.substring(0, 100);
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
  findings: Array<{ id: string; priority: string; title?: string; observed?: string; facts?: string; location?: string }>,
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
      
      const assetItem = getAssetDisplayTitle(
        finding.id,
        profile.asset_component || profile.messaging?.title,
        finding.title
      );
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
  
  // Option D - Management plan integration (framed as reducing cognitive load, not sales)
  md.push("### Option D — Management plan integration");
  md.push(defaultText.DECISION_PATHWAY_MANAGEMENT_PLAN || 
    "Some owners delegate ongoing coordination—interpretation of this report, contractor briefing, quotation review, and completion verification—to a structured management arrangement. " +
    "Doing so can reduce cognitive load, decision fatigue, and coordination risk: less time spent interpreting quotes, less risk of over-scoping when quotes exceed the report's priorities, and consistent application of the same framework across inspections and tenancy changes. " +
    "This pathway is optional; the report remains sufficient for those who prefer to manage decisions themselves.");
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
 * Convert appendix markdown (with raw HTML and pipe tables) to docx-safe plain text.
 * Removes raw tags so Word does not show <h2...> or |---|; converts tables to tab-separated lines.
 */
export function appendixMarkdownToDocxSafeText(md: string): string {
  let out = md
    .replace(/^###\s+/gm, "") // strip Markdown ### headings so Word does not show "### "
    .replace(/^##\s+/gm, "")
    .replace(/<h2[^>]*>([^<]*)<\/h2>/gi, "$1\n")
    .replace(/<h3[^>]*>([^<]*)<\/h3>/gi, "$1\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  const lines = out.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\|.+\|$/.test(trimmed)) {
      const parts = trimmed.split("|").map((c) => c.trim());
      const cells = parts.length > 2 ? parts.slice(1, -1) : parts;
      if (cells.some((c) => c.length > 0)) {
        result.push(cells.join("\t"));
      }
      continue;
    }
    result.push(trimmed);
  }
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Section 12: Appendix – Test Data & Technical Notes
 * Exported for use in Gold template APPENDIX_CONTENT (full test details).
 */
export function buildAppendixSection(canonical: CanonicalInspection, defaultText: any): string {
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
  
  // Extract GPO test data (support gpo_tests.rooms → summary when summary missing; exclude not_accessible rooms)
  const gpoPerformed = extractValue(gpoTests.performed);
  if (gpoPerformed === true || gpoPerformed === "true" || gpoPerformed === "yes") {
    let summary = gpoTests.summary as Record<string, unknown> | undefined;
    const rooms = gpoTests.rooms as Array<Record<string, unknown>> | undefined;
    const accessibleRooms = Array.isArray(rooms) ? rooms.filter((r) => r?.room_access !== "not_accessible") : [];
    const notAccessibleCount = Array.isArray(rooms) ? rooms.filter((r) => r?.room_access === "not_accessible").length : 0;
    if (!summary && accessibleRooms.length > 0) {
      const totalTested = accessibleRooms.reduce((s, r) => s + (Number(r.tested_count) || 0), 0);
      const passSum = accessibleRooms.reduce((s, r) => s + (Number(r.pass_count) || 0), 0);
      summary = { total_gpo_tested: totalTested, polarity_pass: passSum, earth_present_pass: passSum };
    }
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
    if (notAccessibleCount > 0) {
      testMeasurements.push({
        test: "GPO Testing",
        parameter: "Potential risk",
        value: `${notAccessibleCount} room(s) not accessible – could not be tested`,
        unit: ""
      });
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
  
  // Technical Notes (filter placeholder-like values; remove mock/demo text for production)
  md.push("### Technical Notes");
  md.push("");
  let rawTechnicalNotes = canonical.technician_notes || defaultText.TECHNICAL_NOTES ||
    "This assessment is based on a visual inspection and limited electrical testing of accessible areas only. Some areas may not have been accessible during the inspection.";
  rawTechnicalNotes = replaceMockTextForProduction(rawTechnicalNotes) || defaultText.TECHNICAL_NOTES ||
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

## 1. How to read this report

{{HOW_TO_READ_SECTION}}

<div class="page-break" style="page-break-after:always;"></div>

## 2. Executive decision summary

### Overall risk position
{{OVERALL_STATUS_BADGE}} {{OVERALL_STATUS}}

{{EXECUTIVE_DECISION_SIGNALS}}

### Priority snapshot
{{PRIORITY_SNAPSHOT_TABLE}}

### Total estimated CapEx provision (0–5 years)
{{CAPEX_SNAPSHOT}}

<div class="page-break" style="page-break-after:always;"></div>

## 3. What this means for you

{{WHAT_THIS_MEANS_SECTION}}

<div class="page-break" style="page-break-after:always;"></div>

## 4. Scope and independence statement

{{SCOPE_SECTION}}

{{LIMITATIONS_SECTION}}

<div class="page-break" style="page-break-after:always;"></div>

## 5. Methodology overview

{{METHODOLOGY_SECTION}}

<div class="page-break" style="page-break-after:always;"></div>

## 6. Observations and evidence

SENTINEL_FINDINGS_V1

{{FINDING_PAGES_HTML}}

<div class="page-break" style="page-break-after:always;"></div>

## 7. Risk prioritisation framework

{{PRIORITY_TABLE_ROWS}}

<div class="page-break" style="page-break-after:always;"></div>

## 8. Thermal imaging analysis

{{THERMAL_SECTION}}

<div class="page-break" style="page-break-after:always;"></div>

## 9. 5-year CapEx roadmap (budget plan)

{{CAPEX_TABLE_ROWS}}

{{CAPEX_DISCLAIMER_LINE}}

<div class="page-break" style="page-break-after:always;"></div>

## 10. Owner decision pathways

SENTINEL_DECISION_V1

{{DECISION_PATHWAYS}}

<div class="page-break" style="page-break-after:always;"></div>

## 11. Terms, limitations and legal framework

{{TERMS_AND_CONDITIONS}}

<div class="page-break" style="page-break-after:always;"></div>

## 12. Appendix (photos and test notes)

{{TEST_DATA_SECTION_HTML}}

### Technical Notes
{{TECHNICAL_NOTES}}

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
  console.log("[report-fp] buildStructuredReport: observedConditions type=" + typeof observedConditions + " length=" + (observedConditions ? observedConditions.length : "null"));
  const termsContent = (await loadTermsAndConditions()) || "Terms and conditions apply. Please refer to the full terms document.";

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
  const thermalSection = buildThermalImagingSection(inspection, canonical, defaultText);
  const appendixSection = buildAppendixSection(canonical, defaultText);
  const appendixParts = appendixSection.split("### Technical Notes");
  const testDataSection = (appendixParts[0] || "").replace(/<h2[^>]*>.*?<\/h2>\s*/s, "").trim() || "Test data not captured.";
  const technicalNotesPart = (appendixParts[1] || "").trim() || defaultText.TECHNICAL_NOTES || "This assessment is based on a visual inspection and limited electrical testing of accessible areas only.";
  
  // Convert testDataSection (markdown) to HTML for Word template
  // markdownToHtml returns full HTML document, extract body content
  const fullHtml = markdownToHtml(testDataSection);
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(fullHtml);
  const testDataSectionHtml = bodyMatch ? bodyMatch[1].trim() : fullHtml.replace(/<!doctype[^>]*>/gi, "").replace(/<html[^>]*>/gi, "").replace(/<\/html>/gi, "").replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "").replace(/<body[^>]*>/gi, "").replace(/<\/body>/gi, "").trim();
  const capexSection = buildCapExRoadmapSection(computed, defaultText, findings, responses);
  const capexTableRows = capexSection.split(/\*\*Indicative market/)[0]?.trim() || capexSection;
  const capexDisclaimer = "Provided for financial provisioning only. Not a quotation or scope of works.";

  // Build Executive / What This Means / Decision Pathways via computed fields (no repetition)
  const immediateCount = findings.filter((f) => f.priority === "IMMEDIATE" || f.priority === "URGENT").length;
  const recommendedCount = findings.filter((f) => f.priority === "RECOMMENDED" || f.priority === "RECOMMENDED_0_3_MONTHS").length;
  const planCount = findings.filter((f) => f.priority === "PLAN" || f.priority === "PLAN_MONITOR").length;
  const built = buildComputedFields({
    overallStatus: String(reportData.OVERALL_STATUS ?? computed.OVERALL_STATUS ?? "MODERATE RISK"),
    riskRating: String(reportData.RISK_RATING ?? computed.RISK_RATING ?? "MODERATE"),
    capexSnapshot: String(reportData.CAPEX_SNAPSHOT ?? computed.CAPEX_SNAPSHOT ?? computed.CAPEX_RANGE ?? "To be confirmed"),
    immediateCount,
    recommendedCount,
    planCount,
    defaultText,
  });
  const { blocks: deduped, removedCount } = dedupeSentences(
    { exec: built.EXEC_SUMMARY_CORE, interp: built.INTERPRETATION_GUIDANCE, decision: built.DECISION_PATHWAYS_BULLETS },
    { minLen: 15 }
  );
  const execCore = deduped.exec || built.EXEC_SUMMARY_CORE;
  const whatThisMeansSection = deduped.interp || built.INTERPRETATION_GUIDANCE;
  const decisionPathways = deduped.decision || built.DECISION_PATHWAYS_BULLETS;

  if (process.env.NODE_ENV !== "production") {
    console.log("[textDedupe] exec len=" + execCore.length + ", interp len=" + whatThisMeansSection.length + ", decision len=" + decisionPathways.length + ", removedCount=" + removedCount);
  }

  const closingSection = buildClosingSection(canonical, defaultText);
  const howToReadSection = buildPurposeSection(defaultText);
  const prioritySnapshotTable = buildPrioritySnapshotTable(findings);
  const methodologySection = buildMethodologySection(defaultText);
  const coverSection = buildCoverSection(canonical, defaultText);

  const reportObject = {
    COVER_SECTION: coverSection,
    INSPECTION_ID: coverData.INSPECTION_ID || canonical.inspection_id || "-",
    ASSESSMENT_DATE: coverData.ASSESSMENT_DATE || canonical.assessment_date || "-",
    PREPARED_FOR: coverData.PREPARED_FOR || canonical.prepared_for || "-",
    PREPARED_BY: coverData.PREPARED_BY || canonical.prepared_by || "-",
    PROPERTY_ADDRESS: coverData.PROPERTY_ADDRESS || canonical.property_address || "-",
    PROPERTY_TYPE: coverData.PROPERTY_TYPE || canonical.property_type || "Not specified",
    ASSESSMENT_PURPOSE: coverData.ASSESSMENT_PURPOSE || assessmentPurpose,
    HOW_TO_READ_SECTION: howToReadSection,
    WHAT_THIS_MEANS_SECTION: whatThisMeansSection,
    PRIORITY_SNAPSHOT_TABLE: prioritySnapshotTable,
    OVERALL_STATUS: String(reportData.OVERALL_STATUS ?? computed.OVERALL_STATUS ?? "MODERATE RISK"),
    OVERALL_STATUS_BADGE: String(reportData.OVERALL_STATUS_BADGE ?? computed.RISK_RATING ?? "🟡 Moderate"),
    EXECUTIVE_DECISION_SIGNALS: (() => {
      const v = execCore || (reportData.EXECUTIVE_DECISION_SIGNALS ?? computed.EXECUTIVE_DECISION_SIGNALS ?? computed.EXECUTIVE_SUMMARY ?? defaultText.EXECUTIVE_SUMMARY ?? "• No immediate safety hazards detected. Conditions can be managed within standard asset planning cycles.");
      const s = String(v ?? "");
      return s && !s.toLowerCase().includes("undefined") && s !== "null" ? s : "• No immediate safety hazards detected. Conditions can be managed within standard asset planning cycles.";
    })(),
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
    METHODOLOGY_SECTION: methodologySection,
    FINDING_PAGES_HTML: observedConditions,
    THERMAL_SECTION: thermalSection,
    CAPEX_TABLE_ROWS: capexTableRows,
    CAPEX_DISCLAIMER_LINE: (() => {
      const v = reportData.CAPEX_DISCLAIMER_LINE ?? capexDisclaimer;
      const s = String(v ?? capexDisclaimer);
      return s && !s.toLowerCase().includes("undefined") && s !== "null" ? s : capexDisclaimer;
    })(),
    DECISION_PATHWAYS: decisionPathways,
    TERMS_AND_CONDITIONS: (() => {
      const v = reportData.TERMS_AND_CONDITIONS ?? termsContent;
      const s = String(v ?? termsContent ?? "");
      return s && !s.toLowerCase().includes("undefined") && s !== "null" ? s : (termsContent || "Terms and conditions apply. Please refer to the full terms document.");
    })(),
    TEST_DATA_SECTION: testDataSection,
    TEST_DATA_SECTION_HTML: testDataSectionHtml, // HTML version for Word template
    TECHNICAL_NOTES: technicalNotesPart,
    CLOSING_STATEMENT: closingSection,
  } as StructuredReport;
  return reportObject;
}

/**
 * Build report HTML following strict REPORT_STRUCTURE.md order
 *
 * Uses StructuredReport + slot-only skeleton when available.
 * Falls back to legacy section concatenation for backward compatibility.
 */
export async function buildReportHtml(params: BuildReportMarkdownParams): Promise<string> {
  const { inspection, canonical, findings, computed, event } = params;
  
  // Load messages: DB-first, YAML-fallback
  const findingIds = findings.map((f) => f.id);
  const { getFindingMessagesBatch } = await import("./getFindingMessage");
  const responsesMap = await getFindingMessagesBatch(findingIds);
  // Create responses object matching expected shape for backward compatibility
  const responses = { findings: responsesMap, defaults: params.responses?.defaults };
  
  // Load default text
  const defaultText = await loadDefaultText(event);
  
  const sections: string[] = [];
  
  // 1. Cover
  sections.push(buildCoverSection(canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 2. Document Purpose & How to Read This Report
  sections.push(buildPurposeSection(defaultText));
  sections.push(PAGE_BREAK);
  
  // 2.5. How We Assess Risk (9 dimensions — investor-focused)
  sections.push(buildHowWeAssessRiskSection());
  sections.push(PAGE_BREAK);
  
  // 3. Executive Summary (One-Page Only)
  sections.push(buildExecutiveSummarySection(computed, findings, defaultText));
  sections.push(PAGE_BREAK);
  
  // 3A. What This Means for You (NEW - Gold Sample inspired)
  sections.push(buildWhatThisMeansSection(findings, responses, defaultText));
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
  sections.push(buildThermalImagingSection(inspection, canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 8. Test Data & Technical Notes
  sections.push(buildAppendixSection(canonical, defaultText));
  sections.push(PAGE_BREAK);
  
  // 9. 5-Year Capital Expenditure (CapEx) Roadmap
  sections.push(buildCapExRoadmapSection(computed, defaultText, findings, responses));
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
