# CURSOR_PROMPTS_STEP_BY_STEP.md（逐步喂给 Cursor 的 prompts）

使用方法：按顺序把每一段 **Prompt** 复制到 Cursor Chat，让它直接改代码。  
每一步做完就运行一次本地/Netlify dev 验证，保证改动可控。

---

## Step 0 — 模板最小改动（你手工做）
**Prompt（给你自己看的，不用发 Cursor）：**
打开 `report-template.docx`：
1) 保留封面 6 个字段  
2) 在正文开始位置插入：`{{REPORT_BODY_HTML}}`（不要加粗/不要换字体/不要拆成多段）  
3) 删除正文其他占位符（EXECUTIVE_SUMMARY、RISK_RATING、CAPEX 等）  

---

## Step 1 — 安装依赖
**Prompt：**
请在项目根目录安装以下 npm 生产依赖，并更新 lockfile：
- docxtemplater（已安装 ✓）
- pizzip（已安装 ✓）
- markdown-it（已安装 ✓）
- docxtemplater-html-module（⚠️ 付费模块，需要购买：https://docxtemplater.com/shop/modules/?preselect=html）

**替代方案（如果不想购买 html-module）：**
- 方案 A：使用 `html-docx-js` 或 `html-docx-js-typescript` 将 HTML 转换为 docx，然后合并到模板
- 方案 B：将 HTML 转换为纯文本，使用 docxtemplater 的基础功能
- 方案 C：使用 `pandoc` 命令行工具（需要服务器支持）

确保 netlify/functions 打包后可运行。

---

## Step 2 — 新增 markdownToHtml.ts
**Prompt：**
在 `netlify/functions/lib/` 新建 `markdownToHtml.ts`，实现：
- 导出函数 `markdownToHtml(md: string): string`
- 使用 `markdown-it`，参数至少包含 `{ html: true, linkify: true }`
- 允许基础 Markdown（标题/列表/表格/粗体/换行）
并在文件底部留一个简单示例注释（可选）。

---

## Step 3 — 新增 buildReportMarkdown.ts（核心）
**Prompt：**
在 `netlify/functions/lib/` 新建 `buildReportMarkdown.ts`，实现：

`buildReportMarkdown(params): string`

params 至少包含：
- `inspection`（含 raw）
- `findings`（数组）
- `responses`（从 responses.yml 解析后的对象）
- `computed`（你已有的计算字段，如 OVERALL_STATUS、RISK_RATING、CAPEX_RANGE 等）

要求（务必做到“不会 undefined”）：
1) 把报告按固定结构输出：Purpose → Exec Summary → Priority 表 → Scope/Limits → Findings 循环 → Thermal → CapEx → Options → Disclaimer → Closing
2) Executive Summary 动态内容：
   - 风险等级：如果 computed.OVERALL_STATUS 有值，映射成 🟢/🟡/🔴 + 文本；没有就用 “🟡 Moderate”
   - Key Decision Signals：根据 findings 计数生成 2~3 条 bullet（比如 immediate=0 就写 “No immediate safety hazards detected”）
   - Financial Planning Snapshot：如果 computed.CAPEX_RANGE 有值就用，否则写 “To be confirmed”
3) Findings 循环（每个 finding 一节）：
   - `## Asset Component — {friendly title}`
   - Observed Condition：优先使用 finding.observed/facts（如果有），否则用 responses.findings[id].title
   - Risk Interpretation：优先 responses.findings[id].why_it_matters；没有就用一句默认解释
   - Recommended Action：优先 responses.findings[id].recommended_action（可选）
   - Planning Guidance：优先 responses.findings[id].planning_guidance（可选）
   - Priority：把 finding.priority 映射 🔴/🟡/🟢
4) Test Data & Technical Notes：
   - 如果 inspection.raw.TEST_SUMMARY / TECHNICAL_NOTES（或你实际字段名）有值就输出
   - 没有就输出 “No test data captured for this assessment.”
5) Thermal Imaging：
   - 如果有 thermal 数据输出；没有就输出 “No thermal imaging data captured for this assessment.”

最后返回完整 Markdown 字符串。

---

## Step 4 — 新增 renderDocx.ts（HTML 插入 Word）
**Prompt：**
在 `netlify/functions/lib/` 新建 `renderDocx.ts`，实现：
- 输入：`templateBuffer: Buffer`, `data: Record<string, any>`
- 输出：`Buffer`（最终 docx）
要求：
1) 用 PizZip 加载 templateBuffer
2) 初始化 docxtemplater，并挂载 `docxtemplater-html-module`
3) 让模板里的 `{{REPORT_BODY_HTML}}` 渲染为 HTML（不是纯文本）
4) 保持 `paragraphLoop: true`, `linebreaks: true`
5) 返回 `doc.getZip().generate({ type: 'nodebuffer' })`
并在注释中明确模板必须包含 `{{REPORT_BODY_HTML}}`。

---

## Step 5 — 改 generateWordReport（最小改动）
**Prompt：**
请在 `netlify/functions/generateWordReport.js`（或同名 ts）做最小侵入改动：

1) buildReportData 只保留封面 6 个字段：
   INSPECTION_ID、ASSESSMENT_DATE、PREPARED_FOR、PREPARED_BY、PROPERTY_ADDRESS、PROPERTY_TYPE

2) 新增正文生成：
   - `const md = buildReportMarkdown({ inspection, findings: inspection.findings, responses, computed })`
   - `const html = markdownToHtml(md)`
   - `data.REPORT_BODY_HTML = html`

3) 不再用旧的 Docxtemplater 初始化方式，改为：
   - `const outBuffer = renderDocx(templateBuffer, data)`
   - 返回 outBuffer 给前端下载

4) 增加一个保护：
   - 如果模板里找不到 `REPORT_BODY_HTML` 标签（用简单 string includes 检测 document.xml 即可），直接 throw 并提示“请在模板正文插入 {{REPORT_BODY_HTML}}”。

---

## Step 6 — 验收检查（你怎么测）
**Prompt：**
请帮我增加一段调试日志（仅在 dev 环境）：
- 输出 findings counts（immediate/recommended/plan/limitations）
- 输出生成的 Markdown 前 1200 字符（避免过长）
- 输出生成的 HTML 前 1200 字符

然后我会用 EH-2026-01-004 这份样例数据生成报告检查排版。

---

完成 Step 1~5 后，你的系统会立刻变稳定：模板怎么改都不会再 split/duplicate，且不会再 undefined。
