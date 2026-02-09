/**
 * DB helpers for 003 findings management schema.
 * Tables: finding_definitions, finding_dimensions_seed, finding_custom_dimensions.
 * View: finding_effective_dimensions (override ?? seed, dimensions_source).
 */

import { getSql, isDbConfigured } from "./db";
import type { CustomNine } from "./dbTypes";

export type FindingDefinitionRow003 = {
  finding_id: string;
  system_group: string | null;
  space_group: string | null;
  tags: string[];
  title: string | null;
  why_it_matters: string | null;
  recommended_action: string | null;
  planning_guidance: string | null;
  source: string;
  created_at: Date;
  updated_at: Date;
};

export type EffectiveDimensionsRow = {
  finding_id: string;
  safety: string | null;
  urgency: string | null;
  liability: string | null;
  budget_low: number | null;
  budget_high: number | null;
  priority: string | null;
  severity: number | null;
  likelihood: number | null;
  escalation: string | null;
  dimensions_source: string;
  override_version: number | null;
};

export type OverrideRow = {
  id: number;
  finding_id: string;
  version: number;
  active: boolean;
  safety: string | null;
  urgency: string | null;
  liability: string | null;
  budget_low: number | null;
  budget_high: number | null;
  priority: string | null;
  severity: number | null;
  likelihood: number | null;
  escalation: string | null;
  note: string | null;
  updated_by: string | null;
  created_at: Date;
};

/** Returns all finding_definitions (003). */
export async function getFindingDefinitionsMap(): Promise<Map<string, FindingDefinitionRow003>> {
  const q = getSql();
  const rows = (await q`
    SELECT finding_id, system_group, space_group, tags, title, why_it_matters,
           recommended_action, planning_guidance, source, created_at, updated_at
    FROM finding_definitions
  `) as (FindingDefinitionRow003 & { tags?: string[] })[];
  const map = new Map<string, FindingDefinitionRow003>();
  for (const r of rows) {
    map.set(r.finding_id, { ...r, tags: Array.isArray(r.tags) ? r.tags : [] });
  }
  return map;
}

/** Returns effective dimensions from view (override ?? seed) and dimensions_source. */
export async function getEffectiveDimensionsMap(): Promise<
  Map<string, { dimensions: CustomNine; dimensions_source: string; override_version: number | null }>
> {
  const q = getSql();
  const rows = (await q`
    SELECT finding_id, safety, urgency, liability, budget_low, budget_high,
           priority, severity, likelihood, escalation, dimensions_source, override_version
    FROM finding_effective_dimensions
  `) as EffectiveDimensionsRow[];
  const map = new Map();
  for (const r of rows) {
    map.set(r.finding_id, {
      dimensions: {
        safety: r.safety ?? undefined,
        urgency: r.urgency ?? undefined,
        liability: r.liability ?? undefined,
        budget_low: r.budget_low ?? undefined,
        budget_high: r.budget_high ?? undefined,
        priority: r.priority ?? undefined,
        severity: r.severity ?? undefined,
        likelihood: r.likelihood ?? undefined,
        escalation: r.escalation ?? undefined,
      },
      dimensions_source: r.dimensions_source,
      override_version: r.override_version,
    });
  }
  return map;
}

/** Returns override history for one finding (all versions, newest first). */
export async function getOverrideHistory(finding_id: string): Promise<OverrideRow[]> {
  const q = getSql();
  const rows = (await q`
    SELECT id, finding_id, version, active, safety, urgency, liability, budget_low, budget_high,
           priority, severity, likelihood, escalation, note, updated_by, created_at
    FROM finding_custom_dimensions
    WHERE finding_id = ${finding_id}
    ORDER BY version DESC
  `) as OverrideRow[];
  return rows;
}

/** Returns seed row for one finding. */
export async function getSeedDimensions(finding_id: string): Promise<CustomNine | null> {
  const q = getSql();
  const rows = (await q`
    SELECT safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation
    FROM finding_dimensions_seed
    WHERE finding_id = ${finding_id}
  `) as EffectiveDimensionsRow[];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    safety: r.safety ?? undefined,
    urgency: r.urgency ?? undefined,
    liability: r.liability ?? undefined,
    budget_low: r.budget_low ?? undefined,
    budget_high: r.budget_high ?? undefined,
    priority: r.priority ?? undefined,
    severity: r.severity ?? undefined,
    likelihood: r.likelihood ?? undefined,
    escalation: r.escalation ?? undefined,
  };
}

/** Check if 003 schema exists (finding_effective_dimensions view). */
export async function has003Schema(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    const q = getSql();
    await q`SELECT 1 FROM finding_effective_dimensions LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}
