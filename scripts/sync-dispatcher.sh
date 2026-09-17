#!/usr/bin/env bash
# sync-dispatcher.sh — splice the generated R0 skill dispatcher from the pinned
# marketplace submodule into AGENTS.md between the stable markers.
#
# The marketplace corpus is the single source of the dispatcher: each skill
# entity's `triggers:` list becomes one row, emitted to `marketplace/DISPATCHER.md`
# by `charly marketplace generate` (the same run that regenerates the corpus).
# AGENTS.md owns the surrounding rulebook text; this script owns only the table
# between `<!-- BEGIN GENERATED SKILL DISPATCHER -->` and its END marker, so the
# routing is generated while the mandate stays hand-authored prose.
#
# Idempotent: when the fragment is absent (an older marketplace pin, or a corpus
# generated before the emitter landed) the script is a NO-OP and says so — it
# never blanks the committed table.
#
# `--check` mode (used by the pre-commit gate): exit non-zero when AGENTS.md's
# dispatcher block differs from the pinned fragment, without writing. The absent-
# fragment no-op applies there too.
set -euo pipefail

CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="AGENTS.md"
FRAGMENT="marketplace/DISPATCHER.md"
BEGIN="<!-- BEGIN GENERATED SKILL DISPATCHER -->"
END="<!-- END GENERATED SKILL DISPATCHER -->"

[ -f "$TARGET" ] || { echo "FAIL: $TARGET not found" >&2; exit 1; }

if [ ! -f "$FRAGMENT" ]; then
  echo "sync-dispatcher: $FRAGMENT absent (marketplace pin predates the emitter) — no-op"
  exit 0
fi

[ -f "$FRAGMENT" ] && grep -qF "$BEGIN" "$FRAGMENT" && grep -qF "$END" "$FRAGMENT" \
  || { echo "FAIL: $FRAGMENT lacks the dispatcher markers" >&2; exit 1; }

MODE="$CHECK" python3 - "$TARGET" "$FRAGMENT" "$BEGIN" "$END" <<'PY'
import os
import sys

target, fragment, begin, end = sys.argv[1:5]
check = os.environ["MODE"] == "1"
text = open(target).read()
frag = open(fragment).read()

if begin not in text or end not in text:
    sys.exit(f"FAIL: {target} lacks the dispatcher markers")

start = frag.index(begin)
stop = frag.index(end) + len(end)
block = frag[start:stop]

head, _, rest = text.partition(begin)
_, _, tail = rest.partition(end)
new = head + block + tail

if new == text:
    print("sync-dispatcher: AGENTS.md dispatcher already current")
elif check:
    sys.exit(
        "FAIL: AGENTS.md dispatcher is stale — the pinned marketplace carries a "
        "different table. Run `task skills` and commit the result."
    )
else:
    open(target, "w").write(new)
    print("sync-dispatcher: AGENTS.md dispatcher updated from %s" % fragment)
PY
