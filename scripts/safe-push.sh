#!/bin/bash

# 安全的 Git 推送脚本
# 在推送前先拉取远程更改，避免覆盖 GitHub 上的更新

set -e  # 遇到错误立即退出

echo "🔄 检查远程更改..."

# 1. 先获取远程更新（不合并）
git fetch origin main

# 2. 检查是否有远程更改
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u})
BASE=$(git merge-base @ @{u})

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "✅ 本地和远程同步，可以直接推送"
elif [ "$LOCAL" = "$BASE" ]; then
    echo "⚠️  远程有新的提交，需要先拉取..."
    echo "🔄 拉取并合并远程更改..."
    git pull origin main --no-rebase || {
        echo "❌ 自动合并失败，请手动解决冲突后重试"
        echo "   冲突文件："
        git status --short
        exit 1
    }
    echo "✅ 合并成功"
elif [ "$REMOTE" = "$BASE" ]; then
    echo "✅ 本地有新的提交，可以直接推送"
else
    echo "⚠️  本地和远程都有新的提交，需要合并..."
    echo "🔄 拉取并合并远程更改..."
    git pull origin main --no-rebase || {
        echo "❌ 自动合并失败，请手动解决冲突后重试"
        echo "   冲突文件："
        git status --short
        exit 1
    }
    echo "✅ 合并成功"
fi

# 3. 检查 rules.yml 是否有未提交的更改
if git diff --quiet HEAD -- rules.yml; then
    echo "✅ rules.yml 没有未提交的更改"
else
    echo "⚠️  警告：rules.yml 有未提交的更改"
    echo "   如果你在 rule management 页面修改了规则，这些更改可能被覆盖"
    echo "   建议："
    echo "   1. 先提交 rules.yml 的更改"
    echo "   2. 或者先拉取远程的 rules.yml：git checkout origin/main -- rules.yml"
    read -p "   是否继续推送？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 推送已取消"
        exit 1
    fi
fi

# 4. 推送
echo "🚀 推送到 GitHub..."
git push origin main

echo "✅ 推送成功！Netlify 将自动部署。"
