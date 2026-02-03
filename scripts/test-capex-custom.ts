/**
 * Step 3 — CapEx compression for CUSTOM findings.
 * Test: two items (400–2000) and (300–600) → total (700–2600), CAPEX_RANGE "AUD $700 – $2,600".
 * Run: npx tsx scripts/test-capex-custom.ts
 */

import { buildReportData } from "../netlify/functions/generateWordReport.js";
import type { StoredInspection } from "../netlify/functions/lib/store.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.log("  ✓", message);
}

async function main(): Promise<void> {
  const inspection: StoredInspection = {
    inspection_id: "capex-test",
    raw: {
      custom_findings_completed: [
        {
          id: "C1",
          safety: "LOW",
          urgency: "LONG_TERM",
          liability: "LOW",
          severity: 2,
          likelihood: 3,
          escalation: "HIGH",
          budget_low: 400,
          budget_high: 2000,
        },
        {
          id: "C2",
          safety: "MODERATE",
          urgency: "SHORT_TERM",
          liability: "MEDIUM",
          severity: 2,
          likelihood: 2,
          escalation: "LOW",
          budget_low: 300,
          budget_high: 600,
        },
      ],
    },
    report_html: "",
    findings: [
      { id: "C1", priority: "RECOMMENDED_0_3_MONTHS", title: "Item A" },
      { id: "C2", priority: "RECOMMENDED_0_3_MONTHS", title: "Item B" },
    ],
    limitations: [],
  };

  const data = await buildReportData(inspection);

  assert(data.CAPEX_RANGE.includes("700"), "CAPEX_RANGE contains low total 700");
  assert(data.CAPEX_RANGE.includes("2,600"), "CAPEX_RANGE contains high total 2,600 (with comma)");
  assert(data.CAPEX_RANGE.startsWith("AUD $"), "CAPEX_RANGE format starts with AUD $ (no duplicate currency)");
  assert(!data.CAPEX_RANGE.includes("AUD AUD"), "CAPEX_RANGE has no duplicated currency");

  console.log("\nCAPEX_RANGE:", data.CAPEX_RANGE);
  console.log("\nStep 3 CapEx custom tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
