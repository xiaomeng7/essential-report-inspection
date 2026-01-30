# Placeholder Map (Recommended)

This is the **stable** placeholder contract between your code and Word template.

## Page 1 – Cover
- PROPERTY_ADDRESS
- PREPARED_FOR
- ASSESSMENT_DATE
- PREPARED_BY
- INSPECTION_ID

## Page 2 – Purpose
- PURPOSE_PARAGRAPH
- HOW_TO_READ_PARAGRAPH

## Page 3 – Executive Summary
- OVERALL_STATUS_BADGE
- EXECUTIVE_DECISION_SIGNALS
- CAPEX_SNAPSHOT

## Page 4 – Priority Overview (Table)
- PRIORITY_TABLE_ROWS (optional if you hard-code the table in Word)

## Page 5 – Scope & Limitations
- SCOPE_SECTION
- LIMITATIONS_SECTION

## Pages 6–10 – Observed Conditions (Dynamic)
- DYNAMIC_FINDING_PAGES (pre-rendered blocks)

## Page 11 – Thermal Imaging
- THERMAL_METHOD
- THERMAL_FINDINGS
- THERMAL_VALUE_STATEMENT

## Page 12 – CapEx Roadmap
- CAPEX_TABLE_ROWS
- CAPEX_DISCLAIMER_LINE

## Page 13 – Decision Pathways
- DECISION_PATHWAYS_SECTION

## Page 14 – Terms & Conditions
- TERMS_AND_CONDITIONS

## Page 15 – Closing
- CLOSING_STATEMENT

---

## Notes
- Anything not provided by code should be removed from the template, otherwise Docxtemplater prints `undefined`.
- Prefer **one placeholder per paragraph** (avoid mixing formatting inside a placeholder).
