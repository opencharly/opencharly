#!/usr/bin/env bash
# design-check.sh — the full DESIGN.md ↔ DESIGN.cue validation (DESIGN.md Appendix A).
# Runs each control in order and stops at the first failure; it has no logic of its own.
#
#   1 design-cue.sh           the CUE v0.17.1 toolchain (pinned, digest-verified)
#   2 design-consistency.sh   DESIGN.md and DESIGN.cue say the same thing
#   3 design-examples.sh      every example validates; every negative fails for its reason
#   4 design-selftest.sh      checks 2 and 3 each catch every defect planted in their tables
#
# Usage: scripts/design-check.sh [root]
set -euo pipefail

root="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
step() { printf '\n== %s\n' "$*"; }

step "1/5 toolchain"
cue="$(bash "$root/scripts/design-cue.sh")"
"$cue" version | head -1

step "2/5 DESIGN.md ↔ DESIGN.cue"
bash "$root/scripts/design-consistency.sh" "$root"

step "3/5 examples and negative cases"
bash "$root/scripts/design-examples.sh" "$root"

step "4/5 self-test of the consistency check"
bash "$root/scripts/design-selftest.sh" scripts/design-consistency.sh design/consistency/selftest.tsv "$root"

step "5/5 self-test of the example check"
bash "$root/scripts/design-selftest.sh" scripts/design-examples.sh design/example/selftest.tsv "$root"

printf '\ndesign-check: all controls pass\n'
