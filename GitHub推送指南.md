# GitHub 推送代码详细指南

## 📚 什么是 GitHub？

GitHub 是一个代码托管平台，类似于"代码的网盘"。Netlify 需要从 GitHub 读取你的代码并部署。

**简单理解**：
- 你的代码在本地电脑上
- 需要上传到 GitHub（云端）
- Netlify 从 GitHub 下载代码并部署

---

## 🚀 第一步：注册 GitHub 账号

### 1.1 访问 GitHub

打开浏览器，访问：**https://github.com**

### 1.2 注册账号

1. 点击右上角 **"Sign up"**（注册）
2. 填写信息：
   - **Username**（用户名）：选择一个用户名，如 `zhangmeng2024`
   - **Email**（邮箱）：你的邮箱地址
   - **Password**（密码）：设置密码
3. 完成验证（可能需要验证邮箱）
4. 点击 **"Create account"**

> 💡 **提示**：如果已有 GitHub 账号，直接点击 "Sign in"（登录）即可

---

## 📦 第二步：在 GitHub 创建仓库

### 2.1 创建新仓库

1. 登录 GitHub 后，点击右上角的 **"+"** 图标
2. 选择 **"New repository"**（新建仓库）

### 2.2 填写仓库信息

你会看到一个表单，填写以下内容：

**Repository name**（仓库名称）：
```
essential-report-inspection
```
（可以改成任何你喜欢的名字，建议用英文）

**Description**（描述，可选）：
```
Essential Electrical Inspection Web App
```

**Visibility**（可见性）：
- ✅ 选择 **"Public"**（公开）- 免费，Netlify 可以访问
- 或选择 **"Private"**（私有）- 需要付费计划

**重要**：⚠️ **不要勾选**以下选项：
- ❌ "Add a README file"（不要勾选）
- ❌ "Add .gitignore"（不要勾选）
- ❌ "Choose a license"（不要勾选）

因为你的项目已经有这些文件了。

### 2.3 创建仓库

点击页面底部的 **"Create repository"**（绿色按钮）

---

## 💻 第三步：在本地电脑准备代码

### 3.1 打开终端（Terminal）

**Mac 用户**：
- 按 `Command + 空格键` 打开 Spotlight
- 输入 "Terminal" 或"终端"
- 按回车打开

**Windows 用户**：
- 按 `Win + R`
- 输入 `cmd` 或 `powershell`
- 按回车

### 3.2 进入项目目录

在终端中输入：

```bash
cd /Users/mengzhang/Downloads/essential_report_specs
```

按回车。

### 3.3 检查 Git 是否已安装

输入：

```bash
git --version
```

如果显示版本号（如 `git version 2.x.x`），说明已安装。

**如果没有安装 Git**：

**Mac**：
```bash
# 安装 Homebrew（如果没有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Git
brew install git
```

**Windows**：
- 下载：https://git-scm.com/download/win
- 安装时全部选择默认选项

### 3.4 初始化 Git（如果还没有）

在项目目录下，依次运行：

```bash
# 1. 初始化 Git 仓库
git init

# 2. 添加所有文件
git add .

# 3. 提交文件
git commit -m "Initial commit: 准备部署到 Netlify"
```

---

## 🔗 第四步：连接本地代码和 GitHub

### 4.1 获取 GitHub 仓库地址

1. 回到 GitHub 网站
2. 打开你刚创建的仓库页面
3. 点击绿色的 **"Code"** 按钮
4. 复制 HTTPS 地址，类似：
   ```
   https://github.com/你的用户名/essential-report-inspection.git
   ```

### 4.2 在终端中连接

在终端中运行（**替换成你的实际地址**）：

```bash
# 添加远程仓库（替换 YOUR_USERNAME 和 REPO_NAME）
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
```

**示例**：
如果你的用户名是 `zhangmeng2024`，仓库名是 `essential-report-inspection`，则运行：

```bash
git remote add origin https://github.com/zhangmeng2024/essential-report-inspection.git
```

### 4.3 推送代码到 GitHub

```bash
# 1. 设置主分支为 main
git branch -M main

# 2. 推送代码到 GitHub
git push -u origin main
```

### 4.4 输入 GitHub 凭证

第一次推送时，GitHub 会要求你登录：

**方式 1：使用 Personal Access Token（推荐）**

1. 如果提示输入用户名和密码：
   - **Username**：你的 GitHub 用户名
   - **Password**：**不是你的 GitHub 密码**，而是 Personal Access Token

2. 创建 Token：
   - 访问：https://github.com/settings/tokens
   - 点击 **"Generate new token"** → **"Generate new token (classic)"**
   - 填写 **Note**：`Netlify Deployment`
   - 勾选 **"repo"** 权限
   - 点击 **"Generate token"**
   - **复制生成的 token**（只显示一次！）
   - 在终端输入密码时，粘贴这个 token

**方式 2：使用 GitHub CLI（更简单）**

```bash
# 安装 GitHub CLI
brew install gh  # Mac
# 或从 https://cli.github.com 下载安装

# 登录
gh auth login

# 然后再次推送
git push -u origin main
```

---

## ✅ 第五步：验证推送成功

### 5.1 检查 GitHub 网站

1. 刷新你的 GitHub 仓库页面
2. 你应该能看到所有项目文件：
   - `package.json`
   - `netlify.toml`
   - `src/` 文件夹
   - 等等

### 5.2 如果看到文件，说明成功！🎉

---

## 🔄 后续更新代码

以后如果你修改了代码，想更新到 GitHub：

```bash
# 1. 进入项目目录
cd /Users/mengzhang/Downloads/essential_report_specs

# 2. 添加修改的文件
git add .

# 3. 提交修改
git commit -m "更新说明"

# 4. 推送到 GitHub
git push origin main
```

---

## ❓ 常见问题

### Q1: 提示 "remote origin already exists"

**解决**：
```bash
# 删除旧的连接
git remote remove origin

# 重新添加
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
```

### Q2: 提示 "Authentication failed"

**解决**：
- 确认使用了 Personal Access Token 而不是密码
- 或使用 GitHub CLI：`gh auth login`

### Q3: 提示 "fatal: not a git repository"

**解决**：
```bash
# 确保在项目目录下
cd /Users/mengzhang/Downloads/essential_report_specs

# 初始化 Git
git init
```

### Q4: 不想用 GitHub，有其他选择吗？

**可以**，Netlify 也支持：
- **GitLab**：https://gitlab.com
- **Bitbucket**：https://bitbucket.org

步骤类似，只是平台不同。

---

## 📝 完整命令总结

```bash
# 1. 进入项目目录
cd /Users/mengzhang/Downloads/essential_report_specs

# 2. 初始化 Git（如果还没有）
git init
git add .
git commit -m "Initial commit"

# 3. 连接 GitHub（替换成你的地址）
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# 4. 推送代码
git branch -M main
git push -u origin main
```

---

## 🎯 下一步

代码推送到 GitHub 后，就可以继续 Netlify 部署了：

1. 登录 Netlify
2. 选择 "Import an existing project"
3. 选择 GitHub
4. 选择你的仓库
5. 点击 "Deploy"

详细步骤见：`部署指南.md`

---

## 💡 提示

- **第一次可能有点复杂**，但以后就很简单了
- **如果卡住**，可以截图错误信息，我可以帮你解决
- **GitHub 是免费的**，不用担心费用
