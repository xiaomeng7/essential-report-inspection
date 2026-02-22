import type {
  ContentContribution,
  FindingBlock,
  ModuleComputeOutput,
  ReportModule,
} from "./types";
import type { EnergyInputV2, EnergyMetricsV2, EnergyOutputV2 } from "./contracts/energyV2";
import { mapEnergyInputV2 } from "./inputMappers/energyMapperV2";
import { mapEnergyInput } from "./inputMappers/energyMapper";
import { enhancedEnergyEngine } from "./enhancedEnergyEngine";

function emptyOutput(): ModuleComputeOutput {
  return {
    executiveSummaryContrib: [],
    whatThisMeansContrib: [],
    capexRowsContrib: [],
    findingsContrib: [],
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function calcPeakKw(input: EnergyInputV2): number {
  const phase = input.supply.phaseSupply ?? "unknown";
  if (phase === "three") {
    const v1 = input.supply.voltageL1V ?? 230;
    const v2 = input.supply.voltageL2V ?? 230;
    const v3 = input.supply.voltageL3V ?? 230;
    const a1 = input.stressTest.currentA_L1 ?? 0;
    const a2 = input.stressTest.currentA_L2 ?? 0;
    const a3 = input.stressTest.currentA_L3 ?? 0;
    const sum = (v1 * a1 + v2 * a2 + v3 * a3) / 1000;
    if (sum > 0) return round2(sum);
  }
  const voltage = input.supply.voltageV ?? 230;
  const current = input.stressTest.totalCurrentA ?? input.circuits.reduce((sum, c) => sum + c.measuredCurrentA, 0);
  return round2((voltage * current) / 1000);
}

function calcStress(input: EnergyInputV2): { ratio?: number; level: "low" | "moderate" | "high" | "critical" | "unknown" } {
  const mainSwitchA = input.supply.mainSwitchA;
  if (!mainSwitchA || mainSwitchA <= 0) return { level: "unknown" };
  const phase = input.supply.phaseSupply ?? "single";
  const ratio =
    phase === "three"
      ? Math.max(
          (input.stressTest.currentA_L1 ?? 0) / mainSwitchA,
          (input.stressTest.currentA_L2 ?? 0) / mainSwitchA,
          (input.stressTest.currentA_L3 ?? 0) / mainSwitchA
        )
      : (input.stressTest.totalCurrentA ?? input.circuits.reduce((sum, c) => sum + c.measuredCurrentA, 0)) / mainSwitchA;
  if (!Number.isFinite(ratio) || ratio <= 0) return { level: "unknown" };
  const rounded = round2(ratio);
  if (rounded >= 0.95) return { ratio: rounded, level: "critical" };
  if (rounded >= 0.8) return { ratio: rounded, level: "high" };
  if (rounded >= 0.6) return { ratio: rounded, level: "moderate" };
  return { ratio: rounded, level: "low" };
}

function deriveTopContributors(input: EnergyInputV2, peakKW: number): EnergyMetricsV2["topContributors"] {
  const phase = input.supply.phaseSupply ?? "single";
  const voltage = input.supply.voltageV ?? 230;
  const totalKw = peakKW > 0 ? peakKW : 0.01;
  const circuits = [...input.circuits]
    .map((c) => {
      const kw = (phase === "three" ? 230 : voltage) * c.measuredCurrentA / 1000;
      return { label: c.label, kw: round2(kw) };
    })
    .sort((a, b) => b.kw - a.kw)
    .slice(0, 5);
  return circuits.map((c) => ({
    label: c.label,
    kw: c.kw,
    sharePct: round2((c.kw / totalKw) * 100),
  }));
}

function deriveMonthlyCostBand(input: EnergyInputV2, peakKW: number): EnergyMetricsV2["monthlyCostBand"] {
  const rate = input.tariffs.rateCPerKwh / 100;
  const supplyDaily = input.tariffs.supplyCPerDay / 100;
  // 30 days monthly estimate with configurable utilisation assumptions.
  const conservativeKwh = peakKW * 24 * 30 * 0.25;
  const typicalKwh = peakKW * 24 * 30 * 0.35;
  return {
    conservative: Math.round(conservativeKwh * rate + supplyDaily * 30),
    typical: Math.round(typicalKwh * rate + supplyDaily * 30),
  };
}

function buildMetrics(input: EnergyInputV2): EnergyMetricsV2 {
  const peakKW = calcPeakKw(input);
  const stress = calcStress(input);
  return {
    peakKW,
    stressRatio: stress.ratio,
    topContributors: deriveTopContributors(input, peakKW),
    monthlyCostBand: deriveMonthlyCostBand(input, peakKW),
  };
}

function buildExecutive(profile: string, metrics: EnergyMetricsV2): string {
  const stress = metrics.stressRatio != null ? `${Math.round(metrics.stressRatio * 100)}%` : "N/A";
  const headroom = metrics.stressRatio != null ? `${Math.max(0, 100 - Math.round(metrics.stressRatio * 100))}%` : "N/A";
  const topText = metrics.topContributors.length > 0
    ? metrics.topContributors.map((x) => `${x.label} (${x.sharePct}%)`).join(", ")
    : "no circuit breakdown captured";
  if (profile === "owner") {
    return `Peak load: ${metrics.peakKW} kW; stress ratio: ${stress}; headroom: ${headroom}. Main contributors: ${topText}. Estimated monthly bill band: AUD $${metrics.monthlyCostBand.conservative}-$${metrics.monthlyCostBand.typical}.`;
  }
  if (profile === "investor") {
    return `Peak load: ${metrics.peakKW} kW with stress ratio ${stress}. Headroom baseline: ${headroom}. Top contributors: ${topText}. Estimated monthly electricity band: AUD $${metrics.monthlyCostBand.conservative}-$${metrics.monthlyCostBand.typical}.`;
  }
  return `Peak load snapshot: ${metrics.peakKW} kW; stress ratio ${stress}. Top contributors: ${topText}. Estimated monthly electricity range: AUD $${metrics.monthlyCostBand.conservative}-$${metrics.monthlyCostBand.typical}.`;
}

function buildWtm(profile: string, input: EnergyInputV2, metrics: EnergyMetricsV2): string {
  const applianceHint = input.appliances.length > 0
    ? `Known high-load appliances: ${input.appliances.slice(0, 4).join(", ")}.`
    : "No explicit appliance list captured.";
  const stressHint = metrics.stressRatio != null && metrics.stressRatio >= 0.8
    ? "Headroom is constrained under stress-test conditions."
    : "Current headroom appears manageable in this snapshot.";
  if (profile === "owner") {
    return `${stressHint} ${applianceHint} Actions: (1) low-cost load scheduling and setpoint optimisation, (2) targeted hot water/A-C/lighting review, (3) re-test after adjustments.`;
  }
  if (profile === "investor") {
    return `${stressHint} ${applianceHint} Actions: (1) preserve capacity headroom, (2) sequence efficiency upgrades before capex-heavy upgrades, (3) reduce future capex uncertainty with periodic re-test.`;
  }
  return `${stressHint} ${applianceHint} Actions: (1) monitor usage windows, (2) record recurring peaks, (3) escalate with measured evidence when thresholds are crossed.`;
}

function buildCapexRows(input: EnergyInputV2, metrics: EnergyMetricsV2, enableMonitoring: boolean): ContentContribution[] {
  const rows: ContentContribution[] = [
    {
      key: "| Year 1-2 | Load review and distribution balancing from stress-test baseline | AUD $1,000 - $4,000 |",
      rowKey: "capex:energy:load-review-distribution-balancing",
      text: "| Year 1-2 | Load review and distribution balancing from stress-test baseline | AUD $1,000 - $4,000 |",
      moduleId: "energy",
      sortKey: "energy.capex.001",
    },
    {
      key: "| Year 1-3 | Hot water / air-conditioning / lighting optimisation package | AUD $1,500 - $6,500 |",
      rowKey: "capex:energy:appliance-optimisation-package",
      text: "| Year 1-3 | Hot water / air-conditioning / lighting optimisation package | AUD $1,500 - $6,500 |",
      moduleId: "energy",
      sortKey: "energy.capex.002",
    },
  ];
  if (enableMonitoring || input.circuits.length >= 3) {
    rows.push({
      key: "| Year 1-2 | Circuit-level monitoring subscription and alert baseline | AUD $600 - $2,000 |",
      rowKey: "capex:energy:circuit-monitoring-upgrade",
      text: "| Year 1-2 | Circuit-level monitoring subscription and alert baseline | AUD $600 - $2,000 |",
      moduleId: "energy",
      sortKey: "energy.capex.003",
    });
  }
  return rows;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractPrimitive(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    return extractPrimitive((v as { value: unknown }).value);
  }
  return undefined;
}

function buildFindings(
  input: EnergyInputV2,
  metrics: EnergyMetricsV2,
  evidenceRefs: string[],
  evidenceCoverage: "measured" | "observed" | "declared" | "unknown",
  enableMonitoring: boolean
): FindingBlock[] {
  const stress = calcStress(input);
  const stressLevel = stress.level.toUpperCase();
  const phase = input.supply.phaseSupply ?? "unknown";
  const peakA = phase === "three"
    ? Math.max(input.stressTest.currentA_L1 ?? 0, input.stressTest.currentA_L2 ?? 0, input.stressTest.currentA_L3 ?? 0)
    : (input.stressTest.totalCurrentA ?? 0);

  const stressTable = [
    "<table>",
    "<tr><th>Phase</th><th>Voltage</th><th>Main Switch A</th><th>Peak A</th><th>Peak kW</th><th>Stress Level</th></tr>",
    `<tr><td>${escapeHtml(phase)}</td><td>${escapeHtml(String(input.supply.voltageV ?? "-"))}</td><td>${escapeHtml(String(input.supply.mainSwitchA ?? "-"))}</td><td>${escapeHtml(String(round2(peakA)))}</td><td>${escapeHtml(String(metrics.peakKW))}</td><td>${escapeHtml(stressLevel)}</td></tr>`,
    "</table>",
  ].join("");

  const contribRows = metrics.topContributors.length > 0
    ? metrics.topContributors.map((x) => `<tr><td>${escapeHtml(x.label)}</td><td>${x.kw}</td><td>${x.sharePct}%</td></tr>`).join("")
    : "<tr><td>Main Load Snapshot</td><td>-</td><td>-</td></tr>";
  const contribTable = [
    "<table>",
    "<tr><th>Label</th><th>kW</th><th>Share</th></tr>",
    contribRows,
    "</table>",
  ].join("");

  const assumptions = escapeHtml(input.tariffs.notes || "Estimate uses utilisation factors 25%/35% from measured peak load.");
  const costTable = [
    "<table>",
    "<tr><th>Assumptions</th><th>Monthly Low</th><th>Monthly Typical</th></tr>",
    `<tr><td>${assumptions}</td><td>AUD $${metrics.monthlyCostBand.conservative}</td><td>AUD $${metrics.monthlyCostBand.typical}</td></tr>`,
    "</table>",
  ].join("");

  const findings: FindingBlock[] = [
    {
      key: "energy.finding.load-stress-test-result",
      id: "LOAD_STRESS_TEST_RESULT",
      moduleId: "energy",
      title: "Load stress test result",
      priority: "RECOMMENDED_0_3_MONTHS",
      rationale:
        metrics.stressRatio != null
          ? `Stress ratio assessed at ${Math.round(metrics.stressRatio * 100)}% of main-switch capacity from measured snapshot.`
          : "Peak demand estimated from available measured load signals.",
      evidenceRefs: evidenceRefs.slice(0, 6),
      photos: [],
      html: stressTable,
      evidenceCoverage,
      score: metrics.stressRatio != null ? Math.min(85, Math.round(metrics.stressRatio * 100)) : 52,
      sortKey: "energy.finding.001",
    },
    {
      key: "energy.finding.circuit-contribution-breakdown",
      id: "CIRCUIT_CONTRIBUTION_BREAKDOWN",
      moduleId: "energy",
      title: "Circuit contribution breakdown",
      priority: "PLAN_MONITOR",
      rationale:
        metrics.topContributors.length > 0
          ? `Top measured contributors: ${metrics.topContributors.map((x) => `${x.label} ${x.sharePct}%`).join(", ")}.`
          : "Circuit-level data is limited; baseline captured from main-load snapshot.",
      evidenceRefs: evidenceRefs.slice(0, 6),
      photos: [],
      html: contribTable,
      evidenceCoverage,
      score: 55,
      sortKey: "energy.finding.002",
    },
    {
      key: "energy.finding.estimated-cost-band",
      id: "ESTIMATED_COST_BAND",
      moduleId: "energy",
      title: "Estimated cost band",
      priority: "PLAN_MONITOR",
      rationale: `Estimated monthly electricity band is AUD $${metrics.monthlyCostBand.conservative}-$${metrics.monthlyCostBand.typical} under current assumptions.`,
      evidenceRefs: evidenceRefs.slice(0, 6),
      photos: [],
      html: costTable,
      evidenceCoverage,
      score: 50,
      sortKey: "energy.finding.003",
    },
  ];
  if (enableMonitoring) {
    findings.push({
      key: "energy.finding.monitoring-upgrade-recommendation",
      id: "CONTINUOUS_MONITORING_UPGRADE",
      moduleId: "energy",
      title: "Monitoring upgrade recommendation",
      priority: "PLAN_MONITOR",
      rationale: "Higher stress profile indicates value in subscription monitoring and alerting to avoid unmanaged peak events.",
      evidenceRefs: evidenceRefs.slice(0, 6),
      photos: [],
      html: "<p>Continuous monitoring can detect recurring peak events and improve bill/root-cause visibility.</p>",
      evidenceCoverage,
      score: 58,
      sortKey: "energy.finding.004",
    });
  }
  return findings;
}

function adaptLegacySignals(raw: Record<string, unknown>): EnergyInputV2 | undefined {
  const legacy = mapEnergyInput(raw);
  if (!legacy.energy || legacy.evidenceRefs.length === 0) return undefined;
  const totalCurrentA = Number(legacy.energy.clampLoadA || 0) || undefined;
  const mainSwitchA = Number(legacy.energy.mainSwitchA || 0) || undefined;
  const phaseRaw = (legacy.energy.phaseSupply || "").toLowerCase();
  const phaseSupply = phaseRaw.includes("three") ? "three" : phaseRaw.includes("single") ? "single" : "unknown";
  const fallbackCircuits = totalCurrentA
    ? [{ label: "Main Load Snapshot", measuredCurrentA: totalCurrentA, category: "main", evidenceCoverage: legacy.evidenceCoverage }]
    : [];
  return {
    supply: {
      phaseSupply,
      voltageV: Number(legacy.energy.voltageV || 0) || undefined,
      mainSwitchA,
    },
    stressTest: { totalCurrentA },
    circuits: fallbackCircuits,
    appliances: legacy.energy.highLoadDevices,
    tariffs: { rateCPerKwh: 40, supplyCPerDay: 120 },
  };
}

function buildEnergyOutputV2(
  profile: string,
  input: EnergyInputV2,
  evidenceRefs: string[],
  evidenceCoverage: "measured" | "observed" | "declared" | "unknown",
  preferMonitoring: boolean
): EnergyOutputV2 {
  const metrics = buildMetrics(input);
  const enableMonitoring =
    evidenceCoverage === "unknown" ||
    evidenceCoverage === "declared" ||
    (metrics.stressRatio != null && metrics.stressRatio >= 0.8) ||
    preferMonitoring;
  return {
    exec: [
      {
        key: `energy.exec.v2.${profile}`,
        text: buildExecutive(profile, metrics),
        moduleId: "energy",
        sortKey: "energy.exec.001",
      },
    ],
    wtm: [
      {
        key: `energy.wtm.v2.${profile}`,
        text: buildWtm(profile, input, metrics),
        moduleId: "energy",
        sortKey: "energy.wtm.001",
      },
    ],
    capexRows: buildCapexRows(input, metrics, enableMonitoring),
    findings: buildFindings(input, metrics, evidenceRefs, evidenceCoverage, enableMonitoring),
    metrics,
  };
}

export const energyModule: ReportModule = enhancedEnergyEngine;
