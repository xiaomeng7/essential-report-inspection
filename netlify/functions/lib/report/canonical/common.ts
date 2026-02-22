export function extractValue(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && "value" in (v as object)) {
    return extractValue((v as { value: unknown }).value);
  }
  return undefined;
}

export function getByPath(raw: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = raw;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function pickFirst(
  raw: Record<string, unknown>,
  paths: string[]
): { value?: unknown; path?: string } {
  for (const path of paths) {
    const valueRaw = getByPath(raw, path);
    const value = extractValue(valueRaw) ?? valueRaw;
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return { value, path };
    }
  }
  return {};
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (["true", "yes", "1", "on", "present", "installed", "y"].includes(s)) return true;
  if (["false", "no", "0", "off", "none", "absent", "n"].includes(s)) return false;
  return undefined;
}
