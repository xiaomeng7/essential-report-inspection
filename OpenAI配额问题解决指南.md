# OpenAI API 配额不足问题解决指南

## 问题症状

当点击"AI生成report"按钮时，出现以下错误：
```
Error: OpenAI API配额不足。请检查您的OpenAI账户余额和计费设置。
```

或者在 Netlify Functions 日志中看到：
```
OpenAI API error: 429
"error": {
    "message": "You exceeded your current quota, please check your plan and billing details.",
    "type": "insufficient_quota",
    "code": "insufficient_quota"
}
```

## 原因

OpenAI API 需要账户有足够的余额或已设置付款方式才能使用。免费试用额度可能已用完，或者账户没有设置付款方式。

## 解决步骤

### 方法 1：添加付款方式（推荐）

1. **访问 OpenAI 平台**
   - 打开 https://platform.openai.com/
   - 登录您的账户

2. **进入计费设置**
   - 点击右上角的头像
   - 选择 **"Billing"**（计费）或 **"Settings"** → **"Billing"**

3. **添加付款方式**
   - 点击 **"Add payment method"**（添加付款方式）
   - 输入信用卡或借记卡信息
   - 保存付款方式

4. **设置使用限额（可选）**
   - 在 Billing 页面，您可以设置每月使用限额
   - 建议设置一个合理的限额以避免意外费用

5. **验证账户状态**
   - 确认账户状态显示为 **"Active"**（活跃）
   - 检查账户余额或信用额度

### 方法 2：充值账户余额

1. **访问计费页面**
   - https://platform.openai.com/account/billing

2. **添加充值金额**
   - 点击 **"Add funds"**（充值）
   - 选择充值金额（最低通常为 $5 或 $10）
   - 完成支付

3. **等待处理**
   - 充值通常立即生效
   - 账户余额会更新

### 方法 3：检查使用限制

1. **查看使用情况**
   - 访问 https://platform.openai.com/usage
   - 查看当前使用量和限制

2. **检查速率限制**
   - 某些账户可能有速率限制（每分钟/每小时请求数）
   - 如果遇到速率限制，需要等待一段时间后重试

## 费用说明

### 当前使用的模型
- **模型**: `gpt-4o-mini`
- **成本**: 约 $0.00015 / 1K tokens（输入），$0.0006 / 1K tokens（输出）

### 每次 AI 润色的估算成本
- **输入 tokens**: 约 2000-3000 tokens
- **输出 tokens**: 约 1000-2000 tokens
- **单次成本**: 约 **$0.0005 - $0.0015**（不到 1 美分）

### 成本控制建议
1. 设置每月使用限额
2. 定期检查使用情况
3. 只在需要时使用 AI 润色功能

## 验证修复

完成上述步骤后：

1. **等待几分钟**让 OpenAI 系统更新账户状态

2. **重新尝试 AI 生成**
   - 访问报告页面
   - 点击 "AI生成report" 按钮
   - 应该可以正常工作

3. **如果仍然失败**
   - 检查 Netlify Functions 日志
   - 确认错误信息是否已改变
   - 如果仍然是配额错误，可能需要等待更长时间或联系 OpenAI 支持

## 临时解决方案

如果暂时无法解决配额问题，您可以：

1. **使用原始报告**
   - 报告仍然可以正常查看和下载 PDF
   - AI 润色是可选的增强功能

2. **稍后重试**
   - 如果是临时配额限制，等待一段时间后重试

3. **联系 OpenAI 支持**
   - 如果问题持续，可以联系 OpenAI 支持团队
   - 访问 https://help.openai.com/

## 预防措施

1. **设置使用限额**
   - 在 OpenAI Billing 页面设置每月最大支出
   - 这样可以避免意外的高额费用

2. **监控使用情况**
   - 定期查看 https://platform.openai.com/usage
   - 了解 API 使用趋势

3. **设置余额提醒**
   - 在 Billing 页面设置低余额提醒
   - 确保账户始终有足够余额

## 需要帮助？

如果按照上述步骤操作后仍然遇到问题：

1. 检查 Netlify Functions 日志中的具体错误信息
2. 访问 OpenAI Platform 查看账户状态
3. 联系技术支持并提供错误日志

---

**注意**：OpenAI API 是付费服务。使用前请确保了解相关费用和计费方式。
