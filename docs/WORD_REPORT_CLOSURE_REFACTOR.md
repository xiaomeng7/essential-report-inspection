# Word 报告系统收口重构说明

**目标**：Word 只在 Submit 时生成一次，之后只允许下载，不允许再次生成。  
**执行时间**：2026-02

---

## 最终规则（已严格执行）

| 规则 | 说明 |
|------|------|
| 1) Word 仅 Submit 时生成一次 | 生成逻辑只存在于 `submitInspection` 中，同进程调用 `generateMarkdownWordBuffer` 并写入 Blob |
| 2) 邮件 / 下载只读 Blob | `downloadWord` 仅根据 `report_blob_key` 或兼容路径读取已存在 Blob，绝不生成 |
| 3) Review 页不生成 Word | 不显示「Generate Word」按钮；仅用于 completeness/error review 与下载已有报告 |
| 4) 未通过完整性不得 Submit | 前端与后端双重校验：必填项、有问题的 GPO/灯具房间需至少一张照片 |

---

## A) 被删除/禁用的接口与 UI

### 接口

| 接口 | 原行为 | 现行为 |
|------|--------|--------|
| `GET /api/generateMarkdownWord?inspection_id=...` | 按 id 拉取 inspection 并生成 Word 返回 | **403**，body：`{ error: "word_generation_disabled", message: "Word report can only be generated at Submit. Use the download link (email or Review page) to get the existing report." }` |
| `GET /api/downloadWord?inspection_id=...` 的 fallback 生成 | Blob 不存在时调用 generateMarkdownWord 生成并写入 | **已移除**。Blob 不存在时返回 **409**，body：`{ error: "report_not_available", message: "Word report is only generated once at Submit. No report is available for this inspection." }` |

### UI（Review 页）

| 元素 | 原行为 | 现行为 |
|------|--------|--------|
| 「Generate Preview」按钮 | 调用 generateMarkdownWord 并下载 | **已移除** |
| 成功横幅 | 「Add photo evidence below, then generate your report.」 | 改为「Word report was generated at submit. Download it below or use the link from your email.」 |
| 无 Blob 时的说明 | 无 | 显示「Word report was not generated for this inspection. It is only generated once at Submit.» |
| 生成中/错误状态 | isGeneratingMarkdownWord、markdownWordError | **已移除** |

---

## B) 新增的校验规则

### 前端（Wizard）

- **完整性错误即禁止提交**：在最后一步，`validatePhotoEvidenceBeforeSubmit(state)` 非空时：
  - Submit 按钮 **disabled**
  - 页面顶部展示缺失项提示（如「请为有问题的 GPO 房间「xxx」上传至少一张照片证据后再提交。」）
- 规则与原先一致：有 `issue` 的 GPO 房间、有 `issues` 的灯具房间，必须至少 1 张照片。

### 后端（submitInspection）

- **地址**：沿用原有校验（address_place_id + suburb/state/postcode）。
- **照片证据**（与前端一致）：
  - `gpo_tests.rooms` 中：`room_access !== "not_accessible"` 且 `issue` 有值且 ≠ "none" 时，该房间 `photo_ids` 至少 1 项。
  - `lighting.rooms` 中：`room_access !== "not_accessible"` 且 `issues` 存在非 none/other 项时，该房间 `photo_ids` 至少 1 项。
- 未通过则 **400**，body：`{ error: "incomplete_evidence", message: "Please add at least one photo for the GPO/lighting room with an issue: ..." }`。

---

## C) 数据模型（inspection）

| 字段 | 含义 |
|------|------|
| `report_status` | `"pending"` \| `"generated"` \| `"failed"`；仅 Blob 写成功时为 `generated` |
| `report_blob_key` | 如 `reports/{inspection_id}.docx`，Submit 成功写 Blob 后写入 |
| `report_generated_at` | 报告生成时间（ISO 字符串） |
| `report_hash` | 报告文件 sha256 hex，用于一致性校验；Submit 写 Blob 后写入 |

Submit 成功后报告版本即锁定，不再重新生成。

---

## D) Submit 为唯一生成点后的系统行为

1. **用户在前端完成向导并点击 Submit Inspection**
   - 前端：最后一步先做完整性校验（必填 + 有问题的房间需照片）；不通过则按钮 disabled 并提示，通过则发送 `POST /api/submitInspection`。
   - 后端：先做地址与照片证据校验，不通过则 400；通过则生成 `inspection_id`、落库、**同进程调用 `generateMarkdownWordBuffer`**，写 Blob，更新 `report_status` / `report_blob_key` / `report_generated_at` / `report_hash`，发邮件（邮件内下载链接指向 `downloadWord`）。

2. **用户通过邮件或 Review 页下载 Word**
   - 请求 `GET /api/downloadWord?inspection_id=...`。
   - 后端：读 inspection，取 `report_blob_key`（或兼容 `reports/{id}.docx`、`word/{id}.docx`），仅当对应 Blob 存在时返回 200 + docx；否则 409，不生成。

3. **Review 页**
   - 仅展示「Download Word Report」（当 wordStatus 显示 exists 时）；无「Generate Word」或「Generate Preview」。
   - 若 Blob 不存在，展示说明：报告仅在 Submit 时生成一次。

4. **多次下载 / 邮件 / Review 下载**
   - 同一 inspection_id 下，所有下载均为同一份 Blob，内容与 hash 一致。

---

## E) 回归验证要点

| 场景 | 预期 |
|------|------|
| 缺照片时点击 Submit | 前端：按钮可禁用并提示；若请求仍发出，后端 400 incomplete_evidence |
| Submit 成功 | 生成 1 份 Word，Blob 存在，`report_status=generated`，`report_blob_key`、`report_hash` 已写 |
| 邮件 / 多次 downloadWord | 同一 inspection_id 返回同一 docx，sha256 一致 |
| Review 页 | 无 Generate Word 按钮；有 Blob 时仅「Download Word Report」 |
| GET generateMarkdownWord | 403，不生成 |
| GET downloadWord 且无 Blob | 409，不生成 |

现有脚本 `npx tsx scripts/regression-section-10-11.ts` 流程为：Submit → 三次 downloadWord；在收口后仍适用（Submit 已写入 Blob，三次下载应 200 且 sha256 一致）。

---

## F) 回归验证结果（收口后）

| 脚本 | 结果 |
|------|------|
| `npx tsx scripts/verify-word-report-consistency.ts` | **5/5 PASS**（Case 1 三路 sha256 一致；Case 4 generateMarkdownWord 返回 403；失败场景 downloadWord 返回 409） |
| `npx tsx scripts/regression-section-10-11.ts` | **PASS**（三份 docx sha256 一致，禁止字符串 0 命中） |
