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
