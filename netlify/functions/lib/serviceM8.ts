import { config as loadDotenv } from "dotenv";
import path from "path";

/**
 * Minimal ServiceM8 client for job lookup. Matches Snapshot repo:
 * - Base URL: https://api.servicem8.com/api_1.0
 * - Auth: X-API-Key header from SERVICEM8_API_KEY
 */

const SERVICE_M8_VERSION = "2026-02-03-v4";
const BASE_URL = process.env.SERVICEM8_API_BASE_URL || "https://api.servicem8.com/api_1.0";

/**
 * Build headers matching Snapshot exactly. X-API-Key only, no Basic Auth.
 */
function buildHeaders(): Record<string, string> {
  const token = process.env.SERVICEM8_API_KEY?.trim();
  console.log("[servicem8] apiKey present?", !!token, "apiKey length:", token?.length ?? 0);
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { "X-API-Key": token } : {}),
  };
}

function logUpstreamError(status: number, body: string, url: string): void {
  console.error("[servicem8] upstream error:", "status", status, "url", url, "body (first 200):", body.slice(0, 200));
}

/** Fetch company by UUID. Company = Client/Customer in ServiceM8. */
async function fetchCompanyName(companyUuid: string): Promise<string | null> {
  const headers = buildHeaders();
  const url = `${BASE_URL}/company/${encodeURIComponent(companyUuid)}.json`;
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    console.log("[servicem8] company fetch failed", res.status, companyUuid);
    return null;
  }
  try {
    const data = (await res.json()) as Record<string, unknown>;
    const name = (data.name as string | undefined)?.trim();
    return name || null;
  } catch {
    return null;
  }
}

function ensureLocalEnv(): void {
  if (process.env.SERVICEM8_API_KEY) return;
  if (process.env.NETLIFY_DEV !== "true" && !process.env.NETLIFY) return;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  for (const p of candidates) {
    try {
      loadDotenv({ path: p });
      if (process.env.SERVICEM8_API_KEY) {
        console.log("[servicem8] loaded SERVICEM8_API_KEY from", p);
        return;
      }
    } catch {
      /* ignore */
    }
  }
}

export type ServiceM8Job = {
  uuid: string;
  job_number: string;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  street?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
};

export type NormalizedJob = {
  job_uuid: string;
  job_number: string;
  customer_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    suburb: string | null;
    state: string | null;
    postcode: string | null;
    full_address: string | null;
  };
};

export type ServiceM8Error =
  | { kind: "config_missing"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "service_error"; status: number; message: string };

/** Resolve job_number -> job_uuid via filtered list. Used by prefill when DB cache miss. */
export async function resolveJobNumberToUuid(
  jobNumber: string
): Promise<{ job_uuid: string; job_number: string } | { error: ServiceM8Error }> {
  console.log("[servicem8] resolveJobNumberToUuid", jobNumber);
  ensureLocalEnv();

  const token = process.env.SERVICEM8_API_KEY?.trim();
  if (!token) {
    return { error: { kind: "config_missing", message: "ServiceM8 API not configured (SERVICEM8_API_KEY)" } };
  }

  const headers = buildHeaders();
  const url = `${BASE_URL}/job.json?$filter=generated_job_id eq '${encodeURIComponent(jobNumber.trim())}'&cursor=-1`;

  const res = await fetch(url, { method: "GET", headers });
  console.log("[servicem8] upstream response status:", res.status, "url:", url);

  const text = await res.text();
  if (!res.ok) {
    logUpstreamError(res.status, text, url);
    return {
      error: {
        kind: "service_error",
        status: res.status,
        message: text.slice(0, 200) || `ServiceM8 HTTP ${res.status}`,
      },
    };
  }

  let list: unknown[];
  try {
    const data = text ? JSON.parse(text) : null;
    list = Array.isArray(data) ? data : [];
  } catch {
    logUpstreamError(res.status, text, url);
    return {
      error: {
        kind: "service_error",
        status: res.status,
        message: `Invalid JSON: ${text.slice(0, 200)}`,
      },
    };
  }

  if (list.length === 0) {
    return { error: { kind: "not_found", message: "Job not found" } };
  }

  const match = list[0] as Record<string, unknown>;
  const uuid = String(match.uuid ?? "");
  const num =
    String(match.job_number ?? (match as Record<string, unknown>).generated_job_number ?? "").trim() || jobNumber;
  if (!uuid) {
    return { error: { kind: "not_found", message: "Job not found" } };
  }
  console.log("[servicem8] resolved via filter", { job_number: num, job_uuid: uuid });
  return { job_uuid: uuid, job_number: num };
}

export async function fetchJobByNumber(
  jobNumber: string
): Promise<{ job: NormalizedJob; raw: unknown } | { error: ServiceM8Error }> {
  const resolveResult = await resolveJobNumberToUuid(jobNumber);
  if ("error" in resolveResult) return resolveResult;
  return fetchJobByUuid(resolveResult.job_uuid);
}

function normalizeJobFromRaw(first: Record<string, unknown>, jobNumber: string): NormalizedJob {
  const uuid = String(first.uuid ?? "");
  const num =
    String(first.job_number ?? (first as Record<string, unknown>).generated_job_number ?? "").trim() || jobNumber;
  const contactFirst = (first.contact_first_name as string | undefined) ?? "";
  const contactLast = (first.contact_last_name as string | undefined) ?? "";
  const contactName =
    (contactFirst + " " + contactLast).trim() ||
    (first.client_company as string | undefined) ||
    null;
  const address =
    (first.address as string | undefined) ??
    (first.site_address as string | undefined) ??
    null;
  return {
    job_uuid: uuid,
    job_number: num,
    customer_name:
      (first.client_company as string | undefined) ||
      (first.client_name as string | undefined) ||
      contactName ||
      "",
    contact_name: contactName,
    phone:
      (first.contact_phone as string | undefined) ??
      (first.client_phone as string | undefined) ??
      null,
    email:
      (first.contact_email as string | undefined) ??
      (first.client_email as string | undefined) ??
      null,
    address: {
      line1: address,
      line2: null,
      suburb: (first.suburb as string | undefined) ?? null,
      state: (first.state as string | undefined) ?? null,
      postcode: (first.postcode as string | undefined) ?? null,
      full_address: address,
    },
  };
}

/**
 * Fetch a single job by UUID. GET job/{uuid}.json
 */
export async function fetchJobByUuid(
  jobUuid: string
): Promise<{ job: NormalizedJob; raw: unknown } | { error: ServiceM8Error }> {
  console.log("[servicem8] fetchJobByUuid", jobUuid);
  ensureLocalEnv();

  const token = process.env.SERVICEM8_API_KEY?.trim();
  if (!token) {
    return { error: { kind: "config_missing", message: "ServiceM8 API not configured (SERVICEM8_API_KEY)" } };
  }

  const headers = buildHeaders();
  const url = `${BASE_URL}/job/${encodeURIComponent(jobUuid)}.json`;

  const res = await fetch(url, { method: "GET", headers });
  console.log("[servicem8] upstream response status:", res.status, "url:", url);

  const text = await res.text();
  if (!res.ok) {
    logUpstreamError(res.status, text, url);
    if (res.status === 404) {
      return { error: { kind: "not_found", message: "Job not found" } };
    }
    return {
      error: {
        kind: "service_error",
        status: res.status,
        message: text.slice(0, 200) || `ServiceM8 HTTP ${res.status}`,
      },
    };
  }

  let first: Record<string, unknown>;
  try {
    const data = text ? JSON.parse(text) : null;
    first = (data && typeof data === "object") ? (data as Record<string, unknown>) : {};
  } catch {
    logUpstreamError(res.status, text, url);
    return {
      error: {
        kind: "service_error",
        status: res.status,
        message: `Invalid JSON: ${text.slice(0, 200)}`,
      },
    };
  }
  const uuid = String(first.uuid ?? "");
  const num =
    String(
      first.job_number ??
        (first as Record<string, unknown>).generated_job_number ??
        ""
    ).trim() || uuid;

  const contactFirst = (first.contact_first_name as string | undefined) ?? "";
  const contactLast = (first.contact_last_name as string | undefined) ?? "";
  const contactName =
    (contactFirst + " " + contactLast).trim() ||
    (first.client_company as string | undefined) ||
    null;

  const phone =
    (first.contact_phone as string | undefined) ??
    (first.client_phone as string | undefined) ??
    null;
  const email =
    (first.contact_email as string | undefined) ??
    (first.client_email as string | undefined) ??
    null;

  const address =
    (first.address as string | undefined) ??
    (first.site_address as string | undefined) ??
    (first.job_address as string | undefined) ??
    null;
  const suburb = (first.suburb as string | undefined) ?? (first.geo_city as string | undefined) ?? null;
  const state = (first.state as string | undefined) ?? (first.geo_state as string | undefined) ?? null;
  const postcode = (first.postcode as string | undefined) ?? (first.geo_postcode as string | undefined) ?? null;

  let customerName =
    (first.client_company as string | undefined)?.trim() ||
    (first.client_name as string | undefined)?.trim() ||
    (first.company_name as string | undefined)?.trim() ||
    (first.customer_name as string | undefined)?.trim() ||
    contactName ||
    "";

  // ServiceM8: Client/Customer = Company. Job has company_uuid, name is in /company/{uuid}
  if (!customerName && (first.company_uuid as string | undefined)) {
    const companyName = await fetchCompanyName(first.company_uuid as string);
    if (companyName) customerName = companyName;
  }

  const normalized: NormalizedJob = {
    job_uuid: uuid,
    job_number: num,
    customer_name: customerName,
    contact_name: contactName,
    phone,
    email,
    address: {
      line1: address,
      line2: null,
      suburb,
      state,
      postcode,
      full_address:
        address ||
        [address, suburb, state, postcode].filter(Boolean).join(", ") ||
        null,
    },
  };

  return { job: normalized, raw: first };
}

