/**
 * Modal for backend engineer (not technician) to fill 7 dimensions for custom "other" issues.
 * Shown on ReviewPage when engineer opens review URL from email and custom findings need dimensions.
 */

export type CustomFindingInput = {
  id: string;
  title: string;
  source: "gpo" | "lighting";
  roomLabel?: string;
  safety: string;
  urgency: string;
  liability: string;
  budget_low: number | "";
  budget_high: number | "";
  priority: string;
  severity: number | "";
  likelihood: number | "";
  escalation: string;
};

type Props = {
  findings: CustomFindingInput[];
  onChange: (index: number, field: keyof CustomFindingInput, value: string | number | "") => void;
  onConfirm: () => void;
  onCancel: () => void;
  saving?: boolean;
};

export function CustomFindingsModal({ findings, onChange, onConfirm, onCancel, saving }: Props) {
  const allValid = findings.every((f) => {
    return (
      f.safety && f.urgency && f.liability && f.priority &&
      (f.severity !== "" && f.severity >= 1 && f.severity <= 5) &&
      (f.likelihood !== "" && f.likelihood >= 1 && f.likelihood <= 5) &&
      f.escalation &&
      (f.budget_low !== "" || f.budget_high !== "")
    );
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          maxWidth: 900,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 24, borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 20 }}>补全自定义 Issue 的 7 维度数据</h2>
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
            以下为技师手动填写的 issue（Other），请工程师补全 7 维度后保存，方可生成报告。
          </p>
        </div>
        <div style={{ padding: 24 }}>
          {findings.map((f, idx) => (
            <div
              key={f.id}
              style={{
                marginBottom: 24,
                padding: 16,
                background: "#f8f9fa",
                borderRadius: 8,
                border: "1px solid #eee",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 12 }}>
                {f.title}
                {f.roomLabel && <span style={{ color: "#666", fontWeight: 400 }}> ({f.roomLabel})</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Safety</label>
                  <select
                    value={f.safety}
                    onChange={(e) => onChange(idx, "safety", e.target.value)}
                    style={{ width: "100%", padding: 6, marginTop: 2 }}
                  >
                    <option value="">—</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MODERATE">MODERATE</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Urgency</label>
                  <select
                    value={f.urgency}
                    onChange={(e) => onChange(idx, "urgency", e.target.value)}
                    style={{ width: "100%", padding: 6, marginTop: 2 }}
                  >
                    <option value="">—</option>
                    <option value="IMMEDIATE">IMMEDIATE</option>
                    <option value="SHORT_TERM">SHORT_TERM</option>
                    <option value="LONG_TERM">LONG_TERM</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Liability</label>
                  <select
                    value={f.liability}
                    onChange={(e) => onChange(idx, "liability", e.target.value)}
                    style={{ width: "100%", padding: 6, marginTop: 2 }}
                  >
                    <option value="">—</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Budget Low</label>
                  <input
                    type="number"
                    value={f.budget_low}
                    onChange={(e) => onChange(idx, "budget_low", e.target.value ? Number(e.target.value) : "")}
                    placeholder="—"
                    style={{ width: "100%", padding: 6, marginTop: 2, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Budget High</label>
                  <input
                    type="number"
                    value={f.budget_high}
                    onChange={(e) => onChange(idx, "budget_high", e.target.value ? Number(e.target.value) : "")}
                    placeholder="—"
                    style={{ width: "100%", padding: 6, marginTop: 2, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Priority</label>
                  <select
                    value={f.priority}
                    onChange={(e) => onChange(idx, "priority", e.target.value)}
                    style={{ width: "100%", padding: 6, marginTop: 2 }}
                  >
                    <option value="">—</option>
                    <option value="IMMEDIATE">IMMEDIATE</option>
                    <option value="RECOMMENDED_0_3_MONTHS">RECOMMENDED_0_3_MONTHS</option>
                    <option value="PLAN_MONITOR">PLAN_MONITOR</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Severity (1-5)</label>
                  <select
                    value={f.severity}
                    onChange={(e) => onChange(idx, "severity", e.target.value ? Number(e.target.value) : "")}
                    style={{ width: "100%", padding: 6, marginTop: 2 }}
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Likelihood (1-5)</label>
                  <select
                    value={f.likelihood}
                    onChange={(e) => onChange(idx, "likelihood", e.target.value ? Number(e.target.value) : "")}
                    style={{ width: "100%", padding: 6, marginTop: 2 }}
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#666" }}>Escalation</label>
                  <select
                    value={f.escalation}
                    onChange={(e) => onChange(idx, "escalation", e.target.value)}
                    style={{ width: "100%", padding: 6, marginTop: 2 }}
                  >
                    <option value="">—</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MODERATE">MODERATE</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 24, borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button type="button" onClick={onCancel} className="btn-secondary">
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary"
            disabled={!allValid || saving}
          >
            {saving ? "保存中…" : "保存并关闭"}
          </button>
        </div>
      </div>
    </div>
  );
}
