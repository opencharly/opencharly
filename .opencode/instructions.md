# opencode harness instructions

This file binds the harness-neutral `AGENTS.md` rulebook to this harness's
mechanics. It is opencode-specific by construction and lives in the opencode
config layer (`.opencode/`), never in `AGENTS.md`.

## Skill addressing

`AGENTS.md` addresses every skill by its canonical, harness-neutral reference
`/charly-<family>:<skill>` (e.g. `/charly-internals:git-workflow`). These
references are also the marketplace-wide cross-reference syntax the docs build
resolves, so they are kept verbatim.

opencode's `skill` tool does **not** accept the namespaced form: skill names must
match `^[a-z0-9]+(-[a-z0-9]+)*$`, which forbids `:` and `/`. opencode loads every
skill under a configured `skills.paths` entry (here: `marketplace`) and exposes it
by its **bare frontmatter `name`**, which is globally unique across the corpus.

**Resolve a dispatcher reference as follows:**

| Canonical reference | opencode `skill` tool call |
|---|---|
| `/charly-<family>:<skill>` | `skill({ name: "<skill>" })` |

Examples:

- `/charly-internals:git-workflow` → `skill({ name: "git-workflow" })`
- `/charly-check:check` → `skill({ name: "check" })`
- `/charly-core:charly-config` → `skill({ name: "charly-config" })`

If a skill is not exposed as a tool entry, read its procedure directly at
`marketplace/<family>/skills/<skill>/SKILL.md` (the same fallback every harness
uses).

## Gate hooks

`.opencode/plugins/umbrella-gates.ts` runs the root gate scripts
(`.claude/hooks/pre-commit-gate.sh`, `pre-push-gate.sh`) before `git commit` /
`git push` shell calls and denies the call when a gate blocks.

### opencode plugin contract

opencode has TWO plugin shapes, and the loader picks by the default export:
- **opencode ≥ 2.0** — `{ id, setup(ctx) }`, registering hooks via
  `ctx.tool.hook("execute.before", …)`; the shell tool is named `shell`.
- **opencode 1.x** — `{ id, server(input) }`, returning a hooks object keyed by
  `"tool.execute.before"`; the shell tool is named `bash`. A definition WITHOUT
  `server` is REJECTED at startup: `must default export an object with server()`.
  The bare function form (`async (input) => ({...})`) does not load on ≥ 2.0.

A plugin MUST export **both** `setup` and `server` (sharing ONE implementation) so
it loads and enforces under EITHER generation. Measured (2026-09-28, R1): a
`setup`-only plugin was REJECTED by the then-installed **1.18.33** with
`failed to load plugin … must default export an object with server()` on every
startup, and the gates blocked nothing — the regression this rule prevents. The
host has since been upgraded to **v2.0.18** (which loads `setup`), so the dual
export is the portable form, not a host workaround. `scripts/check-opencode-plugin.mjs`
requires BOTH entry points and, with `LIVE_OPENCODE=1`, drives the real binary end
to end.

### V2 custom tools (measured against v2.0.18)

A V2 `setup(ctx)` registers a custom tool through `ctx.tool.transform`:

    await ctx.tool.transform((draft) => {
      draft.add({
        name: "my_tool",
        description: "…",
        input: { type: "object", properties: { … }, required: ["…"] }, // JSON Schema
        execute: async (args, toolCtx) => ({ content: "…" }),           // { content } REQUIRED
      });
    });

Measured (2026-09-28, live against v2.0.18): `tool.transform(cb)` invokes `cb` with a
draft exposing `list/get/namespace/add/update/remove`; the tool `input` is a plain
JSON Schema; the `execute` result MUST be `{ content: string }` — a bare string and
`{ output }` both FAIL at runtime (`s is not an Object. (evaluating '"output" in s')`).
The `setup(ctx)` context is FAR richer than the published `@opencode-ai/plugin/v2`
types: besides `tool`, `options`, `location`, `agent`, `command`, `event`, `skill`,
`reference`, `aisdk`, `integration` it also carries `session`, `shell`, `vcs`,
`worktree`, `permission`, `provider`, `model`, `mcp`, `storage`, `rpc`, `websearch`,
`generate`, `app`, `experimental`. `ctx.location.directory` is the project root;
`ctx.session.prompt({…})` is the canonical prompt call. Type-only imports
(`import type { Plugin } from "@opencode-ai/plugin/v2/promise"`) are erased at
runtime, so a local plugin needs NO `node_modules` to load; the declared
`@opencode-ai/plugin` version must nonetheless be one that ships the `./v2/promise`
export. **Both 1.18.32 and 1.18.33 ship it** (verified against their published
packages); the pin tracks **1.18.33**, the newest release on the `latest` tag.

### Coordination tools (`.opencode/plugins/coord.ts`)

`coord.ts` registers three V2 custom tools implemented NATIVELY in TypeScript, so a
session posts the canonical coordination comment, ends a PR body with its session
footer, and waits on GitHub without hand-writing the footer:

- **`coord_comment`** — builds the verb-labelled coordination comment (the closed verb
  set and the canonical two-line identity footer are the `AGENTS.md` contract, not this
  file's) and POSTs it directly through the GitHub REST API; it can `assign` the posting
  account (a CLAIM).
- **`coord_footer`** — returns the two-line session footer for THIS session (the
  `Agent:` line with the live session id, then the `Assisted-by:` trailer) to end a PR
  body, an issue or a comment with; it posts nothing.
- **`coord_watch`** — a bounded, session-invoked one-shot wait
  (`events`/`timeout`/`stallmin`) that runs the shared engine in-process and returns the
  **ARM report** (the baseline it armed on) plus the wake line. The BACKGROUND
  continuous watch stays `pr-watch.ts`'s job.

**ONE implementation (opencharly/opencharly#1140).** `coord.ts`, `pr-watch.ts` and
`tracker.ts` are thin OpenCode bindings of the umbrella's `scripts/gh/lib/` — the SAME
engine, verb set, footer builder and GitHub client that `node scripts/gh/cli.ts` runs for
every other harness. They import it in-process (no `.sh`, no spawn, no `marketplace` pin),
so OpenCode cannot drift from the other harnesses: the contract is one code path, tested
once by `scripts/check-gh-tools.mjs`.

**The verdict.** `verdict` fires when the newest `validate / validate` check run of the
`charly/pr-validator` suite on the PR's head reaches a FINAL conclusion that is new since
arm — a REST re-run creates a new check run, so it fires. Its class is PASS, BLOCK or
INCONCLUSIVE (the validator's comment for that head says so). A run that is only in flight
never wakes anyone. The ARM report (stderr for the CLI, the first lines of the tool result
here) is the baseline per item, and a BLOCK or INCONCLUSIVE already on the head wakes at
arm, once. The wake lines, the event semantics and the decision table are the git-workflow
skill's `references/watch-and-wake.md`.

Identity (`agent`/`harness`/`model`/`confidence`) defaults from
`.opencode/coord.conf` (git-ignored; copy `.opencode/coord.conf.example`) then
`COORD_*` env; the `session` is always the live `toolCtx.sessionID`, so a stale
config can never mislabel who is speaking.

**API efficiency and rate limits.** ONE batched GraphQL request per poll for N items. The
remaining quota is read from that response's header; below 200 the watch backs off (×2,
capped at 600 s) visibly. Any rate-limit signal (REST 403/429, GraphQL `RATE_LIMITED`) is
FATAL: the tool returns a `RATE-LIMITED …` message and the watch stops. `POLL_FLOOR = 300`:
a shorter interval is refused.

**Execution is async and abortable.** `coord_watch` runs a long-lived poll loop, fully
async; the tool executor's `context.signal` reaches every `fetch` and the poll sleep, so
stopping the session ends the watch promptly. Auth is `GITHUB_TOKEN`/`GH_TOKEN`, else
`gh auth token`; `GITHUB_API_URL` overrides the API base (GitHub Enterprise / tests).
`scripts/check-gh-tools.mjs` drives these tools in-process against a local GitHub, and
with `LIVE_OPENCODE=1` through the REAL opencode binary (skipped visibly when unset).

### Monitoring AND controlling agents (`.opencode/plugins/agent-progress.ts`)

`agent-progress.ts` registers TWO V2 custom tools, implemented NATIVELY in TypeScript:
**`agent_progress`** (MONITOR) and **`agent_control`** (CONTROL). Together they answer the
orchestrator's real question — *what is this subagent actually doing, and how do I stop it?*
— from the **transcript**, not a turn count.

#### `agent_progress` — the MONITOR (read-only)

- **A "message" is an ASSISTANT TURN.** `session_message` rows
  with `type='assistant'` are turns (`data.content: [{type:"reasoning"|"text"|"tool"}]`).
  The monitor SHOWS the count and never keys a verdict on it.
- The report, per session: id + title/slug; **turns**, **span** (first→last), **last-turn /
  last-event age**; the **tool mix** (`shell`/`read`/`write`/`edit`/…); the **last action**
  (the text/reasoning snippet + the last tool + its input); **artifact hints**
  (`owner/repo#N`, `gh pr merge`, `merged`, `v…` tags, `pushed`); and a **VERDICT**.
- The verdict mirrors the rulebook model: **WORKING** (recent turns + tool cadence) /
  **IDLE** (no turns past `windowMin` — default 15 — and no artifact) / **LOOP** (the same
  tool+input repeated `≥4`× in the tail, no artifact) / **DONE** (a final report
  `finish=stop`, no pending action, **or a landed artifact with the session then quiet**).
- Data source is **VERIFIED**: a **read-only** handle on the opencode store
  (`$XDG_DATA_HOME/opencode/opencode.db`, `OPENCODE_DB` override) — `new Database(path,
  { readonly: true })` under `bun:sqlite` (the shipped runtime), `new DatabaseSync(path,
  { readOnly: true })` under `node:sqlite` (the gate). The live schema is `session_v2` +
  `session_message`; there is NO `session` table. Async, `context.signal`-aware, and it
  fails CLEARLY (`cannot open …`, `no session …`) — it never fabricates a verdict.

#### `agent_control` — the CONTROL half (the new part)

Actions (`action`, optional `session`):

- **`list`** — enumerate sessions (id, title, agent, last-activity age, verdict), from the
  same read-only store as the monitor. (The V2 plugin context has **no `ctx.session.list`**;
  the store is the enumeration source. The API equivalent is `GET /api/session` +
  `GET /api/session/active`.)
- **`interrupt`** — stop a RUNNING session WITHOUT deleting it:
  `ctx.session.interrupt({ sessionID, continue: false })` (measured; the API equivalent is
  `POST /api/session/{id}/interrupt`). Returns `{interrupted:true}` plus the turn baseline.
- **`delete`** — `opencode session delete <id>` (**deletes the session AND its child
  sessions**; the API equivalent is `DELETE /api/session/{id}`). The tool counts and lists
  the child sessions it covered, and reports a non-zero exit as **FAILED** — it never
  believes a delete that did not happen.
- **`wait`** — block (bounded, default `DEFAULT_WAIT_TIMEOUT_S = 600`s) until a session goes
  idle: `ctx.session.wait({ sessionID })` (the API equivalent is
  `POST /api/experimental/session/{id}/wait`).
- **`confirm_stopped`** — after `interrupt`/`delete`, re-read the transcript and ASSERT **no
  new turns** (the "CONFIRM it stopped" rule in `AGENTS.md`). Pass the `baselineTurns`
  returned by `interrupt`; any new turn ⇒ **STILL RUNNING**. Without a baseline it reports
  the live state and says so — never a fabricated PASS.
- **SAFETY:** `interrupt`/`delete`/`wait`/`confirm_stopped` require an **EXPLICIT** session
  id (`requireExplicitSession` refuses `all`/blank/non-`ses_`), and every result reports
  what it stopped — so a session another slug owns is **never silently killed**. The `list`
  path is read-only.

**PURE TYPESCRIPT, no `.sh`, no `marketplace` pin** — same directive as `coord.ts`. The
control half's ONE `execFile` drives the **opencode CLI** (a tool, exactly like `gh` in
`coord.ts`) — never a `.sh`. `scripts/check-agent-progress.mjs` gates it: **(A)** static (no
`.sh`/`spawnSync`/`Bun.spawn`, read-only both drivers, DB path, the closed action set + the
explicit-session rail); **(B)** unit — the classifier, INCLUDING the RCA regression (a
turn-count-heavy-but-working transcript is `WORKING`, not stalled), the control actions
against a REAL read-only SQLite fixture, and the refusal paths; **(C)** `LIVE_OPENCODE=1`
drives the real binary and calls `agent_progress` **and** `agent_control list` (read-only —
the test NEVER interrupts/deletes a real session; live-or-skip, visibly).

### Watching for PR events (opencode)

The watcher is the ONE engine every harness uses (`scripts/gh/lib/watch.ts`; the CLI
`node scripts/gh/cli.ts watch` for the others) — never hand-roll a `sleep` poll.

The PR-event binding is `.opencode/plugins/pr-watch.ts`. It runs the shared engine's
continuous loop in-process and delivers each wake IN-PROCESS — never an `opencode run`
subprocess (that starts a separate headless run, can race the live session, and
interrupts the in-flight turn).

**V2 delivery (opencode ≥ 2.0, MEASURED against v2.0.18).** The `setup(ctx)` context
carries NO `client` (only 1.x's `server(input)` does). The V2 "inject context without
starting a turn" primitive is the Session domain:

    await ctx.session.synthetic({ sessionID, text: alert });

`session.synthetic` enqueues a synthetic message whose default `delivery` is `steer`,
so the alert is ADDED to the running session rather than starting a new turn (the same
interruption-safe intent as 1.x's `noReply: true`). The session id is unknown at setup
and `session.list` does not exist on V2, so it is CAPTURED from the first tool call
(`ctx.tool.hook("execute.before", e => e.sessionID)`) or the first prompt
(`ctx.session.hook("prompt", e => e.sessionID)`); if no id is captured before a wake,
the wake is a logged warning, never a silent drop.

**V1 delivery (opencode 1.x).** The documented SDK-client shape —
`client.tui.showToast(...)` plus `client.session.prompt({ path: { id }, body: { noReply:
true, parts: […] } })`, the target resolved from `client.session.list()` (the most
recently updated root session in this directory).

Config: one item per line in `.opencode/pr-watch.items` (`acme/widget#12`; blank lines
and `#` comments ignored). The shipped file contains only comments, so the plugin is
**inert until you add an item**. It watches `comment,merged,closed,verdict`, so a new
comment and a final verdict (a re-run included) both wake the session, and a BLOCK already
on the head wakes at arm. Plugins load once at startup — **restart** to activate.
`scripts/check-pr-watch.mjs` asserts the delivery primitives are present as CODE
(comments stripped) and that the delivered event set carries `comment` + `verdict`, so a
commented-out or absent call fails the gate.

### Session tracker + durable ledger (`.opencode/plugins/tracker.ts`)

OpenCode V2 exposes **no todo primitive** (`todowrite` is only a migration shim; no todo
table, no `/session/:id/todo` endpoint, no `todo.updated` event). So AGENTS.md rule 9's
durable ledger is kept in a durable file on this harness, and `tracker.ts` is its mechanism.
It is PURE TypeScript
(no `.sh`, no `marketplace` pin) and reuses the shared modules rather than copying them:
`scripts/gh/lib/watch.ts` (the ONE engine and item grammar) and `lib/watcher-loop.ts` (the
in-process delivery loop it shares with `pr-watch.ts`).

Three tools:

- **`tracker_ledger`** — the durable ledger. `action: read | reconcile | replace`; entries
  are `{ id, kind, scope?, slug?, session?, state, next }` where `kind` ∈
  `subagent | pr | issue | blocker | op` (rule 9's four categories). **`reconcile` MERGES**:
  it ADDs items without dropping the open ones. Stored at
  `.opencode/ledger/<session>.json` (git-ignored).
- **`tracker_status`** — joins the ledger against LIVE GitHub: each scope's real state
  (open / MERGED / closed) and the LATEST coordination verb (`OWNING`/`TAKING OVER` wins)
  with its `Agent:` slug. Flags a scope owned by **another** slug — coordinate, do not push.
  The join is what answers *what am I on, and where must I comment* from live state rather
  than from this session's memory.
- **`tracker_sync`** — reconciles `merged` (unblock) / `closed` (find successor) / `stall`
  (takeover candidate) from live state; `watch: true` arms the shared loop over the ledger's
  scopes (one-shot wait).

The tools IMPLEMENT the rules — they do not restate them; the verb grammar and footer belong
to `coord.ts`, the landing/workflow to the `git-workflow` skill, the ledger how-to to the
`agents` skill. `scripts/check-issue-tracker.mjs` gates it.
