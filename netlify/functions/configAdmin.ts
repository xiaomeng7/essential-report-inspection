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

function findFindingProfilesPath(): string {
  const possiblePaths = [
    path.join(__dirname, "..", "..", "profiles", "finding_profiles.yml"),
    path.join(__dirname, "finding_profiles.yml"),
    path.join(process.cwd(), "profiles", "finding_profiles.yml"),
    path.join(process.cwd(), "netlify", "functions", "finding_profiles.yml"),
    "/opt/build/repo/profiles/finding_profiles.yml",
    "/var/task/finding_profiles.yml",
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
    path.join(__dirname, "..", "..", "netlify", "functions", "responses.yml"),
    path.join(__dirname, "..", "..", "responses.yml"),
    path.join(process.cwd(), "netlify", "functions", "responses.yml"),
    path.join(process.cwd(), "responses.yml"),
    "/opt/build/repo/netlify/functions/responses.yml",
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
// IMPORTANT: Prioritize Blob Store to preserve user edits (user edits are saved to Blob Store)
async function loadConfig(event: HandlerEvent, type: "rules" | "mapping" | "responses" | "finding_profiles"): Promise<{ content: string; source: "file" | "blob" }> {
  // Determine file path (for fallback)
  let filePath: string;
  if (type === "rules") {
    filePath = findRulesPath();
  } else if (type === "mapping") {
    filePath = findMappingPath();
  } else if (type === "finding_profiles") {
    filePath = findFindingProfilesPath();
  } else {
    filePath = findResponsesPath();
  }

  // PRIORITY 1: Try blob store first (user-saved versions - these take precedence)
  const blobStore = getConfigStore(event);
  const blobKey = `${type}.${type === "mapping" ? "json" : "yml"}`;
  
  try {
    const blobContent = await blobStore.get(blobKey, { type: "text" });
    if (blobContent && blobContent.trim().length > 0) {
      console.log(`✅ Loaded ${type} from blob store (user edits): ${blobKey} (${blobContent.length} chars)`);
      return { content: blobContent, source: "blob" };
    } else if (blobContent) {
      console.warn(`⚠️ Blob ${blobKey} exists but is empty`);
    }
  } catch (e) {
    console.warn(`Failed to load ${type} from blob:`, e);
  }

  // PRIORITY 2: Fallback to file system (default/initial content)
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      // Only return file content if it's not empty
      if (content && content.trim().length > 0) {
        console.log(`✅ Loaded ${type} from file system (default): ${filePath} (${content.length} chars)`);
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

  // Return empty defaults only if both blob and file are unavailable
  console.warn(`⚠️ No content found for ${type}, returning empty default`);
  if (type === "mapping") {
    return { content: JSON.stringify({ version: "1.0", description: "", mappings: [] }, null, 2), source: "file" };
  }
  return { content: "", source: "file" };
}

// Save to blob store
async function saveConfig(event: HandlerEvent, type: "rules" | "mapping" | "responses" | "finding_profiles", content: string): Promise<void> {
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

/** Build merged dimensions view from rules + finding_profiles + responses */
function buildDimensionsData(
  rulesData: { hard_overrides?: Record<string, unknown>; findings?: Record<string, { safety?: string; urgency?: string; liability?: string }> },
  profilesData: { finding_profiles?: Record<string, { risk?: { safety?: string; escalation?: string }; default_priority?: string; risk_severity?: number; likelihood?: number; budget?: string; budget_band?: string; messaging?: { title?: string } }> },
  responsesData: { findings?: Record<string, { budgetary_range?: { low?: number; high?: number }; default_priority?: string }> }
): { findings: Record<string, Record<string, unknown>>; missing: Array<{ id: string; missing: string[] }> } {
  const allIds = new Set<string>();
  if (rulesData.findings) Object.keys(rulesData.findings).forEach((k) => allIds.add(k));
  if (rulesData.hard_overrides) {
    Object.keys(rulesData.hard_overrides).forEach((k) => {
      if (k !== "priority_bucket" && k !== "findings" && rulesData.hard_overrides![k]) allIds.add(k);
    });
  }
  if (profilesData.finding_profiles) Object.keys(profilesData.finding_profiles).forEach((k) => allIds.add(k));
  if (responsesData.findings) Object.keys(responsesData.findings).forEach((k) => allIds.add(k));

  const findings: Record<string, Record<string, unknown>> = {};
  const missing: Array<{ id: string; missing: string[] }> = [];

  const getRules = (id: string) => {
    const ho = rulesData.hard_overrides?.[id] as { safety?: string; urgency?: string; liability?: string } | undefined;
    if (ho && typeof ho === "object") return ho;
    return rulesData.findings?.[id];
  };

  for (const id of allIds) {
    const pf = profilesData.finding_profiles?.[id];
    const resp = responsesData.findings?.[id];
    const rulesEntry = getRules(id);

    const safety = rulesEntry?.safety ?? pf?.risk?.safety ?? "";
    const urgency = rulesEntry?.urgency ?? "";
    const liability = rulesEntry?.liability ?? "";
    const budgetLow = resp?.budgetary_range?.low ?? null;
    const budgetHigh = resp?.budgetary_range?.high ?? null;
    const priority = pf?.default_priority ?? resp?.default_priority ?? "";
    const severity = pf?.risk_severity ?? null;
    const likelihood = pf?.likelihood ?? null;
    const escalation = pf?.risk?.escalation ?? "";

    const gaps: string[] = [];
    if (!safety && !pf?.risk?.safety) gaps.push("Safety");
    if (!urgency) gaps.push("Urgency");
    if (!liability) gaps.push("Liability");
    if (budgetLow == null && budgetHigh == null && !pf?.budget_band && !pf?.budget) gaps.push("Budget");
    if (!priority) gaps.push("Priority");
    if (severity == null) gaps.push("Severity");
    if (likelihood == null) gaps.push("Likelihood");
    if (!escalation) gaps.push("Escalation");

    if (gaps.length > 0) missing.push({ id, missing: gaps });

    findings[id] = {
      safety,
      urgency,
      liability,
      budget_low: budgetLow,
      budget_high: budgetHigh,
      priority,
      severity: severity ?? "",
      likelihood: likelihood ?? "",
      escalation,
      title: pf?.messaging?.title ?? id.replace(/_/g, " "),
      missing: gaps,
    };
  }

  return { findings, missing };
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

  // Handle dimensions endpoint (merged view + save)
  if (pathRaw.includes("/dimensions")) {
    try {
      if (event.httpMethod === "GET") {
        const [rulesResult, profilesResult, responsesResult] = await Promise.all([
          loadConfig(event, "rules"),
          loadConfig(event, "finding_profiles").catch(() => {
            const fp = findFindingProfilesPath();
            return { content: fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : "finding_profiles: {}", source: "file" as const };
          }),
          loadConfig(event, "responses"),
        ]);
        const profilesContent = profilesResult.content || "finding_profiles: {}";
        const rulesData = (yaml.load(rulesResult.content) || {}) as Parameters<typeof buildDimensionsData>[0];
        const profilesData = (yaml.load(profilesContent) || {}) as Parameters<typeof buildDimensionsData>[1];
        const responsesData = (yaml.load(responsesResult.content) || {}) as Parameters<typeof buildDimensionsData>[2];
        const { findings, missing } = buildDimensionsData(rulesData, profilesData, responsesData);
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ findings, missing }),
        };
      }
      if (event.httpMethod === "POST") {
        const body = JSON.parse(event.body ?? "{}");
        const { findings: edits } = body;
        if (!edits || typeof edits !== "object") {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Missing findings object" }),
          };
        }
        const [rulesResult, profilesResult, responsesResult] = await Promise.all([
          loadConfig(event, "rules"),
          loadConfig(event, "finding_profiles").catch(() => {
            const fp = findFindingProfilesPath();
            return { content: fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : "finding_profiles: {}", source: "file" as const };
          }),
          loadConfig(event, "responses"),
        ]);
        const profilesContent = profilesResult.content || "finding_profiles: {}";
        const rulesData = yaml.load(rulesResult.content) as Record<string, unknown> & { findings?: Record<string, unknown>; hard_overrides?: Record<string, unknown> };
        const profilesData = yaml.load(profilesContent) as Record<string, unknown> & { finding_profiles?: Record<string, Record<string, unknown>> };
        const responsesData = yaml.load(responsesResult.content) as Record<string, unknown> & { findings?: Record<string, Record<string, unknown>> };

        for (const [id, row] of Object.entries(edits) as [string, Record<string, unknown>][]) {
          const s = String(row.safety ?? "").trim();
          const u = String(row.urgency ?? "").trim();
          const l = String(row.liability ?? "").trim();
          if (s || u || l) {
            const entry = { ...(s && { safety: s }), ...(u && { urgency: u }), ...(l && { liability: l }) };
            const ho = rulesData.hard_overrides as Record<string, unknown> | undefined;
            if (ho && ho[id] && typeof ho[id] === "object" && ho[id] !== null) {
              (ho[id] as Record<string, string>) = { ...(ho[id] as Record<string, string>), ...entry };
            }
            if (!rulesData.findings) rulesData.findings = {};
            (rulesData.findings as Record<string, Record<string, string>>)[id] = {
              ...((rulesData.findings as Record<string, Record<string, string>>)[id] || {}),
              ...entry,
            };
          }
          if (!profilesData.finding_profiles) profilesData.finding_profiles = {};
          const p = profilesData.finding_profiles[id] || (profilesData.finding_profiles[id] = {});
          if (row.severity != null && row.severity !== "") p.risk_severity = Number(row.severity) || undefined;
          if (row.likelihood != null && row.likelihood !== "") p.likelihood = Number(row.likelihood) || undefined;
          if (row.escalation) p.risk = { ...(p.risk as object || {}), escalation: String(row.escalation) } as Record<string, string>;
          if (row.priority) p.default_priority = String(row.priority);
          if (row.safety && !(rulesData.findings as Record<string, unknown>)?.[id]) p.risk = { ...(p.risk as object || {}), safety: String(row.safety) } as Record<string, string>;
          if (row.budget_low != null || row.budget_high != null) {
            if (!responsesData.findings) responsesData.findings = {};
            const r = responsesData.findings[id] || (responsesData.findings[id] = {});
            r.budgetary_range = r.budgetary_range || {};
            if (row.budget_low != null) (r.budgetary_range as Record<string, number>).low = Number(row.budget_low);
            if (row.budget_high != null) (r.budgetary_range as Record<string, number>).high = Number(row.budget_high);
          }
        }

        const rulesYaml = yaml.dump(rulesData, { indent: 2, lineWidth: 120, sortKeys: false });
        const profilesYaml = yaml.dump(profilesData, { indent: 2, lineWidth: 120, sortKeys: false });
        const responsesYaml = yaml.dump(responsesData, { indent: 2, lineWidth: 120, sortKeys: false });

        await saveConfig(event, "rules", rulesYaml);
        await saveConfig(event, "responses", responsesYaml);
        await saveConfig(event, "finding_profiles", profilesYaml);

        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ success: true, message: "Dimensions saved" }),
        };
      }
    } catch (e) {
      console.error("Dimensions error:", e);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Dimensions failed", message: e instanceof Error ? e.message : String(e) }),
      };
    }
  }

  const configType = pathRaw.includes("/mapping") ? "mapping" : pathRaw.includes("/responses") ? "responses" : "rules";
  
  // Check for force reload from file system
  // Netlify Functions queryStringParameters is an object, not a string
  const forceReload = event.queryStringParameters?.forceReload === "true" || 
                      (event.queryStringParameters && Object.values(event.queryStringParameters).includes("true"));

  // GET: Load configuration
  if (event.httpMethod === "GET") {
    try {
      console.log(`📥 Loading ${configType}, forceReload: ${forceReload}`);
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
        
        console.log(`🔍 Looking for file at: ${filePath}`);
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, "utf8");
          source = "file";
          console.log(`✅ Force reloaded ${configType} from file: ${filePath} (${content.length} chars)`);
        } else {
          const errorMsg = `File not found: ${filePath}`;
          console.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
      } else {
        const result = await loadConfig(event, configType);
        content = result.content;
        source = result.source;
        console.log(`✅ Loaded ${configType} from ${source} (${content.length} chars)`);
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
      const errorMsg = e instanceof Error ? e.message : String(e);
      const errorStack = e instanceof Error ? e.stack : undefined;
      console.error(`❌ Error loading ${configType}:`, errorMsg);
      console.error(`Stack:`, errorStack);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          error: `Failed to load ${configType}`, 
          message: errorMsg,
          ...(process.env.NETLIFY_DEV && { stack: errorStack }),
        }),
      };
    }
  }

  // Convert JSON to YAML endpoint
  if (event.httpMethod === "POST" && (pathRaw.includes("/json-to-yaml") || pathRaw.includes("/json-to-yaml"))) {
    try {
      const body = JSON.parse(event.body ?? "{}");
      const { data } = body;
      if (!data || typeof data !== "object") {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing or invalid data object" }),
        };
      }
      
      const yamlContent = yaml.dump(data, { 
        indent: 2, 
        lineWidth: 120, 
        quotingType: '"',
        noRefs: true,
        sortKeys: false,
      });
      
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: yamlContent }),
      };
    } catch (e) {
      console.error("Error converting to YAML:", e);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to convert to YAML", message: e instanceof Error ? e.message : String(e) }),
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
