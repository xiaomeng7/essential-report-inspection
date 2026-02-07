/**
 * LEGACY – DO NOT USE in new code.
 * @deprecated 仅 Debug 手动使用。
 *
 * 原用途：Debug 端点 GET /api/debugInspection?inspection_id=... 返回 findings（含 photo_ids），用于验证 photo 回写。
 * 为什么不再使用：无前端/脚本 fetch；仅 NETLIFY_DEV 或 ?token=REPORT_DEBUG_TOKEN 可用。
 * 推荐新路径：仅 Debug 时手动 curl；应用内不依赖此 API。
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
