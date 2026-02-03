/**
 * Step 7 — End-to-end validation: 9 dimensions → 3 decision outputs.
 * Sample: 2 custom findings (full dimensions) + 2 standard findings.
 * Run: npx tsx scripts/test-e2e-nine-dimensions.ts
 */

import { buildReportData } from "../netlify/functions/generateWordReport.js";
import { enrichFindingsWithCalculatedPriority } from "../netlify/functions/lib/customFindingPriority.js";
import type { StoredInspection } from "../netlify/functions/lib/store.js";
import { ALL_PLACEHOLDER_KEYS } from "../src/reporting/placeholderMap.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.log("  ✓", message);
}

async function main(): Promise<void> {
  // Sample StoredInspection: 2 custom (full 9 dimensions) + 2 standard findings.
  // StoredInspection: report_html and findings are top-level; raw only has custom_findings_completed.
  const inspection: StoredInspection = {
    inspection_id: "e2e-nine-dim",
    raw: {
      custom_findings_completed: [
        {
          id: "CUSTOM_PANEL_1",
          safety: "HIGH",
          urgency: "IMMEDIATE",
          liability: "HIGH",
          severity: 4,
          likelihood: 3,
          escalation: "HIGH",
          budget_low: 800,
          budget_high: 3500,
        },
        {
          id: "CUSTOM_LIGHTING_1",
          safety: "LOW",
          urgency: "LONG_TERM",
          liability: "LOW",
          severity: 2,
          likelihood: 2,
          escalation: "LOW",
          budget_low: 200,
          budget_high: 600,
        },
      ],
    },
    report_html: "",
    findings: [
      { id: "CUSTOM_PANEL_1", priority: "IMMEDIATE", title: "Custom panel finding" },
      { id: "CUSTOM_LIGHTING_1", priority: "PLAN_MONITOR", title: "Custom lighting finding" },
      { id: "NO_RCD_PROTECTION", priority: "IMMEDIATE", title: "No RCD protection" },
      { id: "PARTIAL_RCD_COVERAGE", priority: "RECOMMENDED_0_3_MONTHS", title: "Partial RCD coverage" },
    ],
    limitations: ["Some areas not accessible"],
  };

  const enriched = await enrichFindingsWithCalculatedPriority(inspection);
  const effective = (f: { priority_final?: string; priority?: string }) => f.priority_final ?? f.priority ?? "PLAN_MONITOR";

  console.log("=== Priorities (priority_final) ===\n");
  for (const f of enriched) {
    const pri = effective(f);
    console.log(`  ${f.id}: ${pri}`);
  }

  const data = await buildReportData(inspection);

  console.log("\n=== Capex totals (CAPEX_RANGE) ===\n");
  console.log("  CAPEX_RANGE:", data.CAPEX_RANGE);

  console.log("\n=== Overall risk label ===\n");
  console.log("  OVERALL_RISK_LABEL:", data.OVERALL_RISK_LABEL);

  console.log("\n=== Executive decision signals (first 400 chars) ===\n");
  const signals = data.EXECUTIVE_DECISION_SIGNALS || "";
  console.log("  " + signals.slice(0, 400).replace(/\n/g, "\n  ") + (signals.length > 400 ? "…" : ""));

  assert(data.CAPEX_RANGE != null && String(data.CAPEX_RANGE).length > 0, "CAPEX_RANGE present");
  assert(data.OVERALL_RISK_LABEL != null && String(data.OVERALL_RISK_LABEL).length > 0, "OVERALL_RISK_LABEL present");
  assert(data.EXECUTIVE_DECISION_SIGNALS != null && String(data.EXECUTIVE_DECISION_SIGNALS).length > 0, "EXECUTIVE_DECISION_SIGNALS present");
  assert(!String(data.EXECUTIVE_DECISION_SIGNALS).includes("AUD AUD"), "No duplicated currency (AUD AUD) in executive signals");
  assert(!String(data.CAPEX_RANGE).includes("AUD AUD"), "No duplicated currency in CAPEX_RANGE");

  const bullets = (data.EXECUTIVE_DECISION_SIGNALS || "").split(/\n/).filter((l) => l.trim().startsWith("•") || l.trim().startsWith("-"));
  assert(bullets.length <= 4, "Executive bullets <= 4");
  assert(
    String(data.EXECUTIVE_DECISION_SIGNALS).includes(data.CAPEX_RANGE) ||
      (data.CAPEX_RANGE === "To be confirmed" && bullets.some((b) => b.includes("CapEx") || b.includes("capital") || b.includes("provision"))),
    "Executive signals reference CapEx (or CAPEX_RANGE string / provisioning)"
  );

  console.log("\n=== Placeholder check (all keys) ===\n");
  const record = data as Record<string, unknown>;
  const missing: string[] = [];
  for (const key of ALL_PLACEHOLDER_KEYS) {
    const v = record[key];
    if (v === undefined || (typeof v === "string" && v === "undefined")) missing.push(key);
  }
  assert(missing.length === 0, `No missing placeholders (missing: ${missing.length ? missing.join(", ") : "none"})`);

  console.log("\nStep 7 E2E validation passed: priorities, capex, overall risk, executive bullets OK; no AUD AUD; no missing placeholders.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
