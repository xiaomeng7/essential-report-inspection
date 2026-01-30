# 报告生成相关文件路径列表

## 核心报告生成文件

### Word 报告生成（主要入口）
- `netlify/functions/generateWordReport.ts` - 主要的 Word 报告生成函数，整合所有数据源
- `netlify/functions/generateWord.ts` - Word 文档生成（备用/旧版本）
- `netlify/functions/generateMarkdownWord.ts` - Markdown 转 Word 生成器

### Markdown 报告生成
- `netlify/functions/lib/generateReport.ts` - Markdown 报告生成器
- `netlify/functions/lib/buildReportMarkdown.ts` - 构建完整 Markdown 报告内容

### Finding 页面生成
- `netlify/functions/lib/generateFindingPages.ts` - **新增**：严格验证的 finding 页面生成器（返回 docx 兼容 HTML）
- `netlify/functions/lib/generateDynamicFindingPages.ts` - 动态 finding 页面生成（委托给 generateFindingPages）

## 数据加载和处理

### Finding Profiles
- `netlify/functions/lib/findingProfilesLoader.ts` - Finding profiles 加载器（支持类别默认值合并）
- `finding_profiles.yml` - Finding profiles 配置文件（包含类别默认值）
- `profiles/finding_profiles.yml` - Finding profiles 配置文件（备用路径）

### Responses 和默认文本
- `responses.yml` - Finding 响应文本配置
- `netlify/functions/responses.yml` - Finding 响应文本配置（备用路径）
- `netlify/functions/lib/defaultTextLoader.ts` - 默认文本加载器
- `DEFAULT_TEXT_LIBRARY.md` - 默认文本库
- `DEFAULT_REPORT_TEXT.md` - 默认报告文本
- `DEFAULT_TERMS.md` - 默认条款和条件
- `netlify/functions/lib/executiveSummaryLoader.ts` - Executive summary 模板加载器

### 占位符映射
- `src/reporting/placeholderMap.ts` - **单一数据源**：Word 模板占位符映射和类型定义

## 评分和信号生成

### 评分模型
- `netlify/functions/lib/scoring.ts` - Priority × Risk × Budget 评分模型（后端）
- `src/lib/scoring.ts` - Priority × Risk × Budget 评分模型（前端）

### Executive Signals
- `netlify/functions/lib/executiveSignals.ts` - Executive decision signals 生成器（后端）
- `src/lib/executiveSignals.ts` - Executive decision signals 生成器（前端）

## 数据规范化

### Canonical 层
- `netlify/functions/lib/normalizeInspection.ts` - Inspection 数据规范化
- `src/lib/normalizeInspection.ts` - Inspection 数据规范化（前端）
- `mappings/raw_to_canonical.yml` - Raw 到 Canonical 字段映射

### Finding 推导
- `netlify/functions/lib/deriveFindings.ts` - 从 raw 数据推导 findings（后端）
- `src/lib/deriveFindings.ts` - 从 raw 数据推导 findings（前端）
- `mappings/raw_to_finding_candidates.yml` - Raw 到 Finding 候选映射

## 工具和转换

### HTML/Markdown 转换
- `netlify/functions/lib/markdownToHtml.ts` - Markdown 转 HTML
- `netlify/functions/lib/renderDocx.ts` - DOCX 渲染（使用 html-docx-js-typescript）

### 占位符修复
- `scripts/fix-placeholders.ts` - Word 模板占位符修复工具

## 配置文件

### 报告规则和结构
- `REPORT_GENERATION_RULES.md` - 报告生成规则（非协商性）
- `REPORT_STRUCTURE.md` - 报告结构定义
- `EXECUTIVE_SUMMARY_TEMPLATES.md` - Executive summary 模板
- `PLACEHOLDER_MAP.md` - 占位符映射文档

### 模板文件
- `report-template-md.docx` - Markdown 转 Word 模板
- `report-template.docx` - Word 模板（旧版本）
- `report-template.html` - HTML 报告模板

## 测试脚本

### 报告生成测试
- `scripts/test-generate-report.ts` - 测试报告生成
- `scripts/test-build-report-data.ts` - 测试报告数据构建
- `scripts/generate-markdown-report.ts` - 生成 Markdown 报告测试
- `scripts/generate-markdown-report-full.ts` - 生成完整 Markdown 报告测试

### 功能测试
- `scripts/test-scoring.ts` - 测试评分模型
- `scripts/test-executive-signals.ts` - 测试 Executive signals
- `scripts/test-executive-signals-validation.ts` - 测试 Executive signals 验证
- `scripts/test-validate-executive-signals.ts` - 测试 Executive signals 验证（备用）
- `scripts/test-placeholder-fallback.ts` - 测试占位符回退
- `scripts/test-dominant-risk.ts` - 测试主导风险计算
- `scripts/test-sanitize-text.ts` - 测试文本清理
- `scripts/test-terms-and-conditions.ts` - 测试条款和条件加载

### 数据升级脚本
- `scripts/upgrade-finding-profiles.ts` - 升级 finding profiles 结构
- `scripts/upgrade-responses.ts` - 升级 responses.yml 结构

## 其他相关文件

### 报告增强
- `netlify/functions/enhanceReport.ts` - 报告增强（AI 处理）

### 存储
- `netlify/functions/lib/store.ts` - 数据存储（inspection 数据）

## 文件组织结构

```
essential_report_specs/
├── netlify/functions/
│   ├── generateWordReport.ts          # 主入口：Word 报告生成
│   ├── generateWord.ts                # Word 生成（备用）
│   ├── generateMarkdownWord.ts        # Markdown 转 Word
│   ├── enhanceReport.ts               # 报告增强
│   ├── responses.yml                  # Finding 响应配置
│   ├── DEFAULT_TEXT_LIBRARY.md       # 默认文本库
│   ├── DEFAULT_REPORT_TEXT.md        # 默认报告文本
│   └── lib/
│       ├── generateReport.ts          # Markdown 报告生成
│       ├── buildReportMarkdown.ts    # Markdown 构建
│       ├── generateFindingPages.ts   # Finding 页面生成（新）
│       ├── generateDynamicFindingPages.ts  # 动态 finding 页面
│       ├── findingProfilesLoader.ts  # Finding profiles 加载
│       ├── scoring.ts                # 评分模型
│       ├── executiveSignals.ts      # Executive signals
│       ├── executiveSummaryLoader.ts # Executive summary 加载
│       ├── normalizeInspection.ts    # 数据规范化
│       ├── deriveFindings.ts         # Finding 推导
│       ├── defaultTextLoader.ts      # 默认文本加载
│       ├── markdownToHtml.ts         # Markdown 转 HTML
│       └── renderDocx.ts             # DOCX 渲染
│
├── src/
│   ├── reporting/
│   │   └── placeholderMap.ts         # 占位符映射（单一数据源）
│   └── lib/
│       ├── scoring.ts                 # 评分模型（前端）
│       ├── executiveSignals.ts       # Executive signals（前端）
│       ├── normalizeInspection.ts    # 数据规范化（前端）
│       └── deriveFindings.ts        # Finding 推导（前端）
│
├── profiles/
│   └── finding_profiles.yml          # Finding profiles 配置
│
├── mappings/
│   ├── raw_to_canonical.yml          # Raw 到 Canonical 映射
│   └── raw_to_finding_candidates.yml # Raw 到 Finding 映射
│
├── scripts/
│   ├── test-*.ts                     # 各种测试脚本
│   ├── generate-*.ts                # 报告生成脚本
│   ├── upgrade-*.ts                 # 数据升级脚本
│   └── fix-placeholders.ts          # 占位符修复
│
├── finding_profiles.yml              # Finding profiles（根目录）
├── responses.yml                      # Responses 配置（根目录）
├── DEFAULT_TERMS.md                  # 默认条款
├── REPORT_GENERATION_RULES.md        # 报告生成规则
├── REPORT_STRUCTURE.md                # 报告结构
├── EXECUTIVE_SUMMARY_TEMPLATES.md    # Executive summary 模板
├── PLACEHOLDER_MAP.md                # 占位符映射文档
└── report-template-md.docx           # Word 模板
```

## 主要数据流

1. **数据输入** → `normalizeInspection.ts` → Canonical 数据
2. **Finding 推导** → `deriveFindings.ts` → Findings 数组
3. **Finding Profiles** → `findingProfilesLoader.ts` → 规范化 Profiles（含类别默认值）
4. **Responses** → `loadResponses()` → 响应文本
5. **评分计算** → `scoring.ts` → Overall score, CapEx, dominantRisk
6. **Executive Signals** → `executiveSignals.ts` → Executive decision signals
7. **Finding Pages** → `generateFindingPages.ts` → HTML 内容（严格验证）
8. **Markdown 构建** → `buildReportMarkdown.ts` → 完整 Markdown
9. **HTML 转换** → `markdownToHtml.ts` → HTML
10. **Word 生成** → `generateWordReport.ts` → 最终 Word 文档

## 关键文件说明

### 必须阅读的文件
1. `netlify/functions/generateWordReport.ts` - 主入口，了解整体流程
2. `src/reporting/placeholderMap.ts` - 占位符类型定义（单一数据源）
3. `netlify/functions/lib/generateFindingPages.ts` - Finding 页面生成（严格验证）
4. `netlify/functions/lib/findingProfilesLoader.ts` - Finding profiles 加载和规范化
5. `REPORT_GENERATION_RULES.md` - 报告生成规则（必须遵守）
6. `REPORT_STRUCTURE.md` - 报告结构定义

### 配置文件
- `finding_profiles.yml` - Finding profiles（包含类别默认值）
- `responses.yml` - Finding 响应文本
- `DEFAULT_TEXT_LIBRARY.md` - 默认文本库
- `DEFAULT_TERMS.md` - 条款和条件
