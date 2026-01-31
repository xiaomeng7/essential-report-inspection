/**
 * GET /api/addressSuggest?q=xxx
 * Calls Google Places Autocomplete API, Australia only.
 * Returns { suggestions: [{ description, place_id }] }
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

type AutocompletePrediction = {
  description: string;
  place_id: string;
};

type AutocompleteResponse = {
  predictions?: AutocompletePrediction[];
  status?: string;
  error_message?: string;
};

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const q = (event.queryStringParameters?.q ?? "").trim();
  if (q.length < 2) {
    const suggestions: Array<{ description: string; place_id: string }> = [];
    console.log("[addr] suggest q=", q, "count=0 (min 2 chars)");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ suggestions }),
    };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[addr] suggest missing GOOGLE_MAPS_API_KEY");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Address suggestions not configured" }),
    };
  }

  try {
    const params = new URLSearchParams({
      input: q,
      key: apiKey,
      components: "country:au",
      types: "address",
    });
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;
    const res = await fetch(url);
    const data = (await res.json()) as AutocompleteResponse;

    const predictions = data.predictions ?? [];
    const suggestions = predictions.slice(0, 8).map((p) => ({
      description: p.description,
      place_id: p.place_id,
    }));

    console.log("[addr] suggest q=", q, "count=", suggestions.length);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ suggestions }),
    };
  } catch (err) {
    console.error("[addr] suggest error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Address lookup failed", message: err instanceof Error ? err.message : String(err) }),
    };
  }
};
