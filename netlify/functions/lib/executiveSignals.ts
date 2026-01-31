/**
 * Executive Decision Signals Generator
 * 
 * Backend version for Netlify Functions
 * Same implementation as src/lib/executiveSignals.ts
 */

export type OverallLevel = "LOW" | "MODERATE" | "ELEVATED";

export type FindingCounts = {
  immediate: number;
  urgent: number;
  recommended: number;
  plan: number;
};

export type CapExRange = {
  low: number;
  high: number;
};

export type TopFinding = {
  id: string;
  title?: string;
  priority: string;
  score: number;
};

export type DominantRisk = "safety" | "compliance" | "escalation";

export type ExecutiveSignalsOutput = {
  bullets: string[];
  if_not_addressed: string;
  why_not_immediate: string;
  manageable_risk: string;
};

export type ExecutiveSignalsInput = {
  overall_level: OverallLevel;
  counts: FindingCounts;
  capex: CapExRange;
  topFindings: TopFinding[];
  dominantRisk?: DominantRisk | string[];  // Support both old format and new array format
  capex_incomplete?: boolean;  // From scoring model
};

/**
 * Generate Executive Decision Signals with strict validation
 * 
 * This function ensures signals never become "inspection summary" style content.
 * It uses scoring outputs, counts, and representative findings to generate
 * investor-facing decision support language.
 */
export function generateExecutiveSignals(params: ExecutiveSignalsInput): ExecutiveSignalsOutput {
  const { overall_level, counts, capex, topFindings, dominantRisk, capex_incomplete } = params;
  
  // Ensure counts are non-negative
  const immediate = Math.max(0, counts.immediate || 0);
  const urgent = Math.max(0, counts.urgent || 0);
  const recommended = Math.max(0, counts.recommended || 0);
  const plan = Math.max(0, counts.plan || 0);
  const totalFindings = immediate + urgent + recommended + plan;
  const hasImmediateFindings = immediate > 0;
  
  // Ensure capex is non-negative
  const capexLow = Math.max(0, capex.low || 0);
  const capexHigh = Math.max(0, capex.high || 0);
  const hasCapEx = capexLow > 0 || capexHigh > 0;
  
  // Normalize dominantRisk (support both old format and new array format)
  const normalizedDominantRisk = normalizeDominantRisk(dominantRisk);
  
  // Select 1-2 representative findings by score (highest scores)
  const representativeFindings = topFindings
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  
  // Generate bullets using deterministic template
  const bullets = generateExecutiveDecisionSignals({
    overall_level,
    immediate,
    urgent,
    recommended,
    plan,
    totalFindings,
    hasImmediateFindings,
    capexLow,
    capexHigh,
    hasCapEx,
    capex_incomplete: capex_incomplete || false,
    representativeFindings,
    normalizedDominantRisk,
  });
  
  // Validate and fix if needed (with deterministic fallback)
  const validatedBullets = validateAndFixExecutiveSignals(bullets, {
    overall_level,
    immediate,
    urgent,
    recommended,
    totalFindings,
    hasImmediateFindings,
    capexLow,
    capexHigh,
    hasCapEx,
    capex_incomplete: capex_incomplete || false,
  });
  
  // Extract required components for return
  const ifNotAddressed = validatedBullets.find(b => 
    containsConsequencePhrase(b)
  ) || generateFallbackIfNotAddressed(overall_level, immediate, urgent, recommended, totalFindings);
  
  const whyNotImmediate = validatedBullets.find(b => 
    containsWhyNotImmediate(b)
  ) || generateFallbackWhyNotImmediate(overall_level, hasImmediateFindings);
  
  const manageableRisk = validatedBullets.find(b => 
    containsManageableRisk(b)
  ) || generateFallbackManageableRisk(overall_level);
  
  return {
    bullets: validatedBullets.slice(0, 5),  // Limit to 5 bullets
    if_not_addressed: ifNotAddressed,
    why_not_immediate: whyNotImmediate,
    manageable_risk: manageableRisk,
  };
}

/**
 * Normalize dominantRisk to old format for compatibility
 */
function normalizeDominantRisk(dominantRisk?: DominantRisk | string[]): DominantRisk | undefined {
  if (!dominantRisk) return undefined;
  
  if (Array.isArray(dominantRisk)) {
    if (dominantRisk.length === 0) return undefined;
    const firstRisk = dominantRisk[0].toUpperCase();
    if (firstRisk === "SAFETY" || firstRisk === "SHOCK" || firstRisk === "FIRE" || firstRisk === "LIFE_SAFETY") {
      return "safety";
    } else if (firstRisk === "COMPLIANCE") {
      return "compliance";
    } else if (firstRisk === "ESCALATION" || firstRisk === "RELIABILITY" || firstRisk === "LEGACY") {
      return "escalation";
    }
    return undefined;
  }
  
  return dominantRisk;
}

/**
 * Generate Executive Decision Signals using deterministic template
 */
function generateExecutiveDecisionSignals(params: {
  overall_level: OverallLevel;
  immediate: number;
  urgent: number;
  recommended: number;
  plan: number;
  totalFindings: number;
  hasImmediateFindings: boolean;
  capexLow: number;
  capexHigh: number;
  hasCapEx: boolean;
  capex_incomplete: boolean;
  representativeFindings: TopFinding[];
  normalizedDominantRisk?: DominantRisk;
}): string[] {
  const bullets: string[] = [];
  const { overall_level, immediate, urgent, recommended, totalFindings, hasImmediateFindings, 
          capexLow, capexHigh, hasCapEx, capex_incomplete, representativeFindings, normalizedDominantRisk } = params;
  
  const totalUrgent = immediate + urgent;
  
  // 1. "If not addressed" statement (REQUIRED) - must include consequence phrase
  const ifNotAddressed = generateIfNotAddressed(
    overall_level, immediate, urgent, recommended, totalFindings, normalizedDominantRisk
  );
  bullets.push(ifNotAddressed);
  
  // 2. "Why not immediate" statement (REQUIRED) - especially if no IMMEDIATE findings
  const whyNotImmediate = generateWhyNotImmediate(
    overall_level, immediate, urgent, recommended, hasImmediateFindings, normalizedDominantRisk
  );
  bullets.push(whyNotImmediate);
  
  // 3. "Manageable risk" statement (REQUIRED) - frame as manageable, not urgent
  const manageableRisk = generateManageableRisk(
    overall_level, immediate, urgent, recommended, normalizedDominantRisk
  );
  bullets.push(manageableRisk);
  
  // 4. CapEx provisioning statement (REQUIRED)
  const capexStatement = generateCapExStatement(
    capexLow, capexHigh, hasCapEx, capex_incomplete, totalFindings
  );
  bullets.push(capexStatement);
  
  // 5. Optional: Additional context based on representative findings (max 1-2)
  if (representativeFindings.length > 0 && bullets.length < 5) {
    const additionalContext = generateRepresentativeFindingContext(
      representativeFindings, overall_level, normalizedDominantRisk
    );
    if (additionalContext) {
      bullets.push(additionalContext);
    }
  }
  
  return bullets;
}

/**
 * Generate "If not addressed" statement
 */
function generateIfNotAddressed(
  overall_level: OverallLevel,
  immediate: number,
  urgent: number,
  recommended: number,
  totalFindings: number,
  dominantRisk?: DominantRisk
): string {
  const totalUrgent = immediate + urgent;
  
  if (overall_level === "ELEVATED") {
    if (totalUrgent > 0) {
      const riskContext = getRiskContext(dominantRisk, "consequence");
      return `If these ${totalUrgent} urgent concern${totalUrgent > 1 ? 's' : ''} are not addressed, they may escalate into more significant ${riskContext} over the next 6-12 months.`;
    } else {
      return `If the identified conditions are not addressed within the next 12-24 months, they may impact compliance confidence or increase future maintenance costs.`;
    }
  } else if (overall_level === "MODERATE") {
    if (recommended > 0) {
      return `If the ${recommended} recommended item${recommended > 1 ? 's' : ''} are not addressed within the next 12-24 months, they may impact compliance confidence or increase future maintenance costs.`;
    } else {
      return `If routine maintenance is not maintained over the next 3-5 years, some of the observed conditions may gradually impact long-term reliability or compliance confidence.`;
    }
  } else {
    // LOW
    return `If routine maintenance is not maintained over the next 3-5 years, some of the observed conditions may gradually impact long-term reliability or compliance confidence.`;
  }
}

/**
 * Generate "Why not immediate" statement
 * Must explain why it's not immediate, especially if no IMMEDIATE findings exist
 */
function generateWhyNotImmediate(
  overall_level: OverallLevel,
  immediate: number,
  urgent: number,
  recommended: number,
  hasImmediateFindings: boolean,
  dominantRisk?: DominantRisk
): string {
  const totalUrgent = immediate + urgent;
  
  // If no IMMEDIATE findings, emphasize this strongly
  if (!hasImmediateFindings) {
    if (overall_level === "ELEVATED") {
      return `While these conditions require attention, they do not represent an immediate emergency or urgent risk that would prevent continued use of the property under normal conditions.`;
    } else if (overall_level === "MODERATE") {
      return `The current condition does not present an immediate or urgent risk that would prevent normal property operations or tenancy.`;
    } else {
      // LOW
      return `The current condition presents no immediate or urgent risk that would impact property operations, tenancy, or insurance coverage.`;
    }
  }
  
  // If IMMEDIATE findings exist, still explain why overall risk is manageable
  if (overall_level === "ELEVATED") {
    if (totalUrgent > 0) {
      return `While these items require attention, they do not represent an immediate emergency that would prevent continued use of the property under normal conditions.`;
    } else {
      return `The current condition does not present an immediate or urgent risk that would prevent normal property operations or tenancy.`;
    }
  } else if (overall_level === "MODERATE") {
    return `The current condition does not present an immediate or urgent risk that would prevent normal property operations or tenancy.`;
  } else {
    // LOW
    return `The current condition presents no immediate or urgent risk that would impact property operations, tenancy, or insurance coverage.`;
  }
}

/**
 * Generate "Manageable risk" statement
 */
function generateManageableRisk(
  overall_level: OverallLevel,
  immediate: number,
  urgent: number,
  recommended: number,
  dominantRisk?: DominantRisk
): string {
  const totalUrgent = immediate + urgent;
  
  if (overall_level === "ELEVATED") {
    if (totalUrgent > 0) {
      return `These risks represent a manageable risk that can be addressed within standard asset planning cycles, allowing for proper budgeting and contractor engagement without urgent disruption.`;
    } else {
      return `These items represent a manageable risk that can be incorporated into normal asset planning cycles, allowing for strategic budgeting and planned maintenance without immediate urgency.`;
    }
  } else if (overall_level === "MODERATE") {
    return `These items represent a manageable risk that can be incorporated into normal asset planning cycles, allowing for strategic budgeting and planned maintenance without immediate urgency.`;
  } else {
    // LOW
    return `Any future considerations represent a manageable risk that can be addressed within normal asset planning cycles, with ample time for budgeting and strategic decision-making.`;
  }
}

/**
 * Generate CapEx provisioning statement
 * Uses capex_incomplete flag from scoring model
 */
function generateCapExStatement(
  capexLow: number,
  capexHigh: number,
  hasCapEx: boolean,
  capex_incomplete: boolean,
  totalFindings: number
): string {
  if (hasCapEx) {
    if (capexLow === capexHigh) {
      const note = capex_incomplete 
        ? " (Note: Some findings may require detailed quotations for accurate budgeting)"
        : "";
      return `Capital expenditure provision of approximately $${capexLow.toLocaleString()} should be allocated for addressing the identified conditions within the next 12-24 months${note}.`;
    } else {
      const note = capex_incomplete 
        ? " (Note: Some findings may require detailed quotations for accurate budgeting)"
        : "";
      return `Capital expenditure provision of $${capexLow.toLocaleString()} to $${capexHigh.toLocaleString()} should be allocated for addressing the identified conditions within the next 12-24 months${note}.`;
    }
  } else {
    return `Capital expenditure provision should be planned based on detailed quotations from licensed electrical contractors for the identified conditions.`;
  }
}

/**
 * Generate context based on representative findings (1-2 highest scoring)
 */
function generateRepresentativeFindingContext(
  representativeFindings: TopFinding[],
  overall_level: OverallLevel,
  dominantRisk?: DominantRisk
): string | null {
  if (representativeFindings.length === 0) {
    return null;
  }
  
  // Use first finding (highest score)
  const topFinding = representativeFindings[0];
  const findingTitle = topFinding.title || topFinding.id.replace(/_/g, " ");
  
  // Frame as decision support, not inspection summary
  if (overall_level === "ELEVATED") {
    return `The highest priority item identified relates to ${findingTitle}, which warrants attention in planning cycles.`;
  } else if (overall_level === "MODERATE") {
    return `The primary concern relates to ${findingTitle}, which should be factored into near-term planning considerations.`;
  } else {
    return `The assessment identified ${findingTitle} as a monitoring item for future consideration.`;
  }
}

/**
 * Generate additional context based on top findings or dominant risk
 */
function generateAdditionalContext(
  topFindings: TopFinding[],
  overall_level: OverallLevel,
  dominantRisk?: DominantRisk
): string | null {
  if (topFindings.length === 0) {
    return null;
  }
  
  // If we have dominant risk, use it for context
  if (dominantRisk) {
    const riskContext = getRiskContext(dominantRisk, "focus");
    return `The assessment primarily focuses on ${riskContext} considerations, which should guide prioritization of remediation efforts.`;
  }
  
  // Otherwise, use top finding context
  const topFinding = topFindings[0];
  const findingTitle = topFinding.title || topFinding.id.replace(/_/g, " ");
  
  if (overall_level === "ELEVATED") {
    return `The highest priority item identified relates to ${findingTitle}, which warrants immediate attention in planning cycles.`;
  } else if (overall_level === "MODERATE") {
    return `The primary concern relates to ${findingTitle}, which should be factored into near-term planning considerations.`;
  } else {
    return `The assessment identified ${findingTitle} as a monitoring item for future consideration.`;
  }
}

/**
 * Get risk context based on dominant risk dimension
 */
function getRiskContext(dominantRisk: DominantRisk | undefined, contextType: "consequence" | "focus"): string {
  if (!dominantRisk) {
    return contextType === "consequence" ? "liability exposure or operational disruption" : "risk management";
  }
  
  switch (dominantRisk) {
    case "safety":
      return contextType === "consequence" 
        ? "safety risks or liability exposure" 
        : "safety and operational reliability";
    case "compliance":
      return contextType === "consequence"
        ? "compliance issues or regulatory exposure"
        : "compliance and regulatory requirements";
    case "escalation":
      return contextType === "consequence"
        ? "escalation risks or operational disruption"
        : "risk escalation and operational continuity";
    default:
      return contextType === "consequence" ? "liability exposure or operational disruption" : "risk management";
  }
}

/**
 * Default sentences for each required bullet type
 */
const DEFAULT_IF_NOT_ADDRESSED = "If the identified conditions are not addressed within the next 12-24 months, they may impact compliance confidence or increase future maintenance costs.";
const DEFAULT_WHY_NOT_IMMEDIATE = "The current condition does not present an immediate or urgent risk that would prevent normal property operations or tenancy.";
const DEFAULT_MANAGEABLE_RISK = "These items represent a manageable risk that can be incorporated into normal asset planning cycles, allowing for strategic budgeting and planned maintenance without immediate urgency.";
const DEFAULT_CAPEX_PROVISIONING = "Capital expenditure provision should be planned based on detailed quotations from licensed electrical contractors for the identified conditions.";

/**
 * Check if bullet contains consequence phrase ("if not addressed" / "if deferred" / "may escalate")
 */
function containsConsequencePhrase(bullet: string): boolean {
  const lower = bullet.toLowerCase();
  return lower.includes("if not addressed") ||
         lower.includes("if deferred") ||
         lower.includes("if left unresolved") ||
         lower.includes("are not addressed") ||
         lower.includes("is not maintained") ||
         lower.includes("if these conditions are not") ||
         lower.includes("if these items are not") ||
         lower.includes("if routine maintenance is not") ||
         lower.includes("if not maintained") ||
         lower.includes("if not resolved") ||
         lower.includes("are deferred") ||
         lower.includes("items are deferred") ||
         lower.includes("conditions are deferred") ||
         lower.includes("left unresolved") ||
         lower.includes("not resolved") ||
         lower.includes("may escalate") ||
         lower.includes("could escalate") ||
         lower.includes("may impact") ||
         lower.includes("could impact");
}

/**
 * Check if bullet contains "why not immediate" explanation
 */
function containsWhyNotImmediate(bullet: string): boolean {
  const lower = bullet.toLowerCase();
  return lower.includes("not immediate") ||
         lower.includes("no immediate hazard") ||
         lower.includes("no immediate emergency") ||
         lower.includes("does not present an immediate") ||
         lower.includes("presents no immediate") ||
         lower.includes("not an immediate") ||
         lower.includes("not represent an immediate") ||
         lower.includes("not require immediate") ||
         lower.includes("would not prevent");
}

/**
 * Check if bullet contains "manageable risk" framing
 */
function containsManageableRisk(bullet: string): boolean {
  const lower = bullet.toLowerCase();
  return lower.includes("manageable risk") ||
         lower.includes("planned intervention") ||
         lower.includes("can be managed") ||
         lower.includes("managed within") ||
         lower.includes("planning cycles") ||
         lower.includes("planned maintenance") ||
         lower.includes("asset planning") ||
         lower.includes("strategic budgeting");
}

/**
 * Check if bullet contains CapEx/provisioning statement
 */
function containsCapExProvisioning(bullet: string): boolean {
  const lower = bullet.toLowerCase();
  return lower.includes("capex") ||
         lower.includes("capital expenditure") ||
         lower.includes("provision") ||
         lower.includes("budgeting") ||
         lower.includes("quotations");
}

/**
 * Check if bullet sounds like "inspection summary" (to be avoided)
 */
function soundsLikeInspectionSummary(bullet: string): boolean {
  const lower = bullet.toLowerCase();
  // Avoid technical inspection language
  return lower.includes("inspection found") ||
         lower.includes("inspection identified") ||
         lower.includes("inspector observed") ||
         lower.includes("during inspection") ||
         lower.includes("visual inspection") ||
         lower.includes("testing revealed") ||
         lower.includes("measurements showed") ||
         lower.includes("compliance check") ||
         lower.includes("standards check") ||
         lower.includes("as/nzs") ||
         lower.includes("rcbo") ||
         lower.includes("rcd") ||
         lower.includes("gpo") ||
         lower.includes("switchboard") ||
         (lower.includes("found") && lower.includes("condition")) ||
         (lower.includes("identified") && lower.includes("issue"));
}

/**
 * Validate and fix Executive Decision Signals bullets with deterministic fallback
 * 
 * Validation rules:
 * 1. At least 1 sentence with consequence phrase ("if not addressed" / "if deferred" / "may escalate")
 * 2. At least 1 sentence explaining "why not immediate" (especially if no IMMEDIATE findings)
 * 3. At least 1 sentence with "manageable risk" framing (not urgent)
 * 4. At least 1 CapEx provisioning statement
 * 5. Never sound like "inspection summary"
 */
function validateAndFixExecutiveSignals(
  bullets: string[],
  context: {
    overall_level: OverallLevel;
    immediate: number;
    urgent: number;
    recommended: number;
    totalFindings: number;
    hasImmediateFindings: boolean;
    capexLow: number;
    capexHigh: number;
    hasCapEx: boolean;
    capex_incomplete: boolean;
  }
): string[] {
  // Filter out any bullets that sound like inspection summary
  let validated = bullets.filter(bullet => !soundsLikeInspectionSummary(bullet));
  
  // If all bullets were filtered out, use deterministic fallback
  if (validated.length === 0) {
    console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS: All bullets filtered as inspection summary, using deterministic fallback");
    return generateDeterministicFallback(context);
  }
  
  // Rule 1: Check for consequence phrase
  const hasConsequencePhrase = validated.some(containsConsequencePhrase);
  if (!hasConsequencePhrase) {
    validated.push(generateFallbackIfNotAddressed(
      context.overall_level, context.immediate, context.urgent, context.recommended, context.totalFindings
    ));
    console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS: Missing consequence phrase, added fallback");
  }
  
  // Rule 2: Check for "why not immediate" explanation
  const hasWhyNotImmediate = validated.some(containsWhyNotImmediate);
  if (!hasWhyNotImmediate) {
    validated.push(generateFallbackWhyNotImmediate(
      context.overall_level, context.hasImmediateFindings
    ));
    console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS: Missing 'why not immediate' explanation, added fallback");
  }
  
  // Rule 3: Check for "manageable risk" framing
  const hasManageableRisk = validated.some(containsManageableRisk);
  if (!hasManageableRisk) {
    validated.push(generateFallbackManageableRisk(context.overall_level));
    console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS: Missing 'manageable risk' statement, added fallback");
  }
  
  // Rule 4: Check for CapEx provisioning statement
  const hasCapExProvisioning = validated.some(containsCapExProvisioning);
  if (!hasCapExProvisioning) {
    validated.push(generateFallbackCapExProvisioning(
      context.capexLow, context.capexHigh, context.hasCapEx, context.capex_incomplete
    ));
    console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS: Missing CapEx provisioning statement, added fallback");
  }
  
  // Ensure we have at least 3 bullets
  while (validated.length < 3) {
    validated.push(generateFallbackManageableRisk(context.overall_level));
  }
  
  // Limit to maximum 5 bullets
  return validated.slice(0, 5);
}

/**
 * Generate deterministic fallback template (no AI calls)
 * Used when validation fails or bullets sound like inspection summary
 */
function generateDeterministicFallback(context: {
  overall_level: OverallLevel;
  immediate: number;
  urgent: number;
  recommended: number;
  totalFindings: number;
  hasImmediateFindings: boolean;
  capexLow: number;
  capexHigh: number;
  hasCapEx: boolean;
  capex_incomplete: boolean;
}): string[] {
  const bullets: string[] = [];
  
  // Always include the 4 required components
  bullets.push(generateFallbackIfNotAddressed(
    context.overall_level, context.immediate, context.urgent, context.recommended, context.totalFindings
  ));
  
  bullets.push(generateFallbackWhyNotImmediate(
    context.overall_level, context.hasImmediateFindings
  ));
  
  bullets.push(generateFallbackManageableRisk(context.overall_level));
  
  bullets.push(generateFallbackCapExProvisioning(
    context.capexLow, context.capexHigh, context.hasCapEx, context.capex_incomplete
  ));
  
  return bullets;
}

/**
 * Fallback generators (deterministic, no AI)
 */
function generateFallbackIfNotAddressed(
  overall_level: OverallLevel,
  immediate: number,
  urgent: number,
  recommended: number,
  totalFindings: number
): string {
  const totalUrgent = immediate + urgent;
  
  if (overall_level === "ELEVATED") {
    if (totalUrgent > 0) {
      return `If these ${totalUrgent} urgent concern${totalUrgent > 1 ? 's' : ''} are not addressed, they may escalate into more significant liability exposure or operational disruption over the next 6-12 months.`;
    } else {
      return `If the identified conditions are not addressed within the next 12-24 months, they may impact compliance confidence or increase future maintenance costs.`;
    }
  } else if (overall_level === "MODERATE") {
    if (recommended > 0) {
      return `If the ${recommended} recommended item${recommended > 1 ? 's' : ''} are not addressed within the next 12-24 months, they may impact compliance confidence or increase future maintenance costs.`;
    } else {
      return `If routine maintenance is not maintained over the next 3-5 years, some of the observed conditions may gradually impact long-term reliability or compliance confidence.`;
    }
  } else {
    return `If routine maintenance is not maintained over the next 3-5 years, some of the observed conditions may gradually impact long-term reliability or compliance confidence.`;
  }
}

function generateFallbackWhyNotImmediate(
  overall_level: OverallLevel,
  hasImmediateFindings: boolean
): string {
  if (!hasImmediateFindings) {
    return `The current condition does not present an immediate or urgent risk that would prevent normal property operations or tenancy.`;
  }
  
  if (overall_level === "ELEVATED") {
    return `While these items require attention, they do not represent an immediate emergency that would prevent continued use of the property under normal conditions.`;
  } else if (overall_level === "MODERATE") {
    return `The current condition does not present an immediate or urgent risk that would prevent normal property operations or tenancy.`;
  } else {
    return `The current condition presents no immediate or urgent risk that would impact property operations, tenancy, or insurance coverage.`;
  }
}

function generateFallbackManageableRisk(overall_level: OverallLevel): string {
  if (overall_level === "ELEVATED") {
    return `These risks represent a manageable risk that can be addressed within standard asset planning cycles, allowing for proper budgeting and contractor engagement without urgent disruption.`;
  } else if (overall_level === "MODERATE") {
    return `These items represent a manageable risk that can be incorporated into normal asset planning cycles, allowing for strategic budgeting and planned maintenance without immediate urgency.`;
  } else {
    return `Any future considerations represent a manageable risk that can be addressed within normal asset planning cycles, with ample time for budgeting and strategic decision-making.`;
  }
}

function generateFallbackCapExProvisioning(
  capexLow: number,
  capexHigh: number,
  hasCapEx: boolean,
  capex_incomplete: boolean
): string {
  if (hasCapEx) {
    if (capexLow === capexHigh) {
      const note = capex_incomplete 
        ? " (Note: Some findings may require detailed quotations for accurate budgeting)"
        : "";
      return `Capital expenditure provision of approximately $${capexLow.toLocaleString()} should be allocated for addressing the identified conditions within the next 12-24 months${note}.`;
    } else {
      const note = capex_incomplete 
        ? " (Note: Some findings may require detailed quotations for accurate budgeting)"
        : "";
      return `Capital expenditure provision of $${capexLow.toLocaleString()} to $${capexHigh.toLocaleString()} should be allocated for addressing the identified conditions within the next 12-24 months${note}.`;
    }
  } else {
    return `Capital expenditure provision should be planned based on detailed quotations from licensed electrical contractors for the identified conditions.`;
  }
}

/**
 * Validate Executive Decision Signals text and ensure it contains required semantic points
 * 
 * Checks if text contains three semantic requirements:
 * 1. "if not addressed" / "if deferred" / "if left unresolved"
 * 2. "not immediate" / "no urgent" / "does not require immediate action"
 * 3. "manageable risk" / "can be planned" / "within normal planning cycles"
 * 
 * If not satisfied, returns fixed fallback template with 3 bullets (one for each rule).
 * 
 * @param text - Executive Decision Signals text (may be bullet list or paragraph)
 * @returns Validated signals text (never empty)
 */
export function validateExecutiveSignals(text: string): string {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    // Return fallback template if empty
    return generateFallbackTemplate();
  }
  
  const lowerText = text.toLowerCase();
  
  // Check for three semantic requirements using keywords/regex
  const hasIfNotAddressed = /if\s+(not\s+)?(addressed|deferred|left\s+unresolved|resolved|maintained)/i.test(lowerText) ||
                            /(are|is)\s+not\s+(addressed|maintained|resolved)/i.test(lowerText) ||
                            /may\s+escalate/i.test(lowerText) ||
                            /could\s+escalate/i.test(lowerText) ||
                            /may\s+impact/i.test(lowerText) ||
                            /could\s+impact/i.test(lowerText);
  
  const hasNotImmediate = /not\s+immediate/i.test(lowerText) ||
                          /no\s+immediate\s+(hazard|emergency|risk|urgent)/i.test(lowerText) ||
                          /does\s+not\s+require\s+immediate/i.test(lowerText) ||
                          /does\s+not\s+present\s+an\s+immediate/i.test(lowerText) ||
                          /presents\s+no\s+immediate/i.test(lowerText) ||
                          /not\s+an\s+immediate/i.test(lowerText) ||
                          /not\s+represent\s+an\s+immediate/i.test(lowerText) ||
                          /would\s+not\s+prevent/i.test(lowerText);
  
  const hasManageableRisk = /manageable\s+risk/i.test(lowerText) ||
                            /can\s+be\s+planned/i.test(lowerText) ||
                            /within\s+normal\s+planning\s+cycles/i.test(lowerText) ||
                            /asset\s+planning/i.test(lowerText) ||
                            /strategic\s+budgeting/i.test(lowerText) ||
                            /planned\s+maintenance/i.test(lowerText) ||
                            /can\s+be\s+managed/i.test(lowerText) ||
                            /managed\s+within/i.test(lowerText);
  
  // If all three requirements are met, return original text
  if (hasIfNotAddressed && hasNotImmediate && hasManageableRisk) {
    return text;
  }
  
  // Otherwise, return fallback template
  console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS validation failed. Missing requirements:", {
    hasIfNotAddressed,
    hasNotImmediate,
    hasManageableRisk
  });
  
  return generateFallbackTemplate();
}

/**
 * Generate fallback template with 3 bullets (one for each semantic requirement)
 */
function generateFallbackTemplate(): string {
  return `• ${DEFAULT_IF_NOT_ADDRESSED}\n• ${DEFAULT_WHY_NOT_IMMEDIATE}\n• ${DEFAULT_MANAGEABLE_RISK}`;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use validateExecutiveSignals(string) or validateAndFixExecutiveSignals instead
 */
export function validateExecutiveSignalsArray(bullets: string[]): string[] {
  // Filter out any bullets that sound like inspection summary
  let validated = bullets.filter(bullet => !soundsLikeInspectionSummary(bullet));
  
  // If all bullets were filtered out, use defaults
  if (validated.length === 0) {
    validated = [
      DEFAULT_IF_NOT_ADDRESSED,
      DEFAULT_WHY_NOT_IMMEDIATE,
      DEFAULT_MANAGEABLE_RISK,
      DEFAULT_CAPEX_PROVISIONING,
    ];
  } else {
    // Add missing required components
    if (!validated.some(containsConsequencePhrase)) {
      validated.push(DEFAULT_IF_NOT_ADDRESSED);
    }
    if (!validated.some(containsWhyNotImmediate)) {
      validated.push(DEFAULT_WHY_NOT_IMMEDIATE);
    }
    if (!validated.some(containsManageableRisk)) {
      validated.push(DEFAULT_MANAGEABLE_RISK);
    }
    if (!validated.some(containsCapExProvisioning)) {
      validated.push(DEFAULT_CAPEX_PROVISIONING);
    }
  }
  
  return validated.slice(0, 5);
}
