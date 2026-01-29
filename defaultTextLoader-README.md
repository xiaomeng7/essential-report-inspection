# DefaultTextLoader 模块使用说明

## 📋 概述

`defaultTextLoader.ts` 模块用于加载 `DEFAULT_REPORT_TEXT.md` 文件，并将其解析为 `DefaultText` 对象，为所有 Word 模板占位符提供默认值（兜底值）。

## 🎯 目标

1. **确保所有 Word 占位符都有值**：在 `buildReportData()` 中，所有占位符都必须有值
2. **提供兜底机制**：如果某个字段无法从 `inspection` / `findings` / `responses.yml` 计算得出，则使用 `DEFAULT_TEXT` 中的对应内容作为兜底

## 📁 文件结构

```
netlify/functions/
├── lib/
│   └── defaultTextLoader.ts    # 默认文本加载器模块
├── DEFAULT_REPORT_TEXT.md       # 默认文本配置文件
└── generateWordReport.ts        # 使用 defaultTextLoader

DEFAULT_REPORT_TEXT.md           # 根目录的配置文件（构建时复制）
```

## 📝 DEFAULT_REPORT_TEXT.md 格式

Markdown 文件格式：

```markdown
# Default Report Text

## Word Template Placeholders

### INSPECTION_ID
N/A

### ASSESSMENT_DATE
Date not available

### PREPARED_FOR
Client information not provided

...
```

### 格式规则

1. **占位符标题**：使用 `### PLACEHOLDER_NAME` 格式
2. **占位符名称**：必须是大写字母、数字和下划线（`A-Z0-9_`）
3. **默认值**：标题后的内容（直到下一个 `###` 或文件结束）是该占位符的默认值
4. **多行支持**：支持多行文本（保留换行符）
5. **Fallback**：如果某个占位符在文件中不存在，会使用内置的 fallback 值

## 🔧 使用方法

### 1. 基本使用

```typescript
import { loadDefaultText } from "./lib/defaultTextLoader";

// 加载默认文本（无 event，只从文件系统加载）
const defaultText = await loadDefaultText();

console.log(defaultText.INSPECTION_ID);  // "N/A"
console.log(defaultText.ASSESSMENT_DATE);  // "Date not available"
```

### 2. 在 Netlify Function 中使用（带 event）

```typescript
import { loadDefaultText } from "./lib/defaultTextLoader";
import type { HandlerEvent } from "@netlify/functions";

export const handler = async (event: HandlerEvent) => {
  // 优先从 Blob Store 加载，后备文件系统
  const defaultText = await loadDefaultText(event);
  
  // 使用默认值作为兜底
  const inspectionId = actualInspectionId || defaultText.INSPECTION_ID;
  const assessmentDate = actualDate || defaultText.ASSESSMENT_DATE;
};
```

### 3. 在 buildReportData 中使用

```typescript
// 在 generateWordReport.ts 中
const defaultText = await loadDefaultText(event);

// 构建 templateData，使用默认值作为兜底
const templateData: Record<string, string> = {
  // 先设置所有默认值
  ...defaultText,
  
  // 然后用实际值覆盖（如果存在）
  INSPECTION_ID: inspection_id || defaultText.INSPECTION_ID,
  ASSESSMENT_DATE: assessmentDate || defaultText.ASSESSMENT_DATE,
  PREPARED_FOR: preparedFor || defaultText.PREPARED_FOR,
  // ... 等等
};
```

## 📊 数据结构

### DefaultText 类型

```typescript
export type DefaultText = {
  // 基本信息（6个）
  INSPECTION_ID: string;
  ASSESSMENT_DATE: string;
  PREPARED_FOR: string;
  PREPARED_BY: string;
  PROPERTY_ADDRESS: string;
  PROPERTY_TYPE: string;
  
  // Findings 部分（5个）
  IMMEDIATE_FINDINGS: string;
  RECOMMENDED_FINDINGS: string;
  PLAN_FINDINGS: string;
  LIMITATIONS: string;
  URGENT_FINDINGS: string;
  
  // 报告元数据（5个）
  REPORT_VERSION: string;
  OVERALL_STATUS: string;
  EXECUTIVE_SUMMARY: string;
  RISK_RATING: string;
  RISK_RATING_FACTORS: string;
  
  // 技术部分（2个）
  TEST_SUMMARY: string;
  TECHNICAL_NOTES: string;
  
  // 扩展字段（允许添加额外的占位符）
  [key: string]: string;
};
```

### 数据结构示例

```typescript
const exampleDefaultText: DefaultText = {
  INSPECTION_ID: "N/A",
  ASSESSMENT_DATE: "Date not available",
  PREPARED_FOR: "Client information not provided",
  PREPARED_BY: "Better Home Technology Pty Ltd",
  PROPERTY_ADDRESS: "Address not provided",
  PROPERTY_TYPE: "Property type not specified",
  IMMEDIATE_FINDINGS: "No immediate safety risks were identified at the time of inspection.",
  RECOMMENDED_FINDINGS: "No items requiring short-term planned action were identified at the time of inspection.",
  PLAN_FINDINGS: "No additional items were identified for planning or monitoring at this time.",
  LIMITATIONS: "This assessment is non-invasive and limited to accessible areas only.",
  URGENT_FINDINGS: "No immediate safety risks were identified at the time of inspection.",
  REPORT_VERSION: "1.0",
  OVERALL_STATUS: "Satisfactory",
  EXECUTIVE_SUMMARY: "No significant issues identified during this inspection.",
  RISK_RATING: "LOW",
  RISK_RATING_FACTORS: "No significant risk factors identified",
  TEST_SUMMARY: "Electrical safety inspection completed in accordance with applicable standards.",
  TECHNICAL_NOTES: "This is a non-invasive visual inspection limited to accessible areas.",
};
```

## 🔄 加载优先级

1. **缓存**：如果已加载过，直接返回缓存值
2. **Blob Store**（如果提供了 `event`）：优先从 Netlify Blob Store 加载
3. **文件系统**：后备从文件系统加载 `DEFAULT_REPORT_TEXT.md`
4. **内置 Fallback**：如果文件不存在或解析失败，使用内置的 fallback 值

## 🛠️ API 参考

### `loadDefaultText(event?: HandlerEvent): Promise<DefaultText>`

加载默认文本。

**参数：**
- `event` (可选): Netlify HandlerEvent，用于访问 Blob Store

**返回：**
- `Promise<DefaultText>`: 包含所有占位符默认值的对象

**示例：**
```typescript
const defaultText = await loadDefaultText(event);
```

### `clearDefaultTextCache(): void`

清除默认文本缓存（用于测试或重新加载）。

**示例：**
```typescript
import { clearDefaultTextCache } from "./lib/defaultTextLoader";

clearDefaultTextCache();  // 清除缓存，下次调用 loadDefaultText 时会重新加载
```

## 📦 部署配置

### netlify.toml

确保 `DEFAULT_REPORT_TEXT.md` 被包含在 Netlify Functions 部署中：

```toml
[functions]
  included_files = [
    "./netlify/functions/DEFAULT_REPORT_TEXT.md"
  ]
```

### package.json

构建脚本会自动复制 `DEFAULT_REPORT_TEXT.md`：

```json
{
  "scripts": {
    "copy-default-text": "cp DEFAULT_REPORT_TEXT.md netlify/functions/DEFAULT_REPORT_TEXT.md || true"
  }
}
```

## ✅ 集成检查清单

- [x] 创建 `defaultTextLoader.ts` 模块
- [x] 创建 `DEFAULT_REPORT_TEXT.md` 文件
- [x] 更新 `generateWordReport.ts` 使用 `loadDefaultText`
- [x] 更新 `netlify.toml` 包含 `DEFAULT_REPORT_TEXT.md`
- [x] 更新 `package.json` 添加复制脚本
- [x] 确保所有占位符都有默认值

## 🐛 故障排除

### 问题：找不到 DEFAULT_REPORT_TEXT.md

**解决方案：**
1. 确保文件存在于 `netlify/functions/DEFAULT_REPORT_TEXT.md`
2. 检查 `netlify.toml` 中的 `included_files` 配置
3. 检查构建脚本是否正确复制文件

### 问题：占位符显示为 undefined

**解决方案：**
1. 确保 `DEFAULT_REPORT_TEXT.md` 中包含该占位符
2. 检查占位符名称是否正确（必须是大写字母、数字和下划线）
3. 检查 `generateWordReport.ts` 中是否正确使用了 `defaultText`

### 问题：Blob Store 中的内容未更新

**解决方案：**
1. 使用 `clearDefaultTextCache()` 清除缓存
2. 检查 Blob Store 中的文件是否正确上传
3. 检查 `event` 参数是否正确传递

## 📚 相关文件

- `netlify/functions/lib/defaultTextLoader.ts` - 默认文本加载器实现
- `DEFAULT_REPORT_TEXT.md` - 默认文本配置文件
- `netlify/functions/generateWordReport.ts` - Word 报告生成器（使用 defaultTextLoader）
- `defaultTextLoader-example.ts` - 使用示例
