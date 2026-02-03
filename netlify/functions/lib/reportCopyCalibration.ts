/**
 * Report copy calibration — tone, legal safety, financial clarity.
 * Only corrects/normalises existing text; does not add or remove sections or invent content.
 * See docs/REPORT_COPY_CALIBRATION.md for editorial rules.
 */

/** Normalise whitespace: trim, collapse multiple spaces/newlines to single space; preserve single \n for paragraphs. */
function normaliseWhitespace(s: string): string {
  return s
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .replace(/ \n/g, "\n");
}

/** Apply phrase replacements (avoid → prefer). Only replaces when the avoid phrase exists. */
function applyPhraseReplacements(s: string): string {
  const replacements: Array<[RegExp | string, string]> = [
    [/\bwe recommend\b/gi, "consider"],
    [/\byou should\b/gi, "consider"],
    [/\bno problem\b/gi, "no immediate safety risks identified"],
    [/\bno issues\b(?!\s+identified)/gi, "no urgent items identified"],
    [/\bguarantee\b/gi, "intended to"],
    [/\bcertify\b/gi, "intended to"],
    [/\bfix\b(?!\s+(?:and|or)\s+)/gi, "address"],
    [/\bIMMEDIATE\b/g, "Urgent liability risk"],
    [/\bRECOMMENDED_0_3_MONTHS\b/g, "Budgetary provision recommended"],
    [/\bPLAN_MONITOR\b/g, "Monitor / Acceptable"],
  ];
  let out = s;
  for (const [avoid, prefer] of replacements) {
    out = out.replace(avoid, prefer);
  }
  return out;
}

/** Ensure AUD prefix on dollar amounts that look like standalone currency (e.g. "$500" or "$1,800–$2,800"). */
function ensureAudPrefix(s: string): string {
  if (!s || !/\$/.test(s)) return s;
  if (/\bAUD\s+\$/.test(s)) return s;
  return s.replace(/(^|\s)(\$\d)/g, "$1AUD $2");
}

/** Keys that may contain budget/currency ranges. */
const BUDGET_KEYS = new Set([
  "CAPEX_BUDGET_1", "CAPEX_BUDGET_2", "CAPEX_BUDGET_3", "CAPEX_BUDGET_4", "CAPEX_BUDGET_5",
  "CAPEX_RANGE",
]);

/**
 * Calibrate report copy: normalise whitespace, apply phrase replacements, ensure AUD on budget fields.
 * Does not add or remove sections; does not invent new content.
 */
export function calibrateReportCopy(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== "string") {
      out[key] = value;
      continue;
    }
    let s = normaliseWhitespace(value);
    s = applyPhraseReplacements(s);
    if (BUDGET_KEYS.has(key)) {
      s = ensureAudPrefix(s);
    }
    out[key] = s;
  }
  return out;
}
