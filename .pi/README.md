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
| `ledger/` | The config catch-up ledger — **tracked** content, not a gitignored scratch dir. If `git add` ever reports `.pi/ledger` as ignored, the clone's `.git/info/exclude` carries an unanchored `ledger/` rule shadowing it: anchor that rule to `/ledger/` (the root session ledger, mirroring `plan/`). |

## Session worktrees — cheap by construction

A session worktree exists so that several sessions can work from the same umbrella at once. It
carries the MUTABLE half of a session — working tree, index, branch, and its own
`charly/bin/charly` — so no session can disturb another's checkout. It must never carry a
private COPY of the immutable half. MEASURED on this clone (425 submodules, `main`):

| Step | Cost |
|---|---|
| `git worktree add`, nothing materialized | **0.019 s · 3.8 MB** — the superproject's objects are shared (`commondir: ../..`), metadata is 5 files |
| `git submodule update --init --recursive` (the former default) | **~0.86 s per module → ~6 min · 376 MB** of worktree-PRIVATE module objects, plus ~230 MB of checkouts |
| `submodule update --init --reference .git/modules/<path> <path>` (the default now) | **0.5–0.8 s per module · 1 MB**, borrowed through an `alternates` file |
| the per-worktree binary (`charly/scripts/bootstrap-charly.sh`) | ~1m20s · 51 MB — required and never shared (R9, plus concurrent sessions) |

So `charly_worktree_create` materializes **only `charly` and `marketplace`** — the modules the
harness's own tools and gates read — and any other module is named explicitly through the tool's
`modules` argument when a cutover actually reads or edits it. This is not a weakening: the repo's
own pin gate (`scripts/check-verify-submodules.mjs`) documents a session worktree as
materializing **1 of 424** paths and treats the rest as legitimately unmaterialized, and every
commit-time gate here passes with **423 of 425** unmaterialized — `hooks/pre-commit`,
`charly task policy-b`, `charly task self-test`, and every `scripts/check-*.mjs` gate.

Materialize one later (no need to recreate the worktree):

```bash
git -C <umbrella>/.worktrees/<slug> submodule update --init \
  --reference <umbrella>/.git/modules/<path> -- <path>
```

Reap on landing: `charly_worktree_remove <slug>`; `charly task prune` reaps the worktrees and
branches whose PR already merged (dry run by default — it reported 13 worktrees + 1 branch here).

Two measured NEGATIVES, recorded so they are not re-proposed:

- `submodule.alternateLocation=superproject` does **not** engage for a linked worktree — 0
  `alternates` files created, 16 MB vs 23 MB (noise). Only an explicit `--reference` works.
- `--depth 1` **does** resolve the recorded gitlink (exit 0, `shallow` present, 4 MB vs 7 MB), but
  a shallow submodule cannot serve the history-reading a cutover may need, for a ~3 MB saving on
  a small repo. Not used.

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
