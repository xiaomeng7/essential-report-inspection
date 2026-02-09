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

---

## DATA_SOURCE_MODE 配置

### 概述

`DATA_SOURCE_MODE` 环境变量控制 finding messages 和 effective finding data 的数据源选择策略。这允许在生产环境中强制使用数据库，同时在开发环境中保持 YAML fallback 的灵活性。

### 支持的模式

#### `db_only`
- **行为**: 仅从数据库读取，不使用 YAML fallback
- **错误处理**: 如果数据库缺失或记录未找到，抛出明确的错误
- **用途**: 生产环境，确保所有数据来自数据库
- **日志**: 记录模式、语言、来源（db），以及缺失数据错误

#### `db_prefer` (默认)
- **行为**: 优先从数据库读取，如果数据库不可用或记录未找到，回退到 YAML
- **错误处理**: 数据库错误时回退到 YAML，不抛出错误
- **用途**: 开发环境默认，提供灵活性
- **日志**: 记录模式、语言、来源（db/yaml）

#### `yml_only`
- **行为**: 仅从 YAML 读取，忽略数据库（即使已配置）
- **错误处理**: YAML 缺失时返回 null
- **用途**: 测试或本地开发，无需数据库连接
- **日志**: 记录模式、语言、来源（yaml）

### 默认行为

- **生产环境** (`CONTEXT === 'production'` 或 `NODE_ENV === 'production'`): 默认 `db_only`
- **开发环境**: 默认 `db_prefer`

### 配置方法

#### Netlify 环境变量
在 Netlify 仪表板中设置：
```
DATA_SOURCE_MODE=db_only
```

#### 本地开发 (.env)
```bash
# 强制使用数据库
DATA_SOURCE_MODE=db_only

# 或使用 YAML fallback（默认）
DATA_SOURCE_MODE=db_prefer

# 或仅使用 YAML
DATA_SOURCE_MODE=yml_only
```

### 生产环境推荐设置

**推荐**: `DATA_SOURCE_MODE=db_only`

**原因**:
1. **数据一致性**: 确保所有报告使用数据库中的最新数据
2. **可追溯性**: 所有数据变更通过数据库版本控制
3. **性能**: 避免 YAML 文件解析开销
4. **错误检测**: 缺失数据会立即抛出错误，便于发现问题

**前提条件**:
- 确保 `finding_messages` 表已通过 `npm run db:seed:messages` 填充
- 确保数据库连接稳定
- 监控错误日志，及时发现缺失数据

### 应用范围

当前 `DATA_SOURCE_MODE` 应用于：

1. **Finding Messages** (`netlify/functions/lib/getFindingMessage.ts`):
   - `getFindingMessage()` - 单个消息查找
   - `getFindingMessagesBatch()` - 批量消息查找

2. **Effective Finding Data** (可选，未来扩展):
   - `getEffectiveFinding()` - 单个 finding 完整数据
   - `getEffectiveFindingIndex()` - 所有 findings 索引

### 测试

运行测试脚本验证各模式行为：

```bash
# 测试 db_only 模式
DATA_SOURCE_MODE=db_only tsx scripts/test-data-source-mode.ts

# 测试 db_prefer 模式
DATA_SOURCE_MODE=db_prefer tsx scripts/test-data-source-mode.ts

# 测试 yml_only 模式
DATA_SOURCE_MODE=yml_only tsx scripts/test-data-source-mode.ts
```

### 调试日志

开发模式下，所有消息查找都会记录：
```
[getFindingMessage] mode=db_only lang=en-AU finding_id=ALARM_SOUNDED source=db
[getFindingMessage] mode=db_prefer lang=en-AU finding_id=ALARM_SOUNDED source=yaml
```

生产模式下，仅在 `db_only` 模式下记录错误：
```
[getFindingMessage] db_only mode: No message found in DB for finding_id=ALARM_SOUNDED, lang=en-AU
```

### 迁移指南

从 YAML-only 迁移到数据库：

1. **准备数据库**:
   ```bash
   npm run db:migrate
   npm run db:seed:messages
   ```

2. **测试阶段** (使用 `db_prefer`):
   ```bash
   DATA_SOURCE_MODE=db_prefer
   ```
   验证报告生成正常，检查日志确认数据来源

3. **生产部署** (切换到 `db_only`):
   ```bash
   DATA_SOURCE_MODE=db_only
   ```
   监控错误日志，确保所有 findings 都有数据库记录
