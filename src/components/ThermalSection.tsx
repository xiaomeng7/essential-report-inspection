import { useRef, useCallback, useState } from "react";
import { compressImageToDataUrl } from "../lib/compressImageToDataUrl";
import {
  type ThermalData,
  type ThermalCapture,
  THERMAL_AREA_OPTIONS,
  THERMAL_DEVICE_OPTIONS,
  THERMAL_RISK_OPTIONS,
} from "../lib/thermalTypes";

type Props = {
  thermal: ThermalData;
  onThermalChange: (thermal: ThermalData) => void;
};

function nextCaptureId(captures: ThermalCapture[]): string {
  const max = captures.reduce((m, c) => {
    const match = c.id?.match(/^T(\d+)$/);
    const n = match ? parseInt(match[1], 10) : 0;
    return Math.max(m, n);
  }, 0);
  return `T${String(max + 1).padStart(2, "0")}`;
}

export function ThermalSection({ thermal, onThermalChange }: Props) {
  const thermalInputRef = useRef<HTMLInputElement>(null);
  const visibleInputRef = useRef<HTMLInputElement>(null);
  const [captureIndexForPhoto, setCaptureIndexForPhoto] = useState<number | null>(null);
  const [photoType, setPhotoType] = useState<"thermal" | "visible" | null>(null);
  const [compressing, setCompressing] = useState(false);

  const updateCapture = useCallback(
    (index: number, updater: (c: ThermalCapture) => ThermalCapture) => {
      const next = [...thermal.captures];
      next[index] = updater(next[index]);
      onThermalChange({ ...thermal, captures: next });
    },
    [thermal, onThermalChange]
  );

  const handleAddCapture = useCallback(() => {
    const id = nextCaptureId(thermal.captures);
    onThermalChange({
      ...thermal,
      captures: [
        ...thermal.captures,
        {
          id,
          area: "Switchboard",
          created_at: new Date().toISOString(),
        },
      ],
    });
  }, [thermal, onThermalChange]);

  const handleRemoveCapture = useCallback(
    (index: number) => {
      const next = thermal.captures.filter((_, i) => i !== index);
      onThermalChange({ ...thermal, captures: next });
    },
    [thermal, onThermalChange]
  );

  const triggerPhotoInput = (index: number, type: "thermal" | "visible") => {
    setCaptureIndexForPhoto(index);
    setPhotoType(type);
    if (type === "thermal") thermalInputRef.current?.click();
    else visibleInputRef.current?.click();
  };

  const handlePhotoFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, type: "thermal" | "visible") => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || captureIndexForPhoto === null || !photoType) return;
      setCompressing(true);
      try {
        const dataUrl = await compressImageToDataUrl(file);
        const key = type === "thermal" ? "thermal_photo_data" : "visible_photo_data";
        updateCapture(captureIndexForPhoto, (c) => ({ ...c, [key]: dataUrl }));
      } catch (err) {
        console.error("Compress failed:", err);
        alert("图片压缩失败，请重试");
      } finally {
        setCompressing(false);
        setCaptureIndexForPhoto(null);
        setPhotoType(null);
      }
    },
    [captureIndexForPhoto, photoType, updateCapture]
  );

  const removePhoto = useCallback(
    (index: number, type: "thermal" | "visible") => {
      const key = type === "thermal" ? "thermal_photo_data" : "visible_photo_data";
      const idKey = type === "thermal" ? "thermal_photo_id" : "visible_photo_id";
      updateCapture(index, (c) => {
        const next = { ...c };
        delete (next as Record<string, unknown>)[key];
        delete (next as Record<string, unknown>)[idKey];
        return next;
      });
    },
    [updateCapture]
  );

  return (
    <div
      style={{
        marginTop: 16,
        padding: 20,
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        backgroundColor: "#fafafa",
      }}
    >
      {/* Reminder banner */}
      <div
        style={{
          padding: 12,
          marginBottom: 16,
          backgroundColor: "#fff3e0",
          border: "1px solid #ffb74d",
          borderRadius: 6,
          fontSize: 14,
        }}
      >
        <strong>Reminder:</strong> Attach the thermal camera lens to the tablet (USB-C) before capturing.
      </div>

      {/* Toggle */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={thermal.enabled}
            onChange={(e) => onThermalChange({ ...thermal, enabled: e.target.checked })}
          />
          <span>Thermal imaging available on site</span>
        </label>
      </div>

      {!thermal.enabled && (
        <p style={{ color: "#888", fontSize: 13 }}>Enable thermal imaging to add captures.</p>
      )}

      {thermal.enabled && (
        <>
          {/* Device & ambient */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Device</label>
              <select
                value={thermal.device ?? ""}
                onChange={(e) => onThermalChange({ ...thermal, device: e.target.value || undefined })}
                style={{ padding: 8, fontSize: 14, minWidth: 180 }}
              >
                {THERMAL_DEVICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Ambient temp (°C)</label>
              <input
                type="number"
                step={0.1}
                placeholder="Optional"
                value={thermal.ambient_c ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? parseFloat(e.target.value) : undefined;
                  onThermalChange({ ...thermal, ambient_c: v });
                }}
                style={{ padding: 8, fontSize: 14, width: 100 }}
              />
            </div>
          </div>

          {/* Soft validation: warn if any capture missing thermal photo */}
          {thermal.captures.some((c) => !c.thermal_photo_id && !c.thermal_photo_data) && (
            <div
              style={{
                padding: 12,
                marginBottom: 16,
                backgroundColor: "#fff3cd",
                border: "1px solid #ffc107",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              ⚠️ Some captures are missing a thermal photo. Add thermal photos before submit for best report quality. (Submission is not blocked.)
            </div>
          )}

          {/* Add capture button */}
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={handleAddCapture}
              style={{
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: "#007bff",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Add thermal capture
            </button>
          </div>

          {/* Captures */}
          {thermal.captures.map((capture, idx) => (
            <div
              key={capture.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                backgroundColor: "#fff",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
                Capture {capture.id}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Area</label>
                  <select
                    value={capture.area ?? ""}
                    onChange={(e) => updateCapture(idx, (c) => ({ ...c, area: e.target.value }))}
                    style={{ width: "100%", padding: 8, fontSize: 13 }}
                  >
                    {THERMAL_AREA_OPTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Location note</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={capture.location_note ?? ""}
                    onChange={(e) => updateCapture(idx, (c) => ({ ...c, location_note: e.target.value || undefined }))}
                    style={{ width: "100%", padding: 8, fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Max temp (°C)</label>
                  <input
                    type="number"
                    step={0.1}
                    value={capture.max_temp_c ?? ""}
                    onChange={(e) => {
                      const v = e.target.value ? parseFloat(e.target.value) : undefined;
                      updateCapture(idx, (c) => ({ ...c, max_temp_c: v }));
                    }}
                    style={{ width: "100%", padding: 8, fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Delta (°C)</label>
                  <input
                    type="number"
                    step={0.1}
                    value={capture.delta_c ?? ""}
                    onChange={(e) => {
                      const v = e.target.value ? parseFloat(e.target.value) : undefined;
                      updateCapture(idx, (c) => ({ ...c, delta_c: v }));
                    }}
                    style={{ width: "100%", padding: 8, fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Risk</label>
                  <select
                    value={capture.risk_indicator ?? ""}
                    onChange={(e) =>
                      updateCapture(idx, (c) => ({ ...c, risk_indicator: (e.target.value || undefined) as "GREEN" | "AMBER" | "RED" }))
                    }
                    style={{ width: "100%", padding: 8, fontSize: 13 }}
                  >
                    <option value="">Select</option>
                    {THERMAL_RISK_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Photo buttons */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Thermal photo</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => triggerPhotoInput(idx, "thermal")}
                      disabled={compressing}
                      style={{
                        padding: "8px 14px",
                        fontSize: 13,
                        backgroundColor: (capture.thermal_photo_data || capture.thermal_photo_id) ? "#28a745" : "#007bff",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        cursor: compressing ? "not-allowed" : "pointer",
                      }}
                    >
                      {(capture.thermal_photo_data || capture.thermal_photo_id) ? "Captured" : "Capture Thermal Photo"}
                    </button>
                    {(capture.thermal_photo_data || capture.thermal_photo_id) && (
                      <button
                        type="button"
                        onClick={() => removePhoto(idx, "thermal")}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          color: "#dc3545",
                          border: "1px solid #dc3545",
                          borderRadius: 6,
                          cursor: "pointer",
                          background: "none",
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Visible photo</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => triggerPhotoInput(idx, "visible")}
                      disabled={compressing}
                      style={{
                        padding: "8px 14px",
                        fontSize: 13,
                        backgroundColor: (capture.visible_photo_data || capture.visible_photo_id) ? "#28a745" : "#007bff",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        cursor: compressing ? "not-allowed" : "pointer",
                      }}
                    >
                      {(capture.visible_photo_data || capture.visible_photo_id) ? "Captured" : "Capture Visible Photo"}
                    </button>
                    {(capture.visible_photo_data || capture.visible_photo_id) && (
                      <button
                        type="button"
                        onClick={() => removePhoto(idx, "visible")}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          color: "#dc3545",
                          border: "1px solid #dc3545",
                          borderRadius: 6,
                          cursor: "pointer",
                          background: "none",
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleRemoveCapture(idx)}
                style={{
                  marginTop: 8,
                  padding: "6px 12px",
                  fontSize: 12,
                  color: "#dc3545",
                  border: "1px solid #dc3545",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: "none",
                }}
              >
                Remove capture
              </button>
            </div>
          ))}

          <input
            ref={thermalInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => handlePhotoFile(e, "thermal")}
          />
          <input
            ref={visibleInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => handlePhotoFile(e, "visible")}
          />
        </>
      )}
    </div>
  );
}
