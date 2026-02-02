/**
 * Text deduplication for report sections.
 * Removes duplicate or highly similar sentences across Executive / What This Means / Decision Pathways.
 * EXEC_SUMMARY_CORE retains priority; other blocks remove sentences that duplicate exec.
 */

export type DedupeResult = {
  blocks: Record<string, string>;
  removedCount: number;
};

/**
 * Normalize a sentence for comparison: trim and collapse consecutive spaces.
 */
function normalizeSentence(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Split text into sentences (by . ! ? and newlines). Filter out very short fragments.
 */
function splitSentences(text: string, minLen: number = 10): string[] {
  if (!text || typeof text !== "string") return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized.split(/([.!?]+\s*|\n+)/);
  const sentences: string[] = [];
  let current = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^[.!?]+\s*$/.test(p) || /^\n+$/.test(p)) {
      current += p;
      const trimmed = normalizeSentence(current);
      if (trimmed.length >= minLen) sentences.push(trimmed);
      current = "";
    } else {
      current += p;
    }
  }
  if (current) {
    const trimmed = normalizeSentence(current);
    if (trimmed.length >= minLen) sentences.push(trimmed);
  }
  return sentences;
}

/**
 * Deduplicate sentences across blocks. EXEC block retains priority; other blocks remove duplicates.
 *
 * @param blocks - Object with keys exec, interp, decision (or EXEC_SUMMARY_CORE, INTERPRETATION_GUIDANCE, DECISION_PATHWAYS_BULLETS)
 * @param opts - { minLen?: number } minimum sentence length to consider (default 10)
 * @returns Deduped blocks and removedCount for logging
 */
export function dedupeSentences(
  blocks: Record<string, string>,
  opts?: { minLen?: number }
): DedupeResult {
  const minLen = opts?.minLen ?? 10;
  const keys = Object.keys(blocks);
  const result: Record<string, string> = {};
  let removedCount = 0;

  // Priority order: exec first (retains all), then interp, then decision
  const priorityKey = keys.find((k) => /exec|EXEC_SUMMARY/i.test(k)) ?? keys[0];
  const execSentences = new Set<string>();
  for (const s of splitSentences(blocks[priorityKey] ?? "", minLen)) {
    execSentences.add(normalizeSentence(s));
  }

  for (const key of keys) {
    const raw = blocks[key] ?? "";
    const sentences = splitSentences(raw, minLen);

    if (key === priorityKey) {
      result[key] = raw;
      continue;
    }

    const seen = new Set<string>(execSentences);
    const kept: string[] = [];
    for (const s of sentences) {
      const norm = normalizeSentence(s);
      if (seen.has(norm)) {
        removedCount++;
        continue;
      }
      seen.add(norm);
      kept.push(s);
    }
    result[key] = kept.join(" ").replace(/\s+/g, " ").trim() || raw;
  }

  return { blocks: result, removedCount };
}
