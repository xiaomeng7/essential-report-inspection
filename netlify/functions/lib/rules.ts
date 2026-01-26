import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

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

export function clearRulesCache(): void {
  rulesCache = null;
}

function loadRules(): Rules {
  if (rulesCache) return rulesCache;
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

// Default report template (embedded fallback)
const DEFAULT_REPORT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 3px solid #2c3e50; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #2c3e50; margin: 0; font-size: 28px; }
    .section { margin: 30px 0; }
    .section h2 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 15px; }
    .section li { padding: 10px; margin: 8px 0; background-color: #f8f9fa; border-left: 4px solid #3498db; padding-left: 15px; list-style: none; }
    .priority-IMMEDIATE { border-left-color: #e74c3c; background-color: #ffeaea; }
    .priority-RECOMMENDED_0_3_MONTHS { border-left-color: #f39c12; background-color: #fff8e1; }
    .priority-PLAN_MONITOR { border-left-color: #3498db; background-color: #e3f2fd; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Electrical Safety Inspection Report</h1>
    <div style="color: #7f8c8d; margin-top: 5px;">Inspection ID: {{INSPECTION_ID}}</div>
  </div>
  <div class="section">
    <h2>Immediate Attention Required</h2>
    <ul>{{IMMEDIATE_FINDINGS}}</ul>
  </div>
  <div class="section">
    <h2>Recommended Actions (0-3 months)</h2>
    <ul>{{RECOMMENDED_FINDINGS}}</ul>
  </div>
  <div class="section">
    <h2>Plan / Monitor</h2>
    <ul>{{PLAN_MONITOR_FINDINGS}}</ul>
  </div>
  {{LIMITATIONS_SECTION}}
</body>
</html>`;

function loadReportTemplate(): string {
  try {
    // Try to load from netlify/functions directory (for Netlify deployment)
    const templatePath1 = path.join(process.cwd(), "netlify", "functions", "report-template.html");
    if (fs.existsSync(templatePath1)) {
      return fs.readFileSync(templatePath1, "utf-8");
    }
    // Try to load from project root (for local development)
    const templatePath2 = path.join(process.cwd(), "report-template.html");
    if (fs.existsSync(templatePath2)) {
      return fs.readFileSync(templatePath2, "utf-8");
    }
  } catch (e) {
    console.warn("Could not load report template, using default:", e);
  }
  return DEFAULT_REPORT_TEMPLATE;
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
  raw?: Record<string, unknown>
): string {
  const imm = findings.filter((f) => f.priority === "IMMEDIATE");
  const rec = findings.filter((f) => f.priority === "RECOMMENDED_0_3_MONTHS");
  const plan = findings.filter((f) => f.priority === "PLAN_MONITOR");

  // Load template
  const template = loadReportTemplate();

  // Build findings HTML
  const buildFindingsHtml = (items: Array<{ id: string; priority: string; title?: string }>) => {
    if (items.length === 0) {
      return '<li style="color: #999; font-style: italic;">None</li>';
    }
    return items.map((f) => {
      const displayText = f.title ?? f.id.replace(/_/g, " ");
      return `<li>${displayText}</li>`;
    }).join("");
  };

  const immediateHtml = buildFindingsHtml(imm);
  const recommendedHtml = buildFindingsHtml(rec);
  const planHtml = buildFindingsHtml(plan);

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
  let riskRatingFactors = '<li>No immediate safety concerns identified</li>';
  
  if (hasImmediate) {
    overallStatusBadge = '<span class="pill red">High Risk</span>';
    riskRatingBadge = "High";
    riskRatingFactors = `<li>${imm.length} immediate safety concern${imm.length > 1 ? "s" : ""} requiring urgent attention</li>`;
  } else if (hasRecommended) {
    overallStatusBadge = '<span class="pill amber">Moderate Risk</span>';
    riskRatingBadge = "Moderate";
    riskRatingFactors = `<li>${rec.length} item${rec.length > 1 ? "s" : ""} requiring monitoring or planned attention</li>`;
  }

  // Executive summary paragraph
  let executiveSummaryParagraph = "The electrical installation presents a generally acceptable condition with no immediate safety concerns.";
  if (hasImmediate) {
    executiveSummaryParagraph = `This assessment identified ${imm.length} immediate safety concern${imm.length > 1 ? "s" : ""} that require${imm.length === 1 ? "s" : ""} urgent attention. These items should be addressed promptly to ensure safe operation.`;
  } else if (hasRecommended) {
    executiveSummaryParagraph = `The electrical installation is in acceptable condition with ${rec.length} item${rec.length > 1 ? "s" : ""} identified for monitoring or planned attention within the next 0-3 months.`;
  }

  // Build limitations section HTML
  let limitationsHtml = "";
  if (limitations.length > 0) {
    limitationsHtml = limitations.map((s) => `<li>${s}</li>`).join("");
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
