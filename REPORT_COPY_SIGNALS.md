# 房东信任感文案蓝图

把 PropertyDecisionSignals 翻译成客户能听懂的决策语言。

---

## overall_health

| Signal | 客户视角 | 文案要点 |
|--------|----------|----------|
| GOOD | 一切正常 | "电气状况良好。无需立即行动。" |
| STABLE | 可规划 | "电气状况稳定。建议纳入未来资本规划。" |
| ATTENTION | 需关注 | "建议尽快安排检修或升级，以降低突发故障风险。" |
| HIGH_RISK | 紧急 | "存在安全隐患，请立即采取行动。" |

---

## immediate_safety_risk

| Signal | 文案要点 |
|--------|----------|
| NONE | "未发现立即性安全风险。" |
| PRESENT | "存在需立即处理的电气安全隐患。" |

---

## sudden_failure_risk

| Signal | 文案要点 |
|--------|----------|
| LOW | "突发故障风险较低。" |
| MEDIUM | "部分项目存在中等突发故障可能。" |
| HIGH | "存在隐藏故障风险，建议尽早排查。" |

---

## tenant_disruption_risk

| Signal | 文案要点 |
|--------|----------|
| LOW | "对租户影响较小。" |
| MEDIUM | "可能影响租户使用，建议规划维修窗口。" |
| HIGH | "可能导致租户中断，建议优先安排。" |

---

## can_this_wait

| Signal | 文案要点 |
|--------|----------|
| YES | "可以暂不处理。" |
| CONDITIONALLY | "可结合下次维修一并处理。" |
| NO | "不建议延后，需尽快安排。" |

---

## planning_value

| Signal | 文案要点 |
|--------|----------|
| LOW | "可纳入常规维护。" |
| MEDIUM | "建议纳入 1–3 年资本规划。" |
| HIGH | "建议纳入资本预算，提前规划升级窗口。" |

---

## 组合示例（Executive Summary 开头句）

- **GOOD + NONE + LOW** → "本物业电气状况良好，未发现需立即处理的隐患。"
- **STABLE + NONE + HIGH** → "电气状况稳定，建议将升级项目纳入未来资本规划。"
- **ATTENTION + NONE + HIGH** → "建议尽快安排检修，以降低突发故障对租户的影响。"
- **HIGH_RISK + PRESENT** → "存在电气安全隐患，请立即采取行动。"
