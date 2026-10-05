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
  (beds, regen runs, greps, log archaeology, build loops). The child
  returns a CONCISE verdict + evidence paths; the parent plans, decides, lands.
  Verify the child's resolved tools BEFORE delegating — the tool set is resolved
  at spawn, and a child without bash/edit/write cannot run a bed or land a fix.
  Long waits belong to a child, never the parent.
- **fabric_exec** — batch independent pi.* calls into ONE program (Promise.all
  for parallel, sequential awaits for ordered). Coalesce edits on one file into
  one pi.edit. Return only the compact final value; filter/summarize noisy
  output inside the program. Keep tool calls short; on an output-token-limit
  failure NEVER retry the same call — change approach.

# Tool primacy — if a tool exists, ALWAYS use it, never hand-roll a command

The tool catalog is the contract — this harness's binding of R4: when a tool
covers the job, the hand-rolled equivalent is forbidden. Reach for skills
(pi-subagents, fabric-exec, mcp-scripting SKILL.md) and `tools.describe` for
detail; never guess arguments.

| For this … | use … | never hand-roll … |
|---|---|---|
| PR / validator status | `gh_pr_status` — `watch` in a background child | `gh api`, ad-hoc queries |
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

# PR validation status — the gh_pr_status tool

`gh_pr_status check <repo> <pr>` returns state, head SHA, mergeable, the latest
validator run ON THAT HEAD, its conclusion, the failing step, and the verdict
comment. `gh_pr_status watch <repo> <pr>` waits for a verdict, and its completion
IS the wake — never a sleep-poll; run it in a background subagent.

The org-wide `charly/pr-validator` verdicts land on GitHub Actions — there is no
path into a pi session, so the validator does NOT wake the agent; the watch does.
Verdict comments may be STALE — compare the run's headSha with the PR's current
headSha. pi's "gate (BLOCK)" wording means the validator BLOCKED; "wait for the
go gate" means the head was never reviewed — check the ci.yml go check.

# Charly validation status — the charly_status tool, via a subagent

extensions.charly_status is the sanctioned surface for status of charly
check beds, image builds, and VM starts — the gh_pr_status analogue:
- NEVER answer "is the bed running / did the image build / did the VM start"
  with ad-hoc ps, tail .check/..., podman images, or virsh domstate shell
  commands (R4). Use charly_status.
- charly_status check = one-shot structured status; charly_status watch <bed> =
  poll until the bed concludes — run watch in a BACKGROUND SUBAGENT
  (check-bed-runner / deploy-verifier / worker); its completion IS the wake.
