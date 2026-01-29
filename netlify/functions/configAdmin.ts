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
    path.join(__dirname, "..", "..", "CHECKLIST_TO_FINDINGS_MAP.json"), // Root of project
    path.join(process.cwd(), "CHECKLIST_TO_FINDINGS_MAP.json"),
    path.join(process.cwd(), "netlify", "functions", "CHECKLIST_TO_FINDINGS_MAP.json"),
    "/opt/build/repo/CHECKLIST_TO_FINDINGS_MAP.json",
    "/var/task/CHECKLIST_TO_FINDINGS_MAP.json",
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        console.log(`✅ Found mapping file at: ${p}`);
        return p;
      }
    } catch {
      /* continue */
    }
  }
  console.warn(`⚠️ Mapping file not found in any of: ${possiblePaths.join(", ")}`);
  return possiblePaths[0];
}

function findResponsesPath(): string {
  const possiblePaths = [
    path.join(__dirname, "..", "..", "responses.yml"), // Root of project
    path.join(process.cwd(), "responses.yml"),
    path.join(process.cwd(), "netlify", "functions", "responses.yml"),
    "/opt/build/repo/responses.yml",
    "/var/task/responses.yml",
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        console.log(`✅ Found responses file at: ${p}`);
        return p;
      }
    } catch {
      /* continue */
    }
  }
  console.warn(`⚠️ Responses file not found in any of: ${possiblePaths.join(", ")}`);
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
  // Determine file path
  let filePath: string;
  if (type === "rules") {
    filePath = findRulesPath();
  } else if (type === "mapping") {
    filePath = findMappingPath();
  } else {
    filePath = findResponsesPath();
  }

  // Try file system first (source of truth)
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      // Only return file content if it's not empty
      if (content && content.trim().length > 0) {
        console.log(`✅ Loaded ${type} from file system: ${filePath} (${content.length} chars)`);
        return { content, source: "file" };
      } else {
        console.warn(`⚠️ File ${filePath} exists but is empty`);
      }
    } else {
      console.warn(`⚠️ File not found: ${filePath}`);
    }
  } catch (e) {
    console.warn(`Failed to load ${type} from file ${filePath}:`, e);
  }

  // Fallback to blob store (user-saved versions)
  const blobStore = getConfigStore(event);
  const blobKey = `${type}.${type === "mapping" ? "json" : "yml"}`;
  
  try {
    const blobContent = await blobStore.get(blobKey, { type: "text" });
    if (blobContent && blobContent.trim().length > 0) {
      console.log(`✅ Loaded ${type} from blob store: ${blobKey} (${blobContent.length} chars)`);
      return { content: blobContent, source: "blob" };
    } else if (blobContent) {
      console.warn(`⚠️ Blob ${blobKey} exists but is empty`);
    }
  } catch (e) {
    console.warn(`Failed to load ${type} from blob:`, e);
  }

  // Return empty defaults only if both file and blob are unavailable
  console.warn(`⚠️ No content found for ${type}, returning empty default`);
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
  
  // Check for force reload from file system
  const queryParams = new URLSearchParams(event.queryStringParameters || "");
  const forceReload = queryParams.get("forceReload") === "true";

  // GET: Load configuration
  if (event.httpMethod === "GET") {
    try {
      let content: string;
      let source: "file" | "blob";
      
      if (forceReload) {
        // Force reload from file system, ignore blob store
        let filePath: string;
        if (configType === "rules") {
          filePath = findRulesPath();
        } else if (configType === "mapping") {
          filePath = findMappingPath();
        } else {
          filePath = findResponsesPath();
        }
        
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, "utf8");
          source = "file";
          console.log(`🔄 Force reloaded ${configType} from file: ${filePath} (${content.length} chars)`);
        } else {
          throw new Error(`File not found: ${filePath}`);
        }
      } else {
        const result = await loadConfig(event, configType);
        content = result.content;
        source = result.source;
      }
      
      if (configType === "mapping") {
        try {
          const parsed = JSON.parse(content);
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, parsed, source }),
          };
        } catch (e) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Invalid JSON", message: e instanceof Error ? e.message : String(e) }),
          };
        }
      } else {
        try {
          const parsed = yaml.load(content);
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, parsed, source }),
          };
        } catch (e) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Invalid YAML", message: e instanceof Error ? e.message : String(e) }),
          };
        }
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
