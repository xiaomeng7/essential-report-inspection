import type {
  ContentContribution,
  FindingBlock,
  ProductIntent,
  ReportPlan,
  ReportProfileId,
} from "./types";

const INVESTOR_HIDDEN_FINDING_IDS = new Set([
  "ESTIMATED_COST_BAND",
  "CIRCUIT_CONTRIBUTION_BREAKDOWN",
  "DISTRIBUTED_ENERGY_ASSETS_OVERVIEW",
]);

/** Lite report: only these finding IDs are shown; others dropped or replaced with short "insufficient evidence" line. */
const LITE_ALLOWED_FINDING_IDS = new Set([
  "LOAD_STRESS_TEST_RESULT",
  "ESTIMATED_COST_BAND",
  "DISTRIBUTED_ENERGY_ASSETS_OVERVIEW",
  "CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION",
]);

const LITE_EXECUTIVE_MAX_BULLETS = 4;
const LITE_CTA_LINE =
  "For higher accuracy, upgrade to Energy Advisory Pro (on-site load measurement). If capacity/safety risks are suspected, consider Essential Report.";

const OWNER_ORDER_WEIGHT: Record<string, number> = {
  LOAD_STRESS_TEST_RESULT: 10,
  DISTRIBUTED_ENERGY_ASSETS_OVERVIEW: 20,
  EV_SOLAR_BATTERY_READINESS_NOTE: 30,
  CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION: 40,
  CIRCUIT_CONTRIBUTION_BREAKDOWN: 50,
  ESTIMATED_COST_BAND: 60,
};

function profileFilterFindings(
  profile: ReportProfileId,
  findings: FindingBlock[],
  productIntent?: ProductIntent
): FindingBlock[] {
  if (productIntent === "lite") {
    return findings.filter((f) => LITE_ALLOWED_FINDING_IDS.has(f.id));
  }
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

function trimExecutiveForLite(executiveSummary: ContentContribution[]): ContentContribution[] {
  const withBaseline = ensureBaselineExecutiveLine({ ...({ findings: [] } as ReportPlan["merged"]), executiveSummary });
  const trimmed = withBaseline.slice(0, LITE_EXECUTIVE_MAX_BULLETS);
  return [
    ...trimmed,
    { key: "lite.cta", text: LITE_CTA_LINE, moduleId: "energy", importance: "normal" as const },
  ];
}

export function profileRenderMerged(
  profile: ReportProfileId,
  merged: ReportPlan["merged"],
  productIntent?: ProductIntent
): ReportPlan["merged"] {
  const filteredFindings = profileFilterFindings(profile, merged.findings, productIntent);
  const orderedFindings = stableOrderFindings(profile, filteredFindings);
  const executiveSummary =
    productIntent === "lite"
      ? trimExecutiveForLite(merged.executiveSummary)
      : ensureBaselineExecutiveLine(merged);
  return {
    ...merged,
    executiveSummary,
    findings: orderedFindings,
  };
}
