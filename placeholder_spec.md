# Placeholder specification (DOCX template)

## 1) Syntax
- Use double curly braces: `{{PLACEHOLDER_NAME}}`
- **No spaces** inside braces.
- **Uppercase + underscores** only: `A-Z`, `0-9`, `_`
- Each placeholder must appear as **one continuous text run** in Word (do not split across different formatting runs).
- Recommended: put placeholders in their **own paragraph** or **own table cell**.

## 2) Required placeholders (master template)
### Core identity
- `{{PROPERTY_ADDRESS}}`
- `{{CLIENT_NAME}}`
- `{{ASSESSMENT_DATE}}`
- `{{REPORT_ID}}`

### Executive / decision layer
- `{{OVERALL_RISK_LABEL}}` (e.g. LOW / MODERATE / ELEVATED)
- `{{EXECUTIVE_SUMMARY_PARAGRAPH}}`
- `{{CAPEX_RANGE}}` (e.g. 2,400–3,200)
- `{{CAPEX_NOTE}}`

### Meaning / next step
- `{{ACTION_NOW_SUMMARY}}`
- `{{PLANNED_WORK_SUMMARY}}`
- `{{MONITOR_ITEMS_SUMMARY}}`
- `{{DECISION_CONFIDENCE_STATEMENT}}`

### Scope / independence / methodology
- `{{SCOPE_BULLETS}}`
- `{{INDEPENDENCE_STATEMENT}}`
- `{{METHODOLOGY_OVERVIEW_TEXT}}`

### Findings section (dynamic)
- `{{DYNAMIC_FINDING_PAGES}}` (the generator inserts the full findings pages here)

### Risk framework
- `{{RISK_FRAMEWORK_NOTES}}`

### CapEx table (budget plan)
Provide up to 5 rows. If fewer than 5, leave the unused placeholders blank.
- Row 1: `{{CAPEX_ITEM_1}}`, `{{CAPEX_CONDITION_1}}`, `{{CAPEX_PRIORITY_1}}`, `{{CAPEX_TIMELINE_1}}`, `{{CAPEX_BUDGET_1}}`
- Row 2: `{{CAPEX_ITEM_2}}`, `{{CAPEX_CONDITION_2}}`, `{{CAPEX_PRIORITY_2}}`, `{{CAPEX_TIMELINE_2}}`, `{{CAPEX_BUDGET_2}}`
- Row 3: `{{CAPEX_ITEM_3}}`, `{{CAPEX_CONDITION_3}}`, `{{CAPEX_PRIORITY_3}}`, `{{CAPEX_TIMELINE_3}}`, `{{CAPEX_BUDGET_3}}`
- Row 4: `{{CAPEX_ITEM_4}}`, `{{CAPEX_CONDITION_4}}`, `{{CAPEX_PRIORITY_4}}`, `{{CAPEX_TIMELINE_4}}`, `{{CAPEX_BUDGET_4}}`
- Row 5: `{{CAPEX_ITEM_5}}`, `{{CAPEX_CONDITION_5}}`, `{{CAPEX_PRIORITY_5}}`, `{{CAPEX_TIMELINE_5}}`, `{{CAPEX_BUDGET_5}}`

### Owner options
- `{{OWNER_OPTIONS_TEXT}}`

### Legal
- `{{LEGAL_DISCLAIMER_TEXT}}` (insert the full legal page content as plain text; keep it under ~1.5 pages)

### Appendix
- `{{APPENDIX_CONTENT}}`

## 3) Safety rule (critical)
**Never** apply different bold/italic/color to only part of a placeholder.
If you need emphasis, wrap the whole placeholder in one run (or keep it plain and style after substitution).
