# Findings 格式化扩展说明

## 📋 概述

扩展了 `formatFindingWithDetails()` 函数，使其能够使用 `responses.yml` 中的所有字段，并根据 `finding.priority` 智能组合成段落。

## 🎯 使用的字段

从 `responses.yml` 的 `findings[FINDING_CODE]` 中使用以下字段：

1. **title** - 标题（必需，总是使用）
2. **why_it_matters** - 为什么重要
3. **recommended_action** - 推荐行动
4. **planning_guidance** - 规划指导

## 🔄 根据 Priority 的格式化逻辑

### IMMEDIATE（紧急）

**格式：**
```
[Title]

Why it matters: [why_it_matters]

Recommended action: [recommended_action]

Planning guidance: [planning_guidance] (如果可用)
```

**特点：**
- 强调 `why_it_matters` 和 `recommended_action`（紧急情况）
- `planning_guidance` 作为补充信息（如果可用）

**示例：**
```
MEN Link Not Verified

Why it matters: The MEN link is critical for electrical safety and must be verified to ensure proper earthing.

Recommended action: Have a licensed electrician verify and test the MEN link immediately.

Planning guidance: This should be addressed as soon as possible, typically within 24-48 hours.
```

### RECOMMENDED_0_3_MONTHS（推荐，0-3个月）

**格式：**
```
[Title]

Why it matters: [why_it_matters]

Recommended action: [recommended_action]

Planning guidance: [planning_guidance]
```

**特点：**
- 包含所有字段
- 强调 `recommended_action` 和 `planning_guidance`（短期规划）

**示例：**
```
Partial RCD Coverage

Why it matters: Incomplete RCD protection may leave some circuits vulnerable to electrical faults.

Recommended action: Install additional RCD protection to cover all circuits.

Planning guidance: This can be planned with other electrical works to minimise disruption.
```

### PLAN_MONITOR（计划监控）

**格式：**
```
[Title]

Why it matters: [why_it_matters]

Planning guidance: [planning_guidance]

Recommended action: [recommended_action]
```

**特点：**
- 强调 `planning_guidance`（长期规划）
- 包含 `why_it_matters` 和 `recommended_action` 作为参考

**示例：**
```
Legacy Earthing System

Why it matters: Older earthing systems may not meet current standards but may still function adequately.

Planning guidance: Monitor during routine inspections and plan upgrade during major renovations.

Recommended action: Consider upgrading to modern earthing standards during future electrical works.
```

## 📊 字段使用优先级

| Priority | Title | Why it matters | Recommended action | Planning guidance |
|----------|-------|----------------|-------------------|-------------------|
| IMMEDIATE | ✅ 必需 | ✅ 强调 | ✅ 强调 | ⚠️ 可选 |
| RECOMMENDED_0_3_MONTHS | ✅ 必需 | ✅ 包含 | ✅ 强调 | ✅ 强调 |
| PLAN_MONITOR | ✅ 必需 | ✅ 包含 | ⚠️ 参考 | ✅ 强调 |

## 🔧 实现细节

### 代码位置

`netlify/functions/generateWordReport.ts` 的 `buildWordTemplateData()` 函数中的 `formatFindingWithDetails()` 函数。

### 格式化流程

1. **获取 finding code**：使用 `finding.id` 作为 key
2. **查找 responses.yml**：在 `findingsMap[findingCode]` 中查找响应
3. **获取 title**：优先使用 `findingResponse.title`，后备 `finding.title` 或 `findingCode`
4. **根据 priority 组合字段**：
   - IMMEDIATE: why_it_matters → recommended_action → planning_guidance
   - RECOMMENDED_0_3_MONTHS: why_it_matters → recommended_action → planning_guidance
   - PLAN_MONITOR: why_it_matters → planning_guidance → recommended_action
5. **拼接成段落**：使用双换行符分隔各部分

### 输出格式

每个 finding 的格式：
```
• [Title]

Why it matters: [内容]

Recommended action: [内容]

Planning guidance: [内容]
```

多个 findings 之间使用双换行符分隔：
```
• Finding 1...

• Finding 2...
```

## 📝 示例输出

### IMMEDIATE_FINDINGS

```
• MEN Link Not Verified

Why it matters: The MEN link is critical for electrical safety and must be verified to ensure proper earthing.

Recommended action: Have a licensed electrician verify and test the MEN link immediately.

• No RCD Protection

Why it matters: RCD protection is required by Australian standards to prevent electric shock.

Recommended action: Install RCD protection on all circuits immediately.
```

### RECOMMENDED_FINDINGS

```
• Partial RCD Coverage

Why it matters: Incomplete RCD protection may leave some circuits vulnerable to electrical faults.

Recommended action: Install additional RCD protection to cover all circuits.

Planning guidance: This can be planned with other electrical works to minimise disruption.

• Board at Capacity

Why it matters: A switchboard at capacity may limit future expansion and increase fire risk.

Recommended action: Upgrade switchboard to provide additional capacity.

Planning guidance: Plan upgrade during next major electrical works or renovation.
```

### PLAN_FINDINGS

```
• Legacy Earthing System

Why it matters: Older earthing systems may not meet current standards but may still function adequately.

Planning guidance: Monitor during routine inspections and plan upgrade during major renovations.

Recommended action: Consider upgrading to modern earthing standards during future electrical works.

• Labeling Poor

Why it matters: Poor labeling makes it difficult to identify circuits during maintenance or emergencies.

Planning guidance: Improve labeling during routine maintenance or when circuits are modified.

Recommended action: Update circuit labels to current standards.
```

## ✅ 优势

1. **完整信息**：使用所有可用字段，提供更详细的 finding 描述
2. **智能格式化**：根据 priority 调整字段顺序和重点
3. **易于阅读**：清晰的段落结构，便于理解
4. **灵活性**：如果某个字段不存在，自动跳过，不影响其他字段

## 🔄 数据流

```
inspection.findings
    ↓
forEach finding
    ↓
formatFindingWithDetails(finding)
    ↓
根据 finding.priority 选择字段组合
    ↓
拼接成段落
    ↓
根据 priority 分组到：
  - IMMEDIATE → IMMEDIATE_FINDINGS
  - RECOMMENDED_0_3_MONTHS → RECOMMENDED_FINDINGS
  - PLAN_MONITOR → PLAN_FINDINGS
    ↓
Word 文档占位符
```

## 📦 相关文件

- `netlify/functions/generateWordReport.ts` - 主实现文件
- `responses.yml` - 数据源文件
- `DEFAULT_REPORT_TEXT.md` - 默认文本（当没有 findings 时使用）
