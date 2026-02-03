# 自定义 Finding 库与 9 维度使用说明

## 一、9 个维度当前是否被使用？

工程师在 Review 页补全的 **9 个维度** 为：

| 维度 | 说明 | 是否参与 Word 报告 | 是否参与计算/优先级 |
|------|------|--------------------|----------------------|
| **priority** | 优先级（IMMEDIATE / RECOMMENDED_0_3_MONTHS / PLAN_MONITOR） | ✅ 是：报告分组、CapEx 表、Executive 摘要 | ✅ 是：直接写入 `finding.priority`，报告全链路使用 |
| **title** | 显示标题 | ✅ 是：Finding 标题、CapEx 项名 | 否 |
| **safety** | 安全影响 | 否 | ❌ 否（见下） |
| **urgency** | 紧急程度 | 否 | ❌ 否 |
| **liability** | 责任/合规 | 否 | ❌ 否 |
| **budget_low** | 预算下限 | 否 | ❌ 否 |
| **budget_high** | 预算上限 | 否 | ❌ 否 |
| **severity** | 严重程度 1–5 | 否 | ❌ 否 |
| **likelihood** | 发生可能性 1–5 | 否 | ❌ 否 |
| **escalation** | 升级风险 | 否 | ❌ 否 |

### 为什么 safety / urgency / liability 等“没用到”？

- **标准 Finding**：优先级由 `rules.yml` 的 `findings[id]`（safety/urgency/liability）+ `applyPriority()` 计算得出。
- **自定义 Finding（CUSTOM_GPO_* / CUSTOM_LIGHTING_*）**：不入 `rules.yml`，**不经过** `evaluateFindings` → `applyPriority`；工程师在弹窗里选的 **priority** 直接写入 `data.findings`，报告只用这个 priority。
- 因此对自定义 Finding 而言，**safety、urgency、liability、budget_low、budget_high、severity、likelihood、escalation 共 8 个维度目前只存不用于**：
  - 不参与 Word 报告生成（报告只看 priority + title）；
  - 不参与 `derivePropertySignals`（该逻辑用的是另一套 D1–D9 字段，且未从 `custom_findings_completed` 取数）；
  - CapEx 行的预算来自 `responses.yml` 或 `finding_profiles` 的 `budget_band`，**未**使用 `custom_findings_completed` 的 budget_low/budget_high。

### 若希望 8 个维度也参与

可在后续迭代中：

1. **优先级**：用 safety/urgency/liability 调用 `applyPriority()` 得到 priority，替代工程师直接选 priority（或二者并存、以计算值为建议）。
2. **CapEx**：对 CUSTOM_*，CapEx 行优先用 `custom_findings_completed` 的 budget_low/budget_high。
3. **Property 信号**：把 9 维映射为 `FindingDimensions`（D1–D9），传入 `derivePropertySignals`，参与 overall_health 等。

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

## 三、小结

- **9 维度里**：目前真正参与 Word 和计算的只有 **priority**（和 title）；其余 8 个只存不用，但为“库 + 以后参与计算”预留。
- **自定义 Finding 库**：可以单独做，技师下次可从库选，工程师可看统计并一键入常用库；**第一步**已做「界面能直观改 9 个维度」的库管理 + 后端 API。
