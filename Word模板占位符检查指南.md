# Word 模板占位符检查指南

## 问题诊断

从 Netlify 日志看到：
```
📋 Tags recognized by docxtemplater before render: {
  document: { target: 'word/document.xml', tags: {} }
}
```

`tags: {}` 为空，说明 **Word 模板中没有被 docxtemplater 识别的占位符**。

## 检查步骤

### 1. 打开 Word 模板文件

打开 `report-template.docx`（或 `report-template-with-placeholders.docx`）

### 2. 检查占位符是否存在

使用 Word 的查找功能（Ctrl+F / Cmd+F）搜索 `{{`

**应该找到的占位符示例：**
- `{{INSPECTION_ID}}`
- `{{ASSESSMENT_DATE}}`
- `{{PREPARED_FOR}}`
- `{{PREPARED_BY}}`
- `{{PROPERTY_ADDRESS}}`
- `{{PROPERTY_TYPE}}`
- `{{IMMEDIATE_FINDINGS}}`
- `{{RECOMMENDED_FINDINGS}}`
- `{{PLAN_FINDINGS}}`
- `{{LIMITATIONS}}`
- 等等...

### 3. 如果找不到占位符

**说明模板中没有占位符，需要添加：**

1. 在 Word 文档中找到需要填充数据的位置
2. 输入占位符，格式：`{{TAG_NAME}}`
   - 正确：`{{INSPECTION_ID}}`
   - 错误：`{{ INSPECTION_ID }}`（有空格）
   - 错误：`{INSPECTION_ID}`（只有一个大括号）
   - 错误：`[INSPECTION_ID]`（使用方括号）

3. **重要：确保占位符是纯文本**
   - 不要使用 Word 的"字段"功能
   - 不要使用公式
   - 直接输入文本 `{{TAG_NAME}}`

4. **重要：确保占位符是连续的**
   - 选中整个占位符（包括 `{{` 和 `}}`）
   - 确保中间没有格式变化（加粗、斜体、颜色等）
   - 如果有格式变化，统一格式或重新输入

### 4. 如果找到了占位符但名称不匹配

对比代码中使用的占位符名称（在 `generateWordReport.ts` 的 `templateData` 对象中）：

**代码中使用的占位符：**
- `INSPECTION_ID`
- `ASSESSMENT_DATE`
- `PREPARED_FOR`
- `PREPARED_BY`
- `PROPERTY_ADDRESS`
- `PROPERTY_TYPE`
- `IMMEDIATE_FINDINGS`
- `RECOMMENDED_FINDINGS`
- `PLAN_FINDINGS`
- `LIMITATIONS`
- `REPORT_VERSION`
- `OVERALL_STATUS`
- `EXECUTIVE_SUMMARY`
- `RISK_RATING`
- `RISK_RATING_FACTORS`
- `URGENT_FINDINGS`
- `TEST_SUMMARY`
- `TECHNICAL_NOTES`

**如果 Word 模板中的占位符名称不同，有两种修复方式：**

#### 方式 A：修改 Word 模板（推荐）

在 Word 中使用查找替换功能：
1. 查找：`{{OLD_NAME}}`
2. 替换为：`{{NEW_NAME}}`
3. 确保新名称与代码中的键名完全匹配

#### 方式 B：修改代码

编辑 `netlify/functions/generateWordReport.ts`，修改 `templateData` 对象中的键名以匹配 Word 模板。

### 5. 验证占位符格式

确保每个占位符：
- ✅ 格式正确：`{{TAG_NAME}}`
- ✅ 没有多余空格
- ✅ 是纯文本（不是字段或公式）
- ✅ 是连续的（中间没有格式变化）
- ✅ 名称与代码中的键名匹配

### 6. 保存并重新部署

1. 保存 Word 文件
2. 复制到 `netlify/functions/report-template.docx`
3. 提交并推送到 GitHub
4. Netlify 会自动重新部署

### 7. 重新测试

部署完成后：
1. 再次调用 `generateWordReport` API
2. 查看 Netlify 日志
3. 应该看到：`📋 Extracted tag names from template: ['INSPECTION_ID', 'IMMEDIATE_FINDINGS', ...]`
4. 下载生成的 Word 文档，验证占位符是否被替换

## 常见问题

### Q: 为什么 docxtemplater 找不到占位符？

**A:** 可能的原因：
1. Word 模板中没有占位符
2. 占位符格式不正确（有空格、使用方括号等）
3. 占位符在 Word XML 中被分割（duplicate tag 问题）
4. 占位符使用了 Word 的"字段"功能而不是纯文本

### Q: 如何确保占位符是纯文本？

**A:** 
1. 在 Word 中，不要使用"插入" → "字段"
2. 直接输入文本：`{{TAG_NAME}}`
3. 如果占位符显示为灰色或可点击，说明它可能是字段，需要删除并重新输入为纯文本

### Q: 占位符被分割了怎么办？

**A:**
1. 选中整个占位符（包括 `{{` 和 `}}`）
2. 检查是否有格式变化（字体、颜色、大小等）
3. 如果有，统一格式或删除后重新输入
4. 确保占位符在一个连续的文本运行中

## 需要帮助？

如果问题仍然存在，请提供：
1. Word 模板中实际使用的占位符列表（使用查找功能找到的所有 `{{...}}`）
2. Netlify 日志中显示的标签列表
3. 代码中使用的占位符键名列表

这样我可以帮你精确匹配占位符名称。
