/**
 * Thermal imaging module data model.
 * Stored in inspection.raw.thermal
 */

export type ThermalRiskIndicator = "GREEN" | "AMBER" | "RED";

export type ThermalCapture = {
  id: string;
  area: string;
  location_note?: string;
  max_temp_c?: number;
  delta_c?: number;
  risk_indicator?: ThermalRiskIndicator;
  thermal_photo_id?: string;
  visible_photo_id?: string;
  /** Base64 dataUrl - staged before upload, not stored in final payload */
  thermal_photo_data?: string;
  visible_photo_data?: string;
  created_at?: string;
};

export type ThermalData = {
  enabled: boolean;
  device?: string;
  ambient_c?: number;
  captures: ThermalCapture[];
};

export const THERMAL_AREA_OPTIONS = [
  "Switchboard",
  "Kitchen GPOs",
  "Living room lighting",
  "Roof space",
  "Outdoor circuits",
  "Other",
] as const;

export const THERMAL_DEVICE_OPTIONS = [
  { value: "Fluke iSee TC01A", label: "Fluke iSee TC01A" },
  { value: "Klein A-TI220", label: "Klein A-TI220" },
  { value: "Other", label: "Other" },
] as const;

export const THERMAL_RISK_OPTIONS: { value: ThermalRiskIndicator; label: string }[] = [
  { value: "GREEN", label: "Green (No significant heat)" },
  { value: "AMBER", label: "Amber (Moderate variance)" },
  { value: "RED", label: "Red (Abnormal heat)" },
];

export function getDefaultThermal(): ThermalData {
  return {
    enabled: false,
    captures: [],
  };
}

export function ensureThermal(raw: Record<string, unknown>): ThermalData {
  const t = raw.thermal;
  if (t && typeof t === "object" && !Array.isArray(t)) {
    const obj = t as Record<string, unknown>;
    return {
      enabled: !!obj.enabled,
      device: typeof obj.device === "string" ? obj.device : undefined,
      ambient_c: typeof obj.ambient_c === "number" ? obj.ambient_c : undefined,
      captures: Array.isArray(obj.captures) ? (obj.captures as ThermalCapture[]) : [],
    };
  }
  return getDefaultThermal();
}
