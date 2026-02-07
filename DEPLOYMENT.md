# Netlify 部署指南

本指南将一步步教你如何将 Essential Electrical Inspection 应用部署到 Netlify。

## 前置准备

### 1. 确保项目已准备好

在开始部署前，请确保：

- ✅ 所有代码文件都已创建
- ✅ `package.json` 配置正确
- ✅ `netlify.toml` 配置正确
- ✅ 项目可以本地构建成功

### 2. 初始化 Git 仓库（如果还没有）

```bash
cd /Users/mengzhang/Downloads/essential_report_specs

# 初始化 Git（如果还没有）
git init

# 添加所有文件
git add .

# 提交
git commit -m "Initial commit: Essential Electrical Inspection app"
```

### 3. 创建 GitHub/GitLab/Bitbucket 仓库

你需要将代码推送到 Git 托管服务（Netlify 需要从 Git 仓库部署）：

**选项 A：GitHub（推荐）**

1. 访问 [GitHub](https://github.com)
2. 点击右上角 "+" → "New repository"
3. 填写仓库名称（如 `essential-report-inspection`）
4. 选择 Public 或 Private
5. **不要**勾选 "Initialize with README"（因为我们已经有了）
6. 点击 "Create repository"

然后推送代码：

```bash
# 添加远程仓库（替换 YOUR_USERNAME 和 REPO_NAME）
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# 推送代码
git branch -M main
git push -u origin main
```

**选项 B：GitLab 或 Bitbucket**

类似步骤，创建仓库后添加 remote 并推送。

---

## Netlify 部署步骤

### 步骤 1：注册/登录 Netlify

1. 访问 [Netlify](https://www.netlify.com)
2. 点击右上角 "Sign up" 或 "Log in"
3. 可以使用 GitHub 账号登录（推荐，方便后续集成）

### 步骤 2：创建新站点

1. 登录后，在 Netlify Dashboard 点击 **"Add new site"** → **"Import an existing project"**
2. 选择你的 Git 提供商（GitHub/GitLab/Bitbucket）
3. 授权 Netlify 访问你的仓库
4. 在仓库列表中找到你的项目，点击 **"Import"**

### 步骤 3：配置构建设置

Netlify 会自动检测 `netlify.toml`，但请确认以下设置：

**Build settings（构建设置）：**

- **Base directory**: 留空（项目在根目录）
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Functions directory**: `netlify/functions`

> 💡 **注意**：如果 Netlify 没有自动检测到 `netlify.toml`，请手动填写上述设置。

### 步骤 4：环境变量（当前不需要）

本项目目前**不需要**环境变量。如果将来需要（如 API keys），可以在：

**Site settings** → **Environment variables** 中添加。

### 步骤 5：部署

1. 点击 **"Deploy site"**
2. Netlify 会开始构建：
   - 安装依赖（`npm install`）
   - 运行构建命令（`npm run build`）
   - 部署静态文件到 CDN
   - 部署 Functions

3. 等待构建完成（通常 1-3 分钟）

### 步骤 6：验证部署

构建成功后：

1. **查看部署日志**：
   - 点击部署条目查看详细日志
   - 确认没有错误

2. **访问站点**：
   - Netlify 会提供一个随机域名，如 `https://random-name-123.netlify.app`
   - 点击该链接访问你的应用

3. **测试功能**：
   - 打开检查向导，填写几个字段
   - 提交检查
   - 查看生成的报告页面
   - **邮件中应包含「Download Word Report」按钮**：提交后收到的通知邮件里会有「下载 Word 报告」链接；若未看到，请确认已推送最新代码并等待 Netlify 完成部署（或于 Netlify 控制台手动触发重新部署）。

---

## 配置自定义域名（可选）

本项目使用的自定义域名为 **inspection.bhtechnology.com.au**。详细步骤见 **[docs/CUSTOM_DOMAIN.md](docs/CUSTOM_DOMAIN.md)**。

### 简要步骤

1. 在 Netlify Dashboard，进入 **Site configuration** → **Domain management**
2. 点击 **"Add custom domain"**，输入 `inspection.bhtechnology.com.au`
3. 在域名服务商（如 GoDaddy）为 `bhtechnology.com.au` 添加 DNS 记录：
   - **类型**: CNAME
   - **名称**: `inspection`
   - **值**: `<你的站点>.netlify.app`（在 Netlify 域名管理页会显示）
4. 等待 DNS 生效后，在 Netlify 中验证域名并开启 **Force HTTPS**

---

## 常见问题排查

### 问题 1：构建失败 - "Cannot find module"

**原因**：依赖未正确安装

**解决**：
- 检查 `package.json` 是否包含所有依赖
- 在 Netlify 构建日志中查看是否有 `npm install` 错误
- 确保 `node_modules` 在 `.gitignore` 中（不要提交）

### 问题 2：Functions 404

**原因**：Functions 路径配置错误

**解决**：
- 确认 `netlify.toml` 中 `functions = "netlify/functions"`
- 确认 `[[redirects]]` 配置正确
- 检查 Functions 文件是否在 `netlify/functions/` 目录

### 问题 3：前端路由 404（如 `/review/xxx`）

**原因**：SPA 路由未配置

**解决**：
- 确认 `netlify.toml` 中有 `from = "/*" to = "/index.html" status = 200`
- 这会将所有路由重定向到 `index.html`，让 React Router 处理

### 问题 4：`rules.yml` 读取失败

**原因**：Functions 运行时找不到文件

**解决**：
- 确认 `rules.yml` 在项目根目录
- 确认已提交到 Git
- 检查 `netlify/functions/lib/rules.ts` 中的路径：
  ```typescript
  const ROOT = path.resolve(process.cwd());
  const RULES_PATH = path.join(ROOT, "rules.yml");
  ```

### 问题 5：存储数据丢失（冷启动）

**原因**：当前使用内存存储，Functions 冷启动会清空数据

**解决**：
- 这是预期的 v1 行为
- 生产环境应使用 Netlify Blobs 或数据库（见 README.md）

---

## 持续部署（CI/CD）

Netlify 默认启用自动部署：

- **每次推送到 `main` 分支** → 自动部署到生产环境
- **推送到其他分支** → 创建预览部署

### 手动触发部署

1. 在 Netlify Dashboard 点击 **"Trigger deploy"** → **"Deploy site"**
2. 或推送代码到 Git 仓库

### 回滚到之前的版本

1. 在 **Deploys** 页面
2. 找到之前的部署
3. 点击 **"..."** → **"Publish deploy"**

---

## 监控和日志

### 查看 Functions 日志

1. 进入 **Functions** 标签
2. 点击函数名称查看实时日志
3. 或使用 Netlify CLI：`netlify functions:log`

### 查看站点分析

1. **Analytics** 标签（需要付费计划）
2. 或集成 Google Analytics

---

## 下一步优化

部署成功后，可以考虑：

1. **持久化存储**：将内存存储改为 Netlify Blobs 或数据库
2. **环境变量**：添加配置（如 API keys）
3. **自定义域名**：使用你的域名
4. **HTTPS**：Netlify 自动提供（免费）
5. **性能优化**：启用 Netlify 的 CDN 和缓存

---

## 快速检查清单

部署前确认：

- [ ] 代码已推送到 Git 仓库
- [ ] `netlify.toml` 配置正确
- [ ] `package.json` 包含所有依赖
- [ ] `.gitignore` 包含 `node_modules` 和 `dist`
- [ ] 本地可以成功运行 `npm run build`
- [ ] `rules.yml` 和 `FIELD_DICTIONARY.json` 在项目根目录

部署后验证：

- [ ] 站点可以访问
- [ ] 检查向导可以打开
- [ ] 可以提交检查
- [ ] 报告页面可以查看
- [ ] Functions 日志没有错误

---

## 需要帮助？

- **Netlify 文档**: https://docs.netlify.com
- **Netlify 社区**: https://answers.netlify.com
- **项目 README**: 查看 `README.md` 了解本地开发
