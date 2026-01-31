# 报告生成链路审计报告

> 审计日期：2025-01-31  
> 设计目标：`buildReportMarkdown → markdownToHtml → renderDocx` 注入 REPORT_BODY_HTML → 输出 Word

---

## 一、实际调用链路（Call Graph）

### 1. 入口函数

```
handler (generateWordReport.ts:1330)
  └─ event: HandlerEvent（GET/POST，含 inspection_id）
```

### 2. 主流程

```
handler
  ├─ get(inspection_id, event)                    → 获取 StoredInspection
  ├─ loadResponses(event)                         → responses.yml (blob 优先，event 必须)
  ├─ buildReportData(inspection, event)           → PlaceholderReportData
  │     ├─ loadResponses(event)
  │     ├─ loadFindingProfiles()                  → 文件系统 only，无需 event
  │     ├─ loadDefaultText(event)                 → DEFAULT_REPORT_TEXT.md (blob 优先)
  │     ├─ generateDynamicFindingPages(inspection, event)  → DYNAMIC_FINDING_PAGES
  │     └─ ensureAllPlaceholders + sanitizeObject
  │
  ├─ buildCoverData(inspection, event)            → 6 个封面字段
  │
  ├─ buildReportHtml({ inspection, canonical, findings, responses, computed, event })  ← 已传 event ✅
  │     ├─ 内部：loadDefaultText(event)
  │     ├─ 内部：loadResponses(event) [buildObservedConditionsSection]
  │     ├─ buildCoverSection, buildPurposeSection, … buildClosingSection
  │     ├─ 拼接 sections（含 PAGE_BREAK = <div class="page-break" style="page-break-after:always;"></div>）
  │     └─ markdownToHtml(mixedContent)
  │           ├─ md.render(markdown)
  │           ├─ docxSafeNormalize(htmlBody)
  │           ├─ sanitizeText(htmlBody)           ← lib/sanitizeText：🟢→[LOW]、🟡→[MODERATE]、🔴→[ELEVATED]
  │           ├─ loadReportCss()                  → reportStyles.css 或 FALLBACK_CSS
  │           └─ 返回完整 HTML 文档 <!doctype>…<body>…</body></html>
  │
  ├─ rawTemplateData = { ...coverData, REPORT_BODY_HTML: reportHtml, TERMS_AND_CONDITIONS, … }
  ├─ assertNoUndefined(rawTemplateData)
  ├─ sanitizeObject(safeTemplateData)             ← generateWordReport 内本地 sanitizeText（不替换 emoji）
  ├─ applyPlaceholderFallback(sanitized)          → templateData
  │
  ├─ 加载 report-template-md.docx                 ← 仅此模板，不用 report-template.docx
  ├─ renderDocx(templateBuffer, templateData)
  │     └─ renderDocxWithHtmlMerge (方案 A)
  │           ├─ coverData = { 6 字段, REPORT_BODY_HTML: "" }
  │           ├─ doc.setData(coverData); doc.render()  → 封面 DOCX
  │           ├─ htmlContent = data.REPORT_BODY_HTML   ← 直接使用，无二次 sanitize
  │           ├─ asBlob(htmlContent)               → 正文 DOCX
  │           └─ DocxMerger([coverBuffer, htmlDocxBuffer]) → 合并
  │     └─ 失败则 renderDocxWithHtmlAsText (方案 B)   ← 会调用 sanitizeText(htmlContent)
  │
  └─ saveWordDoc(blobKey, outBuffer, event)
```

### 3. 关键参数传递

| 参数 | 来源 | 传递链 |
|------|------|--------|
| `event` | HandlerEvent | handler → buildReportData, buildCoverData, buildReportHtml, loadResponses, loadDefaultText |
| `REPORT_BODY_HTML` | buildReportHtml 返回值 | 完整 HTML 文档（含 head/body） |
| `templateData` | rawTemplateData → applyPlaceholderFallback | 所有 REQUIRED_KEYS 有值，缺项用 DEFAULT_PLACEHOLDER_VALUES |

---

## 二、偏差清单（Deviation List）

### D1. Debug 段引用未定义变量，dev 模式下会抛错

| 项目 | 详情 |
|------|------|
| **现状** | `generateWordReport.ts` 第 2151–2152 行：`markdown.substring(0, 1200)`、`html.substring(0, 1200)` |
| **偏差** | `markdown` 与 `html` 未在 handler 作用域定义 |
| **影响** | `NETLIFY_DEV=true` 或 `NODE_ENV=development` 时会 `ReferenceError`，阻断报告生成 |
| **修复建议** | 将 `markdown` 改为 `reportHtml.substring(0, 1200)`（或删除该 debug 段）；若需 markdown 预览，需在 buildReportHtml 内返回或单独构建 |

### D2. sanitizeText 替换 emoji 导致 docx 中看不到 🟢🟡🔴

| 项目 | 详情 |
|------|------|
| **现状** | `netlify/functions/lib/sanitizeText.ts` 第 47–49 行：`🟢→[LOW]`、`🟡→[MODERATE]`、`🔴→[ELEVATED]` |
| **偏差** | 设计若要求 docx 中保留 emoji，当前实现会替换为文字 |
| **影响** | docx 中显示 `[LOW]` 等，而非彩色圆点 |
| **修复建议** | 若需保留 emoji：在 sanitizeText 增加 `preserveEmoji` 选项，或在 markdownToHtml 中不对 body 调用会替换 emoji 的逻辑 |

### D3. 根目录 reportStyles.css 缺少 table-layout / word-wrap

| 项目 | 详情 |
|------|------|
| **现状** | 根目录 `reportStyles.css` 第 51–62 行：`table` 无 `table-layout: fixed`，`th, td` 无 `word-wrap: break-word` |
| **偏差** | `netlify/functions/reportStyles.css` 有 `table-layout: fixed` 与 `word-wrap`，两者不一致 |
| **影响** | 若 loadReportCss 命中根目录文件，表格可能挤压、换行异常 |
| **修复建议** | 根目录 reportStyles.css 补上与 netlify/functions 版本相同的 table 样式 |

### D4. 分页符两种写法混用

| 项目 | 详情 |
|------|------|
| **现状** | `buildReportMarkdown.ts` 用 `<div class="page-break" style="page-break-after:always;">`；`generateFindingPages.ts` 用 `<div style="page-break-before:always;">` |
| **偏差** | page-break-after 与 page-break-before 混用 |
| **影响** | 分页位置在不同渲染器中可能略有差异 |
| **修复建议** | 统一为 `page-break-after: always`，或保留现状但文档化两种用途（section 后 vs finding 块前） |

### D5. 方案 B 回退时二次 sanitize

| 项目 | 详情 |
|------|------|
| **现状** | `renderDocx.ts` 第 125 行：`renderDocxWithHtmlAsText` 中 `htmlContent = sanitizeText(htmlContent)` |
| **偏差** | 正文已在 markdownToHtml 中 sanitize，方案 B 再次 sanitize |
| **影响** | 回退到方案 B 时 emoji 再次被替换（若前一步未替换则此处会替换） |
| **修复建议** | 方案 B 若接收的已是 sanitized HTML，可去掉二次 sanitize，或仅做轻量控制字符处理 |

### D6. report-template-md.docx 可能缺失

| 项目 | 详情 |
|------|------|
| **现状** | 搜索显示仓库有 `report-template-md.docx`，但 `loadWordTemplate()` 未使用，handler 仅加载 report-template-md.docx |
| **偏差** | 若构建未把 report-template-md.docx 复制到 netlify/functions，会直接报错 |
| **影响** | 报告生成失败 |
| **修复建议** | 在 netlify.toml 或构建脚本中确保 report-template-md.docx 被复制到 functions 目录 |

---

## 三、根因排序（Top 5）

### RC1. Debug 段引用未定义变量（最高优先级）

- **为何是根因**：在 dev 下会直接抛错，完全无法生成报告  
- **如何验证**：`NETLIFY_DEV=true npm run dev`，触发报告生成，观察是否出现 `ReferenceError: markdown is not defined`  
- **最小修复**：将 `markdown` / `html` 改为 `reportHtml`，或删除该 debug 块  

### RC2. sanitizeText 替换 emoji

- **为何是根因**：直接影响 docx 展示，用户会看到 `[LOW]` 而非 emoji  
- **如何验证**：生成含 risk badge 的报告，在 Word 中检查 Executive Summary / Priority 等处  
- **最小修复**：在 sanitizeText 增加 `preserveEmoji` 选项，或新增不替换 emoji 的路径供 markdownToHtml 使用  

### RC3. CSS 路径与样式不一致

- **为何是根因**：不同环境可能加载不同 reportStyles.css，表格样式表现不一致  
- **如何验证**：打日志确认 `[report] CSS loaded from:` 的路径，并比对根目录与 functions 下 CSS  
- **最小修复**：统一两个 reportStyles.css 的 table / word-wrap 规则  

### RC4. 方案 B 二次 sanitize

- **为何是根因**：仅在方案 A 失败时触发，但会改变正文内容  
- **如何验证**：人为让方案 A 失败（如 asBlob 异常），观察方案 B 输出  
- **最小修复**：方案 B 中去掉对完整 HTML 的 sanitizeText 调用  

### RC5. 模板或 reportStyles.css 未正确部署

- **为何是根因**：构建遗漏会导致运行时失败  
- **如何验证**：部署后在 Netlify Functions 日志中确认模板与 CSS 路径，并检查构建产物  
- **最小修复**：在 netlify.toml / 构建脚本中显式包含 report-template-md.docx 和 reportStyles.css  

---

## 四、12 项核查结论

| # | 核查项 | 结论 | 说明 |
|---|--------|------|------|
| 1 | markdownToHtml 是否加载 reportStyles.css 并有日志 | ✅ 有日志 | `loadReportCss()` 命中时打 `[report] CSS loaded from:`，未命中打 `[report] CSS fallback:` |
| 2 | 分页符类型是否一致 | ⚠️ 两种 | `buildReportMarkdown` 用 `page-break-after`；`generateFindingPages` 用 `page-break-before`，均非 `---` |
| 3 | 是否存在二次 sanitize | ✅ 方案 A 无 | `renderDocxWithHtmlMerge` 不 sanitize REPORT_BODY_HTML；方案 B 会 |
| 4 | sanitizeText 是否替换 emoji | ✅ 会 | 🟢🟡🔴 → [LOW]/[MODERATE]/[ELEVATED]，影响展示 |
| 5 | buildReportMarkdown 占位符是否有 undefined | ✅ 有兜底 | ensureAllPlaceholders、assertNoUndefined、applyPlaceholderFallback 保证有值 |
| 6 | templateData 与模板 {{...}} 是否对应 | ✅ 基本对应 | REQUIRED_KEYS 覆盖模板；report-template-md 主要用 REPORT_BODY_HTML 及封面字段 |
| 7 | REPORT_BODY_HTML 是否一定注入 | ✅ 是 | rawTemplateData.REPORT_BODY_HTML = reportHtml；方案 A 中 coverData 置空，正文由 asBlob 单独生成 |
| 8 | 模板路径是否可能错误 | ⚠️ 可能 | 依赖 report-template-md.docx 存在于多个路径之一；需确保构建复制 |
| 9 | event 是否传入所有需 blob 的 loader | ✅ 是 | loadResponses、loadDefaultText、generateDynamicFindingPages、buildReportHtml 均收到 event |
| 10 | findings 页是否包含固定小节 | ✅ 是 | Asset Component, Observed Condition, Evidence, Risk Interpretation, Priority Classification, Budgetary Planning Range；缺项有默认补齐 |
| 11 | table-layout / word-wrap 是否生效 | ⚠️ 视 CSS 来源 | netlify/functions/reportStyles.css 有；根目录版本缺 table-layout 与 word-wrap |
| 12 | page-break-inside: avoid 是否有效 | ⚠️ 部分有效 | CSS 中 `h2, h3, h4, table, tr { page-break-inside: avoid }`；html-docx 转换器支持有限，可能不完全遵守 |

---

## 五、冗余/混乱点（Redundancy & Confusion）

| 类型 | 位置 | 说明 |
|------|------|------|
| loadResponses 重复实现 | generateWordReport.ts、buildReportMarkdown.ts、generateDynamicFindingPages.ts | 三处各自实现，应统一从 generateWordReport 传入或抽成公共模块 |
| loadTermsAndConditions 重复 | generateWordReport.ts、buildReportMarkdown.ts | 两处实现，逻辑类似 |
| sanitizeText 两套 | generateWordReport 内本地函数 vs lib/sanitizeText | 本地版本不替换 emoji，lib 版本替换；易混淆 |
| reportStyles.css 两处 | 根目录、netlify/functions/ | 内容不完全一致，loadReportCss 会按路径顺序选一个 |
| buildReportMarkdown 与 buildReportHtml | buildReportMarkdown.ts | `buildReportMarkdown` 仅为 `buildReportHtml` 别名，命名易误导 |
| loadWordTemplate 未使用 | generateWordReport.ts | 大量逻辑（split placeholders 修复等）在 loadWordTemplate 中，但 handler 直接读 report-template-md.docx |

---

## 六、历史审计记录

- **docs/REPORT_PIPELINE_AUDIT.md**：此前审计，已部分修复（如 event 传递、CSS 日志）。本次审计在此基础上补充并更新结论。

---

## 七、最小修复 Patch Plan

### 按文件列出改动点

| 文件 | 改动 | 优先级 |
|------|------|--------|
| `netlify/functions/generateWordReport.ts` | 第 2151–2152 行：将 `markdown.substring(0, 1200)` 改为 `reportHtml.substring(0, 1200)`；删除或修正 `html.substring(0, 1200)` 为 `reportHtml.substring(0, 1200)`（两行可合并为一条 `reportHtml` 预览） | P0 |
| `reportStyles.css`（根目录） | 为 `table` 增加 `table-layout: fixed`；为 `th, td` 增加 `word-wrap: break-word`，与 netlify/functions/reportStyles.css 保持一致 | P1 |
| `netlify/functions/lib/sanitizeText.ts` | （可选）增加 `preserveEmoji?: boolean` 参数或 `sanitizeTextForDocx(input, { preserveEmoji: true })`，供 markdownToHtml 在需保留 emoji 时使用 | P2 |
| `netlify/functions/lib/renderDocx.ts` | 方案 B `renderDocxWithHtmlAsText` 中移除对 `REPORT_BODY_HTML` 的二次 `sanitizeText` 调用（若正文已在 markdownToHtml 中 sanitize） | P2 |
| `netlify.toml` / 构建脚本 | 确认 report-template-md.docx、reportStyles.css 在 build 时复制到 netlify/functions 或正确路径 | P1 |

### 最小 Patch 示例（generateWordReport.ts）

```diff
--- a/netlify/functions/generateWordReport.ts
+++ b/netlify/functions/generateWordReport.ts
@@ -2146,8 +2146,7 @@ export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext
         recommended: recommendedCount,
         plan: planCount,
         limitations: inspection.limitations.length,
       });
-      console.log("Markdown preview (first 1200 chars):", markdown.substring(0, 1200));
-      console.log("HTML preview (first 1200 chars):", html.substring(0, 1200));
+      console.log("HTML preview (first 1200 chars):", reportHtml.substring(0, 1200));
     }
```

---

## 八、最小验证 Checklist

部署后按以下步骤验证：

| 序号 | 验证目标 | 操作 | 预期 |
|------|----------|------|------|
| 1 | Dev 模式不抛错 | 设置 `NETLIFY_DEV=true` 或 `NODE_ENV=development`，触发报告生成 | 无 `ReferenceError: markdown is not defined` |
| 2 | CSS 加载路径 | 生成报告后查日志 | 出现 `[report] CSS loaded from:` 或 `[report] CSS fallback:` |
| 3 | templateData 无 undefined | 生成报告后查日志 | `[DEV] templateData sample` 中无 `[undefined]`；无 `[report] templateData has undefined:` |
| 4 | REPORT_BODY_HTML 注入 | 打开生成的 docx | 正文内容完整，无残留 `{{REPORT_BODY_HTML}}` |
| 5 | 分页符生效 | 检查 docx 分页 | 各 section / finding 之间分页正常 |
| 6 | 表格样式 | 查看 CapEx / Test Data 等表格 | 单元格不挤压，长文本能换行 |
| 7 | emoji 显示 | 查看 Executive Summary / Priority | 若使用 lib/sanitizeText 替换 emoji，应显示 `[LOW]` / `[MODERATE]` / `[ELEVATED]`；若保留 emoji 应显示 🟢🟡🔴 |
| 8 | 模板加载 | 日志中查看 | 出现 `✅ Found report-template-md.docx at:` 且路径正确 |

### 日志关键词速查

- `[report] CSS loaded from:` → CSS 命中路径
- `[report] CSS fallback:` → 使用 FALLBACK_CSS
- `✅ Found report-template-md.docx at:` → 模板加载成功
- `[DEV] templateData keys:` → templateData 字段列表
- `ReferenceError: markdown is not defined` → 需修复 D1
