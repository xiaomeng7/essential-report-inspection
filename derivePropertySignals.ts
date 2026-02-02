/**
 * derivePropertySignals.ts
 * v1 decision-signal engine for Better Home reports
 *
 * Goal:
 *  - Convert per-finding 9 dimensions -> finding signals -> property signals for report
 *
 * Notes:
 *  - This file is intentionally standalone so Cursor can wire it into your pipeline cleanly.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type OverallHealth = "GOOD" | "STABLE" | "ATTENTION" | "HIGH_RISK";

export type FindingDimensions = {
  // Adjust these keys to match your actual 9 dimensions.
  // The values should be normalized BEFORE calling derivePropertySignals.
  safety_impact?: "low" | "medium" | "high";          // D1
  compliance_exposure?: "low" | "medium" | "high";    // D2 (optional in v1)
  failure_likelihood?: "low" | "medium" | "high";     // D3
  urgency?: "now" | "0_3m" | "6_18m" | "next_renovation" | "monitor"; // D4
  degradation_trend?: "stable" | "worsening" | "unknown"; // D5
  tenant_disruption_risk?: "low" | "medium" | "high"; // D6
  cost_volatility?: "known" | "uncertain";            // D7
  detectability?: "visible" | "hidden";               // D8
  decision_complexity?: "simple" | "requires_judgement"; // D9
};

export type FindingSignals = {
  has_immediate_safety_risk: boolean;
  has_sudden_failure_risk: boolean;
  causes_tenant_disruption: boolean;
  deferrable: boolean;
  benefits_from_planning: boolean;
};

export type PropertySignals = {
  overall_health: OverallHealth;
  immediate_safety_risk: "NONE" | "PRESENT";
  sudden_failure_risk: RiskLevel;
  tenant_disruption_risk: RiskLevel;
  can_this_wait: "YES" | "CONDITIONALLY" | "NO";
  planning_value: RiskLevel;
  counts: {
    findings_total: number;
    immediate: number;
    non_deferrable: number;
    planning_benefit: number;
  };
};

const riskRank: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return riskRank[a] >= riskRank[b] ? a : b;
}

function isMediumOrAbove(v?: string): boolean {
  return v === "medium" || v === "high";
}

export function deriveFindingSignals(dim: FindingDimensions): FindingSignals {
  const immediate =
    dim.safety_impact === "high" && dim.urgency === "now";

  const suddenFailure =
    dim.failure_likelihood === "high" && dim.detectability === "hidden";

  const tenantDisruption =
    isMediumOrAbove(dim.tenant_disruption_risk) && isMediumOrAbove(dim.failure_likelihood);

  const deferrable =
    dim.urgency !== "now" && dim.degradation_trend !== "worsening";

  const planningBenefit =
    dim.degradation_trend === "worsening" ||
    dim.cost_volatility === "uncertain" ||
    dim.decision_complexity === "requires_judgement";

  return {
    has_immediate_safety_risk: Boolean(immediate),
    has_sudden_failure_risk: Boolean(suddenFailure),
    causes_tenant_disruption: Boolean(tenantDisruption),
    deferrable: Boolean(deferrable),
    benefits_from_planning: Boolean(planningBenefit),
  };
}

function deriveOverallHealth(s: Omit<PropertySignals, "overall_health">): OverallHealth {
  if (s.immediate_safety_risk === "PRESENT") return "HIGH_RISK";
  if (s.sudden_failure_risk === "HIGH" || s.tenant_disruption_risk === "HIGH") return "ATTENTION";
  if (s.planning_value === "HIGH" || s.planning_value === "MEDIUM") return "STABLE";
  return "GOOD";
}

export function derivePropertySignals(
  findings: Array<{ id: string; priority?: string; dimensions: FindingDimensions }>
): PropertySignals {
  const findingSignals = findings.map(f => ({ id: f.id, sig: deriveFindingSignals(f.dimensions) }));

  const immediatePresent = findingSignals.some(x => x.sig.has_immediate_safety_risk);
  const suddenRisk: RiskLevel = findingSignals.some(x => x.sig.has_sudden_failure_risk) ? "HIGH" : "LOW";
  const disruptionRisk: RiskLevel = findingSignals.some(x => x.sig.causes_tenant_disruption)
    ? "MEDIUM"
    : "LOW";

  const nonDeferrableCount = findingSignals.filter(x => !x.sig.deferrable).length;

  const canWait: "YES" | "CONDITIONALLY" | "NO" =
    immediatePresent ? "NO" : (nonDeferrableCount > 0 ? "CONDITIONALLY" : "YES");

  const planningBenefitCount = findingSignals.filter(x => x.sig.benefits_from_planning).length;
  const planningValue: RiskLevel =
    planningBenefitCount >= 2 ? "HIGH" : (planningBenefitCount === 1 ? "MEDIUM" : "LOW");

  const base = {
    immediate_safety_risk: immediatePresent ? "PRESENT" : "NONE",
    sudden_failure_risk: suddenRisk,
    tenant_disruption_risk: disruptionRisk,
    can_this_wait: canWait,
    planning_value: planningValue,
    counts: {
      findings_total: findings.length,
      immediate: findingSignals.filter(x => x.sig.has_immediate_safety_risk).length,
      non_deferrable: nonDeferrableCount,
      planning_benefit: planningBenefitCount,
    }
  };

  return {
    ...base,
    overall_health: deriveOverallHealth(base),
  };
}
