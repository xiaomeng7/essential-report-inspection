# Report Engine Phase 6 - Injection Plan (Minimal Surface)

## Goal

Inject `plan.merged` into the existing Word output chain with explicit, reversible controls:

- default path remains legacy investor-compatible
- merged content only applies when explicitly enabled
- single source of truth per slot (no dual-write for same slot)
- Phase 6 scope is limited to low/medium risk slots:
  - `WHAT_THIS_MEANS_SECTION`
  - `EXECUTIVE_DECISION_SIGNALS` (+ aliases)

## Injection Order (Risk Low -> High)

1. `WHAT_THIS_MEANS_SECTION` (Phase 6)
2. `EXECUTIVE_DECISION_SIGNALS` / `EXEC_SUMMARY_TEXT` / `EXECUTIVE_SUMMARY` (Phase 6)
3. `CAPEX_TABLE_ROWS` / `CAPEX_SNAPSHOT` (Phase 6.5+)
4. `FINDING_PAGES_HTML` (Phase 7)

## Slot Single-Source Matrix

| Slot | Legacy Source | Merged Source | Cutover Action |
|---|---|---|---|
| `WHAT_THIS_MEANS_SECTION` | computed guidance in markdown builder | `plan.merged.whatThisMeans` | override slot via `applyMergedOverrides`, source marked as merged |
| `EXECUTIVE_DECISION_SIGNALS` (+ `EXEC_SUMMARY_TEXT`, `EXECUTIVE_SUMMARY`) | legacy executive signals | `plan.merged.executiveSummary` | override primary + aliases in one place |
| `CAPEX_TABLE_ROWS` | legacy capex rows | `plan.merged.capexRows` | postponed; keep disabled by default |
| `FINDING_PAGES_HTML` | legacy observed findings HTML | `plan.merged.findings` -> html | postponed; keep disabled by default |

Implementation point:

- `netlify/functions/lib/reportEngine/injection/applyMergedOverrides.ts`
- output includes `slotSourceMap` for debug + test assertions

## Feature Flag Design

Supported mode:

- `report_engine_injection_mode: "legacy" | "merged_what_this_means" | "merged_exec+wtm" | "merged_all"`

Optional granular flags:

- `inject_what_this_means: boolean`
- `inject_executive: boolean`
- `inject_capex: boolean`
- `inject_findings: boolean`

Priority:

1. mode produces default flag set
2. granular flags can override mode per-slot
3. default remains `legacy`

## Phase 6 Implementation Notes

- `generateWordReport.ts` now parses `profile/modules/injection` request knobs.
- pipeline still builds legacy template data first.
- `buildReportPlan` runs in parallel path.
- `applyMergedOverrides` applies slot-level override before markdown/docx assembly.
- no changes to Word template and no changes to `renderDocxByMergingCoverAndBody`.

## Injection-Specific Assertions

Script-level checks (Phase 6 gate):

1. slot single-source assertion:
   - verify `slotSourceMap.WHAT_THIS_MEANS_SECTION === "merged"` when enabled.
2. no duplicate major header assertion:
   - render slot markdown and ensure major headers (e.g. `## Terms & Conditions`) appear once.
3. legacy-vs-merged shadow compare for default investor:
   - injection off -> output object unchanged
   - injection on for WTM/EXEC -> slot-level content changes only, no structural key drift

## Rollback Strategy

- force `report_engine_injection_mode=legacy` for instant rollback
- keep legacy builder logic intact
- override layer is additive and slot-scoped
- rollout recommendation:
  1. `merged_what_this_means`
  2. `merged_exec+wtm`
  3. postpone capex/findings to next phase
