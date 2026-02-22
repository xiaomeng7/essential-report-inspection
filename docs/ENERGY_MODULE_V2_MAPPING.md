# Energy Module v2 Mapping

| 技师字段（优先 `raw.energy_v2`） | 计算/阈值规则 | 输出位置 |
|---|---|---|
| `energy_v2.supply.phaseSupply` + `voltageV` + `stressTest.totalCurrentA` | 单相 `peakKW = V * A / 1000` | `executiveSummary`, `finding:LOAD_STRESS_TEST_RESULT` |
| `energy_v2.supply.phaseSupply=three` + `voltageL1/L2/L3` + `currentA_L1/L2/L3` | 三相 `peakKW = (V1*A1 + V2*A2 + V3*A3)/1000` | `executiveSummary`, `finding:LOAD_STRESS_TEST_RESULT` |
| `energy_v2.supply.mainSwitchA` + 电流 | `stressRatio`: 单相 `A/mainSwitchA`; 三相 `max(Ai/mainSwitchA)` | `executiveSummary` + `whatThisMeans` + `finding:LOAD_STRESS_TEST_RESULT` |
| stressRatio 分级 | `<0.6 low`, `0.6-0.8 moderate`, `0.8-0.95 high`, `>=0.95 critical` | `finding:LOAD_STRESS_TEST_RESULT` 表格中的 stress level |
| `energy_v2.circuits[]` | 每路 `kW_i = V * A_i /1000`（三相未给电压时按 230 近似），取 Top5 | `executiveSummary` + `finding:CIRCUIT_CONTRIBUTION_BREAKDOWN` |
| `energy_v2.tariff.rate_c_per_kwh` + `supply_c_per_day` | 月费用区间：`avgKW=peakKW*0.25/0.35`，`cost=avgKW*24*30*rate + supply*30` | `executiveSummary` + `finding:ESTIMATED_COST_BAND` |
| tariff 缺省逻辑 | raw > env(`ENERGY_RATE_C_PER_KWH`,`ENERGY_SUPPLY_C_PER_DAY`) > default(40/120) | `finding:ESTIMATED_COST_BAND` assumptions |
| `evidenceCoverage` 为 unknown/declared 或 stressRatio>=0.8 或 reduce_bill 目标 | 触发连续监控建议 | `capexRows` monitoring row + `finding:CONTINUOUS_MONITORING_UPGRADE` |
| 旧字段：`measured.load_current`, `switchboard.main_switch_rating`, `job.supply_phase` | 生成 fallback stressTest + `Main Load Snapshot`，保证不空输出 | `exec/wtm/capex/findings` 仍有简化结论 |

## 输出结构固定（便于 QA）

- Findings IDs 固定顺序：
  1. `LOAD_STRESS_TEST_RESULT`
  2. `CIRCUIT_CONTRIBUTION_BREAKDOWN`
  3. `ESTIMATED_COST_BAND`
  4. `CONTINUOUS_MONITORING_UPGRADE`（条件触发）

## 备注

- 模块生效条件保持不变：`modules` 包含 `energy`。
- 注入开关保持不变：`inject_*` 控制最终是否进入文档；关掉时仍保留 `plan.merged` shadow 结果。
