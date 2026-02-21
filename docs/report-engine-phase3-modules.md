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
- Deduplicate in deterministic order:
  - key-based dedupe first
  - text-canonical dedupe second
- `importance: "critical"` or `allowDuplicates: true` bypasses dedupe
- Respect profile-aware module order priority

### 3.2 What This Means
- Merge all module `whatThisMeansContrib`
- Same deterministic dedupe strategy (key first, text second)
- Same ordering strategy as executive summary

### 3.3 CapEx Rows
- Merge all module `capexRowsContrib`
- Deduplicate by stable `key` (prevents double counting)
- Same profile-aware module order

### 3.4 Findings
- Merge all `findingsContrib`
- Sort by:
  1. Profile-aware module order
  2. Internal finding priority:
     - `IMMEDIATE` / `URGENT`
     - `RECOMMENDED` / `RECOMMENDED_0_3_MONTHS`
     - `PLAN` / `PLAN_MONITOR`
  3. Same-level deterministic keys:
     - score (desc)
     - photo count (desc)
     - sortKey/key/id (asc)
- Apply narrative density cap:
  - `compact`: max 8
  - `standard`: max 16
  - `detailed`: max 24

### 3.5 Narrative Density Boundary
- `compact`:
  - findings total <= 8
  - findings per module <= 3
  - bullets per module <= 2
- `standard`:
  - findings total <= 16
  - findings per module <= 6
  - bullets per module <= 4
- `detailed`:
  - findings total <= 24
  - findings per module <= high threshold (no practical clipping)
  - bullets per module <= high threshold

Clipping order is fixed by priority tier: IMMEDIATE -> RECOMMENDED -> PLAN.

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

## 6) CapEx Double-Count Guard

`compareLegacyVsMergedCapexRows(...)` is provided in engine for shadow-mode alignment checks:
- compare legacy CapEx rows vs merged CapEx row keys
- detect divergence before switching merged rows as source of truth in later phases
