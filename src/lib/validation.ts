import type { InspectionState } from "../hooks/useInspection";
import { getSections } from "./fieldDictionary";

function getValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let v: unknown = obj;
  for (const p of parts) {
    if (v == null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

function evalSimple(expr: string, data: Record<string, unknown>): boolean {
  const match = expr.match(/^(.+?)==(.+)$/);
  if (!match) return false;
  const [, left, right] = match;
  const key = left.trim();
  const val = right.trim();
  const v = getValue(data, key);
  if (val === "true") return v === true;
  if (val === "false") return v === false;
  if (/^\d+$/.test(val)) return Number(v) === Number(val);
  return v === val;
}

function evalRequiredWhen(expr: string, data: Record<string, unknown>): boolean {
  if (expr.startsWith("any(")) {
    const inner = expr.slice(4, -1);
    const preds = inner.split(",").map((s) => s.trim());
    for (const p of preds) {
      if (p.includes("==")) {
        if (evalSimple(p, data)) return true;
      }
    }
    return false;
  }
  return evalSimple(expr, data);
}

function flattenAnswers(state: InspectionState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (o: unknown, prefix: string) => {
    if (o == null) return;
    if (Array.isArray(o)) {
      out[prefix] = o;
      if (o.length && typeof o[0] === "object" && o[0] !== null && !("value" in (o[0] as object))) {
        (o as Record<string, unknown>[]).forEach((item, i) => walk(item, `${prefix}[${i}]`));
      }
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

export function validateSection(
  sectionId: string,
  state: InspectionState
): { valid: boolean; errors: Record<string, string> } {
  const sections = getSections();
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return { valid: true, errors: {} };

  const flat = flattenAnswers(state);
  const errors: Record<string, string> = {};

  // Debug: log flattened values
  console.log("Flattened values for section", sectionId, ":", flat);

  for (const f of section.fields) {
    // Skip fields that are not visible due to required_when
    if (f.required_when) {
      const requiredWhenMet = evalRequiredWhen(f.required_when, flat);
      if (!requiredWhenMet && !f.required) continue;
    }

    const v = getValue(flat, f.key);
    const required = f.required === true;
    const requiredWhen = f.required_when;
    const isReq = required || (!!requiredWhen && evalRequiredWhen(requiredWhen, flat));

    // Debug: log field validation
    if (isReq) {
      console.log(`Field ${f.key}: value=`, v, "type=", typeof v, "isArray=", Array.isArray(v), "required=", isReq);
    }

    // Skip validation for fields that are not required and don't have required_when
    if (!isReq) continue;

    if (f.key.endsWith(".no_exceptions") || f.key.endsWith(".exceptions")) {
      const noEx = getValue(flat, f.key.replace(".exceptions", ".no_exceptions").replace(".no_exceptions", ".no_exceptions"));
      if (noEx === true) continue;
      if (f.key.endsWith(".exceptions") && noEx === false) {
        const arr = getValue(flat, f.key) as unknown[];
        if (!Array.isArray(arr) || arr.length === 0) {
          errors[f.key] = "Add at least one exception or tick «No exceptions».";
        }
      }
      continue;
    }

    if (f.type === "array_object") continue;

    const raw = getValue(state as Record<string, unknown>, f.key) as { status?: string; skip_reason?: string } | undefined;
    const skipped = typeof raw === "object" && raw !== null && raw.status === "skipped";
    if (skipped) {
      if (isReq && !raw?.skip_reason) errors[f.key] = "Skip reason required.";
      continue;
    }

    if (isReq) {
      // Check for empty values (but allow false for boolean and empty array for array_enum to be checked separately)
      if (v === undefined || v === null || (typeof v === "string" && v === "")) {
        console.log(`Field ${f.key} is empty: v=`, v);
        errors[f.key] = "Required.";
      } 
      // For boolean types, false is a valid value, only check if it's not a boolean
      else if (f.type === "boolean") {
        if (typeof v !== "boolean") {
          console.log(`Field ${f.key} (boolean) is invalid: v=`, v, "type=", typeof v);
          errors[f.key] = "Required.";
        }
        // boolean value (true or false) is valid, no error
      }
      // For array_enum types, empty array is invalid if required
      else if (f.type === "array_enum") {
        if (!Array.isArray(v) || v.length === 0) {
          console.log(`Field ${f.key} (array_enum) is empty: v=`, v, "isArray=", Array.isArray(v));
          errors[f.key] = "Required.";
        }
        // non-empty array is valid, no error
      }
      // For enum types (radio/select), check if value is in enum
      else if (f.type === "enum" && (v === null || v === "" || v === undefined)) {
        console.log(`Field ${f.key} (enum) is empty: v=`, v);
        errors[f.key] = "Required.";
      }
      // For string types
      else if (f.type === "string" && (v === null || v === "" || v === undefined)) {
        console.log(`Field ${f.key} (string) is empty: v=`, v);
        errors[f.key] = "Required.";
      }
      // For number types
      else if (f.type === "number" && (typeof v !== "number" || (f.min != null && v < f.min) || (f.max != null && v > f.max))) {
        errors[f.key] = f.min != null && f.max != null ? `Must be between ${f.min} and ${f.max}.` : "Invalid number.";
      }
      // For integer types
      else if (f.type === "integer" && (typeof v !== "number" || !Number.isInteger(v) || (f.min != null && v < f.min) || (f.max != null && v > f.max))) {
        errors[f.key] = "Invalid integer.";
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateAll(state: InspectionState): Record<string, Record<string, string>> {
  const sections = getSections();
  const out: Record<string, Record<string, string>> = {};
  for (const s of sections) {
    const { errors } = validateSection(s.id, state);
    if (Object.keys(errors).length) out[s.id] = errors;
  }
  return out;
}
