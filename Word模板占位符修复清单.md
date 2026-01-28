# Word 模板占位符修复清单

## 问题

`report-template-with-placeholders.docx` 中有 **28 个占位符被分割**，导致 docxtemplater 无法识别。

## 需要修复的占位符列表

根据错误日志，以下占位符被分割，需要在 Word 中修复：

### 1. PROPERTY_TYPE
- 错误：`{{PROP` + `TYPE}}`
- 修复：确保 `{{PROPERTY_TYPE}}` 是连续的

### 2. ASSESSMENT_PURPOSE
- 错误：`{{ASSE` + `POSE}}`
- 修复：确保 `{{ASSESSMENT_PURPOSE}}` 是连续的

### 3. PREPARED_FOR
- 错误：`{{PREP` + `_FOR}}`
- 修复：确保 `{{PREPARED_FOR}}` 是连续的

### 4. PREPARED_BY
- 错误：`{{PREP` + `D_BY}}`
- 修复：确保 `{{PREPARED_BY}}` 是连续的

### 5. ASSESSMENT_DATE
- 错误：`{{ASSE` + `DATE}}`
- 修复：确保 `{{ASSESSMENT_DATE}}` 是连续的

### 6. TEST_SUMMARY
- 错误：`{{TEST` + `MARY}}`
- 修复：确保 `{{TEST_SUMMARY}}` 是连续的

### 7. TECHNICAL_NOTES
- 错误：`{{TECH` + `OTES}}`
- 修复：确保 `{{TECHNICAL_NOTES}}` 是连续的

### 8. CAPITAL_PLANNING
- 错误：`{{CAPI` + `ABLE}}`
- 修复：确保 `{{CAPITAL_PLANNING}}` 是连续的

### 9. OVERALL_STATUS
- 错误：`{{OVER` + `ADGE}}`（出现 2 次）
- 修复：确保 `{{OVERALL_STATUS}}` 是连续的

### 10. EXECUTIVE_SUMMARY
- 错误：`{{EXEC` + `RAPH}}`（出现 2 次）
- 修复：确保 `{{EXECUTIVE_SUMMARY}}` 是连续的

### 11. GENERAL_NOTES
- 错误：`{{GENE` + `OTES}}`
- 修复：确保 `{{GENERAL_NOTES}}` 是连续的

### 12. IMMEDIATE_FINDINGS
- 错误：`{{IMME` + `INGS}}`（出现 2 次）
- 修复：确保 `{{IMMEDIATE_FINDINGS}}` 是连续的

### 13. NEXT_STEPS
- 错误：`{{NEXT` + `TEPS}}`
- 修复：确保 `{{NEXT_STEPS}}` 是连续的

### 14. PLAN_FINDINGS
- 错误：`{{PLAN` + `INGS}}`（出现 2 次）
- 修复：确保 `{{PLAN_FINDINGS}}` 是连续的

### 15. RECOMMENDED_FINDINGS
- 错误：`{{RECO` + `INGS}}`（出现 2 次）
- 修复：确保 `{{RECOMMENDED_FINDINGS}}` 是连续的

### 16. RISK_RATING
- 错误：`{{RISK` + `ADGE}}`（出现 2 次）
- 修复：确保 `{{RISK_RATING}}` 是连续的

### 17. RISK_FACTORS
- 错误：`{{RISK` + `TORS}}`（出现 2 次）
- 修复：确保 `{{RISK_FACTORS}}` 是连续的

### 18. LIMITATIONS
- 错误：`{{LIMI` + `TION}}`
- 修复：确保 `{{LIMITATIONS}}` 是连续的

### 19. URGENT_FINDINGS
- 错误：`{{URGE` + `INGS}}`
- 修复：确保 `{{URGENT_FINDINGS}}` 是连续的

## 修复步骤

### 方法 1：逐个修复（推荐，最可靠）

1. 打开 `report-template-with-placeholders.docx`
2. 使用查找功能（Ctrl+F / Cmd+F）搜索每个占位符
3. 对于每个被分割的占位符：
   - 选中整个占位符（包括 `{{` 和 `}}`）
   - 检查是否有格式变化（字体、颜色、大小等）
   - 如果有格式变化：
     - **方法 A**：统一格式（选中后应用统一格式）
     - **方法 B**：删除后重新输入（推荐）
   - 确保占位符在一个连续的文本运行中
4. 保存文件

### 方法 2：批量查找替换（如果占位符名称相同）

如果同一个占位符在文档中出现多次且都被分割：

1. 使用查找替换功能
2. 查找：`{{PROP`（部分）
3. 替换为：`{{PROPERTY_TYPE}}`（完整）
4. 但要注意：如果占位符被分割，Word 可能无法正确查找

### 方法 3：重新输入所有占位符（最彻底）

1. 在 Word 中创建一个新文档
2. 复制原文档的内容（除了占位符）
3. 手动输入所有占位符，确保：
   - 格式统一
   - 没有格式变化
   - 是纯文本（不是字段）
4. 保存为新文件

## 验证修复

修复后：

1. 保存文件
2. 复制到 `netlify/functions/report-template.docx`
3. 提交并推送
4. 重新测试生成 Word 文档
5. 查看 Netlify 日志，应该看到：
   - `📋 Extracted tag names from template: [...]` - 显示找到的标签
   - 没有 duplicate tag 错误

## 快速修复脚本（可选）

如果你想快速修复，可以：

1. 在 Word 中使用"查找和替换"
2. 对于每个被分割的占位符：
   - 先找到 `{{PROP` 的位置
   - 手动检查后面是否有 `TYPE}}`
   - 如果有，删除这两个部分
   - 在正确位置输入 `{{PROPERTY_TYPE}}`
   - 重复此过程

## 注意事项

- ⚠️ **不要使用 Word 的"字段"功能** - 必须是纯文本
- ⚠️ **确保占位符是连续的** - 中间不能有格式变化
- ⚠️ **检查所有出现的位置** - 有些占位符可能在文档中出现多次
- ⚠️ **保存后验证** - 修复后重新测试确保问题解决

## 修复优先级

建议按以下顺序修复：

1. **核心占位符**（必须）：
   - `{{INSPECTION_ID}}`
   - `{{IMMEDIATE_FINDINGS}}`
   - `{{RECOMMENDED_FINDINGS}}`
   - `{{PLAN_FINDINGS}}`
   - `{{LIMITATIONS}}`

2. **基本信息占位符**：
   - `{{ASSESSMENT_DATE}}`
   - `{{PREPARED_FOR}}`
   - `{{PREPARED_BY}}`
   - `{{PROPERTY_TYPE}}`

3. **其他占位符**：
   - 按需修复

修复完成后，请重新测试生成 Word 文档功能。
