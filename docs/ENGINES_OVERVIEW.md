# ENGINES_OVERVIEW

## 总体原则

- Baseline 引擎 Always-run（不依赖 modules/profile）。
- Enhanced 引擎按数据存在触发（circuits/tariff/unknown high draw）。
- Profile 只做展示过滤，不参与采集与计算开关。

## Engine 列表

### 1) BaselineLoadEngine

- 文件：`netlify/functions/lib/reportEngine/baselineLoadEngine.ts`
- 输入：`extractBaselineLoadSignals(raw)`
- 触发：Always-run
- 输出：
  - finding: `LOAD_STRESS_TEST_RESULT`（无证据也给 insufficient 版本）
  - executive: 固定格式
    - `Peak load: {peakKW} kW ({peakA} A) • Stress: {stressLevel} • Headroom: {headroomText}`
    - 无证据：`Baseline load evidence: insufficient — recommended to complete stress test`
  - capex: 高压力时 capacity planning review

### 2) EnhancedEnergyEngine

- 文件：`netlify/functions/lib/reportEngine/enhancedEnergyEngine.ts`
- 输入：`extractEnhancedCircuits(raw)` + optional baseline metrics
- 触发（任一）：
  - `circuits.length >= 2`
  - tariff 有值
  - `unknown high draw` 标记
- 输出：
  - findings: `CIRCUIT_CONTRIBUTION_BREAKDOWN`, `ESTIMATED_COST_BAND`, optional `CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION`
  - capex: 按 top contributor category 生成 2~3 行
  - executive/wtm: contributor + cost band 说明
  - `ESTIMATED_COST_BAND` 固定三段结构：
    - `What we measured`
    - `Assumptions used (tariff, supply, avg factors)`
    - `What you can do next`
  - tariff 来源标注：
    - `customer provided` / `default estimate`
  - avg factors 参数化：
    - 默认 `0.25 / 0.35`
    - 可由环境变量覆盖（`ENERGY_AVG_FACTOR_LOW` / `ENERGY_AVG_FACTOR_TYP`）

### 3) DistributedEnergyAssetsEngine

- 文件：`netlify/functions/lib/reportEngine/distributedEnergyAssetsEngine.ts`
- 输入：`extractAssetsEnergy(raw)` + baseline stress level
- 触发：Always-run（轻量）
- 输出：
  - executive: 固定格式
    - `Energy assets — Solar: ... • Battery: ... • EV: ...`
  - findings:
    - `DISTRIBUTED_ENERGY_ASSETS_OVERVIEW`
    - `EV_SOLAR_BATTERY_READINESS_NOTE`
    - `CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION`（触发式）
  - 触发条件：
    - readiness: `stress high/critical AND (hasEv=true/unknown OR planned upgrade signal)`
    - monitoring: `stress high/critical OR (assets present AND circuits coverage insufficient)`

## Preflight QA（警告，不拦截）

- 文件：`netlify/functions/lib/report/preflight/assertReportInputs.ts`
- 规则：
  - baseline 缺电压或电流 -> `baseline_insufficient=true`
  - enhanced `circuits<2` 且无 tariff -> `enhanced_insufficient=true`
  - assets coverage unknown -> 仅允许在 `stress high/critical` 触发 readiness
- 输出：
  - `[report-preflight] { warnings, flags }`
  - 同时写入 `plan.debug.preflight`（便于测试）

### 4) Existing Modules（兼容）

- `safety/capacity/lifecycle` 仍走现有 module loop。
- `energy` 模块保留兼容入口，但主增强路径由 `EnhancedEnergyEngine` 统一执行。
