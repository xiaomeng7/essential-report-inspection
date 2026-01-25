# 如何查看 Netlify Functions 日志

## 重要区别

你刚才看到的是 **访问日志（Access Logs）**，只显示 HTTP 请求的状态码和响应时间。

我们需要看的是 **Functions 日志（Function Logs）**，那里才有我们代码中的 `console.log` 输出。

---

## 正确步骤：查看 Functions 日志

### 方法 1：通过 Netlify Dashboard（推荐）

1. **登录 Netlify**：https://app.netlify.com
2. **进入你的站点**：点击站点名称（`inspetionreport`）
3. **点击顶部菜单 "Functions"**（函数）
   - 不是在 "Site overview" 或 "Deploys"
   - 是独立的 **Functions** 菜单项
4. **找到 `submitInspection`**：
   - 在 Functions 列表中，应该能看到 `submitInspection`
   - 点击它进入详情页
5. **点击 "Logs" 标签**：
   - 在 Function 详情页，有多个标签（Overview、Logs、Settings 等）
   - 点击 **Logs** 标签
6. **查找日志**：
   - 找到时间 **10:05:06** 附近的日志
   - 应该能看到我们添加的详细日志

### 方法 2：通过 Deploys 页面

1. **进入 Deploys 页面**：
   - Netlify → 你的站点 → **Deploys**
2. **找到最新的部署**：
   - 找到时间最近的部署记录
3. **点击部署记录**：
   - 点击部署记录进入详情
4. **查看 Functions 日志**：
   - 在部署详情页，应该有 **Functions** 或 **Logs** 部分
   - 查找 `submitInspection` 的日志

---

## 你需要在日志中查找的内容

找到 **10:05:06** 附近的日志后，查找以下关键信息：

### 1. 环境变量检查日志

应该看到类似这样的日志：
```
Email sending - Environment check: {
  hasApiKey: true/false,
  apiKeyPrefix: "re_12..." 或 "none",
  from: "Electrical Inspection <reports@bhtechnology.com.au>",
  recipient: "info@bhtechnology.com.au"
}
```

### 2. 发送尝试日志

如果 `hasApiKey: true`，应该看到：
```
Attempting to send email via Resend...
```

### 3. 发送结果日志

**成功的情况**：
```
Email sent via Resend successfully: {
  emailId: "eml_xxxxx...",
  to: "info@bhtechnology.com.au",
  from: "..."
}
```

**失败的情况**：
```
Resend send error: { ... }
```
或
```
Failed to send email (non-blocking): { error: "...", ... }
```

---

## 如果找不到 Functions 日志

### 可能的原因：

1. **代码还没部署**：
   - 检查代码是否已推送到 GitHub
   - 检查 Netlify 是否已自动部署
   - 如果没有，手动触发部署

2. **Functions 菜单不可见**：
   - 确认你的站点确实有 Functions
   - 在 **Site configuration** → **Functions** 中查看

3. **日志被清空**：
   - Netlify 的日志可能只保留最近一段时间
   - 提交一条新的测试检查，然后立即查看日志

---

## 快速测试：提交新的检查并立即查看日志

1. **提交一条新的测试检查**
2. **立即查看 Functions 日志**（不要等太久）
3. **查找最新的日志条目**

这样能确保看到最新的日志输出。

---

## 如果还是找不到

请告诉我：
1. 在 Netlify Dashboard 中，你能看到 **Functions** 菜单吗？
2. 点击 Functions 后，能看到 `submitInspection` 这个 Function 吗？
3. 如果能看到，点击后能看到 **Logs** 标签吗？

或者，你可以：
- 截图 Netlify Dashboard 的 Functions 页面
- 告诉我你看到的界面是什么样的

这样我可以更准确地指导你。
