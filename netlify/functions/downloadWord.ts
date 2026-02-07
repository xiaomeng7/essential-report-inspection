import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get, getWordDoc } from "./lib/store";

/**
 * Word 报告只允许在 Submit 时生成一次；本接口仅读取已存在的 Blob，绝不生成。
 * 若 report_blob_key 不存在或 Blob 不存在，返回 409。
 */
export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const inspectionId = event.queryStringParameters?.inspection_id;

    if (!inspectionId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "inspection_id is required" }),
      };
    }

    const inspection = await get(inspectionId, event);
    let blobKey: string | undefined = inspection?.report_blob_key;

    if (blobKey) {
      const buffer = await getWordDoc(blobKey, event);
      if (buffer && buffer.length > 0) {
        const downloadFilename = `${inspectionId}-report.docx`;
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${downloadFilename.replace(/"/g, "")}"`,
            "Content-Length": buffer.length.toString(),
          },
          body: buffer.toString("base64"),
          isBase64Encoded: true,
        };
      }
    }

    // 兼容旧数据：无 report_blob_key 时尝试固定路径
    const legacyKeys = [`reports/${inspectionId}.docx`, `word/${inspectionId}.docx`];
    for (const key of legacyKeys) {
      const buffer = await getWordDoc(key, event);
      if (buffer && buffer.length > 0) {
        const downloadFilename = `${inspectionId}-report.docx`;
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${downloadFilename.replace(/"/g, "")}"`,
            "Content-Length": buffer.length.toString(),
          },
          body: buffer.toString("base64"),
          isBase64Encoded: true,
        };
      }
    }

    // 无可用报告：不生成，返回 409
    return {
      statusCode: 409,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        error: "report_not_available",
        message: "Word report is only generated once at Submit. No report is available for this inspection.",
      }),
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    console.error("Error downloading Word document:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Failed to download Word document",
        message: errorMessage,
      }),
    };
  }
};
