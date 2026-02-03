/**
 * Tests for deterministic priority_final resolution (Step 1 — Data Model Upgrade).
 * Run: npm run test:priority-resolution  or  npx tsx scripts/test-priority-resolution.ts
 */

import {
  resolvePriorityFinal,
  isOverrideValid,
  type FindingWithPriorityFields,
} from "../netlify/functions/lib/priorityResolution.js";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
  console.log(`  ✓ ${label}`);
}

function runTests(): void {
  console.log("=== resolvePriorityFinal ===\n");

  // (a) No new fields -> final = priority (backward compat)
  assertEqual(
    resolvePriorityFinal({ priority: "RECOMMENDED_0_3_MONTHS" }),
    "RECOMMENDED_0_3_MONTHS",
    "no new fields -> final = priority"
  );

  // (b) priority_calculated only -> final = calculated
  assertEqual(
    resolvePriorityFinal({
      priority: "PLAN_MONITOR",
      priority_calculated: "URGENT",
    }),
    "URGENT",
    "calculated only -> final = calculated"
  );

  // (c) calculated + selected different + override_reason -> final = selected
  assertEqual(
    resolvePriorityFinal({
      priority: "PLAN_MONITOR",
      priority_selected: "IMMEDIATE",
      priority_calculated: "RECOMMENDED_0_3_MONTHS",
      override_reason: "Client requested earlier timeline",
    }),
    "IMMEDIATE",
    "override with reason -> final = selected"
  );

  // (d) calculated + selected different + no override_reason -> final = calculated (do not trust manual)
  assertEqual(
    resolvePriorityFinal({
      priority_selected: "IMMEDIATE",
      priority_calculated: "RECOMMENDED_0_3_MONTHS",
    }),
    "RECOMMENDED_0_3_MONTHS",
    "no override reason -> final = calculated"
  );

  // (e) priority_final already set -> use it
  assertEqual(
    resolvePriorityFinal({
      priority: "PLAN_MONITOR",
      priority_calculated: "URGENT",
      priority_final: "IMMEDIATE",
    }),
    "IMMEDIATE",
    "priority_final set -> use as-is"
  );

  // (f) empty override_reason does not allow override
  assertEqual(
    resolvePriorityFinal({
      priority_selected: "IMMEDIATE",
      priority_calculated: "PLAN_MONITOR",
      override_reason: "  ",
    }),
    "PLAN_MONITOR",
    "whitespace-only override_reason -> final = calculated"
  );

  // (g) priority_selected is never trusted as default: when no priority_calculated, use legacy priority only
  assertEqual(
    resolvePriorityFinal({
      priority: "RECOMMENDED_0_3_MONTHS",
      priority_selected: "IMMEDIATE",
    }),
    "RECOMMENDED_0_3_MONTHS",
    "no calculated -> use legacy priority, not priority_selected"
  );
  assertEqual(
    resolvePriorityFinal({
      priority_selected: "IMMEDIATE",
    }),
    "PLAN_MONITOR",
    "no calculated and no priority -> DEFAULT, never priority_selected"
  );

  console.log("\n=== isOverrideValid ===\n");

  assertEqual(
    isOverrideValid({ priority_calculated: "URGENT", priority_selected: "URGENT" }),
    true,
    "same selected and calculated -> valid"
  );
  assertEqual(
    isOverrideValid({
      priority_calculated: "URGENT",
      priority_selected: "PLAN_MONITOR",
      override_reason: "Accepted risk",
    }),
    true,
    "override with reason -> valid"
  );
  assertEqual(
    isOverrideValid({
      priority_calculated: "URGENT",
      priority_selected: "PLAN_MONITOR",
    }),
    false,
    "override without reason -> invalid"
  );

  console.log("\nAll priority resolution tests passed.");
}

runTests();
