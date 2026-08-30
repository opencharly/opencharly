# AGENTS.md — rules for agent workers in the umbrella

> The single rulebook for every harness. `CLAUDE.md` is a **symlink to this file**
> (Claude Code reads that name), so there is no copy to keep in sync — edit here.

The umbrella is a *view* of the org: 344 submodules at the root, each a real repo
owned elsewhere. Short rulebook — every rule exists because breaking it corrupts
someone else's repo.

## Rulebook

1. **Never edit inside a submodule.** All change lands via PR to the owning repo; the
   umbrella only records gitlinks. A dirty submodule fails CI (`verify`) and is a
   review blocker.
2. **Git op rule:** run submodule git through `git -C <absolute-path>` from the
   umbrella root. Never root a worker in a submodule, and never run git commands that
   cross the boundary implicitly (no `git add -A` from a submodule, no `git pull` at
   the umbrella root and then assuming submodules moved).
3. **No nested `go.work`.** `charly/` carries its own `go.work` (the charly module + the
   compiled plugin candies; the sdk + spec contract modules resolve from the Go proxy at
   pinned go.mod requires — no workspace members). Go forbids nested workspace files. No
   `go.work` at the umbrella root —
   all Go builds happen inside `charly/`.
4. **No worktrees inside submodules.** The `.claude/worktrees/` pattern belongs to the
   `charly` checkout, not here.
5. **Pin discipline:** only pin merged refs (default branches or gitlinks charly
   records). Never a PR branch. `verify` treats dangling pins as failures.
6. **Policy B is the contract:** `distro-*` must equal charly's own gitlinks
   (`sdk`, `spec` and `plugins` are no longer charly-pinned — `sdk` and `spec` resolve from
   the Go proxy at pinned go.mod requires since their de-submodule cutovers, and the
   plugins corpus moved to the standalone `opencharly/marketplace` repo — which IS a
   submodule here, pinned to its own default-branch HEAD like `docs`). If charly's
   pinning changed, the fix is a sync (`task sync` + PR), not a hand-pin.
7. When a task touches a subrepo, read that subrepo's own `AGENTS.md`/`CLAUDE.md`
   first — its rulebook applies inside it. Charly's R0–R10 rulebook lives in
   `charly/AGENTS.md`; this file owns only the umbrella's policy.
8. **Harness config parity:** the harness layers at the root (`.pi/`, `.claude/`,
   `.opencode/`, `.reasonix/`, `opencode.json`, `reasonix.toml`) mirror
   charly's. Keep them in sync (`scripts/check-harness-parity.sh`); never fork them
   silently. The gate scripts guard mechanics only; policy is judged by the
   `pr-validator` at merge.

## R0. Skills first

Before the first tool call of a task, load every skill the dispatcher below selects
(via `umbrella_load_skills` in pi, or by reading the skill from the opencharly/marketplace
repo — the standalone marketplace: Claude Code loads it as the `charly-plugins` marketplace,
pi as the `git:github.com/opencharly/marketplace` package, kimi as a plugin).

### Skill Dispatcher

Consult this table BEFORE the first tool call of every task. When several rows match,
load ALL their skills before doing anything.

<!-- BEGIN GENERATED SKILL DISPATCHER -->
| Trigger (what the user said or you're about to do) | Skill to load |
|---|---|
| Git/`gh` workflow — `feat/` branch, commit, PR-only landing (NO direct push to main), branch protection, the `pr-validator` merge/tag, sync-to-upstream | `/charly-internals:git-workflow` |
| Engineering-discipline triggers (failure surfaced / dup pattern / ad-hoc fix tempting / "out of scope" framing) | `/charly-internals:strict-policy` |
| R1 — every failure, warning, or doc-vs-reality divergence before any remediation | `/charly-internals:root-cause-analyzer` |
| Sub-agents, fresh validator sessions, "which primitive drives verification?" | `/charly-internals:agents` |
| Agent control plane (`charly agent`, sessions, MCP routing) | `/charly-automation:agent` |
| Host command aliases / wrapper scripts | `/charly-automation:alias` |
| Pinning / gitlink policy / `task sync` / `task verify` / `scripts/sync-gitlinks.sh` / `scripts/verify-pins.sh` | `/charly-internals:git-workflow` |
<!-- END GENERATED SKILL DISPATCHER -->

## Engineering rules (umbrella-scaled)

- **R1 — RCA every anomaly.** Every failure, warning, or divergence from the README
  contract gets root-cause analysis (load `root-cause-analyzer`) before remediation.
  No "pre-existing", "out of scope", or "follow-up PR" classifications.
- **R3 — No duplication.** One canonical implementation per behavior (the scripts
  and harness configs own their behavior; don't re-implement policy).
- **R4 — No workarounds.** No sleeps, blind retries, hand-pinned gitlinks (that's a
  sync, not a pin), or manual fixes to CI.
- **R5 — Delete legacy completely.** A cutover removes the old path in the same PR.
- **R6 — Git safety.** `git status` before destructive actions. No force-push, no
  hook bypass (`--no-verify` / `core.hooksPath`), no direct push to `main`.
- **R7 — Prove the gate, not the plan.** Run `task verify` (the full pinning gate,
  local and on demand — there is no CI gate) on the final tree and paste the
  output. A green `git status` proves nothing. Install the per-commit gate once
  per clone with `task hooks`.
- **R10 — Fresh disposable proof.** Verify from the final committed tree, never
  from an edited state.

## Command hygiene & context discipline

The harness executes commands with **SIGPIPE ignored**, so `grep <pattern> <huge-file> | head -N`
does NOT kill grep when head exits — grep keeps writing to the closed pipe and prints
`grep: write error: Broken pipe` per failed write, flooding output with hundreds of
identical lines and truncating the response. This is a recurring, self-inflicted
context-waste failure; the following rules are mandatory:

- **NEVER pipe unbounded grep into `head`/`awk`/`sed` for "first N matches".**
  Use `grep -m N` (max-count) — grep terminates itself after N matches, no closed
  pipe, deterministic in every environment.
- **Redirect large outputs to a file first** (`cmd > /tmp/x.log 2>&1`), then read
  the file with `grep -m N` / `sed -n 'a,bp'` — never stream a multi-MB log
  through the response.
- **Bound every command's output.** If a command can print more than a screen,
  cap it (`-m`, `-n`, `--max-count`, `tail -c`), or redirect to a file.
- **Prefer subagents for exploration.** Long-running or output-heavy investigation
  (log archaeology, repo-wide greps, build/validator loops) should be delegated to
  a subagent that returns only a concise verdict + evidence paths, keeping the main
  context clean. The main agent plans, decides, and lands; the subagent digs.
- **Never re-issue the same diagnostic command in a loop.** If a command's output
  was truncated or the answer is not visible, change the approach (file + bounded
  read, or a subagent) — repeating the identical command is the failure mode, not
  the fix.

### PR body requirements

Every PR body must contain:
1. **## Summary** — what changed and why
2. **## How tested** — pasted command + output for every verification step
3. **## Rulebook compliance** — the umbrella rules applicable to the change
4. **## Change classification** — change class, verification gate, attribution tier
5. **The PR body IS the changelog** — the tag-on-merge workflow writes it
   to `CHANGELOG/<calver>.md` at merge time; no separate CHANGELOG section
   or file is needed
6. ***Assisted-by: <Harness> <Provider Full Model Name> (<confidence>)*** — italicized
   footer in the exact form, e.g. `*Assisted-by: pi openrouter/deepseek/deepseek-v4-flash-0731 (fully tested and validated)*`

These are enforced by the fresh `charly/pr-validator` at merge (rule A1).

### Attribution tiers

| Confidence | Required proof |
|---|---|
| `fully tested and validated` | `task verify` passed on the final tree, changed paths executed live |
| `analysed on a live system` | Changed runtime path ran live with retained output; full gate did not pass |
| `documentation reviewed` | Docs-only change class (forbidden if pins/scripts changed) |
| `syntax check only` | Dry-run only — do not commit |
| `theoretical suggestion` | No validation — never ship |

## Hooks doctrine

Deterministic git-workflow mechanics — bypass flags, force-push, direct-main push,
untokenizable commands — are enforced by hooks: `.claude/hooks/pre-commit-gate.sh`
+ `pre-push-gate.sh`, wired into Claude Code via `.claude/settings.json` PreToolUse hooks, into reasonix via
`.reasonix/settings.json`, and into opencode via `.opencode/plugin/umbrella-gates.ts`.
Attribution, change class, and rulebook compliance are judged once by the fresh
`pr-validator` at merge — never by the gates.

Reference: `README.md` (pinning policy), `HARNESS-PARITY.md` (config map),
`.github/workflows/` (CI contract).
