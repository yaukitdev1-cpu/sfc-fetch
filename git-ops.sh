#!/bin/bash
set -e
cd /home/openclaw/.openclaw/workspace/sfc-fetch

echo "=== Creating branch ==="
git checkout -b add-env-config

echo "=== Adding files ==="
git add -f .env .gitignore

echo "=== Committing ==="
git commit -m "Add .env config with local settings

- Add .env with local dev configuration
- Update .gitignore to allow .env (trackable) but ignore .env.local files
- Configured for local development with custom port and git settings"

echo "=== Pushing ==="
git push -u origin add-env-config

echo "=== Done ==="
