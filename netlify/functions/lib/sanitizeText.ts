/**
 * Text Sanitization Helper
 * 
 * Sanitizes text for safe rendering in HTML and DOCX documents.
 * Handles emoji replacement, smart quotes, control characters, and more.
 */

/** Developer-facing phrases that must never appear in customer reports */
const DEV_PHRASES = /fallback profile|unmapped IDs?|ensure new IDs? are added|add.*to profiles/i;

/**
 * Sanitize messaging text for client reports. Returns undefined if text contains developer-facing phrases
 * (so caller uses fallback), otherwise returns trimmed text.
 */
export function sanitizeForClientReport(text: string | undefined | null): string | undefined {
  if (!text || typeof text !== "string") return undefined;
  const s = text.trim();
  if (DEV_PHRASES.test(s)) return undefined;
  return s;
}

export type SanitizeTextOptions = {
  /** When true, keep 🟢🟡🔴 emoji instead of replacing with [LOW]/[MODERATE]/[ELEVATED]. Default false. */
  preserveEmoji?: boolean;
};

let _sanitizeCallCount = 0;
let _sanitizePreserveEmojiUsed = false;

export function getSanitizeFingerprint(): { count: number; preserveEmoji: boolean } {
  return { count: _sanitizeCallCount, preserveEmoji: _sanitizePreserveEmojiUsed };
}

export function resetSanitizeFingerprint(): void {
  _sanitizeCallCount = 0;
  _sanitizePreserveEmojiUsed = false;
}

/**
 * Sanitize text for safe rendering
 * 
 * Rules:
 * - Replace emoji risk markers (🟢 🟡 🔴) with text equivalents: [LOW] [MODERATE] [ELEVATED] (unless preserveEmoji)
 * - Replace '⸻' with '---'
 * - Normalize smart quotes to normal quotes
 * - Remove non-printable control characters (preserve \n and \t)
 * - Replace NBSP (\u00A0) with regular space
 * - Normalize line endings: \r\n and \r -> \n
 * 
 * @param input - Input to sanitize (string, number, boolean, array, object, null, undefined)
 * @param options - Optional { preserveEmoji: true } to keep emoji in output (e.g. for docx)
 * @returns Sanitized string
 */
export function sanitizeText(input: unknown, options?: SanitizeTextOptions): string {
  _sanitizeCallCount += 1;
  if (options?.preserveEmoji === true) _sanitizePreserveEmojiUsed = true;
  const preserveEmoji = options?.preserveEmoji ?? false;

  // Handle null/undefined
  if (input == null) {
    return "";
  }
  
  // Handle arrays
  if (Array.isArray(input)) {
    return input.map(item => sanitizeText(item, options)).join("\n");
  }
  
  // Handle number/boolean
  if (typeof input === "number" || typeof input === "boolean") {
    return String(input);
  }
  
  // Handle objects (convert to string representation)
  if (typeof input === "object") {
    return String(input);
  }
  
  // Handle string
  if (typeof input === "string") {
    let sanitized = input;
    
    // 1. Replace emoji risk markers with text equivalents (skip if preserveEmoji)
    if (!preserveEmoji) {
      sanitized = sanitized.replace(/🟢/g, "[LOW]");
      sanitized = sanitized.replace(/🟡/g, "[MODERATE]");
      sanitized = sanitized.replace(/🔴/g, "[ELEVATED]");
    }
    
    // 2. Replace '⸻' with '---'
    sanitized = sanitized.replace(/⸻/g, "---");
    
    // 3. Normalize smart quotes to normal quotes
    // Left single quote (U+2018) -> '
    sanitized = sanitized.replace(/\u2018/g, "'");
    // Right single quote (U+2019) -> '
    sanitized = sanitized.replace(/\u2019/g, "'");
    // Left double quote (U+201C) -> "
    sanitized = sanitized.replace(/\u201C/g, '"');
    // Right double quote (U+201D) -> "
    sanitized = sanitized.replace(/\u201D/g, '"');
    // Prime (U+2032) -> '
    sanitized = sanitized.replace(/\u2032/g, "'");
    // Double prime (U+2033) -> "
    sanitized = sanitized.replace(/\u2033/g, '"');
    
    // 4. Replace NBSP (\u00A0) with regular space
    sanitized = sanitized.replace(/\u00A0/g, " ");
    
    // 5. Normalize line endings: \r\n and \r -> \n
    sanitized = sanitized.replace(/\r\n/g, "\n");
    sanitized = sanitized.replace(/\r/g, "\n");
    
    // 6. Remove non-printable control characters (keep \n and \t)
    // \x00-\x08: NULL to BS (backspace)
    // \x0B-\x0C: VT (vertical tab) and FF (form feed)
    // \x0E-\x1F: SO to US (shift out to unit separator)
    // \x7F: DEL (delete)
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");
    
    return sanitized;
  }
  
  // Fallback: convert to string
  return String(input);
}

/**
 * Recursively sanitize all values in an object
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      // For arrays, sanitize each element
      sanitized[key] = value.map(item => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          return sanitizeObject(item);
        }
        return sanitizeText(item);
      });
    } else if (typeof value === "object" && value !== null) {
      // For nested objects, recursively sanitize
      sanitized[key] = sanitizeObject(value);
    } else {
      // For primitives, sanitize directly
      sanitized[key] = sanitizeText(value);
    }
  }
  
  return sanitized as T;
}
