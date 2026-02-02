# Cursor 逐步落地 Prompts

按顺序执行，最少返工。

---

## Step 1：接入 derivePropertySignals

**Prompt:**

> 在 `generateWordReport.ts` 或 `buildReportData` 中：
> 1. 导入 `derivePropertySignals`、`deriveFindingSignals`、`FindingDimensions`。
> 2. 从 findings + profiles 构建每个 finding 的 `FindingDimensions`（D1–D9）。
> 3. 调用 `derivePropertySignals(dimensionsList)` 得到 `PropertyDecisionSignals`。
> 4. 用 `signals.overall_health` 映射到现有的 `OVERALL_STATUS` / `RISK_RATING`。
>
> 维度映射：`risk.safety`→D1, `default_priority`/`priority`→D4, `risk_severity`/`likelihood`→D3，其余用默认值。

---

## Step 2：用 PropertySignals 驱动 Executive Summary

**Prompt:**

> 用 `PropertyDecisionSignals` 替换 `buildComputedFields` 中 EXEC_SUMMARY_CORE 的硬编码逻辑：
> - 根据 `overall_health`、`immediate_safety_risk`、`can_this_wait` 生成 3–5 句摘要。
> - 参考 `REPORT_COPY_SIGNALS.md` 的文案蓝图，使用组合示例中的句式。
> - 保持 `dedupeSentences` 调用不变。

---

## Step 3：用 PropertySignals 驱动 What This Means

**Prompt:**

> 用 `PropertyDecisionSignals` 驱动 `INTERPRETATION_GUIDANCE`：
> - 根据 `sudden_failure_risk`、`tenant_disruption_risk`、`planning_value` 生成 3–6 句解释。
> - 参考 `REPORT_COPY_SIGNALS.md` 中对应 signal 的文案要点。
> - 不重复 Executive Summary 的句子。

---

## Step 4：用 PropertySignals 驱动 Decision Pathways

**Prompt:**

> 用 `can_this_wait` 和 `planning_value` 调整 `DECISION_PATHWAYS_BULLETS` 的默认文案：
> - `can_this_wait === "NO"` 时，Accept 选项弱化或加警示。
> - `planning_value === "HIGH"` 时，Plan 选项强调资本规划。
> - 保持 4 条固定结构（Accept / Plan / Execute / Delegate），仅调整每条的语气或强调点。

---

## Step 5：单元测试

**Prompt:**

> 在 `scripts/` 下新增 `test-derivePropertySignals.ts`：
> 1. 测试 `deriveFindingSignals`：D1=high, D4=now → has_immediate_safety_risk=true。
> 2. 测试 `aggregateFindings`：空数组 → 全 LOW/NONE/YES。
> 3. 测试 `deriveOverallHealth`：immediate_safety_risk=PRESENT → HIGH_RISK。
> 4. 测试 `derivePropertySignals`：含 1 个高危 finding → overall_health=HIGH_RISK。
>
> 运行：`npx tsx scripts/test-derivePropertySignals.ts`
