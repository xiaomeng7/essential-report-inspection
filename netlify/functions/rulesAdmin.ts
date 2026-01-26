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
      
      // 尝试写入文件（Netlify Functions 文件系统可能是只读的）
      try {
        if (fs.existsSync(rulesPath)) {
          try {
            const backupPath = `${rulesPath}.backup.${Date.now()}`;
            fs.copyFileSync(rulesPath, backupPath);
          } catch {
            // 备份失败不影响主流程
          }
        }
        fs.writeFileSync(rulesPath, yamlContent, "utf8");
        
        // 清除缓存
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
      } catch (writeError: any) {
        // 文件系统只读错误（Netlify Functions 环境）
        if (writeError.code === "EROFS" || writeError.message?.includes("read-only")) {
          // 返回更新后的 YAML，让用户手动更新到 Git 或使用 GitHub API
          return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              success: true,
              message: "Rules validated successfully. File system is read-only in Netlify Functions.",
              yaml: yamlContent,
              requiresManualUpdate: true,
              canUseGitHubAPI: true,
              instructions: [
                "1. 复制下面的 YAML 内容",
                "2. 在本地 Git 仓库中更新 rules.yml 文件",
                "3. 提交并推送到 Git",
                "4. Netlify 会自动重新部署并应用新规则",
                "",
                "或者使用 GitHub API 直接更新（需要 GitHub Token）"
              ],
            }),
          };
        }
        // 其他错误继续抛出
        throw writeError;
      }
    } catch (e) {
      console.error("Error saving rules:", e);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to save rules", message: e instanceof Error ? e.message : String(e) }),
      };
    }
  }

  // GitHub API 更新端点
  if (event.httpMethod === "POST" && (pathRaw.endsWith("/github-update") || pathRaw.includes("/github-update"))) {
    try {
      const body = JSON.parse(event.body ?? "{}");
      const { yaml: yamlContent, githubToken } = body;
      
      if (!yamlContent || typeof yamlContent !== "string") {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing or invalid yaml content" }),
        };
      }

      if (!githubToken || typeof githubToken !== "string") {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing GitHub token" }),
        };
      }

      // 验证 YAML
      try {
        yaml.load(yamlContent);
      } catch (yamlError) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Invalid YAML", message: yamlError instanceof Error ? yamlError.message : String(yamlError) }),
        };
      }

      // GitHub 仓库信息（从环境变量或默认值）
      const repoOwner = process.env.GITHUB_REPO_OWNER || "xiaomeng7";
      const repoName = process.env.GITHUB_REPO_NAME || "essential-report-inspection";
      const filePath = "rules.yml";
      const branch = "main";

      // 1. 获取文件的当前 SHA
      const getFileUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}?ref=${branch}`;
      const getFileRes = await fetch(getFileUrl, {
        headers: {
          "Authorization": `token ${githubToken}`,
          "Accept": "application/vnd.github.v3+json",
        },
      });

      let sha: string | undefined;
      if (getFileRes.ok) {
        const fileData = await getFileRes.json() as { sha: string };
        sha = fileData.sha;
      } else if (getFileRes.status !== 404) {
        const errorData = await getFileRes.json() as { message?: string };
        throw new Error(`Failed to get file: ${errorData.message || getFileRes.statusText}`);
      }

      // 2. 更新文件
      const updateFileUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;
      const contentBase64 = Buffer.from(yamlContent, "utf8").toString("base64");
      
      const updatePayload = {
        message: `Update rules.yml via admin panel - ${new Date().toISOString()}`,
        content: contentBase64,
        branch: branch,
        ...(sha ? { sha } : {}),
      };

      const updateRes = await fetch(updateFileUrl, {
        method: "PUT",
        headers: {
          "Authorization": `token ${githubToken}`,
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatePayload),
      });

      if (!updateRes.ok) {
        const errorData = await updateRes.json() as { message?: string };
        throw new Error(`Failed to update file on GitHub: ${errorData.message || updateRes.statusText}`);
      }

      const updateResult = await updateRes.json() as { commit: { sha: string } };

      // 清除缓存
      try {
        const { clearRulesCache } = await import("./lib/rules");
        clearRulesCache();
      } catch {
        /* ignore */
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          message: "Rules updated successfully on GitHub! Netlify will auto-deploy.",
          commitSha: updateResult.commit.sha,
          repoUrl: `https://github.com/${repoOwner}/${repoName}`,
        }),
      };
    } catch (e) {
      console.error("Error updating via GitHub API:", e);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Failed to update via GitHub API",
          message: e instanceof Error ? e.message : String(e),
        }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Method Not Allowed" }),
  };
};
