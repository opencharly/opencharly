---
description: Generate a structured PR body with How-tested, Rule-compliance, Attribution
---
# PR Body: $@

## Summary

## How tested

### 1. Pinning gate (R7)

`bash scripts/verify-pins.sh` — paste full output.

### 2. Submodule cleanliness

`task map` / `git submodule status` — no dirty submodules.

## Rulebook compliance

| Rule | Status | Evidence |
|---|---|---|
| 1. No edits inside submodules | | |
| 2. Submodule git via `git -C` | | |
| 5. Only merged refs pinned | | |
| 6. Policy B equality | | |
| 7. Subrepo rulebooks read | | |

## Change Classification

- Change class: chore / fix / docs / feature
- Verification gate: `verify` (CI) + `validate` (pr-validator AI gate)
- Attribution tier: (see AGENTS.md)

## CHANGELOG

Add `CHANGELOG/<calver>.md` (placeholder, e.g. `CHANGELOG/2026.234.0000.md`) —
the pr-validator finalizes it to the merge-time CalVer (B19).

*Assisted-by: <Harness> <Provider Full Model Name> (<confidence>)*
