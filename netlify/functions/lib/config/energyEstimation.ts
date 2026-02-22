export type EnergyEstimationConfig = {
  avgFactorLow: number;
  avgFactorTyp: number;
};

export const DEFAULT_AVG_FACTOR_LOW = 0.25;
export const DEFAULT_AVG_FACTOR_TYP = 0.35;

function parseEnvNum(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const num = Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

export function resolveEnergyEstimationConfig(): EnergyEstimationConfig {
  return {
    avgFactorLow: parseEnvNum("ENERGY_AVG_FACTOR_LOW") ?? DEFAULT_AVG_FACTOR_LOW,
    avgFactorTyp: parseEnvNum("ENERGY_AVG_FACTOR_TYP") ?? DEFAULT_AVG_FACTOR_TYP,
  };
}
