# Plan — AI/harness parity with `charly/`

Goal: the umbrella repo gets the same AI and harness configuration and
instructions as `charly/` — same harnesses (pi, Claude Code, opencode,
reasonix), same gate discipline, same instruction rigor — adapted to the
umbrella's reality (gitlink pinning, policy B, no worktrees, no Go at the
root).

## Parity map (source → target)

| Layer | charly/ (source) | umbrella (target) |
|---|---|---|
| Instructions | `AGENTS.md` (32KB, R0–R10 rulebook) + `CLAUDE.md` mirror | `AGENTS.md` (1.6KB, 7 rules) — expand, **not verbatim copy** |
| Skills | `.agents/skills/` — ~140 symlinks into `plugins/` submodule + `.charly-profile.json` | none |
| Pi | `.pi/settings.json` (6 packages + gates extension), `extensions/charly-gates.ts` (477L), 6 prompts, `subagents/charly-agents.json`, `README.md` | none |
| Claude Code | `.claude/settings.json`, `.claude/hooks/` (2 gate `.sh` + `gitcmd.py` + tests), `.claude/workflows/` | none |
| opencode | `opencode.json` + `.opencode/plugin/charly-gates.ts` | none |
| reasonix/kimi | `reasonix.toml`, `.reasonix/settings.json` | none |

Key enabler: the umbrella's `plugins/` submodule is pinned (policy B) to the
same commit charly's own gitlink points at, so the exact skill symlink
topology from charly is reproducible here. The gate scripts are
mechanically repo-agnostic (they only parse `git commit`/`git push`
command strings).

## Constraints

- **Submodule isolation (AGENTS.md rules 1–2):** every new file lands at the
  umbrella root or in new root-level dirs (`.pi/`, `.claude/`, `.agents/`).
  Symlinks into `plugins/` are read-only references — allowed. Nothing is
  ever written inside a submodule.
- **No worktrees (rule 4):** charly's worktree flow is banned here — no
  `charly_worktree_create` tool, no cutover prompt. The umbrella equivalent
  is "sync + verify + PR".
- **No Go at the root (rule 3):** drop charly's golangci-lint/alias gates
  (they self-skip anyway); keep the git-mechanics gates.
- **R0–R10 substance is charly's:** the umbrella composes via rule 7 ("read
  the subrepo's AGENTS.md"). The umbrella rulebook shares the *discipline*
  (skills-first, RCA, no workarounds, attribution, fresh-validator at
  merge) scoped to gitlink/CI ops.
- **Policy B is the contract:** the validator subagent re-checks
  `scripts/verify-pins.sh` invariants, exactly as charly's re-checks its
  beds.

## Phases

### Phase 1 — Instructions (root, committed)

1. Rewrite `AGENTS.md`: keep the 7 rules verbatim as the top "rulebook",
   then add the shared-doctrine sections mirroring charly's structure:
   Skills-First (R0), skill dispatcher table, hard-sync-not-cutover,
   post-execution policies, acceptance checklist, hooks doctrine, AI
   attribution, PR-body contract. ~3–4KB, not 32KB — umbrella scope is
   smaller and pi re-injects context.
2. Add `CLAUDE.md` as the mirrored copy (per charly convention of keeping
   both in sync) — or make AGENTS.md canonical and CLAUDE.md a pointer.
   Pick one; decision recorded.
3. Add rule 8 to `AGENTS.md`: "Harness config lives at the root —
   `.pi/ .claude/ .agents/ opencode.json reasonix.toml` — mirror charly's,
   never fork them silently."

### Phase 2 — Skills (root, committed)

4. Create `.agents/plugins/marketplace.json` + `.agents/skills/` symlinks
   into `plugins/` (same relative targets as charly:
   `../../plugins/<plugin>/skills/<skill>`), driven by a new
   `scripts/link-skills.sh` so it is reproducible, and extend
   `verify-pins.sh` with a dangling-link check.
5. Recommend **subset first** (`internals:git-workflow, agents,
   root-cause-analyzer, strict-policy` + `automation:*` — the ops the
   umbrella actually runs), with full parity as a flag. The other ~120
   skills call the `charly` CLI and are only executable inside `charly/`.
6. `.charly-profile.json` — generate the umbrella version (it is a file,
   not a symlink; regenerate from plugin metadata, don't copy charly's).

### Phase 3 — Pi harness (root, committed)

7. `.pi/settings.json`: identical package pin list (pi-mcp-adapter,
   pi-subagents, plan-mode, rpiv-todo, pi-memory, pi-ollama-cloud) +
   `./extensions/umbrella-gates.ts`.
8. `.pi/extensions/umbrella-gates.ts`: fork `charly-gates.ts` — keep
   tool_call interception running the gate scripts; drop
   `charly_worktree_create/remove`; keep the before-agent-start rules
   injection, swapped to umbrella rules; optionally add an
   `umbrella_sync_status` (`task map`) tool.
9. `.pi/prompts/`: `cutover.md` → `sync.md` (fetch, `task sync`,
   `task verify`, PR body, no worktrees); `rulebook.md`, `skill.md`,
   `subagent-review.md`, `subagent-verify.md` (repoint verify at
   `scripts/verify-pins.sh`), `pr-body.md` (kept nearly as-is).
10. `.pi/subagents/umbrella-agents.json`: reviewer/worker/validator with
    umbrella policies (policy-B equality, clean checkouts, dangling-pin
    checks, relevant R1–R10 subset).
11. `.pi/README.md`: adapted copy of charly's (packages table, trust note,
    security note).

### Phase 4 — Claude Code (root)

12. `.claude/settings.json`: copy, with `extraKnownMarketplaces` pointing at
    `./plugins` (plugins submodule present); pare enabledPlugins to the
    Phase-2 subset.
13. `.claude/hooks/{pre-commit-gate.sh, pre-push-gate.sh, gitcmd.py,
    gate_test.py}`: copy as-is (mechanics-agnostic); wire gate_test.py into
    `scripts/`.
14. `.claude/workflows/`: adapt `verify-status.js`/`triage-check-failure.js`
    to umbrella CI (`verify.yml`, `sync.yml`).

### Phase 5 — opencode + reasonix

15. `opencode.json`: copy; permission allow-list swapped to `task sync`,
    `task verify`, `git -C …`, `gh pr merge`.
16. `.opencode/plugin/umbrella-gates.ts`: copy of the adapted gates.
17. `reasonix.toml`: adapted permissions (same as #15; keep `bash = "off"`
    rationale for submodule git ops).

### Phase 6 — Drift control + verification

18. Add a "harness parity" section to `README.md` and a
    `docs/harness-parity.md` table mapping each charly/ file to its
    umbrella twin, plus `scripts/check-harness-parity.sh` that diffs the
    shared gate scripts against charly/ and fails on drift (cheap: the gate
    scripts are identical by design).
19. Verify: `task verify` still green; fresh `pi` session at the umbrella
    root → packages install, gates load, skills discovered, sync flow works
    end-to-end (dry `task sync` on a fake pin bump).
20. One PR with all of it, so CI (`verify`) approves it in one shot.

## Deliberately not copied

- Worktree machinery (banned by rule 4).
- `.pi/prompts/cutover.md` (replaced by `sync.md`).
- The 32KB rulebook verbatim — subrepo AGENTS.md composition via rule 7 is
  the mechanism that gives "the same instructions" inside each repo without
  duplication.
