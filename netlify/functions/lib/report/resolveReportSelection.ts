import type { ModuleId, ReportProfileId, ProductIntent } from "../reportEngine";
import { deriveAutoSelectionFromSnapshot, type ReportSelectionWeights } from "../../../../src/lib/reportSelectionPolicy";
import type { SnapshotSignals } from "./extractSnapshotSignals";

export type ReportSelectionResult = {
  profile: ReportProfileId;
  modules?: ModuleId[];
  weights: ReportSelectionWeights;
  source: "override" | "snapshot" | "legacy_fallback";
  snapshotSignals: SnapshotSignals;
  productIntent: ProductIntent;
};

/** True when raw contains on-site measurement data (e.g. energy_v2.circuits or stressTest). */
export function hasOnSiteMeasurementBlock(raw: Record<string, unknown> | undefined): boolean {
  if (!raw || typeof raw !== "object") return false;
  const ev2 = raw.energy_v2 as Record<string, unknown> | undefined;
  if (!ev2 || typeof ev2 !== "object") return false;
  const circuits = ev2.circuits;
  if (Array.isArray(circuits) && circuits.length > 0) return true;
  const stressTest = ev2.stressTest as Record<string, unknown> | undefined;
  if (stressTest && typeof stressTest === "object") {
    const total = stressTest.totalCurrentA;
    if (typeof total === "number" && Number.isFinite(total)) return true;
  }
  return false;
}

export function resolveReportSelection(
  snapshotSignals: SnapshotSignals,
  requestOverrides: {
    profile?: ReportProfileId;
    modules?: ModuleId[];
    productIntent?: ProductIntent;
  },
  options?: { raw?: Record<string, unknown> }
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

  let productIntent: ProductIntent = "essential";
  if (requestOverrides.productIntent !== undefined) {
    productIntent = requestOverrides.productIntent;
  } else {
    const raw = options?.raw;
    if (raw && (String(raw.source) === "lite_landing" || String(raw.product_intent) === "lite")) {
      productIntent = "lite";
    } else if (
      (snapshotSignals.primaryGoal === "energy" || snapshotSignals.primaryGoal === "reduce_bill") &&
      !hasOnSiteMeasurementBlock(raw)
    ) {
      productIntent = "lite";
    } else if (hasOnSiteMeasurementBlock(raw)) {
      productIntent = "essential";
    } else {
      productIntent = "pro";
    }
  }

  return {
    profile: resolvedProfile,
    modules: resolvedModules,
    weights: resolvedWeights,
    source,
    snapshotSignals,
    productIntent,
  };
}
