import type {
  ContentContribution,
  FindingBlock,
  ModuleComputeOutput,
  ReportModule,
} from "./types";
import { mapLifecycleInput, type LifecycleSignals } from "./inputMappers/lifecycleMapper";

function emptyOutput(): ModuleComputeOutput {
  return {
    executiveSummaryContrib: [],
    whatThisMeansContrib: [],
    capexRowsContrib: [],
    findingsContrib: [],
  };
}

function executiveContrib(profile: string, s: LifecycleSignals): ContentContribution[] {
  const out: ContentContribution[] = [];
  if (s.propertyAgeBand === "pre-1970" || s.propertyAgeBand === "1970-1990") {
    out.push({
      key: "lifecycle.exec.age-window",
      text: "Electrical assets may be approaching end-of-life; a condition review window of 6–12 months is advisable.",
      moduleId: "lifecycle",
      sortKey: "lifecycle.exec.001",
      importance: "normal",
    });
  }
  if (s.switchboardType === "ceramic_fuse" || s.switchboardType === "rewireable_fuse") {
    out.push({
      key: "lifecycle.exec.legacy-switchboard-window",
      text: "Switchboard technology indicates legacy-era components; upgrade planning within 0–12 months is advisable, subject to site validation.",
      moduleId: "lifecycle",
      sortKey: "lifecycle.exec.002",
      importance: "critical",
      allowDuplicates: true,
    });
  }
  if (s.rcdCoverage === "none" || s.rcdCoverage === "partial") {
    out.push({
      key: `lifecycle.exec.rcd-${s.rcdCoverage}`,
      text: "RCD coverage profile is a lifecycle risk multiplier; staged uplift planning is advisable with conditional trigger-based review.",
      moduleId: "lifecycle",
      sortKey: "lifecycle.exec.003",
      importance: "normal",
    });
  }
  if (out.length === 0 && profile === "tenant") {
    out.push({
      key: "lifecycle.exec.tenant-transparency",
      text: "Lifecycle indicators are currently limited; maintain transparent records and trigger review when operating conditions change.",
      moduleId: "lifecycle",
      sortKey: "lifecycle.exec.999",
      importance: "normal",
    });
  }
  return out;
}

function whatThisMeans(profile: string, s: LifecycleSignals): ContentContribution[] {
  if (profile === "owner") {
    return [
      {
        key: "lifecycle.wtm.owner.1",
        text: "- Align major appliance additions (e.g. air conditioning or EV charging) with a pre-upgrade condition review window.",
        moduleId: "lifecycle",
        sortKey: "lifecycle.wtm.001",
      },
      {
        key: "lifecycle.wtm.owner.2",
        text: "- If recurring trips, thermal stress, or scorch indicators appear, move from planning to near-term review.",
        moduleId: "lifecycle",
        sortKey: "lifecycle.wtm.002",
      },
    ];
  }
  if (profile === "tenant") {
    return [
      {
        key: "lifecycle.wtm.tenant.1",
        text: "- Keep usage observations transparent; report repeated tripping, heat/smell events, or visible deterioration to property management.",
        moduleId: "lifecycle",
        sortKey: "lifecycle.wtm.001",
      },
      {
        key: "lifecycle.wtm.tenant.2",
        text: "- Trigger a formal review if conditions shift from occasional inconvenience to repeated interruptions.",
        moduleId: "lifecycle",
        sortKey: "lifecycle.wtm.002",
      },
    ];
  }
  return [
    {
      key: "lifecycle.wtm.investor.1",
      text: "- Plan a lifecycle review window (typically 6–12 months for legacy indicators) to avoid reactive upgrade decisions.",
      moduleId: "lifecycle",
      sortKey: "lifecycle.wtm.001",
    },
    {
      key: "lifecycle.wtm.investor.2",
      text: "- Trigger earlier reassessment if trip frequency increases, thermal stress appears, or legacy switchboard indicators worsen.",
      moduleId: "lifecycle",
      sortKey: "lifecycle.wtm.002",
    },
  ];
}

function capexRows(s: LifecycleSignals): ContentContribution[] {
  const out: ContentContribution[] = [];
  if (s.switchboardType === "ceramic_fuse" || s.switchboardType === "rewireable_fuse" || s.switchboardType === "old_cb") {
    out.push({
      key: "| Year 0-1 | Switchboard modernisation planning (scope dependent) | TBD |",
      rowKey: "capex:lifecycle:switchboard-modernisation-planning",
      text: "| Year 0-1 | Switchboard modernisation planning (scope dependent) | TBD |",
      moduleId: "lifecycle",
      sortKey: "lifecycle.capex.001",
    });
  }
  if (s.rcdCoverage === "none" || s.rcdCoverage === "partial") {
    out.push({
      key: "| Year 1-2 | RCD/RCBO coverage uplift planning | TBD |",
      rowKey: "capex:lifecycle:rcd-rcbo-coverage-uplift",
      text: "| Year 1-2 | RCD/RCBO coverage uplift planning | TBD |",
      moduleId: "lifecycle",
      sortKey: "lifecycle.capex.002",
    });
  }
  if (s.propertyAgeBand === "pre-1970" || s.propertyAgeBand === "1970-1990") {
    out.push({
      key: "| Year 3-5 | Legacy wiring refresh pathway review (condition dependent) | TBD |",
      rowKey: "capex:lifecycle:legacy-wiring-refresh-pathway",
      text: "| Year 3-5 | Legacy wiring refresh pathway review (condition dependent) | TBD |",
      moduleId: "lifecycle",
      sortKey: "lifecycle.capex.003",
    });
  }
  return out;
}

function findings(s: LifecycleSignals, evidenceCoverage: "measured" | "observed" | "declared" | "unknown"): FindingBlock[] {
  const out: FindingBlock[] = [];

  if (s.switchboardType !== "unknown") {
    out.push({
      key: "lifecycle.finding.legacy-switchboard",
      id: "LIFECYCLE_LEGACY_SWITCHBOARD",
      moduleId: "lifecycle",
      title: "Legacy-era switchboard indicators",
      priority: s.switchboardType === "ceramic_fuse" || s.switchboardType === "rewireable_fuse"
        ? "RECOMMENDED_0_3_MONTHS"
        : "PLAN_MONITOR",
      rationale:
        "Observed switchboard characteristics indicate legacy component age. If thermal signs, repeated trips, or insulation deterioration appear, then priority should escalate to near-term review.",
      evidenceRefs: s.evidenceRefs.slice(0, 6),
      photos: s.evidenceRefs.slice(0, 3),
      html: [
        "<h4>Asset Component</h4><p>Main switchboard and protective devices</p>",
        `<h4>Observed Condition</h4><p>Switchboard type observed: ${s.switchboardType}.</p>`,
        "<h4>Risk Interpretation</h4><p>If additional stress indicators emerge, then lifecycle risk can move from planned to near-term action.</p>",
        "<h4>Evidence</h4><p>Evidence references attached in lifecycle signal mapping.</p>",
      ].join(""),
      evidenceCoverage,
      score: 66,
      sortKey: "lifecycle.finding.001",
    });
  }

  if (s.rcdCoverage === "none" || s.rcdCoverage === "partial") {
    out.push({
      key: "lifecycle.finding.rcd-coverage-gap",
      id: "LIFECYCLE_RCD_COVERAGE_GAP",
      moduleId: "lifecycle",
      title: "RCD coverage gaps as lifecycle risk multiplier",
      priority: "RECOMMENDED_0_3_MONTHS",
      rationale:
        "Current RCD coverage indicates staged modernization need. If additional high-load usage or repeated trip events occur, then earlier intervention planning is advisable.",
      evidenceRefs: s.evidenceRefs.slice(0, 6),
      photos: s.evidenceRefs.slice(0, 3),
      html: [
        "<h4>Asset Component</h4><p>Residual current protection coverage</p>",
        `<h4>Observed Condition</h4><p>RCD coverage observed as ${s.rcdCoverage}.</p>`,
        "<h4>Risk Interpretation</h4><p>If fault exposure context changes, then lifecycle planning window should tighten.</p>",
        "<h4>Evidence</h4><p>Coverage state derived from mapped checklist/test fields.</p>",
      ].join(""),
      evidenceCoverage,
      score: 64,
      sortKey: "lifecycle.finding.002",
    });
  }

  if (s.visibleThermalStress === true || s.mixedWiringIndicators === true) {
    out.push({
      key: "lifecycle.finding.thermal-or-mixed-trigger",
      id: "LIFECYCLE_THERMAL_OR_MIXED_TRIGGER",
      moduleId: "lifecycle",
      title: "Thermal stress or mixed-era wiring trigger",
      priority: "RECOMMENDED_0_3_MONTHS",
      rationale:
        "Observed stress/mixed-era indicators suggest reduced planning flexibility. If these indicators recur or intensify, then the review window should move to early action.",
      evidenceRefs: s.evidenceRefs.slice(0, 6),
      photos: s.evidenceRefs.slice(0, 3),
      html: [
        "<h4>Asset Component</h4><p>Wiring condition and thermal visual indicators</p>",
        `<h4>Observed Condition</h4><p>Visible thermal stress: ${String(s.visibleThermalStress)}; mixed wiring indicators: ${String(s.mixedWiringIndicators)}.</p>`,
        "<h4>Risk Interpretation</h4><p>If stress indicators continue under similar load conditions, then escalation from monitoring to near-term planning is advisable.</p>",
        "<h4>Evidence</h4><p>Evidence references attached in lifecycle signal mapping.</p>",
      ].join(""),
      evidenceCoverage,
      score: 68,
      sortKey: "lifecycle.finding.003",
    });
  }

  return out.slice(0, 5);
}

export const lifecycleModule: ReportModule = {
  id: "lifecycle",
  name: "Lifecycle Module",
  // Phase 5 rule: explicit module selection + meaningful lifecycle signals.
  applicability: (_profile, input) => {
    if (!Array.isArray(input.modules) || !input.modules.includes("lifecycle")) return false;
    const raw = (input.inspection?.raw || {}) as Record<string, unknown>;
    const mapped = mapLifecycleInput(raw);
    const s = mapped.lifecycle;
    if (!s) return false;
    return s.propertyAgeBand !== "unknown" || s.switchboardType !== "unknown" || mapped.evidenceRefs.length > 0;
  },
  compute: (context) => {
    const raw = (context.request.inspection?.raw || {}) as Record<string, unknown>;
    const mapped = mapLifecycleInput(raw);
    const s = mapped.lifecycle;
    if (!s) return emptyOutput();

    const executiveSummaryContrib = executiveContrib(context.request.profile, s);
    const whatThisMeansContrib = whatThisMeans(context.request.profile, s);
    const capexRowsContrib = capexRows(s);
    const findingsContrib = findings(s, mapped.evidenceCoverage);

    // no evidence -> no output
    if (
      mapped.evidenceRefs.length === 0 &&
      s.propertyAgeBand === "unknown" &&
      s.switchboardType === "unknown"
    ) {
      return emptyOutput();
    }

    return {
      executiveSummaryContrib,
      whatThisMeansContrib,
      capexRowsContrib,
      findingsContrib,
    };
  },
};
