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

## GitHub PR + watcher discipline

- **PR / validator status.** `gh_pr_status check <repo> <pr>` returns state, head SHA,
  mergeable, the latest `charly/pr-validator` run ON THAT HEAD, and the verdict comment.
  `gh_pr_status watch` waits for a verdict — run it in a background subagent; its completion
  IS the wake.
- **Watching GH comments / PRs.** The harness-independent watcher family is the ONE watcher:
  `marketplace/scripts/pr_state_watch.sh` (a PR's terminal state),
  `pr_watch_many.sh` (a cross-repo PR batch), `gh_watch.sh` (per-item comments, verdicts,
  issues and PRs). Arm ONE per scope; never hand-roll a poll loop; re-arm after every wake
  (the re-arm invariant). Poll floor 60s. Prefer terminal events (`merged`,`closed`) plus the
  default `stall` alarm over per-comment events.
- **Landing.** PR-only, never a direct push to `main`, never force-push; write the whole PR
  body before the push; read the live PR comments and validator verdict before ANY update
  push. Owner: `/charly-internals:git-workflow`.

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
