# 安装 Node.js 和 npm 详细步骤

## 说明

你看到的提示信息：
```
The default interactive shell is now zsh.
To update your account to use zsh, please run `chsh -s /bin/zsh`.
```

**这不是错误**，只是 macOS 的系统提示，告诉你默认 shell 现在是 zsh。可以忽略，不影响安装。

---

## 方法一：使用 Homebrew 安装（推荐，最简单）

### 步骤 1：检查是否已安装 Homebrew

在终端运行：
```bash
which brew
```

- **如果有输出**（例如 `/usr/local/bin/brew`）：说明已安装，跳到步骤 2
- **如果没有输出**：需要先安装 Homebrew

### 步骤 2：安装 Homebrew（如果还没有）

在终端运行：
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

按照提示输入密码，等待安装完成（可能需要几分钟）。

### 步骤 3：使用 Homebrew 安装 Node.js

安装 Node.js（npm 会自动一起安装）：
```bash
brew install node
```

等待安装完成。

### 步骤 4：验证安装

运行以下命令检查是否安装成功：
```bash
node --version
npm --version
```

应该看到版本号，例如：
```
v20.10.0
10.2.3
```

---

## 方法二：从官网下载安装包（如果不想用 Homebrew）

### 步骤 1：访问 Node.js 官网

1. 打开浏览器，访问：**https://nodejs.org**
2. 你会看到两个下载按钮：
   - **LTS**（推荐，长期支持版本）
   - **Current**（最新版本）

### 步骤 2：下载安装包

1. 点击 **LTS** 版本的下载按钮
2. 选择 **macOS Installer (.pkg)**
3. 下载完成后，双击 `.pkg` 文件

### 步骤 3：安装

1. 按照安装向导的提示操作
2. 输入管理员密码
3. 等待安装完成

### 步骤 4：验证安装

打开**新的终端窗口**（重要：必须重新打开终端），运行：
```bash
node --version
npm --version
```

应该看到版本号。

---

## 方法三：使用 nvm（Node Version Manager，适合开发者）

如果你需要管理多个 Node.js 版本，可以使用 nvm。

### 步骤 1：安装 nvm

在终端运行：
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
```

### 步骤 2：重新加载 shell 配置

```bash
source ~/.zshrc
```

或者如果使用 bash：
```bash
source ~/.bash_profile
```

### 步骤 3：安装 Node.js

```bash
nvm install --lts
nvm use --lts
```

### 步骤 4：验证安装

```bash
node --version
npm --version
```

---

## 安装完成后：安装项目依赖

无论使用哪种方法，安装完 Node.js 后，在项目目录运行：

```bash
cd /Users/mengzhang/Downloads/essential_report_specs
npm install
```

这会安装 `package.json` 中列出的所有依赖，包括 `resend`。

---

## 常见问题

### Q: 安装后运行 `node --version` 还是提示 "command not found"

**A:** 需要重新打开终端窗口，或者运行：
```bash
source ~/.zshrc
```

### Q: 使用 Homebrew 安装时提示 "command not found: brew"

**A:** 需要先安装 Homebrew（见方法一的步骤 2）。

### Q: 安装很慢

**A:** 这是正常的，特别是第一次安装 Homebrew 或下载 Node.js 安装包时。请耐心等待。

### Q: 提示权限错误

**A:** 确保使用管理员权限，或在命令前加 `sudo`（不推荐，除非必要）。

---

## 推荐方案

**对于大多数用户，推荐使用方法一（Homebrew）**：
- 最简单
- 以后更新 Node.js 也方便（`brew upgrade node`）
- 可以轻松管理其他开发工具

---

## 下一步

安装完 Node.js 和 npm 后，继续按照 `邮件配置详细步骤.md` 的步骤操作：
1. ✅ 安装 Node.js 和 npm（当前步骤）
2. 运行 `npm install` 安装项目依赖
3. 注册 Resend 并获取 API Key
4. 在 Netlify 配置环境变量
5. 重新部署
