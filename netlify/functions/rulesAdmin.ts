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
      
      // 使用更好的 YAML 格式选项
      const yamlContent = yaml.dump(rules, { 
        indent: 2, 
        lineWidth: 120, 
        quotingType: '"',
        noRefs: true,
        sortKeys: false, // 保持原始顺序
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
      const { yaml: yamlContent, githubToken, findings } = body;
      
      if (!githubToken || typeof githubToken !== "string") {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing GitHub token" }),
        };
      }

      // GitHub 仓库信息（从环境变量或默认值）
      const repoOwner = process.env.GITHUB_REPO_OWNER || "xiaomeng7";
      const repoName = process.env.GITHUB_REPO_NAME || "essential-report-inspection";
      const filePath = "rules.yml";
      const branch = "main";

      // 1. 获取文件的当前内容和 SHA
      const getFileUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}?ref=${branch}`;
      const getFileRes = await fetch(getFileUrl, {
        headers: {
          "Authorization": `token ${githubToken}`,
          "Accept": "application/vnd.github.v3+json",
        },
      });

      let currentYaml: string;
      let sha: string | undefined;
      
      if (getFileRes.ok) {
        const fileData = await getFileRes.json() as { sha: string; content: string; encoding: string };
        sha = fileData.sha;
        // GitHub API 返回的 content 是 base64 编码的
        currentYaml = Buffer.from(fileData.content, "base64").toString("utf8");
      } else if (getFileRes.status === 404) {
        // 文件不存在，使用内嵌规则作为基础
        const { EMBEDDED_RULES_YAML } = await import("./lib/rules");
        currentYaml = EMBEDDED_RULES_YAML;
      } else {
        const errorData = await getFileRes.json() as { message?: string };
        throw new Error(`Failed to get file: ${errorData.message || getFileRes.statusText}`);
      }

      // 2. 解析当前 YAML，更新 findings（如果提供了 findings 对象）
      let finalYaml: string;
      
      if (findings && typeof findings === "object" && !yamlContent) {
        // 如果提供了 findings 对象，更新 findings 部分
        const currentRules = yaml.load(currentYaml) as any;
        currentRules.findings = findings;
        
        // 重新转换为 YAML
        let dumpedYaml = yaml.dump(currentRules, { 
          indent: 2, 
          lineWidth: 120, 
          quotingType: '"',
          noRefs: true,
          sortKeys: false,
        });
        
        // 手动格式化 findings 部分，确保格式与原始文件一致
        const lines = dumpedYaml.split('\n');
        const findingsIndex = lines.findIndex(line => line.trim() === 'findings:');
        if (findingsIndex >= 0) {
          const beforeFindings = lines.slice(0, findingsIndex + 1).join('\n');
          const afterFindings = lines.slice(findingsIndex + 1);
          
          // 找到 findings 部分结束的位置（下一个顶级键，即不缩进的行）
          let afterIndex = afterFindings.length;
          for (let i = 0; i < afterFindings.length; i++) {
            const line = afterFindings[i];
            if (line.trim() && !line.startsWith(' ') && !line.startsWith('\t')) {
              afterIndex = i;
              break;
            }
          }
          const afterSection = afterFindings.slice(afterIndex).join('\n');
          
          // 格式化 findings：每个 finding 一行，格式为 "  KEY: { safety: X, urgency: Y, liability: Z }"
          const findingsLines: string[] = [];
          for (const [key, value] of Object.entries(findings)) {
            if (value && typeof value === 'object' && 'safety' in value && 'urgency' in value && 'liability' in value) {
              const v = value as { safety: string; urgency: string; liability: string };
              findingsLines.push(`  ${key}: { safety: ${v.safety}, urgency: ${v.urgency}, liability: ${v.liability} }`);
            }
          }
          
          finalYaml = beforeFindings + '\n' + findingsLines.join('\n') + (afterSection ? '\n' + afterSection : '');
        } else {
          finalYaml = dumpedYaml;
        }
      } else if (yamlContent && typeof yamlContent === "string") {
        // 如果提供了完整的 YAML，验证后使用
        try {
          yaml.load(yamlContent); // 验证 YAML
          finalYaml = yamlContent;
        } catch (yamlError) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Invalid YAML", message: yamlError instanceof Error ? yamlError.message : String(yamlError) }),
          };
        }
      } else {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing yaml content or findings object" }),
        };
      }
      
      // 验证最终 YAML
      try {
        const parsed = yaml.load(finalYaml);
        console.log("Final YAML parsed successfully, findings count:", Object.keys((parsed as any).findings || {}).length);
      } catch (e) {
        console.error("Final YAML validation failed:", e);
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Generated invalid YAML", message: e instanceof Error ? e.message : String(e) }),
        };
      }

      // 3. 更新文件
      const updateFileUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`;
      const contentBase64 = Buffer.from(finalYaml, "utf8").toString("base64");
      
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
