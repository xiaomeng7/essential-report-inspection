/**
 * Dev fixture: Generate thermal sample data for report testing.
 *
 * Usage:
 *   npx tsx scripts/dev-create-thermal-sample.ts
 *     → Writes sample-inspection-with-thermal.json (full sample inspection with thermal)
 *
 *   npx tsx scripts/dev-create-thermal-sample.ts <inspection_id>
 *     → Writes thermal-patch-<id>.json (thermal data only). To inject into an existing
 *       inspection, you must run within netlify dev and use a dev API, or manually
 *       merge via Netlify Blobs dashboard.
 *
 * Note: connectLambda() requires Netlify Lambda context. Run without args to get
 * the sample file, then POST it to /api/submitInspection (with valid address) to
 * create a new inspection with thermal, or use the thermal section in the wizard.
 */

import { config as loadDotenv } from "dotenv";
import path from "path";
import fs from "fs";

const projectRoot = path.resolve(__dirname, "..");
loadDotenv({ path: path.join(projectRoot, ".env") });

const sampleThermal = {
  enabled: true,
  device: "Fluke iSee TC01A",
  ambient_c: 22.5,
  captures: [
    {
      id: "T01",
      area: "Switchboard",
      location_note: "Main switchboard – main switch and meter",
      max_temp_c: 34.2,
      delta_c: 11.7,
      risk_indicator: "AMBER",
      thermal_photo_id: "P01",
      visible_photo_id: "P02",
      created_at: new Date().toISOString(),
    },
    {
      id: "T02",
      area: "Kitchen GPOs",
      location_note: "Cooktop circuit",
      max_temp_c: 28.1,
      delta_c: 5.6,
      risk_indicator: "GREEN",
      thermal_photo_id: "P03",
      visible_photo_id: "P04",
      created_at: new Date().toISOString(),
    },
    {
      id: "T03",
      area: "Living room lighting",
      max_temp_c: 42.0,
      delta_c: 19.5,
      risk_indicator: "RED",
      thermal_photo_id: "P05",
      visible_photo_id: "P06",
      created_at: new Date().toISOString(),
    },
  ],
};

function main() {
  const inspectionId = process.argv[2]?.trim();

  if (!inspectionId) {
    const sampleInspection = {
      inspection_id: "EH-2026-02-001",
      raw: {
        created_at: new Date().toISOString(),
        job: {
          address: { value: "123 Sample St, Melbourne VIC 3000", status: "answered" },
          address_place_id: { value: "ChIJSample", status: "answered" },
          address_components: {
            value: { suburb: "Melbourne", state: "VIC", postcode: "3000" },
            status: "answered",
          },
        },
        signoff: {
          technician_name: { value: "Test Technician", status: "answered" },
          inspection_date: { value: new Date().toLocaleDateString("en-AU"), status: "answered" },
        },
        thermal: sampleThermal,
      },
      report_html: "<p>Sample report (thermal section would be generated)</p>",
      findings: [],
      limitations: [],
    };
    const outPath = path.join(projectRoot, "sample-inspection-with-thermal.json");
    fs.writeFileSync(outPath, JSON.stringify(sampleInspection, null, 2), "utf8");
    console.log("Wrote sample inspection with thermal to:", outPath);
    console.log("To test: run 'netlify dev', fill a real address in the sample file, then POST to /api/submitInspection.");
    return;
  }

  // With inspection_id: write thermal patch file only.
  // Blobs access from standalone script fails (connectLambda needs Netlify runtime).
  const patchPath = path.join(projectRoot, `thermal-patch-${inspectionId}.json`);
  fs.writeFileSync(patchPath, JSON.stringify({ thermal: sampleThermal }, null, 2), "utf8");
  console.log("Wrote thermal patch to:", patchPath);
  console.log("");
  console.log("To inject into inspection", inspectionId + ":");
  console.log("  1. Run 'netlify dev' in one terminal.");
  console.log("  2. Use the Inspection wizard → Thermal Imaging section to add thermal data, or");
  console.log("  3. Manually merge the 'thermal' object from the patch file into the inspection");
  console.log("     in Netlify Blobs (Inspections store, key = " + inspectionId + ").");
}

main();
