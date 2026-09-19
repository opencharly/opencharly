# AGENTS.md — rules for agent workers in the umbrella

> The single, harness-neutral rulebook. Every harness reads this file (directly or
> through a symlink alias), so there is no second copy to keep in sync — edit here.

The umbrella is a *view* of the org: ~400 submodules at the root, each a real repo
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
4. **No worktrees inside submodules.** The per-session linked-worktree pattern belongs
   to the `charly` checkout, not here.
5. **Pin discipline:** only pin merged refs (default branches or gitlinks charly
   records). Never a PR branch. `verify` treats dangling pins as failures.
6. **Policy B is the contract:** `distro-*` must equal charly's own gitlinks
   (`sdk`, `spec` and `plugins` are no longer charly-pinned — `sdk` and `spec` resolve from
   the Go proxy at pinned go.mod requires since their de-submodule cutovers, and the
   plugins corpus moved to the standalone `opencharly/marketplace` repo — which IS a
   submodule here, pinned to its own default-branch HEAD like `docs`). If charly's
   pinning changed, the fix is a sync (`task sync` + PR), not a hand-pin.
7. When a task touches a subrepo, read that subrepo's own rulebook (`AGENTS.md`)
   first — its policy applies inside it. Charly's R0–R10 rulebook lives in
   `charly/AGENTS.md`; this file owns only the umbrella's policy.
8. **Harness config parity:** the harness configuration at the root (agent
   instruction files, hook scripts, and per-harness config) mirrors the source
   repo's. Keep it in sync (`scripts/check-harness-parity.sh`); never fork it
   silently. The gate scripts guard mechanics only; policy is judged by the
   `pr-validator` at merge.
9. **Session-scoped ownership — never touch another session's files.** The
   changes you make belong to YOUR session: a file you did not author in this
   session, a branch you did not create, and a PR you did not open are another
   session's work. Never edit, revert, reformat, stage, or commit them — not
   even to "clean up" or unblock your own work. A submodule left dirty or on a
   branch by another session stays exactly as found. If a file you do not own
   blocks you, do NOT touch it: communicate the need to that session through a
   **PR comment** on the PR that owns the file (or open an issue naming it), and
   stop and ask the operator if it remains blocked. Your own edits are committed
   in your session — leave no uncommitted file of your authorship behind (an
   untracked scratchpad is the one exception, and it is cleaned up before you
   finish).

## R0. Skills first

Before the first tool call of a task, load every skill the dispatcher below selects
by reading its SKILL.md from the opencharly/marketplace repo — the standalone marketplace.
Every harness loads that repo natively; a skill is addressed by its canonical
`/charly-<family>:<skill>` reference, and each harness resolves it per its own
conventions (a harness that cannot parse the namespaced form reads the corresponding
`<family>/skills/<skill>/SKILL.md` by path). Load every matching row before acting —
a tool action before R0 admission is a violation.

### Skill Dispatcher

Consult this table BEFORE the first tool call of every task. When several rows match,
load every skill those rows select before doing anything — never the whole index.

The table is a **hand-curated umbrella-relevant subset** of the marketplace
corpus's generated dispatcher (`marketplace/DISPATCHER.md`, emitted by
`charly marketplace generate` from each skill entity's `triggers:` — one row per
trigger, the full set in that file, which is the authority). It is hand-authored
prose, NOT a generated artifact, so it lives outside any generated markers;
`scripts/sync-dispatcher.sh` can splice the full generated fragment in its place
when a consumer pins the fragment (see the script header). To add a row, edit
here and keep the refs resolving.

| Trigger (what the user said or you're about to do) | Skill to load |
|---|---|
| Git/`gh` workflow — `feat/` branch, commit, PR-only landing (NO direct push to main), branch protection, the `pr-validator` merge/tag, sync-to-upstream | `/charly-internals:git-workflow` |
| Pinning / gitlink policy / `task sync` / `task verify` / `scripts/sync-gitlinks.sh` / `scripts/verify-pins.sh` | `/charly-internals:git-workflow` |
| Engineering-discipline triggers (failure surfaced / dup pattern / ad-hoc fix tempting / "out of scope" framing) | `/charly-internals:strict-policy` |
| R1 — every failure, warning, or doc-vs-reality divergence before any remediation | `/charly-internals:root-cause-analyzer` |
| Sub-agents, fresh validator sessions, "which primitive drives verification?" | `/charly-internals:agents` |
| R10 beds / check verdicts (`charly check run <bed>`, `.check/<bed>/<calver>/summary.yml`, deploy verification) | `/charly-check:check` |
| Agent control plane (`charly agent`, sessions, `charly tui`, MCP routing) | `/charly-automation:agent` |
| Host command aliases / wrapper scripts | `/charly-automation:alias` |
| Container lifecycle / deploy / status / config (`charly config`, `charly status`, `charly start/stop/remove`) | `/charly-core:charly-config` |
| Health / dependency / hardware diagnosis (`charly doctor`) | `/charly-core:charly-doctor` |
| Secrets / Secret Service / `.secrets` / credential management | `/charly-build:secrets` |
| Box / candy authoring (`charly.yml`, composition, build targets) | `/charly-image:image` |
| Candy (layer) authoring — plan steps, services, packages | `/charly-image:layer` |
| Docs / marketplace regeneration (`docs generate`, `marketplace generate`, pin bumps, corpus drift) | `/charly-build:docs` |
| Marketplace corpus generation / refs-list / per-harness vendoring | `/charly-internals:marketplace` |
| Skill maintenance / marketplace corpus authoring | `/charly-internals:skills` |
| Hard-cutover / rename sweeps (remove legacy in the same phase) | `/charly-internals:cutover-policy` |
| `disposable: true` authorization / autonomous destroy+rebuild | `/charly-internals:disposable` |
| Plugin authoring (a candy with a `plugin:` block, providers, CUE schema) | `/charly-internals:plugin` |
| OCI labels / capabilities contract | `/charly-internals:capabilities` |


Load a skill's SKILL.md by path ONLY when its trigger matches — never pre-load,
never load-all. The available-skills index lists every skill; the dispatcher is
the routing.

## Charly CLI discipline

- **The `charly` CLI (or its owning skill's documented procedure) is the ONLY
  operational interface for charly-managed resources.** Containers, pods, VMs,
  deploys, checks, secrets, image builds, and lifecycle state are driven through
  `charly` — never through `podman`/`docker`/`systemctl`/raw shell, and never by a
  hand-rolled substitute script.
- **ALWAYS load the dispatcher-selected skill before the first tool call; NEVER
  skip R0.** A tool action before R0 admission is a violation. A harness that
  cannot load a skill reads the matching `<family>/skills/<skill>/SKILL.md` — it
  does not proceed without the procedure.
- **A missing verb or owning skill is a product defect, not permission to work
  around it.** RCA it (R1) and fix the capability in its owning repo; an ad-hoc
  skip, inline command, or local script substitute is forbidden (R4). If the fix is
  genuinely out of scope, stop and ask the operator.
- **Umbrella-native mechanics are the sanctioned path for umbrella work:** `task
  sync`, `task verify`, `task harness`, `bash scripts/*`, and submodule git through
  `git -C <absolute-path>` (rule 2). These are the umbrella's own commands, not
  ad-hoc substitutes.

## Engineering rules (umbrella-scaled)

- **R1 — RCA every anomaly.** Every failure, warning, or divergence from the README
  contract gets root-cause analysis (load `root-cause-analyzer`) before remediation.
  No "pre-existing", "out of scope", or "follow-up PR" classifications.
- **R3 — No duplication.** One canonical implementation per behavior (the scripts
  and harness configs own their behavior; don't re-implement policy).
- **R4 — No workarounds.** No sleeps, blind retries, hand-pinned gitlinks (that's a
  sync, not a pin), or manual fixes to CI. Never work around a missing `charly`
  verb or owning skill with an ad-hoc command or substitute script — RCA it and
  fix the capability in its owning repo (see **Charly CLI discipline**).
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

Commands run with **SIGPIPE ignored**, so `grep <pattern> <huge-file> | head -N`
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
   footer in the exact form, e.g. `*Assisted-by: <Harness> <Provider Full Model Name> (fully tested and validated)*`

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
untokenizable commands — are enforced by the root hooks (`.claude/hooks/pre-commit-gate.sh`
+ `pre-push-gate.sh`) through each harness's own wiring. Attribution, change class, and
rulebook compliance are judged once by the fresh `pr-validator` at merge — never by the
gates.

Reference: `README.md` (pinning policy), `HARNESS-PARITY.md` (config map),
`.github/workflows/` (CI contract).
