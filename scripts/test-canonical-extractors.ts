import { extractBaselineLoadSignals } from "../netlify/functions/lib/report/canonical/extractBaselineLoadSignals";
import { extractAssetsEnergy } from "../netlify/functions/lib/report/canonical/extractAssetsEnergy";
import { extractEnhancedCircuits } from "../netlify/functions/lib/report/canonical/extractEnhancedCircuits";
import sampleRaw from "../docs/SAMPLE_INSPECTION_RAW_MIN.json";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function main(): void {
  const baseline = extractBaselineLoadSignals(sampleRaw as Record<string, unknown>);
  assert(baseline.phaseSupply === "single", "baseline.phaseSupply 应命中 single");
  assert((baseline.stressTest?.totalCurrentA ?? 0) > 0, "baseline totalCurrentA 应大于 0");
  assert((baseline.sources?.totalCurrentA?.length ?? 0) > 0, "baseline sources.totalCurrentA 不能为空");

  const assets = extractAssetsEnergy(sampleRaw as Record<string, unknown>);
  assert(assets.hasEv === true, "assets.hasEv 应为 true");
  assert((assets.sources?.hasEv?.length ?? 0) > 0, "assets sources.hasEv 不能为空");

  const enhanced = extractEnhancedCircuits(sampleRaw as Record<string, unknown>);
  assert(enhanced.circuits.length >= 2, "enhanced.circuits 应至少有 2 条");
  assert((enhanced.tariff?.rate_c_per_kwh ?? 0) > 0, "enhanced tariff rate 应命中");
  assert((enhanced.sources?.circuits?.length ?? 0) > 0, "enhanced sources.circuits 不能为空");

  console.log("✅ canonical extractors tests passed");
}

main();
