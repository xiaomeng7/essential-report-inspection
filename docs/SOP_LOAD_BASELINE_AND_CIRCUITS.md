# SOP Load Baseline and Enhanced Circuits (双语)

## 1) Baseline Load Test（必做 / Required）

### 中文步骤

1. 记录供电基本信息：相别、电压、主开关容量。  
2. 执行压力测试：记录是否执行、持续时间、总电流（或三相电流）。  
3. 若未执行，填写未测原因（逗号分隔可多项）。  
4. 确认数据已写入 Wizard 对应字段后再进入下一步。

对应字段（Wizard -> raw）：
- `energy_v2.supply.phaseSupply`
- `energy_v2.supply.voltageV` / `voltageL1V/L2V/L3V`
- `energy_v2.supply.mainSwitchA`
- `energy_v2.stressTest.performed`
- `energy_v2.stressTest.durationSec`
- `energy_v2.stressTest.totalCurrentA` / `currentA_L1/L2/L3`
- `energy_v2.stressTest.notTestedReasons`

### English steps

1. Capture supply basics: phase, voltage, and main switch rating.  
2. Run stress test and record performed flag, duration, and current (total or per phase).  
3. If not tested, record reasons.  
4. Confirm values are saved before moving on.

Mapped fields:
- `energy_v2.supply.*`
- `energy_v2.stressTest.*`

---

## 2) Enhanced Circuits（默认 6 条 / Default 6 rows）

### 中文步骤

1. 展开 Enhanced Circuits 区块（默认折叠）。  
2. 依次填写分路：名称、类别、电流(A)、证据覆盖（measured/declared）。  
3. 可按现场情况增删分路。  
4. 如有账单资费信息，可填写 tariff（rate/supply）。

对应字段：
- `energy_v2.circuits[]` (`label/category/measuredCurrentA/evidenceCoverage`)
- `energy_v2.tariff.rate_c_per_kwh`
- `energy_v2.tariff.supply_c_per_day`

### English steps

1. Expand Enhanced Circuits section (collapsed by default).  
2. Fill each row: label, category, measured current, evidence coverage.  
3. Add/remove rows as needed.  
4. Enter tariff if available.

---

## 3) Skip Enhanced 允许条件 / Allowed Skip Conditions

当现场无法完整采集 Enhanced 分路时，可点击 **Skip Enhanced (record reason)**，并填写原因：

- `customer_not_allowed` / 客户不允许  
- `time_insufficient` / 时间不足  
- `site_uncontrollable` / 设备或现场不可控  
- `other` / 其他（建议补充备注）

对应字段：
- `energy_v2.enhancedSkipReason.code`
- `energy_v2.enhancedSkipReason.note`

---

## 4) 证据建议（建议，不强制）

- Baseline：建议拍主开关铭牌、电流钳读数、测试仪屏幕。  
- Circuits：建议每个主要分路至少一张读数证据。  
- 若 skip enhanced：建议记录客户或现场限制的简短说明（文字即可）。  
