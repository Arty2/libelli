#!/bin/bash
# Gets a fresh Claude Code on the web container ready to run `npm test` and
# `npm run check` before the session's first command, rather than spending that
# first turn on an install.
set -euo pipefail

# Local checkouts manage their own node_modules; this is only for the remote
# container, which starts from a bare clone every time.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# install, not ci: the container image is cached after this hook completes, and
# install can reuse what is already there. Idempotent either way.
npm install --no-audit --no-fund

# Generates .svelte-kit/tsconfig.json, which the repo's tsconfig.json extends.
# `npm run check` would do this itself; doing it here means an editor or a
# type-aware tool that reads tsconfig.json on open does not trip over a missing
# base config.
npx svelte-kit sync
