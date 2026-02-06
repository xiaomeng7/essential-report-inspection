# 数据源架构说明

## 当前数据源分布

### 1. `rules.yml` (32个findings)
**用途**: 优先级计算逻辑 + 部分findings的safety/urgency/liability覆盖
- `base_priority_matrix`: 优先级计算规则
- `liability_adjustment`: 责任调整规则
- `hard_overrides`: 硬覆盖（12个findings）
- `findings`: 部分findings的safety/urgency/liability（32个）

**问题**: 与`finding_profiles.yml`中的字段重复

### 2. `finding_profiles.yml` (149个findings) ⭐ **权威数据源**
**用途**: 所有findings的完整9维度数据
- `safety`: HIGH/MODERATE/LOW
- `urgency`: IMMEDIATE/SHORT_TERM/LONG_TERM
- `liability`: HIGH/MEDIUM/LOW
- `priority`: IMMEDIATE/RECOMMENDED_0_3_MONTHS/PLAN_MONITOR
- `severity`: 1-5
- `likelihood`: 1-5
- `escalation`: HIGH/MODERATE/LOW
- `budgetary_range`: {low, high}

**状态**: ✅ 所有149个findings的9维度已完整填充

### 3. `responses.yml` (69个findings)
**用途**: 报告文本模板 + 部分findings的budgetary_range和default_priority
- `title`: 报告标题
- `why_it_matters`: 为什么重要
- `recommended_action`: 推荐行动
- `budgetary_range`: {low, high} (与finding_profiles.yml重复)
- `default_priority`: 默认优先级 (与finding_profiles.yml重复)

**问题**: budgetary_range和default_priority与`finding_profiles.yml`重复

## 数据流向

```
rules.yml (32 findings)
    ↓ (优先级计算逻辑)
    ↓ (safety/urgency/liability覆盖)
    
finding_profiles.yml (149 findings) ⭐ 权威数据源
    ↓ (9维度数据)
    ↓
buildDimensionsData() → Admin页面显示

responses.yml (69 findings)
    ↓ (报告文本)
    ↓ (budgetary_range/default_priority - 已废弃，应使用finding_profiles.yml)
    ↓
报告生成
```

## 统一方案

### 方案A: 统一到`finding_profiles.yml`（推荐）

**优点**:
- 单一数据源，避免数据不一致
- 所有149个findings都有完整数据
- 易于维护

**实施步骤**:
1. ✅ 已完成：所有9维度数据已填充到`finding_profiles.yml`
2. 更新`buildDimensionsData`：优先从`finding_profiles.yml`读取
3. 更新`rules.yml`：移除findings定义，只保留计算逻辑
4. 更新`responses.yml`：移除budgetary_range和default_priority，只保留文本字段

### 方案B: 自动同步脚本

如果必须保持三个文件，创建自动同步脚本：
- 从`finding_profiles.yml`同步到`rules.yml`（32个findings）
- 从`finding_profiles.yml`同步到`responses.yml`（69个findings）

## 当前优先级（buildDimensionsData）

```typescript
safety: rules.yml → finding_profiles.yml
urgency: rules.yml → finding_profiles.yml ✅ 已修复
liability: rules.yml → finding_profiles.yml ✅ 已修复
priority: finding_profiles.yml → responses.yml
severity: finding_profiles.yml
likelihood: finding_profiles.yml
escalation: finding_profiles.yml
budget: responses.yml → finding_profiles.yml ✅ 已修复
```

## 建议

1. **短期**: 保持当前架构，但确保`finding_profiles.yml`是权威数据源
2. **中期**: 创建自动同步脚本，确保数据一致性
3. **长期**: 统一到`finding_profiles.yml`，`rules.yml`只保留计算逻辑，`responses.yml`只保留文本字段
