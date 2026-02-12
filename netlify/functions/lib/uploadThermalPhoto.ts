/**
 * Upload a base64 thermal/visible photo to inspection-photos store.
 * Used by submitInspection for thermal captures.
 * Does NOT require inspection document to exist; only needs inspection_id for photo counter and blob path.
 */

import type { HandlerEvent } from "@netlify/functions";
import { savePhoto, allocatePhotoId, photoKeyExists } from "./store";

const ALLOCATE_RETRIES = 3;

export async function uploadThermalPhoto(
  inspection_id: string,
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

  let photoId: string | null = null;
  for (let attempt = 0; attempt < ALLOCATE_RETRIES; attempt++) {
    const candidate = await allocatePhotoId(inspection_id, event);
    if (!(await photoKeyExists(inspection_id, candidate, ext, event))) {
      photoId = candidate;
      break;
    }
    console.log("[photo-fp] thermal photo collision for " + candidate + ", retry " + (attempt + 1) + "/" + ALLOCATE_RETRIES);
  }
  if (!photoId) {
    throw new Error("Could not allocate unique photo id for thermal after " + ALLOCATE_RETRIES + " retries");
  }

  const metadata = {
    photo_id: photoId,
    inspection_id,
    finding_id: "thermal",
    caption: String(caption).trim() || "Thermal capture",
    created_at: new Date().toISOString(),
    blob_key: `photos/${inspection_id}/${photoId}.${ext}`,
  };

  await savePhoto(inspection_id, photoId, imageBuffer, metadata, event, ext);
  console.log("[photo-fp] thermal photo saved inspection=" + inspection_id + " photo_id=" + photoId);
  return photoId;
}
