#!/usr/bin/env bash
# pre-commit-gate.sh — the umbrella's commit gate: its DECISION and its two legs.
#
# WHY A SEPARATE FILE. The hook (hooks/pre-commit) is the umbrella's whole commit
# gate: this file's two legs plus the pure-node gates. The legs need the charly
# binary; the node gates do not. Keeping the legs here means the gate's DECISION can
# be FIRED in isolation — scripts/check-pre-commit-gate.mjs runs THIS file in a
# scratch repository with a recording charly and counts what it invoked — and it
# means the charly-backed pair has exactly ONE owner, so the duplication the old hook
# carried (both legs ran TWICE per commit: once in the binary branch, once under the
# banner) cannot come back (opencharly/opencharly#645).
#
# THE TWO LEGS, AND WHY EACH IS DECIDED THE WAY IT IS.
#
#   1. the self-test — the umbrella's own committed builders' --self-tests
#      (scripts/self-test.sh). It needs no charly binary, no project and no
#      submodule: measured 2026-10-24, all five pass standalone in 3.4 s. It is the
#      CHEAP leg, so it runs on every commit, and it is the assertion that keeps the
#      umbrella's own builders honest.
#
#   2. the pin check — `charly task pin-check`: every pin_map edge equals its
#      source's twin, plus the checkout audit. It needs the charly binary, and it
#      took 29 s measured 2026-10-24 over the umbrella's whole pin set, so it runs
#      ONLY when the staged diff moves a gitlink. That is EXACT, not a heuristic:
#      every value it compares is an INDEX entry, and a checkout's HEAD can only
#      disagree with the index when the diff moved it — so a commit that moves no
#      gitlink cannot violate it. The checkout DRIFT the same verb also sees (a
#      checkout dirty or at another commit, caused by no commit) stays where the
#      rulebook puts it: `charly task verify` (AGENTS.md Part II #1 — a dirty
#      submodule fails verify).
#
# USAGE: pre-commit-gate.sh [index-file]
#   index-file — the index this commit is judged on. Git sets GIT_INDEX_FILE to a
#   TEMPORARY index for a path-limited commit (`git commit <path>`), and that
#   temporary index — not the repository's own — is the set of paths the commit
#   carries. The hook scrubs GIT_INDEX_FILE at its boundary (so the charly verb's
#   nested git calls cannot inherit the umbrella's index), so it captures the path
#   and hands it here. With no argument, the repository's own index is judged.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

INDEX="${1:-}"

# The staged diff, read from the index THIS commit carries.
staged_raw() {
  if [ -n "$INDEX" ]; then
    GIT_INDEX_FILE="$INDEX" git diff --cached --raw
  else
    git diff --cached --raw
  fi
}

# ── leg 1: the self-test ───────────────────────────────────────────────────────────
bash "$ROOT/scripts/self-test.sh"

# ── leg 2: the pin check, decided by the staged diff ──────────────────────────────
# A gitlink change prints its mode in EITHER field: `:160000 160000` (moved),
# `:000000 160000` (a submodule ADDED — a pin bump) and `:160000 000000` (removed).
# Testing only the first field would skip the check on the very commit that
# introduces a pin — so match either.
#
# `grep -c`, not `grep -q`: `-q` exits at the first match and leaves `cut` with a
# broken pipe, which `set -o pipefail` reads as a failure of the whole pipeline.
mode_count="$(staged_raw | cut -d' ' -f1,2 | grep -c '160000' || true)"
if [ "${mode_count:-0}" -eq 0 ]; then
  echo "pre-commit: NOTICE — the pin check is SKIPPED: this commit moves no gitlink."
  echo "  The pin check judges the index's gitlinks and the checkouts a gitlink move"
  echo "  touches, so a commit that moves no gitlink cannot violate it. Run"
  echo "  ./charly/bin/charly task pin-check to run it anyway."
  exit 0
fi

# The binary is THIS tree's own build (R9: binary equals source). The main clone's
# binary is NOT a fallback: it is a DIFFERENT source's build, and in a linked
# worktree it cannot load the project at all (opencharly/opencharly#602) — the
# mechanism that killed every docs-only worktree commit.
CHARLY="$ROOT/charly/bin/charly"
if [ ! -x "$CHARLY" ]; then
  echo "pre-commit: no charly binary in THIS tree, and this commit moves a gitlink, so" >&2
  echo "  the pin check that judges exactly that cannot run." >&2
  echo "  fix: ./charly/scripts/bootstrap-charly.sh    (in THIS tree: $ROOT)" >&2
  exit 1
fi

CHARLY_PLUGIN_ONLY=1 "$CHARLY" task pin-check
