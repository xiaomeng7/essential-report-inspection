import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { getWordDoc, get } from "./lib/store";
import { normalizeInspection } from "./lib/normalizeInspection";
import { getBaseUrl } from "./lib/baseUrl";

/** Make a short, filesystem-safe slug from address for use in download filename. */
function addressToFilenameSlug(address: string | undefined | null, maxLen = 50): string {
  if (!address || typeof address !== "string") return "";
  const trimmed = address.trim();
  if (!trimmed) return "";
  // Allow letters, digits, space, comma, hyphen, period; replace other chars with hyphen; collapse hyphens/spaces
  const safe = trimmed
    .replace(/[^\p{L}\p{N}\s,\-.]/gu, "-")
    .replace(/[\s\-]+/g, "-")
    .replace(/^-|-$/g, "");
  return safe.slice(0, maxLen);
}

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

    // If still no doc, generate on-demand so the email link works without visiting the review page first
    if (!buffer) {
      const baseUrl = getBaseUrl(event);
      const generateUrl = `${baseUrl}/api/generateWordReport?inspection_id=${encodeURIComponent(inspectionId)}`;
      console.log("Word doc not in blob; triggering on-demand generation:", generateUrl);
      try {
        const genRes = await fetch(generateUrl, { method: "GET" });
        if (genRes.ok) {
          blobKey = `reports/${inspectionId}.docx`;
          buffer = await getWordDoc(blobKey, event);
        }
      } catch (genErr) {
        console.error("On-demand Word generation request failed:", genErr);
      }
    }

    if (!buffer) {
      // Return 200 with HTML so Netlify does NOT serve the site 404 page (index.html = inspection app).
      const base = getBaseUrl(event);
      const baseUrl = base && String(base).startsWith("http") ? String(base).replace(/\/$/, "") : "https://inspection.bhtechnology.com.au";
      const retryUrl = `${baseUrl}/api/downloadWord?inspection_id=${encodeURIComponent(inspectionId)}`;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Word Report</title></head><body style="font-family:sans-serif;max-width:480px;margin:2rem auto;padding:1rem;text-align:center;"><p>Report is being generated or not yet ready for inspection <strong>${inspectionId}</strong>.</p><p><a href="${retryUrl}" style="display:inline-block;padding:12px 24px;background:#27ae60;color:white;text-decoration:none;border-radius:4px;">Try again (download Word)</a></p><p style="color:#666;font-size:14px;">If the file still does not download, open the review page and use &quot;Generate Word Report&quot; there first.</p></body></html>`;
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: html,
      };
    }

    // Download filename: include address when available so files are easier to find
    let downloadFilename = `${inspectionId}.docx`;
    try {
      const inspection = await get(inspectionId, event);
      if (inspection?.raw) {
        const { canonical } = normalizeInspection(inspection.raw as Record<string, unknown>, inspectionId);
        const slug = addressToFilenameSlug(canonical?.property_address);
        if (slug) {
          downloadFilename = `${slug}-${inspectionId}.docx`;
        }
      }
    } catch (_) {
      // Keep default filename if inspection load fails
    }

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
