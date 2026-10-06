# reasonix harness instructions

This file binds the harness-neutral `AGENTS.md` rulebook to this harness's
mechanics. It is reasonix-specific by construction: it lives at the repo root
because that is where reasonix looks for instructions, and it never restates
policy that `AGENTS.md` owns.

## Skill addressing

`AGENTS.md` addresses every skill by its canonical, harness-neutral reference
`/charly-<family>:<skill>` (e.g. `/charly-internals:git-workflow`). These
references are also the marketplace-wide cross-reference syntax the docs build
resolves, so they are kept verbatim.

reasonix loads every skill under a configured `[skills] paths` entry — the 40
`marketplace/<family>/{skills,agents}` directories in `reasonix.toml` — and
exposes it by its **bare frontmatter `name`**, which is globally unique across
the corpus. reasonix's own `/<plugin>:<skill>` qualified form belongs to
*installed plugin packages*, not to a skill root, so a marketplace skill is
**not** invoked as `/charly-internals:git-workflow`.

The paths are the **skill-bearing** directories, deliberately NOT the bare
`marketplace` root: `marketplace/` is a multi-*family* root, while reasonix
expects a multi-*skill* root, so pointing at it makes reasonix scan family
prose as skills (`CHANGELOG/*.md`, `*/README.md`, the root `AGENTS.md`/
`DISPATCHER.md`) and print ~3,500 `skill.missing_description` warning lines per
boot (MEASURED, reasonix v2.28.0). `scripts/check-harness-config.mjs` check 8
asserts the scoped list covers every skill root and that the bare root is not
present.

**Resolve a dispatcher reference as follows:**

| Canonical reference | reasonix invocation |
|---|---|
| `/charly-<family>:<skill>` | `/skill` (slash command) or `run_skill({ name: "<skill>" })` |

On disk the mapping is direct, and every skill's bare `name:` equals its
directory name:

```text
/charly-<family>:<skill>   →   marketplace/<family>/skills/<skill>/SKILL.md
```

Examples:

- `/charly-internals:git-workflow` → `/git-workflow`
- `/charly-check:check` → `/check`
- `/charly-core:charly-config` → `/charly-config`

`/skills` lists every loaded skill with its scope and path. If a skill is not
exposed, read its procedure directly at
`marketplace/<family>/skills/<skill>/SKILL.md` — the same fallback every
harness uses.

## Config scope — what a project file can and cannot do

reasonix resolves `flag > ./reasonix.toml > ~/.reasonix/config.toml > built-in
defaults`, but **a project file may only NARROW a setting, never widen it**.
This is the single most important thing to know before editing `reasonix.toml`,
because a setting that looks present can be silently inert:

| Setting | From `./reasonix.toml` | Why |
|---|---|---|
| `[skills] paths` | **effective** | additive discovery root |
| `[[plugins]]` | **effective** | project-scoped MCP server |
| `.reasonix/settings.json` hooks | **effective** (after `reasonix trust`) | project hook source |
| `[permissions] deny` / `ask` | **effective** | narrowing |
| `[permissions] allow` | **ignored** | widening — set it in the user config |
| `[sandbox] bash = "off"` | **ignored** | widening — set it in the user config |
| `[sandbox] network = false` | **effective** | narrowing |

So the sandbox posture and any auto-allow list live in
`~/.reasonix/config.toml`, and this repo's `reasonix.toml` must not carry a
`[sandbox]` block at all — it cannot do anything except mislead the next reader.

## Session context and identity

reasonix has **no additive `instructions` config key** — the mechanism
`opencode.json` uses (`"instructions": [".opencode/instructions.md", "SOUL.md"]`)
does not exist here. Its additive mechanism is a **`SessionStart` hook whose
stdout is injected** into the next user turn, which the host wraps as
`<hook-context event="SessionStart">…</hook-context>`. That is how `SOUL.md`
reaches a reasonix session: `.reasonix/soul-inject.sh`, wired in
`.reasonix/settings.json`.

This corrects opencharly/opencharly#367, which deferred reasonix on the stated
ground that *"reasonix's documented hooks are Bash-only"*. That premise is
measurably false: `SessionStart` is one of reasonix's hook events, and its
documented contract is that a `SessionStart` hook's stdout ("plain text, or JSON
with `hookSpecificOutput.additionalContext`") *"is injected once into the next
real user turn"*. `scripts/check-harness-config.mjs` check 7 asserts the arm.

`AGENTS.md` is loaded natively (reasonix reads `REASONIX.md` / `AGENTS.md` /
`CLAUDE.md` from the workspace) — no hook needed for it. `SOUL.md` is not in
that recognised set, which is why it needs the hook.

## Gate hooks

`.reasonix/settings.json` runs the root gate scripts
(`.claude/hooks/pre-commit-gate.sh`, `pre-push-gate.sh`) before `git commit` /
`git push` shell calls. Two reasonix-specific rules apply:

- The matcher key is **`match`**, not Claude Code's `matcher`. reasonix ignores
  an unknown `matcher` key and silently widens the hook to `match: "*"`, so the
  gates would run on *every* tool call instead of only Bash. A hook is only
  load-bearing if `reasonix hook list --json` reports the match you intended.
- `match` is an **anchored regex** over the tool name (`Bash`, not `bash`), and
  `timeout` is in **milliseconds**.
- Project hooks load only after the user approves them as they stand
  (`reasonix trust`); editing the file or a script it names withdraws that
  approval. Check with `reasonix hook status --json`.

The gate scripts share one payload contract with every other harness: the event
arrives as one line of JSON on stdin (`toolArgs.command` for Bash), exit `2`
blocks the call and the stderr text is what the model reads.

## Config hygiene

`reasonix.toml` is TOML, and **one malformed value invalidates the entire
file** — every table in it is then silently ignored, with no error at session
start. The trap that bit this file: a backslash inside a basic (double-quoted)
string is an escape, so a regex such as `'^submodule\..*\.path$'` must be
written `'^submodule\\..*\\.path$'`. Verify a change with:

```bash
python3 -c "import tomllib; tomllib.load(open('reasonix.toml','rb')); print('ok')"
reasonix doctor --json          # confirm the tables actually took effect
```

## Web search

reasonix has no provider-side web search for Ollama Cloud: `web_search = true`
is documented only for the DeepSeek / OpenCode-Go presets, and the capability
does not exist for the `ollama-cloud` endpoint. The Ollama web-search and
web-fetch REST APIs are reached through the code extension in
`.reasonix/plugin/`, which exposes them as the model-callable tools
`ext__ollama-websearch__web_search` and `ext__ollama-websearch__web_fetch`
(the manifest `name` is `ollama-websearch`). See that directory's
`README.md` for installation and the credential path.
