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

type NeonSql = ReturnType<typeof neon>;
let _sql: NeonSql | null = null;

function getSql(): NeonSql {
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
