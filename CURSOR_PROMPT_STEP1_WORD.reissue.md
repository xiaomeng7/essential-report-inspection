
目标：点击“AI生成”按钮，生成 Word 官方报告（.docx），并保存到 Netlify Blob。

步骤：
1. 前端按钮调用 Netlify Function: generateWordReport?inspection_id=XXX
2. 后端读取 report-template-with-placeholders.docx
3. 使用 FIELD_DICTIONARY_reissue.json 构建 reportData
4. 使用 docxtemplater 填充占位符
5. 生成 docx，保存到 Netlify Blob: reports/{inspection_id}.docx
6. 提供 downloadWordReport 接口供下载
