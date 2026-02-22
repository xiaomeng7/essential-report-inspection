# Report Engine Phase 6.5 - CapEx Injection (No Findings Injection)

## Scope

Phase 6.5 enables merged-source CapEx injection only:

- `CAPEX_TABLE_ROWS`
- `CAPEX_SNAPSHOT`

Findings injection remains out of scope.

Default behavior remains legacy-compatible.

## Injection Strategy

Injection entrypoint:

- `netlify/functions/lib/reportEngine/injection/applyMergedOverrides.ts`

When `inject_capex=true`:

1. read `plan.merged.capexRows`
2. `dedupeCapexRows(rows)` by global `rowKey`
3. render markdown-compatible rows via `renderCapexRowsMarkdown(rows)`
4. compute snapshot via `computeCapexSnapshotFromRows(rows)`
5. write:
   - `templateData.CAPEX_TABLE_ROWS`
   - `templateData.CAPEX_SNAPSHOT`
6. set source map:
   - `slotSourceMap.CAPEX_TABLE_ROWS = { source: "merged", reason: "inject_capex=true" }`
   - `slotSourceMap.CAPEX_SNAPSHOT = { source: "merged", reason: "inject_capex=true" }`

## Safety Strategy

To preserve default baseline reproducibility:

- if modules are **not explicitly selected**, capex injection is blocked even when `inject_capex=true`
- slot source remains legacy:
  - `CAPEX_TABLE_ROWS: legacy`
  - `CAPEX_SNAPSHOT: legacy`

This guard is driven by `hasExplicitModules`.

For diagnostics, guard paths carry explicit reason metadata, e.g.:

- `slotSourceMap.CAPEX_TABLE_ROWS = { source: "legacy", reason: "hasExplicitModules=false" }`

## rowKey Dedupe Rule

Rules:

- each capex row should carry `rowKey` with format `capex:<moduleId>:<slug>`
- if missing, engine/injection fallback generates deterministic `rowKey`
- dedupe key = `rowKey`
- collision resolution keeps:
  1. higher priority row (IMMEDIATE > RECOMMENDED > PLAN)
  2. if same priority, lower `sortKey`

CapEx rows also support optional structured amount fields for forward compatibility:

- `amountLow?: number`
- `amountHigh?: number`
- `currency?: "AUD" | string`
- `amountIsTbd?: boolean`

## Snapshot Rule

`computeCapexSnapshotFromRows(rows)`:

- first use structured amount fields if present
- fallback to text parse (`$x - $y`) only when structured amounts are absent
- when amount ranges are resolvable, sum all rows and return:
  - `AUD $<low> - $<high> (indicative, planning only)`
- when no parseable ranges are present, return conservative fallback:
  - `TBD (site dependent)`

No fallback to legacy snapshot in merged capex mode.

## Template-Compatible Rendering Rule

`renderCapexRowsMarkdown(rows)` outputs markdown table rows only:

- no raw HTML
- keep year bucket + item label + cost/notes style
- compatible with existing markdown pipeline

## Test Command

- `npx tsx scripts/test-report-engine-phase6.5-capex-injection.ts`

Covered checks:

1. legacy mode keeps capex slots unchanged
2. `modules=["energy"] + inject_capex=true`:
   - source map marks capex slots as merged
   - capex rows deterministic
   - rowKey unique and format-valid
3. no explicit modules + inject capex:
   - source map stays legacy (safety guard)
4. forbidden tokens:
   - no `undefined`
   - no HTML leakage in capex slot output
5. major header no-dup check remains valid

Major header list is now shared via:

- `netlify/functions/lib/reportEngine/injection/compatibilityContract.ts`
