import { useState, useRef, useCallback } from "react";
import { compressImageToDataUrl } from "../lib/compressImageToDataUrl";
import { uploadInspectionPhoto } from "../lib/uploadInspectionPhotoApi";

const MAX_PHOTOS = 2;

type PhotoItem = {
  id: string; // local unique id or photo_id from server
  previewUrl: string;
  caption: string;
  status: "pending" | "uploading" | "uploaded" | "error";
  errorMessage?: string;
  photoId?: string; // from server after upload
  dataUrl?: string; // for retry
};

type Props = {
  inspectionId: string;
  findingId: string;
  findingTitle?: string; // reserved for future use (e.g. default caption hint)
  /** Photo IDs already attached during inspection (show next to this finding) */
  existingPhotoIds?: string[];
};

export function PhotoEvidenceSection({ inspectionId, findingId, findingTitle: _findingTitle, existingPhotoIds = [] }: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const existing = Array.isArray(existingPhotoIds) ? existingPhotoIds.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  const totalCount = photos.length + existing.length;
  const canAddMore = totalCount < MAX_PHOTOS;


  const handleTakePhoto = () => {
    if (!canAddMore) return;
    inputRef.current?.click();
  };

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset input so same file can be selected again
      e.target.value = "";

      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const previewUrl = URL.createObjectURL(file);

      // Add pending photo
      const newPhoto: PhotoItem = {
        id: localId,
        previewUrl,
        caption: "",
        status: "pending",
      };
      setPhotos((prev) => [...prev, newPhoto]);

      // Compress image
      try {
        const dataUrl = await compressImageToDataUrl(file);
        setPhotos((prev) =>
          prev.map((p) => (p.id === localId ? { ...p, dataUrl, status: "pending" } : p))
        );
      } catch (err) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === localId
              ? { ...p, status: "error", errorMessage: "Failed to compress image" }
              : p
          )
        );
      }
    },
    []
  );

  const handleCaptionChange = useCallback((id: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
  }, []);

  const handleUpload = useCallback(
    async (id: string) => {
      setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, status: "uploading" } : p)));

      const photo = photos.find((p) => p.id === id);
      if (!photo?.dataUrl) {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, status: "error", errorMessage: "No image data" } : p
          )
        );
        return;
      }

      const caption = photo.caption.trim() || "Photo evidence";

      try {
        const res = await uploadInspectionPhoto({
          inspection_id: inspectionId,
          finding_id: findingId,
          caption,
          image: photo.dataUrl,
        });
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, status: "uploaded", photoId: res.photo_id } : p
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setPhotos((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: "error", errorMessage: msg } : p))
        );
      }
    },
    [photos, inspectionId, findingId]
  );

  const handleRetry = useCallback(
    (id: string) => {
      handleUpload(id);
    },
    [handleUpload]
  );

  const handleDelete = useCallback((id: string) => {
    const photo = photos.find((p) => p.id === id);
    if (photo?.status === "uploaded") {
      if (
        !window.confirm(
          "This photo has been uploaded. Removing it here will not delete it from the server (delete API not yet implemented). Continue?"
        )
      ) {
        return;
      }
    }
    // Revoke object URL to free memory
    const p = photos.find((x) => x.id === id);
    if (p?.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(p.previewUrl);
    }
    setPhotos((prev) => prev.filter((x) => x.id !== id));
  }, [photos]);

  const pendingCount = photos.filter((p) => p.status === "pending" && p.dataUrl).length;
  const uploadingCount = photos.filter((p) => p.status === "uploading").length;

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 16,
        marginTop: 12,
        backgroundColor: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          Photo Evidence ({totalCount}/{MAX_PHOTOS})
        </h4>
        {canAddMore && (
          <button
            type="button"
            onClick={handleTakePhoto}
            style={{
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: "#007bff",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              minWidth: 100,
            }}
          >
            Take Photo
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {existing.length > 0 && (
        <div style={{ marginBottom: 12, padding: 10, background: "#e8f5e9", borderRadius: 6, fontSize: 13 }}>
          <strong>Attached during inspection:</strong> {existing.join(", ")}
        </div>
      )}
      {photos.length === 0 && totalCount === 0 && (
        <p style={{ color: "#888", fontSize: 13, margin: 0 }}>
          No photos yet. Tap "Take Photo" to capture evidence.
        </p>
      )}

      {/* Photo grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {photos.map((photo) => (
          <div
            key={photo.id}
            style={{
              width: "calc(50% - 6px)",
              minWidth: 140,
              border: "1px solid #ccc",
              borderRadius: 6,
              overflow: "hidden",
              backgroundColor: "#fff",
            }}
          >
            {/* Thumbnail */}
            <div style={{ position: "relative" }}>
              <img
                src={photo.previewUrl}
                alt="Preview"
                style={{ width: "100%", height: 120, objectFit: "cover" }}
              />
              {/* Status badge */}
              <span
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 4,
                  backgroundColor:
                    photo.status === "uploaded"
                      ? "#28a745"
                      : photo.status === "uploading"
                      ? "#ffc107"
                      : photo.status === "error"
                      ? "#dc3545"
                      : "#6c757d",
                  color: photo.status === "uploading" ? "#000" : "#fff",
                }}
              >
                {photo.status === "uploaded"
                  ? `Uploaded (${photo.photoId})`
                  : photo.status === "uploading"
                  ? "Uploading..."
                  : photo.status === "error"
                  ? "Error"
                  : "Ready"}
              </span>
            </div>

            {/* Caption input */}
            <div style={{ padding: 8 }}>
              <input
                type="text"
                placeholder="Caption (e.g. 'Loose GPO in kitchen')"
                value={photo.caption}
                onChange={(e) => handleCaptionChange(photo.id, e.target.value)}
                disabled={photo.status === "uploading" || photo.status === "uploaded"}
                style={{
                  width: "100%",
                  padding: 8,
                  fontSize: 13,
                  border: "1px solid #ccc",
                  borderRadius: 4,
                  boxSizing: "border-box",
                }}
              />

              {/* Error message */}
              {photo.status === "error" && photo.errorMessage && (
                <p style={{ color: "#dc3545", fontSize: 12, margin: "4px 0 0" }}>
                  {photo.errorMessage}
                </p>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {photo.status === "pending" && photo.dataUrl && (
                  <button
                    type="button"
                    onClick={() => handleUpload(photo.id)}
                    style={{
                      flex: 1,
                      padding: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      backgroundColor: "#28a745",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Upload
                  </button>
                )}
                {photo.status === "error" && (
                  <button
                    type="button"
                    onClick={() => handleRetry(photo.id)}
                    style={{
                      flex: 1,
                      padding: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      backgroundColor: "#ffc107",
                      color: "#000",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(photo.id)}
                  disabled={photo.status === "uploading"}
                  style={{
                    padding: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    backgroundColor: "#f8f9fa",
                    color: "#dc3545",
                    border: "1px solid #dc3545",
                    borderRadius: 4,
                    cursor: photo.status === "uploading" ? "not-allowed" : "pointer",
                    opacity: photo.status === "uploading" ? 0.5 : 1,
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upload all button */}
      {pendingCount > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => {
              photos.filter((p) => p.status === "pending" && p.dataUrl).forEach((p) => handleUpload(p.id));
            }}
            disabled={uploadingCount > 0}
            style={{
              width: "100%",
              padding: 12,
              fontSize: 14,
              fontWeight: 600,
              backgroundColor: uploadingCount > 0 ? "#ccc" : "#007bff",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: uploadingCount > 0 ? "not-allowed" : "pointer",
            }}
          >
            {uploadingCount > 0 ? "Uploading..." : `Upload All (${pendingCount})`}
          </button>
        </div>
      )}
    </div>
  );
}
