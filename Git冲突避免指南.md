# Git 冲突避免指南

## 问题描述

当你在 **rule management 页面**修改规则并更新到 GitHub 后，如果你在**本地**也修改了代码并推送，可能会覆盖 GitHub 上的规则更新。

## 解决方案

### 方案 1：使用安全推送脚本（推荐）

我们创建了一个安全推送脚本，会在推送前自动拉取并合并远程更改：

```bash
# 使用安全推送脚本
./scripts/safe-push.sh
```

**脚本功能**：
1. ✅ 自动检查远程是否有新提交
2. ✅ 如果有，自动拉取并合并
3. ✅ 检查 rules.yml 是否有未提交的更改
4. ✅ 合并成功后再推送

### 方案 2：手动拉取后再推送

在每次推送前，先拉取远程更改：

```bash
# 1. 拉取远程更改
git pull origin main

# 2. 如果有冲突，解决冲突后提交
# （Git 会自动合并，如果有冲突会提示）

# 3. 推送
git push origin main
```

### 方案 3：使用 Git Hook（已自动安装）

我们已经安装了 `pre-push` hook，它会在你推送前：
- 检查远程是否有新提交
- 如果有，会警告并询问是否继续
- 你可以选择取消推送，先拉取

## 推荐工作流程

### 日常开发

```bash
# 1. 修改代码
# （在编辑器中编辑文件）

# 2. 提交更改
git add .
git commit -m "描述你的修改"

# 3. 使用安全推送脚本（推荐）
./scripts/safe-push.sh

# 或者手动拉取后推送
git pull origin main
git push origin main
```

### 在 Rule Management 页面修改规则后

1. **规则已通过 GitHub API 更新到 GitHub**
2. **如果你要推送本地其他更改**：
   ```bash
   # 使用安全推送脚本
   ./scripts/safe-push.sh
   ```
   脚本会自动拉取 GitHub 上的规则更新，然后推送你的本地更改。

## 如果已经发生冲突

### 情况 1：推送被拒绝

如果 Git 提示 "Updates were rejected"：

```bash
# 1. 拉取远程更改
git pull origin main

# 2. 如果有冲突，Git 会标记冲突文件
# 查看冲突文件
git status

# 3. 解决冲突（编辑冲突文件，删除冲突标记）
# 冲突标记格式：
# <<<<<<< HEAD
# 你的本地更改
# =======
# 远程的更改
# >>>>>>> origin/main

# 4. 解决冲突后，标记为已解决
git add <冲突文件>

# 5. 完成合并
git commit -m "合并远程更改"

# 6. 推送
git push origin main
```

### 情况 2：rules.yml 被覆盖

如果发现 rules.yml 被本地旧版本覆盖了：

```bash
# 1. 从远程恢复 rules.yml
git checkout origin/main -- rules.yml

# 2. 提交恢复的文件
git add rules.yml
git commit -m "恢复 rules.yml 到最新版本"

# 3. 推送
git push origin main
```

## 最佳实践

1. **推送前总是先拉取**：
   ```bash
   git pull origin main && git push origin main
   ```

2. **使用安全推送脚本**：
   ```bash
   ./scripts/safe-push.sh
   ```

3. **定期同步**：
   - 每天开始工作前：`git pull origin main`
   - 每天结束工作前：`git pull origin main && git push origin main`

4. **检查 rules.yml**：
   - 如果规则管理页面有更新，推送前确保本地 rules.yml 是最新的
   - 可以使用：`git checkout origin/main -- rules.yml` 来更新

## 快速参考

```bash
# 安全推送（推荐）
./scripts/safe-push.sh

# 手动拉取并推送
git pull origin main && git push origin main

# 只更新 rules.yml
git checkout origin/main -- rules.yml

# 查看是否有远程更改
git fetch origin main
git log HEAD..origin/main
```
