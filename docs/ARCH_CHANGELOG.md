# ARCH_CHANGELOG

## Step 0 - 现状确认与重构计划（只读）

- 阅读并核对：
  - `ARCHITECTURE_DUMP.md`
  - `docs/SLOT_MAP.md`
  - `docs/FRONTEND_WIZARD_DATA_MAP.md`
- 形成统一目标：Baseline Always-run、Enhanced Conditional-run、Profile 仅展示控制。
- 梳理当前 call-graph（入口、plan、override、渲染链路）。
- 明确保持不变项：
  - 不改 Word 模板；
  - 不改 `renderDocxByMergingCoverAndBody`；
  - 不改 slot 注入总结构与 `inject_*` 行为。
- 新增计划文档：`docs/ARCH_REFACTOR_PLAN.md`。
- 列出后续将改动/新增文件清单（extractors/engines/renderer/tests/docs）。
- 本步无业务代码变更，仅文档变更。
- 本步可回滚方式：删除新增文档文件即可恢复原状态。

## Step 1 - Unified Canonical Extractors（只增不改）

- 新增目录：`netlify/functions/lib/report/canonical/`。
- 新增基础工具：`common.ts`（`extractValue/getByPath/pickFirst/toNumber/toBoolean`）。
- 新增 `extractBaselineLoadSignals(raw)`：
  - 优先读 `load_baseline.*`、`energy_v2.*`；
  - 回退读 legacy `measured/switchboard/job` 路径；
  - 输出 `phase/voltage/mainSwitch/stressTest/coverage/sources`。
- 新增 `extractAssetsEnergy(raw)`：
  - 优先 `assets_energy.*`，其次 `snapshot_intake.*`，再 fallback legacy；
  - 输出 `hasSolar/hasBattery/hasEv/coverage/sources`。
- 新增 `extractEnhancedCircuits(raw)`：
  - 优先 `energy_v2.circuits + tariff`；
  - 输出 `circuits/tariff/coverage/sources`。
- 所有 extractor 均：
  - 记录 `sources` 为“字段 -> 命中路径数组”；
  - 不抛错，缺字段返回 `undefined` 或空数组。
- 新增最小单测：`scripts/test-canonical-extractors.ts`（基于 `SAMPLE_INSPECTION_RAW_MIN.json`）。
- 更新 `package.json`：
  - 新增 `test:canonical-extractors`；
  - 纳入 `test:report-engine` 执行链路。
- 本步可回滚方式：移除 `canonical/` 与测试脚本，不影响旧逻辑。

## Step 2 - BaselineLoadEngine（Always-run）

- 新增 `netlify/functions/lib/reportEngine/baselineLoadEngine.ts`。
- 引擎输入：`extractBaselineLoadSignals(raw)`（canonical extractor）。
- 新增 baseline 计算：
  - `peakKW`（单相/三相近似）；
  - `stressRatio`、`stressLevel`（low/moderate/high/critical/unknown）；
  - `headroomA`。
- 引擎输出（对齐 `ModuleComputeOutput`）：
  - findings 固定 key：`LOAD_STRESS_TEST_RESULT`；
  - executive 一条 baseline 短句；
  - high/critical 时新增 1 条 capacity review capex。
- 无证据场景也会输出 finding（insufficient evidence 文案），避免 baseline 为空。
- 在 `buildReportPlan` 中接入为 Always-run：
  - 在 module loop 前先执行 baseline engine；
  - 输出进入 `plan.merged` 池并参与后续注入控制。
- 保持旧模块逻辑不删除，确保可回滚。
- 本步可回滚方式：移除 baseline engine 接入代码，恢复此前行为。

## Step 3 - Enhanced Energy（Conditional-run）

- 新增 `netlify/functions/lib/reportEngine/enhancedEnergyEngine.ts`。
- Enhanced 引擎输入：
  - `extractEnhancedCircuits(raw)`（canonical circuits/tariff）；
  - 可选 baseline metrics（用于 peakKW 优先）。
- 触发条件实现：
  - `circuits.length >= 2` 或 tariff 有值 或 unknown high draw 标记。
- 输出内容重心调整为增强层：
  - findings：`CIRCUIT_CONTRIBUTION_BREAKDOWN`、`ESTIMATED_COST_BAND`、可选 `CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION`；
  - capexRows：按 contributor category 生成 2~3 行；
  - exec/wtm：保留 profile 口吻差异。
- 电费区间 v1：
  - `avgKW_low = peakKW * 0.25`
  - `avgKW_typ = peakKW * 0.35`
  - `monthly = avgKW*24*30*rate + supply*30`
- tariff 优先级沿用 `resolveTariffConfig`（raw > env/default > fallback）。
- `energyModule.ts` 改为兼容薄封装：导出 `enhancedEnergyEngine` 作为现有入口，避免接口断裂。
- 更新回归脚本以兼容监控 finding key 的新命名。
- 本步可回滚方式：`energyModule` 指回旧实现并移除 enhanced 文件。

## Step 4 - DistributedEnergyAssetsEngine（Always-run，轻量）

- 升级 `distributedEnergyAssetsEngine.ts` 到 canonical 输入：
  - 改为使用 `report/canonical/extractAssetsEnergy`；
  - `sources` 改为数组结构并统一 flatten。
- 连接 baseline stress：
  - `runDistributedEnergyAssetsEngineFromRaw(raw, profile, baselineMetrics?)`；
  - 优先使用 baseline 的 `stressLevel` 触发 readiness/monitoring 规则。
- 固定 findings key 保持不变：
  - `DISTRIBUTED_ENERGY_ASSETS_OVERVIEW`
  - `EV_SOLAR_BATTERY_READINESS_NOTE`
  - `CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION`
- 规则保持：
  - Owner 默认显示 overview；
  - readiness / monitoring 按触发式输出；
  - Investor 默认不显示 overview（后续由 Profile Renderer 严格控制）。
- 在 `engine.ts` 接入 baseline metrics 透传到 assets engine。
- 本步可回滚方式：恢复旧 assets engine import 与 stress 计算方式。

## Step 5 - Profile Renderer（展示过滤/组装）

- 新增 `netlify/functions/lib/reportEngine/profileRenderer.ts`。
- 输入：`profile + merged outputs`；输出同结构 `merged`。
- 仅做展示层处理，不做业务计算：
  - Investor 隐藏：
    - `ESTIMATED_COST_BAND`
    - `CIRCUIT_CONTRIBUTION_BREAKDOWN`
    - `DISTRIBUTED_ENERGY_ASSETS_OVERVIEW`
  - Owner：默认保留全部 findings。
- 加入 owner 稳定顺序权重（baseline -> assets -> enhanced），确保展示顺序可控。
- 在 `engine.ts` 中接入：
  - `plan.merged = profileRenderMerged(profile, mergeModuleOutput(...))`
- 更新 `reportEngine/index.ts` 导出 `profileRenderer`。
- 本步可回滚方式：去除 `profileRenderMerged` 调用，恢复 merge 直出。

## Step 6 - buildReportPlan 最小侵入接入

- `engine.ts` 进入新编排：
  - Always-run：`baselineLoadEngine` + `distributedEnergyAssetsEngine`；
  - Conditional-run：`runEnhancedEnergyEngine(raw, profile, baselineMetrics)`（按数据触发）；
  - 现有 `safety/capacity/lifecycle` 仍按模块循环执行。
- 为避免重复计算，module loop 中跳过 `energy`（由新 enhanced runner 统一执行）。
- 所有输出仍写入同一 `plan.merged` 池，不改 merged 结构和 keys 体系。
- 合并后仍走 `profileRenderMerged`，再交给 `applyMergedOverrides` 与 `inject_*`。
- 保留 shadow 能力：即使注入关闭，`plan.merged` 仍可用于调试与 telemetry。
- 更新旧回归脚本中的前置假设（从“显式 modules 才有 energy”改为“有增强数据才触发 energy”）。
- 本步可回滚方式：恢复 energy 模块循环执行并去掉独立 enhanced runner。

## Step 7 - 测试与文档补齐

- 新增专项架构测试：`scripts/test-unified-engines-architecture.ts`（6 个场景）：
  1. investor + baseline only -> 必有 `LOAD_STRESS_TEST_RESULT`
  2. owner + baseline + circuits -> 有 `CIRCUIT_CONTRIBUTION_BREAKDOWN` + `ESTIMATED_COST_BAND`
  3. investor + circuits -> circuits findings 被 Profile Renderer 过滤
  4. owner + hasSolar=true -> 有 `DISTRIBUTED_ENERGY_ASSETS_OVERVIEW`
  5. stress high + hasEv unknown -> 触发 `EV_SOLAR_BATTERY_READINESS_NOTE`
  6. legacy-only raw -> baseline 输出不为空
- `package.json`：
  - 新增 `test:unified-engines-architecture`
  - 纳入 `test:report-engine`
- 新增文档：
  - `docs/ENGINES_OVERVIEW.md`
  - `docs/PROFILE_RENDER_RULES.md`
- 文档内容覆盖：
  - 每个 engine 的输入/输出/触发条件
  - Investor vs Owner 的 finding key 级别展示规则
- 本步可回滚方式：移除新增测试脚本和两份文档，不影响核心运行链路。

## Step 8 - Executive Decision Signals 强化

- 强化 baseline executive 文案为固定结构（便于 QA）：
  - `Peak load: {peakKW} kW ({peakA} A) • Stress: {stressLevel} • Headroom: {headroomText}`
- 无证据场景文案：
  - `Baseline load evidence: insufficient — recommended to complete stress test`
- 在 `profileRenderer` 保持 baseline executive line 不被展示层过滤。
- 补充测试覆盖：
  - investor baseline only -> executive 包含 `Peak load:`
  - legacy raw no stress -> executive 包含 `insufficient`

## Step 9 - ESTIMATED_COST_BAND 结构化与免责声明一致化

- `enhancedEnergyEngine` 中 `ESTIMATED_COST_BAND` 改为固定三段结构：
  - `What we measured`
  - `Assumptions used (tariff, supply, avg factors)`
  - `What you can do next`
- 统一标注 tariff 来源：
  - `customer provided`
  - `default estimate`
- 补充测试：
  - owner + circuits + default tariff -> 包含三段标题且显示 `default estimate`
  - owner + customer tariff -> 显示 `customer provided`

## Step 10 - Assets 从存在性升级为触发器

- assets executive summary 固定格式：
  - `Energy assets — Solar: ... • Battery: ... • EV: ...`
- 触发规则写死并落测试：
  - readiness: `stress high/critical` AND `(hasEv true/unknown OR planned upgrade signal)`
  - monitoring justification: `stress high/critical` OR `(assets present AND circuits coverage insufficient)`
- Owner 默认保留 overview；Investor 默认过滤 overview（profileRenderer）。
- 补充测试：
  - investor hasSolar true -> executive 含 `Energy assets —`
  - investor hasSolar true -> overview 不出现
  - owner hasSolar true -> overview 出现
  - stress high + hasEv unknown -> readiness note 出现

## Step 11 - Technician SOP + Wizard 渐进式填写

- 新增双语 SOP：`docs/SOP_LOAD_BASELINE_AND_CIRCUITS.md`。
- Wizard（同一界面）调整：
  - Baseline 区块保持展开（必做字段保留）；
  - Enhanced Circuits 区块默认折叠，可展开编辑；
  - 新增 `Skip Enhanced (record reason)`。
- 新增 skip reason 字段：
  - `energy_v2.enhancedSkipReason.code`
  - `energy_v2.enhancedSkipReason.note`
- 为兼容提交归一化，`normalizeEnergyV2` 保留 `enhancedSkipReason` 到 `raw.energy_v2`。
- 更新映射文档：`docs/FRONTEND_WIZARD_DATA_MAP.md`。

## Step 12 - Preflight QA（警告不拦截）

- 新增：`netlify/functions/lib/report/preflight/assertReportInputs.ts`。
- 在 `buildReportPlan` 前后接入 preflight：
  - before/after 均计算 warning + flags；
  - 写入 `plan.debug.preflight`；
  - 输出日志 `[report-preflight] {...}`。
- `generateWordReport` 在 plan 可用时追加 preflight 日志输出。
- 新增测试覆盖：
  - legacy raw 无 stress 场景 -> `plan.debug.preflight.flags.baseline_insufficient=true`。

## Step 13 - 估算模型可校准（参数化 + 回收流程）

- 新增估算参数配置：`netlify/functions/lib/config/energyEstimation.ts`。
  - `DEFAULT_AVG_FACTOR_LOW=0.25`
  - `DEFAULT_AVG_FACTOR_TYP=0.35`
  - 支持 env 覆盖：`ENERGY_AVG_FACTOR_LOW` / `ENERGY_AVG_FACTOR_TYP`
- Enhanced cost band 读取参数化因子，并在 Assumptions 段展示。
- 新增账单回收流程文档：`docs/BILL_FEEDBACK_LOOP.md`。
- 新增回收触达模板：`templates/email/bill-calibration-followup.md`（暂不接入发送系统）。

## Step 14 - Preflight Metrics Aggregation（可聚合指标）

- preflight warning 升级为结构化对象：
  - `code` + `message` + `meta`
  - 引入稳定 `WarningCode` 常量（可统计）。
- `plan.debug.preflight` 扩展：
  - `warnings[]`
  - `flags`
  - `summary`（warningCounts、severity、baseline/enhanced 完整度、assetsCoverage、tariffSource、circuitsCount）。
- severity v1 实现：
  - high / medium / low / none 分级。
- `generateWordReport.ts` 新增单行聚合日志：
  - `[report-preflight-summary] { inspection_id, profile, modulesSelected, injected, summary }`
- 新增测试断言（统一架构脚本）：
  - `BASELINE_INSUFFICIENT` 计数与 severity
  - `ENHANCED_INSUFFICIENT` 计数
  - `TARIFF_DEFAULT_USED` 计数
  - `READINESS_TRIGGER_BLOCKED_BY_UNKNOWN_COVERAGE` 计数
- 新增文档：`docs/PREFLIGHT_METRICS.md`。

## Step 15 - Preflight Telemetry Aggregator（只读）

- 新增脚本：`scripts/aggregate-preflight-telemetry.ts`。
  - 输入支持：
    - `--file <path>`
    - `--dir <path>`（递归读取 `.log/.txt`）
    - 无参数时从 stdin 读取
  - 解析规则：
    - 仅解析 `[report-preflight-summary]` 行
    - JSON parse 失败计入 `skippedLines`
  - 聚合维度：
    - overall
    - byProfile
  - 指标输出：
    - completion rates / severity rates / owner high severity
    - topWarningCodes
    - severity/coverage breakdown
    - circuits count stats（min/avg/p50/p90/max）
  - 支持 `--json` / `--out` / `--since` / `--until`。
- 新增 npm scripts：
  - `telemetry:preflight`
  - `test:aggregate-preflight-telemetry`
- 新增轻量测试：
  - `scripts/test-aggregate-preflight-telemetry.ts`
  - 使用 mock 日志 + Node assert 验证计数口径。
- 新增文档：
  - `docs/TELEMETRY_PRELIGHT_DASHBOARD.md`（运行方式、指标定义、解释建议）。

## Step 16 - Enhanced Skip Reason 纳入 preflight summary

- 在 preflight 中读取：
  - `raw.energy_v2.enhancedSkipReason.code`
  - `raw.energy_v2.enhancedSkipReason.note`（summary 中截断至 80 字符）
- 新增 summary 字段：
  - `enhancedSkipped`
  - `enhancedSkipCode`
  - `enhancedSkipNote`
- 新增可聚合 warning code：
  - `ENHANCED_SKIPPED`（meta 含 skip code）
- 保持逻辑：
  - `enhancedComplete=false` 且 `enhancedSkipped=false` 时仍触发 `ENHANCED_INSUFFICIENT`。

## Step 17 - Weekly Preflight Report Generator（只读）

- 新增脚本：`scripts/generate-weekly-preflight-report.ts`
  - 输入同聚合器：`--file` / `--dir` / stdin
  - 输出默认：`reports/weekly-preflight-report-YYYY-MM-DD.md`
  - 支持 `--out` 覆盖输出路径
  - 固定模板包含：
    - summary counts
    - KPI table
    - top warning codes
    - top skip reasons
    - action suggestions（阈值规则）
- package scripts 新增：
  - `telemetry:preflight:weekly`
- 新增轻量测试：
  - `scripts/test-generate-weekly-preflight-report.ts`

## Step 18 - 标准化订阅线索输出（不进报告）

- preflight summary 新增：
  - `subscriptionLead: boolean`
  - `subscriptionLeadReasons: string[]`
- v1 规则：
  - owner 且 severity=high
  - 或 finding 存在 `CONTINUOUS_MONITORING_UPGRADE_JUSTIFICATION`
  - 或 assets present 且 circuits coverage != measured
- 聚合器新增指标：
  - `subscriptionLeadRate`
  - `ownerSubscriptionLeadRate`
  - `topSubscriptionLeadReasons`
- 文档更新：
  - `docs/PREFLIGHT_METRICS.md`
  - `docs/TELEMETRY_PRELIGHT_DASHBOARD.md`
