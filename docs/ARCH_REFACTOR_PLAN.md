# ARCH_REFACTOR_PLAN

## 目标

按“统一技师检测系统 + 两套报告输出(profile) + Baseline 永远生成 + Enhanced 按数据存在自动增强 + Profile 只控制展示”重构 Report Engine，保持模板和渲染链路不变。

## 当前 Pipeline Call-Graph（现状）

1. `netlify/functions/generateWordReport.ts` -> `handler(event)`
   - 解析 `inspection_id/profile/modules/inject_*`
   - 读取 `inspection.raw`（`store.get` strong -> fallback）
2. `extractSnapshotSignals(raw)` + `resolveReportSelection(...)`
   - 决定 profile/modules（override > snapshot > fallback）
3. `buildTemplateDataWithLegacyPath(request, legacyBuilder)`（`reportEngine/engine.ts`）
   - `legacyBuilder` 生成兼容模板数据
   - `buildReportPlan(request)` 生成 `plan.merged`
4. `applyMergedOverrides(templateData, plan, options)`
   - `slotSourceMap` + `inject_*` gating
5. `buildStructuredReport(...)` + `renderReportFromSlots(...)`
   - 组装 markdown slots
6. `markdownToHtml(...)` -> `renderDocx(...)`
   - `renderDocxByMergingCoverAndBody`（保留）

## 本次重构将改动/新增的文件（规划）

- 新增 canonical extractors：
  - `netlify/functions/lib/report/canonical/extractBaselineLoadSignals.ts`
  - `netlify/functions/lib/report/canonical/extractAssetsEnergy.ts`
  - `netlify/functions/lib/report/canonical/extractEnhancedCircuits.ts`
- 新增/迁移 engines：
  - `netlify/functions/lib/reportEngine/baselineLoadEngine.ts`
  - `netlify/functions/lib/reportEngine/enhancedEnergyEngine.ts`
  - `netlify/functions/lib/reportEngine/distributedEnergyAssetsEngine.ts`（升级）
  - `netlify/functions/lib/reportEngine/profileRenderer.ts`
- 最小侵入接入：
  - `netlify/functions/lib/reportEngine/engine.ts`
  - `netlify/functions/lib/report/prepareSubmissionRaw.ts`（canonical 回写）
- 测试与文档：
  - `scripts/test-*.ts`（新增/更新至少 6 个场景）
  - `docs/ENGINES_OVERVIEW.md`
  - `docs/PROFILE_RENDER_RULES.md`
  - `docs/ARCH_CHANGELOG.md`（每步增量记录）

## 实施策略

- 先“只增不改” canonical API，再替换执行路径；
- Baseline engine Always-run，Enhanced engine Conditional-run；
- Profile Renderer 只做过滤/重排，不做计算；
- 每步可回滚：新增层可单独移除，不破坏 legacy slot 注入链路。
