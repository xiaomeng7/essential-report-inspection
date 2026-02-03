/**
 * Tests for Step 2 — Priority compression for CUSTOM findings.
 * Run: npx tsx scripts/test-custom-priority.ts
 */

import {
  computeCustomFindingPriority,
  enrichFindingsWithCalculatedPriority,
} from "../netlify/functions/lib/customFindingPriority.js";
import type { StoredInspection } from "../netlify/functions/lib/store.js";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
  console.log(`  ✓ ${label}`);
}

async function runTests(): Promise<void> {
  console.log("=== computeCustomFindingPriority ===\n");

  // Custom finding with safety HIGH → Urgent (IMMEDIATE from rules matrix)
  const urgent = await computeCustomFindingPriority("CUSTOM_GPO_1", {
    id: "CUSTOM_GPO_1",
    safety: "HIGH",
    urgency: "SHORT_TERM",
    liability: "MEDIUM",
    severity: 2,
    likelihood: 2,
    escalation: "LOW",
  });
  assertEqual(urgent, "IMMEDIATE", "safety HIGH → IMMEDIATE (Urgent)");

  // Medium risk with high escalation → Budgetary (RECOMMENDED_0_3_MONTHS)
  const budgetaryEscalation = await computeCustomFindingPriority("CUSTOM_1", {
    safety: "LOW",
    urgency: "LONG_TERM",
    liability: "LOW",
    severity: 2,
    likelihood: 2,
    escalation: "HIGH",
  });
  assertEqual(budgetaryEscalation, "RECOMMENDED_0_3_MONTHS", "escalation HIGH + PLAN base → RECOMMENDED_0_3_MONTHS");

  // severity × likelihood >= 12 → Budgetary
  const budgetaryRisk = await computeCustomFindingPriority("CUSTOM_2", {
    safety: "LOW",
    urgency: "LONG_TERM",
    liability: "LOW",
    severity: 4,
    likelihood: 3,
    escalation: "LOW",
  });
  assertEqual(budgetaryRisk, "RECOMMENDED_0_3_MONTHS", "severity×likelihood >= 12 → RECOMMENDED_0_3_MONTHS");

  // Low everything → Acceptable (PLAN_MONITOR)
  const acceptable = await computeCustomFindingPriority("CUSTOM_3", {
    safety: "LOW",
    urgency: "LONG_TERM",
    liability: "LOW",
    severity: 1,
    likelihood: 1,
    escalation: "LOW",
  });
  assertEqual(acceptable, "PLAN_MONITOR", "low everything → PLAN_MONITOR (Acceptable)");

  // liability HIGH with MODERATE safety + SHORT_TERM → RECOMMENDED (matrix) or higher
  const liabilityHigh = await computeCustomFindingPriority("CUSTOM_4", {
    safety: "MODERATE",
    urgency: "SHORT_TERM",
    liability: "HIGH",
  });
  assertEqual(liabilityHigh, "RECOMMENDED_0_3_MONTHS", "MODERATE + SHORT_TERM → RECOMMENDED_0_3_MONTHS");

  console.log("\n=== enrichFindingsWithCalculatedPriority ===\n");

  const inspection: StoredInspection = {
    inspection_id: "test-1",
    raw: {
      custom_findings_completed: [
        {
          id: "CUSTOM_A",
          safety: "HIGH",
          urgency: "IMMEDIATE",
          liability: "HIGH",
          severity: 3,
          likelihood: 2,
          escalation: "LOW",
        },
      ],
    },
    report_html: "",
    findings: [
      { id: "CUSTOM_A", priority: "PLAN_MONITOR", title: "Custom A" },
      { id: "STANDARD_X", priority: "RECOMMENDED_0_3_MONTHS", title: "Standard X" },
    ],
    limitations: [],
  };

  const enriched = await enrichFindingsWithCalculatedPriority(inspection);
  const customA = enriched.find(f => f.id === "CUSTOM_A");
  const standardX = enriched.find(f => f.id === "STANDARD_X");

  assertEqual(customA?.priority_calculated, "IMMEDIATE", "CUSTOM_A calculated = IMMEDIATE (safety+urgency+liability high)");
  assertEqual(customA?.priority_final, "IMMEDIATE", "CUSTOM_A final = IMMEDIATE (no override)");
  assertEqual(standardX?.priority_final, "RECOMMENDED_0_3_MONTHS", "STANDARD_X keeps selected (no custom dimensions)");

  console.log("\nAll custom priority tests passed.");
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
