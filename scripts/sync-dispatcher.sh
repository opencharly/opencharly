#!/usr/bin/env bash
# sync-dispatcher.sh — splice the generated R0 skill dispatcher from the pinned
# marketplace submodule into AGENTS.md between the stable markers.
#
# The marketplace corpus is the single source of the generated dispatcher: each
# skill entity's `triggers:` list becomes one row, emitted to
# `marketplace/DISPATCHER.md` by `charly marketplace generate`.
#
# AGENTS.md's committed table is HAND-CURATED umbrella prose (a subset of the
# corpus's generated rows) and lives OUTSIDE any generated markers — a generated
# artifact must never be hand-edited inside its markers. When a consumer pins a
# marketplace commit that carries `DISPATCHER.md` AND AGENTS.md carries the
# `BEGIN/END GENERATED SKILL DISPATCHER` markers, `sync` splices the full
# generated fragment in place.
#
# Modes:
#   (default)     splice if both the fragment and the markers are present; else no-op.
#   --check       exit 1 when the markers are present and the fragment differs.
#   --self-test   exercise the splice/compare logic on a temp fixture (runs in the
#                 pre-commit gate, so the splice logic is covered in-tree even while
#                 the pinned marketplace predates the emitter).
set -euo pipefail

MODE="sync"
case "${1:-}" in
  --check) MODE="check" ;;
  --self-test) MODE="self-test" ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="AGENTS.md"
FRAGMENT="marketplace/DISPATCHER.md"
BEGIN="<!-- BEGIN GENERATED SKILL DISPATCHER -->"
END="<!-- END GENERATED SKILL DISPATCHER -->"

# splice <target> <fragment> [check] — replace the marked block in target with the
# fragment's marked block. Prints what it did; exits 1 on a stale check. The one
# implementation both the live path and the self-test call.
splice() {
  local target="$1" fragment="$2" mode="$3"
  [ -f "$target" ] || { echo "FAIL: $target not found" >&2; return 1; }
  grep -qF "$BEGIN" "$fragment" && grep -qF "$END" "$fragment" \
    || { echo "FAIL: $fragment lacks the dispatcher markers" >&2; return 1; }
  MODE="$mode" python3 - "$target" "$fragment" "$BEGIN" "$END" <<'PY'
import os, sys
target, fragment, begin, end = sys.argv[1:5]
check = os.environ["MODE"] == "1"
text = open(target).read(); frag = open(fragment).read()
if begin not in text or end not in text:
    sys.exit(f"FAIL: {target} lacks the dispatcher markers")
b = frag[frag.index(begin):frag.index(end)+len(end)]
head, _, rest = text.partition(begin); _, _, tail = rest.partition(end)
new = head + b + tail
if new == text:
    print("sync-dispatcher: dispatcher already current")
elif check:
    sys.exit("FAIL: dispatcher is stale — the pinned marketplace carries a different table. Run `charly task skills` and commit the result.")
else:
    open(target, "w").write(new); print("sync-dispatcher: dispatcher updated from %s" % fragment)
PY
}

if [ "$MODE" = "self-test" ]; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  printf 'prose\n%s\na\n%s\ntail\n' "$BEGIN" "$END" > "$tmp/t"
  printf '%s\nb\n%s\n' "$BEGIN" "$END" > "$tmp/f"
  splice "$tmp/t" "$tmp/f" 0 >/dev/null || { echo "FAIL: self-test splice failed" >&2; exit 1; }
  grep -q '^b$' "$tmp/t" || { echo "FAIL: self-test did not splice" >&2; exit 1; }
  splice "$tmp/t" "$tmp/f" 1 >/dev/null || { echo "FAIL: self-test steady-state should pass" >&2; exit 1; }
  printf '%s\nc\n%s\n' "$BEGIN" "$END" > "$tmp/f2"
  if splice "$tmp/t" "$tmp/f2" 1 >/dev/null 2>&1; then
    echo "FAIL: self-test stale-check did not fail" >&2; exit 1
  fi
  echo "sync-dispatcher: self-test OK (splice writes, steady-state passes, stale fails)"
  exit 0
fi

if [ ! -f "$FRAGMENT" ]; then
  echo "sync-dispatcher: $FRAGMENT absent (marketplace pin predates the emitter) — no-op"
  exit 0
fi
if ! grep -qF "$BEGIN" "$TARGET"; then
  echo "sync-dispatcher: $TARGET has no generated markers (hand-curated table) — no-op"
  exit 0
fi

if [ "$MODE" = "check" ]; then splice "$TARGET" "$FRAGMENT" 1; else splice "$TARGET" "$FRAGMENT" 0; fi
