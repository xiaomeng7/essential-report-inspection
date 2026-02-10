/**
 * Seed finding_messages table from responses.yml (and optionally finding_profiles.yml) for en-AU and zh-CN.
 * - Maps responses.yml findings to finding_messages (finding_id, lang='en-AU').
 * - Optionally maps finding_profiles.yml messaging fields for zh-CN if they exist.
 * - observed_condition stored as JSONB array.
 * - Preserves manual edits: if status='published' and updated_by != 'seed', skip unless --force.
 * - Uses upsert with status='published' for initial seed.
 * - Tracks seed_version in version column.
 * Usage: NEON_DATABASE_URL in .env, then npm run db:seed:messages [--force]
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

const force = process.argv.includes("--force");

type ResponsesDoc = { findings?: Record<string, Record<string, unknown>> };
type ProfilesDoc = { finding_profiles?: Record<string, Record<string, unknown>> };

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
  let profiles: ProfilesDoc = {};
  try {
    profiles = loadYaml<ProfilesDoc>("profiles/finding_profiles.yml");
  } catch (e) {
    console.warn("[db-seed:messages] finding_profiles.yml not found, skipping zh-CN fields");
  }

  const findingIds = Object.keys(responses);
  console.log("[db-seed:messages] YAML finding count:", findingIds.length, "seed_version:", seedVersion);
  if (force) {
    console.warn("[db-seed:messages] --force flag enabled: will overwrite manual edits");
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  let total = 0;
  let inserted = 0;
  let updated = 0;
  let skippedManual = 0;
  let skippedExisting = 0;
  let missingFieldsCount = 0;

  for (const finding_id of findingIds) {
    total++;
    const resp = responses[finding_id] ?? {};
    const prof = profiles.finding_profiles?.[finding_id] ?? {};
    const msg = (prof.messaging as Record<string, unknown>) ?? {};

    // Process en-AU (from responses.yml)
    const langEn = "en-AU";
    const titleEn = nonEmpty(resp.title) ?? nonEmpty(msg.title);
    const observed_conditionEn = toJsonbArray(resp.observed_condition);
    const why_it_mattersEn = nonEmpty(resp.why_it_matters) ?? nonEmpty(msg.why_it_matters);
    const recommended_actionEn = nonEmpty(resp.recommended_action);
    const planning_guidanceEn = nonEmpty(resp.planning_guidance) ?? nonEmpty(msg.planning_guidance);
    const priority_rationaleEn = nonEmpty(resp.priority_rationale);
    const risk_interpretationEn = nonEmpty(resp.risk_interpretation);
    const disclaimer_lineEn = nonEmpty(resp.disclaimer_line);
    const sourceEn = "seed:responses.yml";

    // Count missing fields
    const missingFields = [
      !titleEn && "title",
      !why_it_mattersEn && "why_it_matters",
      !recommended_actionEn && "recommended_action",
      !planning_guidanceEn && "planning_guidance",
    ].filter(Boolean).length;
    if (missingFields > 0) missingFieldsCount += missingFields;

    try {
      // Check if existing published row with manual edits
      const existingCheck = await client.query(
        `SELECT updated_by FROM finding_messages 
         WHERE finding_id = $1 AND lang = $2 AND status = 'published'`,
        [finding_id, langEn]
      );

      if (existingCheck.rows.length > 0) {
        const existing = existingCheck.rows[0];
        if (existing.updated_by && existing.updated_by !== "seed" && !force) {
          skippedManual++;
          continue;
        }
      }

      // Upsert en-AU
      const existedBefore = existingCheck.rows.length > 0;
      const result = await client.query(
        `INSERT INTO finding_messages (
          finding_id, lang, title, observed_condition, why_it_matters, recommended_action,
          planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, source, status, version, updated_by, updated_at
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, 'published', $12, 'seed', now())
        ON CONFLICT (finding_id, lang, status) DO UPDATE SET
          title = COALESCE(EXCLUDED.title, finding_messages.title),
          observed_condition = COALESCE(EXCLUDED.observed_condition, finding_messages.observed_condition),
          why_it_matters = COALESCE(EXCLUDED.why_it_matters, finding_messages.why_it_matters),
          recommended_action = COALESCE(EXCLUDED.recommended_action, finding_messages.recommended_action),
          planning_guidance = COALESCE(EXCLUDED.planning_guidance, finding_messages.planning_guidance),
          priority_rationale = COALESCE(EXCLUDED.priority_rationale, finding_messages.priority_rationale),
          risk_interpretation = COALESCE(EXCLUDED.risk_interpretation, finding_messages.risk_interpretation),
          disclaimer_line = COALESCE(EXCLUDED.disclaimer_line, finding_messages.disclaimer_line),
          source = EXCLUDED.source,
          version = EXCLUDED.version,
          updated_by = CASE WHEN finding_messages.updated_by = 'seed' OR $13 THEN 'seed' ELSE finding_messages.updated_by END,
          updated_at = now()`,
        [
          finding_id,
          langEn,
          titleEn,
          JSON.stringify(observed_conditionEn),
          why_it_mattersEn,
          recommended_actionEn,
          planning_guidanceEn,
          priority_rationaleEn,
          risk_interpretationEn,
          disclaimer_lineEn,
          sourceEn,
          seedVersion,
          force,
        ]
      );

      if (result.rowCount && result.rowCount > 0) {
        if (existedBefore) {
          updated++;
        } else {
          inserted++;
        }
      } else {
        skippedExisting++;
      }
    } catch (e) {
      console.error("[db-seed:messages] error", finding_id, langEn, e);
    }

    // Process zh-CN if available (from finding_profiles.yml messaging fields)
    const titleZh = nonEmpty(msg.title_zh);
    const why_it_mattersZh = nonEmpty(msg.why_it_matters_zh);
    const recommended_actionZh = nonEmpty(msg.recommended_action_zh);
    const planning_guidanceZh = nonEmpty(msg.planning_guidance_zh);

    // Only insert zh-CN if at least one field exists
    if (titleZh || why_it_mattersZh || recommended_actionZh || planning_guidanceZh) {
      const langZh = "zh-CN";
      const sourceZh = "seed:finding_profiles.yml";

      try {
        // Check if existing published row with manual edits
        const existingCheckZh = await client.query(
          `SELECT updated_by FROM finding_messages 
           WHERE finding_id = $1 AND lang = $2 AND status = 'published'`,
          [finding_id, langZh]
        );

        if (existingCheckZh.rows.length > 0) {
          const existing = existingCheckZh.rows[0];
          if (existing.updated_by && existing.updated_by !== "seed" && !force) {
            skippedManual++;
            // Skip zh-CN for this finding, but continue with next finding
            continue;
          }
        }

        // Upsert zh-CN
        const existedBeforeZh = existingCheckZh.rows.length > 0;
        const resultZh = await client.query(
          `INSERT INTO finding_messages (
            finding_id, lang, title, observed_condition, why_it_matters, recommended_action,
            planning_guidance, priority_rationale, risk_interpretation, disclaimer_line, source, status, version, updated_by, updated_at
          ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, 'published', $12, 'seed', now())
          ON CONFLICT (finding_id, lang, status) DO UPDATE SET
            title = COALESCE(EXCLUDED.title, finding_messages.title),
            observed_condition = COALESCE(EXCLUDED.observed_condition, finding_messages.observed_condition),
            why_it_matters = COALESCE(EXCLUDED.why_it_matters, finding_messages.why_it_matters),
            recommended_action = COALESCE(EXCLUDED.recommended_action, finding_messages.recommended_action),
            planning_guidance = COALESCE(EXCLUDED.planning_guidance, finding_messages.planning_guidance),
            priority_rationale = COALESCE(EXCLUDED.priority_rationale, finding_messages.priority_rationale),
            risk_interpretation = COALESCE(EXCLUDED.risk_interpretation, finding_messages.risk_interpretation),
            disclaimer_line = COALESCE(EXCLUDED.disclaimer_line, finding_messages.disclaimer_line),
            source = EXCLUDED.source,
            version = EXCLUDED.version,
            updated_by = CASE WHEN finding_messages.updated_by = 'seed' OR $13 THEN 'seed' ELSE finding_messages.updated_by END,
            updated_at = now()`,
          [
            finding_id,
            langZh,
            titleZh,
            JSON.stringify([]), // zh-CN doesn't have observed_condition in profiles
            why_it_mattersZh,
            recommended_actionZh,
            planning_guidanceZh,
            null, // priority_rationale not in profiles
            null, // risk_interpretation not in profiles
            null, // disclaimer_line not in profiles
            sourceZh,
            seedVersion,
            force,
          ]
        );

        if (resultZh.rowCount && resultZh.rowCount > 0) {
          if (existedBeforeZh) {
            updated++;
          } else {
            inserted++;
          }
        } else {
          skippedExisting++;
        }
      } catch (e) {
        console.error("[db-seed:messages] error", finding_id, langZh, e);
      }
    }
  }

  await client.end();
  console.log("[db-seed:messages] Summary:");
  console.log("  Total findings processed:", total);
  console.log("  Inserted:", inserted);
  console.log("  Updated:", updated);
  console.log("  Skipped (existing, seed):", skippedExisting);
  console.log("  Skipped (manual edits, use --force to overwrite):", skippedManual);
  console.log("  Missing fields count:", missingFieldsCount);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
