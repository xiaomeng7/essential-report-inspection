/**
 * Debug endpoint: GET /api/debugInspection?inspection_id=...
 * Returns findings with photo_ids for verifying photo write-back.
 * Only available in NETLIFY_DEV or when ?token= matches REPORT_DEBUG_TOKEN env.
 * @deprecated No frontend/script calls; manual debug only.
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get } from "./lib/store";

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const isDev = process.env.NETLIFY_DEV === "true";
  const debugToken = process.env.REPORT_DEBUG_TOKEN;
  const queryToken = event.queryStringParameters?.token;

  if (!isDev) {
    if (!debugToken || queryToken !== debugToken) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Forbidden", hint: "Set REPORT_DEBUG_TOKEN or use NETLIFY_DEV" }),
      };
    }
  }

  const inspectionId = event.queryStringParameters?.inspection_id;
  if (!inspectionId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "inspection_id is required" }),
    };
  }

  const inspection = await get(inspectionId, event);
  if (!inspection) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Inspection not found", inspection_id: inspectionId }),
    };
  }

  const findings = (inspection.findings || []).map((f: { id: string; photo_ids?: string[] }) => {
    const ids = Array.isArray(f.photo_ids) ? f.photo_ids : [];
    return {
      id: f.id,
      photo_ids_count: ids.length,
      photo_ids: ids,
    };
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inspection_id: inspection.inspection_id,
      findings,
    }),
  };
};
