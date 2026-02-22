import type { ModuleComputeOutput, ModuleId, ReportModule } from "./types";
import { energyModule } from "./energyModule";
import { lifecycleModule } from "./lifecycleModule";

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

export const moduleRegistry: Record<ModuleId, ReportModule> = {
  safety: safetyModule,
  capacity: capacityModule,
  energy: energyModule,
  lifecycle: lifecycleModule,
};
