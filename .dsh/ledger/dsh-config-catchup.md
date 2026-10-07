# DSH harness-config catch-up — ledger

Durable ledger for catching the umbrella DSH harness config (`.dsh/`) up to what the
rulebook requires and to the other umbrella harness configs. Rule 5: harness config lives at
the umbrella root. Keep this current as items land; reconcile, never reset.

## Why this exists (R1)

DSH is a supported harness in this org — `@deepseek-ai/dsh` **0.2.0-rc.2** drives this very
session and the umbrella pins the `plugin-dsh` / `pod-dsh` submodules — yet it is the ONE
supported harness with **no umbrella-root config surface** and **no arm in
`scripts/check-harness-config.mjs`**.

- **Rulebook.** `AGENTS.md` Part II rule 5 and `/charly-internals:agents` ("The
  harness-config LOCATION … umbrella-only; layer-charly-internals#49") enumerate `.claude/`,
  `.opencode/`, `.codex/`, `.pi/`, `.reasonix/`, `opencode.json`. DSH is absent from that
  list *and* from the gate that audits those surfaces.
- **Measured today.** `ls -d .dsh` → *No such file or directory*; `grep -n dsh
  scripts/check-harness-config.mjs` → zero matches (its checks 1–11 cover claude / opencode /
  codex / pi / reasonix only; check 11 arms are `.reasonix/watch.items` and `.pi/watch.items`).
- **Missed control.** Nothing asserts a DSH arm exists, so its absence produced no failure —
  the same miss class #386 (pi removal) exposed for `.pi/`. **Blast radius.** A DSH session
  rooted at the umbrella loses the git gates, native access to the skill corpus, DeepWiki, and
  every watch binding. **Root fix.** Materialize `.dsh/` at the umbrella root, add the DSH arm
  to the harness-config gate, and bind the neutral watchers (work items W1–W8 below).

## Measured: what DSH actually reads (its config model)

From the shipped package references under
`node_modules/@deepseek-ai/dsh*` and a composed-config dump run with `DSH_HOME` pointed at a
**copy** of `~/.dsh` (so the live profile was never written):
`DSH_HOME=<copy> dsh --profile web --dump-config` → **rc=0, 1408 lines**.

| Surface | DSH mechanism | Repo-local? |
|---|---|---|
| Patch precedence | bundle layers → profile `cordis.patch.yml` → **home `~/.dsh/cordis.patch.yml`** (home outranks profile) → invocation overlay. **No project-level patch file.** | No |
| Skills | `dsh-skill-filesystem` scans `<projectRoot>/.dsh/skills` (rank 100), `<projectRoot>/.agents/skills` (200), `customSkillDirs` (300), `~/.dsh/skills` (400), `~/.agents/skills` (500); depth-1 `<name>/SKILL.md` or `<name>.md` only — nested `**/SKILL.md` is deliberately not discovered | **Yes** (`.dsh/skills`) |
| Instructions | `dsh-agent-instructions` chain: `AGENTS.md` / `CLAUDE.md` (+ `*.local.md`), root marked by `.git` | Yes |
| Hooks | `dsh-hooks-claude-code` (`configPath` → a `hooks.json` or a settings file whose `hooks` key holds the config) / `dsh-hooks-codex` | Command strings can be repo-relative; **the mount row and the config file are process-level** |
| SOUL | persona via `dsh-system-prompt` / `dsh-persona` patch rows; no instruction entry for `SOUL.md` | No (host patch) |
| MCP | `dsh-mcp-client` per-row config (`serverName` / `transport` / `url` / …); it **does NOT read `.mcp.json`** | No (host patch) |
| GitHub ingress | `dsh-webhook` + `dsh-webhook-github` (signed `POST`, `X-Hub-Signature-256` HMAC verify → rule → new root Session) | No (host patch) |
| Reminders / jobs | `dsh-schedule` durable one-shot/fixed-rate/cron reminders (host-restored); in-session background jobs with completion notices | Session/host state |

### Composed web profile, measured (`--dump-config`, rc=0)

- **Active and relevant:** `agent-instructions` (L293), `skill` (L299), `skill-filesystem`
  (L302, plus per-preset rows L760/L942/L1356), `mcp-resources` (L496), `system-prompt`
  (L503), `experimental-auto-review` (L1388).
- **Absent:** no hook-bridge row at all; no `mcp-client` row; no SOUL instruction entry.
  38 rows are `disabled: true`.
- Live web profile bundles (`~/.dsh/profiles/web/package.json`): `dsh-base`, `dsh-web-app`,
  `dsh-experimental-agent-team-profile`, `dsh-experimental-auto-review`,
  `dsh-experimental-schedule-bundle`, `dsh-experimental-voice-input-bundle`. Home patch is the
  ollama-cloud route + `agent-default-model` only; the profile patch is `[]`.

### The gap as it shows up in this session

The session skill catalog exposes only the three user-root omarchy skills
(`~/.agents/skills/{diagnose-crash,omarchy,omarchy-app}`). The opencharly marketplace corpus
(**40 families, 351 skills** — measured) is not discoverable, so AGENTS.md's
`/charly-<family>:<skill>` dispatcher has no native resolution in DSH. And
`.claude/settings.json`'s `PreToolUse` gate (`gitcmd.py` bypass-block plus
`pre-commit-gate.sh` / `pre-push-gate.sh`) does not fire.

## Design: what the repo-local DSH arm is (and is not)

DSH's only native repo-local config home is `<projectRoot>/.dsh/`. Rule 5 (one root, one
config home, no mirrors, no parity gate) therefore bounds the umbrella's DSH arm to:

- `.dsh/skills/` — the R0 corpus binding (native root, rank 100).
- `.dsh/watch.items` — the portable watch item list (identical grammar to
  `.pi/watch.items` / `.reasonix/watch.items`).
- `.dsh/README.md` — signpost (skill addressing, gates, watch discipline, the host wiring).
- `.dsh/ledger/` — this ledger.

**Not in the umbrella** (host-level machine config, producer-first via `pod-dsh` /
`distro-cachyos`): the profile/home patch rows that mount the hook bridge, the DeepWiki
`dsh-mcp-client` row, the SOUL/persona wiring, and the watch arming mechanism. These are
`$DSH_HOME` config; the umbrella must not mirror them. Record the exact rows in
`.dsh/README.md` and land the reproducible version in `pod-dsh` (per
`~/.dsh/README-dsh-setup.md`, "The org work (producer-first)").

## The gap vs the other harnesses

| Surface | claude | opencode | codex | pi | reasonix | **DSH today** | catch-up |
|---|---|---|---|---|---|---|---|
| Git gates (hooks doctrine) | `.claude/settings.json` + hook scripts | `umbrella-gates.ts` | — | `charly-gates.ts` | settings hook + `soul-inject.sh` | **not mounted** | host mount of `dsh-hooks-claude-code`; commands reach repo-local `.claude/hooks/*` |
| R0 skill corpus | `enabledPlugins` | skill dirs | — | marketplace package pin | `[skills] paths` | **user roots only** | W1 |
| SOUL injection | plugins | `instructions` | — | `charly-gates.ts` | SessionStart hook | **none** | W6 |
| DeepWiki MCP | `.mcp.json` | `opencode.json` | `.codex/config.toml` | `.pi/mcp.json` | — | **`.mcp.json` inert** | W7 |
| GitHub comment / PR watch | workflows | `pr-watch.ts` + `pr-watch.items` | — | `watch.ts` + `watch.items` | `watch-arm.sh` + `watch.items` | **none** | W5 |
| Validator verdict | workflows | `pr-watch.ts` | — | `github-pr-status.ts` | watch-arm | **none** | W5 |
| R10 bed monitoring | workflows | `watcher-loop.ts` | — | `watch.ts` → `check-bed-watch.sh` | `watch-arm.sh` | **none** | W4 |
| Harness-config gate arm | checks 1–4 | check 5 | check 6 | checks 6–7, 11 | checks 8–11 | **none** | W3 |

## High-risk assumptions to prove FIRST (RDD, not docs)

These decide the design, so they get a time-boxed live probe before any wiring is authored.

1. **The hook bridge — PROBED and REFUTED at the profile root (2026-10-07).** The plan's
   "likely honest answer" (a host-level `hooks.json` whose commands reach the repo via
   `$CLAUDE_PROJECT_DIR/.claude/hooks/*.sh`) does **not** work. An isolated `$DSH_HOME` copy with a
   profile-root `insert` of `@deepseek-ai/dsh-hooks-claude-code` composes the row (`--dump-config`)
   and imports the module (`--dump-config-schema` complete, rc=0), but **no hook ever fires**.
   Evidence, retained: a `main` push (`git push origin main --dry-run`) ran UNBLOCKED (no
   `pre-push-gate BLOCKED:` line); four PreToolUse matchers (`bash`, `Bash`, `.*`, `shell`) plus a
   `SessionStart` hook all produced no invocation; and a deliberately MALFORMED `configPath`
   produced no "cannot read" warning — so the bridge's `apply()` is never reached.
   **What was ruled OUT, with its own probe:** the patch layer works (the `dsh-base` README's own
   `insert` of `@deepseek-ai/dsh-tool-str-replace-editor` DID appear in a headless session's tool
   list), and activation failures ARE loud when they happen (a spike that inserted `dsh-shell` +
   `dsh-bash-local` alongside the composed `bash-sandbox` produced the session's FIRST diagnostic:
   `dsh: warning: 3 entries did not activate` / `bash-sandbox: Error: service "shell" has been
   registered at <ShellExecutor>`). So the bridge's silence is neither a hidden crash nor an absent
   `shell`: `@deepseek-ai/dsh-shell` is the seam and `dsh-bash-sandbox` (profile ROOT, web dump
   L243) provides `shell` through ShellExecutor, yet the bridge still reads no config and emits no
   `hook/invoked` event — the decompressed session log (20 lines) has zero hook/matcher mentions.
   **Direction (unproven):** the bridge appears to sit permanently PENDING on an activation
   condition its docs do not expose (its `inject` is `["shell", "sessionProjections"]`); the next
   step is a preset-scope mount spike instrumented with the activation audit and the session
   events, and that needs operator direction before more DSH home wiring is authored. The
   per-workspace `CLAUDE_PROJECT_DIR` question is moot until the bridge applies at all.
2. **Wake reliability.** DSH has no per-harness "watcher line → user turn" plugin today. Prove
   whether an in-session background job's completion notice actually wakes the session, and
   whether a durable `dsh-schedule` reminder does, before choosing the R10/GitHub binding.
   Do not reimplement the watcher (R3).
3. **Push vs poll.** `dsh-webhook-github` needs a public endpoint + webhook secret and creates
   a NEW root Session per delivery; confirm that is wanted before adding ingress.

## Work items (reconcile, never reset)

### W1 — `.dsh/skills/` corpus binding (R0) — DONE (umbrella leg)
- [x] Binding chosen: a flat symlink farm `.dsh/skills/<skill> -> ../../marketplace/<family>/skills/<skill>`,
      one entry per corpus skill. Measured **40 families, 351 skills, 0 duplicate skill
      directory names across families**, so the flat farm is collision-free; it follows the
      existing `marketplace` gitlink — no generated copy and no second pin to advance (a
      generator + drift gate would be a second implementation of the same projection, R3).
- [x] Gate assertion (check 13): the farm covers every `marketplace/*/skills/*/SKILL.md`, and
      no two families may share a skill directory name — a collision FAILS the gate rather
      than silently shadowing one skill.
- [ ] Prove live: a fresh DSH session's catalog lists the charly skills and a dispatcher
      reference resolves. The provider discovers depth-1 `<name>/SKILL.md` and every farm
      entry resolves on disk (checked); the fresh-session catalog read is owed — see the live
      probe in W4/W5, and do not claim it before it is pasted.

### W2 — the git-gate binding (hooks doctrine, R6) — BLOCKED on the bridge's activation condition
- [x] Assumption 1 settled by probe (above): a profile-root `insert` of the bridge composes and
      imports but never applies. A `main` push ran unblocked; four matchers plus a `SessionStart`
      hook were silent; a malformed `configPath` warned nothing; the decompressed session log has
      NO hook event; a documented `insert` DID apply (so the patch layer is fine); and a real
      activation failure DID warn loudly (so silence means "never applied").
- [ ] Instrument the bridge's activation (the `dsh-hooks-claude-code` row is configured but stays
      pending) and try a preset-scope mount; reuse the existing gate scripts — no duplicated gate
      logic (R3). The profile-root `$CLAUDE_PROJECT_DIR` fallback this ledger first proposed is
      REFUTED, not deferred. Needs operator direction — RDD: the discovery changed the contract.
- [ ] Prove live: a prohibited `git push origin main` / force-push is blocked in a live DSH
      session with the hook's reason retained; a legitimate command passes.

### W3 — the harness-config gate arm — DONE (umbrella leg)
- [x] The DSH arm landed in `scripts/check-harness-config.mjs`: check 11 gains the
      `.dsh/watch.items` binding, check 13 asserts the corpus coverage + collision property and
      the `.dsh/README.md` signpost. FOUR mutations join the `--self-test` table (watch binding,
      signpost, coverage, collision) and each is proven to turn the gate RED.
- [x] `.dsh/README.md` added to `scripts/check-root-refs.mjs`'s surface walk.
- [x] Wired into the `charly.yml` verify list. NOTE, corrected from this ledger's first draft:
      `check-harness-config.mjs` is NOT in `hooks/pre-commit` (no harness-config arm is), so the
      arm rides the existing `charly task verify` step. The gate's own `--self-test` was wired
      NOWHERE — the 31 mutations (including these four) were dead coverage — so this change also
      adds `node scripts/check-harness-config.mjs --self-test` to the verify list, mirroring the
      `check-root-refs.mjs` check + `--self-test` pair.
- [x] R1 finding fixed in the same change: the gate's header comment enumerated checks 1–11
      while the code already carried check 12 (#382) — stale current documentation on the very
      file being edited; the header now lists 11–13.

### W4 — R10 bed monitoring binding
- [x] Wake mechanism decided and PROVEN: DSH notifies the session when a background job
      finishes (observed repeatedly in this session; jobs exited 0/1/2 and each completion was
      delivered as a notification). Bind the harness-neutral `scripts/check-bed-watch.sh` as a
      background job — its exit IS the wake, so no bespoke plugin is needed. The durable
      `dsh-schedule` reminder stays the cold-start fallback.
- [ ] Arm `check-bed-watch.sh` on a real bed and retain the wake line
      (`BED <bed> <class> rc=… ok=… log=… summary=…`). Never treat a quiet bed as done.

### W5 — GitHub comments + validator verdicts
- [x] `.dsh/watch.items` shipped inert by default (comment-only), carrying the portable
      grammar and the "keep short and current" note the pi/reasonix files carry; asserted by
      gate check 11 (DSH arm) and its mutation.
- [x] The binding ARMED live on a real PR: `marketplace/scripts/pr_state_watch.sh
      opencharly/opencharly 417` ran as a DSH background job and its completion delivered the
      wake — `BLOCKED  verdict BLOCK at head afef0cca`, `WATCH EXIT=2`. The watcher's exit IS
      the session wake; re-armed after each wake per the re-arm rule.
- [ ] Bind `marketplace/scripts/gh_watch.sh` (per-item comments / verdicts / merged / closed /
      stall) and `pr_state_watch.sh` (terminal PR state); `pr_watch_many.sh` for a cross-repo
      batch. These are the ONE canonical implementation — arm, do not reimplement.
- [ ] Validator verdict: match the five measured `.pi/extensions/github-pr-status.ts` findings
      (uppercase state normalisation; run looked up by **head SHA** not workflow name; jobs
      read via the REST jobs API; verdict-less `INCONCLUSIVE` classified distinctly; terminal
      only on a FAILED run or merged/closed PR — PASS ≠ merged).

### W6 — SOUL injection
- [ ] Add `SOUL.md` to the DSH instruction chain (host patch `instructionFileCandidates`
      extension) or a `SessionStart` hook; must satisfy what harness-config gate check 7
      asserts for the other harnesses.

### W7 — DeepWiki MCP
- [ ] Mount `dsh-mcp-client` with `deepwiki` (streamable-http `https://mcp.deepwiki.com/mcp`)
      in the host patch. Record that root `.mcp.json` is NOT read by DSH (measured: no
      `mcp-client` row in the composed dump) — so the pi/reasonix `.mcp.json`-style binding
      does not transfer.

### W8 — coordination + landing
- [x] Issue-first (Part II rule 6): searched the org (`gh search issues` / `gh search prs`
      `--owner opencharly dsh`) → nothing covered a DSH harness-config arm (`pod-dsh#20` is the
      deploy-side LLM route, a different scope). Filed **opencharly/opencharly#416** and claimed
      it (assignee + `CLAIM` comment) before branching.
- [x] Worktree off fresh `origin/main` (rule 2): `.worktrees/dsh-harness-config/opencharly` on
      `feat/dsh-harness-config`, `charly` + `marketplace` materialized with `--reference`, and
      the worktree-local CalVer binary built (R9: `./bin/charly 2026.279.2047`).
- [ ] PR body from the final tree: `## Summary`, `## How tested`, `## Rulebook compliance`,
      `## Change classification`, italic attribution footer LAST.
- [ ] Producer-first leg: the `$DSH_HOME` wiring (W2/W4/W6/W7) lands in `pod-dsh` after the
      isolated-home RDD probe; the umbrella PR references #416.

## Verification plan (R10)

- On the final committed tree, zero warnings: `node scripts/check-harness-config.mjs` and
  `--self-test`; `node scripts/check-root-refs.mjs` and `--self-test`; `bash
  scripts/check-bed-watch.sh --self-test`.
- Changed paths executed live: a fresh `dsh` session proving (a) the charly skills appear in
  the catalog, (b) the git gate blocks a prohibited push, (c) the bed watcher emits its line
  for a real bed, (d) `gh_watch.sh` wakes on a real PR comment/verdict.
- If the landing touches a submodule/gitlink/pin (e.g. a marketplace projection), run
  `./charly/bin/charly task verify` on the final tree.

## Watch discipline (the GitHub + R10 ask)

- Arm ONE watcher per scope; never hand-roll a poll loop; re-arm after every wake.
- `gh_watch.sh <owner>/<repo>#<n>` — comments/verdicts/merged/closed/stall;
  `pr_state_watch.sh <owner>/<repo> <pr>` — terminal state; `pr_watch_many.sh` — cross-repo batch.
- Poll floor 60s; prefer terminal events plus the default `stall` alarm over per-comment events.
- R10: `scripts/check-bed-watch.sh <bed>` — the exit code is the honest signal (3 = prereq SKIP).

## R1 findings and measured proofs (this cutover)

Anomalies surfaced while implementing; each is fixed or recorded, none parked:

1. **The gate's header omitted check 12.** `scripts/check-harness-config.mjs` enumerated checks
   1–11 in its header while the code already carried check 12 (#382). Mechanism: a check added
   without updating the header; missed control: nothing reads the header; blast radius: a reader
   auditing the gate's coverage under-counts it. Root fix: the header now lists 11–13.
2. **The gate's `--self-test` was wired NOWHERE.** Outside CHANGELOG history, no file ran it —
   only the script's own usage comment mentioned it. Measured, before and after:

   ```
   $ git grep -n -e "check-harness-config.mjs --self-test" 5045b02 -- ':!charly' ':!CHANGELOG'
   5045b02:scripts/check-harness-config.mjs:60://   node scripts/check-harness-config.mjs --self-test     # prove the split above
   $ git grep -n -e "check-harness-config.mjs --self-test" HEAD -- ':!charly' ':!CHANGELOG'
   HEAD:.dsh/ledger/dsh-config-catchup.md:162:      adds `node scripts/check-harness-config.mjs --self-test` to the verify list, mirroring the
   HEAD:charly.yml:279:        command: node scripts/check-harness-config.mjs --self-test
   HEAD:scripts/check-harness-config.mjs:65://   node scripts/check-harness-config.mjs --self-test     # prove the split above
   ```

   So all 31 mutations (27 existing + the 4 this change adds) were dead coverage before it.
   Mechanism: the self-test is invoked by hand; missed control: no step ran it. Root fix: the
   `charly.yml` verify list now runs it (measured 1.7 s, rc=0).
3. **The self-test's `stage()` assumed file surfaces.** Adding the `.dsh/skills` DIRECTORY made
   `cpSync` fail `ERR_FS_EISDIR` (recursive not enabled). Root fix: `cpSync(..., { recursive:
   true })`, a no-op for files; the self-test is green with all four new mutations caught.

**Assumption 2 (wake reliability) is PROVEN, not assumed.** DSH notifies the session when a
background job finishes — observed four times in this session (jobs exited 0/1/2 and each
completion arrived as a notification). The watch binding therefore needs no bespoke plugin:
arm the neutral watcher as a background job; its exit IS the wake. Re-arming follows the
watcher's own `WATCH_DONE` rule: a DELTA fire (comment/verdict) arms its successor BEFORE it
prints; a STATE fire (merged/closed/stall) must NOT be re-armed — a successor would re-fire it
immediately and livelock. The durable `dsh-schedule` reminder stays the cold-start fallback.

**Reconciled mid-cutover (#415).** PR #415 landed while this branch was in flight; it fixed
exactly this discipline in the pi binding (a STALL STATE fire was being re-armed in a ~2 s hot
loop). The `.dsh` watch docs carry the post-merge corrected rule, not the pre-#415 phrasing.

**Assumption 1 (the hook bridge) — PROBED, REFUTED at the profile root, and the direction
changed** (detailed above): the bridge composes and imports but never applies — it reads no config
and emits no hook event, while the patch layer and loud activation diagnostics were each ruled out
by their own probe. The `pod-dsh` wiring is BLOCKED on that activation condition, not on a
per-workspace path question. Assumption 3 (push vs poll) is untouched.

## Status

- [x] Recon measured (DSH 0.2.0-rc.2; composed dump rc=0 / 1408 lines; `.dsh` absent; gate has
      no DSH arm; 40 families / 351 skills / 0 name collisions; no hook-bridge or `mcp-client`
      row active).
- [x] This ledger created (`.dsh/ledger/dsh-config-catchup.md`).
- [x] Umbrella leg: W1, W3, the watch binding (W5), and the issue/worktree half of W8 — gated
      green on the changed tree; PR **opencharly/opencharly#417**.
- [x] W4's mechanism and W5's live arm: the background-job wake is proven, and the watcher was
      armed on the real PR and woke on its BLOCK.
- [ ] PR #417 landing: two validator rounds BLOCKed; rounds 1–2 findings 2/3 are fixed and the
      body is re-finalized per head. The remaining blocker is the **T4 maintainer sign-off**
      (round 2, block 1), which the operator owns. No agent merges.
- [ ] W2 / W6 / W7 (host-level, `pod-dsh`): **BLOCKED** on the preset-scope
      `dsh-hooks-claude-code` mount — assumption 1 was refuted at the profile root; needs
      operator direction before wiring.
- [ ] Producer-first `pod-dsh` leg after that direction.
