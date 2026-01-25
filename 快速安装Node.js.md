# 快速安装 Node.js（最简单方法）

## 方法一：从官网下载安装包（推荐，最简单）

### 步骤 1：下载 Node.js

1. 打开浏览器，访问：**https://nodejs.org**
2. 点击绿色的 **"LTS"** 按钮（推荐版本）
3. 会自动下载 macOS 安装包（`.pkg` 文件）

### 步骤 2：安装

1. 下载完成后，在 **下载** 文件夹找到 `.pkg` 文件
2. 双击打开
3. 按照安装向导操作：
   - 点击"继续"
   - 点击"安装"
   - 输入你的 Mac 密码
   - 等待安装完成

### 步骤 3：验证安装

1. **关闭当前终端窗口，打开一个新的终端窗口**（重要！）
2. 运行：
   ```bash
   node --version
   npm --version
   ```
3. 应该看到版本号，例如：
   ```
   v20.10.0
   10.2.3
   ```

### 步骤 4：安装项目依赖

在项目目录运行：
```bash
cd /Users/mengzhang/Downloads/essential_report_specs
npm install
```

---

## 方法二：修复 Homebrew 权限后安装

如果你想继续使用 Homebrew，需要先修复权限：

### 步骤 1：修复权限

在终端运行（需要输入密码）：
```bash
sudo chown -R mengzhang /Users/mengzhang/Library/Caches/Homebrew /opt/homebrew
```

### 步骤 2：安装 Node.js

```bash
brew install node
```

### 步骤 3：验证安装

```bash
node --version
npm --version
```

---

## 推荐

**建议使用方法一（官网安装包）**，因为：
- ✅ 不需要处理权限问题
- ✅ 更简单直接
- ✅ 适合大多数用户

安装完成后，继续按照 `邮件配置详细步骤.md` 的步骤操作。
