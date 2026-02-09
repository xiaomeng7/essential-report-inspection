#!/usr/bin/env npx tsx
/**
 * Seed Neon: finding_definitions from finding_profiles.yml + responses.yml;
 * finding_custom_dimensions with one version per finding (safe defaults, needs_review=true).
 * Run after migrations: NEON_DATABASE_URL=<url> npx tsx scripts/seed-neon-findings.ts
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadYaml<T>(relativePath: string): T {
  const full = path.join(root, relativePath);
  const alt = path.join(root, "netlify", "functions", path.basename(relativePath));
  const p = fs.existsSync(full) ? full : alt;
  if (!fs.existsSync(p)) throw new Error(`Missing ${relativePath}`);
  const content = fs.readFileSync(p, "utf8");
  return yaml.load(content) as T;
}

type ProfilesDoc = { finding_profiles?: Record<string, Record<string, unknown>> };
type ResponsesDoc = { findings?: Record<string, Record<string, unknown>> };

function main() {
  const url = process.env.NEON_DATABASE_URL;
  if (!url || !url.startsWith("postgres")) {
    console.error("Set NEON_DATABASE_URL (postgres://...)");
    process.exit(1);
  }

  const profiles = loadYaml<ProfilesDoc>("profiles/finding_profiles.yml").finding_profiles ?? {};
  const responses = loadYaml<ResponsesDoc>("responses.yml").findings ?? {};
  const findingIds = Object.keys(profiles);
  console.log("Finding count:", findingIds.length);

  const sql = neon(url);

  let defsInserted = 0;
  let dimsInserted = 0;

  for (const finding_id of findingIds) {
    const prof = profiles[finding_id] ?? {};
    const resp = responses[finding_id] ?? {};
    const msg = (prof.messaging as Record<string, unknown>) ?? {};
    const title_en = (resp.title as string) ?? (msg.title as string) ?? finding_id.replace(/_/g, " ");
    const why_it_matters_en = (resp.why_it_matters as string) ?? (msg.why_it_matters as string) ?? null;
    const planning_guidance_en = (resp.planning_guidance as string) ?? (msg.planning_guidance as string) ?? null;
    const recommended_action_en = (resp.recommended_action as string) ?? null;
    const category = (prof.category as string) ?? "OTHER";

    try {
      await sql`
        INSERT INTO finding_definitions (
          finding_id, title_en, title_zh, why_it_matters_en, why_it_matters_zh,
          recommended_action_en, recommended_action_zh, planning_guidance_en, planning_guidance_zh,
          system_group, space_group, tags, is_active, updated_at
        ) VALUES (
          ${finding_id}, ${title_en}, null, ${why_it_matters_en}, null,
          ${recommended_action_en}, null, ${planning_guidance_en}, null,
          ${category}, null, ${[] as string[]}, true, now()
        )
        ON CONFLICT (finding_id) DO UPDATE SET
          title_en = EXCLUDED.title_en,
          why_it_matters_en = EXCLUDED.why_it_matters_en,
          recommended_action_en = EXCLUDED.recommended_action_en,
          planning_guidance_en = EXCLUDED.planning_guidance_en,
          system_group = EXCLUDED.system_group,
          updated_at = now()
      `;
      defsInserted++;
    } catch (e) {
      console.error("finding_definitions insert error", finding_id, e);
    }

    const risk = (prof.risk as Record<string, unknown>) ?? {};
    const budgetRange = (prof.budgetary_range as Record<string, unknown>) ?? resp.budgetary_range as Record<string, unknown> ?? {};
    const safety = (risk.safety as string) ?? "MODERATE";
    const urgency = (prof.urgency as string) ?? "LONG_TERM";
    const liability = (risk.compliance as string) ?? (prof.liability as string) ?? "LOW";
    const default_priority = (prof.default_priority as string) ?? (resp.default_priority as string) ?? "PLAN_MONITOR";
    const severity = Math.min(5, Math.max(1, Number(prof.risk_severity ?? resp.risk_severity ?? 2)));
    const likelihood = Math.min(5, Math.max(1, Number(prof.likelihood ?? 2)));
    const escalation = (risk.escalation as string) ?? "LOW";
    const budget_low = Number(budgetRange.low) || null;
    const budget_high = Number(budgetRange.high) || null;

    try {
      const existing = await sql`
        SELECT id FROM finding_custom_dimensions WHERE finding_id = ${finding_id} AND is_active = true
      `;
      if (existing.length > 0) continue;
      const nextVersion = await sql`
        SELECT COALESCE(MAX(version), 0) + 1 as v FROM finding_custom_dimensions WHERE finding_id = ${finding_id}
      `;
      const version = Number((nextVersion[0] as { v: number }).v) || 1;
      await sql`
        INSERT INTO finding_custom_dimensions (
          finding_id, version, is_active,
          safety, urgency, liability, budget_low, budget_high, priority, severity, likelihood, escalation,
          needs_review, updated_by, updated_at
        ) VALUES (
          ${finding_id}, ${version}, true,
          ${safety}, ${urgency}, ${liability}, ${budget_low}, ${budget_high}, ${default_priority}, ${severity}, ${likelihood}, ${escalation},
          true, 'seed', now()
        )
      `;
      dimsInserted++;
    } catch (e) {
      console.error("finding_custom_dimensions insert error", finding_id, e);
    }
  }

  const presetCount = await sql`SELECT COUNT(*) as c FROM dimension_presets`;
  if (Number((presetCount[0] as { c: string }).c) === 0) {
    await sql`
      INSERT INTO dimension_presets (name, safety, urgency, liability, priority, severity, likelihood, escalation)
      VALUES
        ('Plan / Monitor', 'LOW', 'LONG_TERM', 'LOW', 'PLAN_MONITOR', 1, 1, 'LOW'),
        ('Recommended 0-3 months', 'MODERATE', 'SHORT_TERM', 'MEDIUM', 'RECOMMENDED_0_3_MONTHS', 3, 3, 'MODERATE'),
        ('Immediate', 'HIGH', 'IMMEDIATE', 'HIGH', 'IMMEDIATE', 5, 4, 'HIGH')
    `;
    console.log("dimension_presets: 3 default presets inserted");
  }

  console.log("finding_definitions upserted:", defsInserted);
  console.log("finding_custom_dimensions inserted (new active):", dimsInserted);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
