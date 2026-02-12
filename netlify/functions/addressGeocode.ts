/**
 * GET /api/addressGeocode?address=xxx
 * Uses Google Geocoding API to convert address string to place_id + components.
 * Used by ServiceM8 prefill to auto-fill Property address from job address.
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import path from "path";
import { config as loadDotenv } from "dotenv";

const VERSION = "2026-02-03-v1";

/** Load .env from project root when running under netlify dev. */
function ensureLocalEnv(): void {
  if (process.env.GOOGLE_MAPS_API_KEY || process.env.NETLIFY_DEV !== "true") return;
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  for (const p of candidates) {
    loadDotenv({ path: p });
    if (process.env.GOOGLE_MAPS_API_KEY) return;
  }
}

type GeocodeResult = {
  place_id: string;
  formatted_address: string;
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  geometry?: { location: { lat: number; lng: number } };
};

function getComponent(
  components: GeocodeResult["address_components"],
  ...types: string[]
): string {
  if (!Array.isArray(components)) return "";
  for (const type of types) {
    const c = components.find((x) => x.types?.includes(type));
    if (c) return c.long_name ?? c.short_name ?? "";
  }
  return "";
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  console.log("[addr] addressGeocode VERSION=" + VERSION);

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  ensureLocalEnv();

  const address = (event.queryStringParameters?.address ?? "").trim();
  if (!address || address.length < 5) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "address parameter required (min 5 chars)" }),
    };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[addr] geocode missing GOOGLE_MAPS_API_KEY");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Address geocoding not configured" }),
    };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:AU&key=${apiKey}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      console.log("[addr] Geocoding API status:", res.status, "message:", text.slice(0, 200));
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Geocoding request failed", message: text.slice(0, 200) }),
      };
    }

    const data = (await res.json()) as {
      status: string;
      results?: GeocodeResult[];
      error_message?: string;
    };

    if (data.status !== "OK" || !data.results?.length) {
      const msg = data.status === "ZERO_RESULTS"
        ? "No matching address found"
        : data.error_message ?? data.status ?? "Geocoding failed";
      console.log("[addr] geocode no result:", address, "status:", data.status);
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: msg }),
      };
    }

    const first = data.results[0];
    const components = first.address_components ?? [];
    const suburb = getComponent(components, "locality", "sublocality", "sublocality_level_1");
    const state = getComponent(components, "administrative_area_level_1");
    const postcode = getComponent(components, "postal_code");

    const output = {
      place_id: first.place_id,
      formatted_address: first.formatted_address ?? "",
      components: {
        street_number: getComponent(components, "street_number"),
        route: getComponent(components, "route"),
        suburb,
        state,
        postcode,
        country: getComponent(components, "country"),
      },
      geo: first.geometry?.location
        ? { lat: first.geometry.location.lat, lng: first.geometry.location.lng }
        : undefined,
    };

    console.log("[addr] geocode ok:", first.place_id, "suburb:", suburb, "state:", state, "postcode:", postcode);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(output),
    };
  } catch (err) {
    console.error("[addr] geocode error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "Address geocoding failed",
        message: err instanceof Error ? err.message : String(err),
      }),
    };
  }
};
