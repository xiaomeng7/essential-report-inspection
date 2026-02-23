/**
 * Review-level heuristic alerts. UI-only; no payload or backend changes.
 * Used by ReviewPage and optionally Wizard pre-submit.
 */

function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur != null && typeof cur === "object" && "value" in (cur as object)) {
    return (cur as { value: unknown }).value;
  }
  return cur;
}

export type HeuristicAlerts = {
  stressTestRequired: boolean;
  circuitBreakdownRecommended: boolean;
  photosNotesSuggested: boolean;
  billCalibrationSuggested: boolean;
};

export type ReviewInput = {
  raw_data?: Record<string, unknown>;
  /** When undefined, photos/notes suggestion is skipped (e.g. pre-submit has no derived findings). */
  findings?: Array<{ photo_ids?: string[] }>;
};

/**
 * Compute heuristic alerts from inspection data. All conditions are advisory only; no blocking.
 */
export function computeHeuristicAlerts(input: ReviewInput): HeuristicAlerts {
  const raw = input.raw_data ?? {};
  const energy = raw.energy_v2 as Record<string, unknown> | undefined;
  const stress = energy?.stressTest as Record<string, unknown> | undefined;
  const circuits = Array.isArray(energy?.circuits) ? energy.circuits : [];
  const snapshot = raw.snapshot_intake as Record<string, unknown> | undefined;

  const stressPerformed = stress != null && stress.performed === true;
  const stressTestRequired = stress != null && stressPerformed === false;

  const hasSolar = !!snapshot?.hasSolar;
  const hasEv = !!snapshot?.hasEv;
  const hasBattery = !!snapshot?.hasBattery;
  const hasAssets = hasSolar || hasEv || hasBattery;
  const circuitsEmpty = circuits.length === 0;
  const circuitBreakdownRecommended = circuitsEmpty && hasAssets;

  const findings = input.findings;
  const hasPhotos = Array.isArray(findings) && findings.some((f) => Array.isArray(f.photo_ids) && f.photo_ids.length > 0);
  const notesPaths = [
    "signoff.office_notes_internal",
    "access.notes",
    "notes",
    "technician_notes",
  ];
  const hasNotes = notesPaths.some((p) => {
    const v = getPath(raw, p);
    return v != null && String(v).trim() !== "";
  });
  const photosNotesSuggested = findings !== undefined && !hasPhotos && !hasNotes;

  const profileDeclared = String(snapshot?.occupancyType ?? snapshot?.profileDeclared ?? "").toLowerCase();
  const isOwner = /owner|owner_occupied|owner-occupied/.test(profileDeclared);
  const billBand = snapshot?.billBand ?? getPath(raw, "snapshot_intake.billBand");
  const billBandPresent = billBand != null && String(billBand).trim() !== "";
  const billUploadWilling = snapshot?.billUploadWilling ?? getPath(raw, "snapshot_intake.billUploadWilling");
  const billUploadFalse = billUploadWilling === false || billUploadWilling === "false" || billUploadWilling === "no";
  const billCalibrationSuggested = isOwner && billBandPresent && billUploadFalse;

  return {
    stressTestRequired,
    circuitBreakdownRecommended,
    photosNotesSuggested,
    billCalibrationSuggested,
  };
}
