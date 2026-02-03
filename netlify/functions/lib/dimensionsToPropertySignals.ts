/**
 * Maps finding dimensions (custom 9-dim + standard profile) → FindingDimensions (D1–D9)
 * for derivePropertySignals. Deterministic; no AI.
 */

import type { FindingDimensions } from "./derivePropertySignals";
import type { CustomFindingDimensions } from "./customFindingPriority";
import type { FindingProfile } from "./findingProfilesLoader";

/** Map custom finding 9 dimensions to D1–D9 (FindingDimensions). */
export function customDimensionsToFindingDimensions(d: CustomFindingDimensions): FindingDimensions {
  const safety = (d.safety && String(d.safety).trim().toUpperCase()) || "LOW";
  const urgency = (d.urgency && String(d.urgency).trim().toUpperCase()) || "LONG_TERM";
  const liability = (d.liability && String(d.liability).trim().toUpperCase()) || "LOW";
  const escalation = (d.escalation && String(d.escalation).trim().toUpperCase()) || "LOW";
  const severity = typeof d.severity === "number" ? Math.max(1, Math.min(5, d.severity)) : 2;
  const likelihood = typeof d.likelihood === "number" ? Math.max(1, Math.min(5, d.likelihood)) : 2;
  const budgetHigh = typeof d.budget_high === "number" ? d.budget_high : 0;

  return {
    safety_impact: safety === "HIGH" ? "high" : safety === "MODERATE" ? "medium" : "low",
    compliance_risk: liability === "HIGH" ? "material" : liability === "MEDIUM" ? "minor" : "none",
    failure_likelihood:
      likelihood >= 4 || escalation === "HIGH" ? "high" : likelihood >= 3 ? "medium" : "low",
    urgency: urgency === "IMMEDIATE" ? "now" : urgency === "SHORT_TERM" ? "short" : "planned",
    degradation_trend: escalation === "HIGH" ? "worsening" : "stable",
    tenant_disruption_risk: severity >= 4 ? "high" : severity >= 3 ? "medium" : "low",
    cost_volatility: budgetHigh > 5000 ? "uncertain" : "stable",
    detectability: escalation === "HIGH" ? "hidden" : "obvious",
    decision_complexity: severity >= 4 || likelihood >= 4 ? "requires_judgement" : "simple",
  };
}

/** Map standard finding profile to FindingDimensions (D1–D9). */
export function profileToFindingDimensions(profile: FindingProfile): FindingDimensions {
  const safety = (profile.risk?.safety && String(profile.risk.safety).toUpperCase()) || "LOW";
  const compliance = (profile.risk?.compliance && String(profile.risk.compliance).toUpperCase()) || "LOW";
  const escalation = (profile.risk?.escalation && String(profile.risk.escalation).toUpperCase()) || "LOW";
  const severity = Math.max(1, Math.min(5, profile.risk_severity ?? 2));
  const likelihood = Math.max(1, Math.min(5, profile.likelihood ?? 2));
  const timeline = (profile.timeline && String(profile.timeline)) || "";
  const urgency =
    timeline.includes("0–3") || timeline.includes("0-3") || profile.default_priority === "IMMEDIATE"
      ? "now"
      : timeline.includes("12") || timeline.includes("6–18") || profile.default_priority === "RECOMMENDED_0_3_MONTHS"
        ? "short"
        : "planned";

  return {
    safety_impact: safety === "HIGH" ? "high" : safety === "MODERATE" ? "medium" : "low",
    compliance_risk: compliance === "HIGH" ? "material" : compliance === "MEDIUM" ? "minor" : "none",
    failure_likelihood: likelihood >= 4 || escalation === "HIGH" ? "high" : likelihood >= 3 ? "medium" : "low",
    urgency,
    degradation_trend: escalation === "HIGH" ? "worsening" : "stable",
    tenant_disruption_risk: severity >= 4 ? "high" : severity >= 3 ? "medium" : "low",
    cost_volatility: profile.budget_band === "HIGH" ? "uncertain" : "stable",
    detectability: escalation === "HIGH" ? "hidden" : "obvious",
    decision_complexity: severity >= 4 || likelihood >= 4 ? "requires_judgement" : "simple",
  };
}

/** Map PropertyDecisionSignals.overall_health to report label Low / Moderate / Elevated. */
export function overallHealthToRiskLabel(overall_health: "GOOD" | "STABLE" | "ATTENTION" | "HIGH_RISK"): "Low" | "Moderate" | "Elevated" {
  switch (overall_health) {
    case "HIGH_RISK":
      return "Elevated";
    case "ATTENTION":
      return "Moderate";
    case "STABLE":
      return "Moderate";
    case "GOOD":
      return "Low";
    default:
      return "Moderate";
  }
}
