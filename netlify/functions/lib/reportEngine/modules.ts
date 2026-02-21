import type { ModuleComputeOutput, ModuleId, ReportModule } from "./types";

function emptyOutput(): ModuleComputeOutput {
  return {
    executiveSummaryContrib: [],
    whatThisMeansContrib: [],
    capexRowsContrib: [],
    findingsContrib: [],
  };
}

const safetyModule: ReportModule = {
  id: "safety",
  name: "Safety Module",
  applicability: () => true,
  compute: () => emptyOutput(),
};

const capacityModule: ReportModule = {
  id: "capacity",
  name: "Capacity Module",
  applicability: () => true,
  compute: () => emptyOutput(),
};

const energyModule: ReportModule = {
  id: "energy",
  name: "Energy Module",
  applicability: (profile) => profile === "owner" || profile === "investor",
  compute: () => emptyOutput(),
};

const lifecycleModule: ReportModule = {
  id: "lifecycle",
  name: "Lifecycle Module",
  applicability: () => true,
  compute: () => emptyOutput(),
};

export const moduleRegistry: Record<ModuleId, ReportModule> = {
  safety: safetyModule,
  capacity: capacityModule,
  energy: energyModule,
  lifecycle: lifecycleModule,
};
