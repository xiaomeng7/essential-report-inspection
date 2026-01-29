import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { connectLambda, getStore } from "@netlify/blobs";

// Get __dirname equivalent for ES modules
let __dirname: string;
try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else {
    __dirname = process.cwd();
  }
} catch (e) {
  console.warn("Could not determine __dirname from import.meta.url, using process.cwd()");
  __dirname = process.cwd();
}

// Authentication check
function checkAuth(event: HandlerEvent): boolean {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const expectedToken = process.env.ADMIN_TOKEN || "admin-secret-token-change-me";
  return authHeader === `Bearer ${expectedToken}`;
}

// Find file paths
function findRulesPath(): string {
  const possiblePaths = [
    path.join(process.cwd(), "rules.yml"),
    path.join(process.cwd(), "netlify", "functions", "rules.yml"),
    path.join(__dirname, "..", "..", "rules.yml"),
    "/var/task/rules.yml",
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* continue */
    }
  }
  return possiblePaths[0];
}

function findMappingPath(): string {
  const possiblePaths = [
    path.join(process.cwd(), "CHECKLIST_TO_FINDINGS_MAP.json"),
    path.join(process.cwd(), "netlify", "functions", "CHECKLIST_TO_FINDINGS_MAP.json"),
    path.join(__dirname, "..", "..", "CHECKLIST_TO_FINDINGS_MAP.json"),
    "/var/task/CHECKLIST_TO_FINDINGS_MAP.json",
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* continue */
    }
  }
  return possiblePaths[0];
}

function findResponsesPath(): string {
  const possiblePaths = [
    path.join(process.cwd(), "responses.yml"),
    path.join(process.cwd(), "netlify", "functions", "responses.yml"),
    path.join(__dirname, "..", "..", "responses.yml"),
    "/var/task/responses.yml",
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* continue */
    }
  }
  return possiblePaths[0];
}

// Get config store
function getConfigStore(event?: HandlerEvent) {
  if (event) {
    connectLambda(event);
  }
  return getStore({
    name: "config",
    consistency: "eventual",
  });
}

// Load from file or blob store
async function loadConfig(event: HandlerEvent, type: "rules" | "mapping" | "responses"): Promise<{ content: string; source: "file" | "blob" }> {
  // Try blob store first (for saved versions)
  const blobStore = getConfigStore(event);
  const blobKey = `${type}.${type === "mapping" ? "json" : "yml"}`;
  
  try {
    const blobContent = await blobStore.get(blobKey, { type: "text" });
    if (blobContent) {
      return { content: blobContent, source: "blob" };
    }
  } catch (e) {
    console.warn(`Failed to load ${type} from blob:`, e);
  }

  // Fallback to file system
  let filePath: string;
  if (type === "rules") {
    filePath = findRulesPath();
  } else if (type === "mapping") {
    filePath = findMappingPath();
  } else {
    filePath = findResponsesPath();
  }

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      return { content, source: "file" };
    }
  } catch (e) {
    console.warn(`Failed to load ${type} from file:`, e);
  }

  // Return empty defaults
  if (type === "mapping") {
    return { content: JSON.stringify({ version: "1.0", description: "", mappings: [] }, null, 2), source: "file" };
  }
  return { content: "", source: "file" };
}

// Save to blob store
async function saveConfig(event: HandlerEvent, type: "rules" | "mapping" | "responses", content: string): Promise<void> {
  const blobStore = getConfigStore(event);
  const blobKey = `${type}.${type === "mapping" ? "json" : "yml"}`;
  await blobStore.set(blobKey, content, {
    metadata: {
      updated_at: new Date().toISOString(),
      type,
    },
  });
  
  // Also save versioned copy with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const versionKey = `${type}.${timestamp}.${type === "mapping" ? "json" : "yml"}`;
  await blobStore.set(versionKey, content, {
    metadata: {
      updated_at: new Date().toISOString(),
      type,
      version: timestamp,
    },
  });
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (!checkAuth(event)) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  const pathRaw = event.path ?? "";
  const configType = pathRaw.includes("/mapping") ? "mapping" : pathRaw.includes("/responses") ? "responses" : "rules";

  // GET: Load configuration
  if (event.httpMethod === "GET") {
    try {
      const { content, source } = await loadConfig(event, configType);
      
      if (configType === "mapping") {
        const parsed = JSON.parse(content);
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, parsed, source }),
        };
      } else {
        const parsed = yaml.load(content);
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, parsed, source }),
        };
      }
    } catch (e) {
      console.error(`Error loading ${configType}:`, e);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: `Failed to load ${configType}`, 
          message: e instanceof Error ? e.message : String(e) 
        }),
      };
    }
  }

  // POST: Save configuration
  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body ?? "{}");
      const { content } = body;

      if (!content || typeof content !== "string") {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing or invalid content" }),
        };
      }

      // Validate content format
      if (configType === "mapping") {
        try {
          JSON.parse(content);
        } catch (e) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Invalid JSON", message: e instanceof Error ? e.message : String(e) }),
          };
        }
      } else {
        try {
          yaml.load(content);
        } catch (e) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Invalid YAML", message: e instanceof Error ? e.message : String(e) }),
          };
        }
      }

      // Save to blob store
      await saveConfig(event, configType, content);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, message: `${configType} saved successfully` }),
      };
    } catch (e) {
      console.error(`Error saving ${configType}:`, e);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: `Failed to save ${configType}`, 
          message: e instanceof Error ? e.message : String(e) 
        }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};
