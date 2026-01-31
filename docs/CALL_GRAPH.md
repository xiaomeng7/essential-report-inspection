# Report Pipeline Call Graph

```
generateWordReport.ts :: handler
  ├─ get(inspection_id, event)                    → StoredInspection
  ├─ loadResponses(event)                         → responses.yml
  ├─ buildReportData(inspection, event)           → PlaceholderReportData
  ├─ buildCoverData(inspection, event)            → coverData
  ├─ buildReportHtml(...)                         [buildReportMarkdown.ts]
  │     ├─ buildCoverSection, buildPurposeSection, buildExecutiveSummarySection
  │     ├─ buildPriorityOverviewSection, buildScopeSection
  │     ├─ buildObservedConditionsSection → generateFindingPages
  │     ├─ buildThermalImagingSection, buildAppendixSection
  │     ├─ buildCapExRoadmapSection, buildDecisionPathwaysSection
  │     ├─ buildTermsSection, buildClosingSection
  │     ├─ sections.join("") + PAGE_BREAK
  │     └─ markdownToHtml(mixedContent)
  │           [markdownToHtml.ts]
  │           ├─ md.render(markdown)
  │           ├─ docxSafeNormalize(htmlBody)
  │           ├─ sanitizeText(htmlBody, { preserveEmoji: true })
  │           ├─ loadReportCss()
  │           └─ return <!doctype html>...<body>...</body>
  ├─ rawTemplateData = { ...coverData, REPORT_BODY_HTML: reportHtml, ... }
  ├─ assertNoUndefined → sanitizeObject → applyPlaceholderFallback → templateData
  ├─ renderDocx(templateBuffer, templateData)
  │     [renderDocx.ts]
  │     └─ renderDocxWithHtmlMerge
  │           ├─ coverData → docxtemplater
  │           ├─ asBlob(htmlContent)
  │           └─ DocxMerger([coverBuffer, htmlDocxBuffer])
  └─ saveWordDoc(blobKey, outBuffer, event)
```
