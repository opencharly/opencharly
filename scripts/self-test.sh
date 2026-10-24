#!/usr/bin/env bash
# self-test.sh — the umbrella's OWN committed builders' self-tests, in ONE place.
#
# WHY THIS FILE EXISTS. The five builders below are plain shell, and their --self-test
# runs need no charly binary, no project and no submodule: measured on a light session
# worktree, all five pass standalone in 3.4 s (2026-10-24). The set used to exist only
# as the TEXT of the `self-test` task in charly.yml, so the commit gate could reach it
# only through `charly task self-test` — which needs the binary and a loadable
# project, and therefore could not run at all in a fresh session worktree (AGENTS.md
# Part II #2 mandates one for every session). The consequence was measured: a fresh
# worktree could not commit (opencharly/opencharly#498).
#
# ONE OWNER (R2). The task (charly.yml) and the commit gate
# (hooks/pre-commit-gate.sh) both call THIS file, so the set of judged builders is
# declared once and cannot drift between the two callers.
#
# The set is a list, not five hard-coded lines, so a builder is added or removed in
# one place — and the runner names each builder as it runs it, so a pasted transcript
# says WHICH builder failed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUILDERS=(
  scripts/sync-pin-evidence.sh
  scripts/sync-pr-body.sh
  scripts/sync-dispatcher.sh
  scripts/init-submodules.sh
  scripts/measure-clone.sh
)

for builder in "${BUILDERS[@]}"; do
  echo "self-test: $builder --self-test"
  bash "$builder" --self-test
done
