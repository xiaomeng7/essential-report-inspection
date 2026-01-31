/**
 * GET /api/addressDetails?place_id=xxx
 * Calls Google Place Details API.
 * Returns formatted_address, components, geo.
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";

type AddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type PlaceDetailsResult = {
  formatted_address?: string;
  address_components?: AddressComponent[];
  geometry?: { location?: { lat: number; lng: number } };
};

type PlaceDetailsResponse = {
  result?: PlaceDetailsResult;
  status?: string;
  error_message?: string;
};

function getComponent(components: AddressComponent[] | undefined, ...types: string[]): string {
  if (!Array.isArray(components)) return "";
  for (const type of types) {
    const c = components.find((x) => x.types.includes(type));
    if (c) return c.long_name;
  }
  return "";
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

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
    const params = new URLSearchParams({
      place_id: placeId,
      key: apiKey,
      fields: "formatted_address,address_components,geometry",
    });
    const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
    const res = await fetch(url);
    const data = (await res.json()) as PlaceDetailsResponse;

    const result = data.result;
    if (!result) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Place not found", place_id: placeId }),
      };
    }

    const components = result.address_components ?? [];
    const suburb = getComponent(components, "locality", "sublocality", "sublocality_level_1");
    const state = getComponent(components, "administrative_area_level_1");
    const postcode = getComponent(components, "postal_code");

    console.log("[addr] details place_id=", placeId, "suburb=", suburb, "state=", state, "postcode=", postcode);

    const output = {
      formatted_address: result.formatted_address ?? "",
      components: {
        street_number: getComponent(components, "street_number"),
        route: getComponent(components, "route"),
        suburb: suburb,
        state: state,
        postcode: postcode,
        country: getComponent(components, "country"),
      },
      geo: result.geometry?.location
        ? { lat: result.geometry.location.lat, lng: result.geometry.location.lng }
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Address lookup failed", message: err instanceof Error ? err.message : String(err) }),
    };
  }
};
