/**
 * Core derivation engine: Findings (9 dimensions) → PropertyDecisionSignals
 *
 * Pipeline:
 *   1. Each finding → D1–D9 dimensions (from profile/response)
 *   2. D1–D9 → FindingSignals (per finding, internal)
 *   3. FindingSignals[] → aggregate → partial PropertyDecisionSignals
 *   4. deriveOverallHealth() → overall_health (product-level judgment)
 *
 * See REPORT_OUTPUT_CONTRACT.md §0
 */

export type FindingDimensions = {
  safety_impact: "low" | "medium" | "high";
  compliance_risk: "none" | "minor" | "material";
  failure_likelihood: "low" | "medium" | "high";
  urgency: "now" | "short" | "planned";
  degradation_trend: "stable" | "worsening";
  tenant_disruption_risk: "low" | "medium" | "high";
  cost_volatility: "stable" | "uncertain";
  detectability: "obvious" | "hidden";
  decision_complexity: "simple" | "requires_judgement";
};

export type FindingSignals = {
  has_immediate_safety_risk: boolean;
  has_sudden_failure_risk: boolean;
  causes_tenant_disruption: boolean;
  deferrable: boolean;
  benefits_from_planning: boolean;
};

export type PropertyDecisionSignals = {
  overall_health: "GOOD" | "STABLE" | "ATTENTION" | "HIGH_RISK";
  immediate_safety_risk: "NONE" | "PRESENT";
  sudden_failure_risk: "LOW" | "MEDIUM" | "HIGH";
  tenant_disruption_risk: "LOW" | "MEDIUM" | "HIGH";
  can_this_wait: "YES" | "CONDITIONALLY" | "NO";
  planning_value: "LOW" | "MEDIUM" | "HIGH";
};

/** Layer 1: D1–D9 → FindingSignals */
export function deriveFindingSignals(d: FindingDimensions): FindingSignals {
  const isMedOrAbove = (v: string) => ["medium", "high", "material"].includes(v);
  return {
    has_immediate_safety_risk: d.safety_impact === "high" && d.urgency === "now",
    has_sudden_failure_risk: d.failure_likelihood === "high" && d.detectability === "hidden",
    causes_tenant_disruption: isMedOrAbove(d.tenant_disruption_risk) && isMedOrAbove(d.failure_likelihood),
    deferrable: d.urgency !== "now" && d.degradation_trend !== "worsening",
    benefits_from_planning:
      d.degradation_trend === "worsening" ||
      d.cost_volatility === "uncertain" ||
      d.decision_complexity === "requires_judgement",
  };
}

function maxRisk(flags: boolean[]): "LOW" | "MEDIUM" | "HIGH" {
  return flags.some(Boolean) ? "HIGH" : "LOW";
}

/** Layer 2: FindingSignals[] → aggregated partial PropertyDecisionSignals */
export function aggregateFindings(findingsSignals: FindingSignals[]): Omit<PropertyDecisionSignals, "overall_health"> {
  if (findingsSignals.length === 0) {
    return {
      immediate_safety_risk: "NONE",
      sudden_failure_risk: "LOW",
      tenant_disruption_risk: "LOW",
      can_this_wait: "YES",
      planning_value: "LOW",
    };
  }
  return {
    immediate_safety_risk: findingsSignals.some((f) => f.has_immediate_safety_risk) ? "PRESENT" : "NONE",
    sudden_failure_risk: maxRisk(findingsSignals.map((f) => f.has_sudden_failure_risk)),
    tenant_disruption_risk: maxRisk(findingsSignals.map((f) => f.causes_tenant_disruption)),
    can_this_wait: findingsSignals.some((f) => !f.deferrable)
      ? "NO"
      : findingsSignals.some((f) => f.deferrable)
        ? "CONDITIONALLY"
        : "YES",
    planning_value: findingsSignals.some((f) => f.benefits_from_planning) ? "HIGH" : "LOW",
  };
}

/** Overall health — product-level judgment (not engineering) */
export function deriveOverallHealth(
  signals: Pick<PropertyDecisionSignals, "immediate_safety_risk" | "sudden_failure_risk" | "tenant_disruption_risk" | "planning_value">
): PropertyDecisionSignals["overall_health"] {
  if (signals.immediate_safety_risk === "PRESENT") return "HIGH_RISK";
  if (
    signals.sudden_failure_risk === "HIGH" ||
    signals.tenant_disruption_risk === "HIGH"
  ) {
    return "ATTENTION";
  }
  if (signals.planning_value === "HIGH") return "STABLE";
  return "GOOD";
}

/** Full pipeline: dimensions[] → PropertyDecisionSignals */
export function derivePropertySignals(dimensionsList: FindingDimensions[]): PropertyDecisionSignals {
  const findingSignals = dimensionsList.map(deriveFindingSignals);
  const partial = aggregateFindings(findingSignals);
  const overall_health = deriveOverallHealth(partial);
  return { ...partial, overall_health };
}
