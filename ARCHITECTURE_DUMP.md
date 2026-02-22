# ARCHITECTURE_DUMP

## A) 报告生成 Call-Graph（文件 + 函数 + I/O）

### 1. 入口与参数解析

- 入口：`netlify/functions/generateWordReport.ts` -> `handler(event)`
- 解析来源：
  - `inspection_id`：`query` 或 `POST body`
  - profile/modules override：`parseProfile` / `parseModules`
  - 注入开关：`report_engine_injection_mode` + `inject_*`
- 输出：HTTP（docx 文件流 / 错误 JSON）

### 2. inspection 读取（Blobs/缓存）

- 读取函数：`netlify/functions/lib/store.ts` -> `get(id, event, strongRead?)`
- 在 `generateWordReport` 中：
  - 先 `get(inspection_id, event, true)`（strong）
  - 再 fallback `get(inspection_id, event)`（eventual + cache）
- `StoredInspection` 主结构：`inspection_id / raw / findings / limitations / report_html`

### 3. profile/modules 选择

- 信号抽取：`netlify/functions/lib/report/extractSnapshotSignals.ts` -> `extractSnapshotSignals(raw)`
- 选择决策：`netlify/functions/lib/report/resolveReportSelection.ts` -> `resolveReportSelection(snapshotSignals, overrides)`
- 优先级：`request override > snapshot auto > legacy_fallback(investor)`

### 4. 构建 plan

- 桥接入口：`netlify/functions/lib/reportEngine/engine.ts` -> `buildTemplateDataWithLegacyPath(request, legacyBuilder)`
  - 先执行 legacy builder（现有 reportData）
  - 同时执行 `buildReportPlan(request)` 得到 `plan`
- `buildReportPlan` I/O：
  - 输入：`ReportRequest { inspection, profile?, modules?, options? }`
  - 输出：`ReportPlan`
    - `profile/modules`
    - `summaryFocus/whatThisMeansFocus/capexRows/findingsBlocks`
    - `merged.{executiveSummary,whatThisMeans,capexRows,findings}`

### 5. merged 覆盖注入

- 函数：`netlify/functions/lib/reportEngine/injection/applyMergedOverrides.ts` -> `applyMergedOverrides(templateData, plan, options)`
- 结果：
  - `templateData`（被覆盖后的 slot 值）
  - `slotSourceMap`（每个 slot 是 `legacy` 还是 `merged` 及 reason）
  - `injection`（最终注入 flags）

### 6. Markdown/HTML/DOCX 渲染链路

- 结构化组装：`netlify/functions/lib/buildReportMarkdown.ts` -> `buildStructuredReport(...)`
- slot 渲染：`renderReportFromSlots(structuredReport)` -> Markdown
- HTML 转换：`netlify/functions/lib/markdownToHtml.ts` -> `markdownToHtml(markdown)`
- DOCX 渲染：
  - 主流程：`netlify/functions/lib/renderDocx.ts` -> `renderDocx(...)`
  - 核心：`renderDocxByMergingCoverAndBody(...)`（docxtemplater + html-to-docx + merge）

---

## B) 模板槽位 / 注入点清单

注入统一入口：`applyMergedOverrides.ts`  
消费入口：`buildStructuredReport` + `renderReportFromSlots` + `renderDocx`

核心 slot keys：

- `WHAT_THIS_MEANS_SECTION`
- `EXECUTIVE_DECISION_SIGNALS`
- `EXEC_SUMMARY_TEXT`（alias）
- `EXECUTIVE_SUMMARY`（alias）
- `CAPEX_TABLE_ROWS`
- `CAPEX_SNAPSHOT`
- `FINDING_PAGES_HTML`
- 其他渲染相关：`REPORT_BODY_HTML`（最终 HTML 入 DOCX）

---

## C) reportEngine 现状（模块/mapper/gating）

### registry

- 文件：`netlify/functions/lib/reportEngine/modules.ts`
- 当前注册：
  - `safety`（emptyOutput）
  - `capacity`（emptyOutput）
  - `energy`
  - `lifecycle`

### 模块输入与输出结构

- 合约：`netlify/functions/lib/reportEngine/types.ts`
  - `ModuleComputeOutput`:
    - `executiveSummaryContrib[]`
    - `whatThisMeansContrib[]`
    - `capexRowsContrib[]`
    - `findingsContrib[]`

### energy

- 模块：`netlify/functions/lib/reportEngine/energyModule.ts`
- mapper：
  - v2 主：`inputMappers/energyMapperV2.ts`
  - 兼容：`inputMappers/energyMapper.ts`
- gating：
  - 必须 `modules` 包含 `energy`（显式启用）
  - v2 或 legacy fallback 有证据即可输出

### lifecycle

- 模块：`netlify/functions/lib/reportEngine/lifecycleModule.ts`
- mapper：`inputMappers/lifecycleMapper.ts`
- gating：
  - 必须 `modules` 包含 `lifecycle`
  - 且有 meaningful lifecycle signals（age/switchboard/evidence）

### safety/capacity

- 目前返回 emptyOutput（占位模块）

---

## D) inspection.raw 关键路径清单（当前代码读取）

### energy / load / stress / tariff

- v2 canonical：
  - `energy_v2.supply.phaseSupply`
  - `energy_v2.supply.voltageV | voltageL1V | voltageL2V | voltageL3V`
  - `energy_v2.supply.mainSwitchA`
  - `energy_v2.stressTest.performed | durationSec | totalCurrentA | currentA_L1~L3`
  - `energy_v2.stressTest.notTestedReasons`
  - `energy_v2.circuits[]`
  - `energy_v2.tariff.rate_c_per_kwh | supply_c_per_day`
- legacy fallback（energyMapper/mapperV2）：
  - `measured.load_current`
  - `measured.clamp_current`
  - `switchboard.main_switch_rating`
  - `job.supply_phase`
  - `measured.voltage`
  - `high_load_devices`

### switchboard / phase / voltage / compliance

- `switchboard.type`
- `switchboard.main_switch_rating`
- `test_data.rcd_tests.coverage` / `rcd_coverage`
- `visible_thermal_stress`
- `mixed_wiring_indicators`
- `job.property_age_band` / `property.age_band`

### snapshot/profile signals

- `snapshot_intake.*`
- `snapshot.*`
- `lead.*`
- `client.*`
- `job.*`（兼容路径）

---

## E) profile/modules 选择逻辑现状

- 抽取：`extractSnapshotSignals(raw)`
  - 输出：`occupancyType/primaryGoal/hasEv/hasSolar/hasBattery + sources + coverage`
- 决策：`resolveReportSelection(snapshotSignals, overrides)`
  - 输出：`profile/modules/weights/source`
  - `source` 值：
    - `override`
    - `snapshot`
    - `legacy_fallback`

规则优先级（当前实现）：

1. request 显式 `profile/modules`
2. snapshot 自动推导
3. fallback 到 `investor`（legacy）

---

## 备注（对未来“baseline + enhanced”架构设计有用）

- 当前已具备“单入口双路径”基础：
  - legacy builder 始终可产出（baseline）
  - reportEngine merged 可按模块/开关增强（enhanced）
- `slotSourceMap + reason` 已可观测，可作为 baseline/enhanced 的运行时审计基础。
