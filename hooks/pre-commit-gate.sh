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
#      ONLY when the commit changes one of the pin contract's COMMIT-CARRIED
#      INPUTS.
#
#      THAT SET IS DERIVED FROM WHAT THE VERB READS (opencharly/opencharly#661),
#      not from what a commit "can carry" by judgement. `charly task pin-check`
#      composes `verb:git-submodules` in `mode: verify`, and that verb reads:
#
#        1. the INDEX's gitlinks — the edge's `got` side.
#        2. the MANIFEST — charly.yml's `pins:` block. `pin_map` and
#           `pinned_from` DECLARE the edge the check compares, so a commit that
#           edits the declaration changes what the check compares.
#        3. the DECLARED PATH SET — .gitmodules. The checkout audit runs over
#           exactly the paths it declares.
#
#      That set is DEFINED ONCE — scripts/pin-contract-inputs.sh — and this file
#      only MEASURES it: which of the staged paths are gitlinks, and which are
#      declaration files. The wave body's coverage decision (scripts/sync-pin-evidence.sh)
#      reads the SAME definition, because it asks the SAME question — can this diff
#      violate the pin check? — and a second, narrower copy of that question is how
#      the shipped class came to be wrong in the first place.
#
#      A commit that changes NONE of them leaves every value the check reads as it
#      was, so it cannot violate the check. The class is a deliberate SUPERSET of
#      the violation set — a charly.yml edit that touches no pin block still fires
#      the check, and costs 29 s — because the check reads the whole manifest, so
#      a change to it can change what the check compares, and R3 forbids
#      cleverness in place of a rule.
#
#      The edge's `want` side is read from the `pinned_from` CHECKOUT's HEAD, and
#      the checkout state is read from the working tree. Neither is commit-carried:
#      a checkout that is dirty, or at another commit, is drift caused by NO
#      commit, and it stays where the rulebook puts it — `charly task verify`
#      (AGENTS.md Part II #1 — a dirty submodule fails verify), which composes the
#      SAME verb.
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

# The pin contract's commit-carried inputs: ONE definition, shared with the wave
# body's coverage decision (scripts/pin-contract-inputs.sh). It is sourced, not
# executed — and a missing file must fail LOUD, because a gate that could not read
# the rule would decide "nothing changed" and skip the check.
if [ ! -f "$ROOT/scripts/pin-contract-inputs.sh" ]; then
  echo "pre-commit: no scripts/pin-contract-inputs.sh in THIS tree, and the pin check's" >&2
  echo "  change class is DEFINED there, so this gate cannot decide whether the check" >&2
  echo "  runs — and a gate that cannot decide must not skip." >&2
  echo "  fix: restore the file (git -C \"$ROOT\" status says what is missing)" >&2
  exit 1
fi
. "$ROOT/scripts/pin-contract-inputs.sh"

# The staged diff, read from the index THIS commit carries.
staged_raw() {
  if [ -n "$INDEX" ]; then
    GIT_INDEX_FILE="$INDEX" git diff --cached --raw
  else
    git diff --cached --raw
  fi
}

# The staged PATHS, from the same index.
staged_names() {
  if [ -n "$INDEX" ]; then
    GIT_INDEX_FILE="$INDEX" git diff --cached --name-only
  else
    git diff --cached --name-only
  fi
}

# ── leg 1: the self-test ───────────────────────────────────────────────────────────
bash "$ROOT/scripts/self-test.sh"

# ── leg 2: the pin check, decided by the change class ──────────────────────────────
# The staged diff is captured ONCE, and a git failure here is LOUD: a gate that
# could not read the diff must not decide "nothing changed" and skip the check.
STAGED_RAW="$(staged_raw)"
STAGED_NAMES="$(staged_names)"

# A gitlink change prints its mode in EITHER field: `:160000 160000` (moved),
# `:000000 160000` (a submodule ADDED — a pin bump) and `:160000 000000` (removed).
# Testing only the first field would skip the check on the very commit that
# introduces a pin — so match either.
#
# What the class needs is the PATHS of those entries, not their count: the RULE
# that decides is shared (scripts/pin-contract-inputs.sh), so this file only has to
# MEASURE — it must never re-state what the class is.
#
# `awk`, not `grep -c`: the path is the field after the TAB, so a path carrying a
# space survives; and `grep -q` exits at the first match and leaves `cut` with a
# broken pipe, which `set -o pipefail` reads as a failure of the whole pipeline.
STAGED_GITLINK_PATHS="$(printf '%s\n' "$STAGED_RAW" | awk 'BEGIN{FS="\t"} {split($1,m," "); if (m[1] ~ /160000/ || m[2] ~ /160000/) print $2}')"

if ! pin_contract_touches_input "$STAGED_NAMES" "$STAGED_GITLINK_PATHS"; then
  echo "pre-commit: NOTICE — the pin check is SKIPPED: this commit changes none of the pin contract's inputs."
  echo "  The pin check reads the index's gitlinks, the manifest that declares the pin"
  echo "  contract (charly.yml) and the declared path set (.gitmodules); a commit that"
  echo "  changes none of them cannot violate it. The checkout drift it also sees is"
  echo "  caused by no commit, and stays with 'charly task verify'. Run"
  echo "  ./charly/bin/charly task pin-check to run it anyway."
  exit 0
fi

echo "pre-commit: the pin check RUNS: this commit changes the pin contract's inputs."

# The binary is THIS tree's own build (R9: binary equals source). The main clone's
# binary is NOT a fallback: it is a DIFFERENT source's build, and in a linked
# worktree it cannot load the project at all (opencharly/opencharly#602) — the
# mechanism that killed every docs-only worktree commit.
CHARLY="$ROOT/charly/bin/charly"
if [ ! -x "$CHARLY" ]; then
  echo "pre-commit: no charly binary in THIS tree, and this commit changes the pin contract's inputs, so" >&2
  echo "  the pin check that judges exactly that cannot run." >&2
  echo "  fix: ./charly/scripts/bootstrap-charly.sh    (in THIS tree: $ROOT)" >&2
  exit 1
fi

CHARLY_PLUGIN_ONLY=1 "$CHARLY" task pin-check
