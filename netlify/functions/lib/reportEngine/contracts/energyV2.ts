import type { ContentContribution, FindingBlock } from "../types";

export type EnergySupplyV2 = {
  phaseSupply?: "single" | "three" | "unknown";
  voltageV?: number;
  voltageL1V?: number;
  voltageL2V?: number;
  voltageL3V?: number;
  mainSwitchA?: number;
};

export type EnergyStressTestV2 = {
  performed?: boolean;
  totalCurrentA?: number;
  currentA_L1?: number;
  currentA_L2?: number;
  currentA_L3?: number;
  durationSec?: number;
  notTestedReasons?: string[];
};

export type EnergyCircuitV2 = {
  label: string;
  measuredCurrentA: number;
  category?: string;
  evidenceCoverage: "measured" | "observed" | "declared" | "unknown";
};

export type EnergyTariffsV2 = {
  rateCPerKwh: number;
  supplyCPerDay: number;
};

export type EnergyInputV2 = {
  supply: EnergySupplyV2;
  stressTest: EnergyStressTestV2;
  circuits: EnergyCircuitV2[];
  appliances: string[];
  tariffs: EnergyTariffsV2 & { notes?: string };
};

export type EnergyMetricsV2 = {
  peakKW: number;
  stressRatio?: number;
  topContributors: Array<{ label: string; kw: number; sharePct: number }>;
  monthlyCostBand: { conservative: number; typical: number };
};

export type EnergyOutputV2 = {
  exec: ContentContribution[];
  wtm: ContentContribution[];
  capexRows: ContentContribution[];
  findings: FindingBlock[];
  metrics: EnergyMetricsV2;
};
