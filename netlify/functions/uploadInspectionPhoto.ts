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
import { get, save, savePhoto, allocatePhotoId, photoKeyExists, type PhotoMetadata } from "./lib/store";

const MAX_PHOTOS_PER_FINDING = 2;
const ALLOCATE_RETRIES = 3;

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

  let photoId: string | null = null;
  for (let attempt = 0; attempt < ALLOCATE_RETRIES; attempt++) {
    const candidate = await allocatePhotoId(inspection_id, event);
    if (!(await photoKeyExists(inspection_id, candidate, ext, event))) {
      photoId = candidate;
      break;
    }
    console.log("[photo-fp] collision for " + candidate + ", retry " + (attempt + 1) + "/" + ALLOCATE_RETRIES);
  }
  if (!photoId) {
    console.error("[photo-fp] allocate failed after " + ALLOCATE_RETRIES + " retries");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Could not allocate unique photo id after retries" }),
    };
  }

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
    console.log("[photo-fp] upload saved inspection_id=" + inspection_id + " finding_id=" + finding_id + " new_photo_id=" + photoId + " photo_ids=" + JSON.stringify(newPhotoIds));
  } catch (saveErr) {
    console.error("[photo-fp] upload save FAILED:", saveErr);
    throw saveErr;
  }

  // Re-read to verify write (strong read when available; fallback to normal)
  let reRead: Awaited<ReturnType<typeof get>>;
  try {
    reRead = await get(inspection_id, event, true);
  } catch {
    reRead = await get(inspection_id, event);
  }
  const reFinding = reRead?.findings?.find((f) => f.id === finding_id);
  const reIds = Array.isArray((reFinding as any)?.photo_ids) ? (reFinding as any).photo_ids : [];
  const verified = JSON.stringify(reIds) === JSON.stringify(newPhotoIds);
  console.log("[photo-fp] after-save verify: finding_id=" + finding_id + ", photo_ids length=" + reIds.length + ", verified=" + verified);

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
