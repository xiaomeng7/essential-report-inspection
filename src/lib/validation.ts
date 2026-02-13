import type { InspectionState } from "../hooks/useInspection";
import { getSections, getFieldDictionary } from "./fieldDictionary";

type CrossFieldValidation = {
  id: string;
  description: string;
  condition: string;
  rule: string;
  error_message: string;
  fields: string[];
};

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
  const neqMatch = expr.match(/^(.+?)!=(.+)$/);
  if (neqMatch) {
    const [, left, right] = neqMatch;
    const key = left.trim();
    const val = right.trim();
    const v = getValue(data, key);
    if (val === "true") return v !== true;
    if (val === "false") return v !== false;
    if (/^\d+$/.test(val)) return Number(v) !== Number(val);
    return v !== val;
  }
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
      // Address autocomplete: require address_place_id (user must select from suggestions)
      if (f.key === "job.address" && f.ui === "address_autocomplete") {
        const placeId = getValue(flat, "job.address_place_id");
        const hasPlaceId = placeId !== undefined && placeId !== null && String(placeId).trim() !== "";
        if (!hasPlaceId) {
          errors[f.key] = "Please select a valid address from suggestions.";
          continue;
        }
        const comp = getValue(flat, "job.address_components") as Record<string, unknown> | undefined;
        const suburb = comp?.suburb;
        const state = comp?.state;
        const postcode = comp?.postcode;
        if (!suburb && !state && !postcode) {
          errors[f.key] = "Please select a valid address from suggestions.";
          continue;
        }
      }

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

  // S0: when Reported issues includes "other", require job.reported_issues_other
  if (sectionId === "S0_START_CONTEXT") {
    const reported = getValue(flat, "job.reported_issues") as string[] | undefined;
    if (Array.isArray(reported) && reported.includes("other")) {
      const otherText = (getValue(flat, "job.reported_issues_other") as string)?.trim() ?? "";
      if (!otherText) errors["job.reported_issues_other"] = "Please specify when 'Other' is selected.";
    }
  }

  // GPO by room: tested <= gpo_count; when tested < gpo_count require note (reason); pass <= tested; when pass < tested require issue !== "none"; when issue !== "none" require photos
  if (sectionId === "S7A_GPO_BY_ROOM") {
    const rooms = getValue(flat, "gpo_tests.rooms") as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(rooms)) {
      const roomDisplay = (r: Record<string, unknown>) => {
        const roomType = (r?.room_type as string) || "";
        const roomCustom = (r?.room_name_custom as string) || "";
        return roomType === "other" && roomCustom ? roomCustom : roomType.replace(/_/g, " ") || "room";
      };
      for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        if (r?.room_access === "not_accessible") {
          const reason = (r?.room_not_accessible_reason as string)?.trim() ?? "";
          if (!reason) {
            errors["gpo_tests.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Reason required when room is not accessible.`;
            break;
          }
          if (reason === "other") {
            const reasonOther = (r?.room_not_accessible_reason_other as string)?.trim() ?? "";
            if (!reasonOther) {
              errors["gpo_tests.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Please describe the reason when "Other" is selected.`;
              break;
            }
          }
          continue;
        }

        const gpoTotal = Number(r?.gpo_count) ?? 0;
        const tested = Number(r?.tested_count) ?? 0;
        const pass = Number(r?.pass_count) ?? 0;

        if (tested > gpoTotal) {
          errors["gpo_tests.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Tested count cannot exceed GPO count (total).`;
          break;
        }
        if (tested < gpoTotal) {
          const note = (r?.note as string)?.trim() ?? "";
          if (!note) {
            errors["gpo_tests.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Reason required when tested count is less than total GPO count.`;
            break;
          }
        }
        if (pass > tested) {
          errors["gpo_tests.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Pass count cannot exceed tested count.`;
          break;
        }
        if (pass < tested) {
          const issue = (r?.issue as string) || "none";
          if (!issue || issue === "none") {
            errors["gpo_tests.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Issue required when pass count is less than tested count.`;
            break;
          }
        }
        const issue = (r?.issue as string) || "none";
        if (issue === "other") {
          const issueOther = (r?.issue_other as string)?.trim() ?? "";
          if (!issueOther) {
            errors["gpo_tests.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Describe the issue when Issue is Other.`;
            break;
          }
        }
        if (issue && issue !== "none") {
          const photoIds = r?.photo_ids as string[] | undefined;
          if (!Array.isArray(photoIds) || photoIds.length === 0) {
            errors["gpo_tests.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Photo evidence required when Issue is not None.`;
            break;
          }
        }
      }
    }
  }

  // GPO failures: when pass < total, require detailed exceptions (location, issue type, photos)
  if (sectionId === "S8_GPO_LIGHTING_EXCEPTIONS") {
    const gpoFailuresErrors = validateGpoFailuresRequireDetails(flat);
    for (const [field, error] of Object.entries(gpoFailuresErrors)) {
      errors[field] = error;
    }
  }

  // Lighting by room: when room not accessible, require reason (and when "other", require custom text); when accessible and has issues, require photos; when "other" in issues, require issue_other
  if (sectionId === "S7B_LIGHTING_BY_ROOM") {
    const rooms = getValue(flat, "lighting.rooms") as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(rooms)) {
      const roomDisplay = (r: Record<string, unknown>) => {
        const roomType = (r?.room_type as string) || "";
        const roomCustom = (r?.room_name_custom as string) || "";
        return roomType === "other" && roomCustom ? roomCustom : roomType.replace(/_/g, " ") || "room";
      };
      for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        if (r?.room_access === "not_accessible") {
          const reason = (r?.room_not_accessible_reason as string)?.trim() ?? "";
          if (!reason) {
            errors["lighting.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Reason required when room is not accessible.`;
            break;
          }
          if (reason === "other") {
            const reasonOther = (r?.room_not_accessible_reason_other as string)?.trim() ?? "";
            if (!reasonOther) {
              errors["lighting.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Please describe the reason when "Other" is selected.`;
              break;
            }
          }
          continue;
        }
        const issuesArr = r?.issues as string[] | undefined;
        if (Array.isArray(issuesArr) && issuesArr.length > 0 && !(issuesArr.length === 1 && issuesArr[0] === "none")) {
          if (issuesArr.includes("other")) {
            const issueOther = (r?.issue_other as string)?.trim() ?? "";
            if (!issueOther) {
              errors["lighting.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Describe the issue when "Other" is selected.`;
              break;
            }
          }
          const photoIds = r?.photo_ids as string[] | undefined;
          if (!Array.isArray(photoIds) || photoIds.length === 0) {
            errors["lighting.rooms"] = `Row ${i + 1} (${roomDisplay(r)}): Photo evidence required when issues are present.`;
            break;
          }
        }
      }
    }
  }

  // Add cross-field validation for this section
  const crossErrors = validateCrossFieldRulesForSection(sectionId, state);
  for (const [field, error] of Object.entries(crossErrors)) {
    errors[field] = error;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * When GPO pass count < total tested, failures exist. Require detailed exceptions:
 * - no_exceptions must be false
 * - At least one exception
 * - Each exception: location, issue type, and photos required
 */
function validateGpoFailuresRequireDetails(flat: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  const performed = getValue(flat, "gpo_tests.performed");
  if (performed !== true) return errors;

  let total = Number(getValue(flat, "gpo_tests.summary.total_gpo_tested")) || 0;
  let polarityPass = Number(getValue(flat, "gpo_tests.summary.polarity_pass")) || 0;
  let earthPass = Number(getValue(flat, "gpo_tests.summary.earth_present_pass")) || 0;

  const rooms = getValue(flat, "gpo_tests.rooms") as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(rooms) && rooms.length > 0 && total === 0) {
    total = rooms.reduce((s, r) => s + (Number(r.tested_count) || 0), 0);
    const passSum = rooms.reduce((s, r) => s + (Number(r.pass_count) || 0), 0);
    polarityPass = earthPass = passSum;
  }

  const hasPolarityFailures = polarityPass < total;
  const hasEarthFailures = earthPass < total;
  if (!hasPolarityFailures && !hasEarthFailures) return errors;

  const noExceptions = getValue(flat, "gpo_tests.no_exceptions");
  const exceptions = getValue(flat, "gpo_tests.exceptions") as unknown[] | undefined;

  if (noExceptions === true) {
    errors["gpo_tests.no_exceptions"] =
      "Failures detected (pass count < total tested). Please uncheck «No exceptions» and add exception(s) with location, issue type, and photos for each failed outlet.";
    return errors;
  }

  if (!Array.isArray(exceptions) || exceptions.length === 0) {
    errors["gpo_tests.exceptions"] =
      "At least one exception required when pass count is less than total tested. Please add location, issue type, and photos for each failed outlet.";
    return errors;
  }

  for (let i = 0; i < exceptions.length; i++) {
    const item = exceptions[i] as Record<string, unknown> | undefined;
    if (!item) continue;
    const photoIds = item.photo_ids;
    const hasPhotos = Array.isArray(photoIds) && photoIds.length > 0;
    if (!hasPhotos) {
      errors["gpo_tests.exceptions"] =
        "Photos required for each failed outlet. Please add photo evidence to each exception.";
      break;
    }
  }

  return errors;
}

/**
 * Validate cross-field rules that apply to fields in a specific section
 */
function validateCrossFieldRulesForSection(
  sectionId: string,
  state: InspectionState
): Record<string, string> {
  const dict = getFieldDictionary();
  const sections = getSections();
  const section = sections.find((s) => s.id === sectionId);
  if (!section) return {};

  const sectionFieldKeys = new Set(section.fields.map((f) => f.key));
  const validations = (dict as unknown as { cross_field_validations?: CrossFieldValidation[] }).cross_field_validations ?? [];
  const flat = flattenAnswers(state);
  const errors: Record<string, string> = {};

  for (const v of validations) {
    // Only validate if at least one field belongs to this section
    const relevantFields = v.fields.filter((f) => sectionFieldKeys.has(f));
    if (relevantFields.length === 0) continue;

    // Check condition first
    if (v.condition) {
      const conditionMet = evalCrossFieldCondition(v.condition, flat);
      if (!conditionMet) continue;
    }

    // Get field values
    const values: Record<string, number> = {};
    let allFieldsPresent = true;
    for (const field of v.fields) {
      const val = getValue(flat, field);
      if (val === undefined || val === null || val === "") {
        allFieldsPresent = false;
        break;
      }
      const numVal = typeof val === "number" ? val : parseFloat(String(val));
      if (isNaN(numVal)) {
        allFieldsPresent = false;
        break;
      }
      const shortKey = field.split(".").pop() || field;
      values[shortKey] = numVal;
    }

    if (!allFieldsPresent) continue;

    // Validate rule
    const ruleValid = evalCrossFieldRule(v.id, values);
    if (!ruleValid) {
      let errorMsg = v.error_message;
      for (const [key, val] of Object.entries(values)) {
        errorMsg = errorMsg.replace(`{${key}}`, String(val));
      }
      // Add error to the first relevant field in this section
      for (const field of relevantFields) {
        errors[field] = errorMsg;
        break;
      }
    }
  }

  return errors;
}

/**
 * Validate cross-field rules (e.g., pass + fail = total)
 */
export function validateCrossFieldRules(
  state: InspectionState
): Record<string, string> {
  const dict = getFieldDictionary();
  const validations = (dict as unknown as { cross_field_validations?: CrossFieldValidation[] }).cross_field_validations ?? [];
  const flat = flattenAnswers(state);
  const errors: Record<string, string> = {};

  for (const v of validations) {
    // Check condition first
    if (v.condition) {
      const conditionMet = evalCrossFieldCondition(v.condition, flat);
      if (!conditionMet) continue;
    }

    // Get field values
    const values: Record<string, number> = {};
    let allFieldsPresent = true;
    for (const field of v.fields) {
      const val = getValue(flat, field);
      if (val === undefined || val === null || val === "") {
        allFieldsPresent = false;
        break;
      }
      const numVal = typeof val === "number" ? val : parseFloat(String(val));
      if (isNaN(numVal)) {
        allFieldsPresent = false;
        break;
      }
      // Extract short key name for error message template
      const shortKey = field.split(".").pop() || field;
      values[shortKey] = numVal;
    }

    if (!allFieldsPresent) continue;

    // Validate rule
    const ruleValid = evalCrossFieldRule(v.id, values);
    if (!ruleValid) {
      // Format error message with values
      let errorMsg = v.error_message;
      for (const [key, val] of Object.entries(values)) {
        errorMsg = errorMsg.replace(`{${key}}`, String(val));
      }
      // Add error to the last field (or all fields)
      const lastField = v.fields[v.fields.length - 1];
      errors[lastField] = errorMsg;
    }
  }

  return errors;
}

function evalCrossFieldCondition(condition: string, flat: Record<string, unknown>): boolean {
  // Simple condition evaluation: "field === true" or "field === false"
  const match = condition.match(/^(.+?)\s*===\s*(.+)$/);
  if (!match) return true;
  const [, fieldPath, expected] = match;
  const val = getValue(flat, fieldPath.trim());
  if (expected.trim() === "true") return val === true;
  if (expected.trim() === "false") return val === false;
  return String(val) === expected.trim();
}

function evalCrossFieldRule(ruleId: string, values: Record<string, number>): boolean {
  // Hardcoded rule evaluation for known rules
  if (ruleId === "rcd_pass_fail_sum") {
    const pass = values["total_pass"] ?? 0;
    const fail = values["total_fail"] ?? 0;
    const total = values["total_tested"] ?? 0;
    return pass + fail === total;
  }
  if (ruleId === "gpo_polarity_earth_sum") {
    const polarity = values["polarity_pass"] ?? 0;
    const earth = values["earth_present_pass"] ?? 0;
    const total = values["total_gpo_tested"] ?? 0;
    return polarity <= total && earth <= total;
  }
  return true;
}

export function validateAll(state: InspectionState): Record<string, Record<string, string>> {
  const sections = getSections();
  const out: Record<string, Record<string, string>> = {};
  for (const s of sections) {
    const { errors } = validateSection(s.id, state);
    if (Object.keys(errors).length) out[s.id] = errors;
  }
  
  // Add cross-field validation errors
  const crossErrors = validateCrossFieldRules(state);
  for (const [field, error] of Object.entries(crossErrors)) {
    // Find which section this field belongs to
    for (const s of sections) {
      if (s.fields.some(f => f.key === field)) {
        if (!out[s.id]) out[s.id] = {};
        out[s.id][field] = error;
        break;
      }
    }
  }
  
  return out;
}
