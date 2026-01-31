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

  // Executive Summary
  OVERALL_STATUS: string;
  OVERALL_STATUS_BADGE: string;
  EXECUTIVE_DECISION_SIGNALS: string;
  CAPEX_SNAPSHOT: string;

  // Priority Overview
  PRIORITY_TABLE_ROWS: string;
  PRIORITY_COUNTS?: { immediate: number; recommended: number; plan: number };

  // Scope & Limitations
  SCOPE_SECTION: string;
  LIMITATIONS_SECTION: string;

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
  if (lower.includes("undefined") || lower === "null" || lower.includes("nan")) return "undefined/null/nan";
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
  const obsIdx = html.toLowerCase().indexOf("observed condition");
  const evIdx = html.toLowerCase().indexOf("<h4>evidence</h4>");
  const riskIdx = html.toLowerCase().indexOf("risk interpretation");
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
export function assertReportReady(report: StructuredReport): void {
  const failures: AssertReportReadyFailure[] = [];

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

  for (const key of required) {
    const val = report[key];
    if (val === undefined || val === null) {
      failures.push({ rule: "required_field", field: key, message: `Missing required field: ${key}` });
      continue;
    }
    const str = String(val).trim();
    if (str === "") {
      failures.push({ rule: "required_field", field: key, message: `Empty required field: ${key}` });
      continue;
    }
    const forbidden = containsForbidden(str);
    if (forbidden) {
      failures.push({
        rule: "forbidden_value",
        field: key,
        message: `Field ${key} contains forbidden value: ${forbidden}`,
      });
    }
  }

  // 2. EXECUTIVE_DECISION_SIGNALS rules (§4.1)
  const signals = report.EXECUTIVE_DECISION_SIGNALS;
  if (signals) {
    const bullets = signals.split(/\n/).filter((l) => l.trim().startsWith("•") || l.trim().startsWith("-"));
    if (bullets.length < 3) {
      failures.push({
        rule: "executive_signals",
        field: "EXECUTIVE_DECISION_SIGNALS",
        message: `Must contain at least 3 bullet points (found ${bullets.length})`,
      });
    }
    const lower = signals.toLowerCase();
    if (!/if.*not.*addressed|if.*left.*unresolved|if.*deferred|if.*not.*remedied/i.test(lower)) {
      failures.push({
        rule: "executive_signals",
        field: "EXECUTIVE_DECISION_SIGNALS",
        message: "Must include 'if not addressed' (or equivalent)",
      });
    }
    if (!/(why not immediate|manageable risk|not emergency|manageable.*not emergency)/i.test(lower)) {
      failures.push({
        rule: "executive_signals",
        field: "EXECUTIVE_DECISION_SIGNALS",
        message: "Must include 'manageable risk, not emergency' (or equivalent)",
      });
    }
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
