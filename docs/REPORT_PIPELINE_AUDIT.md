# 报告生成链路自检：偏差清单 + 根因 + 修复方案

> **2025-01-31 更新：** 根目录 `REPORT_PIPELINE_AUDIT.md` 已更新为完整审计报告，含调用链路、偏差清单、根因排序、12 项核查、Patch Plan 与验证 Checklist。本文件保留历史审计记录。

---

## 一、当前实现与设计思路 A–E 的偏差点

### A) 分页必须用 raw HTML `<div class="page-break"></div>`

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 禁止用 `---` 当分页 | ✅ 已满足 | `buildReportMarkdown.ts` 中 `PAGE_BREAK` 为 `\n\n<div class="page-break" style="page-break-after:always;"></div>\n\n`，无 `---` |
| CSS 对 `.page-break` 生效 | ✅ 已满足 | `reportStyles.css` 与 FALLBACK_CSS 中均有 `.page-break, div[style*="page-break-after"] { page-break-after: always; }` |

**偏差：** 无。分页与 CSS 已按设计实现。

---

### B) CSS 必须来自 reportStyles.css（存在则加载，否则 fallback）

| 检查项 | 状态 | 说明 |
|--------|------|------|
| markdownToHtml 正确 loadReportCss() | ✅ 已满足 | `loadReportCss()` 按 3 个路径查找，找不到则用 FALLBACK_CSS |
| Netlify build 后能否读到 reportStyles.css | ⚠️ 待验证 | 路径依赖 `__dirname`（打包后可能为 `.netlify/functions/xxx`）和 `process.cwd()`；需在运行时打日志确认 |
| CSS 是否被 `.replace(/\n/g," ")` 破坏 | ✅ 未破坏 | 当前未对读取的 CSS 做 replace 换行，仅 `.trim()` |

**偏差：**  
- 未在 `loadReportCss()` 内打日志，无法从日志确认「读到了哪个路径」或「使用了 fallback」。

---

### C) HTML 必须经过 docxSafeNormalize + sanitizeText

| 检查项 | 状态 | 说明 |
|--------|------|------|
| normalize 顺序 | ✅ 正确 | `markdownToHtml`: `md.render` → `docxSafeNormalize` → `sanitizeText` |
| 奇怪字符来源 | ⚠️ 有 | **lib/sanitizeText.ts** 将 🟢→[LOW]、🟡→[MODERATE]、🔴→[ELEVATED]，正文中的 emoji 会被替换；若需在 docx 中保留 emoji，此处会与预期不符 |
| renderDocx 二次 sanitize | ⚠️ 冗余/副作用 | `renderDocxWithHtmlMerge` 中再次对 `REPORT_BODY_HTML` 调用 `sanitizeText(htmlContent)`（lib 版），会再次替换 emoji 并做控制字符等处理；与 markdownToHtml 内已做处理重复，且若保留 emoji 会二次破坏 |

**偏差：**  
1. 正文中 emoji 被 lib/sanitizeText 替换为 [LOW]/[MODERATE]/[ELEVATED]。  
2. renderDocx 对整段 HTML 再次 sanitize，重复且可能破坏预期展示。

---

### D) 数据注入必须覆盖模板用到的所有占位符

| 检查项 | 状态 | 说明 |
|--------|------|------|
| templateData / rawTemplateData 缺字段 | ✅ 已覆盖 | rawTemplateData 含 coverData 展开 + REPORT_BODY_HTML + REPORT_VERSION、TERMS_AND_CONDITIONS、DYNAMIC_FINDING_PAGES 等；applyPlaceholderFallback 会补 REQUIRED_KEYS |
| applyPlaceholderFallback 将缺字段变为空字符串 | ✅ 已满足 | 先遍历 data 转字符串（null→""），再对 REQUIRED_KEYS 缺项用 DEFAULT_PLACEHOLDER_VALUES 或 "-" |
| 重复字段/重复渲染 | ⚠️ 设计需澄清 | **方案 A（renderDocxWithHtmlMerge）**：模板只用于封面 6 字段，**不**向 doc 注入 REPORT_BODY_HTML；正文由 `asBlob(htmlContent)` 单独成 docx 再与封面合并。若模板内仍有 `{{REPORT_BODY_HTML}}`，则 doc.setData(coverData) 未包含 REPORT_BODY_HTML，会未替换或报错。 |

**偏差：**  
- 方案 A 下模板中若存在 `{{REPORT_BODY_HTML}}`，当前只传 6 个封面字段会导致该占位符未被替换（或 docxtemplater 报错）。

---

### E) Dynamic findings 页结构稳定（固定小节 + Risk Interpretation 规则）

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 每页固定小节：Asset / Observed / Evidence / Risk Interpretation / Priority / Budget | ✅ 已满足 | `generateFindingPages.ts` 中 `generateFindingPageHtml` 固定输出 h3(标题) + h4+内容 六块 |
| Risk Interpretation ≥2 句且含 “if not addressed” | ✅ 已满足 | `validateRiskInterpretation` 校验句数与 “if not addressed”；不通过时 `generateFindingPageHtml` 内会补 defaultConsequence / defaultContext |

**偏差：** 无。

---

### 其他发现

| 项目 | 说明 |
|------|------|
| buildReportHtml 未传 event | `generateWordReport` 调用 `buildReportHtml({ inspection, canonical, findings, responses, computed })` 未传 `event`，导致 `buildObservedConditionsSection(..., event)` 收到 undefined，loadResponses(event) 无法用 blob，仅走文件 fallback。 |
| CAPEX_RANGE_LOW/HIGH 类型 | rawTemplateData 中 `CAPEX_RANGE_LOW: overallScore.CAPEX_LOW ?? 0` 为 number，applyPlaceholderFallback 会转成字符串，无 undefined 问题。 |

---

## 二、造成「生成 docx 仍然乱」的最可能根因（按影响排序）

1. **方案 A 下对整段 HTML 再次 sanitize（lib/sanitizeText）**  
   正文已由 markdownToHtml 做过 docxSafeNormalize + sanitizeText，renderDocx 再对整段 HTML 做 sanitize 会：再次替换 emoji、处理控制字符等，可能破坏已有结构或预期显示（如 emoji 被换成 [LOW] 等）。**影响：排版/显示与预期不符、emoji 丢失。**

2. **lib/sanitizeText 在 markdownToHtml 中替换 emoji**  
   若产品需要在 docx 中保留 🟢🟡🔴，当前在 markdown→HTML 阶段就用 lib/sanitizeText 替换成 [LOW]/[MODERATE]/[ELEVATED]，会导致 docx 中看不到 emoji。**影响：展示与设计不符。**

3. **buildReportHtml 未传 event**  
   Observed Conditions 依赖 responses（来自 loadResponses(event)）。未传 event 时在 Netlify 上若依赖 blob 中的 responses.yml 会读不到，只能走本地文件，可能缺数据或内容不对。**影响：findings 内容不完整或错误。**

4. **方案 A 模板中若含 {{REPORT_BODY_HTML}}**  
   当前只向 doc 注入 6 个封面字段，模板里的 {{REPORT_BODY_HTML}} 不会被替换，可能留下占位符或触发 docxtemplater 报错。**影响：封面页出现占位符或生成失败。**

5. **CSS 加载路径在 build 后未验证**  
   未打日志时无法确认是用了 reportStyles.css 还是 fallback，样式异常时难以排查。**影响：排查成本高。**

---

## 三、逐文件修改建议与 patch

### 1. netlify/functions/lib/markdownToHtml.ts

**修改点：**  
- 在 `loadReportCss()` 中打日志：命中路径或使用 fallback。  
- 不改变现有 docxSafeNormalize + sanitizeText 顺序；若产品确定保留 emoji，再单独加「不替换 emoji 的 sanitize 分支」或由调用方传入选项（本 patch 仅加日志）。

```diff
--- a/netlify/functions/lib/markdownToHtml.ts
+++ b/netlify/functions/lib/markdownToHtml.ts
@@ -44,11 +44,15 @@ function loadReportCss(): string {
   for (const filePath of possiblePaths) {
     try {
       if (fs.existsSync(filePath)) {
-        return fs.readFileSync(filePath, "utf-8").trim();
+        const css = fs.readFileSync(filePath, "utf-8").trim();
+        console.log("[report] CSS loaded from:", filePath);
+        return css;
       }
     } catch {
       // continue to next path
     }
   }
+  console.log("[report] CSS fallback: no reportStyles.css found, using FALLBACK_CSS");
   return FALLBACK_CSS;
 }
```

---

### 2. netlify/functions/lib/renderDocx.ts

**修改点：**  
- 方案 A 中不再对 `REPORT_BODY_HTML` 整段调用 `sanitizeText`（正文已在 markdownToHtml 中处理），避免二次替换 emoji 和重复处理。  
- 若需防御性处理，可仅做控制字符剔除（或调用与 markdownToHtml 一致的 docxSafeNormalize），不调用会改 emoji 的 lib/sanitizeText。

```diff
--- a/netlify/functions/lib/renderDocx.ts
+++ b/netlify/functions/lib/renderDocx.ts
@@ -66,8 +66,7 @@ export async function renderDocxWithHtmlMerge(
   let htmlContent = data.REPORT_BODY_HTML || "";
   if (!htmlContent) {
     throw new Error("REPORT_BODY_HTML 不能为空");
   }
-
-  // Sanitize HTML again before rendering to DOCX (defensive)
-  htmlContent = sanitizeText(htmlContent);
+
   const htmlDocxBlob = await asBlob(htmlContent, {
```

同时删除文件顶部未使用的 `import { sanitizeText } from "./sanitizeText";`（若仅此处使用）。若方案 B 仍需要 sanitize，可保留 import 仅用于方案 B。

---

### 3. netlify/functions/generateWordReport.ts

**修改点：**  
- 调用 `buildReportHtml` 时传入 `event`，以便 Observed Conditions 内 loadResponses(event) 能使用 blob。

```diff
--- a/netlify/functions/generateWordReport.ts
+++ b/netlify/functions/generateWordReport.ts
@@ -2009,7 +2009,8 @@ export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext)
     const reportHtml = await buildReportHtml({
       inspection,
       canonical,
       findings: inspection.findings,
       responses,
       computed,
+      event,
     });
```

---

### 4. netlify/functions/lib/renderDocx.ts（方案 A 模板占位符）

**修改点：**  
- 若模板 report-template-md.docx 内含 `{{REPORT_BODY_HTML}}`，方案 A 下应在 setData 时传入该占位符（例如空字符串），避免未替换或报错。当前方案 A 是「封面 6 字段 + 正文单独 asBlob 合并」，模板中不应再依赖 REPORT_BODY_HTML 内容；若模板仍含该占位符，建议在 coverData 中显式设 `REPORT_BODY_HTML: ""`，仅用于占位符替换。

```diff
--- a/netlify/functions/lib/renderDocx.ts
+++ b/netlify/functions/lib/renderDocx.ts
@@ -36,9 +36,11 @@ export async function renderDocxWithHtmlMerge(
   });
 
   // 准备封面数据（只包含6个字段）
   const coverData: Record<string, string> = {
     INSPECTION_ID: data.INSPECTION_ID || "",
     ASSESSMENT_DATE: data.ASSESSMENT_DATE || "",
     PREPARED_FOR: data.PREPARED_FOR || "",
     PREPARED_BY: data.PREPARED_BY || "",
     PROPERTY_ADDRESS: data.PROPERTY_ADDRESS || "",
     PROPERTY_TYPE: data.PROPERTY_TYPE || "",
+    // 方案 A 下正文由 asBlob 单独生成并合并，模板中若仍有该占位符则置空避免未替换
+    REPORT_BODY_HTML: "",
   };
```

（若确认模板中无 REPORT_BODY_HTML 占位符，可省略此项。）

---

### 5. （可选）保留 docx 内 emoji 时对 lib/sanitizeText 的用法

若产品确定**需要在 docx 中保留 🟢🟡🔴**，可二选一：

- **选项 A：** markdownToHtml 中不对 body 调用会替换 emoji 的 sanitizeText，仅调用 docxSafeNormalize（控制字符、nbsp、智能引号等）；或  
- **选项 B：** 在 lib/sanitizeText.ts 增加参数或单独导出 `sanitizeTextForDocx(html, { preserveEmoji: true })`，在 markdownToHtml 对 body 使用该分支。

本审计不强制改 lib/sanitizeText，仅列出供产品决策。

---

## 四、最小化验证步骤

### 1. 确认 CSS 读取路径（本地或 Netlify dev）

- 触发一次报告生成（例如调用 generateWordReport）。
- 在日志中搜索：  
  - `[report] CSS loaded from:` → 确认实际使用的 reportStyles.css 路径。  
  - `[report] CSS fallback:` → 确认使用了 FALLBACK_CSS。
- 若部署到 Netlify，用同一日志确认 build 后是否还能读到 `netlify/functions/reportStyles.css`（或你部署的路径）。

### 2. 确认 Markdown 里分页符在最终 HTML 中为 `<div class="page-break">`

- 在 `buildReportMarkdown.ts` 的 `buildReportHtml` 末尾、`markdownToHtml(mixedContent)` 之后临时打日志：  
  `console.log("[report] HTML contains page-break:", html.includes('class="page-break"') && html.includes('page-break-after'));`
- 或对返回的 `html` 做一次 `html.includes('<div class="page-break"')` 的断言/日志。
- 生成一次报告，看日志为 true 且最终 docx 中分页正常。

### 3. 确认 renderDocx 收到的 templateData 无 undefined

- 在 `generateWordReport.ts` 中，在调用 `renderDocx(templateBuffer, templateData)` 前加：  
  `const hasUndefined = Object.entries(templateData).some(([k, v]) => v === undefined);`  
  `console.log("[report] templateData has undefined:", hasUndefined, hasUndefined ? Object.entries(templateData).filter(([, v]) => v === undefined) : []);`
- 生成一次报告，确认 hasUndefined 为 false；若有 true，根据打印的 key 补缺或修正 applyPlaceholderFallback/assertNoUndefined。

### 4. （可选）确认 findings 结构与 Risk Interpretation

- 从生成的 HTML 或 docx 中取一段 Observed Conditions，检查是否包含：  
  `<h3>`, `<h4>Asset Component</h4>`, `<h4>Observed Condition</h4>`, `<h4>Evidence</h4>`, `<h4>Risk Interpretation</h4>`, `<h4>Priority Classification</h4>`, `<h4>Budgetary Planning Range</h4>`，以及 Risk Interpretation 段落中是否包含 “if not addressed” 类句子。

---

## 五、patch 汇总（已应用）

以下改动已应用到仓库：

1. **markdownToHtml.ts**：loadReportCss() 命中路径或 fallback 时打 `[report] CSS loaded from:` / `[report] CSS fallback:` 日志。
2. **renderDocx.ts**：方案 A 中移除对 REPORT_BODY_HTML 的二次 sanitizeText；coverData 中增加 `REPORT_BODY_HTML: ""` 避免模板占位符未替换。
3. **generateWordReport.ts**：buildReportHtml() 调用时传入 `event`；在 renderDocx 前打 templateData undefined 检查日志（若有 undefined 会打出 key）。

---

## 六、验证步骤速查

| 目标 | 操作 |
|------|------|
| 确认 CSS 读到的路径 | 生成报告后查日志：`[report] CSS loaded from:` 或 `[report] CSS fallback:` |
| 确认分页符为 `<div class="page-break">` | 在 buildReportHtml 中 markdownToHtml 返回后加 `console.log("[report] HTML has page-break:", html.includes('class="page-break"'));`，或直接看生成 HTML 片段 |
| 确认 templateData 无 undefined | 生成报告后查日志：若出现 `[report] templateData has undefined:` 则列出缺的 key，需在 applyPlaceholderFallback/assertNoUndefined 中补全 |
