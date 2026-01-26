import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

function findRulesPath(): string {
  const possiblePaths = [
    path.join(process.cwd(), "rules.yml"),
    path.join(process.cwd(), "..", "rules.yml"),
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

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  // Simple authentication check (you should implement proper auth)
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const expectedToken = process.env.ADMIN_TOKEN || "admin-secret-token-change-me";
  
  if (authHeader !== `Bearer ${expectedToken}`) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Unauthorized" }),
    };
  }

  if (event.httpMethod === "GET") {
    try {
      const rulesPath = findRulesPath();
      let content: string;
      if (fs.existsSync(rulesPath)) {
        content = fs.readFileSync(rulesPath, "utf8");
      } else {
        // Netlify Functions 往往找不到 rules.yml，改用内嵌规则，避免 404
        const { EMBEDDED_RULES_YAML } = await import("./lib/rules");
        content = EMBEDDED_RULES_YAML;
      }
      const rules = yaml.load(content);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules, yaml: content }),
      };
    } catch (e) {
      console.error("Error reading rules:", e);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to read rules", message: e instanceof Error ? e.message : String(e) }),
      };
    }
  }

  // Convert JSON rules to YAML endpoint
  const pathRaw = event.path ?? "";
  if (event.httpMethod === "POST" && (pathRaw.endsWith("/json-to-yaml") || pathRaw.includes("/json-to-yaml"))) {
    try {
      const body = JSON.parse(event.body ?? "{}");
      const { rules } = body;
      if (!rules || typeof rules !== "object") {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing or invalid rules object" }),
        };
      }
      const yamlContent = yaml.dump(rules, { indent: 2, lineWidth: 120, quotingType: '"' });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: yamlContent }),
      };
    } catch (e) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to convert to YAML", message: e instanceof Error ? e.message : String(e) }),
      };
    }
  }

  // Format YAML endpoint（必须在 POST 保存之前判断 path）
  if (event.httpMethod === "POST" && (pathRaw.endsWith("/format") || pathRaw.includes("/format"))) {
    try {
      const body = JSON.parse(event.body ?? "{}");
      const { yaml: yamlContent } = body;
      if (!yamlContent || typeof yamlContent !== "string") {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing or invalid yaml content" }),
        };
      }
      const parsed = yaml.load(yamlContent);
      const formatted = yaml.dump(parsed, { indent: 2, lineWidth: 120, quotingType: '"' });
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: formatted }),
      };
    } catch (e) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid YAML", message: e instanceof Error ? e.message : String(e) }),
      };
    }
  }

  if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
    try {
      const body = JSON.parse(event.body ?? "{}");
      const { yaml: yamlContent } = body;
      if (!yamlContent || typeof yamlContent !== "string") {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing or invalid yaml content" }),
        };
      }
      try {
        yaml.load(yamlContent);
      } catch (yamlError) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Invalid YAML", message: yamlError instanceof Error ? yamlError.message : String(yamlError) }),
        };
      }
      const rulesPath = findRulesPath();
      if (fs.existsSync(rulesPath)) {
        const backupPath = `${rulesPath}.backup.${Date.now()}`;
        fs.copyFileSync(rulesPath, backupPath);
      }
      fs.writeFileSync(rulesPath, yamlContent, "utf8");
      try {
        const { clearRulesCache } = await import("./lib/rules");
        clearRulesCache();
      } catch {
        /* ignore */
      }
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, message: "Rules updated successfully" }),
      };
    } catch (e) {
      console.error("Error saving rules:", e);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to save rules", message: e instanceof Error ? e.message : String(e) }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Method Not Allowed" }),
  };
};
