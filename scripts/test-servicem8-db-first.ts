/**
 * Tests for DB-first ServiceM8 prefill flow:
 * - internalServiceJobLink: auth, validation, upsert
 * - servicem8JobPrefill: DB hit returns without calling ServiceM8, DB miss calls ServiceM8 then upserts
 */

import { handler as internalHandler } from "../netlify/functions/internalServiceJobLink";
import { handler as prefillHandler } from "../netlify/functions/servicem8JobPrefill";
import { isDbConfigured, sql } from "../netlify/functions/lib/db";
import { selectJobUuid, upsertJobLink } from "../netlify/functions/lib/dbServiceJobLink";

function makeEvent(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): any {
  return {
    httpMethod: method,
    path,
    body: body ? JSON.stringify(body) : undefined,
    headers,
    queryStringParameters: {},
  };
}

async function testInternalEndpointAuth() {
  console.log("[test] Testing internal endpoint auth...");
  const res = await internalHandler(
    makeEvent("POST", "/api/internal/service-job-link", {
      job_uuid: "test-uuid",
      job_number: "TEST-001",
    }),
    {} as any
  );
  if (res.statusCode !== 401) {
    throw new Error(`Expected 401 UNAUTHORIZED, got ${res.statusCode}`);
  }
  console.log("✅ internal endpoint rejects missing auth");
}

async function testInternalEndpointValidation() {
  if (!isDbConfigured()) {
    console.log("⚠️  Skipping validation test (NEON_DATABASE_URL not configured)");
    return;
  }

  console.log("[test] Testing internal endpoint validation...");
  // Set test key if not configured
  const originalKey = process.env.INTERNAL_API_KEY;
  if (!originalKey) {
    process.env.INTERNAL_API_KEY = "test-key";
  }
  try {
    const key = process.env.INTERNAL_API_KEY;
    const res = await internalHandler(
      makeEvent(
        "POST",
        "/api/internal/service-job-link",
        { job_uuid: "", job_number: "" },
        { "x-internal-api-key": key }
      ),
      {} as any
    );
    if (res.statusCode !== 400) {
      console.error("Response:", res.body);
      throw new Error(`Expected 400 VALIDATION_ERROR, got ${res.statusCode}`);
    }
    console.log("✅ internal endpoint validates required fields");
  } finally {
    if (!originalKey) {
      delete process.env.INTERNAL_API_KEY;
    } else {
      process.env.INTERNAL_API_KEY = originalKey;
    }
  }
}

async function testInternalEndpointUpsert() {
  if (!isDbConfigured()) {
    console.log("⚠️  Skipping DB tests (NEON_DATABASE_URL not configured)");
    return;
  }

  console.log("[test] Testing internal endpoint upsert...");
  // Set test key if not configured
  const originalKey = process.env.INTERNAL_API_KEY;
  if (!originalKey) {
    process.env.INTERNAL_API_KEY = "test-key";
  }
  const key = process.env.INTERNAL_API_KEY;
  const jobNumber = `TEST-${Date.now()}`;
  const jobUuid = `test-uuid-${Date.now()}`;

  const res = await internalHandler(
    makeEvent(
      "POST",
      "/api/internal/service-job-link",
      {
        job_uuid: jobUuid,
        job_number: jobNumber,
        source: "snapshot",
      },
      { "x-internal-api-key": key }
    ),
    {} as any
  );

  if (res.statusCode !== 200) {
    console.error("Response:", res.body);
    throw new Error(`Expected 200, got ${res.statusCode}`);
  }

  const data = JSON.parse(res.body) as { ok?: boolean };
  if (!data.ok) {
    throw new Error("Expected ok: true");
  }

  // Verify DB
  const found = await selectJobUuid(jobNumber);
  if (found !== jobUuid) {
    throw new Error(`Expected job_uuid ${jobUuid}, got ${found}`);
  }

  console.log("✅ internal endpoint upserts successfully");

  // Restore original key
  if (!originalKey) {
    delete process.env.INTERNAL_API_KEY;
  } else {
    process.env.INTERNAL_API_KEY = originalKey;
  }
}

async function testPrefillDbHit() {
  if (!isDbConfigured()) {
    console.log("⚠️  Skipping DB tests (NEON_DATABASE_URL not configured)");
    return;
  }

  console.log("[test] Testing prefill DB hit (should not call ServiceM8)...");
  const jobNumber = `TEST-DB-HIT-${Date.now()}`;
  const jobUuid = `test-uuid-db-hit-${Date.now()}`;

  // Insert mapping + fresh prefill_json
  await upsertJobLink({
    job_number: jobNumber,
    job_uuid: jobUuid,
    source: "test",
  });
  const q = sql();
  await q`
    update service_job_link
    set prefill_json = ${JSON.stringify({
      job: {
        job_uuid: jobUuid,
        job_number: jobNumber,
        customer_name: "Test Customer",
        contact_name: null,
        phone: null,
        email: null,
        address: { line1: null, line2: null, suburb: null, state: null, postcode: null, full_address: null },
      },
    })}::jsonb,
    prefill_fetched_at = now()
    where job_number = ${jobNumber}
  `;

  const secret = process.env.SERVICEM8_PREFILL_SECRET || "test-secret";
  const res = await prefillHandler(
    makeEvent(
      "GET",
      `/api/servicem8/job-prefill?job_number=${jobNumber}`,
      undefined,
      { "x-servicem8-prefill-secret": secret }
    ),
    {} as any
  );

  if (res.statusCode !== 200) {
    console.error("Response:", res.body);
    throw new Error(`Expected 200, got ${res.statusCode}`);
  }

  const data = JSON.parse(res.body) as { ok?: boolean; cache?: { hit?: boolean } };
  if (!data.ok || !data.cache?.hit) {
    throw new Error("Expected ok: true and cache.hit: true");
  }

  console.log("✅ prefill DB hit returns cached data without calling ServiceM8");
}

async function testPrefillDbMiss() {
  if (!isDbConfigured()) {
    console.log("⚠️  Skipping DB tests (NEON_DATABASE_URL not configured)");
    return;
  }

  console.log("[test] Testing prefill DB miss (will call ServiceM8 if configured)...");
  const jobNumber = `TEST-DB-MISS-${Date.now()}`;

  // Ensure no mapping exists
  const q = sql();
  await q`delete from service_job_link where job_number = ${jobNumber}`;

  const secret = process.env.SERVICEM8_PREFILL_SECRET || "test-secret";
  const res = await prefillHandler(
    makeEvent(
      "GET",
      `/api/servicem8/job-prefill?job_number=${jobNumber}`,
      undefined,
      { "x-servicem8-prefill-secret": secret }
    ),
    {} as any
  );

  // If ServiceM8 not configured, expect 503
  // If configured but job not found, expect 404
  // If configured and found, expect 200
  if (res.statusCode === 503) {
    console.log("⚠️  ServiceM8 not configured, skipping DB miss test");
    return;
  }

  if (res.statusCode === 404) {
    console.log("✅ prefill DB miss returns 404 when job not found");
    return;
  }

  if (res.statusCode === 200) {
    const data = JSON.parse(res.body) as { ok?: boolean; job?: { job_uuid?: string } };
    if (data.ok && data.job?.job_uuid) {
      // Verify it was upserted
      const found = await selectJobUuid(jobNumber);
      if (found === data.job.job_uuid) {
        console.log("✅ prefill DB miss calls ServiceM8 and upserts mapping");
        return;
      }
    }
  }

  throw new Error(`Unexpected response: ${res.statusCode}, body: ${res.body}`);
}

async function run() {
  await testInternalEndpointAuth();
  await testInternalEndpointValidation();
  await testInternalEndpointUpsert();
  await testPrefillDbHit();
  await testPrefillDbMiss();
  console.log("\n✅ All DB-first tests passed");
}

run().catch((e) => {
  console.error("❌ Tests failed:", e);
  process.exit(1);
});
