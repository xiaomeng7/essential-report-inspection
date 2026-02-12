import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { isDbConfigured } from "./lib/db";
import {
  selectJobUuid,
  selectJobLink,
  updatePrefillCache,
  upsertJobLink,
} from "./lib/dbServiceJobLink";
import { fetchJobByUuid, resolveJobNumberToUuid } from "./lib/serviceM8";

const VERSION = "2026-02-03-v3";
const PREFILL_CACHE_TTL_HOURS = 24;

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

// Technician-facing endpoint: no auth required. Internal auth applies only to internalServiceJobLink.

function isPrefillCacheFresh(fetchedAt: string | null): boolean {
  if (!fetchedAt) return false;
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return ageMs <= PREFILL_CACHE_TTL_HOURS * 60 * 60 * 1000;
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  const token = process.env.SERVICEM8_API_TOKEN ?? process.env.SERVICEM8_API_KEY;
  console.log("[servicem8-prefill] VERSION", VERSION, "path", event.path, "apiKey present?", !!token, "apiKey length", token?.length ?? 0);

  if (event.httpMethod !== "GET") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const params = event.queryStringParameters ?? {};
  const jobNumber = (params.job_number ?? "").trim();

  if (!jobNumber || jobNumber.length > 32) {
    return json({ ok: false, error: "INVALID_JOB_NUMBER" }, 400);
  }

  try {
    // Step 1: DB-first lookup: get job_uuid from cache
    let jobUuid: string | null = null;
    let cachedPrefill: unknown | null = null;
    let cachedFetchedAt: string | null = null;

    if (isDbConfigured()) {
      const linkRow = await selectJobLink(jobNumber);
      if (linkRow) {
        jobUuid = linkRow.job_uuid;
        cachedPrefill = linkRow.prefill_json;
        cachedFetchedAt = linkRow.prefill_fetched_at;

        // If we have fresh prefill_json cache, return it immediately
        if (cachedPrefill && isPrefillCacheFresh(cachedFetchedAt)) {
          console.log("[servicem8-prefill] DB cache hit (prefill_json)", {
            job_number: jobNumber,
            job_uuid: jobUuid,
          });
          const job = cachedPrefill as { job?: unknown } | unknown;
          const jobData = (job as { job?: unknown }).job ?? job;
          return json({
            ok: true,
            job: jobData,
            cache: {
              hit: true,
              fetched_at: cachedFetchedAt,
            },
          });
        }
      }
    }

    // Step 2: If no job_uuid in DB, resolve via ServiceM8 API
    if (!jobUuid) {
      console.log("[servicem8-prefill] DB cache miss, resolving job_number -> job_uuid", jobNumber);
      const resolveResult = await resolveJobNumberToUuid(jobNumber);
      if ("error" in resolveResult) {
        if (resolveResult.error.kind === "config_missing") {
          return json(
            {
              ok: false,
              error: "SERVICE_M8_NOT_CONFIGURED",
              message: resolveResult.error.message,
            },
            503
          );
        }
      if (resolveResult.error.kind === "not_found") {
        return json({ ok: false, error: "JOB_NOT_FOUND" }, 404);
      }
      if (resolveResult.error.kind === "service_error" && resolveResult.error.status === 401) {
        return json(
          { ok: false, error: "SERVICEM8_UNAUTHORIZED", upstreamStatus: 401 },
          502
        );
      }
      return json(
        {
          ok: false,
          error: "SERVICEM8_UPSTREAM_ERROR",
          details: resolveResult.error.message,
          upstream_status: resolveResult.error.status,
        },
        502
      );
      }

      jobUuid = resolveResult.job_uuid;
      const resolvedNumber = resolveResult.job_number;

      // Upsert mapping to DB (best-effort)
      try {
        await upsertJobLink({
          job_number: resolvedNumber,
          job_uuid: jobUuid,
          source: "servicem8_api",
        });
        console.log("[servicem8-prefill] upserted job mapping", {
          job_number: resolvedNumber,
          job_uuid: jobUuid,
        });
      } catch (e) {
        console.error("[servicem8-prefill] failed to upsert job mapping", e);
        // Continue - we have job_uuid, can still fetch details
      }
    }

    // Step 3: Fetch job details by UUID (fast, direct API call)
    console.log("[servicem8-prefill] fetching job details by uuid", jobUuid);
    const detailResult = await fetchJobByUuid(jobUuid);
    if ("error" in detailResult) {
      if (detailResult.error.kind === "config_missing") {
        return json(
          {
            ok: false,
            error: "SERVICE_M8_NOT_CONFIGURED",
            message: detailResult.error.message,
          },
          503
        );
      }
      if (detailResult.error.kind === "not_found") {
        return json({ ok: false, error: "JOB_NOT_FOUND" }, 404);
      }
      if (detailResult.error.kind === "service_error" && detailResult.error.status === 401) {
        return json(
          { ok: false, error: "SERVICEM8_UNAUTHORIZED", upstreamStatus: 401 },
          502
        );
      }
      return json(
        {
          ok: false,
          error: "SERVICEM8_UPSTREAM_ERROR",
          details: detailResult.error.message,
          upstream_status: detailResult.error.status,
        },
        502
      );
    }

    const job = detailResult.job;
    const prefillPayload = { job };

    // Step 4: Update prefill_json cache (best-effort)
    try {
      await updatePrefillCache(jobNumber, prefillPayload);
    } catch (e) {
      console.error("[servicem8-prefill] failed to update prefill cache", e);
      // Continue - we have the job data, can still return it
    }

    return json({
      ok: true,
      job,
      cache: {
        hit: cachedPrefill !== null,
        fetched_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("[servicem8-prefill] unexpected error", e);
    const message = e instanceof Error ? e.message : String(e);
    return json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        details: message,
      },
      500
    );
  }
};

