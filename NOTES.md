# Snapshot -> Report Call Graph (Phase 0)

## Current entry points (this repo)

- Frontend submit: `src/components/Wizard.tsx` -> `submitInspection()` -> `POST /api/submitInspection`
- Backend submit handler: `netlify/functions/submitInspection.ts` -> `handler()`
- Raw persistence:
  - Blobs: `netlify/functions/lib/store.ts` -> `save(inspection_id, { raw, ... })`
  - DB: `netlify/functions/submitInspection.ts` -> `upsertInspectionCore({ raw_json: raw })`
- Report generation: `netlify/functions/generateWordReport.ts` -> `handler()`

## Short call-graph

`Snapshot/Intake Submit`
-> `Wizard.submitInspection()` (`src/components/Wizard.tsx`)
-> `submitInspection.handler()` (`netlify/functions/submitInspection.ts`)
-> `normalizeSnapshotIntake(raw)` (`netlify/functions/lib/report/snapshotContract.ts`)
-> write `raw.snapshot_intake`
-> persist `inspection.raw` (Blobs + DB `raw_json`)
-> `generateWordReport.handler()` (`netlify/functions/generateWordReport.ts`)
-> `extractSnapshotSignals(inspection.raw)` (`netlify/functions/lib/report/extractSnapshotSignals.ts`)
-> `resolveReportSelection(snapshotSignals, overrides)` (`netlify/functions/lib/report/resolveReportSelection.ts`)
-> `buildTemplateDataWithLegacyPath(...)` (`netlify/functions/lib/reportEngine/integration.ts`)
-> `buildReportPlan(...)` (`netlify/functions/lib/reportEngine/engine.ts`)
-> `applyMergedOverrides(...)` (`netlify/functions/lib/reportEngine/injection/applyMergedOverrides.ts`)
-> render chain (`buildStructuredReport` -> `markdownToHtml` -> `renderDocxByMergingCoverAndBody`)

## Cross-repo note

- Customer Snapshot page (`createServiceM8Job` etc.) lives in the separate snapshot repo.
- This repo now provides a stable intake contract path: `inspection.raw.snapshot_intake`.

## Sales confirm / override

- Default path: auto recommendation from `snapshot_intake` (target majority traffic).
- Optional override path: `generateWordReport` request params/body `profile` / `modules` still takes precedence (`source = "override"`).

---

# Go-live Checklist (Phase 5)

- [ ] `submitInspection` always writes `raw.snapshot_intake` (canonical shape)
- [ ] `extractSnapshotSignals` reads `raw.snapshot_intake.*` first
- [ ] Auto selection mapping:
  - [ ] `owner_occupied -> owner (+energy)`
  - [ ] `investment -> investor (+lifecycle)`
  - [ ] `tenant -> tenant (+energy only)`
- [ ] Request override still wins over snapshot auto selection
- [ ] Legacy fallback still works when old data has no `snapshot_intake`
- [ ] Logs present in report generation:
  - [ ] `[report-engine] snapshot signals extracted`
  - [ ] `[report-engine] resolved selection`
