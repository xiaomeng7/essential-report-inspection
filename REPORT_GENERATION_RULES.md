# 报告生成规则 (Report Generation Rules)

本文档详细说明了电气检查报告的生成规则、数据流程和格式要求。

**⚠️ 重要：本文档包含非协商性规则（NON-NEGOTIABLE RULES），AI 必须严格遵守。违反任何规则都会使输出无效。**

## 📋 目录

1. [非协商性规则（NON-NEGOTIABLE RULES）](#非协商性规则non-negotiable-rules)
2. [报告生成流程](#报告生成流程)
3. [数据源优先级](#数据源优先级)
4. [风险评级规则](#风险评级规则)
5. [报告结构](#报告结构)
6. [Findings 格式化规则](#findings-格式化规则)
7. [Executive Summary 生成规则](#executive-summary-生成规则)
8. [模板要求](#模板要求)
9. [数据验证规则](#数据验证规则)

---

## 非协商性规则（NON-NEGOTIABLE RULES）

**这些规则是强制性的，AI 必须严格遵守。违反任何规则都会使输出无效。**

### 1. 整体报告定位（Overall Report Positioning）

- **报告性质**：这是一份决策支持文档（decision-support document）
- **报告不是**：
  - ❌ 检查报告（inspection report）
  - ❌ 合规证书（compliance certificate）
  - ❌ 维修报价（repair quotation）
- **语言风格**：所有语言必须面向投资者（investor-facing），而不是面向技术人员（technician-facing）

### 2. Executive Summary 规则

#### EXECUTIVE_DECISION_SIGNALS（执行决策信号）

此部分必须满足以下所有要求：

**必需内容：**
- ✅ **至少一句话说明**：如果不采取行动会发生什么
- ✅ **至少一句话说明**：为什么这种情况不是立即或紧急风险
- ✅ **至少一句话说明**：为什么风险可以在正常的资产规划周期内管理

**严格禁止：**
- ❌ 技术组件名称
- ❌ 标准引用（AS/NZS, RCBO 等）
- ❌ 检查式摘要

**目的**：此部分用于支持决策，而不是描述发现。

### 3. Finding 页面结构（Pages 6–10）

每个 finding 必须遵循以下精确的结构和顺序：

#### 3.1 Asset Component（资产组件）
- **格式**：仅使用简短的名词短语
- **示例**：`Main Switchboard`, `Distribution Board`, `RCD Protection`

#### 3.2 Observed Condition（观察到的状况）
- **要求**：仅客观描述，不含意见
- **禁止**：主观判断、建议性语言

#### 3.3 Evidence（证据）
- **要求**：说明观察到、测量到或验证到的内容
- **禁止**：解释或推断

#### 3.4 Risk Interpretation（风险解释）

**强制性要求：**
- ✅ 最少 2 句话
- ✅ 必须包含 "if not addressed"（如果不解决）的逻辑
- ✅ 必须解释随时间推移的后果，而不是立即后果

**示例格式：**
```
If this condition is not addressed, [consequence over time].
[Explanation of why this is manageable within normal planning cycles].
```

#### 3.5 Priority Classification（优先级分类）

使用以下分类之一：
- **Urgent Liability Risk**（紧急责任风险）
- **Budgetary Provision Recommended**（建议预算准备）
- **Acceptable**（可接受）

#### 3.6 Budgetary Planning Range（预算规划范围）
- **要求**：仅提供指示性财务范围
- **禁止**：建议或行动号召

### 4. Thermal Imaging Section（热成像部分）

**要求：**
- ✅ 必须解释为什么热成像增加了风险识别的价值
- ✅ 将其定位为非侵入性决策支持工具

**禁止：**
- ❌ 解释热成像的工作原理
- ❌ 技术性描述

### 5. CapEx Roadmap Rules（资本支出路线图规则）

**要求：**
- ✅ 所有数字都是指示性市场基准
- ✅ 必须包含免责声明：
  ```
  "Provided for financial provisioning only. Not a quotation or scope of works."
  ```
  （仅用于财务准备。不是报价或工作范围。）

### 6. Language Guardrails（语言护栏）

#### AI 必须（MUST）：
- ✅ 使用中性、咨询性语调
- ✅ 避免指令性语言（"should", "must", "recommended to"）
- ✅ 避免维修建议

#### AI 不得（MUST NOT）：
- ❌ 听起来像承包商
- ❌ 听起来像电工
- ❌ 听起来像检查清单

**语言示例：**

**❌ 错误（技术性）：**
```
The RCD protection should be upgraded to meet AS/NZS 3000 requirements.
```

**✅ 正确（投资者面向）：**
```
Current protection levels may require enhancement to align with contemporary standards, 
which could be factored into future capital planning cycles.
```

### 7. Legal Positioning（法律定位）

**要求：**
至少一个部分必须说明：
- ✅ 风险并未消除
- ✅ 本报告提供了管理风险的框架，而不是消除风险

**示例文本：**
```
This assessment provides a framework for managing electrical risk within acceptable 
parameters. It does not eliminate risk, but rather identifies areas where proactive 
management can reduce potential liability and operational disruption.
```

---

## 报告生成流程

### 整体流程

```
1. 加载 Inspection 数据
   ↓
2. 加载配置文件（responses.yml, DEFAULT_REPORT_TEXT.md, EXECUTIVE_SUMMARY_TEMPLATES.md）
   ↓
3. 构建 ReportData（按优先级分组 findings）
   ↓
4. 计算 Computed 字段（RISK_RATING, OVERALL_STATUS, EXECUTIVE_SUMMARY）
   ↓
5. 构建 CoverData（封面 6 个字段）
   ↓
6. 生成 Markdown 报告 → buildReportMarkdown()
   ↓
7. 转换为 HTML → markdownToHtml()
   ↓
8. 加载 Word 模板（report-template-md.docx）
   ↓
9. 渲染 Word 文档 → renderDocx()
   ↓
10. 保存到 Netlify Blob Storage
```

### 关键函数

- `buildReportData()` - 按优先级分组 findings
- `buildCoverData()` - 构建封面数据（6个字段）
- `buildReportMarkdown()` - 生成 Markdown 报告
- `markdownToHtml()` - Markdown 转 HTML
- `renderDocx()` - 渲染 Word 文档

---

## 数据源优先级

报告数据采用**三层优先级系统**，确保所有字段都有值，不会出现 `undefined`：

### Priority 1（最高优先级）：实际数据

**来源：** `inspection.raw` + `findings` + `responses.yml`

**字段：**
- `INSPECTION_ID` - 从 `inspection.inspection_id`
- `ASSESSMENT_DATE` - 从 `inspection.raw.created_at`
- `PREPARED_FOR` - 从 `inspection.raw.client.name` 或 `client.client_type`
- `PREPARED_BY` - 从 `inspection.raw.signoff.technician_name`
- `PROPERTY_ADDRESS` - 从 `inspection.raw.job.address`
- `PROPERTY_TYPE` - 从 `inspection.raw.job.property_type`
- Findings 详细内容 - 从 `findings` + `responses.yml` 的 `findings[id]` 对象

**Findings 字段优先级：**
1. `responses.yml` 中的 `findings[id].title`
2. `finding.title`
3. `finding.id`（格式化后）

**Findings 详细字段（从 `responses.yml`）：**
- `title` - 标题
- `why_it_matters` - 为什么重要
- `recommended_action` - 推荐行动
- `planning_guidance` - 规划指导

### Priority 2（计算字段）：基于 Findings 计数

**来源：** 根据 findings 数量和优先级计算

**字段：**
- `RISK_RATING` - 风险评级（HIGH / MODERATE / LOW）
- `OVERALL_STATUS` - 总体状态（格式：`${RISK_RATING} RISK`）
- `EXECUTIVE_SUMMARY` - 执行摘要（从模板选择）
- `RISK_RATING_FACTORS` - 风险因素描述
- `PRIORITY_*_DESC` - 优先级描述
- `PRIORITY_*_INTERP` - 优先级解释

### Priority 3（兜底值）：默认文本

**来源：** `DEFAULT_REPORT_TEXT.md`

**用途：** 当 Priority 1 和 Priority 2 都无法提供值时，使用默认文本

**字段：** 所有报告字段都有对应的默认值

---

## 风险评级规则

### RISK_RATING 计算逻辑

```typescript
if (immediateFindings.length > 0) {
  RISK_RATING = "HIGH"
} else if (recommendedFindings.length > 0) {
  RISK_RATING = "MODERATE"
} else {
  RISK_RATING = "LOW"  // 包括空 findings 或只有 plan findings
}
```

### OVERALL_STATUS 格式

```typescript
OVERALL_STATUS = `${RISK_RATING} RISK`
// 示例： "HIGH RISK", "MODERATE RISK", "LOW RISK"
```

### RISK_RATING_FACTORS 生成规则

根据 findings 计数生成：

```typescript
const factors = [];
if (immediate.length > 0) {
  factors.push(`${immediate.length} immediate safety concern(s)`);
}
if (recommended.length > 0) {
  factors.push(`${recommended.length} recommended action(s)`);
}
RISK_RATING_FACTORS = factors.join(", ") || "No significant risk factors identified"
```

---

## 报告结构

Markdown 报告按以下固定结构生成：

### 1. Purpose（目的）
- 固定文本：说明报告的目的和范围

### 2. Executive Summary（执行摘要）
- **风险等级**：显示 emoji + 文本（🟢 LOW RISK / 🟡 MODERATE RISK / 🔴 HIGH RISK）
- **Executive Summary 正文**：从 `EXECUTIVE_SUMMARY_TEMPLATES.md` 选择模板
- **Key Decision Signals**：根据 findings 计数动态生成 2-3 条 bullet
- **Financial Planning Snapshot**：显示 `CAPEX_RANGE` 或 "To be confirmed"

### 3. Priority Summary（优先级摘要表）
表格格式：
| Priority | Count | Description |
|----------|-------|-------------|
| 🔴 Immediate | X | Safety concerns requiring urgent attention |
| 🟡 Recommended (0-3 months) | Y | Items requiring short-term planned action |
| 🟢 Planning & Monitoring | Z | Items for ongoing monitoring |

### 4. Scope & Limitations（范围和限制）
- **Limitations**：从 `inspection.limitations` 数组
- **Access**：从 `inspection.raw.access` 字段

### 5. Detailed Findings（详细发现）
按优先级分组：

#### 5.1 Immediate Safety Concerns（立即安全关注）
每个 finding 包含：
- **标题**：`## Asset Component — {friendly title}`
- **Priority**：🔴 Immediate
- **Observed Condition**：优先 `finding.observed` 或 `finding.facts`，否则用 `responses.findings[id].title`
- **Risk Interpretation**：优先 `responses.findings[id].why_it_matters`
- **Recommended Action**：`responses.findings[id].recommended_action`（可选）
- **Planning Guidance**：`responses.findings[id].planning_guidance`（可选）

#### 5.2 Recommended Actions (0-3 Months)
格式同上，Priority 为 🟡 Recommended (0-3 months)

#### 5.3 Planning & Monitoring
格式同上，Priority 为 🟢 Planning & Monitoring

### 6. Test Data & Technical Notes（测试数据和技术备注）
- **Test Summary**：从 `inspection.raw.rcd_tests.summary` 或 `gpo_tests.summary`
- **Technical Notes**：从 `inspection.raw.signoff.office_notes_internal` 或 `access.notes`
- 如果没有数据，显示："No test data captured for this assessment."

### 7. Thermal Imaging（热成像）
- 如果有数据：显示数据
- 如果没有：显示 "No thermal imaging data captured for this assessment."

### 8. Capital Expenditure Planning（资本支出规划）

**⚠️ 必须遵循非协商性规则：**
- ✅ 所有数字都是指示性市场基准
- ✅ 必须包含免责声明：
  ```
  "Provided for financial provisioning only. Not a quotation or scope of works."
  ```

**内容要求：**
- 如果 `computed.CAPEX_RANGE` 有值：显示估算范围 + 免责声明
- 否则：显示 "Capital expenditure estimates will be provided upon request..." + 免责声明

### 9. Options & Next Steps（选项和后续步骤）
固定格式的 4 条建议

### 10. Disclaimer（免责声明）
固定文本

### 11. Closing（结尾）
- **Prepared by**：从 `inspection.raw.signoff.technician_name`
- **Assessment Date**：格式化日期
- 固定文本

---

## Findings 格式化规则

### 字段使用规则

**⚠️ 重要：必须遵循非协商性规则中的 Finding 页面结构要求。**

根据 `finding.priority` 使用不同的字段组合：

#### IMMEDIATE（立即）
**强调字段：**
- `why_it_matters` - 为什么重要（必需）
- `recommended_action` - 推荐行动（必需）
- `planning_guidance` - 规划指导（可选）

**格式（必须遵循非协商性规则）：**
```
## Asset Component
{title}  // 简短名词短语

## Observed Condition
{observed_condition}  // 客观描述，无意见

## Evidence
{evidence}  // 观察到、测量到或验证到的内容

## Risk Interpretation
{if_not_addressed_consequence}  // 必须包含 "if not addressed" 逻辑
{consequence_over_time}  // 解释随时间推移的后果，最少 2 句话

## Priority Classification
Urgent Liability Risk

## Budgetary Planning Range
{indicative_range}  // 仅指示性财务范围，无建议
```

#### RECOMMENDED_0_3_MONTHS（推荐 0-3 个月）
**包含所有字段：**
- `why_it_matters` - 为什么重要
- `recommended_action` - 推荐行动
- `planning_guidance` - 规划指导

**格式（必须遵循非协商性规则）：**
```
## Asset Component
{title}  // 简短名词短语

## Observed Condition
{observed_condition}  // 客观描述，无意见

## Evidence
{evidence}  // 观察到、测量到或验证到的内容

## Risk Interpretation
{if_not_addressed_consequence}  // 必须包含 "if not addressed" 逻辑
{consequence_over_time}  // 解释随时间推移的后果，最少 2 句话

## Priority Classification
Budgetary Provision Recommended

## Budgetary Planning Range
{indicative_range}  // 仅指示性财务范围，无建议
```

#### PLAN_MONITOR（规划监控）
**强调字段：**
- `planning_guidance` - 规划指导（主要）
- `why_it_matters` - 为什么重要（次要）
- `recommended_action` - 推荐行动（可选）

**格式（必须遵循非协商性规则）：**
```
## Asset Component
{title}  // 简短名词短语

## Observed Condition
{observed_condition}  // 客观描述，无意见

## Evidence
{evidence}  // 观察到、测量到或验证到的内容

## Risk Interpretation
{if_not_addressed_consequence}  // 必须包含 "if not addressed" 逻辑
{consequence_over_time}  // 解释随时间推移的后果，最少 2 句话

## Priority Classification
Acceptable

## Budgetary Planning Range
{indicative_range}  // 仅指示性财务范围，无建议
```

### 标题生成规则

```typescript
function getFindingTitle(finding, findingsMap) {
  return findingsMap[finding.id]?.title || 
         finding.title || 
         finding.id.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}
```

### 优先级 Emoji 映射

- `IMMEDIATE` → 🔴
- `RECOMMENDED_0_3_MONTHS` → 🟡
- `PLAN_MONITOR` → 🟢

---

## Executive Summary 生成规则

**⚠️ 重要：必须遵循非协商性规则中的 Executive Summary 规则。**

### EXECUTIVE_DECISION_SIGNALS 生成规则

**强制性要求：**
1. ✅ 至少一句话说明：如果不采取行动会发生什么
2. ✅ 至少一句话说明：为什么这种情况不是立即或紧急风险
3. ✅ 至少一句话说明：为什么风险可以在正常的资产规划周期内管理

**严格禁止：**
- ❌ 技术组件名称
- ❌ 标准引用（AS/NZS, RCBO 等）
- ❌ 检查式摘要

### 模板选择

根据 `RISK_RATING` 选择模板：

```typescript
if (RISK_RATING === "HIGH") {
  template = EXECUTIVE_SUMMARY_TEMPLATES.HIGH
} else if (RISK_RATING === "MODERATE") {
  template = EXECUTIVE_SUMMARY_TEMPLATES.MODERATE
} else {
  template = EXECUTIVE_SUMMARY_TEMPLATES.LOW
}
```

### LOW RISK 特殊处理

如果 `RISK_RATING === "LOW"` 且 `planFindings.length > 0`：

1. 使用 `EXECUTIVE_SUMMARY_TEMPLATES.LOW` 作为基础
2. 在第一段后插入维护观察段落：
   ```
   A small number of non-urgent maintenance observations were noted. 
   These do not require immediate action but should be addressed as 
   part of routine property upkeep to maintain long-term reliability 
   and compliance confidence.
   ```

### Key Decision Signals 生成

根据 findings 计数动态生成：

```typescript
const signals = [];

if (immediateCount === 0) {
  signals.push("No immediate safety hazards detected");
} else {
  signals.push(`${immediateCount} immediate safety concern(s) requiring urgent attention`);
}

if (recommendedCount > 0) {
  signals.push(`${recommendedCount} recommended action(s) should be planned within 0-3 months`);
}

if (planCount > 0) {
  signals.push(`${planCount} item(s) identified for ongoing monitoring`);
}
```

### Financial Planning Snapshot

```typescript
const capexRange = computed.CAPEX_RANGE || "To be confirmed";
// 显示：**Estimated Capital Expenditure Range:** {capexRange}
```

---

## 模板要求

### Word 模板文件：`report-template-md.docx`

#### 必需占位符

**封面部分（6个）：**
- `{{INSPECTION_ID}}`
- `{{ASSESSMENT_DATE}}`
- `{{PREPARED_FOR}}`
- `{{PREPARED_BY}}`
- `{{PROPERTY_ADDRESS}}`
- `{{PROPERTY_TYPE}}`

**正文部分（1个）：**
- `{{REPORT_BODY_HTML}}` - **必需**，整个报告正文的 HTML 内容

#### 模板检查

代码会自动检查：
1. 模板文件是否存在
2. 是否包含 `{{REPORT_BODY_HTML}}` 占位符
3. 如果缺少，会抛出错误

#### 文件大小参考

- `report-template-md.docx`（正确）：约 19078 bytes
- `report-template.docx`（旧版）：约 111440 bytes

---

## 数据验证规则

### 字段验证

所有字段必须满足：

1. **类型检查**：所有字段必须是 `string` 类型
2. **非空检查**：不能是 `undefined` 或 `null`
3. **默认值**：如果无法获取值，使用 `DEFAULT_REPORT_TEXT.md` 中的默认值

### 验证流程

```typescript
// 1. 检查字段是否存在
if (!value) {
  value = defaultText[fieldName] || "";
}

// 2. 确保是字符串
if (typeof value !== "string") {
  value = String(value);
}

// 3. 最终检查
if (!value || value.trim() === "") {
  value = defaultText[fieldName] || "";
}
```

### Findings 验证

```typescript
// 确保 findings 数组存在
const findings = inspection.findings || [];

// 确保每个 finding 有必需的字段
findings.forEach(finding => {
  if (!finding.id) {
    throw new Error("Finding must have an id");
  }
  if (!finding.priority) {
    throw new Error("Finding must have a priority");
  }
});
```

---

## 配置文件

### responses.yml

**结构：**
```yaml
findings:
  FINDING_ID:
    title: "Finding Title"
    why_it_matters: "Why it matters text"
    recommended_action: "Recommended action text"
    planning_guidance: "Planning guidance text"
```

**用途：** 提供标准化的 findings 文本内容

### DEFAULT_REPORT_TEXT.md

**结构：**
```markdown
# Default Report Text

## INSPECTION_ID
Default inspection ID text

## ASSESSMENT_DATE
Default assessment date text
...
```

**用途：** 提供所有字段的默认值（Priority 3 兜底）

### EXECUTIVE_SUMMARY_TEMPLATES.md

**结构：**
```markdown
# Executive Summary Templates

## HIGH
High risk template text...

## MODERATE
Moderate risk template text...

## LOW
Low risk template text...
```

**用途：** 提供不同风险等级的执行摘要模板

---

## 错误处理

### 模板文件缺失

**错误：** `找不到 report-template-md.docx 模板文件`

**解决：**
1. 确保文件存在于 `netlify/functions/` 目录
2. 检查 `netlify.toml` 配置
3. 运行 `npm run copy-word-template-md`

### 占位符缺失

**错误：** `模板中未找到 {{REPORT_BODY_HTML}} 占位符`

**解决：**
1. 打开 `report-template-md.docx`
2. 在正文开始位置插入 `{{REPORT_BODY_HTML}}`
3. 确保占位符没有被拆分（使用 `fix-placeholders.ts` 修复）

### 数据缺失

**处理：** 自动使用 `DEFAULT_REPORT_TEXT.md` 中的默认值

---

## 调试和日志

### 开发环境日志

在开发环境中（`NETLIFY_DEV === "true"` 或 `NODE_ENV === "development"`），会输出：

1. **Findings counts：**
   ```javascript
   {
     immediate: X,
     recommended: Y,
     plan: Z,
     limitations: W
   }
   ```

2. **Markdown 预览**（前 1200 字符）

3. **HTML 预览**（前 1200 字符）

### 生产环境日志

- 模板文件路径
- 模板文件大小
- 占位符检查结果
- 报告生成状态

---

## 语言风格检查清单

### ✅ 必须使用（MUST）

- [ ] 中性、咨询性语调
- [ ] 投资者面向的语言
- [ ] "if not addressed" 逻辑
- [ ] 解释随时间推移的后果
- [ ] 指示性财务范围（非报价）
- [ ] 法律定位说明（风险未消除）

### ❌ 禁止使用（MUST NOT）

- [ ] 技术组件名称（在 Executive Summary 中）
- [ ] 标准引用（AS/NZS, RCBO 等，在 Executive Summary 中）
- [ ] 指令性语言（"should", "must", "recommended to"）
- [ ] 维修建议
- [ ] 承包商/电工/检查清单风格的语言
- [ ] 立即后果描述（应描述随时间推移的后果）

### 语言转换示例

#### ❌ 错误示例（技术性、指令性）

```
The RCD protection should be upgraded to meet AS/NZS 3000 requirements. 
The electrician must install new RCBO devices immediately to ensure compliance.
```

#### ✅ 正确示例（投资者面向、咨询性）

```
Current protection levels may require enhancement to align with contemporary 
standards. If not addressed, this could impact insurance coverage and compliance 
confidence over the next 12-24 months. This can be factored into normal asset 
planning cycles without immediate urgency.
```

---

## 最佳实践

### 1. 模板维护

- 使用 `report-template-md.docx` 作为主模板
- 保留 `report-template.docx` 作为备份
- 定期检查占位符是否被 Word 拆分

### 2. 配置文件管理

- 使用 Netlify Blob Storage 存储配置文件（生产环境）
- 本地开发时使用文件系统
- 定期备份配置文件

### 3. 测试

- 测试不同风险等级的报告生成
- 测试空 findings 的情况
- 测试缺失数据的情况
- 验证所有字段都有值

### 4. 部署检查

部署前检查：
- [ ] `report-template-md.docx` 存在
- [ ] `netlify.toml` 配置正确
- [ ] 所有配置文件已更新
- [ ] 构建脚本正常运行

---

## 相关文档

- `CURSOR_PROMPTS_STEP_BY_STEP.md` - 实施步骤
- `实施完成总结.md` - 实施总结
- `部署检查清单-模板文件.md` - 部署检查清单
- `免费替代方案说明.md` - 免费方案说明

---

## 更新日志

- **2026-01-30**: 创建文档，记录完整的报告生成规则
- **2026-01-30**: 添加风险评级规则和 Executive Summary 生成规则
- **2026-01-30**: 添加 Findings 格式化规则和模板要求
- **2026-01-30**: 添加非协商性规则（NON-NEGOTIABLE RULES）
  - 整体报告定位规则
  - Executive Summary 严格规则
  - Finding 页面结构规则
  - Thermal Imaging 规则
  - CapEx Roadmap 规则
  - 语言护栏规则
  - 法律定位规则
