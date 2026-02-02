#!/usr/bin/env npx tsx
/**
 * Verify that a generated DOCX contains hyperlinks (w:hyperlink or https://).
 * Usage: npx tsx scripts/verify-docx-links.ts <path-to-generated.docx>
 */

import fs from "fs";

async function main() {
  const docxPath = process.argv[2];
  if (!docxPath) {
    console.error("Usage: npx tsx scripts/verify-docx-links.ts <path-to-generated.docx>");
    process.exit(1);
  }
  if (!fs.existsSync(docxPath)) {
    console.error("File not found:", docxPath);
    process.exit(1);
  }

  const JSZip = (await import("jszip")).default;
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);
  const docEntry = zip.file("word/document.xml");
  if (!docEntry) {
    console.error("No word/document.xml in", docxPath);
    process.exit(1);
  }

  const xml = await docEntry.async("string");
  const hyperlinkMatches = xml.match(/<w:hyperlink/g);
  const httpsMatches = xml.match(/https:\/\//g);
  const linkCount = (hyperlinkMatches?.length ?? 0) + (httpsMatches?.length ?? 0);

  console.log("DOCX:", docxPath);
  console.log("w:hyperlink count:", hyperlinkMatches?.length ?? 0);
  console.log("https:// count:", httpsMatches?.length ?? 0);
  console.log("linkCount (total):", linkCount);

  if (linkCount === 0) {
    console.warn("⚠️  No hyperlinks found in word/document.xml — photo links may be missing");
    process.exit(1);
  }
  console.log("✅ DOCX contains hyperlinks");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
