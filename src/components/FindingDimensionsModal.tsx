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
    label: "Title",
    description: "Finding title shown in the report; briefly summarise the issue.",
    type: "text",
  },
  {
    key: "priority",
    label: "Priority",
    description: "For report grouping, CapEx table and Executive summary: Urgent / Recommended 0–3 months / Plan & Monitor.",
    type: "select",
    options: [
      { value: "IMMEDIATE", label: "IMMEDIATE", meaning: "Requires immediate action; report shows urgent." },
      { value: "RECOMMENDED_0_3_MONTHS", label: "RECOMMENDED_0_3_MONTHS", meaning: "Recommend within 0–3 months." },
      { value: "PLAN_MONITOR", label: "PLAN_MONITOR", meaning: "Can monitor or include in long-term plan." },
    ],
  },
  {
    key: "safety",
    label: "Safety",
    description: "Risk level to people/property.",
    type: "select",
    options: [
      { value: "HIGH", label: "HIGH", meaning: "Direct risk (shock, fire) or clear code violation." },
      { value: "MODERATE", label: "MODERATE", meaning: "Potential hazard or compliance risk, needs assessment." },
      { value: "LOW", label: "LOW", meaning: "Cosmetic or maintenance, no direct safety threat." },
    ],
  },
  {
    key: "urgency",
    label: "Urgency",
    description: "Recommended time window to address.",
    type: "select",
    options: [
      { value: "IMMEDIATE", label: "IMMEDIATE", meaning: "Address immediately (e.g. fault, overheating)." },
      { value: "SHORT_TERM", label: "SHORT_TERM", meaning: "Within 0–3 months." },
      { value: "LONG_TERM", label: "LONG_TERM", meaning: "Can be scheduled or monitored." },
    ],
  },
  {
    key: "liability",
    label: "Liability",
    description: "Liability or insurance issues if not addressed.",
    type: "select",
    options: [
      { value: "HIGH", label: "HIGH", meaning: "May lead to disputes, insurance denial or legal risk." },
      { value: "MEDIUM", label: "MEDIUM", meaning: "Some liability or compliance risk." },
      { value: "LOW", label: "LOW", meaning: "Low liability risk." },
    ],
  },
  {
    key: "budget_low",
    label: "Budget Low (AUD)",
    description: "Estimated repair cost lower bound for budgeting.",
    type: "number",
  },
  {
    key: "budget_high",
    label: "Budget High (AUD)",
    description: "Estimated repair cost upper bound.",
    type: "number",
  },
  {
    key: "severity",
    label: "Severity (1–5)",
    description: "Severity of the issue: 1=very minor, 5=very severe.",
    type: "select",
    options: [
      { value: 1, label: "1", meaning: "Very minor" },
      { value: 2, label: "2", meaning: "Minor" },
      { value: 3, label: "3", meaning: "Moderate" },
      { value: 4, label: "4", meaning: "Significant" },
      { value: 5, label: "5", meaning: "Very severe" },
    ],
  },
  {
    key: "likelihood",
    label: "Likelihood (1–5)",
    description: "If not addressed, likelihood of adverse outcome: 1=unlikely, 5=likely.",
    type: "select",
    options: [
      { value: 1, label: "1", meaning: "Unlikely" },
      { value: 2, label: "2", meaning: "Low" },
      { value: 3, label: "3", meaning: "Moderate" },
      { value: 4, label: "4", meaning: "High" },
      { value: 5, label: "5", meaning: "Very likely" },
    ],
  },
  {
    key: "escalation",
    label: "Escalation",
    description: "If not addressed, risk of worsening or escalation.",
    type: "select",
    options: [
      { value: "HIGH", label: "HIGH", meaning: "May worsen quickly or trigger chain issues." },
      { value: "MODERATE", label: "MODERATE", meaning: "May worsen over time." },
      { value: "LOW", label: "LOW", meaning: "Stable, unlikely to escalate." },
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
          <h2 className="finding-dimensions-modal__title">Edit 9 dimensions</h2>
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
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="btn-primary"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
