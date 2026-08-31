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

# Don't pile up unfinished work — close loops before opening new ones

Every open unit of work (a PR awaiting a validator, a bed run in flight, a fix
started, a finding recorded) must reach a terminal state before new work starts:
- Check EVERY open PR's validator status with `gh_pr_status` on every touch and
  fix any BLOCK immediately — never let blocked PRs accumulate while starting
  new changes.
- Finish a started fix (evidence, PR, re-verify) before opening the next one.
- Before finalizing a PR, ALWAYS catch up with upstream main: `git fetch origin
  main` + diff against CURRENT origin/main — never against the snapshot you
  branched from (a stale base produces no-op/duplicate PRs and wasted validator
  rounds).
- A background run (bed, watch) is owned until its verdict is recorded; check it
  to completion before declaring progress.

# Charly validation status — use the charly_status tool, via a subagent

`extensions.charly_status` is the sanctioned surface for status of charly
check beds, image builds, and VM starts — the gh_pr_status analogue for charly
validation:
- NEVER answer "is the bed running / did the image build / did the VM start"
  with ad-hoc `ps`, `tail .check/...`, `podman images`, or `virsh domstate`
  shell commands (R4 — arcane and error-prone). Use `charly_status`.
- `charly_status` `check` = one-shot structured status (bed state/phases/step
  matrix/verdict; image local presence; VM domain state).
- `charly_status` `watch <bed>` = poll until the bed run concludes — run it in a
  BACKGROUND SUBAGENT (check-bed-runner / deploy-verifier / worker) the way
  `gh_pr_status watch` is run; its completion IS the wake. Never sleep-poll in
  the parent.
- Running a bed is `charly check run <bed>` via a subagent; stopping is
  `charly check stop <bed>` (clears the stale lock) — also via a subagent.
