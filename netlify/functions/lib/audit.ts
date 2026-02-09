/**
 * Audit logging for finding messages and dimensions publish/rollback actions.
 * Stores before/after snapshots for rollback capability.
 */

import { sql, isDbConfigured } from "./db";

export type EntityType = "messages" | "dimensions";

export type AuditAction = "publish" | "rollback";

export type AuditLogEntry = {
  entity_type: EntityType;
  finding_id?: string | null;
  lang?: string | null;
  action: AuditAction;
  from_version?: string | null;
  to_version?: string | null;
  actor?: string | null;
  diff_json: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };
};

/**
 * Log a change (publish or rollback) to the audit log.
 */
export async function logChange(entry: AuditLogEntry): Promise<number | null> {
  if (!isDbConfigured()) {
    console.warn("[audit] Database not configured, skipping audit log");
    return null;
  }

  try {
    const q = sql();
    const result = await q`
      INSERT INTO finding_change_log (
        entity_type, finding_id, lang, action, from_version, to_version, actor, diff_json
      )
      VALUES (
        ${entry.entity_type},
        ${entry.finding_id ?? null},
        ${entry.lang ?? null},
        ${entry.action},
        ${entry.from_version ?? null},
        ${entry.to_version ?? null},
        ${entry.actor ?? null},
        ${JSON.stringify(entry.diff_json)}::jsonb
      )
      RETURNING id
    `;
    return result[0]?.id as number | undefined ?? null;
  } catch (e) {
    console.error("[audit] Failed to log change:", e);
    // Don't throw - audit logging failure shouldn't break publish/rollback
    return null;
  }
}

/**
 * Get the last publish log entry for a given version (for rollback).
 */
export async function getLastPublishLog(
  entityType: EntityType,
  toVersion: string,
  findingId?: string | null,
  lang?: string | null
): Promise<AuditLogEntry & { id: number; created_at: Date } | null> {
  if (!isDbConfigured()) {
    return null;
  }

  try {
    const q = sql();
    let query;
    if (findingId && lang) {
      query = q`
        SELECT id, entity_type, finding_id, lang, action, from_version, to_version, actor, created_at, diff_json
        FROM finding_change_log
        WHERE entity_type = ${entityType}
          AND to_version = ${toVersion}
          AND action = 'publish'
          AND finding_id = ${findingId}
          AND lang = ${lang}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    } else if (findingId) {
      query = q`
        SELECT id, entity_type, finding_id, lang, action, from_version, to_version, actor, created_at, diff_json
        FROM finding_change_log
        WHERE entity_type = ${entityType}
          AND to_version = ${toVersion}
          AND action = 'publish'
          AND finding_id = ${findingId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
    } else {
      query = q`
        SELECT id, entity_type, finding_id, lang, action, from_version, to_version, actor, created_at, diff_json
        FROM finding_change_log
        WHERE entity_type = ${entityType}
          AND to_version = ${toVersion}
          AND action = 'publish'
        ORDER BY created_at DESC
        LIMIT 1
      `;
    }

    const rows = await query;
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0] as {
      id: number;
      entity_type: EntityType;
      finding_id: string | null;
      lang: string | null;
      action: AuditAction;
      from_version: string | null;
      to_version: string | null;
      actor: string | null;
      created_at: Date;
      diff_json: unknown;
    };

    return {
      id: row.id,
      entity_type: row.entity_type,
      finding_id: row.finding_id,
      lang: row.lang,
      action: row.action,
      from_version: row.from_version,
      to_version: row.to_version,
      actor: row.actor,
      created_at: row.created_at,
      diff_json: row.diff_json as { before: Record<string, unknown> | null; after: Record<string, unknown> | null },
    };
  } catch (e) {
    console.error("[audit] Failed to get publish log:", e);
    return null;
  }
}

/**
 * Get all publish log entries for a finding (for history).
 */
export async function getPublishHistory(
  entityType: EntityType,
  findingId: string,
  lang?: string | null
): Promise<Array<AuditLogEntry & { id: number; created_at: Date }>> {
  if (!isDbConfigured()) {
    return [];
  }

  try {
    const q = sql();
    let query;
    if (lang) {
      query = q`
        SELECT id, entity_type, finding_id, lang, action, from_version, to_version, actor, created_at, diff_json
        FROM finding_change_log
        WHERE entity_type = ${entityType}
          AND finding_id = ${findingId}
          AND lang = ${lang}
        ORDER BY created_at DESC
      `;
    } else {
      query = q`
        SELECT id, entity_type, finding_id, lang, action, from_version, to_version, actor, created_at, diff_json
        FROM finding_change_log
        WHERE entity_type = ${entityType}
          AND finding_id = ${findingId}
        ORDER BY created_at DESC
      `;
    }

    const rows = await query;
    return rows.map((row: {
      id: number;
      entity_type: EntityType;
      finding_id: string | null;
      lang: string | null;
      action: AuditAction;
      from_version: string | null;
      to_version: string | null;
      actor: string | null;
      created_at: Date;
      diff_json: unknown;
    }) => ({
      id: row.id,
      entity_type: row.entity_type,
      finding_id: row.finding_id,
      lang: row.lang,
      action: row.action,
      from_version: row.from_version,
      to_version: row.to_version,
      actor: row.actor,
      created_at: row.created_at,
      diff_json: row.diff_json as { before: Record<string, unknown> | null; after: Record<string, unknown> | null },
    }));
  } catch (e) {
    console.error("[audit] Failed to get publish history:", e);
    return [];
  }
}
