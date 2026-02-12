import { useState, useEffect, useCallback } from "react";
import { FindingDimensionsModal, type FindingDimensionsForm } from "./FindingDimensionsModal";

type FindingRow = {
  id: string;
  title?: string;
  priority?: string;
  location?: string;
};

type ReviewData = {
  inspection_id: string;
  findings: FindingRow[];
  raw_data?: Record<string, unknown>;
};

function emptyForm(): FindingDimensionsForm {
  return {
    title: "",
    safety: "",
    urgency: "",
    liability: "",
    budget_low: "",
    budget_high: "",
    priority: "",
    severity: "",
    likelihood: "",
    escalation: "",
  };
}

function getDimensionsForFinding(
  findingId: string,
  raw?: Record<string, unknown>
): Partial<FindingDimensionsForm> {
  const debug = (raw?.finding_dimensions_debug as Record<string, Partial<FindingDimensionsForm>>) ?? {};
  const fromDebug = debug[findingId];
  if (fromDebug) return fromDebug;
  const completed = (raw?.custom_findings_completed as Array<Record<string, unknown>>) ?? [];
  const custom = completed.find((c) => c.id === findingId);
  if (custom) {
    return {
      title: (custom.title as string) ?? "",
      safety: (custom.safety as string) ?? "",
      urgency: (custom.urgency as string) ?? "",
      liability: (custom.liability as string) ?? "",
      budget_low: (custom.budget_low as number) ?? "",
      budget_high: (custom.budget_high as number) ?? "",
      priority: (custom.priority as string) ?? "",
      severity: (custom.severity as number) ?? "",
      likelihood: (custom.likelihood as number) ?? "",
      escalation: (custom.escalation as string) ?? "",
    };
  }
  return {};
}

type Props = {
  onBack: () => void;
};

export function FindingsDebugPage({ onBack }: Props) {
  const [inspectionId, setInspectionId] = useState("");
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<FindingRow | null>(null);
  const [form, setForm] = useState<FindingDimensionsForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const loadReview = useCallback(async () => {
    const id = inspectionId.trim();
    if (!id) {
      setError("Please enter Inspection ID");
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/review/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ReviewData;
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("inspection_id");
    if (id) {
      setInspectionId(id);
    }
  }, []);

  const openModal = (finding: FindingRow) => {
    const merged: FindingDimensionsForm = {
      ...emptyForm(),
      title: finding.title ?? finding.id.replace(/_/g, " "),
      ...getDimensionsForFinding(finding.id, data?.raw_data),
    };
    if (data?.raw_data) {
      const f = (data.findings ?? []).find((x) => x.id === finding.id) as FindingRow & { priority?: string };
      if (f?.priority) merged.priority = f.priority;
    }
    setForm(merged);
    setSelectedFinding(finding);
  };

  const handleChange = (field: keyof FindingDimensionsForm, value: string | number | "") => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!selectedFinding || !inspectionId.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/debugSaveFindingDimensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_id: inspectionId.trim(),
          finding_id: selectedFinding.id,
          dimensions: {
            title: form.title || undefined,
            safety: form.safety || undefined,
            urgency: form.urgency || undefined,
            liability: form.liability || undefined,
            budget_low: form.budget_low !== "" ? form.budget_low : undefined,
            budget_high: form.budget_high !== "" ? form.budget_high : undefined,
            priority: form.priority || undefined,
            severity: form.severity !== "" ? form.severity : undefined,
            likelihood: form.likelihood !== "" ? form.likelihood : undefined,
            escalation: form.escalation || undefined,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelectedFinding(null);
      await loadReview();
    } catch (e) {
      alert("Save failed: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="findings-debug-page">
      <div className="findings-debug-page__header">
        <button type="button" onClick={onBack} className="btn-secondary">
          Back
        </button>
        <h1 className="findings-debug-page__title">Finding 9 dimensions debug</h1>
      </div>

      <div className="findings-debug-page__toolbar">
        <input
          type="text"
          value={inspectionId}
          onChange={(e) => setInspectionId(e.target.value)}
          placeholder="Inspection ID"
          className="findings-debug-page__input"
        />
        <button type="button" onClick={loadReview} className="btn-primary" disabled={loading}>
          {loading ? "Loading…" : "Load Findings"}
        </button>
      </div>

      {error && <p className="validation-msg">{error}</p>}

      {data && (
        <div className="findings-debug-page__list-wrap">
          <p className="findings-debug-page__count">
            {data.findings?.length ?? 0} Finding(s). Click one to edit 9 dimensions.
          </p>
          <ul className="findings-debug-page__list">
            {(data.findings ?? []).map((f) => (
              <li key={f.id} className="findings-debug-page__item">
                <button
                  type="button"
                  className="findings-debug-page__item-btn"
                  onClick={() => openModal(f)}
                >
                  <span className="findings-debug-page__item-id">{f.id}</span>
                  <span className="findings-debug-page__item-title">
                    {f.title ?? f.id.replace(/_/g, " ")}
                  </span>
                  {f.priority && (
                    <span className="findings-debug-page__item-priority">{f.priority}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedFinding && (
        <FindingDimensionsModal
          findingId={selectedFinding.id}
          findingTitle={selectedFinding.title ?? ""}
          dimensions={form}
          onChange={handleChange}
          onSave={handleSave}
          onCancel={() => setSelectedFinding(null)}
          saving={saving}
        />
      )}
    </div>
  );
}
