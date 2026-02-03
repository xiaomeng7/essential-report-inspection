/**
 * Step 4 — Property signals (Overall Risk) ingestion.
 * Test: if any urgent liability exists, overall risk cannot be Low.
 * Run: npx tsx scripts/test-property-signals.ts
 */

import { buildReportData } from "../netlify/functions/generateWordReport.js";
import type { StoredInspection } from "../netlify/functions/lib/store.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.log("  ✓", message);
}

async function main(): Promise<void> {
  // One custom finding with safety HIGH + liability HIGH → urgent; property signals would still
  // drive overall_health, but we require OVERALL_RISK_LABEL cannot be Low when any finding is urgent.
  const inspectionWithUrgent: StoredInspection = {
    inspection_id: "prop-signals-urgent",
    raw: {
      custom_findings_completed: [
        {
          id: "C_URGENT",
          safety: "HIGH",
          urgency: "IMMEDIATE",
          liability: "HIGH",
          severity: 2,
          likelihood: 2,
          escalation: "LOW",
          budget_low: 200,
          budget_high: 800,
        },
      ],
    },
    report_html: "",
    findings: [{ id: "C_URGENT", priority: "IMMEDIATE", title: "Urgent item" }],
    limitations: [],
  };

  const dataUrgent = await buildReportData(inspectionWithUrgent);
  assert(
    dataUrgent.OVERALL_RISK_LABEL !== "Low",
    "With one urgent liability finding, OVERALL_RISK_LABEL is not Low (floor applied)"
  );
  assert(
    dataUrgent.OVERALL_RISK_LABEL === "Moderate" || dataUrgent.OVERALL_RISK_LABEL === "Elevated",
    "OVERALL_RISK_LABEL is Moderate or Elevated"
  );

  // All low-risk custom findings → can be Low
  const inspectionLow: StoredInspection = {
    inspection_id: "prop-signals-low",
    raw: {
      custom_findings_completed: [
        {
          id: "C_LOW",
          safety: "LOW",
          urgency: "LONG_TERM",
          liability: "LOW",
          severity: 1,
          likelihood: 1,
          escalation: "LOW",
          budget_low: 100,
          budget_high: 300,
        },
      ],
    },
    report_html: "",
    findings: [{ id: "C_LOW", priority: "PLAN_MONITOR", title: "Low item" }],
    limitations: [],
  };

  const dataLow = await buildReportData(inspectionLow);
  assert(
    dataLow.OVERALL_RISK_LABEL === "Low" || dataLow.OVERALL_RISK_LABEL === "Moderate",
    "With only low-risk finding, OVERALL_RISK_LABEL is Low or Moderate"
  );

  console.log("\nOVERALL_RISK_LABEL (urgent case):", dataUrgent.OVERALL_RISK_LABEL);
  console.log("OVERALL_RISK_LABEL (low case):", dataLow.OVERALL_RISK_LABEL);
  console.log("\nStep 4 property signals tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
