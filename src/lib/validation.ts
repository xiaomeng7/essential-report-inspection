import type { InspectionState } from "../hooks/useInspection";
import { getSections } from "./fieldDictionary";

function getValue(obj: unknown, path: string): unknown {
  if (obj == null || typeof obj !== "object") return undefined;
  const flat = obj as Record<string, unknown>;
  // First try flat key (e.g., "job.address" or "rcd_tests.summary.total_tested")
  if (path in flat) {
    const val = flat[path];
    console.log(`getValue: path="${path}", found in flat, value=`, val, "type=", typeof val);
    return val;
  }
  // Fallback to nested structure (e.g., obj.job.address)
  const parts = path.split(".");
  let v: unknown = obj;
  for (const p of parts) {
    if (v == null || typeof v !== "object") {
      console.log(`getValue: path="${path}", nested access failed at "${p}", v=`, v);
      return undefined;
    }
    v = (v as Record<string, unknown>)[p];
  }
  console.log(`getValue: path="${path}", nested access result=`, v);
  return v;
}

function evalSimple(expr: string, data: Record<string, unknown>): boolean {
  const match = expr.match(/^(.+?)==(.+)$/);
  if (!match) return false;
  const [, left, right] = match;
  const key = left.trim();
  const val = right.trim();
  const v = getValue(data, key);
  console.log(`evalSimple: expr="${expr}", key="${key}", val="${val}", v=`, v, "type=", typeof v);
  if (val === "true") return v === true;
  if (val === "false") return v === false;
  if (/^\d+$/.test(val)) return Number(v) === Number(val);
  return v === val;
}

function evalRequiredWhen(expr: string, data: Record<string, unknown>): boolean {
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
        const v = getValue(data, p);
        if (v === target) return true;
      }
      return false;
    }
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
          // This is an Answer object, extract the value
          out[path] = (v as { value: unknown }).value;
        } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          // This is a nested object (like summary), continue walking
          walk(v, path);
        } else {
          // Primitive value or array
          out[path] = v;
        }
      }
    }
  };
  walk(state, "");
  // Log all keys to see what was extracted
  const keys = Object.keys(out).filter(k => k.includes("rcd_tests") || k.includes("summary"));
  console.log("flattenAnswers - RCD/summary keys:", keys);
  keys.forEach(k => console.log(`  ${k}:`, out[k]));
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
      console.log(`Field ${f.key}: required_when="${f.required_when}", met=${requiredWhenMet}, required=${f.required}`);
      if (!requiredWhenMet && !f.required) {
        console.log(`Field ${f.key}: skipping (required_when not met and not required)`);
        continue;
      }
    }

    const v = getValue(flat, f.key);
    const required = f.required === true;
    const requiredWhen = f.required_when;
    const isReq = required || (!!requiredWhen && evalRequiredWhen(requiredWhen, flat));

    // Debug: log field validation
    console.log(`Field ${f.key}: value=`, v, "type=", typeof v, "isArray=", Array.isArray(v), "required=", required, "required_when=", requiredWhen, "isReq=", isReq);

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
      // Check for empty values first (but allow false for boolean and empty array for array_enum to be checked separately)
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
      // For integer types - check if it's a valid integer
      else if (f.type === "integer") {
        if (typeof v !== "number" || !Number.isInteger(v)) {
          console.log(`Field ${f.key} (integer) is invalid: v=`, v, "type=", typeof v);
          errors[f.key] = "Required.";
        } else if (f.min != null && v < f.min) {
          errors[f.key] = `Must be at least ${f.min}.`;
        } else if (f.max != null && v > f.max) {
          errors[f.key] = `Must be at most ${f.max}.`;
        }
      }
      // For number types
      else if (f.type === "number") {
        if (typeof v !== "number") {
          errors[f.key] = "Required.";
        } else if (f.min != null && v < f.min) {
          errors[f.key] = `Must be at least ${f.min}.`;
        } else if (f.max != null && v > f.max) {
          errors[f.key] = `Must be at most ${f.max}.`;
        }
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
