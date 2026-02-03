import { useState, useEffect, useCallback } from "react";

type Props = {
  onBack: () => void;
};

const ADMIN_TOKEN_KEY = "admin_token";

type ConfigType = "rules" | "mapping" | "responses" | "dimensions" | "customLibrary";

type CustomFindingLibraryEntry = {
  id: string;
  title: string;
  safety: string;
  urgency: string;
  liability: string;
  budget_low?: number;
  budget_high?: number;
  priority: string;
  severity: number;
  likelihood: number;
  escalation: string;
  is_common?: boolean;
  use_count?: number;
  created_at?: string;
  updated_at?: string;
};

type ConfigData = {
  content: string;
  parsed: any;
  source: "file" | "blob";
};

type ResponseFinding = {
  title: string;
  why_it_matters: string;
  recommended_action: string;
  planning_guidance: string;
  disclaimer_line: string;
};

type MappingRule = {
  finding: string;
  condition?: {
    field: string;
    operator: string;
    value: string;
  };
  conditions?: {
    all?: Array<{ field: string; operator: string; value: string }>;
    any?: Array<{ field: string; operator: string; value: string }>;
  };
};

type FindingValue = {
  safety: string;
  urgency: string;
  liability: string;
};

export function ConfigAdmin({ onBack }: Props) {
  console.log("🔧 ConfigAdmin component rendered at:", window.location.pathname);
  
  const [activeTab, setActiveTab] = useState<ConfigType>("rules");
  const [editMode, setEditMode] = useState<"visual" | "raw">("visual");
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
  
  // Visual editing state
  const [editedResponses, setEditedResponses] = useState<Record<string, ResponseFinding>>({});
  const [editedMappings, setEditedMappings] = useState<MappingRule[]>([]);
  const [editedFindings, setEditedFindings] = useState<Record<string, FindingValue>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [dimensionsData, setDimensionsData] = useState<{
    findings: Record<string, Record<string, unknown>>;
    missing: Array<{ id: string; missing: string[] }>;
  } | null>(null);
  const [editedDimensions, setEditedDimensions] = useState<Record<string, Record<string, unknown>>>({});
  const [libraryEntries, setLibraryEntries] = useState<CustomFindingLibraryEntry[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySaving, setLibrarySaving] = useState(false);
  const [libraryEdit, setLibraryEdit] = useState<Partial<CustomFindingLibraryEntry> & { title: string } | null>(null);

  const loadConfig = useCallback(async (token: string, type: ConfigType, forceReload = false) => {
    try {
      setLoading(true);
      setError(null);
      setIsAuthError(false);
      const url = forceReload 
        ? `/api/configAdmin/${type}?forceReload=true`
        : `/api/configAdmin/${type}`;
      const res = await fetch(url, {
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
      
      // Initialize visual editing state
      console.log(`📦 Loaded ${type} data:`, {
        hasParsed: !!data.parsed,
        parsedKeys: data.parsed ? Object.keys(data.parsed) : [],
        findingsCount: data.parsed?.findings ? Object.keys(data.parsed.findings).length : 0,
        mappingsCount: data.parsed?.mappings ? data.parsed.mappings.length : 0,
      });
      
      if (type === "responses" && data.parsed?.findings) {
        console.log(`✅ Initializing editedResponses with ${Object.keys(data.parsed.findings).length} findings`);
        setEditedResponses(data.parsed.findings);
      } else if (type === "mapping" && data.parsed?.mappings) {
        console.log(`✅ Initializing editedMappings with ${data.parsed.mappings.length} mappings`);
        setEditedMappings(data.parsed.mappings);
      } else if (type === "rules" && data.parsed?.findings) {
        console.log(`✅ Initializing editedFindings with ${Object.keys(data.parsed.findings).length} findings`);
        setEditedFindings(data.parsed.findings);
      } else {
        console.warn(`⚠️ No data to initialize for ${type}:`, {
          hasFindings: !!data.parsed?.findings,
          hasMappings: !!data.parsed?.mappings,
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDimensions = useCallback(async (token: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/configAdmin/dimensions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { findings: Record<string, Record<string, unknown>>; missing: Array<{ id: string; missing: string[] }> };
      setDimensionsData(data);
      setEditedDimensions(data.findings || {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check URL tab param (e.g. ?tab=dimensions, ?tab=customLibrary)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam && ["rules", "mapping", "responses", "dimensions", "customLibrary"].includes(tabParam) && activeTab !== tabParam) {
      setActiveTab(tabParam as ConfigType);
      if (tabParam === "customLibrary") loadLibrary();
      else if (authToken) {
        if (tabParam === "dimensions") loadDimensions(authToken);
        else loadConfig(authToken, tabParam as "rules" | "mapping" | "responses");
      }
    }
  }, [loadLibrary]);

  useEffect(() => {
    const savedToken = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
    if (savedToken) {
      setAuthToken(savedToken);
      if (activeTab === "customLibrary") {
        loadLibrary();
      } else if (activeTab === "dimensions") {
        loadDimensions(savedToken);
      } else {
        loadConfig(savedToken, activeTab);
      }
    } else {
      setLoading(false);
      setIsAuthError(true);
      setError("请输入 Admin Token");
    }
  }, [loadConfig, loadDimensions, loadLibrary, activeTab]);

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

      if (activeTab === "dimensions") {
        const res = await fetch("/api/configAdmin/dimensions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ findings: editedDimensions }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { message?: string };
          throw new Error(err.message || `HTTP ${res.status}`);
        }
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
        await loadDimensions(authToken);
        setSaving(false);
        return;
      }
      
      let contentToSave = content;
      
      // If in visual mode, convert edited data back to YAML/JSON
      if (editMode === "visual") {
        if (activeTab === "responses" && editedResponses) {
          const updatedParsed = {
            ...configData?.parsed,
            findings: editedResponses,
          };
          // Convert to YAML
          const res = await fetch("/api/configAdmin/json-to-yaml", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ data: updatedParsed }),
          });
          if (!res.ok) {
            throw new Error("Failed to convert to YAML");
          }
          const { yaml: yamlContent } = await res.json();
          contentToSave = yamlContent;
        } else if (activeTab === "mapping" && editedMappings) {
          const updatedParsed = {
            ...configData?.parsed,
            mappings: editedMappings,
          };
          contentToSave = JSON.stringify(updatedParsed, null, 2);
        } else if (activeTab === "rules" && editedFindings) {
          const updatedParsed = {
            ...configData?.parsed,
            findings: editedFindings,
          };
          // Convert to YAML
          const res = await fetch("/api/configAdmin/json-to-yaml", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ data: updatedParsed }),
          });
          if (!res.ok) {
            throw new Error("Failed to convert to YAML");
          }
          const { yaml: yamlContent } = await res.json();
          contentToSave = yamlContent;
        }
      }
      
      const res = await fetch(`/api/configAdmin/${activeTab}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content: contentToSave }),
      });
      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string; message?: string };
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadConfig(authToken, activeTab);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleExportBackup = () => {
    if (!configData || !content) {
      setError("没有可导出的内容");
      return;
    }
    const blob = new Blob([content], { 
      type: activeTab === "mapping" ? "application/json" : "text/yaml" 
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const filename = activeTab === "mapping" 
      ? `CHECKLIST_TO_FINDINGS_MAP.backup.${new Date().toISOString().split('T')[0]}.json`
      : `${activeTab}.backup.${new Date().toISOString().split('T')[0]}.yml`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
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

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/customFindingLibrary");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries: CustomFindingLibraryEntry[] };
      setLibraryEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (e) {
      setLibraryEntries([]);
      setError((e as Error).message);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const handleTabChange = (newTab: ConfigType) => {
    setActiveTab(newTab);
    setEditMode("visual");
    setSearchTerm("");
    setLibraryEdit(null);
    if (authToken || newTab === "customLibrary") {
      if (newTab === "customLibrary") {
        loadLibrary();
      } else if (newTab === "dimensions") {
        loadDimensions(authToken);
      } else {
        loadConfig(authToken, newTab);
      }
    }
  };

  const updateResponse = (findingCode: string, field: keyof ResponseFinding, value: string) => {
    setEditedResponses((prev) => ({
      ...prev,
      [findingCode]: {
        ...prev[findingCode],
        [field]: value,
      },
    }));
  };

  const updateMapping = (index: number, field: string, value: any) => {
    setEditedMappings((prev) => {
      const updated = [...prev];
      if (field === "finding") {
        updated[index] = { ...updated[index], finding: value };
      } else if (field.startsWith("condition.")) {
        const subField = field.split(".")[1];
        updated[index] = {
          ...updated[index],
          condition: {
            ...updated[index].condition,
            [subField]: value,
          } as any,
        };
      }
      return updated;
    });
  };

  const updateFinding = (findingKey: string, field: "safety" | "urgency" | "liability", value: string) => {
    setEditedFindings((prev) => ({
      ...prev,
      [findingKey]: {
        ...prev[findingKey],
        [field]: value,
      },
    }));
  };

  if (loading && !configData && activeTab !== "customLibrary") {
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
      case "dimensions":
        return "Finding 维度 (7 维度)";
      case "customLibrary":
        return "自定义 Finding 库";
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
      case "dimensions":
        return "可视化编辑 7 维度：Safety、Urgency、Liability、Budget、Priority、Severity、Likelihood、Escalation";
      case "customLibrary":
        return "维护自定义问题库：标题与 9 维度。技师选 Other 时可从库中选（二期）；工程师可在此直观编辑 9 个维度。";
    }
  };

  const saveLibraryEntry = async () => {
    if (!libraryEdit || !libraryEdit.title?.trim()) return;
    setLibrarySaving(true);
    setError(null);
    try {
      const url = "/api/customFindingLibrary";
      if (libraryEdit.id) {
        const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(libraryEdit) });
        if (!res.ok) throw new Error((await res.json()) as { error?: string }).error || `HTTP ${res.status}`);
        const data = (await res.json()) as { entry: CustomFindingLibraryEntry };
        setLibraryEntries((prev) => (prev ?? []).map((e) => (e.id === data.entry.id ? data.entry : e)));
      } else {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(libraryEdit) });
        if (!res.ok) throw new Error((await res.json()) as { error?: string }).error || `HTTP ${res.status}`);
        const data = (await res.json()) as { entry: CustomFindingLibraryEntry };
        setLibraryEntries((prev) => [...(prev ?? []), data.entry]);
      }
      setLibraryEdit(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLibrarySaving(false);
    }
  };

  const deleteLibraryEntry = async (id: string) => {
    if (!window.confirm("确定删除这条库条目？")) return;
    setLibrarySaving(true);
    setError(null);
    try {
      const res = await fetch("/api/customFindingLibrary", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error((await res.json()) as { error?: string }).error || `HTTP ${res.status}`);
      setLibraryEntries((prev) => (prev ?? []).filter((e) => e.id !== id));
      setLibraryEdit((prev) => (prev?.id === id ? null : prev));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLibrarySaving(false);
    }
  };

  const filteredFindings = activeTab === "responses" && editedResponses
    ? Object.entries(editedResponses).filter(([code]) =>
        searchTerm ? code.toLowerCase().includes(searchTerm.toLowerCase()) : true
      )
    : [];

  const filteredMappings = activeTab === "mapping" && editedMappings
    ? editedMappings.filter((m) =>
        searchTerm ? m.finding.toLowerCase().includes(searchTerm.toLowerCase()) : true
      )
    : [];

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
          <strong>成功:</strong> {activeTab === "dimensions" ? "维度" : activeTab === "rules" ? "规则" : activeTab === "mapping" ? "映射" : activeTab === "customLibrary" ? "库条目" : "文案"}已保存！
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", borderBottom: "2px solid #e0e0e0" }}>
        {(["rules", "mapping", "responses", "dimensions", "customLibrary"] as ConfigType[]).map((tab) => (
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
        {activeTab === "dimensions" && dimensionsData && (
          <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#856404" }}>
            共 {Object.keys(dimensionsData.findings).length} 个 findings，{dimensionsData.missing.length} 个缺少维度
          </p>
        )}
        {configData && activeTab !== "dimensions" && (
          <div style={{ marginTop: "8px" }}>
            <p style={{ margin: "4px 0", fontSize: "13px", color: "#999" }}>
              来源: {configData.source === "blob" ? "✅ 已保存的版本（Blob Store - 您的修改）" : "📄 文件系统（默认内容）"}
            </p>
            {configData.source === "blob" && (
              <div style={{ marginTop: "8px", padding: "8px", backgroundColor: "#d1ecf1", borderRadius: "4px", border: "1px solid #bee5eb" }}>
                <p style={{ margin: "4px 0", fontSize: "12px", color: "#0c5460", fontWeight: 600 }}>
                  💡 数据安全提示：
                </p>
                <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px", fontSize: "12px", color: "#0c5460" }}>
                  <li>您的修改保存在 Netlify Blob Store（云端持久化存储）</li>
                  <li>Blob Store 数据不会自动过期，会永久保存</li>
                  <li>Git 推送不会覆盖 Blob Store 中的修改</li>
                  <li>建议定期使用「导出备份」功能下载备份文件</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dimensions Tab - 7-dimension editor */}
      {activeTab === "dimensions" && dimensionsData && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索 finding..."
                style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6, minWidth: 200 }}
              />
            </div>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? "保存中..." : "保存维度更改"}
            </button>
          </div>
          <div style={{ overflowX: "auto", maxHeight: "70vh", overflowY: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ position: "sticky", top: 0, background: "#f5f5f5", zIndex: 1 }}>
                <tr style={{ borderBottom: "2px solid #ddd" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Finding ID</th>
                  <th style={{ padding: 8 }}>Safety</th>
                  <th style={{ padding: 8 }}>Urgency</th>
                  <th style={{ padding: 8 }}>Liability</th>
                  <th style={{ padding: 8 }}>Budget Low</th>
                  <th style={{ padding: 8 }}>Budget High</th>
                  <th style={{ padding: 8 }}>Priority</th>
                  <th style={{ padding: 8 }}>Severity 1-5</th>
                  <th style={{ padding: 8 }}>Likelihood 1-5</th>
                  <th style={{ padding: 8 }}>Escalation</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(editedDimensions)
                  .filter(([id]) => !searchTerm || id.toLowerCase().includes(searchTerm.toLowerCase()))
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([id, row]) => {
                    const missing = (row.missing as string[]) || [];
                    const hasMissing = missing.length > 0;
                    return (
                      <tr key={id} style={{ borderBottom: "1px solid #eee", background: hasMissing ? "#fff8e6" : undefined }}>
                        <td style={{ padding: 6 }}>
                          <span title={(row.title as string) || id}>{id}</span>
                        </td>
                        <td style={{ padding: 4 }}>
                          <select
                            value={String(row.safety ?? "")}
                            onChange={(e) => setEditedDimensions((prev) => ({ ...prev, [id]: { ...prev[id], safety: e.target.value } }))}
                            style={{ width: "100%", padding: 4, fontSize: 12 }}
                          >
                            <option value="">—</option>
                            <option value="HIGH">HIGH</option>
                            <option value="MODERATE">MODERATE</option>
                            <option value="LOW">LOW</option>
                          </select>
                        </td>
                        <td style={{ padding: 4 }}>
                          <select
                            value={String(row.urgency ?? "")}
                            onChange={(e) => setEditedDimensions((prev) => ({ ...prev, [id]: { ...prev[id], urgency: e.target.value } }))}
                            style={{ width: "100%", padding: 4, fontSize: 12 }}
                          >
                            <option value="">—</option>
                            <option value="IMMEDIATE">IMMEDIATE</option>
                            <option value="SHORT_TERM">SHORT_TERM</option>
                            <option value="LONG_TERM">LONG_TERM</option>
                          </select>
                        </td>
                        <td style={{ padding: 4 }}>
                          <select
                            value={String(row.liability ?? "")}
                            onChange={(e) => setEditedDimensions((prev) => ({ ...prev, [id]: { ...prev[id], liability: e.target.value } }))}
                            style={{ width: "100%", padding: 4, fontSize: 12 }}
                          >
                            <option value="">—</option>
                            <option value="HIGH">HIGH</option>
                            <option value="MEDIUM">MEDIUM</option>
                            <option value="LOW">LOW</option>
                          </select>
                        </td>
                        <td style={{ padding: 4 }}>
                          <input
                            type="number"
                            value={row.budget_low != null ? String(row.budget_low) : ""}
                            onChange={(e) => setEditedDimensions((prev) => ({ ...prev, [id]: { ...prev[id], budget_low: e.target.value ? Number(e.target.value) : null } }))}
                            style={{ width: 70, padding: 4, fontSize: 12 }}
                            placeholder="—"
                          />
                        </td>
                        <td style={{ padding: 4 }}>
                          <input
                            type="number"
                            value={row.budget_high != null ? String(row.budget_high) : ""}
                            onChange={(e) => setEditedDimensions((prev) => ({ ...prev, [id]: { ...prev[id], budget_high: e.target.value ? Number(e.target.value) : null } }))}
                            style={{ width: 70, padding: 4, fontSize: 12 }}
                            placeholder="—"
                          />
                        </td>
                        <td style={{ padding: 4 }}>
                          <select
                            value={String(row.priority ?? "")}
                            onChange={(e) => setEditedDimensions((prev) => ({ ...prev, [id]: { ...prev[id], priority: e.target.value } }))}
                            style={{ width: "100%", padding: 4, fontSize: 12 }}
                          >
                            <option value="">—</option>
                            <option value="IMMEDIATE">IMMEDIATE</option>
                            <option value="RECOMMENDED_0_3_MONTHS">RECOMMENDED_0_3_MONTHS</option>
                            <option value="PLAN_MONITOR">PLAN_MONITOR</option>
                          </select>
                        </td>
                        <td style={{ padding: 4 }}>
                          <select
                            value={String(row.severity ?? "")}
                            onChange={(e) => setEditedDimensions((prev) => ({ ...prev, [id]: { ...prev[id], severity: e.target.value ? Number(e.target.value) : "" } }))}
                            style={{ width: "100%", padding: 4, fontSize: 12 }}
                          >
                            <option value="">—</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: 4 }}>
                          <select
                            value={String(row.likelihood ?? "")}
                            onChange={(e) => setEditedDimensions((prev) => ({ ...prev, [id]: { ...prev[id], likelihood: e.target.value ? Number(e.target.value) : "" } }))}
                            style={{ width: "100%", padding: 4, fontSize: 12 }}
                          >
                            <option value="">—</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: 4 }}>
                          <select
                            value={String(row.escalation ?? "")}
                            onChange={(e) => setEditedDimensions((prev) => ({ ...prev, [id]: { ...prev[id], escalation: e.target.value } }))}
                            style={{ width: "100%", padding: 4, fontSize: 12 }}
                          >
                            <option value="">—</option>
                            <option value="HIGH">HIGH</option>
                            <option value="MODERATE">MODERATE</option>
                            <option value="LOW">LOW</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Custom Finding Library Tab - 9 维度库管理 */}
      {activeTab === "customLibrary" && (
        <div style={{ marginBottom: "20px" }}>
          {libraryLoading && <p>加载库中...</p>}
          {!libraryLoading && libraryEntries && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span>共 {libraryEntries.length} 条</span>
                <button type="button" className="btn-primary" onClick={() => setLibraryEdit({ title: "", safety: "LOW", urgency: "LONG_TERM", liability: "LOW", priority: "PLAN_MONITOR", severity: 2, likelihood: 2, escalation: "LOW" })}>新增</button>
              </div>
              <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ background: "#f5f5f5" }}>
                    <tr><th style={{ padding: 8, textAlign: "left" }}>标题</th><th style={{ padding: 8 }}>Priority</th><th style={{ padding: 8 }}>Safety</th><th style={{ padding: 8 }}>Urgency</th><th style={{ padding: 8 }}>Liability</th><th style={{ padding: 8 }}>使用次数</th><th style={{ padding: 8 }}>操作</th></tr>
                  </thead>
                  <tbody>
                    {libraryEntries.map((e) => (
                      <tr key={e.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: 6 }}>{e.title}</td>
                        <td style={{ padding: 6 }}>{e.priority}</td>
                        <td style={{ padding: 6 }}>{e.safety}</td>
                        <td style={{ padding: 6 }}>{e.urgency}</td>
                        <td style={{ padding: 6 }}>{e.liability}</td>
                        <td style={{ padding: 6 }}>{e.use_count ?? 0}</td>
                        <td style={{ padding: 6 }}>
                          <button type="button" className="btn-secondary" style={{ marginRight: 8 }} onClick={() => setLibraryEdit({ ...e })}>编辑</button>
                          <button type="button" className="btn-secondary" onClick={() => deleteLibraryEntry(e.id)}>删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {libraryEdit !== null && (
            <div style={{ marginTop: 24, padding: 24, background: "#f8f9fa", borderRadius: 12, border: "1px solid #ddd" }}>
              <h3 style={{ marginTop: 0 }}>{libraryEdit.id ? "编辑库条目" : "新增库条目"}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 12, color: "#666" }}>标题</label>
                  <input type="text" value={libraryEdit.title} onChange={(e) => setLibraryEdit((p) => p ? { ...p, title: e.target.value } : null)} placeholder="例如：插座发热" style={{ width: "100%", padding: 8, marginTop: 4, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Safety</label>
                  <select value={libraryEdit.safety ?? ""} onChange={(e) => setLibraryEdit((p) => p ? { ...p, safety: e.target.value } : null)} style={{ width: "100%", padding: 6, marginTop: 2 }}><option value="HIGH">HIGH</option><option value="MODERATE">MODERATE</option><option value="LOW">LOW</option></select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Urgency</label>
                  <select value={libraryEdit.urgency ?? ""} onChange={(e) => setLibraryEdit((p) => p ? { ...p, urgency: e.target.value } : null)} style={{ width: "100%", padding: 6, marginTop: 2 }}><option value="IMMEDIATE">IMMEDIATE</option><option value="SHORT_TERM">SHORT_TERM</option><option value="LONG_TERM">LONG_TERM</option></select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Liability</label>
                  <select value={libraryEdit.liability ?? ""} onChange={(e) => setLibraryEdit((p) => p ? { ...p, liability: e.target.value } : null)} style={{ width: "100%", padding: 6, marginTop: 2 }}><option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LOW">LOW</option></select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Budget Low</label>
                  <input type="number" value={libraryEdit.budget_low ?? ""} onChange={(e) => setLibraryEdit((p) => p ? { ...p, budget_low: e.target.value ? Number(e.target.value) : undefined } : null)} style={{ width: "100%", padding: 6, marginTop: 2, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Budget High</label>
                  <input type="number" value={libraryEdit.budget_high ?? ""} onChange={(e) => setLibraryEdit((p) => p ? { ...p, budget_high: e.target.value ? Number(e.target.value) : undefined } : null)} style={{ width: "100%", padding: 6, marginTop: 2, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Priority</label>
                  <select value={libraryEdit.priority ?? ""} onChange={(e) => setLibraryEdit((p) => p ? { ...p, priority: e.target.value } : null)} style={{ width: "100%", padding: 6, marginTop: 2 }}><option value="IMMEDIATE">IMMEDIATE</option><option value="RECOMMENDED_0_3_MONTHS">RECOMMENDED_0_3_MONTHS</option><option value="PLAN_MONITOR">PLAN_MONITOR</option></select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Severity (1-5)</label>
                  <select value={libraryEdit.severity ?? ""} onChange={(e) => setLibraryEdit((p) => p ? { ...p, severity: e.target.value ? Number(e.target.value) : 2 } : null)} style={{ width: "100%", padding: 6, marginTop: 2 }}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Likelihood (1-5)</label>
                  <select value={libraryEdit.likelihood ?? ""} onChange={(e) => setLibraryEdit((p) => p ? { ...p, likelihood: e.target.value ? Number(e.target.value) : 2 } : null)} style={{ width: "100%", padding: 6, marginTop: 2 }}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Escalation</label>
                  <select value={libraryEdit.escalation ?? ""} onChange={(e) => setLibraryEdit((p) => p ? { ...p, escalation: e.target.value } : null)} style={{ width: "100%", padding: 6, marginTop: 2 }}><option value="HIGH">HIGH</option><option value="MODERATE">MODERATE</option><option value="LOW">LOW</option></select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button type="button" className="btn-primary" onClick={saveLibraryEntry} disabled={librarySaving || !libraryEdit.title?.trim()}>{librarySaving ? "保存中…" : "保存"}</button>
                <button type="button" className="btn-secondary" onClick={() => setLibraryEdit(null)}>取消</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Mode Toggle - for responses, mapping, and rules */}
      {(activeTab === "responses" || activeTab === "mapping" || activeTab === "rules") && configData && (
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px", borderBottom: "2px solid #e0e0e0" }}>
          <button
            onClick={() => setEditMode("visual")}
            style={{
              padding: "10px 20px",
              border: "none",
              background: editMode === "visual" ? "#2c3e50" : "transparent",
              color: editMode === "visual" ? "white" : "#666",
              cursor: "pointer",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              fontWeight: editMode === "visual" ? 600 : 400,
            }}
          >
            可视化编辑
          </button>
          <button
            onClick={() => setEditMode("raw")}
            style={{
              padding: "10px 20px",
              border: "none",
              background: editMode === "raw" ? "#2c3e50" : "transparent",
              color: editMode === "raw" ? "white" : "#666",
              cursor: "pointer",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              fontWeight: editMode === "raw" ? 600 : 400,
            }}
          >
            {activeTab === "mapping" ? "JSON 编辑器" : "YAML 编辑器"}
          </button>
        </div>
      )}

      {/* Visual Editor for Responses */}
      {activeTab === "responses" && editMode === "visual" && configData && editedResponses && Object.keys(editedResponses).length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2>文案编辑 ({Object.keys(editedResponses).length} 个 findings)</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => loadConfig(authToken, activeTab, true)} 
                className="btn-secondary" 
                disabled={loading}
              >
                {loading ? "加载中..." : "🔄 重新加载"}
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "保存中..." : "保存所有更改"}
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索 finding code..."
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            />
          </div>

          {/* Findings List */}
          <div style={{ maxHeight: "600px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "8px" }}>
            {filteredFindings.map(([findingCode, finding], idx) => (
              <div
                key={findingCode}
                style={{
                  padding: "20px",
                  borderBottom: idx < filteredFindings.length - 1 ? "1px solid #eee" : "none",
                  backgroundColor: idx % 2 === 0 ? "#fff" : "#f8f9fa",
                }}
              >
                <h3 style={{ margin: "0 0 16px 0", color: "#1976d2", fontFamily: "monospace", fontSize: "16px" }}>
                  {findingCode}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "13px" }}>
                      标题 (Title)
                    </label>
                    <input
                      type="text"
                      value={finding.title || ""}
                      onChange={(e) => updateResponse(findingCode, "title", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        fontSize: "14px",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "13px" }}>
                      重要性说明 (Why It Matters)
                    </label>
                    <textarea
                      value={finding.why_it_matters || ""}
                      onChange={(e) => updateResponse(findingCode, "why_it_matters", e.target.value)}
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "8px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        fontSize: "14px",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "13px" }}>
                      建议行动 (Recommended Action)
                    </label>
                    <textarea
                      value={finding.recommended_action || ""}
                      onChange={(e) => updateResponse(findingCode, "recommended_action", e.target.value)}
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "8px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        fontSize: "14px",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "13px" }}>
                      规划指导 (Planning Guidance)
                    </label>
                    <textarea
                      value={finding.planning_guidance || ""}
                      onChange={(e) => updateResponse(findingCode, "planning_guidance", e.target.value)}
                      rows={2}
                      style={{
                        width: "100%",
                        padding: "8px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        fontSize: "14px",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Visual Editor for Mappings */}
      {activeTab === "mapping" && editMode === "visual" && configData && editedMappings && editedMappings.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2>映射规则编辑 ({editedMappings.length} 条规则)</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => loadConfig(authToken, activeTab, true)} 
                className="btn-secondary" 
                disabled={loading}
              >
                {loading ? "加载中..." : "🔄 重新加载"}
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "保存中..." : "保存所有更改"}
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索 finding code..."
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            />
          </div>

          {/* Mappings List */}
          <div style={{ maxHeight: "600px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "8px" }}>
            {filteredMappings.map((mapping, idx) => (
              <div
                key={idx}
                style={{
                  padding: "20px",
                  borderBottom: idx < filteredMappings.length - 1 ? "1px solid #eee" : "none",
                  backgroundColor: idx % 2 === 0 ? "#fff" : "#f8f9fa",
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", alignItems: "end" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "13px" }}>
                      Finding Code
                    </label>
                    <input
                      type="text"
                      value={mapping.finding || ""}
                      onChange={(e) => updateMapping(idx, "finding", e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        border: "1px solid #ccc",
                        borderRadius: "4px",
                        fontSize: "14px",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                  {mapping.condition && (
                    <>
                      <div>
                        <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "13px" }}>
                          字段 (Field)
                        </label>
                        <input
                          type="text"
                          value={mapping.condition.field || ""}
                          onChange={(e) => updateMapping(idx, "condition.field", e.target.value)}
                          style={{
                            width: "100%",
                            padding: "8px",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                            fontSize: "14px",
                            fontFamily: "monospace",
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "13px" }}>
                          操作符 (Operator)
                        </label>
                        <select
                          value={mapping.condition.operator || "eq"}
                          onChange={(e) => updateMapping(idx, "condition.operator", e.target.value)}
                          style={{
                            width: "100%",
                            padding: "8px",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                            fontSize: "14px",
                          }}
                        >
                          <option value="eq">等于 (eq)</option>
                          <option value="ne">不等于 (ne)</option>
                          <option value="gt">大于 (gt)</option>
                          <option value="lt">小于 (lt)</option>
                          <option value="gte">大于等于 (gte)</option>
                          <option value="lte">小于等于 (lte)</option>
                          <option value="in">包含 (in)</option>
                          <option value="not_in">不包含 (not_in)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "13px" }}>
                          值 (Value)
                        </label>
                        <input
                          type="text"
                          value={mapping.condition.value || ""}
                          onChange={(e) => updateMapping(idx, "condition.value", e.target.value)}
                          style={{
                            width: "100%",
                            padding: "8px",
                            border: "1px solid #ccc",
                            borderRadius: "4px",
                            fontSize: "14px",
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for mappings */}
      {activeTab === "mapping" && editMode === "visual" && configData && (!editedMappings || editedMappings.length === 0) && (
        <div style={{ padding: "40px", textAlign: "center", backgroundColor: "#fff3cd", borderRadius: "8px", border: "2px solid #ffc107" }}>
          <h3 style={{ marginTop: 0, color: "#856404" }}>⚠️ 数据未加载</h3>
          <p style={{ fontSize: "16px", color: "#856404", marginBottom: "20px" }}>
            {loading ? "正在加载数据..." : "可视化编辑需要先加载数据。请点击下方按钮从文件系统加载。"}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button 
              onClick={() => loadConfig(authToken, activeTab, true)} 
              className="btn-primary" 
              disabled={loading}
            >
              {loading ? "加载中..." : "🔄 从文件系统重新加载"}
            </button>
            <button 
              onClick={() => setEditMode("raw")} 
              className="btn-secondary"
            >
              切换到 JSON 编辑器
            </button>
          </div>
          {configData && (
            <p style={{ fontSize: "12px", color: "#856404", marginTop: "16px" }}>
              调试信息: parsed keys = {configData.parsed ? Object.keys(configData.parsed).join(", ") : "null"}, mappings = {configData.parsed?.mappings ? configData.parsed.mappings.length : 0}
            </p>
          )}
        </div>
      )}

      {/* Raw Editor */}
      {editMode === "raw" && configData && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h2>{getTabLabel(activeTab)}</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => loadConfig(authToken, activeTab, true)} 
                className="btn-secondary" 
                disabled={loading}
              >
                {loading ? "加载中..." : "🔄 重新加载"}
              </button>
              <button 
                onClick={handleExportBackup} 
                className="btn-secondary"
                title="导出当前内容为备份文件"
              >
                💾 导出备份
              </button>
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

      {/* Visual Editor for Rules */}
      {activeTab === "rules" && editMode === "visual" && configData && editedFindings && Object.keys(editedFindings).length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2>Findings 编辑 ({Object.keys(editedFindings).length} 个 findings)</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => loadConfig(authToken, activeTab, true)} 
                className="btn-secondary" 
                disabled={loading}
              >
                {loading ? "加载中..." : "🔄 重新加载"}
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "保存中..." : "保存所有更改"}
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索 finding code..."
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            />
          </div>

          {/* Findings Table */}
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
                {Object.entries(editedFindings)
                  .filter(([key]) => searchTerm ? key.toLowerCase().includes(searchTerm.toLowerCase()) : true)
                  .map(([key, value], idx) => (
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
        </div>
      )}

      {/* Empty state for rules */}
      {activeTab === "rules" && editMode === "visual" && configData && (!editedFindings || Object.keys(editedFindings).length === 0) && (
        <div style={{ padding: "40px", textAlign: "center", backgroundColor: "#fff3cd", borderRadius: "8px", border: "2px solid #ffc107" }}>
          <h3 style={{ marginTop: 0, color: "#856404" }}>⚠️ 数据未加载</h3>
          <p style={{ fontSize: "16px", color: "#856404", marginBottom: "20px" }}>
            {loading ? "正在加载数据..." : "可视化编辑需要先加载数据。请点击下方按钮从文件系统加载。"}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button 
              onClick={() => loadConfig(authToken, activeTab, true)} 
              className="btn-primary" 
              disabled={loading}
            >
              {loading ? "加载中..." : "🔄 从文件系统重新加载"}
            </button>
            <button 
              onClick={() => setEditMode("raw")} 
              className="btn-secondary"
            >
              切换到 YAML 编辑器
            </button>
          </div>
        </div>
      )}

      {/* Rules tab - raw editor */}
      {activeTab === "rules" && editMode === "raw" && configData && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h2>{getTabLabel(activeTab)}</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => loadConfig(authToken, activeTab, true)} 
                className="btn-secondary" 
                disabled={loading}
              >
                {loading ? "加载中..." : "🔄 重新加载"}
              </button>
              <button 
                onClick={handleExportBackup} 
                className="btn-secondary"
                title="导出当前内容为备份文件"
              >
                💾 导出备份
              </button>
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
