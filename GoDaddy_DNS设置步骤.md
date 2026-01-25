# GoDaddy DNS 设置在哪里

## 一、DNS 设置入口

### 步骤 1：登录 GoDaddy

1. 打开浏览器，访问：**https://www.godaddy.com**
2. 点击右上角 **登录**，输入账号密码

### 步骤 2：进入域名列表

1. 登录后，点击右上角头像或 **我的产品**
2. 找到 **域名** 区域，点击 **DNS** 或 **管理**
3. 或在首页搜索框输入你的域名（如 `bhtechnology.com.au`），进入该域名

### 步骤 3：打开 DNS 管理页面

1. 在 **我的产品** → **域名** 中，找到你要设置的域名
2. 点击该域名右侧的 **DNS** 或 **管理 DNS**
3. 进入 **DNS 记录** / **Manage DNS** 页面

**常用路径总结：**

```
GoDaddy 首页 → 我的产品 → 域名 → 选中你的域名 → DNS（或 管理 DNS）
```

---

## 二、添加 Resend 域名验证所需的 DNS 记录

配置邮件（Resend）时，需要在 GoDaddy 添加 Resend 提供的记录。

### 在 Resend 获取要添加的记录

1. 登录 [Resend](https://resend.com) → **Domains** → **Add Domain**
2. 输入域名（如 `bhtechnology.com.au`）
3. Resend 会显示需要添加的记录，通常包括：
   - **TXT**：用于验证域名所有权
   - **MX**（可选）：用于收件

### 在 GoDaddy 添加记录

1. 在 **DNS 记录** 页面，点击 **添加** / **Add**
2. 选择记录类型（**TXT** 或 **MX**），按 Resend 给出的内容填写：

| 类型 | 名称 / Name | 值 / Value | TTL（通常默认即可） |
|------|-------------|------------|---------------------|
| **TXT** | `@` 或留空 | `resend-domain-verification=xxxxx...`（Resend 提供） | 1 小时 |
| **MX** | `@` 或留空 | `feedback-smtp.resend.com`，Priority: `10` | 1 小时 |

3. 点击 **保存** / **Save**

### 填写说明

- **名称 (Name)**：
  - 根域名用 `@` 或留空
  - 子域名填子域部分，如 `mail` 表示 `mail.bhtechnology.com.au`
- **值 (Value)**：必须与 Resend 给出的完全一致，不要多空格
- **MX 优先级 (Priority)**：Resend 一般要求 `10`

---

## 三、常见问题

### Q：找不到「DNS」或「管理 DNS」？

- 确认你登录的是 **域名** 所在账号
- 在 **我的产品** 里找 **域名**，点进具体域名后再找 **DNS**
- 新版界面可能叫 **DNS 记录** 或 **Manage DNS**

### Q：域名不是在 GoDaddy 买的，能在 GoDaddy 改 DNS 吗？

- 不能。DNS 要在 **域名当前使用的 DNS 服务商** 那里改
- 若域名在 GoDaddy 但用了外部 DNS（如 Cloudflare），需去对应服务商添加记录

### Q：添加后多久生效？

- 通常 **几分钟到 1 小时**
- 最多可能 **24–48 小时**，改完后在 Resend 里等验证状态更新即可

### Q：怎么确认用的是 GoDaddy 的 DNS？

- 在 GoDaddy 域名页查看 **名称服务器 (Nameservers)**
- 若为 `xxx.domaincontrol.com` 等 GoDaddy 的，说明 DNS 在 GoDaddy 管理

---

## 四、下一步

- DNS 记录添加并生效后，回到 **Resend → Domains**，等待域名状态变为 **Verified**
- 验证成功后，在 Netlify 环境变量里设置 `RESEND_FROM`（如 `reports@bhtechnology.com.au`），然后重新部署站点

更完整的邮件配置流程见：**`邮件配置详细步骤.md`**。
