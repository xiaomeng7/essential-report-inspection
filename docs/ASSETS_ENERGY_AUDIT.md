# Assets / Energy 字段读取审计

本文档记录当前代码中 Solar / Battery / EV 相关字段的读取路径（用于 Step 0 基线审计）。

## 1) `energyMapper`（legacy mapper）

文件：`netlify/functions/lib/reportEngine/inputMappers/energyMapper.ts`

- EV：
  - `ev_charger_present`
  - `job.ev`
  - `loads.ev_charger`
- Solar：
  - `solar_present`
  - `job.solar`
  - `loads.solar`
- Battery：
  - `battery_present`
  - `job.battery`
  - `loads.battery`

## 2) `extractSnapshotSignals`（snapshot 信号）

文件：`netlify/functions/lib/report/extractSnapshotSignals.ts`

- EV：
  - `snapshot_intake.hasEv`
  - `snapshot.hasEv`
  - `lead.hasEv`
  - `client.hasEv`
  - `ev_charger_present`
  - `job.ev`
  - `loads.ev_charger`
- Solar：
  - `snapshot_intake.hasSolar`
  - `snapshot.hasSolar`
  - `lead.hasSolar`
  - `client.hasSolar`
  - `solar_present`
  - `job.solar`
  - `loads.solar`
- Battery：
  - `snapshot_intake.hasBattery`
  - `snapshot.hasBattery`
  - `lead.hasBattery`
  - `client.hasBattery`
  - `battery_present`
  - `job.battery`
  - `loads.battery`

## 3) 结论（现状问题）

- 资产能源字段分散在 `snapshot_intake` / `loads.*` / `job.*` / 顶层 `*_present`。
- 各处有重复读取逻辑，缺少统一 canonical 入口。
- 当前路径覆盖了你要求的 `job/loads` 兼容源，但尚未统一归位到 `raw.assets_energy.*`。
