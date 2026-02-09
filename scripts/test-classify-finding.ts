/**
 * Unit tests for classifyFinding() keyword and mapping rules.
 * Run: npx tsx scripts/test-classify-finding.ts  or  npm run test:classify-finding
 */

import { classifyFinding } from "../netlify/functions/lib/findingClassification";

function assertEqual<T>(actual: T, expected: T, label: string): void {
  const j = (x: T) => JSON.stringify(x);
  if (j(actual) !== j(expected)) {
    throw new Error(`${label}: expected ${j(expected)}, got ${j(actual)}`);
  }
  console.log(`  ✓ ${label}`);
}

function runTests(): void {
  console.log("=== classifyFinding: system_group (first-match) ===\n");

  assertEqual(classifyFinding("SWITCHBOARD_NO_RCD_OR_RCBO").system_group, "Switchboard", "SWITCHBOARD_* → Switchboard");
  assertEqual(classifyFinding("SWITCHBOARD_AGED_ORIGINAL").system_group, "Switchboard", "SWITCHBOARD_* → Switchboard");
  assertEqual(classifyFinding("ALARM_SOUNDED").system_group, "Safety", "ALARM_SOUNDED → Safety (SMOKE_ALARM/ALARM)");
  assertEqual(classifyFinding("SMOKE_ALARM_PRESENT").system_group, "Safety", "SMOKE_ALARM → Safety");
  assertEqual(classifyFinding("CABLE_DAMAGE_VISIBLE").system_group, "Cabling", "CABLE_* → Cabling");
  assertEqual(classifyFinding("POWER_POINT_PRESENT").system_group, "GPO", "POWER_POINT → GPO");
  assertEqual(classifyFinding("LIGHT_FITTING_PRESENT_ABOVE_BATH_SHOWER").system_group, "Lighting", "LIGHT_* → Lighting");
  assertEqual(classifyFinding("COOKTOP_PRESENT").system_group, "Appliances", "COOKTOP → Appliances");
  assertEqual(classifyFinding("BATHROOM").system_group, "Wet areas", "BATHROOM → Wet areas");
  assertEqual(classifyFinding("HEAT_DAMAGE_VISIBLE_ON_FITTING_OR_CEILING").system_group, "Thermal", "HEAT_* → Thermal");
  assertEqual(classifyFinding("ROOF_SPACE_ACCESSED").system_group, "Roof space", "ROOF_SPACE → Roof space");
  assertEqual(classifyFinding("ASBESTOS_SUSPECTED_BACKBOARD").system_group, "Hazards", "ASBESTOS → Hazards");
  assertEqual(classifyFinding("EXTENSION_LEAD_CONNECTED_AT_TIME_OF_INSPECTION").system_group, "Portable", "EXTENSION_LEAD → Portable");
  assertEqual(classifyFinding("ALL_CHECKLIST_ITEMS_COMPLETED").system_group, "Other", "no keyword → Other");

  console.log("\n=== classifyFinding: space_group (first-match) ===\n");

  assertEqual(classifyFinding("EXTERIOR_LIGHT_PRESENT").space_group, "External", "EXTERIOR → External");
  assertEqual(classifyFinding("POWER_POINT_PRESENT_IN_BATHROOM").space_group, "Internal", "BATHROOM → Internal");
  assertEqual(classifyFinding("GARAGE_DOOR_OPENER_PRESENT").space_group, "Ancillary", "GARAGE → Ancillary");
  assertEqual(classifyFinding("OVERALL_SWITCHBOARD").space_group, "Switchboard", "SWITCHBOARD → Switchboard");
  assertEqual(classifyFinding("POWER_POINT_PRESENT").space_group, "General", "POWER_POINT → General");

  console.log("\n=== classifyFinding: tags (all matching) ===\n");

  const alarmTags = classifyFinding("ALARM_SOUNDED").tags;
  if (!alarmTags.includes("safety")) throw new Error("ALARM_SOUNDED should have tag safety");
  console.log("  ✓ ALARM_SOUNDED includes tag safety");

  const cableTags = classifyFinding("CABLE_DAMAGE_VISIBLE").tags;
  if (!cableTags.includes("cabling")) throw new Error("CABLE_* should have tag cabling");
  console.log("  ✓ CABLE_DAMAGE_VISIBLE includes tag cabling");

  const switchTags = classifyFinding("SWITCHBOARD_CERAMIC_FUSES_PRESENT").tags;
  if (!switchTags.includes("switchboard")) throw new Error("SWITCHBOARD_* should have tag switchboard");
  console.log("  ✓ SWITCHBOARD_* includes tag switchboard");

  console.log("\n=== All classifyFinding tests passed ===\n");
}

runTests();
