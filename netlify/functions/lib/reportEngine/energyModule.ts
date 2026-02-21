import type {
  ContentContribution,
  FindingBlock,
  ModuleComputeOutput,
  ReportModule,
} from "./types";
import { mapEnergyInput, type EnergyInput } from "./inputMappers/energyMapper";

function emptyOutput(): ModuleComputeOutput {
  return {
    executiveSummaryContrib: [],
    whatThisMeansContrib: [],
    capexRowsContrib: [],
    findingsContrib: [],
  };
}

function roleExecutive(profile: string, s: EnergyInput, evidenceRefs: string[]): string {
  if (profile === "owner") {
    return `Energy-use structure signals were captured from verifiable inputs (${evidenceRefs.slice(0, 3).join(", ")}). This supports staged optimisation planning rather than reactive electrical decisions.`;
  }
  if (profile === "tenant") {
    return `Energy-related operating signals were recorded (${evidenceRefs.slice(0, 3).join(", ")}), improving usage transparency for day-to-day electrical decisions.`;
  }
  return `Energy and capacity indicators were captured from verifiable inputs (${evidenceRefs.slice(0, 3).join(", ")}), supporting forward planning for electrical upgrades and provisioning.`;
}

function roleWhatThisMeans(profile: string, s: EnergyInput): string {
  const loadNote = s.highLoadDevices.length > 0 ? `High-load devices noted: ${s.highLoadDevices.join(", ")}.` : "No explicit high-load device list was provided.";
  if (profile === "owner") {
    return `${loadNote} This indicates optimisation opportunities can be prioritised with evidence-first sequencing, without assuming immediate defects.`;
  }
  if (profile === "tenant") {
    return `${loadNote} This supports clearer communication on normal usage patterns and when to escalate to property management.`;
  }
  return `${loadNote} This supports capacity-aware CapEx planning, especially where future load growth (e.g. EV/air conditioning) is expected.`;
}

function buildCapexContrib(s: EnergyInput): ContentContribution[] {
  const out: ContentContribution[] = [];
  if (s.mainSwitchA || s.clampLoadA) {
    out.push({
      key: "| Year 1-2 | Capacity headroom review and load balancing | AUD $1,000 - $4,000 |",
      rowKey: "capex:energy:capacity-headroom-review",
      text: "| Year 1-2 | Capacity headroom review and load balancing | AUD $1,000 - $4,000 |",
      moduleId: "energy",
      sortKey: "energy.capex.001",
    });
  }
  if (s.hasEv || s.hasSolar || s.hasBattery) {
    out.push({
      key: "| Year 2-3 | Future-ready supply pathway for EV/Solar/Battery integration | AUD $2,000 - $8,000 |",
      rowKey: "capex:energy:future-ready-supply-pathway",
      text: "| Year 2-3 | Future-ready supply pathway for EV/Solar/Battery integration | AUD $2,000 - $8,000 |",
      moduleId: "energy",
      sortKey: "energy.capex.002",
    });
  }
  return out;
}

function buildFindingContrib(
  s: EnergyInput,
  evidenceRefs: string[],
  evidenceCoverage: "measured" | "observed" | "declared" | "unknown"
): FindingBlock[] {
  const findings: FindingBlock[] = [];
  if (s.mainSwitchA || s.clampLoadA || s.phaseSupply) {
    findings.push({
      key: "energy.finding.capacity-structure",
      id: "ENERGY_CAPACITY_STRUCTURE",
      moduleId: "energy",
      title: "Capacity structure and demand trend",
      priority: "RECOMMENDED_0_3_MONTHS",
      rationale: "Measured/recorded supply and load indicators suggest a structured capacity review is beneficial before future load increases.",
      evidenceRefs: evidenceRefs.slice(0, 4),
      photos: [],
      html: "<p>Energy module finding (shadow mode).</p>",
      evidenceCoverage,
      score: 62,
      sortKey: "energy.finding.001",
    });
  }
  if (s.hasEv || s.hasSolar || s.hasBattery || s.highLoadDevices.length > 0) {
    findings.push({
      key: "energy.finding.future-load-pathway",
      id: "ENERGY_FUTURE_LOAD_PATHWAY",
      moduleId: "energy",
      title: "Future load pathway planning",
      priority: "PLAN_MONITOR",
      rationale: "Observed load profile suggests value in planning future integration pathways rather than handling upgrades ad hoc.",
      evidenceRefs: evidenceRefs.slice(0, 4),
      photos: [],
      html: "<p>Energy module finding (shadow mode).</p>",
      evidenceCoverage,
      score: 48,
      sortKey: "energy.finding.002",
    });
  }
  return findings;
}

export const energyModule: ReportModule = {
  id: "energy",
  name: "Energy Module",
  // Phase 4 rule: energy module activates ONLY when explicitly selected.
  applicability: (_profile, input) => Array.isArray(input.modules) && input.modules.includes("energy"),
  compute: (context) => {
    const raw = (context.request.inspection?.raw || {}) as Record<string, unknown>;
    const mapped = mapEnergyInput(raw);
    const signals = mapped.energy;

    // Evidence-driven rule: no verifiable input -> no output.
    if (!signals || mapped.evidenceRefs.length === 0) {
      return emptyOutput();
    }

    const executiveSummaryContrib: ContentContribution[] = [
      {
        key: `energy.exec.${context.request.profile}`,
        text: roleExecutive(context.request.profile, signals, mapped.evidenceRefs),
        moduleId: "energy",
        sortKey: "energy.exec.001",
      },
    ];
    const whatThisMeansContrib: ContentContribution[] = [
      {
        key: `energy.wtm.${context.request.profile}`,
        text: roleWhatThisMeans(context.request.profile, signals),
        moduleId: "energy",
        sortKey: "energy.wtm.001",
      },
    ];

    return {
      executiveSummaryContrib,
      whatThisMeansContrib,
      capexRowsContrib: buildCapexContrib(signals),
      findingsContrib: buildFindingContrib(signals, mapped.evidenceRefs, mapped.evidenceCoverage),
    };
  },
};
