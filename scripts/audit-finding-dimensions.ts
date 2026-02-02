#!/usr/bin/env node
/**
 * Audit all findings for completeness of 7 dimensions:
 * 1. Safety (严重程度) - rules.yml
 * 2. Urgency (紧急程度) - rules.yml
 * 3. Liability (责任) - rules.yml
 * 4. Budget (预计费用) - responses.yml budgetary_range
 * 5. Priority (优先级) - finding_profiles / responses default_priority
 * 6. Severity + Likelihood (评分 1-5) - finding_profiles risk_severity, likelihood
 * 7. Escalation (升级风险) - finding_profiles risk.escalation
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function loadYaml<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content) as T;
}

function loadJson<T>(filePath: string): T {
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content) as T;
}

type RulesYaml = {
  hard_overrides?: Record<string, { safety?: string; urgency?: string; liability?: string } | null>;
  findings?: Record<string, { safety: string; urgency: string; liability: string }>;
};

type FindingProfile = {
  risk?: { safety?: string; compliance?: string; escalation?: string };
  default_priority?: string;
  risk_severity?: number;
  likelihood?: number;
  budget?: string;
  budget_band?: string;
  budget_range?: string;
  messaging?: { title?: string };
};

type ResponsesFinding = {
  budgetary_range?: { low?: number; high?: number };
  default_priority?: string;
};

type ChecklistMap = { mappings: Array<{ finding: string }> };

function collectAllFindingIds(): Set<string> {
  const ids = new Set<string>();

  const mapPath = path.join(ROOT, "CHECKLIST_TO_FINDINGS_MAP.json");
  if (fs.existsSync(mapPath)) {
    const map = loadJson<ChecklistMap>(mapPath);
    for (const m of map.mappings || []) {
      if (m.finding) ids.add(m.finding);
    }
  }

  const rulesPath = path.join(ROOT, "rules.yml");
  if (fs.existsSync(rulesPath)) {
    const rules = loadYaml<RulesYaml>(rulesPath);
    if (rules.hard_overrides) {
      for (const k of Object.keys(rules.hard_overrides)) {
        if (k !== "priority_bucket" && k !== "findings" && rules.hard_overrides[k]) {
          ids.add(k);
        }
      }
    }
    if (rules.findings) {
      for (const k of Object.keys(rules.findings)) ids.add(k);
    }
  }

  const profilesPath = path.join(ROOT, "profiles", "finding_profiles.yml");
  if (fs.existsSync(profilesPath)) {
    const data = loadYaml<{ finding_profiles?: Record<string, unknown> }>(profilesPath);
    if (data.finding_profiles) {
      for (const k of Object.keys(data.finding_profiles)) ids.add(k);
    }
  }

  const responsesPath = path.join(ROOT, "netlify", "functions", "responses.yml");
  if (fs.existsSync(responsesPath)) {
    const data = loadYaml<{ findings?: Record<string, unknown> }>(responsesPath);
    if (data.findings) {
      for (const k of Object.keys(data.findings)) ids.add(k);
    }
  }

  return ids;
}

function audit() {
  const allIds = collectAllFindingIds();
  const rules = fs.existsSync(path.join(ROOT, "rules.yml"))
    ? loadYaml<RulesYaml>(path.join(ROOT, "rules.yml"))
    : ({} as RulesYaml);
  const profilesData = fs.existsSync(path.join(ROOT, "profiles", "finding_profiles.yml"))
    ? loadYaml<{ finding_profiles?: Record<string, FindingProfile> }>(
        path.join(ROOT, "profiles", "finding_profiles.yml")
      )
    : { finding_profiles: {} };
  const responsesData = fs.existsSync(path.join(ROOT, "netlify", "functions", "responses.yml"))
    ? loadYaml<{ findings?: Record<string, ResponsesFinding> }>(
        path.join(ROOT, "netlify", "functions", "responses.yml")
      )
    : { findings: {} };

  const profiles = profilesData.finding_profiles || {};
  const responses = responsesData.findings || {};

  const getRulesEntry = (id: string) => {
    const ho = rules.hard_overrides?.[id];
    if (ho && typeof ho === "object" && ho !== null) return ho;
    return rules.findings?.[id];
  };

  const missing: Array<{ id: string; missing: string[] }> = [];
  const complete: string[] = [];

  for (const id of [...allIds].sort()) {
    const gaps: string[] = [];
    const pf = profiles[id];
    const resp = responses[id];
    const rulesEntry = getRulesEntry(id);

    // 1. Safety (rules OR finding_profiles risk.safety)
    if (!rulesEntry?.safety && !pf?.risk?.safety) {
      gaps.push("Safety");
    }

    // 2. Urgency (rules only - not in finding_profiles)
    if (!rulesEntry?.urgency) {
      gaps.push("Urgency");
    }

    // 3. Liability (rules only)
    if (!rulesEntry?.liability) {
      gaps.push("Liability");
    }

    // 4. Budget (responses budgetary_range with low+high, or finding_profiles budget/budget_band)
    const hasBudget =
      (resp?.budgetary_range?.low != null && resp?.budgetary_range?.high != null) ||
      pf?.budget_band ||
      pf?.budget;
    if (!hasBudget) {
      gaps.push("Budget");
    }

    // 5. Priority (finding_profiles or responses default_priority)
    if (!pf?.default_priority && !resp?.default_priority) {
      gaps.push("Priority");
    }

    // 6. Severity + Likelihood (explicit 1-5 in profile; category defaults used at runtime but we want explicit)
    const hasSeverity = pf?.risk_severity !== undefined && pf.risk_severity !== null;
    const hasLikelihood = pf?.likelihood !== undefined && pf.likelihood !== null;
    if (!hasSeverity || !hasLikelihood) {
      if (!hasSeverity) gaps.push("Severity(1-5)");
      if (!hasLikelihood) gaps.push("Likelihood(1-5)");
    }

    // 7. Escalation (finding_profiles risk.escalation)
    if (!pf?.risk?.escalation) {
      gaps.push("Escalation");
    }

    if (gaps.length > 0) {
      missing.push({ id, missing: gaps });
    } else {
      complete.push(id);
    }
  }

  return { missing, complete, total: allIds.size };
}

const { missing, complete, total } = audit();

console.log("\n=== Finding 7-Dimension Audit ===\n");
console.log(`Total findings: ${total}`);
console.log(`Complete (all 7 dimensions): ${complete.length}`);
console.log(`Missing one or more dimensions: ${missing.length}\n`);

if (missing.length > 0) {
  console.log("--- Findings with MISSING dimensions ---\n");
  for (const { id, missing: gaps } of missing) {
    console.log(`${id}`);
    console.log(`  缺少: ${gaps.join(", ")}\n`);
  }
}

// Output as JSON for programmatic use
const reportPath = path.join(ROOT, "FINDING_DIMENSIONS_AUDIT.json");
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      summary: { total, complete: complete.length, missing: missing.length },
      missing: missing.map((m) => ({ id: m.id, missing: m.missing })),
      complete,
    },
    null,
    2
  ),
  "utf8"
);
console.log(`\nReport saved to: ${reportPath}\n`);
