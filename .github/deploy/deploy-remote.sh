#!/usr/bin/env bash
set -Eeuo pipefail

ROOT='/home/u_fptbnmonitoronline_fa061ae2/fptbnmonitor.online'
BRANCH='feature/outline-essay-grading'
RESTART="$HOME/.fptbn-monitor/restart.sh"

cd "$ROOT"

if ! command -v git >/dev/null || ! command -v node >/dev/null; then
  echo 'ERROR: git or node is unavailable for the deployment account.' >&2
  exit 1
fi
if [ "$(git branch --show-current)" != "$BRANCH" ]; then
  echo "ERROR: VPS is not on the approved branch: $BRANCH" >&2
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo 'ERROR: VPS has tracked local changes. Resolve them before deploying.' >&2
  exit 1
fi
if [ ! -f "$RESTART" ] || [ ! -x "$RESTART" ]; then
  echo "ERROR: Restart script not configured: $RESTART" >&2
  echo 'Configure it once to call the real vPanel or PM2 service restart.' >&2
  exit 1
fi

git fetch --no-tags origin "$BRANCH"
git merge-base --is-ancestor HEAD FETCH_HEAD || {
  echo 'ERROR: VPS branch has diverged. Refusing to reset or overwrite it.' >&2
  exit 1
}
git merge --ff-only FETCH_HEAD
node --check server.js
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund
fi
"$RESTART"
echo 'Deployment completed; verify HTTPS /api/status and classroom flows.'
