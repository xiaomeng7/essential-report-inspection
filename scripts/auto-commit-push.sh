#!/bin/bash
# 自动提交并推送脚本
# 使用方法: ./scripts/auto-commit-push.sh "提交信息"

set -e

COMMIT_MSG="${1:-自动提交: $(date '+%Y-%m-%d %H:%M:%S')}"

echo "📝 检查更改..."
git add -A

if git diff --staged --quiet; then
    echo "✅ 没有需要提交的更改"
    exit 0
fi

echo "💾 提交更改: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

echo "🚀 推送到远程仓库..."
git push origin main

echo "✅ 完成！"
