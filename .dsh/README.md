# `.dsh/` — the DSH harness config at the umbrella root

`AGENTS.md` Part II rule 5: every harness's configuration lives at this repo's root and
nowhere else. This directory is DSH's repo-local arm, alongside `.claude/`, `.opencode/`,
`.codex/`, `.pi/`, `.reasonix/` and `opencode.json`.

| Path | What it is |
|---|---|
| `skills/` | **The R0 skill-corpus binding.** DSH's `dsh-skill-filesystem` scans `<projectRoot>/.dsh/skills` at rank 100 and discovers only depth-1 `<name>/SKILL.md` bundles. The `opencharly/marketplace` corpus is three levels deep (`marketplace/<family>/skills/<name>/SKILL.md`), so each corpus skill is bound as a flat symlink `<name> -> ../../marketplace/<family>/skills/<name>`. The farm follows the `marketplace` gitlink — no generated copy and no second pin to keep in sync. |
| `watch.items` | The portable watch item list (`owner/repo#num`, the same grammar `.pi/watch.items` and `.reasonix/watch.items` use). Inert by default; see the file header for how a DSH background job arms it. |
| `ledger/` | The local catch-up ledger — `dsh-config-catchup.md` once a session has written it (R1 findings, gaps, work items, RDD probes). **The content is git-ignored**: the DIRECTORY is tracked via `.gitkeep`, so a fresh clone has the home but no stale ledger. Same class as the root `plan/` dir. |
| `README.md` | This signpost. |

## Goal budget — the round cap is a per-goal decision (RCA, 2026-10-08)

A goal's round budget is the `maxGoalRounds` passed at creation. **Measured from the harness
source:** `dsh-goal`'s `Config.defaultMaxGoalRounds` is **256**, and `dsh-goal-round-driver`
blocks **hard** the moment `roundsStarted >= maxGoalRounds` — `{code: "round-limit"}`, phase
`blocked`, goal **disarmed** — with **no warning phase before the cap**. There is no project
patch file (below), so the only bindable knobs are the per-goal parameter and the host
profile's `defaultMaxGoalRounds`.

**RCA (measured on this repo's own campaign).** A 76-issue, multi-cluster campaign was created
with `max_goal_rounds: 40` — 6.4× *below* the harness default — for an objective needing
roughly 150–250 owner turns. It reached `round-limit` and disarmed mid-flight with the operator
never asked: **the cap was mis-sized by the agent, and no rule required asking before it ran
out.** The work itself was unharmed (the ledger and hand-over survived), and the root fix is
guidance rather than configuration — the mechanism already had a sane default.

**The rule (AGENTS.md Part II rule 10):** size the cap to the objective's projected owner-turns
and never below the default without a stated reason; once a goal passes ~80% of its budget with
work remaining, **STOP and ask the operator** how to proceed rather than narrating an ending.
Sizing a campaign: one owner turn per PR per verdict round, plus one bed per runtime change.

## Skill addressing

A skill is `/charly-<family>:<skill>` in the rulebook; in DSH it is the catalog entry the
farm exposes as `<skill>`, and its body is `marketplace/<family>/skills/<skill>/SKILL.md`.
A harness that cannot resolve the `/charly-…` form reads that path directly — so the path is
the fallback, never a second copy.

The binding is guarded: `scripts/check-harness-config.mjs` check 13 asserts the farm covers
every `marketplace/*/skills/*/SKILL.md` and that no two families share a skill name (a flat
farm is keyed by name, so a collision would silently shadow one skill), and check 11 asserts
`watch.items` exists for DSH as it does for reasonix and pi.

## What is NOT here (host-level `$DSH_HOME` config)

DSH's patch precedence is bundle layers → profile `cordis.patch.yml` → **home**
`~/.dsh/cordis.patch.yml` → invocation overlay; there is **no project patch file**, so the
following cannot be bound from this repo and live in the machine's `$DSH_HOME` profile, landed
producer-first in `opencharly/pod-dsh`:

- the `dsh-hooks-claude-code` mount that runs the git gates. **Measured (RDD, 2026-10-07): a
  profile-root `insert` of this bridge composes and imports but never applies** — no hook fires
  (four candidate matchers plus a `SessionStart` hook were silent), it reads no config (a
  deliberately MALFORMED `configPath` warned nothing), and its decompressed session log emits no
  `hook/invoked` event, while the patch layer and loud activation diagnostics were both ruled out
  by their own probes. The next step is a preset-scope mount spike; see the ledger's assumption-1
  entry before wiring it;
- the `dsh-mcp-client` row for the `deepwiki` server (DSH does **not** read the root
  `.mcp.json`);
- SOUL injection;
- session-start **auto-arm** of `.dsh/watch.items`. Correction (measured 2026-10-07): the watch
  itself is NOT host config — DSH notifies the session when a background job finishes, so a
  canonical watcher armed as a background job already turns its own exit into the wake. The
  genuinely missing piece is only the *auto*-arm at session start (pi's
  `.pi/extensions/watch.ts` equivalent), which is plugin scope.

The native DSH plugin that would close the git-gate, SOUL and auto-arm gaps is requested as
opencharly/opencharly#420. Operator directive (2026-10-07): the fix lands **only as an
opencharly-org DSH plugin** — nothing is posted to any non-org repo, and a host patch cannot fix
the bridge.

See `ledger/dsh-config-catchup.md` — a LOCAL, git-ignored file — for the measured evidence, the
open high-risk assumptions (RDD probes), and the work items.

## Watch discipline

Arm ONE watcher per scope; never hand-roll a poll loop; poll floor 300s; prefer terminal
events plus the `stall` alarm over per-comment events.

Re-arming follows the watcher's own WATCH_DONE rule: a **DELTA** fire (comment/verdict) arms a
successor BEFORE it prints, so the agent acts and the watch keeps running; a **STATE** fire
(merged/closed/**stall**) sets `WATCH_DONE` and must **not** be re-armed — a successor would
re-fire it immediately and livelock (a merged PR stays merged, a stalled item stays stalled).
A STALL is a takeover candidate, not a re-arm.

- `marketplace/scripts/gh_watch.sh <owner>/<repo>#<n>` — comments / verdicts / merged /
  closed / stall.
- `marketplace/scripts/pr_state_watch.sh <owner>/<repo> <pr>` — one PR's terminal state
  (distinguishes a verdict BLOCK from POISON).
- `scripts/check-bed-watch.sh <bed>` — one R10 bed; the exit code is the honest signal
  (3 = prereq SKIP).
