/**
 * Executive Decision Signals Generator
 * 
 * Generates EXECUTIVE_DECISION_SIGNALS bullet list strings based on:
 * - Overall risk level
 * - Finding counts by priority
 * - CapEx estimates
 * - Top findings with scores
 * - Dominant risk dimension (optional)
 * 
 * Hard Rules:
 * 1) bullets: 3-5 items
 * 2) Must include:
 *    - 1 bullet with "If not addressed"
 *    - 1 bullet explaining "why not immediate" (contains "not immediate" or "no immediate hazard")
 *    - 1 bullet with "manageable risk" (contains "manageable risk")
 * 3) At least 1 CapEx provisioning statement (contains "CapEx" or "provision")
 * 4) No undefined/empty strings; fallback for missing data
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

/**
 * Generate Executive Decision Signals
 */
export function generateExecutiveSignals(params: {
  overall_level: OverallLevel;
  counts: FindingCounts;
  capex: CapExRange;
  topFindings: TopFinding[];
  dominantRisk?: DominantRisk;
}): ExecutiveSignalsOutput {
  const { overall_level, counts, capex, topFindings, dominantRisk } = params;
  
  // Ensure counts are non-negative
  const immediate = Math.max(0, counts.immediate || 0);
  const urgent = Math.max(0, counts.urgent || 0);
  const recommended = Math.max(0, counts.recommended || 0);
  const plan = Math.max(0, counts.plan || 0);
  const totalFindings = immediate + urgent + recommended + plan;
  
  // Ensure capex is non-negative
  const capexLow = Math.max(0, capex.low || 0);
  const capexHigh = Math.max(0, capex.high || 0);
  const hasCapEx = capexLow > 0 || capexHigh > 0;
  
  // Build bullets array
  const bullets: string[] = [];
  
  // 1. "If not addressed" statement (REQUIRED)
  const ifNotAddressed = generateIfNotAddressed(overall_level, immediate, urgent, recommended, totalFindings, dominantRisk);
  bullets.push(ifNotAddressed);
  
  // 2. "Why not immediate" statement (REQUIRED)
  const whyNotImmediate = generateWhyNotImmediate(overall_level, immediate, urgent, recommended, dominantRisk);
  bullets.push(whyNotImmediate);
  
  // 3. "Manageable risk" statement (REQUIRED)
  const manageableRisk = generateManageableRisk(overall_level, immediate, urgent, recommended, dominantRisk);
  bullets.push(manageableRisk);
  
  // 4. CapEx provisioning statement (REQUIRED)
  const capexStatement = generateCapExStatement(capexLow, capexHigh, hasCapEx, totalFindings);
  bullets.push(capexStatement);
  
  // 5. Optional: Additional context based on top findings or dominant risk
  if (bullets.length < 5 && topFindings.length > 0) {
    const additionalContext = generateAdditionalContext(topFindings, overall_level, dominantRisk);
    if (additionalContext) {
      bullets.push(additionalContext);
    }
  }
  
  // Validate bullets to ensure all required types are present
  const validatedBullets = validateExecutiveSignals(bullets);
  
  // Limit to maximum 5 bullets
  const finalBullets = validatedBullets.slice(0, 5);
  
  return {
    bullets: finalBullets,
    if_not_addressed: ifNotAddressed,
    why_not_immediate: whyNotImmediate,
    manageable_risk: manageableRisk,
  };
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
 */
function generateWhyNotImmediate(
  overall_level: OverallLevel,
  immediate: number,
  urgent: number,
  recommended: number,
  dominantRisk?: DominantRisk
): string {
  const totalUrgent = immediate + urgent;
  
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
 */
function generateCapExStatement(
  capexLow: number,
  capexHigh: number,
  hasCapEx: boolean,
  totalFindings: number
): string {
  if (hasCapEx) {
    if (capexLow === capexHigh) {
      return `Capital expenditure provision of approximately $${capexLow.toLocaleString()} should be allocated for addressing the identified conditions within the next 12-24 months.`;
    } else {
      return `Capital expenditure provision of $${capexLow.toLocaleString()} to $${capexHigh.toLocaleString()} should be allocated for addressing the identified conditions within the next 12-24 months.`;
    }
  } else {
    return `Capital expenditure provision should be planned based on detailed quotations from licensed electrical contractors for the identified conditions.`;
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
 * Validate and fix Executive Decision Signals bullets
 * Ensures all required bullet types are present, adding defaults if missing
 * 
 * Validation rules:
 * 1. At least 1 sentence with "if not addressed / if deferred / if left unresolved" style
 * 2. At least 1 sentence explaining "why not immediate"
 * 3. At least 1 sentence with "manageable risk / planned intervention"
 * 4. At least 1 CapEx provisioning statement
 */
export function validateExecutiveSignals(bullets: string[]): string[] {
  const validated: string[] = [...bullets];
  
  // Rule 1: Check for "if not addressed / if deferred / if left unresolved" style
  const hasIfNotAddressed = validated.some(bullet => {
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
           lower.includes("not resolved");
  });
  if (!hasIfNotAddressed) {
    validated.push(DEFAULT_IF_NOT_ADDRESSED);
    console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS: Missing 'if not addressed' style sentence, added default");
  }
  
  // Rule 2: Check for "why not immediate" explanation
  const hasWhyNotImmediate = validated.some(bullet => {
    const lower = bullet.toLowerCase();
    return lower.includes("not immediate") ||
           lower.includes("no immediate hazard") ||
           lower.includes("no immediate emergency") ||
           lower.includes("does not present an immediate") ||
           lower.includes("presents no immediate") ||
           lower.includes("not an immediate") ||
           lower.includes("not represent an immediate") ||
           lower.includes("not require immediate");
  });
  if (!hasWhyNotImmediate) {
    validated.push(DEFAULT_WHY_NOT_IMMEDIATE);
    console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS: Missing 'why not immediate' explanation, added default");
  }
  
  // Rule 3: Check for "manageable risk / planned intervention"
  const hasManageableRisk = validated.some(bullet => {
    const lower = bullet.toLowerCase();
    return lower.includes("manageable risk") ||
           lower.includes("planned intervention") ||
           lower.includes("can be managed") ||
           lower.includes("managed within") ||
           lower.includes("planning cycles") ||
           lower.includes("planned maintenance");
  });
  if (!hasManageableRisk) {
    validated.push(DEFAULT_MANAGEABLE_RISK);
    console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS: Missing 'manageable risk / planned intervention' statement, added default");
  }
  
  // Rule 4: Check for CapEx provisioning statement
  const hasCapExProvisioning = validated.some(bullet => {
    const lower = bullet.toLowerCase();
    return lower.includes("capex") ||
           lower.includes("capital expenditure") ||
           lower.includes("provision");
  });
  if (!hasCapExProvisioning) {
    validated.push(DEFAULT_CAPEX_PROVISIONING);
    console.warn("⚠️ EXECUTIVE_DECISION_SIGNALS: Missing CapEx provisioning statement, added default");
  }
  
  // Ensure we have at least 3 bullets (should always be true after validation)
  while (validated.length < 3) {
    validated.push("These conditions can be managed within standard asset planning cycles.");
  }
  
  // Limit to maximum 5 bullets
  return validated.slice(0, 5);
}
