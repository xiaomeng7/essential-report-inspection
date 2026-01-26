import { useState, useEffect } from "react";

type RulesData = {
  rules: any;
  yaml: string;
};

type Props = {
  onBack: () => void;
};

export function RulesAdmin({ onBack }: Props) {
  const [rulesData, setRulesData] = useState<RulesData | null>(null);
  const [yamlContent, setYamlContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [authToken, setAuthToken] = useState("");

  useEffect(() => {
    // Load auth token from localStorage or prompt
    const savedToken = localStorage.getItem("admin_token") || "";
    if (savedToken) {
      setAuthToken(savedToken);
      loadRules(savedToken);
    } else {
      const token = prompt("Enter admin token:");
      if (token) {
        setAuthToken(token);
        localStorage.setItem("admin_token", token);
        loadRules(token);
      } else {
        setError("Authentication required");
        setLoading(false);
      }
    }
  }, []);

  const loadRules = async (token: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/rulesAdmin", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Unauthorized - Invalid token");
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as RulesData;
      setRulesData(data);
      setYamlContent(data.yaml);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
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

  if (loading) {
    return (
      <div className="app" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
        <p>Loading rules...</p>
      </div>
    );
  }

  if (error && !rulesData) {
    return (
      <div className="app" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
        <p style={{ color: "red" }}>Error: {error}</p>
        <button onClick={onBack} className="btn-secondary">Back</button>
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
        </div>
      )}

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
    </div>
  );
}
