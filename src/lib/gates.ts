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

function flattenForGates(state: InspectionState): Record<string, unknown> {
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

export function isSectionGatedOut(sectionId: string, state: InspectionState): boolean {
  const sections = getSections();
  const section = sections.find((s) => s.id === sectionId);
  if (!section?.gates?.length) return false;
  const flat = flattenForGates(state);
  for (const g of section.gates) {
    const v = getValue(flat, g.depends_on);
    if (v !== g.equals) return true;
  }
  return false;
}

export function isSectionAutoSkipped(sectionId: string, state: InspectionState): boolean {
  const sections = getSections();
  const section = sections.find((s) => s.id === sectionId);
  const auto = section?.section_auto_skip;
  if (!auto) return false;
  const flat = flattenForGates(state);
  const [left, right] = (auto.when as string).split("==").map((s) => s.trim());
  const multi = left.startsWith("any(");
  if (multi) {
    const inner = left.slice(4, -1);
    const keys = inner.split(",").map((s) => s.trim());
    const allFalse = keys.every((k) => getValue(flat, k) === false);
    return allFalse;
  }
  return getValue(flat, left) === (right === "true" || right === "false" ? right === "true" : right);
}

export function getClearPathsForGateChange(
  changedKey: string,
  fromVal: boolean,
  toVal: boolean
): string[] {
  if (fromVal !== true || toVal !== false) return [];
  const sections = getSections();
  const all: string[] = [];
  for (const s of sections) {
    const rules = s.clear_on_gate_change ?? [];
    for (const r of rules) {
      if (r.if_changed === changedKey && r.from === true && r.to === false) {
        all.push(...r.clear_paths);
      }
    }
  }
  return [...new Set(all)];
}
