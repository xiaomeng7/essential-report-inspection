import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { getWordDoc, saveWordDoc, tryAcquireWordGenLock, releaseWordGenLock } from "./lib/store";
import { getBaseUrl } from "./lib/baseUrl";
import { logWordReport } from "./lib/wordReportLog";

const FALLBACK_POLL_MS = 2000;
const FALLBACK_POLL_ATTEMPTS = 15;

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return { 
      statusCode: 405, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    // Get inspection_id from query string
    const inspectionId = event.queryStringParameters?.inspection_id;
    
    if (!inspectionId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "inspection_id is required" })
      };
    }

    // Get Word document from Blob
    // Support both old format (word/{id}.docx) and new format (reports/{id}.docx)
    let blobKey = `reports/${inspectionId}.docx`;
    console.log("Fetching Word document:", blobKey);
    let buffer = await getWordDoc(blobKey, event);
    
    // Fallback to old format if not found
    if (!buffer) {
      blobKey = `word/${inspectionId}.docx`;
      console.log("Trying fallback path:", blobKey);
      buffer = await getWordDoc(blobKey, event);
    }

    // 幂等锁：Blob 不存在时仅一个请求执行生成，其余轮询 getWordDoc 等待
    if (!buffer) {
      const blobKeyNew = `reports/${inspectionId}.docx`;
      const acquired = await tryAcquireWordGenLock(inspectionId, event);
      if (!acquired) {
        for (let i = 0; i < FALLBACK_POLL_ATTEMPTS; i++) {
          await new Promise((r) => setTimeout(r, FALLBACK_POLL_MS));
          buffer = await getWordDoc(blobKeyNew, event);
          if (buffer) {
            blobKey = blobKeyNew;
            break;
          }
          buffer = await getWordDoc(`word/${inspectionId}.docx`, event);
          if (buffer) {
            blobKey = `word/${inspectionId}.docx`;
            break;
          }
        }
      }
      if (!buffer && acquired) {
        const base = getBaseUrl(event);
        const baseUrl = base && String(base).startsWith("http") ? String(base).replace(/\/$/, "") : "https://inspection.bhtechnology.com.au";
        const generateUrl = `${baseUrl}/api/generateMarkdownWord?inspection_id=${encodeURIComponent(inspectionId)}`;
        console.log("Word doc not in blob; generating on-demand (same as Review page):", generateUrl);
        const t0 = Date.now();
        try {
          const genRes = await fetch(generateUrl, { method: "GET" });
          if (genRes.ok) {
            const arrayBuffer = await genRes.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            blobKey = blobKeyNew;
            await saveWordDoc(blobKey, buffer, event);
            logWordReport({ inspection_id: inspectionId, trigger: "download_fallback", duration_ms: Date.now() - t0, result: "success", blob_key: blobKey });
          } else {
            logWordReport({ inspection_id: inspectionId, trigger: "download_fallback", duration_ms: Date.now() - t0, result: "fail", error_message: `HTTP ${genRes.status}` });
          }
        } catch (genErr) {
          const msg = genErr instanceof Error ? genErr.message : String(genErr);
          console.error("On-demand Word generation failed:", genErr);
          logWordReport({ inspection_id: inspectionId, trigger: "download_fallback", duration_ms: Date.now() - t0, result: "fail", error_message: msg });
        } finally {
          await releaseWordGenLock(inspectionId, event);
        }
      }
    }

    if (!buffer) {
      // Return 200 with HTML so Netlify does NOT serve the site 404 page (index.html = inspection app).
      const base = getBaseUrl(event);
      const baseUrl = base && String(base).startsWith("http") ? String(base).replace(/\/$/, "") : "https://inspection.bhtechnology.com.au";
      const retryUrl = `${baseUrl}/api/downloadWord?inspection_id=${encodeURIComponent(inspectionId)}&_=${Date.now()}`;
      const generateUrl = `${baseUrl}/api/generateMarkdownWord?inspection_id=${encodeURIComponent(inspectionId)}`;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Cache-Control" content="no-store"><title>Word Report</title></head><body style="font-family:sans-serif;max-width:520px;margin:2rem auto;padding:1rem;text-align:center;">
<p>Report is not yet ready for inspection <strong>${inspectionId}</strong>.</p>
<p><a href="${retryUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;background:#27ae60;color:white;text-decoration:none;border-radius:4px;margin:4px;">Try again (opens in new tab, download will start if ready)</a></p>
<p><a href="${generateUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;background:#2c3e50;color:white;text-decoration:none;border-radius:4px;margin:4px;">Generate report now (same as Review page)</a></p>
<p style="color:#666;font-size:14px;">Click &quot;Generate report now&quot; first, wait a few seconds, then &quot;Try again&quot;. Or open the <a href="${baseUrl}/review/${inspectionId}">review page</a> and use Generate Word there.</p>
</body></html>`;
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
        body: html,
      };
    }

    // Same filename as Review page so email download matches
    const downloadFilename = `${inspectionId}-report.docx`;

    // Return file as download with correct headers
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
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    console.error("Error downloading Word document:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to download Word document",
        message: errorMessage
      })
    };
  }
};
