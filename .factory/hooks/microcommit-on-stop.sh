#!/usr/bin/env bash
set -euo pipefail

hook_input_json="$(cat || true)"
metadata="$(python3 -c '
import json
import sys

try:
    data = json.loads(sys.argv[1])
except Exception:
    print("\tunknown")
    raise SystemExit(0)

event = str(data.get("hook_event_name", ""))
session_id = str(data.get("session_id", "unknown"))
print(f"{event}\t{session_id}")
' "$hook_input_json")"

hook_event="${metadata%%$'\t'*}"
session_id="${metadata#*$'\t'}"
if [ "$session_id" = "$metadata" ]; then
  session_id="unknown"
fi

case "$hook_event" in
Stop | SubagentStop) ;;
*) exit 0 ;;
esac

repo_root="${FACTORY_PROJECT_DIR:-${PWD}}"
cd "$repo_root"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

if [ "${MICROCOMMIT_ENABLED:-1}" = "0" ]; then
  exit 0
fi

if [ -n "${MICROCOMMIT_BRANCH_REGEX:-}" ]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if ! printf '%s' "$branch" | grep -Eq "$MICROCOMMIT_BRANCH_REGEX"; then
    exit 0
  fi
fi

if [ -n "${MICROCOMMIT_EXCLUDE_PATHS_REGEX:-}" ]; then
  if git status --porcelain | grep -Eq "$MICROCOMMIT_EXCLUDE_PATHS_REGEX"; then
    exit 0
  fi
fi

if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

git add -A
if [ -z "$(git diff --cached --name-only)" ]; then
  exit 0
fi

msg_prefix="${MICROCOMMIT_MESSAGE_PREFIX:-chore: microcommit}"
msg="$msg_prefix (session ${session_id})"

git commit -m "$msg" --no-verify >/dev/null 2>&1 || true
exit 0
