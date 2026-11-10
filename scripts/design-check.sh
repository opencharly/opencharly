#!/usr/bin/env bash
# design-check.sh — the full DESIGN.md ↔ DESIGN.cue validation (DESIGN.md Appendix A).
# Runs each control in order and stops at the first failure; it has no logic of its own.
#
#   1 design-cue.sh           the CUE v0.18.0-rc.1 toolchain (pinned, digest-verified)
#   2 design-consistency.sh   DESIGN.md and DESIGN.cue say the same thing
#   3 design-examples.sh      every example validates; every negative fails for its reason
#   4 design-ledger.sh        every parity capability has a ledger row that lands whole (A.8)
#   5 design-cite.sh          every citation into a pinned module resolves at the pin, and still
#                             holds the construct and the bytes its row was affirmed against (A.13)
#   6 design-dpat.sh          every pinned plugin CUE module keeps the §10.1 patterns (A.11)
#   7 design-pintag.sh        every pin is at a tag or one CHANGELOG commit above one, or its
#                             untagged-ness is recorded and explained (A.12)
#
# Usage: bash scripts/design-check.sh   (run in the repository root; no check writes to it)
set -euo pipefail

root="$PWD" # the repository root it runs in
step() { printf '\n== %s\n' "$*"; }

step "1/7 toolchain"
cue="$(bash "$root/scripts/design-cue.sh")"
"$cue" version | sed -n 1p

step "2/7 DESIGN.md ↔ DESIGN.cue"
bash "$root/scripts/design-consistency.sh" "$root"

step "3/7 examples and negative cases"
bash "$root/scripts/design-examples.sh" "$root"

step "4/7 the capability ledger"
bash "$root/scripts/design-ledger.sh"

step "5/7 every citation into a pinned module, at the pin"
bash "$root/scripts/design-cite.sh" "$root"

step "6/7 the schema patterns of every pinned plugin module"
bash "$root/scripts/design-dpat.sh" "$root"

step "7/7 every pin's relation to a release tag"
bash "$root/scripts/design-pintag.sh" "$root"

printf '\ndesign-check: all controls pass\n'
