# OpenAI API 配置说明

## 问题
当点击"AI生成report"按钮时，如果出现以下错误：
```
Error: OpenAI API key not configured
```

这表示您还没有在 Netlify 中配置 OpenAI API 密钥。

## 解决步骤

### 1. 获取 OpenAI API 密钥

1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 登录您的账户（如果没有账户，需要先注册）
3. 点击右上角的头像，选择 "API keys"
4. 点击 "Create new secret key"
5. 复制生成的 API 密钥（格式类似：`sk-...`）
   - ⚠️ **重要**：密钥只会显示一次，请妥善保存

### 2. 在 Netlify 中配置环境变量

1. 登录 [Netlify Dashboard](https://app.netlify.com/)
2. 选择您的站点（`inspetionreport` 或类似名称）
3. 进入 **Site settings**（站点设置）
4. 在左侧菜单中找到 **Environment variables**（环境变量）
5. 点击 **Add a variable**（添加变量）
6. 填写以下信息：
   - **Key（键）**: `OPENAI_API_KEY`
   - **Value（值）**: 粘贴您刚才复制的 OpenAI API 密钥
   - **Scopes（作用域）**: 选择 "All scopes" 或 "Production, Deploy previews, Branch deploys"
7. 点击 **Save**（保存）

### 3. 重新部署站点

配置环境变量后，您需要触发一次新的部署：

1. 在 Netlify Dashboard 中，进入 **Deploys**（部署）标签
2. 点击 **Trigger deploy**（触发部署）→ **Deploy site**（部署站点）
3. 等待部署完成（通常需要 1-2 分钟）

或者，您可以推送任何代码更改到 GitHub，Netlify 会自动部署。

### 4. 验证配置

部署完成后：
1. 访问您的站点
2. 提交一个检查报告
3. 在报告页面点击 "AI生成report" 按钮
4. 如果配置正确，AI 会开始润色报告（可能需要 10-30 秒）

## 费用说明

- OpenAI API 使用按量计费
- 当前使用的是 `gpt-4o-mini` 模型，成本较低
- 每次 AI 润色大约消耗 1000-4000 tokens
- 费用估算：约 $0.0001 - $0.0004 每次润色
- 您可以在 [OpenAI Usage Dashboard](https://platform.openai.com/usage) 查看使用情况

## 故障排除

### 错误：OpenAI API key not configured
- ✅ 确认已在 Netlify 环境变量中设置了 `OPENAI_API_KEY`
- ✅ 确认已重新部署站点
- ✅ 确认 API 密钥格式正确（以 `sk-` 开头）

### 错误：Insufficient quota（配额不足）
- 检查您的 OpenAI 账户是否有足够的余额
- 访问 [OpenAI Billing](https://platform.openai.com/account/billing) 添加付款方式

### 错误：Invalid API key（无效的 API 密钥）
- 确认 API 密钥没有过期或被撤销
- 重新生成一个新的 API 密钥并更新环境变量

### AI 润色失败或超时
- 检查 Netlify Functions 日志：Site settings → Functions → View logs
- 确认网络连接正常
- 如果持续失败，可以尝试降低 `max_tokens` 参数（在 `enhanceReport.ts` 中）

## 安全提示

- ⚠️ **不要**将 API 密钥提交到 Git 仓库
- ⚠️ **不要**在前端代码中暴露 API 密钥
- ✅ API 密钥应该只存储在 Netlify 环境变量中
- ✅ 定期轮换 API 密钥以提高安全性

## 需要帮助？

如果遇到问题，请检查：
1. Netlify Functions 日志
2. OpenAI Platform 的使用情况
3. 浏览器控制台错误信息

然后联系技术支持并提供相关错误信息。
