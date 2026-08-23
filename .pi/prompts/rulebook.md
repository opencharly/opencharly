---
description: Quick reference: umbrella rules, pinning policy, attribution tiers
---
## Umbrella Rulebook Quick Reference

### Rulebook (the 8 rules)
1. Never edit inside a submodule — change lands via PR to the owning repo
2. Submodule git runs through `git -C <absolute-path>` from the umbrella root
3. No nested `go.work` — all Go builds happen inside `charly/`
4. No worktrees inside submodules (charly's `.claude/worktrees/` pattern is not for here)
5. Pin only merged refs — never a PR branch
6. Policy B: `distro-*` == charly's own gitlinks; `sdk`/`spec`/`docs`/`marketplace` follow their own default-branch HEAD (a changed pin is a sync, not a hand-pin)
7. Read the subrepo's own AGENTS.md/CLAUDE.md before touching it
8. Harness config mirrors charly's — `scripts/check-harness-parity.sh` enforces

### Engineering rules
- R0 skills first (umbrella_load_skills) — R1 RCA — R3 no duplication — R4 no workarounds
- R5 delete legacy — R6 git safety — R7 prove the gate — R10 fresh proof

### Pinning policy (README)
- `charly` → its default-branch HEAD
- `sdk spec docs distro-*` → exactly charly's gitlinks (plugins moved to the standalone marketplace repo)
- `charly-* pkg-* plugin-generate-packages pi-review-action pixelflux` → own default HEAD
