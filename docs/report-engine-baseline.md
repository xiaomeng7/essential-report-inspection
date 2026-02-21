# Report Engine Baseline (Phase 1)

## 1) Purpose

This baseline documents how the current Word report engine runs today, and defines the **non-breakable compatibility surface** for modular upgrades.

Scope:
- Word generation entrypoint and orchestration
- DOCX rendering path
- Findings dynamic page generation rules
- CapEx table generation path
- Placeholder/slot map by section
- Backward-compatibility baseline

Out of scope:
- New profile/module behavior (Phase 2+)
- Template redesign

---

## 2) Current End-to-End Flow

## 2.1 Runtime entrypoint

- Primary function entry: `netlify/functions/generateWordReport.ts` (`handler`)
- Main data build:
  - `buildReportData(...)` builds normalized placeholder data and computed fields.
  - `buildCoverData(...)` builds cover-only fields.
- Report body build:
  - `buildStructuredReport(...)` in `netlify/functions/lib/buildReportMarkdown.ts`
  - `renderReportFromSlots(...)` applies slot skeleton
  - `markdownToHtml(...)` turns markdown+HTML mix into final HTML body

## 2.2 Rendering strategy (actual production path)

- Final DOCX is rendered via:
  - `renderDocxByMergingCoverAndBody(...)` in `netlify/functions/lib/renderDocx.ts`
- Steps:
  1. Use `docxtemplater + pizzip` to render **cover template fields** into DOCX.
  2. Convert HTML report body to DOCX via `html-to-docx`.
  3. Merge cover/body XML content (manual merge strategy).
  4. Validate merged `word/document.xml` length and body markers.

Important:
- This path keeps Word template compatibility while avoiding HTML-placeholder injection failures.
- The old alternatives still exist (`renderDocxWithHtmlMerge`, `renderDocxWithHtmlAsText`) but production path uses `renderDocxByMergingCoverAndBody`.

## 2.3 Template contract guards

Before rendering, current code enforces:
- Template file `report-template-md.docx` must be found.
- `REPORT_BODY_HTML` tag text must exist in template XML and must not be split across runs.
- Generated report HTML must contain `SENTINEL_FINDINGS_V1`.
- If photo text exists, link structure checks are performed.

---

## 3) Report Section / Slot Map (Current Contract)

Source of truth for slot skeleton: `netlify/functions/lib/buildReportMarkdown.ts` (`REPORT_SKELETON`).

## 3.1 Section-to-slot mapping

1. Cover
- `{{COVER_SECTION}}`

2. How to read this report
- `{{HOW_TO_READ_SECTION}}`

3. Executive decision summary
- `{{OVERALL_STATUS_BADGE}}`
- `{{OVERALL_STATUS}}`
- `{{EXECUTIVE_DECISION_SIGNALS}}`
- `{{PRIORITY_SNAPSHOT_TABLE}}`
- `{{CAPEX_SNAPSHOT}}`

4. What this means for you
- `{{WHAT_THIS_MEANS_SECTION}}`

5. Scope and independence statement
- `{{SCOPE_SECTION}}`
- `{{LIMITATIONS_SECTION}}`

6. Methodology overview
- `{{METHODOLOGY_SECTION}}`

7. Observations and evidence
- `SENTINEL_FINDINGS_V1` (hard guard string)
- `{{FINDING_PAGES_HTML}}`

8. Risk prioritisation framework
- `{{PRIORITY_TABLE_ROWS}}`

9. Thermal imaging analysis
- `{{THERMAL_SECTION}}`

10. 5-year CapEx roadmap (budget plan)
- `{{CAPEX_TABLE_ROWS}}`
- `{{CAPEX_DISCLAIMER_LINE}}`

11. Owner decision pathways
- `SENTINEL_DECISION_V1`
- `{{DECISION_PATHWAYS}}`

12. Terms, limitations and legal framework
- `{{TERMS_AND_CONDITIONS}}`

13. Appendix (photos and test notes)
- `{{TEST_DATA_SECTION_HTML}}`
- `{{TECHNICAL_NOTES}}`

14. Closing Statement
- `{{CLOSING_STATEMENT}}`

## 3.2 Placeholder model map (typed)

Typed placeholder schema and defaults:
- `src/reporting/placeholderMap.ts`
- Includes aliases and required/optional keys:
  - Required examples: `PROPERTY_ADDRESS`, `PREPARED_FOR`, `ASSESSMENT_DATE`, `INSPECTION_ID`, `OVERALL_STATUS_BADGE`, `EXECUTIVE_DECISION_SIGNALS`, `CAPEX_SNAPSHOT`, `TERMS_AND_CONDITIONS`, `DYNAMIC_FINDING_PAGES`, `CLOSING_STATEMENT`, `REPORT_BODY_HTML`.

Legacy compatibility defaults and fallback are also implemented in:
- `netlify/functions/generateWordReport.ts` (`REQUIRED_KEYS`, `DEFAULT_PLACEHOLDER_VALUES`, `applyPlaceholderFallback`, `assertNoUndefined`)

---

## 4) Findings Generation Logic (Current)

## 4.1 Pipeline

- `buildStructuredReport(...)` calls `buildObservedConditionsSection(...)`
- `buildObservedConditionsSection(...)` delegates to `generateDynamicFindingPages(...)`
- `generateDynamicFindingPages(...)` delegates to `generateFindingPages(...)` in `netlify/functions/lib/generateFindingPages.ts`

## 4.2 Sorting / grouping behavior

In `generateFindingPages(...)`:
- Findings are sorted by priority order:
  1. `IMMEDIATE`
  2. `RECOMMENDED` / `RECOMMENDED_0_3_MONTHS`
  3. `PLAN` / `PLAN_MONITOR`

## 4.3 Per-finding structure (enforced)

Each finding page is generated with strict section structure:
- Asset Component
- Observed Condition
- Evidence
- Risk Interpretation
- Risk Assessment Profile (9-dimension compact table)
- Priority Classification
- Budgetary Planning Range

Validation rules include:
- Risk Interpretation must contain minimum sentence structure and “if not addressed” semantics.
- Missing required sections produce validation errors and fail generation.

## 4.4 Photo/evidence behavior

- Photo IDs are sourced from `finding.photo_ids` (limited set, excludes base64).
- If photo metadata can be resolved:
  - Evidence becomes HTML list with signed links (`<a href="...">View photo</a>`).
- If no photo IDs:
  - Falls back to facts text or explicit “No photographic evidence captured...” default.

## 4.5 Output format

- Findings output is HTML blocks joined into `FINDING_PAGES_HTML` / observed section.
- Page breaks are injected before finding blocks.

---

## 5) CapEx Generation Logic (Current)

Current CapEx content has two complementary paths:

## 5.1 Structured report rendering path (active body output)

- `buildStructuredReport(...)` computes CapEx section via:
  - `buildCapExRoadmapSection(...)` in `buildReportMarkdown.ts`
- Extracted slots:
  - `CAPEX_TABLE_ROWS`
  - `CAPEX_DISCLAIMER_LINE`
  - `CAPEX_SNAPSHOT` (computed/fallback)

## 5.2 Placeholder data path (compatibility + non-body consumers)

- `buildReportData(...)` builds `CAPEX_TABLE_ROWS` via `buildCapExTableRows(...)` in `generateWordReport.ts`
- Data sources:
  - finding priority (effective priority)
  - profile/response/effective dimension budget values
  - timeline grouping by year buckets
- Produces markdown-like table rows and fallback rows when no items exist.

## 5.3 CapEx totals/snapshot

- Overall CapEx range comes from scoring outputs and/or finding-level budget aggregation.
- Attached fields include:
  - `CAPEX_SNAPSHOT`
  - `CAPEX_RANGE`
  - `capex_low_total`, `capex_high_total`, `capex_currency`, `capex_note` (attached metadata)

---

## 6) Backward Compatibility Baseline (Do Not Break)

This section is the Phase-1 “cannot break” contract.

## 6.1 Template & rendering invariants

Must remain true:
- Keep Word template architecture (`docxtemplater + pizzip`).
- Keep body merge strategy (`html-to-docx` + merged DOCX path), unless explicitly replaced with equivalent validated path.
- Keep `report-template-md.docx` loading and guard behavior.
- Keep `REPORT_BODY_HTML` presence/split-tag checks.
- Keep sentinel checks: `SENTINEL_FINDINGS_V1` (and decision sentinel where used).

## 6.2 Slot/field compatibility invariants

Must preserve:
- Existing slot names in `REPORT_SKELETON`.
- Existing required placeholders in `placeholderMap.ts` and `generateWordReport.ts`.
- Existing alias behavior (`CLIENT_NAME`/`PREPARED_FOR`, `EXEC_SUMMARY_TEXT`/`EXECUTIVE_DECISION_SIGNALS`, etc.).
- Default fallback behavior for missing/undefined fields.

## 6.3 Section existence invariants

For default report path, keep presence/order semantics of:
- Executive summary
- What this means
- Findings/evidence section
- CapEx roadmap
- Terms and legal section
- Appendix + technical notes
- Closing statement

## 6.4 Findings invariants

Must preserve:
- Priority-based sorting behavior.
- Structured finding block headings (asset/observed/evidence/risk/priority/budget).
- Evidence photo link mechanism and safe fallback when photos absent.
- Validation failure behavior (invalid findings fail generation rather than silently emitting broken output).

## 6.5 CapEx invariants

Must preserve:
- CapEx snapshot and roadmap slots.
- Disclaimer semantics (“planning/provisioning only; not quotation”).
- Compatibility of current grouping/count logic and fallback outputs under default profile path.

## 6.6 Default-mode baseline for Phase 2+

If no profile/modules are provided in future modular engine:
- Output should remain equivalent to current investor/risk baseline in:
  - Section presence/order
  - Key placeholder values
  - Terms/limitations presence
  - Findings and CapEx sections not missing

Allowed minor drift:
- Whitespace, punctuation, or equivalent phrasing without structural/contract changes.

Not allowed:
- Missing required sections
- Broken placeholder rendering (`undefined`, raw tags)
- Duplicate major section headers
- HTML source leakage into visible report text

---

## 7) Key Files (Current Baseline)

- Entry/orchestration:
  - `netlify/functions/generateWordReport.ts`
- DOCX render/merge:
  - `netlify/functions/lib/renderDocx.ts`
- Structured report & slot skeleton:
  - `netlify/functions/lib/buildReportMarkdown.ts`
- Dynamic finding pages:
  - `netlify/functions/lib/generateDynamicFindingPages.ts`
  - `netlify/functions/lib/generateFindingPages.ts`
- Placeholder schema/defaults:
  - `src/reporting/placeholderMap.ts`

---

## 8) Phase-1 Exit Criteria Check

This baseline now defines:
- How the current system runs end-to-end
- Exact section/slot map
- Findings generation/sorting/evidence behavior
- CapEx generation behavior and data origins
- Explicit non-breakable compatibility surface for modular refactor

This document is the mandatory reference for Phase 2 architecture skeleton work.
