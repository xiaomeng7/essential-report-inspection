# Assets Energy Rules

## 字段定义（canonical）

- `raw.assets_energy.hasSolar?: boolean`
- `raw.assets_energy.hasBattery?: boolean`
- `raw.assets_energy.hasEv?: boolean`
- `raw.assets_energy.coverage?: "declared" | "observed" | "unknown"`
- `raw.assets_energy.sources?: { hasSolar?: string; hasBattery?: string; hasEv?: string }`

## 提取优先级

1. 优先读取 `raw.assets_energy.*`
2. 若不存在，回退 legacy 路径：
   - EV: `loads.ev_charger` / `job.ev` / `ev_charger_present`
   - Solar: `loads.solar` / `job.solar` / `solar_present`
   - Battery: `loads.battery` / `job.battery` / `battery_present`

## 布尔归一化

以下值视为 `true`：`true/yes/1/on/present/installed`  
以下值视为 `false`：`false/no/0/off/none/absent`  
其余视为 `undefined`（未知）。

## coverage 规则

- 命中路径包含 `assets_energy.` / `loads.` / `job.` -> `declared`
- 无有效来源 -> `unknown`
- 其他路径 -> `observed`

## Always-Run 引擎触发规则

引擎：`distributedEnergyAssetsEngine`（总是运行，不受 modules 选择影响）

固定 findings keys：
- `DISTRIBUTED_ENERGY_ASSETS_OVERVIEW`
- `EV_SOLAR_BATTERY_READINESS_NOTE`
- `CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION`

触发条件：
- `DISTRIBUTED_ENERGY_ASSETS_OVERVIEW`
  - 仅 `owner` profile 显示
- `EV_SOLAR_BATTERY_READINESS_NOTE`
  - `stressLevel in {high, critical}` 且 `hasEv !== false`（planned/unknown）
- `CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION`
  - `hasSolar || hasBattery || hasEv` 且 `stressLevel in {high, critical}`

## Profile 展示规则

- `investor`
  - 保留 executive summary line（资产存在摘要）
  - 隐藏 overview 卡
  - readiness note 在触发时可显示
- `owner`
  - 显示 overview 卡
  - readiness / monitoring justification 按触发条件显示

## 兼容性说明

- 不改 Word 模板；
- 不改注入链路：`plan.merged -> applyMergedOverrides -> inject_*`；
- `raw.assets_energy` 仅在提交阶段缺失时补写，不覆盖已有值。
