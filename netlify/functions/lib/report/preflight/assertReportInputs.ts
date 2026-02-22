import { extractBaselineLoadSignals } from "../canonical/extractBaselineLoadSignals";
import { extractEnhancedCircuits } from "../canonical/extractEnhancedCircuits";
import { extractAssetsEnergy } from "../canonical/extractAssetsEnergy";
import type { BaselineStressLevel } from "../../reportEngine/baselineLoadEngine";
import type { ReportPlan } from "../../reportEngine/types";

export const PREFLIGHT_WARNING_CODE = {
  BASELINE_INSUFFICIENT: "BASELINE_INSUFFICIENT",
  ENHANCED_INSUFFICIENT: "ENHANCED_INSUFFICIENT",
  ENHANCED_SKIPPED: "ENHANCED_SKIPPED",
  ASSETS_COVERAGE_UNKNOWN: "ASSETS_COVERAGE_UNKNOWN",
  READINESS_TRIGGER_BLOCKED_BY_UNKNOWN_COVERAGE: "READINESS_TRIGGER_BLOCKED_BY_UNKNOWN_COVERAGE",
  TARIFF_DEFAULT_USED: "TARIFF_DEFAULT_USED",
  CIRCUITS_COVERAGE_NOT_MEASURED: "CIRCUITS_COVERAGE_NOT_MEASURED",
} as const;

export type WarningCode = (typeof PREFLIGHT_WARNING_CODE)[keyof typeof PREFLIGHT_WARNING_CODE];

export type PreflightWarning = {
  code: WarningCode;
  message: string;
  meta?: Record<string, unknown>;
};

export type ReportPreflightResult = {
  warnings: PreflightWarning[];
  flags: {
    baseline_insufficient: boolean;
    enhanced_insufficient: boolean;
    assets_coverage_unknown: boolean;
    enhanced_cost_band_violation?: boolean;
    assets_readiness_gate_violation?: boolean;
  };
  summary: {
    warningCounts: Record<string, number>;
    hasAnyWarning: boolean;
    severity: "none" | "low" | "medium" | "high";
    baselineComplete: boolean;
    enhancedComplete: boolean;
    assetsCoverage: "observed" | "declared" | "unknown";
    tariffSource: "customer" | "default" | "missing";
    circuitsCount: number;
    enhancedSkipped: boolean;
    enhancedSkipCode?: string;
    enhancedSkipNote?: string;
    subscriptionLead: boolean;
    subscriptionLeadReasons: string[];
  };
};

function dedupeWarnings(items: PreflightWarning[]): PreflightWarning[] {
  const seen = new Set<string>();
  const out: PreflightWarning[] = [];
  for (const item of items) {
    const sig = `${item.code}|${JSON.stringify(item.meta || {})}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
  }
  return out;
}

function parsePrimaryGoal(raw: Record<string, unknown>): string {
  const intake = (raw.snapshot_intake as Record<string, unknown> | undefined) ?? {};
  const snapshot = (raw.snapshot as Record<string, unknown> | undefined) ?? {};
  return String(intake.primaryGoal ?? snapshot.primaryGoal ?? snapshot.focus ?? "").toLowerCase();
}

function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    return extractValue((v as { value: unknown }).value);
  }
  return undefined;
}

function getPath(raw: Record<string, unknown>, p: string): unknown {
  const parts = p.split(".");
  let cur: unknown = raw;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return extractValue(cur) ?? cur;
}

function classifySeverity(
  warnings: PreflightWarning[],
  input: { profile?: "owner" | "investor" | "tenant"; flags: ReportPreflightResult["flags"] }
): "none" | "low" | "medium" | "high" {
  if (warnings.length === 0) return "none";
  const codeSet = new Set(warnings.map((w) => w.code));
  if (
    codeSet.has(PREFLIGHT_WARNING_CODE.BASELINE_INSUFFICIENT) ||
    codeSet.has(PREFLIGHT_WARNING_CODE.READINESS_TRIGGER_BLOCKED_BY_UNKNOWN_COVERAGE) ||
    (codeSet.has(PREFLIGHT_WARNING_CODE.ENHANCED_INSUFFICIENT) && input.profile === "owner")
  ) {
    return "high";
  }
  if (
    codeSet.has(PREFLIGHT_WARNING_CODE.ASSETS_COVERAGE_UNKNOWN) ||
    codeSet.has(PREFLIGHT_WARNING_CODE.CIRCUITS_COVERAGE_NOT_MEASURED) ||
    codeSet.has(PREFLIGHT_WARNING_CODE.TARIFF_DEFAULT_USED)
  ) {
    return "medium";
  }
  return "low";
}

export function assertReportInputs(
  raw: unknown,
  merged?: ReportPlan["merged"],
  options?: { stressLevel?: BaselineStressLevel; profile?: "owner" | "investor" | "tenant" }
): ReportPreflightResult {
  const warnings: PreflightWarning[] = [];
  const baseline = extractBaselineLoadSignals(raw);
  const enhanced = extractEnhancedCircuits(raw);
  const assets = extractAssetsEnergy(raw);
  const rawObj = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const enhancedSkipCode = String(getPath(rawObj, "energy_v2.enhancedSkipReason.code") ?? "").trim();
  const enhancedSkipNote = String(getPath(rawObj, "energy_v2.enhancedSkipReason.note") ?? "").trim().slice(0, 80);
  const enhancedSkipped = enhancedSkipCode.length > 0;

  const hasVoltage = baseline.voltageV !== undefined;
  const st = baseline.stressTest ?? {};
  const hasCurrent =
    st.totalCurrentA !== undefined ||
    st.currentA_L1 !== undefined ||
    st.currentA_L2 !== undefined ||
    st.currentA_L3 !== undefined;
  const baseline_insufficient = !(hasVoltage && hasCurrent);
  if (baseline_insufficient) {
    warnings.push({
      code: PREFLIGHT_WARNING_CODE.BASELINE_INSUFFICIENT,
      message: "baseline insufficient: missing voltage or current",
      meta: { hasVoltage, hasCurrent },
    });
  }

  const hasTariff =
    enhanced.tariff?.rate_c_per_kwh !== undefined || enhanced.tariff?.supply_c_per_day !== undefined;
  const tariffSource: "customer" | "default" | "missing" =
    hasTariff ? "customer" : enhanced.circuits.length >= 2 ? "default" : "missing";
  const enhanced_insufficient = enhanced.circuits.length < 2 && !hasTariff;
  if (enhanced_insufficient) {
    warnings.push({
      code: PREFLIGHT_WARNING_CODE.ENHANCED_INSUFFICIENT,
      message: "enhanced insufficient: circuits<2 and tariff missing",
      meta: { circuitsCount: enhanced.circuits.length, hasTariff },
    });
  }
  if (enhancedSkipped) {
    warnings.push({
      code: PREFLIGHT_WARNING_CODE.ENHANCED_SKIPPED,
      message: "enhanced section skipped with recorded reason",
      meta: { code: enhancedSkipCode },
    });
  }
  if (tariffSource === "default") {
    warnings.push({
      code: PREFLIGHT_WARNING_CODE.TARIFF_DEFAULT_USED,
      message: "tariff default used: customer tariff not provided",
      meta: { circuitsCount: enhanced.circuits.length },
    });
  }
  if (enhanced.circuits.length > 0 && enhanced.coverage !== "measured") {
    warnings.push({
      code: PREFLIGHT_WARNING_CODE.CIRCUITS_COVERAGE_NOT_MEASURED,
      message: "circuits coverage is not measured",
      meta: { coverage: enhanced.coverage, circuitsCount: enhanced.circuits.length },
    });
  }

  const assets_coverage_unknown = assets.coverage === "unknown";
  if (assets_coverage_unknown) {
    warnings.push({
      code: PREFLIGHT_WARNING_CODE.ASSETS_COVERAGE_UNKNOWN,
      message: "assets coverage unknown",
    });
  }

  const flags: ReportPreflightResult["flags"] = {
    baseline_insufficient,
    enhanced_insufficient,
    assets_coverage_unknown,
  };

  if (merged) {
    const hasCostBand = merged.findings.some((f) => f.id === "ESTIMATED_COST_BAND");
    if (enhanced_insufficient && hasCostBand) {
      warnings.push({
        code: PREFLIGHT_WARNING_CODE.ENHANCED_INSUFFICIENT,
        message: "enhanced violation: ESTIMATED_COST_BAND should not appear when enhanced insufficient",
        meta: { circuitsCount: enhanced.circuits.length, hasTariff, violation: "ESTIMATED_COST_BAND_PRESENT" },
      });
      flags.enhanced_cost_band_violation = true;
    }

    const hasReadiness = merged.findings.some((f) => f.id === "EV_SOLAR_BATTERY_READINESS_NOTE");
    const stressHigh = options?.stressLevel === "high" || options?.stressLevel === "critical";
    if (assets_coverage_unknown && hasReadiness && !stressHigh) {
      warnings.push({
        code: PREFLIGHT_WARNING_CODE.READINESS_TRIGGER_BLOCKED_BY_UNKNOWN_COVERAGE,
        message: "assets readiness violation: unknown coverage allows readiness only on high/critical stress",
      });
      flags.assets_readiness_gate_violation = true;
    }
  }

  const primaryGoal = parsePrimaryGoal(rawObj);
  const hasEvUnknownOrPresent = assets.hasEv !== false;
  const readinessCandidateFromInput = assets_coverage_unknown && hasEvUnknownOrPresent && /(plan_upgrade|upgrade|ev)/.test(primaryGoal);
  const stressHigh = options?.stressLevel === "high" || options?.stressLevel === "critical";
  if (readinessCandidateFromInput && !stressHigh) {
    warnings.push({
      code: PREFLIGHT_WARNING_CODE.READINESS_TRIGGER_BLOCKED_BY_UNKNOWN_COVERAGE,
      message: "readiness trigger blocked by unknown assets coverage under non-high stress",
      meta: { primaryGoal, stressLevel: options?.stressLevel ?? "unknown" },
    });
  }

  const deduped = dedupeWarnings(warnings);
  const warningCounts = deduped.reduce<Record<string, number>>((acc, w) => {
    acc[w.code] = (acc[w.code] ?? 0) + 1;
    return acc;
  }, {});

  const subscriptionLeadReasons: string[] = [];
  const severity = classifySeverity(deduped, { profile: options?.profile, flags });
  if (options?.profile === "owner" && severity === "high") {
    subscriptionLeadReasons.push("OWNER_HIGH_SEVERITY");
  }
  if (merged?.findings.some((f) => f.id === "CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION")) {
    subscriptionLeadReasons.push("MONITORING_FINDING_PRESENT");
  }
  const hasAnyAsset = assets.hasSolar === true || assets.hasBattery === true || assets.hasEv === true;
  if (hasAnyAsset && enhanced.coverage !== "measured") {
    subscriptionLeadReasons.push("ASSETS_WITH_NON_MEASURED_CIRCUITS");
  }
  const subscriptionLead = subscriptionLeadReasons.length > 0;

  return {
    warnings: deduped,
    flags,
    summary: {
      warningCounts,
      hasAnyWarning: deduped.length > 0,
      severity,
      baselineComplete: !baseline_insufficient,
      enhancedComplete: !enhanced_insufficient,
      assetsCoverage: assets.coverage ?? "unknown",
      tariffSource,
      circuitsCount: enhanced.circuits.length,
      enhancedSkipped,
      enhancedSkipCode: enhancedSkipped ? enhancedSkipCode : undefined,
      enhancedSkipNote: enhancedSkipNote || undefined,
      subscriptionLead,
      subscriptionLeadReasons,
    },
  };
}
