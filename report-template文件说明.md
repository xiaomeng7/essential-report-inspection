# Report Template 文件说明

## 📋 实际使用的文件

### 运行时使用的文件
- **`netlify/functions/report-template.docx`**
  - 这是代码中实际使用的 Word 模板文件
  - 代码在 `loadWordTemplate()` 函数中优先查找此文件
  - `netlify.toml` 中配置为 `included_files`

### 构建时需要的源文件
- **`report-template.docx`**（根目录）
  - 这是构建时的源文件
  - 通过 `package.json` 中的 `copy-word-template` 脚本复制到 `netlify/functions/report-template.docx`
  - 需要保留，因为构建时需要从此文件复制

## 🔄 文件流程

```
构建时：
report-template.docx (根目录)
    ↓ (copy-word-template 脚本)
netlify/functions/report-template.docx

运行时：
loadWordTemplate() 函数
    ↓ (优先查找)
netlify/functions/report-template.docx
```

## ✅ 保留的文件

1. **`report-template.docx`**（根目录）- 构建源文件
2. **`netlify/functions/report-template.docx`** - 运行时使用的文件

## ❌ 已删除的文件

1. `report-template-fixed.docx` - 备份文件
2. `report-template-with-placeholders.docx` - 测试文件
3. `report-template-with-placeholders-fixed.docx` - 测试文件
4. `netlify/functions/report-template-fixed.docx` - 备份文件
5. `.~port-template.docx` - 临时文件

## 📝 修改模板文件

如果需要修改 Word 模板：

1. **编辑根目录的 `report-template.docx`**
2. **运行构建脚本**：`npm run build`（会自动复制到 `netlify/functions/`）
3. **或者手动复制**：`cp report-template.docx netlify/functions/report-template.docx`

## 🔍 代码查找顺序

`loadWordTemplate()` 函数按以下顺序查找模板文件：

1. `netlify/functions/report-template.docx` ✅（优先使用）
2. `report-template.docx`（根目录，后备）
3. `process.cwd()/report-template.docx`
4. `process.cwd()/netlify/functions/report-template.docx`
5. `/opt/build/repo/report-template.docx`（Netlify 构建环境）
6. `/opt/build/repo/netlify/functions/report-template.docx`（Netlify 构建环境）
