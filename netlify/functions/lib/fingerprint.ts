/**
 * Fingerprint utilities for [report-fp] logging
 */

import crypto from "crypto";

export function sha1(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return crypto.createHash("sha1").update(buf).digest("hex");
}
