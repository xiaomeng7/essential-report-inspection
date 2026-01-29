# Markdown 报告生成脚本使用说明

## 📋 概述

这些脚本用于先生成 Markdown 格式的报告，然后可以转换为 Word 文档。这样可以：
- 更容易调试和查看报告内容
- 更灵活地修改格式
- 避免 Word 模板的复杂性

## 🚀 快速开始

### 1. 生成 Markdown 报告

```bash
npm run test:markdown
```

或者直接运行：

```bash
node scripts/test-markdown-report.mjs
```

这会生成 `test-report.md` 文件。

### 2. 转换为 Word 文档

#### 方法 1: 使用 pandoc（推荐）

首先安装 pandoc：
```bash
# macOS
brew install pandoc

# Linux
sudo apt-get install pandoc

# Windows
choco install pandoc
```

然后转换：
```bash
pandoc test-report.md -o test-report.docx
```

#### 方法 2: 使用在线工具

1. 打开 https://www.markdowntoword.com/
2. 上传 `test-report.md`
3. 下载生成的 Word 文档

#### 方法 3: 在 Word 中直接打开

Microsoft Word 可以直接打开 `.md` 文件并转换为 Word 格式。

## 📝 脚本说明

### `test-markdown-report.mjs`

生成 Markdown 格式的报告。

**功能：**
- 使用测试数据生成报告
- 调用 `buildWordTemplateData` 获取所有数据
- 格式化为 Markdown
- 保存为 `test-report.md`

**输出示例：**
```markdown
# Electrical Property Health Assessment

**Report ID:** EH-2026-01-TEST
**Assessment Date:** 2026-01-29
...

## Overall Electrical Status

**HIGH RISK**

## Executive Summary

This property presents a high electrical risk profile...
```

### `markdown-to-word.ts`

将 Markdown 文件转换为 Word 文档（需要 pandoc）。

**使用方法：**
```bash
npm run markdown-to-word test-report.md
```

## 🔧 集成到现有流程

### 选项 1: 完全替换 Word 模板方式

修改 `generateWordReport.ts`：
1. 生成 Markdown
2. 使用 pandoc 转换为 Word
3. 返回 Word 文档

### 选项 2: 作为调试工具

保留现有的 Word 模板方式，使用 Markdown 作为：
- 调试工具
- 预览工具
- 备用生成方式

## 📦 依赖

- Node.js 18+
- pandoc（可选，用于转换为 Word）

## 🎯 优势

1. **易于调试**：Markdown 是纯文本，容易查看和修改
2. **版本控制友好**：Markdown 文件可以很好地用 Git 管理
3. **格式灵活**：可以轻松调整 Markdown 格式
4. **工具丰富**：有很多工具可以将 Markdown 转换为 Word
5. **避免 Word 模板问题**：不需要处理 Word 模板的复杂性

## 📄 示例输出

生成的 Markdown 文件包含：
- 报告头部信息
- Overall Electrical Status
- Executive Summary
- Risk Assessment
- Immediate Safety Concerns
- Recommended Actions
- Planning & Monitoring
- Limitations
- Technical Notes

## 🔄 下一步

如果需要完全集成到生产流程：
1. 修改 `generateWordReport.ts` 添加 Markdown 生成选项
2. 使用 `pandoc` 或 `docx` 库转换为 Word
3. 保留 Word 模板方式作为后备
