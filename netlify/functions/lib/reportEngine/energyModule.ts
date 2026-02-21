import type {
  ContentContribution,
  FindingBlock,
  ModuleComputeOutput,
  ReportModule,
} from "./types";

function emptyOutput(): ModuleComputeOutput {
  return {
    executiveSummaryContrib: [],
    whatThisMeansContrib: [],
    capexRowsContrib: [],
    findingsContrib: [],
  };
}

function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    const next = (v as { value: unknown }).value;
    return extractValue(next);
  }
  return undefined;
}

function getByPath(raw: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = raw;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return extractValue(cur);
}

function getFirstValue(raw: Record<string, unknown>, candidates: string[]): { value?: string; source?: string } {
  for (const path of candidates) {
    const v = getByPath(raw, path);
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return { value: String(v).trim(), source: path };
    }
  }
  return {};
}

function parseDeviceList(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/[,;/|]/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 5);
}

type EnergySignals = {
  phaseSupply?: string;
  voltageV?: string;
  mainSwitchA?: string;
  clampLoadA?: string;
  highLoadDevices: string[];
  hasEv: boolean;
  hasSolar: boolean;
  hasBattery: boolean;
  evidenceRefs: string[];
};

function detectEnergySignals(raw: Record<string, unknown>): EnergySignals {
  const phase = getFirstValue(raw, [
    "job.supply_phase",
    "electrical.supply.phase",
    "supply.phase",
    "test_data.measured.phase",
    "measured.phase",
  ]);
  const voltage = getFirstValue(raw, [
    "electrical.supply.voltage",
    "supply.voltage",
    "test_data.measured.voltage",
    "measured.voltage",
  ]);
  const mainSwitch = getFirstValue(raw, [
    "switchboard.main_switch_rating",
    "main_switch.rating",
    "job.main_switch_rating",
    "test_data.measured.main_switch_rating",
    "measured.main_switch_rating",
  ]);
  const clampLoad = getFirstValue(raw, [
    "test_data.measured.load_current",
    "measured.load_current",
    "measured.clamp_current",
    "electrical.load_current",
  ]);

  const highLoad = getFirstValue(raw, [
    "high_load_devices",
    "loads.high_demand",
    "test_data.measured.high_load_devices",
    "measured.high_load_devices",
  ]);
  const ev = getFirstValue(raw, ["ev_charger_present", "job.ev", "loads.ev_charger"]);
  const solar = getFirstValue(raw, ["solar_present", "job.solar", "loads.solar"]);
  const battery = getFirstValue(raw, ["battery_present", "job.battery", "loads.battery"]);

  const hasEv = /^(true|yes|1|present|installed)$/i.test(ev.value || "");
  const hasSolar = /^(true|yes|1|present|installed)$/i.test(solar.value || "");
  const hasBattery = /^(true|yes|1|present|installed)$/i.test(battery.value || "");
  const highLoadDevices = parseDeviceList(highLoad.value);

  const evidenceRefs = [
    phase.source,
    voltage.source,
    mainSwitch.source,
    clampLoad.source,
    highLoad.source,
    ev.source,
    solar.source,
    battery.source,
  ].filter((x): x is string => Boolean(x));

  return {
    phaseSupply: phase.value,
    voltageV: voltage.value,
    mainSwitchA: mainSwitch.value,
    clampLoadA: clampLoad.value,
    highLoadDevices,
    hasEv,
    hasSolar,
    hasBattery,
    evidenceRefs,
  };
}

function roleExecutive(profile: string, s: EnergySignals): string {
  if (profile === "owner") {
    return `Energy-use structure signals were captured from verifiable inputs (${s.evidenceRefs.slice(0, 3).join(", ")}). This supports staged optimisation planning rather than reactive electrical decisions.`;
  }
  if (profile === "tenant") {
    return `Energy-related operating signals were recorded (${s.evidenceRefs.slice(0, 3).join(", ")}), improving usage transparency for day-to-day electrical decisions.`;
  }
  return `Energy and capacity indicators were captured from verifiable inputs (${s.evidenceRefs.slice(0, 3).join(", ")}), supporting forward planning for electrical upgrades and provisioning.`;
}

function roleWhatThisMeans(profile: string, s: EnergySignals): string {
  const loadNote = s.highLoadDevices.length > 0 ? `High-load devices noted: ${s.highLoadDevices.join(", ")}.` : "No explicit high-load device list was provided.";
  if (profile === "owner") {
    return `${loadNote} This indicates optimisation opportunities can be prioritised with evidence-first sequencing, without assuming immediate defects.`;
  }
  if (profile === "tenant") {
    return `${loadNote} This supports clearer communication on normal usage patterns and when to escalate to property management.`;
  }
  return `${loadNote} This supports capacity-aware CapEx planning, especially where future load growth (e.g. EV/air conditioning) is expected.`;
}

function buildCapexContrib(s: EnergySignals): ContentContribution[] {
  const out: ContentContribution[] = [];
  if (s.mainSwitchA || s.clampLoadA) {
    out.push({
      key: "| Year 1-2 | Capacity headroom review and load balancing | AUD $1,000 - $4,000 |",
      text: "| Year 1-2 | Capacity headroom review and load balancing | AUD $1,000 - $4,000 |",
      moduleId: "energy",
      sortKey: "energy.capex.001",
    });
  }
  if (s.hasEv || s.hasSolar || s.hasBattery) {
    out.push({
      key: "| Year 2-3 | Future-ready supply pathway for EV/Solar/Battery integration | AUD $2,000 - $8,000 |",
      text: "| Year 2-3 | Future-ready supply pathway for EV/Solar/Battery integration | AUD $2,000 - $8,000 |",
      moduleId: "energy",
      sortKey: "energy.capex.002",
    });
  }
  return out;
}

function buildFindingContrib(s: EnergySignals): FindingBlock[] {
  const findings: FindingBlock[] = [];
  if (s.mainSwitchA || s.clampLoadA || s.phaseSupply) {
    findings.push({
      key: "energy.finding.capacity-structure",
      id: "ENERGY_CAPACITY_STRUCTURE",
      moduleId: "energy",
      title: "Capacity structure and demand trend",
      priority: "RECOMMENDED_0_3_MONTHS",
      rationale: "Measured/recorded supply and load indicators suggest a structured capacity review is beneficial before future load increases.",
      evidenceRefs: s.evidenceRefs.slice(0, 4),
      photos: [],
      html: "<p>Energy module finding (shadow mode).</p>",
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
      evidenceRefs: s.evidenceRefs.slice(0, 4),
      photos: [],
      html: "<p>Energy module finding (shadow mode).</p>",
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
    const signals = detectEnergySignals(raw);

    // Evidence-driven rule: no verifiable input -> no output.
    if (signals.evidenceRefs.length === 0) {
      return emptyOutput();
    }

    const executiveSummaryContrib: ContentContribution[] = [
      {
        key: `energy.exec.${context.request.profile}`,
        text: roleExecutive(context.request.profile, signals),
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
      findingsContrib: buildFindingContrib(signals),
    };
  },
};
