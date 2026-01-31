import { useMemo, useCallback } from "react";
import type { SectionDef, FieldDef } from "../lib/fieldDictionary";
import { isSectionGatedOut, isSectionAutoSkipped } from "../lib/gates";
import type { InspectionState } from "../hooks/useInspection";
import { FieldRenderer } from "./FieldRenderer";
import { IssueDetailCapture, createEmptyIssueDetail, type IssueDetail } from "./IssueDetailCapture";

type Props = {
  section: SectionDef;
  state: InspectionState;
  setAnswer: (key: string, payload: import("../hooks/useInspection").Answer | import("../hooks/useInspection").AnswerValue) => void;
  setAnswerWithGateCheck: (key: string, payload: import("../hooks/useInspection").Answer | import("../hooks/useInspection").AnswerValue, prev?: unknown) => void;
  getValue: (key: string) => unknown;
  getAnswer: (key: string) => import("../hooks/useInspection").Answer | undefined;
  errors: Record<string, string>;
  gateKeys: Set<string>;
  /** Get issue detail for a field key */
  getIssueDetail?: (fieldKey: string) => IssueDetail | undefined;
  /** Set issue detail for a field key */
  setIssueDetail?: (fieldKey: string, detail: IssueDetail) => void;
};

/** Check if a field value indicates an issue (true for boolean, "yes" for yes_no_unsure) */
function isIssueTriggered(field: FieldDef, value: unknown): boolean {
  if (!field.on_issue_capture) return false;
  if (field.type === "boolean") return value === true;
  if (field.enum === "yes_no_unsure") return value === "yes";
  return false;
}

function getNested(obj: unknown, path: string): unknown {
  if (obj == null || typeof obj !== "object") return undefined;
  const flat = obj as Record<string, unknown>;
  // First try flat key (e.g., "job.address" or "rcd_tests.performed")
  if (path in flat) {
    return flat[path];
  }
  // Fallback to nested structure (e.g., obj.job.address)
  const parts = path.split(".");
  let v: unknown = obj;
  for (const p of parts) {
    if (v == null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

function evalRequiredWhen(expr: string, flat: Record<string, unknown>): boolean {
  if (expr === "any(access.*_accessible==false)") {
    const keys = ["access.switchboard_accessible", "access.roof_accessible", "access.underfloor_accessible"];
    return keys.some((k) => getNested(flat, k) === false);
  }
  if (expr.startsWith("any(")) {
    const rest = expr.slice(4);
    const close = rest.indexOf(")");
    const inner = rest.slice(0, close).trim();
    const suffix = rest.slice(close + 1).trim();
    const preds = inner.split(",").map((s) => s.trim());
    if (suffix.startsWith("==")) {
      const right = suffix.slice(2).trim();
      const target = right === "true";
      for (const p of preds) {
        const v = getNested(flat, p);
        if (v === target) return true;
      }
      return false;
    }
    for (const p of preds) {
      if (p.includes("==")) {
        const [left, right] = p.split("==").map((s) => s.trim());
        const v = getNested(flat, left);
        if (right === "true" && v === true) return true;
        if (right === "false" && v === false) return true;
      }
    }
    return false;
  }
  const eq = expr.indexOf("==");
  if (eq === -1) return false;
  const left = expr.slice(0, eq).trim();
  const right = expr.slice(eq + 2).trim();
  const v = getNested(flat, left);
  if (right === "true") return v === true;
  if (right === "false") return v === false;
  return v === right;
}

function flattenValues(state: InspectionState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (o: unknown, prefix: string) => {
    if (o == null) return;
    if (Array.isArray(o)) {
      out[prefix] = o;
      return;
    }
    if (typeof o === "object" && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "object" && v !== null && "value" in (v as object)) {
          out[path] = (v as { value: unknown }).value;
        } else {
          walk(v, path);
        }
      }
    }
  };
  walk(state, "");
  return out;
}

export function SectionForm({
  section,
  state,
  setAnswer,
  setAnswerWithGateCheck,
  getValue,
  getAnswer,
  errors,
  gateKeys,
  getIssueDetail,
  setIssueDetail,
}: Props) {
  const flat = useMemo(() => flattenValues(state), [state]);
  const gatedOut = isSectionGatedOut(section.id, state);
  const autoSkipped = isSectionAutoSkipped(section.id, state);

  const handleIssueDetailChange = useCallback(
    (fieldKey: string, detail: IssueDetail) => {
      if (setIssueDetail) {
        setIssueDetail(fieldKey, detail);
      }
    },
    [setIssueDetail]
  );

  const visibleFields = useMemo(() => {
    const out: FieldDef[] = [];
    for (const f of section.fields) {
      if (f.required_when && !evalRequiredWhen(f.required_when, flat)) continue;
      out.push(f);
    }
    return out;
  }, [section.fields, flat]);

  if (gatedOut || autoSkipped) {
    return (
      <div className="section">
        <h2>{section.title}</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Section skipped {gatedOut ? "(gate not met)" : "(not applicable)"}.
        </p>
      </div>
    );
  }

  return (
    <div className="section">
      <h2>{section.title}</h2>
      {visibleFields.map((f) => {
        const answer = getAnswer(f.key);
        // Always use getValue to get the actual value, not the Answer object
        const value = getValue(f.key);
        // Debug: log field value
        if (f.required) {
          console.log(`Field ${f.key}: answer=`, answer, "value=", value, "type=", typeof value);
        }
        const showIssueCapture = isIssueTriggered(f, value);
        const issueDetail = showIssueCapture && getIssueDetail ? getIssueDetail(f.key) : undefined;
        return (
          <div key={f.key}>
            <FieldRenderer
              field={f}
              value={answer ?? value}
              onChange={setAnswer}
              error={errors[f.key]}
              isGate={gateKeys.has(f.key)}
              onGateChange={(key, newVal, prevVal) => setAnswerWithGateCheck(key, newVal as import("../hooks/useInspection").AnswerValue, prevVal)}
            />
            {showIssueCapture && setIssueDetail && (
              <IssueDetailCapture
                fieldKey={f.key}
                fieldLabel={f.label}
                detail={issueDetail ?? createEmptyIssueDetail()}
                onDetailChange={handleIssueDetailChange}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
