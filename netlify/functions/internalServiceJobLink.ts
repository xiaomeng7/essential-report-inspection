/**
 * Internal endpoint for Snapshot repo to push job mappings.
 * POST /.netlify/functions/internalServiceJobLink
 * Auth: x-internal-api-key header must match INTERNAL_API_KEY env var.
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { upsertJobLink } from "./lib/dbServiceJobLink";
import { isDbConfigured } from "./lib/db";

const VERSION = "2026-02-03-v2";

function json(body: unknown, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function checkAuth(event: HandlerEvent): boolean {
  const header =
    event.headers["x-internal-api-key"] ?? event.headers["X-Internal-Api-Key"];
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    console.error("[internal-service-job-link] INTERNAL_API_KEY not configured");
    return false;
  }
  return header === expected;
}

export const handler: Handler = async (
  event: HandlerEvent,
  _ctx: HandlerContext
) => {
  console.log("[internal-service-job-link] VERSION", VERSION, "path", event.path);

  if (event.httpMethod !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  if (!checkAuth(event)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  if (!isDbConfigured()) {
    return json(
      { ok: false, error: "DATABASE_NOT_CONFIGURED" },
      503
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch (e) {
    return json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        message: "Invalid JSON body",
      },
      400
    );
  }

  const payload = body as {
    job_uuid?: unknown;
    job_number?: unknown;
    source?: unknown;
    snapshot_ref?: unknown;
  };

  const jobUuid = typeof payload.job_uuid === "string" ? payload.job_uuid.trim() : "";
  const jobNumber = typeof payload.job_number === "string" ? payload.job_number.trim() : "";

  if (!jobUuid || !jobNumber) {
    return json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        message: "job_uuid and job_number are required non-empty strings",
      },
      400
    );
  }

  if (jobUuid.length > 100 || jobNumber.length > 100) {
    return json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        message: "job_uuid and job_number must be <= 100 characters",
      },
      400
    );
  }

  try {
    await upsertJobLink({
      job_number: jobNumber,
      job_uuid: jobUuid,
      source: typeof payload.source === "string" ? payload.source : null,
      snapshot_ref: typeof payload.snapshot_ref === "string" ? payload.snapshot_ref : null,
    });

    console.log("[internal-service-job-link] upserted", {
      job_number: jobNumber,
      job_uuid: jobUuid,
      source: payload.source ?? null,
    });

    return json({ ok: true });
  } catch (e) {
    console.error("[internal-service-job-link] upsert failed", e);
    return json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: e instanceof Error ? e.message : String(e),
      },
      500
    );
  }
};
