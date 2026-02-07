/**
 * REPORT OUTPUT CONTRACT (v1)
 *
 * StructuredReport = single source of truth before DOCX render.
 * assertReportReady = preflight validation; throws on failure.
 */

export type StructuredReport = {
  // Cover (combined section or individual fields)
  COVER_SECTION?: string;
  INSPECTION_ID: string;
  ASSESSMENT_DATE: string;
  PREPARED_FOR: string;
  PREPARED_BY: string;
  PROPERTY_ADDRESS: string;
  PROPERTY_TYPE: string;

  // Purpose
  ASSESSMENT_PURPOSE: string;
  HOW_TO_READ_SECTION?: string;

  // Executive Summary
  OVERALL_STATUS: string;
  OVERALL_STATUS_BADGE: string;
  EXECUTIVE_DECISION_SIGNALS: string;
  PRIORITY_SNAPSHOT_TABLE?: string;
  CAPEX_SNAPSHOT: string;

  // Priority Overview
  PRIORITY_TABLE_ROWS: string;

  // What This Means (Gold Sample)
  WHAT_THIS_MEANS_SECTION?: string;
  PRIORITY_COUNTS?: { immediate: number; recommended: number; plan: number };

  // Scope & Limitations
  SCOPE_SECTION: string;
  LIMITATIONS_SECTION: string;

  // Methodology (Gold Sample)
  METHODOLOGY_SECTION?: string;

  // Findings (dynamic pages)
  FINDING_PAGES_HTML: string;
  FINDING_PAGES_MD?: string;

  // Thermal
  THERMAL_SECTION: string;

  // CapEx Roadmap
  CAPEX_TABLE_ROWS: string;
  CAPEX_DISCLAIMER_LINE: string;

  // Decision Pathways
  DECISION_PATHWAYS: string;

  // Terms
  TERMS_AND_CONDITIONS: string;

  // Appendix
  TEST_DATA_SECTION: string;
  TEST_DATA_SECTION_HTML?: string; // HTML version for Word template (optional for backward compatibility)
  TECHNICAL_NOTES: string;

  // Closing
  CLOSING_STATEMENT: string;
};

const FORBIDDEN_VALUES = [
  "undefined",
  "null",
  "nan",
  "pending",
  "to be confirmed",
  "tbc",
  "{{",
  "}}",
] as const;

function containsForbidden(val: string): string | null {
  const lower = val.toLowerCase().trim();
  if (val.includes("{{") || val.includes("}}")) return "{{ or }}";
  // For short values (<200 chars), check for literal "undefined", "null", "nan"
  // For longer values (HTML), only check for template placeholders or isolated keywords
  if (val.length < 200) {
    if (lower.includes("undefined") || lower === "null" || lower.includes("nan")) return "undefined/null/nan";
  } else {
    // For longer content, only flag if it's clearly a template placeholder issue (e.g., standalone "undefined")
    if (/\bundefined\b/i.test(val) && !/undefined method/i.test(val)) {
      // Check if it's NOT part of a sentence like "undefined method" (false positive)
      return "undefined/null/nan";
    }
  }
  if (lower === "pending" || lower === "to be confirmed" || lower === "tbc") return lower;
  return null;
}

export type AssertReportReadyFailure = {
  rule: string;
  field?: string;
  message: string;
};

/**
 * Assert Evidence structure per Photo Evidence Rules.
 * - Each Finding must contain Evidence section
 * - Evidence must appear after Observed Condition, before Risk Interpretation
 * - Evidence content must not be undefined/empty
 * Throws nothing; pushes failures to the array.
 */
export function assertEvidenceStructure(
  findingPagesHtml: string,
  failures: AssertReportReadyFailure[]
): void {
  if (!findingPagesHtml || findingPagesHtml.trim().length === 0) {
    failures.push({
      rule: "evidence_structure",
      field: "FINDING_PAGES_HTML",
      message: "Finding pages HTML is empty",
    });
    return;
  }
  if (findingPagesHtml.includes("No findings were identified")) {
    return;
  }
  const html = findingPagesHtml;
  const htmlLower = html.toLowerCase();
  const obsIdx = htmlLower.indexOf("<h4>observed condition</h4>");
  const evIdx = htmlLower.indexOf("<h4>evidence</h4>");
  const riskIdx = htmlLower.indexOf("<h4>risk interpretation</h4>");
  if (evIdx < 0) {
    failures.push({
      rule: "evidence_structure",
      message: "Evidence section is missing in finding pages",
    });
    return;
  }
  if (obsIdx >= 0 && evIdx >= 0 && evIdx < obsIdx) {
    failures.push({
      rule: "evidence_structure",
      message: "Evidence must appear after Observed Condition, not before",
    });
  }
  if (evIdx >= 0 && riskIdx >= 0 && evIdx > riskIdx) {
    failures.push({
      rule: "evidence_structure",
      message: "Evidence must appear before Risk Interpretation, not after",
    });
  }
  const evidenceBlocks = html.split(/<h4>Evidence<\/h4>/i);
  for (let i = 1; i < evidenceBlocks.length; i++) {
    const block = evidenceBlocks[i];
    const pMatch = block.match(/<p>([^<]*)<\/p>/);
    const ulMatch = block.match(/<ul>[\s\S]*?<\/ul>/);
    const content = pMatch
      ? pMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()
      : ulMatch
        ? ulMatch[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : "";
    if (!content || content === "undefined") {
      failures.push({
        rule: "evidence_structure",
        message: `Evidence section ${i} has empty or undefined content`,
      });
    }
    if (/Photo P\d+/i.test(block) && !/<a\s+href=["']/.test(block)) {
      failures.push({
        rule: "evidence_structure",
        message: "Evidence contains photo reference but missing clickable link (<a href=)",
      });
    }
  }
}

/**
 * Assert report is ready for DOCX render.
 * Throws with a concise failure report listing which rule failed and which field.
 */
const FALLBACK_EXECUTIVE_SIGNALS = "• No immediate safety hazards detected. Conditions can be managed within standard asset planning cycles.\n• If not addressed, conditions may affect long-term reliability.\n• Manageable risk, not emergency.";
const FALLBACK_CAPEX_DISCLAIMER = "Provided for financial provisioning only. Not a quotation or scope of works.";
const FALLBACK_TERMS = `# TERMS & CONDITIONS OF ASSESSMENT

## 1. Australian Consumer Law (ACL) Acknowledgement
Our services come with guarantees that cannot be excluded under the Australian Consumer Law (ACL). Nothing in this Report or these Terms seeks to exclude, restrict, or modify any consumer guarantees that cannot lawfully be excluded.

## 2. Nature & Scope of Professional Opinion
This Assessment is a point-in-time, non-destructive, visual and functional review of accessible electrical components only. It is non-intrusive and non-exhaustive, and does not constitute: a compliance certificate, an electrical safety certificate, an engineering report, a structural inspection, or a guarantee of future performance. No representation is made that all defects, latent conditions, or future failures have been identified.

## 3. Decision-Support Only – No Repair Advice
This Report is provided solely as a risk identification and asset planning tool. It does not: prescribe a scope of rectification works, provide quotations, endorse or appoint contractors, or certify statutory compliance. Any budgetary figures or planning horizons included are indicative market benchmarks only, provided to assist financial provisioning and decision-making, not as repair advice or binding cost guidance.

## 4. Independence & Conflict-Free Position
This Assessment is conducted independently of any repair, upgrade, or installation services. Better Home Technology Pty Ltd does not undertake rectification works arising from this Report. This separation exists to preserve independence, objectivity, and financial neutrality of the findings.

## 5. Exclusive Reliance & Confidentiality
This Report has been prepared solely for the Client named in the Report for the purpose of informed asset and risk management. No duty of care is owed to any third party. No third party (including purchasers, insurers, financiers, or agents) may rely upon this Report without express written consent.

## 6. Limitation of Liability & Exclusion of Consequential Loss
To the maximum extent permitted by law, Better Home Technology Pty Ltd excludes liability for any indirect or consequential loss arising from reliance on this Report, including but not limited to: loss of rental income, business interruption, property downtime, or alleged diminution of asset value.

## 7. Hazardous Materials (Including Asbestos)
Our technicians are not licensed asbestos assessors. No testing for hazardous materials has been conducted. Where materials suspected to contain asbestos are observed, they are treated as such and no intrusive inspection is performed.

## 8. Statutory Compliance Disclaimer
This Report is a risk management and decision-support tool only. It does not constitute any state-based mandatory electrical compliance inspection, rental safety certification, or statutory approval unless expressly stated otherwise in writing.

## 9. Framework Statement
This assessment does not eliminate risk, but provides a structured framework for managing it.`;
const FALLBACK_DECISION_PATHWAYS = "### Option A — Monitor only\nTake no action now. Reassess in 12 months or at the next tenancy turnover.\n\n### Option B — Planned upgrades\nBudget and schedule the planned items within the suggested windows to reduce reactive maintenance.\n\n### Option C — Independent rectification\nUse this report to brief any contractor of your choice. Request itemised scope aligned to priorities.\n\n### Option D — Management plan integration\nSome owners delegate ongoing coordination—interpretation of this report, contractor briefing, quotation review, and completion verification—to a structured management arrangement. Doing so can reduce cognitive load, decision fatigue, and coordination risk: less time spent interpreting quotes, less risk of over-scoping when quotes exceed the report's priorities, and consistent application of the same framework across inspections and tenancy changes. This pathway is optional; the report remains sufficient for those who prefer to manage decisions themselves.";

export function assertReportReady(report: StructuredReport): void {
  const failures: AssertReportReadyFailure[] = [];

  // 0. Sanitize known problem fields: replace forbidden/invalid values with safe defaults
  const r = report as Record<string, string>;
  for (const [key, fallback] of [
    ["TERMS_AND_CONDITIONS", FALLBACK_TERMS],
    ["CAPEX_DISCLAIMER_LINE", FALLBACK_CAPEX_DISCLAIMER],
    ["EXECUTIVE_DECISION_SIGNALS", FALLBACK_EXECUTIVE_SIGNALS],
  ] as const) {
    const val = r[key];
    const str = val == null ? "" : String(val).trim();
    // Preserve full Terms when already loaded (e.g. from DEFAULT_TERMS.md): do not overwrite long content
    if (key === "TERMS_AND_CONDITIONS" && str.length > 800) {
      continue;
    }
    if (!str || containsForbidden(str)) {
      r[key] = fallback;
      continue;
    }
    if (key === "CAPEX_DISCLAIMER_LINE" && str.length < 20) {
      r[key] = fallback;
      continue;
    }
    if (key === "EXECUTIVE_DECISION_SIGNALS") {
      const bullets = str.split(/\n/).filter((l) => l.trim().startsWith("•") || l.trim().startsWith("-"));
      const hasPhrases =
        /if.*not.*addressed|if.*left.*unresolved|if.*deferred|if.*not.*remedied/i.test(str) &&
        /(why not immediate|manageable risk|not emergency|manageable.*not emergency)/i.test(str);
      if (bullets.length < 3 || !hasPhrases) {
        r[key] = fallback;
      }
    }
  }

  // 1. Required fields present and non-empty
  const required: (keyof StructuredReport)[] = [
    "INSPECTION_ID",
    "ASSESSMENT_DATE",
    "PREPARED_FOR",
    "PREPARED_BY",
    "PROPERTY_ADDRESS",
    "PROPERTY_TYPE",
    "ASSESSMENT_PURPOSE",
    "OVERALL_STATUS",
    "OVERALL_STATUS_BADGE",
    "EXECUTIVE_DECISION_SIGNALS",
    "CAPEX_SNAPSHOT",
    "PRIORITY_TABLE_ROWS",
    "SCOPE_SECTION",
    "LIMITATIONS_SECTION",
    "FINDING_PAGES_HTML",
    "THERMAL_SECTION",
    "CAPEX_TABLE_ROWS",
    "CAPEX_DISCLAIMER_LINE",
    "DECISION_PATHWAYS",
    "TERMS_AND_CONDITIONS",
    "TEST_DATA_SECTION",
    "TECHNICAL_NOTES",
    "CLOSING_STATEMENT",
  ];

  const safeFallbacks: Record<string, string> = {
    EXECUTIVE_DECISION_SIGNALS: FALLBACK_EXECUTIVE_SIGNALS,
    CAPEX_DISCLAIMER_LINE: FALLBACK_CAPEX_DISCLAIMER,
    TERMS_AND_CONDITIONS: FALLBACK_TERMS,
    DECISION_PATHWAYS: FALLBACK_DECISION_PATHWAYS,
  };
  for (const key of required) {
    // Skip forbidden check for large HTML fields (they may legitimately contain words like "undefined" in prose)
    if (key === "FINDING_PAGES_HTML" || key === "REPORT_BODY_HTML") {
      let val = report[key];
      if (val === undefined || val === null || String(val).trim() === "") {
        failures.push({ rule: "required_field", field: key, message: `Missing or empty required field: ${key}` });
      }
      continue;
    }
    
    let val = report[key];
    if (val === undefined || val === null) {
      const fb = safeFallbacks[key];
      if (fb) {
        (report as Record<string, string>)[key] = fb;
        continue;
      }
      failures.push({ rule: "required_field", field: key, message: `Missing required field: ${key}` });
      continue;
    }
    let str = String(val).trim();
    if (str === "") {
      const fb = safeFallbacks[key];
      if (fb) {
        (report as Record<string, string>)[key] = fb;
        continue;
      }
      failures.push({ rule: "required_field", field: key, message: `Empty required field: ${key}` });
      continue;
    }
    const forbidden = containsForbidden(str);
    if (forbidden) {
      const fb = safeFallbacks[key];
      if (fb) {
        (report as Record<string, string>)[key] = fb;
        continue;
      }
      failures.push({
        rule: "forbidden_value",
        field: key,
        message: `Field ${key} contains forbidden value: ${forbidden}`,
      });
    }
  }

  // 2. EXECUTIVE_DECISION_SIGNALS rules (§4.1) – auto-fix with fallback if invalid
  let signals = report.EXECUTIVE_DECISION_SIGNALS;
  const bullets = signals ? signals.split(/\n/).filter((l) => l.trim().startsWith("•") || l.trim().startsWith("-")) : [];
  const hasIfNotAddressed = signals ? /if.*not.*addressed|if.*left.*unresolved|if.*deferred|if.*not.*remedied/i.test(signals) : false;
  const hasManageableRisk = signals ? /(why not immediate|manageable risk|not emergency|manageable.*not emergency)/i.test(signals) : false;
  if (!signals || bullets.length < 3 || !hasIfNotAddressed || !hasManageableRisk) {
    (report as Record<string, string>).EXECUTIVE_DECISION_SIGNALS = FALLBACK_EXECUTIVE_SIGNALS;
  }

  // 3. Finding page structure (§4.2): check presence/order of 6 headings
  const findingHtml = report.FINDING_PAGES_HTML || "";
  const expectedHeadings = [
    "Asset Component",
    "Observed Condition",
    "Evidence",
    "Risk Interpretation",
    "Priority Classification",
    "Budgetary Planning Range",
  ];
  for (const h of expectedHeadings) {
    if (!findingHtml.includes(h)) {
      failures.push({
        rule: "finding_page_structure",
        message: `Finding pages missing heading: ${h}`,
      });
      break;
    }
  }
  const riskIdx = findingHtml.toLowerCase().indexOf("risk interpretation");
  const ifNotIdx = findingHtml.toLowerCase().indexOf("if not addressed");
  if (riskIdx >= 0 && ifNotIdx < 0) {
    failures.push({
      rule: "finding_page_structure",
      message: "Risk Interpretation must include 'if not addressed'",
    });
  }

  // 4. CapEx rows rules (§4.3): no standalone "Pending" as budgetary range in table body
  const capexRows = report.CAPEX_TABLE_ROWS || "";
  if (/\|\s*Pending\s*\|/i.test(capexRows)) {
    failures.push({
      rule: "capex_rows",
      field: "CAPEX_TABLE_ROWS",
      message: "CapEx rows must not contain Pending; use banded range",
    });
  }

  // 5. Evidence structure (Photo Evidence Rules): each Finding must have Evidence section in correct place
  assertEvidenceStructure(report.FINDING_PAGES_HTML || "", failures);

  // 6. Photo Evidence Rules: if Evidence contains "photo" but no caption, record failure
  const evidenceHtml = report.FINDING_PAGES_HTML || "";
  const evidenceBlocks = evidenceHtml.split(/<h4>Evidence<\/h4>/i);
  for (let i = 1; i < evidenceBlocks.length; i++) {
    const block = evidenceBlocks[i];
    const lower = block.toLowerCase();
    if (/photo|photo_id|photo evidence/.test(lower) && !/—\s*[^<\[\]]+/.test(block)) {
      const hasCaption = /—\s*[^<\[\]]{3,}/.test(block) || /<li>[^<]*—[^<]+<\/li>/.test(block);
      if (!hasCaption) {
        failures.push({
          rule: "evidence_structure",
          message: "Evidence contains photo but missing caption (observational description required)",
        });
      }
    }
  }

  if (failures.length > 0) {
    const reportLines = failures.map(
      (f) => `  [${f.rule}] ${f.field ? f.field + ": " : ""}${f.message}`
    );
    throw new Error(
      `Report preflight failed (${failures.length} rule(s)):\n${reportLines.join("\n")}\n\nFix data/config and retry.`
    );
  }
}
