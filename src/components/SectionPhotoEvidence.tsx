import { useRef, useCallback, useState } from "react";
import { compressImageToDataUrl } from "../lib/compressImageToDataUrl";
import type { StagedPhoto } from "../hooks/useInspection";

const MAX_PHOTOS = 2;

type Props = {
  sectionId: string;
  sectionTitle?: string; // reserved for future use (e.g. aria-label)
  photos: StagedPhoto[];
  onAddPhoto: (sectionId: string, photo: StagedPhoto) => void;
  onRemovePhoto: (sectionId: string, index: number) => void;
  onUpdateCaption: (sectionId: string, index: number, caption: string) => void;
};

export function SectionPhotoEvidence({
  sectionId,
  sectionTitle: _sectionTitle,
  photos,
  onAddPhoto,
  onRemovePhoto,
  onUpdateCaption,
}: Props) {
  const inputCameraRef = useRef<HTMLInputElement>(null);
  const inputGalleryRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);

  const canAddMore = photos.length < MAX_PHOTOS;

  const handleFile = useCallback(
    async (file: File) => {
      if (!canAddMore) return;
      setCompressing(true);
      try {
        const dataUrl = await compressImageToDataUrl(file);
        onAddPhoto(sectionId, { caption: "", dataUrl });
      } catch (err) {
        console.error("Compress failed:", err);
        alert("Image compression failed. Please try again.");
      } finally {
        setCompressing(false);
      }
    },
    [sectionId, canAddMore, onAddPhoto]
  );

  const handleCamera = () => {
    if (!canAddMore) return;
    inputCameraRef.current?.click();
  };

  const handleGallery = () => {
    if (!canAddMore) return;
    inputGalleryRef.current?.click();
  };

  const onCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div
      className="section-photo-evidence"
      style={{
        marginTop: 16,
        padding: 16,
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        backgroundColor: "#fafafa",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
        📷 Photo evidence (max {MAX_PHOTOS} per block)
      </div>

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

      {canAddMore && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            type="button"
            onClick={handleCamera}
            disabled={compressing}
            style={{
              padding: "12px 20px",
              fontSize: 15,
              fontWeight: 500,
              backgroundColor: "#007bff",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: compressing ? "wait" : "pointer",
              minHeight: 48,
            }}
          >
            {compressing ? "Processing…" : "Take photo"}
          </button>
          <button
            type="button"
            onClick={handleGallery}
            disabled={compressing}
            style={{
              padding: "12px 20px",
              fontSize: 15,
              fontWeight: 500,
              backgroundColor: "#6c757d",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: compressing ? "wait" : "pointer",
              minHeight: 48,
            }}
          >
            Choose from gallery
          </button>
        </div>
      )}

      {photos.length === 0 && (
        <p style={{ color: "#888", fontSize: 13, margin: 0 }}>
          Take or select photos here when filling this block. They will be uploaded with the report on submit.
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {photos.map((p, i) => (
          <div
            key={i}
            style={{
              width: "calc(50% - 6px)",
              minWidth: 140,
              border: "1px solid #ccc",
              borderRadius: 8,
              overflow: "hidden",
              backgroundColor: "#fff",
            }}
          >
            <img
              src={p.dataUrl}
              alt=""
              style={{ width: "100%", height: 120, objectFit: "cover" }}
            />
            <div style={{ padding: 8 }}>
              <input
                type="text"
                placeholder="Brief caption (e.g. main switch overheat marks)"
                value={p.caption}
                onChange={(e) => onUpdateCaption(sectionId, i, e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  fontSize: 13,
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => onRemovePhoto(sectionId, i)}
                style={{
                  marginTop: 8,
                  padding: "6px 12px",
                  fontSize: 13,
                  color: "#dc3545",
                  background: "none",
                  border: "1px solid #dc3545",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
