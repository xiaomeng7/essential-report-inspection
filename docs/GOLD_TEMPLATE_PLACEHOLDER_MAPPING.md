# Gold_Report_Template.docx 占位符列表与数据源映射

本文档列出 `Gold_Report_Template.docx` 中所有占位符，以及生成报告时对应的数据来源与填充逻辑。

## 一、占位符完整列表（45 个）

### 封面与基本信息（4）
| 占位符 | 说明 | 数据源 |
|--------|------|--------|
| `{{PROPERTY_ADDRESS}}` | 物业地址 | `canonical.property_address` / `raw.job.address` |
| `{{CLIENT_NAME}}` | 委托方/客户名称 | `canonical.prepared_for` / `raw.client.name`（即原 PREPARED_FOR） |
| `{{ASSESSMENT_DATE}}` | 评估日期 | `canonical.assessment_date` / `raw.created_at` 格式化为 YYYY-MM-DD |
| `{{REPORT_ID}}` | 报告编号 | `inspection.inspection_id`（即原 INSPECTION_ID） |

### 执行摘要（5）
| 占位符 | 说明 | 数据源 |
|--------|------|--------|
| `{{OVERALL_RISK_LABEL}}` | 整体风险等级 | `reportData.RISK_RATING` / `reportData.OVERALL_STATUS`（LOW / MODERATE / ELEVATED） |
| `{{EXECUTIVE_SUMMARY_PARAGRAPH}}` | 执行摘要段落 | 由 `reportData` + `executiveSummaryTemplates` 按风险等级生成 |
| `{{CAPEX_RANGE}}` | CapEx 金额区间 | `reportData.capex_low_total`–`capex_high_total`，如 "2,400–3,200" 或 "0 – 0" |
| `{{CAPEX_NOTE}}` | CapEx 说明 | `reportData.capex_note` / DEFAULT_REPORT_TEXT |
| `{{DECISION_CONFIDENCE_STATEMENT}}` | 决策信心陈述 | `defaultText.DECISION_CONFIDENCE_STATEMENT` / 固定兜底 |

### 行动与优先级摘要（3）
| 占位符 | 说明 | 数据源 |
|--------|------|--------|
| `{{ACTION_NOW_SUMMARY}}` | 需立即行动项摘要 | 由 IMMEDIATE/URGENT findings 列表生成（标题 + 建议） |
| `{{PLANNED_WORK_SUMMARY}}` | 计划内工作摘要 | 由 RECOMMENDED findings 列表生成 |
| `{{MONITOR_ITEMS_SUMMARY}}` | 观察/监控项摘要 | 由 PLAN_MONITOR findings 列表生成 |

### 范围与方法（3）
| 占位符 | 说明 | 数据源 |
|--------|------|--------|
| `{{SCOPE_BULLETS}}` | 评估范围要点 | `defaultText.SCOPE_SECTION` / SCOPE_TEXT |
| `{{INDEPENDENCE_STATEMENT}}` | 独立性声明 | `defaultText.INDEPENDENCE_STATEMENT` / 固定兜底 |
| `{{METHODOLOGY_OVERVIEW_TEXT}}` | 方法概述 | `defaultText.METHODOLOGY_OVERVIEW_TEXT` |

### 正文与附录（3）
| 占位符 | 说明 | 数据源 |
|--------|------|--------|
| `{{DYNAMIC_FINDING_PAGES}}` | 动态 Finding 页内容 | 由每个 finding 生成一节（标题、优先级、观察、建议），纯文本或 HTML |
| `{{RISK_FRAMEWORK_NOTES}}` | 风险框架说明 | `defaultText` 或固定说明 |
| `{{APPENDIX_CONTENT}}` | 附录（照片与测试备注） | limitations + test notes / 照片列表的纯文本摘要 |

### CapEx 表（5 行 × 5 列 = 25）
| 占位符 | 说明 | 数据源 |
|--------|------|--------|
| `{{CAPEX_ITEM_1}}` … `{{CAPEX_ITEM_5}}` | 资产/项目名称 | findings 或 capex 列表的 item 名称 |
| `{{CAPEX_CONDITION_1}}` … `{{CAPEX_CONDITION_5}}` | 当前状况 | 对应 finding 的 condition 描述 |
| `{{CAPEX_PRIORITY_1}}` … `{{CAPEX_PRIORITY_5}}` | 优先级 | Urgent / Recommended / Monitor |
| `{{CAPEX_TIMELINE_1}}` … `{{CAPEX_TIMELINE_5}}` | 建议时间线 | 来自 responses 或固定表述 |
| `{{CAPEX_BUDGET_1}}` … `{{CAPEX_BUDGET_5}}` | 预算区间 (AUD) | 来自 finding 的 budgetary_range 或 capex 计算 |

### 结尾（2）
| 占位符 | 说明 | 数据源 |
|--------|------|--------|
| `{{OWNER_OPTIONS_TEXT}}` | 业主决策路径/选项 | `defaultText.OWNER_OPTIONS_TEXT` / 固定模板 |
| `{{LEGAL_DISCLAIMER_TEXT}}` | 法律与免责声明 | `defaultText.terms_and_conditions` / DEFAULT_TERMS.md 转纯文本 |

---

## 二、与现有代码的对应关系

| Gold 占位符 | 现有字段/函数 |
|-------------|----------------|
| PROPERTY_ADDRESS | `buildCoverData().PROPERTY_ADDRESS` |
| CLIENT_NAME | `buildCoverData().PREPARED_FOR` |
| ASSESSMENT_DATE | `buildCoverData().ASSESSMENT_DATE` |
| REPORT_ID | `buildCoverData().INSPECTION_ID` |
| OVERALL_RISK_LABEL | `buildReportData().OVERALL_STATUS` 或 RISK_RATING |
| EXECUTIVE_SUMMARY_PARAGRAPH | `generateReport` 中 executiveSummary 逻辑 |
| CAPEX_RANGE / CAPEX_NOTE | `buildReportData()` capex_low_total, capex_high_total, capex_note |
| ACTION_NOW_SUMMARY 等 | `buildReportMarkdown` 中 “What requires action now” 等段落逻辑 |
| SCOPE_BULLETS 等 | `loadDefaultText()` 对应 key |
| DYNAMIC_FINDING_PAGES | `buildObservedConditionsSection` 或等价按 finding 循环生成 |
| CAPEX_ITEM_* 等 | `buildReportData()` 的 capex 行数据或 findings 前 5 条 |
| OWNER_OPTIONS_TEXT / LEGAL_DISCLAIMER_TEXT | `loadDefaultText()` + DEFAULT_TERMS.md |

---

## 三、填充流程（概要）

1. 加载检查数据：`get(inspection_id)` → `inspection`。
2. 规范化：`normalizeInspection(inspection.raw)` → `canonical`。
3. 构建报告数据：`buildReportData(inspection, event)` → `reportData`（含 capex、counts、risk、executive 相关）。
4. 构建封面/基本信息：复用 `buildCoverData` 或等价逻辑，映射到 Gold 的 4 个封面占位符。
5. 构建执行摘要与决策陈述：用 `reportData` + `loadDefaultText()` 生成 5 个执行摘要占位符。
6. 构建行动与优先级摘要：用 findings 按 priority 分组，生成 3 个摘要占位符。
7. 构建范围与方法：用 `loadDefaultText()` 填 3 个占位符。
8. 构建 DYNAMIC_FINDING_PAGES：按 findings 循环生成每节内容（纯文本或 HTML，由实现决定）。
9. 构建 RISK_FRAMEWORK_NOTES：固定文本或 defaultText。
10. 构建 CapEx 表：从 reportData 或 findings 取前 5 条，填 25 个占位符。
11. 构建 OWNER_OPTIONS_TEXT、LEGAL_DISCLAIMER_TEXT：defaultText + DEFAULT_TERMS。
12. 构建 APPENDIX_CONTENT：limitations + 测试/照片摘要。
13. 调用 docxtemplater：`doc.setData(templateData)`，`doc.render()`，输出 docx。

所有占位符均应有兜底值（空字符串或默认文案），避免未定义导致模板报错。
