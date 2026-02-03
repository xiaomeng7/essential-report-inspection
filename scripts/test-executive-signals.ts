/**
 * Step 5 — Executive Decision Signals (deterministic).
 * Tests: bullet count <= 4, contains CAPEX_RANGE string, no duplicated currency (e.g. "AUD AUD").
 * Run: npx tsx scripts/test-executive-signals.ts
 */

import { buildReportData } from "../netlify/functions/generateWordReport.js";
import type { StoredInspection } from "../netlify/functions/lib/store.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.log("  ✓", message);
}

async function main(): Promise<void> {
  const inspection: StoredInspection = {
    inspection_id: "exec-signals-test",
    raw: {
      custom_findings_completed: [
        {
          id: "C1",
          safety: "MODERATE",
          urgency: "SHORT_TERM",
          liability: "MEDIUM",
          severity: 2,
          likelihood: 3,
          escalation: "HIGH",
          budget_low: 400,
          budget_high: 2000,
        },
      ],
    },
    report_html: "",
    findings: [{ id: "C1", priority: "RECOMMENDED_0_3_MONTHS", title: "Item one" }],
    limitations: [],
  };

  const data = await buildReportData(inspection);
  const signals = data.EXECUTIVE_DECISION_SIGNALS || "";
  const bullets = signals.split(/\n/).filter((l) => l.trim().startsWith("•") || l.trim().startsWith("-"));

  assert(bullets.length <= 4, "Executive bullets count <= 4");
  assert(
    signals.includes("700") || signals.includes("2,600") || signals.includes("400") || signals.includes("2,000") || signals.includes("To be confirmed"),
    "EXECUTIVE_DECISION_SIGNALS contains CapEx-related content (number or To be confirmed)"
  );
  assert(!signals.includes("AUD AUD"), "No duplicated currency (AUD AUD)");
  assert(bullets.length >= 2, "At least 2 bullets");

  console.log("\nBullet count:", bullets.length);
  console.log("Sample (first 2):", bullets.slice(0, 2).join(" | "));
  console.log("\nStep 5 executive signals tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
