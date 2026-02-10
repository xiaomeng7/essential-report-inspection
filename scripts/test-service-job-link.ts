/**
 * Basic integration test for linking ServiceM8 job cache (service_job_link)
 * to inspections on submitInspection.
 *
 * Behavior:
 * - If NEON_DATABASE_URL is not configured, test is skipped gracefully.
 * - Otherwise:
 *   - Inserts a dummy service_job_link row with job_number = 'TEST-JOB-001' and inspection_id = null.
 *   - Calls submitInspection handler with payload containing job.serviceM8_job_number = 'TEST-JOB-001'.
 *   - Asserts that the row's inspection_id is populated afterwards.
 */

import { handler as submitHandler } from "../netlify/functions/submitInspection";
import { isDbConfigured, sql } from "../netlify/functions/lib/db";

async function run() {
  if (!isDbConfigured()) {
    console.log("⚠️  NEON_DATABASE_URL 未配置，跳过 service_job_link 集成测试。");
    return;
  }

  const q = sql();
  const jobNumber = "TEST-JOB-001";

  // 1. Insert dummy cache row
  const insertRows = await q`
    insert into service_job_link (inspection_id, job_uuid, job_number, job_cache, fetched_at)
    values (null, 'test-uuid', ${jobNumber}, '{}'::jsonb, now())
    returning id
  `;
  const rowId = insertRows[0]?.id as number | undefined;
  if (!rowId) {
    throw new Error("Failed to insert into service_job_link for test");
  }

  // 2. Call submitInspection with minimal viable payload
  const nowIso = new Date().toISOString();
  const payload = {
    created_at: nowIso,
    job: {
      serviceM8_job_number: {
        value: jobNumber,
        status: "answered",
      },
      address: {
        value: "123 Test St, Testville",
        status: "answered",
      },
      address_place_id: {
        value: "ChIJTEST_PLACE_ID",
        status: "answered",
      },
      address_components: {
        value: {
          suburb: "Testville",
          state: "TS",
          postcode: "9999",
        },
        status: "answered",
      },
    },
    signoff: {
      technician_name: {
        value: "Test Technician",
        status: "answered",
      },
    },
    gpo_tests: {
      rooms: {
        value: [],
        status: "answered",
      },
    },
    lighting: {
      rooms: {
        value: [],
        status: "answered",
      },
    },
  };

  const event = {
    httpMethod: "POST",
    body: JSON.stringify(payload),
  } as any;

  const res = await submitHandler(event, {} as any);
  console.log("[test-service-job-link] submitInspection status:", res.statusCode);
  if (res.statusCode !== 200) {
    console.error("Response body:", res.body);
    throw new Error("submitInspection failed in test");
  }

  const data = JSON.parse(res.body) as { inspection_id: string };
  const inspectionId = data.inspection_id;

  // 3. Assert link
  const rows = await q`
    select inspection_id, job_number
    from service_job_link
    where id = ${rowId}
  `;
  const linked = rows[0] as { inspection_id: string | null; job_number: string } | undefined;
  console.log("[test-service-job-link] linked row:", linked);
  if (!linked || !linked.inspection_id) {
    throw new Error("Expected service_job_link.inspection_id to be populated after submitInspection");
  }
  if (linked.job_number !== jobNumber) {
    throw new Error("job_number mismatch on linked row");
  }

  console.log("✅ service_job_link successfully linked to inspection:", linked.inspection_id);
}

run().catch((e) => {
  console.error("❌ test-service-job-link failed:", e);
  process.exit(1);
});

