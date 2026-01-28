# Word 占位符诊断指南

## 问题描述

Word 文档生成成功，但占位符没有被真实数值替换。

## 测试结果

✅ API 调用成功：`generateWordReport` 返回 `{"ok":true}`
✅ Word 文档下载成功：文档已保存到 Blob
❓ 占位符是否被替换：需要查看日志确认

## 诊断步骤

### 1. 查看 Netlify 函数日志

1. 登录 [Netlify Dashboard](https://app.netlify.com)
2. 选择你的站点：`inspetionreport`
3. 点击左侧菜单：**Functions**（函数）
4. 找到 `generateWordReport` 函数
5. 点击进入，查看 **Logs**（日志）

### 2. 查找关键日志条目

在日志中查找以下关键信息：

#### 📋 模板占位符识别
```
📋 Tags recognized by docxtemplater before render: [...]
```
这会显示 docxtemplater 从 Word 模板中识别出的所有占位符名称。

#### ⚠️ 占位符不匹配警告
```
⚠️ Tags in template but not in data: [...]
```
这表示模板中有但数据中缺失的占位符。

```
⚠️ Tags in data but not in template: [...]
```
这表示数据中有但模板中缺失的占位符。

#### ⚠️ 未替换的占位符
```
⚠️ Found unreplaced placeholders in rendered text: [...]
```
这表示渲染后仍然存在的占位符（没有被替换）。

### 3. 常见问题及解决方案

#### 问题 1：占位符名称不匹配

**症状**：
- 日志显示 `⚠️ Tags in data but not in template: ['IMMEDIATE_FINDINGS']`
- 或 `⚠️ Tags in template but not in data: ['IMMEDIATE']`

**解决方案**：
- 检查 Word 模板中实际使用的占位符名称
- 修改代码中的占位符名称以匹配模板
- 或修改 Word 模板中的占位符名称以匹配代码

#### 问题 2：占位符被分割（Duplicate Tag Error）

**症状**：
- 日志显示 `duplicate_open_tag` 或 `duplicate_close_tag` 错误
- 占位符在 Word XML 中被分割成多个节点

**解决方案**：
- 在 Word 中打开 `report-template.docx`
- 找到被分割的占位符（如 `{{IMMEDIATE_FINDINGS}}`）
- 确保占位符是连续的文本，中间没有格式变化
- 选中整个占位符，统一格式
- 保存文件并重新部署

#### 问题 3：占位符格式不正确

**症状**：
- 日志显示占位符列表为空：`📋 Found placeholders: []`
- 但 Word 文档中有 `{{...}}` 文本

**解决方案**：
- 确保占位符格式正确：`{{TAG_NAME}}`
- 不要有多余的空格：`{{ TAG_NAME }}` ❌
- 不要使用特殊字符（除了下划线）
- 确保占位符在 Word 中是纯文本，不是公式或字段

### 4. 手动检查 Word 模板

1. 打开 `report-template.docx`
2. 使用查找功能（Ctrl+F / Cmd+F）搜索 `{{`
3. 列出所有找到的占位符：
   - `{{INSPECTION_ID}}`
   - `{{IMMEDIATE_FINDINGS}}`
   - `{{RECOMMENDED_FINDINGS}}`
   - `{{PLAN_FINDINGS}}`
   - `{{LIMITATIONS}}`
   - 等等...

4. 对比代码中使用的占位符名称（在 `generateWordReport.ts` 的 `templateData` 对象中）

### 5. 修复占位符名称不匹配

如果发现占位符名称不匹配，有两种修复方式：

#### 方式 A：修改代码（推荐）

编辑 `netlify/functions/generateWordReport.ts`，修改 `templateData` 对象中的键名：

```typescript
const templateData = {
  // 如果模板中使用 {{IMMEDIATE}}，改为：
  IMMEDIATE: immediateText,  // 而不是 IMMEDIATE_FINDINGS
  // ...
};
```

#### 方式 B：修改 Word 模板

在 Word 中：
1. 查找并替换所有占位符名称
2. 确保新名称与代码中的键名完全匹配
3. 保存文件
4. 复制到 `netlify/functions/report-template.docx`
5. 提交并推送

## 测试脚本

使用提供的测试脚本：

```bash
./test-generateWordReport.sh EH-2026-01-004
```

这会：
1. 调用 `generateWordReport` API
2. 显示响应结果
3. 提供下载链接

## 下一步

1. **查看 Netlify 日志**，找到占位符匹配的详细信息
2. **下载生成的 Word 文档**，手动检查占位符是否被替换
3. **对比日志中的占位符列表**，找出不匹配的项
4. **修复不匹配的占位符名称**
5. **重新测试**

## 需要帮助？

如果问题仍然存在，请提供：
1. Netlify 函数日志中的占位符列表
2. Word 模板中实际使用的占位符名称
3. 代码中使用的占位符名称（从日志中可以看到）

这样我可以帮你精确匹配占位符名称。
