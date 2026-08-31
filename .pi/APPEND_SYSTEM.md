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
