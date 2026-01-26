# GitHub 自动更新功能说明

## 🎯 功能概述

现在规则管理页面支持**直接通过 GitHub API 更新并推送到 GitHub**，无需手动操作本地文件！

---

## 📋 使用步骤

### 第一步：获取 GitHub Personal Access Token

1. **访问 GitHub Token 设置页面**
   - 打开：https://github.com/settings/tokens
   - 或：GitHub → 右上角头像 → Settings → Developer settings → Personal access tokens → Tokens (classic)

2. **创建新 Token**
   - 点击 **"Generate new token"** → **"Generate new token (classic)"**
   - 填写 **Note**（备注）：`Rules Admin Update`（任意名称）
   - 勾选权限：**`repo`**（完整仓库访问权限）
   - 点击 **"Generate token"**（绿色按钮）

3. **复制 Token**
   - ⚠️ **重要**：Token 只显示一次，请立即复制！
   - Token 格式类似：`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

### 第二步：在规则管理页面使用

1. **访问规则管理页面**
   - 打开：`https://你的网站域名/admin/rules`
   - 输入 Admin Token 登录

2. **修改规则**
   - 在 **"可视化编辑"** 标签页修改 Findings
   - 或直接在 **"YAML 编辑器"** 中编辑

3. **点击更新**
   - 可视化编辑：点击 **"更新所有 Findings"**
   - YAML 编辑：点击 **"Save Rules"**

4. **选择更新方式**
   - 如果文件系统只读，会弹出对话框：
     - **点击「确定」**：使用 GitHub API 直接更新（推荐）
     - **点击「取消」**：手动复制 YAML 内容

5. **输入 GitHub Token**
   - 首次使用会弹出对话框
   - 粘贴你的 GitHub Personal Access Token
   - 点击 **"更新到 GitHub"**

6. **完成！**
   - ✅ 系统会自动：
     1. 更新 GitHub 仓库中的 `rules.yml` 文件
     2. 创建提交（commit）
     3. 推送到 `main` 分支
   - ✅ Netlify 检测到 GitHub 更新后会自动重新部署
   - ✅ 新规则会在几分钟内生效

---

## 🔒 安全说明

### Token 存储
- Token 保存在浏览器的 **localStorage** 中
- 只保存在你的浏览器本地，不会上传到服务器
- 下次使用时自动填充（如果未失效）

### Token 权限
- 只需要 **`repo`** 权限（仓库访问）
- Token 可以随时在 GitHub 设置中撤销

### 如何撤销 Token
1. 访问：https://github.com/settings/tokens
2. 找到对应的 Token
3. 点击 **"Revoke"**（撤销）

---

## 🔄 工作流程

```
修改规则 → 点击更新 → 检测到文件系统只读
    ↓
检查是否有保存的 GitHub Token
    ↓
有 Token → 自动使用 GitHub API 更新
    ↓
无 Token → 弹出对话框，输入 Token
    ↓
GitHub API 更新成功
    ↓
GitHub 仓库更新 → Netlify 自动部署 → 新规则生效
```

---

## ❓ 常见问题

### Q1: Token 输入后提示 "Bad credentials"

**原因**：
- Token 已过期或被撤销
- Token 权限不足（需要 `repo` 权限）
- Token 复制不完整（有空格或换行）

**解决**：
1. 检查 Token 是否正确复制（完整，无空格）
2. 确认 Token 有 `repo` 权限
3. 如果仍失败，重新生成 Token

### Q2: 提示 "Failed to get file" 或 "Failed to update file"

**原因**：
- GitHub 仓库不存在或名称错误
- Token 没有访问该仓库的权限
- 网络问题

**解决**：
1. 确认仓库地址正确（默认：`xiaomeng7/essential-report-inspection`）
2. 确认 Token 有该仓库的访问权限
3. 检查网络连接

### Q3: 如何修改仓库地址？

**方法 1：环境变量（推荐）**
在 Netlify 环境变量中设置：
- `GITHUB_REPO_OWNER` = `xiaomeng7`（你的 GitHub 用户名）
- `GITHUB_REPO_NAME` = `essential-report-inspection`（仓库名）

**方法 2：代码修改**
修改 `netlify/functions/rulesAdmin.ts` 中的默认值：
```typescript
const repoOwner = process.env.GITHUB_REPO_OWNER || "你的用户名";
const repoName = process.env.GITHUB_REPO_NAME || "你的仓库名";
```

### Q4: 更新后多久生效？

- GitHub 更新：立即生效（几秒钟）
- Netlify 自动部署：通常 1-3 分钟
- 新规则生效：部署完成后立即生效

### Q5: 可以撤销更新吗？

可以！在 GitHub 仓库中：
1. 打开 `rules.yml` 文件
2. 点击 **"History"**（历史记录）
3. 找到之前的版本
4. 点击 **"Revert"**（恢复）

---

## 🎨 功能特点

✅ **自动检测**：如果文件系统只读，自动提示使用 GitHub API  
✅ **Token 记忆**：首次输入后，Token 保存在本地，下次自动使用  
✅ **智能回退**：如果 GitHub API 失败，自动回退到手动复制方式  
✅ **实时反馈**：显示更新状态和结果  
✅ **安全可靠**：Token 只保存在本地，不会泄露  

---

## 📝 注意事项

1. **Token 安全**：
   - 不要分享你的 Token
   - 定期检查并撤销不使用的 Token
   - 如果怀疑泄露，立即撤销并重新生成

2. **仓库权限**：
   - 确保 Token 有仓库的写入权限
   - 如果是私有仓库，Token 需要有访问权限

3. **分支名称**：
   - 默认更新到 `main` 分支
   - 如果使用其他分支，需要修改代码

---

## 🚀 快速开始

1. 获取 GitHub Token（见上方步骤）
2. 访问规则管理页面
3. 修改规则并点击更新
4. 输入 Token（首次）
5. 完成！等待 Netlify 自动部署

---

## 💡 提示

- **首次使用**：需要输入 Token，之后会自动使用
- **Token 失效**：如果提示认证失败，重新输入新 Token 即可
- **查看更新**：可以在 GitHub 仓库的提交历史中查看所有更新记录
