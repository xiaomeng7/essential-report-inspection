/**
 * Modal to edit one finding's 9 dimensions, with explanations for each parameter and option.
 */

export type FindingDimensionsForm = {
  title: string;
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

const DIMENSION_FIELDS: Array<{
  key: keyof FindingDimensionsForm;
  label: string;
  description: string;
  type: "select" | "number" | "text";
  options?: Array<{ value: string | number; label: string; meaning: string }>;
}> = [
  {
    key: "title",
    label: "Title（显示标题）",
    description: "报告中显示的 Finding 标题，可简短概括问题。",
    type: "text",
  },
  {
    key: "priority",
    label: "Priority（报告优先级）",
    description: "用于报告分组、CapEx 表和 Executive 摘要。决定在报告中归为「紧急 / 建议 0–3 月 / 计划与观察」。",
    type: "select",
    options: [
      { value: "IMMEDIATE", label: "IMMEDIATE", meaning: "需立即处理，报告标为紧急。" },
      { value: "RECOMMENDED_0_3_MONTHS", label: "RECOMMENDED_0_3_MONTHS", meaning: "建议 0–3 个月内处理。" },
      { value: "PLAN_MONITOR", label: "PLAN_MONITOR", meaning: "可观察或纳入长期计划。" },
    ],
  },
  {
    key: "safety",
    label: "Safety（安全影响）",
    description: "该问题对人身/财产的风险等级。",
    type: "select",
    options: [
      { value: "HIGH", label: "HIGH", meaning: "触电、火灾等直接人身风险，或明显违反规范。" },
      { value: "MODERATE", label: "MODERATE", meaning: "潜在隐患或合规风险，需尽快评估。" },
      { value: "LOW", label: "LOW", meaning: "外观或维护类，无直接安全威胁。" },
    ],
  },
  {
    key: "urgency",
    label: "Urgency（紧急程度）",
    description: "建议处理的时间窗口。",
    type: "select",
    options: [
      { value: "IMMEDIATE", label: "IMMEDIATE", meaning: "需立即处理（如漏电、过热）。" },
      { value: "SHORT_TERM", label: "SHORT_TERM", meaning: "建议 0–3 个月内处理。" },
      { value: "LONG_TERM", label: "LONG_TERM", meaning: "可计划排期或观察。" },
    ],
  },
  {
    key: "liability",
    label: "Liability（责任/合规）",
    description: "不处理时可能引发的责任或保险问题。",
    type: "select",
    options: [
      { value: "HIGH", label: "HIGH", meaning: "易引发责任纠纷、保险拒赔或法律风险。" },
      { value: "MEDIUM", label: "MEDIUM", meaning: "有一定责任或合规风险。" },
      { value: "LOW", label: "LOW", meaning: "责任风险低。" },
    ],
  },
  {
    key: "budget_low",
    label: "Budget Low（预算下限，澳元）",
    description: "预估修复成本下限，便于业主做预算。",
    type: "number",
  },
  {
    key: "budget_high",
    label: "Budget High（预算上限，澳元）",
    description: "预估修复成本上限。",
    type: "number",
  },
  {
    key: "severity",
    label: "Severity（严重程度 1–5）",
    description: "问题本身的严重程度：1=很轻，5=很严重；结合安全与后果综合打分。",
    type: "select",
    options: [
      { value: 1, label: "1", meaning: "很轻" },
      { value: 2, label: "2", meaning: "较轻" },
      { value: 3, label: "3", meaning: "中等" },
      { value: 4, label: "4", meaning: "较严重" },
      { value: 5, label: "5", meaning: "很严重" },
    ],
  },
  {
    key: "likelihood",
    label: "Likelihood（发生可能性 1–5）",
    description: "若不处理，不良后果发生的可能性：1=几乎不会，5=很可能。",
    type: "select",
    options: [
      { value: 1, label: "1", meaning: "几乎不会发生" },
      { value: 2, label: "2", meaning: "较低" },
      { value: 3, label: "3", meaning: "中等" },
      { value: 4, label: "4", meaning: "较高" },
      { value: 5, label: "5", meaning: "很可能发生" },
    ],
  },
  {
    key: "escalation",
    label: "Escalation（升级风险）",
    description: "若不处理，问题恶化或升级的可能性。",
    type: "select",
    options: [
      { value: "HIGH", label: "HIGH", meaning: "易快速恶化或引发连锁问题。" },
      { value: "MODERATE", label: "MODERATE", meaning: "可能随时间加重。" },
      { value: "LOW", label: "LOW", meaning: "较稳定，不易升级。" },
    ],
  },
];

type Props = {
  findingId: string;
  findingTitle: string;
  dimensions: FindingDimensionsForm;
  onChange: (field: keyof FindingDimensionsForm, value: string | number | "") => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
};

export function FindingDimensionsModal({
  findingId,
  findingTitle,
  dimensions,
  onChange,
  onSave,
  onCancel,
  saving,
}: Props) {
  return (
    <div
      className="finding-dimensions-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="finding-dimensions-modal">
        <div className="finding-dimensions-modal__header">
          <h2 className="finding-dimensions-modal__title">编辑 9 维度</h2>
          <p className="finding-dimensions-modal__subtitle">
            Finding: <strong>{findingId}</strong>
            {findingTitle && ` — ${findingTitle}`}
          </p>
        </div>
        <div className="finding-dimensions-modal__body">
          {DIMENSION_FIELDS.map((field) => (
            <div key={field.key} className="finding-dimensions-field">
              <label className="finding-dimensions-field__label">{field.label}</label>
              <p className="finding-dimensions-field__desc">{field.description}</p>
              {field.type === "text" && (
                <input
                  type="text"
                  value={dimensions[field.key] as string}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  className="finding-dimensions-field__input"
                />
              )}
              {field.type === "number" && (
                <input
                  type="number"
                  value={dimensions[field.key] as number | ""}
                  onChange={(e) =>
                    onChange(field.key, e.target.value ? Number(e.target.value) : "")
                  }
                  placeholder="—"
                  className="finding-dimensions-field__input"
                />
              )}
              {field.type === "select" && field.options && (
                <>
                  <select
                    value={String(dimensions[field.key])}
                    onChange={(e) => {
                      const v = e.target.value;
                      const opt = field.options!.find((o) => String(o.value) === v);
                      onChange(
                        field.key,
                        opt && typeof opt.value === "number" ? opt.value : v
                      );
                    }}
                    className="finding-dimensions-field__select"
                  >
                    <option value="">—</option>
                    {field.options.map((o) => (
                      <option key={String(o.value)} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ul className="finding-dimensions-field__meanings">
                    {field.options.map((o) => (
                      <li key={String(o.value)}>
                        <strong>{o.label}</strong>: {o.meaning}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="finding-dimensions-modal__footer">
          <button type="button" onClick={onCancel} className="btn-secondary">
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            className="btn-primary"
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
