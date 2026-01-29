import { useState, useEffect, useCallback } from "react";

type Props = {
  onBack: () => void;
};

const ADMIN_TOKEN_KEY = "admin_token";

type ConfigType = "rules" | "mapping" | "responses";

type ConfigData = {
  content: string;
  parsed: any;
  source: "file" | "blob";
};

export function ConfigAdmin({ onBack }: Props) {
  console.log("🔧 ConfigAdmin component rendered at:", window.location.pathname);
  
  const [activeTab, setActiveTab] = useState<ConfigType>("rules");
  const [configData, setConfigData] = useState<ConfigData | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [isAuthError, setIsAuthError] = useState(false);
  const [testInspectionId, setTestInspectionId] = useState("");
  const [testing, setTesting] = useState(false);

  const loadConfig = useCallback(async (token: string, type: ConfigType) => {
    try {
      setLoading(true);
      setError(null);
      setIsAuthError(false);
      const res = await fetch(`/api/configAdmin/${type}`, {
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
      const data = (await res.json()) as ConfigData;
      setConfigData(data);
      setContent(data.content);
      setAuthToken(token);
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
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
      loadConfig(savedToken, activeTab);
    } else {
      setLoading(false);
      setIsAuthError(true);
      setError("请输入 Admin Token");
    }
  }, [loadConfig, activeTab]);

  const handleRetryWithToken = () => {
    const t = tokenInput.trim();
    if (!t) {
      setError("请输入 Token");
      return;
    }
    setTokenInput("");
    setError(null);
    loadConfig(t, activeTab);
  };

  const clearTokenAndRetry = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAuthToken("");
    setConfigData(null);
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
      const res = await fetch(`/api/configAdmin/${activeTab}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string; message?: string };
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      // Reload config to get updated version
      await loadConfig(authToken, activeTab);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestReport = async () => {
    if (!testInspectionId.trim()) {
      setError("请输入 Inspection ID");
      return;
    }
    try {
      setTesting(true);
      setError(null);
      const res = await fetch(`/api/generateWordReport?inspection_id=${testInspectionId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string; message?: string };
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${testInspectionId}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const handleTabChange = (newTab: ConfigType) => {
    setActiveTab(newTab);
    if (authToken) {
      loadConfig(authToken, newTab);
    }
  };

  if (loading && !configData) {
    return (
      <div className="app" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
        <h1>规则 & 文案管理</h1>
        <p>加载配置中...</p>
      </div>
    );
  }

  if ((error && !configData) || (isAuthError && !configData && !loading)) {
    return (
      <div className="app" style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>
        <h1 style={{ marginBottom: 8 }}>规则 & 文案管理</h1>
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
      </div>
    );
  }

  const getTabLabel = (type: ConfigType) => {
    switch (type) {
      case "rules":
        return "规则 (rules.yml)";
      case "mapping":
        return "映射 (CHECKLIST_TO_FINDINGS_MAP.json)";
      case "responses":
        return "文案 (responses.yml)";
    }
  };

  const getTabDescription = (type: ConfigType) => {
    switch (type) {
      case "rules":
        return "编辑规则文件，定义 finding 的 safety、urgency、liability 等属性";
      case "mapping":
        return "编辑映射规则，定义从 checklist 字段到 finding_code 的映射关系";
      case "responses":
        return "编辑文案模板，定义每个 finding 的标题、说明、建议等文本内容";
    }
  };

  return (
    <div className="app" style={{ maxWidth: 1400, margin: "0 auto", padding: "20px" }}>
      <div style={{ 
        backgroundColor: "#e3f2fd", 
        padding: "16px", 
        borderRadius: "8px", 
        marginBottom: "20px",
        border: "2px solid #2196f3"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, color: "#1976d2" }}>🔧 规则 & 文案编辑页面</h1>
            <p style={{ margin: "8px 0 0 0", fontSize: "14px", color: "#666" }}>
              当前路径: <strong>{window.location.pathname}</strong>
            </p>
          </div>
          <button onClick={onBack} className="btn-secondary">返回首页</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "15px", backgroundColor: "#fee", border: "1px solid #fcc", borderRadius: "4px", marginBottom: "20px" }}>
          <strong>错误:</strong> {error}
        </div>
      )}

      {success && (
        <div style={{ padding: "15px", backgroundColor: "#efe", border: "1px solid #cfc", borderRadius: "4px", marginBottom: "20px" }}>
          <strong>成功:</strong> {activeTab === "rules" ? "规则" : activeTab === "mapping" ? "映射" : "文案"}已保存！
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", borderBottom: "2px solid #e0e0e0" }}>
        {(["rules", "mapping", "responses"] as ConfigType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            style={{
              padding: "10px 20px",
              border: "none",
              background: activeTab === tab ? "#2c3e50" : "transparent",
              color: activeTab === tab ? "white" : "#666",
              cursor: "pointer",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {getTabLabel(tab)}
          </button>
        ))}
      </div>

      {/* Tab Description */}
      <div style={{ marginBottom: "20px", padding: "12px", backgroundColor: "#f8f9fa", borderRadius: "8px" }}>
        <p style={{ margin: 0, color: "#666" }}>{getTabDescription(activeTab)}</p>
        {configData && (
          <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#999" }}>
            来源: {configData.source === "blob" ? "已保存的版本（Blob Store）" : "文件系统"}
          </p>
        )}
      </div>

      {/* Editor */}
      {configData && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h2>{getTabLabel(activeTab)}</h2>
            <div>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              width: "100%",
              minHeight: "600px",
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
            修改内容后，点击"保存"按钮保存更改。保存后会自动创建版本备份。
          </p>
        </div>
      )}

      {/* Test Report Generation */}
      <div style={{ marginTop: "40px", padding: "20px", backgroundColor: "#f8f9fa", borderRadius: "8px", border: "1px solid #ddd" }}>
        <h2 style={{ marginTop: 0 }}>测试报告生成</h2>
        <p style={{ color: "#666", marginBottom: "16px" }}>
          修改规则或文案后，可以使用此功能立即测试生成 Word 报告，验证更改是否正确生效。
        </p>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1", minWidth: "200px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>Inspection ID</label>
            <input
              type="text"
              value={testInspectionId}
              onChange={(e) => setTestInspectionId(e.target.value)}
              placeholder="例如: EH-2026-001"
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={handleTestReport}
              className="btn-primary"
              disabled={testing || !testInspectionId.trim()}
              style={{ padding: "10px 20px" }}
            >
              {testing ? "生成中..." : "生成并下载 Word 报告"}
            </button>
          </div>
        </div>
        <p style={{ fontSize: "12px", color: "#666", marginTop: "12px" }}>
          输入已存在的 Inspection ID，系统将使用最新的规则和文案配置生成 Word 报告。
        </p>
      </div>
    </div>
  );
}
