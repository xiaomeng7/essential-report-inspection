# TELEMETRY_PRELIGHT_DASHBOARD

## 运行方式

```bash
cat logs.txt | npm run telemetry:preflight -- --json
npm run telemetry:preflight -- --file ./logs/report.log
npm run telemetry:preflight -- --dir ./logs/
npm run telemetry:preflight:weekly -- --dir ./logs/
```

可选参数：

- `--json` 输出完整 JSON
- `--out <path>` 将聚合 JSON 写入文件
- `--since <timestamp>` / `--until <timestamp>`（日志有 timestamp 时生效）

## 解析口径

- 仅解析包含前缀 `[report-preflight-summary]` 的行
- 前缀后为 JSON
- parse 失败行会被忽略并计入 `skippedLines`

## 指标定义（与脚本一致）

- `totalReports` = 解析成功数量
- `baselineCompletionRate` = baselineComplete=true / total
- `enhancedCompletionRate` = enhancedComplete=true / total
- `defaultTariffRate` = tariffSource=default / total
- `highSeverityRate` = severity=high / total
- `ownerHighSeverityRate` = (profile=owner 且 severity=high) / owner 总量
- `topWarningCodes` = warningCounts 汇总后 top10
- `severityBreakdown` = none/low/medium/high 计数
- `circuitsCountStats` = min/avg/p50/p90/max
- `assetsCoverageBreakdown` = observed/declared/unknown 计数
- `subscriptionLeadRate` = subscriptionLead=true / total
- `ownerSubscriptionLeadRate` = owner 且 subscriptionLead=true / owner total
- `topSubscriptionLeadReasons` = 订阅线索原因 top10
- `topEnhancedSkipCodes` = Enhanced skip 原因 top10

## 解释与动作建议

- `baselineCompletionRate` 低  
  -> 技师训练、现场流程强化、Wizard 提示增强
- `defaultTariffRate` 高  
  -> 提前收集账单/资费，改进销售与客服预沟通
- `enhancedCompletionRate` 低  
  -> 排查现场时间压力、优化 Enhanced 填写步骤
- `ownerHighSeverityRate` 高  
  -> 作为 owner 产品 upsell/订阅触发入口
- `topWarningCodes`  
  -> 作为培训优先级排序依据
- `topEnhancedSkipCodes`  
  -> 用于排班/流程优化（如 `time_insufficient` 过高）
- `ownerSubscriptionLeadRate`  
  -> 用于销售跟进与订阅转化优先级分配
