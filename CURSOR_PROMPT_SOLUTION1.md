# Cursor Prompt — 方案1（短期）: HTML 预处理 + 表格降级，确保 Word 正文可见

你是资深 Node/TypeScript 工程师。目标：让 `generateWordReport` 生成的 DOCX 在 Word 中从第 2 页开始正常显示正文（不是只有封面/图片），并且保持照片链接可用。

## 背景（已知问题）
- `html-docx-js-typescript` 使用 altChunk（内容在 `word/afchunk.mht`），导致通过合并 `word/document.xml` 的方案无法把正文合进去。
- `html-to-docx` 在复杂表格（尤其含样式/宽度/colspan/内联属性的表格）上会触发 `InvalidCharacterError`（例如生成无效 XML 属性 `@w`）。
- 当前我们使用“封面 docxtemplater + 正文 html-to-docx + 合并 document.xml”的路径；但正文 docx 的 document.xml 可能较小或转换失败。

## 本次要做的事情（方案1）
1) 在送入 `html-to-docx` 前，对 HTML 做“强制清洗”：
   - 移除 table/thead/tbody/tr/td/th 上所有属性（保留纯标签）
   - 移除 inline style 与 class/id
   - 移除 `colspan/rowspan`（必要时展开为普通单元格或直接降级）
   - 移除 `<colgroup>` / `<col>` / `<style>` / `<script>` / `<meta>` / `<link>`
   - 将 `<br>` 统一为 `<br/>`
2) **对复杂表格做降级**：把 “CapEx Roadmap / 复杂表格” 渲染改为：
   - 优先：简单两列表格（Item / Estimate / Timing）
   - 兜底：用 `<ul><li>` 列表替代表格（如果表格仍导致转换失败）
3) 在 `renderDocxByMergingCoverAndBody()` 内增加转换失败兜底逻辑：
   - 第一次：使用 `cleanHtmlForDocx(html)`
   - 如果仍失败：调用 `deTable(html)` 把所有 `<table>` 替换为 `<p>` + `<ul>` 结构，再试一次
4) 新增一个脚本用于快速验证：
   - `npm run test:word`（或现有脚本）对一份固定 inspection 生成 docx，并打印：
     - `coverDocumentXmlLength`
     - `bodyDocxDocumentXmlLength`
     - `mergedDocumentXmlLength`
   - 目标阈值：`mergedDocumentXmlLength > 20000`

## 代码修改清单（必须执行）
### A. 新增 `cleanHtmlForDocx()` 与 `deTable()`（放在 `netlify/functions/lib/renderDocx.ts` 或新建 `netlify/functions/lib/cleanHtmlForDocx.ts`）
- 使用纯字符串正则清洗（不引入 DOM 解析依赖，避免 netlify function 体积/兼容问题）
- 清洗顺序要稳定，避免破坏标签结构

### B. 在 `renderDocxByMergingCoverAndBody()` 中使用两次尝试
伪代码：
```ts
let html1 = cleanHtmlForDocx(rawHtml);
try { body = await htmlToDocx(html1); }
catch(e1) {
  const html2 = deTable(html1);
  body = await htmlToDocx(html2);
}
```

### C. 对 “CapEx Roadmap” 的生成做最小化（建议改在 buildReportMarkdown/buildReportHtml 里）
- 如果你能定位到 CapEx roadmap 表格生成处：改成简单 `<table><tr><th>...</th>...` 且无任何属性
- 如果不好定位：依赖 `cleanHtmlForDocx + deTable` 兜底即可

## 验收标准
1) 生成的 Word 打开后：第 2 页开始有正文（标题、段落、findings）
2) Photos 的超链接仍然存在
3) 日志中 `mergedDocumentXmlLength > 20000`
4) 不再出现 `InvalidCharacterError`，或出现时能被兜底二次尝试消化

## 输出要求
- 提交具体代码改动（直接改文件，不要只给建议）
- 新增/更新测试脚本与 npm scripts（如需要）
- 在日志中打印：第一次转换使用 cleaned-html，失败后再用 detable-html 的重试提示
