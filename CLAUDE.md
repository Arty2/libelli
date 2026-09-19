# CLAUDE.md

@AGENTS.md

The above is this project's real instructions file, written so any agent —
Claude Code, Codex or otherwise — reads the same rules rather than a worse
copy of them. Edit `AGENTS.md`, not this file. Two things are Claude
Code-specific and live only here:

- `.claude/settings.json` pre-approves the read-only and check/build commands
  this repo uses constantly, and wires a `SessionStart` hook
  (`.claude/hooks/session-start.sh`) that installs dependencies before the
  first turn of a Claude Code web session.
- `.claude/logs/gates.jsonl` is a local, gitignored log that `npm run gates`
  appends one line to per run — see AGENTS.md § Rules that execute.
