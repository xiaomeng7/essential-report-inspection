import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { connectLambda, getStore } from "@netlify/blobs";
import type { HandlerEvent } from "@netlify/functions";

// Type definitions for mapping configuration
type Condition = {
  field: string;
  operator: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "in" | "not_in";
  value: unknown;
  coerce?: "string" | "number" | "boolean";
};

type MappingRule = {
  finding: string;
  condition?: Condition;
  conditions?: {
    all?: Condition[];
    any?: Condition[];
  };
};

type ChecklistToFindingsMap = {
  version: string;
  description: string;
  mappings: MappingRule[];
};

// Get __dirname equivalent for ES modules (with error handling)
let __dirname: string;
try {
  if (typeof import.meta !== "undefined" && import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else {
    __dirname = process.cwd();
  }
} catch (e) {
  console.warn("Could not determine __dirname from import.meta.url, using process.cwd()");
  __dirname = process.cwd();
}

/** Embedded rules.yml – used when file is not found (e.g. Netlify Functions bundle). */
export const EMBEDDED_RULES_YAML = `
version: 1.0
description: >
  Essential Report decision rules.

enums:
  safety: [HIGH, MODERATE, LOW]
  urgency: [IMMEDIATE, SHORT_TERM, LONG_TERM]
  liability: [HIGH, MEDIUM, LOW]
  priority_bucket:
    - IMMEDIATE
    - RECOMMENDED_0_3_MONTHS
    - PLAN_MONITOR

hard_overrides:
  priority_bucket: IMMEDIATE
  findings:
    - MEN_NOT_VERIFIED
    - SUPPLY_NO_MAIN_ISOLATION
    - THERMAL_STRESS_ACTIVE
    - MATERIAL_DEGRADATION
    - ARCING_EVIDENCE_PRESENT
    - ASBESTOS_RISK
    - NO_RCD_PROTECTION
    - GPO_EARTH_FAULT
    - EXPOSED_CONDUCTOR
    - SMOKE_ALARM_FAILURE
    - BATTERY_THERMAL
    - EV_UNSEGREGATED_LOAD

base_priority_matrix:
  - when: { safety: HIGH }
    then: IMMEDIATE
  - when: { safety: MODERATE, urgency: IMMEDIATE }
    then: IMMEDIATE
  - when: { safety: MODERATE, urgency: SHORT_TERM }
    then: RECOMMENDED_0_3_MONTHS
  - when: { safety: MODERATE, urgency: LONG_TERM }
    then: PLAN_MONITOR
  - when: { safety: LOW }
    then: PLAN_MONITOR

liability_adjustment:
  rules:
    - when: { liability: HIGH }
      action: { shift: UP, max_priority: RECOMMENDED_0_3_MONTHS }
    - when: { liability: MEDIUM }
      action: { shift: NONE }
    - when: { liability: LOW }
      action: { shift: DOWN, min_priority: PLAN_MONITOR }

liability_guardrails:
  rules:
    - if: { safety: HIGH }
      then: { allow_downgrade: false }
    - if: { urgency: IMMEDIATE }
      then: { allow_liability_adjustment: false }

findings:
  MEN_NOT_VERIFIED: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  SUPPLY_NO_MAIN_ISOLATION: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  THERMAL_STRESS_ACTIVE: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  MATERIAL_DEGRADATION: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  ARCING_EVIDENCE_PRESENT: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  ASBESTOS_RISK: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  NO_RCD_PROTECTION: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  GPO_EARTH_FAULT: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  EXPOSED_CONDUCTOR: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  SMOKE_ALARM_FAILURE: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  BATTERY_THERMAL: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  EV_UNSEGREGATED_LOAD: { safety: HIGH, urgency: IMMEDIATE, liability: HIGH }
  PARTIAL_RCD_COVERAGE: { safety: MODERATE, urgency: SHORT_TERM, liability: HIGH }
  EARTH_DEGRADED: { safety: MODERATE, urgency: SHORT_TERM, liability: MEDIUM }
  LEGACY_SUPPLY_FUSE: { safety: MODERATE, urgency: SHORT_TERM, liability: MEDIUM }
  BOARD_AT_CAPACITY: { safety: MODERATE, urgency: SHORT_TERM, liability: MEDIUM }
  NO_EXPANSION_MARGIN: { safety: MODERATE, urgency: SHORT_TERM, liability: MEDIUM }
  MECHANICAL_EXPOSURE: { safety: MODERATE, urgency: SHORT_TERM, liability: MEDIUM }
  GPO_MECHANICAL_LOOSE: { safety: MODERATE, urgency: SHORT_TERM, liability: MEDIUM }
  SWITCH_ARCING: { safety: MODERATE, urgency: SHORT_TERM, liability: HIGH }
  FITTING_OVERHEAT: { safety: MODERATE, urgency: SHORT_TERM, liability: HIGH }
  NON_STANDARD_WORK: { safety: MODERATE, urgency: SHORT_TERM, liability: HIGH }
  BATTERY_INSTALL_UNVERIFIED: { safety: MODERATE, urgency: SHORT_TERM, liability: HIGH }
  EV_LOAD_AGGREGATION: { safety: MODERATE, urgency: SHORT_TERM, liability: HIGH }
  LEGACY_EARTHING: { safety: MODERATE, urgency: LONG_TERM, liability: LOW }
  LEGACY_DEVICES: { safety: MODERATE, urgency: LONG_TERM, liability: LOW }
  IP_UNVERIFIED: { safety: LOW, urgency: LONG_TERM, liability: LOW }
  LABELING_POOR: { safety: LOW, urgency: LONG_TERM, liability: LOW }
  SURGE_PROTECTION_ABSENT: { safety: LOW, urgency: LONG_TERM, liability: LOW }
  HYBRID_UPGRADE_STAGE: { safety: LOW, urgency: LONG_TERM, liability: LOW }
  ALARM_AGEING: { safety: LOW, urgency: LONG_TERM, liability: MEDIUM }
  PV_ISOLATION_UNVERIFIED: { safety: LOW, urgency: LONG_TERM, liability: MEDIUM }
`.trim();

function findRulesPath(): string {
  let currentDir: string;
  try {
    const __filename = fileURLToPath(import.meta.url);
    currentDir = path.dirname(__filename);
  } catch {
    currentDir = process.cwd();
  }
  const possiblePaths = [
    path.join(currentDir, "rules.yml"),
    path.join(currentDir, "..", "rules.yml"),
    path.join(currentDir, "../..", "rules.yml"),
    path.join(process.cwd(), "rules.yml"),
    "/var/task/rules.yml",
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* continue */
    }
  }
  return possiblePaths[0];
}

type Rules = {
  hard_overrides?: { findings: string[] };
  base_priority_matrix?: Array<{ when: Record<string, string>; then: string }>;
  liability_adjustment?: { rules: Array<{ when: { liability: string }; action: Record<string, string> }> };
  liability_guardrails?: { rules: Array<{ if: Record<string, string>; then: Record<string, boolean> }> };
  findings?: Record<string, { safety: string; urgency: string; liability: string }>;
};

let rulesCache: Rules | null = null;
let mappingCache: ChecklistToFindingsMap | null = null;

export function clearRulesCache(): void {
  rulesCache = null;
  mappingCache = null;
}

/**
 * Find the path to CHECKLIST_TO_FINDINGS_MAP.json
 */
function findMappingPath(): string {
  const possiblePaths = [
    path.join(__dirname, "..", "..", "CHECKLIST_TO_FINDINGS_MAP.json"),
    path.join(process.cwd(), "CHECKLIST_TO_FINDINGS_MAP.json"),
    path.join(process.cwd(), "netlify", "functions", "CHECKLIST_TO_FINDINGS_MAP.json"),
    "/opt/build/repo/CHECKLIST_TO_FINDINGS_MAP.json",
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return possiblePaths[0]; // Return first as fallback
}

/**
 * Load CHECKLIST_TO_FINDINGS_MAP.json
 * Tries blob store first, then falls back to file system
 */
async function loadMapping(event?: HandlerEvent): Promise<ChecklistToFindingsMap> {
  if (mappingCache) return mappingCache;

  // Try blob store first (if event is provided)
  if (event) {
    try {
      connectLambda(event);
      const store = getStore({ name: "config", consistency: "eventual" });
      const blobContent = await store.get("mapping.json", { type: "text" });
      if (blobContent) {
        try {
          mappingCache = JSON.parse(blobContent) as ChecklistToFindingsMap;
          console.log("✅ Checklist-to-findings mapping loaded from blob store");
          return mappingCache;
        } catch (e) {
          console.warn("Failed to parse mapping from blob:", e);
        }
      }
    } catch (e) {
      console.warn("Failed to access blob store for mapping:", e);
    }
  }

  // Fallback to file system
  const actualPath = findMappingPath();
  let mapping: ChecklistToFindingsMap;

  if (fs.existsSync(actualPath)) {
    try {
      const raw = fs.readFileSync(actualPath, "utf8");
      mapping = JSON.parse(raw) as ChecklistToFindingsMap;
      console.log("✅ Checklist-to-findings mapping loaded from:", actualPath);
    } catch (e) {
      console.error("❌ Failed to load mapping file:", e);
      // Fallback to empty mapping
      mapping = { version: "1.0", description: "Empty mapping", mappings: [] };
    }
  } else {
    console.warn("⚠️ CHECKLIST_TO_FINDINGS_MAP.json not found at", actualPath, ", using empty mapping");
    mapping = { version: "1.0", description: "Empty mapping", mappings: [] };
  }

  mappingCache = mapping;
  return mappingCache;
}

/**
 * Coerce value to specified type
 */
function coerceValue(value: unknown, type?: string): unknown {
  if (!type) return value;
  if (type === "number") {
    if (typeof value === "string") return Number(value);
    if (typeof value === "number") return value;
    return Number(value) || 0;
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true" || value === "yes";
    return Boolean(value);
  }
  if (type === "string") {
    return String(value ?? "");
  }
  return value;
}

/**
 * Evaluate a single condition against facts
 */
function evaluateCondition(condition: Condition, facts: Record<string, unknown>): boolean {
  const fieldValue = getAt(facts, condition.field);
  const actualValue = condition.coerce ? coerceValue(fieldValue, condition.coerce) : fieldValue;
  const expectedValue = condition.coerce ? coerceValue(condition.value, condition.coerce) : condition.value;

  switch (condition.operator) {
    case "eq":
      return actualValue === expectedValue;
    case "ne":
      return actualValue !== expectedValue;
    case "gt":
      return Number(actualValue) > Number(expectedValue);
    case "lt":
      return Number(actualValue) < Number(expectedValue);
    case "gte":
      return Number(actualValue) >= Number(expectedValue);
    case "lte":
      return Number(actualValue) <= Number(expectedValue);
    case "in":
      return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
    case "not_in":
      return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
    default:
      console.warn(`Unknown operator: ${condition.operator}`);
      return false;
  }
}

/**
 * Evaluate a mapping rule against facts
 */
function evaluateMappingRule(rule: MappingRule, facts: Record<string, unknown>): boolean {
  // Single condition
  if (rule.condition) {
    return evaluateCondition(rule.condition, facts);
  }

  // Multiple conditions (all/any)
  if (rule.conditions) {
    if (rule.conditions.all) {
      return rule.conditions.all.every((cond) => evaluateCondition(cond, facts));
    }
    if (rule.conditions.any) {
      return rule.conditions.any.some((cond) => evaluateCondition(cond, facts));
    }
  }

  return false;
}

async function loadRules(event?: HandlerEvent): Promise<Rules> {
  if (rulesCache) return rulesCache;
  
  // Try blob store first (if event is provided)
  if (event) {
    try {
      connectLambda(event);
      const store = getStore({ name: "config", consistency: "eventual" });
      const blobContent = await store.get("rules.yml", { type: "text" });
      if (blobContent) {
        try {
          rulesCache = yaml.load(blobContent) as Rules;
          console.log("✅ Rules loaded from blob store");
          return rulesCache!;
        } catch (e) {
          console.warn("Failed to parse rules from blob:", e);
        }
      }
    } catch (e) {
      console.warn("Failed to access blob store for rules:", e);
    }
  }

  // Fallback to file system
  const actualPath = findRulesPath();
  let raw: string;
  if (fs.existsSync(actualPath)) {
    try {
      raw = fs.readFileSync(actualPath, "utf8");
      console.log("Rules loaded from file:", actualPath);
    } catch (e) {
      console.warn("Could not read rules.yml, using embedded:", e);
      raw = EMBEDDED_RULES_YAML;
    }
  } else {
    console.warn("rules.yml not found at", actualPath, ", using embedded rules");
    raw = EMBEDDED_RULES_YAML;
  }
  rulesCache = yaml.load(raw) as Rules;
  return rulesCache!;
}

function getAt(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let v: unknown = obj;
  for (const p of parts) {
    if (v == null || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[p];
  }
  return v;
}

function setAtPath(obj: Record<string, unknown>, path: string, val: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    let next = (cur[p] ?? {}) as Record<string, unknown>;
    if (typeof next !== "object") next = {};
    cur[p] = next;
    cur = next;
  }
  cur[parts[parts.length - 1]] = val;
}

/** Flatten full inspection state to facts (values only) for rule evaluation. */
export function flattenFacts(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (o: unknown, prefix: string) => {
    if (o == null) return;
    if (Array.isArray(o)) {
      if (prefix) setAtPath(out, prefix, o);
      return;
    }
    if (typeof o === "object" && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "object" && v !== null && "value" in (v as object)) {
          // This is an Answer object, extract the value
          const answerValue = (v as { value: unknown }).value;
          // If the value itself is an Answer object (nested), recursively extract
          if (typeof answerValue === "object" && answerValue !== null && "value" in (answerValue as object)) {
            // Recursively extract nested Answer objects
            let currentValue: unknown = answerValue;
            while (typeof currentValue === "object" && currentValue !== null && "value" in (currentValue as object)) {
              currentValue = (currentValue as { value: unknown }).value;
            }
            setAtPath(out, path, currentValue);
          } else {
            setAtPath(out, path, answerValue);
          }
        } else {
          walk(v, path);
        }
      }
    }
  };
  walk(raw, "");
  return out;
}

/** Issue-to-finding mapping (gpo_room_issue, lighting_switch_issue → finding ID). "other" maps to null = requires custom 7 dimensions. */
let issueToFindingCache: { gpo_room_issue: Record<string, string | null>; lighting_switch_issue: Record<string, string | null> } | null = null;

function loadIssueToFinding(): typeof issueToFindingCache {
  if (issueToFindingCache) return issueToFindingCache;
  const possiblePaths = [
    path.join(__dirname, "..", "..", "..", "mappings", "issue_to_finding.json"),
    path.join(__dirname, "..", "..", "mappings", "issue_to_finding.json"),
    path.join(process.cwd(), "mappings", "issue_to_finding.json"),
    path.join(process.cwd(), "netlify", "functions", "mappings", "issue_to_finding.json"),
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        issueToFindingCache = JSON.parse(raw) as typeof issueToFindingCache;
        return issueToFindingCache;
      }
    } catch {
      /* continue */
    }
  }
  issueToFindingCache = {
    gpo_room_issue: { missing_earth: "GPO_EARTH_FAULT", polarity_reversed: "POLARITY_ISSUE_DETECTED", no_power: "GPO_MECHANICAL_LOOSE", loose: "GPO_MECHANICAL_LOOSE", plug_disengages: "GPO_MECHANICAL_LOOSE", cracks_visible: "DAMAGED_OUTLET_OR_SWITCH", burn_marks: "GPO_OVERHEATING", damage: "DAMAGED_OUTLET_OR_SWITCH", overheating: "GPO_OVERHEATING", surface_warm: "GPO_OVERHEATING", other: null },
    lighting_switch_issue: { fitting_overheat: "FITTING_OVERHEAT", fitting_not_working: "LIGHT_FITTING_NONCOMPLIANT_OR_UNSAFE", switch_loose: "SWITCH_LOOSE_MOUNTING", switch_arcing: "SWITCH_ARCING", switch_unresponsive: "SWITCH_MOVEMENT_UNEVEN_OR_OBSTRUCTED", dimmer_not_working: "SWITCH_MOVEMENT_UNEVEN_OR_OBSTRUCTED", other: null },
  };
  return issueToFindingCache;
}

/** Room label from room_type + room_name_custom */
function roomLabel(room: Record<string, unknown>): string {
  const rt = String(room?.room_type ?? "").trim();
  const custom = String(room?.room_name_custom ?? "").trim();
  if (rt === "other" && custom) return custom;
  const labels: Record<string, string> = {
    bedroom_1: "Bedroom 1", bedroom_2: "Bedroom 2", living_room: "Living Room", kitchen: "Kitchen",
    bathroom_1: "Bathroom 1", garage: "Garage", shed: "Shed", veranda: "Veranda", hallway: "Hallway",
    office: "Office", external_area: "External Area", other: "Other",
  };
  return labels[rt] ?? (rt.replace(/_/g, " ") || "Room");
}

type RoomFinding = { id: string; location: string; photo_ids: string[] };

/** Derive findings from gpo_tests.rooms and lighting.rooms with location and photo_ids. */
function deriveFindingsFromRooms(facts: Record<string, unknown>): RoomFinding[] {
  const out: RoomFinding[] = [];
  const map = loadIssueToFinding();
  if (!map) return out;

  const gpoRooms = getAt(facts, "gpo_tests.rooms") as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(gpoRooms)) {
    for (const r of gpoRooms) {
      if (r?.room_access === "not_accessible") continue;
      const issue = (r?.issue as string) || "";
      if (!issue || issue === "other") continue;
      const findingId = map.gpo_room_issue?.[issue];
      if (!findingId) continue;
      const loc = roomLabel(r);
      const pids = Array.isArray(r?.photo_ids) ? (r.photo_ids as string[]).filter((x): x is string => typeof x === "string") : [];
      out.push({ id: findingId, location: loc, photo_ids: pids });
    }
  }

  const lightingRooms = getAt(facts, "lighting.rooms") as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(lightingRooms)) {
    for (const r of lightingRooms) {
      if (r?.room_access === "not_accessible") continue;
      const issues = (r?.issues as string[]) || [];
      const loc = roomLabel(r);
      const pids = Array.isArray(r?.photo_ids) ? (r.photo_ids as string[]).filter((x): x is string => typeof x === "string") : [];
      for (const issue of issues) {
        if (!issue || issue === "none" || issue === "other") continue;
        const findingId = map.lighting_switch_issue?.[issue];
        if (findingId) out.push({ id: findingId, location: loc, photo_ids: pids });
      }
    }
  }

  return out;
}

/** Section/location mapping for CHECKLIST findings (field path prefix → location label) */
const SECTION_LOCATION_MAP: Record<string, string> = {
  switchboard: "Switchboard",
  rcd_tests: "RCD Tests",
  gpo_tests: "GPO Tests",
  earthing: "Earthing",
  access: "Access",
  lighting: "Lighting",
  smoke_alarms: "Smoke Alarms",
  thermal_imaging: "Thermal Imaging",
  assets: "Solar/Battery/EV",
  signoff: "Sign-off",
};

/**
 * Convert facts (checklist answers) to finding codes using configurable mapping rules.
 * Returns { checklistIds, roomFindings } for merging.
 */
async function factsToFindings(
  facts: Record<string, unknown>,
  event?: HandlerEvent
): Promise<{ checklistIds: string[]; roomFindings: RoomFinding[]; ruleFieldPaths: Record<string, string> }> {
  const checklistIds: string[] = [];
  const ruleFieldPaths: Record<string, string> = {};
  const mapping = await loadMapping(event);

  for (const rule of mapping.mappings) {
    if (evaluateMappingRule(rule, facts)) {
      checklistIds.push(rule.finding);
      const path = rule.condition?.field ?? rule.conditions?.all?.[0]?.field ?? rule.conditions?.any?.[0]?.field;
      if (path && !ruleFieldPaths[rule.finding]) ruleFieldPaths[rule.finding] = path;
    }
  }

  const roomFindings = deriveFindingsFromRooms(facts);
  return {
    checklistIds: [...new Set(checklistIds)],
    roomFindings,
    ruleFieldPaths,
  };
}

/** Location label from field path (e.g. switchboard.signs_of_overheating → Switchboard) */
function locationFromFieldPath(path: string): string {
  const prefix = path.split(".")[0];
  return prefix ? (SECTION_LOCATION_MAP[prefix] ?? prefix.replace(/_/g, " ")) : "";
}

async function applyPriority(
  findingId: string,
  meta: { safety: string; urgency: string; liability: string },
  event?: HandlerEvent
): Promise<string> {
  const r = await loadRules(event);
  const hard = r.hard_overrides?.findings ?? [];
  if (hard.includes(findingId)) return "IMMEDIATE";

  const guardrails = r.liability_guardrails?.rules ?? [];
  const noDowngrade = guardrails.some((g) => g.if?.safety === "HIGH" && g.then?.allow_downgrade === false);
  const noLiabilityAdj = guardrails.some((g) => g.if?.urgency === "IMMEDIATE" && g.then?.allow_liability_adjustment === false);

  let bucket = "PLAN_MONITOR";
  const matrix = r.base_priority_matrix ?? [];
  for (const m of matrix) {
    const w = m.when ?? {};
    if (w.safety === meta.safety && (w.urgency == null || w.urgency === meta.urgency)) {
      bucket = m.then;
      break;
    }
  }

  if (noLiabilityAdj || meta.urgency === "IMMEDIATE") return bucket;

  const adj = r.liability_adjustment?.rules ?? [];
  for (const a of adj) {
    if (a.when?.liability !== meta.liability) continue;
    const act = a.action ?? {};
    if (act.shift === "UP" && (bucket === "PLAN_MONITOR" || bucket === "RECOMMENDED_0_3_MONTHS")) {
      bucket = act.max_priority ?? bucket;
    } else if (act.shift === "DOWN" && bucket === "RECOMMENDED_0_3_MONTHS" && !noDowngrade) {
      bucket = act.min_priority ?? "PLAN_MONITOR";
    }
  }

  return bucket;
}

export type EvaluatedFinding = { id: string; priority: string; title?: string; location?: string; photo_ids?: string[] };

export async function evaluateFindings(facts: Record<string, unknown>, event?: HandlerEvent): Promise<EvaluatedFinding[]> {
  const r = await loadRules(event);
  const findings = r.findings ?? {};
  const { checklistIds, roomFindings, ruleFieldPaths } = await factsToFindings(facts, event);

  const byId = new Map<string, EvaluatedFinding>();

  for (const id of checklistIds) {
    const meta = findings[id];
    if (!meta) continue;
    const priority = await applyPriority(id, meta, event);
    const loc = locationFromFieldPath(ruleFieldPaths[id] ?? "");
    byId.set(id, { id, priority, title: id.replace(/_/g, " "), location: loc || undefined });
  }

  for (const rf of roomFindings) {
    const meta = findings[rf.id];
    if (!meta) continue;
    const priority = await applyPriority(rf.id, meta, event);
    const existing = byId.get(rf.id);
    if (existing) {
      const locs = [existing.location, rf.location].filter(Boolean);
      const pids = [...(existing.photo_ids ?? []), ...rf.photo_ids];
      existing.location = locs.length ? [...new Set(locs)].join("; ") : undefined;
      existing.photo_ids = [...new Set(pids)].slice(0, 10);
    } else {
      byId.set(rf.id, {
        id: rf.id,
        priority,
        title: rf.id.replace(/_/g, " "),
        location: rf.location || undefined,
        photo_ids: rf.photo_ids.length ? rf.photo_ids : undefined,
      });
    }
  }

  return Array.from(byId.values());
}

export function collectLimitations(raw: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (o: unknown, pathKey: string) => {
    if (o == null) return;
    if (typeof o === "object" && !Array.isArray(o)) {
      for (const [k, v] of Object.entries(o)) {
        if (k === "created_at") continue;
        const p = pathKey ? `${pathKey}.${k}` : k;
        if (typeof v === "object" && v !== null && "status" in (v as object)) {
          const a = v as { status: string; skip_reason?: string; skip_note?: string };
          if (a.status === "skipped" && a.skip_reason) {
            out.push(`${p}: skipped (${a.skip_reason})${a.skip_note ? ` — ${a.skip_note}` : ""}`);
          }
        } else {
          walk(v, p);
        }
      }
    }
  };
  walk(raw, "");
  return out;
}

// Full report template (embedded - matches netlify/functions/report-template.html)
// This is the complete template with all sections, styling, and structure
const FULL_REPORT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Electrical Property Health Assessment – {{INSPECTION_ID}}</title>

  <style>
    :root{
      --ink:#0f172a;
      --muted:#64748b;
      --paper:#ffffff;
      --bg:#f5f7fb;
      --line:#e2e8f0;

      --red:#b91c1c;
      --red-bg:#fef2f2;

      --amber:#b45309;
      --amber-bg:#fffbeb;

      --green:#047857;
      --green-bg:#ecfdf5;

      --radius:14px;
      --shadow: 0 10px 24px rgba(15, 23, 42, .08);

      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      --sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
    }

    *{ box-sizing:border-box; }
    html,body{ margin:0; padding:0; font-family:var(--sans); color:var(--ink); background:var(--bg); }
    a{ color:inherit; text-decoration:none; }
    p{ line-height:1.65; margin:.65rem 0; }
    ul,ol{ margin:.45rem 0 .9rem 1.2rem; }
    li{ margin:.28rem 0; line-height:1.55; }
    h1,h2,h3{ line-height:1.22; margin:0 0 .65rem 0; }
    h1{ font-size:1.7rem; }
    h2{ font-size:1.25rem; margin-top:1.35rem; }
    h3{ font-size:1.05rem; margin-top:1rem; color:#334155; }
    .muted{ color:var(--muted); }
    .mono{ font-family:var(--mono); }
    .small{ font-size:.92rem; }

    /* Layout */
    .page{
      max-width: 980px;
      margin: 20px auto;
      padding: 0 14px 30px;
    }
    .card{
      background:var(--paper);
      border:1px solid var(--line);
      border-radius:var(--radius);
      box-shadow:var(--shadow);
      overflow:hidden;
    }
    .section{
      padding: 18px 18px;
      border-top:1px solid var(--line);
    }
    .section:first-child{ border-top:none; }

    /* Cover */
    .cover{
      padding: 26px 18px 18px;
      background: linear-gradient(135deg, rgba(15,23,42,.95), rgba(51,65,85,.95));
      color:#fff;
    }
    .cover .kicker{
      font-size:.86rem;
      opacity:.9;
      margin-bottom:10px;
      letter-spacing:.4px;
      text-transform:uppercase;
    }
    .cover .title{
      font-size:1.9rem;
      margin-bottom:10px;
    }
    .cover .subtitle{
      opacity:.92;
      margin-bottom:18px;
      max-width: 70ch;
    }

    .meta-grid{
      display:grid;
      grid-template-columns: 1fr;
      gap:10px;
    }
    @media (min-width:720px){
      .meta-grid{ grid-template-columns: 1fr 1fr; }
    }
    .meta{
      background: rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.18);
      border-radius: 12px;
      padding: 12px 12px;
    }
    .meta .label{
      font-size:.78rem;
      opacity:.82;
      margin-bottom:4px;
      text-transform:uppercase;
      letter-spacing:.35px;
    }
    .meta .value{
      font-size: .98rem;
      font-weight: 650;
      word-break: break-word;
    }

    /* Pills */
    .pill{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding: 6px 10px;
      border-radius: 999px;
      font-weight: 750;
      font-size: .86rem;
      border:1px solid transparent;
      white-space: nowrap;
    }
    .pill.red{ color:var(--red); background:var(--red-bg); border-color: rgba(185,28,28,.18); }
    .pill.amber{ color:var(--amber); background:var(--amber-bg); border-color: rgba(180,83,9,.18); }
    .pill.green{ color:var(--green); background:var(--green-bg); border-color: rgba(4,120,87,.18); }

    .rule{
      height:1px;
      background:var(--line);
      margin: 14px 0;
    }

    /* TOC */
    .toc{
      display:grid;
      grid-template-columns: 1fr;
      gap:10px;
    }
    @media (min-width:720px){
      .toc{ grid-template-columns: 1fr 1fr; }
    }
    .toc a{
      display:flex;
      justify-content:space-between;
      gap:10px;
      padding: 10px 12px;
      border:1px solid var(--line);
      border-radius: 12px;
      background:#fff;
    }
    .toc a:hover{ background:#f9fafb; }
    .toc .num{ color:var(--muted); font-family:var(--mono); font-size:.85rem; }

    /* Buckets */
    .bucket{
      border:1px solid var(--line);
      border-radius: 14px;
      overflow:hidden;
      margin-top: 12px;
    }
    .bucket-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
      padding: 12px 12px;
      font-weight:800;
    }
    .bucket-body{ padding: 12px 12px 8px; }
    .bucket.red .bucket-head{ background:var(--red-bg); color:var(--red); }
    .bucket.amber .bucket-head{ background:var(--amber-bg); color:var(--amber); }
    .bucket.green .bucket-head{ background:var(--green-bg); color:var(--green); }
    .bucket-body ul{ margin-left: 1.15rem; }

    /* Simple tables */
    table{
      width:100%;
      border-collapse:collapse;
      border:1px solid var(--line);
      border-radius: 12px;
      overflow:hidden;
      margin-top:10px;
      font-size:.95rem;
    }
    th,td{
      padding:10px 10px;
      border-bottom:1px solid var(--line);
      vertical-align:top;
      text-align:left;
    }
    th{ background:#f8fafc; color:#334155; font-weight:750; }
    tr:last-child td{ border-bottom:none; }

    /* Footer */
    .footer{
      padding: 14px 18px 18px;
      color:var(--muted);
      font-size:.86rem;
    }

    /* Print */
    @media print{
      body{ background:#fff; }
      .page{ margin:0; max-width:none; padding:0; }
      .card{ box-shadow:none; border:none; }
      .cover, .bucket-head, .pill{
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="card">

      <!-- COVER (based on the provided doc format) -->
      <header class="cover" id="cover">
        <div class="kicker">Independent electrical condition &amp; risk review</div>
        <div class="title">Electrical Property Health Assessment</div>
        <div class="subtitle">
          Risk clarity &amp; decision support for residential investment properties.
        </div>

        <div class="meta-grid" aria-label="Report metadata">
          <div class="meta">
            <div class="label">Inspection ID</div>
            <div class="value mono">{{INSPECTION_ID}}</div>
          </div>
          <div class="meta">
            <div class="label">Assessment Date</div>
            <div class="value">{{ASSESSMENT_DATE}}</div>
          </div>
          <div class="meta">
            <div class="label">Prepared For</div>
            <div class="value">{{PREPARED_FOR}}</div>
          </div>
          <div class="meta">
            <div class="label">Prepared By</div>
            <div class="value">{{PREPARED_BY}}</div>
          </div>
          <div class="meta">
            <div class="label">Property Type</div>
            <div class="value">{{PROPERTY_TYPE}}</div>
          </div>
          <div class="meta">
            <div class="label">Report Version</div>
            <div class="value">{{REPORT_VERSION}}</div>
          </div>
        </div>
      </header>

      <!-- TABLE OF CONTENTS -->
      <section class="section" id="toc">
        <h2>Table of Contents</h2>
        <p class="muted">Use this as a decision-focused reference, not a repair checklist.</p>

        <div class="toc" role="list">
          <a href="#purpose"><span>Purpose &amp; How to Use This Report</span><span class="num">01</span></a>
          <a href="#scope"><span>Scope, Limitations &amp; Independence</span><span class="num">02</span></a>
          <a href="#exec"><span>Executive Summary</span><span class="num">03</span></a>
          <a href="#risk"><span>Overall Electrical Risk Rating</span><span class="num">04</span></a>
          <a href="#immediate"><span>Immediate Attention Items</span><span class="num">05</span></a>
          <a href="#recommended"><span>Monitoring &amp; Planned Action Items</span><span class="num">06</span></a>
          <a href="#plan"><span>Items Not Requiring Action</span><span class="num">07</span></a>
          <a href="#observations"><span>General Observations</span><span class="num">08</span></a>
          <a href="#next"><span>Investor Options &amp; Next Steps</span><span class="num">09</span></a>
          <a href="#appendix"><span>Appendix – Test Results Summary</span><span class="num">10</span></a>
          <a href="#terms"><span>Terms &amp; Conditions + Disclaimer</span><span class="num">11</span></a>
        </div>
      </section>

      <!-- PURPOSE -->
      <section class="section" id="purpose">
        <h2>Purpose &amp; How to Use This Report</h2>

        <h3>Purpose of This Assessment</h3>
        <p>
          This assessment has been prepared to address a common challenge faced by property investors:
          making electrical decisions without clear visibility of actual risk.
        </p>
        <ul>
          <li>Translate technical observations into investment-relevant risk insights</li>
          <li>Distinguish between immediate safety concerns, long-term degradation, and non-issues</li>
          <li>Support measured, non-reactive decisions aligned with property investment goals</li>
          <li>Reduce unnecessary expenditure driven by uncertainty or conflicting advice</li>
        </ul>
        <p class="muted">
          This assessment does not assume that all electrical deviations require rectification.
          Its primary role is to clarify what truly matters — and what does not.
        </p>

        <h3>How to Use This Report Effectively</h3>
        <ul>
          <li>Focus first on the Executive Summary and Risk Rating.</li>
          <li>Use detailed sections to understand context, not to self-diagnose.</li>
          <li>Treat recommendations as planning inputs, not mandatory instructions.</li>
        </ul>
      </section>

      <!-- SCOPE / LIMITATIONS -->
      <section class="section" id="scope">
        <h2>Scope, Limitations &amp; Independence</h2>

        <h3>Scope of Electrical Assessment</h3>
        <ul>
          <li>Main switchboard enclosure, layout, and protection devices (where accessible)</li>
          <li>Circuit configuration and load distribution (where observable)</li>
          <li>Presence and condition of RCD protection</li>
          <li>General condition of visible cabling and terminations</li>
          <li>Functional testing of selected outlets and lighting circuits</li>
          <li>Earthing continuity at accessible points</li>
        </ul>

        <h3>Limitations of Assessment</h3>
        <p class="muted">
          This assessment is limited to accessible and visible areas only. Concealed wiring and inaccessible areas are excluded.
          These limitations are standard for non-invasive assessments and do not indicate any known defect.
        </p>

        <!-- REQUIRED PLACEHOLDER -->
        {{LIMITATIONS_SECTION}}

        <h3>Independence Statement</h3>
        <p>
          This report is prepared independently of any repair or upgrade proposal.
          Accordingly, no repair pricing or commercial quotations are included in this assessment.
        </p>
      </section>

      <!-- EXEC SUMMARY -->
      <section class="section" id="exec">
        <h2>Executive Summary</h2>

        <h3>Overall Electrical Status</h3>
        <p>
          <span class="pill amber">{{OVERALL_STATUS_BADGE}}</span>
        </p>
        <p class="muted">
          {{EXECUTIVE_SUMMARY_PARAGRAPH}}
        </p>

        <div class="rule"></div>

        <h3>Priority Overview (Decision-Focused)</h3>
        <p class="muted">Items are grouped by priority to support measured decision-making (not fault-finding).</p>

        <table aria-label="Priority overview table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Description</th>
              <th>Investor Interpretation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>🔴 Immediate</td>
              <td>{{PRIORITY_IMMEDIATE_DESC}}</td>
              <td>{{PRIORITY_IMMEDIATE_INTERP}}</td>
            </tr>
            <tr>
              <td>🟠 Monitor</td>
              <td>{{PRIORITY_RECOMMENDED_DESC}}</td>
              <td>{{PRIORITY_RECOMMENDED_INTERP}}</td>
            </tr>
            <tr>
              <td>🟢 Acceptable</td>
              <td>{{PRIORITY_PLAN_DESC}}</td>
              <td>{{PRIORITY_PLAN_INTERP}}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- RISK RATING -->
      <section class="section" id="risk">
        <h2>Overall Electrical Risk Rating</h2>

        <p class="muted">
          This assessment uses a three-tier risk classification framework designed specifically for investment decision-making, not fault-finding.
        </p>

        <table aria-label="Risk classification framework">
          <thead>
            <tr>
              <th>Risk Level</th>
              <th>Definition</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>🟢 Low</td>
              <td>Condition consistent with safe operation; no action recommended</td>
            </tr>
            <tr>
              <td>🟡 Moderate</td>
              <td>Acceptable condition with identifiable ageing or legacy factors</td>
            </tr>
            <tr>
              <td>🔴 High</td>
              <td>Condition presents elevated safety or failure risk</td>
            </tr>
          </tbody>
        </table>

        <div class="bucket green" style="margin-top:12px;">
          <div class="bucket-head">
            <span>Current Property Risk Rating</span>
            <span class="pill amber">{{RISK_RATING_BADGE}}</span>
          </div>
          <div class="bucket-body">
            <ul>
              {{RISK_RATING_FACTORS}}
            </ul>
            <p class="muted small">
              A Moderate rating does not imply non-compliance or unsafe occupation. It supports a measured, forward-looking management approach.
            </p>
          </div>
        </div>
      </section>

      <!-- IMMEDIATE -->
      <section class="section" id="immediate">
        <h2>Immediate Attention Items</h2>

        <div class="bucket red">
          <div class="bucket-head">
            <span>🔴 Immediate Safety Risks</span>
            <span class="mono">Priority: IMMEDIATE</span>
          </div>
          <div class="bucket-body">
            <!-- REQUIRED PLACEHOLDER -->
            {{IMMEDIATE_FINDINGS}}
          </div>
        </div>

        <p class="muted small">
          The absence of immediate risks does not preclude future degradation and should be reviewed periodically as part of responsible asset management.
        </p>
      </section>

      <!-- RECOMMENDED -->
      <section class="section" id="recommended">
        <h2>Monitoring &amp; Planned Action Items</h2>

        <div class="bucket amber">
          <div class="bucket-head">
            <span>🟠 Items Requiring Monitoring or Planned Attention</span>
            <span class="mono">Priority: RECOMMENDED_0_3_MONTHS</span>
          </div>
          <div class="bucket-body">
            <!-- REQUIRED PLACEHOLDER -->
            {{RECOMMENDED_FINDINGS}}
          </div>
        </div>
      </section>

      <!-- PLAN / MONITOR -->
      <section class="section" id="plan">
        <h2>Items Not Requiring Action</h2>

        <div class="bucket green">
          <div class="bucket-head">
            <span>🟢 Items Not Requiring Action at This Time</span>
            <span class="mono">Priority: PLAN_MONITOR</span>
          </div>
          <div class="bucket-body">
            <!-- REQUIRED PLACEHOLDER -->
            {{PLAN_MONITOR_FINDINGS}}
          </div>
        </div>
      </section>

      <!-- OBSERVATIONS -->
      <section class="section" id="observations">
        <h2>General Observations</h2>

        <h3>Installation Context</h3>
        <ul>
          <li>Electrical installation appears consistent with the construction and renovation era of the property.</li>
          <li>Partial upgrades suggest staged improvements over time.</li>
          <li>No evidence of unsafe owner-performed modifications observed unless explicitly documented.</li>
        </ul>

        <h3>Operational Context</h3>
        <ul>
          <li>Electrical demand appears aligned with current occupancy profile under normal use.</li>
          <li>No abnormal load behaviour noted during inspection unless explicitly documented.</li>
        </ul>

        <p class="muted">{{GENERAL_OBSERVATIONS_NOTES}}</p>
      </section>

      <!-- CAPITAL PLANNING (optional block - can be removed) -->
      <section class="section" id="capital">
        <h2>Capital Planning &amp; Budget Considerations (0–5 Years)</h2>
        <p class="muted">
          This section provides indicative market benchmarks to support budgeting and financial planning. Figures are estimates only and do not constitute quotations.
        </p>

        {{CAPITAL_PLANNING_TABLE}}
      </section>

      <!-- NEXT STEPS -->
      <section class="section" id="next">
        <h2>Investor Options &amp; Next Steps</h2>

        <ul>
          <li>Retain this report for reference and take no action at this time.</li>
          <li>Engage a licensed electrical contractor of choice for works, if desired.</li>
          <li>Integrate findings into future renovation or asset planning.</li>
          <li>Schedule periodic reassessments to track condition over time.</li>
        </ul>

        <p class="muted">
          All decisions remain entirely at the Client's discretion.
        </p>
      </section>

      <!-- APPENDIX -->
      <section class="section" id="appendix">
        <h2>Appendix – Test Results Summary</h2>

        <p class="muted">
          Test results represent conditions at the time of inspection only and may vary with future system changes.
        </p>

        {{TEST_RESULTS_SUMMARY}}
      </section>

      <!-- TERMS -->
      <section class="section" id="terms">
        <h2>Terms &amp; Conditions of Assessment</h2>

        <ol>
          <li><b>Australian Consumer Law (ACL).</b> Nothing in this report excludes statutory consumer guarantees where prohibited by law.</li>
          <li><b>Scope of Opinion.</b> Point-in-time, non-destructive, visual/functional review of accessible components only. Non-intrusive and non-exhaustive.</li>
          <li><b>Exclusive Reliance.</b> Prepared for the named Client. Third-party reliance requires written consent.</li>
          <li><b>Limitation of Liability.</b> To the extent permitted by law, liability is limited for circumstances outside scope or beyond intended reliance.</li>
          <li><b>Hazardous Materials.</b> No hazardous material testing undertaken. Suspected asbestos areas are treated cautiously without intrusion.</li>
          <li><b>Statutory Compliance Disclaimer.</b> This is a risk management and decision-support tool only and does not replace statutory compliance inspections.</li>
        </ol>

        <div class="rule"></div>

        <h3>Disclaimer &amp; Liability Boundary</h3>
        <p class="muted">
          This assessment reflects the electrical condition observed at the time of inspection only.
          No guarantee is provided regarding future performance or concealed conditions beyond accessible areas.
          This report does not replace statutory compliance inspections or certification requirements.
        </p>
      </section>

      <footer class="footer">
        <div>
          <b>Better Home Technology Pty Ltd</b> · Adelaide, SA ·
          <span class="mono">Report ID: {{INSPECTION_ID}}</span>
        </div>
        <div class="muted">
          Template file: <span class="mono">report-template.html</span> · You may modify styles and wording at any time.
        </div>
      </footer>

    </div>
  </div>
</body>
</html>`;

// Default report template (simple fallback - should not be used if file loading works)
const DEFAULT_REPORT_TEMPLATE = FULL_REPORT_TEMPLATE;

function loadReportTemplate(): string {
  // Build list of possible paths to try
  const cwd = process.cwd();
  const possiblePaths: string[] = [];
  
  // Try to get __dirname if available (for ES modules)
  let libDir: string | undefined;
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      libDir = path.dirname(fileURLToPath(import.meta.url));
      // Add paths relative to lib directory
      possiblePaths.push(path.join(libDir, "report-template.html"));
      possiblePaths.push(path.join(libDir, "..", "report-template.html"));
    }
  } catch (e) {
    console.warn("Could not use import.meta.url:", e);
  }
  
  // Add paths relative to current working directory
  if (cwd) {
    possiblePaths.push(path.join(cwd, "netlify", "functions", "report-template.html"));
    possiblePaths.push(path.join(cwd, "report-template.html"));
    possiblePaths.push(path.join(cwd, "report-template-paged.html")); // Try paged version
    possiblePaths.push(path.join(cwd, "..", "report-template.html"));
  }
  
  // Add absolute path fallbacks
  possiblePaths.push("/opt/build/repo/netlify/functions/report-template.html");
  possiblePaths.push("/opt/build/repo/report-template.html");
  possiblePaths.push("/opt/build/repo/report-template-paged.html");
  
  console.log("Loading report template...");
  console.log("process.cwd():", cwd);
  console.log("libDir:", libDir);
  console.log("Will try", possiblePaths.length, "paths");
  
  for (const templatePath of possiblePaths) {
    try {
      // Validate path before using it
      if (!templatePath || typeof templatePath !== "string" || templatePath.includes("undefined")) {
        console.log("Skipping invalid path:", templatePath);
        continue;
      }
      
      console.log("Trying to load template from:", templatePath);
      if (fs.existsSync(templatePath)) {
        const content = fs.readFileSync(templatePath, "utf-8");
        console.log("✅ Successfully loaded template from:", templatePath);
        console.log("Template length:", content.length, "characters");
        
        // Verify it's the correct template (not the default)
        if (content.includes("Electrical Property Health Assessment") && content.length > 10000) {
          // Check if it has pagination rules
          const hasPageBreak = content.includes("page-break") || content.includes("break-before: page");
          const hasAvoidBreak = content.includes("avoid-break") || content.includes("break-inside: avoid");
          console.log("✅ Template verified:", {
            length: content.length,
            hasPageBreak,
            hasAvoidBreak
          });
          return content;
        } else {
          console.warn("⚠️ Template loaded but seems incorrect (too short or missing expected content)");
          console.warn("Template length:", content.length, "Expected: >10000");
          console.warn("Has expected content:", content.includes("Electrical Property Health Assessment"));
        }
      } else {
        console.log("❌ Template not found at:", templatePath);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.warn(`❌ Failed to load template from ${templatePath}:`, errorMsg);
      continue;
    }
  }
  
  console.error("❌ Could not load report template from any path, using embedded template");
  console.error("Tried", possiblePaths.length, "paths");
  console.error("Current working directory:", cwd);
  console.warn("⚠️ Using FULL_REPORT_TEMPLATE (embedded template - this is the complete template)");
  return FULL_REPORT_TEMPLATE;
}

// Helper to extract value from Answer object
function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    const answerValue = (v as { value: unknown }).value;
    if (typeof answerValue === "object" && answerValue !== null && "value" in (answerValue as object)) {
      return extractValue(answerValue);
    }
    return answerValue;
  }
  return undefined;
}

export function buildReportHtml(
  findings: Array<{ id: string; priority: string; title?: string }>,
  limitations: string[],
  inspectionId?: string,
  raw?: Record<string, unknown>,
  enhancedTexts?: {
    executiveSummary?: string;
    riskRatingFactors?: string;
    findings?: {
      immediate?: string[];
      recommended?: string[];
      plan?: string[];
    };
    limitations?: string[];
  }
): string {
  const imm = findings.filter((f) => f.priority === "IMMEDIATE");
  const rec = findings.filter((f) => f.priority === "RECOMMENDED_0_3_MONTHS");
  const plan = findings.filter((f) => f.priority === "PLAN_MONITOR");

  // Load template
  const template = loadReportTemplate();

  // Build findings HTML - use AI-enhanced versions if available
  const buildFindingsHtml = (
    items: Array<{ id: string; priority: string; title?: string }>,
    enhancedItems?: string[]
  ) => {
    if (items.length === 0) {
      return '<li style="color: #999; font-style: italic;">None</li>';
    }
    return items.map((f, index) => {
      // Use AI-enhanced text if available, otherwise use original
      const displayText = enhancedItems && enhancedItems[index]
        ? enhancedItems[index]
        : (f.title ?? f.id.replace(/_/g, " "));
      return `<li>${displayText}</li>`;
    }).join("");
  };

  const immediateHtml = buildFindingsHtml(imm, enhancedTexts?.findings?.immediate);
  const recommendedHtml = buildFindingsHtml(rec, enhancedTexts?.findings?.recommended);
  const planHtml = buildFindingsHtml(plan, enhancedTexts?.findings?.plan);

  // Extract data from raw for template placeholders
  const now = new Date();
  const assessmentDate = raw?.created_at 
    ? new Date(raw.created_at as string).toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" })
    : now.toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" });

  const jobData = raw?.job as Record<string, unknown> | undefined;
  const signoffData = raw?.signoff as Record<string, unknown> | undefined;
  
  const preparedFor = extractValue(jobData?.address) as string || "Client";
  const preparedBy = extractValue(signoffData?.technician_name) as string || "Electrical Inspector";
  const propertyType = extractValue(jobData?.property_type) as string || "Residential Property";
  const reportVersion = "1.0";

  // Determine overall status and risk rating
  const hasImmediate = imm.length > 0;
  const hasRecommended = rec.length > 0;
  let overallStatusBadge = '<span class="pill green">Low Risk</span>';
  let riskRatingBadge = "Low";
  let riskRatingFactorsText = enhancedTexts?.riskRatingFactors;
  if (!riskRatingFactorsText) {
    riskRatingFactorsText = "No immediate safety concerns identified";
    if (hasImmediate) {
      riskRatingFactorsText = `${imm.length} immediate safety concern${imm.length > 1 ? "s" : ""} requiring urgent attention`;
    } else if (hasRecommended) {
      riskRatingFactorsText = `${rec.length} item${rec.length > 1 ? "s" : ""} requiring monitoring or planned attention`;
    }
  }
  let riskRatingFactors = `<li>${riskRatingFactorsText}</li>`;
  
  if (hasImmediate) {
    overallStatusBadge = '<span class="pill red">High Risk</span>';
    riskRatingBadge = "High";
  } else if (hasRecommended) {
    overallStatusBadge = '<span class="pill amber">Moderate Risk</span>';
    riskRatingBadge = "Moderate";
  }

  // Executive summary paragraph - use AI-enhanced version if available
  let executiveSummaryParagraph = enhancedTexts?.executiveSummary;
  if (!executiveSummaryParagraph) {
    executiveSummaryParagraph = "The electrical installation presents a generally acceptable condition with no immediate safety concerns.";
    if (hasImmediate) {
      executiveSummaryParagraph = `This assessment identified ${imm.length} immediate safety concern${imm.length > 1 ? "s" : ""} that require${imm.length === 1 ? "s" : ""} urgent attention. These items should be addressed promptly to ensure safe operation.`;
    } else if (hasRecommended) {
      executiveSummaryParagraph = `The electrical installation is in acceptable condition with ${rec.length} item${rec.length > 1 ? "s" : ""} identified for monitoring or planned attention within the next 0-3 months.`;
    }
  }

  // Build limitations section HTML - use AI-enhanced versions if available
  let limitationsHtml = "";
  const enhancedLimitations = enhancedTexts?.limitations || limitations;
  if (enhancedLimitations.length > 0) {
    limitationsHtml = enhancedLimitations.map((s) => `<li>${s}</li>`).join("");
  } else {
    limitationsHtml = '<li>No specific limitations beyond standard non-invasive assessment scope.</li>';
  }

  // Priority descriptions
  const priorityImmediateDesc = hasImmediate 
    ? `${imm.length} item${imm.length > 1 ? "s" : ""} requiring urgent attention`
    : "None identified";
  const priorityImmediateInterp = hasImmediate
    ? "Address promptly to ensure safe operation"
    : "No immediate action required";
  
  const priorityRecommendedDesc = hasRecommended
    ? `${rec.length} item${rec.length > 1 ? "s" : ""} for monitoring or planned attention`
    : "None identified";
  const priorityRecommendedInterp = hasRecommended
    ? "Plan for attention within 0-3 months"
    : "No planned action required";
  
  const priorityPlanDesc = plan.length > 0
    ? `${plan.length} item${plan.length > 1 ? "s" : ""} not requiring action`
    : "None identified";
  const priorityPlanInterp = "Acceptable condition, monitor as part of routine maintenance";

  // General observations
  const generalObservationsNotes = "Observations are based on accessible and visible components only. Concealed wiring and inaccessible areas are excluded from this assessment.";

  // Test results summary (placeholder - can be enhanced with actual test data)
  const testResultsSummary = "<p class=\"muted\">Test results summary will be populated based on inspection data.</p>";

  // Capital planning table (placeholder)
  const capitalPlanningTable = "<p class=\"muted\">Capital planning information will be populated based on inspection findings.</p>";

  // Replace all placeholders
  let html = template
    .replace(/\{\{INSPECTION_ID\}\}/g, inspectionId || "N/A")
    .replace(/\{\{ASSESSMENT_DATE\}\}/g, assessmentDate)
    .replace(/\{\{PREPARED_FOR\}\}/g, preparedFor)
    .replace(/\{\{PREPARED_BY\}\}/g, preparedBy)
    .replace(/\{\{PROPERTY_TYPE\}\}/g, propertyType)
    .replace(/\{\{REPORT_VERSION\}\}/g, reportVersion)
    .replace(/\{\{OVERALL_STATUS_BADGE\}\}/g, overallStatusBadge)
    .replace(/\{\{EXECUTIVE_SUMMARY_PARAGRAPH\}\}/g, executiveSummaryParagraph)
    .replace(/\{\{PRIORITY_IMMEDIATE_DESC\}\}/g, priorityImmediateDesc)
    .replace(/\{\{PRIORITY_IMMEDIATE_INTERP\}\}/g, priorityImmediateInterp)
    .replace(/\{\{PRIORITY_RECOMMENDED_DESC\}\}/g, priorityRecommendedDesc)
    .replace(/\{\{PRIORITY_RECOMMENDED_INTERP\}\}/g, priorityRecommendedInterp)
    .replace(/\{\{PRIORITY_PLAN_DESC\}\}/g, priorityPlanDesc)
    .replace(/\{\{PRIORITY_PLAN_INTERP\}\}/g, priorityPlanInterp)
    .replace(/\{\{RISK_RATING_BADGE\}\}/g, riskRatingBadge)
    .replace(/\{\{RISK_RATING_FACTORS\}\}/g, riskRatingFactors)
    .replace(/\{\{IMMEDIATE_FINDINGS\}\}/g, immediateHtml)
    .replace(/\{\{RECOMMENDED_FINDINGS\}\}/g, recommendedHtml)
    .replace(/\{\{PLAN_MONITOR_FINDINGS\}\}/g, planHtml)
    .replace(/\{\{LIMITATIONS_SECTION\}\}/g, limitationsHtml)
    .replace(/\{\{GENERAL_OBSERVATIONS_NOTES\}\}/g, generalObservationsNotes)
    .replace(/\{\{TEST_RESULTS_SUMMARY\}\}/g, testResultsSummary)
    .replace(/\{\{CAPITAL_PLANNING_TABLE\}\}/g, capitalPlanningTable);

  return html;
}
