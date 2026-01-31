# Netlify DOCX 生成链路审计报告

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `netlify/functions/generateWordReport.ts` | RUN_ID、阶段日志、rawTemplateData 兜底、renderDocx 前硬断言 |
| `netlify/functions/lib/buildReportMarkdown.ts` | VERSION、哨兵文本 SENTINEL_*_V1、CAPEX_SNAPSHOT undefined 兜底 |
| `netlify/functions/lib/generateFindingPages.ts` | VERSION、photo_ids 数量日志 |
| `netlify/functions/lib/markdownToHtml.ts` | VERSION |
| `netlify/functions/lib/renderDocx.ts` | VERSION |
| `netlify/functions/lib/generateReport.ts` | Evidence 默认文案统一为 "No photographic evidence captured at time of assessment." |

---

## 日志关键字（用于 Netlify Logs 排查）

| 关键字 | 含义 |
|--------|------|
| `[report][RUN_ID]` | 本次请求唯一 ID（时间戳+4位随机） |
| `handler started` | 入口开始 |
| `after load inspection` | 已加载 inspection |
| `before buildReportMarkdown/buildReportHtml` | 即将生成 HTML |
| `after buildReportMarkdown/buildReportHtml` | HTML 生成完成 |
| `buildReportMarkdown FAILED` | buildReportMarkdown 异常 |
| `before renderDocx` | 即将生成 DOCX |
| `after renderDocx` | DOCX 生成完成 |
| `buildReportMarkdown VERSION=2026-01-31-v1` | 确认 buildReportMarkdown 版本 |
| `markdownToHtml VERSION=2026-01-31-v1` | 确认 markdownToHtml 版本 |
| `renderDocx VERSION=2026-01-31-v1` | 确认 renderDocx 版本 |
| `generateFindingPages VERSION=2026-01-31-v1` | 确认 generateFindingPages 版本 |
| `finding.id=... photo_ids=N` | 每个 finding 的 photo_ids 数量 |

---

## 如何判断「新链路」vs「旧链路」

### 新链路特征（部署新代码后）

1. **RUN_ID 存在**：日志出现 `[report][RUN_ID] xxx handler started`
2. **VERSION 一致**：日志出现 `buildReportMarkdown VERSION=2026-01-31-v1` 等
3. **哨兵文本**：生成的 DOCX 中可搜索到：
   - `SENTINEL_PURPOSE_V1`
   - `SENTINEL_FINDINGS_V1`
   - `SENTINEL_DECISION_V1`
4. **无硬断言失败**：若 reportHtml 缺少 SENTINEL_FINDINGS_V1 会抛错，不会走到 renderDocx

### 旧链路特征（未部署或缓存旧代码）

1. 无 `[report][RUN_ID]` 或 VERSION 日志
2. DOCX 中无 SENTINEL_*_V1
3. 可能出现 "No photo/evidence provided."（旧 generateReport 默认文案）
4. 可能出现 "Assessment Purpose: undefined"（coverData 未兜底）
5. 可能出现 "AUD $undefined - $undefined"（CAPEX 未兜底）
6. 可能出现 "Investor Options & Next Steps"（旧 defaultText 标题）

---

## 硬断言（renderDocx 前）

1. `templateData` 中任意 value 为 `undefined` → throw，错误里列出 keys
2. `reportHtml` 必须包含 `SENTINEL_FINDINGS_V1` → 否则 throw（可能旧 buildReportMarkdown）
3. `reportHtml` 若包含 `Photo P` 则必须包含 `<a href=` → 否则 throw（Evidence 链接缺失）

---

## 最小兜底

| 字段 | 兜底 |
|------|------|
| ASSESSMENT_PURPOSE | `coverData.ASSESSMENT_PURPOSE ?? "Decision-support electrical risk & CapEx planning assessment"` |
| rawTemplateData 各字段 | `String(x ?? "")` 或明确默认 |
| CAPEX_SNAPSHOT | 含 "undefined" 或空 → `"To be confirmed (indicative, planning only)"` |
| Evidence 默认 | `"No photographic evidence captured at time of assessment."` |
