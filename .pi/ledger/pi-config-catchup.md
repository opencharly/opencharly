# Pi harness-config catch-up — ledger

Durable ledger for catching the umbrella pi harness config (`.pi/`) up to what the rulebook
requires and to the other umbrella harness configs. Rule 5: harness config lives at the
umbrella root. Keep this current as items land; reconcile, never reset.

## Why this exists (R1)

Commit `b607ed3` (#386, tag `v2026.279.0757`) dropped `.pi/` entirely, on the stated premise
that "pi should be a system-level harness, not a per-repo surface". That premise contradicts
the rulebook it cites:

- `AGENTS.md` Part II rule 5 — "Harness config lives only in **this repo's root** and nowhere
  else" — and `/charly-internals:agents` lists `.pi/` among the umbrella-root harness config
  (`.claude/`, `.opencode/`, `.codex/`, `.pi/`, `.reasonix/`, `opencode.json`).
- `README.md` likewise says harness config "lives at this umbrella root and **only** here".

**Missed control.** #386 removed the pi arm from `scripts/check-harness-config.mjs`, so
nothing asserted `.pi/`'s presence afterward. **Blast radius.** A pi session rooted at the
umbrella lost the git gates, the skill corpus, the PR/validator status tool, SOUL injection,
and the skill loader. **Root fix.** Recreate `.pi/` at the umbrella root and restore the pi
arm of the harness-config gate (this change).

## Recreated (the rule-following minimum)

| Surface | Why the rules require it |
|---|---|
| `.pi/settings.json` | The marketplace skill corpus (R0) as a single pi package. |
| `.pi/mcp.json` | Native pi MCP — the remote DeepWiki server. |
| `.pi/extensions/charly-gates.ts` | The git gates (`.claude/hooks/pre-commit-gate.sh` + `pre-push-gate.sh`) — hooks doctrine; SOUL + condensed-rule injection; `charly_load_skills` (R0); worktree tools (rule 2). |
| `.pi/extensions/github-pr-status.ts` | `gh_pr_status check\|watch` — the validator verdict is otherwise unreachable from a pi session (git-workflow). |
| `.pi/APPEND_SYSTEM.md` | The pi↔rulebook binding (skill addressing, gates, watcher discipline, coordination, plan discipline). |
| `.pi/README.md` | Signpost. |

## Restored supporting gates (removed by #386)

- `scripts/check-pi-gates.mjs` — the gate extension's regression gate.
- `charly.yml` verify step `check-pi-gates`.
- `hooks/pre-commit` — the `check-pi-gates.mjs` invocation.
- `scripts/check-harness-config.mjs` — the pi arm (the `.mcp.json`-covers-pi note + the SOUL
  surface row); `scripts/check-root-refs.mjs` — the `.pi/extensions/charly-gates.ts` surface.
- `.gitignore` — the `.pi` ignore block.

## Deliberately NOT recreated (not needed to follow the rules)

`extensions/charly-status.ts`, `extensions/vision.ts`, `.pi/lsp.json`, `.pi/fabric.json`,
`.pi/vision.json`, `.pi/claude-plugins.json`, `.pi/agents/*.md`, and the `omarchy-agents` /
`pi-forks` `charly task` verbs. Native skill discovery plus `charly_load_skills` covers R0;
`charly status` via the CLI covers bed status; the harness-independent shell watcher family
(`marketplace/scripts/{pr_state_watch,pr_watch_many,gh_watch}.sh`) covers GitHub comment and
PR watching without a bespoke extension. The `pi-mcp-adapter`, `pi-subagents`, and
`rpiv-todo` packages are also dropped — each emits a pi startup warning (`builtin:mcp`
conflict / `typebox` in `dependencies`); DeepWiki is served natively by `.pi/mcp.json`.

## R1 findings

1. **`charly_load_skills` skill path — FIXED.** The harness-absorb commit `f092c21`
   re-pointed the loader at the deleted `.agents/skills/` farm, undoing the 2026.240.1034
   marketplace fix. It now resolves `marketplace/<family>/skills/<skill>/SKILL.md`.
2. **`charly_load_skills` dispatcher source — FIXED (#379).** It parsed
   `<!-- BEGIN GENERATED SKILL DISPATCHER -->` markers out of `AGENTS.md`, which has no
   markers (they live in the generated `marketplace/DISPATCHER.md`). Per #379's resolved
   guidance it now parses the curated `### Skill Dispatcher` table under `## R0. Skills
   first` with the markers treated as **optional**, skips the section's opening prose
   paragraph to the first table row, and splits multi-skill cells on `,`.
3. **Stale condensed rules in the injected block — FIXED.** `buildRulesBlock()` printed an
   `R2a` clause and a PR-body section older than the current rulebook. The R2a clause is now
   the neutral "Delegate Heavy Work" (naming no dropped tool), and the PR-body section names
   match `pr_body_lint.py` (`## Summary`, `## How tested`, `## Rulebook compliance`,
   `## Change classification`, footer last).
4. **`.mcp.json` is not a native pi location — FIXED.** pi reads `.pi/mcp.json`; the
   project-root `.mcp.json` reaches pi only through `pi-mcp-adapter`. A `pi --approve` load
   proved `pi-mcp-adapter` emits a `builtin:mcp` conflict warning and `pi-subagents` /
   `rpiv-todo` emit `typebox`-in-`dependencies` manifest warnings — so all three packages
   are dropped for a zero-warning load, and pi now uses its native `.pi/mcp.json`
   (`check-harness-config.mjs` check 6 asserts it).

## Watch discipline (the GitHub ask)

- Arm ONE watcher per scope; never hand-roll a poll loop; re-arm after every wake.
- `pr_state_watch.sh <owner>/<repo> <pr>` — a PR's terminal state; `gh_watch.sh` — per-item
  comments/verdicts/merged/closed/stall; `pr_watch_many.sh` — a cross-repo PR batch.
- Poll floor 60s; prefer terminal events plus the default `stall` alarm over per-comment events.
- `gh_pr_status watch` — a single PR's validator verdict, in a background subagent.

## Status

- [x] Recreate `.pi/`; restore the pi arm of the harness-config gate and the supporting gates.
- [x] Fix the `charly_load_skills` path + dispatcher source (#379).
- [x] Align the injected condensed rules with the current rulebook.
- [x] Validate with `pi --approve`: the project package installs, both extensions load, and
      the load is warning-free; the `scripts/check-*.mjs` gates ran on the tree.
- [x] Land as a T4 change with a maintainer-account sign-off (reverses #386): **MERGED** as
      #390, tag `v2026.279.1148`.

## Follow-up — automatic watchers (issue #397)

The recreated `.pi/` followed the discipline but had NO mechanism: pi has no
background-completion notification and no subagent, so a wait was either hand-polled or
dropped, and `.pi/APPEND_SYSTEM.md`'s "run `gh_pr_status watch` in a background subagent" was
stale (no subagent exists). This adds the mechanism, **neutral-first**:

- `scripts/check-bed-watch.sh` — a HARNESS-NEUTRAL R10 bed runner/reporter (any harness can
  call it; contains no pi logic). Emits one `BED <bed> <class> rc=… ok=… log=… summary=…`
  line per bed; the exit code is the honest signal (3 = prereq SKIP).
- `.pi/extensions/watch.ts` — the only pi-specific piece: it spawns the neutral
  `marketplace/scripts/gh_watch.sh` (GitHub) and `scripts/check-bed-watch.sh` (beds) and
  turns each line into a user turn (`pi.sendUserMessage`). GitHub scopes come from
  `.pi/watch.items` (inert by default); beds are armed with the `watch_arm` tool.
- `scripts/check-pi-watch.mjs` + `check-harness-config.mjs` + `hooks/pre-commit` + `charly.yml`.

No marketplace/layer PR chain and no gitlink bump: the bed watcher lives in this repo's
`scripts/` because its subject is this repo's `.check/` runs. If a non-umbrella consumer
needs it, it promotes to `marketplace/scripts/` (R3, second occurrence).

### Follow-up — the PR-status tool's five measured defects (first live use, after #398)

`.pi/extensions/github-pr-status.ts` — the tool the `.pi/` restore added — was broken on its
first live use. Five defects, each now pinned by `scripts/check-pi-pr-status.mjs`:

1. `gh pr view --json state` returns UPPERCASE `OPEN`; the poll compared lowercase, so
   `watch` returned after ONE poll (`"OPEN" !== "open"` read as "the PR is no longer open").
   Normalised in `getPR`.
2. The run was looked up with `gh run list --workflow pr-validator.yml`, which does NOT
   resolve the org-required workflow (it reports as `charly/pr-validator`), so `check`
   reported "none found" with a live run on the head. Now queried by head SHA.
3. `gh run view <id> --json jobs` 404s on the org-required workflow (same class as
   `gh run rerun`); the failing step is now read through the REST jobs API.
4. A verdict-less `## validator INCONCLUSIVE` comment carries no `Verdict:` line and was
   skipped, misreporting as `no-verdict-yet` or an older PASS/BLOCK. Now classified
   distinctly, with the escalation guidance in the output.
5. `watch` short-circuited on any concluded run (including a PASS) while its own loop kept
   polling after a PASS that arrived LATER — the two paths disagreed about the same state.
   It is now terminal only on a FAILED run or a merged/closed PR (PASS != merged).

### Follow-up — the `question` tool (issue #400)

pi ships the PRIMITIVE (`ctx.ui.select` / `ctx.ui.input` / `ctx.ui.confirm`) but no
model-callable tool, so an agent that needed a decision could only ask in prose and stop. Added:

- `.pi/extensions/question.ts` — the `question` tool over the builtin UI primitives (**no**
  `@earendil-works/pi-tui` dependency), HEADLESS-SAFE (a non-TUI session gets a clear "ask in
  prose" result, never a throw or a faked answer), `executionMode: "sequential"`.
- `scripts/check-pi-question.mjs` (+ mutation self-test), wired into `hooks/pre-commit` and
  `charly.yml`, and asserting the extension is listed in `.pi/settings.json`.

This is the one deliberately pi-SPECIFIC piece beyond the wake binding: there is no
harness-neutral way to prompt a live session.

### Follow-up — the worktree cost model (RCA, 2026-10-06)

`charly_worktree_create` produced a ~600 MB / multi-minute worktree for every cutover. RCA with
the failure signatures enumerated FIRST — four independent mechanisms under one symptom:

| # | Signature | Mechanism | Missed control |
|---|---|---|---|
| S1 | 425 submodules cloned per worktree | step 3 ran `git submodule update --init --recursive` unconditionally | nothing bounded the materialized set to what the cutover needs |
| S2 | 376 MB worktree-PRIVATE module object store | a linked worktree gets its OWN `modules/` git dirs; git shares only the SUPERPROJECT's objects (`commondir: ../..`) | no `--reference`, so every clone copied instead of borrowing |
| S3 | 13 worktrees + 2 branches resident after their PRs merged (measured 2026-10-06) | `charly_worktree_remove` depends on a session remembering to call it | no reap on landing; `charly task prune` existed but nothing invoked it |
| S4 | `git add … .pi/ledger/…` STAGES the file and exits 1, so the mandated `add && commit` chain aborts with the tree left staged and no commit | the clone-local `.git/info/exclude` carried an UNANCHORED `ledger/`, meant for the ROOT session ledger (its comment says "mirrors plan/"), which also shadowed the TRACKED `.pi/ledger/` | nothing detects a local exclude rule shadowing tracked content — `git ls-files --cached -i --exclude-standard` listed exactly 1 entry |

Measurements (this clone, 425 submodules, `main`):

| Step | Measured |
|---|---|
| `git worktree add`, no modules materialized | 0.019 s · 3.8 MB (0.016–0.019 s across runs — the first measurement read 0.016 s) |
| `--init --recursive` (former default) | 17.2 s for 20 modules ⇒ ~0.86 s/module ⇒ ~6 min for 425; 376 MB private objects + ~230 MB checkouts |
| `--init --reference` (default now) | charly 0.79 s, marketplace 0.55 s; module stores 1 MB; `alternates` engaged (2 files) |
| per-worktree binary build | 1m20s · 51 MB — required (R9 + concurrent sessions), never shared |
| gates with 2 of 425 materialized | `check-harness-config`, `check-pi-{gates,watch,pr-status,question}`, `check-verify-submodules`, `check-root-refs`, `charly task policy-b`, `charly task self-test` — all GREEN |

Two hypotheses MEASURED AND REFUTED (recorded so they are not re-proposed):
`submodule.alternateLocation=superproject` does not engage for a linked worktree (0 `alternates`
files, 16 MB vs 23 MB = noise); `--depth 1` does resolve the recorded gitlink but buys ~3 MB on a
small repo at the cost of history, so it is not used.

S4 is the same class of trap as the rulebook's "the chain is necessary, not sufficient" doctrine, in
reverse: the chain's `git add` SUCCEEDS at staging and FAILS the chain, so `git status` shows exactly
what a successful commit would leave. Fixed at the root in the clone's untracked `.git/info/exclude`
(`ledger/` → `/ledger/`, `ls-files --cached -i --exclude-standard`: 1 → 0, the root `ledger/` still
ignored); it is local state and cannot be landed, so the trap is documented here and in
`.pi/README.md` for the next session that hits it.

**Root fix.** `charly_worktree_create` materializes the REQUIRED set `charly` + `marketplace` —
the modules the harness's own tools and gates read — with `--reference`, exposes a `modules`
argument that ADDS to it (a union, so naming an extra module can never drop `charly`, which the
build step needs), never passes `--recursive`, and names the reap command in its own output.
`scripts/check-pi-gates.mjs` asserts all four arms (plus four mutations proving each can fail), so
the cost model cannot silently regress. The repo's own pin gate had already documented the contract
this restores: a session worktree materializes **1 of 424** paths.

**Corroborated, not assumed.** The scoped set was proven sufficient END-TO-END before the tool was
changed: a worktree created with the fixed sequence (1.4 s, 1 MB) built `bin/charly` and ran every
commit-time gate green with 423 of 425 modules unmaterialized.
