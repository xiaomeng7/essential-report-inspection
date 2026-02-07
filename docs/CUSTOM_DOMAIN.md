# 自定义域名：inspection.bhtechnology.com.au

本文档说明如何将站点绑定到自定义域名 **inspection.bhtechnology.com.au**（Better Home Technology）。

## 一、在 Netlify 添加域名

1. 登录 [Netlify](https://app.netlify.com)，进入对应站点的 **Site configuration** → **Domain management**。
2. 点击 **Add custom domain** 或 **Add domain alias**。
3. 输入：`inspection.bhtechnology.com.au`。
4. 若提示“验证域名所有权”，选择 **Verify DNS configuration**，按下面步骤在 DNS 处添加记录后再回到此处验证。

## 二、在域名服务商配置 DNS

域名主域名应为 **bhtechnology.com.au**，子域 **inspection** 需指向 Netlify。

### 方式 A：CNAME（推荐）

在 bhtechnology.com.au 的 DNS 管理中添加：

| 类型   | 名称        | 值 / 目标                              | TTL  |
|--------|-------------|----------------------------------------|------|
| CNAME  | inspection  | \<你的站点>.netlify.app                | 3600 |

其中 `\<你的站点>.netlify.app` 在 Netlify 的 **Domain management** 里会显示，例如：`random-name-123.netlify.app`。

### 方式 B：A 记录（Netlify 提供的负载均衡 IP）

若服务商不支持子域 CNAME，可使用 Netlify 提供的 A 记录 IP（在 Netlify 添加域名时页面会显示）：

| 类型 | 名称        | 值（IP）   | TTL  |
|------|-------------|------------|------|
| A    | inspection  | 75.2.60.5  | 3600 |

（IP 以 Netlify 当前文档或控制台显示为准，可能随地区/时间变化。）

## 三、HTTPS（SSL）

- Netlify 会为 `inspection.bhtechnology.com.au` 自动申请并续期 Let’s Encrypt 证书。
- 在 **Domain management** 中可勾选 **Force HTTPS**，建议开启。

## 四、代码中的使用

- 生产环境会通过请求头 `x-forwarded-host` / `host` 得到 `inspection.bhtechnology.com.au`，无需改代码即可生成正确链接。
- 当无法从请求头解析 host 时，会使用环境变量 `URL` 或 `DEPLOY_PRIME_URL`；若二者都未设置，则使用代码中的后备地址 **https://inspection.bhtechnology.com.au**（见 `netlify/functions/lib/baseUrl.ts`）。

因此邮件中的「查看报告」「下载 Word」等链接会指向该域名。

## 五、验证

1. DNS 生效后（通常 5 分钟–48 小时，视服务商而定），在 Netlify **Domain management** 中确认域名状态为 **Verified**。
2. 浏览器访问：`https://inspection.bhtechnology.com.au`，应打开检查应用。
3. 提交一次检查，检查邮件中的链接是否为 `https://inspection.bhtechnology.com.au/review/...` 和 `https://inspection.bhtechnology.com.au/api/downloadWord?...`。

## 六、若域名在 GoDaddy

可参考项目中的 **GoDaddy_DNS设置步骤.md**，在 GoDaddy 的 DNS 管理里添加上述 CNAME 或 A 记录，主机/名称填 `inspection` 即可。
