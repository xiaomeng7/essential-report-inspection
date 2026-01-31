/**
 * Smoke test: sanitizeText and docxSafeNormalize must preserve <a href="...">
 * Run: npx tsx scripts/smoke-sanitize-anchor.ts
 */

import { sanitizeText } from "../netlify/functions/lib/sanitizeText";

// Inline docxSafeNormalize from markdownToHtml (same logic)
function docxSafeNormalize(html: string): string {
  return html
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}

const INPUT = '<a href="https://example.com/api/inspectionPhoto?inspection_id=EH-01&photo_id=P01">View photo</a>';
const EXPECTED_HREF = "https://example.com/api/inspectionPhoto?inspection_id=EH-01&photo_id=P01";

function run(): void {
  const afterSanitize = sanitizeText(INPUT, { preserveEmoji: true });
  const afterNormalize = docxSafeNormalize(afterSanitize);

  const hasAnchor = afterNormalize.includes("<a ") && afterNormalize.includes("href=");
  const hasExpectedUrl = afterNormalize.includes(EXPECTED_HREF);

  if (hasAnchor && hasExpectedUrl) {
    console.log("✅ Smoke test PASS: <a href=\"...\"> preserved after sanitize + docxSafeNormalize");
  } else {
    console.error("❌ Smoke test FAIL:");
    console.error("  hasAnchor:", hasAnchor, "hasExpectedUrl:", hasExpectedUrl);
    console.error("  output:", afterNormalize);
    process.exit(1);
  }
}

run();
