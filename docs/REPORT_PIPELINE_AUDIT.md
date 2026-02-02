# 报告生成链路自检定位

## 1) Call Graph：从 Handler 到 renderDocx

```
[入口] netlify/functions/generateWordReport.ts :: handler
  │
  ├─ loadResponses()                    ← netlify/functions/generateWordReport.ts
  ├─ buildReportData()                  ← netlify/functions/generateWordReport.ts
  ├─ buildCoverData()                   ← netlify/functions/generateWordReport.ts
  │
  ├─ buildStructuredReport()            ← netlify/functions/lib/buildReportMarkdown.ts  ★ 核心
  │    ├─ loadDefaultText()             ← netlify/functions/lib/defaultTextLoader.ts
  │    ├─ loadTermsAndConditions()      ← netlify/functions/lib/buildReportMarkdown.ts
  │    ├─ buildObservedConditionsSection()  ← netlify/functions/lib/buildReportMarkdown.ts
  │    │    ├─ loadResponses()          ← netlify/functions/lib/buildReportMarkdown.ts
  │    │    ├─ loadFindingProfiles()    ← netlify/functions/lib/findingProfilesLoader.ts
  │    │    └─ generateFindingPages()   ← netlify/functions/lib/generateFindingPages.ts  ★ Finding 页
  │    ├─ buildComputedFields()         ← netlify/functions/lib/buildComputedFields.ts
  │    ├─ dedupeSentences()             ← netlify/functions/lib/textDedupe.ts
  │    ├─ buildPriorityOverviewSection()
  │    ├─ buildCapExRoadmapSection()
  │    ├─ buildClosingSection()
  │    ├─ buildPurposeSection()
  │    ├─ buildPrioritySnapshotTable()
  │    ├─ buildMethodologySection()
  │    ├─ buildScopeSection() / limitationsOnly
  │    ├─ buildThermalImagingSection()
  │    └─ buildAppendixSection()
  │
  ├─ assertReportReady()                ← netlify/functions/lib/reportContract.ts
  │
  ├─ renderReportFromSlots()            ← netlify/functions/lib/buildReportMarkdown.ts
  │    └─ REPORT_SKELETON 替换 {{KEY}} → 完整 Markdown 字符串
  │
  ├─ markdownToHtml()                   ← netlify/functions/lib/markdownToHtml.ts  ★ 最终生效点
  │    ├─ loadReportCss()               ← reportStyles.css
  │    ├─ md.render(markdown)
  │    └─ sanitizeText()
  │
  └─ renderDocx(templateBuffer, templateData)  ← netlify/functions/lib/renderDocx.ts  ★ 最终 DOCX
       ├─ renderDocxWithHtmlAsText()    ← 方案 B（默认，优先）
       │    ├─ htmlToFormattedText(REPORT_BODY_HTML)
       │    └─ Docxtemplater.setData() + render()
       │
       └─ [fallback] renderDocxWithHtmlMerge()  ← 方案 A（B 失败时）
            ├─ Docxtemplater 填充封面
            ├─ asBlob(REPORT_BODY_HTML) → html-docx
            └─ DocxMerger 合并
```

**另：generateMarkdownWord**（不同入口，未用于 simulate 脚本）
```
netlify/functions/generateMarkdownWord.ts :: handler
  ├─ buildMarkdownReport()              ← netlify/functions/lib/generateReport.ts
  ├─ markdownToHtml()
  └─ renderDocx()
```

---

## 2) 最终进入 DOCX 的正文来源

**明确结论：正文来自 `buildReportMarkdown.ts` → `markdownToHtml.ts` → `REPORT_BODY_HTML`**

- **REPORT_BODY_HTML** = `markdownToHtml(renderReportFromSlots(structuredReport))`
- `structuredReport` 由 `buildStructuredReport` 组装，包含：
  - `EXECUTIVE_DECISION_SIGNALS`（来自 buildComputedFields + dedupe）
  - `WHAT_THIS_MEANS_SECTION`（来自 buildComputedFields）
  - `FINDING_PAGES_HTML`（来自 buildObservedConditionsSection → generateFindingPages）
  - `DECISION_PATHWAYS`（来自 buildComputedFields）
  - `TERMS_AND_CONDITIONS`、`CAPEX_TABLE_ROWS`、`PRIORITY_TABLE_ROWS` 等

- **REPORT_SKELETON**（`buildReportMarkdown.ts` 内）通过 `{{KEY}}`  slot 替换，生成完整 Markdown
- **markdownToHtml** 将 Markdown 转为完整 HTML 文档（含 `<style>` 从 reportStyles.css）
- 该 HTML 作为 `templateData.REPORT_BODY_HTML` 传入 **renderDocx**
- **方案 B**（默认）：`htmlToFormattedText()` 转为纯文本，替换 Word 模板中的 `{{REPORT_BODY_HTML}}`
- **方案 A**（fallback）：HTML 经 `asBlob` 转为 DOCX，再与封面 DOCX 合并

**DYNAMIC_FINDING_PAGES**：generateWordReport 会调用 `generateDynamicFindingPages` 并将结果写入 `templateData.DYNAMIC_FINDING_PAGES`，但 **report-template-md.docx 当前主要使用 `{{REPORT_BODY_HTML}}`**。正文中的 Finding 页来自 `FINDING_PAGES_HTML`（buildObservedConditionsSection），不是 DYNAMIC_FINDING_PAGES。

---

## 3) 指纹日志（[report-fp]）

生成报告时，在 `renderDocx` 调用前会打印一组指纹日志（前缀统一 `[report-fp]`）：

| 项 | 位置 | 说明 |
|----|------|------|
| BUILD COMMIT_REF/CONTEXT/BRANCH | generateWordReport.ts handler 开始 + 指纹块 | 从 Netlify env 取 |
| responses.yml source/path/sha1 | loadResponses() 内 | blob 或 fs path + sha1 |
| reportStyles.css path/sha1 | markdownToHtml.ts loadReportCss() | path + length + sha1 |
| report-template-md.docx path/buffer.length/sha1 | 指纹块 + 模板加载处 | path + buffer.length + sha1 |
| sanitize callCount + preserveEmoji | 指纹块 | getSanitizeFingerprint() |
| Using renderer: (A/B) | renderDocx.ts | 仅最终生效的 renderer 打印（B 默认） |
| templateData undefined keys | 指纹块 | 必须为 []，否则 WARN |

---

## 4) 结论

### 当前线上实际使用的 Pipeline

- **主入口**：`/api/generateWordReport` → `generateWordReport.ts :: handler`
- **正文生成**：`buildStructuredReport` → `renderReportFromSlots` → `markdownToHtml` → `REPORT_BODY_HTML`
- **Renderer**：**方案 B**（`renderDocxWithHtmlAsText`）为默认，方案 A 仅在 B 抛错时作为 fallback

### PropertySignals 注入位置

要在最终报告中生效，应在以下任一位置注入 PropertySignals：

| 目标 | 注入位置 | 文件 | 函数 |
|------|----------|------|------|
| Executive / What This Means / Decision | **buildComputedFields** 的输入或输出 | `netlify/functions/lib/buildComputedFields.ts` | `buildComputedFields()` |
| 上游驱动 computed | **generateWordReport** 中构建 `computed` 的位置 | `netlify/functions/generateWordReport.ts` | handler 内 `const computed = {...}` 之前 |
| 或 **buildReportData** | `netlify/functions/generateWordReport.ts` | `buildReportData()` |

**推荐**：在 `generateWordReport.ts` 的 handler 中，在调用 `buildStructuredReport` 之前：
1. 用 `derivePropertySignals(dimensionsList)` 得到 `PropertyDecisionSignals`
2. 将 `signals` 传入 `buildStructuredReport` 的 `reportData` 或新增参数
3. 在 `buildReportMarkdown.ts` 的 `buildStructuredReport` 内，用 `signals` 覆盖/驱动 `EXECUTIVE_DECISION_SIGNALS`、`WHAT_THIS_MEANS_SECTION`、`DECISION_PATHWAYS` 等 slot

这样 PropertySignals 会进入 REPORT_SKELETON，最终写入 DOCX 正文。

---

## 5) photo_ids 链路结论表

| 环节 | 文件/函数 | photo_ids 状态 | 说明 |
|------|-----------|----------------|------|
| **产生** | `submitInspection` → `uploadPhotoToFinding` | base64 → 上传 → P01, P02 | 提交时房间内有 base64 照片，上传后写入 finding.photo_ids |
| **产生** | `saveCustomFindings` → `uploadPhotoToFinding` | base64 → 上传 → P01 | 工程师补全 custom findings 后，从 raw 房间取 base64 上传 |
| **写入** | `uploadInspectionPhoto.ts` / `uploadPhotoToFinding.ts` | `(finding as any).photo_ids = newPhotoIds` | 写回 inspection.findings[*].photo_ids，再 save() |
| **验证** | `uploadInspectionPhoto.ts` | re-read → `[photo-fp] after-save verify` | 保存后立刻 re-read，打印 finding_id, photo_ids length, verified |
| **读取** | `generateWordReport.ts` → `get(inspection_id)` | `inspection.findings` | 尝试 strong 读，失败则 eventual；`[photo-fp] inspection.findings photo summary` |
| **传递** | `buildStructuredReport` → `findings: inspection.findings` | 直接传 findings | 未做 map 裁剪，photo_ids 保留 |
| **映射** | `buildReportMarkdown.ts` → `buildObservedConditionsSection` | `photo_ids: f.photo_ids ?? (f as any).photo_ids` | 显式保留 photo_ids 到 findingList |
| **生成** | `generateFindingPages.ts` → `getPhotoIds` | `finding.photo_ids` | 只从 finding 取，不 fallback raw；`[photo-fp] VERSION finding.id photo_ids length` |
| **输出** | Evidence 节 | `photo_ids.length > 0` → "Photo P01 — caption (View photo)" | 无照片时输出 "No photographic evidence captured" |

**修复后预期日志示例**：
```
[photo-fp] after-save verify: finding_id=CUSTOM_GPO_0_0 photo_ids length=1 verified=true
[photo-fp] inspection.findings photo summary: GPO_MECHANICAL_LOOSE=1, FITTING_OVERHEAT=1, CUSTOM_GPO_0_0=1, CUSTOM_LIGHTING_0_0=1
[photo-fp] VERSION=2026-01-31-v1 finding.id=GPO_MECHANICAL_LOOSE photo_ids length=1
[photo-fp] VERSION=2026-01-31-v1 finding.id=CUSTOM_GPO_0_0 photo_ids length=1
```

**若 photo_ids 仍为 0**：检查 `[photo-fp] after-save verify` 的 verified 是否为 true；若 false，说明 Blob 写入/读取链路有问题（如 eventual 一致性延迟）。检查 `[photo-fp] inspection.findings photo summary` 是否全 0；若全 0，说明 generateWordReport 读到的 inspection 中 findings 无 photo_ids。
