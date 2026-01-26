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
