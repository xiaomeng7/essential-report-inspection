import type { FindingBlock, ReportPlan, ReportProfileId } from "./types";

const INVESTOR_HIDDEN_FINDING_IDS = new Set([
  "ESTIMATED_COST_BAND",
  "CIRCUIT_CONTRIBUTION_BREAKDOWN",
  "DISTRIBUTED_ENERGY_ASSETS_OVERVIEW",
]);

const OWNER_ORDER_WEIGHT: Record<string, number> = {
  LOAD_STRESS_TEST_RESULT: 10,
  DISTRIBUTED_ENERGY_ASSETS_OVERVIEW: 20,
  EV_SOLAR_BATTERY_READINESS_NOTE: 30,
  CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION: 40,
  CIRCUIT_CONTRIBUTION_BREAKDOWN: 50,
  ESTIMATED_COST_BAND: 60,
};

function profileFilterFindings(profile: ReportProfileId, findings: FindingBlock[]): FindingBlock[] {
  if (profile === "owner") return [...findings];
  if (profile === "investor") {
    return findings.filter((f) => !INVESTOR_HIDDEN_FINDING_IDS.has(f.id));
  }
  return [...findings];
}

function stableOrderFindings(profile: ReportProfileId, findings: FindingBlock[]): FindingBlock[] {
  if (profile !== "owner") return findings;
  return [...findings].sort((a, b) => {
    const wa = OWNER_ORDER_WEIGHT[a.id] ?? 999;
    const wb = OWNER_ORDER_WEIGHT[b.id] ?? 999;
    if (wa !== wb) return wa - wb;
    const sa = a.sortKey ?? a.key ?? a.id;
    const sb = b.sortKey ?? b.key ?? b.id;
    return sa.localeCompare(sb);
  });
}

function ensureBaselineExecutiveLine(merged: ReportPlan["merged"]): ReportPlan["merged"]["executiveSummary"] {
  const baseline = merged.executiveSummary.find((x) => x.key === "baseline.exec.load");
  if (!baseline) return [...merged.executiveSummary];
  if (merged.executiveSummary.some((x) => x.key === "baseline.exec.load")) {
    return [...merged.executiveSummary];
  }
  return [baseline, ...merged.executiveSummary];
}

export function profileRenderMerged(
  profile: ReportProfileId,
  merged: ReportPlan["merged"]
): ReportPlan["merged"] {
  const filteredFindings = profileFilterFindings(profile, merged.findings);
  const orderedFindings = stableOrderFindings(profile, filteredFindings);
  return {
    ...merged,
    executiveSummary: ensureBaselineExecutiveLine(merged),
    findings: orderedFindings,
  };
}
