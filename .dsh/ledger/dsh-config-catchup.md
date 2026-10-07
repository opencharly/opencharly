# DSH harness-config catch-up — ledger

Durable ledger for catching the umbrella DSH harness config (`.dsh/`) up to what the
rulebook requires and to the other umbrella harness configs. Rule 5: harness config lives at
the umbrella root. Keep this current as items land; reconcile, never reset.

## Why this exists (R1) — the PRE-#417 BASELINE (not a claim about today)

> **Reconciled 2026-10-07 (session 2).** This section is the R1 of record, written before the
> umbrella arm landed. Its present-tense measurements were true on `main` at the time and are
> **FALSE on today's tree**: `.dsh/` exists, and `scripts/check-harness-config.mjs` checks
> 11 + 13 gate its watch binding, signpost and corpus farm (#417, tag `v2026.280.0727`). Kept
> as the finding; current state is in "Reconciled 2026-10-07 (session 2)" below — see R1
> finding 1 there.

DSH is a supported harness in this org — `@deepseek-ai/dsh` **0.2.0-rc.2** drives this very
session and the umbrella pins the `plugin-dsh` / `pod-dsh` submodules — yet it was the ONE
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

   **Candidates EXCLUDED by probe (do not re-propose):**

   - **config shape** — verified against the package's own `lib/types/index.d.ts`:
     `{configPath, pluginRoot?, projectDir?, defaultTimeoutMs?, stderrSummaryMaxChars?}`, and
     `configPath` is present in the shipped bundle; exactly what was supplied.
   - **matcher subject** — matcher-less `UserPromptSubmit` and `Stop` groups (which the bridge's
     own code treats as matcher-free) were silent too, so it is not a matcher spelling.
   - **patch layer** — a documented `insert` applied (the `dsh-base` README's
     `dsh-tool-str-replace-editor` row appeared in a headless tool list).
   - **service availability** — `sessionProjections` is provided by
     `@deepseek-ai/dsh-session-projection`, `shell` by `@deepseek-ai/dsh-shell` (through
     `dsh-bash-sandbox`) at the profile ROOT; and a malformed `configPath` warned nothing.
   - **listener scope** — `headless` has NO `dsh-agent-preset` rows at all, so the
     preset-scope theory cannot explain its silence (only `web` has presets).

   What remains is DSH-side: the bridge's exported `apply(ctx, config)` is reached and registers
   hooks, yet none of the four event classes probed ever fires — an upstream question for
   `deepseek-ai/deepseek-harness`, not a home patch this repo can land. W2/W6/W7 stay blocked on
   that (or on a native replacement for the gate hook).
2. **Wake reliability.** DSH has no per-harness "watcher line → user turn" plugin today. Prove
   whether an in-session background job's completion notice actually wakes the session, and
   whether a durable `dsh-schedule` reminder does, before choosing the R10/GitHub binding.
   Do not reimplement the watcher (R3).
3. **Push vs poll.** `dsh-webhook-github` needs a public endpoint + webhook secret and creates
   a NEW root Session per delivery; confirm that is wanted before adding ingress.

## Reconciled 2026-10-07 (session 2)

Live state read BEFORE acting: `main` @ `dd21383` ("docs: add CHANGELOG 2026.280.0732 for PR
#419"), clean, in sync with `origin/main`, **no open PRs**, and no worktrees. #416 CLOSED
(umbrella leg landed), #417 + #419 merged, **#418 OPEN** (the hook bridge). This pass is owned
by **#420**, filed and claimed (assignee + `CLAIM`) before the branch.

### The org's DSH plugin channel ALREADY EXISTS — and this session runs it

Rule 5 keeps harness *config* at the umbrella root, but a DSH *plugin* is a host-profile
dependency, not a repo file — it cannot live in `.dsh/`. Measured from
`~/.dsh/profiles/web/package.json`:

| Plugin | Pinned ref | Surface it contributes |
|---|---|---|
| `@perrylink/dsh-github` | `github:opencharly/dsh-github#db37b9b6` | the 15 GitHub tools (`gh_review`, `pr_create`, `pr_update`, `gh_checks`, `issue_open`, …) |
| `dsh-git-worktree` | `github:opencharly/dsh-git-worktree#a910ffa0` | the worktree Session-Target tools |
| `dsh-workspace-enhancement` | `github:opencharly/dsh-workspace-enhancement#b57db61a` | local + remote (SSH) workspaces |

So "ask for it as a DSH plugin in the opencharly org" is a channel that is **already wired**:
the org hosts DSH plugins and the profile pins them by commit. What is missing is a plugin for
the *gates / SOUL / auto-arm* surfaces — not the mechanism to ship one.

> Environment note (not a product defect): under a read-only `$DSH_HOME`, `dsh plugin
> --profile web list` exits `EROFS` opening `package.json.lock` even for a read. Read the
> profile `package.json` directly instead, as the table above did.

### W1's live proof (was owed) — the corpus resolves natively

A fresh DSH session rooted at the umbrella exposes the charly corpus and resolves it through
the farm (measured 2026-10-07):

- `.dsh/skills` → **351** entries; `marketplace/*/skills/*/SKILL.md` → **351**; unique skill
  names → **351** (0 collisions); `ls .dsh/skills | sort | uniq -d` → empty.
- `.dsh/skills/agents -> ../../marketplace/internals/skills/agents`, and the loaded skill's own
  base directory reports `<umbrella>/.dsh/skills/agents`.
- `/charly-internals:agents`, `/charly-internals:git-workflow` and `/charly-internals:skills`
  each loaded from `.dsh/skills/<name>` in that session.

### R10 + GitHub-comment + validator watching: the decision

| Surface | pi | opencode | DSH today |
|---|---|---|---|
| Git gates (R6) | `charly-gates.ts` + `check-pi-gates.mjs` | `umbrella-gates.ts` | **none** — the `dsh-hooks-claude-code` bridge never fires (#418) |
| Watch wake | `watch.ts`, auto-armed from `.pi/watch.items` at `session_start` + `check-pi-watch.mjs` | `pr-watch.ts`, auto-armed from `.opencode/pr-watch.items` + `check-pr-watch.mjs` | arm-by-hand: the canonical watcher runs as a **background job** and its completion IS the wake (proven on #417). `.dsh/watch.items` is gated by check 11 |
| Validator verdict | `github-pr-status.ts` (5 measured defect classes) + `check-pi-pr-status.mjs` | `pr-watch.ts` + `lib/watch.ts` | `marketplace/scripts/pr_state_watch.sh` — distinguishes a verdict BLOCK from POISON and reports INCONCLUSIVE distinctly. **No native tool, and none needed (R3)** |
| SOUL injection | `charly-gates.ts` | `instructions.md` | **none** — gate check 7 asserts it for every harness with an additive mechanism |
| DeepWiki MCP | `.pi/mcp.json` | `opencode.json` | `.mcp.json` is inert in DSH; it is a `dsh-mcp-client` host row — **config, not plugin scope** |

**Why DSH needs no watch plugin, unlike pi.** pi has no background-completion notification, so
it must convert a watcher's exit into a user turn (`.pi/extensions/watch.ts`); opencode chose a
native pure-TS poll loop. DSH **does** notify the session when a background job finishes, so the
neutral watcher *is* the wake. Reimplementing `gh_watch.sh` / `pr_state_watch.sh` inside a DSH
plugin would be the R3 duplication the pi gate (`check-pi-watch.mjs`, property 1) explicitly
forbids — so the decision is: **arm the canonical watchers; add no plugin for watching.**

**The one real watch gap:** nothing auto-arms `.dsh/watch.items` at session start, so a fresh
session begins unwatched — the DSH equivalent of pi's `session_start` auto-arm. That is plugin
scope (below), not a watcher rewrite.

### The plugin seams — grounded in shipped code (RDD, read-only probe)

A read-only probe of the installed DSH packages plus the three shipped org plugins settled the
three open seams. **Verdict: W2 (gates) and W6 (SOUL) are plugin-feasible; W7 is config-only.**

- **Gates (W2) — YES.** The interception seam is the Cordis waterfall `tools/pre-execute`
  (`dsh-tools/lib/types/index.d.ts:47`); a listener returns `{kind:'deny', reason}` or
  `{kind:'ask'}` (`:445-460`), and a deployment that composes no answerer fails closed. The
  SHIPPED `@perrylink/dsh-github` already registers exactly this listener
  (`lib/approval-gate.js:99-116`), and its `apply()` demonstrably ran in this session (its tools
  are registered). The upstream bridge maps `PreToolUse` onto the same event with payload
  `{tool_input:{command}}` (`dsh-hooks-claude-code/lib/index.js:248-265, 367-373`) — the exact
  JSON the existing `.claude/hooks/*.sh` scripts read (exit 2 = BLOCK, stderr = reason). So the
  plugin shells out to those scripts: no duplicated gate logic (R3).
- **SOUL (W6) — YES, two seams.** `ctx.systemPrompt.section({name, order, text})`
  (`dsh-system-prompt/lib/types/index.d.ts:239`), whose liveness is proven **in this session**:
  `dsh-tool-jobs` registers such a section (`dsh-tool-jobs/lib/index.js:257-260`) and that text
  appears in this session's system prompt. Or zero-code: an id-targeted `agent-instructions`
  patch adding `SOUL.md` to `instructionFileCandidates` — `config` is replaced **wholesale**, so
  `maxBytes` must be restated.
- **DeepWiki (W7) — confirmed config-only.** A `dsh-mcp-client` `StreamableHttpConfig` row
  (`lib/types/index.d.ts:53-80`); no plugin code, and `.mcp.json` is not read.
- **Caveat that bounds the catch-up:** all three land in `$DSH_HOME`/profile config, so
  `scripts/check-harness-config.mjs` **cannot** assert W2/W6 from this repo. Gate check 7's
  `SOUL_SURFACES` covers opencode/pi/reasonix only; adding a DSH row would assert a surface that
  is not repo-local. It stays out of scope and is documented instead.
- **Owed, and honestly so:** no live deny was executed (the probe was read-only). Seam liveness
  rests on the shipped listener plus the live `systemPrompt` proof above; the first landed plugin
  owes a live blocked `git push origin main` with the retained reason.

### R1 findings from this pass

1. **The ledger's own opening read as present tense.** "Why this exists (R1)" measured `.dsh` as
   *absent* and the gate as having *no DSH arm* — both false since #417 — yet nothing marked it
   as the pre-#417 baseline. Mechanism: a finding written as current state is not re-dated when
   it is fixed. Missed control: the file is authored once and reconciled by hand; no gate reads
   prose tense. Blast radius: a reader (or a fresh session) auditing the arm's state concludes
   DSH is unbranched. Root fix: the section now carries an explicit PRE-#417 BASELINE label.
2. **`.dsh/README.md` overstated the watch gap as host config.** Its "What is NOT here" list
   named "the R10 / GitHub watch arming that turns a watcher's exit into a session wake" as
   `$DSH_HOME` config — but this ledger's OWN proven assumption 2 says DSH's background-job
   completion already IS the wake, with no plugin and no host row. Mechanism: the README was
   written in the pass that *later* proved the mechanism, and the earlier claim was never
   revisited. Missed control: nothing cross-reads the signpost against the ledger's proven
   findings. Blast radius: a fresh session believes watching needs host wiring it does not have,
   then hand-rolls a poll or drops the arm. Root fix: the bullet now carries the correction and
   narrows the real gap to session-start auto-arm.

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
- [x] Prove live: a fresh DSH session's catalog lists the charly skills and a dispatcher
      reference resolves. **PROVEN 2026-10-07** — see "Reconciled 2026-10-07 (session 2)":
      the catalog exposes the corpus, 351 farm entries ↔ 351 corpus skills, 0 name collisions,
      and `/charly-internals:{agents,git-workflow,skills}` each loaded from
      `.dsh/skills/<name>`.

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
- [ ] **Plugin path requested (#420) in place of a home patch.** Operator directive
      (2026-10-07): fixes land **ONLY through opencharly-org repos**, and nothing is posted to
      any non-org repo — so the upstream bridge is not reported anywhere. The actionable fix is
      therefore a **native DSH plugin in the org**; its seam is already demonstrated by the
      SHIPPED `dsh-github` plugin (`tools/pre-execute` waterfall returning `ask`, fail-closed
      through `ctx.approval`), delegating to the EXISTING `.claude/hooks/*.sh` gate scripts
      rather than duplicating gate logic (R3).
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
- [x] `bash scripts/check-bed-watch.sh --self-test` → **OK (15 assertions)**, rc=0
      (2026-10-07). The exit classifier (pass/skip/fail/timeout) and the `summary.yml` `ok:`
      parser are proven, so the wake line's content is trustworthy when a bed emits it.
- [ ] Arm `check-bed-watch.sh` on a real R10 bed and retain the wake line
      (`BED <bed> <class> rc=… ok=… log=… summary=…`). NOT done, and honestly so: no bed was
      running in this session and this cutover is documentation-only, so there was nothing to
      watch. The first next bed run owes the pasted line. Never treat a quiet bed as done.

### W5 — GitHub comments + validator verdicts
- [x] `.dsh/watch.items` shipped inert by default (comment-only), carrying the portable
      grammar and the "keep short and current" note the pi/reasonix files carry; asserted by
      gate check 11 (DSH arm) and its mutation.
- [x] The binding ARMED live on a real PR: `marketplace/scripts/pr_state_watch.sh
      opencharly/opencharly 417` ran as a DSH background job and its completion delivered the
      wake — `BLOCKED  verdict BLOCK at head afef0cca`, `WATCH EXIT=2`. The watcher's exit IS
      the session wake; re-armed after each wake per the re-arm rule.
- [x] Bind `marketplace/scripts/gh_watch.sh` (per-item comments / verdicts / merged / closed /
      stall) and `pr_state_watch.sh` (terminal PR state); `pr_watch_many.sh` for a cross-repo
      batch. These are the ONE canonical implementation — arm, do not reimplement (R3). The
      binding is settled; the retained live arm is #417's PR (`pr_state_watch.sh
      opencharly/opencharly 417` → `BLOCKED  verdict BLOCK at head afef0cca`, `WATCH EXIT=2`,
      then a MERGE wake).
- [ ] Arm the canonical watchers on THIS cutover's PR and paste the wake line — re-proving the
      #417 precedent on a fresh head.
- [x] Validator verdict: the five `.pi/extensions/github-pr-status.ts` defect classes
      (uppercase state normalisation; run looked up by **head SHA** not workflow name; jobs read
      via the REST jobs API; verdict-less `INCONCLUSIVE` classified distinctly; terminal only on
      a FAILED run or merged/closed PR — PASS ≠ merged) are already carried by the canonical
      `pr_state_watch.sh`, whose exit codes and POISON/INCONCLUSIVE distinction are documented
      in `/charly-internals:git-workflow` ("STOP on a terminal state, never poll in a loop").
      No native DSH classifier is added — that would duplicate the sanctioned poll (R3).

### W6 — SOUL injection
- [ ] Add `SOUL.md` to the DSH instruction chain (host patch `instructionFileCandidates`
      extension) or a `SessionStart` hook; must satisfy what harness-config gate check 7
      asserts for the other harnesses. **Carried by the #420 plugin request**, and the seam is
      proven reachable (`ctx.systemPrompt.section`, live-proven in this session) — see "The
      plugin seams" above.

### W7 — DeepWiki MCP
- [ ] Mount `dsh-mcp-client` with `deepwiki` (streamable-http `https://mcp.deepwiki.com/mcp`)
      in the host patch. Record that root `.mcp.json` is NOT read by DSH (measured: no
      `mcp-client` row in the composed dump) — so the pi/reasonix `.mcp.json`-style binding
      does not transfer. **#420 scopes this OUT of plugin scope** — it is a host row.

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

## Where the rulebook would profit from a plugin (survey, 2026-10-07)

Operator ask (2026-10-07): *which other rules or guidelines could profit from additional
plugins?* Surveyed against `AGENTS.md`, the skills that own each rule, and — first — what is
**already** mechanical, so nothing here duplicates a gate that exists (R3).

### The architectural rule this survey obeys

**One gate implementation, N thin harness bindings.** The mechanics live ONCE in the repo —
`hooks/pre-commit` (nine checks) and `.claude/hooks/{pre-commit-gate,pre-push-gate}.sh` +
`gitcmd.py` (bypass flags, `core.hooksPath`, untokenizable commits, Go lint, alias growth,
force-push, direct push to `main`) — and each harness gets a *thin* interceptor that RUNS them:
Claude Code via `PreToolUse`, opencode via `umbrella-gates.ts`, pi via `charly-gates.ts`. A plugin
that re-implements a gate is the R3 duplication that `check-pi-watch.mjs` (property 1) explicitly
forbids. So the honest question is not "what new gates?" but **"which rules have no repo-home for
a gate, and could be enforced at the harness boundary?"** — and the answer is a *binding*, never
a second gate. This is exactly why the #420 request is deliberately narrow.

### Already mechanical — do NOT re-propose

| Enforced today | Where |
|---|---|
| bypass flags, `core.hooksPath`, untokenizable commits, force-push, direct `main` push | `.claude/hooks/*.sh` + `gitcmd.py` — bound in claude/opencode/pi, **not yet DSH (#420)** |
| policy B, the self-tests, the opencode/pr-watch/pi plugin gates, task contexts | `hooks/pre-commit` (9 checks) |
| harness-config surfaces (checks 1–13), root refs, dispatcher coverage ratchet | `scripts/check-*.mjs` |
| PR body shape and verbatim-paste rules | `marketplace/scripts/pr_body_lint.py` (server-side) |

### The gaps — ranked, each with the home it deserves

| # | Rule / section | What guards it today | Candidate | Value / risk |
|---|---|---|---|---|
| 1 | **R4 + Key Rules — the `charly` CLI is the ONLY operational interface** | nothing blocks `podman`/`docker`/`systemctl`/`journalctl`/`virsh`/`supervisorctl` against charly-managed resources; only *git* mechanics are gated | a command guard tokenizing like `gitcmd.py` and blocking those binaries, naming the verb from R4's own table | HIGH / LOW |
| 2 | **R9 — binary equals source** | nothing checks that the `charly` invoked is the worktree-local CalVer build; a shared install satisfies a command silently | block a `charly` that does not resolve to `$ROOT/charly/bin/charly` | HIGH / LOW |
| 3 | **R10 + body-before-push** | the gate is pasted by hand; a stale body is caught server-side only after a validator round is spent | block `git push` when the branch's PR body is keyed to a different head, or the head has no recorded gate evidence | HIGH / MED |
| 4 | **Disposable-only autonomy** | nothing blocks `charly update`/destroy against a target that is not `disposable: true` | parse the deploy's flags before the verb runs | HIGH / LOW |
| 5 | **Command hygiene & context discipline** | nothing; a `grep … \| head` floods with broken-pipe noise (SIGPIPE is ignored) | block `grep … \| head` and unbounded reads of huge files | MED / LOW *(cheapest win)* |
| 6 | **Rule 9 — ledger & interruption safety** | `dsh-tool-jobs` *injects* "track every background job id" (`dsh-tool-jobs/lib/index.js:257-260`) but nothing enforces it | register each started background job into the session ledger; warn when a long job starts with no item | MED / LOW |
| 7 | **Rule 6 — issue-first coordination** | nothing blocks `git switch -c` with no claimed issue | block branch creation without an assigned/claimed issue | MED / MED |
| 8 | **R1 — RCA on every anomaly** | pure discipline; a failing command does not force an RCA before the next edit | **warn-only** signal on a narrow error signature set — never a block | HIGH / **HIGH** (over-blocking is worse than none) |
| 9 | **R0 — skills first** | nothing verifies the matching skill was loaded before the action | **warn-only** when a command matches a `DISPATCHER.md` trigger and no matching skill was loaded this session | HIGH / MED-HIGH (fuzzy matching) |
| 10 | **AI attribution trailers** | the validator checks the PR body server-side; nothing local | a repo `hooks/commit-msg` — **not** a plugin | MED / LOW |
| 11 | **R3 / R5 claim-keyed sweeps** | per-cutover `git grep` by hand | a claim→surfaces sweep helper (script + skill, not a blocking gate) | MED / MED |

### Ranked shortlist (build order)

1. **R4 charly-only-CLI guard** (+ **R9** worktree-binary binding) — deterministic, high value, one
   script plus thin bindings.
2. **Disposable-only guard** — safety, deterministic.
3. **Push-time body/evidence check** — directly saves `pr-validator` rounds.
4. **Command-hygiene guard** — the cheapest win.
5. **Warn-only signals**: the R1 anomaly signature and the R0 skill-trigger check.
6. **Rule 6 issue-first and Rule 9 ledger enforcement** — real value, highest false-positive risk.

**The load-bearing caveat.** Items 1–4 are deterministic and may BLOCK; items 8–9 must NOT — the
hooks doctrine keeps hooks on deterministic mechanics only (`AGENTS.md`, "Hooks doctrine"), and
"did you RCA this" / "did you load the skill" are judgments, not invariants. Every item is a
repo-owned script plus a thin harness binding, so each lands once and each harness merely runs it.

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
- [x] Umbrella leg: W1, W3, the watch binding (W5), and the issue/worktree half of W8 —
      **MERGED** as opencharly/opencharly#417 (merge `090b13f`, tag `v2026.280.0727`), after two
      BLOCK rounds whose findings 2/3 were fixed and whose block 1 (the T4 maintainer sign-off)
      was posted under the maintainer account.
- [x] W4's mechanism and W5's live arm: the background-job wake is proven, and the watcher was
      armed on the real PR — it woke on the BLOCK and again on the MERGE.
- [x] Landing close-out: CHANGELOG `2026.280.0727` written by `tag-on-merge`; tag
      `v2026.280.0727` → the merge commit `090b13f`; #416 closed with the merge link.
- [ ] W2 / W6 / W7 (host-level wiring): **BLOCKED on opencharly/opencharly#418** — a
      profile-root `dsh-hooks-claude-code` mount composes and imports but never fires a hook, and
      the six candidate causes are each excluded by their own probe (above). The cause is upstream
      in the bridge package; per the operator directive (2026-10-07) the fix is an
      **opencharly-org DSH plugin** and nothing is posted to any non-org repo — requested in
      **#420**.

### Session 2 (2026-10-07)

- [x] Reconciled against live state before acting: `main` @ `dd21383`, clean, in sync, no open
      PRs; #416 CLOSED, #417 + #419 merged, #418 OPEN. Filed and CLAIMED **#420** before branching.
- [x] W1's live probe CLOSED — the corpus resolves in a fresh DSH session (351 ↔ 351, 0
      collisions).
- [x] The org's DSH plugin channel recorded: three pinned plugins already drive this session, so
      "ask it as a DSH plugin in the opencharly org" is a wired channel, not a hypothetical.
- [x] W4 `--self-test` green (15 assertions); W5's binding + validator-verdict items closed by
      decision (arm the canonical watchers; add no plugin — R3).
- [x] R1 finding 1 fixed in the same change: the ledger's opening now carries its PRE-#417
      BASELINE label instead of reading as current state.
- [ ] The one remaining R10/GitHub watch gap — session-start auto-arm of `.dsh/watch.items` — is
      carried by the #420 plugin request (the pi `watch.ts` equivalent).
- [ ] The live bed arm (W4) is owed to the first next bed run: no bed was running, and this
      cutover is documentation-only.
- [ ] Producer-first `pod-dsh` leg, blocked on #418 or on the #420 plugin.
