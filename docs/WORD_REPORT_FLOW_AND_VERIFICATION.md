# Word 报告全链路梳理与验证清单

## 一、调用链对照表

### 1. Submit 路径（技师提交）

| 步骤 | 位置 | 说明 |
|------|------|------|
| 入口 | `netlify/functions/submitInspection.ts` handler | POST，body 为 raw 表单 JSON |
| 保存 | `save(inspection_id, { raw, report_html, findings, limitations }, event)` | 写入 Blob store `inspections` |
| 照片 | `uploadPhotoToFinding(...)` | 按 finding 上传 base64 照片 |
| **生成 Word** | **同进程** `generateMarkdownWordBuffer(inspectionForReport, event)` | 使用与 Review 完全相同的逻辑，无跨请求 |
| 写入 Blob | `saveWordDoc(\`reports/${inspection_id}.docx\`, buffer, event)` | 写入 Blob store `word-documents`，key 固定 |
| 发邮件 | `sendEmailNotification(..., download_word_url: \`${baseUrl}/api/downloadWord?inspection_id=...\`)` | 邮件内“下载 Word”指向该 URL |
| 触发生成？ | 是，同进程内直接调用 | 不再通过 fetch 调用 generateMarkdownWord |
| 下载链接指向 | `/api/downloadWord?inspection_id=...` → 读 Blob `reports/{id}.docx` | 与存储 key 一致 |

### 2. Review 页「Generate Word」路径

| 步骤 | 位置 | 说明 |
|------|------|------|
| 入口 | `src/components/ReviewPage.tsx` handleGenerateMarkdownWord | 请求 `/.netlify/functions/generateMarkdownWord?inspection_id=...` |
| 后端 | `netlify/functions/generateMarkdownWord.ts` handler | GET，从 query 取 inspection_id |
| 数据 | `get(inspectionId, event)` | 从 Blob store `inspections` 读 |
| 生成 | `generateMarkdownWordBuffer(inspection, event)` | **与 Submit 共用同一函数**，同一模板、同一数据源、同一渲染 |
| 返回 | 直接返回 buffer（base64 body） | 不写 Blob，仅浏览器即时下载 |
| 上传？ | 否 | Review 页只负责“下载一份”，不负责写入 Blob |
| 邮件下载与 Review 下载是否一致 | 是 | 邮件下载来自 Blob（Submit 已写入）；Review 下载来自同一条生成管道，内容一致；若 Submit 已写入 Blob，downloadWord 读的即同一份 |

### 3. 邮件下载路径

| 步骤 | 位置 | 说明 |
|------|------|------|
| 按钮 URL | 邮件内 `download_word_url` | `${baseUrl}/api/downloadWord?inspection_id=...` |
| 接口 | `netlify/functions/downloadWord.ts` handler | GET，query 取 inspection_id |
| 读 Blob | `getWordDoc(\`reports/${inspectionId}.docx\`, event)` | 优先 `reports/{id}.docx`，fallback `word/{id}.docx` |
| 若无则按需生成 | `fetch(api/generateMarkdownWord?inspection_id=...)` → `saveWordDoc(reports/{id}.docx)` | 与 Generate Word 同一 pipeline，写回 Blob 后返回 |
| 用哪个 key | `reports/{inspection_id}.docx` | 与 Submit 写入的 key 一致 |
| 版本 | 同一份 canonical 数据 + 同一 generateMarkdownWordBuffer | 无两套模板/两套数据源 |

---

## 二、根因与修复说明

### 问题根因（已确认）

1. **Submit 原逻辑**：提交成功后通过 **HTTP fetch** 调用 `getBaseUrl()/api/generateMarkdownWord?inspection_id=...`。
2. **跨请求时序**：generateMarkdownWord 在**另一次** serverless 调用中执行，会再次 `get(inspection_id, event)`。Netlify Blob 可能存在**最终一致性**，新 invocation 可能尚未读到刚写入的 inspection → **404 Inspection not found** → 未生成、未写 Blob。
3. **超时**：生成 Word 耗时较长，Submit 内 fetch 可能超时（如 26s），导致 `genRes.ok === false` 或抛错，仅 `console.warn`，不重试、不写 Blob。
4. **两路径一致性问题**：若 fetch 成功，理论上与 Review 一致；但因 404/超时导致经常未写入，邮件链接只能走 downloadWord 的“按需生成”，而按需生成与 Submit 内 fetch 可能在不同时间、不同数据快照下执行，易出现“邮件下载 ≠ Review 下载”的观感。

### 修复方案（已实现）

- **单一权威路径**：抽出 `generateMarkdownWordBuffer(inspection, event)`（`netlify/functions/generateMarkdownWord.ts`），所有需要 docx 的地方统一用该函数。
- **Submit 同进程生成**：Submit 在 `save(inspection)` 和照片上传后，**不再 fetch**，而是直接：
  1. 构造 `inspectionForReport = { inspection_id, raw, report_html, findings, limitations }`（即当前请求内已有数据）；
  2. 调用 `generateMarkdownWordBuffer(inspectionForReport, event)`；
  3. 成功则 `saveWordDoc(\`reports/${inspection_id}.docx\`, buffer, event)`；
  4. 失败仅打日志，不阻断提交；邮件中的下载链接仍可用，downloadWord 会按需生成并写 Blob。
- **可观测性**：Submit 中增加 `[submit] Generating Word in-process`、`[submit] Word report saved to blob key=... size=...`、失败时 `[submit] Word generation at submit failed ...` + stack。
- **存储 key 统一**：始终使用 `reports/{inspection_id}.docx`；downloadWord 与 Submit 一致。
- **邮件下载**：仍为 `/api/downloadWord?inspection_id=...`，先读 Blob，无则再调 generateMarkdownWord（同一 pipeline）并写 Blob 后返回，保证“邮件下载文件 == Blob 文件”；与 Review 点击 Generate Word 为同一生成逻辑，内容一致。

---

## 三、验证清单

### 本地 / Staging

- [ ] **Submit 后 Blob 有文件**：技师 Submit 一次，不点 Review 的 Generate Word；检查 Netlify Blob store `word-documents` 下是否存在 `reports/{inspection_id}.docx`（或通过 downloadWord 能下载到同 inspection_id 的 docx）。
- [ ] **日志**：Submit 日志中可见 `[submit] Generating Word in-process for <id>` 且 `[submit] Word report saved to blob key=reports/<id>.docx size=<n>`；若失败，可见 `[submit] Word generation at submit failed` 及原因。
- [ ] **邮件下载与 Review 下载一致**：同一 inspection_id，先通过邮件“下载 Word”得到 A.docx，再在 Review 页点击“Generate Word”得到 B.docx（或先 Review 再邮件）；对比两者 **sha256** 一致（或至少内容/页数/关键字段一致）。
- [ ] **downloadWord 先读 Blob**：Submit 成功后，直接打开邮件中的下载链接，应直接返回文件（不触发按需生成）；日志中为“从 Blob 读取”而非“generating on-demand”。

### 幂等与异常

- [ ] **重复 Submit**：同一表单不重复提交（业务上通常不会同一 inspection_id 提交两次；若存在“重试提交”，确认不会用同一 inspection_id 覆盖写入 Blob 导致异常）。
- [ ] **生成失败不阻断提交**：模拟生成失败（如临时去掉模板文件或抛错），Submit 仍返回 200，inspection 已保存，邮件照发；点击邮件下载链接会走 downloadWord 的按需生成。
- [ ] **图片**：确认 Submit 时 photo 已上传且 inspection 中 findings 的 photo_ids 已更新；generateMarkdownWordBuffer 使用的是 Submit 传入的 `inspectionForReport`，包含当前 findings，故报告应含图。

### 线上

- [ ] **环境变量**：`baseUrl`、Blob 相关配置、Netlify 函数超时与内存满足“同进程生成”耗时（无需再跨 HTTP 调用）。
- [ ] **灰度**：先在 staging 完整走一遍上述清单，再发布生产；发布后抽查 1～2 单 Submit → 邮件下载 → 与 Review 下载 hash 一致。

### 回归用例（简要）

| 场景 | 预期 |
|------|------|
| 技师 Submit → 不点 Generate Word → 点邮件“下载 Word” | 能下载，且文件来自 Blob（Submit 已写入） |
| 同一 inspection_id：邮件下载 A + Review 下载 B | A 与 B 内容一致（或 sha256 一致） |
| Submit 时 Word 生成抛错 | 提交仍成功，邮件可发；点邮件下载可触发按需生成并下载 |
| 仅点 Review “Generate Word”，未先 Submit | 仍能下载（get inspection → generateMarkdownWordBuffer → 返回），不写 Blob 不影响邮件链接（邮件链接需先 Submit 才有） |

---

## 四、工程加固（6 项）

| 项 | 说明 | 关键文件 |
|----|------|----------|
| 1 元信息 | docx 内写入 docProps/custom.xml：inspection_id、data_version、template_version、generator_version | `generateMarkdownWord.ts`（injectDocxReportMetadata） |
| 2 超时与降级 | Submit 内生成超时 12s；失败则 report_status=failed，邮件中 download_word_url 指向 review 页 | `submitInspection.ts` |
| 3 幂等锁 | downloadWord 按需生成前 tryAcquireWordGenLock，未抢到则轮询 getWordDoc | `downloadWord.ts`、`lib/store.ts`（lock/wordgen/{id}） |
| 4 Review 区分 | wordStatus API 返回 exists；Review 页“Download Generated Word”下 Blob，“Generate Preview”实时生成不写 Blob | `wordStatus.ts`、`ReviewPage.tsx` |
| 5 原子性 | 仅 saveWordDoc 成功后才 save inspection 的 report_status=generated、report_blob_key | `submitInspection.ts` |
| 6 结构化日志 | 三条路径均打 logWordReport：inspection_id、trigger、duration_ms、result、error_message、blob_key | `lib/wordReportLog.ts`，submitInspection / downloadWord / generateMarkdownWord |

---

## 五、关键文件索引

| 用途 | 文件路径 |
|------|----------|
| Submit 接口 | `netlify/functions/submitInspection.ts` |
| 生成 Word 权威实现 | `netlify/functions/generateMarkdownWord.ts`（`generateMarkdownWordBuffer` + handler） |
| Review 页「Generate Word」 | `src/components/ReviewPage.tsx`（请求 generateMarkdownWord） |
| 邮件发送 | `netlify/functions/lib/email.ts`（sendEmailNotification，download_word_url） |
| Blob 存/取 Word | `netlify/functions/lib/store.ts`（saveWordDoc / getWordDoc，store 名 `word-documents`） |
| 下载 Word 接口 | `netlify/functions/downloadWord.ts` |
| Word 是否已生成 | `netlify/functions/wordStatus.ts`（GET ?inspection_id=） |
| 报告元信息/日志 | `netlify/functions/lib/wordReportLog.ts` |
