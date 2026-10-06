# Pi harness-config catch-up — ledger

Durable ledger for catching the umbrella pi harness config (`.pi/`) up to what the rulebook
requires and to the other umbrella harness configs. Rule 5: harness config lives at the
umbrella root. Keep this current as items land; reconcile, never reset.

## Why this exists (R1)

Commit `b607ed3` (#386, tag `v2026.279.0757`) dropped `.pi/` entirely, on the stated premise
that "pi should be a system-level harness, not a per-repo surface". That premise contradicts
the rulebook it cites:

- `AGENTS.md` Part II rule 5 — "Harness config lives only in **this repo's root** and nowhere
  else" — and `/charly-internals:agents` lists `.pi/` among the umbrella-root harness config
  (`.claude/`, `.opencode/`, `.codex/`, `.pi/`, `.reasonix/`, `opencode.json`).
- `README.md` likewise says harness config "lives at this umbrella root and **only** here".

**Missed control.** #386 removed the pi arm from `scripts/check-harness-config.mjs`, so
nothing asserted `.pi/`'s presence afterward. **Blast radius.** A pi session rooted at the
umbrella lost the git gates, the skill corpus, the PR/validator status tool, SOUL injection,
and the skill loader. **Root fix.** Recreate `.pi/` at the umbrella root and restore the pi
arm of the harness-config gate (this change).

## Recreated (the rule-following minimum)

| Surface | Why the rules require it |
|---|---|
| `.pi/settings.json` | Packages: the marketplace skill corpus (R0), the MCP adapter (DeepWiki), subagents (Agents/Workflows), the todo ledger (rules 9/11). |
| `.pi/extensions/charly-gates.ts` | The git gates (`.claude/hooks/pre-commit-gate.sh` + `pre-push-gate.sh`) — hooks doctrine; SOUL + condensed-rule injection; `charly_load_skills` (R0); worktree tools (rule 2). |
| `.pi/extensions/github-pr-status.ts` | `gh_pr_status check\|watch` — the validator verdict is otherwise unreachable from a pi session (git-workflow). |
| `.pi/APPEND_SYSTEM.md` | The pi↔rulebook binding (skill addressing, gates, watcher discipline, coordination, plan discipline). |
| `.pi/README.md` | Signpost. |

## Restored supporting gates (removed by #386)

- `scripts/check-pi-gates.mjs` — the gate extension's regression gate.
- `charly.yml` verify step `check-pi-gates`.
- `hooks/pre-commit` — the `check-pi-gates.mjs` invocation.
- `scripts/check-harness-config.mjs` — the pi arm (the `.mcp.json`-covers-pi note + the SOUL
  surface row); `scripts/check-root-refs.mjs` — the `.pi/extensions/charly-gates.ts` surface.
- `.gitignore` — the `.pi` ignore block.

## Deliberately NOT recreated (not needed to follow the rules)

`extensions/charly-status.ts`, `extensions/vision.ts`, `.pi/lsp.json`, `.pi/fabric.json`,
`.pi/vision.json`, `.pi/claude-plugins.json`, `.pi/agents/*.md`, and the `omarchy-agents` /
`pi-forks` `charly task` verbs. Native skill discovery plus `charly_load_skills` covers R0;
`charly status` via the CLI covers bed status; the harness-independent shell watcher family
(`marketplace/scripts/{pr_state_watch,pr_watch_many,gh_watch}.sh`) covers GitHub comment and
PR watching without a bespoke extension.

## R1 findings

1. **`charly_load_skills` skill path — FIXED.** The harness-absorb commit `f092c21`
   re-pointed the loader at the deleted `.agents/skills/` farm, undoing the 2026.240.1034
   marketplace fix. It now resolves `marketplace/<family>/skills/<skill>/SKILL.md`.
2. **`charly_load_skills` dispatcher source — FIXED (#379).** It parsed
   `<!-- BEGIN GENERATED SKILL DISPATCHER -->` markers out of `AGENTS.md`, which has no
   markers (they live in the generated `marketplace/DISPATCHER.md`). Per #379's resolved
   guidance it now parses the curated `### Skill Dispatcher` table under `## R0. Skills
   first` with the markers treated as **optional**, skips the section's opening prose
   paragraph to the first table row, and splits multi-skill cells on `,`.
3. **Stale condensed rules in the injected block — FIXED.** `buildRulesBlock()` printed an
   `R2a` clause and a PR-body section older than the current rulebook. The R2a clause is now
   the neutral "Delegate Heavy Work" (naming no dropped tool), and the PR-body section names
   match `pr_body_lint.py` (`## Summary`, `## How tested`, `## Rulebook compliance`,
   `## Change classification`, footer last).
4. **`.mcp.json` is not a native pi location — VERIFIED.** pi reads `.pi/mcp.json`; the
   project-root `.mcp.json` reaches pi only through `pi-mcp-adapter` (kept in `packages`).

## Watch discipline (the GitHub ask)

- Arm ONE watcher per scope; never hand-roll a poll loop; re-arm after every wake.
- `pr_state_watch.sh <owner>/<repo> <pr>` — a PR's terminal state; `gh_watch.sh` — per-item
  comments/verdicts/merged/closed/stall; `pr_watch_many.sh` — a cross-repo PR batch.
- Poll floor 60s; prefer terminal events plus the default `stall` alarm over per-comment events.
- `gh_pr_status watch` — a single PR's validator verdict, in a background subagent.

## Status

- [x] Recreate `.pi/`; restore the pi arm of the harness-config gate and the supporting gates.
- [x] Fix the `charly_load_skills` path + dispatcher source (#379).
- [x] Align the injected condensed rules with the current rulebook.
- [ ] Validate in a trusted pi session (`pi --approve`) that the extensions load and
      `gh_pr_status` answers; run `node scripts/check-pi-gates.mjs` +
      `node scripts/check-harness-config.mjs` on the final tree.
- [ ] Land as a T4 change with a maintainer-account sign-off (it reverses #386).
