# PROFILE_RENDER_RULES

## 目标

Profile Renderer 只负责展示过滤/重排，不做计算，不影响技师采集与引擎运行。

## 实现位置

- 文件：`netlify/functions/lib/reportEngine/profileRenderer.ts`
- 接入点：`buildReportPlan` 合并后、注入前

## Investor vs Owner 规则（finding key 级别）

| Finding Key | Owner | Investor |
|---|---|---|
| `LOAD_STRESS_TEST_RESULT` | 保留 | 保留 |
| `CIRCUIT_CONTRIBUTION_BREAKDOWN` | 保留 | 隐藏 |
| `ESTIMATED_COST_BAND` | 保留 | 隐藏 |
| `DISTRIBUTED_ENERGY_ASSETS_OVERVIEW` | 保留 | 隐藏 |
| `EV_SOLAR_BATTERY_READINESS_NOTE` | 触发时保留 | 触发时可保留 |
| `CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION` | 触发时保留 | 触发时可保留 |

## Executive 固定可见项

- Investor / Owner 均保留 baseline executive line（`baseline.exec.load`）：
  - `Peak load: ...`
  - 或 `Baseline load evidence: insufficient — recommended to complete stress test`
- Investor 在 executive 中保留 assets summary line：
  - `Energy assets — Solar: ... • Battery: ... • EV: ...`

## 触发条件（来源于 Engine）

- `EV_SOLAR_BATTERY_READINESS_NOTE`
  - `stressLevel in {high, critical}` AND
  - `(hasEv=true/unknown OR planned upgrade signal)`
  - 当 assets coverage 为 `unknown` 时，仅在 `stressLevel in {high,critical}` 保留
- `CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION`
  - `stressLevel in {high, critical}` OR
  - `(hasSolar/hasBattery/hasEv 任一 present AND circuits coverage != measured)`

## 顺序策略

- Owner：优先 baseline/asset 再 enhanced（稳定排序权重）。
- Investor：按过滤后原有稳定排序输出。

## 兼容性

- 不改 `applyMergedOverrides` 与 `inject_*` 机制。
- 关闭注入时，`plan.merged` 仍可用于 shadow/telemetry。
