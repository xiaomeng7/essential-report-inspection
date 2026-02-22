# FRONTEND_WIZARD_DATA_MAP

## 1) Wizard step/组件总览

- 主组件：`src/components/Wizard.tsx`
- 步骤定义：`src/lib/inspectionBlocks.ts` (`WIZARD_PAGES`)
- 动态表单渲染：`src/components/SectionForm.tsx` + `FieldRenderer`
- 状态管理：`src/hooks/useInspection.ts`
  - `setAnswer(key, { value, status })`
  - `getValue(key)` / `getAnswer(key)`

---

## 2) 核心页面到数据 key 映射

### A. 通用检查页面（由 fieldDictionary 驱动）

- 页面顺序来自 `WIZARD_PAGES`
- section 字段 key 由 `fieldDictionary` 定义
- 示例：
  - `S2_MAIN_SWITCH` -> `switchboard.main_switch_rating`
  - `S5A_MEASURED_DATA` -> `measured.*`
  - `S9_SOLAR_BATTERY_EV` -> `assets.*`

### B. Snapshot Intake（Wizard start screen 增加）

写入 key：

- `snapshot_intake.occupancyType`
- `snapshot_intake.primaryGoal`
- `snapshot_intake.hasEv`
- `snapshot_intake.hasSolar`
- `snapshot_intake.hasBattery`
- `snapshot_intake.concerns`
- `snapshot_intake.contact.name/phone/email/address`

### C. Energy Stress Test v2（Wizard start screen 增加）

写入 key：

- supply:
  - `energy_v2.supply.phaseSupply`
  - `energy_v2.supply.voltageV`
  - `energy_v2.supply.voltageL1V/L2V/L3V`
  - `energy_v2.supply.mainSwitchA`
- stress test:
  - `energy_v2.stressTest.performed`
  - `energy_v2.stressTest.durationSec`
  - `energy_v2.stressTest.totalCurrentA`
  - `energy_v2.stressTest.currentA_L1/L2/L3`
  - `energy_v2.stressTest.notTestedReasons`
- circuits:
  - `energy_v2.circuits[]`（可重复行）
    - `label`
    - `category`
    - `measuredCurrentA`
    - `evidenceCoverage`
- enhanced skip reason:
  - `energy_v2.enhancedSkipReason.code`
  - `energy_v2.enhancedSkipReason.note`
- tariff:
  - `energy_v2.tariff.rate_c_per_kwh`
  - `energy_v2.tariff.supply_c_per_day`

交互策略：

- Baseline 区块默认展开（必填主流程）
- Enhanced Circuits 区块默认折叠（渐进式填写）
- 提供 `Skip Enhanced (record reason)` 按钮，仅扩展 `raw.energy_v2` 字段，不改提交接口

---

## 3) submit 序列化路径（state -> payload -> raw）

### 前端 submit

文件：`src/components/Wizard.tsx` -> `submitInspection()`

- `payload = { created_at, ...rest, _issue_details_meta }`
- `rest` 来源：`useInspection().state`
- 发送：`POST /api/submitInspection`

### 后端归一化

文件：`netlify/functions/submitInspection.ts`

- `raw = prepareSubmissionRaw(raw)`
  - `raw.snapshot_intake = normalizeSnapshotIntake(raw)`
  - `raw.energy_v2 = normalizeEnergyV2(raw)`

### 持久化

- Blobs：`store.save(inspection_id, { raw, ... })`
- DB：`upsertInspectionCore({ raw_json: raw, ... })`

---

## 4) 与报告引擎的衔接

- `generateWordReport` 读取 `inspection.raw`
- `extractSnapshotSignals(raw)` 读取 `snapshot_intake`（并兼容历史路径）
- `energyMapperV2(raw)` 优先读取 `energy_v2`（并兼容 legacy）
- 最终进入 `buildReportPlan -> plan.merged -> applyMergedOverrides`
