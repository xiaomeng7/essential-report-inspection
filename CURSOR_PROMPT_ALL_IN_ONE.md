# Cursor（中文）— 全部实现包：Word 输出 + 字段映射 + 规则/文案可编辑

本包包含文件：
- CHECKLIST_TO_FINDINGS_MAP.v1.csv / .json：从 master checklist 抽取的条目与建议 finding_code/bucket
- rules.v1.full.yml：按 field_key 自动生成的最小规则（true => emit finding；Unable to confirm => limitation）
- responses.v1.full.yml：为每个 finding_code 生成的文案骨架（你只需要填文字）
- FIELD_DICTIONARY_reissue.json：报告占位符字段字典（你之前的版本也可用）
- admin-ui-schema.v1.json：内部规则/文案编辑器的数据结构建议（存 Netlify Blob）

## 先做第 1 步：点按钮生成 Word（Official）
1) Netlify Function: generateWordReport
- 输入 inspection_id
- 读取 inspection json（你的现有来源）
- 生成 reportData：
  - 运行 rules.v1.full.yml -> 得到 findings buckets + limitations
  - 用 responses.v1.full.yml 把 finding_code 渲染成“可读的句子”
  - 填入 Word 模板占位符（report-template-with-placeholders.docx）
- 把生成的 docx 存 Netlify Blob：
  key = reports/{inspection_id}/official.docx

2) Netlify Function: downloadWordReport
- 从 Blob 读 reports/{inspection_id}/official.docx
- 返回下载

3) 前端 /review/:id
- AI 生成按钮调用 generateWordReport
- 显示下载按钮指向 downloadWordReport

## 规则/文案如何改（非程序员可改）
- 后续可按 admin-ui-schema.v1.json 做一个内部页面，把 rules/responses 存到 Blob 的 admin/ 目录，并支持版本号与回滚。