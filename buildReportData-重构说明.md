# buildReportData 函数重构说明

## 📋 重构目标

重构 `buildReportData` 函数，实现三层数据来源优先级系统，确保所有 Word 占位符都有值（不允许 undefined/null）。

## 🎯 三层优先级系统

### 第一优先级（最高）：实际数据
- **inspection.raw**：基础字段（地址、日期、客户信息等）
- **findings + responses.yml**：包含 `title` + `why_it_matters` + `recommended_action`

### 第二优先级：计算值
- 通过 findings 数量计算：
  - `OVERALL_STATUS`
  - `RISK_RATING`
  - `EXECUTIVE_SUMMARY`
  - `RISK_RATING_FACTORS`
  - `PRIORITY_IMMEDIATE_DESC`
  - `PRIORITY_IMMEDIATE_INTERP`
  - `PRIORITY_RECOMMENDED_DESC`
  - `PRIORITY_RECOMMENDED_INTERP`
  - `PRIORITY_PLAN_DESC`
  - `PRIORITY_PLAN_INTERP`

### 第三优先级（兜底）：默认文本
- 如果以上都没有生成内容，使用 `DEFAULT_REPORT_TEXT.md` 中的默认文本

## 📝 主要变更

### 1. 新增函数：`buildWordTemplateData`

**位置：** `netlify/functions/generateWordReport.ts`

**功能：**
- 实现三层优先级系统
- 返回完整的 `WordTemplateData` 对象
- 确保所有占位符都是 `string` 类型，不允许 `undefined/null`

**签名：**
```typescript
export async function buildWordTemplateData(
  inspection: StoredInspection,
  reportData: ReportData,
  event?: HandlerEvent
): Promise<WordTemplateData>
```

### 2. 新增类型：`WordTemplateData`

**包含的占位符（24个）：**

#### 基本信息（6个）
- `INSPECTION_ID`
- `ASSESSMENT_DATE`
- `PREPARED_FOR`
- `PREPARED_BY`
- `PROPERTY_ADDRESS`
- `PROPERTY_TYPE`

#### Findings 部分（5个）
- `IMMEDIATE_FINDINGS`
- `RECOMMENDED_FINDINGS`
- `PLAN_FINDINGS`
- `LIMITATIONS`
- `URGENT_FINDINGS`

#### 报告元数据（5个）
- `REPORT_VERSION`
- `OVERALL_STATUS`
- `EXECUTIVE_SUMMARY`
- `RISK_RATING`
- `RISK_RATING_FACTORS`

#### 优先级解释（6个）- **新增**
- `PRIORITY_IMMEDIATE_DESC`
- `PRIORITY_IMMEDIATE_INTERP`
- `PRIORITY_RECOMMENDED_DESC`
- `PRIORITY_RECOMMENDED_INTERP`
- `PRIORITY_PLAN_DESC`
- `PRIORITY_PLAN_INTERP`

#### 技术部分（2个）
- `TEST_SUMMARY`
- `TECHNICAL_NOTES`

### 3. Findings 格式化增强

**之前：** 只使用 `title`
```typescript
findingText = findingResponse.title || finding.title || findingCode.replace(/_/g, " ");
```

**现在：** 使用 `title` + `why_it_matters` + `recommended_action`
```typescript
function formatFindingWithDetails(finding): string {
  const parts: string[] = [];
  parts.push(title);
  if (findingResponse?.why_it_matters) {
    parts.push(`\nWhy it matters: ${findingResponse.why_it_matters}`);
  }
  if (findingResponse?.recommended_action) {
    parts.push(`\nRecommended action: ${findingResponse.recommended_action}`);
  }
  return parts.join("");
}
```

### 4. 优先级解释（Priority Interpretations）

**新增 6 个占位符，根据 findings 数量动态生成：**

- **有 findings 时：** 生成具体的解释文本
- **无 findings 时：** 使用 `DEFAULT_REPORT_TEXT.md` 中的默认值

**示例：**
```typescript
const priorityImmediateDesc = reportData.immediate.length > 0
  ? `Immediate safety concerns require urgent attention to prevent potential hazards.`
  : defaultText.PRIORITY_IMMEDIATE_DESC || "No immediate safety concerns identified.";
```

## 🔄 数据流

```
inspection.raw
    ↓
buildReportData() → ReportData (findings grouped by priority)
    ↓
buildWordTemplateData()
    ↓
Priority 1: inspection.raw + findings + responses.yml
    ↓
Priority 2: Calculated from findings count
    ↓
Priority 3: DEFAULT_REPORT_TEXT.md (fallback)
    ↓
WordTemplateData (all placeholders as strings)
    ↓
Word 文档生成
```

## ✅ 保证

1. **所有占位符都是 string 类型**
   - TypeScript 类型系统保证
   - 运行时检查确保没有 undefined/null

2. **三层优先级确保有值**
   - 第一优先级：实际数据
   - 第二优先级：计算值
   - 第三优先级：默认值

3. **Findings 详细信息**
   - 包含 `title`、`why_it_matters`、`recommended_action`
   - 格式化为易读的文本

## 📦 更新的文件

1. **`netlify/functions/generateWordReport.ts`**
   - 新增 `WordTemplateData` 类型
   - 新增 `buildWordTemplateData()` 函数
   - 更新 handler 使用新函数

2. **`DEFAULT_REPORT_TEXT.md`**（根目录和 netlify/functions/）
   - 新增 6 个 `PRIORITY_*_INTERP` 字段

3. **`netlify/functions/lib/defaultTextLoader.ts`**
   - 更新 `DefaultText` 类型，添加 `PRIORITY_*_INTERP` 字段
   - 更新 `getDefaultTextWithFallbacks()` 函数

## 🧪 使用示例

```typescript
// 1. 构建基础报告数据（findings 分组）
const reportData = await buildReportData(inspection, event);

// 2. 构建 Word 模板数据（三层优先级）
const templateData = await buildWordTemplateData(inspection, reportData, event);

// 3. 使用 templateData 生成 Word 文档
doc.render(templateData);
```

## 📊 占位符映射表

| 占位符 | 优先级 1 | 优先级 2 | 优先级 3 |
|--------|---------|---------|---------|
| `INSPECTION_ID` | inspection.inspection_id | - | DEFAULT_REPORT_TEXT.md |
| `ASSESSMENT_DATE` | inspection.raw.created_at | - | DEFAULT_REPORT_TEXT.md |
| `PROPERTY_ADDRESS` | inspection.raw.job.address | - | DEFAULT_REPORT_TEXT.md |
| `IMMEDIATE_FINDINGS` | findings + responses.yml | - | DEFAULT_REPORT_TEXT.md |
| `OVERALL_STATUS` | - | 根据 findings 数量计算 | DEFAULT_REPORT_TEXT.md |
| `RISK_RATING` | - | 根据 findings 数量计算 | DEFAULT_REPORT_TEXT.md |
| `PRIORITY_IMMEDIATE_DESC` | - | 根据 findings 数量计算 | DEFAULT_REPORT_TEXT.md |

## 🎉 优势

1. **类型安全**：所有占位符都有明确的类型定义
2. **数据完整性**：三层优先级确保始终有值
3. **详细信息**：Findings 包含完整的 why_it_matters 和 recommended_action
4. **易于维护**：清晰的优先级逻辑，易于理解和修改
5. **可扩展性**：易于添加新的占位符和优先级规则
