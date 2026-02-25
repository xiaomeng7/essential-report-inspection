/**
 * Tests: resolveReportSelection returns productIntent "lite" when snapshot primaryGoal
 * is energy/reduce_bill and there is no on-site measurement block.
 */
import { extractSnapshotSignals } from "../netlify/functions/lib/report/extractSnapshotSignals";
import {
  resolveReportSelection,
  hasOnSiteMeasurementBlock,
} from "../netlify/functions/lib/report/resolveReportSelection";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testLiteWhenEnergyGoalNoOnSite(): void {
  const raw = {
    snapshot_intake: {
      primaryGoal: "energy",
      profileDeclared: "owner",
    },
  };
  assert(!hasOnSiteMeasurementBlock(raw), "no on-site block");
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {}, { raw });
  assert(resolved.productIntent === "lite", "expected productIntent lite when energy + no on-site");
}

function testLiteWhenReduceBillNoOnSite(): void {
  const raw = {
    snapshot_intake: {
      primaryGoal: "reduce_bill",
      occupancyType: "owner_occupied",
    },
  };
  assert(!hasOnSiteMeasurementBlock(raw), "no on-site block");
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {}, { raw });
  assert(resolved.productIntent === "lite", "expected productIntent lite when reduce_bill + no on-site");
}

function testEssentialWhenOnSitePresent(): void {
  const raw = {
    snapshot_intake: { primaryGoal: "energy" },
    energy_v2: {
      circuits: [{ name: "Main", measured: true }],
    },
  };
  assert(hasOnSiteMeasurementBlock(raw), "on-site block present");
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {}, { raw });
  assert(resolved.productIntent === "essential", "expected essential when on-site present");
}

function testLiteWhenSourceLiteLanding(): void {
  const raw = {
    source: "lite_landing",
    snapshot_intake: { primaryGoal: "risk" },
  };
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {}, { raw });
  assert(resolved.productIntent === "lite", "expected lite when source is lite_landing");
}

function testOverrideProductIntent(): void {
  const raw = { snapshot_intake: { primaryGoal: "energy" } };
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, { productIntent: "pro" }, { raw });
  assert(resolved.productIntent === "pro", "request override productIntent should win");
}

function main(): void {
  testLiteWhenEnergyGoalNoOnSite();
  testLiteWhenReduceBillNoOnSite();
  testEssentialWhenOnSitePresent();
  testLiteWhenSourceLiteLanding();
  testOverrideProductIntent();
  console.log("✅ lite selection flow tests passed");
}

main();
