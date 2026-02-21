# Phase 4 - Energy Module (Shadow Mode)

## Scope

Phase 4 introduces a light `Energy Module` implementation on top of the existing module contract and merge rules.

This phase is intentionally shadow-only:
- output goes to `plan.merged`
- no direct Word template injection yet
- no change to legacy default investor output path

## Hard Constraints Kept

1. Word template unchanged
2. Legacy default output path unchanged
3. `renderDocxByMergingCoverAndBody` unchanged
4. Existing finding validator path unchanged
5. Energy conclusions are evidence-driven (verifiable source paths only)

## Activation Rule

Energy module applies **only when explicitly selected**:
- `applicability: input.modules includes "energy"`
- default profile/module path does not auto-activate energy output

## Verifiable Input Signals

Extracted from `inspection.raw` via fixed candidate paths:
- supply phase (e.g. `job.supply_phase`, `measured.phase`)
- voltage (e.g. `measured.voltage`)
- main switch rating (e.g. `switchboard.main_switch_rating`)
- measured load current / clamp current
- high load device list
- EV / solar / battery presence flags

Only non-empty extracted values produce output.
If no verifiable signals are present: module returns empty output.

Implementation note:
- Candidate path extraction is externalized in `reportEngine/inputMappers/energyMapper.ts`
- Mapper output contract: `{ energy?: EnergyInput, evidenceRefs: string[], evidenceCoverage }`

## Energy Output Shape

When active and evidence exists, module contributes:
- executive summary contribution (`energy.exec.*`)
- what-this-means contribution (`energy.wtm.*`)
- capex row contributions (stable row keys)
- finding block contributions (`ENERGY_CAPACITY_STRUCTURE`, `ENERGY_FUTURE_LOAD_PATHWAY`)

All contributions include stable keys and deterministic sorting hooks.
CapEx rows include globally unique `rowKey` (format: `capex:<moduleId>:<slug>`).
Findings include `evidenceCoverage` (`measured|observed|declared|unknown`) for future wording control.

## Regression Tests Added

- `scripts/test-report-engine-phase4-energy.ts`
  - verifies explicit-selection-only activation
  - verifies deterministic merged output for same input

Existing phase-3 tests continue to pass:
- `scripts/test-report-engine-phase3.ts`

## Injection Gate (Required Before Template Wiring)

When any merged content is injected into Word template slots, legacy slot sources must switch to merged as the single source of truth for those slots.

This is mandatory to avoid duplicate content (especially CapEx rows and findings summaries).

