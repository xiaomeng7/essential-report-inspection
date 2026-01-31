#!/usr/bin/env npx tsx
/**
 * Compare generated docx with gold sample.
 * Extracts document.xml from both, compares presence/order of key headings and tables.
 * Usage: npm run report:diff -- <generated.docx> <gold.docx>
 */

import fs from "fs";

async function extractDocumentXml(docxPath: string): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const buf = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file("word/document.xml");
  if (!entry) {
    throw new Error(`No word/document.xml in ${docxPath}`);
  }
  return entry.async("string");
}

function extractTextFromXml(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const KEY_HEADINGS = [
  "Document Purpose",
  "Executive Summary",
  "Overall",
  "Priority Overview",
  "Assessment Scope",
  "Observed Conditions",
  "Thermal Imaging",
  "Test Data",
  "CapEx",
  "Decision Pathways",
  "Terms",
  "Closing",
];

function findHeadingOrder(xml: string): Array<{ heading: string; found: boolean }> {
  const text = extractTextFromXml(xml);
  return KEY_HEADINGS.map((h) => ({
    heading: h,
    found: text.toLowerCase().includes(h.toLowerCase()),
  }));
}

function findTables(xml: string): number {
  const matches = xml.match(/<w:tbl/g);
  return matches ? matches.length : 0;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: npm run report:diff -- <generated.docx> <gold.docx>");
    process.exit(1);
  }
  const [generatedPath, goldPath] = args;
  if (!fs.existsSync(generatedPath)) {
    console.error("Generated file not found:", generatedPath);
    process.exit(1);
  }
  if (!fs.existsSync(goldPath)) {
    console.error("Gold file not found:", goldPath);
    process.exit(1);
  }

  const generatedXml = await extractDocumentXml(generatedPath);
  const goldXml = await extractDocumentXml(goldPath);

  const generatedHeadings = findHeadingOrder(generatedXml);
  const goldHeadings = findHeadingOrder(goldXml);
  const genTables = findTables(generatedXml);
  const goldTables = findTables(goldXml);

  const mismatches: string[] = [];

  for (let i = 0; i < KEY_HEADINGS.length; i++) {
    const h = KEY_HEADINGS[i];
    if (generatedHeadings[i].found !== goldHeadings[i].found) {
      mismatches.push(
        `Heading "${h}": generated=${generatedHeadings[i].found}, gold=${goldHeadings[i].found}`
      );
    }
  }

  if (Math.abs(genTables - goldTables) > 2) {
    mismatches.push(`Table count: generated=${genTables}, gold=${goldTables}`);
  }

  if (mismatches.length > 0) {
    console.log("=== Mismatch Report ===\n");
    mismatches.forEach((m) => console.log("  -", m));
    process.exit(1);
  }

  console.log("✓ Key headings and tables match");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
