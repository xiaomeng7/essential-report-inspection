import type { StoredInspection } from "../store";

export type ReportProfileId = "investor" | "owner" | "tenant";

export type ModuleId = "safety" | "capacity" | "energy" | "lifecycle";

export type ReportEngineOptions = {
  narrativeDensity?: "compact" | "standard" | "detailed";
  budgetBias?: "conservative" | "balanced" | "proactive";
};

export type ReportEngineInjectionMode =
  | "legacy"
  | "merged_what_this_means"
  | "merged_exec+wtm"
  | "merged_all";

export type ReportEngineInjectionFlags = {
  whatThisMeans: boolean;
  executive: boolean;
  capex: boolean;
  findings: boolean;
};

export type ReportRequest = {
  inspection: StoredInspection;
  profile?: ReportProfileId;
  modules?: ModuleId[];
  options?: ReportEngineOptions;
};

export type FindingBlock = {
  key: string;
  id: string;
  moduleId: ModuleId;
  title: string;
  priority?: string;
  rationale: string;
  evidenceRefs: string[];
  photos: string[];
  html: string;
  evidenceCoverage?: "measured" | "observed" | "declared" | "unknown";
  score?: number;
  sortKey?: string;
  createdAt?: string;
};

export type ContributionImportance = "critical" | "normal";

export type ContentContribution = {
  key: string;
  text: string;
  rowKey?: string;
  amountLow?: number;
  amountHigh?: number;
  currency?: "AUD" | string;
  amountIsTbd?: boolean;
  moduleId?: ModuleId;
  importance?: ContributionImportance;
  allowDuplicates?: boolean;
  sortKey?: string;
};

export type ModuleComputeOutput = {
  executiveSummaryContrib: ContentContribution[];
  whatThisMeansContrib: ContentContribution[];
  capexRowsContrib: ContentContribution[];
  findingsContrib: FindingBlock[];
};

export type ReportPlan = {
  profile: ReportProfileId;
  modules: ModuleId[];
  sectionWeights: Record<string, number>;
  summaryFocus: ContentContribution[];
  whatThisMeansFocus: ContentContribution[];
  capexRows: ContentContribution[];
  findingsBlocks: FindingBlock[];
  merged: {
    executiveSummary: ContentContribution[];
    whatThisMeans: ContentContribution[];
    capexRows: ContentContribution[];
    findings: FindingBlock[];
  };
  debug?: {
    preflight?: {
      warnings: Array<{ code: string; message: string; meta?: Record<string, unknown> }>;
      flags: Record<string, boolean | undefined>;
      summary: {
        warningCounts: Record<string, number>;
        hasAnyWarning: boolean;
        severity: "none" | "low" | "medium" | "high";
        baselineComplete: boolean;
        enhancedComplete: boolean;
        assetsCoverage: "observed" | "declared" | "unknown";
        tariffSource: "customer" | "default" | "missing";
        circuitsCount: number;
        enhancedSkipped: boolean;
        enhancedSkipCode?: string;
        enhancedSkipNote?: string;
        subscriptionLead: boolean;
        subscriptionLeadReasons: string[];
      };
    };
  };
};

export type TemplateData = Record<string, string | number>;

export type PlanContext = {
  request: Required<Pick<ReportRequest, "inspection">> &
    Omit<ReportRequest, "inspection"> & {
      profile: ReportProfileId;
      modules: ModuleId[];
    };
  plan: ReportPlan;
};

export interface ReportModule {
  id: ModuleId;
  name: string;
  applicability(profile: ReportProfileId, input: ReportRequest): boolean;
  compute(context: PlanContext): ModuleComputeOutput;
}
