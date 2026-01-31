import { connectLambda, getStore } from "@netlify/blobs";
import type { HandlerEvent } from "@netlify/functions";

export type StoredInspection = {
  inspection_id: string;
  raw: Record<string, unknown>;
  report_html: string;
  findings: Array<{ id: string; priority: string; title?: string }>;
  limitations: string[];
};

// Get Netlify Blobs store instance
// Note: connectLambda must be called in the handler before using getStore
function getInspectionStore(event?: HandlerEvent) {
  if (event) {
    connectLambda(event);
  }
  return getStore({
    name: "inspections",
    consistency: "eventual", // Eventual consistency is sufficient for inspection reports
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

export async function get(id: string, event?: HandlerEvent): Promise<StoredInspection | undefined> {
  // Check cache first
  if (cache.has(id)) {
    console.log(`Retrieved inspection ${id} from cache`);
    return cache.get(id);
  }
  
  try {
    const store = getInspectionStore(event);
    const data = await store.get(id, { type: "text" });
    
    if (data) {
      const parsed = JSON.parse(data) as StoredInspection;
      cache.set(id, parsed); // Cache for next time
      console.log(`Retrieved inspection ${id} from Netlify Blobs`);
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

function getPhotoStore(event?: HandlerEvent, strongRead = false) {
  if (event) {
    connectLambda(event);
  }
  return getStore({
    name: "inspection-photos",
    consistency: strongRead ? "strong" : "eventual",
  });
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
  console.log(`Saved photo ${photoId} for inspection ${inspectionId}`);
}

export async function getPhotoMetadata(
  inspectionId: string,
  photoId: string,
  event?: HandlerEvent
): Promise<PhotoMetadata | undefined> {
  const store = getPhotoStore(event, true);
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
  const store = getPhotoStore(event, true);
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
