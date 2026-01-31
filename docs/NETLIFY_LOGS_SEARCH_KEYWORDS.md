# Netlify Logs 搜索关键字清单

在 Netlify Function 日志中搜索以下关键字，用于确认报告生成链路指纹：

## 必搜关键字（按执行顺序）

| 关键字 | 含义 |
|--------|------|
| `[report-fp]` | 所有指纹日志前缀（一次性筛选） |
| `[report-fp] BUILD` | 构建指纹：COMMIT_REF/CONTEXT/BRANCH、package.version |
| `[report-fp] responses source` | responses.yml 来源（blob/fs/fallback）、长度、sha1 |
| `[report-fp] template path` | 模板实际命中路径、buffer.length、sha1 |
| `[report-fp] CSS path` | reportStyles.css 命中路径、length、sha1 |
| `[report-fp] HTML length` | 完整 HTML 长度、css sha1 |
| `[report-fp] placeholder` | 占位符指纹：undefined keys 列表或 no undefined keys |
| `[report-fp] sanitize callCount` | sanitizeText 调用次数、preserveEmoji |
| `[report-fp] photo finding.id` | 每个 finding 的 photo_ids 数量 |
| `[report-fp] Using renderer:` | 渲染分支：HTML_MERGE(A) 或 HTML_ASTEXT(B) |

## 推荐搜索组合

```
[report-fp]
```

一次性看到该次请求的所有指纹日志。

## 分项验证

| 验证项 | 搜索 | 预期 |
|--------|------|------|
| 构建版本 | `[report-fp] BUILD` | 应有 COMMIT_REF 或 CONTEXT |
| 模板正确 | `[report-fp] template path` | 路径含 report-template-md.docx |
| CSS 正确 | `[report-fp] CSS path` | 路径含 reportStyles.css（非 FALLBACK） |
| 方案 A 成功 | `[report-fp] Using renderer: HTML_MERGE` | 表示 HTML 转 DOCX 成功 |
| 方案 B 回退 | `[report-fp] Using renderer: HTML_ASTEXT` | 表示回退到纯文本 |
| 无 undefined | `[report-fp] placeholder: no undefined` | 占位符均有效 |
| 照片数量 | `[report-fp] photo finding.id` | 每个 finding 的 photo_ids 数量 |
