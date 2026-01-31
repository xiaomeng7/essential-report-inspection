# 报告生成链路最终审计结论

> 生成日期：2025-01-31  
> 范围：P0 debug ReferenceError、P1 CSS 一致性、P2 emoji/重复 sanitize/模板占位符兜底

---

## 一、偏差清单（A–E 对应）

| 编号 | 检查项 | 状态 | 说明 |
|------|--------|------|------|
| **A** | 分页必须用 raw HTML `<div class="page-break"></div>` | ✅ | `buildReportMarkdown.ts` 使用 `PAGE_BREAK = <div class="page-break" style="page-break-after:always;">`，无 `---` |
| **B** | CSS 必须来自 reportStyles.css（存在则加载，否则 fallback） | ✅ | loadReportCss 有日志；`reportStyles.css` 已加入 netlify.toml included_files |
| **C** | HTML 经 docxSafeNormalize + sanitizeText，且 docx 保留 emoji | ✅ | markdownToHtml 使用 `sanitizeText(htmlBody, { preserveEmoji: true })`；方案 B 也使用 `preserveEmoji: true` |
| **D** | 数据注入覆盖模板所有占位符（含 REPORT_BODY_HTML、TERMS_AND_CONDITIONS） | ✅ | renderDocxWithHtmlMerge 的 coverData 含 ASSESSMENT_PURPOSE、REPORT_BODY_HTML: ""、TERMS_AND_CONDITIONS: "" |
| **E** | Dynamic findings 页结构稳定 | ✅ | 固定小节顺序完整，缺项有默认补齐 |

---

## 二、Top 5 根因排序（含证据）

### RC1. Debug 段 ReferenceError（P0）— **已修复**

| 项目 | 详情 |
|------|------|
| **根因** | 在 `NETLIFY_DEV=true` 或 `NODE_ENV=development` 下会抛 `ReferenceError: markdown is not defined`，完全阻断报告生成 |
| **证据** | 原代码引用未定义变量：`markdown.substring(0, 1200)`、`html.substring(0, 1200)` |
| **当前状态** | ✅ 已改为 `reportHtml.substring(0, 1200)` |

```ts
// generateWordReport.ts:2151（当前正确实现）
console.log("HTML preview (first 1200 chars):", reportHtml.substring(0, 1200));
```

---

### RC2. CSS 未部署导致表格挤压（P1）

| 项目 | 详情 |
|------|------|
| **根因** | `reportStyles.css` 未列入 `netlify.toml` 的 `included_files`，构建时可能未复制到 functions 目录，`loadReportCss` 回退到 FALLBACK_CSS；若 FALLBACK_CSS 与主 CSS 不一致，表格样式可能异常 |
| **证据** | `netlify.toml` 第 7–18 行无 `reportStyles.css` |
| **当前状态** | ⚠️ 需在 netlify.toml 中显式加入 |

```toml
# netlify.toml 当前 included_files 片段（缺少 reportStyles.css）
included_files = [
  "./netlify/functions/report-template.docx",
  "./netlify/functions/report-template-md.docx",
  ...
  "./netlify/functions/EXECUTIVE_SUMMARY_TEMPLATES.md"
  # 缺少: "./netlify/functions/reportStyles.css"
]
```

---

### RC3. sanitizeText 替换 emoji（P2）— **已修复**

| 项目 | 详情 |
|------|------|
| **根因** | lib/sanitizeText 将 🟢🟡🔴 替换为 [LOW]/[MODERATE]/[ELEVATED]，导致 docx 中无 emoji |
| **证据** | markdownToHtml 与 renderDocx 调用链 |
| **当前状态** | ✅ 已增加 `preserveEmoji: true` 选项，markdownToHtml 与方案 B 均使用 |

```ts
// markdownToHtml.ts:96
htmlBody = sanitizeText(htmlBody, { preserveEmoji: true });

// renderDocx.ts:129 (方案 B)
htmlContent = sanitizeText(htmlContent, { preserveEmoji: true });
```

---

### RC4. 方案 B 二次 sanitize 破坏 emoji（P2）— **已修复**

| 项目 | 详情 |
|------|------|
| **根因** | renderDocxWithHtmlAsText 对 HTML 再次调用 sanitizeText，若不传 preserveEmoji 会二次替换 emoji |
| **证据** | 同上，当前方案 B 已使用 `preserveEmoji: true` |
| **当前状态** | ✅ 已修复 |

---

### RC5. 模板占位符未兜底（P2）— **已修复**

| 项目 | 详情 |
|------|------|
| **根因** | renderDocxWithHtmlMerge 的 coverData 若未包含 ASSESSMENT_PURPOSE、TERMS_AND_CONDITIONS，模板中若有这些占位符会残留或报错 |
| **证据** | coverData 当前已包含上述字段 |
| **当前状态** | ✅ 已修复 |

```ts
// renderDocx.ts:40-51（当前正确实现）
const coverData: Record<string, string> = {
  INSPECTION_ID: data.INSPECTION_ID || "",
  ASSESSMENT_DATE: data.ASSESSMENT_DATE || "",
  PREPARED_FOR: data.PREPARED_FOR || "",
  PREPARED_BY: data.PREPARED_BY || "",
  PROPERTY_ADDRESS: data.PROPERTY_ADDRESS || "",
  PROPERTY_TYPE: data.PROPERTY_TYPE || "",
  ASSESSMENT_PURPOSE: data.ASSESSMENT_PURPOSE || "",
  REPORT_BODY_HTML: "",
  TERMS_AND_CONDITIONS: "",
};
```

---

## 三、最小 Patch（仅剩 P1）— **已应用**

当前仅 **P1：reportStyles.css 部署** 需补丁，其余 P0/P2 已修复。以下补丁已应用。

### Patch 1：netlify.toml ✅ 已应用

```diff
--- a/netlify.toml
+++ b/netlify.toml
@@ -15,6 +15,7 @@
     "./netlify/functions/DEFAULT_TERMS.md",
     "./netlify/functions/finding_profiles.yml",
     "./netlify/functions/EXECUTIVE_SUMMARY_TEMPLATES.md"
+    "./netlify/functions/reportStyles.css"
   ]
```

**说明**：确保 reportStyles.css 随 Netlify Functions 一起部署，避免 loadReportCss 无法命中文件而使用 fallback。

---

### 已完成修复（无需补丁）

| 文件 | 已修复内容 |
|------|------------|
| `generateWordReport.ts` | debug 段使用 `reportHtml.substring(0, 1200)` |
| `lib/sanitizeText.ts` | 增加 `preserveEmoji` 选项 |
| `lib/markdownToHtml.ts` | 调用 `sanitizeText(htmlBody, { preserveEmoji: true })` |
| `lib/renderDocx.ts` | coverData 含 ASSESSMENT_PURPOSE、TERMS_AND_CONDITIONS；方案 B 使用 `preserveEmoji: true` |
| `reportStyles.css`（根目录） | 已有 `table-layout: fixed` 与 `word-wrap: break-word` |
| `netlify/functions/reportStyles.css` | 同上，与根目录一致 |

---

## 四、部署后验证 Checklist

| 序号 | 验证目标 | 触发步骤 | 预期现象 | 日志关键字 |
|------|----------|----------|----------|------------|
| 1 | Dev 模式不抛错 | `NETLIFY_DEV=true npm run dev`，调用生成报告 API | 无 ReferenceError | 无 `ReferenceError: markdown is not defined` |
| 2 | CSS 正确加载 | 生成任意报告 | 表格样式正常，长文本可换行 | `[report] CSS loaded from:` 或 `[report] CSS fallback:` |
| 3 | 模板加载成功 | 生成报告 | 返回 200，docx 可下载 | `✅ Found report-template-md.docx at:` |
| 4 | 无 undefined 占位符 | 生成报告 | docx 中无 `{{...}}` 残留 | `[DEV] templateData sample` 中无 `[undefined]`；无 `[report] templateData has undefined:` |
| 5 | emoji 显示 | 生成含 risk badge 的报告 | Executive Summary / Priority 显示 🟢🟡🔴 | 无需特定日志，肉眼检查 docx |
| 6 | 分页正常 | 打开 docx | 各 section / finding 间分页正确 | 无需日志 |
| 7 | REPORT_BODY_HTML 注入 | 打开 docx | 正文完整，无 `{{REPORT_BODY_HTML}}` | `✅ Template contains {{REPORT_BODY_HTML}} placeholder` |

### 日志关键字速查

| 关键字 | 含义 |
|--------|------|
| `[report] CSS loaded from:` | CSS 从指定路径加载成功 |
| `[report] CSS fallback:` | 未找到 reportStyles.css，使用 FALLBACK_CSS |
| `✅ Found report-template-md.docx at:` | 模板加载成功 |
| `✅ Loaded Terms and Conditions from:` | DEFAULT_TERMS.md 加载成功 |
| `[DEV] templateData keys:` | templateData 字段列表 |
| `✅ Template contains {{REPORT_BODY_HTML}} placeholder` | 模板含正文占位符，可正常注入 |
| `ReferenceError: markdown is not defined` | 需修复 P0（当前应已消失） |

### 触发报告生成

```bash
# 本地 dev
NETLIFY_DEV=true npm run dev

# 调用 API（示例，以实际路径为准）
curl -X POST "http://localhost:8888/api/generateWordReport" \
  -H "Content-Type: application/json" \
  -d '{"inspection_id": "<your-inspection-id>"}'
```
