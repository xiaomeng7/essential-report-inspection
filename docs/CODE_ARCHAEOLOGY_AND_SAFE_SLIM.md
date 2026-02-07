# 代码体检报告：安全瘦身与技术债清理

基于静态引用、路由与运行路径分析，**不重构核心逻辑、不改 API 行为、不改变已验证的 Submit/Review/downloadWord 流程**。

---

## 第一阶段：当前权威路径（DO NOT TOUCH）

以下路径为**已修复且验证的 Word 报告主链路**，禁止删除或改行为。

### 1) Word 生成主 pipeline

| 文件路径 | 用途 |
|----------|------|
| `netlify/functions/generateMarkdownWord.ts` | `generateMarkdownWordBuffer` 定义；handler 供 Review 与 downloadWord fallback 调用 |
| `netlify/functions/lib/store.ts` | `saveWordDoc` / `getWordDoc` / `hasWordDoc`；Word 锁 `tryAcquireWordGenLock` / `releaseWordGenLock` |
| `netlify/functions/lib/wordReportLog.ts` | 三条路径结构化日志 |
| `netlify/functions/lib/renderDocx.ts` | `renderDocx` / `renderDocxGoldTemplate`（generateMarkdownWord 使用） |
| `netlify/functions/lib/goldTemplateData.ts` | Gold 模板数据（generateMarkdownWord 使用） |
| `netlify/functions/lib/markdownToHtml.ts` | Markdown → HTML（fallback 路径） |
| `netlify/functions/lib/defaultTextLoader.ts` | 默认文案（fallback 路径） |
| `netlify/functions/lib/normalizeInspection.ts` | 规范化 inspection（generateMarkdownWordBuffer 使用） |
| `netlify/functions/lib/generateReport.ts` | `buildMarkdownReport`（generateMarkdownWord 使用） |
| `netlify/functions/lib/fingerprint.ts` | `sha1`（元信息 data_version） |
| `netlify/functions/lib/sanitizeText.ts` | 文本清洗与 fingerprint（report-fp） |
| `netlify/functions/generateWordReport.ts` | **仅** 被 generateMarkdownWord 引用 `loadResponses`；被 goldTemplateData / generateReport 引用 `buildReportData`、`buildCoverData`、`loadResponses`（非“第二套生成入口”时仍为依赖，勿删） |

### 2) Submit 主链路

| 文件路径 | 用途 |
|----------|------|
| `netlify/functions/submitInspection.ts` | Submit handler；同进程 `generateMarkdownWordBuffer` + `saveWordDoc`；邮件 `download_word_url` |
| `netlify/functions/lib/rules.ts` | `flattenFacts` / `evaluateFindings` / `collectLimitations` / `buildReportHtml` |
| `netlify/functions/lib/email.ts` | `sendEmailNotification`（Submit 发邮件） |
| `netlify/functions/lib/uploadPhotoToFinding.ts` | 房间/自定义 finding 照片上传（Submit / saveCustomFindings） |
| `netlify/functions/lib/baseUrl.ts` | 邮件与 download 链接 baseUrl |

### 3) downloadWord API

| 文件路径 | 用途 |
|----------|------|
| `netlify/functions/downloadWord.ts` | GET 读 Blob；fallback 调 generateMarkdownWord；幂等锁；返回 docx |

### 4) Review 相关 API / 页面

| 文件路径 | 用途 |
|----------|------|
| `netlify/functions/wordStatus.ts` | GET `exists`（Blob 是否已有 Word） |
| `netlify/functions/review.ts` | GET review 数据（Review 页加载） |
| `src/components/ReviewPage.tsx` | wordStatus → “Download Generated Word” / “Generate Preview”；generateMarkdownWord（预览）；downloadWord（下载已生成） |

### 5) 前端入口与路由

| 文件路径 | 用途 |
|----------|------|
| `src/App.tsx` | 路由：/ → Wizard；/review/:id → ReviewPage；/success/* → SuccessPage；/admin/* → ConfigAdmin |
| `src/components/Wizard.tsx` | 提交调用 `/api/submitInspection`；跳转 `/review/:id` |

**以上清单内文件与调用关系：DO NOT TOUCH（不删、不改行为）。**

---

## 第二阶段：静态分析结果

### A) 未被引用的“入口”（无前端/脚本 fetch）

- **enhanceReport.ts**  
  - 无任何 `fetch('/api/enhanceReport')` 或 `import from enhanceReport`。  
  - 仅在文档中被提及（REPORT_GENERATION_FILES.md、OpenAI配置说明.md）。  
  - 结论：**入口未被引用**；可能为历史 AI 增强接口。

- **rulesAdmin.ts**  
  - 无任何 `fetch('/api/rulesAdmin')` 或 `import from rulesAdmin`。  
  - 仅在 GitHub自动更新说明.md 中作为“需修改的文件”出现（非调用）。  
  - 结论：**入口未被引用**。

- **sendEmail.ts**  
  - 无前端/脚本调用 `/api/sendEmail`。  
  - Submit 直接使用 `lib/email.ts` 的 `sendEmailNotification`。  
  - 结论：**入口未被引用**；可能用于手动/运维触发。

- **debugInspection.ts**  
  - 无前端/脚本 `fetch('/api/debugInspection')`。  
  - FindingsDebugPage 调用的是 `debugSaveFindingDimensions`，非 debugInspection。  
  - 结论：**入口未被引用**；仅文档注释说明为 Debug endpoint。

- **testWordBlob.ts**  
  - 无前端/脚本调用。  
  - README 中说明用 `curl .../api/testWordBlob` 测试。  
  - 结论：**仅文档约定用于手动/开发测试**。

### B) 重复实现 / 多入口对照

- **Word 生成**  
  - **generateMarkdownWord**（+ generateMarkdownWordBuffer）：权威路径，Submit / Review 预览 / downloadWord fallback 共用。  
  - **generateWordReport**：独立 handler，被 ConfigAdmin、simulate-inspection、多份脚本与 generateReport / goldTemplateData 引用（loadResponses、buildReportData、buildCoverData 等）。  
  - 结论：**非重复实现**；两条 pipeline 用途不同，generateWordReport 仍为依赖方，不可删。

- **Blob 存读**  
  - 仅 `lib/store.ts` 的 `saveWordDoc` / `getWordDoc`，无第二套封装。  

- **模板渲染**  
  - docx：generateMarkdownWord 使用 `renderDocx` / `renderDocxGoldTemplate`（lib/renderDocx）；generateWordReport 使用同库 `renderDocx` 及自身逻辑。  
  - 结论：**无多余封装**；共用 renderDocx。

### C) 已废弃/遗留标注（仍被引用，仅建议标注）

- `netlify/functions/lib/buildReportMarkdown.ts`：存在 `@deprecated Use buildReportHtml instead` 的兼容函数，仍被 generateWordReport / goldTemplateData 等引用 → **保留，可加注释/README 说明 deprecated 用途**。  
- `netlify/functions/generateWordReport.ts`：部分 `@deprecated` 与 “legacy” 注释，但整文件被多处引用 → **保留，建议在文件头或 README 标出 deprecated 函数列表**。  
- `netlify/functions/lib/executiveSignals.ts`：存在 `@deprecated` 的兼容函数，仍被引用 → **保留**。

---

## 第三阶段：动态验证（候选删除项）

对“未被引用”的 5 个 Netlify 函数逐项回答：

| 候选 | 1) 运行时被调用？ | 2) 被测试引用？ | 3) feature flag/env？ | 4) 仅迁移/一次性？ |
|------|-------------------|-----------------|------------------------|---------------------|
| enhanceReport | 否（无 fetch/import） | 否 | 未发现 | 可能为历史 AI 能力 |
| rulesAdmin | 否 | 否 | 未发现 | 可能为后台/手工配置 |
| sendEmail | 否 | 否 | 未发现 | 可能为运维手动发信 |
| debugInspection | 否 | 否 | 未发现 | Debug 手动用 |
| testWordBlob | 否（仅 README curl） | 否 | 否 | 开发/手动测试用 |

说明：  
- 1–3 均为“否”的为 enhanceReport、rulesAdmin、sendEmail、debugInspection；testWordBlob 为“文档约定手动调用”。  
- 删除任一文件会**移除对应 /api/* 端点**；若有外部/人工依赖（如运维 curl sendEmail、开发 curl testWordBlob），删除会导致 404。  
- 因此“可证明安全”的删除需产品/运维确认无人工或外部调用。

---

## 第四阶段：安全删除与保留清单

### 可安全删除（推荐立刻删）

在**未**确认无人工/外部调用的前提下，**不推荐删除任何 Netlify 函数文件**，以避免误伤运维或调试入口。

若经产品/运维确认后，以下可考虑删除（删除前请再搜代码与文档一次）：

- **无**（当前不执行任何文件删除；见下方“建议标记 deprecated”）。

**若未来确认可删，建议顺序与验证：**

1. 删除 `netlify/functions/enhanceReport.ts` → 运行 `npm run build`、提交一次 inspection → 生成 Word → 邮件下载 → Review 下载，确认无回归。  
2. 同上方式，再考虑 `rulesAdmin.ts`、`sendEmail.ts`、`debugInspection.ts`；删除 `testWordBlob.ts` 时需同步修改 README 中 curl 说明。

### 可保留但建议标记 deprecated

| 文件路径 | 原因 | 建议处理 |
|----------|------|----------|
| `netlify/functions/enhanceReport.ts` | 无代码引用，疑为历史 AI 增强 | 文件顶加 `@deprecated 无前端/脚本调用，仅保留供人工触发或后续下线` |
| `netlify/functions/rulesAdmin.ts` | 无代码引用，文档仅提及“修改该文件” | 同上，标注“API 未被调用，保留或计划下线” |
| `netlify/functions/sendEmail.ts` | 无代码引用，Submit 用 lib/email | 标注“独立发信入口，供运维/手动使用” |
| `netlify/functions/debugInspection.ts` | 无前端调用，仅 Debug 说明 | 标注“仅 Debug 手动使用” |
| `netlify/functions/testWordBlob.ts` | 仅 README 中 curl 测试 | 标注“仅开发/手动测试，生产可禁用” |

### 必须保留（结构可优化，但禁止删/改行为）

- 第一阶段所列**所有**“DO NOT TOUCH”文件。  
- `netlify/functions/generateWordReport.ts`：被 generateMarkdownWord（loadResponses）、goldTemplateData、generateReport、ConfigAdmin、simulate-inspection 及多份脚本引用，**必须保留**。  
- `netlify/functions/configAdmin.ts`：ConfigAdmin 前端多路径调用；generateWordReport 引用 `loadFindingDimensionsGlobal`。  
- 所有被上述路径 import 的 lib 与脚本（如 fix-placeholders.ts、reportContract、buildReportMarkdown 等）。

---

## 第五阶段：执行与验证建议

1. **本次不执行任何文件删除**，仅完成体检与清单；若后续确认删除，建议**单 commit 只删一个函数**，便于回滚。  
2. 建议在仓库中增加本报告引用（如 README 或 CONTRIBUTING 中“代码体检与安全瘦身见 docs/CODE_ARCHAEOLOGY_AND_SAFE_SLIM.md”）。  
3. 验证命令（删除任何函数后必跑）：  
   - `npm run build`  
   - `npm run test:generate-report`（若有）  
   - 手动：提交 inspection → 生成 Word → 邮件下载 → Review 页“Download Generated Word”与“Generate Preview”各一次，确认与当前行为一致。

---

## 引用与结论

- **权威路径**：以 grep/import 与 netlify.toml redirect 为准；Submit/Review/downloadWord/wordStatus 涉及文件见第一阶段。  
- **删除结论**：所有“可安全删除”项均依赖“无人工/外部调用”的显式确认，当前给出**可保留但建议 deprecated** 的 5 个函数，**不执行删除**，以保证可追溯与可回滚。
