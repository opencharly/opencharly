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
uses). Never proceed without loading the procedure — R0 is mandatory.

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

`coord.ts` registers two V2 custom tools binding the GENERIC shell scripts, so a
session posts the canonical coordination comment and waits on GitHub without
hand-writing the footer:

- **`coord_comment`** — backed by `marketplace/scripts/coord.sh` (the ONE
  implementation of the verb grammar). Posts ONE verb-labelled comment
  (`CLAIM`/`OWNING`/`HANDING OVER`/`TAKING OVER`/`BLOCKS`/`UNBLOCKS`/`STATUS`/`RESOLVED`)
  carrying the canonical TWO-LINE footer (`Agent:` FIRST, `Assisted-by:` LAST), and
  can `--assign` the posting account (a CLAIM).
- **`coord_watch`** — backed by `marketplace/scripts/gh_watch.sh`; a bounded,
  session-invoked one-shot wait (`events`/`timeout`/`stallmin`), returning the wake
  line. The BACKGROUND continuous watch stays `pr-watch.ts`'s job.

Identity (`agent`/`harness`/`model`/`confidence`) defaults from
`.opencode/coord.conf` (git-ignored; copy `.opencode/coord.conf.example`) then
`COORD_*` env; the `session` is always the live `toolCtx.sessionID`, so a stale
config can never mislabel who is speaking.

**Execution is ASYNC + ABORTABLE (R1 fix, measured 2026-09-28).** Both executors
spawn their script with `Bun.spawn` and pass the tool executor's
`context.signal` to the child — NEVER a synchronous spawn helper. `coord_watch` runs
the LONG-LIVED watcher, so a blocking spawn froze opencode's server event loop for
the whole watch and the supervisor restarted it (measured: a `timeout: 3` call ran
the full 20s stub and ignored the deadline; the server log showed a reload). The
async form keeps the server responsive, an interrupted Session ABORTS the child, and
`coord_watch`'s `timeout` is also enforced tool-side as a deadline backstop.
`scripts/check-opencode-coord.mjs` asserts statically that `coord.ts` contains no
synchronous spawn helper and references `signal`, and — live — that a `timeout: 2`
`coord_watch` returns without the server reloading. The plugin A/B/B2/C layers run
against the REAL binary, the live C layer posting a real comment through the REAL
`coord.sh`.

### Watching for PR events (opencode)

The watcher is the harness-independent `marketplace/scripts/gh_watch.sh` family
(`pr_watch_many.sh`, `pr_state_watch.sh`) — run one, never hand-roll a `sleep` poll. It
emits one line per event and exits; re-arm after each wake.

The PR-event binding is `.opencode/plugins/pr-watch.ts`. The watcher itself is the
generic `marketplace/scripts/gh_watch.sh` (run via `Bun.spawn`); delivery is
IN-PROCESS — never an `opencode run` subprocess (that starts a separate headless run,
can race the live session, and interrupts the in-flight turn).

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
**inert until you add an item** — and it needs `marketplace/scripts/gh_watch.sh`, so the
`marketplace` submodule pin must carry the watcher family. Plugins load once at startup —
**restart** to activate. `scripts/check-pr-watch.mjs` asserts both delivery primitives
are present as CODE (comments stripped), so a commented-out or absent call fails the gate.
