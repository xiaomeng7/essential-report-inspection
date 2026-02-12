# Thermal Imaging Module (Premium)

## Overview

The Thermal Imaging module allows technicians to capture thermal and visible images at specific locations during an inspection. Data is stored per capture and rendered in a dedicated **THERMAL RISK SCREENING** section in the report (HTML + Word).

- **Classic**: Thermal module is optional; no thermal data required.
- **Premium**: Thermal imaging recommended; soft validation (warnings only, no hard block).

## Data Schema

Stored in `inspection.raw.thermal`:

```ts
thermal: {
  enabled: boolean;
  device?: string;           // e.g. "Fluke iSee TC01A", "Klein A-TI220", "Other"
  ambient_c?: number;       // ambient temperature (°C)
  captures: Array<{
    id: string;              // T01, T02...
    area: string;            // "Switchboard", "Kitchen GPOs", etc.
    location_note?: string;
    max_temp_c?: number;
    delta_c?: number;
    risk_indicator?: "GREEN" | "AMBER" | "RED";
    thermal_photo_id?: string;   // blob photo id
    visible_photo_id?: string;   // blob photo id
    created_at?: string;
  }>;
}
```

Defaults when missing: `enabled: false`, `captures: []`.

## Technician UI

1. **Section**: "Thermal Imaging (Premium)" appears after Measured Data in the wizard.
2. **Reminder banner**: "Attach the thermal camera lens to the tablet (USB-C) before capturing."
3. **Controls**:
   - Toggle: "Thermal imaging available on site" (default off)
   - Device dropdown: Fluke iSee TC01A / Klein A-TI220 / Other
   - Ambient temp input (°C, optional)
4. **Per capture**:
   - Area: Switchboard, Kitchen GPOs, Living room lighting, Roof space, Outdoor circuits, Other
   - Max temp (°C), Delta (°C), Risk (GREEN/AMBER/RED)
   - Buttons: "Capture Thermal Photo", "Capture Visible Photo"
   - Optional location note
5. Photos are compressed, staged as base64, and uploaded at submit (same pipeline as room photos).

## Review Page

On `/review/:inspection_id`, when `thermal.enabled` and `thermal.captures.length > 0`:
- Compact table: Area | Risk | Max | Delta | Thermal photo link | Visible photo link

## Report (HTML + Word)

**THERMAL RISK SCREENING** section renders only when `thermal.enabled === true` and `thermal.captures.length > 0`.

1. **Executive Snapshot** table:
   - Area | Max Temp | Ambient | Delta | Risk Indicator

2. **Detail tiles** (per capture):
   - Heading: `<Area> — Thermal Capture <id>`
   - Data line: max, ambient, delta, risk
   - **Interpretation** (auto by risk):
     - GREEN: No significant abnormal heat signatures observed...
     - AMBER: Moderate temperature variance observed...
     - RED: Abnormal heat signature observed...
   - **Recommended Action** (auto by risk):
     - GREEN: No immediate action required...
     - AMBER: Schedule targeted inspection/retightening within 3–6 months.
     - RED: Arrange investigation and rectification as soon as practicable.
   - **Planning Guidance**: Suggest bundling with switchboard work / RCD upgrades / planned maintenance.

Photo references are shown as "Photo Pxx / Photo Pyy" (view via report link if available).

## Validation (Soft)

- If `thermal.enabled` and a capture is missing `thermal_photo_id`: warning badge in UI (submission not blocked).
- On submit: log warning if `thermal.enabled` but `captures` list is empty.

## Test Fixture

Run `npx tsx scripts/dev-create-thermal-sample.ts` to inject thermal data into an inspection for quick report testing.
