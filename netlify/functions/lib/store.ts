import fs from "fs";
import path from "path";
import os from "os";

export type StoredInspection = {
  inspection_id: string;
  raw: Record<string, unknown>;
  report_html: string;
  findings: Array<{ id: string; priority: string; title?: string }>;
  limitations: string[];
};

// Use /tmp directory for persistent storage (writable in Netlify Functions)
const STORE_DIR = path.join(os.tmpdir(), "inspection-store");

// Ensure store directory exists
function ensureStoreDir(): void {
  try {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
  } catch (e) {
    console.error("Failed to create store directory:", e);
  }
}

function getFilePath(id: string): string {
  // Sanitize ID to be filesystem-safe
  const safeId = id.replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(STORE_DIR, `${safeId}.json`);
}

// In-memory cache for faster access (optional optimization)
const cache = new Map<string, StoredInspection>();

export function save(id: string, data: StoredInspection): void {
  try {
    ensureStoreDir();
    const filePath = getFilePath(id);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    cache.set(id, data);
    console.log(`Saved inspection ${id} to ${filePath}`);
  } catch (e) {
    console.error(`Failed to save inspection ${id}:`, e);
    // Fallback to in-memory cache if file write fails
    cache.set(id, data);
  }
}

export function get(id: string): StoredInspection | undefined {
  // Check cache first
  if (cache.has(id)) {
    return cache.get(id);
  }
  
  try {
    const filePath = getFilePath(id);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(content) as StoredInspection;
      cache.set(id, data); // Cache for next time
      return data;
    }
  } catch (e) {
    console.error(`Failed to read inspection ${id}:`, e);
  }
  
  return undefined;
}
