import { buildReportPlan } from "../netlify/functions/lib/reportEngine/engine";
import { moduleRegistry } from "../netlify/functions/lib/reportEngine/modules";
import type { ModuleComputeOutput } from "../netlify/functions/lib/reportEngine/types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function priorityRank(priority?: string): number {
  const p = (priority || "").toUpperCase();
  if (p === "IMMEDIATE" || p === "URGENT") return 1;
  if (p === "RECOMMENDED" || p === "RECOMMENDED_0_3_MONTHS") return 2;
  if (p === "PLAN" || p === "PLAN_MONITOR") return 3;
  return 99;
}

function mockOutput(
  id: "safety" | "capacity" | "energy" | "lifecycle"
): ModuleComputeOutput {
  if (id === "safety") {
    return {
      executiveSummaryContrib: [
        { key: "exec.safety.1", text: "Safety baseline remains stable." },
        { key: "exec.shared.dupe", text: "Shared duplicate sentence." },
      ],
      whatThisMeansContrib: [
        { key: "wtm.safety.1", text: "Safety first for occupancy confidence." },
      ],
      capexRowsContrib: [
        { key: "| Year 1 | RCD upgrade | AUD $500 - $1,500 |", text: "| Year 1 | RCD upgrade | AUD $500 - $1,500 |" },
      ],
      findingsContrib: [
        {
          key: "finding.safety.immediate.1",
          id: "F_SAFETY_1",
          moduleId: "safety",
          title: "Main switchboard thermal concern",
          priority: "IMMEDIATE",
          rationale: "Immediate safety action required.",
          evidenceRefs: [],
          photos: ["P01"],
          html: "<p>Safety finding</p>",
          score: 95,
          sortKey: "A",
        },
      ],
    };
  }
  if (id === "capacity") {
    return {
      executiveSummaryContrib: [
        { key: "exec.capacity.1", text: "Capacity headroom is constrained." },
        { key: "exec.shared.dupe", text: "Shared duplicate sentence." },
      ],
      whatThisMeansContrib: [
        { key: "wtm.capacity.1", text: "Prioritise planned capacity upgrades." },
      ],
      capexRowsContrib: [
        { key: "| Year 2-3 | Sub-board expansion | AUD $2,000 - $5,000 |", text: "| Year 2-3 | Sub-board expansion | AUD $2,000 - $5,000 |" },
        { key: "| Year 1 | RCD upgrade | AUD $500 - $1,500 |", text: "| Year 1 | RCD upgrade | AUD $500 - $1,500 |" },
      ],
      findingsContrib: [
        {
          key: "finding.capacity.recommended.1",
          id: "F_CAPACITY_1",
          moduleId: "capacity",
          title: "Circuit loading trend",
          priority: "RECOMMENDED_0_3_MONTHS",
          rationale: "Plan upgrade in near term.",
          evidenceRefs: [],
          photos: [],
          html: "<p>Capacity finding</p>",
          score: 70,
          sortKey: "B",
        },
        {
          key: "finding.capacity.plan.1",
          id: "F_CAPACITY_2",
          moduleId: "capacity",
          title: "Spare way planning",
          priority: "PLAN_MONITOR",
          rationale: "Monitor future demand.",
          evidenceRefs: [],
          photos: [],
          html: "<p>Capacity finding plan</p>",
          score: 40,
          sortKey: "C",
        },
      ],
    };
  }
  return {
    executiveSummaryContrib: [],
    whatThisMeansContrib: [],
    capexRowsContrib: [],
    findingsContrib: [],
  };
}

function installMockModules(): () => void {
  const originalSafety = moduleRegistry.safety.compute;
  const originalCapacity = moduleRegistry.capacity.compute;
  const originalEnergy = moduleRegistry.energy.compute;
  const originalLifecycle = moduleRegistry.lifecycle.compute;

  moduleRegistry.safety.compute = () => mockOutput("safety");
  moduleRegistry.capacity.compute = () => mockOutput("capacity");
  moduleRegistry.energy.compute = () => mockOutput("energy");
  moduleRegistry.lifecycle.compute = () => mockOutput("lifecycle");

  return () => {
    moduleRegistry.safety.compute = originalSafety;
    moduleRegistry.capacity.compute = originalCapacity;
    moduleRegistry.energy.compute = originalEnergy;
    moduleRegistry.lifecycle.compute = originalLifecycle;
  };
}

function testDeterminism(): void {
  const teardown = installMockModules();
  try {
    const inspection = {
      inspection_id: "TEST_DETERMINISM",
      findings: [],
      limitations: [],
      raw: {},
    } as any;

    const first = buildReportPlan({ inspection, profile: "investor" });
    const baseline = JSON.stringify(first.merged);
    for (let i = 0; i < 10; i++) {
      const current = buildReportPlan({ inspection, profile: "investor" });
      const hash = JSON.stringify(current.merged);
      assert(hash === baseline, `Determinism failed at run ${i + 1}`);
    }
    console.log("✅ Determinism Test passed");
  } finally {
    teardown();
  }
}

function testCompatibilitySmoke(): void {
  const teardown = installMockModules();
  try {
    const inspection = {
      inspection_id: "TEST_COMPAT",
      findings: [],
      limitations: [],
      raw: {},
    } as any;
    const plan = buildReportPlan({ inspection });

    const ranks = plan.merged.findings.map((f) => priorityRank(f.priority));
    const sortedRanks = [...ranks].sort((a, b) => a - b);
    assert(JSON.stringify(ranks) === JSON.stringify(sortedRanks), "Findings order is not IMMEDIATE -> RECOMMENDED -> PLAN");

    const capexKeys = plan.merged.capexRows.map((r) => r.key);
    const uniqueCapex = new Set(capexKeys);
    assert(uniqueCapex.size === capexKeys.length, "CapEx rows contain duplicate keys");

    const forbidden = [/undefined/i, /<h2/i, /\|---\|/];
    for (const line of [...plan.merged.executiveSummary, ...plan.merged.whatThisMeans]) {
      for (const rule of forbidden) {
        assert(!rule.test(line.text), `Forbidden token in merged text: ${line.text}`);
      }
    }

    console.log("✅ Compatibility Smoke Test passed");
  } finally {
    teardown();
  }
}

function main(): void {
  testDeterminism();
  testCompatibilitySmoke();
  console.log("🎉 reportEngine phase3 tests passed");
}

main();
