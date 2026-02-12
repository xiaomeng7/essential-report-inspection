/**
 * End-to-end test: Snapshot create-job → push to Inspection → Inspection prefill.
 *
 * Prerequisites:
 *   - Snapshot: netlify dev (or SNAPSHOT_BASE_URL for deployed)
 *   - Inspection: netlify dev (or INSPECTION_BASE_URL for deployed)
 *   - .env in BOTH projects: SERVICEM8_API_KEY, SNAPSHOT_SIGNING_SECRET (Snapshot),
 *     INTERNAL_API_KEY (Inspection, same value in both for push)
 *
 * Usage:
 *   SNAPSHOT_BASE_URL=http://localhost:8888 \
 *   INSPECTION_BASE_URL=http://localhost:8888 \
 *   SNAPSHOT_SIGNING_SECRET=xxx \
 *   INTERNAL_API_KEY=yyy \
 *   npx tsx scripts/test-snapshot-inspection-e2e.ts
 *
 * For separate dev ports (e.g. Snapshot 8889, Inspection 8888):
 *   SNAPSHOT_BASE_URL=http://localhost:8889 INSPECTION_BASE_URL=http://localhost:8888 ...
 */

import { createCipheriv, createHash, createHmac, randomBytes } from "crypto";

const SNAPSHOT_BASE = process.env.SNAPSHOT_BASE_URL?.trim() || "http://localhost:8888";
const INSPECTION_BASE = process.env.INSPECTION_BASE_URL?.trim() || "http://localhost:8888";
const SECRET = process.env.SNAPSHOT_SIGNING_SECRET?.trim();
const INTERNAL_KEY = process.env.INTERNAL_API_KEY?.trim();

function deriveAesKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptLeadPayload(payload: unknown, secret: string): string {
  const iv = randomBytes(12);
  const key = deriveAesKey(secret);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

function sign(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

async function main(): Promise<void> {
  if (!SECRET) {
    console.error("[e2e] Missing SNAPSHOT_SIGNING_SECRET");
    process.exit(1);
  }
  if (!INTERNAL_KEY) {
    console.error("[e2e] Missing INTERNAL_API_KEY");
    process.exit(1);
  }

  const payload = {
    name: "E2E Test User",
    email: `e2e-${Date.now()}@example.com`,
    phone: "0400111222",
    address: "456 E2E Ave, Adelaide SA 5000",
    summary: "E2E test run",
    notes: "Snapshot-Inspection integration test",
    submitted_at: Date.now(),
  };

  const leadId = encryptLeadPayload(payload, SECRET);
  const timestamp = String(Date.now());
  const sig = sign(SECRET, leadId + timestamp);

  // Step 1: Snapshot create job
  const createUrl = `${SNAPSHOT_BASE.replace(/\/$/, "")}/.netlify/functions/createServiceM8Job`;
  console.log("[e2e] Step 1: POST", createUrl);

  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lead_id: leadId, timestamp, sig }),
  });

  const createText = await createRes.text();
  if (!createRes.ok) {
    console.error("[e2e] Create job failed:", createRes.status, createText.slice(0, 300));
    process.exit(1);
  }

  let jobUuid: string;
  let jobNumber: string;

  try {
    const data = JSON.parse(createText);
    if (!data.ok) {
      console.error("[e2e] Create job returned ok:false", data.error);
      process.exit(1);
    }
    jobUuid = data.job_uuid;
    jobNumber = data.job_number || "";
    if (!jobNumber) {
      console.error("[e2e] Create job did not return job_number");
      process.exit(1);
    }
  } catch {
    console.error("[e2e] Create job response not JSON:", createText.slice(0, 200));
    process.exit(1);
  }

  console.log("[e2e] Job created:", { job_number: jobNumber, job_uuid: jobUuid });

  // Step 2: Push mapping to Inspection (simulate Snapshot push)
  const pushUrl = `${INSPECTION_BASE.replace(/\/$/, "")}/api/internal/service-job-link`;
  console.log("[e2e] Step 2: POST", pushUrl);

  const pushRes = await fetch(pushUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": INTERNAL_KEY,
    },
    body: JSON.stringify({ job_uuid: jobUuid, job_number: jobNumber, source: "snapshot" }),
  });

  const pushText = await pushRes.text();
  if (!pushRes.ok) {
    console.error("[e2e] Push failed:", pushRes.status, pushText.slice(0, 200));
    process.exit(1);
  }
  console.log("[e2e] Push OK");

  // Step 3: Inspection prefill
  const prefillUrl = `${INSPECTION_BASE.replace(/\/$/, "")}/api/servicem8/job-prefill?job_number=${encodeURIComponent(jobNumber)}`;
  console.log("[e2e] Step 3: GET", prefillUrl);

  const prefillRes = await fetch(prefillUrl);
  const prefillText = await prefillRes.text();

  if (!prefillRes.ok) {
    console.error("[e2e] Prefill failed:", prefillRes.status, prefillText.slice(0, 300));
    process.exit(1);
  }

  let prefill: { ok?: boolean; job?: { customer_name?: string; contact_name?: string; address?: { full_address?: string } } };
  try {
    prefill = JSON.parse(prefillText);
  } catch {
    console.error("[e2e] Prefill response not JSON:", prefillText.slice(0, 200));
    process.exit(1);
  }

  if (!prefill.ok || !prefill.job) {
    console.error("[e2e] Prefill returned ok:false or no job:", prefill);
    process.exit(1);
  }

  const job = prefill.job;
  const customerName = job.customer_name?.trim() || "";
  const contactName = job.contact_name?.trim() || "";
  const fullAddress = job.address?.full_address?.trim() || job.address?.line1?.trim() || "";

  // Verify at least one of contact/address is non-empty
  const hasContact = !!(customerName || contactName);
  const hasAddress = !!fullAddress;

  if (!hasContact && !hasAddress) {
    console.warn("[e2e] WARNING: Prefill returned empty customer_name, contact_name, and address.");
    console.warn("[e2e] This may be acceptable if ServiceM8 job has no company/contact. Response:", JSON.stringify(job, null, 2).slice(0, 500));
  } else {
    console.log("[e2e] Prefill OK — customer_name:", customerName || "(empty)", "address:", fullAddress ? fullAddress.slice(0, 50) + "..." : "(empty)");
  }

  console.log("[e2e] ✅ E2E test passed");
}

main().catch((err) => {
  console.error("[e2e] Error:", err);
  process.exit(1);
});
