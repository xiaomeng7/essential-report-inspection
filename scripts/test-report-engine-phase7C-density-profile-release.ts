import fs from "fs";
import path from "path";
import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";
import { applyMergedOverrides } from "../netlify/functions/lib/reportEngine/injection/applyMergedOverrides";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_PHASE7C",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

function baselineTemplateData(): Record<string, string> {
  return {
    FINDING_PAGES_HTML: "<p>Legacy findings html</p>",
    CAPEX_TABLE_ROWS: "| Year 1-2 | Legacy row | AUD $1,000 - $2,000 |",
    CAPEX_SNAPSHOT: "AUD $1,000 - $2,000",
    EXECUTIVE_DECISION_SIGNALS: "• Legacy executive signal",
    WHAT_THIS_MEANS_SECTION: "Legacy what-this-means",
  };
}

function normalizeSummary(summary: Record<string, unknown>): string {
  return JSON.stringify(summary, null, 2) + "\n";
}

function writeOrAssertSnapshot(snapshotPath: string, summary: Record<string, unknown>): void {
  const content = normalizeSummary(summary);
  const update = process.env.UPDATE_SNAPSHOTS === "1";
  if (update || !fs.existsSync(snapshotPath)) {
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, content, "utf8");
    return;
  }
  const existing = fs.readFileSync(snapshotPath, "utf8");
  assert(existing === content, `Snapshot mismatch: ${snapshotPath}`);
}

function runFindingsInjectionScenario(params: {
  name: string;
  profile: "investor" | "owner" | "tenant";
  modules?: Array<"energy" | "lifecycle" | "safety" | "capacity">;
  density?: "compact" | "standard" | "detailed";
  hasExplicitModules: boolean;
  injectFindings: boolean;
  raw: Record<string, unknown>;
}) {
  const plan = buildReportPlan({
    inspection: makeInspection(params.raw),
    profile: params.profile,
    modules: params.modules,
    options: { narrativeDensity: params.density || "standard" },
  });
  const override = applyMergedOverrides(baselineTemplateData(), plan, {
    mode: "legacy",
    injection: { findings: params.injectFindings },
    hasExplicitModules: params.hasExplicitModules,
    inspectionId: "TEST_PHASE7C",
    baseUrl: "https://example.test",
    signingSecret: "secret-for-tests",
  });
  const html = String(override.templateData.FINDING_PAGES_HTML || "");
  return {
    name: params.name,
    profile: params.profile,
    modules: params.modules || [],
    density: params.density || "standard",
    mergedFindingsCount: plan.merged.findings.length,
    mergedModuleOrder: plan.merged.findings.map((f) => f.moduleId),
    slotSource: override.slotSourceMap.FINDING_PAGES_HTML,
    hasSentinel: html.includes("SENTINEL_FINDINGS_V1"),
    pageBreakCount: (html.match(/page-break-before:always/g) || []).length,
  };
}

function testDensityAndProfileOrdering(): void {
  const rawCombined = {
    property: { age_band: { value: "1970-1990" } },
    switchboard: { type: { value: "rewireable fuse" }, main_switch_rating: { value: "63A" } },
    rcd_coverage: { value: "partial" },
    visible_thermal_stress: { value: "yes" },
    lifecycle: { photo_ids: ["P701", "P702"] },
    measured: { load_current: { value: "47" }, high_load_devices: { value: "EV charger, AC" } },
    loads: { ev_charger: { value: "yes" } },
  };

  const ownerCompact = runFindingsInjectionScenario({
    name: "owner-compact-order",
    profile: "owner",
    modules: ["energy", "lifecycle"],
    density: "compact",
    hasExplicitModules: true,
    injectFindings: true,
    raw: rawCombined,
  });
  const ownerDetailed = runFindingsInjectionScenario({
    name: "owner-detailed-order",
    profile: "owner",
    modules: ["energy", "lifecycle"],
    density: "detailed",
    hasExplicitModules: true,
    injectFindings: true,
    raw: rawCombined,
  });
  const tenantDetailed = runFindingsInjectionScenario({
    name: "tenant-detailed-order",
    profile: "tenant",
    modules: ["energy", "lifecycle"],
    density: "detailed",
    hasExplicitModules: true,
    injectFindings: true,
    raw: rawCombined,
  });

  assert(
    ownerCompact.mergedFindingsCount <= ownerDetailed.mergedFindingsCount,
    "compact findings count should not exceed detailed findings count"
  );
  assert(ownerDetailed.slotSource.source === "merged", "owner detailed findings should be merged");
  assert(tenantDetailed.slotSource.source === "merged", "tenant detailed findings should be merged");

  const ownerFirstModule = ownerDetailed.mergedModuleOrder[0];
  const tenantFirstModule = tenantDetailed.mergedModuleOrder[0];
  assert(
    ownerFirstModule === "energy" || ownerFirstModule === "lifecycle",
    "owner profile merged module order should start with a known module"
  );
  assert(tenantFirstModule === "lifecycle", "tenant profile should prioritize lifecycle module findings first");
}

function main(): void {
  testDensityAndProfileOrdering();

  const investorBaseline = runFindingsInjectionScenario({
    name: "investor-baseline-legacy",
    profile: "investor",
    hasExplicitModules: false,
    injectFindings: true,
    raw: { property: { age_band: { value: "post-2010" } } },
  });
  const ownerEnergy = runFindingsInjectionScenario({
    name: "owner-energy-findings",
    profile: "owner",
    modules: ["energy"],
    density: "standard",
    hasExplicitModules: true,
    injectFindings: true,
    raw: {
      measured: { load_current: { value: "44" }, high_load_devices: { value: "EV charger, AC" } },
      switchboard: { main_switch_rating: { value: "63A" } },
      loads: { ev_charger: { value: "yes" } },
    },
  });
  const tenantLifecycle = runFindingsInjectionScenario({
    name: "tenant-lifecycle-findings",
    profile: "tenant",
    modules: ["lifecycle"],
    density: "standard",
    hasExplicitModules: true,
    injectFindings: true,
    raw: {
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "old cb" } },
      lifecycle: { photo_ids: ["P711"] },
    },
  });
  const ownerEnergyLifecycleAll = runFindingsInjectionScenario({
    name: "owner-energy-lifecycle-capex-findings-all",
    profile: "owner",
    modules: ["energy", "lifecycle"],
    density: "detailed",
    hasExplicitModules: true,
    injectFindings: true,
    raw: {
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "rewireable fuse" }, main_switch_rating: { value: "80A" } },
      rcd_coverage: { value: "partial" },
      visible_thermal_stress: { value: "yes" },
      lifecycle: { photo_ids: ["P731", "P732"] },
      measured: { load_current: { value: "58" }, high_load_devices: { value: "EV charger, ducted AC, pool pump" } },
      loads: { ev_charger: { value: "yes" }, solar: { value: "yes" }, battery: { value: "yes" } },
    },
  });
  const tenantLifecycleNoEvidence = runFindingsInjectionScenario({
    name: "tenant-lifecycle-findings-no-evidence",
    profile: "tenant",
    modules: ["lifecycle"],
    density: "standard",
    hasExplicitModules: true,
    injectFindings: true,
    raw: {
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "old cb" } },
      // explicit no photo_ids path
      lifecycle: { photo_ids: [] },
    },
  });

  const fixturesDir = path.join(process.cwd(), "scripts", "fixtures", "report-engine-phase7c");
  writeOrAssertSnapshot(path.join(fixturesDir, "investor-baseline-legacy.json"), investorBaseline);
  writeOrAssertSnapshot(path.join(fixturesDir, "owner-energy-findings.json"), ownerEnergy);
  writeOrAssertSnapshot(path.join(fixturesDir, "tenant-lifecycle-findings.json"), tenantLifecycle);
  writeOrAssertSnapshot(path.join(fixturesDir, "owner-energy-lifecycle-capex-findings-all.json"), ownerEnergyLifecycleAll);
  writeOrAssertSnapshot(path.join(fixturesDir, "tenant-lifecycle-findings-no-evidence.json"), tenantLifecycleNoEvidence);

  console.log("✅ Phase7C density/profile release tests passed");
}

main();
