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
 */
export async function enrichFindingsWithCalculatedPriority(
  inspection: StoredInspection,
  event?: HandlerEvent
): Promise<StoredFinding[]> {
  const completed = (inspection.raw?.custom_findings_completed as Array<CustomFindingDimensions & { id?: string }> | undefined) ?? [];
  const byId = new Map<string, CustomFindingDimensions>();
  for (const c of completed) {
    const id = c?.id;
    if (id) byId.set(String(id), c);
  }

  const result: StoredFinding[] = [];

  for (const f of inspection.findings) {
    const dims = byId.get(f.id);
    let priority_calculated: string | undefined;
    if (dims) {
      priority_calculated = await computeCustomFindingPriority(f.id, dims, event);
    }
    const hasCustomBudget = dims && typeof dims.budget_low === "number" && typeof dims.budget_high === "number";
    const enriched: StoredFinding = {
      ...f,
      priority_selected: f.priority_selected ?? f.priority,
      priority_calculated: priority_calculated ?? f.priority_calculated,
      override_reason: f.override_reason,
      budget_low: hasCustomBudget ? dims!.budget_low : f.budget_low,
      budget_high: hasCustomBudget ? dims!.budget_high : f.budget_high,
    };
    const priority_final = resolvePriorityFinal(enriched);
    result.push({ ...enriched, priority_final });
  }

  return result;
}
