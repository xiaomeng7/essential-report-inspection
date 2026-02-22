export const MAJOR_HEADER_PATTERNS: RegExp[] = [
  /<h2[^>]*>[^<]*Terms & Conditions[^<]*<\/h2>/gi,
];

export function countMajorHeaderDuplicates(markdown: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pattern of MAJOR_HEADER_PATTERNS) {
    const key = pattern.source;
    out[key] = (markdown.match(pattern) || []).length;
  }
  return out;
}
