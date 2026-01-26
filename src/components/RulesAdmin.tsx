import { useState, useEffect, useCallback } from "react";

type RulesData = {
  rules: any;
  yaml: string;
};

type Props = {
  onBack: () => void;
};

const ADMIN_TOKEN_KEY = "admin_token";

type FindingValue = {
  safety: string;
  urgency: string;
  liability: string;
};

export function RulesAdmin({ onBack }: Props) {
  const [rulesData, setRulesData] = useState<RulesData | null>(null);
  const [yamlContent, setYamlContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [isAuthError, setIsAuthError] = useState(false);
  const [editedFindings, setEditedFindings] = useState<Record<string, FindingValue>>({});
  const [activeTab, setActiveTab] = useState<"visual" | "yaml">("visual");

  const loadRules = useCallback(async (token: string) => {
    try {
      setLoading(true);
      setError(null);
      setIsAuthError(false);
      const res = await fetch("/api/rulesAdmin", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem(ADMIN_TOKEN_KEY);
          setIsAuthError(true);
          throw new Error("Unauthorized - Invalid token");
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as RulesData;
      setRulesData(data);
      setYamlContent(data.yaml);
      setAuthToken(token);
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
      // 初始化编辑状态
      if (data.rules?.findings) {
        setEditedFindings(data.rules.findings);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
    if (savedToken) {
      setAuthToken(savedToken);
      loadRules(savedToken);
    } else {
      setLoading(false);
      setIsAuthError(true);
      setError("请输入 Admin Token");
    }
  }, [loadRules]);

  const handleRetryWithToken = () => {
    const t = tokenInput.trim();
    if (!t) {
      setError("请输入 Token");
      return;
    }
    setTokenInput("");
    setError(null);
    loadRules(t);
  };

  const clearTokenAndRetry = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAuthToken("");
    setRulesData(null);
    setError(null);
    setIsAuthError(true);
    setLoading(false);
    setTokenInput("");
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      const res = await fetch("/api/rulesAdmin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ yaml: yamlContent }),
      });
      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string; message?: string };
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      // Reload rules to get updated version
      await loadRules(authToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleFormat = async () => {
    try {
      // Use API to format YAML (since we can't use js-yaml in browser)
      const res = await fetch("/api/rulesAdmin/format", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ yaml: yamlContent }),
      });
      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string; message?: string };
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { yaml: string };
      setYamlContent(data.yaml);
    } catch (e) {
      setError(`Invalid YAML: ${(e as Error).message}`);
    }
  };

  // 更新单个 finding 的值
  const updateFinding = (findingKey: string, field: "safety" | "urgency" | "liability", value: string) => {
    setEditedFindings((prev) => ({
      ...prev,
      [findingKey]: {
        ...prev[findingKey],
        [field]: value,
      },
    }));
  };

  // 将编辑后的 findings 更新到 YAML 并保存
  const handleUpdateFindings = async () => {
    if (!rulesData) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      // 更新 rules 对象中的 findings
      const updatedRules = {
        ...rulesData.rules,
        findings: editedFindings,
      };

      // 通过 API 将 JSON rules 转换为 YAML
      const resConvert = await fetch("/api/rulesAdmin/json-to-yaml", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ rules: updatedRules }),
      });

      if (!resConvert.ok) {
        const errorData = (await resConvert.json()) as { error?: string; message?: string };
        throw new Error(errorData.message || errorData.error || "Failed to convert to YAML");
      }

      const { yaml: updatedYaml } = (await resConvert.json()) as { yaml: string };

      // 保存到服务器
      const res = await fetch("/api/rulesAdmin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ yaml: updatedYaml }),
      });

      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string; message?: string };
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      // 重新加载规则
      await loadRules(authToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
        <p>Loading rules...</p>
      </div>
    );
  }

  if ((error && !rulesData) || (isAuthError && !rulesData && !loading)) {
    return (
      <div className="app" style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>
        <h1 style={{ marginBottom: 8 }}>规则管理</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>
          Token 需与 Netlify 环境变量 <code style={{ background: "#f0f0f0", padding: "2px 6px", borderRadius: 4 }}>ADMIN_TOKEN</code> 完全一致。
        </p>
        {error && (
          <div style={{ padding: 12, backgroundColor: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: 24, color: "#991b1b" }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>Admin Token</label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRetryWithToken()}
            placeholder="输入 Netlify 中设置的 ADMIN_TOKEN"
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 16,
              border: "1px solid #ccc",
              borderRadius: 8,
              boxSizing: "border-box",
            }}
            autoFocus
          />
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button onClick={handleRetryWithToken} className="btn-primary" disabled={loading}>
            {loading ? "验证中…" : "验证并进入"}
          </button>
          <button onClick={clearTokenAndRetry} className="btn-secondary" disabled={loading}>
            清除已保存的 Token
          </button>
          <button onClick={onBack} className="btn-secondary">返回首页</button>
        </div>
        <div style={{ marginTop: 32, padding: 16, backgroundColor: "#f8fafc", borderRadius: 8, fontSize: 14, color: "#475569" }}>
          <p style={{ margin: "0 0 8px 0", fontWeight: 600 }}>如何设置 ADMIN_TOKEN？</p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>登录 Netlify Dashboard，进入你的站点</li>
            <li>Site settings → Environment variables</li>
            <li>添加变量：Key = <code>ADMIN_TOKEN</code>，Value = 你自定义的密码</li>
            <li>保存后重新部署（或等待自动部署）</li>
            <li>在此页输入相同的密码即可</li>
          </ol>
          <p style={{ margin: "12px 0 0 0", fontSize: 13, color: "#64748b" }}>
            若<strong>未</strong>在 Netlify 设置 <code>ADMIN_TOKEN</code>，默认 Token 为：<code>admin-secret-token-change-me</code>（请先在 Netlify 中设置自己的密码）。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1>Rules Management</h1>
        <button onClick={onBack} className="btn-secondary">Back</button>
      </div>

      {error && (
        <div style={{ padding: "15px", backgroundColor: "#fee", border: "1px solid #fcc", borderRadius: "4px", marginBottom: "20px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {success && (
        <div style={{ padding: "15px", backgroundColor: "#efe", border: "1px solid #cfc", borderRadius: "4px", marginBottom: "20px" }}>
          <strong>Success:</strong> Rules saved successfully!
        </div>
      )}

      {rulesData && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "12px", marginBottom: "20px", borderBottom: "2px solid #e0e0e0" }}>
            <button
              onClick={() => setActiveTab("visual")}
              style={{
                padding: "10px 20px",
                border: "none",
                background: activeTab === "visual" ? "#2c3e50" : "transparent",
                color: activeTab === "visual" ? "white" : "#666",
                cursor: "pointer",
                borderTopLeftRadius: "8px",
                borderTopRightRadius: "8px",
                fontWeight: activeTab === "visual" ? 600 : 400,
              }}
            >
              可视化编辑
            </button>
            <button
              onClick={() => setActiveTab("yaml")}
              style={{
                padding: "10px 20px",
                border: "none",
                background: activeTab === "yaml" ? "#2c3e50" : "transparent",
                color: activeTab === "yaml" ? "white" : "#666",
                cursor: "pointer",
                borderTopLeftRadius: "8px",
                borderTopRightRadius: "8px",
                fontWeight: activeTab === "yaml" ? 600 : 400,
              }}
            >
              YAML 编辑器
            </button>
          </div>

          {activeTab === "visual" && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h2>Findings 编辑 ({Object.keys(editedFindings).length})</h2>
                <button onClick={handleUpdateFindings} className="btn-primary" disabled={saving}>
                  {saving ? "保存中..." : "更新所有 Findings"}
                </button>
              </div>
              <div style={{ backgroundColor: "#fff", border: "1px solid #ddd", borderRadius: "8px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f8f9fa" }}>
                      <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: 600 }}>Finding</th>
                      <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: 600 }}>Safety</th>
                      <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: 600 }}>Urgency</th>
                      <th style={{ padding: "12px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: 600 }}>Liability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(editedFindings).map(([key, value], idx) => (
                      <tr key={key} style={{ backgroundColor: idx % 2 === 0 ? "#fff" : "#f8f9fa" }}>
                        <td style={{ padding: "12px", borderBottom: "1px solid #dee2e6", fontWeight: 500, fontFamily: "monospace", fontSize: "13px" }}>
                          {key}
                        </td>
                        <td style={{ padding: "12px", borderBottom: "1px solid #dee2e6" }}>
                          <select
                            value={value.safety}
                            onChange={(e) => updateFinding(key, "safety", e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px",
                              border: "1px solid #ccc",
                              borderRadius: "4px",
                              fontSize: "14px",
                            }}
                          >
                            <option value="HIGH">HIGH</option>
                            <option value="MODERATE">MODERATE</option>
                            <option value="LOW">LOW</option>
                          </select>
                        </td>
                        <td style={{ padding: "12px", borderBottom: "1px solid #dee2e6" }}>
                          <select
                            value={value.urgency}
                            onChange={(e) => updateFinding(key, "urgency", e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px",
                              border: "1px solid #ccc",
                              borderRadius: "4px",
                              fontSize: "14px",
                            }}
                          >
                            <option value="IMMEDIATE">IMMEDIATE</option>
                            <option value="SHORT_TERM">SHORT_TERM</option>
                            <option value="LONG_TERM">LONG_TERM</option>
                          </select>
                        </td>
                        <td style={{ padding: "12px", borderBottom: "1px solid #dee2e6" }}>
                          <select
                            value={value.liability}
                            onChange={(e) => updateFinding(key, "liability", e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px",
                              border: "1px solid #ccc",
                              borderRadius: "4px",
                              fontSize: "14px",
                            }}
                          >
                            <option value="HIGH">HIGH</option>
                            <option value="MEDIUM">MEDIUM</option>
                            <option value="LOW">LOW</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: "13px", color: "#666", marginTop: "12px" }}>
                修改任意下拉列表后，点击上方的 <strong>"更新所有 Findings"</strong> 按钮保存更改。
              </p>
            </div>
          )}

          {activeTab === "yaml" && (
            <div style={{ marginBottom: "20px" }}>
              <h2>Rules Structure</h2>
              <div style={{ backgroundColor: "#f5f5f5", padding: "15px", borderRadius: "4px", marginBottom: "20px" }}>
                <h3>Findings ({Object.keys(rulesData.rules.findings || {}).length})</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "10px" }}>
                  {Object.entries(rulesData.rules.findings || {}).map(([key, value]: [string, any]) => (
                    <div key={key} style={{ padding: "10px", backgroundColor: "white", borderRadius: "4px", border: "1px solid #ddd" }}>
                      <strong>{key}</strong>
                      <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
                        Safety: {value.safety} | Urgency: {value.urgency} | Liability: {value.liability}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "yaml" && (
            <>
              <div style={{ backgroundColor: "#f5f5f5", padding: "15px", borderRadius: "4px", marginBottom: "20px" }}>
                <h3>Hard Overrides</h3>
                <ul>
                  {(rulesData.rules.hard_overrides?.findings || []).map((f: string) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>

              <div style={{ backgroundColor: "#f5f5f5", padding: "15px", borderRadius: "4px", marginBottom: "20px" }}>
                <h3>Priority Matrix</h3>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#e0e0e0" }}>
                      <th style={{ padding: "8px", border: "1px solid #ccc", textAlign: "left" }}>Condition</th>
                      <th style={{ padding: "8px", border: "1px solid #ccc", textAlign: "left" }}>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rulesData.rules.base_priority_matrix || []).map((rule: any, idx: number) => (
                      <tr key={idx}>
                        <td style={{ padding: "8px", border: "1px solid #ccc" }}>
                          {Object.entries(rule.when || {}).map(([k, v]) => `${k}: ${v}`).join(", ")}
                        </td>
                        <td style={{ padding: "8px", border: "1px solid #ccc" }}>{rule.then}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === "yaml" && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h2>YAML Editor</h2>
            <div>
              <button onClick={handleFormat} className="btn-secondary" style={{ marginRight: "10px" }}>
                Format YAML
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Rules"}
              </button>
            </div>
          </div>
          <textarea
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            style={{
              width: "100%",
              minHeight: "500px",
              fontFamily: "monospace",
              fontSize: "13px",
              padding: "15px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              lineHeight: "1.5",
            }}
            spellCheck={false}
          />
          <p style={{ fontSize: "12px", color: "#666", marginTop: "10px" }}>
            Edit the YAML above to modify rules. Click "Format YAML" to auto-format, then "Save Rules" to apply changes.
          </p>
        </div>
      )}
    </div>
  );
}
