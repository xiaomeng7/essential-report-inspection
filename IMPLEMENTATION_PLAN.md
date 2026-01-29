# 自动生成 Word 报告（最可靠的实现路径）——一步一步（给 Cursor 用）

目标：把“Word 模板里堆一堆占位符”的方案，迁移成 **Markdown → HTML → Word**。  
Word 模板只保留 **6 个封面字段 + 1 个正文容器 `{{REPORT_BODY_HTML}}`**，从根上解决 split/duplicate/undefined 和“模板一改就爆”。

---

## 你现在的痛点（为什么要改）
- Word 会把 `{{TAG_NAME}}` 拆成多个 run（格式/换行/粘贴都会触发），Docxtemplater 就报：
  - split placeholder
  - duplicate open/close tag
- 你现在的 data 字段增长后，很容易漏掉 → Word 显示 `undefined`
- 模板结构改动（加粗、换字体、移动段落）会反复打断占位符

---

## 推荐方案（稳定 + 可维护）
1) 代码生成 **Markdown**（结构稳定、版本可控、容易调试）
2) Markdown 转成 **HTML**
3) Docxtemplater 用 **HTML Module** 把 HTML 插入 Word（保留标题/列表/表格）
4) Word 模板只负责：
   - 封面（6 个字段）
   - “正文插入点”（1 个字段）

---

## 你需要做的最小模板改动（5 分钟）
在 `report-template.docx` 里：
1. 保留封面 6 个字段：  
   `INSPECTION_ID, ASSESSMENT_DATE, PREPARED_FOR, PREPARED_BY, PROPERTY_ADDRESS, PROPERTY_TYPE`
2. 在正文开始位置插入一行：  
   `{{REPORT_BODY_HTML}}`
3. 确保这一段 **没有加粗/没有换字体/没有被拆分成多段**（一个 run 最安全）
4. 其他正文占位符（EXECUTIVE_SUMMARY、RISK_RATING、CAPEX 等）先全部移除（以后都用正文 HTML 输出）

---

## 代码侧将新增 3 个模块
- `netlify/functions/lib/buildReportMarkdown.ts`：inspection + findings + responses → Markdown
- `netlify/functions/lib/markdownToHtml.ts`：Markdown → HTML（markdown-it）
- `netlify/functions/lib/renderDocx.ts`：Docxtemplater + HTML module 渲染 docx

---

## 验收标准（你跑通后应该看到）
- 不再出现 split/duplicate tag 错误（因为占位符只剩一个正文容器）
- Word 输出：结构清晰、标题/列表/表格可读
- 模板小改动（章节顺序/段落措辞）只改 Markdown 文案，不需要碰 Word 占位符

下一步：直接用 `CURSOR_PROMPTS_STEP_BY_STEP.md` 逐条喂给 Cursor。
