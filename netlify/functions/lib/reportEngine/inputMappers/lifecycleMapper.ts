function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    return extractValue((v as { value: unknown }).value);
  }
  return undefined;
}

function getByPath(raw: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = raw;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return extractValue(cur);
}

function getFirstValue(raw: Record<string, unknown>, candidates: string[]): { value?: string; source?: string } {
  for (const path of candidates) {
    const v = getByPath(raw, path);
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return { value: String(v).trim(), source: path };
    }
  }
  return {};
}

function normalizeBand(value?: string): LifecycleSignals["propertyAgeBand"] {
  const s = (value || "").trim().toLowerCase();
  if (/pre[-\s]?1970|before[-\s]?1970/.test(s)) return "pre-1970";
  if (/1970.*1990|70s|80s/.test(s)) return "1970-1990";
  if (/1990.*2010|90s|2000/.test(s)) return "1990-2010";
  if (/post[-\s]?2010|after[-\s]?2010|2010\+/.test(s)) return "post-2010";
  return "unknown";
}

function normalizeSwitchboardType(value?: string): LifecycleSignals["switchboardType"] {
  const s = (value || "").trim().toLowerCase();
  if (/(ceramic|porcelain).*(fuse)/.test(s)) return "ceramic_fuse";
  if (/rewireable.*fuse|rewirable.*fuse|wireable.*fuse/.test(s)) return "rewireable_fuse";
  if (/old.*cb|older.*breaker|legacy.*cb/.test(s)) return "old_cb";
  if (/rcbo|modern.*board|modern.*switchboard/.test(s)) return "modern_rcbo";
  return "unknown";
}

function normalizeRcdCoverage(value?: string): LifecycleSignals["rcdCoverage"] {
  const s = (value || "").trim().toLowerCase();
  if (/full|all.*covered|complete/.test(s)) return "full";
  if (/partial|some.*covered/.test(s)) return "partial";
  if (/none|no.*rcd|without.*rcd/.test(s)) return "none";
  return "unknown";
}

function normalizeBool(value?: string): boolean | undefined {
  if (!value) return undefined;
  if (/^(true|yes|1|present|observed)$/i.test(value)) return true;
  if (/^(false|no|0|none|not observed)$/i.test(value)) return false;
  return undefined;
}

function collectPhotoRefs(raw: Record<string, unknown>, candidates: string[]): string[] {
  const refs: string[] = [];
  for (const path of candidates) {
    const v = getByPath(raw, path);
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string" && item.trim()) refs.push(item.trim());
      }
    } else if (typeof v === "string" && v.trim()) {
      refs.push(v.trim());
    }
  }
  return [...new Set(refs)].slice(0, 8);
}

export type LifecycleSignals = {
  propertyAgeBand: "pre-1970" | "1970-1990" | "1990-2010" | "post-2010" | "unknown";
  switchboardType: "ceramic_fuse" | "rewireable_fuse" | "old_cb" | "modern_rcbo" | "unknown";
  rcdCoverage: "full" | "partial" | "none" | "unknown";
  visibleThermalStress: boolean | undefined;
  mixedWiringIndicators: boolean | undefined;
  evidenceRefs: string[];
};

export type LifecycleMapped = {
  lifecycle?: LifecycleSignals;
  evidenceRefs: string[];
  evidenceCoverage: "measured" | "observed" | "declared" | "unknown";
};

export function mapLifecycleInput(raw: Record<string, unknown>): LifecycleMapped {
  const ageBand = getFirstValue(raw, [
    "job.property_age_band",
    "property.age_band",
    "property.age",
    "lifecycle.property_age_band",
  ]);
  const switchboard = getFirstValue(raw, [
    "switchboard.type",
    "electrical.switchboard.type",
    "lifecycle.switchboard_type",
  ]);
  const rcd = getFirstValue(raw, [
    "test_data.rcd_tests.coverage",
    "rcd_coverage",
    "lifecycle.rcd_coverage",
  ]);
  const thermal = getFirstValue(raw, [
    "visible_thermal_stress",
    "lifecycle.visible_thermal_stress",
    "test_data.thermal.visible_stress",
  ]);
  const mixed = getFirstValue(raw, [
    "mixed_wiring_indicators",
    "lifecycle.mixed_wiring_indicators",
    "electrical.mixed_wiring_indicators",
  ]);

  const evidenceRefs = collectPhotoRefs(raw, [
    "lifecycle.evidence_refs",
    "lifecycle.photo_ids",
    "photo_ids",
    "test_data.lifecycle.photo_ids",
  ]);

  const lifecycle: LifecycleSignals = {
    propertyAgeBand: normalizeBand(ageBand.value),
    switchboardType: normalizeSwitchboardType(switchboard.value),
    rcdCoverage: normalizeRcdCoverage(rcd.value),
    visibleThermalStress: normalizeBool(thermal.value),
    mixedWiringIndicators: normalizeBool(mixed.value),
    evidenceRefs,
  };

  const meaningful =
    lifecycle.propertyAgeBand !== "unknown" ||
    lifecycle.switchboardType !== "unknown" ||
    lifecycle.evidenceRefs.length > 0;

  if (!meaningful) {
    return { evidenceRefs: [], evidenceCoverage: "unknown" };
  }

  // Lifecycle inputs are predominantly observed/declared, not instrument-precision.
  const observedCount = [
    lifecycle.switchboardType !== "unknown",
    lifecycle.visibleThermalStress !== undefined,
    lifecycle.mixedWiringIndicators !== undefined,
    lifecycle.evidenceRefs.length > 0,
  ].filter(Boolean).length;
  const declaredCount = [lifecycle.propertyAgeBand !== "unknown", lifecycle.rcdCoverage !== "unknown"].filter(Boolean).length;

  const evidenceCoverage =
    observedCount > 0 ? "observed" :
    declaredCount > 0 ? "declared" :
    "unknown";

  return {
    lifecycle,
    evidenceRefs: lifecycle.evidenceRefs,
    evidenceCoverage,
  };
}
