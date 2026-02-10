import { config as loadDotenv } from "dotenv";
import path from "path";

/**
 * Minimal ServiceM8 client for job lookup by job_number.
 * Uses OAuth / API token provided via SERVICEM8_API_TOKEN (Bearer).
 */

const SERVICE_M8_VERSION = "2026-02-03-v1";

function ensureLocalEnv(): void {
  if (process.env.SERVICEM8_API_TOKEN || process.env.NETLIFY_DEV !== "true") return;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  for (const p of candidates) {
    loadDotenv({ path: p });
    if (process.env.SERVICEM8_API_TOKEN) return;
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

export async function fetchJobByNumber(
  jobNumber: string
): Promise<{ job: NormalizedJob; raw: unknown } | { error: ServiceM8Error }> {
  console.log("[servicem8] VERSION", SERVICE_M8_VERSION, "jobNumber", jobNumber);

  ensureLocalEnv();

  const token = process.env.SERVICEM8_API_TOKEN?.trim();
  if (!token) {
    console.error("[servicem8] missing SERVICEM8_API_TOKEN");
    return { error: { kind: "config_missing", message: "ServiceM8 API not configured" } };
  }

  // ServiceM8 两种认证：API Key（Settings → API Keys）用 X-API-Key；OAuth 用 Bearer。
  const authType = (process.env.SERVICEM8_AUTH_TYPE || "api_key").toLowerCase();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (authType === "bearer" || authType === "oauth") {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["X-API-Key"] = token;
  }

  const baseUrl = process.env.SERVICEM8_API_BASE_URL || "https://api.servicem8.com";

  const url = `${baseUrl}/api_1.0/job.json?$filter=job_number eq '${encodeURIComponent(
    jobNumber
  )}'`;

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[servicem8] job list error", res.status, text);
    if (res.status === 404) {
      return { error: { kind: "not_found", message: "Job not found" } };
    }
    // Check for invalid token error
    let parsedError: { error?: string; error_description?: string } | null = null;
    try {
      parsedError = JSON.parse(text);
    } catch {
      // Not JSON, use raw text
    }
    if (parsedError?.error === "invalid_token" || res.status === 401) {
      return {
        error: {
          kind: "service_error",
          status: res.status,
          message: "ServiceM8 API token 无效或已过期。请在 Netlify 环境变量中检查并更新 SERVICEM8_API_TOKEN。",
        },
      };
    }
    return {
      error: {
        kind: "service_error",
        status: res.status,
        message: parsedError?.error_description || parsedError?.error || text || `ServiceM8 HTTP ${res.status}`,
      },
    };
  }

  const json = (await res.json()) as unknown;
  if (!Array.isArray(json) || json.length === 0) {
    return { error: { kind: "not_found", message: "Job not found" } };
  }

  const first = json[0] as Record<string, unknown>;
  const uuid = String(first.uuid ?? "");
  const num = String(first.job_number ?? "");

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
    null;

  const normalized: NormalizedJob = {
    job_uuid: uuid,
    job_number: num,
    customer_name:
      (first.client_company as string | undefined) ||
      (first.client_name as string | undefined) ||
      contactName ||
      "",
    contact_name: contactName,
    phone,
    email,
    address: {
      line1: address,
      line2: null,
      suburb: (first.suburb as string | undefined) ?? null,
      state: (first.state as string | undefined) ?? null,
      postcode: (first.postcode as string | undefined) ?? null,
      full_address: address,
    },
  };

  return { job: normalized, raw: json };
}

