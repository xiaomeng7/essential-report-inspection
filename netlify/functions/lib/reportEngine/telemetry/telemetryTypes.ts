export interface ReportEngineTelemetry {
  reportId: string;
  profile: string;
  modules: string[];
  injectionMode: string;

  slotSourceMap: Record<string, {
    source: "legacy" | "merged";
    reason?: string;
  }>;

  fallbackReasons: string[];

  mergedMetrics: {
    findingsCount: number;
    capexRowCount: number;
    capexTbdCount: number;
  };

  validationFlags: {
    mergedFindingsValidationPassed: boolean;
    mergedCapexValidationPassed: boolean;
  };

  timestamp: number;
}

export interface ReportEngineTelemetryAggregate {
  totalReports: number;
  injectionRatio: {
    legacyMode: number;
    mergedExecWtmMode: number;
    mergedCapex: number;
    mergedFindings: number;
  };
  slotCoverage: {
    whatThisMeansMerged: number;
    executiveMerged: number;
    capexMerged: number;
    findingsMerged: number;
  };
  fallbackRate: {
    NO_EXPLICIT_MODULES: number;
    MERGED_FINDINGS_VALIDATION_FAILED: number;
    INJECTION_FLAG_DISABLED: number;
    MERGED_CAPEX_EMPTY: number;
  };
  moduleUsage: {
    energyCount: number;
    lifecycleCount: number;
    energyAndLifecycleTogetherRatio: number;
  };
  capexTbdRatio: number;
  findingsValidationFailureRatio: number;
}
