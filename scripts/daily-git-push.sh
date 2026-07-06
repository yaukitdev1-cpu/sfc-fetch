#!/bin/bash
# Daily git push for sfc-fetch data
# Commits all data changes and pushes to GitHub
# Designed to run via cron at 21:00 Asia/Shanghai (13:00 UTC)

set -e

REPO_DIR="/home/openclaw/.openclaw/workspace/sfc-fetch"
cd "$REPO_DIR"

# Stage all modified tracked files (works even if data/ is in .gitignore)
git add -u

# Also force-add new markdown files in content directories (these should be tracked)
# This catches newly converted documents that aren't yet in git
find data/content -name "*.md" -type f 2>/dev/null | while read f; do
    if ! git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
        # File is not tracked yet — force-add it
        git add -f "$f"
    fi
done

# Also track new DB snapshots
if [ -f "data/db/sfc-db.json" ]; then
    git add -f data/db/sfc-db.json
fi

# Check if there are changes to commit
if git diff --cached --quiet; then
    echo "No changes to commit."
    exit 0
fi

# Count changed files
CHANGED=$(git diff --cached --numstat | wc -l)

# Commit with date-stamped message
DATE=$(date +%Y-%m-%d)
git commit -m "data: daily sync ${DATE} (${CHANGED} files)"

# Push to remote
git push origin master

echo "✅ Pushed ${CHANGED} files to GitHub."
