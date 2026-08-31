# Plan discipline

Whenever the user asks for a plan, the plan must be saved to a file under plan/ (e.g. plan/<topic>.md) before any execution starts, and kept updated as the plan is executed. plan/ is gitignored — plans are working documents, never committed.

# PR validation status — check EVERY PR with the gh_pr_status tool

The org-wide `charly/pr-validator` verdicts land on GitHub Actions, which has NO path into a pi session — the validator does NOT wake the agent. For EVERY PR you open, update, or are waiting on, use the `gh_pr_status` extension tool:

- `gh_pr_status check <repo> <pr>` — MANDATORY after opening or fixing any PR: PR state, head SHA, mergeable state, the latest pr-validator run ON THAT HEAD, its conclusion, the failing step, and the latest verdict comment.
- `gh_pr_status watch <repo> <pr>` — for every PR awaiting a validator conclusion, run this in a background subagent; its completion IS the wake. Never sleep-poll from the parent.
- A "Gate (BLOCK)" failing step = the validator BLOCKED the PR — read the latest review comment and fix every finding before re-pushing.
- A "Wait for the go gate" failing step = the validator never reviewed the head (CI wait timeout) — check the ci.yml go check on that head.
- The verdict comment may be STALE (from an older head) — always compare the run's headSha with the PR's current headSha.

# Tool-usage discipline (RCA'd 2026-08-30)

- Verify a child can execute BEFORE delegating: confirm the child's resolved tools include what the task needs (read/grep/find/ls/bash/edit/write/gh_pr_status). A child without tools burns its whole turn probing tool names — report the blocker instead.
- Long-running waits belong to a child, not the parent. Use `async: true` + `subagent_wait`; never sleep-poll.
- Keep tool calls short; on an output-token-limit failure NEVER retry the same call — change approach.

# Goal completion discipline — merged-upstream and finished todos are MANDATORY parts of every goal

A goal is NOT complete when its artifacts are validator-green, its PRs are "ready",
or its findings are recorded:
- **Merged-upstream check is mandatory.** Every goal that opens or updates PRs must
  include driving them to MERGED as part of its objective: once the org validator
  PASSES, arm the repo's own native auto-merge (`gh pr merge --auto --squash` after
  `gh pr update-branch` for any BEHIND PR) and let GitHub merge — never self-merge,
  but never declare completion while any of the goal's PRs is still open. The
  completion audit must list each PR and its merged state.
- **Todo completion is mandatory.** Where a todo list is used, every item must be
  completed (or explicitly deleted-with-reason) before completion is declared;
  an in_progress/pending item means the goal is not done.
- **Goals are living contracts — update them when new issues surface.** When work
  encounters a NEW issue (a validator BLOCK, a merge/arming failure, a new
  divergence, a follow-up batch, a merge that did not happen), the goal objective
  must be REGULARLY UPDATED to fold that issue in — on discovery, not at the end.
  Never silently drop discovered work into an unnamed "follow-up", and never treat
  a recorded residual as a reason to stop work that is still actionable. Only
  genuinely external/operator-owned dependencies (documented with the exact
  repo + the required human action) may be parked.
