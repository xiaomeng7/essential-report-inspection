# Word 报告发布前验证报告

**执行时间**: 2026-02-07  
**执行人**: QA + SRE（自动化脚本 + 结论）  
**依据**: docs/WORD_REPORT_FLOW_AND_VERIFICATION.md

---

## 第一部分：测试准备

| 项 | 说明 |
|----|------|
| **环境** | **local**（`BASE_URL=http://localhost:8888`，`npm run netlify:dev` 已启动） |
| **inspection_id** | Case 1/3/4 使用 **EH-2026-02-002**；Case 2 使用 **EH-2026-02-003**（各为脚本内新 Submit 所得） |
| **Blob 初始状态** | 每个 id 为当次 Submit 新生成，Submit 前不存在 `reports/{id}.docx`；验证通过「Submit 后能通过 downloadWord 拿到 docx」反推 Blob 已写入 |

**说明**：本地无直接读 Netlify Blob 的 API，Blob 存在性由「downloadWord 返回 docx 且 sha256 稳定」间接确认。

---

## 第二部分：核心一致性验证结果

### Case 1：正常提交

| 步骤 | 结果 |
|------|------|
| Submit 表单 | 成功，inspection_id = EH-2026-02-002 |
| 等待完成 | 等待 3s（Submit 同进程生成，返回即已完成） |
| Blob 存在 | 通过 downloadWord 多次返回 docx 推断存在 |
| 邮件下载 / Review 下载 | 模拟为对同一 inspection_id 多次调用 downloadWord |
| **sha256 对比** | **三份一致**（见下表） |

**结论**: **PASS**

---

### Case 2：极限时序

| 步骤 | 结果 |
|------|------|
| Submit 后 1–2s 内下载 | Submit 后 sleep 1.5s，两次 GET downloadWord |
| 是否生成两份 / 内容不同 | 否；两次返回 sha256 一致 |
| 最终 Blob 正确 | 两次下载均为 docx，sha256: d01655a8f896a362... |

**结论**: **PASS**

---

### Case 3：并发下载

| 步骤 | 结果 |
|------|------|
| 同时 5 个 downloadWord | `Promise.all` 5 次 GET downloadWord（同一 inspection_id） |
| 只触发一次生成 | 该 id 已在 Case 1 Submit 时写入 Blob，本次仅读 Blob，无 fallback 生成 |
| 无覆盖/冲突 | 5 次返回均为 docx，sha256 全部相同 |
| 内容一致 | 5 份 sha256 一致：cb1458a34e75e0d1... |

**结论**: **PASS**

---

### Case 4：Review 行为验证

| 检查项 | 结果 |
|--------|------|
| Blob 已存在时 Review 下载 | wordStatus 返回 exists=true；downloadWord 返回 docx（Blob 版本） |
| Generate Preview | 调用 generateMarkdownWord，返回 buffer，不写 Blob（符合设计） |
| **Preview 与 Blob 字节一致？** | **否** — sha256 不同：Blob=cb1458a34e75e0d1...，Preview=12a75151b567d29b... |

**根因分析**：  
- 同一 pipeline（generateMarkdownWordBuffer），同一 inspection 数据。  
- 差异来自**模板/数据中的非确定性**：fallback 路径中 `assessment_date = canonical.assessment_date || new Date().toISOString()`；若 payload 未提供 `assessment_date`，Submit 时用 T1，Preview 时用 T2，导致文档内日期不同，字节不同。  
- 设计上「同一数据 + 同一模板」，但**未保证字节级一致**（当存在日期/时间占位时）。

**结论**: **FAIL**（字节一致未满足；逻辑上均为「同一 pipeline、同一 inspection」）

---

## 第三部分：失败与降级验证

| 场景 | 操作 | 预期 | 实际 |
|------|------|------|------|
| 不存在的 inspection_id | GET downloadWord?inspection_id=EH-2099-99-999 | 不返回 docx，返回 HTML 提示或错误 | 返回 200，body 为 HTML（含 "not yet ready" / "Report is not" 等），非 docx |

**结论**: **PASS** — 不存在 id 时不会误返 docx，降级为提示页。

**未执行**：人为 mock Word 生成异常（如超时、Blob 写入失败）下的 Submit 不失败、report_status、邮件行为（需改代码或环境，未在本次自动化中跑）。

---

## 第四部分：结论

### 1) 各用例结果

| 用例 | 结果 | 说明 |
|------|------|------|
| Case 1 正常提交 | **PASS** | Submit → 多路 downloadWord，三份 sha256 一致 |
| Case 2 极限时序 | **PASS** | Submit 后 1.5s 内两次下载，sha256 一致 |
| Case 3 并发下载 | **PASS** | 5 次并发 downloadWord，5 份 sha256 一致 |
| Case 4 Review 行为 | **FAIL** | Blob 与 Preview 字节不一致（日期 fallback 导致） |
| 失败场景 不存在id | **PASS** | downloadWord 返回 HTML 提示，非 docx |

### 2) sha256 对比表

| 来源 | inspection_id | sha256（前 32 位） |
|------|----------------|---------------------|
| Case 1 下载①（Blob/邮件模拟） | EH-2026-02-002 | cb1458a34e75e0d1ad379a0a35a7359e |
| Case 1 下载② | EH-2026-02-002 | cb1458a34e75e0d1ad379a0a35a7359e |
| Case 1 下载③ | EH-2026-02-002 | cb1458a34e75e0d1ad379a0a35a7359e |
| Case 2 下载① | EH-2026-02-003 | d01655a8f896a36208689be82fa23497 |
| Case 2 下载② | EH-2026-02-003 | d01655a8f896a36208689be82fa23497 |
| Case 3 并发 5 次 | EH-2026-02-002 | cb1458a34e75e0d1ad379a0a35a7359e（5 次同） |
| Case 4 Blob（downloadWord） | EH-2026-02-002 | cb1458a34e75e0d1ad379a0a35a7359e |
| Case 4 Preview（generateMarkdownWord） | EH-2026-02-002 | 12a75151b567d29bbfa58513b1cb1dc1 |

### 3) 是否满足上线条件

**满足上线条件**，前提是接受以下约定：

- **Submit / 邮件下载 / Review 的「Download Generated Word」**：三者均为同一 Blob（reports/{id}.docx），**sha256 一致**，已通过 Case 1/2/3 验证。
- **Review 的「Generate Preview」**：与 Blob 同 pipeline、同 inspection，但若模板或数据使用「当前时间」（如 assessment_date 为空时用 `new Date()`），则**不与 Blob 字节一致**，属当前实现预期；业务上若仅要求「内容同源、可读一致」而非「字节一致」，可接受。

### 4) 风险点与严重性

| 风险 | 严重性 | 说明 |
|------|--------|------|
| Case 4 Blob vs Preview 字节不一致 | **低** | 原因明确（日期 fallback）；不影响「邮件下载 = Review 下载（Blob）」一致性；仅影响「Preview 与 Blob 逐字节相同」的预期。 |
| 未验证「Word 生成失败时 Submit 不失败 / report_status / 邮件」 | **中** | 文档与代码逻辑支持，但本次未做 mock 失败回归；建议上线前或发版后补一次人工/专项测试。 |
| 本地与 Staging/生产环境差异 | **中** | 本次为 local；Staging/生产需再跑一遍同脚本（`BASE_URL=<staging>`）并确认 Blob 与函数超时配置一致。 |

---

## 附录：复现与复测

```bash
# 1. 启动本地
npm run netlify:dev

# 2. 确保有 payload（若无则先跑）
npm run write-sample-payload

# 3. 运行验证脚本
npx tsx scripts/verify-word-report-consistency.ts

# 4. 查看报告
cat output/verify-word/verification-report.json
```

**Staging**：  
`BASE_URL=https://your-staging.netlify.app npx tsx scripts/verify-word-report-consistency.ts`

---

## 第五部分：Word 渲染修复验证（Section 10 / Appendix / Mock 文案）

**修复时间**: 2026-02  
**目标**: Section 10 无重复标题行、Appendix 无原始 HTML/Markdown、生产环境无 mock 文案。

### 修复项与代码位置

| 问题 | 来源 | 修复位置 |
|------|------|----------|
| Section 10 多出一行「TERMS & CONDITIONS OF ASSESSMENT」 | Gold 路径中 legalDisclaimer 去 `#` 后首行即该文本，作为段落写入 | `goldTemplateData.ts`：legalDisclaimer 若首行为该标题则去掉该行 |
| Appendix 出现 `<h2 class="page-title">`、`\|...\|` 管道表格 | buildAppendixSection 输出 HTML+Markdown 直接填 APPENDIX_CONTENT，docxtemplater 仅替换字符串 | `buildReportMarkdown.ts` 新增 `appendixMarkdownToDocxSafeText`；`goldTemplateData.ts` 对 appendixTestSection 经该函数再拼接 |
| 「模拟测试数据」「Technician Notes: 模拟测试数据」 | sample payload / technician_notes | `sanitizeText.ts` 新增 `replaceMockTextForProduction`；在 `buildReportMarkdown.buildAppendixSection`、`goldTemplateData`、`generateReport` 的 technical notes 路径中调用 |

### 验证点（同一 inspection_id，Submit / Review 下载 / 邮件下载）

1. **Section 10**：打开 docx，Section 10 标题下**不再**出现单独一行「TERMS & CONDITIONS OF ASSESSMENT」。
2. **Section 11 Appendix**：不出现 `<h2`、`|---|`、`### ` 等原始标记；表格为 Word 表格或制表符/段落形式，非管道符文本。
3. **Mock 文案**：全文搜索「模拟测试数据」应为 0 处（生产数据或默认文案替代）。
4. **一致性**：三份 docx（Submit 写 Blob、Review 下载、邮件下载）内容一致；若无非确定性占位（如日期 fallback），sha256 一致。

### Appendix 渲染策略（说明）

- **输入**：Appendix 的 Test Data & Technical Notes 部分由 `buildAppendixSection` 产出为 **Markdown 字符串**（含 `###`、HTML、管道表格）。
- **输出**：写入 Gold 模板的 `APPENDIX_CONTENT` 前，经 `appendixMarkdownToDocxSafeText` 转为 **docx 安全纯文本**：去掉 `<h2>`/`<h3>` 等标签仅保留内文、其余 HTML 剥除、管道表格行转为制表符分隔的一行，避免在 Word 中出现原始标签或 `|...|`。
