# 报告生成链路核对报告

> 核对日期：2025-01-31  
> 目标：逐点验证调用链路是否符合设计，找出偏差、冗余与修复项

---

## 一、目标调用链路逐点核对

| 步骤 | 目标 | 实际 | 结论 |
|------|------|------|------|
| 1 | handler 调用 buildReportData + buildCoverData + buildReportHtml | `generateWordReport.ts:1930,2007,2012` 依次调用 buildReportData、buildCoverData、buildReportHtml | ✅ |
| 2 | buildReportHtml 内部：sections 拼接 | `buildReportMarkdown.ts:605-644` 各 section 拼接为 `mixedContent` | ✅ |
| 3 | buildReportHtml 内部：markdownToHtml(mixedContent) | `buildReportMarkdown.ts:643` 调用 `markdownToHtml(mixedContent)` | ✅ |
| 4 | markdownToHtml: md.render | `markdownToHtml.ts:93` `htmlBody = md.render(markdown)` | ✅ |
| 5 | markdownToHtml: docxSafeNormalize | `markdownToHtml.ts:94` `docxSafeNormalize(htmlBody)` | ✅ |
| 6 | markdownToHtml: sanitizeText | `markdownToHtml.ts:95` `sanitizeText(htmlBody)`（lib 版） | ✅ |
| 7 | markdownToHtml: loadReportCss | `markdownToHtml.ts:106-111` `loadReportCss()` 内联到返回的 HTML | ✅ |
| 8 | rawTemplateData (REPORT_BODY_HTML = reportHtml) | `generateWordReport.ts:2028` `REPORT_BODY_HTML: reportHtml` | ✅ |
| 9 | renderDocx(templateBuffer, templateData) | `generateWordReport.ts:2133` | ✅ |
| 10 | renderDocxWithHtmlMerge: cover + asBlob + DocxMerger | `renderDocx.ts:49-96` coverData → doc.render → asBlob(htmlContent) → DocxMerger | ✅ |

**调用链路结论：✅ 完全符合目标设计**

---

## 二、逐文件核对结论

| 文件 | RC1 Debug | RC2 Emoji | RC3 CSS | 链路符合 | 综合 |
|------|-----------|-----------|---------|----------|------|
| `generateWordReport.ts` | ✅ | — | — | ✅ | ✅ |
| `buildReportMarkdown.ts` | — | — | — | ✅ | ✅ |
| `markdownToHtml.ts` | — | 见 RC2 | — | ✅ | ⚠️ |
| `renderDocx.ts` | — | — | — | ✅ | ⚠️ |
| `sanitizeText.ts` | — | ❌ | — | — | ❌ |
| `reportStyles.css`（根目录） | — | — | ✅ | — | ✅ |
| `netlify/functions/reportStyles.css` | — | — | ✅ | — | ✅ |

### 详细结论

| # | 文件 | 结论 | 说明 |
|---|------|------|------|
| 1 | `generateWordReport.ts` | ✅ | RC1 已修：第 2151 行使用 `reportHtml.substring(0, 1200)`，无未定义变量 |
| 2 | `buildReportMarkdown.ts` | ✅ | sections 拼接 + markdownToHtml 调用正确，event 已传入 |
| 3 | `markdownToHtml.ts` | ⚠️ | 链路正确，但调用 lib/sanitizeText 会替换 emoji |
| 4 | `renderDocx.ts` | ⚠️ | 方案 A 无二次 sanitize；方案 B 第 125 行对 htmlContent 二次 sanitize |
| 5 | `sanitizeText.ts` | ❌ | 第 47-49 行将 🟢🟡🔴 替换为 [LOW]/[MODERATE]/[ELEVATED] |
| 6 | `reportStyles.css`（根目录） | ✅ | 含 table-layout: fixed、word-wrap: break-word，与 functions 版一致 |
| 7 | `netlify/functions/reportStyles.css` | ✅ | 含 table-layout、word-wrap、.kv、h2.page-title 等，较完整 |

---

## 三、Top 3 根因核查结论

### RC1: Debug 段是否仍引用未定义变量

| 项目 | 结论 |
|------|------|
| **现状** | `generateWordReport.ts:2151` 使用 `reportHtml.substring(0, 1200)` |
| **结论** | ✅ 已修复，无未定义变量 |

### RC2: 是否仍把 🟢🟡🔴 替换为 [LOW]/[MODERATE]/[ELEVATED]

| 项目 | 结论 |
|------|------|
| **现状** | `lib/sanitizeText.ts:47-49` 明确替换 emoji；`markdownToHtml.ts:95` 调用该函数 |
| **影响** | docx 中 Executive Summary、Priority 等处显示 [LOW] 等文字，无 emoji |
| **结论** | ❌ 仍存在，导致 docx 无 emoji |

### RC3: 根目录与 functions 下 reportStyles.css 是否一致

| 项目 | 根目录 | netlify/functions |
|------|--------|-------------------|
| table-layout: fixed | ✅ 有 | ✅ 有 |
| word-wrap: break-word | ✅ 有 | ✅ 有 |
| body padding | ❌ 无 | ✅ padding: 18pt 20pt |
| h2.page-title | ❌ 无 | ✅ 有 |
| .kv, .small | ❌ 无 | ✅ 有 |
| div[style*="page-break-after"] | ❌ 无 | ✅ 有 |

| **结论** | ⚠️ 基本一致，根目录缺 body padding、h2.page-title、.kv、.small 等规则；loadReportCss 优先 `path.join(__dirname,"..","reportStyles.css")`（即 functions 版），多数情况下会命中 functions 版 |

---

## 四、冗余 / 重复 / 混乱点清单

### 4.1 重复 sanitize

| 位置 | 行为 | 说明 |
|------|------|------|
| `markdownToHtml.ts:95` | 对 htmlBody 调用 lib `sanitizeText` | 首次 sanitize，替换 emoji |
| `generateWordReport.ts:2044` | `sanitizeObject(safeTemplateData)` | 对 templateData 所有值（含 REPORT_BODY_HTML）调用**本地** sanitizeText；本地版不替换 emoji，但会再次处理控制字符等 |
| `renderDocx.ts:125`（方案 B） | `sanitizeText(htmlContent)` | 方案 B 回退时对 HTML 再次调用 lib sanitizeText |

**结论**：REPORT_BODY_HTML 在正常路径被 sanitize 两次（markdownToHtml + sanitizeObject）；方案 B 时三次。

### 4.2 重复渲染 / 重复构建

| 位置 | 行为 | 说明 |
|------|------|------|
| `buildReportData` vs `buildReportHtml` | reportData 含 DYNAMIC_FINDING_PAGES；buildReportHtml 内部 buildObservedConditionsSection 再次生成 findings 内容 | buildReportHtml 的 Observed Conditions 与 reportData.DYNAMIC_FINDING_PAGES 来源不同；前者进 REPORT_BODY_HTML，后者进 templateData 但 renderDocxWithHtmlMerge 未使用 |
| `loadResponses` | 在 handler、buildReportData、buildReportHtml、generateDynamicFindingPages 等多处调用 | 有缓存，但存在多处实现（generateWordReport、buildReportMarkdown、generateDynamicFindingPages 各自实现） |

### 4.3 未使用占位符 / 缺字段注入

| 项目 | 说明 |
|------|------|
| templateData 多余 key | rawTemplateData 含 TERMS_AND_CONDITIONS、DYNAMIC_FINDING_PAGES、OVERALL_STATUS_BADGE 等；renderDocxWithHtmlMerge 仅用 6 封面字段 + REPORT_BODY_HTML |
| coverData 仅 7 个 key | INSPECTION_ID, ASSESSMENT_DATE, PREPARED_FOR, PREPARED_BY, PROPERTY_ADDRESS, PROPERTY_TYPE, REPORT_BODY_HTML=""；若模板有其它占位符会残留 |
| REPORT_BODY_HTML 在封面中置空 | 方案 A 下正文由 asBlob 单独生成，coverData.REPORT_BODY_HTML="" 用于替换模板中的 {{REPORT_BODY_HTML}}，避免未替换 |

### 4.4 其它混乱点

| 项目 | 说明 |
|------|------|
| 两套 sanitizeText | generateWordReport 内本地 sanitizeText（不替换 emoji）vs lib/sanitizeText（替换 emoji） |
| loadWordTemplate 未使用 | generateWordReport 中有 loadWordTemplate()，含 split placeholders 修复等逻辑，但 handler 直接读取 report-template-md.docx，未调用 loadWordTemplate |

---

## 五、根因排序（按影响）

| 优先级 | 根因 | 影响 | 验证方式 |
|--------|------|------|----------|
| **RC1** | Debug 段未定义变量 | ✅ 已修复 | — |
| **RC2** | lib/sanitizeText 替换 emoji | docx 中无 🟢🟡🔴，仅显示 [LOW] 等 | 生成报告，查看 Executive Summary / Priority |
| **RC3** | 根目录 reportStyles.css 缺规则 | 若 loadReportCss 命中根目录，缺 .kv、h2.page-title 等样式 | 查日志 `[report] CSS loaded from:` 的路径 |
| P1 | 方案 B 二次 sanitize | 回退时冗余处理，emoji 已为文字无额外影响 | 人为触发方案 B 回退 |
| P2 | sanitizeObject 对 REPORT_BODY_HTML 二次处理 | 冗余，对超长 HTML 有轻微性能影响 | 无需单独验证 |

---

## 六、最小 Patch 计划（仅 P0/P1/P2）

### P0：无

RC1 已修复，无 P0 待办。

### P1：RC2 — 保留 emoji（可选）

**若产品要求在 docx 中保留 🟢🟡🔴：**

| 文件 | 改动 |
|------|------|
| `lib/sanitizeText.ts` | 增加 `preserveEmoji?: boolean` 或导出 `sanitizeTextForDocx(input, { preserveEmoji: true })` |
| `markdownToHtml.ts` | 对 body 使用不替换 emoji 的分支 |

### P1：RC3 — 根目录 CSS 补全（可选）

**若 loadReportCss 可能命中根目录 reportStyles.css：**

| 文件 | 改动 |
|------|------|
| `reportStyles.css`（根目录） | 补全 body padding、h2.page-title、.kv、.small、div[style*="page-break-after"] 等，与 netlify/functions/reportStyles.css 对齐 |

### P2：方案 B 去除二次 sanitize

| 文件 | 改动 |
|------|------|
| `renderDocx.ts` | 第 125 行移除 `htmlContent = sanitizeText(htmlContent)`；正文已在 markdownToHtml 中处理 |

---

## 七、验证 Checklist

### 7.1 日志关键字

| 关键字 | 含义 |
|--------|------|
| `[report] CSS loaded from:` | 命中 reportStyles.css，后跟路径 |
| `[report] CSS fallback:` | 使用 FALLBACK_CSS |
| `✅ Found report-template-md.docx at:` | 模板加载成功 |
| `[DEV] templateData keys:` | templateData 字段列表 |
| `[report] templateData has undefined:` | 存在 undefined 值，需排查 |
| `方案 A 失败，回退到方案 B` | 使用了方案 B |

### 7.2 触发步骤

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 设置 `NETLIFY_DEV=true` 或 `NODE_ENV=development` | 无 ReferenceError |
| 2 | 调用报告生成 API（GET/POST + inspection_id） | 返回 200，日志有 `Word document generated` |
| 3 | 查日志 `[report] CSS loaded from:` | 显示实际加载的 CSS 路径 |
| 4 | 查日志 `[report] templateData has undefined:` | 不出现，或出现时列出缺的 key |
| 5 | 打开生成 docx | 正文完整，无残留占位符 |
| 6 | 查看 Executive Summary / Priority | 若未改 RC2，应看到 [LOW]/[MODERATE]/[ELEVATED] 而非 emoji |
| 7 | 查看表格（CapEx、Test Data） | 不挤压，长文本可换行 |

### 7.3 最小验证命令示例

```bash
# 本地触发（需有 netlify dev 或等价环境）
curl "http://localhost:8888/.netlify/functions/generateWordReport?inspection_id=YOUR_ID"
# 或
curl -X POST http://localhost:8888/.netlify/functions/generateWordReport \
  -H "Content-Type: application/json" \
  -d '{"inspection_id":"YOUR_ID"}'
```

---

## 八、汇总

| 项目 | 结论 |
|------|------|
| 调用链路 | ✅ 完全符合目标 |
| RC1 Debug | ✅ 已修复 |
| RC2 Emoji | ❌ 仍替换，docx 无 emoji |
| RC3 CSS | ⚠️ 根目录版缺部分规则，多数情况下会命中 functions 版 |
| 冗余 | 2–3 次 sanitize；templateData 含未使用 key；两套 sanitizeText |
| 最小修复 | P1：RC2 可选保留 emoji、RC3 可选补全根目录 CSS；P2：方案 B 去二次 sanitize |
