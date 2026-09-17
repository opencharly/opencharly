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
- `/charly-core:charly-status` → `skill({ name: "charly-status" })`

If a skill is not exposed as a tool entry, read its procedure directly at
`marketplace/<family>/skills/<skill>/SKILL.md` (the same fallback every harness
uses). Never proceed without loading the procedure — R0 is mandatory.

## Gate hooks

`.opencode/plugin/umbrella-gates.ts` runs the root gate scripts
(`.claude/hooks/pre-commit-gate.sh`, `pre-push-gate.sh`) before `git commit` /
`git push` bash calls and denies the call when a gate blocks.
