/**
 * Photo URL signing and validation
 * Used by Evidence generation (generateFindingPages) and inspectionPhoto API
 */

import crypto from "crypto";

const DEFAULT_TTL_SECONDS = 7 * 86400; // 7 days

export function signPhotoUrl(
  inspectionId: string,
  photoId: string,
  baseUrl: string,
  secret: string | undefined,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): string {
  const path = "/api/inspectionPhoto";
  const params = new URLSearchParams({
    inspection_id: inspectionId,
    photo_id: photoId,
  });
  if (secret) {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${inspectionId}|${photoId}|${expires}`;
    const token = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    params.set("expires", String(expires));
    params.set("token", token);
  }
  return `${baseUrl.replace(/\/$/, "")}${path}?${params.toString()}`;
}

export function verifyPhotoToken(
  secret: string,
  inspectionId: string,
  photoId: string,
  expires: number,
  token: string
): boolean {
  const payload = `${inspectionId}|${photoId}|${expires}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(token, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
