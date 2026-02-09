/**
 * Thin DB access layer for Neon Postgres.
 * Uses NEON_DATABASE_URL. Works in local dev (netlify dev) and prod.
 *
 * Data flow (high level):
 *   [Submit]     -> Blobs (raw JSON, report docx) + DB (inspections, inspection_findings, report_docx_key)
 *   [SaveCustom] -> Blobs (inspection + custom_findings_completed) + DB (inspection_findings for custom)
 *   [Admin UI]   -> DB (finding_definitions, finding_custom_dimensions versions, dimension_presets)
 *   [Report gen]-> Reads Blobs as today; customDimensionsToFindingDimensions() unchanged (Custom 9 -> D1-D9)
 * Blobs remain source for: raw inspection JSON, photos, generated DOCX. DB stores refs + structured metadata.
 */

import { neon } from "@neondatabase/serverless";
import type { CustomNine } from "./dbTypes";
import type { FindingDefinitionRow } from "./dbTypes";

type NeonSql = ReturnType<typeof neon>;
let _sql: NeonSql | null = null;

export function getSql(): NeonSql {
  if (_sql) return _sql;
  const url = process.env.NEON_DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    throw new Error("NEON_DATABASE_URL is not set or invalid (expected postgres://...)");
  }
  _sql = neon(url);
  return _sql;
}

/** Use only when DB is configured; returns null if NEON_DATABASE_URL missing (no throw). */
export function getDb(): NeonSql | null {
  const url = process.env.NEON_DATABASE_URL;
  if (!url || !url.startsWith("postgres")) return null;
  return getSql();
}

/** Run query; throws if DB not configured. Use in handlers that require DB. */
export function sql(): NeonSql {
  return getSql();
}

export function isDbConfigured(): boolean {
  const url = process.env.NEON_DATABASE_URL;
  return !!url && url.startsWith("postgres");
}

/** Row shape returned by Neon for finding_custom_dimensions (id can be number in DB). */
type DimRow = {
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
  [key: string]: unknown;
};

/** Returns Map<finding_id, CustomNine> for rows where is_active = true (one per finding_id). */
export async function getActiveDimensionsMap(): Promise<Map<string, CustomNine>> {
  const q = getSql();
  const rows = (await q`
    SELECT finding_id, safety, urgency, liability, budget_low, budget_high,
           priority, severity, likelihood, escalation
    FROM finding_custom_dimensions
    WHERE is_active = true
  `) as DimRow[];
  const map = new Map<string, CustomNine>();
  for (const r of rows) {
    map.set(r.finding_id, {
      safety: r.safety ?? undefined,
      urgency: r.urgency ?? undefined,
      liability: r.liability ?? undefined,
      budget_low: r.budget_low ?? undefined,
      budget_high: r.budget_high ?? undefined,
      priority: r.priority ?? undefined,
      severity: r.severity ?? undefined,
      likelihood: r.likelihood ?? undefined,
      escalation: r.escalation ?? undefined,
    });
  }
  return map;
}

/** Meta for active dimension row (version, updated_by) to derive dimensions_source. */
export type DimensionsMeta = { version: number; updated_by: string | null };

/** Returns Map<finding_id, DimensionsMeta> for active rows in finding_custom_dimensions. */
export async function getActiveDimensionsMetaMap(): Promise<Map<string, DimensionsMeta>> {
  const q = getSql();
  const rows = (await q`
    SELECT finding_id, version, updated_by
    FROM finding_custom_dimensions
    WHERE is_active = true
  `) as { finding_id: string; version: number; updated_by: string | null }[];
  const map = new Map<string, DimensionsMeta>();
  for (const r of rows) {
    map.set(r.finding_id, { version: r.version, updated_by: r.updated_by });
  }
  return map;
}

/** Returns Map<finding_id, FindingDefinitionRow> for is_active = true definitions. */
export async function getDefinitionsMap(): Promise<Map<string, FindingDefinitionRow>> {
  const q = getSql();
  const rows = (await q`
    SELECT finding_id, title_en, title_zh, why_it_matters_en, why_it_matters_zh,
           recommended_action_en, recommended_action_zh, planning_guidance_en, planning_guidance_zh,
           system_group, space_group, tags, is_active, created_at, updated_at
    FROM finding_definitions
    WHERE is_active = true
  `) as (FindingDefinitionRow & { tags?: string[] })[];
  const map = new Map<string, FindingDefinitionRow>();
  for (const r of rows) {
    map.set(r.finding_id, {
      ...r,
      tags: Array.isArray(r.tags) ? r.tags : [],
    });
  }
  return map;
}
