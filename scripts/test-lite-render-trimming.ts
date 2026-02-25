/**
 * Tests: when productIntent is "lite", profileRenderMerged filters findings to the
 * allowed set and trims executive summary with CTA.
 */
import type { ContentContribution, FindingBlock } from "../netlify/functions/lib/reportEngine/types";
import { profileRenderMerged } from "../netlify/functions/lib/reportEngine/profileRenderer";

const LITE_ALLOWED_IDS = new Set([
  "LOAD_STRESS_TEST_RESULT",
  "ESTIMATED_COST_BAND",
  "DISTRIBUTED_ENERGY_ASSETS_OVERVIEW",
  "CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION",
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeFinding(id: string): FindingBlock {
  return {
    id,
    key: `energy:${id}`,
    title: id,
    moduleId: "energy",
    bullets: [],
    priority: "PLAN_MONITOR",
  };
}

function testLiteFiltersFindings(): void {
  const merged = {
    executiveSummary: [
      { key: "a", text: "A", moduleId: "energy", importance: "normal" as const },
      { key: "b", text: "B", moduleId: "energy", importance: "normal" as const },
    ] as ContentContribution[],
    whatThisMeans: [] as ContentContribution[],
    capexRows: [] as ContentContribution[],
    findings: [
      makeFinding("LOAD_STRESS_TEST_RESULT"),
      makeFinding("ESTIMATED_COST_BAND"),
      makeFinding("CIRCUIT_CONTRIBUTION_BREAKDOWN"),
      makeFinding("DISTRIBUTED_ENERGY_ASSETS_OVERVIEW"),
    ],
  };
  const out = profileRenderMerged("owner", merged, "lite");
  assert(out.findings.length === 3, "lite should keep only allowed findings (3)");
  assert(
    out.findings.every((f) => LITE_ALLOWED_IDS.has(f.id)),
    "all remaining findings must be in allowed set"
  );
  assert(
    !out.findings.some((f) => f.id === "CIRCUIT_CONTRIBUTION_BREAKDOWN"),
    "CIRCUIT_CONTRIBUTION_BREAKDOWN should be filtered out for lite"
  );
}

function testLiteExecutiveHasCta(): void {
  const merged = {
    executiveSummary: [
      { key: "baseline.exec.load", text: "Baseline.", moduleId: "energy", importance: "normal" as const },
      { key: "x", text: "X", moduleId: "energy", importance: "normal" as const },
    ] as ContentContribution[],
    whatThisMeans: [] as ContentContribution[],
    capexRows: [] as ContentContribution[],
    findings: [makeFinding("LOAD_STRESS_TEST_RESULT")],
  };
  const out = profileRenderMerged("owner", merged, "lite");
  const cta = out.executiveSummary.find((c) => (c as { key?: string }).key === "lite.cta");
  assert(cta != null, "lite executive must include lite.cta line");
  assert(
    typeof (cta as { text?: string }).text === "string" &&
      (cta as { text?: string }).text!.includes("Energy Advisory Pro"),
    "CTA should mention upgrade to Pro"
  );
}

function testNonLiteUnchanged(): void {
  const merged = {
    executiveSummary: [{ key: "a", text: "A", moduleId: "energy", importance: "normal" as const }],
    whatThisMeans: [],
    capexRows: [],
    findings: [
      makeFinding("LOAD_STRESS_TEST_RESULT"),
      makeFinding("CIRCUIT_CONTRIBUTION_BREAKDOWN"),
    ],
  };
  const out = profileRenderMerged("owner", merged);
  assert(out.findings.length === 2, "owner without lite should keep all findings");
  assert(
    out.findings.some((f) => f.id === "CIRCUIT_CONTRIBUTION_BREAKDOWN"),
    "CIRCUIT_CONTRIBUTION_BREAKDOWN should remain for non-lite"
  );
}

function main(): void {
  testLiteFiltersFindings();
  testLiteExecutiveHasCta();
  testNonLiteUnchanged();
  console.log("✅ lite render trimming tests passed");
}

main();
