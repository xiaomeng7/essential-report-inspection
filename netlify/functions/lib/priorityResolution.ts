/**
 * Deterministic priority resolution for findings.
 * Used by the 9-dimension → 3 decision outputs compression engine.
 *
 * Rules (priority_selected is never trusted as default):
 * - System-calculated priority is the default. Manual override must be explicit and auditable.
 * - If priority_calculated exists: priority_final = priority_calculated unless there is an
 *   explicit, auditable override (priority_selected differs AND override_reason is present).
 * - If engineer overrides: set priority_final = priority_selected only when override_reason
 *   is present; otherwise keep priority_final = priority_calculated.
 * - When priority_calculated is absent (e.g. legacy): use legacy priority field or DEFAULT;
 *   never use priority_selected as the default.
 */

export type FindingWithPriorityFields = {
  priority?: string;
  priority_selected?: string;
  priority_calculated?: string;
  priority_final?: string;
  override_reason?: string;
};

const DEFAULT_PRIORITY = "PLAN_MONITOR";

/**
 * Resolve the effective (final) priority for a finding.
 * Deterministic; no AI. Safe when custom dimensions are missing.
 * priority_selected is only used when override is explicit and auditable (override_reason present).
 *
 * @param finding Finding with optional priority_selected, priority_calculated, priority_final, override_reason
 * @returns Effective priority string (e.g. IMMEDIATE, URGENT, RECOMMENDED_0_3_MONTHS, PLAN_MONITOR)
 */
export function resolvePriorityFinal(finding: FindingWithPriorityFields): string {
  const selected = finding.priority_selected ?? finding.priority;
  const calculated = finding.priority_calculated;
  const already = finding.priority_final;
  const overrideReason = finding.override_reason;

  if (already != null && already !== "") {
    return already;
  }

  if (calculated != null && calculated !== "") {
    const hasOverride = overrideReason != null && String(overrideReason).trim() !== "";
    if (selected != null && selected !== "" && selected !== calculated && hasOverride) {
      return selected;
    }
    return calculated;
  }

  // No priority_calculated: use legacy priority only. Never use priority_selected as default.
  return finding.priority ?? DEFAULT_PRIORITY;
}

/**
 * Validate that a finding's override is allowed when selected !== calculated.
 * Returns true if either no override is needed (selected === calculated) or override_reason is present.
 */
export function isOverrideValid(finding: FindingWithPriorityFields): boolean {
  const selected = finding.priority_selected ?? finding.priority;
  const calculated = finding.priority_calculated;
  if (calculated == null || calculated === "" || selected === calculated) {
    return true;
  }
  const reason = finding.override_reason;
  return reason != null && String(reason).trim() !== "";
}
