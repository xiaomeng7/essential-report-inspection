import { moduleRegistry } from "./modules";
import { resolveProfile } from "./profiles";
import type {
  ModuleId,
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

export function buildReportPlan(request: ReportRequest): ReportPlan {
  const profile = resolveProfile(request.profile).id;
  const modules = resolveModules(profile, request.modules);

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
    capexRows: [],
    findingsBlocks: [],
  };

  for (const moduleId of modules) {
    const module = moduleRegistry[moduleId];
    if (!module || !module.applicability(profile, request)) continue;

    const output = module.compute({
      request: { ...request, profile, modules },
      plan,
    });
    plan.summaryFocus.push(...output.executiveSummaryContrib);
    plan.capexRows.push(...output.capexRowsContrib);
    plan.findingsBlocks.push(...output.findingsContrib);
  }

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
