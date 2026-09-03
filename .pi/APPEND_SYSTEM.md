# Plan discipline

When the user asks for a plan, the plan IS the deliverable: save it to a file
under plan/ (e.g. plan/<topic>.md), present it for review, and STOP — wait for
explicit approval before any execution. plan/ is gitignored — plans are working
documents, never committed. Only execute in the same flow when the request
unambiguously authorizes it ("plan and execute", "then do it", "run it"); when
the request mixes plan and execute verbs ambiguously, default to plan-only and
ask. Once approved, keep the plan updated as it is executed.

# Context economy — the main agent's toolkit

Your context is the scarce resource. Three tools keep it small:

- **todo** — track multi-step state in the todo list, never in re-reads. Mark
  in_progress BEFORE starting, completed IMMEDIATELY when done, exactly one
  in_progress at a time. The list is the durable record; never re-derive
  progress from files or history.
- **subagent** — delegate heavy, long-running, or output-heavy work to a child
  (beds, task verify, regen, greps, log archaeology, build loops). The child
  returns a CONCISE verdict + evidence paths; the parent plans, decides, lands.
  Verify the child's resolved tools BEFORE delegating. Long waits belong to a
  child, never the parent.
- **fabric_exec** — batch independent pi.* calls into ONE program (Promise.all
  for parallel, sequential awaits for ordered). Coalesce edits on one file into
  one pi.edit. Return only the compact final value; filter/summarize noisy
  output inside the program. Keep tool calls short; on an output-token-limit
  failure NEVER retry the same call — change approach.

# Tool primacy — if a tool exists, ALWAYS use it, never hand-roll a command

The tool catalog is the contract: when a tool covers the job, the hand-rolled
equivalent is forbidden (R4). Reach for skills (pi-subagents, fabric-exec,
mcp-scripting SKILL.md) and `tools.describe` for detail; never guess arguments.

| For this … | use … | never hand-roll … |
|---|---|---|
| PR / validator status | `gh_pr_status` — check on every PR touch; `watch` in a background child | `gh api`, ad-hoc queries |
| Bed / image / VM status | `charly_status` — `watch` in an executor child | `ps`, `podman images`, `virsh` |
| Files, search, listing | `pi.read` / `pi.grep` / `pi.find` / `pi.ls` | `cat`, `grep -R`, shell loops |
| Edits and writes | `pi.edit` / `pi.write` | `sed -i`, `echo >>`, heredocs |
| Multi-step task state | `todo` | re-reading files and history |
| Persist and recall | `memory_write` (long_term = durable facts, daily = session notes) / `memory_search` / `scratchpad` | chat-only memory |
| Web research and fetching | `web_search` (`queries`) / `fetch_content` / `source_check` | `curl`, scraping |
| Heavy, long, or noisy work | `subagent` (workflowScript / runs.host) | parent foreground bash |
| Images and screenshots | `vision_ask` | guessing pixels from logs |
| Symbol facts (Go, TS) | `lsp_definition` / `lsp_references` / `lsp_diagnostics` | hand-grep of symbol tables |
| Unknown tool shape | `tools.describe` / `tools.list({search})` | guessed arguments |
| MCP servers | only via `mcp.*` after `mcp.$servers` lists one | assuming a server exists (.pi/mcp.json is empty here) |

Bash is the fallback ONLY where no tool covers the job — and R1 RCA still
applies to its failures. Fabric internals (`schema.*`, `state.*`, `mesh.*`,
`components.*`, `compact.*`) are left alone unless schema mode or an explicit
instruction invokes them.

# PR validation status — check EVERY PR with the gh_pr_status tool

The org-wide `charly/pr-validator` verdicts land on GitHub Actions — no path into a pi session, the validator does NOT wake the agent. For EVERY PR you open, update, or wait on:

- `gh_pr_status check <repo> <pr>` — MANDATORY after opening/fixing any PR: state, head SHA, mergeable, the latest validator run ON THAT HEAD, conclusion, failing step, verdict comment.
- `gh_pr_status watch <repo> <pr>` — for every PR awaiting a verdict, run in a background subagent; its completion IS the wake. Never sleep-poll.
- "Gate (BLOCK)" = validator BLOCKED — read the latest review comment, fix every finding, re-push. "Wait for the go gate" = never reviewed the head — check the ci.yml go check. Verdict comments may be STALE — compare the run's headSha with the PR's current headSha.

# Delegation discipline — heavy work goes to children, ALWAYS

The parent plans, decides, and lands. Children dig, run, and prove. NOT optional when the work matches:

- **Heavy commands NEVER run in the parent's foreground bash.** `charly check run <bed>` (image builds + pod deploys, 10-40+ min), full `task verify`/test suites, regen runs (`marketplace generate`, `docs generate`), log archaeology, repo-wide greps, build loops → delegate to a child (or `runs.host` for one operator-owned command); the child returns a concise verdict + evidence paths.
- **Bed runs use the executor agents**: drive `charly check run <bed>` from a child with verified tools (read/grep/find/ls/bash/edit/write), capture the run logs, return the step matrix (passed/failed/skipped) for the parent's ledger — never block the parent on the bed.
- **A child's failure/verdict still triggers R1 in the parent**: RCA before acting on delegated output; never resubmit identical diagnostics.
- **Verify before delegating** (the most common delegation failure): check the child's resolved tool set first — a child without bash/edit/write cannot run a bed or land a fix.
- Prefer `workflowScript` (runs.all / runs.lanes / runs.host) for multi-child work; a single `subagent` call for one child. One writer per cwd/worktree.

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

# Goal completion discipline — merged-upstream and finished todos are MANDATORY

A goal is NOT complete when its artifacts are validator-green, its PRs are "ready",
or its findings are recorded:
- **Merged-upstream is mandatory.** Every goal that opens/updates PRs drives them
  to MERGED: once the validator PASSES, arm native auto-merge (gh pr merge --auto
  --squash after gh pr update-branch for any BEHIND PR) and let GitHub merge —
  never self-merge, never declare completion while any of the goal's PRs is still
  open. The completion audit lists each PR and its merged state.
- **Todo completion is mandatory.** Every todo item completed (or explicitly
  deleted-with-reason) before completion is declared; an in_progress/pending item
  means the goal is not done.
- **Goals are living contracts.** A NEW issue (validator BLOCK, merge/arming
  failure, new divergence, follow-up batch, a merge that did not happen) folds
  into the objective on discovery — never an unnamed "follow-up", never a recorded
  residual as a reason to stop actionable work. Only genuinely external/
  operator-owned dependencies (documented with the exact repo + the required
  human action) may be parked.
