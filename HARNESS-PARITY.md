# AI/harness parity with `charly/`

This document is the **living parity map** between the umbrella's harness
configuration and `charly/`'s. It is not a plan: it describes the current state
and the two classes of file, so a reader knows what must stay in lockstep and what
is a deliberate fork.

The shared files are diff-checked by `./charly/bin/charly task harness`
(`AGENTS.md` rule 8).

> The map lives here, not in `docs/harness-parity.md`, because `docs/` is a
> submodule (rule 1 — never edit inside a submodule).

## Two classes of harness file

1. **Identical-by-design** — the deterministic mechanics. Byte-identical to
   `charly/`'s and diff-checked by `task harness`; a drift is a failure.
2. **Deliberately-forked** — per-harness settings and workflows that adapt the
   umbrella's reality (root-level gitlink pinning, policy B, no Go at the root).
   Recorded here as fork-by-design; never copied silently.

## Implemented parity map

| Layer | charly/ (source) | umbrella (twin) | Class |
|---|---|---|---|
| Instructions | `AGENTS.md` + `CLAUDE.md` | `AGENTS.md` only — `CLAUDE.md` is a **symlink** to it | same rulebook, one file |
| Skills | the standalone opencharly/marketplace repo | same marketplace (loaded natively, no local links) | shared |
| Gate scripts | `.claude/hooks/{pre-commit-gate.sh,pre-push-gate.sh,gitcmd.py,gate_test.py}` | same paths | **identical** (diff-checked) |
| reasonix settings | `.reasonix/settings.json` | same path | **identical** (diff-checked) |
| Pi settings | `.pi/settings.json` (7 packages, npm-sourced) | `.pi/settings.json` (14 packages, `git:` refs into org-owned `opencharly/pi-*` repos) | fork |
| Pi extensions | `.pi/extensions/*` | `.pi/extensions/{charly-status,github-pr-status,vision}.ts` | fork |
| Claude settings | `.claude/settings.json` (full plugin list; **no `hooks` block**) | `.claude/settings.json` (curated plugin subset; **plus the `PreToolUse`/`Bash` `hooks` block** wiring both gate scripts) | fork |
| Claude workflows | `.claude/workflows/{verify-status,triage-check-failure,audit-deploy-configs,verify-beds}.js` | `.claude/workflows/{verify-status,triage-check-failure}.js` | fork |
| opencode | `opencode.json` + `.opencode/plugins/charly-gates.ts` + `.opencode/agent/pr-validator.md` | `opencode.json` (skills.paths=[marketplace], instructions=[.opencode/instructions.md], references.marketplace, permission allow-list) + `.opencode/instructions.md` (namespaced-ref → bare-name mapping) + `.opencode/plugins/umbrella-gates.ts` + `.opencode/agent/pr-validator.md` | fork |
| reasonix toml | `reasonix.toml` | `reasonix.toml` | fork |

`task harness` diffs exactly the two identical-by-design rows above (the gate
scripts + `.reasonix/settings.json`); see `charly.yml`'s `harness:` task `pairs:`.

## opencode skill addressing

`AGENTS.md` addresses skills by the canonical `/charly-<family>:<skill>`
reference. opencode's `skill` tool accepts only the **bare frontmatter `name`**
(`^[a-z0-9]+(-[a-z0-9]+)*$` — no `:` or `/`). The mapping lives in
`.opencode/instructions.md` (wired via `opencode.json` `instructions[]`), so the
rulebook stays harness-neutral while opencode resolves refs deterministically.
`marketplace` is loaded through `skills.paths` and also exposed as a `references`
entry for the direct-path fallback.

## Constraints

- **Submodule isolation (rules 1–2).** Every file here lands at the umbrella root
  or in a root-level dir (`.pi/`, `.claude/`, `.opencode/`, `.reasonix/`). The
  skills farm (`scripts/link-skills.sh` + `.agents/skills/`) was DELETED in the
  marketplace cutover; each harness loads the standalone marketplace natively.
- **Session worktrees are umbrella-rooted (rule 4).** Sessions edit repositories
  in `<umbrella>/.worktrees/<slug>/<repo>/`; the submodule checkouts stay clean.
  See `AGENTS.md` "The development model".
- **No Go at the root (rule 3).** The umbrella has no `go.work` and runs no Go
  gate; charly's Go gate lives inside `charly/`.
- **R0–R10 substance is charly's.** The umbrella composes via rule 7 ("read the
  subrepo's `AGENTS.md`") and shares the discipline (skills-first, RCA, no
  workarounds, attribution, fresh validator at merge) scoped to gitlink/CI ops.
- **Policy B is the contract.** The validator re-checks the
  `./charly/bin/charly task verify` invariants.

## Deliberately not copied

- The `charly/AGENTS.md` R0–R10 rulebook verbatim — subrepo composition via
  rule 7 gives "the same instructions" inside each repo without duplication.
- The worktree machinery is charly's *technical* concern; the umbrella owns only
  the session/worktree MODEL (rule 4 + "The development model").
