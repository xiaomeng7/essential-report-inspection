# 自定义 Finding 库与 9 维度使用说明

## 一、报告生成用了哪些收集到的信息？几个维度？

报告生成**会用到当前收集到的主要信息**，**9 个维度都参与**（有的直接进报告，有的参与计算）。

### 数据来源一览

| 数据来源 | 用途 |
|----------|------|
| `inspection.findings`（Review API） | Finding 列表、id、基础 priority/title；报告以之为基础并做一次 enrich |
| `inspection.raw.custom_findings_completed` | 每条 finding 的 9 维：参与优先级计算、CapEx、OVERALL_RISK_LABEL 的 D1–D9 |
| `inspection.raw.finding_dimensions_debug` | Admin 调试覆盖：与上面合并后参与优先级计算、标题、预算（不参与 OVERALL_RISK_LABEL 的 D1–D9） |
| `inspection.raw` → canonical（normalizeInspection） | 物业地址、评估日期、test_data、technician_notes、limitations 等 |
| `finding_profiles` / `responses.yml` | 标准 finding 的标题、预算带、D1–D9 映射；无 custom 时的回退 |

### 9 个维度在报告中的使用（当前实现）

| 维度 | 说明 | 是否参与报告 | 具体用途 |
|------|------|--------------|----------|
| **priority** | 优先级 | ✅ 是 | 报告分组、CapEx 表、Executive 摘要、评分；可来自工程师选择或由 6 维计算得出 |
| **title** | 显示标题 | ✅ 是 | Finding 标题、CapEx 项名、top findings 等 |
| **safety** | 安全影响 | ✅ 是 | 参与自定义 finding 的 `computeCustomFindingPriority`；映射到 D1–D9 → OVERALL_RISK_LABEL |
| **urgency** | 紧急程度 | ✅ 是 | 同上（优先级计算 + D1–D9） |
| **liability** | 责任/合规 | ✅ 是 | 同上 |
| **budget_low** / **budget_high** | 预算区间 | ✅ 是 | CapEx 表、CAPEX_RANGE、评分模型中的预算汇总 |
| **severity** / **likelihood** | 严重程度 / 可能性 1–5 | ✅ 是 | 参与优先级计算（如 severity×likelihood 升级）；映射到 D1–D9 |
| **escalation** | 升级风险 | ✅ 是 | 参与优先级计算与 D1–D9 映射 |

结论：**目前报告生成使用了所有收集到的 9 个维度**；优先级既可人工选也可由 safety/urgency/liability/severity/likelihood/escalation 计算；预算与 OVERALL_RISK_LABEL（D1–D9）均使用上述维度。

### OVERALL_RISK_LABEL

- **OVERALL_RISK_LABEL** 的 D1–D9 来自 `custom_findings_completed` 映射（未直接合并 debug 覆盖）。调试里改的优先级等会通过优先级分组、CapEx、Executive 等**间接受影响**，当前设计下无需再让 debug 直接参与 D1–D9 计算。

---

## 二、自定义 Finding 库 + 技师选用 + 工程师“一键入常用库”

### 目标

- **自定义 Finding 库**：单独维护一份“自定义问题库”，每条 = 标题 + 9 维度。
- **技师端**：选 “Other” 时既可手输描述，也可**从库里选**一条（带出 9 维度，无需工程师再填）。
- **工程师端**：看到某条被**多次使用**的统计，可**一键加入常用库**（常用库在技师端优先展示或单独 Tab）。

### 实现要点（可分期）

| 能力 | 说明 |
|------|------|
| **库存储** | Blob 或 JSON 存「自定义 Finding 库」列表（id, title, 9 维度, is_common?, use_count?）。 |
| **库管理界面** | 管理后台：列表 + 新增/编辑/删除；编辑时**直观改 9 个维度**（与现有 CustomFindingsModal 同构）。 |
| **技师选库** | Wizard 里 GPO/灯具选 “Other” 时：先选「从库中选」或「手动输入」；若从库选，则带出 library_id + 9 维度，提交时写入 raw，不再产生 pending。 |
| **使用统计** | 提交或保存时：若某次检查用了库中某条，则对该条 `use_count += 1`（或记录 inspection_id 列表便于统计）。 |
| **一键入常用库** | 工程师在 Review 或管理页看到「使用次数」或「最近使用的自定义项」；对某条可点「加入常用库」置 `is_common = true`，技师端「从库中选」时常用库置顶或单独展示。 |

### 当前已实现（第一步）

- **管理界面**：在配置管理（Config Admin）中增加 **「自定义 Finding 库」** Tab，可：
  - 查看库列表；
  - 新增/编辑/删除库条目；
  - **直观编辑每条目的 9 个维度**（与 Review 页 9 维表单一致）。
- **后端**：`/api/customFindingLibrary` 的 GET/POST/PUT/DELETE，数据存 Blob `custom-finding-library`，键 `entries`。

### 后续可做（二期）

- Wizard 选 “Other” 时支持「从库中选」并带出 9 维度；
- 统计每条被使用的次数并在管理页展示；
- 「加入常用库」与技师端「常用」置顶/单独 Tab。

---

## 三、9 维全局（Config）与单次检查调试

### 9 维全局（影响所有报告）

在 **Config Admin → 9 维全局**（`/admin/config?tab=findingDimensionsGlobal`）中按 **Finding ID** 设置的维度会写入 Blob `config/finding_dimensions_global.json`，报告生成时**对所有报告生效**：

- **入口**：配置管理页顶部「9 维全局」链接或 Tab「9 维全局」。
- **优先级**：若为某 finding_id 设置了 `priority`，所有报告中该 Finding 会使用该优先级，并标记 `override_reason: "Global 9-dimension override"`。
- **合并顺序**：`custom_findings_completed` → **全局覆盖**（Config 9 维全局）→ **单次调试覆盖**（见下）。单次调试覆盖优先于全局。

### 单次检查调试（仅影响该次报告）

原「Finding 9 维调试」页已合并进 Config：访问 `/admin/findings-debug` 会重定向到 `/admin/config?tab=findingDimensionsGlobal`。若需**只改某一次检查**的维度，可继续使用后端 API 写入 `raw.finding_dimensions_debug[finding_id]`（例如由其他工具或后续单次调试界面调用）。

实现位置：`netlify/functions/lib/customFindingPriority.ts` 的 `enrichFindingsWithCalculatedPriority` 会合并 `options.globalOverrides`（来自 Config Blob）与 `inspection.raw.finding_dimensions_debug`，再参与优先级计算与最终报告。

---

## 四、小结

- **9 维度**：**全部参与**报告生成——priority/title/budget 直接进报告与 CapEx；safety/urgency/liability/severity/likelihood/escalation 参与优先级计算并映射到 D1–D9（OVERALL_RISK_LABEL）。报告生成已使用当前收集到的主要信息。
- **Admin 调试覆盖**：在 `/admin/findings-debug` 中修改的维度会参与报告生成（优先级、标题、预算及 6 维判断逻辑）；OVERALL_RISK_LABEL 为间接受影响，当前设计即可。
- **自定义 Finding 库**：可以单独做，技师下次可从库选，工程师可看统计并一键入常用库；**第一步**已做「界面能直观改 9 个维度」的库管理 + 后端 API。
