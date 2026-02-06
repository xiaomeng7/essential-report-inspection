/**
 * IssueDetailCapture: When a field with on_issue_capture=true triggers (value=true or "yes"),
 * this component expands to capture location, photo(s), and optional notes.
 */
import { useRef, useCallback, useState } from "react";
import { compressImageToDataUrl } from "../lib/compressImageToDataUrl";

export type IssueDetail = {
  location: string;
  photo_ids: string[];       // Actually stores base64 dataUrls until upload
  notes: string;
};

type Props = {
  fieldKey: string;
  fieldLabel: string;
  detail: IssueDetail;
  onDetailChange: (fieldKey: string, detail: IssueDetail) => void;
};

const MAX_PHOTOS = 2;

export function IssueDetailCapture({ fieldKey, fieldLabel: _fieldLabel, detail, onDetailChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputCameraRef = useRef<HTMLInputElement>(null);
  const inputGalleryRef = useRef<HTMLInputElement>(null);

  const canAddMore = detail.photo_ids.length < MAX_PHOTOS;

  const handleFile = useCallback(
    async (file: File) => {
      if (!canAddMore) return;
      setUploading(true);
      try {
        const dataUrl = await compressImageToDataUrl(file);
        const newPhotoIds = [...detail.photo_ids, dataUrl];
        onDetailChange(fieldKey, { ...detail, photo_ids: newPhotoIds });
      } catch (err) {
        console.error("Photo compression failed:", err);
      } finally {
        setUploading(false);
      }
    },
    [fieldKey, detail, canAddMore, onDetailChange]
  );

  const onCameraChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  const onGalleryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  const removePhoto = useCallback(
    (index: number) => {
      const newPhotoIds = detail.photo_ids.filter((_, i) => i !== index);
      onDetailChange(fieldKey, { ...detail, photo_ids: newPhotoIds });
    },
    [fieldKey, detail, onDetailChange]
  );

  const updateLocation = useCallback(
    (location: string) => {
      onDetailChange(fieldKey, { ...detail, location });
    },
    [fieldKey, detail, onDetailChange]
  );

  const updateNotes = useCallback(
    (notes: string) => {
      onDetailChange(fieldKey, { ...detail, notes });
    },
    [fieldKey, detail, onDetailChange]
  );

  return (
    <div
      className="issue-detail-capture"
      style={{
        marginTop: 8,
        marginLeft: 16,
        padding: 12,
        backgroundColor: "#fff8e1",
        border: "1px solid #ffcc80",
        borderRadius: 6,
      }}
    >
      <div style={{ fontSize: 12, color: "#e65100", marginBottom: 8, fontWeight: 600 }}>
        ⚠️ Issue detected — please provide details:
      </div>

      {/* Location */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
          Location / Room <span style={{ color: "red" }}>*</span>
        </label>
        <input
          type="text"
          value={detail.location}
          onChange={(e) => updateLocation(e.target.value)}
          placeholder="e.g. Kitchen, Bedroom 2, Main switchboard"
          style={{
            width: "100%",
            padding: 8,
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 4,
          }}
        />
      </div>

      {/* Photos */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
          Photos <span style={{ color: "red" }}>*</span> ({detail.photo_ids.length}/{MAX_PHOTOS})
        </label>

        {/* Photo buttons */}
        {canAddMore && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => inputCameraRef.current?.click()}
              disabled={uploading}
              style={{
                flex: 1,
                padding: "10px 12px",
                fontSize: 14,
                backgroundColor: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              📷 Take Photo
            </button>
            <button
              type="button"
              onClick={() => inputGalleryRef.current?.click()}
              disabled={uploading}
              style={{
                flex: 1,
                padding: "10px 12px",
                fontSize: 14,
                backgroundColor: "#fff",
                color: "#1976d2",
                border: "1px solid #1976d2",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              🖼️ Gallery
            </button>
          </div>
        )}

        <input
          ref={inputCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={onCameraChange}
        />
        <input
          ref={inputGalleryRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onGalleryChange}
        />

        {/* Photo previews */}
        {detail.photo_ids.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {detail.photo_ids.map((dataUrl, idx) => (
              <div key={idx} style={{ position: "relative" }}>
                <img
                  src={dataUrl}
                  alt={`Issue photo ${idx + 1}`}
                  style={{
                    width: 80,
                    height: 80,
                    objectFit: "cover",
                    borderRadius: 4,
                    border: "1px solid #ccc",
                  }}
                />
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "none",
                    backgroundColor: "#f44336",
                    color: "#fff",
                    fontSize: 12,
                    cursor: "pointer",
                    lineHeight: "18px",
                    textAlign: "center",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {uploading && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Processing...</div>}
      </div>

      {/* Notes */}
      <div>
        <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
          Notes (optional)
        </label>
        <textarea
          value={detail.notes}
          onChange={(e) => updateNotes(e.target.value)}
          placeholder="Additional observations..."
          rows={2}
          style={{
            width: "100%",
            padding: 8,
            fontSize: 14,
            border: "1px solid #ccc",
            borderRadius: 4,
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}

export function createEmptyIssueDetail(initial?: Partial<IssueDetail>): IssueDetail {
  return { location: "", photo_ids: [], notes: "", ...initial };
}
