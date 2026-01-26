import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get } from "./lib/store";

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return { 
      statusCode: 405, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }
  const path = event.path ?? "";
  const match = /\/api\/review\/([^/]+)/.exec(path) ?? /\/review\/([^/]+)/.exec(path);
  const inspection_id = match?.[1];
  
  console.log("Review request:", { path, inspection_id });
  
  if (!inspection_id) {
    return { 
      statusCode: 400, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing inspection_id", path })
    };
  }
  
  const data = await get(inspection_id, event);
  console.log("Retrieved data for", inspection_id, ":", data ? "found" : "not found");
  
  if (!data) {
    return { 
      statusCode: 404, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Inspection not found", 
        inspection_id,
        message: "The inspection data may have expired or was not saved correctly."
      })
    };
  }
  
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inspection_id: data.inspection_id,
      report_html: data.report_html,
      findings: data.findings,
      limitations: data.limitations,
      raw_data: data.raw, // Include raw data for AI enhancement
    }),
  };
};
