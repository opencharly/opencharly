# Pi project config (`.pi/`)

Project-local configuration for [pi](https://pi.dev) sessions at the umbrella root
(`opencharly/opencharly`). pi loads `AGENTS.md` as context and the OpenCharly skill corpus
as a pi PACKAGE (`git:github.com/opencharly/marketplace` in `settings.json`), installed at
startup after project trust. The pi↔rulebook binding is `APPEND_SYSTEM.md`.

**Scope.** This is the minimum a pi session needs to FOLLOW the rulebook — the git gates,
the skill corpus, and the GitHub PR / comment watcher surface. It is deliberately not a
general tool catalogue. Every package in `settings.json` was verified to load with **zero**
startup warnings (`pi --approve`).

| Path | Purpose |
|---|---|
| `settings.json` | The marketplace skill corpus as a pi package, plus the two project extensions. |
| `mcp.json` | Native pi MCP: the remote `deepwiki` server. |
| `extensions/charly-gates.ts` | The git gates (`pre-commit`/`pre-push`), SOUL + condensed-rule injection, and the `charly_load_skills` / worktree tools. |
| `extensions/github-pr-status.ts` | `gh_pr_status check\|watch` — the pi binding for PR + validator status. |
| `extensions/watch.ts` | The wake binding: arms the harness-neutral watcher family (`marketplace/scripts/gh_watch.sh` from `.pi/watch.items`, `scripts/check-bed-watch.sh` for R10 beds) and delivers every event as a user turn. |
| `watch.items` | The pi GitHub watch list — comment-only, so the watcher is INERT until armed. |
| `extensions/question.ts` | The `question` tool — asks the operator and BLOCKS for the answer (builtin `ctx.ui.select`/`input`; a headless session gets a clear no-UI result). |
| `APPEND_SYSTEM.md` | The pi↔rulebook binding (skill addressing, gates, watcher discipline, coordination, plan discipline). |
| `ledger/` | The config catch-up ledger. |

## Watching GitHub (and R10 beds)

The harness-independent watcher tooling is the ONE watcher: the GitHub family in the pinned
`marketplace/` submodule (`scripts/pr_state_watch.sh`, `pr_watch_many.sh`, `gh_watch.sh`) plus
the bed runner `scripts/check-bed-watch.sh` in this repo. `extensions/watch.ts` is pi's thin
wake binding: it spawns those scripts and turns each event line into a user turn
(`pi.sendUserMessage`), because pi has no background-completion notification. GitHub scopes
are armed from `.pi/watch.items`; an R10 bed is armed with the `watch_arm` tool. See
`APPEND_SYSTEM.md`.

## Trust

pi asks before loading project-local extensions and `.pi` resources. Trust once with `/trust`
(interactive) or `--approve`/`-a` (non-interactive).
