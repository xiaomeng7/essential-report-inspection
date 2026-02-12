/**
 * Modal for backend engineer (not technician) to fill 9 dimensions for custom "other" issues.
 * Shown on ReviewPage when engineer opens review URL from email and custom findings need dimensions.
 */

/** Guide: dimension meanings and option selection criteria */
const DIMENSION_GUIDE = [
  {
    name: "Safety",
    desc: "Risk level to people/property.",
    options: [
      "HIGH: Direct risk (shock, fire) or clear code violation.",
      "MODERATE: Potential hazard or compliance risk, needs assessment.",
      "LOW: Cosmetic or maintenance, no direct safety threat.",
    ],
  },
  {
    name: "Urgency",
    desc: "Recommended time window to address.",
    options: [
      "IMMEDIATE: Address immediately (e.g. fault, overheating).",
      "SHORT_TERM: Within 0–3 months.",
      "LONG_TERM: Can be scheduled or monitored.",
    ],
  },
  {
    name: "Liability",
    desc: "Liability or insurance issues if not addressed.",
    options: [
      "HIGH: May lead to disputes, insurance denial or legal risk.",
      "MEDIUM: Some liability or compliance risk.",
      "LOW: Low liability risk.",
    ],
  },
  {
    name: "Budget Low / Budget High",
    desc: "Estimated repair cost range (AUD). Rough range fine, e.g. 200–500.",
    options: [],
  },
  {
    name: "Priority",
    desc: "Matches Safety/Urgency; used for report grouping.",
    options: [
      "IMMEDIATE: Requires immediate action; report shows urgent.",
      "RECOMMENDED_0_3_MONTHS: Within 0–3 months.",
      "PLAN_MONITOR: Can monitor or include in long-term plan.",
    ],
  },
  {
    name: "Severity (1–5)",
    desc: "How severe the issue is: 1=very minor, 5=very severe.",
    options: ["1: Very minor", "2: Minor", "3: Moderate", "4: Significant", "5: Very severe"],
  },
  {
    name: "Likelihood (1–5)",
    desc: "If not addressed, likelihood of adverse outcome: 1=unlikely, 5=likely.",
    options: ["1: Unlikely", "2: Low", "3: Moderate", "4: High", "5: Very likely"],
  },
  {
    name: "Escalation",
    desc: "If not addressed, risk of worsening or escalation.",
    options: [
      "HIGH: May worsen quickly or trigger chain issues.",
      "MODERATE: May worsen over time.",
      "LOW: Stable, unlikely to escalate.",
    ],
  },
];

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
          <h2 style={{ margin: "0 0 8px 0", fontSize: 20 }}>Complete 9 dimensions for custom issues</h2>
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
            These are technician-entered issues (Other). Fill in the 9 dimensions per standards and save to generate the report.
          </p>
          <details style={{ marginTop: 12, padding: 10, background: "#f8f9fa", borderRadius: 6 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Guide (dimension meanings and selection criteria)</summary>
            <div style={{ marginTop: 8, fontSize: 12, color: "#444", lineHeight: 1.7 }}>
              {DIMENSION_GUIDE.map((g) => (
                <div key={g.name} style={{ marginBottom: 10 }}>
                  <strong>{g.name}</strong>
                  {g.desc && <span> {g.desc}</span>}
                  {g.options.length > 0 && (
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                      {g.options.map((opt, i) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </details>
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
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary"
            disabled={!allValid || saving}
          >
            {saving ? "Saving…" : "Save and close"}
          </button>
        </div>
      </div>
    </div>
  );
}
