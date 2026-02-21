import type { ModuleId, ReportProfileId } from "./types";

export type ReportProfileDefinition = {
  id: ReportProfileId;
  name: string;
  defaultModules: ModuleId[];
  summaryWeights: {
    risk: number;
    capex: number;
    optimization: number;
    transparency: number;
  };
};

export const REPORT_PROFILES: Record<ReportProfileId, ReportProfileDefinition> = {
  investor: {
    id: "investor",
    name: "Investor / Landlord",
    // Backward-compatible baseline modules.
    defaultModules: ["safety", "capacity"],
    summaryWeights: { risk: 5, capex: 5, optimization: 2, transparency: 2 },
  },
  owner: {
    id: "owner",
    name: "Owner-occupier",
    defaultModules: ["safety", "capacity", "energy"],
    summaryWeights: { risk: 3, capex: 3, optimization: 5, transparency: 3 },
  },
  tenant: {
    id: "tenant",
    name: "Tenant",
    defaultModules: ["safety", "capacity"],
    summaryWeights: { risk: 3, capex: 1, optimization: 2, transparency: 5 },
  },
};

export function resolveProfile(id?: ReportProfileId): ReportProfileDefinition {
  return REPORT_PROFILES[id ?? "investor"];
}
