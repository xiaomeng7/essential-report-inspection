/**
 * Effective finding data: DB override first, else YAML baseline.
 * Copy: DB if non-empty else responses.yml else finding_profiles messaging.
 * Dimensions: DB active row per finding_id else YAML profile 9-dims.
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { loadFindingProfiles, getFindingProfile, type FindingProfile } from "./findingProfilesLoader";
import { isDbConfigured, getDefinitionsMap, getActiveDimensionsMap } from "./db";
import {
  has003Schema,
  getFindingDefinitionsMap,
  getEffectiveDimensionsMap,
} from "./dbFindings";
import type { CustomNine } from "./dbTypes";
import type { FindingDefinitionRow } from "./dbTypes";

export type EffectiveDefinition = {
  finding_id: string;
  title_en: string;
  title_zh: string | null;
  why_it_matters_en: string | null;
  why_it_matters_zh: string | null;
  recommended_action_en: string | null;
  recommended_action_zh: string | null;
  planning_guidance_en: string | null;
  planning_guidance_zh: string | null;
  system_group: string | null;
  space_group: string | null;
  tags: string[];
};

export type EffectiveFinding = {
  finding_id: string;
  definition: EffectiveDefinition;
  dimensions: CustomNine;
};

let responsesCache: { findings?: Record<string, Record<string, unknown>> } | null = null;

function loadResponsesSync(): { findings?: Record<string, Record<string, unknown>> } {
  if (responsesCache) return responsesCache;
  const possiblePaths = [
    path.join(__dirname, "..", "..", "responses.yml"),
    path.join(__dirname, "..", "responses.yml"),
    path.join(process.cwd(), "responses.yml"),
    path.join(process.cwd(), "netlify", "functions", "responses.yml"),
    "/opt/build/repo/responses.yml",
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8");
        responsesCache = (yaml.load(content) as { findings?: Record<string, Record<string, unknown>> }) ?? {};
        return responsesCache;
      }
    } catch (e) {
      continue;
    }
  }
  responsesCache = { findings: {} };
  return responsesCache;
}

let rawProfilesCache: Record<string, Record<string, unknown>> | null = null;

function loadRawFindingProfilesSync(): Record<string, Record<string, unknown>> {
  if (rawProfilesCache) return rawProfilesCache;
  const possiblePaths = [
    path.join(__dirname, "..", "..", "..", "profiles", "finding_profiles.yml"),
    path.join(__dirname, "..", "..", "profiles", "finding_profiles.yml"),
    path.join(process.cwd(), "profiles", "finding_profiles.yml"),
    path.join(process.cwd(), "netlify", "functions", "profiles", "finding_profiles.yml"),
    "/opt/build/repo/profiles/finding_profiles.yml",
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8");
        const data = yaml.load(content) as { finding_profiles?: Record<string, Record<string, unknown>> };
        rawProfilesCache = data.finding_profiles ?? {};
        return rawProfilesCache;
      }
    } catch {
      continue;
    }
  }
  rawProfilesCache = {};
  return rawProfilesCache;
}

/** Build CustomNine from raw YAML profile (has budgetary_range, urgency). */
function rawProfileToCustomNine(raw: Record<string, unknown>): CustomNine {
  const risk = (raw.risk as Record<string, unknown>) ?? {};
  const br = (raw.budgetary_range as { low?: number; high?: number }) ?? {};
  return {
    safety: (risk.safety as string) ?? undefined,
    urgency: (raw.urgency as string) ?? undefined,
    liability: (risk.compliance as string) ?? (raw.liability as string) ?? undefined,
    budget_low: typeof br.low === "number" ? br.low : undefined,
    budget_high: typeof br.high === "number" ? br.high : undefined,
    priority: (raw.default_priority as string) ?? undefined,
    severity: typeof raw.risk_severity === "number" ? raw.risk_severity : undefined,
    likelihood: typeof raw.likelihood === "number" ? raw.likelihood : undefined,
    escalation: (risk.escalation as string) ?? undefined,
  };
}

function nonEmpty(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

function mergeDef(
  finding_id: string,
  dbRow: FindingDefinitionRow | undefined,
  responses: Record<string, unknown>,
  profile: FindingProfile
): EffectiveDefinition {
  const msg = profile.messaging ?? ({} as { title?: string; why_it_matters?: string; planning_guidance?: string });
  const resp = responses[finding_id] as Record<string, unknown> | undefined;
  return {
    finding_id,
    title_en:
      nonEmpty(dbRow?.title_en) ??
      nonEmpty(resp?.title) ??
      nonEmpty(msg.title) ??
      finding_id.replace(/_/g, " "),
    title_zh: nonEmpty(dbRow?.title_zh) ?? null,
    why_it_matters_en:
      nonEmpty(dbRow?.why_it_matters_en) ?? nonEmpty(resp?.why_it_matters) ?? nonEmpty(msg.why_it_matters) ?? null,
    why_it_matters_zh: nonEmpty(dbRow?.why_it_matters_zh) ?? null,
    recommended_action_en:
      nonEmpty(dbRow?.recommended_action_en) ?? nonEmpty(resp?.recommended_action) ?? null,
    recommended_action_zh: nonEmpty(dbRow?.recommended_action_zh) ?? null,
    planning_guidance_en:
      nonEmpty(dbRow?.planning_guidance_en) ?? nonEmpty(resp?.planning_guidance) ?? nonEmpty(msg.planning_guidance) ??
      null,
    planning_guidance_zh: nonEmpty(dbRow?.planning_guidance_zh) ?? null,
    system_group:
      nonEmpty(dbRow?.system_group) ??
      nonEmpty((profile as unknown as { system_group?: string }).system_group) ??
      nonEmpty(profile.category) ??
      null,
    space_group:
      nonEmpty(dbRow?.space_group) ??
      nonEmpty((profile as unknown as { space_group?: string }).space_group) ??
      null,
    tags:
      dbRow?.tags?.length
        ? dbRow.tags
        : Array.isArray((profile as unknown as { tags?: string[] }).tags)
          ? (profile as unknown as { tags: string[] }).tags
          : [],
  };
}

let indexCache: EffectiveFinding[] | null = null;

/**
 * Build the full effective index (union of YAML + DB finding_ids, merged data).
 * Uses 003 schema (finding_definitions + finding_effective_dimensions) when available; else YAML + legacy DB.
 * Cached for reuse in same process.
 */
export async function getEffectiveFindingIndex(): Promise<EffectiveFinding[]> {
  if (indexCache) return indexCache;
  const profiles = loadFindingProfiles();
  const responses = loadResponsesSync().findings ?? {};
  const yamlIds = new Set(Object.keys(profiles));
  let dbDefs = new Map<string, FindingDefinitionRow>();
  let dbDims = new Map<string, CustomNine>();

  const use003 = isDbConfigured() && (await has003Schema());
  if (use003) {
    try {
      const defs003 = await getFindingDefinitionsMap();
      const dims003 = await getEffectiveDimensionsMap();
      for (const id of defs003.keys()) yamlIds.add(id);
      for (const [id, row] of defs003) {
        dbDefs.set(id, {
          finding_id: row.finding_id,
          title_en: row.title ?? "",
          title_zh: null,
          why_it_matters_en: row.why_it_matters,
          why_it_matters_zh: null,
          recommended_action_en: row.recommended_action,
          recommended_action_zh: null,
          planning_guidance_en: row.planning_guidance,
          planning_guidance_zh: null,
          system_group: row.system_group,
          space_group: row.space_group,
          tags: row.tags ?? [],
          is_active: true,
          created_at: row.created_at,
          updated_at: row.updated_at,
        });
      }
      for (const [id, v] of dims003) {
        dbDims.set(id, v.dimensions);
      }
    } catch (e) {
      console.warn("[getEffectiveFindingData] 003 DB load failed, falling back:", e);
    }
  }
  if (!use003 && isDbConfigured()) {
    try {
      dbDefs = await getDefinitionsMap();
      dbDims = await getActiveDimensionsMap();
      for (const id of dbDefs.keys()) yamlIds.add(id);
    } catch (e) {
      console.warn("[getEffectiveFindingData] DB load failed, using YAML only:", e);
    }
  }

  const rawProfiles = loadRawFindingProfilesSync();
  const out: EffectiveFinding[] = [];
  for (const finding_id of yamlIds) {
    const profile = getFindingProfile(finding_id);
    const dbRow = dbDefs.get(finding_id);
    const raw = rawProfiles[finding_id] ?? {};
    const dimensions: CustomNine = dbDims.get(finding_id) ?? rawProfileToCustomNine(raw);
    const definition = mergeDef(finding_id, dbRow, responses, profile);
    out.push({ finding_id, definition, dimensions });
  }
  indexCache = out;
  return out;
}

/**
 * Return effective data for one finding_id, or undefined if not in index.
 */
export async function getEffectiveFinding(finding_id: string): Promise<EffectiveFinding | undefined> {
  const index = await getEffectiveFindingIndex();
  return index.find((e) => e.finding_id === finding_id);
}

/**
 * Clear in-memory cache (e.g. after admin updates dimensions).
 */
export function clearEffectiveFindingCache(): void {
  indexCache = null;
}
