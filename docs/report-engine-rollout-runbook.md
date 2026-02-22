# Report Engine Rollout / Rollback Runbook

## Toggle Definitions

Primary mode:

- `report_engine_injection_mode=legacy`
- `report_engine_injection_mode=merged_what_this_means`
- `report_engine_injection_mode=merged_exec+wtm`
- `report_engine_injection_mode=merged_all`

Fine-grained overrides:

- `inject_executive=true|false`
- `inject_what_this_means=true|false`
- `inject_capex=true|false`
- `inject_findings=true|false`

Safety guard:

- merged capex/findings only switch when `hasExplicitModules=true` path is active

## Recommended Rollout Stages

### Stage 0 (Default)

- keep `mode=legacy`

### Stage 1 (Low Risk)

- enable `mode=merged_exec+wtm`
- keep explicit modules requirement

Observe:

- `slotSourceMap` reasons
- fallback ratio (`source=legacy`)

### Stage 2 (Medium Risk)

- enable `inject_capex=true` with explicit modules

Observe:

- `slotSourceMap.CAPEX_*` fallback frequency
- `CAPEX_SNAPSHOT` distribution (`TBD (site dependent)` ratio)

### Stage 3 (High Risk)

- enable `inject_findings=true`
- start with low-traffic `owner + energy`

Observe:

- `MERGED_FINDINGS_VALIDATION_FAILED:*`
- evidence link fallback ratio (`Photo link unavailable`)
- docx-level E2E guard results

### Stage 4 (Before Full Rollout)

- extend to `tenant + lifecycle`
- then optional `investor + lifecycle` (explicit modules only)

## Rollback

Immediate rollback options:

- set `mode=legacy`, or
- disable target flags (`inject_capex=false`, `inject_findings=false`)

Effect:

- all merged slot overrides stop immediately
- output returns to legacy source of truth

## Reason Code Reference

- `DEFAULT_LEGACY_MODE`
- `INJECTION_FLAG_DISABLED`
- `NO_EXPLICIT_MODULES`
- `MERGED_WTM_APPLIED`
- `MERGED_WTM_EMPTY`
- `MERGED_EXEC_APPLIED`
- `MERGED_EXEC_EMPTY`
- `MERGED_CAPEX_APPLIED`
- `MERGED_CAPEX_EMPTY`
- `MERGED_FINDINGS_APPLIED`
- `MERGED_FINDINGS_VALIDATION_FAILED:<detail>`
