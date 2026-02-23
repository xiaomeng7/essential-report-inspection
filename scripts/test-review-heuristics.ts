/**
 * Test review heuristic alerts. Validates that all rules trigger in respective combinations
 * and that computeHeuristicAlerts returns correct conditions.
 */

import { computeHeuristicAlerts } from "../src/lib/reviewHeuristics";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

console.log("=== Test: Stress Test Required ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {
      energy_v2: {
        stressTest: { performed: false },
        circuits: [],
      },
    },
    findings: [],
  });
  assert(out.stressTestRequired === true, "stressTestRequired when performed=false");
  assert(out.circuitBreakdownRecommended === false, "circuitBreakdownRecommended false when no assets");
  console.log("OK: stressTestRequired triggers when performed=false");
}

console.log("=== Test: Stress Test NOT required when performed=true ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {
      energy_v2: {
        stressTest: { performed: true },
        circuits: [],
      },
    },
    findings: [],
  });
  assert(out.stressTestRequired === false, "stressTestRequired false when performed=true");
  console.log("OK: stressTestRequired does not trigger when performed=true");
}

console.log("=== Test: Circuit Breakdown Recommended ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {
      energy_v2: { circuits: [] },
      snapshot_intake: { hasSolar: true, hasEv: false, hasBattery: false },
    },
    findings: [],
  });
  assert(out.circuitBreakdownRecommended === true, "circuitBreakdownRecommended when circuits empty and hasSolar");
  console.log("OK: circuitBreakdownRecommended triggers with hasSolar, empty circuits");

  const out2 = computeHeuristicAlerts({
    raw_data: {
      energy_v2: { circuits: [] },
      snapshot_intake: { hasSolar: false, hasEv: true, hasBattery: false },
    },
    findings: [],
  });
  assert(out2.circuitBreakdownRecommended === true, "circuitBreakdownRecommended with hasEv");

  const out3 = computeHeuristicAlerts({
    raw_data: {
      energy_v2: { circuits: [] },
      snapshot_intake: { hasSolar: false, hasEv: false, hasBattery: true },
    },
    findings: [],
  });
  assert(out3.circuitBreakdownRecommended === true, "circuitBreakdownRecommended with hasBattery");
  console.log("OK: circuitBreakdownRecommended triggers for hasEv and hasBattery");
}

console.log("=== Test: Circuit Breakdown NOT recommended when circuits present ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {
      energy_v2: { circuits: [{ label: "Kitchen", measuredCurrentA: 15 }] },
      snapshot_intake: { hasSolar: true },
    },
    findings: [],
  });
  assert(out.circuitBreakdownRecommended === false, "circuitBreakdownRecommended false when circuits present");
  console.log("OK: circuitBreakdownRecommended does not trigger when circuits provided");
}

console.log("=== Test: Photos/Notes Suggestion ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {},
    findings: [{ photo_ids: [] }, { photo_ids: [] }],
  });
  assert(out.photosNotesSuggested === true, "photosNotesSuggested when no photos and no notes");
  console.log("OK: photosNotesSuggested triggers when no photos, no notes");

  const out2 = computeHeuristicAlerts({
    raw_data: { notes: "Some notes" },
    findings: [{ photo_ids: [] }],
  });
  assert(out2.photosNotesSuggested === false, "photosNotesSuggested false when notes present");
  console.log("OK: photosNotesSuggested does not trigger when notes present");

  const out3 = computeHeuristicAlerts({
    raw_data: {},
    findings: [{ photo_ids: ["p1"] }],
  });
  assert(out3.photosNotesSuggested === false, "photosNotesSuggested false when photos present");
  console.log("OK: photosNotesSuggested does not trigger when photos present");
}

console.log("=== Test: Photos/Notes Suggestion SKIPPED when findings undefined (pre-submit) ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {},
    findings: undefined,
  });
  assert(out.photosNotesSuggested === false, "photosNotesSuggested false when findings undefined");
  console.log("OK: photosNotesSuggested skipped when findings undefined");
}

console.log("=== Test: Bill Calibration Suggestion ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {
      snapshot_intake: {
        occupancyType: "owner_occupied",
        billBand: "$2000–$4000",
        billUploadWilling: false,
      },
    },
    findings: [],
  });
  assert(out.billCalibrationSuggested === true, "billCalibrationSuggested when owner + billBand + !billUploadWilling");
  console.log("OK: billCalibrationSuggested triggers for owner + billBand + billUploadWilling=false");
}

console.log("=== Test: Bill Calibration NOT suggested when billUploadWilling=true ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {
      snapshot_intake: {
        occupancyType: "owner_occupied",
        billBand: "$2000–$4000",
        billUploadWilling: true,
      },
    },
    findings: [],
  });
  assert(out.billCalibrationSuggested === false, "billCalibrationSuggested false when billUploadWilling=true");
  console.log("OK: billCalibrationSuggested does not trigger when willing to share bills");
}

console.log("=== Test: Bill Calibration NOT suggested when not owner ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {
      snapshot_intake: {
        occupancyType: "investment",
        billBand: "$2000–$4000",
        billUploadWilling: false,
      },
    },
    findings: [],
  });
  assert(out.billCalibrationSuggested === false, "billCalibrationSuggested false when not owner");
  console.log("OK: billCalibrationSuggested does not trigger for investor");
}

console.log("=== Test: Combined conditions ===");
{
  const out = computeHeuristicAlerts({
    raw_data: {
      energy_v2: { stressTest: { performed: false }, circuits: [] },
      snapshot_intake: {
        occupancyType: "owner_occupied",
        hasSolar: true,
        billBand: "> $6000",
        billUploadWilling: false,
      },
    },
    findings: [],
  });
  assert(out.stressTestRequired === true, "combined: stressTestRequired");
  assert(out.circuitBreakdownRecommended === true, "combined: circuitBreakdownRecommended");
  assert(out.billCalibrationSuggested === true, "combined: billCalibrationSuggested");
  assert(out.photosNotesSuggested === true, "combined: photosNotesSuggested when findings=[] and no notes");
  console.log("OK: multiple alerts can trigger in combination");
}

console.log("\n=== All review heuristic tests passed ===");
