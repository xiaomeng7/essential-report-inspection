# PREFLIGHT_METRICS

## 目的

将 preflight 从“文本警告”升级为可聚合指标，支持培训与质量管理。

## WarningCode 列表

- `BASELINE_INSUFFICIENT`
  - 含义：Baseline 缺关键输入（电压或电流）
- `ENHANCED_INSUFFICIENT`
  - 含义：Enhanced 条件不足（`circuits < 2` 且无 tariff）
- `ASSETS_COVERAGE_UNKNOWN`
  - 含义：Solar/Battery/EV 覆盖来源未知
- `READINESS_TRIGGER_BLOCKED_BY_UNKNOWN_COVERAGE`
  - 含义：在 coverage unknown 且 stress 非高压时，readiness 触发被阻止
- `TARIFF_DEFAULT_USED`
  - 含义：使用了默认 tariff（非客户提供）
- `CIRCUITS_COVERAGE_NOT_MEASURED`
  - 含义：circuits 存在但 evidence coverage 非 measured
- `ENHANCED_SKIPPED`
  - 含义：技师使用了 Skip Enhanced 并记录了原因

## 每报告输出结构

`plan.debug.preflight`：

- `warnings[]`: `{ code, message, meta }`
- `flags`: 兼容布尔位
- `summary`:
  - `warningCounts`
  - `hasAnyWarning`
  - `severity`
  - `baselineComplete`
  - `enhancedComplete`
  - `assetsCoverage`
  - `tariffSource`
  - `circuitsCount`
  - `enhancedSkipped` / `enhancedSkipCode` / `enhancedSkipNote(截断)`
  - `subscriptionLead` / `subscriptionLeadReasons`

## Severity 规则（v1）

- `high`
  - `BASELINE_INSUFFICIENT`
  - `READINESS_TRIGGER_BLOCKED_BY_UNKNOWN_COVERAGE`
  - `ENHANCED_INSUFFICIENT` 且 profile=owner
- `medium`
  - `ASSETS_COVERAGE_UNKNOWN`
  - `CIRCUITS_COVERAGE_NOT_MEASURED`
  - `TARIFF_DEFAULT_USED`
- `low`
  - 其他 warning
- `none`
  - 无 warning

## 日志聚合

生成报告时输出单行日志：

- `[report-preflight]`（完整 preflight 对象）
- `[report-preflight-summary]`（聚合友好结构）

建议后续聚合指标：

- baseline completion rate
- enhanced completion rate
- default tariff usage rate
- assets unknown coverage rate
- readiness blocked count by team/technician
- enhanced skip reason distribution
- subscription lead rate / top lead reasons
