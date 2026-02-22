import { resolveTariffConfig } from "../config/tariffs";
import { resolveEnergyEstimationConfig } from "../config/energyEstimation";
import { extractEnhancedCircuits } from "../report/canonical/extractEnhancedCircuits";
import type { BaselineLoadMetrics } from "./baselineLoadEngine";
import type { ContentContribution, FindingBlock, ModuleComputeOutput, ReportModule } from "./types";

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

function toKwFromCurrent(currentA: number, voltageV = 230): number {
  return round2((currentA * voltageV) / 1000);
}

function hasUnknownHighDraw(rawUnknown: unknown): boolean {
  if (!rawUnknown || typeof rawUnknown !== "object") return false;
  const raw = rawUnknown as Record<string, unknown>;
  const flags = [
    (raw.energy_v2 as Record<string, unknown> | undefined)?.unknownHighDraw,
    raw.unknown_high_draw,
    raw.unknownHighDraw,
  ];
  return flags.some((v) => String(v ?? "").toLowerCase() === "true" || String(v ?? "").toLowerCase() === "yes");
}

function derivePeakKw(circuits: Array<{ measuredCurrentA?: number }>, baseline?: BaselineLoadMetrics): number {
  if (baseline?.peakKW && baseline.peakKW > 0) return baseline.peakKW;
  const totalA = circuits.reduce((sum, c) => sum + (c.measuredCurrentA ?? 0), 0);
  return toKwFromCurrent(totalA > 0 ? totalA : 0);
}

function buildContributors(
  circuits: Array<{ label: string; measuredCurrentA?: number; category?: string }>,
  peakKW: number
): Array<{ label: string; category?: string; currentA: number; kw: number; sharePct: number }> {
  const denom = peakKW > 0 ? peakKW : 0.01;
  return circuits
    .map((c) => {
      const currentA = c.measuredCurrentA ?? 0;
      const kw = toKwFromCurrent(currentA);
      return {
        label: c.label,
        category: c.category,
        currentA,
        kw,
        sharePct: round2((kw / denom) * 100),
      };
    })
    .sort((a, b) => b.kw - a.kw)
    .slice(0, 5);
}

function buildCostBand(
  peakKW: number,
  rateCPerKwh: number,
  supplyCPerDay: number,
  factors: { low: number; typ: number }
): { low: number; typical: number } {
  const rate = rateCPerKwh / 100;
  const supply = supplyCPerDay / 100;
  const avgKWLow = peakKW * factors.low;
  const avgKWTyp = peakKW * factors.typ;
  const low = Math.round(avgKWLow * 24 * 30 * rate + supply * 30);
  const typical = Math.round(avgKWTyp * 24 * 30 * rate + supply * 30);
  return { low, typical };
}

function buildCapexRows(categories: string[], includeMonitoring: boolean): ContentContribution[] {
  const rows: ContentContribution[] = [];
  if (categories.some((c) => /hot.?water/i.test(c))) {
    rows.push({
      key: "enhanced.energy.capex.hot-water",
      rowKey: "capex:energy:hot-water-optimisation",
      text: "| Year 1-2 | Hot water control and load-shift optimisation | AUD $1,200 - $4,800 |",
      moduleId: "energy",
      sortKey: "enhanced.energy.capex.001",
    });
  }
  if (categories.some((c) => /ac|cooling|air/i.test(c))) {
    rows.push({
      key: "enhanced.energy.capex.ac",
      rowKey: "capex:energy:ac-optimisation",
      text: "| Year 1-2 | Air-conditioning efficiency and scheduling package | AUD $1,500 - $6,500 |",
      moduleId: "energy",
      sortKey: "enhanced.energy.capex.002",
    });
  }
  if (categories.some((c) => /light/i.test(c))) {
    rows.push({
      key: "enhanced.energy.capex.lighting",
      rowKey: "capex:energy:lighting-optimisation",
      text: "| Year 1-2 | Lighting load reduction and controls tune-up | AUD $600 - $2,500 |",
      moduleId: "energy",
      sortKey: "enhanced.energy.capex.003",
    });
  }
  if (includeMonitoring) {
    rows.push({
      key: "enhanced.energy.capex.monitoring",
      rowKey: "capex:energy:continuous-monitoring-upgrade",
      text: "| Year 1-2 | Circuit-level monitoring and alert baseline | AUD $600 - $2,000 |",
      moduleId: "energy",
      sortKey: "enhanced.energy.capex.004",
    });
  }
  return rows.slice(0, 3);
}

function buildFindings(
  contributors: Array<{ label: string; category?: string; currentA: number; kw: number; sharePct: number }>,
  costBand: { low: number; typical: number },
  evidenceRefs: string[],
  includeMonitoring: boolean,
  tariffMeta: {
    rate_c_per_kwh: number;
    supply_c_per_day: number;
    sourceLabel: "customer provided" | "default estimate";
    avgFactorLow: number;
    avgFactorTyp: number;
  }
): FindingBlock[] {
  const rows =
    contributors.length > 0
      ? contributors
          .map(
            (c) =>
              `<tr><td>${c.label}</td><td>${c.category ?? "-"}</td><td>${round2(c.currentA)}</td><td>${round2(c.kw)}</td><td>${round2(c.sharePct)}%</td></tr>`
          )
          .join("")
      : "<tr><td>N/A</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>";
  const findings: FindingBlock[] = [
    {
      key: "enhanced.energy.finding.circuit-contribution-breakdown",
      id: "CIRCUIT_CONTRIBUTION_BREAKDOWN",
      moduleId: "energy",
      title: "Circuit contribution breakdown",
      priority: "PLAN_MONITOR",
      rationale: "Top circuit contributors are ordered by estimated kW share.",
      evidenceRefs: evidenceRefs.slice(0, 8),
      photos: [],
      html: `<table><tr><th>Label</th><th>Category</th><th>A</th><th>kW</th><th>%</th></tr>${rows}</table>`,
      evidenceCoverage: "measured",
      sortKey: "enhanced.energy.finding.001",
    },
    {
      key: "enhanced.energy.finding.estimated-cost-band",
      id: "ESTIMATED_COST_BAND",
      moduleId: "energy",
      title: "Estimated cost band",
      priority: "PLAN_MONITOR",
      rationale: "Cost band uses 25%/35% utilization assumptions with resolved tariff.",
      evidenceRefs: evidenceRefs.slice(0, 8),
      photos: [],
      html: `<p><strong>What we measured</strong></p>
<table><tr><th>Metric</th><th>Value</th></tr><tr><td>Top contributors captured</td><td>${Math.max(contributors.length, 1)}</td></tr><tr><td>Estimated monthly band</td><td>AUD $${costBand.low} - AUD $${costBand.typical}</td></tr></table>
<p><strong>Assumptions used (tariff, supply, avg factors)</strong></p>
<p>Tariff used: ${tariffMeta.sourceLabel}. Rate: ${tariffMeta.rate_c_per_kwh} c/kWh, Supply: ${tariffMeta.supply_c_per_day} c/day, avg factors: ${tariffMeta.avgFactorLow} / ${tariffMeta.avgFactorTyp}, 30-day month.</p>
<p><strong>What you can do next</strong></p>
<p>Prioritize top contributor scheduling and appliance tuning first; add monitoring when recurrent peaks or uncertainty remain.</p>`,
      evidenceCoverage: "measured",
      sortKey: "enhanced.energy.finding.002",
    },
  ];
  if (includeMonitoring) {
    findings.push({
      key: "enhanced.energy.finding.monitoring-justification",
      id: "CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION",
      moduleId: "energy",
      title: "Continuous monitoring upgrade justification",
      priority: "PLAN_MONITOR",
      rationale: "Contributor concentration and load uncertainty justify monitoring to reduce decision risk.",
      evidenceRefs: evidenceRefs.slice(0, 8),
      photos: [],
      html: "<p>Continuous monitoring is recommended for sustained visibility on peak events and contributor drift.</p>",
      evidenceCoverage: "measured",
      sortKey: "enhanced.energy.finding.003",
    });
  }
  return findings;
}

export function runEnhancedEnergyEngine(
  raw: unknown,
  profile: "owner" | "investor" | "tenant",
  baselineMetrics?: BaselineLoadMetrics
): ModuleComputeOutput {
  const parsed = extractEnhancedCircuits(raw);
  const circuits = parsed.circuits ?? [];
  const rawTariff = parsed.tariff ?? {};
  const tariff = resolveTariffConfig(rawTariff);
  const estConfig = resolveEnergyEstimationConfig();
  const tariffSourceLabel: "customer provided" | "default estimate" =
    rawTariff.rate_c_per_kwh != null || rawTariff.supply_c_per_day != null ? "customer provided" : "default estimate";
  const unknownHighDraw = hasUnknownHighDraw(raw);
  const shouldRun = circuits.length >= 2 || rawTariff.rate_c_per_kwh != null || rawTariff.supply_c_per_day != null || unknownHighDraw;
  if (!shouldRun) return emptyOutput();

  const peakKW = derivePeakKw(circuits, baselineMetrics);
  const contributors = buildContributors(circuits, peakKW);
  const costBand = buildCostBand(peakKW, tariff.rate_c_per_kwh, tariff.supply_c_per_day, {
    low: estConfig.avgFactorLow,
    typ: estConfig.avgFactorTyp,
  });
  const top = contributors.slice(0, 3).map((c) => `${c.label} ${c.sharePct}%`).join(", ") || "insufficient circuit data";
  const tonePrefix =
    profile === "owner"
      ? "Action-oriented view"
      : profile === "investor"
      ? "Asset-planning view"
      : "Usage-awareness view";
  const includeMonitoring = contributors.length >= 3 || (baselineMetrics?.stressLevel === "high" || baselineMetrics?.stressLevel === "critical");
  const categories = contributors.map((c) => c.category || "");
  const evidenceRefs = [
    ...(parsed.sources?.circuits ?? []),
    ...(parsed.sources?.tariffRate ?? []),
    ...(parsed.sources?.tariffSupply ?? []),
  ];

  return {
    executiveSummaryContrib: [
      {
        key: `energy.exec.v2.${profile}.enhanced`,
        moduleId: "energy",
        text: `${tonePrefix}: peak ${round2(peakKW)} kW; top contributors ${top}. Estimated monthly band AUD $${costBand.low}-$${costBand.typical}.`,
        sortKey: "enhanced.energy.exec.001",
      },
    ],
    whatThisMeansContrib: [
      {
        key: `energy.wtm.v2.${profile}.enhanced`,
        moduleId: "energy",
        text:
          profile === "owner"
            ? "Use contributor ranking to prioritize low-disruption efficiency actions before major upgrades."
            : "Use contributor ranking to stage improvements and reduce capex timing uncertainty.",
        sortKey: "enhanced.energy.wtm.001",
      },
    ],
    capexRowsContrib: buildCapexRows(categories, includeMonitoring),
    findingsContrib: buildFindings(contributors, costBand, evidenceRefs, includeMonitoring, {
      rate_c_per_kwh: tariff.rate_c_per_kwh,
      supply_c_per_day: tariff.supply_c_per_day,
      sourceLabel: tariffSourceLabel,
      avgFactorLow: estConfig.avgFactorLow,
      avgFactorTyp: estConfig.avgFactorTyp,
    }),
  };
}

export const enhancedEnergyEngine: ReportModule = {
  id: "energy",
  name: "Enhanced Energy Engine",
  applicability: (_profile, input) => Array.isArray(input.modules) && input.modules.includes("energy"),
  compute: (context) => runEnhancedEnergyEngine(context.request.inspection?.raw, context.request.profile),
};
