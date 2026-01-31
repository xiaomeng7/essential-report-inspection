# NEXT STEP — Cursor Prompt (do exactly this, in order)

You are working in this repo. Goal: make DOCX output match Gold Sample deterministically.

## Step 0 — Locate the pipeline
Find where report HTML is created and injected into DOCX. Identify:
- buildReportMarkdown.ts (or buildReportHtml.ts)
- markdownToHtml.ts
- renderDocx.ts (renderDocxWithHtmlMerge / html merge strategy)
- generateWordReport.ts handler

Produce a short call-graph with file+function names.

## Step 1 — Introduce “Structured Report JSON” (single source of truth)
Create `netlify/functions/lib/reportContract.ts` exporting:
- `type StructuredReport = { ... }` (fields from REPORT OUTPUT CONTRACT v1)
- `assertReportReady(report: StructuredReport): void` implementing:
  - required fields present
  - forbidden values absent
  - executive signals rules
  - finding-page rules (at least check presence/order of 6 headings in html/md)
  - capex rows rules (no empty/pending)

Log a concise failure report listing which rule failed and which field.

## Step 2 — Convert builder to slot-only output
Refactor `buildReportMarkdown.ts`:
- Stop writing prose directly inside Markdown sections (except fixed headings).
- Instead: assemble a StructuredReport object:
  - cover fields from inspection.raw/canonical
  - purpose paragraph from defaults (ASSESSMENT_PURPOSE)
  - executive fields from computed (or generate with rules)
  - findings pages from generateFindingPages (already structured)
  - capex rows via profiles (ensure range always exists via band mapping)
  - terms from DEFAULT_TERMS.md
  - appendix from canonical.test_data

Then render Markdown using ONLY slots (skeleton), replacing slots with report fields.

## Step 3 — Run preflight before rendering DOCX
In generateWordReport.ts:
- Build StructuredReport report = buildStructuredReport(...)
- Call `assertReportReady(report)` BEFORE markdownToHtml and renderDocx
- If fail: return 400 with readable message to fix data/config

## Step 4 — Make Gold Sample diff test
Add `scripts/compareDocx.ts` (Node script) to:
- extract document.xml from generated docx and gold docx
- compare presence/order of key headings and tables:
  - Page 2 heading, Page 3 exec blocks, Priority table, CapEx table, Terms heading
- output a mismatch report (not a full diff)

Add npm script: `npm run report:diff -- <generated.docx> <gold.docx>`

## Step 5 — Confirm CSS actually applied
In markdownToHtml.ts:
- log `[report] css source` and include a checksum of css text
- in docx output, ensure table has fixed layout and wraps long text

## Deliverables
1) reportContract.ts + assertReportReady implemented
2) buildStructuredReport function producing StructuredReport
3) slot-only markdown skeleton renderer
4) preflight wired in generateWordReport.ts
5) compareDocx.ts script and npm script

Do not change business logic unless required to satisfy contract.
Keep commits small and explain each change briefly.
