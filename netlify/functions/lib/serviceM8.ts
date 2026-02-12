import { config as loadDotenv } from "dotenv";
import path from "path";

/**
 * Minimal ServiceM8 client for job lookup by job_number.
 * Uses OAuth / API token provided via SERVICEM8_API_TOKEN (Bearer).
 */

const SERVICE_M8_VERSION = "2026-02-03-v2";

/**
 * Parse response body as JSON. If ServiceM8 returns HTML (e.g. login/error page),
 * return error instead of throwing.
 */
async function safeParseJson(
  res: Response
): Promise<{ ok: true; data: unknown } | { ok: false; error: ServiceM8Error }> {
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    const msg =
      res.status === 401
        ? "ServiceM8 API token 无效或已过期。请在 Netlify 环境变量中检查并更新 SERVICEM8_API_TOKEN。"
        : `ServiceM8 API 返回了网页而非 JSON（HTTP ${res.status}）。请检查 SERVICEM8_API_TOKEN、SERVICEM8_API_BASE_URL 是否正确。`;
    return {
      ok: false,
      error: {
        kind: "service_error",
        status: res.status,
        message: msg,
      },
    };
  }
  try {
    const data = text ? JSON.parse(text) : null;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: {
        kind: "service_error",
        status: res.status,
        message: `ServiceM8 API 返回了无效 JSON: ${text.slice(0, 100)}`,
      },
    };
  }
}

function ensureLocalEnv(): void {
  // If token already exists, no need to load .env
  if (process.env.SERVICEM8_API_TOKEN) return;
  
  // In production (Netlify), env vars come from Netlify settings, not .env
  // Only load .env in local dev (netlify dev)
  if (process.env.NETLIFY_DEV !== "true" && !process.env.NETLIFY) return;
  
  // Try to load .env from project root (netlify dev runs from project root)
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  for (const p of candidates) {
    try {
      loadDotenv({ path: p });
      if (process.env.SERVICEM8_API_TOKEN) {
        console.log("[servicem8] loaded SERVICEM8_API_TOKEN from", p);
        return;
      }
    } catch (e) {
      // Ignore file not found errors
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

  // Normalize job number for comparison (trim, drop leading zeros for numeric match).
  const normalizeJobNum = (v: string): string => {
    const s = v.trim();
    const n = parseInt(s, 10);
    if (!isNaN(n) && String(n) === s) return s;
    return s.replace(/^0+/, "") || s;
  };
  const searchNum = normalizeJobNum(jobNumber);

  // ServiceM8 Job API may not support $filter by job_number; fetch pages and search.
  const MAX_PAGES = 5;
  let cursor: string | null = "-1";
  let first: Record<string, unknown> | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      cursor === "-1"
        ? `${baseUrl}/api_1.0/job.json?cursor=-1`
        : `${baseUrl}/api_1.0/job.json?cursor=${encodeURIComponent(cursor)}`;

    const res = await fetch(url, { method: "GET", headers });

    if (!res.ok) {
      const text = await res.text();
      console.error("[servicem8] job list error", res.status, text);
      if (res.status === 404) {
        return { error: { kind: "not_found", message: "Job not found" } };
      }
      let parsedError: { error?: string; error_description?: string } | null = null;
      try {
        parsedError = JSON.parse(text);
      } catch {
        /* ignore */
      }
      if (parsedError?.error === "invalid_token" || res.status === 401) {
        return {
          error: {
            kind: "service_error",
            status: res.status,
            message:
              "ServiceM8 API token 无效或已过期。请在 Netlify 环境变量中检查并更新 SERVICEM8_API_TOKEN。",
          },
        };
      }
      return {
        error: {
          kind: "service_error",
          status: res.status,
          message:
            parsedError?.error_description || parsedError?.message || parsedError?.error || text || `ServiceM8 HTTP ${res.status}`,
        },
      };
    }

    const parsed = await safeParseJson(res);
    if (!parsed.ok) return { error: parsed.error };
    const list = Array.isArray(parsed.data) ? parsed.data : [];

    if (page === 0 && list.length > 0) {
      const sample = list[0] as Record<string, unknown>;
      console.log("[servicem8] first job keys:", Object.keys(sample).sort().join(", "));
      const possibleNum =
        sample.job_number ?? sample.generated_job_number ?? sample.number ?? sample.id ?? "(none)";
      console.log("[servicem8] sample job_number / generated_job_number / number:", possibleNum);
    }

    const match = list.find((j: unknown) => {
      const r = j as Record<string, unknown>;
      const raw =
        r.job_number ?? r.generated_job_number ?? r.number ?? r.job_number_display ?? r.id ?? "";
      const num = normalizeJobNum(String(raw));
      return num === searchNum || String(raw).trim() === jobNumber.trim();
    }) as Record<string, unknown> | undefined;

    if (match) {
      first = match;
      break;
    }

    const nextCursor = res.headers.get("x-next-cursor");
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  if (!first) {
    return { error: { kind: "not_found", message: "Job not found" } };
  }
  const uuid = String(first.uuid ?? "");
  const num =
    String(first.job_number ?? (first as Record<string, unknown>).generated_job_number ?? "").trim() ||
    jobNumber.trim();

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

  return { job: normalized, raw: [first] };
}

/**
 * Fetch a single job by UUID (fast, direct API call).
 * GET /api_1.0/job/{uuid}.json
 */
export async function fetchJobByUuid(
  jobUuid: string
): Promise<{ job: NormalizedJob; raw: unknown } | { error: ServiceM8Error }> {
  console.log("[servicem8] fetchJobByUuid", jobUuid);

  ensureLocalEnv();

  const token = process.env.SERVICEM8_API_TOKEN?.trim();
  if (!token) {
    console.error("[servicem8] missing SERVICEM8_API_TOKEN");
    return { error: { kind: "config_missing", message: "ServiceM8 API not configured" } };
  }

  const authType = (process.env.SERVICEM8_AUTH_TYPE || "api_key").toLowerCase();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (authType === "bearer" || authType === "oauth") {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["X-API-Key"] = token;
  }

  const baseUrl = process.env.SERVICEM8_API_BASE_URL || "https://api.servicem8.com";
  const url = `${baseUrl}/api_1.0/job/${encodeURIComponent(jobUuid)}.json`;

  const res = await fetch(url, { method: "GET", headers });

  if (!res.ok) {
    const text = await res.text();
    const textPreview = text.slice(0, 200);
    console.error(
      `[servicem8] fetchJobByUuid error: ${res.status} ${res.statusText}, body preview: ${textPreview}`
    );
    if (res.status === 404) {
      return { error: { kind: "not_found", message: "Job not found" } };
    }
    let parsedError: { error?: string; error_description?: string } | null = null;
    try {
      parsedError = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (parsedError?.error === "invalid_token" || res.status === 401) {
      return {
        error: {
          kind: "service_error",
          status: res.status,
          message:
            "ServiceM8 API token 无效或已过期。请在 Netlify 环境变量中检查并更新 SERVICEM8_API_TOKEN。",
        },
      };
    }
    return {
      error: {
        kind: "service_error",
        status: res.status,
        message:
          parsedError?.error_description ||
          parsedError?.message ||
          parsedError?.error ||
          textPreview ||
          `ServiceM8 HTTP ${res.status}`,
      },
    };
  }

  const parsed = await safeParseJson(res);
  if (!parsed.ok) return { error: parsed.error };
  const first = parsed.data as Record<string, unknown>;
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

  return { job: normalized, raw: first };
}

/**
 * Resolve job_number -> job_uuid via ServiceM8 API (fallback when DB cache miss).
 * Uses filter on generated_job_id if supported, otherwise paginates and searches.
 */
export async function resolveJobNumberToUuid(
  jobNumber: string
): Promise<{ job_uuid: string; job_number: string } | { error: ServiceM8Error }> {
  console.log("[servicem8] resolveJobNumberToUuid", jobNumber);

  ensureLocalEnv();

  const token = process.env.SERVICEM8_API_TOKEN?.trim();
  if (!token) {
    return { error: { kind: "config_missing", message: "ServiceM8 API not configured" } };
  }

  const authType = (process.env.SERVICEM8_AUTH_TYPE || "api_key").toLowerCase();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (authType === "bearer" || authType === "oauth") {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["X-API-Key"] = token;
  }

  const baseUrl = process.env.SERVICEM8_API_BASE_URL || "https://api.servicem8.com";

  // Try filter first (may not work, but worth trying)
  const normalizeJobNum = (v: string): string => {
    const s = v.trim();
    const n = parseInt(s, 10);
    if (!isNaN(n) && String(n) === s) return s;
    return s.replace(/^0+/, "") || s;
  };
  const searchNum = normalizeJobNum(jobNumber);

  // Try filter on generated_job_id (if ServiceM8 supports it)
  const filterUrl = `${baseUrl}/api_1.0/job.json?$filter=generated_job_id eq '${encodeURIComponent(
    jobNumber
  )}'`;
  const filterRes = await fetch(filterUrl, { method: "GET", headers });

  if (filterRes.ok) {
    const parsed = await safeParseJson(filterRes);
    if (!parsed.ok) return { error: parsed.error };
    const filterList = Array.isArray(parsed.data) ? parsed.data : [];
    if (filterList.length > 0) {
      const match = filterList[0] as Record<string, unknown>;
      const uuid = String(match.uuid ?? "");
      const num =
        String(
          match.job_number ??
            (match as Record<string, unknown>).generated_job_number ??
            ""
        ).trim() || jobNumber;
      if (uuid) {
        console.log("[servicem8] resolved via filter", { job_number: num, job_uuid: uuid });
        return { job_uuid: uuid, job_number: num };
      }
    }
  }

  // Fallback: paginate and search (limited to 3 pages for performance)
  const MAX_PAGES = 3;
  let cursor: string | null = "-1";

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      cursor === "-1"
        ? `${baseUrl}/api_1.0/job.json?cursor=-1`
        : `${baseUrl}/api_1.0/job.json?cursor=${encodeURIComponent(cursor)}`;

    const res = await fetch(url, { method: "GET", headers });

    if (!res.ok) {
      const text = await res.text();
      const textPreview = text.slice(0, 200);
      console.error(
        `[servicem8] resolveJobNumberToUuid pagination error: ${res.status}, body preview: ${textPreview}`
      );
      if (res.status === 404) {
        return { error: { kind: "not_found", message: "Job not found" } };
      }
      let parsedError: { error?: string; error_description?: string } | null = null;
      try {
        parsedError = JSON.parse(text);
      } catch {
        /* ignore */
      }
      if (parsedError?.error === "invalid_token" || res.status === 401) {
        return {
          error: {
            kind: "service_error",
            status: res.status,
            message:
              "ServiceM8 API token 无效或已过期。请在 Netlify 环境变量中检查并更新 SERVICEM8_API_TOKEN。",
          },
        };
      }
      return {
        error: {
          kind: "service_error",
          status: res.status,
          message:
            parsedError?.error_description ||
            parsedError?.message ||
            parsedError?.error ||
            textPreview ||
            `ServiceM8 HTTP ${res.status}`,
        },
      };
    }

    const parsed = await safeParseJson(res);
    if (!parsed.ok) return { error: parsed.error };
    const list = Array.isArray(parsed.data) ? parsed.data : [];

    const match = list.find((j: unknown) => {
      const r = j as Record<string, unknown>;
      const raw =
        r.job_number ??
        r.generated_job_number ??
        r.number ??
        r.job_number_display ??
        r.id ??
        "";
      const num = normalizeJobNum(String(raw));
      return num === searchNum || String(raw).trim() === jobNumber.trim();
    }) as Record<string, unknown> | undefined;

    if (match) {
      const uuid = String(match.uuid ?? "");
      const num =
        String(
          match.job_number ??
            (match as Record<string, unknown>).generated_job_number ??
            ""
        ).trim() || jobNumber;
      if (uuid) {
        console.log("[servicem8] resolved via pagination", {
          job_number: num,
          job_uuid: uuid,
          page: page + 1,
        });
        return { job_uuid: uuid, job_number: num };
      }
    }

    const nextCursor = res.headers.get("x-next-cursor");
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  return { error: { kind: "not_found", message: "Job not found" } };
}

