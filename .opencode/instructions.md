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

The plugin follows the opencode **V2** contract: a default export
`{ id, setup(ctx) }`, with the gate hook registered inside `setup` via
`ctx.tool.hook("execute.before", …)`. V1's default-exported function returning a
keyed hook map does **not** load under opencode ≥ 2.0 — the loader logs a WARN and
keeps starting, so the gates silently stop running. The V2 shell tool is named
`shell` (V1's `bash`), which the hook matches. `scripts/check-opencode-plugin.mjs`
guards the contract (run by `hooks/pre-commit` and `charly task verify`).

### Watching for PR events (opencode)

The watcher is the harness-independent `marketplace/scripts/gh_watch.sh` family
(`pr_watch_many.sh`, `pr_state_watch.sh`) — run one, never hand-roll a `sleep` poll. It
emits one line per event and exits; re-arm after each wake.

**Delivery is IN-PROCESS via the plugin SDK — never an `opencode run` subprocess** (that
starts a separate headless run, can race the live session, and interrupts the in-flight
turn). A plugin under `.opencode/plugins/` is handed the SDK `client` for the running
server (<https://opencode.ai/docs/plugins/>, <https://opencode.ai/docs/sdk/>). On a wake:

    // 1. the visible signal
    await client.tui.showToast({ body: { message, variant: "info" } });
    // 2. inject the alert as CONTEXT without starting a turn (interruption-safe)
    await client.session.prompt({
      path: { id: sessionID },
      body: { noReply: true, parts: [{ type: "text", text: alert }] },
    });

`noReply: true` is the load-bearing primitive (SDK docs: *"Inject context without
triggering AI response (useful for plugins)"*): the alert joins the session and is handled
on the next turn, so an in-flight turn is NOT interrupted — an alert is an **addition** to
the ledger, never a reset (`AGENTS.md` rule 11). Omit `noReply` (or use `promptAsync`) only
when the wake must start a turn immediately. The plugin runs the generic watcher with Bun's
`$`. Plugins load once at startup — **restart** to activate.
