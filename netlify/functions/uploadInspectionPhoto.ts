/**
 * Upload inspection photo to Netlify Blobs (inspection-photos store)
 *
 * Input: JSON body { inspection_id, finding_id, caption, image (base64) }
 * Output: { photo_id, blob_key, public_url? }
 *
 * - caption required; finding_id required → 400 if missing
 * - Max 2 photos per finding → 400 if exceeded
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { get, save, savePhoto, type PhotoMetadata } from "./lib/store";

const MAX_PHOTOS_PER_FINDING = 2;

function generatePhotoId(existingIds: string[]): string {
  const max = existingIds.reduce((acc, id) => {
    const m = id.match(/^P(\d+)$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      return n > acc ? n : acc;
    }
    return acc;
  }, 0);
  const next = max + 1;
  return `P${String(next).padStart(2, "0")}`;
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let body: { inspection_id?: string; finding_id?: string; caption?: string; image?: string };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { inspection_id, finding_id, caption, image } = body;

  if (!inspection_id || !finding_id || !caption) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing required fields", required: ["inspection_id", "finding_id", "caption"] }),
    };
  }

  if (!caption || String(caption).trim().length === 0) {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "caption is required and must be non-empty" }) };
  }

  if (!image || typeof image !== "string") {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "image (base64) is required" }) };
  }

  let imageBuffer: Buffer;
  let ext = "jpg";
  try {
    const base64Match = image.match(/^data:image\/(\w+);base64,(.+)$/);
    const b64 = base64Match ? base64Match[2] : image;
    if (base64Match && (base64Match[1] === "png" || base64Match[1] === "jpeg")) {
      ext = base64Match[1] === "png" ? "png" : "jpg";
    }
    imageBuffer = Buffer.from(b64, "base64");
  } catch {
    return { statusCode: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Invalid base64 image" }) };
  }

  const inspection = await get(inspection_id, event);
  if (!inspection) {
    return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Inspection not found" }) };
  }

  const finding = inspection.findings.find((f) => f.id === finding_id);
  if (!finding) {
    return { statusCode: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Finding not found" }) };
  }

  const existingPhotoIds = Array.isArray((finding as any).photo_ids) ? ((finding as any).photo_ids as string[]) : [];
  if (existingPhotoIds.length >= MAX_PHOTOS_PER_FINDING) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Max ${MAX_PHOTOS_PER_FINDING} photos per finding`, existing_count: existingPhotoIds.length }),
    };
  }

  const photoId = generatePhotoId(existingPhotoIds);
  const blobKeyImage = `photos/${inspection_id}/${photoId}.${ext}`;
  const blobKeyMeta = `photos/${inspection_id}/${photoId}.json`;

  const metadata: PhotoMetadata = {
    photo_id: photoId,
    inspection_id,
    finding_id,
    caption: String(caption).trim(),
    created_at: new Date().toISOString(),
    blob_key: blobKeyImage,
  };

  await savePhoto(inspection_id, photoId, imageBuffer, metadata, event, ext);

  const newPhotoIds = [...existingPhotoIds, photoId];
  (finding as any).photo_ids = newPhotoIds;

  try {
    await save(inspection_id, inspection, event);
    console.log("[report-fp] upload saved inspection_id=" + inspection_id + " finding_id=" + finding_id + " new_photo_id=" + photoId + " photo_ids_count=" + newPhotoIds.length);
  } catch (saveErr) {
    console.error("[report-fp] upload save FAILED:", saveErr);
    throw saveErr;
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      photo_id: photoId,
      blob_key: blobKeyImage,
      blob_key_meta: blobKeyMeta,
      public_url: null,
    }),
  };
};
