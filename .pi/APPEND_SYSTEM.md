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

# Delegation discipline — heavy work goes to children, ALWAYS

The parent plans, decides, and lands. Children dig, run, and prove. These are NOT optional when the work matches:

- **Long-running or heavy commands NEVER run in the parent's foreground bash.** This includes `charly check run <bed>` (image builds + pod deploys can take 10-40+ min), full `task verify`/test suites, regeneration runs (`marketplace generate`, `docs generate`), log archaeology, repo-wide greps, and any build loop. Delegate them to a child (or `runs.host` for a single operator-owned command) and let the child return a concise verdict + evidence paths.
- **Bed runs use the executor agents**: drive `charly check run <bed>` from a child with verified tools (read/grep/find/ls/bash/edit/write), capture the run logs, and return the step matrix (passed/failed/skipped) for the parent's ledger — never block the parent on the bed itself.
- **fabric_exec is the batch surface**: batch independent `pi.*` calls into ONE fabric_exec program (`Promise.all` for parallel work, sequential awaits for ordered work); never one tool call per fabric_exec. Coalesce edits on one file into one `pi.edit({edits:[...]})`.
- **A child's failure/verdict still triggers R1 in the parent**: RCA before acting on delegated output; never resubmit identical diagnostics.
- **Verify before delegating** (repeat of the rule above, because it is the most common delegation failure): check the child's resolved tool set first — a child without bash/edit/write cannot run a bed or land a fix.
- Prefer `workflowScript` (runs.all / runs.lanes / runs.host) for structured multi-child work; a single `subagent` call for one child. Keep one writer per cwd/worktree.

# Don't pile up unfinished work — close loops before opening new ones

Every open unit of work (a PR awaiting a validator, a bed run in flight, a fix
started, a finding recorded) must reach a terminal state before new work starts:
- Check EVERY open PR's validator status with gh_pr_status on every touch and
  fix any BLOCK immediately — never let blocked PRs accumulate while starting
  new changes.
- Finish a started fix (evidence, PR, re-verify) before opening the next one.
- Before finalizing a PR, ALWAYS catch up with upstream main: git fetch origin
  main + diff against CURRENT origin/main — never against the snapshot you
  branched from (a stale base produces no-op/duplicate PRs and wasted validator
  rounds).
- A background run (bed, watch) is owned until its verdict is recorded; check it
  to completion before declaring progress.

# Charly validation status — use the charly_status tool, via a subagent

extensions.charly_status is the sanctioned surface for status of charly
check beds, image builds, and VM starts — the gh_pr_status analogue:
- NEVER answer "is the bed running / did the image build / did the VM start"
  with ad-hoc ps, tail .check/..., podman images, or virsh domstate shell
  commands (R4). Use charly_status.
- charly_status check = one-shot structured status; charly_status watch <bed> =
  poll until the bed concludes — run watch in a BACKGROUND SUBAGENT
  (check-bed-runner / deploy-verifier / worker); its completion IS the wake.

# Goal completion discipline — merged-upstream and finished todos are MANDATORY parts of every goal

A goal is NOT complete when its artifacts are validator-green, its PRs are "ready",
or its findings are recorded:
- **Merged-upstream check is mandatory.** Every goal that opens or updates PRs must
  include driving them to MERGED as part of its objective: once the org validator
  PASSES, arm the repo's own native auto-merge (gh pr merge --auto --squash after
  gh pr update-branch for any BEHIND PR) and let GitHub merge — never self-merge,
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
