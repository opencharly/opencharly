---
description: Start a gitlink sync: fetch, ff main, preview pin bumps, verify
argument-hint: "<none>"
---
# Sync: $@

## Setup

1. `git fetch origin --prune --tags`
2. `git merge --ff-only origin/main`
3. Confirm clean: `git status --porcelain` (empty) and no dirty submodules (`task map`)
4. Load skills matching the change via the AGENTS.md dispatcher + `umbrella_load_skills`
   (pinning policy → `charly-internals:git-workflow`)

## If pins moved upstream

1. `bash scripts/sync-gitlinks.sh` — preview the pin bump (does not commit)
2. Review the proposed gitlinks against policy B (README):
   - `charly` → its own default-branch HEAD
   - `sdk spec docs distro-*` → exactly what charly's own gitlinks pin (plugins moved to the standalone marketplace repo; it follows its own default branch)
   - everything else → its own default-branch HEAD (`av1` for `pixelflux`)
3. Only pin merged refs — never a PR branch
4. `bash scripts/verify-pins.sh` — must pass before committing

## PR

Create a `feat/` branch, commit, push, open a PR with a body per
`.pi/prompts/pr-body.md`. Never push to `main` directly.
