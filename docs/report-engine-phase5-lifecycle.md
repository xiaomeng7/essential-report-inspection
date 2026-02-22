# Report Engine Phase 5 - Lifecycle Module (Shadow Mode)

## Scope

Phase 5 introduces a lightweight `lifecycle` module into the report engine contract and merge flow, while preserving backward compatibility:

- no Word template changes
- no render path changes
- no changes to legacy default investor output path
- lifecycle output only appears in `plan.merged` when explicitly selected

## Input Signals (Evidence-Driven)

Lifecycle extraction is implemented in `netlify/functions/lib/reportEngine/inputMappers/lifecycleMapper.ts`.

Mapped lifecycle signals:

- `propertyAgeBand`: `pre-1970 | 1970-1990 | 1990-2010 | post-2010 | unknown`
- `switchboardType`: `ceramic_fuse | rewireable_fuse | old_cb | modern_rcbo | unknown`
- `rcdCoverage`: `full | partial | none | unknown`
- `visibleThermalStress`: `boolean | undefined`
- `mixedWiringIndicators`: `boolean | undefined`
- `evidenceRefs`: `string[]` (photo/evidence references)

Rules:

- unknown stays unknown (no guessing)
- no meaningful signals -> no lifecycle output
- lifecycle applicability requires explicit module selection and meaningful signals

## Output Rules (Range + Conditional Triggers)

Implemented in `netlify/functions/lib/reportEngine/lifecycleModule.ts`.

### Executive Summary

- uses window/range language only (e.g. `6-12 months`, `0-12 months`)
- no pseudo-precision and no absolute failure statements
- all contributions use stable `key` + `sortKey`
- critical reminders can be marked `importance: "critical"` and `allowDuplicates: true`

### What This Means (Profile-Aware Bullets)

- investor: capex window + escalation triggers
- owner: load growth conflict and pre-upgrade review
- tenant: transparency and when to escalate to management

All outputs are bullet-style contributions, not long narrative blocks.

### Findings (FindingBlock Contract)

Lifecycle findings are produced as `FindingBlock[]` and remain compatible with the unified finding structure:

- priorities: `PLAN_MONITOR` / `RECOMMENDED_0_3_MONTHS`
- rationale is conditional (`If ... then ...`)
- no absolute words (`must`, `guarantee`, `100%`)
- includes evidence references and lifecycle `evidenceCoverage`

### CapEx Rows (Planning Only)

Lifecycle capex rows are planning items with `TBD` and year buckets:

- `Year 0-1`: switchboard modernisation planning
- `Year 1-2`: RCD/RCBO uplift planning
- `Year 3-5`: legacy wiring refresh pathway review

Each row uses globally unique `rowKey`, e.g. `capex:lifecycle:<slug>`.

## Deterministic + Compatibility Notes

Phase 3 merge rules are reused:

- key-based contribution dedupe (with `rowKey` for capex)
- deterministic ordering by merge sort keys
- priority-aware findings merge + density clipping policy remains effective

Compatibility posture:

- default flow (no explicit `modules: ["lifecycle"]`) does not produce lifecycle contributions
- `generateWordReport` legacy path remains unchanged (shadow mode only)

## Script Test Coverage (Phase 5)

Script: `scripts/test-report-engine-phase5-lifecycle.ts`

Covered checks:

1. default mode without explicit lifecycle selection -> no lifecycle merged contributions
2. explicit lifecycle selection -> merged output exists and deterministic
3. profile delta -> investor vs owner `whatThisMeans` differs
4. forbidden token scan -> no `must/guarantee/100%`

## Injection Gate Reminder (Before Phase 6 Template Wiring)

When any merged lifecycle content is injected into Word template slots, the corresponding legacy slot sources must switch to merged as the single source of truth for those slots. This is mandatory to avoid duplicate content and data drift (especially for CapEx and lifecycle findings summaries).
