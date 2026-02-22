# Snapshot 2.0 字段 Contract

本文定义 Snapshot 双路径前端提交到后端后，进入 `raw.snapshot_intake` 的标准字段，供自动选模块与报告分流使用。

## 1) 字段清单

- `profile`: `"owner" | "investor" | "tenant"`（兼容映射后可保留 owner/investor/tenant）
- `profileDeclared`: `"owner" | "investor" | "unsure"`（用户声明路径）
- `primaryGoal`: `"risk" | "energy" | "balanced" | "reduce_bill" | "reduce_risk" | "plan_upgrade"`
- `tenantChangeSoon`: `boolean`
- `managerMode`: `string`（建议值：`self`/`pm`/`both`）
- `portfolioSizeBand`: `string`（例如 `1`/`2-3`/`4+`）
- `billBand`: `string`（例如 `< $2,000`/`$2,000–$4,000`/`$4,000–$6,000`/`> $6,000`）
- `billUploadWilling`: `boolean`
- `allElectricNoGas`: `boolean`
- `devices`: `string[]`（建议编码：`solar`,`battery`,`ev`,`heat_pump`,`electric_cooking`）
- `symptoms`: `string[]`（建议编码：`tripping`,`hot_switch`,`bill_spike`,`unknown_usage`）
- `hasSolar`: `boolean`
- `hasBattery`: `boolean`
- `hasEv`: `boolean`

## 2) 推荐入库结构

```json
{
  "raw": {
    "snapshot_intake": {
      "profile": "owner",
      "profileDeclared": "unsure",
      "primaryGoal": "energy",
      "tenantChangeSoon": false,
      "managerMode": "self",
      "portfolioSizeBand": "1",
      "billBand": "$4,000–$6,000",
      "billUploadWilling": true,
      "allElectricNoGas": true,
      "devices": ["solar", "battery"],
      "symptoms": ["bill_spike", "unknown_usage"],
      "hasSolar": true,
      "hasBattery": true,
      "hasEv": false
    }
  }
}
```

## 3) 后端接收要求

- 不更改提交 URL 与事件名，仅扩展 payload 字段。
- 若接收端有白名单/Schema，需将以上字段加入允许列表。
- 若 `hasSolar/hasBattery/hasEv` 未显式提供，可由 `devices[]` 派生。
- 保留原始值，不在接收端做业务裁剪（下游抽取层统一归一化）。

## 4) 与报告引擎对接点

- 抽取：`netlify/functions/lib/report/extractSnapshotSignals.ts`
- 归一化：`netlify/functions/lib/report/snapshotContract.ts`
- 选型：`netlify/functions/lib/report/resolveReportSelection.ts`

已支持：

- 读取 `profileDeclared` / `billBand` / `billUploadWilling` / `tenantChangeSoon` / `managerMode` / `devices` / `symptoms`
- owner 或 `primaryGoal=energy` 时保证包含 `energy` 模块
- investor 且 `tenantChangeSoon=true` 时权重偏向 risk/balanced（`lifecycle` 权重提升）
