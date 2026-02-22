import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeInspection(raw: Record<string, unknown>) {
  return {
    inspection_id: "TEST_PHASE5_LIFECYCLE",
    findings: [],
    limitations: [],
    raw,
  } as any;
}

function testDefaultNoLifecycle(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "pre-1970" } },
      switchboard: { type: { value: "ceramic fuse" } },
    }),
    profile: "investor",
  });

  const hasLifecycle =
    plan.merged.executiveSummary.some((x) => x.key.startsWith("lifecycle.")) ||
    plan.merged.whatThisMeans.some((x) => x.key.startsWith("lifecycle.")) ||
    plan.merged.capexRows.some((x) => x.key.startsWith("lifecycle.")) ||
    plan.merged.findings.some((x) => x.key.startsWith("lifecycle."));
  assert(!hasLifecycle, "Lifecycle should not activate without explicit selection");
}

function testExplicitLifecycleDeterminism(): void {
  const req = {
    inspection: makeInspection({
      property: { age_band: { value: "1970-1990" } },
      switchboard: { type: { value: "rewireable fuse" } },
      rcd_coverage: { value: "partial" },
      visible_thermal_stress: { value: "yes" },
      lifecycle: { photo_ids: ["P11", "P12"] },
    }),
    profile: "investor" as const,
    modules: ["lifecycle"] as const,
  };

  const a = JSON.stringify(buildReportPlan(req).merged);
  const b = JSON.stringify(buildReportPlan(req).merged);
  assert(a === b, "Lifecycle merged output should be deterministic");

  const plan = buildReportPlan(req);
  assert(plan.merged.findings.length > 0, "Lifecycle findings should exist when explicitly selected");
}

function testProfileDifference(): void {
  const inspection = makeInspection({
    property: { age_band: { value: "1970-1990" } },
    switchboard: { type: { value: "old cb" } },
    lifecycle: { photo_ids: ["P21"] },
  });

  const investor = buildReportPlan({
    inspection,
    profile: "investor",
    modules: ["lifecycle"],
  });
  const owner = buildReportPlan({
    inspection,
    profile: "owner",
    modules: ["lifecycle"],
  });

  const investorText = investor.merged.whatThisMeans.map((x) => x.text).join("\n");
  const ownerText = owner.merged.whatThisMeans.map((x) => x.text).join("\n");
  assert(investorText !== ownerText, "Investor and Owner lifecycle whatThisMeans should differ");
}

function testForbiddenTokens(): void {
  const plan = buildReportPlan({
    inspection: makeInspection({
      property: { age_band: { value: "pre-1970" } },
      switchboard: { type: { value: "ceramic fuse" } },
      lifecycle: { photo_ids: ["P31"] },
    }),
    profile: "investor",
    modules: ["lifecycle"],
  });

  const forbidden = [/\bmust\b/i, /\bguarantee\b/i, /\b100%\b/i];
  const corpus = [
    ...plan.merged.executiveSummary.map((x) => x.text),
    ...plan.merged.whatThisMeans.map((x) => x.text),
    ...plan.merged.findings.map((x) => x.rationale),
  ].join("\n");
  for (const rule of forbidden) {
    assert(!rule.test(corpus), `Forbidden lifecycle token found: ${rule}`);
  }
}

function main(): void {
  testDefaultNoLifecycle();
  testExplicitLifecycleDeterminism();
  testProfileDifference();
  testForbiddenTokens();
  console.log("✅ Phase5 Lifecycle tests passed");
}

main();
