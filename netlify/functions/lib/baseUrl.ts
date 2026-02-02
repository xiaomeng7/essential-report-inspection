/**
 * Unified base URL for report links, review URLs, and Evidence "View photo" links.
 * Prefer x-forwarded-proto / x-forwarded-host; force http for localhost / NETLIFY_DEV.
 */

import type { HandlerEvent } from "@netlify/functions";

const FALLBACK_BASE_URL = "https://inspetionreport.netlify.app";

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return h.includes("localhost") || h.includes("127.0.0.1");
}

/**
 * Resolve base URL for links (review page, photo URLs, etc.).
 * - Prefer x-forwarded-proto / x-forwarded-host from request
 * - If host is localhost/127.0.0.1 or NETLIFY_DEV=true, force proto to "http"
 * - Fallback: env URL / DEPLOY_PRIME_URL / FALLBACK_BASE_URL
 */
export function getBaseUrl(event?: HandlerEvent): string {
  let proto: string;
  let host: string;
  let source: string;

  if (event?.headers) {
    const rawProto = (event.headers["x-forwarded-proto"] ?? event.headers["x-forwarded-protocol"]) as string | undefined;
    const rawHost = (event.headers["x-forwarded-host"] ?? event.headers["host"]) as string | undefined;
    host = rawHost ? String(rawHost).replace(/,.*$/, "").trim() : "";
    const isLocal = host && (isLocalHost(host) || process.env.NETLIFY_DEV === "true");
    if (isLocal) {
      proto = "http";
      source = "forced-local";
    } else if (rawProto && rawHost) {
      proto = String(rawProto).replace(/,.*$/, "").trim() || "https";
      source = "headers";
    } else if (rawHost) {
      proto = "https";
      source = "headers";
    } else {
      const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || FALLBACK_BASE_URL;
      const parsed = envUrl.replace(/\/$/, "");
      proto = parsed.startsWith("https") ? "https" : "http";
      host = parsed.replace(/^https?:\/\//, "").split("/")[0] || "";
      source = "env";
    }
  } else {
    const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || FALLBACK_BASE_URL;
    const parsed = envUrl.replace(/\/$/, "");
    proto = parsed.startsWith("https") ? "https" : "http";
    host = parsed.replace(/^https?:\/\//, "").split("/")[0] || "";
    source = "env";
  }

  const baseUrl = host ? `${proto}://${host}`.replace(/\/$/, "") : (process.env.URL || process.env.DEPLOY_PRIME_URL || FALLBACK_BASE_URL).replace(/\/$/, "");
  console.log("[baseurl] resolved proto=<" + proto + "> host=<" + (host || "(none)") + "> source=<" + source + ">");
  return baseUrl;
}
