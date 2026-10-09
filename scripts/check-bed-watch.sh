#!/usr/bin/env bash
# check-bed-watch.sh — run R10 check beds and report each one as it completes.
#
# HARNESS-NEUTRAL. No harness knowledge: it emits ONE line per bed on stdout and exits;
# the caller's harness turns each line into a wake (a pi binding sends it as a user turn;
# a shell caller reads it; CI parses it). It is the bed-surface sibling of the GitHub
# watcher family (`marketplace/scripts/{gh_watch,pr_state_watch,pr_watch_many}.sh`), kept
# in the umbrella's own `scripts/` because its subject — the umbrella's `.check/` runs —
# is umbrella tooling. If a non-umbrella consumer ever needs it, it promotes to
# `marketplace/scripts/` at that point (R2: extract on the second occurrence).
#
# WHY IT EXISTS (R1). `charly check run <bed>` is the R10 gate, but it is a FOREGROUND
# command: an agent that runs it blocks its whole turn for the length of a fresh build +
# deploy + live check + teardown (tens of minutes). A harness with no background-completion
# notification therefore cannot "start the bed and act when it finishes" at all. This
# script is the neutral half of that: it RUNS the bed, keeps the full output in a log, and
# emits the honest completion event (the process EXIT CODE — `summary.yml`'s `ok:` alone
# does NOT distinguish a pass from a prereq skip, see `/charly-check:check`).
#
# USAGE
#   check-bed-watch.sh [OPTIONS] <bed> [<bed> ...]
#
# OPTIONS / ENV
#   --charly PATH     the charly binary to drive (default: $CHARLY_BIN, else
#                     <root>/charly/bin/charly — the worktree-local, CalVer-stamped build,
#                     rule 9)
#   --timeout SEC     per-bed deadline (default: 0 = none). On expiry the bed gets SIGTERM
#                     then SIGKILL 30s later, and a `timeout` line is emitted.
#   --log-dir DIR     where per-bed logs go (default: <root>/.check/.watch)
#   -h, --help        print this help and exit 0
#   --self-test       run the pure-helper unit tests and exit (no charly needed)
#
# OUTPUT (stdout; one line per bed, in completion order; the first token is the class)
#   BED <bed> pass    rc=0  ok=<true|false|unknown> total_seconds=<n|?> log=<path> summary=<path|->
#   BED <bed> skip    rc=3  ok=...  (a host-prereq SKIP — NOT a pass, NOT a failure)
#   BED <bed> fail    rc=<n> ok=...  (a real failure)
#   BED <bed> timeout rc=124 ok=...  (the --timeout deadline elapsed)
#
#   `ok` is the NEWEST `<log-dir>/../<bed>/<calver>/summary.yml`'s top-level `ok:`, or
#   `unknown` when no summary exists (the authoritative signal is `rc`).
#
# EXIT  0 when every bed passed; 3 when the only non-zero exits were prereq SKIPs (rc 3);
#       2 when any bed failed; 4 when any bed timed out. A usage error exits 5.
set -uo pipefail

prog="$(basename "$0")"

usage() {
  sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
}

# ── pure helpers (unit-tested by --self-test) ────────────────────────────────

# bed name validity: dot-free (a dot reads as a namespace separator in the deploy tree).
valid_bed() {
  case "${1:-}" in
    "" | *[!A-Za-z0-9._-]* | .* | *.* ) return 1 ;;
    *) return 0 ;;
  esac
}

# classify_exit <rc> -> pass|skip|fail|timeout
classify_exit() {
  case "${1:-}" in
    0) printf 'pass' ;;
    3) printf 'skip' ;;
    124) printf 'timeout' ;;
    *) printf 'fail' ;;
  esac
}

# summary_ok <summary-file> -> true|false|unknown  (tolerant of quoting/comment tails)
summary_ok() {
  local v
  v="$(grep -m1 -E '^[[:space:]]*ok[[:space:]]*:' "$1" 2>/dev/null || true)"
  v="${v#*:}"
  v="${v%%#*}"
  # shellcheck disable=SC2001
  v="$(printf '%s' "$v" | tr -d '[:space:]"'"'"'' | tr '[:upper:]' '[:lower:]')"
  case "$v" in
    true | yes) printf 'true' ;;
    false | no) printf 'false' ;;
    *) printf 'unknown' ;;
  esac
}

# summary_total_seconds <summary-file> -> integer seconds, or "?" when absent/unparseable
summary_total_seconds() {
  local v
  v="$(grep -m1 -E '^[[:space:]]*total_seconds[[:space:]]*:' "$1" 2>/dev/null || true)"
  v="${v#*:}"
  v="${v%%#*}"
  v="$(printf '%s' "$v" | tr -d '[:space:]"' | sed 's/[^0-9].*$//')"
  [ -n "$v" ] && printf '%s' "$v" || printf '?'
}

# ── --self-test ──────────────────────────────────────────────────────────────
self_test() {
  local n=0 bad=0
  check() { # <label> <got> <want>
    n=$((n + 1))
    if [ "$2" = "$3" ]; then
      echo "  PASS  $1"
    else
      echo "  FAIL  $1 (got '$2', want '$3')" >&2
      bad=$((bad + 1))
    fi
  }

  check "valid_bed accepts a normal bed" "$(valid_bed check-mise-ubuntu-2604 && echo y || echo n)" "y"
  check "valid_bed rejects an empty name" "$(valid_bed && echo y || echo n)" "n"
  check "valid_bed rejects a dotted name (deploy-tree keying)" "$(valid_bed check-mise-26.04 && echo y || echo n)" "n"
  check "valid_bed rejects a slash" "$(valid_bed a/b && echo y || echo n)" "n"

  check "classify_exit 0" "$(classify_exit 0)" "pass"
  check "classify_exit 3 is a SKIP, never a pass" "$(classify_exit 3)" "skip"
  check "classify_exit 124 is a timeout" "$(classify_exit 124)" "timeout"
  check "classify_exit 2 is a failure" "$(classify_exit 2)" "fail"

  local d; d="$(mktemp -d)"
  printf 'ok: true\nsteps: 7\ntotal_seconds: 431\n' >"$d/plain.yml"
  printf 'ok: "false"  # a quoted false\n' >"$d/quoted.yml"
  printf 'ok: maybe\n' >"$d/odd.yml"
  printf 'steps: 7\n' >"$d/nokey.yml"
  check "summary_ok true" "$(summary_ok "$d/plain.yml")" "true"
  check "summary_ok quoted false is still false" "$(summary_ok "$d/quoted.yml")" "false"
  check "summary_ok unknown value -> unknown" "$(summary_ok "$d/odd.yml")" "unknown"
  check "summary_ok missing key -> unknown" "$(summary_ok "$d/nokey.yml")" "unknown"
  check "summary_ok missing file -> unknown" "$(summary_ok "$d/absent.yml")" "unknown"
  check "summary_total_seconds parses" "$(summary_total_seconds "$d/plain.yml")" "431"
  check "summary_total_seconds absent -> ?" "$(summary_total_seconds "$d/nokey.yml")" "?"
  rm -rf "$d"

  if [ "$bad" -gt 0 ]; then
    echo "$prog --self-test: FAIL ($bad of $n)" >&2
    return 1
  fi
  echo "$prog --self-test: OK ($n assertions)"
  return 0
}

# ── argument parsing ─────────────────────────────────────────────────────────
CHARLY="${CHARLY_BIN:-}"
TIMEOUT=0
LOG_DIR=""
BEDS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --self-test) self_test; exit $? ;;
    -h | --help) usage; exit 0 ;;
    --charly) CHARLY="${2:?--charly needs a path}"; shift 2 ;;
    --timeout) TIMEOUT="${2:?--timeout needs seconds}"; shift 2 ;;
    --log-dir) LOG_DIR="${2:?--log-dir needs a path}"; shift 2 ;;
    --) shift; while [ $# -gt 0 ]; do BEDS+=("$1"); shift; done ;;
    -*) echo "$prog: unknown option '$1'" >&2; exit 5 ;;
    *) BEDS+=("$1"); shift ;;
  esac
done

case "$TIMEOUT" in
  '' | *[!0-9]*) echo "$prog: --timeout must be an integer >= 0, got '$TIMEOUT'" >&2; exit 5 ;;
esac

[ "${#BEDS[@]}" -gt 0 ] || { echo "$prog: at least one <bed> is required" >&2; usage >&2; exit 5; }
for bed in "${BEDS[@]}"; do
  valid_bed "$bed" || { echo "$prog: invalid bed name '$bed' (dot-free [A-Za-z0-9._-])" >&2; exit 5; }
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
[ -n "$CHARLY" ] || CHARLY="$ROOT/charly/bin/charly"
if [ ! -x "$CHARLY" ]; then
  echo "$prog: charly binary not executable: $CHARLY (build it: charly/scripts/bootstrap-charly.sh)" >&2
  exit 5
fi
: "${LOG_DIR:=$ROOT/.check/.watch}"
mkdir -p "$LOG_DIR" || { echo "$prog: cannot create log dir $LOG_DIR" >&2; exit 5; }

# newest_summary <bed> — the newest .check/<bed>/*/summary.yml, or "" .
newest_summary() {
  local bed="$1" f t best="" best_t=-1
  shopt -s nullglob
  for f in "$ROOT/.check/$bed"/*/summary.yml; do
    t="$(stat -c %Y "$f" 2>/dev/null || echo 0)"
    if [ "$t" -gt "$best_t" ]; then best_t="$t"; best="$f"; fi
  done
  printf '%s' "$best"
}

# ── run each bed, emit its completion line ───────────────────────────────────
worst=0
for bed in "${BEDS[@]}"; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  log="$LOG_DIR/$bed-$stamp-$$.log"
  echo "$prog: running bed '$bed' (log: $log)" >&2

  if [ "$TIMEOUT" -gt 0 ]; then
    timeout --signal=TERM --kill-after=30 "$TIMEOUT" "$CHARLY" check run "$bed" >"$log" 2>&1
    rc=$?
  else
    "$CHARLY" check run "$bed" >"$log" 2>&1
    rc=$?
  fi

  class="$(classify_exit "$rc")"
  summary="$(newest_summary "$bed")"
  sfile="-"
  okv="unknown"
  total="?"
  if [ -n "$summary" ]; then
    sfile="$summary"
    okv="$(summary_ok "$summary")"
    total="$(summary_total_seconds "$summary")"
  fi

  printf 'BED %s %s rc=%s ok=%s total_seconds=%s log=%s summary=%s\n' \
    "$bed" "$class" "$rc" "$okv" "$total" "$log" "$sfile"

  case "$class" in
    timeout) worst=4 ;;
    skip) [ "$worst" -eq 0 ] && worst=3 ;;
    fail) [ "$worst" -lt 4 ] && worst=2 ;;
  esac
done

exit "$worst"
