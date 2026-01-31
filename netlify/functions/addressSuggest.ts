/**
 * GET /api/addressSuggest?q=xxx
 * Calls Google Places API (New) - places:autocomplete, Australia only.
 * Returns { suggestions: [{ placeId, text }] }
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import path from "path";
import { config as loadDotenv } from "dotenv";

const VERSION = "2026-01-31-v2";

/** Load .env from project root when running under netlify dev (so Functions see GOOGLE_MAPS_API_KEY). */
function ensureLocalEnv(): void {
  if (process.env.GOOGLE_MAPS_API_KEY) {
    return;
  }
  if (process.env.NETLIFY_DEV !== "true") {
    return;
  }
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  for (const p of candidates) {
    loadDotenv({ path: p });
    if (process.env.GOOGLE_MAPS_API_KEY) {
      return;
    }
  }
}

/** Suggestion returned to frontend */
type Suggestion = {
  placeId: string;
  text: string;
};

/** Google Places API (New) autocomplete response structure */
type PlacesAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: {
        text?: string;
      };
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  console.log("[addr] addressSuggest VERSION=" + VERSION + " USING=places:autocomplete");

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  ensureLocalEnv();

  const q = (event.queryStringParameters?.q ?? "").trim();
  if (q.length < 2) {
    console.log("[addr] suggest q=", q, "count=0 (min 2 chars)");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ suggestions: [] }),
    };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[addr] suggest missing GOOGLE_MAPS_API_KEY");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Address suggestions not configured" }),
    };
  }

  try {
    const url = "https://places.googleapis.com/v1/places:autocomplete";
    const requestBody = {
      input: q,
      includedRegionCodes: ["AU"],
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.log("[addr] Google API status:", res.status, "message:", errorText);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ suggestions: [] }),
      };
    }

    const data = (await res.json()) as PlacesAutocompleteResponse;

    // Check for API error in response body
    if (data.error) {
      console.log("[addr] Google API status:", data.error.status || data.error.code, "message:", data.error.message || "unknown");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ suggestions: [] }),
      };
    }

    // Parse suggestions from new API format
    const suggestions: Suggestion[] = [];
    for (const s of data.suggestions ?? []) {
      const placeId = s.placePrediction?.placeId;
      const text = s.placePrediction?.text?.text;
      if (placeId && text) {
        suggestions.push({ placeId, text });
      }
    }

    // Limit to 8 suggestions
    const limited = suggestions.slice(0, 8);

    console.log("[addr] suggest q=", q, "count=", limited.length);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ suggestions: limited }),
    };
  } catch (err) {
    console.error("[addr] suggest error:", err);
    // Return empty suggestions instead of error to avoid frontend crash
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ suggestions: [] }),
    };
  }
};
