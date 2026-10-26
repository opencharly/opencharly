#!/usr/bin/env bash
# design-check.sh — the full DESIGN.md ↔ DESIGN.cue validation (DESIGN.md Appendix A).
# Runs each control in order and stops at the first failure; it has no logic of its own.
#
#   1 design-cue.sh           the CUE v0.18.0-rc.1 toolchain (pinned, digest-verified)
#   2 design-consistency.sh   DESIGN.md and DESIGN.cue say the same thing
#   3 design-examples.sh      every example validates; every negative fails for its reason
#
# Usage: bash scripts/design-check.sh   (run in the repository root; no check writes to it)
set -euo pipefail

root="$PWD" # the repository root it runs in
step() { printf '\n== %s\n' "$*"; }

step "1/3 toolchain"
cue="$(bash "$root/scripts/design-cue.sh")"
"$cue" version | sed -n 1p

step "2/3 DESIGN.md ↔ DESIGN.cue"
bash "$root/scripts/design-consistency.sh" "$root"

step "3/3 examples and negative cases"
bash "$root/scripts/design-examples.sh" "$root"

printf '\ndesign-check: all controls pass\n'
