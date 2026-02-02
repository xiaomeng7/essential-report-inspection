# REPORT OUTPUT CONTRACT (v1)
> Goal: make every generated report **deterministic, investor-grade, and format-stable**.  
> This contract defines **required fields**, **forbidden values**, and **hard gates** that must pass before generating DOCX.

---

## 0) Design Principle — Finding ≠ Decision

**Core principle:** Multiple findings → one judgment. We do not report each finding as a decision; we aggregate findings into property-level signals.

**Two-layer derivation:**

```
[Finding 的 9 维] 
        ↓
[Finding-level Signals]（内部）
        ↓
[Property-level Signals]（报告展示）
```

The report ultimately exposes only these **6 property-level fields**:

```ts
type PropertyDecisionSignals = {
  overall_health: "GOOD" | "STABLE" | "ATTENTION" | "HIGH_RISK";
  immediate_safety_risk: "NONE" | "PRESENT";
  sudden_failure_risk: "LOW" | "MEDIUM" | "HIGH";
  tenant_disruption_risk: "LOW" | "MEDIUM" | "HIGH";
  can_this_wait: "YES" | "CONDITIONALLY" | "NO";
  planning_value: "LOW" | "MEDIUM" | "HIGH";
};
```

These 6 fields are the canonical output of the decision model. Existing slots (OVERALL_STATUS, EXECUTIVE_DECISION_SIGNALS, etc.) should be derived from or mapped to PropertyDecisionSignals.

### Internal Dimensions (D1–D9) — per Finding

| Dim | Semantic | Typical values |
|-----|----------|----------------|
| D1 | Safety Impact | low / medium / high |
| D2 | Compliance Risk | none / minor / material |
| D3 | Failure Likelihood | low / medium / high |
| D4 | Urgency | now / short / planned |
| D5 | Degradation Trend | stable / worsening |
| D6 | Tenant Disruption Risk | low / medium / high |
| D7 | Cost Volatility | stable / uncertain |
| D8 | Detectability | obvious / hidden |
| D9 | Decision Complexity | simple / requires_judgement |

### Finding-level Signals (first derivation — not shown in report)

```ts
type FindingSignals = {
  has_immediate_safety_risk: boolean;
  has_sudden_failure_risk: boolean;
  causes_tenant_disruption: boolean;
  deferrable: boolean;
  benefits_from_planning: boolean;
};
```

**Rule logic (plain language):**

- **Immediate Safety Risk:** D1 = high AND D4 = now
- **Sudden Failure Risk:** D3 = high AND D8 = hidden
- **Tenant Disruption Risk:** D6 ≥ medium AND D3 ≥ medium
- **Deferrable:** D4 ≠ now AND D5 ≠ worsening
- **Planning Benefit:** D5 = worsening OR D7 = uncertain OR D9 = requires_judgement

**YAML rules file:** `rules/derive.yml` — interpretable, tunable, AI-friendly.

### Finding → Property (second derivation — critical)

**Aggregation:** take `FindingSignals[]` and produce property-level signals. `maxRisk` maps booleans to risk level: any true → HIGH, else LOW (LOW < MEDIUM < HIGH).

```ts
function maxRisk(flags: boolean[]): "LOW" | "MEDIUM" | "HIGH" {
  const anyTrue = flags.some(Boolean);
  return anyTrue ? "HIGH" : "LOW";
}

function aggregateFindings(findingsSignals: FindingSignals[]) {
  return {
    immediate_safety_risk:
      findingsSignals.some(f => f.has_immediate_safety_risk)
        ? "PRESENT"
        : "NONE",

    sudden_failure_risk:
      maxRisk(findingsSignals.map(f => f.has_sudden_failure_risk)),

    tenant_disruption_risk:
      maxRisk(findingsSignals.map(f => f.causes_tenant_disruption)),

    can_this_wait:
      findingsSignals.some(f => !f.deferrable)
        ? "NO"
        : findingsSignals.some(f => f.deferrable)
          ? "CONDITIONALLY"
          : "YES",

    planning_value:
      findingsSignals.some(f => f.benefits_from_planning)
        ? "HIGH"
        : "LOW",
  };
}
```

### Overall health derivation — product-level judgment

⚠️ This is a **product-level** judgment, not an engineering judgment.

```ts
function deriveOverallHealth(signals: PropertyDecisionSignals) {
  if (signals.immediate_safety_risk === "PRESENT") {
    return "HIGH_RISK";
  }

  if (
    signals.sudden_failure_risk === "HIGH" ||
    signals.tenant_disruption_risk === "HIGH"
  ) {
    return "ATTENTION";
  }

  if (signals.planning_value === "HIGH") {
    return "STABLE";
  }

  return "GOOD";
}
```

---

## 1) Pipeline (authoritative)
Canonical data → Decision model (Risk × Priority × Budget) → **Structured Report JSON** → Markdown (layout only) → HTML → DOCX

**Rule:** Markdown must be *layout-only* and must not invent content.

---

## 2) Required fields (must exist, non-empty)
### Cover
- INSPECTION_ID
- ASSESSMENT_DATE (human formatted OK)
- PREPARED_FOR
- PREPARED_BY
- PROPERTY_ADDRESS
- PROPERTY_TYPE

### Purpose / Positioning
- ASSESSMENT_PURPOSE (1 paragraph, investor framing)

### Executive Summary
- OVERALL_STATUS (LOW / MODERATE / ELEVATED)
- OVERALL_STATUS_BADGE (emoji allowed 🟢🟡🔴 or badge text)
- EXECUTIVE_DECISION_SIGNALS (exact rules in §4)
- CAPEX_SNAPSHOT (e.g., "AUD $2,400 – $3,200")

### Priority Overview
- PRIORITY_TABLE_ROWS (render-ready rows)
- PRIORITY_COUNTS (immediate / recommended / plan)

### Scope & Limitations
- SCOPE_SECTION (bullet list)
- LIMITATIONS_SECTION (bullet list + the “framework statement” line)

### Findings (dynamic pages)
- FINDING_PAGES_HTML (or FINDING_PAGES_MD) — already structured per finding

### Thermal Imaging
- THERMAL_SECTION (method + findings + value statement, even if “not captured”)

### CapEx Roadmap
- CAPEX_TABLE_ROWS (each row must include: item, condition, priority, timeline, range)
- CAPEX_DISCLAIMER_LINE (provisioning-only legal line)

### Decision Pathways
- DECISION_PATHWAYS (4 options: Accept / Plan / Execute / Delegate)

### Terms
- TERMS_AND_CONDITIONS (full text, loaded from DEFAULT_TERMS.md)

### Appendix
- TEST_DATA_SECTION (table or default paragraph)
- TECHNICAL_NOTES (paragraph)

---

## 3) Forbidden values (hard fail if present)
Any of the following appearing in *any* required field:
- "undefined"
- "null"
- "NaN"
- "Pending"
- "To be confirmed"
- "TBC"
- "{{" or "}}"

---

## 4) Hard-gate rules (must pass)
### 4.1 EXECUTIVE_DECISION_SIGNALS rules
Must contain **3 bullet points** and each must satisfy:
1) at least 1 bullet includes “if not addressed” (or equivalent)
2) at least 1 bullet explains “why not Immediate”
3) at least 1 bullet states “manageable risk, not emergency” (or equivalent)

### 4.2 Findings page rules (per finding)
Each finding page must contain these headings (exact order):
1) Asset Component
2) Observed Condition
3) Evidence
4) Risk Interpretation (**>= 2 sentences, must include “if not addressed”**)
5) Priority Classification
6) Budgetary Planning Range (must be a range)

### 4.3 CapEx rows rules
Each relevant finding must map to:
- timeline (never blank)
- budgetary range (never blank; if unknown, use a *banded range* rule, not “Pending”)

---

## Photo Evidence Rules

- 照片 **只允许** 出现在：**Observed Conditions & Risk Interpretation → Evidence**
- 每个 Finding 最多 **2 张照片**
- **允许 0 张照片**（无照片不报错）
- Evidence 小节即使无照片也 **必须存在**
- 每张照片必须有 **caption**
- caption 为「观察性描述」，不是技术解释
- 若无照片，Evidence 显示默认文案：**No photographic evidence captured at time of assessment.**

---

## 5) Minimal preflight checklist (before DOCX render)
- Required fields present + not forbidden values
- EXECUTIVE_DECISION_SIGNALS passes rules
- No placeholder tokens remain
- CSS loaded from reportStyles.css (not fallback) OR fallback matches checksum

---

## 6) Output “slot-only” Markdown skeleton (reference)
The report markdown must be a skeleton that only places fields:

## Document Purpose & How to Read This Report
{{ASSESSMENT_PURPOSE}}

## Executive Summary
### Overall Electrical Risk Rating
{{OVERALL_STATUS_BADGE}} {{OVERALL_STATUS}}

### Key Decision Signals
{{EXECUTIVE_DECISION_SIGNALS}}

### Financial Planning Snapshot (0–5 Years)
{{CAPEX_SNAPSHOT}}
{{CAPEX_DISCLAIMER_LINE}}

## Priority Overview
{{PRIORITY_OVERVIEW_TABLE}}

## Assessment Scope & Limitations
{{SCOPE_SECTION}}
{{LIMITATIONS_SECTION}}

## Observed Conditions & Risk Interpretation
{{FINDING_PAGES_MD_OR_HTML}}

## Thermal Imaging Analysis
{{THERMAL_SECTION}}

## 5-Year Capital Expenditure (CapEx) Roadmap
{{CAPEX_TABLE}}
{{CAPEX_DISCLAIMER_LINE}}

## Decision Pathways
{{DECISION_PATHWAYS}}

## Important Legal Limitations & Disclaimer
{{TERMS_AND_CONDITIONS}}

## Closing Statement
{{CLOSING_STATEMENT}}

## Appendix – Test Data & Technical Notes
{{TEST_DATA_SECTION}}
{{TECHNICAL_NOTES}}
