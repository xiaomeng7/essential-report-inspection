/**
 * Deterministic priority compression for CUSTOM findings (9 dimensions → priority_calculated).
 * Reuses rules.yml applyPriority logic; adds optional severity×likelihood and escalation upgrade.
 */

import type { HandlerEvent } from "@netlify/functions";
import { computePriorityFromMeta } from "./rules";
import { resolvePriorityFinal } from "./priorityResolution";
import type { StoredFinding, StoredInspection } from "./store";

/** Dimensions stored in raw.custom_findings_completed (subset used for priority + CapEx). */
export type CustomFindingDimensions = {
  id?: string;
  safety?: string;
  urgency?: string;
  liability?: string;
  severity?: number;
  likelihood?: number;
  escalation?: string;
  budget_low?: number;
  budget_high?: number;
};

/** Admin override from raw.finding_dimensions_debug (9-dimension debug UI). Used by report generation. */
export type FindingDimensionsDebugOverride = {
  title?: string;
  safety?: string;
  urgency?: string;
  liability?: string;
  budget_low?: number;
  budget_high?: number;
  priority?: string;
  severity?: number;
  likelihood?: number;
  escalation?: string;
};

/** Configurable threshold: severity × likelihood >= this → upgrade PLAN_MONITOR to RECOMMENDED_0_3_MONTHS. */
export const CUSTOM_PRIORITY_SEVERITY_LIKELIHOOD_THRESHOLD = 12;

/**
 * Normalize dimension strings to rules.yml enums (empty/missing → safe defaults for matrix).
 */
function normalizeMeta(d: CustomFindingDimensions): { safety: string; urgency: string; liability: string } {
  const safety = (d.safety && String(d.safety).trim()) || "MODERATE";
  const urgency = (d.urgency && String(d.urgency).trim()) || "SHORT_TERM";
  const liability = (d.liability && String(d.liability).trim()) || "MEDIUM";
  return { safety, urgency, liability };
}

/**
 * Compute priority_calculated for one custom finding from its 9 dimensions.
 * Deterministic: (1) base bucket from safety/urgency/liability via rules; (2) optional upgrade using severity×likelihood and escalation.
 */
export async function computeCustomFindingPriority(
  findingId: string,
  dimensions: CustomFindingDimensions,
  event?: HandlerEvent
): Promise<string> {
  const meta = normalizeMeta(dimensions);
  let bucket = await computePriorityFromMeta(findingId, meta, event);

  if (bucket !== "PLAN_MONITOR") return bucket;

  const severity = typeof dimensions.severity === "number" ? dimensions.severity : 0;
  const likelihood = typeof dimensions.likelihood === "number" ? dimensions.likelihood : 0;
  const escalation = (dimensions.escalation && String(dimensions.escalation).trim().toUpperCase()) || "";

  if (severity * likelihood >= CUSTOM_PRIORITY_SEVERITY_LIKELIHOOD_THRESHOLD || escalation === "HIGH") {
    return "RECOMMENDED_0_3_MONTHS";
  }

  return bucket;
}

/**
 * Enrich inspection findings with priority_calculated (for custom findings) and priority_final (for all).
 * Backward compatible: standard findings keep existing priority; custom findings get calculated + override rules.
 * Admin overrides from raw.finding_dimensions_debug (9-dimension debug UI) are merged so report generation
 * uses the updated logic (e.g. severity change, compliance update) and optional priority/title/budget overrides.
 * Global overrides (from Config → 9 维全局) are merged before per-inspection debug; both affect all reports / single report.
 */
export async function enrichFindingsWithCalculatedPriority(
  inspection: StoredInspection,
  event?: HandlerEvent,
  options?: { globalOverrides?: Record<string, FindingDimensionsDebugOverride> }
): Promise<StoredFinding[]> {
  const completed = (inspection.raw?.custom_findings_completed as Array<CustomFindingDimensions & { id?: string }> | undefined) ?? [];
  const byId = new Map<string, CustomFindingDimensions>();
  for (const c of completed) {
    const id = c?.id;
    if (id) byId.set(String(id), c);
  }

  const globalOverrides = options?.globalOverrides ?? {};
  const debugOverrides = (inspection.raw?.finding_dimensions_debug as Record<string, FindingDimensionsDebugOverride>) ?? {};
  const result: StoredFinding[] = [];

  for (const f of inspection.findings) {
    const dims = byId.get(f.id);
    const global = globalOverrides[f.id] as FindingDimensionsDebugOverride | undefined;
    const debug = debugOverrides[f.id];
    const effectiveDims: CustomFindingDimensions | undefined = dims || global || debug
      ? { ...dims, ...global, ...debug } as CustomFindingDimensions
      : undefined;

    let priority_calculated: string | undefined;
    if (effectiveDims) {
      priority_calculated = await computeCustomFindingPriority(f.id, effectiveDims, event);
    } else {
      priority_calculated = f.priority_calculated;
    }

    const hasCustomBudget = effectiveDims && (
      (typeof effectiveDims.budget_low === "number") || (typeof effectiveDims.budget_high === "number")
    );
    const budget_low = hasCustomBudget && typeof effectiveDims!.budget_low === "number" ? effectiveDims!.budget_low : f.budget_low;
    const budget_high = hasCustomBudget && typeof effectiveDims!.budget_high === "number" ? effectiveDims!.budget_high : f.budget_high;

    const debugPriority = debug?.priority != null && String(debug.priority).trim() !== "";
    const globalPriority = global?.priority != null && String(global?.priority).trim() !== "";
    const hasAdminPriorityOverride = debugPriority || globalPriority;
    const priority_selected = debugPriority ? debug!.priority! : globalPriority ? global!.priority! : (f.priority_selected ?? f.priority);
    const override_reason = hasAdminPriorityOverride ? (debugPriority ? "Admin 9-dimension override" : "Global 9-dimension override") : f.override_reason;
    const title = (debug?.title != null && String(debug.title).trim() !== "") ? debug.title.trim()
      : (global?.title != null && String(global.title).trim() !== "") ? global.title.trim()
      : f.title;

    const enriched: StoredFinding = {
      ...f,
      title,
      priority_selected,
      priority_calculated: priority_calculated ?? f.priority_calculated,
      override_reason,
      budget_low,
      budget_high,
    };
    const priority_final = resolvePriorityFinal(enriched);
    result.push({ ...enriched, priority_final });
  }

  return result;
}
