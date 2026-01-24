import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get } from "./lib/store";

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const path = event.path ?? "";
  const match = /\/api\/review\/([^/]+)/.exec(path) ?? /\/review\/([^/]+)/.exec(path);
  const inspection_id = match?.[1];
  if (!inspection_id) {
    return { statusCode: 400, body: "Missing inspection_id" };
  }
  const data = get(inspection_id);
  if (!data) {
    return { statusCode: 404, body: "Not found" };
  }
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inspection_id: data.inspection_id,
      report_html: data.report_html,
      findings: data.findings,
      limitations: data.limitations,
    }),
  };
};
