import { useState, useRef, useCallback } from "react";
import type { FieldDef } from "../lib/fieldDictionary";
import { compressImageToDataUrl } from "../lib/compressImageToDataUrl";
import { getEnum, getSkipReasons } from "../lib/fieldDictionary";
import type { Answer, AnswerValue } from "../hooks/useInspection";
import { AddressAutocomplete, type StructuredAddress } from "./AddressAutocomplete";

type Props = {
  field: FieldDef;
  value: unknown;
  onChange: (key: string, payload: Answer | AnswerValue) => void;
  error?: string;
  isGate?: boolean;
  onGateChange?: (key: string, newVal: unknown, prevVal: unknown) => void;
  /** For address_autocomplete: composed structured value */
  addressValue?: StructuredAddress | null;
  /** For address_autocomplete: handler that sets job.address, job.address_place_id, etc. */
  onAddressChange?: (addr: StructuredAddress | null) => void;
};

const SKIP_REASONS = getSkipReasons();

function normalizeVal(v: unknown, type: string): string | number | boolean | string[] {
  if (v == null) {
    if (type === "boolean") return false;
    if (type === "array_enum") return [];
    if (type === "integer" || type === "number") return "";
    return "";
  }
  // Recursively extract value from nested Answer objects
  let currentValue: unknown = v;
  while (typeof currentValue === "object" && currentValue !== null && "value" in (currentValue as object)) {
    currentValue = (currentValue as Answer).value;
  }
  // If the final value is null/undefined, normalize it based on type
  if (currentValue == null) {
    if (type === "boolean") return false;
    if (type === "array_enum") return [];
    if (type === "integer" || type === "number") return "";
    return "";
  }
  return currentValue as string | number | boolean | string[];
}

export function FieldRenderer({ field, value, onChange, error, isGate, onGateChange, addressValue, onAddressChange }: Props) {
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

  if (field.ui === "address_autocomplete") {
    return (
      <div className="field">
        <AddressAutocomplete
          key={addressValue?.property_address || "addr-empty"}
          value={addressValue ?? null}
          onChange={(addr) => {
            if (onAddressChange) onAddressChange(addr);
          }}
          required={field.required ?? true}
          disabled={skipped}
          error={error}
        />
      </div>
    );
  }

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

  if (field.ui === "gpo_room_table" && field.item_schema) {
    const rows = Array.isArray(val) ? (val as unknown as Record<string, unknown>[]) : [];
    const helperText = field.helper_text;
    return (
      <div className="field">
        <label>{field.label}</label>
        {helperText && <p className="field-helper" style={{ fontSize: "0.9em", color: "var(--text-muted)", marginBottom: "0.5em" }}>{helperText}</p>}
        <GpoRoomTable
          rows={rows}
          onChange={(next) => handleChange(next)}
          disabled={skipped}
        />
        {error && <p className="validation-msg">{error}</p>}
      </div>
    );
  }

  if (field.ui === "lighting_room_table" && field.item_schema) {
    const rows = Array.isArray(val) ? (val as unknown as Record<string, unknown>[]) : [];
    const helperText = field.helper_text;
    return (
      <div className="field">
        <label>{field.label}</label>
        {helperText && <p className="field-helper" style={{ fontSize: "0.9em", color: "var(--text-muted)", marginBottom: "0.5em" }}>{helperText}</p>}
        <LightingRoomTable
          rows={rows}
          onChange={(next) => handleChange(next)}
          disabled={skipped}
        />
        {error && <p className="validation-msg">{error}</p>}
      </div>
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
    const helperText = field.helper_text;
    return (
      <div className="field">
        <label>{field.label}</label>
        {helperText && <p className="field-helper" style={{ fontSize: "0.9em", color: "var(--text-muted)", marginBottom: "0.5em" }}>{helperText}</p>}
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

type ItemSchema = Record<string, { type: string; enum?: string; enum_values?: string[]; required?: boolean; min?: number; max?: number; label?: string }>;

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
            const label = (sch as { label?: string }).label ?? k.replace(/_/g, " ");
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
            if (sch.type === "array_string") {
              const arr = (Array.isArray(v) ? v : []) as string[];
              return (
                <div key={k} className="field" style={{ marginBottom: 8 }}>
                  <label>{label}</label>
                  <TagsInputForCard
                    values={arr}
                    onChange={(next) => update(i, k, next)}
                    disabled={skipped}
                    placeholder="Add photo ID or tag"
                  />
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

function TagsInputForCard({
  values,
  onChange,
  disabled,
  placeholder = "Add tag",
}: {
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setInput("");
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          disabled={disabled}
          style={{ flex: 1, minWidth: 120 }}
        />
        <button type="button" onClick={add} className="btn-secondary" disabled={disabled}>
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {values.map((t) => (
            <span key={t} style={{ background: "#e0e0e0", padding: "4px 8px", borderRadius: 4, fontSize: 13 }}>
              {t}{" "}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== t))} aria-label="Remove" disabled={disabled}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const ROOM_ACCESS_LABELS: Record<string, string> = { accessible: "Accessible", not_accessible: "Not accessible" };
const NOT_ACCESSIBLE_REASON_LABELS: Record<string, string> = {
  no_key: "No key",
  privacy: "Privacy",
  religious: "Religious",
  other: "Other",
};

const ROOMS_WITH_SINK = ["kitchen", "laundry", "bathroom_1", "bathroom_2"];

/** GPO by room: form (room, Access, [GPO count, tested, pass, Issue, Note, Photo when accessible]; for kitchen/laundry/bathroom: distance to sink + photo) → Add to table */
function GpoRoomTable({
  rows,
  onChange,
  disabled,
}: {
  rows: Record<string, unknown>[];
  onChange: (next: Record<string, unknown>[]) => void;
  disabled?: boolean;
}) {
  const [roomType, setRoomType] = useState("");
  const [roomNameCustom, setRoomNameCustom] = useState("");
  const [roomAccess, setRoomAccess] = useState("accessible");
  const [notAccessibleReason, setNotAccessibleReason] = useState("");
  const [notAccessibleReasonOther, setNotAccessibleReasonOther] = useState("");
  const [gpoCount, setGpoCount] = useState<number | "">("");
  const [testedCount, setTestedCount] = useState<number | "">("");
  const [passCount, setPassCount] = useState<number | "">("");
  const [issue, setIssue] = useState("none");
  const [issueOther, setIssueOther] = useState("");
  const [note, setNote] = useState("");
  const [distanceToSinkMm, setDistanceToSinkMm] = useState<number | "">("");
  const [sinkPositionNotes, setSinkPositionNotes] = useState("");
  const [photoInput, setPhotoInput] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);

  const roomTypeOpts = getEnum("room_type");
  const issueOpts = getEnum("gpo_room_issue");
  const notAccessibleReasonOpts = getEnum("room_not_accessible_reason");
  const isAccessible = roomAccess !== "not_accessible";
  const needNotAccessibleReason = !isAccessible && !notAccessibleReason;
  const needNotAccessibleReasonOther = !isAccessible && notAccessibleReason === "other" && !notAccessibleReasonOther.trim();

  const g = typeof gpoCount === "number" ? gpoCount : 0;
  const t = typeof testedCount === "number" ? testedCount : 0;
  const p = typeof passCount === "number" ? passCount : 0;

  const hasIssue = issue && issue !== "none";
  const isIssueOther = issue === "other";
  const needIssueOther = isIssueOther && !issueOther.trim();
  const isSinkRoom = ROOMS_WITH_SINK.includes(roomType);
  const needSinkPosition = isAccessible && isSinkRoom && (distanceToSinkMm === "" && !sinkPositionNotes.trim());
  const needSinkPhoto = isAccessible && isSinkRoom && photoIds.length === 0;
  const needPhotos = (hasIssue && photoIds.length === 0) || needSinkPhoto;
  const testedExceedsTotal = t > g;
  const needReason = t < g && !note.trim();
  const passLessThanTested = p < t;
  const needIssueWhenFail = passLessThanTested && (!issue || issue === "none");

  const addRow = () => {
    if (!roomType) return;
    if (roomType === "other" && !roomNameCustom.trim()) return;
    if (!isAccessible) {
      if (needNotAccessibleReason) return;
      if (needNotAccessibleReasonOther) return;
    } else {
      if (testedExceedsTotal) return;
      if (needReason) return;
      if (needIssueWhenFail) return;
      if (needIssueOther) return;
      if (hasIssue && photoIds.length === 0) return;
      if (needSinkPosition || needSinkPhoto) return;
    }

    const sinkMm = typeof distanceToSinkMm === "number" ? distanceToSinkMm : undefined;
    const sinkNotes = sinkPositionNotes.trim() || undefined;

    onChange([
      ...rows,
      {
        room_type: roomType,
        room_name_custom: roomType === "other" ? roomNameCustom.trim() : "",
        room_access: roomAccess || "accessible",
        room_not_accessible_reason: !isAccessible ? (notAccessibleReason || "") : "",
        room_not_accessible_reason_other: !isAccessible && notAccessibleReason === "other" ? notAccessibleReasonOther.trim() : "",
        gpo_count: isAccessible ? g : 0,
        tested_count: isAccessible ? t : 0,
        pass_count: isAccessible ? p : 0,
        issue: isAccessible ? (issue || "none") : "none",
        issue_other: isAccessible && isIssueOther ? issueOther.trim() : "",
        note: isAccessible ? note.trim() : "",
        distance_to_sink_mm: isAccessible && isSinkRoom ? sinkMm : undefined,
        sink_position_notes: isAccessible && isSinkRoom ? sinkNotes : undefined,
        photo_ids: isAccessible && (hasIssue || isSinkRoom) ? [...photoIds] : [],
      },
    ]);
    setRoomType("");
    setRoomNameCustom("");
    setRoomAccess("accessible");
    setNotAccessibleReason("");
    setNotAccessibleReasonOther("");
    setGpoCount("");
    setTestedCount("");
    setPassCount("");
    setIssue("none");
    setIssueOther("");
    setNote("");
    setDistanceToSinkMm("");
    setSinkPositionNotes("");
    setPhotoInput("");
    setPhotoIds([]);
  };

  const addPhoto = () => {
    const t = photoInput.trim();
    if (t && !photoIds.includes(t)) setPhotoIds([...photoIds, t]);
    setPhotoInput("");
  };

  const photoFileRef = useRef<HTMLInputElement>(null);
  const handlePhotoFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || photoIds.length >= 2) return;
      try {
        const dataUrl = await compressImageToDataUrl(file);
        setPhotoIds((prev) => [...prev, dataUrl]);
      } catch (err) {
        console.error("Photo compress failed:", err);
      }
    },
    [photoIds]
  );

  const removeRow = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i));
  };

  const displayRoomName = (row: Record<string, unknown>) => {
    const rt = row.room_type as string;
    const custom = row.room_name_custom as string;
    if (rt === "other" && custom) return custom;
    return rt ? rt.replace(/_/g, " ") : "";
  };

  const displayRoomAccess = (row: Record<string, unknown>) => {
    const a = row.room_access as string;
    return a === "not_accessible" ? ROOM_ACCESS_LABELS.not_accessible : ROOM_ACCESS_LABELS.accessible;
  };

  const displayNotAccessibleReason = (row: Record<string, unknown>) => {
    if (row.room_access !== "not_accessible") return "—";
    const reason = row.room_not_accessible_reason as string;
    if (reason === "other") {
      const custom = (row.room_not_accessible_reason_other as string)?.trim();
      return custom || "Other";
    }
    return reason ? (NOT_ACCESSIBLE_REASON_LABELS[reason] ?? reason.replace(/_/g, " ")) : "—";
  };

  const isRowAccessible = (row: Record<string, unknown>) => row.room_access !== "not_accessible";

  const displayIssue = (row: Record<string, unknown>) => {
    if (!isRowAccessible(row)) return "—";
    const v = row.issue as string;
    if (!v || v === "none") return "—";
    if (v === "other") {
      const custom = (row.issue_other as string)?.trim();
      return custom || "other";
    }
    return v.replace(/_/g, " ");
  };

  const displayPhotos = (row: Record<string, unknown>) => {
    if (!isRowAccessible(row)) return "—";
    const ids = row.photo_ids as string[] | undefined;
    if (!Array.isArray(ids) || ids.length === 0) return "—";
    return ids.length === 1 ? ids[0] : `${ids.length} photos`;
  };

  const displaySinkPosition = (row: Record<string, unknown>) => {
    if (!isRowAccessible(row)) return "—";
    const rt = row.room_type as string;
    if (!ROOMS_WITH_SINK.includes(rt)) return "—";
    const mm = row.distance_to_sink_mm;
    const notes = (row.sink_position_notes as string)?.trim();
    if (mm != null && mm !== "") return String(mm) + " mm";
    if (notes) return notes;
    return "—";
  };

  return (
    <div>
      <div className="repeatable-card" style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
          <div className="field">
            <label>Room</label>
            <select value={roomType} onChange={(e) => setRoomType(e.target.value)} disabled={disabled}>
              <option value="">—</option>
              {roomTypeOpts.map((o) => (
                <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          {roomType === "other" && (
            <div className="field">
              <label>Room name (custom)</label>
              <input
                type="text"
                value={roomNameCustom}
                onChange={(e) => setRoomNameCustom(e.target.value)}
                placeholder="e.g. Study, Attic"
                disabled={disabled}
              />
            </div>
          )}
          <div className="field">
            <label>Access</label>
            <select value={roomAccess} onChange={(e) => setRoomAccess(e.target.value)} disabled={disabled}>
              <option value="accessible">{ROOM_ACCESS_LABELS.accessible}</option>
              <option value="not_accessible">{ROOM_ACCESS_LABELS.not_accessible}</option>
            </select>
          </div>
          {!isAccessible && (
            <>
              <div className="field">
                <label>Reason (not accessible)</label>
                <select value={notAccessibleReason} onChange={(e) => setNotAccessibleReason(e.target.value)} disabled={disabled}>
                  <option value="">—</option>
                  {notAccessibleReasonOpts.map((o) => (
                    <option key={o} value={o}>{NOT_ACCESSIBLE_REASON_LABELS[o] ?? o.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              {notAccessibleReason === "other" && (
                <div className="field" style={{ minWidth: 140 }}>
                  <label>Reason (other)</label>
                  <input
                    type="text"
                    value={notAccessibleReasonOther}
                    onChange={(e) => setNotAccessibleReasonOther(e.target.value)}
                    placeholder="Please specify"
                    disabled={disabled}
                  />
                </div>
              )}
            </>
          )}
          {isAccessible && (
            <>
          <div className="field">
            <label>GPO count</label>
            <input
              type="number"
              min={0}
              max={999}
              value={gpoCount}
              onChange={(e) => setGpoCount(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>Tested count (≤ total)</label>
            <input
              type="number"
              min={0}
              max={typeof g === "number" ? g : 999}
              value={testedCount}
              onChange={(e) => setTestedCount(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>Pass count (≤ tested)</label>
            <input
              type="number"
              min={0}
              max={typeof t === "number" ? t : 999}
              value={passCount}
              onChange={(e) => setPassCount(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>Issue</label>
            <select value={issue} onChange={(e) => setIssue(e.target.value)} disabled={disabled}>
              {issueOpts.map((o) => (
                <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          {issue === "other" && (
            <div className="field" style={{ minWidth: 160 }}>
              <label>Describe issue</label>
              <input
                type="text"
                value={issueOther}
                onChange={(e) => setIssueOther(e.target.value)}
                placeholder="e.g. Loose faceplate, no earth"
                disabled={disabled}
              />
            </div>
          )}
          <div className="field" style={{ minWidth: 120 }}>
            <label>Note{t < g ? " (reason required when tested < total)" : ""}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t < g ? "Reason for not testing all" : "Optional"}
              disabled={disabled}
            />
          </div>
          {isSinkRoom && (
            <>
              <div className="field" style={{ minWidth: 100 }}>
                <label>Distance to sink/tap (mm)</label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  value={distanceToSinkMm}
                  onChange={(e) => setDistanceToSinkMm(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 300"
                  disabled={disabled}
                />
              </div>
              <div className="field" style={{ minWidth: 160 }}>
                <label>Position relative to sink (if not measured)</label>
                <input
                  type="text"
                  value={sinkPositionNotes}
                  onChange={(e) => setSinkPositionNotes(e.target.value)}
                  placeholder="e.g. Left of tap, above basin"
                  disabled={disabled}
                />
              </div>
            </>
          )}
          {(hasIssue || isSinkRoom) && (
            <div className="field" style={{ minWidth: 180 }}>
              <label>Photo evidence {isSinkRoom ? "(required for sink zone)" : "(required)"}</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  ref={photoFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={handlePhotoFile}
                />
                <button type="button" onClick={() => photoFileRef.current?.click()} className="btn-secondary" disabled={disabled || photoIds.length >= 2}>
                  📷 Take / upload
                </button>
                <input
                  type="text"
                  value={photoInput}
                  onChange={(e) => setPhotoInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhoto())}
                  placeholder="Or enter Photo ID"
                  disabled={disabled}
                />
                <button type="button" onClick={addPhoto} className="btn-secondary" disabled={disabled}>Add</button>
              </div>
              {photoIds.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {photoIds.map((id, idx) => (
                    <span key={id} style={{ background: "#e0e0e0", padding: "4px 8px", borderRadius: 4 }}>
                      {id.startsWith("data:image") ? `Photo ${idx + 1}` : id} <button type="button" onClick={() => setPhotoIds(photoIds.filter((x) => x !== id))} aria-label="Remove">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
            </>
          )}
          <button
            type="button"
            onClick={addRow}
            className="btn-secondary"
            disabled={Boolean(
              disabled ||
              !roomType ||
              (roomType === "other" && !roomNameCustom.trim()) ||
              (!isAccessible && (needNotAccessibleReason || needNotAccessibleReasonOther)) ||
              (isAccessible && (testedExceedsTotal || needReason || needIssueWhenFail || needIssueOther || needPhotos || needSinkPosition || needSinkPhoto))
            )}
          >
            Add to table
          </button>
        </div>
        {(needNotAccessibleReason || needNotAccessibleReasonOther || testedExceedsTotal || needReason || needIssueWhenFail || needIssueOther || needPhotos || needSinkPosition || needSinkPhoto) && (
          <p className="validation-msg" style={{ marginTop: 8, marginBottom: 0 }}>
            {needNotAccessibleReason && "Please select a reason when room is not accessible."}
            {needNotAccessibleReasonOther && !needNotAccessibleReason && "Please specify the reason when 'Other' is selected."}
            {testedExceedsTotal && !needNotAccessibleReason && !needNotAccessibleReasonOther && "Tested count cannot exceed GPO count (total)."}
            {needReason && !needNotAccessibleReason && !needNotAccessibleReasonOther && !testedExceedsTotal && "Reason required when tested count is less than total (use Note)."}
            {needIssueWhenFail && !needNotAccessibleReason && !needNotAccessibleReasonOther && !testedExceedsTotal && !needReason && "When pass &lt; tested, Issue cannot be None."}
            {needIssueOther && !needNotAccessibleReason && !needNotAccessibleReasonOther && !testedExceedsTotal && !needReason && !needIssueWhenFail && "When Issue is Other, describe the issue."}
            {needSinkPosition && "Kitchen/Laundry/Bathroom: fill distance to sink (mm) or position description."}
            {needSinkPhoto && !needSinkPosition && "Kitchen/Laundry/Bathroom: at least one photo of GPO/sink zone required."}
            {needPhotos && !needSinkPosition && !needSinkPhoto && !needNotAccessibleReason && !needNotAccessibleReasonOther && !testedExceedsTotal && !needReason && !needIssueWhenFail && !needIssueOther && "When Issue is not None, at least one photo evidence is required."}
          </p>
        )}
      </div>
      {rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd" }}>
              <th style={{ textAlign: "left", padding: 6 }}>Room</th>
              <th style={{ textAlign: "left", padding: 6 }}>Access</th>
              <th style={{ textAlign: "left", padding: 6 }}>Reason (if not accessible)</th>
              <th style={{ textAlign: "right", padding: 6 }}>GPO count</th>
              <th style={{ textAlign: "right", padding: 6 }}>Tested</th>
              <th style={{ textAlign: "right", padding: 6 }}>Pass</th>
              <th style={{ textAlign: "left", padding: 6 }}>Issue</th>
              <th style={{ textAlign: "left", padding: 6 }}>Note</th>
              <th style={{ textAlign: "left", padding: 6 }}>To sink (mm / notes)</th>
              <th style={{ textAlign: "left", padding: 6 }}>Photos</th>
              <th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 6 }}>{displayRoomName(row)}</td>
                <td style={{ padding: 6 }}>{displayRoomAccess(row)}</td>
                <td style={{ padding: 6 }}>{displayNotAccessibleReason(row)}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{isRowAccessible(row) ? (Number(row.gpo_count) ?? 0) : "—"}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{isRowAccessible(row) ? (Number(row.tested_count) ?? 0) : "—"}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{isRowAccessible(row) ? (Number(row.pass_count) ?? 0) : "—"}</td>
                <td style={{ padding: 6 }}>{displayIssue(row)}</td>
                <td style={{ padding: 6 }}>{isRowAccessible(row) ? ((row.note as string) || "—") : "—"}</td>
                <td style={{ padding: 6 }}>{displaySinkPosition(row)}</td>
                <td style={{ padding: 6 }}>{displayPhotos(row)}</td>
                <td style={{ padding: 6 }}>
                  <button type="button" onClick={() => removeRow(i)} className="btn-secondary" disabled={disabled} aria-label="Remove row">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const LIGHTING_SWITCH_ISSUE_LABELS: Record<string, string> = {
  none: "None",
  fitting_overheat: "Fitting overheat marks",
  fitting_not_working: "Fitting not working",
  switch_loose: "Switch loose",
  switch_arcing: "Switch arcing",
  switch_unresponsive: "Switch unresponsive",
  dimmer_not_working: "Dimmer not working",
  switch_plate_cracked: "Switch plate cracked",
  switch_body_moves: "Switch body moves",
  unusual_audible_sound: "Audible sound (buzz/crackle)",
  light_fitting_moves: "Light fitting moves",
  lamp_halogen: "Halogen lamp (overheating risk)",
  lamp_incandescent: "Incandescent lamp (overheating risk)",
  bare_wire_visible: "Bare wire visible",
  other: "Other",
};

/** Lighting by room: form (room, Access, [reason] or [issues + photos + note]) → Add to table → table rows */
function LightingRoomTable({
  rows,
  onChange,
  disabled,
}: {
  rows: Record<string, unknown>[];
  onChange: (next: Record<string, unknown>[]) => void;
  disabled?: boolean;
}) {
  const [roomType, setRoomType] = useState("");
  const [roomNameCustom, setRoomNameCustom] = useState("");
  const [roomAccess, setRoomAccess] = useState("accessible");
  const [notAccessibleReason, setNotAccessibleReason] = useState("");
  const [notAccessibleReasonOther, setNotAccessibleReasonOther] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [issueOther, setIssueOther] = useState("");
  const [note, setNote] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [duplicateRoomError, setDuplicateRoomError] = useState("");

  const roomTypeOpts = getEnum("room_type");
  const lightingSwitchIssueOpts = getEnum("lighting_switch_issue");
  const notAccessibleReasonOpts = getEnum("room_not_accessible_reason");
  const isAccessible = roomAccess !== "not_accessible";
  const needNotAccessibleReason = !isAccessible && !notAccessibleReason;
  const needNotAccessibleReasonOther = !isAccessible && notAccessibleReason === "other" && !notAccessibleReasonOther.trim();
  const hasIssues = issues.length > 0 && !(issues.length === 1 && issues[0] === "none");
  const hasIssueOther = issues.includes("other");
  const needIssueOther = hasIssueOther && !issueOther.trim();
  const needPhotos = isAccessible && hasIssues && photoIds.length === 0;

  const toggleIssue = (issue: string) => {
    if (issue === "none") {
      setIssues(issues.includes("none") ? [] : ["none"]);
    } else {
      const newIssues = issues.filter((i) => i !== "none");
      if (newIssues.includes(issue)) {
        setIssues(newIssues.filter((i) => i !== issue));
      } else {
        setIssues([...newIssues, issue]);
      }
    }
  };

  const photoFileRef = useRef<HTMLInputElement>(null);
  const handlePhotoFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || photoIds.length >= 2) return;
      try {
        const dataUrl = await compressImageToDataUrl(file);
        setPhotoIds((prev) => [...prev, dataUrl]);
      } catch (err) {
        console.error("Photo compress failed:", err);
      }
    },
    [photoIds]
  );

  const addRow = () => {
    setDuplicateRoomError("");
    if (!roomType) return;
    if (roomType === "other" && !roomNameCustom.trim()) return;
    if (!isAccessible) {
      if (needNotAccessibleReason) return;
      if (needNotAccessibleReasonOther) return;
    } else {
      if (needIssueOther) return;
      if (needPhotos) return;
    }
    const isDuplicate = rows.some(
      (r) =>
        (r.room_type as string) === roomType &&
        (roomType !== "other" || (r.room_name_custom as string)?.trim() === roomNameCustom.trim())
    );
    if (isDuplicate) {
      setDuplicateRoomError("This room already added. Do not add duplicates.");
      return;
    }

    onChange([
      ...rows,
      {
        room_type: roomType,
        room_name_custom: roomType === "other" ? roomNameCustom.trim() : "",
        room_access: roomAccess || "accessible",
        room_not_accessible_reason: !isAccessible ? (notAccessibleReason || "") : "",
        room_not_accessible_reason_other: !isAccessible && notAccessibleReason === "other" ? notAccessibleReasonOther.trim() : "",
        issues: isAccessible ? [...issues] : [],
        issue_other: isAccessible && hasIssueOther ? issueOther.trim() : "",
        photo_ids: isAccessible && hasIssues ? [...photoIds] : [],
        note: isAccessible ? note.trim() : "",
      },
    ]);
    setRoomType("");
    setRoomNameCustom("");
    setRoomAccess("accessible");
    setNotAccessibleReason("");
    setNotAccessibleReasonOther("");
    setIssues([]);
    setIssueOther("");
    setNote("");
    setPhotoIds([]);
  };

  const removeRow = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i));
  };

  const displayRoomName = (row: Record<string, unknown>) => {
    const rt = row.room_type as string;
    const custom = row.room_name_custom as string;
    if (rt === "other" && custom) return custom;
    return rt ? rt.replace(/_/g, " ") : "";
  };

  const displayRoomAccess = (row: Record<string, unknown>) => {
    const a = row.room_access as string;
    return a === "not_accessible" ? ROOM_ACCESS_LABELS.not_accessible : ROOM_ACCESS_LABELS.accessible;
  };

  const displayNotAccessibleReason = (row: Record<string, unknown>) => {
    if (row.room_access !== "not_accessible") return "—";
    const reason = row.room_not_accessible_reason as string;
    if (reason === "other") {
      const custom = (row.room_not_accessible_reason_other as string)?.trim();
      return custom || "Other";
    }
    return reason ? (NOT_ACCESSIBLE_REASON_LABELS[reason] ?? reason.replace(/_/g, " ")) : "—";
  };

  const displayIssues = (row: Record<string, unknown>) => {
    if (row.room_access !== "not_accessible") {
      const issuesArr = row.issues as string[] | undefined;
      if (!Array.isArray(issuesArr) || issuesArr.length === 0) return "—";
      const labels = issuesArr.map((i) => {
        if (i === "other") {
          const custom = (row.issue_other as string)?.trim();
          return custom || "Other";
        }
        return LIGHTING_SWITCH_ISSUE_LABELS[i] ?? i.replace(/_/g, " ");
      });
      return labels.join(", ");
    }
    return "—";
  };

  const displayPhotos = (row: Record<string, unknown>) => {
    if (row.room_access !== "not_accessible") {
      const ids = row.photo_ids as string[] | undefined;
      if (!Array.isArray(ids) || ids.length === 0) return "—";
      return ids.length === 1 ? "1 photo" : `${ids.length} photos`;
    }
    return "—";
  };

  const isRowAccessible = (row: Record<string, unknown>) => row.room_access !== "not_accessible";

  return (
    <div className="lighting-room-form">
      <div className="lighting-room-form__card">
        <div className="lighting-room-form__row">
          <div className="field">
            <label>Room</label>
            <select value={roomType} onChange={(e) => { setRoomType(e.target.value); setDuplicateRoomError(""); }} disabled={disabled}>
              <option value="">—</option>
              {roomTypeOpts.map((o) => (
                <option key={o} value={o}>{o.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          {roomType === "other" && (
            <div className="field">
              <label>Room name (custom)</label>
              <input
                type="text"
                value={roomNameCustom}
                onChange={(e) => setRoomNameCustom(e.target.value)}
                placeholder="e.g. Study, Attic"
                disabled={disabled}
              />
            </div>
          )}
          <div className="field">
            <label>Access</label>
            <select value={roomAccess} onChange={(e) => setRoomAccess(e.target.value)} disabled={disabled}>
              <option value="accessible">{ROOM_ACCESS_LABELS.accessible}</option>
              <option value="not_accessible">{ROOM_ACCESS_LABELS.not_accessible}</option>
            </select>
          </div>
        </div>
        {!isAccessible && (
          <div className="lighting-room-form__row">
            <div className="field">
              <label>Reason (not accessible)</label>
              <select value={notAccessibleReason} onChange={(e) => setNotAccessibleReason(e.target.value)} disabled={disabled}>
                <option value="">—</option>
                {notAccessibleReasonOpts.map((o) => (
                  <option key={o} value={o}>{NOT_ACCESSIBLE_REASON_LABELS[o] ?? o.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            {notAccessibleReason === "other" && (
              <div className="field">
                <label>Reason (other)</label>
                <input
                  type="text"
                  value={notAccessibleReasonOther}
                  onChange={(e) => setNotAccessibleReasonOther(e.target.value)}
                  placeholder="Please specify"
                  disabled={disabled}
                />
              </div>
            )}
          </div>
        )}
        {isAccessible && (
          <>
            <div className="lighting-room-form__row lighting-room-form__row--issues">
              <div className="field">
                <label>Issues (lighting / switch) — multi-select</label>
                <div className="lighting-room-form__checkboxes">
                  {lightingSwitchIssueOpts.map((opt) => (
                    <label key={opt} className="lighting-room-form__checkbox">
                      <input
                        type="checkbox"
                        checked={issues.includes(opt)}
                        onChange={() => toggleIssue(opt)}
                        disabled={disabled}
                      />
                      {LIGHTING_SWITCH_ISSUE_LABELS[opt] ?? opt.replace(/_/g, " ")}
                    </label>
                  ))}
                </div>
              </div>
              {hasIssueOther && (
                <div className="field">
                  <label>Describe (other)</label>
                  <input
                    type="text"
                    value={issueOther}
                    onChange={(e) => setIssueOther(e.target.value)}
                    placeholder="Please specify"
                    disabled={disabled}
                  />
                </div>
              )}
              {hasIssues && (
                <div className="field lighting-room-photos">
                  <label>Photo evidence (required)</label>
                  <div className="lighting-room-photos__row">
                    <input
                      ref={photoFileRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="lighting-room-photos__input"
                      onChange={handlePhotoFile}
                    />
                    <button type="button" onClick={() => photoFileRef.current?.click()} className="btn-secondary" disabled={disabled || photoIds.length >= 2}>
                      Take / upload photo
                    </button>
                  </div>
                  {photoIds.length > 0 && (
                    <div className="lighting-room-photos__preview">
                      {photoIds.map((id, idx) => (
                        <div key={idx} className="lighting-room-photos__thumb">
                          {id.startsWith("data:image") ? (
                            <img src={id} alt="" className="lighting-room-photos__img" />
                          ) : (
                            <span className="lighting-room-photos__fallback">{id}</span>
                          )}
                          <button type="button" onClick={() => setPhotoIds(photoIds.filter((_, i) => i !== idx))} className="lighting-room-photos__remove" aria-label="Remove photo">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="lighting-room-form__row">
              <div className="field">
                <label>Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional"
                  disabled={disabled}
                />
              </div>
            </div>
          </>
        )}
        <div className="lighting-room-form__actions">
          <button
            type="button"
            onClick={addRow}
            className="btn-primary"
            disabled={Boolean(
              disabled ||
              !roomType ||
              (roomType === "other" && !roomNameCustom.trim()) ||
              (!isAccessible && (needNotAccessibleReason || needNotAccessibleReasonOther)) ||
              (isAccessible && (needIssueOther || needPhotos))
            )}
          >
            Add to table
          </button>
        </div>
        {duplicateRoomError && <p className="validation-msg">{duplicateRoomError}</p>}
        {(needNotAccessibleReason || needNotAccessibleReasonOther || needIssueOther || needPhotos) && !duplicateRoomError && (
          <p className="validation-msg">
            {needNotAccessibleReason && "Please select a reason when room is not accessible."}
            {needNotAccessibleReasonOther && !needNotAccessibleReason && "Please specify the reason when \"Other\" is selected."}
            {needIssueOther && !needNotAccessibleReason && !needNotAccessibleReasonOther && "Please describe the issue when \"Other\" is selected."}
            {needPhotos && !needNotAccessibleReason && !needNotAccessibleReasonOther && !needIssueOther && "At least one photo is required when issues are present."}
          </p>
        )}
      </div>
      {rows.length > 0 && (
        <div className="lighting-room-table-wrap">
          <table className="lighting-room-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Access</th>
                <th>Reason (if not accessible)</th>
                <th>Issues</th>
                <th>Photos</th>
                <th>Note</th>
                <th className="lighting-room-table__action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td>{displayRoomName(row)}</td>
                  <td>{displayRoomAccess(row)}</td>
                  <td>{displayNotAccessibleReason(row)}</td>
                  <td>{displayIssues(row)}</td>
                  <td>{displayPhotos(row)}</td>
                  <td>{isRowAccessible(row) ? ((row.note as string) || "—") : "—"}</td>
                  <td className="lighting-room-table__action">
                    <button type="button" onClick={() => removeRow(i)} className="btn-secondary lighting-room-table__remove" disabled={disabled} aria-label="Remove row">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
