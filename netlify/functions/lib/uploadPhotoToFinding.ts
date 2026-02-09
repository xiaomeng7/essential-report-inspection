/**
 * Upload a base64 photo to a finding and update the inspection.
 * Used by submitInspection (room photos) and saveCustomFindings (custom finding photos).
 * Photo id is allocated from inspection-global counter (P01, P02, ...); retry on collision.
 */

import type { HandlerEvent } from "@netlify/functions";
import { get, save, savePhoto, allocatePhotoId, photoKeyExists, type PhotoMetadata } from "./store";
import { upsertInspectionPhotos, touchInspectionUpdatedAt } from "./dbInspectionsCore";
import { isDbConfigured } from "./db";

const MAX_PHOTOS_PER_FINDING = 2;
const ALLOCATE_RETRIES = 3;

export async function uploadPhotoToFinding(
  inspection_id: string,
  finding_id: string,
  imageBase64: string,
  caption: string,
  event?: HandlerEvent
): Promise<string> {
  const base64Match = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
  const b64 = base64Match ? base64Match[2] : imageBase64;
  let ext = "jpg";
  if (base64Match && (base64Match[1] === "png" || base64Match[1] === "jpeg")) {
    ext = base64Match[1] === "png" ? "png" : "jpg";
  }
  const imageBuffer = Buffer.from(b64, "base64");

  const inspection = await get(inspection_id, event);
  if (!inspection) throw new Error(`Inspection ${inspection_id} not found`);

  const finding = inspection.findings.find((f) => f.id === finding_id);
  if (!finding) throw new Error(`Finding ${finding_id} not found`);

  const existingPhotoIds = Array.isArray((finding as any).photo_ids) ? ((finding as any).photo_ids as string[]) : [];
  if (existingPhotoIds.length >= MAX_PHOTOS_PER_FINDING) {
    throw new Error(`Max ${MAX_PHOTOS_PER_FINDING} photos per finding`);
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
    throw new Error("Could not allocate unique photo id after " + ALLOCATE_RETRIES + " retries");
  }

  const metadata: PhotoMetadata = {
    photo_id: photoId,
    inspection_id,
    finding_id,
    caption: String(caption).trim() || "Photo evidence",
    created_at: new Date().toISOString(),
    blob_key: `photos/${inspection_id}/${photoId}.${ext}`,
  };

  await savePhoto(inspection_id, photoId, imageBuffer, metadata, event, ext);

  const newPhotoIds = [...existingPhotoIds, photoId];
  (finding as any).photo_ids = newPhotoIds;
  await save(inspection_id, inspection, event);

  // Best-effort DB persistence (non-blocking)
  try {
    if (isDbConfigured()) {
      await upsertInspectionPhotos(inspection_id, [{
        photo_id: photoId,
        finding_id: finding_id,
        room_name: (finding as any).location || null,
        caption: metadata.caption || null,
        blob_key: metadata.blob_key || null,
      }]);
      await touchInspectionUpdatedAt(inspection_id);
    }
  } catch (e) {
    console.error("[db-inspections] upsertInspectionPhotos failed (non-fatal):", e instanceof Error ? e.message : String(e));
  }

  return photoId;
}
