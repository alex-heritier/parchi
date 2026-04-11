#!/usr/bin/env bash
# .factory/hooks/auto-commit-build.sh
# Runs on Droid Stop event — auto-commits changed files, bumps patch version, builds.
# Skips if there are no staged/unstaged changes or if stop_hook_active (prevent loops).

set -euo pipefail

cd "$FACTORY_PROJECT_DIR"

# Parse stdin JSON for stop_hook_active flag
INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('stop_hook_active', False))" 2>/dev/null || echo "False")

if [ "$STOP_HOOK_ACTIVE" = "True" ]; then
  echo "stop_hook_active=true, skipping to prevent loop"
  exit 0
fi

# Check if there are any changes to commit
if git diff --quiet HEAD && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "No changes to commit"
  exit 0
fi

# Stage all changes (tracked + untracked, excluding common noise)
git add -A

# Bump patch version (without triggering pre-commit hook version bump)
export DISABLE_VERSION_BUMP=1
node scripts/bump-version.mjs 2>/dev/null || true
git add package.json packages/extension/manifest.json packages/extension/manifest.firefox.json 2>/dev/null || true

# Get the new version for commit message
VERSION=$(python3 -c "import json; print(json.load(open('package.json'))['version'])")

# Create commit
DISABLE_VERSION_BUMP=1 git commit -m "auto: v${VERSION} — droid round complete" --no-verify 2>/dev/null || {
  echo "Commit failed (maybe no changes after staging)"
  exit 0
}

# Build
npm run build 2>&1 | tail -5

echo "✓ Committed v${VERSION} and built successfully"
