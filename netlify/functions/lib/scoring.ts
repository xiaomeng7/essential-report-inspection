/**
 * Deterministic Scoring Model
 * 
 * Computes overall risk level, badge, aggregate score, and CapEx snapshot
 * based on findings and their profiles using a deterministic formula:
 * - risk_score = severity * likelihood
 * - finding_score = risk_score * priority_weight * budget_weight
 * - overall_score = sum(finding_score)
 */

import type { FindingProfile } from "./findingProfilesLoader";

/**
 * Thresholds for overall_level classification
 */
export const SCORING_THRESHOLDS = {
  LOW_MAX: 10,        // overall_score < 10 => LOW
  MODERATE_MAX: 25,  // 10 <= overall_score < 25 => MODERATE
  // overall_score >= 25 => ELEVATED
} as const;

/**
 * Priority weight mapping
 */
export const PRIORITY_WEIGHTS = {
  IMMEDIATE: 3.0,
  URGENT: 2.5,
  RECOMMENDED: 1.5,
  PLAN: 1.0,
} as const;

/**
 * Budget band weight mapping
 */
export const BUDGET_WEIGHTS = {
  LOW: 1.0,
  MED: 1.2,
  HIGH: 1.5,
} as const;

/**
 * Budget structure (numeric)
 */
export type BudgetNumeric = {
  low: number;
  high: number;
};

/**
 * Finding profile for scoring (deterministic model)
 */
export type FindingProfileForScoring = {
  severity?: number;        // 1-5 from finding_profiles.yml
  likelihood?: number;      // 1-5 from finding_profiles.yml
  budget_band?: "LOW" | "MED" | "HIGH";  // from finding_profiles.yml
  budget?: BudgetNumeric;  // Optional: explicit budget range (min/max)
  category?: string;        // For dominant_risk calculation
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
  capex_incomplete: boolean;  // true if any finding missing budget range
  dominant_risk: string[];     // top 1-2 finding categories or ids
  /** CapEx low sum or null when no budget data */
  CAPEX_LOW: number | null;
  /** CapEx high sum or null when no budget data */
  CAPEX_HIGH: number | null;
  /** Stable display string for CapEx; never empty */
  CAPEX_SNAPSHOT: string;
};

const CAPEX_SUFFIX = " (indicative, planning only)";

/**
 * Format CapEx range for display (stable string, never empty).
 * - Both low/high valid numbers: "AUD $X – $Y (indicative, planning only)"
 * - Only one valid: "AUD $X+ (indicative, planning only)"
 * - Neither: "To be confirmed (indicative, planning only)"
 */
export function formatCapexRange(low?: number, high?: number): string {
  const hasLow = typeof low === "number" && !Number.isNaN(low);
  const hasHigh = typeof high === "number" && !Number.isNaN(high);
  if (hasLow && hasHigh) {
    return `AUD $${low} – $${high}${CAPEX_SUFFIX}`;
  }
  if (hasLow) {
    return `AUD $${low}+${CAPEX_SUFFIX}`;
  }
  if (hasHigh) {
    return `AUD $${high}+${CAPEX_SUFFIX}`;
  }
  return `To be confirmed${CAPEX_SUFFIX}`;
}

/**
 * Priority weight mapping (deterministic)
 */
export function priorityWeight(priority: string): number {
  const upper = String(priority).toUpperCase();
  if (upper === "IMMEDIATE") return PRIORITY_WEIGHTS.IMMEDIATE;
  if (upper === "URGENT") return PRIORITY_WEIGHTS.URGENT;
  if (upper === "RECOMMENDED_0_3_MONTHS" || upper === "RECOMMENDED") return PRIORITY_WEIGHTS.RECOMMENDED;
  if (upper === "PLAN_MONITOR" || upper === "PLAN") return PRIORITY_WEIGHTS.PLAN;
  return PRIORITY_WEIGHTS.PLAN; // Default
}

/**
 * Budget weight mapping (deterministic)
 */
export function budgetWeight(budgetBand: "LOW" | "MED" | "HIGH" | string | undefined): number {
  if (!budgetBand) return BUDGET_WEIGHTS.LOW;
  const upper = String(budgetBand).toUpperCase();
  if (upper === "LOW") return BUDGET_WEIGHTS.LOW;
  if (upper === "MED" || upper === "MEDIUM") return BUDGET_WEIGHTS.MED;
  if (upper === "HIGH") return BUDGET_WEIGHTS.HIGH;
  return BUDGET_WEIGHTS.LOW; // Default
}

/**
 * Calculate risk score: severity * likelihood
 */
export function riskScore(severity: number, likelihood: number): number {
  // Clamp values to 1-5 range
  const s = Math.max(1, Math.min(5, severity || 2));
  const l = Math.max(1, Math.min(5, likelihood || 2));
  return s * l;
}

/**
 * Calculate finding score (deterministic)
 * finding_score = risk_score * priority_weight * budget_weight
 */
export function findingScore(
  profile: FindingProfileForScoring,
  effectivePriority: string
): number {
  // Get severity and likelihood (with defaults)
  const severity = Math.max(1, Math.min(5, profile.severity ?? 2));
  const likelihood = Math.max(1, Math.min(5, profile.likelihood ?? 2));
  
  // Calculate risk_score
  const rs = riskScore(severity, likelihood);
  
  // Get priority_weight
  const pw = priorityWeight(effectivePriority);
  
  // Get budget_weight
  const bw = budgetWeight(profile.budget_band);
  
  // Calculate finding_score
  return rs * pw * bw;
}

/**
 * Compute overall score from findings and profiles (deterministic model)
 */
export function computeOverall(
  findings: FindingForScoring[],
  profiles: Record<string, FindingProfileForScoring>
): OverallScore {
  // Initialize aggregates
  let aggregateScore = 0;
  let capexLow = 0;
  let capexHigh = 0;
  let capexIncomplete = false;
  let hadAnyBudget = false;
  
  // Track finding scores and categories/ids for dominant_risk
  const findingScores: Array<{ id: string; score: number; category?: string }> = [];
  
  // Process each finding
  for (const finding of findings) {
    const profile = profiles[finding.id] || {};
    
    // Use effective priority (from finding or profile default)
    const effectivePriority = finding.priority || profile.default_priority || "PLAN";
    
    // Calculate finding score
    const score = findingScore(profile, effectivePriority);
    aggregateScore += score;
    
    // Track for dominant_risk calculation
    findingScores.push({
      id: finding.id,
      score,
      category: profile.category,
    });
    
    // Accumulate CapEx (sum budget ranges where available)
    if (profile.budget && typeof profile.budget.low === "number" && typeof profile.budget.high === "number") {
      capexLow += profile.budget.low;
      capexHigh += profile.budget.high;
      hadAnyBudget = true;
    } else {
      // Flag incomplete if budget range is missing
      capexIncomplete = true;
    }
  }
  
  // Determine dominant_risk: top 1-2 finding categories or ids
  // Sort by score descending
  findingScores.sort((a, b) => b.score - a.score);
  
  const dominantRisk: string[] = [];
  const categoryCounts: Record<string, number> = {};
  
  // Count categories from top findings
  for (const item of findingScores.slice(0, Math.min(5, findingScores.length))) {
    if (item.category) {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + item.score;
    }
  }
  
  // Get top 1-2 categories
  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cat]) => cat);
  
  if (sortedCategories.length > 0) {
    dominantRisk.push(...sortedCategories);
  } else {
    // Fallback to top finding IDs if no categories
    dominantRisk.push(...findingScores.slice(0, 2).map(item => item.id));
  }
  
  // Determine overall level using thresholds
  let overallLevel: "LOW" | "MODERATE" | "ELEVATED";
  if (aggregateScore < SCORING_THRESHOLDS.LOW_MAX) {
    overallLevel = "LOW";
  } else if (aggregateScore < SCORING_THRESHOLDS.MODERATE_MAX) {
    overallLevel = "MODERATE";
  } else {
    overallLevel = "ELEVATED";
  }
  
  // Generate badge
  const badge = overallLevel === "ELEVATED" ? "🔴 Elevated" :
                overallLevel === "MODERATE" ? "🟡 Moderate" :
                "🟢 Low";
  
  // CapEx: null when no budget data, else numeric sums; snapshot string never empty
  const CAPEX_LOW: number | null = hadAnyBudget ? capexLow : null;
  const CAPEX_HIGH: number | null = hadAnyBudget ? capexHigh : null;
  const CAPEX_SNAPSHOT = formatCapexRange(CAPEX_LOW ?? undefined, CAPEX_HIGH ?? undefined);
  
  return {
    overall_level: overallLevel,
    badge,
    aggregate_score: aggregateScore,
    capex_low: capexLow,
    capex_high: capexHigh,
    capex_incomplete: capexIncomplete,
    dominant_risk: dominantRisk,
    CAPEX_LOW,
    CAPEX_HIGH,
    CAPEX_SNAPSHOT,
  };
}

/**
 * Helper: Convert FindingProfile (from YAML) to FindingProfileForScoring
 */
export function convertProfileForScoring(
  profile: FindingProfile
): FindingProfileForScoring {
  // Extract severity and likelihood (1-5)
  const severity = Math.max(1, Math.min(5, profile.risk_severity ?? 2));
  const likelihood = Math.max(1, Math.min(5, profile.likelihood ?? 2));
  
  // Extract budget_band
  const budgetBand = profile.budget_band || "LOW";
  
  // Extract budget range if available (from budget_range string or budget object)
  let budget: BudgetNumeric | undefined = undefined;
  if (profile.budget_range) {
    // Try to parse budget_range string (e.g., "AUD $350–$450")
    const rangeMatch = profile.budget_range.match(/\$?([\d,]+)\s*[–-]\s*\$?([\d,]+)/);
    if (rangeMatch) {
      const low = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
      const high = parseInt(rangeMatch[2].replace(/,/g, ""), 10);
      if (!isNaN(low) && !isNaN(high)) {
        budget = { low, high };
      }
    }
  }
  
  // If no explicit budget range, generate from budget_band
  if (!budget) {
    switch (budgetBand) {
      case "LOW":
        budget = { low: 100, high: 500 };
        break;
      case "MED":
        budget = { low: 500, high: 2000 };
        break;
      case "HIGH":
        budget = { low: 2000, high: 10000 };
        break;
      default:
        budget = { low: 0, high: 0 };
    }
  }
  
  return {
    severity,
    likelihood,
    budget_band: budgetBand as "LOW" | "MED" | "HIGH",
    budget,
    category: profile.category,
    default_priority: profile.default_priority,
  };
}
