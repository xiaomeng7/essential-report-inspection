import { useState, useEffect, useCallback } from "react";
import { FindingDimensionsModal, type FindingDimensionsForm } from "./FindingDimensionsModal";

type Props = {
  onBack: () => void;
};

const ADMIN_TOKEN_KEY = "admin_token";

type ConfigType = "rules" | "mapping" | "responses" | "problemDimensions" | "customLibrary";

// Finding ID 分类映射
const FINDING_CATEGORIES = [
  "GPO & Final Subcircuits",
  "Lighting & Switching",
  "Switchboard & Protection",
  "RCD / RCBO",
  "Earthing & MEN",
  "Thermal / Overheating",
  "Cabling & Insulation",
  "Load / Capacity",
  "Roof Space",
  "External / Other",
] as const;

type FindingCategory = typeof FINDING_CATEGORIES[number];

// 根据 finding ID 推断分类
function categorizeFinding(findingId: string): FindingCategory {
  const id = findingId.toUpperCase();
  
  // GPO & Final Subcircuits
  if (id.includes("GPO") || id.includes("SOCKET") || id.includes("OUTLET") || id.includes("POWER_POINT")) {
    return "GPO & Final Subcircuits";
  }
  
  // Lighting & Switching
  if (id.includes("LIGHT") || id.includes("SWITCH") || id.includes("FITTING") || id.includes("LAMP")) {
    return "Lighting & Switching";
  }
  
  // Switchboard & Protection
  if (id.includes("SWITCHBOARD") || id.includes("BOARD") || id.includes("FUSE") || id.includes("CIRCUIT_BREAKER") || 
      id.includes("MAIN_ISOLATION") || id.includes("SUPPLY") || id.includes("PROTECTION") && !id.includes("RCD")) {
    return "Switchboard & Protection";
  }
  
  // RCD / RCBO
  if (id.includes("RCD") || id.includes("RCBO") || id.includes("RESIDUAL")) {
    return "RCD / RCBO";
  }
  
  // Earthing & MEN
  if (id.includes("EARTH") || id.includes("MEN") || id.includes("BONDING") || id.includes("GROUND")) {
    return "Earthing & MEN";
  }
  
  // Thermal / Overheating
  if (id.includes("THERMAL") || id.includes("OVERHEAT") || id.includes("HOTSPOT") || id.includes("HEAT") || 
      id.includes("TEMPERATURE") || id.includes("BURN")) {
    return "Thermal / Overheating";
  }
  
  // Cabling & Insulation
  if (id.includes("CABLE") || id.includes("WIRING") || id.includes("INSULATION") || id.includes("CONDUCTOR") || 
      id.includes("EXPOSED") || id.includes("DEGRADATION") || id.includes("MATERIAL")) {
    return "Cabling & Insulation";
  }
  
  // Load / Capacity
  if (id.includes("LOAD") || id.includes("CAPACITY") || id.includes("MARGIN") || id.includes("EXPANSION") || 
      id.includes("BATTERY") || id.includes("EV") || id.includes("SOLAR")) {
    return "Load / Capacity";
  }
  
  // Roof Space
  if (id.includes("ROOF") || id.includes("CEILING") || id.includes("ATTIC") || id.includes("VOID")) {
    return "Roof Space";
  }
  
  // External / Other (默认)
  return "External / Other";
}

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
  const [libraryEntries, setLibraryEntries] = useState<CustomFindingLibraryEntry[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySaving, setLibrarySaving] = useState(false);
  const [libraryEdit, setLibraryEdit] = useState<Partial<CustomFindingLibraryEntry> & { title: string } | null>(null);
  // 9 维全局（影响所有报告）
  const [globalDimOverrides, setGlobalDimOverrides] = useState<Record<string, Record<string, unknown>>>({});
  const [globalDimLoading, setGlobalDimLoading] = useState(false);
  // 合并页面的状态：当前选中的 finding ID（用于显示右侧问题描述）
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  // 合并页面的状态：当前编辑的 finding（用于弹窗）
  const [problemDimEdit, setProblemDimEdit] = useState<{ finding_id: string; dimensions: FindingDimensionsForm } | null>(null);
  const [problemDimSaving, setProblemDimSaving] = useState(false);

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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const loadGlobalDimensions = useCallback(async (token: string) => {
    setGlobalDimLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/configAdmin/findingDimensionsGlobal", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { overrides: Record<string, Record<string, unknown>> };
      setGlobalDimOverrides(data.overrides || {});
    } catch (e) {
      setGlobalDimOverrides({});
      setError((e as Error).message);
    } finally {
      setGlobalDimLoading(false);
    }
  }, []);

  // Check URL tab param (e.g. ?tab=dimensions, ?tab=findingDimensionsGlobal)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam && ["rules", "mapping", "responses", "problemDimensions", "customLibrary"].includes(tabParam) && activeTab !== tabParam) {
      setActiveTab(tabParam as ConfigType);
      if (tabParam === "customLibrary") loadLibrary();
      else if (authToken) {
        if (tabParam === "problemDimensions") {
          loadDimensions(authToken);
          loadGlobalDimensions(authToken);
        } else loadConfig(authToken, tabParam as "rules" | "mapping" | "responses");
      }
    }
  }, [loadLibrary, loadGlobalDimensions]);

  useEffect(() => {
    const savedToken = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
    if (savedToken) {
      setAuthToken(savedToken);
      if (activeTab === "customLibrary") {
        loadLibrary();
      } else if (activeTab === "problemDimensions") {
        loadDimensions(savedToken);
        loadGlobalDimensions(savedToken);
      } else {
        loadConfig(savedToken, activeTab);
      }
    } else {
      setLoading(false);
      setIsAuthError(true);
      setError("Please enter Admin Token");
    }
  }, [loadConfig, loadDimensions, loadLibrary, loadGlobalDimensions, activeTab]);

  const handleRetryWithToken = () => {
    const t = tokenInput.trim();
    if (!t) {
      setError("Please enter Token");
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
      setError("No content to export");
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
      setError("Please enter Inspection ID");
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
    setEditMode("visual");
    setSearchTerm("");
    setLibraryEdit(null);
    if (authToken || newTab === "customLibrary") {
      if (newTab === "customLibrary") {
        loadLibrary();
      } else if (newTab === "problemDimensions") {
        loadDimensions(authToken);
        loadGlobalDimensions(authToken);
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

  if (loading && !configData && activeTab !== "customLibrary" && activeTab !== "problemDimensions") {
    return (
      <div className="app" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
        <h1>Rules & copy management</h1>
        <p>Loading config...</p>
      </div>
    );
  }

  if ((error && !configData) || (isAuthError && !configData && !loading)) {
    return (
      <div className="app" style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>
        <h1 style={{ marginBottom: 8 }}>Rules & copy management</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>
          Token must match the Netlify env var <code style={{ background: "#f0f0f0", padding: "2px 6px", borderRadius: 4 }}>ADMIN_TOKEN</code> exactly.
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
            placeholder="Enter ADMIN_TOKEN from Netlify"
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
            {loading ? "Verifying…" : "Verify and enter"}
          </button>
          <button onClick={clearTokenAndRetry} className="btn-secondary" disabled={loading}>
            Clear saved token
          </button>
          <button onClick={onBack} className="btn-secondary">Back to home</button>
        </div>
      </div>
    );
  }

  const getTabLabel = (type: ConfigType) => {
    switch (type) {
      case "rules":
        return "Rules (rules.yml)";
      case "mapping":
        return "Mapping (CHECKLIST_TO_FINDINGS_MAP.json)";
      case "responses":
        return "Copy (responses.yml)";
      case "problemDimensions":
        return "Findings (9 dimensions)";
      case "customLibrary":
        return "Custom Finding library";
    }
  };

  const getTabDescription = (type: ConfigType) => {
    switch (type) {
      case "rules":
        return "Edit rules file: safety, urgency, liability, etc.";
      case "mapping":
        return "Edit mapping rules from checklist fields to finding_code";
      case "responses":
        return "Edit copy templates: title, description, recommendations for each finding";
      case "problemDimensions":
        return "Edit Finding 9 dimensions: left lists Finding IDs by category, right shows details. Click to edit. Changes apply globally to all reports.";
      case "customLibrary":
        return "Maintain custom finding library: title and 9 dimensions. Technicians can pick from library when choosing Other (phase 2).";
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
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { entry: CustomFindingLibraryEntry };
        setLibraryEntries((prev) => (prev ?? []).map((e) => (e.id === data.entry.id ? data.entry : e)));
      } else {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(libraryEdit) });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error || `HTTP ${res.status}`);
        }
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
    if (!window.confirm("Delete this library entry?")) return;
    setLibrarySaving(true);
    setError(null);
    try {
      const res = await fetch("/api/customFindingLibrary", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
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
            <h1 style={{ margin: 0, color: "#1976d2" }}>🔧 Rules & copy editor</h1>
            <p style={{ margin: "8px 0 0 0", fontSize: "14px", color: "#666" }}>
              Current path: <strong>{window.location.pathname}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => {
                window.history.replaceState(null, "", "/admin/telemetry");
              }}
              className="btn-secondary"
            >
              Telemetry dashboard
            </button>
            <button onClick={onBack} className="btn-secondary">Back to home</button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: "15px", backgroundColor: "#fee", border: "1px solid #fcc", borderRadius: "4px", marginBottom: "20px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {success && (
        <div style={{ padding: "15px", backgroundColor: "#efe", border: "1px solid #cfc", borderRadius: "4px", marginBottom: "20px" }}>
          <strong>Success:</strong> {activeTab === "problemDimensions" ? "9 dimensions" : activeTab === "rules" ? "Rules" : activeTab === "mapping" ? "Mapping" : activeTab === "customLibrary" ? "Library entry" : "Copy"} saved!
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", borderBottom: "2px solid #e0e0e0" }}>
        {(["rules", "mapping", "responses", "problemDimensions", "customLibrary"] as ConfigType[]).map((tab) => (
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
        {activeTab === "problemDimensions" && dimensionsData && (
          <p style={{ margin: "8px 0 0 0", fontSize: "13px", color: "#0c5460" }}>
            {Object.keys(dimensionsData.findings).length} findings, {dimensionsData.missing.length} missing dimensions
          </p>
        )}
        {configData && activeTab !== "problemDimensions" && (
          <div style={{ marginTop: "8px" }}>
            <p style={{ margin: "4px 0", fontSize: "13px", color: "#999" }}>
              Source: {configData.source === "blob" ? "✅ Saved version (Blob Store - your changes)" : "📄 File system (default)"}
            </p>
            {configData.source === "blob" && (
              <div style={{ marginTop: "8px", padding: "8px", backgroundColor: "#d1ecf1", borderRadius: "4px", border: "1px solid #bee5eb" }}>
                <p style={{ margin: "4px 0", fontSize: "12px", color: "#0c5460", fontWeight: 600 }}>
                  💡 Data safety:
                </p>
                <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px", fontSize: "12px", color: "#0c5460" }}>
                  <li>Your changes are stored in Netlify Blob Store (cloud storage)</li>
                  <li>Blob Store data does not expire and is kept permanently</li>
                  <li>Git push does not overwrite Blob Store changes</li>
                  <li>Use "Export backup" regularly to download backup files</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 问题（9维度）合并页面 - 左侧分类列表 + 右侧问题描述 + 点击弹窗编辑 */}
      {activeTab === "problemDimensions" && dimensionsData && (
        <div style={{ marginBottom: "20px" }}>
          {globalDimLoading && <p>Loading...</p>}
          {!globalDimLoading && (
            <div style={{ display: "flex", gap: 20, minHeight: "600px" }}>
              {/* 左侧：分类列表 */}
              <div style={{ flex: "0 0 300px", border: "1px solid #ddd", borderRadius: 8, padding: 16, overflowY: "auto", maxHeight: "70vh" }}>
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>Finding ID list</h3>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search finding..."
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6, marginBottom: 16, boxSizing: "border-box" }}
                />
                {FINDING_CATEGORIES.map((category) => {
                  const findingsInCategory = Object.keys(dimensionsData.findings)
                    .filter((id) => categorizeFinding(id) === category)
                    .filter((id) => !searchTerm || id.toLowerCase().includes(searchTerm.toLowerCase()))
                    .sort();
                  
                  if (findingsInCategory.length === 0) return null;
                  
                  return (
                    <div key={category} style={{ marginBottom: 20 }}>
                      <h4 style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600, color: "#1976d2" }}>
                        {category}
                      </h4>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                        {findingsInCategory.map((findingId) => {
                          const globalDims = globalDimOverrides[findingId];
                          const hasGlobal = !!globalDims;
                          
                          return (
                            <li
                              key={findingId}
                              style={{
                                padding: "6px 8px",
                                marginBottom: 4,
                                borderRadius: 4,
                                cursor: "pointer",
                                backgroundColor: selectedFindingId === findingId ? "#e3f2fd" : "transparent",
                                border: selectedFindingId === findingId ? "1px solid #2196f3" : "1px solid transparent",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                              onClick={() => setSelectedFindingId(findingId)}
                              onDoubleClick={() => {
                                const existing = globalDimOverrides[findingId] || dimensionsData.findings[findingId] || {};
                                setProblemDimEdit({
                                  finding_id: findingId,
                                  dimensions: {
                                    title: (existing.title as string) || "",
                                    safety: (existing.safety as string) || "",
                                    urgency: (existing.urgency as string) || "",
                                    liability: (existing.liability as string) || "",
                                    budget_low: typeof existing.budget_low === "number" ? existing.budget_low : "",
                                    budget_high: typeof existing.budget_high === "number" ? existing.budget_high : "",
                                    priority: (existing.priority as string) || "",
                                    severity: typeof existing.severity === "number" ? existing.severity : (existing.severity ? Number(existing.severity) : ""),
                                    likelihood: typeof existing.likelihood === "number" ? existing.likelihood : (existing.likelihood ? Number(existing.likelihood) : ""),
                                    escalation: (existing.escalation as string) || "",
                                  },
                                });
                              }}
                            >
                              <span style={{ flex: 1, fontSize: 12, fontFamily: "monospace" }}>{findingId}</span>
                              {hasGlobal && (
                                <span style={{ fontSize: 10, color: "#27ae60", fontWeight: 600 }}>●</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
              
              {/* 右侧：问题描述 */}
              <div style={{ flex: 1, border: "1px solid #ddd", borderRadius: 8, padding: 16, overflowY: "auto", maxHeight: "70vh" }}>
                {selectedFindingId ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ margin: 0, fontFamily: "monospace" }}>{selectedFindingId}</h3>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          const existing = globalDimOverrides[selectedFindingId] || dimensionsData.findings[selectedFindingId] || {};
                          setProblemDimEdit({
                            finding_id: selectedFindingId,
                            dimensions: {
                              title: (existing.title as string) || "",
                              safety: (existing.safety as string) || "",
                              urgency: (existing.urgency as string) || "",
                              liability: (existing.liability as string) || "",
                              budget_low: typeof existing.budget_low === "number" ? existing.budget_low : "",
                              budget_high: typeof existing.budget_high === "number" ? existing.budget_high : "",
                              priority: (existing.priority as string) || "",
                              severity: typeof existing.severity === "number" ? existing.severity : (existing.severity ? Number(existing.severity) : ""),
                              likelihood: typeof existing.likelihood === "number" ? existing.likelihood : (existing.likelihood ? Number(existing.likelihood) : ""),
                              escalation: (existing.escalation as string) || "",
                            },
                          });
                        }}
                      >
                        Edit 9 dimensions
                      </button>
                    </div>
                    
                    {(() => {
                      const dims = dimensionsData.findings[selectedFindingId] || {};
                      const globalDims = globalDimOverrides[selectedFindingId];
                      const displayDims = globalDims || dims;
                      const title = (displayDims.title as string) || selectedFindingId;
                      
                      return (
                        <div>
                          <h4 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h4>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                            <div>
                              <strong>Safety:</strong> {displayDims.safety ? String(displayDims.safety) : "—"}
                            </div>
                            <div>
                              <strong>Urgency:</strong> {displayDims.urgency ? String(displayDims.urgency) : "—"}
                            </div>
                            <div>
                              <strong>Liability:</strong> {displayDims.liability ? String(displayDims.liability) : "—"}
                            </div>
                            <div>
                              <strong>Priority:</strong> {displayDims.priority ? String(displayDims.priority) : "—"}
                            </div>
                            <div>
                              <strong>Budget:</strong>{" "}
                              {displayDims.budget_low != null || displayDims.budget_high != null
                                ? `$${displayDims.budget_low ?? "?"} - $${displayDims.budget_high ?? "?"}`
                                : "—"}
                            </div>
                            <div>
                              <strong>Severity:</strong> {displayDims.severity != null ? String(displayDims.severity) : "—"}
                            </div>
                            <div>
                              <strong>Likelihood:</strong> {displayDims.likelihood != null ? String(displayDims.likelihood) : "—"}
                            </div>
                            <div>
                              <strong>Escalation:</strong> {displayDims.escalation ? String(displayDims.escalation) : "—"}
                            </div>
                          </div>
                          {globalDims && (
                            <div style={{ marginTop: 16, padding: 12, backgroundColor: "#e8f5e9", borderRadius: 6, fontSize: 13 }}>
                              <strong>✓ Global override set</strong> (this finding's 9 dimensions apply to all reports)
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div style={{ textAlign: "center", color: "#999", padding: "40px 20px" }}>
                    <p>Select a Finding ID from the left to view details</p>
                    <p style={{ fontSize: 12, marginTop: 8 }}>Double-click ID or click "Edit 9 dimensions" to edit</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* 编辑弹窗 */}
          {problemDimEdit !== null && (
            <FindingDimensionsModal
              findingId={problemDimEdit.finding_id}
              findingTitle={problemDimEdit.dimensions.title}
              dimensions={problemDimEdit.dimensions}
              onChange={(field, value) =>
                setProblemDimEdit((prev) =>
                  prev ? { ...prev, dimensions: { ...prev.dimensions, [field]: value } } : null
                )
              }
              onSave={async () => {
                if (!problemDimEdit || !authToken) return;
                setProblemDimSaving(true);
                setError(null);
                try {
                  // 保存到全局覆盖（影响所有报告）
                  const res = await fetch("/api/configAdmin/findingDimensionsGlobal", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
                    body: JSON.stringify({
                      finding_id: problemDimEdit.finding_id,
                      dimensions: {
                        title: problemDimEdit.dimensions.title || undefined,
                        safety: problemDimEdit.dimensions.safety || undefined,
                        urgency: problemDimEdit.dimensions.urgency || undefined,
                        liability: problemDimEdit.dimensions.liability || undefined,
                        budget_low: problemDimEdit.dimensions.budget_low === "" ? undefined : problemDimEdit.dimensions.budget_low,
                        budget_high: problemDimEdit.dimensions.budget_high === "" ? undefined : problemDimEdit.dimensions.budget_high,
                        priority: problemDimEdit.dimensions.priority || undefined,
                        severity: problemDimEdit.dimensions.severity === "" ? undefined : problemDimEdit.dimensions.severity,
                        likelihood: problemDimEdit.dimensions.likelihood === "" ? undefined : problemDimEdit.dimensions.likelihood,
                        escalation: problemDimEdit.dimensions.escalation || undefined,
                      },
                    }),
                  });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const data = (await res.json()) as { ok: boolean; finding_id: string };
                  setGlobalDimOverrides((prev) => ({
                    ...prev,
                    [data.finding_id]: {
                      title: problemDimEdit.dimensions.title || undefined,
                      safety: problemDimEdit.dimensions.safety || undefined,
                      urgency: problemDimEdit.dimensions.urgency || undefined,
                      liability: problemDimEdit.dimensions.liability || undefined,
                      budget_low: problemDimEdit.dimensions.budget_low === "" ? undefined : problemDimEdit.dimensions.budget_low,
                      budget_high: problemDimEdit.dimensions.budget_high === "" ? undefined : problemDimEdit.dimensions.budget_high,
                      priority: problemDimEdit.dimensions.priority || undefined,
                      severity: problemDimEdit.dimensions.severity === "" ? undefined : problemDimEdit.dimensions.severity,
                      likelihood: problemDimEdit.dimensions.likelihood === "" ? undefined : problemDimEdit.dimensions.likelihood,
                      escalation: problemDimEdit.dimensions.escalation || undefined,
                    },
                  }));
                  setProblemDimEdit(null);
                  setSuccess(true);
                  setTimeout(() => setSuccess(false), 3000);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setProblemDimSaving(false);
                }
              }}
              onCancel={() => setProblemDimEdit(null)}
              saving={problemDimSaving}
            />
          )}
        </div>
      )}

      {/* Custom Finding Library Tab - 9 维度库管理 */}
      {activeTab === "customLibrary" && (
        <div style={{ marginBottom: "20px" }}>
          {libraryLoading && <p>Loading library...</p>}
          {!libraryLoading && libraryEntries && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span>{libraryEntries.length} entries</span>
                <button type="button" className="btn-primary" onClick={() => setLibraryEdit({ title: "", safety: "LOW", urgency: "LONG_TERM", liability: "LOW", priority: "PLAN_MONITOR", severity: 2, likelihood: 2, escalation: "LOW" })}>Add</button>
              </div>
              <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ background: "#f5f5f5" }}>
                    <tr><th style={{ padding: 8, textAlign: "left" }}>Title</th><th style={{ padding: 8 }}>Priority</th><th style={{ padding: 8 }}>Safety</th><th style={{ padding: 8 }}>Urgency</th><th style={{ padding: 8 }}>Liability</th><th style={{ padding: 8 }}>Use count</th><th style={{ padding: 8 }}>Actions</th></tr>
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
                          <button type="button" className="btn-secondary" style={{ marginRight: 8 }} onClick={() => setLibraryEdit({ ...e })}>Edit</button>
                          <button type="button" className="btn-secondary" onClick={() => deleteLibraryEntry(e.id)}>Delete</button>
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
              <h3 style={{ marginTop: 0 }}>{libraryEdit.id ? "Edit library entry" : "Add library entry"}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontSize: 12, color: "#666" }}>Title</label>
                  <input type="text" value={libraryEdit.title} onChange={(e) => setLibraryEdit((p) => p ? { ...p, title: e.target.value } : null)} placeholder="e.g. Socket overheating" style={{ width: "100%", padding: 8, marginTop: 4, boxSizing: "border-box" }} />
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
                <button type="button" className="btn-primary" onClick={saveLibraryEntry} disabled={librarySaving || !libraryEdit.title?.trim()}>{librarySaving ? "Saving…" : "Save"}</button>
                <button type="button" className="btn-secondary" onClick={() => setLibraryEdit(null)}>Cancel</button>
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
            Visual editor
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
            {activeTab === "mapping" ? "JSON editor" : "YAML editor"}
          </button>
        </div>
      )}

      {/* Visual Editor for Responses */}
      {activeTab === "responses" && editMode === "visual" && configData && editedResponses && Object.keys(editedResponses).length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2>Copy editor ({Object.keys(editedResponses).length} findings)</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => loadConfig(authToken, activeTab, true)} 
                className="btn-secondary" 
                disabled={loading}
              >
                {loading ? "Loading..." : "🔄 Reload"}
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save all changes"}
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search finding code..."
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
                      Title
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
                      Why It Matters
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
                      Recommended Action
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
                      Planning Guidance
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
            <h2>Mapping rules editor ({editedMappings.length} rules)</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => loadConfig(authToken, activeTab, true)} 
                className="btn-secondary" 
                disabled={loading}
              >
                {loading ? "Loading..." : "🔄 Reload"}
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save all changes"}
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search finding code..."
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
                          Field
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
                          Operator
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
                          <option value="eq">equals (eq)</option>
                          <option value="ne">not equals (ne)</option>
                          <option value="gt">greater than (gt)</option>
                          <option value="lt">less than (lt)</option>
                          <option value="gte">greater or equal (gte)</option>
                          <option value="lte">less or equal (lte)</option>
                          <option value="in">in (in)</option>
                          <option value="not_in">not in (not_in)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", marginBottom: "4px", fontWeight: 600, fontSize: "13px" }}>
                          Value
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
          <h3 style={{ marginTop: 0, color: "#856404" }}>⚠️ Data not loaded</h3>
          <p style={{ fontSize: "16px", color: "#856404", marginBottom: "20px" }}>
            {loading ? "Loading data..." : "Load data first for visual editing. Click below to load from file system."}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button 
              onClick={() => loadConfig(authToken, activeTab, true)} 
              className="btn-primary" 
              disabled={loading}
            >
              {loading ? "Loading..." : "🔄 Reload from file system"}
            </button>
            <button 
              onClick={() => setEditMode("raw")} 
              className="btn-secondary"
            >
              Switch to JSON editor
            </button>
          </div>
          {configData && (
            <p style={{ fontSize: "12px", color: "#856404", marginTop: "16px" }}>
              Debug: parsed keys = {configData.parsed ? Object.keys(configData.parsed).join(", ") : "null"}, mappings = {configData.parsed?.mappings ? configData.parsed.mappings.length : 0}
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
                {loading ? "Loading..." : "🔄 Reload"}
              </button>
              <button 
                onClick={handleExportBackup} 
                className="btn-secondary"
                title="Export current content as backup"
              >
                💾 Export backup
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save"}
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
            After editing, click "Save" to apply changes. A version backup will be created automatically.
          </p>
        </div>
      )}

      {/* Visual Editor for Rules */}
      {activeTab === "rules" && editMode === "visual" && configData && editedFindings && Object.keys(editedFindings).length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h2>Findings editor ({Object.keys(editedFindings).length} findings)</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => loadConfig(authToken, activeTab, true)} 
                className="btn-secondary" 
                disabled={loading}
              >
                {loading ? "Loading..." : "🔄 Reload"}
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save all changes"}
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div style={{ marginBottom: "16px" }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search finding code..."
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
          <h3 style={{ marginTop: 0, color: "#856404" }}>⚠️ Data not loaded</h3>
          <p style={{ fontSize: "16px", color: "#856404", marginBottom: "20px" }}>
            {loading ? "Loading data..." : "Load data first for visual editing. Click below to load from file system."}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
            <button 
              onClick={() => loadConfig(authToken, activeTab, true)} 
              className="btn-primary" 
              disabled={loading}
            >
              {loading ? "Loading..." : "🔄 Reload from file system"}
            </button>
            <button 
              onClick={() => setEditMode("raw")} 
              className="btn-secondary"
            >
              Switch to YAML editor
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
                {loading ? "Loading..." : "🔄 Reload"}
              </button>
              <button 
                onClick={handleExportBackup} 
                className="btn-secondary"
                title="Export current content as backup"
              >
                💾 Export backup
              </button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>
                {saving ? "Saving..." : "Save"}
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
        <h2 style={{ marginTop: 0 }}>Test report generation</h2>
        <p style={{ color: "#666", marginBottom: "16px" }}>
          After editing rules or copy, use this to test Word report generation and verify changes.
        </p>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1", minWidth: "200px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>Inspection ID</label>
            <input
              type="text"
              value={testInspectionId}
              onChange={(e) => setTestInspectionId(e.target.value)}
              placeholder="e.g. EH-2026-001"
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
              {testing ? "Generating..." : "Generate and download Word report"}
            </button>
          </div>
        </div>
        <p style={{ fontSize: "12px", color: "#666", marginTop: "12px" }}>
          Enter an existing Inspection ID; the system will generate a Word report using the latest rules and copy.
        </p>
      </div>
    </div>
  );
}
