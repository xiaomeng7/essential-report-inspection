import { useState } from "react";
import type { FieldDef } from "../lib/fieldDictionary";
import { getEnum, getSkipReasons } from "../lib/fieldDictionary";
import type { Answer, AnswerValue } from "../hooks/useInspection";

type Props = {
  field: FieldDef;
  value: unknown;
  onChange: (key: string, payload: Answer | AnswerValue) => void;
  error?: string;
  isGate?: boolean;
  onGateChange?: (key: string, newVal: unknown, prevVal: unknown) => void;
};

const SKIP_REASONS = getSkipReasons();

function normalizeVal(v: unknown, type: string): string | number | boolean | string[] {
  if (v == null) {
    if (type === "boolean") return false;
    if (type === "array_enum") return [];
    if (type === "integer" || type === "number") return "";
    return "";
  }
  if (typeof v === "object" && "value" in (v as object)) {
    const answerValue = (v as Answer).value;
    // If the answer value is null/undefined, normalize it based on type
    if (answerValue == null) {
      if (type === "boolean") return false;
      if (type === "array_enum") return [];
      if (type === "integer" || type === "number") return "";
      return "";
    }
    return answerValue as string | number | boolean | string[];
  }
  return v as string | number | boolean | string[];
}

export function FieldRenderer({ field, value, onChange, error, isGate, onGateChange }: Props) {
  const raw = typeof value === "object" && value !== null && "value" in (value as object) ? (value as Answer) : null;
  const val = normalizeVal(value, field.type);
  const skipped = raw?.status === "skipped";
  const enumOpts = field.enum ? getEnum(field.enum) : field.enum_values ?? [];

  const handleChange = (v: unknown) => {
    console.log(`FieldRenderer.handleChange: field=${field.key}, value=`, v, "type=", typeof v);
    if (isGate && onGateChange && typeof raw?.value !== "undefined") {
      onGateChange(field.key, v, raw.value);
      return;
    }
    onChange(field.key, { value: v as AnswerValue, status: "answered" });
  };

  const handleSkip = (reason: string, note?: string) => {
    onChange(field.key, { value: null, status: "skipped", skip_reason: reason, skip_note: note || undefined });
  };

  const id = `f-${field.key.replace(/\./g, "-")}`;

  if (field.ui === "text") {
    return (
      <div className="field">
        <label htmlFor={id}>{field.label}</label>
        <input
          id={id}
          type="text"
          value={(val as string) || ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={skipped}
        />
        {field.skippable && (
          <SkipRow skipped={skipped} raw={raw} onSkip={handleSkip} onUnskip={() => handleChange("")} />
        )}
        {error && <p className="validation-msg">{error}</p>}
      </div>
    );
  }

  if (field.ui === "number") {
    console.log(`FieldRenderer: rendering number field ${field.key}, val=`, val, "type=", typeof val, "raw=", raw, "skipped=", skipped);
    return (
      <div className="field">
        <label htmlFor={id}>{field.label}</label>
        <input
          id={id}
          type="number"
          min={field.min}
          max={field.max}
          value={val === null || val === "" || val === undefined ? "" : String(val as number)}
          onChange={(e) => {
            console.log(`Number input onChange triggered: field=${field.key}, event.target.value=`, e.target.value);
            const inputVal = e.target.value;
            const numVal = inputVal === "" ? null : (inputVal === "0" ? 0 : Number(inputVal));
            console.log(`Number input: field=${field.key}, input="${inputVal}", parsed=`, numVal, "isNaN=", numVal !== null && isNaN(numVal));
            handleChange(numVal);
          }}
          onBlur={(e) => {
            console.log(`Number input onBlur: field=${field.key}, value=`, e.target.value);
          }}
          disabled={skipped}
        />
        {field.skippable && (
          <SkipRow skipped={skipped} raw={raw} onSkip={handleSkip} onUnskip={() => handleChange(null)} />
        )}
        {error && <p className="validation-msg">{error}</p>}
      </div>
    );
  }

  if (field.ui === "textarea") {
    return (
      <div className="field">
        <label htmlFor={id}>{field.label}</label>
        <textarea
          id={id}
          value={(val as string) || ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={skipped}
        />
        {field.skippable && (
          <SkipRow skipped={skipped} raw={raw} onSkip={handleSkip} onUnskip={() => handleChange("")} />
        )}
        {error && <p className="validation-msg">{error}</p>}
      </div>
    );
  }

  if (field.ui === "radio" || field.ui === "radio_yes_no") {
    const opts = field.ui === "radio_yes_no" ? ["yes", "no"] : enumOpts;
    const boolVal = field.ui === "radio_yes_no" ? (val === true ? "yes" : "no") : val;
    return (
      <div className="field">
        <label>{field.label}</label>
        <div className="radio-group">
          {opts.map((o) => (
            <label key={o} className="radio-opt">
              <input
                type="radio"
                name={id}
                checked={boolVal === o}
                onChange={() => handleChange(field.ui === "radio_yes_no" ? o === "yes" : o)}
                disabled={skipped}
              />
              <span>{o.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
        {field.skippable && (
          <SkipRow skipped={skipped} raw={raw} onSkip={handleSkip} onUnskip={() => handleChange(field.type === "boolean" ? false : null)} />
        )}
        {error && <p className="validation-msg">{error}</p>}
      </div>
    );
  }

  if (field.ui === "checkboxes") {
    const arr = (Array.isArray(val) ? val : []) as string[];
    const toggle = (o: string) => {
      const next = arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o];
      handleChange(next);
    };
    return (
      <div className="field">
        <label>{field.label}</label>
        <div className="checkbox-group">
          {enumOpts.map((o) => (
            <label key={o} className="checkbox-opt">
              <input type="checkbox" checked={arr.includes(o)} onChange={() => toggle(o)} disabled={skipped} />
              <span>{o.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
        {field.skippable && (
          <SkipRow skipped={skipped} raw={raw} onSkip={handleSkip} onUnskip={() => handleChange([])} />
        )}
        {error && <p className="validation-msg">{error}</p>}
      </div>
    );
  }

  if (field.ui === "select") {
    return (
      <div className="field">
        <label htmlFor={id}>{field.label}</label>
        <select
          id={id}
          value={(val as string) ?? ""}
          onChange={(e) => handleChange(e.target.value || null)}
          disabled={skipped}
        >
          <option value="">—</option>
          {enumOpts.map((o) => (
            <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
          ))}
        </select>
        {field.skippable && (
          <SkipRow skipped={skipped} raw={raw} onSkip={handleSkip} onUnskip={() => handleChange(null)} />
        )}
        {error && <p className="validation-msg">{error}</p>}
      </div>
    );
  }

  if (field.ui === "checkbox") {
    return (
      <div className="field">
        <label className="checkbox-opt">
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) => handleChange(e.target.checked)}
            disabled={skipped}
          />
          <span>{field.label}</span>
        </label>
        {error && <p className="validation-msg">{error}</p>}
      </div>
    );
  }

  if (field.ui === "tags") {
    return (
      <TagsField
        field={field}
        val={val}
        skipped={skipped}
        raw={raw}
        handleChange={handleChange}
        handleSkip={handleSkip}
        error={error}
      />
    );
  }

  if (field.ui === "repeatable_card" && field.item_schema) {
    let arr: Record<string, unknown>[] = [];
    if (Array.isArray(val)) {
      // Ensure all items are objects, not strings
      arr = val.map((item) => 
        typeof item === "object" && item !== null 
          ? (item as Record<string, unknown>)
          : {}
      );
    }
    return (
      <div className="field">
        <label>{field.label}</label>
        <RepeatableCards
          itemSchema={field.item_schema}
          items={arr}
          onChange={(next) => handleChange(next)}
          skipped={skipped}
        />
        {error && <p className="validation-msg">{error}</p>}
      </div>
    );
  }

  return (
    <div className="field">
      <label>{field.label}</label>
      <p className="validation-msg">Unsupported UI: {field.ui}</p>
    </div>
  );
}

function SkipRow({
  skipped,
  raw,
  onSkip,
  onUnskip,
}: {
  skipped: boolean;
  raw: Answer | null;
  onSkip: (reason: string, note?: string) => void;
  onUnskip: () => void;
}) {
  const [reason, setReason] = useState((raw?.skip_reason as string) ?? "");
  const [note, setNote] = useState((raw?.skip_note as string) ?? "");

  if (skipped) {
    return (
      <div className="skip-row">
        <span>Skipped: {raw?.skip_reason ?? ""}</span>
        <button type="button" onClick={onUnskip} className="btn-secondary">Unskip</button>
      </div>
    );
  }
  return (
    <div className="skip-row">
      <select value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="">Skip reason</option>
        {SKIP_REASONS.map((r) => (
          <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
        ))}
      </select>
      <input
        type="text"
        className="note"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        type="button"
        className="btn-secondary"
        onClick={() => reason && onSkip(reason, note || undefined)}
        disabled={!reason}
      >
        Skip
      </button>
    </div>
  );
}

function TagsField({
  field,
  val,
  skipped,
  raw,
  handleChange,
  handleSkip,
  error,
}: {
  field: FieldDef;
  val: string | number | boolean | string[];
  skipped: boolean;
  raw: Answer | null;
  handleChange: (v: unknown) => void;
  handleSkip: (reason: string, note?: string) => void;
  error?: string;
}) {
  const [input, setInput] = useState("");
  const arr = (Array.isArray(val) ? val : []) as string[];
  const add = () => {
    const t = input.trim();
    if (t && !arr.includes(t)) handleChange([...arr, t]);
    setInput("");
  };
  return (
    <div className="field">
      <label>{field.label}</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Add tag"
          disabled={skipped}
        />
        <button type="button" onClick={add} className="btn-secondary">Add</button>
      </div>
      {arr.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {arr.map((t) => (
            <span key={t} style={{ background: "#e0e0e0", padding: "4px 8px", borderRadius: 4 }}>
              {t} <button type="button" onClick={() => handleChange(arr.filter((x) => x !== t))} aria-label="Remove">×</button>
            </span>
          ))}
        </div>
      )}
      {field.skippable && (
        <SkipRow skipped={skipped} raw={raw} onSkip={handleSkip} onUnskip={() => handleChange([])} />
      )}
      {error && <p className="validation-msg">{error}</p>}
    </div>
  );
}

type ItemSchema = Record<string, { type: string; enum?: string; enum_values?: string[]; required?: boolean; min?: number; max?: number }>;

function RepeatableCards({
  itemSchema,
  items,
  onChange,
  skipped,
}: {
  itemSchema: ItemSchema;
  items: Record<string, unknown>[];
  onChange: (next: Record<string, unknown>[]) => void;
  skipped: boolean;
}) {
  const add = () => onChange([...items, {}]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i: number, k: string, v: unknown) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it));
    onChange(next);
  };
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="repeatable-card" style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          {Object.entries(itemSchema).map(([k, sch]) => {
            const v = item[k];
            const label = k.replace(/_/g, " ");
            if (sch.type === "string") {
              return (
                <div key={k} className="field" style={{ marginBottom: 8 }}>
                  <label>{label}</label>
                  <input
                    type="text"
                    value={(v as string) ?? ""}
                    onChange={(e) => update(i, k, e.target.value)}
                    disabled={skipped}
                  />
                </div>
              );
            }
            if (sch.type === "integer" || sch.type === "number") {
              return (
                <div key={k} className="field" style={{ marginBottom: 8 }}>
                  <label>{label}</label>
                  <input
                    type="number"
                    min={sch.min}
                    max={sch.max}
                    value={v === undefined || v === null ? "" : (v as number)}
                    onChange={(e) => update(i, k, e.target.value === "" ? undefined : Number(e.target.value))}
                    disabled={skipped}
                  />
                </div>
              );
            }
            if (sch.type === "enum") {
              const opts = sch.enum ? getEnum(sch.enum) : sch.enum_values ?? [];
              return (
                <div key={k} className="field" style={{ marginBottom: 8 }}>
                  <label>{label}</label>
                  <select
                    value={(v as string) ?? ""}
                    onChange={(e) => update(i, k, e.target.value || undefined)}
                    disabled={skipped}
                  >
                    <option value="">—</option>
                    {opts.map((o) => (
                      <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
              );
            }
            return null;
          })}
          <button type="button" onClick={() => remove(i)} className="btn-secondary" style={{ marginTop: 8 }}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="btn-secondary" disabled={skipped}>
        Add
      </button>
    </div>
  );
}
