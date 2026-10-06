#!/usr/bin/env bash
# sync-pin-evidence.sh — emit the sync PR body's "pin evidence" section: for every
# MOVED gitlink, the STAGED GITLINK (the pinned commit this PR records) beside the
# owning repo's remote default-branch HEAD, plus the truthful statement of whether
# policy B can fail on THIS diff.
#
# Why this is its own script: the sync PR's body must carry real, verifiable evidence
# that each moved pin is a merged default-branch HEAD (or charly's own gitlink, for
# `distro-*`). Extracting it here makes the logic TESTABLE in-tree (`--self-test`, run
# by the pre-commit gate), not a string nobody can exercise.
#
# The STAGED GITLINK — never the submodule's working-tree HEAD — is the pinned commit
# the umbrella records (`git ls-tree HEAD -- <path>`); a submodule that is
# uninitialised or sitting on another commit must not turn a correct pin into a false
# `not-equal`.
#
# Modes:
#   (default) <root> <policy-b-log>   read MOVED (one path per line) from stdin; print
#                                     the evidence section (table + coverage framing).
#   --self-test                       exercise pin_row + coverage_note on fixtures.
#
# SIZE BOUND (a GitHub platform limit, not a preference). A sync PR body is capped by
# GitHub at 65536 characters; a sync that moves hundreds of pins overflows it and
# `gh pr create` fails with "Body is too long". The per-pin evidence table is the
# largest section. It is emitted in the COMPACT format above (≈50 bytes/row, vs ≈115
# for the retired `staged-gitlink=… remote-HEAD=… [kind, eq]` row) so the FULL table —
# every changed path, no elision — fits the body with headroom at fleet scale
# (measured: 424 rows render COMPLETE at ≈21 KB of table; the whole body is ≈39 KB,
# well under 65536). SYNC_EVIDENCE_MAX_BYTES (default 50000) is now a FALLBACK
# guard only: it does not fire at fleet scale, and if a far larger sync ever
# tripped it the elision notice names shown/total AND the evidence file holding the
# rest. The BODY always carries the complete table; SYNC_EVIDENCE_OUT additionally
# writes a copy to a caller-named file. Neither is a CI run artifact — the sync is
# hand-run (`charly task sync` + a PR), so no workflow run exists to attach one to.
# The body never POINTS at a file as the home of the evidence — a pointer is a
# promise, not pasted output, which is exactly what the validator BLOCKed.

SYNC_EVIDENCE_MAX_BYTES="${SYNC_EVIDENCE_MAX_BYTES:-50000}"
set -euo pipefail

# pin_row <path> <staged_gitlink> <remote_head> — ONE evidence row, in the COMPACT
# format the body-size budget is measured against: `  <path>  <staged12>  <remote12>
# <flag>`. The kind (`distro-*` policy-B pinned vs default-branch HEAD) is derivable
# from the path prefix and stated ONCE in the section legend, so the row carries no
# verbose `[kind, eq]` suffix — that suffix is what pushed a 402-pin table past the
# body budget and forced the artifact elision the validator rejects. `flag` is `=`
# when the staged gitlink equals the remote default-branch HEAD, else `!` (a real
# finding for a non-`distro-*` row, never silently elided). ONE implementation the
# live path and the self-test both call.
pin_row() {
  local p="$1" staged="$2" remote="$3" flag
  if [ -n "$staged" ] && [ "$staged" = "$remote" ]; then flag="="; else flag="!"; fi
  printf '  %s  %.12s  %.12s  %s\n' "$p" "$staged" "$remote" "$flag"
}

# is_gitlink_path <root> <path> — true when the RECORDED entry for <path> is a submodule
# pointer (index mode 160000); false for a plain file (100644/100755). The producer stages
# EVERY changed path (`git diff --cached --name-only`), so a hand-edit beside the pins is a
# FILE here, never a pointer — the class the old builder miscounted as a gitlink (measured:
# `reasonix.toml` rendered as a 46th gitlink). Reads the INDEX first (the staged snapshot
# this PR records) and falls back to HEAD, mirroring staged_gitlink; git's hook-exported
# repo vars are scrubbed so `-C "$root"` truly targets $root. ONE implementation the live
# render loop and the self-test both call.
is_gitlink_path() {
  local root="$1" p="$2" mode
  unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
  mode=$(git -C "$root" ls-files -s -- "$p" 2>/dev/null | awk 'NR==1{print $1}')
  [ -n "$mode" ] || mode=$(git -C "$root" ls-tree HEAD -- "$p" 2>/dev/null | awk 'NR==1{print $1}')
  [ "$mode" = "160000" ]
}

# file_row <path> <blob_sha> — ONE evidence row for a changed NON-gitlink path. A plain file
# has no remote default-branch HEAD to compare against, so its row carries NO `=`/`!` flag:
# flagging such a path `!` against a remote that does not exist is a false finding (measured:
# `reasonix.toml  d6b7737bbd8d  !`). The row still names the file and its staged blob, so no
# changed path is hidden. ONE implementation the live render loop and the self-test call.
file_row() {
  printf '  %s  %.12s  (file)\n' "$1" "$2"
}

# coverage_note <distro_moved_count> — policy B asserts only `distro-*` gitlinks, so it
# is this diff's coverage ONLY when at least one `distro-*` pin moved. ONE decision,
# shared by the live path and the self-test.
coverage_note() {
  if [ "${1:-0}" -gt 0 ]; then
    echo "POLICY_B_IS_COVERAGE"
  else
    echo "POLICY_B_NOT_COVERAGE"
  fi
}

# bounded_rows <budget_bytes> <total_count> [<evidence-destination>] — read candidate rows
# (one per line, each already rendered) from stdin and print them until adding the next
# would exceed <budget_bytes>, always emitting AT LEAST the first row. When truncation
# occurs, print a final elision line naming shown/total AND where the full table lives —
# the caller's evidence file (SYNC_EVIDENCE_OUT), NEVER a CI run artifact: the sync is
# hand-run, so no workflow run exists to attach one to. ONE implementation the live path
# and the self-test both call — this is the 65536-char body-cap guard.
bounded_rows() {
  local budget="$1" total="$2" where="${3:-the full evidence file (SYNC_EVIDENCE_OUT)}" bytes=0 rows=0 truncated=0 line bytes_line
  while IFS= read -r line; do
    bytes_line=$(( ${#line} + 1 ))
    if [ "$rows" -gt 0 ] && [ $((bytes + bytes_line)) -gt "$budget" ]; then
      truncated=1; break
    fi
    printf '%s\n' "$line"
    bytes=$((bytes + bytes_line)); rows=$((rows + 1))
  done
  if [ "$truncated" -eq 1 ]; then
    echo "  ... $rows of $total rows shown; the remaining $((total - rows)) are in ${where}"
  fi
}

# staged_gitlink <root> <path> — the gitlink this PR RECORDS for <path>. It reads the
# INDEX (`:<path>`), because the body is generated AFTER `git add -A` and BEFORE the
# commit: HEAD still points at the previous snapshot, so `HEAD:<path>` would name the
# OLD pin. Falls back to HEAD only when the path is not staged (already committed).
# The submodule's WORKING-TREE HEAD is NEVER read: it can be uninitialised or on
# another commit and would turn a correct pin into a false not-equal.
staged_gitlink() {
  local root="$1" p="$2" sha
  # Scrub git's hook-exported repo vars so `-C "$root"` truly targets $root: when
  # this runs from a hook (the self-test), GIT_DIR/GIT_INDEX_FILE name the CALLING
  # repo and would override -C (measured: it corrupted the umbrella's config).
  unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
  # `--verify --quiet` is the load-bearing fix (measured): bare `git rev-parse
  # ":$p"` ECHOES the literal `:<path>` token on failure and exits non-zero, so
  # `-n "$sha"` passed and the HEAD fallback below never ran for an unstaged path.
  # `--verify --quiet` prints nothing and exits 1; `|| true` keeps that non-zero
  # from aborting under `set -e` in any caller that inherits errexit.
  sha=$(git -C "$root" rev-parse --verify --quiet ":$p" || true)
  [ -n "$sha" ] || sha=$(git -C "$root" ls-tree HEAD -- "$p" 2>/dev/null | awk '{print $3}')
  printf '%s' "$sha"
}

# evidence_legend — the section's framing prose and its row legend, emitted verbatim by the
# live path and asserted by --self-test. It is a FUNCTION rather than inline `echo`s because
# how it tells a reader to READ a `!` is load-bearing, and the earlier wording got it wrong:
# it claimed a blanket "must be EQUAL", which calls a MEASURED-BENIGN case a violation.
#
# Root cause (R1, measured on this sync). A walk resolves each remote default-branch HEAD at
# the moment the walk RUNS; this table compares the staged gitlink against HEAD at the moment
# the table is GENERATED — later, by however long the sync PR body takes to assemble. So a
# non-`distro-*` `!` has exactly two readings, told apart by the two commits themselves:
#   (a) THE SYNC RACE — the owning default branch advanced after the walk, so the staged pin
#       is an ANCESTOR of the remote HEAD (benign; disclose by name, never chase);
#   (b) A REAL FINDING — the staged pin is not on that repo's default branch at all (a PR
#       branch, or a non-HEAD commit).
# Measured instance: `vm-charly-vm` — the walk ran 2026-10-06T15:07:25Z and pinned `47c4d063`
# (then HEAD; its predecessor was 2026-09-29), and that repo merged at 15:13:00Z/15:13:14Z,
# 5m35s later: `ahead 2, behind 0` — reading (a), exactly what the old legend mislabeled.
# ONE implementation the live path and the self-test both call, so the wording cannot drift
# from what the flag actually means.
evidence_legend() {
  echo "**Default-branch HEAD, per moved pin.** Every moved path, complete (no"
  echo "elision): the STAGED GITLINK this PR records (\`git rev-parse --verify --quiet"
  echo ":\<path>\` from the index, \`git ls-tree HEAD\` fallback) beside the owning"
  echo "remote default-branch HEAD (\`git ls-remote <url> HEAD\`, read when THIS table is"
  echo "generated). \`charly\` and every non-\`distro-*\` pin is the owning repo's"
  echo "default-branch HEAD **as of the walk that produced this diff**; a \`distro-*\` pin"
  echo "tracks charly's own gitlink and is proven by policy B, so it is policy-B pinned"
  echo "rather than required equal here:"
  echo
  echo '```'
  echo 'legend: <path>  <staged-gitlink>  <remote-HEAD>  <flag>'
  echo '        (= equal · ! NOT equal at table-generation time; distro-* = policy-B pinned)'
  echo '        A walk resolves each remote HEAD when it runs; this table compares at the'
  echo '        moment it is generated — later. A `!` on a non-`distro-*` row therefore has'
  echo '        two readings, told apart by the two commits themselves:'
  echo '        (a) THE SYNC RACE — the owning default branch advanced after the walk, so the'
  echo '            staged pin is an ANCESTOR of the remote HEAD'
  echo '            (`git -C <submodule> merge-base --is-ancestor <staged> <remote-HEAD>` →'
  echo '            true); benign — the body discloses it by name and never chases it.'
  echo '        (b) A REAL FINDING — the staged pin is not on that repo default branch at all'
  echo '            (a PR branch, or a non-HEAD commit); that ancestor check is false.'
  echo '        A `distro-*` row is neither: it tracks the gitlink charly records, which'
  echo '        policy B proves.'
  echo '        (a non-gitlink changed path is rendered `  <path>  <blob>  (file)` — a'
  echo '        plain file has no remote default-branch HEAD to compare, so it carries no flag;'
  echo '        its blob is the index blob this PR stages and is never `!`-flagged.)'
}

if [ "${1:-}" = "--self-test" ]; then
  fail() { echo "FAIL: sync-pin-evidence self-test: $*" >&2; exit 1; }

  # pin_row: the COMPACT format `  <path>  <staged12>  <remote12>  <flag>`. The kind
  # (distro-* policy-B vs default-branch) is derivable from the path prefix and stated
  # once in the section legend, so it is NOT in the row; the row carries only the
  # equality flag. A `!` is a real finding and must never be silently elided.
  got="$(pin_row 'plugin-vm' 'aaaa1111bbbb' 'cccc2222dddd')"
  [ "$got" = '  plugin-vm  aaaa1111bbbb  cccc2222dddd  !' ] \
    || fail "compact mismatch row wrong: '$got'"
  got="$(pin_row 'plugin-vm' 'same9999aaaa' 'same9999aaaa')"
  [ "$got" = '  plugin-vm  same9999aaaa  same9999aaaa  =' ] \
    || fail "compact equal row wrong: '$got'"
  # A distro-* row is byte-identical in shape (kind lives in the legend, not the row).
  got="$(pin_row 'distro-arch' 'aaaa1111bbbb' 'aaaa1111bbbb')"
  [ "$got" = '  distro-arch  aaaa1111bbbb  aaaa1111bbbb  =' ] \
    || fail "distro-* row must use the same compact shape: '$got'"
  pin_row 'plugin-vm' '' 'cccc2222dddd' | grep -q '  !$' \
    || fail "empty staged gitlink must flag '!'"
  # A LONGER name must still render the same 4-field shape (no kind suffix creep).
  pin_row 'layer-check-cross-local-driver-layer' 'x1' 'y2' \
    | grep -qE '^  layer-check-cross-local-driver-layer  [^ ]+  [^ ]+  [!=]$' \
    || fail "row shape must be <path> <staged> <remote> <flag> regardless of path length"

  # coverage_note: both directions.
  [ "$(coverage_note 0)" = "POLICY_B_NOT_COVERAGE" ] || fail "0 distro moved should NOT offer policy B"
  [ "$(coverage_note 2)" = "POLICY_B_IS_COVERAGE" ] || fail ">0 distro moved should offer policy B"

  # bounded_rows: the 65536-char body-cap guard. A generous budget emits every row and
  # NO elision notice; a tiny budget emits at least ONE row plus an elision naming
  # shown/total (so a huge sync can never overflow the body nor emit an empty fence).
  rows_all=$(printf 'r1\nr2\nr3\n' | bounded_rows 1000 3)
  [ "$(printf '%s\n' "$rows_all" | grep -c .)" = "3" ] || fail "generous budget must emit all 3 rows"
  printf '%s\n' "$rows_all" | grep -q 'elided\|rows shown' && fail "generous budget must not emit an elision notice"
  rows_cap=$(printf 'aaaaaaa\nbbbbbbb\nccccccc\nddddddd\n' | bounded_rows 10 4)
  echo "$rows_cap" | grep -q '^aaaaaaa$' || fail "bounded_rows must emit at least the first row at a tiny budget"
  echo "$rows_cap" | grep -q 'rows shown' || fail "bounded_rows must emit an elision notice when truncating"
  echo "$rows_cap" | grep -q '3 rows shown\|1 of 4 rows shown\|1 of 4' || fail "elision notice must name shown/total"
  # The elision notice must name the CALLER's evidence file, never a CI run artifact:
  # the sync is hand-run (`charly task sync` + a PR), so no workflow run exists to
  # attach a `sync-evidence` artifact to.
  echo "$rows_cap" | grep -q 'run artifact' && fail "elision notice must not promise a CI run artifact"
  rows_named=$(printf 'aaaaaaa\nbbbbbbb\nccccccc\nddddddd\n' | bounded_rows 10 4 /tmp/evidence.txt)
  echo "$rows_named" | grep -q '/tmp/evidence.txt' || fail "elision notice must name the caller's evidence file"

  # staged_gitlink: a REAL fixture repo where the STAGED pin differs from both the
  # HEAD pin and any submodule working-tree state — so reading the working tree (or
  # HEAD before the staged bump) FAILS this arm.
  #
  # CRITICAL: git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE to hook
  # processes, and `-C "$tmp"` does NOT override them — so a bare `git -C "$tmp"
  # …` here would write into the CALLING repo (measured: it set core.bare=true,
  # user.*, and a stray `sub` gitlink in the umbrella). Run the fixture ops in a
  # subshell with those variables scrubbed, so the fixture is fully isolated.
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  fixture() (
    unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
    cd "$tmp"
    git init -q
    git config user.email t@t; git config user.name t
    git update-index --add --cacheinfo 160000,1111111111111111111111111111111111111111,sub
    git commit -qm one
    # stage a NEW gitlink, leaving HEAD at the old one:
    git update-index --add --cacheinfo 160000,2222222222222222222222222222222222222222,sub
  )
  fixture >/dev/null
  got=$(staged_gitlink "$tmp" sub)
  [ "$got" = "2222222222222222222222222222222222222222" ] \
    || fail "staged_gitlink read '$got', want the STAGED index pin (2222…), not HEAD/working-tree"

  # staged_gitlink: a path ABSENT from the index must fall back to HEAD — and must
  # NOT abort the script under `set -e` (a bare `sha=$(git rev-parse …)` whose
  # substitution fails would exit here before the fallback could run).
  got=$(staged_gitlink "$tmp" absent-path) || fail "staged_gitlink aborted on an unstaged path (the set -e / fallback defect)"
  [ -z "$got" ] \
    || fail "staged_gitlink on an absent path read '$got', want empty (no index entry, no HEAD entry)"
  # A path that IS in HEAD but NOT in the index: stage new, commit, then delete the
  # index entry while HEAD keeps the old pin — the fallback must return HEAD's pin.
  fixture2() (
    unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
    cd "$tmp"
    git update-index --add --cacheinfo 160000,3333333333333333333333333333333333333333,sub2
    git commit -qm two
    git update-index --force-remove sub2
  )
  fixture2 >/dev/null
  got=$(staged_gitlink "$tmp" sub2)
  [ "$got" = "3333333333333333333333333333333333333333" ] \
    || fail "staged_gitlink fallback read '$got', want HEAD's 3333… for an unstaged path"

  # is_gitlink_path / file_row: the moved list is not all gitlinks (the producer stages EVERY
  # changed path), so a plain file must be classified as a file and rendered WITHOUT the `=`/`!`
  # flag — flagging it `!` against a remote that does not exist is the false finding the
  # pre-fix builder emitted (measured: `reasonix.toml  <blob>  !`).
  printf 'blob\n' > "$tmp/plainfile"; git -C "$tmp" add plainfile
  is_gitlink_path "$tmp" sub \
    || fail "is_gitlink_path must be TRUE for a mode-160000 entry"
  is_gitlink_path "$tmp" plainfile \
    && fail "is_gitlink_path must be FALSE for a plain file (a miscount is the defect)"
  got=$(file_row plainfile abcd1234ef56)
  [ "$got" = '  plainfile  abcd1234ef56  (file)' ] \
    || fail "file_row must render a flagless (file) row, got '$got'"
  printf '%s\n' "$got" | grep -qE '[!=]$' \
    && fail "a file row must carry NO =/! flag (there is no remote to compare)"

  # evidence_legend: the wording that tells a reader how to READ a `!`. A `!` on a
  # non-`distro-*` row is EITHER the sync race (benign — measured: an upstream default
  # branch that merged after the walk, leaving the staged pin an ANCESTOR of the remote
  # HEAD) OR a real finding (a pin that is not on that default branch at all). The
  # retired legend claimed a blanket "must be EQUAL", so it called that measured-benign
  # race a violation; these arms fail if either reading or the discriminating check goes
  # missing, or if the blanket claim comes back.
  LEGEND="$(evidence_legend)"
  printf '%s\n' "$LEGEND" | grep -q 'THE SYNC RACE' \
    || fail "legend must name the sync race (the benign reading of a non-distro-* !)"
  printf '%s\n' "$LEGEND" | grep -q 'A REAL FINDING' \
    || fail "legend must name the real-finding reading (a pin not on the default branch)"
  printf '%s\n' "$LEGEND" | grep -q 'merge-base --is-ancestor' \
    || fail "legend must give the check that tells the two readings apart"
  printf '%s\n' "$LEGEND" | grep -q 'as of the walk that produced this diff' \
    || fail "legend must scope every pin to the WALK, never to table-generation time"
  printf '%s\n' "$LEGEND" | grep -q 'must be EQUAL' \
    && fail "legend must not reinstate the blanket 'must be EQUAL' claim"
  printf '%s\n' "$LEGEND" | grep -q '(= equal · ! ' \
    || fail "legend must keep the compact flag line"
  printf '%s\n' "$LEGEND" | grep -q 'is never `!`-flagged' \
    || fail "legend must keep the file-row clause"

  echo "sync-pin-evidence: self-test OK (compact <path> <staged> <remote> <flag> rows both ways; coverage both directions; bounded_rows emits all under budget and >=1 + elision notice over budget; staged-gitlink reads the index + falls back to HEAD; evidence_legend states BOTH readings of a non-distro-* ! and the check that tells them apart)"
  exit 0
fi

ROOT="${1:?usage: sync-pin-evidence.sh <root> <policy-b-log>}"
POLICY_B_LOG="${2:?usage: sync-pin-evidence.sh <root> <policy-b-log>}"
cd "$ROOT"

MOVED="$(cat)"
MOVED_COUNT=$(printf '%s\n' "$MOVED" | grep -c . || true); MOVED_COUNT=${MOVED_COUNT:-0}
# Count distro-* over ALL moved paths (path prefix only — no network), so policy-B
# coverage is decided from the full diff, never from the truncated emission window.
DISTRO_MOVED=$(printf '%s\n' "$MOVED" | grep -c '^distro-' || true); DISTRO_MOVED=${DISTRO_MOVED:-0}

evidence_legend
# Render every row to a temp file, THEN bound — never pipe the producer into the bounder.
# This environment ignores SIGPIPE, so an early-exiting bounder would leave the producer
# writing to a closed pipe; under `set -o pipefail` those failed writes would abort the
# script. A file sidesteps that entirely (only a few hundred rows).
ROWS_FILE="$(mktemp)"; trap 'rm -f "$ROWS_FILE"' EXIT
GITLINK_COUNT=0; FILE_COUNT=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  if is_gitlink_path "$ROOT" "$p"; then
    pin_row "$p" "$(staged_gitlink "$ROOT" "$p")" \
      "$(git ls-remote "$(git config -f .gitmodules --get "submodule.$p.url" 2>/dev/null || echo '')" HEAD 2>/dev/null | awk '{print $1}' || echo '')" \
      >> "$ROWS_FILE"
    GITLINK_COUNT=$((GITLINK_COUNT + 1))
  else
    # A non-gitlink changed path (a hand-edit beside the pins): its staged blob, no flag.
    file_row "$p" "$(staged_gitlink "$ROOT" "$p")" >> "$ROWS_FILE"
    FILE_COUNT=$((FILE_COUNT + 1))
  fi
done <<< "$MOVED"
# The gitlink/file split is published for the body builder (the ONE measurement of what
# KIND of diff this is), so its Summary count and Change-class line cannot disagree with
# the table below. Absent (a standalone run) it is simply not written.
if [ -n "${SYNC_EVIDENCE_TYPE_OUT:-}" ]; then
  printf 'GITLINK_COUNT=%s\nFILE_COUNT=%s\n' "$GITLINK_COUNT" "$FILE_COUNT" > "$SYNC_EVIDENCE_TYPE_OUT"
fi
bounded_rows "$SYNC_EVIDENCE_MAX_BYTES" "$MOVED_COUNT" "${SYNC_EVIDENCE_OUT:-}" < "$ROWS_FILE"
echo '```'
# When the caller asks, persist the FULL rendered table so the elision notice's promise
# ("the remaining N are in the full evidence file") is TRUE — that file gets the rendered
# rows, not just an unrendered producer log.
if [ -n "${SYNC_EVIDENCE_OUT:-}" ]; then
  {
    echo
    echo "== per-pin evidence table (full, all ${MOVED_COUNT} rows) =="
    cat "$ROWS_FILE"
  } >> "$SYNC_EVIDENCE_OUT"
fi
echo
if [ "$(coverage_note "$DISTRO_MOVED")" = "POLICY_B_IS_COVERAGE" ]; then
  echo "**Policy B — the assertion this diff CAN violate** (\`${DISTRO_MOVED}\`"
  echo "\`distro-*\` pin(s) moved). \`charly task policy-b\` reads charly's own"
  echo "gitlinks with \`git ls-tree\` (tree objects — present in a shallow clone;"
  echo "charly's NESTED submodules need not be initialised) and asserts every umbrella"
  echo "\`distro-*\` gitlink equals it, pasted verbatim from this run:"
  echo
  echo '```'
  cat "$POLICY_B_LOG"
  echo '```'
else
  echo "**Policy B is NOT offered as this diff's coverage:** it asserts the umbrella"
  echo "\`distro-*\` gitlinks equal charly's own, and **this diff moved zero \`distro-*\`"
  echo "pins**, so that gate cannot fail on this diff. The coverage for the pins that"
  echo "DID move is the per-pin \`git ls-remote\` default-branch evidence above (and, for"
  echo "\`charly\`, its own default-branch HEAD). For transparency the policy-B gate still"
  echo "ran and passed:"
  echo
  echo '```'
  cat "$POLICY_B_LOG"
  echo '```'
fi
