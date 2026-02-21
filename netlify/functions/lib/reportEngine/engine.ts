import { moduleRegistry } from "./modules";
import { resolveProfile } from "./profiles";
import type {
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

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function moduleOrderByProfile(profile: ReportProfileId): ModuleId[] {
  // Merge priority by profile intent:
  // - investor: risk/capex first
  // - owner: optimization + capacity first
  // - tenant: transparency + safety first
  if (profile === "owner") return ["energy", "capacity", "safety", "lifecycle"];
  if (profile === "tenant") return ["safety", "capacity", "lifecycle", "energy"];
  return ["safety", "capacity", "lifecycle", "energy"];
}

function findingPriorityRank(priority?: string): number {
  const normalized = (priority || "").toUpperCase();
  if (normalized === "IMMEDIATE" || normalized === "URGENT") return 1;
  if (normalized === "RECOMMENDED" || normalized === "RECOMMENDED_0_3_MONTHS") return 2;
  if (normalized === "PLAN" || normalized === "PLAN_MONITOR") return 3;
  return 99;
}

function mergeFindings(
  profile: ReportProfileId,
  density: "compact" | "standard" | "detailed",
  blocks: FindingBlock[]
): FindingBlock[] {
  const moduleOrder = moduleOrderByProfile(profile);
  const moduleRank = new Map<ModuleId, number>(moduleOrder.map((m, idx) => [m, idx]));
  const sorted = [...blocks].sort((a, b) => {
    const mod = (moduleRank.get(a.moduleId) ?? 99) - (moduleRank.get(b.moduleId) ?? 99);
    if (mod !== 0) return mod;
    const pri = findingPriorityRank(a.priority) - findingPriorityRank(b.priority);
    if (pri !== 0) return pri;
    return a.title.localeCompare(b.title);
  });

  const maxItems = density === "compact" ? 8 : density === "detailed" ? 24 : 16;
  return sorted.slice(0, maxItems);
}

function mergeModuleOutput(
  profile: ReportProfileId,
  density: "compact" | "standard" | "detailed",
  outputs: ModuleComputeOutput[]
): ReportPlan["merged"] {
  const executiveSummary = uniqueStrings(
    outputs.flatMap((o) => o.executiveSummaryContrib)
  );
  const whatThisMeans = uniqueStrings(
    outputs.flatMap((o) => o.whatThisMeansContrib)
  );
  const capexRows = uniqueStrings(
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
  };

  const outputs: ModuleComputeOutput[] = [];
  for (const moduleId of modules) {
    const module = moduleRegistry[moduleId];
    if (!module || !module.applicability(profile, request)) continue;

    const output = module.compute({
      request: { ...request, profile, modules },
      plan,
    });
    outputs.push(output);
    plan.summaryFocus.push(...output.executiveSummaryContrib);
    plan.whatThisMeansFocus.push(...output.whatThisMeansContrib);
    plan.capexRows.push(...output.capexRowsContrib);
    plan.findingsBlocks.push(...output.findingsContrib);
  }

  /**
   * Phase 3 merge rules (contract):
   * 1) Executive summary: module outputs are deduplicated and merged in profile-aware module order.
   * 2) What-this-means: same dedupe/ordering strategy as executive summary.
   * 3) CapEx rows: deduplicated, module-order merge; no rendering changes in Phase 3.
   * 4) Findings: sorted by module order, then by internal priority (IMMEDIATE -> RECOMMENDED -> PLAN),
   *    and clipped by narrative density (compact/standard/detailed).
   */
  plan.merged = mergeModuleOutput(profile, density, outputs);

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
