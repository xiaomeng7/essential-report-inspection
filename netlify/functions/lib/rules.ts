import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

// In Netlify Functions, we need to find rules.yml
// Try multiple possible locations
function findRulesPath(): string {
  // Get the directory of this file (ES modules compatible)
  let currentDir: string;
  try {
    const __filename = fileURLToPath(import.meta.url);
    currentDir = path.dirname(__filename);
  } catch {
    // Fallback if import.meta.url is not available
    currentDir = process.cwd();
  }
  
  // In Netlify Functions, files are in /var/task
  // We copy rules.yml to netlify/functions/ during build
  // Try different possible locations
  const possiblePaths = [
    path.join(currentDir, "rules.yml"),              // Same directory as this file
    path.join(currentDir, "..", "rules.yml"),        // Parent directory (functions/)
    path.join(currentDir, "../..", "rules.yml"),     // Two levels up (project root)
    path.join(process.cwd(), "rules.yml"),            // Current working directory (usually /var/task in Netlify)
    "/var/task/rules.yml",                           // Netlify Functions default location
    path.join(process.cwd(), "..", "rules.yml"),      // One level up from cwd
    path.join(process.cwd(), "../..", "rules.yml"),  // Two levels up from cwd
  ];
  
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        console.log("Found rules.yml at:", p);
        return p;
      }
    } catch {
      // Continue searching
    }
  }
  
  // If not found, return the most likely path for error message
  console.error("Could not find rules.yml in any of these locations:", possiblePaths);
  console.error("Current file directory:", currentDir);
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

function loadRules(): Rules {
  if (rulesCache) return rulesCache;
  try {
    const actualPath = findRulesPath();
    console.log("Loading rules from:", actualPath);
    console.log("Current working directory:", process.cwd());
    
    if (!fs.existsSync(actualPath)) {
      // List files in possible directories for debugging
      try {
        console.log("Files in current directory:", fs.readdirSync(process.cwd()));
      } catch (e) {
        console.error("Cannot read current directory:", e);
      }
      try {
        const parentDir = path.join(process.cwd(), "..");
        console.log("Files in parent directory:", fs.readdirSync(parentDir));
      } catch (e) {
        console.error("Cannot read parent directory:", e);
      }
      
      throw new Error(`rules.yml not found at ${actualPath}`);
    }
    
    const raw = fs.readFileSync(actualPath, "utf8");
    rulesCache = yaml.load(raw) as Rules;
    console.log("Rules loaded successfully");
    return rulesCache!;
  } catch (e) {
    console.error("Error loading rules.yml:", e);
    throw new Error(`Failed to load rules.yml: ${e instanceof Error ? e.message : String(e)}`);
  }
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
          setAtPath(out, path, (v as { value: unknown }).value);
        } else {
          walk(v, path);
        }
      }
    }
  };
  walk(raw, "");
  return out;
}

function factsToFindings(facts: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const r = loadRules();
  const findings = r.findings ?? {};

  if (getAt(facts, "switchboard.asbestos_suspected") === "yes") ids.push("ASBESTOS_RISK");
  if (getAt(facts, "switchboard.signs_of_overheating") === "yes") ids.push("THERMAL_STRESS_ACTIVE");
  if (getAt(facts, "switchboard.burn_marks_or_carbon") === "yes") ids.push("ARCING_EVIDENCE_PRESENT");
  if (getAt(facts, "switchboard.water_ingress") === "yes") ids.push("MATERIAL_DEGRADATION");
  if (getAt(facts, "earthing.men_link_confirmed") === "no") ids.push("MEN_NOT_VERIFIED");
  if (getAt(facts, "earthing.main_earth_conductor_intact") === "no") ids.push("EARTH_DEGRADED");
  if (getAt(facts, "switchboard.board_at_capacity") === "yes") ids.push("BOARD_AT_CAPACITY");
  if (getAt(facts, "switchboard.spare_ways_available") === "no") ids.push("NO_EXPANSION_MARGIN");
  if (getAt(facts, "switchboard.labelling_quality") === "poor") ids.push("LABELING_POOR");
  if (getAt(facts, "switchboard.non_standard_or_diy_observed") === "yes") ids.push("NON_STANDARD_WORK");

  const rcdPerformed = getAt(facts, "rcd_tests.performed") === true;
  const rcdFail = Number(getAt(facts, "rcd_tests.summary.total_fail") ?? 0) > 0;
  if (!rcdPerformed) ids.push("NO_RCD_PROTECTION");
  else if (rcdFail) ids.push("GPO_EARTH_FAULT");

  const gpoWarm = getAt(facts, "gpo_tests.any_warm_loose_damaged") === true;
  if (gpoWarm) ids.push("GPO_MECHANICAL_LOOSE");

  const lighting = getAt(facts, "lighting.issues_observed");
  if (lighting === "heat_damage") ids.push("FITTING_OVERHEAT");
  if (lighting === "flicker") ids.push("SWITCH_ARCING");

  const hasSolar = getAt(facts, "assets.has_solar_pv") === true;
  const hasBattery = getAt(facts, "assets.has_battery") === true;
  const hasEv = getAt(facts, "assets.has_ev_charger") === true;
  const assetsIssues = getAt(facts, "assets.any_issues_observed") === true;
  if (hasBattery && assetsIssues) ids.push("BATTERY_THERMAL");
  if (hasEv && assetsIssues) ids.push("EV_UNSEGREGATED_LOAD");
  if (hasSolar && assetsIssues) ids.push("PV_ISOLATION_UNVERIFIED");

  return [...new Set(ids)];
}

function applyPriority(
  findingId: string,
  meta: { safety: string; urgency: string; liability: string }
): string {
  const r = loadRules();
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

export function evaluateFindings(facts: Record<string, unknown>): Array<{ id: string; priority: string; title?: string }> {
  const r = loadRules();
  const findings = r.findings ?? {};
  const ids = factsToFindings(facts);
  const out: Array<{ id: string; priority: string; title?: string }> = [];
  for (const id of ids) {
    const meta = findings[id];
    if (!meta) continue;
    const priority = applyPriority(id, meta);
    out.push({ id, priority, title: id.replace(/_/g, " ") });
  }
  return out;
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

export function buildReportHtml(
  findings: Array<{ id: string; priority: string; title?: string }>,
  limitations: string[]
): string {
  const imm = findings.filter((f) => f.priority === "IMMEDIATE");
  const rec = findings.filter((f) => f.priority === "RECOMMENDED_0_3_MONTHS");
  const plan = findings.filter((f) => f.priority === "PLAN_MONITOR");

  let html = "<h2>Immediate Attention</h2><ul>";
  if (imm.length) imm.forEach((f) => (html += `<li>${f.title ?? f.id}</li>`));
  else html += "<li>None</li>";
  html += "</ul>";

  html += "<h2>Recommended (0–3 months)</h2><ul>";
  if (rec.length) rec.forEach((f) => (html += `<li>${f.title ?? f.id}</li>`));
  else html += "<li>None</li>";
  html += "</ul>";

  html += "<h2>Plan / Monitor</h2><ul>";
  if (plan.length) plan.forEach((f) => (html += `<li>${f.title ?? f.id}</li>`));
  else html += "<li>None</li>";
  html += "</ul>";

  if (limitations.length) {
    html += "<h2>Limitations</h2><ul>";
    limitations.forEach((s) => (html += `<li>${s}</li>`));
    html += "</ul>";
  }

  return html;
}
