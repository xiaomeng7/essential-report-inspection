# Word 模板占位符分析报告

## 📋 概述

本文档分析 Word 模板中占位符的数据来源，找出缺失数据的占位符，并说明如何修改 responses.yml 的选择逻辑。

## 1. 占位符数据来源

### 从 inspection.raw 直接提取的占位符：
- `INSPECTION_ID`: 从 `inspection.inspection_id` 获取
- `ASSESSMENT_DATE`: 从 `inspection.raw.created_at` 或当前日期获取
- `PREPARED_FOR`: 从 `inspection.raw.client.name` 或 `inspection.raw.client.client_type` 获取
- `PREPARED_BY`: 从 `inspection.raw.signoff.technician_name` 或默认值 "Better Home Technology Pty Ltd" 获取
- `PROPERTY_ADDRESS`: 从 `inspection.raw.job.address` 获取
- `PROPERTY_TYPE`: 从 `inspection.raw.job.property_type` 获取

### 从 findings + responses.yml 生成的占位符：
- `IMMEDIATE_FINDINGS`: 从 `inspection.findings` 中 priority="IMMEDIATE" 的 findings，通过 `responses.yml` 的 `findings[FINDING_CODE].title` 获取文本
- `RECOMMENDED_FINDINGS`: 从 `inspection.findings` 中 priority="RECOMMENDED_0_3_MONTHS" 的 findings，通过 `responses.yml` 的 `findings[FINDING_CODE].title` 获取文本
- `PLAN_FINDINGS`: 从 `inspection.findings` 中 priority="PLAN_MONITOR" 的 findings，通过 `responses.yml` 的 `findings[FINDING_CODE].title` 获取文本
- `LIMITATIONS`: 从 `inspection.limitations` 数组获取

### 从计算逻辑生成的占位符：
- `REPORT_VERSION`: 硬编码 "1.0"
- `OVERALL_STATUS`: 根据 findings 数量计算（"Requires Immediate Attention" / "Requires Recommended Actions" / "Satisfactory - Plan Monitoring" / "Satisfactory"）
- `EXECUTIVE_SUMMARY`: 根据 findings 数量生成摘要文本
- `RISK_RATING`: 根据 findings 数量计算（"HIGH" / "MODERATE" / "LOW"）
- `RISK_RATING_FACTORS`: 根据 findings 数量生成风险因素文本
- `URGENT_FINDINGS`: 等同于 `IMMEDIATE_FINDINGS`
- `TEST_SUMMARY`: 硬编码 "Electrical safety inspection completed in accordance with applicable standards."
- `TECHNICAL_NOTES`: 从 `inspection.limitations` 和硬编码文本组合生成

## 2. Responses.yml 选择逻辑

### 当前逻辑（在 `buildReportData` 函数中）：
1. 遍历 `inspection.findings` 中的每个 finding
2. 使用 `finding.id`（finding code，如 `MEN_NOT_VERIFIED`）作为 key
3. 在 `responses.yml` 的 `findings` 部分查找对应的响应：
   ```yaml
   findings:
     MEN_NOT_VERIFIED:
       title: "MEN Link Not Verified"
       why_it_matters: "..."
       recommended_action: "..."
       planning_guidance: "..."
   ```
4. 如果找到 `findingResponse.title`，使用它
5. 否则，使用 `finding.title`（如果存在）或 `findingCode.replace(/_/g, " ")` 作为后备

### 当前问题：
- **只使用了 `title` 字段**，`why_it_matters`、`recommended_action`、`planning_guidance` 等字段没有被使用
- Word 模板中可能需要的其他占位符（如每个 finding 的详细描述）无法获取

## 3. 可能缺失数据的占位符

根据 HTML 模板（`report-template.html`）中的占位符，以下占位符在 Word 模板中可能存在但没有数据源：

- `OVERALL_STATUS_BADGE`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `EXECUTIVE_SUMMARY_PARAGRAPH`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `RISK_RATING_BADGE`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `PRIORITY_IMMEDIATE_DESC`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `PRIORITY_IMMEDIATE_INTERP`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `PRIORITY_RECOMMENDED_DESC`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `PRIORITY_RECOMMENDED_INTERP`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `PRIORITY_PLAN_DESC`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `PRIORITY_PLAN_INTERP`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `LIMITATIONS_SECTION`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `PLAN_MONITOR_FINDINGS`: HTML 模板中有，但 Word 模板中使用的是 `PLAN_FINDINGS`
- `GENERAL_OBSERVATIONS_NOTES`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `CAPITAL_PLANNING_TABLE`: HTML 模板中有，但 Word 模板中可能没有对应的数据
- `TEST_RESULTS_SUMMARY`: HTML 模板中有，但 Word 模板中使用的是 `TEST_SUMMARY`

## 4. 如何修改 Responses 选择逻辑

### 方案 1：扩展 `buildReportData` 函数
修改 `buildReportData` 函数，使其不仅返回 `title`，还返回完整的 finding 响应对象，包括：
- `title`
- `why_it_matters`
- `recommended_action`
- `planning_guidance`

### 方案 2：创建新的格式化函数
创建新的函数来格式化 findings，使用 `responses.yml` 中的完整信息：
```typescript
function formatFindingWithResponse(finding: Finding, response: FindingResponse): string {
  return `${response.title}\n\nWhy it matters: ${response.why_it_matters}\n\nRecommended action: ${response.recommended_action}`;
}
```

### 方案 3：在 Word 模板中使用更详细的占位符
如果 Word 模板需要更详细的信息，可以：
1. 为每个 finding 创建单独的占位符（如 `{{FINDING_MEN_NOT_VERIFIED_TITLE}}`）
2. 或者创建格式化的文本块，包含所有信息

## 5. 建议的改进

1. **扩展 `buildReportData` 函数**：返回完整的 finding 响应对象，而不仅仅是 title
2. **创建格式化函数**：根据 Word 模板的需求，格式化 findings 文本，包含 `why_it_matters`、`recommended_action` 等
3. **添加缺失的占位符**：为 Word 模板中需要的占位符添加数据源
4. **统一占位符命名**：确保 Word 模板和 HTML 模板使用相同的占位符命名
