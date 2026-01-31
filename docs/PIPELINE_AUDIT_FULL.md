# Markdown → HTML → Docx 报告生成链路审计报告

> 审计日期：2025-01-31  
> 目标链路：`handler → buildReportData/buildCoverData → buildReportMarkdown → markdownToHtml → renderDocx`

---

## 一、Call Graph（实际执行链路）

```
handler (generateWordReport.ts)
  ├─ get(inspection_id, event)                    → StoredInspection
  ├─ loadResponses(event)                         → responses.yml
  ├─ buildReportData(inspection, event)           → reportData (PlaceholderReportData)
  │     ├─ computeOverall()
  │     ├─ buildTestDataAndNotes()
  │     ├─ loadTermsAndConditions()
  │     ├─ generateDynamicFindingPages()
  │     └─ ensureAllPlaceholders + sanitizeObject
  │
  ├─ buildCoverData(inspection, event)            → coverData (6 封面字段 + ASSESSMENT_PURPOSE)
  ├─ buildReportHtml({ inspection, canonical, findings, responses, computed, event })
  │     ├─ buildCoverSection, buildPurposeSection, buildExecutiveSummarySection, ...
  │     ├─ buildObservedConditionsSection → generateFindingPages
  │     ├─ buildCapExRoadmapSection, buildDecisionPathwaysSection, buildTermsSection, ...
  │     ├─ sections.join("") + PAGE_BREAK
  │     └─ markdownToHtml(mixedContent)
  │           ├─ md.render(markdown)
  │           ├─ docxSafeNormalize(htmlBody)
  │           ├─ sanitizeText(htmlBody, { preserveEmoji: true })
  │           ├─ loadReportCss()
  │           └─ 返回完整 HTML <!doctype>…<body>…</body>
  │
  ├─ rawTemplateData = { ...coverData, REPORT_BODY_HTML: reportHtml, CAPEX_SNAPSHOT, ... }
  ├─ assertNoUndefined(rawTemplateData)
  ├─ sanitizeObject(safeTemplateData)
  ├─ applyPlaceholderFallback(sanitized)          → templateData
  ├─ renderDocx(templateBuffer, templateData)
  │     └─ renderDocxWithHtmlMerge
  │           ├─ coverData = { 9 字段, REPORT_BODY_HTML: "", TERMS_AND_CONDITIONS: "" }
  │           ├─ doc.setData(coverData); doc.render()
  │           ├─ htmlContent = data.REPORT_BODY_HTML
  │           ├─ asBlob(htmlContent)
  │           └─ DocxMerger([coverBuffer, htmlDocxBuffer])
  └─ saveWordDoc(blobKey, outBuffer, event)
```

---

## 二、偏差清单（A–E 对照）

| 编号 | 目标 | 现状 | 结论 |
|------|------|------|------|
| **A** | 分页只用 raw HTML `<div class="page-break"></div>`，不用 `---` | `PAGE_BREAK = <div class="page-break" style="page-break-after:always;"></div>` | ✅ |
| **B** | CSS 加载 reportStyles.css，命中路径有日志，否则 fallback | loadReportCss 有 3 路径 + 日志；缺 `/opt/build/repo` | ⚠️ |
| **C** | sanitize 不得替换 🟢🟡🔴（preserveEmoji 生效） | markdownToHtml 已用 `preserveEmoji: true`；applyPlaceholderFallback 用本地 sanitizeText（不替换 emoji） | ⚠️ 需确认 REPORT_BODY_HTML 未被本地 sanitize 破坏 |
| **D** | 所有占位符有兜底：REPORT_BODY_HTML、TERMS、ASSESSMENT_PURPOSE 不出现 undefined | buildCoverData 的 assessmentPurpose 可能来自 raw 的 "undefined" 字符串；CAPEX 字段可能产生 "AUD $undefined – $undefined" | ❌ |
| **E** | finding 小节顺序固定；Risk Interpretation ≥2 句含 "if not addressed" | generateFindingPages 有固定结构；validateRiskInterpretation 已实现 | ✅ |

---

## 三、根因 Top 5（文件+函数+证据）

### RC1. Assessment Purpose: undefined

| 项目 | 详情 |
|------|------|
| **根因** | `buildCoverData` 的 `assessmentPurpose` 来自 `getFieldValue(raw, "assessment_purpose")`；若 raw 含 `assessment_purpose: "undefined"` 或空字符串被误传，或 `getFieldValue` 返回需过滤的值 |
| **证据** | `generateWordReport.ts:1514–1519` |
| **代码** | ```ts
  const assessmentPurpose =
    getFieldValue(raw, "assessment_purpose") ||
    getFieldValue(raw, "job.assessment_purpose") ||
    getFieldValue(raw, "purpose") ||
    "Decision-support electrical risk & CapEx planning assessment";
  ``` |
| **修复** | 对 assessmentPurpose 做 `"undefined"` 字符串过滤，等于 "undefined" 时用默认值 |

---

### RC2. AUD $undefined – $undefined

| 项目 | 详情 |
|------|------|
| **根因** | ① `buildReportData` 中 `CAPEX_RANGE` 使用 `capexSummary.low_total`、`capexSummary.high_total`，当来自 `overallScore` 分支时可能为 `null`，模板字符串 `${null}` 会输出 "null"；② `buildCapExRoadmapSection` 中 `budgetaryRange = AUD $${response.budget_range_low}–$${response.budget_range_high}`，若 low/high 为 undefined 会输出 "undefined" |
| **证据** | `generateWordReport.ts:1323–1325`；`buildReportMarkdown.ts:567–568` |
| **代码** | ```ts
  // generateWordReport.ts
  ? `${capexSummary.currency || "AUD"} $${capexSummary.low_total || 0} – $${capexSummary.high_total || 0}`
  // buildReportMarkdown.ts
  budgetaryRange = `AUD $${response.budget_range_low}–$${response.budget_range_high}`;
  ``` |
| **修复** | 所有 CapEx 插值处使用 `?? 0` 或 `?? "?"` 兜底；`buildCapExRoadmapSection` 在 low/high 任一为 null/undefined 时不走该分支，用 "Pending" |

---

### RC3. 优先级 badge 显示 [LOW]/[MODERATE]/[ELEVATED] 而非 emoji

| 项目 | 详情 |
|------|------|
| **根因** | `applyPlaceholderFallback` 与 `sanitizeObject` 使用 generateWordReport 内**本地** `sanitizeText`，该函数不替换 emoji；但 `REPORT_BODY_HTML` 来自 buildReportHtml，已由 markdownToHtml 处理并保留 emoji。若 docx 仍显示 [LOW] 等，可能：① 旧模板或旧构建缓存；② 某路径仍调用 lib/sanitizeText 且未传 preserveEmoji |
| **证据** | `markdownToHtml.ts:96` 已有 `preserveEmoji: true`；`generateWordReport.ts:175` 本地 sanitizeText 无 emoji 替换 |
| **代码** | ```ts
  // markdownToHtml.ts
  htmlBody = sanitizeText(htmlBody, { preserveEmoji: true });
  // generateWordReport 本地 sanitizeText 仅做 NBSP/控制字符/换行，无 emoji 逻辑
  ``` |
| **修复** | 确认无其它路径对 REPORT_BODY_HTML 调用 lib/sanitizeText；renderDocx 方案 B 已用 preserveEmoji: true；若仍异常，检查是否有 generateReport 等旧路径产出正文 |

---

### RC4. "Investor Options & Next Steps" 仍出现（应为 Decision Pathways）

| 项目 | 详情 |
|------|------|
| **根因** | `buildReportMarkdown` 的 `buildDecisionPathwaysSection` 输出标题为 `Page 10 | Decision Pathways`，正文来自 `defaultText.DECISION_PATHWAYS_SECTION`。若 docx 仍见 "Investor Options & Next Steps"，说明来自 **模板** 或 **旧 HTML 片段**，而非 buildReportHtml |
| **证据** | `buildReportMarkdown.ts:604` 输出 "Decision Pathways"；`report-template.html`、`rules.ts` 中含 "Investor Options & Next Steps" |
| **代码** | ```ts
  md.push('<h2 class="page-title">Page 10 | Decision Pathways</h2>');
  ``` |
| **修复** | 确认使用的是 `report-template-md.docx`（约 19KB），不是 `report-template.docx`（约 111KB）；模板的 TOC 或封面若含旧文案需手动更新 |

---

### RC5. "Technical Notes: call to confirm" 等 placeholder 文案

| 项目 | 详情 |
|------|------|
| **根因** | `buildAppendixSection` 中 `technicalNotes = canonical.technician_notes || defaultText.TECHNICAL_NOTES || "..."`。若 blob 中的 DEFAULT_REPORT_TEXT 或 DEFAULT_TEXT_LIBRARY 含 `TECHNICAL_NOTES: "call to confirm"` 等占位文案，会被直接输出 |
| **证据** | `buildReportMarkdown.ts:854`；`defaultTextLoader` 从 blob 或文件加载 |
| **代码** | ```ts
  const technicalNotes = canonical.technician_notes || defaultText.TECHNICAL_NOTES ||
    "This assessment is based on a visual inspection...";
  ``` |
| **修复** | 对 placeholder 类文案（如 "call to confirm"、"TBC"、"to be confirmed"）做黑名单过滤，命中时用规范默认句 |

---

## 四、Patch Plan（逐文件、最小改动）

### 1. generateWordReport.ts

**1a. buildCoverData：过滤 assessmentPurpose 的 "undefined"**

```ts
// 第 1514–1519 行附近，替换为：
let assessmentPurpose =
  getFieldValue(raw, "assessment_purpose") ||
  getFieldValue(raw, "job.assessment_purpose") ||
  getFieldValue(raw, "purpose") ||
  "";
if (!assessmentPurpose || assessmentPurpose === "undefined" || assessmentPurpose.trim() === "") {
  assessmentPurpose = "Decision-support electrical risk & CapEx planning assessment";
}
```

**1b. buildReportData：CAPEX_RANGE 防 undefined/null**

```ts
// 第 1323–1325 行，替换为：
const CAPEX_RANGE = (capexSummary.low_total > 0 || capexSummary.high_total > 0)
  ? `${capexSummary.currency || "AUD"} $${capexSummary.low_total ?? 0} – $${capexSummary.high_total ?? 0}`
  : "To be confirmed";
```

**1c. computed 增加 CAPEX_SNAPSHOT、EXECUTIVE_DECISION_SIGNALS**

```ts
// 第 1987–1995 行附近，替换为：
const computed = {
  OVERALL_STATUS: overallStatus,
  RISK_RATING: riskRating,
  EXECUTIVE_SUMMARY: executiveSummary,
  CAPEX_RANGE: capexRange,
  CAPEX_SNAPSHOT: reportData.CAPEX_SNAPSHOT || capexRange,
  EXECUTIVE_DECISION_SIGNALS: reportData.EXECUTIVE_DECISION_SIGNALS || executiveSummary,
};
```

---

### 2. buildReportMarkdown.ts

**2a. buildCapExRoadmapSection：budgetaryRange 防 undefined**

```ts
// 第 567–568 行，替换为：
} else if (
  response?.budget_range_low != null &&
  response?.budget_range_high != null &&
  !Number.isNaN(Number(response.budget_range_low)) &&
  !Number.isNaN(Number(response.budget_range_high))
) {
  budgetaryRange = `AUD $${response.budget_range_low}–$${response.budget_range_high}`;
```

**2b. buildAppendixSection：过滤 placeholder 类 TECHNICAL_NOTES**

```ts
// 仅当整个值为占位短语（如 "call to confirm"）时用默认句替换
const rawTechnicalNotes = ...;
const isPlaceholderOnly = rawTechnicalNotes && /^(call to confirm|tbc|to be confirmed|pending|n\/a|\s*)$/i.test(String(rawTechnicalNotes).trim());
const technicalNotes = (rawTechnicalNotes?.trim() && !isPlaceholderOnly) ? rawTechnicalNotes : defaultFallback;
```

---

### 3. markdownToHtml.ts

**3a. loadReportCss：增加 /opt/build/repo 路径**

```ts
// 第 44–48 行，在 possiblePaths 中增加：
path.join(__dirname, "..", "reportStyles.css"),
path.join(process.cwd(), "netlify", "functions", "reportStyles.css"),
path.join(process.cwd(), "reportStyles.css"),
"/opt/build/repo/netlify/functions/reportStyles.css",
"/opt/build/repo/reportStyles.css",
```

---

### 4. 模板与配置

- 确认部署使用 `report-template-md.docx`（约 19KB），且模板中无 "Investor Options & Next Steps" 等旧标题。
- 检查 blob 中的 `DEFAULT_REPORT_TEXT.md`、`DEFAULT_TEXT_LIBRARY.md` 是否含 "call to confirm" 等占位文案，有则改为规范句子。

---

## 五、验证 Checklist

| 序号 | 验证目标 | 操作 | 预期 | 日志关键字 |
|------|----------|------|------|------------|
| 1 | Assessment Purpose 非 undefined | 生成报告 | docx 封面/正文无 "Assessment Purpose: undefined" | `[DEV] templateData sample` 中 ASSESSMENT_PURPOSE 非 undefined |
| 2 | CapEx 无 $undefined | 生成报告 | 无 "AUD $undefined – $undefined" | 同上，CAPEX_SNAPSHOT、CAPEX_RANGE 正常 |
| 3 | emoji 显示 | 生成报告 | Executive Summary / Priority 显示 🟢🟡🔴 | 无 `[LOW]`、`[MODERATE]`、`[ELEVATED]` |
| 4 | 标题为 Decision Pathways | 生成报告 | 正文第 10 页标题为 "Decision Pathways" | 使用 report-template-md.docx |
| 5 | Technical Notes 无 placeholder | 生成报告 | 无 "call to confirm" 等占位文案 | 检查 defaultText 来源 |
| 6 | CSS 加载 | 生成报告 | 表格样式正常 | `[report] CSS loaded from:` 或 `[report] CSS fallback:` |
| 7 | 无 ReferenceError | NETLIFY_DEV=true 生成 | 无报错 | 无 `ReferenceError: markdown` |
| 8 | 模板正确 | 生成报告 | 模板大小 ~19KB | `✅ Found report-template-md.docx at:` |

### 日志关键字速查

| 关键字 | 含义 |
|--------|------|
| `[report] CSS loaded from:` | CSS 命中 |
| `[report] CSS fallback:` | 使用 FALLBACK_CSS |
| `✅ Found report-template-md.docx at:` | 模板加载成功 |
| `[DEV] templateData sample` | 关键字段值预览 |
| `[report] templateData has undefined` | 存在未定义占位符 |
| `⚠️ Placeholder X was missing or empty` | 占位符使用默认值 |
