export type TariffConfig = {
  rate_c_per_kwh: number;
  supply_c_per_day: number;
  notes: string;
};

export const DEFAULT_TARIFF: TariffConfig = {
  rate_c_per_kwh: 40,
  supply_c_per_day: 120,
  notes: "Estimated tariff assumptions for monthly banding. Actual bill depends on retailer plan and usage profile.",
};

function parseEnvNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function resolveTariffConfig(rawTariff?: Partial<TariffConfig>): TariffConfig {
  const envRate = parseEnvNumber("ENERGY_RATE_C_PER_KWH");
  const envSupply = parseEnvNumber("ENERGY_SUPPLY_C_PER_DAY");
  return {
    rate_c_per_kwh: rawTariff?.rate_c_per_kwh ?? envRate ?? DEFAULT_TARIFF.rate_c_per_kwh,
    supply_c_per_day: rawTariff?.supply_c_per_day ?? envSupply ?? DEFAULT_TARIFF.supply_c_per_day,
    notes: DEFAULT_TARIFF.notes,
  };
}
