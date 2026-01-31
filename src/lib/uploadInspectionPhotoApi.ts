/**
 * API client for uploading inspection photos
 */

export type UploadPhotoParams = {
  inspection_id: string;
  finding_id: string;
  caption: string;
  image: string; // data:image/jpeg;base64,...
};

export type UploadPhotoResponse = {
  photo_id: string;
  blob_key: string;
  blob_key_meta: string;
  public_url: string | null;
};

export type UploadPhotoError = {
  error: string;
  existing_count?: number;
};

export async function uploadInspectionPhoto(
  params: UploadPhotoParams
): Promise<UploadPhotoResponse> {
  const res = await fetch("/api/uploadInspectionPhoto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = data as UploadPhotoError;
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return data as UploadPhotoResponse;
}
