# ServiceM8 预填排查指南（Snapshot 创建 Job 后）

## 问题现象

通过 Snapshot 发送 booking 邮件 → 点击「创建 Job」→ Service M8 创建了工作（如 job #769）→ 在 Inspection 第 0 页输入该编号后，地址和房屋信息没有传入。

## 可能原因与排查

### 1. 必须在 Start 前点击「Fetch details」

- **现象**：输入 job 编号后直接点击「Start / Continue」，未点击「Fetch details」。
- **处理**：必须先点击 **Fetch details** 才会发起预填请求。输入编号后务必点击该按钮，等待 1–2 秒看到摘要卡片后再点 Start。

### 2. 工作编号格式不匹配

- **现象**：提示「未在 ServiceM8 中找到该工作编号」，但 Service M8 中确实有该 job。
- **可能原因**：
  - 编号格式差异：Service M8 可能显示 `769`、`M8-769`、`JOB-769` 等，预填会尝试多种格式匹配。
  - 建议：优先尝试仅数字部分（如 `769`），若仍失败则尝试完整显示格式。
- **排查**：在 Netlify Functions 日志中搜索 `[servicem8] resolveJobNumberToUuid`，查看实际使用的 job_number 和解析结果。

### 3. Snapshot 未推送 job 映射

- **流程**：Snapshot 创建 job 后，应调用 `/api/internal/service-job-link` 推送 `job_uuid` 和 `job_number`。
- **影响**：若不推送，预填会走 ServiceM8 API 分页查询（可能较慢或受分页限制）。
- **排查**：在 Netlify 日志中搜索 `[internal-service-job-link] CALLED_WITH_INTERNAL_API_KEY success`，确认 Snapshot 是否成功调用。
- **配置**：SnapShot 需配置 `INTERNAL_API_KEY` 与 Inspection 站点一致，并在创建 job 后调用内部接口。

### 4. ServiceM8 API 配置

- **环境变量**：`SERVICEM8_API_TOKEN`、`SERVICEM8_AUTH_TYPE`（可选）、`SERVICEM8_API_BASE_URL`（可选）。
- **排查**：若提示「ServiceM8 集成未配置」或「API token 无效」，检查 Netlify 环境变量是否已设置且有效。
- **HTTP 200 但返回 HTML**：若提示「ServiceM8 API 返回了网页而非 JSON（HTTP 200）」：
  - **SERVICEM8_API_BASE_URL** 必须为 `https://api.servicem8.com`，不要用 `app.servicem8.com` 或 `www.servicem8.com`。
  - 若未设置该变量，默认即为正确值；若显式设置了错误值，请删除或改为 `https://api.servicem8.com`。

### 5. 地址未自动填入

- **原因**：地址自动填入依赖 Google Geocoding API，需配置 `GOOGLE_MAPS_API_KEY`。
- **流程**：预填成功后，若 ServiceM8 返回了地址，会调用 `/api/addressGeocode` 转为 place_id 并写入 Property address。
- **若未自动填入**：可能是 ServiceM8 中该 job 无地址，或 Geocoding 无匹配结果。可手动在表单中选择地址。

### 6. 新创建 job 的延迟

- **现象**：刚创建的 job 可能尚未同步到 ServiceM8 API。
- **建议**：创建 job 后等待几秒再在 Inspection 中执行预填。

## 快速自测

```bash
# 1. 用已知 job 编号测试预填接口（需配置 SERVICEM8_PREFILL_SECRET）
curl -X GET "https://YOUR-SITE.netlify.app/api/servicem8/job-prefill?job_number=769" \
  -H "x-servicem8-prefill-secret: YOUR_PREFILL_SECRET"

# 2. 若 Snapshot 可调用内部接口，推送 job 映射
curl -X POST "https://YOUR-SITE.netlify.app/api/internal/service-job-link" \
  -H "Content-Type: application/json" \
  -H "x-internal-api-key: YOUR_INTERNAL_API_KEY" \
  -d '{"job_uuid":"实际uuid","job_number":"769","source":"snapshot"}'
```

## 日志关键词

在 Netlify Functions 日志中搜索：

- `[servicem8-prefill]` - 预填入口
- `[servicem8]` - ServiceM8 API 调用
- `[internal-service-job-link]` - Snapshot 推送
- `[addr] addressGeocode` - 地址反查
