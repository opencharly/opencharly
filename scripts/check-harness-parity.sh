#!/usr/bin/env bash
# check-harness-parity.sh — keep the umbrella's harness config in sync with
# charly's (AGENTS.md rule 8). Fails when a file that is identical BY DESIGN
# drifts from its charly/ twin.
#
# Files in this list are mechanically shared (the gate scripts only parse git
# command strings, so the umbrella runs the exact same code as charly). Files
# NOT in this list are umbrella-specific forks (extensions, prompts, tomls)
# and are reviewed by hand, not diffed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { echo "FAIL: $*" >&2; exit 1; }

# <umbrella path> <charly path>
SHARED=(
  ".claude/hooks/pre-commit-gate.sh charly/.claude/hooks/pre-commit-gate.sh"
  ".claude/hooks/pre-push-gate.sh charly/.claude/hooks/pre-push-gate.sh"
  ".claude/hooks/gitcmd.py charly/.claude/hooks/gitcmd.py"
  ".claude/hooks/gate_test.py charly/.claude/hooks/gate_test.py"
  ".reasonix/settings.json charly/.reasonix/settings.json"
)

for entry in "${SHARED[@]}"; do
  umb="${entry%% *}"; ch="${entry#* }"
  [ -f "$ch" ] || fail "charly twin missing: $ch (harness parity table needs updating)"
  [ -f "$umb" ] || fail "umbrella file missing: $umb"
  if ! diff -q "$umb" "$ch" >/dev/null; then
    fail "$umb drifted from $ch — they are identical by design (HARNESS-PARITY.md)"
  fi
done

echo "check-harness-parity: OK — ${#SHARED[@]} shared harness files identical to charly/"
