import { extractBaselineLoadSignals } from "../report/canonical/extractBaselineLoadSignals";
import type { ModuleComputeOutput } from "./types";

export type BaselineStressLevel = "low" | "moderate" | "high" | "critical" | "unknown";

export type BaselineLoadMetrics = {
  peakKW?: number;
  stressRatio?: number;
  stressLevel: BaselineStressLevel;
  headroomA?: number;
  peakCurrentA?: number;
};

function safeNumber(v?: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function toFixed(v?: number, digits = 1): string {
  if (v === undefined || !Number.isFinite(v)) return "unknown";
  return v.toFixed(digits);
}

function headroomText(headroomA?: number): string {
  return headroomA === undefined || !Number.isFinite(headroomA) ? "unknown" : `${toFixed(headroomA)} A`;
}

function calcPeakCurrent(
  totalCurrentA?: number,
  currentA_L1?: number,
  currentA_L2?: number,
  currentA_L3?: number
): number | undefined {
  const values = [safeNumber(totalCurrentA), safeNumber(currentA_L1), safeNumber(currentA_L2), safeNumber(currentA_L3)]
    .filter((x): x is number => x !== undefined);
  if (values.length === 0) return undefined;
  return Math.max(...values);
}

function calcPeakKW(signal: ReturnType<typeof extractBaselineLoadSignals>): number | undefined {
  const st = signal.stressTest ?? {};
  const phase = signal.phaseSupply ?? "unknown";
  if (phase === "three") {
    const v1 = safeNumber(signal.voltageV);
    const v2 = safeNumber(signal.voltageV);
    const v3 = safeNumber(signal.voltageV);
    const a1 = safeNumber(st.currentA_L1);
    const a2 = safeNumber(st.currentA_L2);
    const a3 = safeNumber(st.currentA_L3);
    const terms = [
      v1 !== undefined && a1 !== undefined ? (v1 * a1) / 1000 : undefined,
      v2 !== undefined && a2 !== undefined ? (v2 * a2) / 1000 : undefined,
      v3 !== undefined && a3 !== undefined ? (v3 * a3) / 1000 : undefined,
    ].filter((x): x is number => x !== undefined);
    if (terms.length > 0) return terms.reduce((s, n) => s + n, 0);
  }
  const voltage = safeNumber(signal.voltageV);
  const current = safeNumber(st.totalCurrentA);
  if (voltage !== undefined && current !== undefined) return (voltage * current) / 1000;
  return undefined;
}

function classifyStress(ratio?: number): BaselineStressLevel {
  if (ratio === undefined || !Number.isFinite(ratio)) return "unknown";
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.8) return "high";
  if (ratio >= 0.6) return "moderate";
  return "low";
}

export function runBaselineLoadEngine(raw: unknown): { output: ModuleComputeOutput; metrics: BaselineLoadMetrics } {
  const signal = extractBaselineLoadSignals(raw);
  const st = signal.stressTest ?? {};
  const peakCurrentA = calcPeakCurrent(st.totalCurrentA, st.currentA_L1, st.currentA_L2, st.currentA_L3);
  const stressRatio =
    signal.mainSwitchA && peakCurrentA !== undefined && signal.mainSwitchA > 0
      ? peakCurrentA / signal.mainSwitchA
      : undefined;
  const stressLevel = classifyStress(stressRatio);
  const peakKW = calcPeakKW(signal);
  const headroomA =
    signal.mainSwitchA !== undefined && peakCurrentA !== undefined ? Math.max(signal.mainSwitchA - peakCurrentA, 0) : undefined;

  const hasEvidence =
    signal.mainSwitchA !== undefined ||
    signal.voltageV !== undefined ||
    peakCurrentA !== undefined ||
    (signal.sources && Object.keys(signal.sources).length > 0);

  const html = hasEvidence
    ? `<h3>Asset Component</h3><p>Load baseline and switchboard capacity</p>
<h3>Observed Condition</h3><table><tr><th>Phase</th><th>Voltage(V)</th><th>Main Switch(A)</th><th>Peak Current(A)</th><th>Peak kW</th><th>Stress Level</th><th>Coverage</th></tr>
<tr><td>${signal.phaseSupply ?? "unknown"}</td><td>${toFixed(signal.voltageV)}</td><td>${toFixed(signal.mainSwitchA)}</td><td>${toFixed(peakCurrentA)}</td><td>${toFixed(peakKW, 2)}</td><td>${stressLevel}</td><td>${signal.coverage ?? "unknown"}</td></tr>
</table></p>
<h3>Evidence</h3><p>${Object.values(signal.sources ?? {}).flat().join(", ") || "not provided"}</p>
<h3>Risk Interpretation</h3><p>Baseline stress indicates current headroom and upgrade urgency.</p>
<h3>Priority Classification</h3><p>${stressLevel === "high" || stressLevel === "critical" ? "Recommended 0-3 months" : "Plan / Monitor"}</p>
<h3>Budgetary Planning Range</h3><p>${stressLevel === "high" || stressLevel === "critical" ? "Capacity planning review recommended." : "Monitor under normal operating conditions."}</p>`
    : `<h3>Asset Component</h3><p>Load baseline and switchboard capacity</p>
<h3>Observed Condition</h3><p>Insufficient evidence to derive baseline stress metrics.</p>
<h3>Evidence</h3><p>Insufficient evidence</p>
<h3>Risk Interpretation</h3><p>Stress level cannot be verified until baseline load and switchboard ratings are measured.</p>
<h3>Priority Classification</h3><p>Plan / Monitor</p>
<h3>Budgetary Planning Range</h3><p>TBD after baseline stress test.</p>`;

  const output: ModuleComputeOutput = {
    executiveSummaryContrib: [
      {
        key: "baseline.exec.load",
        moduleId: "energy",
        text: hasEvidence
          ? `Peak load: ${toFixed(peakKW, 2)} kW (${toFixed(peakCurrentA)} A) • Stress: ${stressLevel} • Headroom: ${headroomText(headroomA)}`
          : "Baseline load evidence: insufficient — recommended to complete stress test",
        sortKey: "baseline:exec:01",
      },
    ],
    whatThisMeansContrib: [],
    capexRowsContrib:
      stressLevel === "high" || stressLevel === "critical"
        ? [
            {
              key: "baseline.capex.capacity_planning_review",
              moduleId: "energy",
              rowKey: "capex:energy:capacity-planning-review",
              text: "Capacity planning review | Verify headroom, phase balance, and upgrade pathway | TBD",
              amountIsTbd: true,
            },
          ]
        : [],
    findingsContrib: [
      {
        key: "LOAD_STRESS_TEST_RESULT",
        id: "LOAD_STRESS_TEST_RESULT",
        moduleId: "energy",
        title: "Load stress test (baseline)",
        priority: stressLevel === "high" || stressLevel === "critical" ? "RECOMMENDED_0_3_MONTHS" : "PLAN_MONITOR",
        rationale: hasEvidence
          ? "Baseline stress metrics are derived from measured/current available switchboard and load signals."
          : "No reliable load baseline signals were available.",
        evidenceRefs: Object.values(signal.sources ?? {}).flat(),
        photos: [],
        html,
        evidenceCoverage: signal.coverage ?? "unknown",
        sortKey: "baseline:finding:load-stress",
      },
    ],
  };

  return {
    output,
    metrics: {
      peakKW,
      stressRatio,
      stressLevel,
      headroomA,
      peakCurrentA,
    },
  };
}
