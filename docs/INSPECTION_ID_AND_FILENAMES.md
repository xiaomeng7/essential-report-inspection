# Inspection ID 与 Word 文件名

## Inspection ID 何时产生？

**Inspection ID** 在**技师提交检查（Submit）时**生成，即 Wizard 填完并点击提交、请求到达 `submitInspection` 时：

1. 调用 `getNextInspectionNumber(event)` 从 Blob 取并递增序号（1–999 循环）。
2. 格式为 `EH-{年}-{月}-{序号}`，例如 `EH-2026-02-001`。
3. 生成后立即与当次提交的 `raw`（含地址、findings 等）一起写入 Blob，故**每条检查在首次提交时就有唯一 ID**，且与地址等信息同属同一条记录。

实现位置：`netlify/functions/submitInspection.ts` 中的 `genId(event)`。

---

## Word 下载文件名（含地址）

下载 Word 报告时，若能从 inspection 中解析出**物业地址**，则下载文件名会带地址，便于日后查找：

- **格式**：`{地址缩写}-{inspection_id}.docx`  
  例如：`123-Main-St-Sydney-NSW-2000-EH-2026-02-001.docx`
- **地址来源**：`inspection.raw` → `normalizeInspection` → `canonical.property_address`（与报告封面地址一致）。
- **安全处理**：地址会转成短 slug（仅保留字母、数字、空格、逗号、连字符、句点，总长约 50 字符），避免文件名非法字符。
- **无地址时**：回退为 `{inspection_id}.docx`。

Blob 存储的 key 仍为 `reports/{inspection_id}.docx`，仅**下载时**返回的 `Content-Disposition` 中的 filename 带地址。

实现位置：`netlify/functions/downloadWord.ts`（调用 `get(inspectionId)` 与 `normalizeInspection` 得到地址并拼 filename）。
