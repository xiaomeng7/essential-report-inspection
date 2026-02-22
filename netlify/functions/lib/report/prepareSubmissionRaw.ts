import { normalizeSnapshotIntake } from "./snapshotContract";
import { normalizeEnergyV2 } from "./normalizeEnergyV2";
import { extractAssetsEnergy } from "./extractAssetsEnergy";

export function prepareSubmissionRaw(input: Record<string, unknown>): Record<string, unknown> {
  const raw = { ...input };
  raw.snapshot_intake = normalizeSnapshotIntake(raw);
  raw.energy_v2 = normalizeEnergyV2(raw);
  if (raw.assets_energy == null || typeof raw.assets_energy !== "object") {
    raw.assets_energy = extractAssetsEnergy(raw);
  }
  return raw;
}
