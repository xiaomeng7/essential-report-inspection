/**
 * DB-first, YAML-fallback loader for finding messages.
 * - Respects DATA_SOURCE_MODE env var (db_only, db_prefer, yml_only).
 * - Tries finding_messages table first (if DB configured and mode allows).
 * - Falls back to responses.yml if mode allows and DB not available or record not found.
 * - Normalizes DB result to match responses.yml message shape.
 * - In-memory cache with TTL ~60s.
 */

import { isDbConfigured, sql } from "./db";
import { loadResponses } from "../generateWordReport";
import { getDataSourceMode, isDbOnly, isYmlOnly, allowsDb, allowsYaml } from "./dataSourceMode";

type FindingMessage = {
  title?: string;
  observed_condition?: string[];
  why_it_matters?: string;
  recommended_action?: string;
  planning_guidance?: string;
  priority_rationale?: string;
  risk_interpretation?: string;
  disclaimer_line?: string;
};

type CacheEntry = {
  message: FindingMessage;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000; // 60 seconds
const cache = new Map<string, CacheEntry>();
const dbErrorLogged = new Set<string>(); // Track logged DB errors per (findingId|lang) to avoid spam

/**
 * Get finding message: DB-first, YAML-fallback.
 * Returns normalized message object matching responses.yml shape.
 */
export async function getFindingMessage(findingId: string, lang = "en-AU"): Promise<FindingMessage | null> {
  const cacheKey = `${findingId}|${lang}`;
  const mode = getDataSourceMode();
  const isDev = process.env.NODE_ENV !== "production" || process.env.NETLIFY_DEV === "true";
  const previewDraft = process.env.PREVIEW_DRAFT_MESSAGES === "true" || process.env.PREVIEW_DRAFT_MESSAGES === "1";

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.message;
  }

  let message: FindingMessage | null = null;
  let source: "db" | "yaml" | null = null;
  let statusUsed: "draft" | "published" | null = null;

  // Try DB if mode allows
  if (allowsDb() && isDbConfigured() && !isYmlOnly()) {
    try {
      const q = sql();
      
      // Determine which status to read:
      // - Production/db_only: ONLY 'published'
      // - Dev/db_prefer with PREVIEW_DRAFT_MESSAGES=true: try 'draft' first, then 'published'
      // - Dev/db_prefer default: ONLY 'published'
      const isProduction = process.env.CONTEXT === "production" || process.env.NODE_ENV === "production";
      const shouldPreviewDraft = !isProduction && previewDraft && !isDbOnly();
      
      let rows: Array<{
        title: string | null;
        observed_condition: unknown;
        why_it_matters: string | null;
        recommended_action: string | null;
        planning_guidance: string | null;
        priority_rationale: string | null;
        risk_interpretation: string | null;
        disclaimer_line: string | null;
        status: string;
      }> = [];
      
      if (shouldPreviewDraft) {
        // Try draft first, then published
        const draftRows = await q`
          SELECT title, observed_condition, why_it_matters, recommended_action,
                 planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, status
          FROM finding_messages
          WHERE finding_id = ${findingId} AND lang = ${lang} AND status = 'draft' AND is_active = true
          LIMIT 1
        `;
        if (draftRows.length > 0) {
          rows = draftRows;
          statusUsed = "draft";
        } else {
          // Fallback to published
          const publishedRows = await q`
            SELECT title, observed_condition, why_it_matters, recommended_action,
                   planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, status
            FROM finding_messages
            WHERE finding_id = ${findingId} AND lang = ${lang} AND status = 'published' AND is_active = true
            LIMIT 1
          `;
          rows = publishedRows;
          statusUsed = "published";
        }
      } else {
        // Production/db_only or dev default: ONLY published
        rows = await q`
          SELECT title, observed_condition, why_it_matters, recommended_action,
                 planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, status
          FROM finding_messages
          WHERE finding_id = ${findingId} AND lang = ${lang} AND status = 'published' AND is_active = true
          LIMIT 1
        `;
        statusUsed = "published";
      }

      if (rows.length > 0) {
        source = "db";
        const row = rows[0];

        // Normalize observed_condition: JSONB -> array
        let observed_condition: string[] = [];
        if (row.observed_condition != null) {
          if (Array.isArray(row.observed_condition)) {
            observed_condition = row.observed_condition.map((v) => String(v));
          } else if (typeof row.observed_condition === "string") {
            try {
              const parsed = JSON.parse(row.observed_condition);
              observed_condition = Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
            } catch {
              observed_condition = [];
            }
          }
        }

        message = {
          title: row.title ?? undefined,
          observed_condition: observed_condition.length > 0 ? observed_condition : undefined,
          why_it_matters: row.why_it_matters ?? undefined,
          recommended_action: row.recommended_action ?? undefined,
          planning_guidance: row.planning_guidance ?? undefined,
          priority_rationale: row.priority_rationale ?? undefined,
          risk_interpretation: row.risk_interpretation ?? undefined,
          disclaimer_line: row.disclaimer_line ?? undefined,
        };
      }
    } catch (e) {
      // In db_only mode, DB errors must throw
      if (isDbOnly()) {
        const errorMsg = `[getFindingMessage] db_only mode: DB query failed for ${findingId}/${lang}: ${e instanceof Error ? e.message : String(e)}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      // Log DB error once per (findingId|lang) to avoid spam (db_prefer mode)
      const errorKey = `${findingId}|${lang}`;
      if (!dbErrorLogged.has(errorKey)) {
        console.warn(`[getFindingMessage] DB query failed for ${findingId}/${lang}, falling back to YAML:`, e instanceof Error ? e.message : String(e));
        dbErrorLogged.add(errorKey);
      }
    }
  }

  // Fallback to YAML if mode allows and DB didn't return a message
  if (!message && allowsYaml() && !isDbOnly()) {
    try {
      const responses = await loadResponses();
      const yamlMessage = responses.findings?.[findingId] as FindingMessage | undefined;
      if (yamlMessage) {
        message = yamlMessage;
        source = "yaml";
      }
    } catch (e) {
      if (isDbOnly()) {
        // Should not reach here in db_only mode, but defensive check
        const errorMsg = `[getFindingMessage] db_only mode: YAML fallback attempted but not allowed for ${findingId}/${lang}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      console.warn(`[getFindingMessage] Failed to load from YAML for ${findingId}:`, e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  // In db_only mode, missing data must throw
  if (isDbOnly() && !message) {
    const errorMsg = `[getFindingMessage] db_only mode: No message found in DB for finding_id=${findingId}, lang=${lang}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Log: show mode, lang, source, status (always log in dev, log in production for db_only errors)
  if (isDev || (isDbOnly() && !message)) {
    const draftPreview = previewDraft && !isDbOnly() ? " preview_draft=true" : "";
    const statusInfo = statusUsed ? ` status=${statusUsed}` : "";
    console.log(`[getFindingMessage] mode=${mode} lang=${lang} finding_id=${findingId} source=${source || "none"}${statusInfo}${draftPreview}${!message ? " (missing)" : ""}`);
  }

  // Cache result (even if null, to avoid repeated DB/YAML lookups)
  if (message) {
    cache.set(cacheKey, {
      message,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  return message;
}

/**
 * Batch load messages for multiple findings (for report generation).
 * Returns a map matching responses.yml shape: { [findingId]: message }
 * Includes debug logs showing source ('db' or 'yaml') per finding_id.
 */
export async function getFindingMessagesBatch(
  findingIds: string[],
  lang = "en-AU"
): Promise<Record<string, FindingMessage>> {
  const result: Record<string, FindingMessage> = {};
  const mode = getDataSourceMode();
  const isDev = process.env.NODE_ENV !== "production" || process.env.NETLIFY_DEV === "true";
  const previewDraft = process.env.PREVIEW_DRAFT_MESSAGES === "true" || process.env.PREVIEW_DRAFT_MESSAGES === "1";

  // Try DB if mode allows
  if (allowsDb() && isDbConfigured() && !isYmlOnly()) {
    try {
      const q = sql();
      
      // Determine which status to read:
      // - Production/db_only: ONLY 'published'
      // - Dev/db_prefer with PREVIEW_DRAFT_MESSAGES=true: prefer 'draft', fallback to 'published'
      // - Dev/db_prefer default: ONLY 'published'
      const isProduction = process.env.CONTEXT === "production" || process.env.NODE_ENV === "production";
      const shouldPreviewDraft = !isProduction && previewDraft && !isDbOnly();
      
      let rows: Array<{
        finding_id: string;
        title: string | null;
        observed_condition: unknown;
        why_it_matters: string | null;
        recommended_action: string | null;
        planning_guidance: string | null;
        priority_rationale: string | null;
        risk_interpretation: string | null;
        disclaimer_line: string | null;
        status: string;
      }> = [];
      
      if (shouldPreviewDraft) {
        // Get draft messages, then fill gaps with published (single query using DISTINCT ON)
        rows = await q`
          SELECT DISTINCT ON (finding_id)
            finding_id, title, observed_condition, why_it_matters, recommended_action,
            planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, status
          FROM finding_messages
          WHERE finding_id = ANY(${findingIds}) 
            AND lang = ${lang} 
            AND status IN ('draft', 'published')
            AND is_active = true
          ORDER BY finding_id, CASE WHEN status = 'draft' THEN 0 ELSE 1 END
        `;
      } else {
        // Production/db_only or dev default: ONLY published
        rows = await q`
          SELECT finding_id, title, observed_condition, why_it_matters, recommended_action,
                 planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, status
          FROM finding_messages
          WHERE finding_id = ANY(${findingIds}) 
            AND lang = ${lang} 
            AND status = 'published' 
            AND is_active = true
        `;
      }

      const dbFound = new Set<string>();
      for (const row of rows) {
        const findingId = row.finding_id;
        dbFound.add(findingId);

        // Normalize observed_condition: JSONB -> array
        let observed_condition: string[] = [];
        if (row.observed_condition != null) {
          if (Array.isArray(row.observed_condition)) {
            observed_condition = row.observed_condition.map((v) => String(v));
          } else if (typeof row.observed_condition === "string") {
            try {
              const parsed = JSON.parse(row.observed_condition);
              observed_condition = Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
            } catch {
              observed_condition = [];
            }
          }
        }

        result[findingId] = {
          title: row.title ?? undefined,
          observed_condition: observed_condition.length > 0 ? observed_condition : undefined,
          why_it_matters: row.why_it_matters ?? undefined,
          recommended_action: row.recommended_action ?? undefined,
          planning_guidance: row.planning_guidance ?? undefined,
          priority_rationale: row.priority_rationale ?? undefined,
          risk_interpretation: row.risk_interpretation ?? undefined,
          disclaimer_line: row.disclaimer_line ?? undefined,
        };

        if (isDev) {
          const statusInfo = row.status ? ` status=${row.status}` : "";
          const draftPreview = previewDraft && !isDbOnly() ? " preview_draft=true" : "";
          console.log(`[getFindingMessage] mode=${mode} lang=${lang} finding_id=${findingId} source=db${statusInfo}${draftPreview}`);
        }
      }

      // Check for missing findings
      const missingIds = findingIds.filter((id) => !dbFound.has(id));
      if (missingIds.length > 0) {
        if (isDbOnly()) {
          // In db_only mode, missing data must throw
          const errorMsg = `[getFindingMessage] db_only mode: Missing messages in DB for finding_ids=[${missingIds.join(", ")}], lang=${lang}`;
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
        // In db_prefer mode, log missing ones (will fallback to YAML)
        if (isDev) {
          console.log(`[getFindingMessage] mode=${mode} lang=${lang} missing_in_db=[${missingIds.join(", ")}] (will fallback to YAML)`);
        }
      }
    } catch (e) {
      // In db_only mode, DB errors must throw
      if (isDbOnly()) {
        const errorMsg = `[getFindingMessage] db_only mode: Batch DB query failed: ${e instanceof Error ? e.message : String(e)}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      // Log DB error once (db_prefer mode)
      const errorKey = `batch-db-error`;
      if (!dbErrorLogged.has(errorKey)) {
        console.warn(`[getFindingMessage] Batch DB query failed, falling back to YAML:`, e instanceof Error ? e.message : String(e));
        dbErrorLogged.add(errorKey);
      }
    }
  }

  // Fallback to YAML for missing findings if mode allows
  const missingIds = findingIds.filter((id) => !result[id]);
  if (missingIds.length > 0 && allowsYaml() && !isDbOnly()) {
    try {
      const responses = await loadResponses();
      for (const findingId of missingIds) {
        const yamlMessage = responses.findings?.[findingId] as FindingMessage | undefined;
        if (yamlMessage) {
          result[findingId] = yamlMessage;
          if (isDev) {
            console.log(`[getFindingMessage] mode=${mode} lang=${lang} finding_id=${findingId} source=yaml`);
          }
        }
      }
    } catch (e) {
      if (isDbOnly()) {
        // Should not reach here in db_only mode, but defensive check
        const errorMsg = `[getFindingMessage] db_only mode: YAML fallback attempted but not allowed`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      console.warn(`[getFindingMessage] Failed to load YAML fallback:`, e instanceof Error ? e.message : String(e));
    }
  }

  // In db_only mode, check if any findings are still missing
  const stillMissing = findingIds.filter((id) => !result[id]);
  if (isDbOnly() && stillMissing.length > 0) {
    const errorMsg = `[getFindingMessage] db_only mode: Missing messages in DB for finding_ids=[${stillMissing.join(", ")}], lang=${lang}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Log summary in dev mode
  if (isDev) {
    const draftPreview = previewDraft && !isDbOnly() ? " preview_draft=true" : "";
    console.log(`[getFindingMessage] mode=${mode} lang=${lang} batch_size=${findingIds.length} found=${Object.keys(result).length} missing=${stillMissing.length}${draftPreview}`);
  }

  return result;
}
