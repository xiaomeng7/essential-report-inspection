# Phase 3 - Module Contract and Merge Rules

This document defines the Phase 3 module contract and merge semantics for the modular report engine scaffold.

## 1) Module Contract

Source: `netlify/functions/lib/reportEngine/types.ts`

`ReportModule` must implement:
- `id`
- `name`
- `applicability(profile, input)`
- `compute(context)`

`compute(context)` returns `ModuleComputeOutput`:
- `executiveSummaryContrib: string[]`
- `whatThisMeansContrib: string[]`
- `capexRowsContrib: string[]`
- `findingsContrib: FindingBlock[]`

`FindingBlock` unified shape:
- `id`
- `moduleId`
- `title`
- `priority`
- `rationale`
- `evidenceRefs`
- `photos`
- `html`

## 2) Registry and Loading

Source: `netlify/functions/lib/reportEngine/modules.ts`

Current registry:
- `safety`
- `capacity`
- `energy`
- `lifecycle`

Modules are selected by:
1. Request modules (if provided), else
2. Profile default modules

Then filtered by `applicability(...)`.

## 3) Merge Rules (Engine)

Source: `netlify/functions/lib/reportEngine/engine.ts`

### 3.1 Executive Summary
- Merge all module `executiveSummaryContrib`
- Deduplicate by normalized string
- Respect profile-aware module order priority

### 3.2 What This Means
- Merge all module `whatThisMeansContrib`
- Deduplicate by normalized string
- Same ordering strategy as executive summary

### 3.3 CapEx Rows
- Merge all module `capexRowsContrib`
- Deduplicate by normalized string
- Same profile-aware module order

### 3.4 Findings
- Merge all `findingsContrib`
- Sort by:
  1. Profile-aware module order
  2. Internal finding priority:
     - `IMMEDIATE` / `URGENT`
     - `RECOMMENDED` / `RECOMMENDED_0_3_MONTHS`
     - `PLAN` / `PLAN_MONITOR`
  3. Title
- Apply narrative density cap:
  - `compact`: max 8
  - `standard`: max 16
  - `detailed`: max 24

## 4) Profile-Aware Module Order

- `investor`: `safety -> capacity -> lifecycle -> energy`
- `owner`: `energy -> capacity -> safety -> lifecycle`
- `tenant`: `safety -> capacity -> lifecycle -> energy`

This order changes content emphasis without deleting sections.

## 5) Backward Compatibility

Phase 3 remains backward-compatible by design:
- Legacy report generation output path is unchanged.
- Engine currently wraps legacy builder (`buildTemplateDataWithLegacyPath`).
- Module merged outputs are produced as plan metadata and do not yet override default Word output fields.

This guarantees default investor output stability while enabling Phase 4 feature expansion.
