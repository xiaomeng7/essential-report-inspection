import type { ModuleId, ReportProfileId } from "../reportEngine";
import { deriveAutoSelectionFromSnapshot, type ReportSelectionWeights } from "../../../../src/lib/reportSelectionPolicy";
import type { SnapshotSignals } from "./extractSnapshotSignals";

export type ReportSelectionResult = {
  profile: ReportProfileId;
  modules?: ModuleId[];
  weights: ReportSelectionWeights;
  source: "override" | "snapshot" | "legacy_fallback";
  snapshotSignals: SnapshotSignals;
};

export function resolveReportSelection(
  snapshotSignals: SnapshotSignals,
  requestOverrides: {
    profile?: ReportProfileId;
    modules?: ModuleId[];
  }
): ReportSelectionResult {
  const normalizedOccupancy = snapshotSignals.occupancyType ?? (
    snapshotSignals.profile === "owner"
      ? "owner_occupied"
      : snapshotSignals.profile === "investor"
      ? "investment"
      : snapshotSignals.profile === "tenant"
      ? "tenant"
      : undefined
  );
  const autoSelection = deriveAutoSelectionFromSnapshot({
    occupancyType: normalizedOccupancy,
    primaryGoal: snapshotSignals.primaryGoal,
  });

  let resolvedProfile = requestOverrides.profile ?? autoSelection.profile ?? (
    snapshotSignals.profile === "owner"
      ? "owner"
      : snapshotSignals.profile === "tenant"
      ? "tenant"
      : "investor"
  );
  let resolvedModules = requestOverrides.modules ?? (autoSelection.modules as ModuleId[] | undefined);
  let resolvedWeights = autoSelection.weights;

  if (!requestOverrides.modules) {
    const moduleSet = new Set<ModuleId>(resolvedModules || []);
    if (resolvedProfile === "owner" || snapshotSignals.primaryGoal === "energy" || snapshotSignals.primaryGoal === "reduce_bill") {
      moduleSet.add("energy");
    }
    resolvedModules = Array.from(moduleSet);
  }

  if (
    !requestOverrides.profile &&
    resolvedProfile === "investor" &&
    snapshotSignals.tenantChangeSoon === true &&
    snapshotSignals.primaryGoal !== "energy" &&
    snapshotSignals.primaryGoal !== "reduce_bill"
  ) {
    resolvedWeights = { energy: 35, lifecycle: 65 };
  }

  const source: ReportSelectionResult["source"] =
    requestOverrides.profile || requestOverrides.modules
      ? "override"
      : autoSelection.profile || autoSelection.modules
      ? "snapshot"
      : "legacy_fallback";

  return {
    profile: resolvedProfile,
    modules: resolvedModules,
    weights: resolvedWeights,
    source,
    snapshotSignals,
  };
}
