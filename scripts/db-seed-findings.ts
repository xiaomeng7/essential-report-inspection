/**
 * Seed finding_definitions and finding_dimensions_seed (003 schema).
 * - Auto-classify system_group/space_group/tags via classifyFinding(); if existing row.source='manual', do not overwrite classification.
 * - Upsert copy (title, why_it_matters, recommended_action, planning_guidance) only when DB fields are null/empty (from responses.yml + profiles).
 * - Upsert finding_dimensions_seed with seed_version (env SEED_VERSION or GIT_SHA or '1').
 * Usage: NEON_DATABASE_URL in .env, then npm run db:seed
 */
import path from "path";
import fs from "fs";
import { config as loadDotenv } from "dotenv";
import yaml from "js-yaml";
import { Client } from "pg";
import { classifyFinding } from "../netlify/functions/lib/findingClassification";

const projectRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(projectRoot, ".env") });

const url = process.env.NEON_DATABASE_URL;
if (!url || !url.trim()) {
  console.error("NEON_DATABASE_URL is not set. Set it in .env and retry.");
  process.exit(1);
}

const seedVersion =
  process.env.SEED_VERSION ||
  process.env.GIT_SHA ||
  (() => {
    try {
      return require("child_process").execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    } catch {
      return "1";
    }
  })();

type ProfilesDoc = { finding_profiles?: Record<string, Record<string, unknown>> };
type ResponsesDoc = { findings?: Record<string, Record<string, unknown>> };

function loadYaml<T>(relativePath: string): T {
  const full = path.join(projectRoot, relativePath);
  const alt = path.join(projectRoot, "netlify", "functions", path.basename(relativePath));
  const p = fs.existsSync(full) ? full : alt;
  if (!fs.existsSync(p)) throw new Error(`Missing ${relativePath}`);
  return yaml.load(fs.readFileSync(p, "utf8")) as T;
}

function nonEmpty(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

function numOrNull(n: unknown): number | null {
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

async function run() {
  const profiles = loadYaml<ProfilesDoc>("profiles/finding_profiles.yml").finding_profiles ?? {};
  const responses = loadYaml<ResponsesDoc>("responses.yml").findings ?? {};
  const findingIds = Object.keys(profiles);
  console.log("[db-seed] YAML finding count:", findingIds.length, "seed_version:", seedVersion);

  const client = new Client({ connectionString: url });
  await client.connect();

  let defsUpserted = 0;
  let seedUpserted = 0;

  for (const finding_id of findingIds) {
    const prof = profiles[finding_id] ?? {};
    const resp = responses[finding_id] ?? {};
    const msg = (prof.messaging as Record<string, unknown>) ?? {};
    const risk = (prof.risk as Record<string, unknown>) ?? {};
    const budgetRange =
      (prof.budgetary_range as Record<string, unknown>) ??
      (resp.budgetary_range as Record<string, unknown>) ??
      {};

    const classification = classifyFinding(finding_id);
    const title = nonEmpty(resp.title) ?? nonEmpty(msg.title) ?? finding_id.replace(/_/g, " ");
    const why_it_matters = nonEmpty(resp.why_it_matters) ?? nonEmpty(msg.why_it_matters);
    const recommended_action = nonEmpty(resp.recommended_action);
    const planning_guidance = nonEmpty(resp.planning_guidance) ?? nonEmpty(msg.planning_guidance);

    const safety = nonEmpty(risk.safety) ?? "MODERATE";
    const urgency = nonEmpty(prof.urgency as string) ?? "LONG_TERM";
    const liability = nonEmpty(risk.compliance) ?? nonEmpty(prof.liability as string) ?? "LOW";
    const priority =
      nonEmpty(prof.default_priority as string) ?? nonEmpty(resp.default_priority as string) ?? "PLAN_MONITOR";
    const severity = Math.min(5, Math.max(1, numOrNull(prof.risk_severity) ?? numOrNull(resp.risk_severity) ?? 2));
    const likelihood = Math.min(5, Math.max(1, numOrNull(prof.likelihood) ?? 2));
    const escalation = nonEmpty(risk.escalation) ?? "LOW";
    const budget_low = numOrNull(budgetRange.low);
    const budget_high = numOrNull(budgetRange.high);

    try {
      await client.query(
        `INSERT INTO finding_definitions (
          finding_id, system_group, space_group, tags, title, why_it_matters, recommended_action, planning_guidance, source, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'seed', now())
        ON CONFLICT (finding_id) DO UPDATE SET
          system_group = CASE WHEN finding_definitions.source = 'manual' THEN finding_definitions.system_group ELSE EXCLUDED.system_group END,
          space_group = CASE WHEN finding_definitions.source = 'manual' THEN finding_definitions.space_group ELSE EXCLUDED.space_group END,
          tags = CASE WHEN finding_definitions.source = 'manual' THEN finding_definitions.tags ELSE EXCLUDED.tags END,
          title = COALESCE(NULLIF(TRIM(finding_definitions.title), ''), EXCLUDED.title),
          why_it_matters = COALESCE(NULLIF(TRIM(finding_definitions.why_it_matters), ''), EXCLUDED.why_it_matters),
          recommended_action = COALESCE(NULLIF(TRIM(finding_definitions.recommended_action), ''), EXCLUDED.recommended_action),
          planning_guidance = COALESCE(NULLIF(TRIM(finding_definitions.planning_guidance), ''), EXCLUDED.planning_guidance),
          updated_at = now()`,
        [
          finding_id,
          classification.system_group,
          classification.space_group,
          classification.tags,
          title,
          why_it_matters,
          recommended_action,
          planning_guidance,
        ]
      );
      defsUpserted += 1;
    } catch (e) {
      console.error("[db-seed] finding_definitions error", finding_id, e);
    }

    try {
      await client.query(
        `INSERT INTO finding_dimensions_seed (
          finding_id, safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation, seed_version, seeded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
        ON CONFLICT (finding_id) DO UPDATE SET
          safety = EXCLUDED.safety, urgency = EXCLUDED.urgency, liability = EXCLUDED.liability,
          budget_low = EXCLUDED.budget_low, budget_high = EXCLUDED.budget_high,
          priority = EXCLUDED.priority, severity = EXCLUDED.severity, likelihood = EXCLUDED.likelihood, escalation = EXCLUDED.escalation,
          seed_version = EXCLUDED.seed_version, seeded_at = now()`,
        [
          finding_id,
          safety,
          urgency,
          liability,
          budget_low,
          budget_high,
          priority,
          severity,
          likelihood,
          escalation,
          seedVersion,
        ]
      );
      seedUpserted += 1;
    } catch (e) {
      console.error("[db-seed] finding_dimensions_seed error", finding_id, e);
    }
  }

  await client.end();
  console.log("[db-seed] finding_definitions upserted:", defsUpserted);
  console.log("[db-seed] finding_dimensions_seed upserted:", seedUpserted);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
