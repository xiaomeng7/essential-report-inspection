/**
 * GET /api/addressDetails?place_id=xxx
 * Calls Google Places API (New) - places/{placeId}
 * Returns formatted_address, components, geo.
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import path from "path";
import { config as loadDotenv } from "dotenv";

const VERSION = "2026-01-31-v2";

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

/** Google Places API (New) place details response */
type PlaceDetailsResponse = {
  formattedAddress?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function getComponent(
  components: PlaceDetailsResponse["addressComponents"],
  ...types: string[]
): string {
  if (!Array.isArray(components)) return "";
  for (const type of types) {
    const c = components.find((x) => x.types?.includes(type));
    if (c) return c.longText ?? c.shortText ?? "";
  }
  return "";
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  console.log("[addr] addressDetails VERSION=" + VERSION + " USING=places/{placeId}");

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  ensureLocalEnv();

  const placeId = event.queryStringParameters?.place_id?.trim();
  if (!placeId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "place_id is required" }),
    };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[addr] details missing GOOGLE_MAPS_API_KEY");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Address details not configured" }),
    };
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "formattedAddress,addressComponents,location",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.log("[addr] Google API status:", res.status, "message:", errorText);
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Place not found", place_id: placeId }),
      };
    }

    const data = (await res.json()) as PlaceDetailsResponse;

    // Check for API error in response body
    if (data.error) {
      console.log("[addr] Google API status:", data.error.status || data.error.code, "message:", data.error.message || "unknown");
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Place not found", place_id: placeId }),
      };
    }

    const components = data.addressComponents ?? [];
    const suburb = getComponent(components, "locality", "sublocality", "sublocality_level_1");
    const state = getComponent(components, "administrative_area_level_1");
    const postcode = getComponent(components, "postal_code");

    console.log("[addr] details place_id=", placeId, "suburb=", suburb, "state=", state, "postcode=", postcode);

    const output = {
      formatted_address: data.formattedAddress ?? "",
      components: {
        street_number: getComponent(components, "street_number"),
        route: getComponent(components, "route"),
        suburb: suburb,
        state: state,
        postcode: postcode,
        country: getComponent(components, "country"),
      },
      geo: data.location
        ? { lat: data.location.latitude, lng: data.location.longitude }
        : undefined,
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(output),
    };
  } catch (err) {
    console.error("[addr] details error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Address lookup failed", message: err instanceof Error ? err.message : String(err) }),
    };
  }
};
