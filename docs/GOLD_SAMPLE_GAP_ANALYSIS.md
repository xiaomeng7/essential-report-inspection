# Gold Sample vs 当前报告生成 - 差距分析

**分析日期**: 2026-01-31  
**Gold Sample 来源**: `Gold_Sample_Ideal_Report_Template.docx`  
**当前实现**: `netlify/functions/lib/buildReportMarkdown.ts`

---

## 执行摘要

### 当前实现的优势 ✅
- ✅ 已有完整的 pipeline (Canonical → Scoring → Markdown → HTML → DOCX)
- ✅ 已实现 Finding profiles with risk/budget/priority
- ✅ 已有 Executive Signals 生成逻辑
- ✅ 已有 CapEx roadmap 表格框架
- ✅ 已有照片证据规则和上传逻辑

### 核心差距 ❌
| 差距项 | 严重程度 | 影响 |
|--------|----------|------|
| "What this means for you" 章节缺失 | 🔴 高 | 投资者无法快速理解行动建议 |
| 4个决策路径简化为文本描述 | 🔴 高 | 缺少结构化选项 |
| Finding 风险叙事不完整 | 🟡 中 | "如果不解决会怎样" 逻辑不明确 |
| "如何阅读本报告" 指引缺失 | 🟡 中 | 用户体验降低 |
| CapEx 表格优先级显示混乱 | 🟡 中 | Urgent vs Budgetary 不够清晰 |

---

## 详细对比：章节级别

### 📖 第1章：How to read this report

#### Gold Sample 内容
```
这份报告旨在帮助您清晰自信地做出电气决策。
它分离了：(a) 观察到的内容，(b) 从风险角度的意义，(c) 财务规划。

实践中，大多数业主应该：
1. 首先阅读第4-5页（执行决策摘要 + 这对你意味着什么）
2. 使用 CapEx 路线图设定未来0-5年的实际预算
3. 只有在需要了解底层观察和照片时才阅读证据部分
```

#### 当前实现
```typescript
function buildPurposeSection(defaultText: any): string {
  // 只有 ASSESSMENT_PURPOSE 一段通用文本
  // 缺少"如何阅读"的指引
}
```

#### ✅ 解决方案
```typescript
function buildHowToReadSection(defaultText: any): string {
  return `
## How to Read This Report

This report is designed to help you make electrical decisions with clarity and confidence. 
It separates:
- **(a)** what was observed
- **(b)** what it means from a risk perspective
- **(c)** what to plan for financially

### Recommended Reading Order

Most owners should:
1. **Start with Pages 2-3** (Executive Decision Summary + What This Means)
2. **Use the CapEx Roadmap** to set a realistic budget provision for the next 0–5 years
3. **Read the Evidence section** only if you want the underlying observations and photos

${defaultText.HOW_TO_READ_ADDITIONAL || ""}
  `;
}
```

---

### 📊 第2章：Executive Decision Summary

#### Gold Sample 结构
```
2. Executive decision summary
   ├── Overall risk position (MODERATE + 解释)
   ├── Priority snapshot (3级表格)
   └── Total estimated CapEx provision (AUD range)
```

#### 当前实现
```typescript
function buildExecutiveSummarySection(computed, findings, defaultText) {
  // ✅ 已有 OVERALL_STATUS
  // ✅ 已有 EXECUTIVE_DECISION_SIGNALS
  // ✅ 已有 CAPEX_SNAPSHOT
  // ❌ 缺少 Priority snapshot 表格（3级优先级解释）
}
```

#### ❌ 当前缺失：Priority Snapshot 表格

Gold Sample:
```markdown
| Priority | Meaning | Investor interpretation |
|----------|---------|-------------------------|
| Urgent liability risk | Immediate action required | Do not defer. Treat as time-critical risk control. |
| Budgetary provision recommended | No active fault, but upgrade advisable | Plan into CapEx and schedule within window. |
| Monitor / Acceptable | No action required at this stage | Keep on watchlist; avoid unnecessary spend now. |
```

当前实现只有 Priority Overview（第4章），没有在 Executive Summary 里显示优先级定义。

---

### 🎯 第3章：What this means for you

#### Gold Sample 内容（核心章节！）
```
3. What this means for you
   ├── What requires action now (Urgent items)
   ├── What should be planned (Budgetary provision items)
   ├── What can wait (Monitor items)
   └── Decision confidence statement
```

**示例输出**：
```markdown
### What requires action now
No urgent liability risks identified.

### What should be planned (to avoid future disruption)
- Switchboard modernisation recommended within 12–24 months to improve protection (RCBO / RCD coverage).
- Standardise smoke alarm compliance and remaining service life across bedrooms within 6–18 months.

### What can wait (monitor)
- Some lighting circuits may lack RCD protection. This can be addressed during next renovation.

### Decision confidence statement
This report is intended to reduce decision uncertainty. If you obtain contractor quotes, you can use the observations and priorities here to challenge scope creep and avoid unnecessary upgrades.
```

#### ❌ 当前实现：**完全缺失这个章节！**

这是 Gold Sample 的**核心价值主张**，但当前报告没有这个章节。

#### ✅ 解决方案
```typescript
function buildWhatThisMeansSection(
  findings: Array<{ id: string; priority: string; title?: string }>,
  responses: Record<string, any>,
  defaultText: any
): string {
  // 按优先级分组
  const urgent = findings.filter(f => 
    f.priority === "IMMEDIATE" || 
    f.priority === "URGENT"
  );
  const budgetary = findings.filter(f => 
    f.priority === "RECOMMENDED_0_3_MONTHS" || 
    f.priority === "RECOMMENDED"
  );
  const monitor = findings.filter(f => 
    f.priority === "PLAN_MONITOR" || 
    f.priority === "PLAN"
  );

  const md: string[] = [];
  md.push("## What This Means for You");
  md.push("");
  
  // 1. What requires action now
  md.push("### What requires action now");
  if (urgent.length === 0) {
    md.push("No urgent liability risks identified.");
  } else {
    urgent.forEach(f => {
      const resp = responses.findings?.[f.id];
      const timeline = resp?.timeline || "immediately";
      md.push(`- ${f.title || f.id} should be addressed ${timeline}.`);
    });
  }
  md.push("");
  
  // 2. What should be planned
  md.push("### What should be planned (to avoid future disruption)");
  if (budgetary.length === 0) {
    md.push("No planned items identified at this time.");
  } else {
    budgetary.forEach(f => {
      const resp = responses.findings?.[f.id];
      const timeline = resp?.timeline || "within 12 months";
      const reason = resp?.why_it_matters || "to reduce future risk";
      md.push(`- ${f.title || f.id} recommended ${timeline} ${reason}.`);
    });
  }
  md.push("");
  
  // 3. What can wait
  md.push("### What can wait (monitor)");
  if (monitor.length === 0) {
    md.push("All identified items warrant planned attention.");
  } else {
    monitor.forEach(f => {
      md.push(`- ${f.title || f.id} can be addressed during next renovation or scheduled electrical works.`);
    });
  }
  md.push("");
  
  // 4. Decision confidence statement
  md.push("### Decision confidence statement");
  md.push(defaultText.DECISION_CONFIDENCE_STATEMENT || 
    "This report is intended to reduce decision uncertainty. If you obtain contractor quotes, you can use the observations and priorities here to challenge scope creep and avoid unnecessary upgrades.");
  md.push("");
  
  return md.join("\n");
}
```

---

### 🔬 第6章：Observations and evidence

#### Gold Sample 的 Finding 风险叙事结构

每个 Finding 包含：
```markdown
## Observed condition
Older board with limited modern protection.
RCBO protection not present on key circuits.

## Evidence
Photo: switchboard layout (Appendix).
No abnormal heat signature observed during thermal scan.

## Risk interpretation
The board was operational at the time of assessment. The primary risk is not 
an active fault, but **reduced fault protection and future failure likelihood** 
as components age. From an asset risk perspective, modernisation is best scheduled 
**proactively to avoid reactive call-outs** and to **improve safety margins**.

## Priority classification
Budgetary provision recommended (12–24 months). Not classified as urgent 
**because no active fault condition was detected** at the time of assessment.

## Budgetary range (planning only)
AUD $1,800–$2,800
```

#### 当前实现

```typescript
// netlify/functions/lib/generateFindingPages.ts
function generateFindingPage(finding, response, profile) {
  // ✅ 已有：Asset Component
  // ✅ 已有：Observed Condition
  // ✅ 已有：Evidence
  // ✅ 已有：Priority Classification
  // ✅ 已有：Budgetary Planning Range
  
  // ❌ Risk Interpretation 不够强：
  //    - 当前只有 why_it_matters (1句话)
  //    - 缺少 "如果不解决会怎样" 的升级路径描述
  //    - 缺少 "为什么不是更高优先级" 的解释
}
```

#### ⚠️ 差距：Risk Interpretation 不完整

Gold Sample 的 Risk Interpretation 包含：
1. ✅ 当前状态描述
2. ❌ **升级路径**（"if not addressed, could escalate to..."）
3. ❌ **优先级理由**（"Not classified as urgent because..."）
4. ❌ **投资者视角**（"From an asset risk perspective..."）

当前 `responses.yml` 中的 `why_it_matters` 只有1-2句话，不够详细。

---

### 📈 第8章：5-Year CapEx Roadmap

#### Gold Sample 表格结构
```markdown
| Asset item | Current condition | Priority | Suggested timeline | Budgetary range (AUD) |
|------------|-------------------|----------|--------------------|-----------------------|
| Main switchboard | Aged board; no RCBO; limited RCD | **Budgetary provision recommended** | 12–24 months | $1,800–$2,800 |
| Smoke alarms | Service life approaching; mixed types | **Budgetary provision recommended** | 6–18 months | $350–$650 |
| Lighting circuits | Some circuits without RCD | **Monitor / Acceptable** | Next renovation | $600–$1,200 |
| Loose GPO | One outlet with mechanical looseness | **Budgetary provision recommended** | 0–3 months | $180–$420 |
```

**关键特点**：
- Priority 列显示**完整的优先级名称**（不是缩写）
- Timeline 使用**月份范围**（不是 IMMEDIATE/URGENT）
- "Note" 行说明这是**预算基准，不是报价**

#### 当前实现

```typescript
function buildCapExRoadmapSection(computed, defaultText, findings, responses) {
  // ✅ 已有表格框架
  // ❌ Priority 显示不清晰（IMMEDIATE vs "Budgetary provision recommended"）
  // ❌ Timeline 混乱（有的是 "0-3 months"，有的是 "IMMEDIATE"）
  // ❌ 缺少 "Current condition" 列
}
```

#### ⚠️ 差距：优先级映射不规范

Gold Sample 只用3个优先级标签：
- **Urgent liability risk**
- **Budgetary provision recommended**
- **Monitor / Acceptable**

当前系统用4个：
- IMMEDIATE
- URGENT  
- RECOMMENDED_0_3_MONTHS / RECOMMENDED
- PLAN_MONITOR / PLAN

**需要映射规则**：
```typescript
function mapPriorityToInvestorLabel(priority: string): string {
  const upper = priority.toUpperCase();
  if (upper.includes("IMMEDIATE") || upper.includes("URGENT")) {
    return "Urgent liability risk";
  }
  if (upper.includes("RECOMMENDED")) {
    return "Budgetary provision recommended";
  }
  return "Monitor / Acceptable";
}
```

---

### 🛤️ 第9章：Decision Pathways

#### Gold Sample 的4个选项

```markdown
## Owner decision pathways

### Option A — Monitor only
Take no action now. Reassess in 12 months or at the next tenancy turnover.

### Option B — Planned upgrades
Budget and schedule the planned items within the suggested windows to reduce reactive maintenance.

### Option C — Independent rectification
Use this report to brief any contractor of your choice. Request itemised scope aligned to priorities.

### Option D — Management plan integration
Delegate coordination, quotation review, and completion verification to a management plan (Standard or Premium).
```

#### 当前实现

```typescript
function buildDecisionPathwaysSection(defaultText: any): string {
  // ❌ 只有4点文本描述
  // ❌ 没有 A/B/C/D 选项结构
  // ❌ 没有 "Management plan integration" 选项
  return `
1. Immediate Actions: Address all immediate safety concerns...
2. Short-term Planning: Plan and complete recommended actions...
3. Ongoing Monitoring: Monitor planning items...
4. Follow-up Assessment: Consider a follow-up assessment...
  `;
}
```

#### ⚠️ 差距：选项不是投资者导向

当前的4点是**技术人员视角**（"Address safety concerns", "Plan actions"），  
Gold Sample 的选项是**投资者/业主视角**（"Monitor only", "Planned upgrades", "Use this report to brief contractor", "Delegate to management plan"）。

---

## 📋 优先级清单：需要补充的功能

### 🔴 P0 - 关键缺失（影响报告定位）

1. **新增 "What This Means for You" 章节**
   - 按优先级分组显示 Findings
   - 明确 "What requires action now" / "What should be planned" / "What can wait"
   - 添加 Decision confidence statement

2. **重构 Decision Pathways 为4个投资者选项**
   - Option A: Monitor only
   - Option B: Planned upgrades
   - Option C: Independent rectification
   - Option D: Management plan integration

3. **增强 Risk Interpretation**
   - 添加 "如果不解决会怎样" 逻辑
   - 添加 "为什么不是更高优先级" 解释
   - 从资产管理视角叙述

### 🟡 P1 - 重要改进（提升专业度）

4. **新增 "How to Read This Report" 章节**
   - 阅读顺序指引
   - 报告结构说明
   - 使用建议

5. **Executive Summary 添加 Priority Snapshot 表格**
   - 3级优先级定义
   - 投资者解读

6. **规范 CapEx Roadmap 表格**
   - 添加 "Current condition" 列
   - 统一优先级显示为投资者标签
   - 时间线规范化（月份范围）

### 🟢 P2 - 优化（锦上添花）

7. **优化 Finding 标题格式**
   - 使用资产导向标题（"Main Switchboard" 而不是 "SWITCHBOARD_AGED"）

8. **增强默认文本库**
   - 为每个 Finding 添加完整的风险叙事模板
   - 为每个优先级添加标准解释

---

## 📊 实施复杂度评估

| 功能 | 代码量 | 难度 | 依赖 | 预估时间 |
|------|--------|------|------|----------|
| What This Means for You 章节 | ~100行 | 🟢 低 | Finding优先级分组 | 1-2小时 |
| Decision Pathways 重构 | ~80行 | 🟢 低 | 文本模板 | 1小时 |
| Risk Interpretation 增强 | ~150行 | 🟡 中 | responses.yml 更新 | 3-4小时 |
| How to Read 章节 | ~50行 | 🟢 低 | 文本模板 | 0.5小时 |
| Priority Snapshot 表格 | ~60行 | 🟢 低 | 优先级映射 | 1小时 |
| CapEx 表格规范化 | ~100行 | 🟡 中 | 优先级映射 + 时间线转换 | 2-3小时 |
| Finding 标题优化 | ~50行 | 🟢 低 | finding_profiles.yml | 1小时 |
| 默认文本库扩展 | ~200行 | 🟡 中 | responses.yml 批量更新 | 4-5小时 |

**总预估时间**：13.5 - 18.5 小时

---

## 🎯 推荐实施路径

### Phase 1: 核心章节补充（P0）
1. ✅ 新增 "What This Means for You" 章节
2. ✅ 重构 Decision Pathways
3. ✅ 增强 Risk Interpretation

**目标**：报告具备投资者决策支持定位

### Phase 2: 专业度提升（P1）
4. ✅ 新增 "How to Read This Report" 章节
5. ✅ Executive Summary 添加 Priority Snapshot
6. ✅ 规范 CapEx Roadmap 表格

**目标**：报告达到 Gold Sample 的专业标准

### Phase 3: 细节优化（P2）
7. ✅ Finding 标题优化
8. ✅ 默认文本库扩展

**目标**：报告输出稳定、一致、可预测

---

## 📝 下一步行动

1. **确认实施范围** - 选择 Phase 1 / Phase 1+2 / 全部
2. **更新 responses.yml** - 为 Risk Interpretation 准备模板
3. **更新 finding_profiles.yml** - 添加 asset_title 字段
4. **修改 buildReportMarkdown.ts** - 实施新章节
5. **更新 DEFAULT_TEXT_LIBRARY.md** - 添加新文案
6. **测试生成报告** - 对比 Gold Sample

---

**分析完成时间**: 2026-01-31  
**版本**: v1.0
