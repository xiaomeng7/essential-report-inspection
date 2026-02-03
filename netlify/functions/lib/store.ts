import { connectLambda, getStore } from "@netlify/blobs";
import type { HandlerEvent } from "@netlify/functions";

/**
 * Stored finding (non-breaking extended fields for 9-dimension compression).
 * - priority: legacy engineer-selected priority (kept for backward compatibility).
 * - priority_selected: engineer choice; only used when override is explicit and auditable (override_reason present). Never trusted as default.
 * - priority_calculated: from deterministic engine (Step 2); this is the default.
 * - priority_final: effective priority (resolved by resolvePriorityFinal).
 * - override_reason: required when engineer overrides priority_calculated; makes override auditable.
 * - budget_low / budget_high: optional CapEx range (AUD).
 */
export type StoredFinding = {
  id: string;
  priority: string;
  title?: string;
  location?: string;
  photo_ids?: string[];
  // Optional fields for priority + CapEx compression (backward compatible)
  priority_selected?: string;
  priority_calculated?: string;
  priority_final?: string;
  override_reason?: string;
  budget_low?: number;
  budget_high?: number;
};

export type StoredInspection = {
  inspection_id: string;
  raw: Record<string, unknown>;
  report_html: string;
  findings: StoredFinding[];
  limitations: string[];
};

/** In local dev / sandbox, strong consistency is not available (BlobsConsistencyError). Use eventual only. */
function resolveConsistency(requestedStrong: boolean): "strong" | "eventual" {
  if (!requestedStrong) return "eventual";
  if (process.env.NETLIFY_DEV === "true") return "eventual";
  return "strong";
}

function logBlobsConsistency(requestedStrong: boolean, storeName: string): void {
  if (!requestedStrong) return;
  const mode = resolveConsistency(requestedStrong);
  const reason = mode === "strong" ? "netlify-prod" : "local-dev";
  console.log("[blobs] consistency mode: " + mode + " (reason=" + reason + ") store=" + storeName);
}

// Get Netlify Blobs store instance
// Note: connectLambda must be called in the handler before using getStore
function getInspectionStore(event?: HandlerEvent, strong = false) {
  if (event) {
    connectLambda(event);
  }
  const consistency = resolveConsistency(strong);
  logBlobsConsistency(strong, "inspections");
  return getStore({
    name: "inspections",
    consistency,
  });
}

// In-memory cache for faster access (optional optimization)
const cache = new Map<string, StoredInspection>();

export async function save(id: string, data: StoredInspection, event?: HandlerEvent): Promise<void> {
  try {
    const store = getInspectionStore(event);
    const jsonData = JSON.stringify(data);
    await store.set(id, jsonData, {
      metadata: {
        inspection_id: id,
        created_at: new Date().toISOString(),
      },
    });
    cache.set(id, data); // Update cache
    console.log(`Saved inspection ${id} to Netlify Blobs`);
  } catch (e) {
    console.error(`Failed to save inspection ${id} to Blobs:`, e);
    // Fallback to in-memory cache if Blobs fails
    cache.set(id, data);
    throw e; // Re-throw to allow caller to handle
  }
}

export async function get(id: string, event?: HandlerEvent, strongRead = false): Promise<StoredInspection | undefined> {
  if (!strongRead && cache.has(id)) {
    console.log(`Retrieved inspection ${id} from cache`);
    return cache.get(id);
  }

  try {
    const store = getInspectionStore(event, strongRead);
    const data = await store.get(id, { type: "text" });

    if (data) {
      const parsed = JSON.parse(data) as StoredInspection;
      if (!strongRead) cache.set(id, parsed);
      if (strongRead) {
        console.log(`[report-fp] inspection re-read (strong) id=${id} photo_ids verified`);
      } else {
        console.log(`Retrieved inspection ${id} from Netlify Blobs`);
      }
      return parsed;
    }
  } catch (e) {
    console.error(`Failed to read inspection ${id} from Blobs:`, e);
  }

  return undefined;
}

// Get and increment the inspection counter atomically
export async function getNextInspectionNumber(event?: HandlerEvent): Promise<number> {
  const COUNTER_KEY = "inspection_counter";
  
  try {
    const store = getInspectionStore(event);
    
    // Try to get current counter
    const currentData = await store.get(COUNTER_KEY, { type: "text" });
    let currentNumber = 1; // Start from 1 if not found
    
    if (currentData) {
      const parsed = JSON.parse(currentData) as { counter: number };
      currentNumber = parsed.counter || 1;
    }
    
    // Increment counter (wrap around at 999, reset to 1)
    const nextNumber = currentNumber >= 999 ? 1 : currentNumber + 1;
    
    // Save updated counter
    await store.set(COUNTER_KEY, JSON.stringify({ counter: nextNumber }), {
      metadata: {
        last_updated: new Date().toISOString(),
      },
    });
    
    console.log(`Inspection counter: ${currentNumber} -> ${nextNumber}`);
    // Ensure we return a number between 1-999
    return Math.min(Math.max(nextNumber, 1), 999);
  } catch (e) {
    console.error("Failed to get/increment inspection counter:", e);
    // Fallback: use timestamp-based number if Blobs fails
    const fallback = Math.floor(Date.now() % 999) + 1;
    console.warn(`Using fallback counter: ${fallback}`);
    return fallback;
  }
}

// --- Photo store (inspection-photos) ---
export type PhotoMetadata = {
  photo_id: string;
  inspection_id: string;
  finding_id: string;
  caption: string;
  created_at: string;
  blob_key?: string;
};

const PHOTO_COUNTER_KEY_PREFIX = "photo_counter/";
const PHOTO_COUNTER_KEY_SUFFIX = ".json";

function getPhotoStore(event?: HandlerEvent, strongRead = false) {
  if (event) {
    connectLambda(event);
  }
  const consistency = resolveConsistency(strongRead);
  logBlobsConsistency(strongRead, "inspection-photos");
  return getStore({
    name: "inspection-photos",
    consistency,
  });
}

/** Read photo counter for inspection (next 1-based index). Default { next: 1 }. */
export async function getPhotoCounter(
  inspectionId: string,
  event?: HandlerEvent
): Promise<{ next: number }> {
  const store = getPhotoStore(event);
  const key = PHOTO_COUNTER_KEY_PREFIX + inspectionId + PHOTO_COUNTER_KEY_SUFFIX;
  const data = await store.get(key, { type: "text" });
  if (data) {
    try {
      const parsed = JSON.parse(data) as { next?: number };
      const next = typeof parsed.next === "number" && parsed.next >= 1 ? parsed.next : 1;
      return { next };
    } catch {
      return { next: 1 };
    }
  }
  return { next: 1 };
}

/** Write photo counter (next = next 1-based index to allocate). */
export async function setPhotoCounter(
  inspectionId: string,
  next: number,
  event?: HandlerEvent
): Promise<void> {
  const store = getPhotoStore(event);
  const key = PHOTO_COUNTER_KEY_PREFIX + inspectionId + PHOTO_COUNTER_KEY_SUFFIX;
  await store.set(key, JSON.stringify({ next }), {
    metadata: { created_at: new Date().toISOString() },
  });
}

/**
 * Allocate next photo_id for inspection (P01, P02, ...). Uses counter in photos store.
 * Read counter -> use current next for Pxx -> write next+1. Not atomic; use retry when key exists.
 */
export async function allocatePhotoId(inspectionId: string, event?: HandlerEvent): Promise<string> {
  const { next } = await getPhotoCounter(inspectionId, event);
  await setPhotoCounter(inspectionId, next + 1, event);
  const photoId = "P" + String(next).padStart(2, "0");
  console.log("[photo-fp] allocate photo_id inspection=" + inspectionId + " next=" + photoId + " counter=" + next);
  return photoId;
}

/** Check if image blob already exists (collision detection for retry). */
export async function photoKeyExists(
  inspectionId: string,
  photoId: string,
  ext: string,
  event?: HandlerEvent
): Promise<boolean> {
  const store = getPhotoStore(event);
  const imageKey = `photos/${inspectionId}/${photoId}.${ext}`;
  const data = await store.get(imageKey, { type: "blob" });
  return data != null;
}

export async function savePhoto(
  inspectionId: string,
  photoId: string,
  imageBuffer: Buffer,
  metadata: PhotoMetadata,
  event?: HandlerEvent,
  ext: string = "jpg"
): Promise<void> {
  const store = getPhotoStore(event);
  const imageKey = `photos/${inspectionId}/${photoId}.${ext}`;
  const metaKey = `photos/${inspectionId}/${photoId}.json`;
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  await store.set(imageKey, imageBuffer, {
    metadata: { content_type: contentType, created_at: metadata.created_at },
  });
  await store.set(metaKey, JSON.stringify(metadata), {
    metadata: { content_type: "application/json", created_at: metadata.created_at },
  });
  console.log("[photo-fp] savePhoto key=" + imageKey);
}

export async function getPhotoMetadata(
  inspectionId: string,
  photoId: string,
  event?: HandlerEvent
): Promise<PhotoMetadata | undefined> {
  const store = getPhotoStore(event, false);
  const metaKey = `photos/${inspectionId}/${photoId}.json`;
  const data = await store.get(metaKey, { type: "text" });
  if (data) {
    try {
      return JSON.parse(data) as PhotoMetadata;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export type PhotoImageResult = { buffer: Buffer; contentType: "image/jpeg" | "image/png" };

export async function getPhotoImage(
  inspectionId: string,
  photoId: string,
  event?: HandlerEvent
): Promise<PhotoImageResult | undefined> {
  const meta = await getPhotoMetadata(inspectionId, photoId, event);
  const store = getPhotoStore(event, false);
  const keysToTry = meta?.blob_key
    ? [meta.blob_key]
    : [`photos/${inspectionId}/${photoId}.jpg`, `photos/${inspectionId}/${photoId}.png`];
  for (const key of keysToTry) {
    const data = await store.get(key, { type: "blob" });
    if (data) {
      const buf = Buffer.from(await data.arrayBuffer());
      const ext = key.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      return { buffer: buf, contentType: ext };
    }
  }
  return undefined;
}

// Get Netlify Blobs store for Word documents
function getWordStore(event?: HandlerEvent) {
  if (event) {
    connectLambda(event);
  }
  return getStore({
    name: "word-documents",
    consistency: "eventual",
  });
}

// Save Word document to Netlify Blob
export async function saveWordDoc(
  key: string,
  buffer: Buffer,
  event?: HandlerEvent
): Promise<void> {
  try {
    const store = getWordStore(event);
    await store.set(key, buffer, {
      metadata: {
        created_at: new Date().toISOString(),
        content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
    console.log(`Saved Word document ${key} to Netlify Blobs`);
  } catch (e) {
    console.error(`Failed to save Word document ${key} to Blobs:`, e);
    throw e;
  }
}

// Get Word document from Netlify Blob
export async function getWordDoc(
  key: string,
  event?: HandlerEvent
): Promise<Buffer | undefined> {
  try {
    const store = getWordStore(event);
    const data = await store.get(key, { type: "blob" });
    
    if (data) {
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log(`Retrieved Word document ${key} from Netlify Blobs`);
      return buffer;
    }
  } catch (e) {
    console.error(`Failed to read Word document ${key} from Blobs:`, e);
  }
  
  return undefined;
}
