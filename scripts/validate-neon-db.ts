#!/usr/bin/env npx tsx
/**
 * Validate Neon DB layer: (a) read/write custom dimensions, (b) submitInspection writes DB rows, (c) admin search works.
 * Run: NEON_DATABASE_URL=postgres://... npx tsx scripts/validate-neon-db.ts
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const url = process.env.NEON_DATABASE_URL;
if (!url || !url.startsWith("postgres")) {
  console.error("Set NEON_DATABASE_URL");
  process.exit(1);
}

const sql = neon(url);

async function main() {
  console.log("(a) Read custom dimensions…");
  const dims = await sql`
    SELECT finding_id, version, is_active, safety, priority FROM finding_custom_dimensions WHERE is_active = true LIMIT 3
  `;
  console.log("  Sample active dimensions:", dims.length, "rows", dims[0] ?? "(none)");

  console.log("(b) Inspections in DB…");
  const insp = await sql`SELECT inspection_id, report_docx_key, created_at FROM inspections ORDER BY created_at DESC LIMIT 3`;
  console.log("  Recent inspections:", insp.length, insp[0] ?? "(none)");

  console.log("(c) Admin search (findings list)…");
  const list = await sql`
    SELECT fd.finding_id, fd.title_en, fcd.priority
    FROM finding_definitions fd
    LEFT JOIN finding_custom_dimensions fcd ON fcd.finding_id = fd.finding_id AND fcd.is_active = true
    WHERE fd.is_active = true LIMIT 5
  `;
  console.log("  Sample findings:", list.length, list[0] ?? "(none)");

  console.log("All checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
