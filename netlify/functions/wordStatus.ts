import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { hasWordDoc } from "./lib/store";

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }
  const inspectionId = event.queryStringParameters?.inspection_id;
  if (!inspectionId) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "inspection_id is required" }) };
  }
  try {
    const reportsKey = `reports/${inspectionId}.docx`;
    const wordKey = `word/${inspectionId}.docx`;
    const exists = (await hasWordDoc(reportsKey, event)) || (await hasWordDoc(wordKey, event));
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ exists }),
    };
  } catch (e) {
    console.error("wordStatus error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to check word status", exists: false }),
    };
  }
};
