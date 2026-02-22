# SLOT_MAP

## 1) Slot -> 写入来源 -> 最终消费路径

| Slot Key | 主要写入函数 | 主要来源 | 最终进入 DOCX 的路径 |
|---|---|---|---|
| `WHAT_THIS_MEANS_SECTION` | `applyMergedOverrides` / `buildStructuredReport` | `plan.merged.whatThisMeans` 或 legacy computed | `renderReportFromSlots` -> `REPORT_BODY_HTML` -> `renderDocx` |
| `EXECUTIVE_DECISION_SIGNALS` | `applyMergedOverrides` / `buildStructuredReport` | `plan.merged.executiveSummary` 或 legacy executive signals | 同上 |
| `EXEC_SUMMARY_TEXT` | `applyMergedOverrides` | `EXECUTIVE_DECISION_SIGNALS` alias | 作为中间兼容字段（最终由 structured report 汇总） |
| `EXECUTIVE_SUMMARY` | `applyMergedOverrides` / legacy builder | merged 合并文本或 legacy summary | 供 executive 计算与兼容 |
| `CAPEX_TABLE_ROWS` | `applyMergedOverrides` / legacy capex builder | `plan.merged.capexRows` 或 legacy capex rows | `renderReportFromSlots` 的 `{{CAPEX_TABLE_ROWS}}` |
| `CAPEX_SNAPSHOT` | `applyMergedOverrides` / legacy computed | merged capex snapshot 或 legacy computed range | `{{CAPEX_SNAPSHOT}}` |
| `FINDING_PAGES_HTML` | `applyMergedOverrides` / `buildStructuredReport` | `buildFindingPagesHtmlFromMerged(plan.merged.findings)` 或 legacy observed section | `{{FINDING_PAGES_HTML}}` |
| `REPORT_BODY_HTML` | `generateWordReport` | `markdownToHtml(renderReportFromSlots(structuredReport))` | `renderDocxByMergingCoverAndBody` |

---

## 2) 注入控制与保护

统一入口：`netlify/functions/lib/reportEngine/injection/applyMergedOverrides.ts`

- 开关来源：
  - `report_engine_injection_mode`
  - `inject_what_this_means / inject_executive / inject_capex / inject_findings`
- 保护逻辑：
  - `hasExplicitModules=false` 时，`capex/findings` 不切换到 merged
  - findings 注入前必须通过 `validateMergedFindingPagesHtml`
- 可观测性：
  - `slotSourceMap` 记录每个 slot 来源与 reason code

---

## 3) 模板消费位置

### Markdown skeleton（slot 模板）

文件：`netlify/functions/lib/buildReportMarkdown.ts` -> `REPORT_SKELETON`

关键占位符：

- `{{EXECUTIVE_DECISION_SIGNALS}}`
- `{{CAPEX_SNAPSHOT}}`
- `{{WHAT_THIS_MEANS_SECTION}}`
- `{{FINDING_PAGES_HTML}}`
- `{{CAPEX_TABLE_ROWS}}`

### DOCX 渲染

- `generateWordReport.ts` 将 slot 渲染后的 HTML 放入 `REPORT_BODY_HTML`
- `renderDocx.ts` 用 `renderDocxByMergingCoverAndBody` 合并封面+正文 HTML 转 DOCX

---

## 4) 模块到 slot 的对应关系（当前）

- `energy/lifecycle` 模块都输出：
  - `executiveSummaryContrib` -> executive slot
  - `whatThisMeansContrib` -> wtm slot
  - `capexRowsContrib` -> capex slots
  - `findingsContrib` -> findings html slot
- `safety/capacity` 当前为 emptyOutput（占位，不写业务内容）
