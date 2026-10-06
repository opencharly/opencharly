# Pi project config (`.pi/`)

Project-local configuration for [pi](https://pi.dev) sessions at the umbrella root
(`opencharly/opencharly`). pi loads `AGENTS.md` as context and the OpenCharly skill corpus
as a pi PACKAGE (`git:github.com/opencharly/marketplace` in `settings.json`), installed at
startup after project trust. The pi↔rulebook binding is `APPEND_SYSTEM.md`.

**Scope.** This is the minimum a pi session needs to FOLLOW the rulebook — the git gates,
the skill corpus, the ledger primitive, and the GitHub PR / comment watcher surface. It is
deliberately not a general tool catalogue.

| Path | Purpose |
|---|---|
| `settings.json` | pi packages (marketplace skills, MCP adapter, subagents, todo ledger) and the project extensions. |
| `extensions/charly-gates.ts` | The git gates (`pre-commit`/`pre-push`), SOUL + condensed-rule injection, and the `charly_load_skills` / worktree tools. |
| `extensions/github-pr-status.ts` | `gh_pr_status check\|watch` — the pi binding for PR + validator status. |
| `APPEND_SYSTEM.md` | The pi↔rulebook binding (skill addressing, gates, watcher discipline, coordination, plan discipline). |
| `ledger/` | The config catch-up ledger. |

## Watching GitHub

The harness-independent watcher family lives in the pinned `marketplace/` submodule
(`scripts/pr_state_watch.sh`, `pr_watch_many.sh`, `gh_watch.sh`); pi uses it through `bash`.
`gh_pr_status watch` covers a single PR's validator verdict. See `APPEND_SYSTEM.md`.

## Trust

pi asks before loading project-local extensions and `.pi` resources. Trust once with `/trust`
(interactive) or `--approve`/`-a` (non-interactive).
