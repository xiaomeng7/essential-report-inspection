/**
 * Build computed fields for Executive / What This Means / Decision Pathways.
 * Establishes "who says what" boundaries and avoids repetition.
 *
 * - EXEC_SUMMARY_CORE: 3–5 sentences (risk + if_not_addressed + capex), no findings details
 * - INTERPRETATION_GUIDANCE: 3–6 sentences (explain risk, why not immediate, how to interpret)
 * - DECISION_PATHWAYS_BULLETS: 4 fixed one-liners (Accept / Plan / Execute / Delegate)
 */

export type BuildComputedFieldsParams = {
  overallStatus?: string;
  riskRating?: string;
  capexSnapshot?: string;
  immediateCount: number;
  recommendedCount: number;
  planCount: number;
  defaultText?: {
    EXECUTIVE_SUMMARY?: string;
    DECISION_CONFIDENCE_STATEMENT?: string;
    [key: string]: string | undefined;
  };
};

export type BuiltComputedFields = {
  EXEC_SUMMARY_CORE: string;
  INTERPRETATION_GUIDANCE: string;
  DECISION_PATHWAYS_BULLETS: string;
};

const DEFAULT_IF_NOT_ADDRESSED =
  "If not addressed, conditions may affect long-term reliability or compliance confidence.";
const DEFAULT_WHY_NOT_IMMEDIATE =
  "This does not present an immediate safety hazard and can be managed within normal planning cycles.";
const DEFAULT_MANAGEABLE_RISK =
  "Manageable risk, not emergency. This is a planned capital expenditure opportunity rather than an urgent liability.";

/**
 * Ensure EXEC_SUMMARY_CORE contains required phrases; add defaults if missing.
 */
function ensureExecCoreRules(text: string): string {
  const lower = text.toLowerCase();
  const parts: string[] = [text.trim()];

  if (!/if\s+not\s+addressed|if\s+left\s+unresolved|if\s+deferred/i.test(lower)) {
    parts.push(DEFAULT_IF_NOT_ADDRESSED);
  }
  if (
    !/why\s+not\s+immediate|not\s+immediate|not\s+urgent|manageable|can\s+be\s+planned/i.test(
      lower
    )
  ) {
    parts.push(DEFAULT_WHY_NOT_IMMEDIATE);
  }
  if (
    !/manageable\s+risk|planned\s+risk|not\s+emergency|capital\s+expenditure\s+opportunity/i.test(
      lower
    )
  ) {
    parts.push(DEFAULT_MANAGEABLE_RISK);
  }

  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build the three core computed fields.
 */
export function buildComputedFields(params: BuildComputedFieldsParams): BuiltComputedFields {
  const {
    overallStatus = "MODERATE RISK",
    riskRating = "MODERATE",
    capexSnapshot = "To be confirmed (indicative, planning only)",
    immediateCount = 0,
    recommendedCount = 0,
    planCount = 0,
    defaultText = {},
  } = params;

  const totalCount = immediateCount + recommendedCount + planCount;
  const hasUrgent = immediateCount > 0;

  // 1. EXEC_SUMMARY_CORE — 3–5 sentences: risk + if_not_addressed + capex. No findings details.
  const riskSentence =
    hasUrgent
      ? `This property presents an elevated electrical risk profile with ${immediateCount} urgent item(s) requiring immediate attention.`
      : `This property presents a ${riskRating.toLowerCase()} electrical risk profile at the time of inspection.`;

  const ifNotSentence = hasUrgent
    ? "If not addressed, urgent items may lead to safety hazards, compliance violations, or liability escalation."
    : DEFAULT_IF_NOT_ADDRESSED;

  const whyNotSentence = hasUrgent
    ? "Recommended items can be scheduled within the stated windows to avoid reactive maintenance."
    : DEFAULT_WHY_NOT_IMMEDIATE;

  const capexSentence = `Estimated capital expenditure provision (0–5 years): ${capexSnapshot}.`;
  const manageableSentence =
    totalCount === 0
      ? "No significant issues were identified. Conditions are manageable within standard asset planning."
      : DEFAULT_MANAGEABLE_RISK;

  const execCoreRaw = [
    riskSentence,
    ifNotSentence,
    whyNotSentence,
    capexSentence,
    manageableSentence,
  ]
    .filter(Boolean)
    .join(" ");
  const EXEC_SUMMARY_CORE = ensureExecCoreRules(
    execCoreRaw || defaultText.EXECUTIVE_SUMMARY || riskSentence
  );

  // 2. INTERPRETATION_GUIDANCE — 3–6 sentences: explain risk, why not immediate, how to interpret.
  const interpSentences: string[] = [];
  interpSentences.push(
    "This report helps you distinguish between urgent liability risks and planned capital expenditure opportunities."
  );
  interpSentences.push(
    "Items classified as 'recommended' do not represent active faults but suggest modernisation to improve safety margins."
  );
  interpSentences.push(
    "Use the CapEx Roadmap to set realistic budget provisions and the Priority Snapshot to align contractor quotes with the actual risk profile."
  );
  if (!hasUrgent) {
    interpSentences.push(
      "The identified items can be managed within normal planning cycles and do not require immediate action."
    );
  }
  interpSentences.push(
    defaultText.DECISION_CONFIDENCE_STATEMENT ||
      "This report reduces decision uncertainty by providing structured risk interpretations you can use to challenge scope creep."
  );

  const INTERPRETATION_GUIDANCE = interpSentences.join(" ").replace(/\s+/g, " ").trim();

  // 3. DECISION_PATHWAYS_BULLETS — 4 fixed one-liners. No explanatory paragraphs.
  const DECISION_PATHWAYS_BULLETS = [
    "**Accept** — Take no action now. Reassess in 12 months or at next tenancy turnover.",
    "**Plan** — Budget and schedule items within the suggested windows. Use the CapEx Roadmap for forward planning.",
    "**Execute** — Brief any contractor of your choice. Request itemised scope aligned to priorities.",
    "**Delegate** — Reduce cognitive load and coordination risk by delegating interpretation, quotation review, and completion verification to a structured management arrangement.",
  ].join("\n");

  return {
    EXEC_SUMMARY_CORE,
    INTERPRETATION_GUIDANCE,
    DECISION_PATHWAYS_BULLETS,
  };
}
