import { normalizeSnapshotIntake } from "../netlify/functions/lib/report/snapshotContract";
import { extractSnapshotSignals } from "../netlify/functions/lib/report/extractSnapshotSignals";
import { resolveReportSelection } from "../netlify/functions/lib/report/resolveReportSelection";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function testOwnerFlow(): void {
  const raw = {
    snapshot_intake: {
      occupancyType: "owner_occupied",
      primaryGoal: "reduce_bill",
      hasSolar: true,
    },
  };
  const intake = normalizeSnapshotIntake(raw);
  assert(intake.occupancyType === "owner_occupied", "owner occupancy normalize failed");
  assert(intake.primaryGoal === "energy", "owner goal normalize failed");

  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {});
  assert(resolved.source === "snapshot", "owner source should be snapshot");
  assert(resolved.profile === "owner", "owner profile mismatch");
  assert((resolved.modules || []).includes("energy"), "owner modules should include energy");
}

function testInvestmentFlow(): void {
  const raw = {
    snapshot_intake: {
      occupancyType: "investment",
      primaryGoal: "balanced",
      hasBattery: true,
    },
  };
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {});
  assert(resolved.source === "snapshot", "investment source should be snapshot");
  assert(resolved.profile === "investor", "investment should map to investor");
  assert((resolved.modules || []).includes("lifecycle"), "investment modules should include lifecycle");
}

function testTenantFlow(): void {
  const raw = {
    snapshot_intake: {
      occupancyType: "tenant",
      primaryGoal: "risk",
      hasEv: false,
    },
  };
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {});
  assert(resolved.source === "snapshot", "tenant source should be snapshot");
  assert(resolved.profile === "tenant", "tenant profile mismatch");
  assert(JSON.stringify(resolved.modules || []) === JSON.stringify(["energy"]), "tenant modules should be only energy");
}

function testOverrideWins(): void {
  const raw = {
    snapshot_intake: {
      occupancyType: "tenant",
      primaryGoal: "reduce_bill",
    },
  };
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {
    profile: "investor",
    modules: ["energy", "lifecycle"],
  });
  assert(resolved.source === "override", "override source mismatch");
  assert(resolved.profile === "investor", "override profile mismatch");
  assert((resolved.modules || []).length === 2, "override modules mismatch");
}

function testLegacyFallback(): void {
  const raw = { job: { address: "test" } };
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {});
  assert(resolved.source === "legacy_fallback", "legacy fallback source mismatch");
  assert(resolved.profile === "investor", "legacy fallback profile should be investor");
}

function testSnapshotExtendedSignals(): void {
  const raw = {
    snapshot_intake: {
      profile: "owner",
      profileDeclared: "unsure",
      primaryGoal: "energy",
      billBand: "$4,000–$6,000",
      billUploadWilling: true,
      allElectricNoGas: true,
      devices: ["solar", "battery"],
      symptoms: ["bill_spike"],
    },
  };
  const signals = extractSnapshotSignals(raw);
  assert(signals.profile === "owner", "profile parse failed");
  assert(signals.profileDeclared === "unsure", "profileDeclared parse failed");
  assert(signals.billBand === "$4,000–$6,000", "billBand parse failed");
  assert(signals.billUploadWilling === true, "billUploadWilling parse failed");
  assert(signals.hasSolar === true, "hasSolar derive failed");
  assert(signals.hasBattery === true, "hasBattery derive failed");
}

function testTenantChangeSoonRiskBias(): void {
  const raw = {
    snapshot_intake: {
      profile: "investor",
      tenantChangeSoon: true,
      primaryGoal: "balanced",
    },
  };
  const signals = extractSnapshotSignals(raw);
  const resolved = resolveReportSelection(signals, {});
  assert(resolved.profile === "investor", "investor profile expected");
  assert(resolved.source === "snapshot", "snapshot source expected");
  assert(resolved.weights.lifecycle > resolved.weights.energy, "tenantChangeSoon should bias lifecycle/risk");
}

function main(): void {
  testOwnerFlow();
  testInvestmentFlow();
  testTenantFlow();
  testOverrideWins();
  testLegacyFallback();
  testSnapshotExtendedSignals();
  testTenantChangeSoonRiskBias();
  console.log("✅ snapshot selection flow tests passed");
}

main();
