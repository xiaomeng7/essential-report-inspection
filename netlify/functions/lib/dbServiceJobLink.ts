/**
 * DB helpers for service_job_link table (DB-first job_number -> job_uuid mapping).
 */

import { sql, isDbConfigured } from "./db";

export type ServiceJobLinkRow = {
  job_number: string;
  job_uuid: string;
  source: string | null;
  snapshot_ref: string | null;
  prefill_json: unknown | null;
  prefill_fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Get job_uuid by job_number (fast DB lookup).
 * Returns null if not found.
 */
export async function selectJobUuid(jobNumber: string): Promise<string | null> {
  if (!isDbConfigured()) return null;
  const q = sql();
  const rows = (await q`
    select job_uuid
    from service_job_link
    where job_number = ${jobNumber.trim()}
    limit 1
  `) as { job_uuid: string }[];
  return rows.length > 0 ? rows[0].job_uuid : null;
}

/**
 * Upsert service_job_link row (by job_number).
 * Updates job_uuid if changed, sets source and updated_at.
 */
export async function upsertJobLink(params: {
  job_number: string;
  job_uuid: string;
  source?: string | null;
  snapshot_ref?: string | null;
}): Promise<void> {
  if (!isDbConfigured()) return;
  const q = sql();
  await q`
    insert into service_job_link (
      job_number, job_uuid, source, snapshot_ref, created_at, updated_at
    )
    values (
      ${params.job_number.trim()},
      ${params.job_uuid.trim()},
      ${params.source ?? null},
      ${params.snapshot_ref ?? null},
      now(),
      now()
    )
    on conflict (job_number) do update set
      job_uuid = excluded.job_uuid,
      source = coalesce(excluded.source, service_job_link.source),
      snapshot_ref = coalesce(excluded.snapshot_ref, service_job_link.snapshot_ref),
      updated_at = now()
  `;
}

/**
 * Update prefill_json and prefill_fetched_at for a job_number.
 */
export async function updatePrefillCache(
  jobNumber: string,
  prefillJson: unknown
): Promise<void> {
  if (!isDbConfigured()) return;
  const q = sql();
  await q`
    update service_job_link
    set
      prefill_json = ${JSON.stringify(prefillJson)}::jsonb,
      prefill_fetched_at = now(),
      updated_at = now()
    where job_number = ${jobNumber.trim()}
  `;
}

/**
 * Get full row by job_number (for cache hit with prefill_json).
 */
export async function selectJobLink(jobNumber: string): Promise<ServiceJobLinkRow | null> {
  if (!isDbConfigured()) return null;
  const q = sql();
  const rows = (await q`
    select
      job_number, job_uuid, source, snapshot_ref,
      prefill_json, prefill_fetched_at,
      created_at, updated_at
    from service_job_link
    where job_number = ${jobNumber.trim()}
    limit 1
  `) as ServiceJobLinkRow[];
  return rows.length > 0 ? rows[0] : null;
}
