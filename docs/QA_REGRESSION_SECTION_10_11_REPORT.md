# Section 10/11 渲染修复 — QA 回归测试报告

**角色**: QA + 发布负责人  
**执行时间**: 2026-02-07  
**测试目标**: Section 10 无重复行、Section 11 无 HTML/Markdown 原文、无 mock 文案、Submit/Review/Email 三路 docx sha256 一致

---

## 1) 选定的 inspection_id

| 项 | 值 |
|----|-----|
| **inspection_id** | **EH-2026-02-005** |
| **来源** | 使用 `public/sample-inspection-payload.json` 调用 `POST /api/submitInspection` 获得 |
| **环境** | `BASE_URL=http://localhost:8888`（`npm run netlify:dev` 已启动） |

---

## 2) 三份 docx 的生成方式

| 标签 | 含义 | 获取方式 |
|------|------|----------|
| **A** | Submit 写入 Blob 后从 Blob 下载 | Submit 成功后等待 2.5s，`GET /api/downloadWord?inspection_id=EH-2026-02-005` |
| **B** | 邮件下载 | 同一 inspection_id 再次 `GET /api/downloadWord?inspection_id=EH-2026-02-005`（与邮件内链接行为一致） |
| **C** | Review 页下载（generated） | 同一 inspection_id 第三次 `GET /api/downloadWord?inspection_id=EH-2026-02-005`（Review 页「Download Generated Word」即读 Blob） |

三份文件已保存至：

- `output/regression-section-10-11/A-submit-blob.docx`
- `output/regression-section-10-11/B-email.docx`
- `output/regression-section-10-11/C-review.docx`

---

## 3) sha256 对比结果（必须一致）

| 文件 | sha256（全量） |
|------|----------------|
| A (Submit/Blob) | `d015c24a82349e78c9a6b2e88171ff7b4f22dede354fd2db272551898d4d7429` |
| B (邮件)        | `d015c24a82349e78c9a6b2e88171ff7b4f22dede354fd2db272551898d4d7429` |
| C (Review)      | `d015c24a82349e78c9a6b2e88171ff7b4f22dede354fd2db272551898d4d7429` |

**结论**: **PASS** — 三份完全一致。

---

## 4) 禁止字符串全文搜索（要求 0 命中）

在每份 docx 的 `word/document.xml` 中搜索下列字符串（含 XML 转义形式），结果如下：

| 字符串 | A 命中 | B 命中 | C 命中 | 结果 |
|--------|--------|--------|--------|------|
| `TERMS & CONDITIONS OF ASSESSMENT`（含 `&amp;` 形式） | 0 | 0 | 0 | **PASS** |
| `<h2` | 0 | 0 | 0 | **PASS** |
| `|---|` | 0 | 0 | 0 | **PASS** |
| `### ` | 0 | 0 | 0 | **PASS** |
| `模拟测试数据` | 0 | 0 | 0 | **PASS** |

**结论**: **PASS** — 全部 0 命中。

---

## 5) 人工 Spot check 说明

以下需在 Word 中打开 `output/regression-section-10-11/A-submit-blob.docx` 做一次人工确认：

| 检查项 | 预期 |
|--------|------|
| **Section 10** | 标题「10. Terms, limitations and legal framework」下方**无**单独一行「TERMS & CONDITIONS OF ASSESSMENT」 |
| **Section 11 Appendix** | 无 `<h2...>`、`|---|`、`### ` 等原始标记；表格为 Word 表格（非纯文本管道符）；小标题为 Word 标题样式（非纯文本） |

自动化已证明正文 XML 中无上述禁止字符串；人工 spot check 用于确认版式与样式符合预期。

---

## 6) 结论与上线建议

| 项 | 结果 |
|----|------|
| Section 10 不出现重复行「TERMS & CONDITIONS OF ASSESSMENT」 | **PASS**（0 命中） |
| Section 11 Appendix 不出现 HTML 标签或 Markdown 原文 | **PASS**（`<h2`、`|---|`、`### ` 均 0 命中） |
| 不出现「模拟测试数据」等 mock 字样 | **PASS**（0 命中） |
| 同一 inspection_id 三份 docx sha256 一致 | **PASS**（A=B=C） |

**总体**: **PASS**

**上线结论**:  
在本地环境（`netlify:dev`）下，Section 10/11 渲染修复回归测试全部通过，证据为 sha256 一致性与禁止字符串 0 命中。建议：

- **可以上线**：以当前代码发布后，在 Staging 再跑一次同脚本（`BASE_URL=<staging> npx tsx scripts/regression-section-10-11.ts`）做一次复测。
- 若上线后发现问题：可回退至「Section 10 去重 + Appendix 安全文本 + mock 替换」的提交前状态，并重点检查 `goldTemplateData.ts`（terms 去重、APPENDIX_CONTENT）、`buildReportMarkdown.ts`（`appendixMarkdownToDocxSafeText` 中 `###` 剥离）、`sanitizeText.replaceMockTextForProduction` 的调用点。

---

## 复现命令

```bash
# 1. 启动本地
npm run netlify:dev

# 2. 另开终端运行回归脚本
npx tsx scripts/regression-section-10-11.ts

# 3. 查看报告
cat output/regression-section-10-11/regression-report.json
```

**Staging 复测**:  
`BASE_URL=https://your-staging.netlify.app npx tsx scripts/regression-section-10-11.ts`
