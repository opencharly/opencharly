#!/usr/bin/env bash
# check-policy-b.sh — assert policy B: every umbrella distro-* gitlink equals the
# commit charly's own box/* gitlink records (README, AGENTS.md rule 6).
#
# Split out of verify-pins.sh so the pre-commit hook can run it on its own: it is the
# one pinning assertion a PR diff can actually violate, and it costs milliseconds
# (five `git ls-tree` tree-object reads — charly's nested submodules are NOT needed).
# verify-pins.sh calls this script rather than repeating the comparison (R3).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/lib/policy-b.sh
source "$ROOT/scripts/lib/policy-b.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

[ -d charly ] || fail "charly is not checked out — policy B compares against its gitlinks"

for cpath in "${!CHARLY_PINNED[@]}"; do
  upath="${CHARLY_PINNED[$cpath]}"
  cp="$(git -C charly ls-tree HEAD "$cpath" | awk '{print $3}')"
  up="$(git ls-files -s "$upath" | awk '{print $2}')"
  [ -n "$cp" ] || fail "charly has no gitlink at $cpath"
  [ -n "$up" ] || fail "umbrella has no gitlink at $upath"
  [ "$cp" = "$up" ] || fail "policy B: $upath ($up) != charly's $cpath ($cp)"
done

echo "check-policy-b: OK — ${#CHARLY_PINNED[@]} distro pins equal charly's gitlinks"
