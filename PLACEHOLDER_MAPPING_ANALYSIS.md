# 模板占位符 vs 代码字段对照表

## 数据来源

### 模板占位符来源
- `netlify/functions/report-template.html`
- `report-template.html`
- `report-template-paged.html`
- Word 模板文档（通过代码检查）

### 代码字段来源
- `coverData` (buildCoverData)
- `rawTemplateData` (generateWordReport.ts)
- `reportData` (buildReportData)
- `placeholderMap.ts` (REQUIRED_PLACEHOLDERS, OPTIONAL_PLACEHOLDERS)

---

## 对照表

| 模板占位符 | 代码提供字段 | 状态 | 备注 |
|-----------|------------|------|------|
| `{{INSPECTION_ID}}` | `coverData.INSPECTION_ID` | ✅ PROVIDED | 来自 buildCoverData |
| `{{ASSESSMENT_DATE}}` | `coverData.ASSESSMENT_DATE` | ✅ PROVIDED | 来自 buildCoverData |
| `{{PREPARED_FOR}}` | `coverData.PREPARED_FOR` | ✅ PROVIDED | 来自 buildCoverData |
| `{{PREPARED_BY}}` | `coverData.PREPARED_BY` | ✅ PROVIDED | 来自 buildCoverData |
| `{{PROPERTY_ADDRESS}}` | `coverData.PROPERTY_ADDRESS` | ✅ PROVIDED | 来自 buildCoverData |
| `{{PROPERTY_TYPE}}` | `coverData.PROPERTY_TYPE` | ✅ PROVIDED | 来自 buildCoverData |
| `{{REPORT_VERSION}}` | `reportData.REPORT_VERSION` | ✅ PROVIDED | 来自 buildReportData |
| `{{ASSESSMENT_PURPOSE}}` | `coverData.ASSESSMENT_PURPOSE` | ✅ PROVIDED | 来自 buildCoverData (新增) |
| `{{REPORT_BODY_HTML}}` | `rawTemplateData.REPORT_BODY_HTML` | ✅ PROVIDED | 来自 buildReportHtml |
| `{{OVERALL_STATUS_BADGE}}` | `rawTemplateData.OVERALL_STATUS_BADGE` | ✅ PROVIDED | 来自 reportData |
| `{{EXECUTIVE_SUMMARY_PARAGRAPH}}` | `reportData.EXECUTIVE_SUMMARY` | ✅ PROVIDED | 来自 buildReportData |
| `{{EXECUTIVE_DECISION_SIGNALS}}` | `rawTemplateData.EXECUTIVE_DECISION_SIGNALS` | ✅ PROVIDED | 来自 reportData |
| `{{EXECUTIVE_SUMMARY}}` | `reportData.EXECUTIVE_SUMMARY` | ✅ PROVIDED | 来自 buildReportData |
| `{{CAPEX_SNAPSHOT}}` | `rawTemplateData.CAPEX_SNAPSHOT` | ✅ PROVIDED | 来自 reportData |
| `{{RISK_RATING}}` | `rawTemplateData.RISK_RATING` | ✅ PROVIDED | 来自 reportData |
| `{{RISK_RATING_BADGE}}` | `reportData.RISK_RATING` | ✅ PROVIDED | 来自 buildReportData |
| `{{RISK_RATING_FACTORS}}` | `reportData.RISK_RATING_FACTORS` | ✅ PROVIDED | 来自 buildReportData |
| `{{OVERALL_STATUS}}` | `rawTemplateData.OVERALL_STATUS` | ✅ PROVIDED | 来自 reportData |
| `{{OVERALL_ELECTRICAL_STATUS}}` | `reportData.OVERALL_ELECTRICAL_STATUS` | ✅ PROVIDED | 别名，来自 reportData |
| `{{PRIORITY_IMMEDIATE_DESC}}` | `reportData.PRIORITY_IMMEDIATE_DESC` | ✅ PROVIDED | 来自 buildReportData |
| `{{PRIORITY_IMMEDIATE_INTERP}}` | `reportData.PRIORITY_IMMEDIATE_INTERP` | ✅ PROVIDED | 来自 buildReportData |
| `{{PRIORITY_RECOMMENDED_DESC}}` | `reportData.PRIORITY_RECOMMENDED_DESC` | ✅ PROVIDED | 来自 buildReportData |
| `{{PRIORITY_RECOMMENDED_INTERP}}` | `reportData.PRIORITY_RECOMMENDED_INTERP` | ✅ PROVIDED | 来自 buildReportData |
| `{{PRIORITY_PLAN_DESC}}` | `reportData.PRIORITY_PLAN_DESC` | ✅ PROVIDED | 来自 buildReportData |
| `{{PRIORITY_PLAN_INTERP}}` | `reportData.PRIORITY_PLAN_INTERP` | ✅ PROVIDED | 来自 buildReportData |
| `{{PRIORITY_TABLE_ROWS}}` | `reportData.PRIORITY_TABLE_ROWS` | ✅ PROVIDED | 来自 buildReportData |
| `{{IMMEDIATE_FINDINGS}}` | `reportData.IMMEDIATE_FINDINGS` | ✅ PROVIDED | 来自 buildReportData |
| `{{RECOMMENDED_FINDINGS}}` | `reportData.RECOMMENDED_FINDINGS` | ✅ PROVIDED | 来自 buildReportData |
| `{{PLAN_MONITOR_FINDINGS}}` | `reportData.PLAN_MONITOR_FINDINGS` | ✅ PROVIDED | 来自 buildReportData |
| `{{URGENT_FINDINGS}}` | `reportData.URGENT_FINDINGS` | ✅ PROVIDED | 来自 buildReportData |
| `{{LIMITATIONS_SECTION}}` | `reportData.LIMITATIONS_SECTION` | ✅ PROVIDED | 来自 buildReportData |
| `{{SCOPE_SECTION}}` | `reportData.SCOPE_SECTION` | ✅ PROVIDED | 来自 buildReportData |
| `{{SCOPE_TEXT}}` | `reportData.SCOPE_TEXT` | ✅ PROVIDED | 别名，来自 buildReportData |
| `{{DYNAMIC_FINDING_PAGES}}` | `rawTemplateData.DYNAMIC_FINDING_PAGES` | ✅ PROVIDED | 来自 reportData |
| `{{DYNAMIC_FINDING_PAGES_HTML}}` | `reportData.DYNAMIC_FINDING_PAGES_HTML` | ✅ PROVIDED | 来自 buildReportData |
| `{{THERMAL_METHOD}}` | `reportData.THERMAL_METHOD` | ✅ PROVIDED | 来自 buildReportData |
| `{{THERMAL_FINDINGS}}` | `reportData.THERMAL_FINDINGS` | ✅ PROVIDED | 来自 buildReportData |
| `{{THERMAL_VALUE_STATEMENT}}` | `reportData.THERMAL_VALUE_STATEMENT` | ✅ PROVIDED | 来自 buildReportData |
| `{{CAPEX_TABLE_ROWS}}` | `reportData.CAPEX_TABLE_ROWS` | ✅ PROVIDED | 来自 buildReportData |
| `{{CAPEX_DISCLAIMER_LINE}}` | `reportData.CAPEX_DISCLAIMER_LINE` | ✅ PROVIDED | 来自 buildReportData |
| `{{CAPEX_RANGE}}` | `reportData.CAPEX_RANGE` | ✅ PROVIDED | 来自 buildReportData |
| `{{CAPEX_RANGE_LOW}}` | `rawTemplateData.CAPEX_RANGE_LOW` | ✅ PROVIDED | 来自 overallScore.capex_low |
| `{{CAPEX_RANGE_HIGH}}` | `rawTemplateData.CAPEX_RANGE_HIGH` | ✅ PROVIDED | 来自 overallScore.capex_high |
| `{{DECISION_PATHWAYS_SECTION}}` | `reportData.DECISION_PATHWAYS_SECTION` | ✅ PROVIDED | 来自 buildReportData |
| `{{DECISION_PATHWAYS_TEXT}}` | `reportData.DECISION_PATHWAYS_TEXT` | ✅ PROVIDED | 别名，来自 buildReportData |
| `{{TERMS_AND_CONDITIONS}}` | `rawTemplateData.TERMS_AND_CONDITIONS` | ✅ PROVIDED | 来自 reportData |
| `{{TERMS_AND_CONDITIONS_TEXT}}` | `reportData.TERMS_AND_CONDITIONS_TEXT` | ✅ PROVIDED | 别名，来自 buildReportData |
| `{{CLOSING_STATEMENT}}` | `reportData.CLOSING_STATEMENT` | ✅ PROVIDED | 来自 buildReportData |
| `{{TEST_SUMMARY}}` | `reportData.TEST_SUMMARY` | ✅ PROVIDED | 来自 buildReportData |
| `{{TEST_RESULTS_SUMMARY}}` | `reportData.TEST_RESULTS_SUMMARY` | ✅ PROVIDED | 来自 buildReportData |
| `{{TECHNICAL_NOTES}}` | `reportData.TECHNICAL_NOTES` | ✅ PROVIDED | 来自 buildReportData |
| `{{GENERAL_OBSERVATIONS_NOTES}}` | `reportData.GENERAL_OBSERVATIONS_NOTES` | ✅ PROVIDED | 来自 buildReportData |
| `{{CAPITAL_PLANNING_TABLE}}` | `reportData.CAPITAL_PLANNING_TABLE` | ✅ PROVIDED | 来自 buildReportData |
| `{{NEXT_STEPS}}` | `reportData.NEXT_STEPS` | ✅ PROVIDED | 来自 buildReportData |
| `{{CLIENT_NAME}}` | `reportData.CLIENT_NAME` | ✅ PROVIDED | 别名，来自 buildReportData |
| `{{REPORT_ID}}` | `reportData.REPORT_ID` | ✅ PROVIDED | 别名，来自 buildReportData |
| `{{PURPOSE_PARAGRAPH}}` | `reportData.PURPOSE_PARAGRAPH` | ✅ PROVIDED | 来自 buildReportData |
| `{{HOW_TO_READ_TEXT}}` | `reportData.HOW_TO_READ_TEXT` | ✅ PROVIDED | 别名，来自 buildReportData |
| `{{HOW_TO_READ_PARAGRAPH}}` | `reportData.HOW_TO_READ_PARAGRAPH` | ✅ PROVIDED | 来自 buildReportData |
| `{{WHAT_THIS_MEANS_TEXT}}` | `reportData.WHAT_THIS_MEANS_TEXT` | ✅ PROVIDED | 别名，来自 buildReportData |
| `{{EXEC_SUMMARY_TEXT}}` | `reportData.EXEC_SUMMARY_TEXT` | ✅ PROVIDED | 别名，来自 buildReportData |
| `{{METHODOLOGY_TEXT}}` | `reportData.METHODOLOGY_TEXT` | ✅ PROVIDED | 来自 buildReportData (line 1395) |
| `{{RISK_FRAMEWORK_TEXT}}` | `reportData.RISK_FRAMEWORK_TEXT` | ✅ PROVIDED | 来自 buildReportData (line 1396) |
| `{{APPENDIX_TEST_NOTES_TEXT}}` | `reportData.APPENDIX_TEST_NOTES_TEXT` | ✅ PROVIDED | 来自 buildReportData (line 1397) |
| `{{PLAN_FINDINGS}}` | `reportData.PLAN_FINDINGS` | ✅ PROVIDED | 来自 buildReportData (line 1802) - 旧版字段名 |
| `{{LIMITATIONS}}` | `reportData.LIMITATIONS` | ✅ PROVIDED | 来自 buildReportData (line 1803) - 旧版字段名 |

### 旧版占位符（已废弃但代码仍支持）

以下占位符是旧版本的字段名，代码中仍提供支持，但建议使用新版本：

| 旧版占位符 | 新版占位符 | 状态 |
|-----------|-----------|------|
| `{{PLAN_FINDINGS}}` | `{{PLAN_MONITOR_FINDINGS}}` | ✅ 代码中同时提供两者 |
| `{{LIMITATIONS}}` | `{{LIMITATIONS_SECTION}}` | ✅ 代码中同时提供两者 |

---

## 缺失字段分析

### ✅ 所有字段均已提供

经过完整检查，**所有在模板中出现的占位符都有对应的代码字段提供值**。

所有字段都通过以下机制确保有值：
1. `buildReportData` 函数中显式生成
2. `ensureAllPlaceholders` 函数确保所有字段都有默认值
3. `assertNoUndefined` 函数在最终渲染前替换所有 undefined 值
4. `sanitizeObject` 函数确保所有值都是字符串类型

### 字段提供机制

1. **Cover Data** (`buildCoverData`): 封面字段
2. **Report Data** (`buildReportData`): 报告正文字段
3. **Raw Template Data** (`generateWordReport`): 最终模板数据（包含 REPORT_BODY_HTML）
4. **Placeholder Map** (`placeholderMap.ts`): 默认值兜底
5. **Assert No Undefined** (`assertNoUndefined`): 最终安全检查

---

## 已提供的字段（完整列表）

### Cover Data (buildCoverData)
- INSPECTION_ID
- ASSESSMENT_DATE
- PREPARED_FOR
- PREPARED_BY
- PROPERTY_ADDRESS
- PROPERTY_TYPE
- ASSESSMENT_PURPOSE (新增)

### Report Data (buildReportData)
- REPORT_VERSION
- OVERALL_STATUS_BADGE
- EXECUTIVE_DECISION_SIGNALS
- EXECUTIVE_SUMMARY
- CAPEX_SNAPSHOT
- RISK_RATING
- OVERALL_STATUS
- RISK_RATING_FACTORS
- PRIORITY_IMMEDIATE_DESC
- PRIORITY_IMMEDIATE_INTERP
- PRIORITY_RECOMMENDED_DESC
- PRIORITY_RECOMMENDED_INTERP
- PRIORITY_PLAN_DESC
- PRIORITY_PLAN_INTERP
- PRIORITY_TABLE_ROWS
- IMMEDIATE_FINDINGS
- RECOMMENDED_FINDINGS
- PLAN_MONITOR_FINDINGS
- URGENT_FINDINGS
- LIMITATIONS_SECTION
- SCOPE_SECTION
- SCOPE_TEXT
- DYNAMIC_FINDING_PAGES
- DYNAMIC_FINDING_PAGES_HTML
- THERMAL_METHOD
- THERMAL_FINDINGS
- THERMAL_VALUE_STATEMENT
- CAPEX_TABLE_ROWS
- CAPEX_DISCLAIMER_LINE
- CAPEX_RANGE
- DECISION_PATHWAYS_SECTION
- DECISION_PATHWAYS_TEXT
- TERMS_AND_CONDITIONS
- TERMS_AND_CONDITIONS_TEXT
- CLOSING_STATEMENT
- TEST_SUMMARY
- TEST_RESULTS_SUMMARY
- TECHNICAL_NOTES
- GENERAL_OBSERVATIONS_NOTES
- CAPITAL_PLANNING_TABLE
- NEXT_STEPS
- CLIENT_NAME
- REPORT_ID
- PURPOSE_PARAGRAPH
- HOW_TO_READ_TEXT
- HOW_TO_READ_PARAGRAPH
- WHAT_THIS_MEANS_TEXT
- EXEC_SUMMARY_TEXT
- OVERALL_ELECTRICAL_STATUS

### Raw Template Data (generateWordReport)
- REPORT_BODY_HTML
- CAPEX_RANGE_LOW
- CAPEX_RANGE_HIGH

---

## 总结

- **已提供字段数**：60+
- **缺失字段数**：0 ✅
- **所有字段状态**：✅ 全部已提供

### 保护机制

代码中实现了多层保护机制，确保不会出现 "undefined"：

1. **第一层**：`buildReportData` 显式生成所有字段
2. **第二层**：`ensureAllPlaceholders` 使用 `DEFAULT_PLACEHOLDER_VALUES` 填充缺失字段
3. **第三层**：`assertNoUndefined` 在渲染前替换所有 undefined 值
4. **第四层**：`sanitizeObject` 确保所有值都是字符串类型

**结论**：所有模板占位符都有对应的代码字段提供值，不会出现 "undefined"。
