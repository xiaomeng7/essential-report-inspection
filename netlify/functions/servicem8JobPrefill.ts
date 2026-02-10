import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { sql, isDbConfigured } from "./lib/db";
import { fetchJobByNumber } from "./lib/serviceM8";

const VERSION = "2026-02-03-v1";
const CACHE_TTL_HOURS = 24;

function json(body: unknown, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

function checkAuth(event: HandlerEvent): boolean {
  const header = event.headers["x-servicem8-prefill-secret"] ?? event.headers["X-Servicem8-Prefill-Secret"];
  const expected = process.env.SERVICEM8_PREFILL_SECRET;
  if (!expected) {
    // If not configured, allow all (for early dev); production should set secret.
    return true;
  }
  return header === expected;
}

type CacheRow = {
  id: number;
  job_uuid: string;
  job_number: string;
  job_cache: unknown;
  fetched_at: string;
};

async function getFreshCache(jobNumber: string): Promise<CacheRow | null> {
  if (!isDbConfigured()) return null;
  const q = sql();
  const rows = (await q`
    select id, job_uuid, job_number, job_cache, fetched_at
    from service_job_link
    where job_number = ${jobNumber}
    order by fetched_at desc
    limit 1
  `) as CacheRow[];
  if (!rows.length) return null;
  const row = rows[0];
  const fetchedAt = new Date(row.fetched_at).getTime();
  const ageMs = Date.now() - fetchedAt;
  if (ageMs > CACHE_TTL_HOURS * 60 * 60 * 1000) {
    return null;
  }
  return row;
}

async function upsertCache(jobNumber: string, jobUuid: string, payload: unknown): Promise<void> {
  if (!isDbConfigured()) return;
  const q = sql();
  await q`
    insert into service_job_link (inspection_id, job_uuid, job_number, job_cache, fetched_at)
    values (null, ${jobUuid}, ${jobNumber}, ${JSON.stringify(payload)}::jsonb, now())
  `;
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  console.log("[servicem8-prefill] VERSION", VERSION, "path", event.path);

  if (event.httpMethod !== "GET") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (!checkAuth(event)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  const params = event.queryStringParameters ?? {};
  const jobNumber = (params.job_number ?? "").trim();

  if (!jobNumber || jobNumber.length > 32) {
    return json({ ok: false, error: "INVALID_JOB_NUMBER" }, 400);
  }

  try {
    // 1. Try DB cache
    const cacheRow = await getFreshCache(jobNumber);
    if (cacheRow) {
      console.log("[servicem8-prefill] cache hit job_number", jobNumber);
      const cached = cacheRow.job_cache as {
        job: unknown;
      };
      const job = (cached as any).job ?? cached;
      return json({
        ok: true,
        job,
        cache: {
          hit: true,
          fetched_at: cacheRow.fetched_at,
        },
      });
    }

    // 2. Call ServiceM8
    const result = await fetchJobByNumber(jobNumber);
    if ("error" in result) {
      if (result.error.kind === "config_missing") {
        return json({ ok: false, error: "SERVICE_M8_NOT_CONFIGURED", message: result.error.message }, 503);
      }
      if (result.error.kind === "not_found") {
        return json({ ok: false, error: "JOB_NOT_FOUND" }, 404);
      }
      return json(
        {
          ok: false,
          error: "SERVICE_M8_ERROR",
          details: result.error.message,
        },
        502
      );
    }

    const payload = {
      job: result.job,
    };

    // 3. Upsert cache (best-effort)
    try {
      await upsertCache(result.job.job_number, result.job.job_uuid, payload);
    } catch (e) {
      console.error("[servicem8-prefill] cache upsert failed", e);
    }

    return json({
      ok: true,
      job: result.job,
      cache: {
        hit: false,
        fetched_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[servicem8-prefill] unexpected error", e);
    return json(
      {
        ok: false,
        error: "SERVICE_M8_ERROR",
        details: e instanceof Error ? e.message : String(e),
      },
      502
    );
  }
};

