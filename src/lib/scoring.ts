/**
 * Priority × Risk × Budget Scoring Model
 * 
 * Computes overall risk level, badge, aggregate score, and CapEx snapshot
 * based on findings and their profiles.
 */

/**
 * Risk structure (numeric 1-5 scale)
 */
export type RiskNumeric = {
  safety: number;      // 1-5
  compliance: number;  // 1-5
  escalation: number;  // 1-5
};

/**
 * Budget structure (numeric)
 */
export type BudgetNumeric = {
  low: number;
  high: number;
};

/**
 * Finding profile with numeric risk and budget
 */
export type FindingProfileForScoring = {
  risk?: RiskNumeric;
  budget?: BudgetNumeric;
  default_priority?: string;
};

/**
 * Finding with priority
 */
export type FindingForScoring = {
  id: string;
  priority: string;
};

/**
 * Overall scoring result
 */
export type OverallScore = {
  overall_level: "LOW" | "MODERATE" | "ELEVATED";
  badge: "🟢 Low" | "🟡 Moderate" | "🔴 Elevated";
  aggregate_score: number;
  capex_low: number;
  capex_high: number;
  dominantRisk: "safety" | "compliance" | "escalation";
};

/**
 * Convert risk string levels to numeric (1-5)
 */
function riskLevelToNumeric(level: string): number {
  const upper = String(level).toUpperCase();
  if (upper === "HIGH") return 5;
  if (upper === "MODERATE" || upper === "MEDIUM") return 3;
  if (upper === "LOW") return 1;
  return 2; // Default
}

/**
 * Convert profile risk to numeric risk
 */
function convertRiskToNumeric(risk: {
  safety?: string;
  compliance?: string;
  escalation?: string;
}): RiskNumeric {
  return {
    safety: risk.safety ? riskLevelToNumeric(risk.safety) : 2,
    compliance: risk.compliance ? riskLevelToNumeric(risk.compliance) : 2,
    escalation: risk.escalation ? riskLevelToNumeric(risk.escalation) : 2,
  };
}

/**
 * Convert budget level to numeric budget
 * Maps "low"|"high"|"horizon" to budget ranges
 */
function convertBudgetToNumeric(budget: string | BudgetNumeric | undefined): BudgetNumeric {
  if (typeof budget === "object" && budget !== null && "low" in budget && "high" in budget) {
    return {
      low: typeof budget.low === "number" ? budget.low : 0,
      high: typeof budget.high === "number" ? budget.high : 0,
    };
  }
  
  // Map string levels to ranges
  const budgetStr = String(budget || "horizon").toLowerCase();
  if (budgetStr === "high") {
    return { low: 2000, high: 10000 };
  }
  if (budgetStr === "low") {
    return { low: 200, high: 1000 };
  }
  // horizon or unknown
  return { low: 0, high: 0 };
}

/**
 * Priority weight mapping
 */
export function priorityWeight(priority: string): number {
  const upper = String(priority).toUpperCase();
  if (upper === "IMMEDIATE" || upper === "URGENT") return 3.0;
  if (upper === "RECOMMENDED_0_3_MONTHS" || upper === "RECOMMENDED") return 2.0;
  if (upper === "PLAN_MONITOR" || upper === "PLAN") return 1.0;
  return 1.0; // Default
}

/**
 * Risk core score (average of three dimensions)
 * risk = { safety, compliance, escalation } each 1-5
 */
export function riskCore(risk: RiskNumeric): number {
  const safety = typeof risk.safety === "number" ? Math.max(1, Math.min(5, risk.safety)) : 2;
  const compliance = typeof risk.compliance === "number" ? Math.max(1, Math.min(5, risk.compliance)) : 2;
  const escalation = typeof risk.escalation === "number" ? Math.max(1, Math.min(5, risk.escalation)) : 2;
  
  // Average of three dimensions
  return (safety + compliance + escalation) / 3;
}

/**
 * Budget factor (log10 based, clamp 0.75..1.15)
 */
export function budgetFactor(budgetHigh: number): number {
  if (budgetHigh <= 0) return 0.75;
  
  // log10 based: log10(budgetHigh) / log10(10000) * (1.15 - 0.75) + 0.75
  const logValue = Math.log10(budgetHigh);
  const normalized = (logValue / 4.0) * 0.4 + 0.75; // log10(10000) = 4
  
  // Clamp between 0.75 and 1.15
  return Math.max(0.75, Math.min(1.15, normalized));
}

/**
 * Calculate finding score
 * findingScore = priorityWeight × riskCore × budgetFactor
 */
export function findingScore(
  profile: FindingProfileForScoring,
  effectivePriority: string
): number {
  // Get risk (with defaults)
  const risk: RiskNumeric = profile.risk || { safety: 2, compliance: 2, escalation: 2 };
  
  // Get budget (with defaults)
  const budget: BudgetNumeric = profile.budget || { low: 0, high: 0 };
  
  // Calculate components
  const weight = priorityWeight(effectivePriority);
  const core = riskCore(risk);
  const factor = budgetFactor(budget.high);
  
  return weight * core * factor;
}

/**
 * Compute overall score from findings and profiles
 */
export function computeOverall(
  findings: FindingForScoring[],
  profiles: Record<string, FindingProfileForScoring>
): OverallScore {
  // Default values
  const defaultRisk: RiskNumeric = { safety: 2, compliance: 2, escalation: 2 };
  const defaultBudget: BudgetNumeric = { low: 0, high: 0 };
  
  // Initialize aggregates
  let aggregateScore = 0;
  let capexLow = 0;
  let capexHigh = 0;
  
  // Track gate conditions
  let hasImmediateWithHighRisk = false;
  let hasUrgentWithVeryHighRisk = false;
  let hasImmediate = false;
  
  // Track weighted risk contributions for dominantRisk calculation
  let weightedSafety = 0;
  let weightedCompliance = 0;
  let weightedEscalation = 0;
  
  // Process each finding
  for (const finding of findings) {
    const profile = profiles[finding.id] || {};
    
    // Get risk (with defaults)
    const risk: RiskNumeric = profile.risk || defaultRisk;
    
    // Get budget (with defaults)
    const budget: BudgetNumeric = profile.budget || defaultBudget;
    
    // Use effective priority (from finding or profile default)
    const effectivePriority = finding.priority || profile.default_priority || "PLAN_MONITOR";
    
    // Calculate priority weight for this finding
    const weight = priorityWeight(effectivePriority);
    
    // Accumulate weighted risk contributions
    weightedSafety += risk.safety * weight;
    weightedCompliance += risk.compliance * weight;
    weightedEscalation += risk.escalation * weight;
    
    // Calculate finding score
    const score = findingScore(profile, effectivePriority);
    aggregateScore += score;
    
    // Check gate conditions
    const core = riskCore(risk);
    const priorityUpper = String(effectivePriority).toUpperCase();
    
    if (priorityUpper === "IMMEDIATE") {
      hasImmediate = true;
      if (core >= 3.0) {
        hasImmediateWithHighRisk = true;
      }
    }
    if (priorityUpper === "URGENT") {
      if (core >= 3.5) {
        hasUrgentWithVeryHighRisk = true;
      }
    }
    
    // Accumulate CapEx (only for IMMEDIATE/URGENT/RECOMMENDED/PLAN)
    if (priorityUpper === "IMMEDIATE" || 
        priorityUpper === "URGENT" || 
        priorityUpper === "RECOMMENDED_0_3_MONTHS" || 
        priorityUpper === "RECOMMENDED" ||
        priorityUpper === "PLAN_MONITOR" ||
        priorityUpper === "PLAN") {
      capexLow += budget.low || 0;
      capexHigh += budget.high || 0;
    }
  }
  
  // Determine dominantRisk: the dimension with the highest weighted contribution
  let dominantRisk: "safety" | "compliance" | "escalation";
  if (weightedSafety >= weightedCompliance && weightedSafety >= weightedEscalation) {
    dominantRisk = "safety";
  } else if (weightedCompliance >= weightedEscalation) {
    dominantRisk = "compliance";
  } else {
    dominantRisk = "escalation";
  }
  
  // Apply aggregate multiplier: (1 + 0.06 * min(N, 10))
  const N = findings.length;
  const multiplier = 1 + 0.06 * Math.min(N, 10);
  aggregateScore *= multiplier;
  
  // Determine overall level (Gate Rules first)
  let overallLevel: "LOW" | "MODERATE" | "ELEVATED";
  
  // Gate Rules (priority order)
  if (hasImmediateWithHighRisk) {
    overallLevel = "ELEVATED";
  } else if (hasUrgentWithVeryHighRisk) {
    overallLevel = "ELEVATED";
  } else if (hasImmediate) {
    overallLevel = "MODERATE"; // Minimum for IMMEDIATE
  } else {
    // Thresholds based on aggregate score
    if (aggregateScore < 6) {
      overallLevel = "LOW";
    } else if (aggregateScore < 13) {
      overallLevel = "MODERATE";
    } else {
      overallLevel = "ELEVATED";
    }
  }
  
  // Generate badge
  const badge = overallLevel === "ELEVATED" ? "🔴 Elevated" :
                overallLevel === "MODERATE" ? "🟡 Moderate" :
                "🟢 Low";
  
  return {
    overall_level: overallLevel,
    badge,
    aggregate_score: aggregateScore,
    capex_low: capexLow,
    capex_high: capexHigh,
    dominantRisk,
  };
}

/**
 * Helper: Convert FindingProfile (from YAML) to FindingProfileForScoring
 */
export function convertProfileForScoring(
  profile: {
    risk?: { safety?: string; compliance?: string; escalation?: string };
    budget?: string | BudgetNumeric;
    default_priority?: string;
  }
): FindingProfileForScoring {
  return {
    risk: profile.risk ? convertRiskToNumeric(profile.risk) : undefined,
    budget: convertBudgetToNumeric(profile.budget),
    default_priority: profile.default_priority,
  };
}
