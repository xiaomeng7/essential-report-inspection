# Pandoc Markdown 转 Word 工具

## 概述

`markdown-to-word-pandoc.ts` 是一个使用 `pandoc` 将 Markdown 文件转换为 Word 文档的脚本，支持使用参考文档（reference document）来应用样式。

## 安装 pandoc

在使用此脚本之前，需要先安装 `pandoc`：

### macOS
```bash
brew install pandoc
```

### Ubuntu/Debian
```bash
sudo apt-get install pandoc
```

### Windows
```bash
choco install pandoc
```

或访问 [pandoc 安装页面](https://pandoc.org/installing.html)

## 使用方法

### 基本用法

```bash
npm run markdown-to-word-pandoc report.md final-report.docx
```

### 使用参考文档（样式模板）

```bash
npm run markdown-to-word-pandoc report.md final-report.docx --reference-doc=report-style.docx
```

或直接使用 node：

```bash
node scripts/markdown-to-word-pandoc.ts report.md final-report.docx --reference-doc=report-style.docx
```

## 参数说明

- `<markdown-file>`: 输入的 Markdown 文件路径（必需）
- `[output-file]`: 输出的 Word 文档路径（可选，默认为输入文件名.docx）
- `--reference-doc=<style.docx>`: 参考文档路径（可选，用于应用样式）

## 参考文档（Reference Document）

参考文档是一个 Word 模板文件（.docx），用于定义：
- 标题样式（Heading 1, Heading 2, 等）
- 正文样式
- 列表样式
- 表格样式
- 页眉页脚
- 页面设置（页边距、纸张大小等）

### 创建参考文档

1. 在 Word 中创建一个新文档
2. 设置所需的样式（标题、正文、列表等）
3. 保存为 `report-style.docx`
4. 使用 `--reference-doc=report-style.docx` 参数

### 参考文档查找路径

脚本会在以下位置查找参考文档：
1. 直接路径（如果提供绝对路径）
2. 当前工作目录
3. 项目根目录
4. `netlify/functions/` 目录

## 示例

### 示例 1：基本转换

```bash
npm run markdown-to-word-pandoc report.md
```

输出：`report.docx`

### 示例 2：指定输出文件

```bash
npm run markdown-to-word-pandoc report.md final-report.docx
```

### 示例 3：使用样式参考文档

```bash
npm run markdown-to-word-pandoc report.md final-report.docx --reference-doc=report-style.docx
```

### 示例 4：完整路径

```bash
node scripts/markdown-to-word-pandoc.ts \
  /path/to/report.md \
  /path/to/output.docx \
  --reference-doc=/path/to/report-style.docx
```

## 与现有脚本的区别

- `markdown-to-word.ts`: 基础版本，不强制要求参考文档
- `markdown-to-word-pandoc.ts`: 增强版本，支持参考文档参数，更好的错误处理

## 注意事项

1. **pandoc 必须已安装**：脚本会检查 pandoc 是否可用
2. **参考文档路径**：如果提供的参考文档不存在，脚本会警告但继续执行（不使用参考文档）
3. **文件路径**：支持相对路径和绝对路径
4. **输出文件**：如果输出文件已存在，会被覆盖

## 故障排除

### 错误：pandoc 未安装

```
❌ 错误: pandoc 未安装
```

**解决方案**：按照上述安装说明安装 pandoc

### 警告：参考文档未找到

```
⚠️  参考文档未找到: report-style.docx
```

**解决方案**：
- 检查文件路径是否正确
- 确认文件存在于项目目录中
- 脚本会继续执行，但不应用样式

### 转换失败

检查：
1. Markdown 文件是否存在
2. 是否有写入输出目录的权限
3. pandoc 版本是否兼容（建议 2.0+）

## 相关文件

- `scripts/markdown-to-word.ts`: 基础转换脚本
- `netlify/functions/lib/generateReport.ts`: 生成 Markdown 报告
- `REPORT_STRUCTURE.md`: 报告结构规范
- `REPORT_GENERATION_RULES.md`: 报告生成规则
