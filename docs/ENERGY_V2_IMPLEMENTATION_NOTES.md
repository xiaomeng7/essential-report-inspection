# Energy v2 Call Graph & Data Flow

## 1) Technician form -> inspection state

- Frontend entry: `src/components/Wizard.tsx`
- State hook: `src/hooks/useInspection.ts`
- Key setter: `setAnswer(path, { value, status })`
- New v2 payload paths are written under:
  - `energy_v2.supply.*`
  - `energy_v2.stressTest.*`
  - `energy_v2.circuits[]`
  - `energy_v2.tariff.*`

## 2) Submit -> backend write raw

- Frontend submit function: `Wizard.submitInspection()`
- API endpoint: `POST /api/submitInspection`
- Backend handler: `netlify/functions/submitInspection.ts::handler`
- Backend normalization:
  - `raw.snapshot_intake = normalizeSnapshotIntake(raw)`
  - `raw.energy_v2 = normalizeEnergyV2(raw)` (fixed canonical path)

## 3) Persistence targets

- Netlify Blobs:
  - `netlify/functions/lib/store.ts::save(id, { raw, ... })`
  - stored object includes normalized `raw.energy_v2`
- DB (if enabled):
  - `netlify/functions/lib/dbInspectionsCore.ts::upsertInspectionCore`
  - persisted as `inspections.raw_json` (JSONB), includes `energy_v2`

## 4) Report generation read path

- Entry: `netlify/functions/generateWordReport.ts::handler`
- Read inspection: `get(inspection_id, ...)` from store
- Build plan: `buildTemplateDataWithLegacyPath` -> `buildReportPlan`

## 5) Energy module data path

- Mapper v2: `netlify/functions/lib/reportEngine/inputMappers/energyMapperV2.ts::mapEnergyInputV2`
  - primary source: `raw.energy_v2.*`
  - compatibility source: legacy measured/switchboard/load fields
  - tariff precedence: raw -> env -> `DEFAULT_TARIFF`
- Module compute: `netlify/functions/lib/reportEngine/energyModule.ts::energyModule.compute`
  - input -> metrics -> executive/wtm/capex/findings
  - outputs to `plan.merged.*`

## 6) Merged plan -> injection slots

- Injection gate: `netlify/functions/lib/reportEngine/injection/applyMergedOverrides.ts`
- Slots remain unchanged:
  - `executiveSummary`
  - `whatThisMeans`
  - `capexRows`
  - `findings`
- Findings HTML builder:
  - `netlify/functions/lib/reportEngine/findings/buildFindingPagesHtmlFromMerged.ts`
  - renders `finding.html` (tables/assumptions) into finding pages

## 7) Legacy energy paths still supported

- `measured.load_current`
- `measured.clamp_current`
- `switchboard.main_switch_rating`
- `job.supply_phase`
- `measured.voltage`
- `high_load_devices`

If `raw.energy_v2` is missing but legacy fields exist, mapper/module emits fallback output (not empty).
