/**
 * Focus-based Executive Summary builder
 *
 * Selects and renders content based on scoring focus (Risk / Energy / Balanced).
 * Variables: stressRatio, tenantChangeSoon, symptomsContains (tripping), hasDetailedCircuits,
 * billBand, allElectricNoGas, hasSolar, hasEv, billUploadWilling.
 */

export type ExecutiveSummaryFocusContext = {
  stressRatio?: number;
  tenantChangeSoon?: boolean;
  symptomsContainsTripping?: boolean;
  hasDetailedCircuits?: boolean;
  billBand?: string;
  allElectricNoGas?: boolean;
  hasSolar?: boolean;
  hasEv?: boolean;
  billUploadWilling?: boolean;
};

export type FocusScores = {
  scoreRisk: number;
  scoreEnergy: number;
  scoreBalanced: number;
};

export type FocusFlags = {
  isFocusRisk: boolean;
  isFocusEnergy: boolean;
  isFocusBalanced: boolean;
  isFocusDefault: boolean;
};

/**
 * Compute focus scores from primaryGoal and optional weights.
 * When primaryGoal is set: that focus gets 100, others 0.
 * When absent: use weights (lifecycle→risk, energy→energy, balanced=0).
 */
export function computeFocusScores(
  primaryGoal?: string,
  weights?: { energy: number; lifecycle: number }
): FocusScores {
  const pg = (primaryGoal ?? "").toString().toLowerCase().trim();
  if (/^(risk|reduce_risk)$/.test(pg)) return { scoreRisk: 100, scoreEnergy: 0, scoreBalanced: 0 };
  if (/^(energy|reduce_bill)$/.test(pg)) return { scoreRisk: 0, scoreEnergy: 100, scoreBalanced: 0 };
  if (/^(balanced|plan_upgrade)$/.test(pg)) return { scoreRisk: 0, scoreEnergy: 0, scoreBalanced: 100 };
  const w = weights ?? { energy: 50, lifecycle: 50 };
  return {
    scoreRisk: w.lifecycle,
    scoreEnergy: w.energy,
    scoreBalanced: 0,
  };
}

/**
 * Derive focus flags from scores.
 */
export function deriveFocusFlags(scores: FocusScores): FocusFlags {
  const maxScore = Math.max(scores.scoreRisk, scores.scoreEnergy, scores.scoreBalanced);
  const isFocusRisk = maxScore > 0 && maxScore === scores.scoreRisk;
  const isFocusEnergy = maxScore > 0 && maxScore === scores.scoreEnergy;
  const isFocusBalanced = maxScore > 0 && maxScore === scores.scoreBalanced;
  const isFocusDefault = !isFocusRisk && !isFocusEnergy && !isFocusBalanced;
  return { isFocusRisk, isFocusEnergy, isFocusBalanced, isFocusDefault };
}

/**
 * Build Risk Focused Executive Summary block.
 */
export function buildRiskFocusedBlock(ctx: ExecutiveSummaryFocusContext): string {
  const parts: string[] = [];
  parts.push("**Executive Summary (Risk Focused)**");
  parts.push("");
  parts.push("Based on the on-site data, this property demonstrates elevated risk indicators:");
  parts.push("");
  if (ctx.stressRatio != null) {
    const pct = Math.round(ctx.stressRatio * 100);
    parts.push(`• **High Load Stress:** The system's total current is approximately ${pct}% of the main switch capacity, indicating significant load pressure.`);
  }
  if (ctx.tenantChangeSoon) {
    parts.push("• **Tenant Transition Soon:** Tenant change is imminent — a risk-focused assessment is strongly recommended.");
  }
  if (ctx.symptomsContainsTripping) {
    parts.push("• **Breaker Trips Reported:** Breaker trips are observed; this may indicate overload issues or wiring concerns.");
  }
  if (ctx.hasDetailedCircuits) {
    parts.push("• **Detailed Circuit Data Provided:** Circuit breakdown was provided, enhancing the accuracy of load distribution analysis.");
  }
  parts.push("");
  parts.push("**Recommended actions:**");
  parts.push("• Prioritise communication with stakeholders about load limitations.");
  parts.push("• Address overload paths before tenant change or new device installs.");
  parts.push("• Consider main service upgrade if sustained heavy loads are expected.");
  return parts.join("\n");
}

/**
 * Build Energy Focused Executive Summary block.
 */
export function buildEnergyFocusedBlock(ctx: ExecutiveSummaryFocusContext): string {
  const parts: string[] = [];
  parts.push("**Executive Summary (Energy Focused)**");
  parts.push("");
  parts.push("This property shows load and operational characteristics that suggest energy usage or cost concerns:");
  parts.push("");
  if (ctx.billBand) {
    parts.push(`• **Electricity Cost:** Annual electricity spend is in the ${ctx.billBand} range, above typical residential usage bands.`);
  }
  if (ctx.allElectricNoGas) {
    parts.push("• **All-Electric Home:** The property relies entirely on electrical loads, which increases peak demand exposure.");
  }
  if (ctx.hasSolar) {
    parts.push("• **Solar PV Present:** Solar generation exists — consider optimizing energy usage to increase self-consumption.");
  }
  if (ctx.hasEv) {
    parts.push("• **EV Charger Present:** EV charging contributes to higher peak loads; planning for dedicated capacity may be beneficial.");
  }
  if (ctx.billUploadWilling) {
    parts.push("• **Billing Calibration Available:** Customer is willing to provide billing data, which will help refine energy cost estimates.");
  }
  parts.push("");
  parts.push("**Recommended actions:**");
  parts.push("• Analyse tariff structures to reduce peak charges.");
  parts.push("• Plan dedicated circuits for high-load devices (EV/Heat Pump).");
  parts.push("• Review opportunities for energy-efficient upgrades.");
  return parts.join("\n");
}

/**
 * Build Balanced Executive Summary block.
 */
export function buildBalancedBlock(ctx: ExecutiveSummaryFocusContext): string {
  const parts: string[] = [];
  parts.push("**Executive Summary (Balanced)**");
  parts.push("");
  parts.push("The inspection data incorporates both risk and energy perspectives:");
  parts.push("");
  parts.push("• A core load and stress assessment has been completed.");
  if (ctx.hasDetailedCircuits) {
    parts.push("• Detailed circuit measurement was performed, enhancing insight depth.");
  } else {
    parts.push("• Detailed circuit measurement was not supplied; this may limit energy profiling resolution.");
  }
  if (ctx.billBand) {
    parts.push(`• The electricity cost is indicated at approximately ${ctx.billBand} annually.`);
  }
  if (ctx.billUploadWilling) {
    parts.push("• Billing data can be provided post-report for more refined energy cost calibration.");
  }
  parts.push("");
  parts.push("**General guidance:**");
  parts.push("• Review both capacity and energy recommendations carefully.");
  parts.push("• Follow up with specific measurement or billing data where available.");
  parts.push("• Consider a holistic action plan combining safety and efficiency enhancements.");
  return parts.join("\n");
}
