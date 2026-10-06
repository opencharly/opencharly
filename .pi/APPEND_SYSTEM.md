# Pi harness — umbrella context

This file binds the harness-neutral `AGENTS.md` rulebook to pi's mechanics. It is
pi-specific by construction and lives in `.pi/` (rule 5), never in `AGENTS.md`. pi loads
`AGENTS.md` as a context file; the gate extension re-injects `SOUL.md` and the condensed
rules every turn so they survive compaction.

## Skill addressing (R0)

`AGENTS.md` addresses skills as `/charly-<family>:<skill>` (e.g.
`/charly-internals:git-workflow`). pi does not accept the namespaced form: the marketplace
package (`git:github.com/opencharly/marketplace` in `settings.json`) exposes every skill by
its bare frontmatter `name`.

| Canonical reference | In pi |
|---|---|
| `/charly-<family>:<skill>` | `/skill:<skill>` (e.g. `/skill:git-workflow`), or the `charly_load_skills` tool |
| fallback | read `marketplace/<family>/skills/<skill>/SKILL.md` |

Load every dispatcher row that matches the task before the first tool call. The curated
rows are in `AGENTS.md`; the full generated table is `marketplace/DISPATCHER.md`.

## Git gates (hooks doctrine)

`extensions/charly-gates.ts` intercepts every `bash` call and runs the two committed gate
scripts before `git commit` / `git push`, blocking the call when a gate fails
(fail-closed). The canonical scripts stay `.claude/hooks/pre-commit-gate.sh` +
`pre-push-gate.sh`; the extension is pi's binding of them, exactly as
`.reasonix/settings.json` wires them for Kimi/reasonix.

## Session worktrees (rule 2)

A worktree isolates the MUTABLE half of a session — working tree, index, branch, and its own
`charly/bin/charly` — so several sessions can work from the same umbrella at once. It does NOT
copy the IMMUTABLE half: git shares the superproject's objects, and `charly_worktree_create`
materializes only `charly` + `marketplace`, borrowing their objects from the main checkout
(`--reference`). That is ~1.4 s and a few MB, not the ~6 min and ~600 MB an eager
`--init --recursive` over all 425 submodules costs. Name anything else the cutover touches in the
tool's `modules` argument; materialize one later with
`git -C <worktree> submodule update --init --reference <umbrella>/.git/modules/<path> -- <path>`.
Never materialize the whole graph "just in case", and never share a working tree between sessions
— sharing immutable objects is what makes concurrency safe; sharing mutable state is what breaks it.

## GitHub PR + watcher discipline

- **PR / validator status.** `gh_pr_status check <repo> <pr>` returns state, head SHA,
  mergeable, the latest `charly/pr-validator` run ON THAT HEAD, and the verdict comment.
  It is a ONE-SHOT read — to WAIT, arm a watcher (below). (`gh_pr_status watch` blocks the
  turn; the watcher family is the pi wake, because pi has no background notification.)
- **Automatic arming.** `extensions/watch.ts` arms the harness-INDEPENDENT watcher family at
  `session_start` from `.pi/watch.items` and delivers each event as a user turn. The
  `watch_arm` tool reports what is armed (`action: "status"`), re-reads the items file
  (`"restart"`), and runs + watches an R10 bed (`"bed"`). A wait therefore needs no
  hand-polling — but a watcher is only re-armed at the next `session_start` or `restart`,
  so add a scope to `.pi/watch.items` (or `restart`) when the wait list changes.
- **The ONE watcher.** `marketplace/scripts/pr_state_watch.sh` (a PR's terminal state),
  `pr_watch_many.sh` (a cross-repo PR batch), `gh_watch.sh` (per-item comments, verdicts,
  issues and PRs) — spawned by the extension, never hand-rolled. Arm ONE per scope; poll
  floor 60s; prefer terminal events (`merged`,`closed`) plus the default `stall` alarm over
  per-comment events.
- **R10 beds.** `watch_arm` with `action: "bed"` drives `scripts/check-bed-watch.sh` (the
  harness-neutral bed runner/reporter) — never run a long bed inline when a wake is wanted.
  A bed's authoritative signal is its process EXIT CODE (3 = prereq SKIP), never
  `summary.yml` alone; the full output is kept in the returned log path.
- **Landing.** PR-only, never a direct push to `main`, never force-push; write the whole PR
  body before the push; read the live PR comments and validator verdict before ANY update
  push. Owner: `/charly-internals:git-workflow`.

## Asking the operator

`question` puts a question to the operator and BLOCKS until they answer: pass `options` for a
pick-one list, or omit it for free text. Use it when you need a decision, an approval, or a
missing fact — instead of asking in prose and ending the turn. In a non-interactive session
(`pi -p`, a child) there is no UI, so the tool returns a clear "no UI" result: then ask in prose
and stop, never retry it there.

## Coordination (AGENTS.md rules 6–7)

On a contended or blocking scope, every comment and PR body carries `Agent:` FIRST and
`Assisted-by:` LAST, and a coordination comment opens with one label: `CLAIM` · `OWNING` ·
`HANDING OVER` · `TAKING OVER` · `BLOCKS` · `UNBLOCKS` · `STATUS` · `RESOLVED`. pi has no
`coord` tool: post with `gh` (`gh pr comment`, `gh issue comment`); the watcher family
supplies the wake.

## Plan discipline

When the user asks for a plan, the plan IS the deliverable: save it under `plan/`, present
it for review, and STOP — do not execute until approved. `plan/` is gitignored. Only execute
in the same flow when the request unambiguously authorizes it ("plan and execute").

## Context economy

Keep the main context small: track multi-step state in a durable ledger (reconcile on
interruption, never reset), delegate heavy, long, or noisy work to a background child, and
never re-read a durable artifact once per turn. (This minimal config ships no pi todo
package; keep the ledger in `plan/` or in the owning `charly` artifact.)

## DeepWiki

`.pi/mcp.json` registers the remote `deepwiki` MCP server. Where a grep cannot answer *how*
a repo is put together, query it — its answer is a pointer to read, never truth.

## Project trust

This `.pi/` carries executable extensions, so pi asks for project trust. Trust it once with
`/trust` (interactive) or `--approve`/`-a` (non-interactive).
