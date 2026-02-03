/**
 * Modal for backend engineer (not technician) to fill 9 维度 for custom "other" issues.
 * Shown on ReviewPage when engineer opens review URL from email and custom findings need dimensions.
 */

/** 填写说明与标准：每个维度的含义及选项选择标准 */
const DIMENSION_GUIDE = [
  {
    name: "Safety（安全）",
    desc: "该问题对人身/财产的风险等级。",
    options: [
      "HIGH：触电、火灾等直接人身风险，或明显违反规范。",
      "MODERATE：潜在隐患或合规风险，需尽快评估。",
      "LOW：外观或维护类，无直接安全威胁。",
    ],
  },
  {
    name: "Urgency（紧急程度）",
    desc: "建议处理的时间窗口。",
    options: [
      "IMMEDIATE：需立即处理（如漏电、过热）。",
      "SHORT_TERM：建议 0–3 个月内处理。",
      "LONG_TERM：可计划排期或观察。",
    ],
  },
  {
    name: "Liability（责任/合规）",
    desc: "不处理时可能引发的责任或保险问题。",
    options: [
      "HIGH：易引发责任纠纷、保险拒赔或法律风险。",
      "MEDIUM：有一定责任或合规风险。",
      "LOW：责任风险低。",
    ],
  },
  {
    name: "Budget Low / Budget High（预算区间）",
    desc: "预估修复成本区间（澳元），便于业主做预算。填大致范围即可，如 200–500。",
    options: [],
  },
  {
    name: "Priority（报告中的优先级标签）",
    desc: "与 Safety/Urgency 一致，用于报告中的分类显示。",
    options: [
      "IMMEDIATE：与「需立即处理」对应，报告标为紧急。",
      "RECOMMENDED_0_3_MONTHS：建议 0–3 月内处理。",
      "PLAN_MONITOR：可观察或纳入长期计划。",
    ],
  },
  {
    name: "Severity（严重程度 1–5）",
    desc: "问题本身的严重程度：1=很轻，5=很严重；结合安全与后果综合打分。",
    options: ["1：很轻", "2：较轻", "3：中等", "4：较严重", "5：很严重"],
  },
  {
    name: "Likelihood（发生可能性 1–5）",
    desc: "若不处理，不良后果发生的可能性：1=几乎不会，5=很可能。",
    options: ["1：几乎不会发生", "2：较低", "3：中等", "4：较高", "5：很可能发生"],
  },
  {
    name: "Escalation（升级风险）",
    desc: "若不处理，问题恶化或升级的可能性。",
    options: [
      "HIGH：易快速恶化或引发连锁问题。",
      "MODERATE：可能随时间加重。",
      "LOW：较稳定，不易升级。",
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
          <h2 style={{ margin: "0 0 8px 0", fontSize: 20 }}>补全自定义 Issue 的 9 维度数据</h2>
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
            以下为技师手动填写的 issue（Other），请工程师按标准补全 9 维度后保存，方可生成报告。
          </p>
          <details style={{ marginTop: 12, padding: 10, background: "#f8f9fa", borderRadius: 6 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>填写说明与标准（各维度含义及选项选择标准）</summary>
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
