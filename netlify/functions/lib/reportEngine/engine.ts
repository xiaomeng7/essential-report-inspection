import { moduleRegistry } from "./modules";
import { resolveProfile } from "./profiles";
import { runDistributedEnergyAssetsEngineFromRaw } from "./distributedEnergyAssetsEngine";
import { runBaselineLoadEngine } from "./baselineLoadEngine";
import { runEnhancedEnergyEngine } from "./enhancedEnergyEngine";
import { profileRenderMerged } from "./profileRenderer";
import { assertReportInputs } from "../report/preflight/assertReportInputs";
import type {
  ContentContribution,
  FindingBlock,
  ModuleId,
  ModuleComputeOutput,
  ReportPlan,
  ReportRequest,
  ReportProfileId,
  TemplateData,
} from "./types";

function resolveModules(profile: ReportProfileId, requestedModules?: ModuleId[]): ModuleId[] {
  const base = requestedModules && requestedModules.length > 0
    ? requestedModules
    : resolveProfile(profile).defaultModules;
  return base.filter((id) => moduleRegistry[id] !== undefined);
}

function textCanonicalKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?()[\]{}"'`]/g, "");
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "row";
}

function ensureCapexRowKey(item: ContentContribution, moduleId: ModuleId): ContentContribution {
  if (item.rowKey && item.rowKey.startsWith("capex:")) return item;
  const seed = item.key?.trim() || item.text?.trim() || "capex-row";
  const slug = slugify(seed.replace(/\|/g, " "));
  return {
    ...item,
    rowKey: `capex:${moduleId}:${slug}`,
  };
}

function moduleOrderByProfile(profile: ReportProfileId): ModuleId[] {
  // Deterministic source: profile.modulePriority, never rely on registry insertion order.
  return resolveProfile(profile).modulePriority;
}

function findingPriorityRank(priority?: string): number {
  const normalized = (priority || "").toUpperCase();
  if (normalized === "IMMEDIATE" || normalized === "URGENT") return 1;
  if (normalized === "RECOMMENDED" || normalized === "RECOMMENDED_0_3_MONTHS") return 2;
  if (normalized === "PLAN" || normalized === "PLAN_MONITOR") return 3;
  return 99;
}

function densityPolicy(density: "compact" | "standard" | "detailed") {
  if (density === "compact") {
    return {
      maxFindingsTotal: 8,
      maxFindingsPerModule: 3,
      maxBulletsPerModule: 2,
      maxBulletsTotal: 8,
    };
  }
  if (density === "detailed") {
    return {
      maxFindingsTotal: 24,
      maxFindingsPerModule: 999,
      maxBulletsPerModule: 999,
      maxBulletsTotal: 64,
    };
  }
  return {
    maxFindingsTotal: 16,
    maxFindingsPerModule: 6,
    maxBulletsPerModule: 4,
    maxBulletsTotal: 16,
  };
}

function normalizeContrib(moduleId: ModuleId, items: ContentContribution[]): ContentContribution[] {
  return items
    .filter((item) => item && item.text && item.text.trim().length > 0)
    .map((item) => ({
      ...item,
      moduleId: item.moduleId ?? moduleId,
      importance: item.importance ?? "normal",
      key: item.key?.trim() || textCanonicalKey(item.text),
    }));
}

function mergeContributions(
  profile: ReportProfileId,
  density: "compact" | "standard" | "detailed",
  items: ContentContribution[]
): ContentContribution[] {
  const policy = densityPolicy(density);
  const moduleOrder = moduleOrderByProfile(profile);
  const moduleRank = new Map<ModuleId, number>(moduleOrder.map((m, idx) => [m, idx]));
  const sorted = [...items].sort((a, b) => {
    const mod = (moduleRank.get(a.moduleId as ModuleId) ?? 99) - (moduleRank.get(b.moduleId as ModuleId) ?? 99);
    if (mod !== 0) return mod;
    const keyA = a.sortKey ?? a.key;
    const keyB = b.sortKey ?? b.key;
    return keyA.localeCompare(keyB);
  });

  const result: ContentContribution[] = [];
  const seenByKey = new Set<string>();
  const seenByText = new Set<string>();
  const perModuleCount = new Map<ModuleId, number>();

  for (const item of sorted) {
    const moduleId = item.moduleId as ModuleId;
    const used = perModuleCount.get(moduleId) ?? 0;
    if (used >= policy.maxBulletsPerModule) continue;
    if (result.length >= policy.maxBulletsTotal) break;

    const isCritical = item.importance === "critical";
    const allowDuplicates = item.allowDuplicates === true || isCritical;
    const textKey = textCanonicalKey(item.text);
    const key = item.rowKey ?? item.key;

    if (!allowDuplicates) {
      if (seenByKey.has(key)) continue;
      if (seenByText.has(textKey)) continue;
    }

    result.push(item);
    perModuleCount.set(moduleId, used + 1);
    if (!allowDuplicates) {
      seenByKey.add(key);
      seenByText.add(textKey);
    }
  }

  return result;
}

function mergeFindings(
  profile: ReportProfileId,
  density: "compact" | "standard" | "detailed",
  blocks: FindingBlock[]
): FindingBlock[] {
  const policy = densityPolicy(density);
  const moduleOrder = moduleOrderByProfile(profile);
  const moduleRank = new Map<ModuleId, number>(moduleOrder.map((m, idx) => [m, idx]));
  const sorted = [...blocks].sort((a, b) => {
    const mod = (moduleRank.get(a.moduleId) ?? 99) - (moduleRank.get(b.moduleId) ?? 99);
    if (mod !== 0) return mod;
    const pri = findingPriorityRank(a.priority) - findingPriorityRank(b.priority);
    if (pri !== 0) return pri;
    const scoreA = a.score ?? 0;
    const scoreB = b.score ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    const photosA = Array.isArray(a.photos) ? a.photos.length : 0;
    const photosB = Array.isArray(b.photos) ? b.photos.length : 0;
    if (photosA !== photosB) return photosB - photosA;
    const skA = a.sortKey ?? a.key ?? a.id;
    const skB = b.sortKey ?? b.key ?? b.id;
    return skA.localeCompare(skB);
  });

  // Deterministic clipping:
  // 1) Keep priority tiers in order IMMEDIATE -> RECOMMENDED -> PLAN.
  // 2) Enforce per-module cap.
  // 3) Enforce total cap.
  const result: FindingBlock[] = [];
  const perModuleCount = new Map<ModuleId, number>();
  const perKey = new Set<string>();
  const tiers = [
    (b: FindingBlock) => findingPriorityRank(b.priority) === 1,
    (b: FindingBlock) => findingPriorityRank(b.priority) === 2,
    (b: FindingBlock) => findingPriorityRank(b.priority) === 3,
    (b: FindingBlock) => findingPriorityRank(b.priority) > 3,
  ];

  for (const tier of tiers) {
    for (const item of sorted) {
      if (!tier(item)) continue;
      if (result.length >= policy.maxFindingsTotal) return result;
      const count = perModuleCount.get(item.moduleId) ?? 0;
      if (count >= policy.maxFindingsPerModule) continue;
      const key = item.key || `${item.moduleId}:${item.id}:${item.title}`;
      if (perKey.has(key)) continue;
      result.push(item);
      perKey.add(key);
      perModuleCount.set(item.moduleId, count + 1);
    }
  }
  return result;
}

function mergeModuleOutput(
  profile: ReportProfileId,
  density: "compact" | "standard" | "detailed",
  outputs: ModuleComputeOutput[]
): ReportPlan["merged"] {
  const executiveSummary = mergeContributions(
    profile,
    density,
    outputs.flatMap((o) => o.executiveSummaryContrib)
  );
  const whatThisMeans = mergeContributions(
    profile,
    density,
    outputs.flatMap((o) => o.whatThisMeansContrib)
  );
  const capexRows = mergeContributions(
    profile,
    density,
    outputs.flatMap((o) => o.capexRowsContrib)
  );
  const findings = mergeFindings(
    profile,
    density,
    outputs.flatMap((o) => o.findingsContrib)
  );
  return { executiveSummary, whatThisMeans, capexRows, findings };
}

export function buildReportPlan(request: ReportRequest): ReportPlan {
  const profile = resolveProfile(request.profile).id;
  const modules = resolveModules(profile, request.modules);
  const density = request.options?.narrativeDensity ?? "standard";

  const plan: ReportPlan = {
    profile,
    modules,
    sectionWeights: {
      executiveSummary: 1,
      whatThisMeans: 1,
      findings: 1,
      capex: 1,
    },
    summaryFocus: [],
    whatThisMeansFocus: [],
    capexRows: [],
    findingsBlocks: [],
    merged: {
      executiveSummary: [],
      whatThisMeans: [],
      capexRows: [],
      findings: [],
    },
    debug: {},
  };

  const outputs: ModuleComputeOutput[] = [];

  const baselineOutput = runBaselineLoadEngine(request.inspection.raw);
  const normalizedBaselineOutput: ModuleComputeOutput = {
    executiveSummaryContrib: normalizeContrib("energy", baselineOutput.output.executiveSummaryContrib),
    whatThisMeansContrib: normalizeContrib("energy", baselineOutput.output.whatThisMeansContrib),
    capexRowsContrib: normalizeContrib("energy", baselineOutput.output.capexRowsContrib).map((item) =>
      ensureCapexRowKey(item, "energy")
    ),
    findingsContrib: baselineOutput.output.findingsContrib.map((f) => ({
      ...f,
      key: f.key || `energy:${f.id}:${f.title}`,
      moduleId: f.moduleId ?? "energy",
    })),
  };
  outputs.push(normalizedBaselineOutput);
  plan.summaryFocus.push(...normalizedBaselineOutput.executiveSummaryContrib);
  plan.whatThisMeansFocus.push(...normalizedBaselineOutput.whatThisMeansContrib);
  plan.capexRows.push(...normalizedBaselineOutput.capexRowsContrib);
  plan.findingsBlocks.push(...normalizedBaselineOutput.findingsContrib);

  for (const moduleId of modules) {
    if (moduleId === "energy") continue;
    const module = moduleRegistry[moduleId];
    if (!module || !module.applicability(profile, request)) continue;

    const output = module.compute({
      request: { ...request, profile, modules },
      plan,
    });
    const normalizedOutput: ModuleComputeOutput = {
      executiveSummaryContrib: normalizeContrib(moduleId, output.executiveSummaryContrib),
      whatThisMeansContrib: normalizeContrib(moduleId, output.whatThisMeansContrib),
      capexRowsContrib: normalizeContrib(moduleId, output.capexRowsContrib).map((item) =>
        ensureCapexRowKey(item, moduleId)
      ),
      findingsContrib: output.findingsContrib.map((f) => ({
        ...f,
        key: f.key || `${moduleId}:${f.id}:${f.title}`,
        moduleId: f.moduleId ?? moduleId,
      })),
    };
    outputs.push(normalizedOutput);
    plan.summaryFocus.push(...normalizedOutput.executiveSummaryContrib);
    plan.whatThisMeansFocus.push(...normalizedOutput.whatThisMeansContrib);
    plan.capexRows.push(...normalizedOutput.capexRowsContrib);
    plan.findingsBlocks.push(...normalizedOutput.findingsContrib);
  }

  const enhancedEnergyOutput = runEnhancedEnergyEngine(request.inspection.raw, profile, baselineOutput.metrics);
  const normalizedEnhancedEnergyOutput: ModuleComputeOutput = {
    executiveSummaryContrib: normalizeContrib("energy", enhancedEnergyOutput.executiveSummaryContrib),
    whatThisMeansContrib: normalizeContrib("energy", enhancedEnergyOutput.whatThisMeansContrib),
    capexRowsContrib: normalizeContrib("energy", enhancedEnergyOutput.capexRowsContrib).map((item) =>
      ensureCapexRowKey(item, "energy")
    ),
    findingsContrib: enhancedEnergyOutput.findingsContrib.map((f) => ({
      ...f,
      key: f.key || `energy:${f.id}:${f.title}`,
      moduleId: f.moduleId ?? "energy",
    })),
  };
  outputs.push(normalizedEnhancedEnergyOutput);
  plan.summaryFocus.push(...normalizedEnhancedEnergyOutput.executiveSummaryContrib);
  plan.whatThisMeansFocus.push(...normalizedEnhancedEnergyOutput.whatThisMeansContrib);
  plan.capexRows.push(...normalizedEnhancedEnergyOutput.capexRowsContrib);
  plan.findingsBlocks.push(...normalizedEnhancedEnergyOutput.findingsContrib);

  const assetsOutput = runDistributedEnergyAssetsEngineFromRaw(request.inspection.raw, profile, baselineOutput.metrics);
  const normalizedAssetsOutput: ModuleComputeOutput = {
    executiveSummaryContrib: normalizeContrib("energy", assetsOutput.executiveSummaryContrib),
    whatThisMeansContrib: normalizeContrib("energy", assetsOutput.whatThisMeansContrib),
    capexRowsContrib: normalizeContrib("energy", assetsOutput.capexRowsContrib).map((item) =>
      ensureCapexRowKey(item, "energy")
    ),
    findingsContrib: assetsOutput.findingsContrib.map((f) => ({
      ...f,
      key: f.key || `energy:${f.id}:${f.title}`,
      moduleId: f.moduleId ?? "energy",
    })),
  };
  outputs.push(normalizedAssetsOutput);
  plan.summaryFocus.push(...normalizedAssetsOutput.executiveSummaryContrib);
  plan.whatThisMeansFocus.push(...normalizedAssetsOutput.whatThisMeansContrib);
  plan.capexRows.push(...normalizedAssetsOutput.capexRowsContrib);
  plan.findingsBlocks.push(...normalizedAssetsOutput.findingsContrib);

  /**
   * Phase 3 merge rules (contract):
   * 1) Executive summary: module outputs are deduplicated and merged in profile-aware module order.
   * 2) What-this-means: same dedupe/ordering strategy as executive summary.
   * 3) CapEx rows: deduplicated, module-order merge; no rendering changes in Phase 3.
   * 4) Findings: sorted by module order, then by internal priority (IMMEDIATE -> RECOMMENDED -> PLAN),
   *    and clipped by narrative density (compact/standard/detailed).
   */
  plan.merged = profileRenderMerged(profile, mergeModuleOutput(profile, density, outputs));
  const preflight = assertReportInputs(request.inspection.raw, plan.merged, {
    stressLevel: baselineOutput.metrics.stressLevel,
    profile,
  });
  plan.debug = {
    ...(plan.debug || {}),
    preflight,
  };
  console.log("[report-preflight]", JSON.stringify(plan.debug.preflight));

  return plan;
}

/**
 * Phase 2 compatibility bridge:
 * - Keep legacy output unchanged.
 * - Route generation through profile -> modules -> engine plan.
 */
export async function buildTemplateDataWithLegacyPath<T extends TemplateData>(
  request: ReportRequest,
  legacyBuilder: () => Promise<T>
): Promise<{ templateData: T; plan: ReportPlan }> {
  const plan = buildReportPlan(request);
  const templateData = await legacyBuilder();
  return { templateData, plan };
}

/**
 * Phase 3 guard: compare legacy CapEx rows with merged rows in shadow mode.
 * Default investor path should remain aligned before enabling merged rows as source of truth.
 */
export function compareLegacyVsMergedCapexRows(
  legacyRows: string,
  mergedRows: ContentContribution[]
): { aligned: boolean; onlyInLegacy: string[]; onlyInMerged: string[] } {
  const legacySet = new Set(
    (legacyRows || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.includes("|"))
  );
  const mergedSet = new Set(mergedRows.map((row) => (row.rowKey ?? row.key).trim()).filter(Boolean));

  const onlyInLegacy = [...legacySet].filter((x) => !mergedSet.has(x));
  const onlyInMerged = [...mergedSet].filter((x) => !legacySet.has(x));
  return {
    aligned: onlyInLegacy.length === 0 && onlyInMerged.length === 0,
    onlyInLegacy,
    onlyInMerged,
  };
}
