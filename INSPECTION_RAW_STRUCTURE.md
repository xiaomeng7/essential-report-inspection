# Inspection Raw 数据结构示例

## 1. inspection.raw 字段树（Keys 示例）

```json
{
  "created_at": "2026-01-24T12:00:00.000Z",
  
  "job": {
    "address": { "value": "123 Example St", "status": "answered" },
    "client_type": { "value": "owner|investor|tenant", "status": "answered" },
    "occupancy": { "value": "owner_occupied|rented|vacant", "status": "answered" },
    "property_type": { "value": "house|unit|townhouse|commercial", "status": "answered" },
    "vulnerable_occupants": { "value": ["none"|"elderly"|"children"|"disability"], "status": "answered" },
    "reported_issues": { "value": ["none"|"flickering"|"tripping"|"smell"], "status": "answered" }
  },
  
  "access": {
    "switchboard_accessible": { "value": true|false, "status": "answered" },
    "roof_accessible": { "value": true|false, "status": "answered" },
    "underfloor_accessible": { "value": true|false, "status": "answered" },
    "no_access_reason": { "value": "locked"|"sealed"|"obstructed", "status": "answered" },
    "mains_power_available": { "value": true|false, "status": "answered" },
    "photos_allowed": { "value": true|false, "status": "answered" },
    "notes": { "value": "string", "status": "answered" }
  },
  
  "switchboard": {
    "overall_condition": { "value": "excellent"|"good"|"fair"|"poor", "status": "answered" },
    "signs_of_overheating": { "value": "yes"|"no"|"unsure", "status": "answered" },
    "burn_marks_or_carbon": { "value": "yes"|"no"|"unsure", "status": "answered" },
    "water_ingress": { "value": "yes"|"no"|"unsure", "status": "answered" },
    "asbestos_suspected": { "value": "yes"|"no"|"unsure", "status": "answered" },
    "protection_types_present": { "value": ["rcd"|"rcbo"|"fuse"|"mcb"], "status": "answered" },
    "board_at_capacity": { "value": true|false, "status": "answered" },
    "spare_ways_available": { "value": "yes"|"no", "status": "answered" },
    "labelling_quality": { "value": "excellent"|"good"|"fair"|"poor", "status": "answered" },
    "non_standard_or_diy_observed": { "value": "yes"|"no", "status": "answered" },
    "photo_ids": { "value": ["photo_001", "photo_002"], "status": "answered" }
  },
  
  "rcd_tests": {
    "performed": { "value": true|false, "status": "answered" },
    "summary": {
      "total_tested": { "value": 4, "status": "answered" },
      "total_pass": { "value": 3, "status": "answered" },
      "total_fail": { "value": 1, "status": "answered" }
    },
    "no_exceptions": { "value": true|false, "status": "answered" },
    "exceptions": {
      "value": [
        {
          "location": "Kitchen",
          "test_current_ma": 30,
          "trip_time_ms": 350,
          "result": "pass"|"fail",
          "notes": "Trip >300ms",
          "photo_ids": ["photo_003"]
        }
      ],
      "status": "answered"
    },
    "notes": { "value": "string", "status": "answered" }
  },
  
  "gpo_tests": {
    "performed": { "value": true|false, "status": "answered" },
    "summary": {
      "total_gpo_tested": { "value": 12, "status": "answered" },
      "polarity_pass": { "value": 12, "status": "answered" },
      "earth_present_pass": { "value": 11, "status": "answered" },
      "rcd_protection_confirmed": { "value": 12, "status": "answered" }
    },
    "any_warm_loose_damaged": { "value": true|false, "status": "answered" },
    "no_exceptions": { "value": true|false, "status": "answered" },
    "exceptions": {
      "value": [
        {
          "location": "Bedroom 1",
          "issue_type": "loose"|"damaged"|"warm"|"no_earth",
          "notes": "string",
          "photo_ids": ["photo_004"]
        }
      ],
      "status": "answered"
    },
    "notes": { "value": "string", "status": "answered" }
  },
  
  "earthing": {
    "men_link_confirmed": { "value": "yes"|"no"|"not_accessible", "status": "answered" },
    "main_earth_conductor_intact": { "value": "yes"|"no"|"unsure", "status": "answered" },
    "earthing_resistance_measured": { "value": 0.5, "status": "answered" },
    "bonding_water_gas_verified": { "value": "yes"|"no"|"not_accessible", "status": "answered" }
  },
  
  "lighting": {
    "issues_observed": { "value": "none"|"flicker"|"heat_damage"|"other", "status": "answered" },
    "fittings_noncompliant": { "value": true|false, "status": "answered" }
  },
  
  "smoke_alarms": {
    "present": { "value": true|false, "status": "answered" },
    "expired": { "value": true|false, "status": "answered" },
    "interconnected": { "value": true|false, "status": "answered" },
    "location_compliant": { "value": "yes"|"no"|"unsure", "status": "answered" }
  },
  
  "thermal_imaging": {
    "performed": { "value": true|false, "status": "answered" },
    "hotspots_detected": { "value": "none"|"minor"|"major", "status": "answered" },
    "notes": { "value": "string", "status": "answered" }
  },
  
  "assets": {
    "has_solar_pv": { "value": true|false, "status": "answered" },
    "has_battery": { "value": true|false, "status": "answered" },
    "has_ev_charger": { "value": true|false, "status": "answered" },
    "solar_issues": { "value": ["none"|"fault"|"isolation"], "status": "answered" },
    "battery_thermal": { "value": true|false, "status": "answered" },
    "ev_charger_segregated": { "value": true|false, "status": "answered" }
  },
  
  "signoff": {
    "technician_name": { "value": "Jane Tech", "status": "answered" },
    "licence_no": { "value": "L12345", "status": "answered" },
    "inspection_completed": { "value": true, "status": "answered" },
    "customer_informed_immediate": { "value": true|false, "status": "answered" },
    "office_notes_internal": { "value": "string", "status": "answered" },
    "ready_for_report_generation": { "value": true, "status": "answered" },
    "submit_confirm": { "value": true, "status": "answered" }
  }
}
```

## 2. 会触发 Findings 的字段列表

### Switchboard 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `switchboard.asbestos_suspected` | 下拉选项 | `"yes"` | `ASBESTOS_RISK` |
| `switchboard.signs_of_overheating` | 下拉选项 | `"yes"` | `THERMAL_STRESS_ACTIVE` |
| `switchboard.burn_marks_or_carbon` | 下拉选项 | `"yes"` | `ARCING_EVIDENCE_PRESENT` |
| `switchboard.water_ingress` | 下拉选项 | `"yes"` | `MATERIAL_DEGRADATION` |
| `switchboard.board_at_capacity` | Checkbox | `true` | `BOARD_AT_CAPACITY` |
| `switchboard.spare_ways_available` | 下拉选项 | `"no"` | `NO_EXPANSION_MARGIN` |
| `switchboard.labelling_quality` | 下拉选项 | `"poor"` | `LABELING_POOR` |
| `switchboard.non_standard_or_diy_observed` | Checkbox | `true` | `NON_STANDARD_WORK` |
| `switchboard.protection_types_present` | 多选数组 | 不包含 `"rcd"` 或 `"rcbo"` | `NO_RCD_PROTECTION` / `PARTIAL_RCD_COVERAGE` |

### RCD Tests 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `rcd_tests.performed` | Checkbox | `false` | `NO_RCD_PROTECTION` |
| `rcd_tests.exceptions[].result` | 下拉选项 | `"fail"` | `RCD_TEST_FAIL_OR_UNSTABLE` |
| `rcd_tests.exceptions[].trip_time_ms` | 数值 | `> 300` | `RCD_TRIP_TIME_SLOW` |

### GPO Tests 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `gpo_tests.any_warm_loose_damaged` | Checkbox | `true` | `GPO_MECHANICAL_LOOSE` |
| `gpo_tests.exceptions[].issue_type` | 下拉选项 | `"damaged"` | `DAMAGED_OUTLET_OR_SWITCH` |
| `gpo_tests.exceptions[].issue_type` | 下拉选项 | `"no_earth"` | `GPO_EARTH_FAULT` |
| `gpo_tests.summary.polarity_pass` < `gpo_tests.summary.total_gpo_tested` | 数值比较 | 不相等 | `POLARITY_ISSUE_DETECTED` |

### Earthing 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `earthing.men_link_confirmed` | 下拉选项 | `"no"` | `MEN_NOT_VERIFIED` |
| `earthing.main_earth_conductor_intact` | 下拉选项 | `"no"` | `EARTH_DEGRADED` |
| `earthing.earthing_resistance_measured` | 数值 | `> 1.0` (Ω) | `EARTHING_RESISTANCE_HIGH` |
| `earthing.bonding_water_gas_verified` | 下拉选项 | `"no"` | `BONDING_TO_WATER_GAS_NOT_VERIFIED` |

### Lighting 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `lighting.issues_observed` | 下拉选项 | `"heat_damage"` | `FITTING_OVERHEAT` |
| `lighting.fittings_noncompliant` | Checkbox | `true` | `LIGHT_FITTING_NONCOMPLIANT_OR_UNSAFE` |

### Smoke Alarms 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `smoke_alarms.present` | Checkbox | `false` | `SMOKE_ALARMS_MISSING` |
| `smoke_alarms.expired` | Checkbox | `true` | `SMOKE_ALARMS_EXPIRED` |
| `smoke_alarms.interconnected` | Checkbox | `false` | `SMOKE_ALARMS_NOT_INTERCONNECTED` |
| `smoke_alarms.location_compliant` | 下拉选项 | `"no"` | `SMOKE_ALARMS_LOCATION_NONCOMPLIANT_SUSPECTED` |

### Thermal Imaging 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `thermal_imaging.performed` | Checkbox | `false` | `THERMAL_NOT_PERFORMED` |
| `thermal_imaging.hotspots_detected` | 下拉选项 | `"minor"` | `THERMAL_HOTSPOT_DETECTED_MINOR` |
| `thermal_imaging.hotspots_detected` | 下拉选项 | `"major"` | `THERMAL_HOTSPOT_DETECTED_MAJOR` |

### Assets (Solar/Battery/EV) 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `assets.battery_thermal` | Checkbox | `true` | `BATTERY_THERMAL` |
| `assets.ev_charger_segregated` | Checkbox | `false` (当 `has_ev_charger` = true) | `EV_UNSEGREGATED_LOAD` |

### Access Limitations 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `access.roof_accessible` | Checkbox | `false` | `ACCESS_LIMITATION_ROOF_VOID_NOT_ACCESSED` |
| `access.underfloor_accessible` | Checkbox | `false` | `ACCESS_LIMITATION_SUBFLOOR_NOT_ACCESSED` |

### Test Data 相关

| 字段路径 | 字段类型 | 触发值 | Finding ID |
|---------|---------|--------|------------|
| `rcd_tests.performed` = false AND `gpo_tests.performed` = false | 组合条件 | 两者都为 false | `TEST_DATA_INCOMPLETE` |

## 3. 字段值类型说明

- **Checkbox**: `true` / `false`
- **下拉选项**: 字符串枚举值（如 `"yes"` / `"no"` / `"unsure"`）
- **多选数组**: `["value1", "value2"]`
- **数值**: 数字（如 `350`, `0.5`）
- **数值比较**: 通过比较运算符触发（如 `> 300`, `< total`）

## 4. 注意事项

1. 所有字段值都包装在 `{ "value": ..., "status": "answered" }` 结构中
2. 数组字段（如 `exceptions`）可能包含多个对象
3. 某些 findings 需要组合条件（如 `GPO_EARTH_FAULT` 需要多个条件同时满足）
4. 字段路径使用点号分隔（如 `switchboard.signs_of_overheating`）
