import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get, save } from "./lib/store";

export type FindingDimensions = {
  title?: string;
  safety?: string;
  urgency?: string;
  liability?: string;
  budget_low?: number;
  budget_high?: number;
  priority?: string;
  severity?: number;
  likelihood?: number;
  escalation?: string;
};

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  let body: { inspection_id?: string; finding_id?: string; dimensions?: FindingDimensions };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { inspection_id, finding_id, dimensions } = body;
  if (!inspection_id || !finding_id || !dimensions || typeof dimensions !== "object") {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing inspection_id, finding_id, or dimensions" }),
    };
  }

  const data = await get(inspection_id, event);
  if (!data) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Inspection not found", inspection_id }),
    };
  }

  const raw = data.raw as Record<string, unknown>;
  const overrides = (raw.finding_dimensions_debug as Record<string, FindingDimensions>) ?? {};
  overrides[finding_id] = { ...overrides[finding_id], ...dimensions };
  const rawUpdated = { ...raw, finding_dimensions_debug: overrides };

  await save(
    inspection_id,
    { ...data, raw: rawUpdated },
    event
  );

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, inspection_id, finding_id }),
  };
};
