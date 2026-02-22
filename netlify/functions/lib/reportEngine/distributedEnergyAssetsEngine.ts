import { extractAssetsEnergy, type AssetsEnergySignals } from "../report/canonical/extractAssetsEnergy";
import type {
  ContentContribution,
  FindingBlock,
  ModuleComputeOutput,
  ReportProfileId,
} from "./types";
import type { BaselineLoadMetrics } from "./baselineLoadEngine";
import { extractEnhancedCircuits } from "../report/canonical/extractEnhancedCircuits";

export const ASSETS_FINDING_KEYS = {
  OVERVIEW: "DISTRIBUTED_ENERGY_ASSETS_OVERVIEW",
  READINESS: "EV_SOLAR_BATTERY_READINESS_NOTE",
  MONITORING: "CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION",
} as const;

type StressLevel = "low" | "moderate" | "high" | "critical" | "unknown";

export type DistributedAssetsInput = {
  assets: AssetsEnergySignals;
  stressLevel: StressLevel;
  profile: ReportProfileId;
  plannedUpgradeSignal?: boolean;
  circuitsCoverage?: "measured" | "observed" | "declared" | "unknown";
};

function extractStressLevel(metrics?: BaselineLoadMetrics): StressLevel {
  return metrics?.stressLevel ?? "unknown";
}

function flattenSources(sources?: AssetsEnergySignals["sources"]): string[] {
  return Object.values(sources ?? {})
    .flat()
    .filter((x): x is string => Boolean(x));
}

function labels(assets: AssetsEnergySignals): string[] {
  const out: string[] = [];
  out.push(`Solar: ${assets.hasSolar === true ? "Present" : assets.hasSolar === false ? "Not observed" : "Unknown"}`);
  out.push(`Battery: ${assets.hasBattery === true ? "Present" : assets.hasBattery === false ? "Not observed" : "Unknown"}`);
  out.push(`EV: ${assets.hasEv === true ? "Present" : assets.hasEv === false ? "Not observed" : "Unknown"}`);
  return out;
}

function overviewFinding(assets: AssetsEnergySignals): FindingBlock {
  const detail = labels(assets).join(" | ");
  return {
    key: ASSETS_FINDING_KEYS.OVERVIEW,
    id: ASSETS_FINDING_KEYS.OVERVIEW,
    moduleId: "energy",
    title: "Distributed Energy Assets Overview",
    priority: "PLAN_MONITOR",
    rationale: "Asset presence summary helps align future load planning and upgrades.",
    evidenceRefs: flattenSources(assets.sources),
    photos: [],
    html: `<h3>Asset Component</h3><p>Solar / Battery / EV infrastructure</p>
<h3>Observed Condition</h3><p>${detail}</p>
<h3>Evidence</h3><p>Sources: ${flattenSources(assets.sources).join(", ") || "not provided"}</p>
<h3>Risk Interpretation</h3><p>Presence of distributed assets changes load profile and future upgrade priorities.</p>
<h3>Priority Classification</h3><p>Plan / Monitor</p>
<h3>Budgetary Planning Range</h3><p>TBD after detailed design and metering data.</p>`,
    evidenceCoverage: assets.coverage ?? "unknown",
    sortKey: "assets:overview",
  };
}

function readinessFinding(assets: AssetsEnergySignals, stressLevel: StressLevel): FindingBlock {
  return {
    key: ASSETS_FINDING_KEYS.READINESS,
    id: ASSETS_FINDING_KEYS.READINESS,
    moduleId: "energy",
    title: "EV/Solar/Battery Readiness Note",
    priority: "RECOMMENDED_0_3_MONTHS",
    rationale: "High stress or uncertain EV readiness can increase nuisance trips and upgrade urgency.",
    evidenceRefs: flattenSources(assets.sources),
    photos: [],
    html: `<h3>Asset Component</h3><p>Future distributed energy integration</p>
<h3>Observed Condition</h3><p>Stress level: ${stressLevel}. EV readiness status is ${assets.hasEv === false ? "not detected" : "planned/unknown"}.</p>
<h3>Evidence</h3><p>Sources: ${flattenSources(assets.sources).join(", ") || "not provided"}</p>
<h3>Risk Interpretation</h3><p>Without readiness planning, added EV/solar/battery demand may compress headroom and increase reactive costs.</p>
<h3>Priority Classification</h3><p>Recommended 0-3 months</p>
<h3>Budgetary Planning Range</h3><p>Allowance for switchboard/pathway verification is recommended.</p>`,
    evidenceCoverage: assets.coverage ?? "unknown",
    sortKey: "assets:readiness",
  };
}

function monitoringFinding(assets: AssetsEnergySignals): FindingBlock {
  return {
    key: ASSETS_FINDING_KEYS.MONITORING,
    id: ASSETS_FINDING_KEYS.MONITORING,
    moduleId: "energy",
    title: "Continuous Monitoring Upgrade Justification",
    priority: "PLAN_MONITOR",
    rationale: "Monitoring supports operational verification when distributed assets interact with baseline loads.",
    evidenceRefs: flattenSources(assets.sources),
    photos: [],
    html: `<h3>Asset Component</h3><p>Energy monitoring pathway</p>
<h3>Observed Condition</h3><p>Distributed assets detected with elevated load stress conditions.</p>
<h3>Evidence</h3><p>Sources: ${flattenSources(assets.sources).join(", ") || "not provided"}</p>
<h3>Risk Interpretation</h3><p>Monitoring reduces uncertainty for tariff optimization, phase balancing, and upgrade timing.</p>
<h3>Priority Classification</h3><p>Plan / Monitor</p>
<h3>Budgetary Planning Range</h3><p>Subscription-level monitoring option can be staged.</p>`,
    evidenceCoverage: assets.coverage ?? "unknown",
    sortKey: "assets:monitoring",
  };
}

export function runDistributedEnergyAssetsEngine(input: DistributedAssetsInput): ModuleComputeOutput {
  const summaryLine: ContentContribution = {
    key: "assets_energy:summary_line",
    moduleId: "energy",
    text: `Energy assets — ${labels(input.assets).join(" • ")}`,
    sortKey: "assets:summary:01",
  };

  const planningNoteText =
    input.profile === "investor"
      ? "Distributed asset mix is tracked for headroom planning and cost-control strategy."
      : "Distributed asset mix is incorporated into upgrade planning and household reliability strategy.";

  const planningNote: ContentContribution = {
    key: "assets_energy:planning_note",
    moduleId: "energy",
    text: planningNoteText,
    sortKey: "assets:wtm:01",
  };

  const findings: FindingBlock[] = [];
  const hasAnyAsset = [input.assets.hasSolar, input.assets.hasBattery, input.assets.hasEv].some((x) => x === true);

  if (input.profile === "owner") {
    findings.push(overviewFinding(input.assets));
  }
  const readinessTriggered =
    (input.stressLevel === "high" || input.stressLevel === "critical") &&
    (input.assets.hasEv !== false || input.plannedUpgradeSignal === true);
  if (readinessTriggered) {
    findings.push(readinessFinding(input.assets, input.stressLevel));
  }
  const monitoringTriggered =
    input.stressLevel === "high" ||
    input.stressLevel === "critical" ||
    (hasAnyAsset && input.circuitsCoverage !== "measured");
  if (input.profile === "owner" && monitoringTriggered) {
    findings.push(monitoringFinding(input.assets));
  }

  return {
    executiveSummaryContrib: [summaryLine],
    whatThisMeansContrib: [planningNote],
    capexRowsContrib: [],
    findingsContrib: findings,
  };
}

export function runDistributedEnergyAssetsEngineFromRaw(
  raw: unknown,
  profile: ReportProfileId,
  baselineMetrics?: BaselineLoadMetrics
): ModuleComputeOutput {
  const circuitsCoverage = extractEnhancedCircuits(raw).coverage;
  const plannedUpgradeSignal = (() => {
    if (!raw || typeof raw !== "object") return false;
    const obj = raw as Record<string, unknown>;
    const primaryGoal = String(
      ((obj.snapshot_intake as Record<string, unknown> | undefined)?.primaryGoal as string | undefined) ??
        ((obj.snapshot as Record<string, unknown> | undefined)?.primaryGoal as string | undefined) ??
        ((obj.snapshot as Record<string, unknown> | undefined)?.focus as string | undefined) ??
        ""
    ).toLowerCase();
    return /(plan_upgrade|upgrade|ev)/.test(primaryGoal);
  })();
  return runDistributedEnergyAssetsEngine({
    assets: extractAssetsEnergy(raw),
    stressLevel: extractStressLevel(baselineMetrics),
    profile,
    plannedUpgradeSignal,
    circuitsCoverage,
  });
}
