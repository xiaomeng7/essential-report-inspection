import { useState, useMemo } from "react";
import { getSections } from "../lib/fieldDictionary";
import { isSectionGatedOut, isSectionAutoSkipped } from "../lib/gates";
import { validateSection } from "../lib/validation";
import { useInspection } from "../hooks/useInspection";
import { SectionForm } from "./SectionForm";

const GATE_KEYS = new Set([
  "rcd_tests.performed",
  "gpo_tests.performed",
  "assets.has_solar_pv",
  "assets.has_battery",
  "assets.has_ev_charger",
]);

type Props = { onSubmitted: (inspectionId: string) => void };

export function Wizard({ onSubmitted }: Props) {
  const { state, setAnswer, setAnswerWithGateCheck, getValue, getAnswer, clearDraft } = useInspection();
  const [step, setStep] = useState(0);
  const [sectionErrors, setSectionErrors] = useState<Record<string, Record<string, string>>>({});

  const sections = useMemo(() => getSections(), []);
  const visibleSections = useMemo(() => {
    return sections.filter((s) => !isSectionGatedOut(s.id, state) && !isSectionAutoSkipped(s.id, state));
  }, [sections, state]);

  const current = visibleSections[step];
  const isFirst = step === 0;
  const isLast = step === visibleSections.length - 1;
  const progress = visibleSections.length ? ((step + 1) / visibleSections.length) * 100 : 0;

  const goNext = () => {
    if (!current) return;
    const { valid, errors } = validateSection(current.id, state);
    if (!valid) {
      // Debug: log validation errors
      if (process.env.NODE_ENV === "development") {
        console.log("Validation errors:", errors);
        console.log("Current state:", state);
      }
      setSectionErrors((prev) => ({ ...prev, [current.id]: errors }));
      return;
    }
    setSectionErrors((prev) => {
      const next = { ...prev };
      delete next[current.id];
      return next;
    });
    if (isLast) {
      submitInspection();
      return;
    }
    setStep((s) => Math.min(s + 1, visibleSections.length - 1));
  };

  const goBack = () => {
    setStep((s) => Math.max(0, s - 1));
  };

  const submitInspection = async () => {
    const payload = { created_at: new Date().toISOString(), ...state };
    try {
      const res = await fetch("/api/submitInspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { inspection_id: string; status: string; review_url: string };
      clearDraft();
      onSubmitted(data.inspection_id);
    } catch (e) {
      setSectionErrors((prev) => ({
        ...prev,
        [current!.id]: { _submit: (e as Error).message },
      }));
    }
  };

  return (
    <div className="app">
      <div className="progress-wrap">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="progress-text">
          Section {step + 1} of {visibleSections.length}
        </p>
      </div>

      {current && (
        <>
          {(sectionErrors[current.id]?._submit) && (
            <div className="section" style={{ margin: 12 }}>
              <p className="validation-msg">{sectionErrors[current.id]._submit}</p>
            </div>
          )}
          <SectionForm
            section={current}
            state={state}
            setAnswer={setAnswer}
            setAnswerWithGateCheck={setAnswerWithGateCheck}
            getValue={getValue}
            getAnswer={getAnswer}
            errors={sectionErrors[current.id] ?? {}}
            gateKeys={GATE_KEYS}
          />
        </>
      )}

      <div className="actions">
        <button type="button" className="btn-secondary" onClick={goBack} disabled={isFirst}>
          Back
        </button>
        {!isLast && (
          <button type="button" className="btn-secondary" onClick={() => {}}>
            Save Draft
          </button>
        )}
        <button type="button" className="btn-primary" onClick={goNext}>
          {isLast ? "Submit Inspection" : "Next"}
        </button>
      </div>
    </div>
  );
}

