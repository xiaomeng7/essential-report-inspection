/**
 * Seed finding_messages table from responses.yml.
 * - Maps responses.yml findings to finding_messages (finding_id, lang='en-AU').
 * - observed_condition stored as JSONB array.
 * - Skips existing (finding_id, lang) pairs (no overwrite).
 * Usage: NEON_DATABASE_URL in .env, then npm run db:seed:messages
 */
import path from "path";
import fs from "fs";
import { config as loadDotenv } from "dotenv";
import yaml from "js-yaml";
import { Client } from "pg";

const projectRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(projectRoot, ".env") });

const url = process.env.NEON_DATABASE_URL;
if (!url || !url.trim()) {
  console.error("NEON_DATABASE_URL is not set. Set it in .env and retry.");
  process.exit(1);
}

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

function toJsonbArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? v : String(v)));
  }
  if (value == null) return [];
  return [String(value)];
}

async function run() {
  const responses = loadYaml<ResponsesDoc>("responses.yml").findings ?? {};
  const findingIds = Object.keys(responses);
  console.log("[db-seed:messages] YAML finding count:", findingIds.length);

  const client = new Client({ connectionString: url });
  await client.connect();

  let total = 0;
  let inserted = 0;
  let skippedExisting = 0;

  for (const finding_id of findingIds) {
    total++;
    const resp = responses[finding_id] ?? {};

    const lang = "en-AU";
    const title = nonEmpty(resp.title);
    const observed_condition = toJsonbArray(resp.observed_condition);
    const why_it_matters = nonEmpty(resp.why_it_matters);
    const recommended_action = nonEmpty(resp.recommended_action);
    const planning_guidance = nonEmpty(resp.planning_guidance);
    const priority_rationale = nonEmpty(resp.priority_rationale);
    const risk_interpretation = nonEmpty(resp.risk_interpretation);
    const disclaimer_line = nonEmpty(resp.disclaimer_line);
    const source = "seed:responses.yml";

    try {
      const result = await client.query(
        `INSERT INTO finding_messages (
          finding_id, lang, title, observed_condition, why_it_matters, recommended_action,
          planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, source
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (finding_id, lang) DO NOTHING`,
        [
          finding_id,
          lang,
          title,
          JSON.stringify(observed_condition),
          why_it_matters,
          recommended_action,
          planning_guidance,
          priority_rationale,
          risk_interpretation,
          disclaimer_line,
          source,
        ]
      );
      if (result.rowCount && result.rowCount > 0) {
        inserted++;
      } else {
        skippedExisting++;
      }
    } catch (e) {
      console.error("[db-seed:messages] error", finding_id, e);
    }
  }

  await client.end();
  console.log("[db-seed:messages] Summary:");
  console.log("  Total:", total);
  console.log("  Inserted:", inserted);
  console.log("  Skipped (existing):", skippedExisting);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
