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
        return {
          statusCode: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "rules.yml not found" }),
        };
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

      // Validate YAML
      try {
        yaml.load(yamlContent);
      } catch (yamlError) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Invalid YAML", message: yamlError instanceof Error ? yamlError.message : String(yamlError) }),
        };
      }

      // In production, you might want to write to a database or version control
      // For now, we'll write to the file system (works in Netlify Functions with writable storage)
      const rulesPath = findRulesPath();
      
      // Create backup
      if (fs.existsSync(rulesPath)) {
        const backupPath = `${rulesPath}.backup.${Date.now()}`;
        fs.copyFileSync(rulesPath, backupPath);
      }

      // Write new content
      fs.writeFileSync(rulesPath, yamlContent, "utf8");

      // Clear cache (if rules are cached)
      try {
        const { clearRulesCache } = await import("./lib/rules");
        clearRulesCache();
      } catch {
        // Ignore if cache clear fails
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

  // Format YAML endpoint
  if (event.httpMethod === "POST" && event.path?.endsWith("/format")) {
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

      // Parse and reformat
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

  return {
    statusCode: 405,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Method Not Allowed" }),
  };
};
