# CLAUDE.md — rules for agent workers in the umbrella

> Mirrors `AGENTS.md` (Claude Code reads this file; pi and other harnesses read
> `AGENTS.md`). Keep both in sync — edit `AGENTS.md` and copy.

The umbrella is a *view* of the org: 22 submodules at the root, each a real repo owned
elsewhere. Short rulebook — every rule exists because breaking it corrupts someone
else's repo.

## Rulebook

1. **Never edit inside a submodule.** All change lands via PR to the owning repo; the
   umbrella only records gitlinks. A dirty submodule fails CI (`verify`) and is a
   review blocker.
2. **Git op rule:** run submodule git through `git -C <absolute-path>` from the
   umbrella root. Never root a worker in a submodule, and never run git commands that
   cross the boundary implicitly (no `git add -A` from a submodule, no `git pull` at
   the umbrella root and then assuming submodules moved).
3. **No nested `go.work`.** `charly/` carries its own `go.work` (spanning `sdk/` +
   `spec/`); Go forbids nested workspace files. No `go.work` at the umbrella root —
   all Go builds happen inside `charly/`.
4. **No worktrees inside submodules.** The `.claude/worktrees/` pattern belongs to the
   `charly` checkout, not here.
5. **Pin discipline:** only pin merged refs (default branches or gitlinks charly
   records). Never a PR branch. `verify` treats dangling pins as failures.
6. **Policy B is the contract:** `sdk spec plugins docs distro-*` must equal charly's
   own gitlinks. If charly's pinning changed, the fix is a sync (`task sync` + PR),
   not a hand-pin.
7. When a task touches a subrepo, read that subrepo's own `AGENTS.md`/`CLAUDE.md`
   first — its rulebook applies inside it. Charly's R0–R10 rulebook lives in
   `charly/AGENTS.md`; this file owns only the umbrella's policy.
8. **Harness config parity:** the harness layers at the root (`.pi/`, `.claude/`,
   `.agents/`, `.opencode/`, `.reasonix/`, `opencode.json`, `reasonix.toml`) mirror
   charly's. Keep them in sync (`scripts/check-harness-parity.sh`); never fork them
   silently. The gate scripts guard mechanics only; policy is judged by the
   `pr-validator` at merge.

## R0. Skills first

Before the first tool call of a task, load every skill the dispatcher below selects
(via `umbrella_load_skills` in pi, or by reading the `plugins/<plugin>/skills/<name>/SKILL.md`
file directly). Skills live in the `plugins/` submodule; the symlinks under
`.agents/skills/` (created by `scripts/link-skills.sh`) point at them.

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
- **R7 — Prove the gate, not the plan.** Run `task verify` (the CI gate) on the
  final tree and paste the output. A green `git status` proves nothing.
- **R10 — Fresh disposable proof.** Verify from the final committed tree, never
  from an edited state.

### PR body requirements

Every PR body must contain:
1. **## Summary** — what changed and why
2. **## How tested** — pasted command + output for every verification step
3. **## Rulebook compliance** — the umbrella rules applicable to the change
4. **## Change classification** — classification, verification gate, attribution tier
5. **CHANGELOG entry** — `CHANGELOG/<calver>.md` (placeholder) in the diff; the
   pr-validator fills it to the merge-time CalVer (B19)
6. ***Assisted-by: <Harness> <Provider Full Model Name> (<confidence>)*** — italicized
   footer in the exact form (A1)

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
+ `pre-push-gate.sh`, wired into pi via `.pi/extensions/umbrella-gates.ts`, into
Claude Code via `.claude/settings.json`-style PreToolUse hooks, into reasonix via
`.reasonix/settings.json`, and into opencode via `.opencode/plugin/umbrella-gates.ts`.
Attribution, change class, and rulebook compliance are judged once by the fresh
`pr-validator` at merge — never by the gates.

Reference: `README.md` (pinning policy), `HARNESS-PARITY.md` (config map),
`.github/workflows/` (CI contract).
