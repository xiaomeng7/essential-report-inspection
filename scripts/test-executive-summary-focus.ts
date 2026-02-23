/**
 * Focus-based Executive Summary tests
 * - Risk-heavy scenario shows only Risk section
 * - Energy-heavy scenario shows only Energy section
 * - Balanced scenario shows Balanced section
 * Run: npx tsx scripts/test-executive-summary-focus.ts
 */

import {
  computeFocusScores,
  deriveFocusFlags,
  buildRiskFocusedBlock,
  buildEnergyFocusedBlock,
  buildBalancedBlock,
} from "../netlify/functions/lib/executiveSummaryFocusBuilder.js";
import { buildStructuredReport, renderReportFromSlots } from "../netlify/functions/lib/buildReportMarkdown.js";
import type { StructuredReport } from "../netlify/functions/lib/reportContract.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.log("  ✓", message);
}

function main(): void {
  console.log("\n--- Focus scoring and flags ---\n");

  // Risk-focused: primaryGoal = risk
  const riskScores = computeFocusScores("risk");
  const riskFlags = deriveFocusFlags(riskScores);
  assert(riskFlags.isFocusRisk === true, "primaryGoal=risk → isFocusRisk=true");
  assert(riskFlags.isFocusEnergy === false, "primaryGoal=risk → isFocusEnergy=false");
  assert(riskFlags.isFocusBalanced === false, "primaryGoal=risk → isFocusBalanced=false");
  assert(riskFlags.isFocusDefault === false, "primaryGoal=risk → isFocusDefault=false");

  // Energy-focused: primaryGoal = energy
  const energyScores = computeFocusScores("energy");
  const energyFlags = deriveFocusFlags(energyScores);
  assert(energyFlags.isFocusEnergy === true, "primaryGoal=energy → isFocusEnergy=true");
  assert(energyFlags.isFocusRisk === false, "primaryGoal=energy → isFocusRisk=false");

  // Balanced: primaryGoal = plan_upgrade
  const balancedScores = computeFocusScores("plan_upgrade");
  const balancedFlags = deriveFocusFlags(balancedScores);
  assert(balancedFlags.isFocusBalanced === true, "primaryGoal=plan_upgrade → isFocusBalanced=true");
  assert(balancedFlags.isFocusRisk === false, "primaryGoal=plan_upgrade → isFocusRisk=false");

  // Default: no primaryGoal, use weights
  const defaultScores = computeFocusScores(undefined, { energy: 70, lifecycle: 30 });
  const defaultFlags = deriveFocusFlags(defaultScores);
  assert(defaultFlags.isFocusEnergy === true, "weights energy>lifecycle → isFocusEnergy=true");

  console.log("\n--- Focus block content ---\n");

  // Risk block with stressRatio and tenantChangeSoon
  const riskBlock = buildRiskFocusedBlock({
    stressRatio: 0.85,
    tenantChangeSoon: true,
    symptomsContainsTripping: true,
    hasDetailedCircuits: true,
  });
  assert(riskBlock.includes("Executive Summary (Risk Focused)"), "Risk block has title");
  assert(riskBlock.includes("85%"), "Risk block shows stressRatio as percentage");
  assert(riskBlock.includes("Tenant Transition Soon"), "Risk block shows tenantChangeSoon");
  assert(riskBlock.includes("Breaker Trips Reported"), "Risk block shows symptomsContains tripping");
  assert(riskBlock.includes("Detailed Circuit Data"), "Risk block shows hasDetailedCircuits");

  // Energy block with billBand, hasSolar, hasEv
  const energyBlock = buildEnergyFocusedBlock({
    billBand: "AUD 2000–4000",
    allElectricNoGas: true,
    hasSolar: true,
    hasEv: true,
    billUploadWilling: true,
  });
  assert(energyBlock.includes("Executive Summary (Energy Focused)"), "Energy block has title");
  assert(energyBlock.includes("AUD 2000–4000"), "Energy block shows billBand");
  assert(energyBlock.includes("All-Electric Home"), "Energy block shows allElectricNoGas");
  assert(energyBlock.includes("Solar PV Present"), "Energy block shows hasSolar");
  assert(energyBlock.includes("EV Charger Present"), "Energy block shows hasEv");

  // Balanced block with hasDetailedCircuits false
  const balancedBlock = buildBalancedBlock({
    hasDetailedCircuits: false,
    billBand: "AUD 1500",
    billUploadWilling: true,
  });
  assert(balancedBlock.includes("Executive Summary (Balanced)"), "Balanced block has title");
  assert(
    balancedBlock.includes("Detailed circuit measurement was not supplied"),
    "Balanced block shows hasDetailedCircuits=false message"
  );
  assert(balancedBlock.includes("AUD 1500"), "Balanced block shows billBand");

  console.log("\n--- Conditional slot rendering (risk-only) ---\n");

  const riskReport: StructuredReport = {
    INSPECTION_ID: "test",
    ASSESSMENT_DATE: "2025-01-01",
    PREPARED_FOR: "Test",
    PREPARED_BY: "Test",
    PROPERTY_ADDRESS: "Test",
    PROPERTY_TYPE: "Residential",
    ASSESSMENT_PURPOSE: "Test",
    OVERALL_STATUS: "MODERATE",
    OVERALL_STATUS_BADGE: "Moderate",
    EXECUTIVE_DECISION_SIGNALS: "• Fallback content",
    CAPEX_SNAPSHOT: "To be confirmed",
    PRIORITY_TABLE_ROWS: "",
    SCOPE_SECTION: "",
    LIMITATIONS_SECTION: "",
    FINDING_PAGES_HTML: "",
    THERMAL_SECTION: "",
    CAPEX_TABLE_ROWS: "",
    CAPEX_DISCLAIMER_LINE: "",
    DECISION_PATHWAYS: "",
    TERMS_AND_CONDITIONS: "",
    TEST_DATA_SECTION: "",
    TECHNICAL_NOTES: "",
    CLOSING_STATEMENT: "",
    isFocusRisk: true,
    isFocusEnergy: false,
    isFocusBalanced: false,
    isFocusDefault: false,
    EXEC_SUMMARY_RISK_FOCUSED: "**Risk focused content**",
    EXEC_SUMMARY_ENERGY_FOCUSED: "",
    EXEC_SUMMARY_BALANCED: "",
  } as StructuredReport;

  const renderedRisk = renderReportFromSlots(riskReport);
  assert(renderedRisk.includes("Risk focused content"), "Rendered report shows Risk block when isFocusRisk");
  assert(!renderedRisk.includes("Executive Summary (Energy Focused)"), "Rendered report hides Energy block when isFocusEnergy=false");

  console.log("\n--- Conditional slot rendering (energy-only) ---\n");

  const energyReport: StructuredReport = {
    ...riskReport,
    isFocusRisk: false,
    isFocusEnergy: true,
    isFocusBalanced: false,
    isFocusDefault: false,
    EXEC_SUMMARY_RISK_FOCUSED: "",
    EXEC_SUMMARY_ENERGY_FOCUSED: "**Energy focused content**",
    EXEC_SUMMARY_BALANCED: "",
  } as StructuredReport;

  const renderedEnergy = renderReportFromSlots(energyReport);
  assert(renderedEnergy.includes("Energy focused content"), "Rendered report shows Energy block when isFocusEnergy");
  assert(!renderedEnergy.includes("Risk focused content"), "Rendered report hides Risk block when isFocusRisk=false");

  console.log("\n--- Conditional slot rendering (balanced-only) ---\n");

  const balancedReport: StructuredReport = {
    ...riskReport,
    isFocusRisk: false,
    isFocusEnergy: false,
    isFocusBalanced: true,
    isFocusDefault: false,
    EXEC_SUMMARY_RISK_FOCUSED: "",
    EXEC_SUMMARY_ENERGY_FOCUSED: "",
    EXEC_SUMMARY_BALANCED: "**Balanced content**",
  } as StructuredReport;

  const renderedBalanced = renderReportFromSlots(balancedReport);
  assert(renderedBalanced.includes("Balanced content"), "Rendered report shows Balanced block when isFocusBalanced");
  assert(!renderedBalanced.includes("Risk focused content"), "Rendered report hides Risk when balanced");

  console.log("\n--- Conditional slot rendering (default fallback) ---\n");

  const defaultReport: StructuredReport = {
    ...riskReport,
    isFocusRisk: false,
    isFocusEnergy: false,
    isFocusBalanced: false,
    isFocusDefault: true,
    EXEC_SUMMARY_RISK_FOCUSED: "",
    EXEC_SUMMARY_ENERGY_FOCUSED: "",
    EXEC_SUMMARY_BALANCED: "",
  } as StructuredReport;

  const renderedDefault = renderReportFromSlots(defaultReport);
  assert(renderedDefault.includes("Fallback content"), "Rendered report shows EXECUTIVE_DECISION_SIGNALS when isFocusDefault");

  console.log("\n✅ All focus-based Executive Summary tests passed.\n");
}

main();
