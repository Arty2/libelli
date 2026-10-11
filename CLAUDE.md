# CLAUDE.md

@AGENTS.md

The above is the real instructions file, shared with every agent; edit
`AGENTS.md`, not this one. What is Claude Code-specific lives here:

- `.claude/settings.json` pre-approves the read-only and check/build commands
  this repo uses constantly, and wires a `SessionStart` hook
  (`.claude/hooks/session-start.sh`) that installs dependencies before the
  first turn of a web session.
- It also **denies reading `package-lock.json`**, so change that file only
  through npm (`npm install --package-lock-only`) and check its version with
  `node -p "require('./package-lock.json').version"`.
- `.claude/logs/gates.jsonl` is the local, gitignored log `npm run gates`
  appends to — see AGENTS.md § Rules that execute.
