/**
 * Serve inspection photo from Netlify Blobs (inspection-photos store)
 *
 * GET /api/inspectionPhoto?inspection_id=EH-...&photo_id=P01&token=...&expires=...
 *
 * Security: HMAC-SHA256 token (via signPhotoUrl / verifyPhotoToken in lib/photoUrl.ts)
 * If REPORT_PHOTO_SIGNING_SECRET is set, validate token; else allow (no auth)
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { getPhotoImage } from "./lib/store";
import { verifyPhotoToken } from "./lib/photoUrl";

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  const params = new URLSearchParams(event.rawQuery || "");
  const inspectionId = params.get("inspection_id")?.trim();
  const photoId = params.get("photo_id")?.trim();
  const token = params.get("token")?.trim();
  const expiresStr = params.get("expires")?.trim();

  if (!inspectionId || !photoId) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing required query params: inspection_id, photo_id" }),
    };
  }

  const secret = process.env.REPORT_PHOTO_SIGNING_SECRET;
  if (secret) {
    if (!token || !expiresStr) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "token and expires required when REPORT_PHOTO_SIGNING_SECRET is set" }),
      };
    }
    const expires = parseInt(expiresStr, 10);
    if (Number.isNaN(expires) || expires < Math.floor(Date.now() / 1000)) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "expires invalid or expired" }),
      };
    }
    if (!verifyPhotoToken(secret, inspectionId, photoId, expires, token)) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid token" }),
      };
    }
  }

  const result = await getPhotoImage(inspectionId, photoId, event);
  if (!result) {
    return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Photo not found" }) };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, max-age=3600",
    },
    body: result.buffer.toString("base64"),
    isBase64Encoded: true,
  };
};
