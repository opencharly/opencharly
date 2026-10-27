#!/usr/bin/env bash
# sync-pin-evidence.sh — emit the sync PR body's "pin evidence" section: for every
# MOVED gitlink, the STAGED GITLINK (the pinned commit this PR records) beside the
# owning repo's remote default-branch HEAD, plus the truthful statement of whether
# the pin contract can fail on THIS diff.
#
# Why this is its own script: the sync PR's body must carry real, verifiable evidence
# that each moved pin is a merged default-branch HEAD (or charly's own gitlink, for
# `distro-*`). Extracting it here makes the logic TESTABLE in-tree (`--self-test`, run
# by the pre-commit gate), not a string nobody can exercise.
#
# The STAGED GITLINK — never the submodule's working-tree HEAD — is the pinned commit
# the umbrella records (`git ls-tree HEAD -- ':(literal)<path>'`); a submodule that is
# uninitialised or sitting on another commit must not turn a correct pin into a false
# `not-equal`. The literal pathspec is not optional: git reads a path argument as a
# PATHSPEC, and a name that BEGINS WITH `:` is pathspec MAGIC, which the plain form
# matches silently and wrongly (see the measured note on head_entry below).
#
# Modes:
#   (default) <root> <pin-check-log>   read MOVED (one path per line) from stdin; print
#                                     the evidence section (table + coverage framing).
#   --self-test                       exercise pin_row + the coverage DECISION on fixtures.
#
# The coverage decision — "is the pin check this diff's coverage?" — is the shared
# rule (scripts/pin-contract-inputs.sh), the same one the commit gate's change class
# reads: the check reads the index's gitlinks, the manifest that declares the pin
# contract (charly.yml) and the declared path set (.gitmodules), so a diff that
# touches none of them cannot violate it.
#
# SIZE BOUND (a GitHub platform limit, not a preference). A sync PR body is capped by
# GitHub at 65536 characters; a sync that moves hundreds of pins overflows it and
# `gh pr create` fails with "Body is too long". The per-pin evidence table is the
# largest section. It is emitted in the COMPACT format above (≈50 bytes/row, vs ≈115
# for the retired `staged-gitlink=… remote-HEAD=… [kind, eq]` row) so the FULL table —
# every changed path, no elision — fits the body with headroom at fleet scale. The
# fleet scale is the LIVE one: `sync-pr-body.sh`'s self-test builds its synthetic moved
# set from the umbrella's own `.gitmodules`, so the bound is re-proved on every run at
# the real submodule count instead of by a figure recorded once — and it fails loud when
# the count outgrows the budget. SYNC_EVIDENCE_MAX_BYTES (default 50000) is now a FALLBACK
# guard only: it does not fire at fleet scale, and if a far larger sync ever
# tripped it the elision notice names shown/total AND the evidence file holding the
# rest. The BODY always carries the complete table; SYNC_EVIDENCE_OUT additionally
# writes a copy to a caller-named file. Neither is a CI run artifact — the sync is
# hand-run (`charly task sync` + a PR), so no workflow run exists to attach one to.
# The body never POINTS at a file as the home of the evidence — a pointer is a
# promise, not pasted output, which is exactly what the validator BLOCKed.

SYNC_EVIDENCE_MAX_BYTES="${SYNC_EVIDENCE_MAX_BYTES:-50000}"

set -euo pipefail

# scratch — create a temporary path and register it for removal on EVERY exit
# path of the calling shell.
#
# WHY ONE HELPER. `fail` EXITS: a removal that only runs at the end of a block is
# SKIPPED on every failure, so the scratch leaks. The leak is not cosmetic — one
# of the ways this script fails is a full filesystem, so a leaked scratch
# amplifies the very condition it reports. Measured on 2026-10-24: the host's
# /tmp (a tmpfs with nr_inodes=1048576) ran out of inodes while this script's
# own arm was running; the arm's positive control failed with "No space left on
# device", the arm reported it, and the arm's OWN scratch was left behind — the
# leak this helper removes.
#
# ONE trap removes EVERY registered path, so registering a second scratch never
# unregisters the first.
#
# Usage:  scratch <varname> [dir|file]
SCRATCH_PATHS=()
scratch() {
  local name="$1" kind="${2:-dir}" path
  if [ "$kind" = dir ]; then
    path="$(mktemp -d)"
  else
    path="$(mktemp)"
  fi
  printf -v "$name" '%s' "$path"
  SCRATCH_PATHS+=("$path")
  trap 'rm -rf -- ${SCRATCH_PATHS[@]+"${SCRATCH_PATHS[@]}"}' EXIT
}

# The pin contract's commit-carried inputs — ONE definition, shared with the commit
# gate's change class (hooks/pre-commit-gate.sh). Both ask the same question — can
# this diff violate the pin check? — so both read the same answer. Sourced from this
# script's own directory, so it travels with it.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# A MISSING shared file must fail LOUD, and the guard comes BEFORE the source, so a
# reader cannot mistake a failed source for a decision. The coverage decision below
# is DEFINED in that file: without it this body cannot tell whether the pin check
# covers the diff, and the fail-open it would take — an undefined
# `pin_contract_touches_input` answering "no" — reports "the pin check is NOT this
# diff's coverage" as a FACT, on a body whose whole job is to state what covers the
# diff. A body that cannot decide must not claim it does not. The commit gate
# carries the same guard for the same reason (hooks/pre-commit-gate.sh).
if [ ! -f "$SCRIPT_DIR/pin-contract-inputs.sh" ]; then
  echo "sync-pin-evidence: no scripts/pin-contract-inputs.sh in THIS tree, and the pin" >&2
  echo "  check's coverage decision is DEFINED there, so this body cannot decide" >&2
  echo "  whether the check covers this diff — and a body that cannot decide must not" >&2
  echo "  claim it does not." >&2
  exit 1
fi
# shellcheck source=scripts/pin-contract-inputs.sh
. "$SCRIPT_DIR/pin-contract-inputs.sh"

# pin_row <path> <staged_gitlink> <remote_head> — ONE evidence row, in the COMPACT
# format the body-size budget is measured against: `  <path>  <staged12>  <remote12>
# <flag>`. The kind (`distro-*` edge-pinned vs default-branch HEAD) is derivable
# from the path prefix and stated ONCE in the section legend, so the row carries no
# verbose `[kind, eq]` suffix — that suffix is what pushed a fleet-scale table past
# the body budget and forced the artifact elision the validator rejects. `flag` is `=`
# when the staged gitlink equals the remote default-branch HEAD, else `!` (a real
# finding for a non-`distro-*` row, never silently elided). ONE implementation the
# live path and the self-test both call.
pin_row() {
  local p="$1" staged="$2" remote="$3" flag
  if [ -n "$staged" ] && [ "$staged" = "$remote" ]; then flag="="; else flag="!"; fi
  printf '  %s  %.12s  %.12s  %s\n' "$p" "$staged" "$remote" "$flag"
}

# index_entry <root> <path> — the INDEX's OWN record for <path>: "<mode> <sha>", or EMPTY
# when the index records no entry for it. ONE read, shared by every predicate below, so a
# changed path's classification is ONE measurement of the index and not several that can
# disagree. git's hook-exported repo vars are scrubbed so `-C "$root"` truly targets $root
# (measured: an unsanitized `-C` wrote into the CALLING repo). `ls-files -s` prints
# "<mode> <sha> <stage>", so the sha is the SECOND field. The pathspec is `:(literal)` so
# a path whose NAME carries a glob character is read as itself, and so a path whose NAME
# BEGINS WITH `:` is read as itself rather than as pathspec MAGIC. `head_entry` states
# the measurement, and the two readers take the SAME pathspec so they read the same path
# set — the pair's whole reason to exist.
index_entry() {
  local root="$1" p="$2"
  unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
  git -C "$root" ls-files -s -- ":(literal)$p" 2>/dev/null | awk 'NR==1{print $1" "$2}'
}

# head_entry <root> <path> — HEAD's record for <path>: "<mode> <sha>", or EMPTY when HEAD
# does not record it either. `ls-tree` prints "<mode> <type> <sha>", so the sha is the
# THIRD field — the one place the two readers' field layouts are normalized.
#
# The pathspec is `:(literal)`, so this reader reads the SAME path set as its sibling
# `index_entry` — and that is the whole point of the pair: a changed path's
# classification must be ONE measurement of the index and HEAD, not two reads that can
# disagree.
#
# WHY `:(literal)` — measured (git 2.56.0, 2026-10-27). The two git commands need it for
# DIFFERENT reasons, and the difference is easy to get backwards:
#
#   - `ls-files` GLOBS a pathspec: `ls-files -s -- 'a*b'` returns BOTH `a*b` AND a
#     sibling `a!b` (and `a!b` sorts FIRST, so a reader that takes the first record
#     returns a DIFFERENT path's record). `:(literal)` returns `a*b` alone. That is why
#     `index_entry` needs it.
#   - `ls-tree` does NOT glob: `ls-tree HEAD -- 'a*b'` already returns only the
#     literally-named `a*b`. It needs `:(literal)` for the OTHER case — a path whose
#     NAME BEGINS WITH `:` is PATHSPEC MAGIC, and the plain form then matches NOTHING:
#     silently, exit 0, no output and no error (measured: `ls-tree HEAD -- ':colonpath'`
#     is empty; `ls-tree HEAD -- ':(literal):colonpath'` is the record). A reader that
#     is silently wrong is indistinguishable from a reader that is right, so the
#     disagreement this caused was invisible: the body classified a path this diff
#     DELETES as a carried file (opencharly/opencharly#740).
head_entry() {
  local root="$1" p="$2"
  unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
  git -C "$root" ls-tree HEAD -- ":(literal)$p" 2>/dev/null | awk 'NR==1{print $1" "$3}'
}

# is_gitlink_path <root> <path> — true when the RECORDED entry for <path> is a submodule
# pointer (index mode 160000); false for a plain file (100644/100755). The producer stages
# EVERY changed path (`git diff --cached --name-only`), so a hand-edit beside the pins is a
# FILE here, never a pointer — the class the old builder miscounted as a gitlink (measured:
# `reasonix.toml` rendered as a 46th gitlink). Reads the INDEX first (the staged snapshot
# this PR records) and falls back to HEAD, mirroring staged_gitlink. ONE implementation the
# live render loop and the self-test both call.
is_gitlink_path() {
  local root="$1" p="$2" entry
  entry="$(index_entry "$root" "$p")"
  [ -n "$entry" ] || entry="$(head_entry "$root" "$p")"
  [ "${entry%% *}" = "160000" ]
}

# is_removed_path <root> <path> — true when the INDEX records NO entry for <path> while
# HEAD still records one: this diff DELETES the path.
#
# Why this needs its own predicate. The body is generated AFTER `git add -A` and BEFORE
# the commit, so a deletion is STAGED-but-not-COMMITTED: the index has no entry for the
# path and HEAD still does. Both other predicates answer "what does the index record?",
# and for a deleted path the honest answer is "nothing" — there is no staged pin to
# compare against a remote and no staged blob to name. Measured on origin/main
# (2026-10-27): the removal fell through to the HEAD fallback, so the table compared the
# pin the diff DELETES against the remote's default-branch HEAD and flagged it `!` — a
# false finding that read as a divergence. A removal and a divergence are different facts
# and the row must be able to tell them apart.
is_removed_path() {
  local root="$1" p="$2"
  [ -z "$(index_entry "$root" "$p")" ] && [ -n "$(head_entry "$root" "$p")" ]
}

# file_row <path> <blob_sha> — ONE evidence row for a changed NON-gitlink path. A plain file
# has no remote default-branch HEAD to compare against, so its row carries NO `=`/`!` flag:
# flagging such a path `!` against a remote that does not exist is a false finding (measured:
# `reasonix.toml  d6b7737bbd8d  !`). The row still names the file and its staged blob, so no
# changed path is hidden. ONE implementation the live render loop and the self-test call.
file_row() {
  printf '  %s  %.12s  (file)\n' "$1" "$2"
}

# removed_row <path> — ONE evidence row for a path this diff DELETES. The index records
# no entry for it, so it carries no staged pin and no staged blob: there is nothing to
# compare against a remote, so the row carries NO `=`/`!` flag — a removal is not a
# divergence, and flagging it `!` states a finding the diff does not contain. The path is
# still NAMED, so the table stays the complete changed-path list and no changed path is
# hidden. ONE implementation the live render loop and the self-test call.
removed_row() {
  printf '  %s  (removed)\n' "$1"
}

# coverage_note <touched> — is the pin check this diff's coverage? The ANSWER comes
# from the shared definition (scripts/pin-contract-inputs.sh): the check reads the
# index's gitlinks, the manifest that declares the pin contract (charly.yml) and the
# declared path set (.gitmodules), so a diff that touches none of them cannot violate
# it — and a diff that touches one of them CAN.
#
# The old rule was "a `distro-*` pin moved", which was NARROWER than the truth on two
# counts: a diff that moves charly's OWN gitlink moves the edge's `want` side (charly's
# `box/*` twins), and a diff that edits the manifest changes what the check compares.
# Both are commit-carried inputs of the check, and the commit gate now watches the same
# set — so a narrower rule here would make this body under-claim what the gate proves.
#
# ONE decision, shared by the live path and the self-test.
coverage_note() {
  if [ "${1:-0}" -ne 0 ]; then
    echo "PIN_CHECK_IS_COVERAGE"
  else
    echo "PIN_CHECK_NOT_COVERAGE"
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

# staged_gitlink <root> <path> — the gitlink (or blob) this PR RECORDS for <path>. It
# reads the INDEX, because the body is generated AFTER `git add -A` and BEFORE the
# commit: HEAD still points at the previous snapshot, so `HEAD:<path>` would name the
# OLD pin. Falls back to HEAD only when the path is not staged (already committed).
# The submodule's WORKING-TREE HEAD is NEVER read: it can be uninitialised or on
# another commit and would turn a correct pin into a false not-equal.
#
# THE FALLBACK'S TRAP, and the reason the render loop checks the removed state FIRST.
# A path that is in HEAD and NOT in the index is a REMOVAL (is_removed_path) — this
# diff DELETES it — and the fallback then hands back the pin the diff deletes, which
# the PR records NO pin for. A caller that compared that value against the remote
# would publish a false divergence for a path the diff removes (measured on
# origin/main's script, 2026-10-27: `  sub  00f95b3fbbcb  006ddb64b729  !`). The
# render loop therefore asks is_removed_path BEFORE it asks for a value, and a
# removed path gets its own `(removed)` row; this read's fallback is not the place
# that decision is made.
#
# The index read is `git ls-files -s`, NOT `git rev-parse ":$p"`: bare rev-parse ECHOES
# the literal `:<path>` token on failure and exits non-zero (measured: the substitution
# looked like a sha, the HEAD fallback never ran, and an unstaged path reported a false
# pin); `ls-files` prints nothing and exits 0 for a path it does not record, so the read
# cannot abort the caller under `set -e` and the HEAD fallback runs.
staged_gitlink() {
  local root="$1" p="$2" entry
  entry="$(index_entry "$root" "$p")"
  [ -n "$entry" ] || entry="$(head_entry "$root" "$p")"
  printf '%s' "${entry##* }"
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
  echo "elision): the STAGED GITLINK this PR records (\`git ls-files -s\` from the index,"
  echo "\`git ls-tree HEAD\` fallback) beside the owning"
  echo "remote default-branch HEAD (\`git ls-remote <url> HEAD\`, read when THIS table is"
  echo "generated). \`charly\` and every non-\`distro-*\` pin is the owning repo's"
  echo "default-branch HEAD **as of the walk that produced this diff**; a \`distro-*\` pin"
  echo "tracks charly's own gitlink and is proven by the pin check, so it is edge-pinned"
  echo "rather than required equal here:"
  echo
  echo '```'
  echo 'legend: <path>  <staged-gitlink>  <remote-HEAD>  <flag>'
  echo '        (= equal · ! NOT equal at table-generation time; distro-* = edge-pinned)'
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
  echo '        the pin check proves.'
  echo '        (a non-gitlink changed path is rendered `  <path>  <blob>  (file)` — a'
  echo '        plain file has no remote default-branch HEAD to compare, so it carries no flag;'
  echo '        its blob is the index blob this PR stages and is never `!`-flagged.)'
  echo '        (a path this diff REMOVES is rendered `  <path>  (removed)` — it is in HEAD'
  echo '        but no longer in the index, so this PR records no pin and no blob for it:'
  echo '        there is nothing to compare, and it is never `=`/`!`-flagged.)'
}

if [ "${1:-}" = "--self-test" ]; then
  fail() { echo "FAIL: sync-pin-evidence self-test: $*" >&2; exit 1; }

  # pin_row: the COMPACT format `  <path>  <staged12>  <remote12>  <flag>`. The kind
  # (distro-* edge-pinned vs default-branch) is derivable from the path prefix and stated
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
  [ "$(coverage_note 0)" = "PIN_CHECK_NOT_COVERAGE" ] || fail "0 touched inputs should NOT offer the pin check"
  [ "$(coverage_note 1)" = "PIN_CHECK_IS_COVERAGE" ] || fail "1 touched input should offer the pin check"

  # The COVERAGE DECISION itself — the shared rule (scripts/pin-contract-inputs.sh).
  # Every arm names a real input of the check, and the arms are the ones that make
  # the decision falsifiable: a manifest edit, a path-set edit, and ANY moved gitlink
  # (not only a `distro-*` one — moving charly's own gitlink moves the edge's `want`
  # side) all make the check applicable, and a plain file does not.
  pin_contract_touches_input "charly.yml" "" || fail "a manifest edit must touch a commit-carried input"
  pin_contract_touches_input ".gitmodules" "" || fail "a path-set edit must touch a commit-carried input"
  pin_contract_touches_input "charly" "charly" || fail "ANY moved gitlink must touch a commit-carried input"
  pin_contract_touches_input "plugin-vm" "plugin-vm" || fail "a moved non-distro gitlink must touch a commit-carried input"
  if pin_contract_touches_input "README.md" ""; then fail "a plain file must NOT touch a commit-carried input"; fi
  pin_contract_touches_input "README.md
charly.yml" "" || fail "a manifest edit among plain files must still touch an input"
  if pin_contract_touches_input "README.md" "distro-arch"; then fail "a gitlink that was NOT changed must not touch an input"; fi

  # The MISSING-SHARED-FILE GUARD. The coverage decision is DEFINED in
  # scripts/pin-contract-inputs.sh, so a body that cannot read that file cannot
  # decide whether the pin check covers the diff. It must FAIL LOUD and name the
  # missing file.
  #
  # The arm runs a COPY of this script in a directory that has NO shared file, so
  # the copy takes the copy's own SCRIPT_DIR and finds nothing to source. It runs
  # the copy in BODY mode with empty stdin (never --self-test: the copy's own
  # self-test would re-enter this arm, and a self-referential arm is a hang, not a
  # test), so the copy reaches the coverage decision — which is where the fail-open
  # lived.
  #
  # The discriminator is the fail-open SIGNATURE, not merely a non-zero exit. The
  # broken tree sourced a missing file under a `set -e` that was not yet in force,
  # so the failure was a "command not found" and the body then reported "the pin
  # check is NOT this diff's coverage" as a FACT and exited 0. An exit-code-only
  # assertion would not separate the two trees, so the arm asserts the fail-open
  # text is ABSENT and the guard's own text is PRESENT.
  # The scratch is registered through the helper, so it is removed on EVERY exit
  # path — including the ones this arm takes when it FAILS (`fail` exits). The
  # explicit removal at the end of the arm is the tidy path; the registration is
  # what makes the failure path safe.
  scratch guard_dir
  cp "$SCRIPT_DIR/sync-pin-evidence.sh" "$guard_dir/sync-pin-evidence.sh"
  : > "$guard_dir/pin-check.log"
  if ( cd "$guard_dir" && bash "$guard_dir/sync-pin-evidence.sh" "$guard_dir" "$guard_dir/pin-check.log" ) \
       >"$guard_dir/out.txt" 2>"$guard_dir/err.txt" </dev/null; then
    guard_rc=0
  else
    guard_rc=$?
  fi
  [ "$guard_rc" -ne 0 ] \
    || fail "a copy with NO shared definition must fail loud, not exit 0 (out: $(head -c 200 "$guard_dir/out.txt"))"
  grep -q 'cannot decide' "$guard_dir/err.txt" \
    || fail "the loud failure must say the body cannot decide (err: $(head -c 200 "$guard_dir/err.txt"))"
  grep -q 'command not found' "$guard_dir/err.txt" \
    && fail "the fail-open signature ('command not found') must be ABSENT — the guard must fire BEFORE the source"
  grep -q 'NOT offered as this diff' "$guard_dir/out.txt" \
    && fail "the fail-open CLAIM ('NOT offered as this diff') must be ABSENT — a body that cannot decide must not claim it does not"
  # The positive control: with the shared file PRESENT the same copy must NOT trip
  # the guard, so the arm cannot pass by failing everything. It runs to completion
  # and REPORTS a coverage decision (empty stdin = no moved path = not coverage).
  cp "$SCRIPT_DIR/pin-contract-inputs.sh" "$guard_dir/pin-contract-inputs.sh"
  if ( cd "$guard_dir" && bash "$guard_dir/sync-pin-evidence.sh" "$guard_dir" "$guard_dir/pin-check.log" ) \
       >"$guard_dir/out2.txt" 2>"$guard_dir/err2.txt" </dev/null; then
    guard_rc2=0
  else
    guard_rc2=$?
  fi
  [ "$guard_rc2" -eq 0 ] \
    || fail "with the shared definition PRESENT the copy must run clean (err: $(tail -c 300 "$guard_dir/err2.txt"))"
  grep -q 'NOT offered as this diff' "$guard_dir/out2.txt" \
    || fail "with the shared definition PRESENT the copy must reach the coverage decision"
  rm -rf "$guard_dir"

  # The removal must hold on the FAILURE path — the path `fail` takes. This arm
  # registers a scratch through the SAME helper the arm above uses, in a
  # subshell that exits non-zero, and asserts the scratch is gone afterwards:
  # remove the helper's trap and this arm goes RED, because the arm above would
  # then leak its scratch on every failure too.
  probe_leaked="$(
    scratch probe_scratch
    printf '%s\n' "$probe_scratch"
    exit 1
  )" || true
  [ -n "$probe_leaked" ] \
    || fail "the scratch probe must record the scratch it created"
  [ ! -e "$probe_leaked" ] \
    || fail "a registered scratch must be removed even when the shell exits non-zero (leaked: $probe_leaked)"

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
  scratch tmp
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

  # is_removed_path: the path in HEAD but NOT in the index is a REMOVAL — this diff
  # deletes it. A path the index records is not removed, and a path neither records is
  # not removed either. (The `sub2` fixture above is exactly the removal case.)
  is_removed_path "$tmp" sub2 \
    || fail "is_removed_path must be TRUE for a path in HEAD but not in the index (this diff DELETES it)"
  is_removed_path "$tmp" sub \
    && fail "is_removed_path must be FALSE for a path the index records"
  is_removed_path "$tmp" absent-path \
    && fail "is_removed_path must be FALSE for a path neither the index nor HEAD records"

  # THE READERS MUST READ THE SAME PATH SET (opencharly/opencharly#740).
  #
  # The pair `index_entry`/`head_entry` exists so a changed path's classification is ONE
  # measurement of the index and HEAD, not two reads that can disagree. They COULD
  # disagree: `index_entry` took a `:(literal)` pathspec and `head_entry` did not, and a
  # path whose NAME BEGINS WITH `:` is PATHSPEC MAGIC in git — the plain form matches
  # NOTHING, silently (exit 0, no output, no error), so `head_entry` could not see a path
  # `HEAD` records. The body then classified a path this diff DELETES as a carried file
  # (measured 2026-10-27 on the pre-fix tree: `  :colonpath    (file)`).
  #
  # The producer names such paths VERBATIM — `git diff --cached --name-only` does not
  # quote them (measured: `:colonpath` and `a*b` come through as themselves) — so the
  # list that reaches this script CAN carry them. These arms drive both readers with a
  # path whose NAME git may reinterpret.
  scratch tmp2
  fixture3() (
    unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
    cd "$tmp2"
    git init -q
    git config user.email t@t; git config user.name t
    # A path whose NAME BEGINS WITH `:` — PATHSPEC MAGIC, and a legal git path.
    printf 'one\n' > ':colonpath'
    # A path whose NAME carries a glob character, and a SIBLING the same pathspec also
    # matches. `a!b` sorts BEFORE `a*b`, so a GLOBBING reader takes the sibling's record
    # first — and the files carry DIFFERENT content, so a wrong record shows up as a
    # DIFFERENT sha rather than as an absence.
    printf 'two\n' > 'a*b'
    printf 'three\n' > 'a!b'
    git add -A
    git commit -qm one
    # Now the index drops the colon-named path: HEAD still records it, the index does
    # not — the state a deletion is in between `git add -A` and the commit.
    git update-index --force-remove -- ':colonpath'
  )
  fixture3 >/dev/null

  # head_entry must SEE a path HEAD records whose name begins with `:`.
  got=$(head_entry "$tmp2" ':colonpath')
  [ -n "$got" ] \
    || fail "head_entry must read a path whose NAME begins with ':' — git reads that plain pathspec as PATHSPEC MAGIC and matches NOTHING (silently, exit 0), so this reader needs the same ':(literal)' pathspec its sibling index_entry carries"

  # So the removal is seen: HEAD records it, the index does not — this diff DELETES it.
  is_removed_path "$tmp2" ':colonpath' \
    || fail "is_removed_path must be TRUE for a path whose NAME begins with ':' (HEAD records it, the index does not — this diff DELETES it)"

  # A path the index records is not a removal — whatever its name looks like.
  is_removed_path "$tmp2" 'a*b' \
    && fail "is_removed_path must be FALSE for a path the index records"

  # Both readers read a glob-named path as ITSELF, not as a pathspec that also matches
  # its sibling. If either reader lost its `:(literal)`, the two would report the SAME
  # sha here — the sibling's.
  glob_sha=$(index_entry "$tmp2" 'a*b')
  sib_sha=$(index_entry "$tmp2" 'a!b')
  [ -n "$glob_sha" ] && [ -n "$sib_sha" ] \
    || fail "index_entry must read a path whose NAME carries a glob character"
  [ "$glob_sha" != "$sib_sha" ] \
    || fail "index_entry read the SAME record for 'a*b' and for 'a!b' — the pathspec GLOBBED (ls-files expands it), so the reader returned a DIFFERENT path's record"
  glob_head=$(head_entry "$tmp2" 'a*b')
  [ -n "$glob_head" ] \
    || fail "head_entry must read a path whose NAME carries a glob character"
  [ "${glob_head##* }" = "${glob_sha##* }" ] \
    || fail "the two readers must read the SAME record for 'a*b' (index ${glob_sha##* }, HEAD ${glob_head##* })"

  # THE LIVE BODY on that fixture: the colon-named path is a REMOVAL, so it renders a
  # (removed) row. The pre-fix tree rendered it as a carried (file) — a false claim
  # about the diff.
  printf 'charly task pin-check: OK\n' > "$tmp2/pinlog"
  if printf ':colonpath\n' | bash "$SCRIPT_DIR/sync-pin-evidence.sh" "$tmp2" "$tmp2/pinlog" \
       > "$tmp2/colon-body.txt" 2> "$tmp2/colon-body.err"; then
    colon_rc=0
  else
    colon_rc=$?
  fi
  [ "$colon_rc" -eq 0 ] \
    || fail "the body must run on a diff that removes a path whose NAME begins with ':' (err: $(tail -c 300 "$tmp2/colon-body.err"))"
  grep -qE '^  :colonpath  \(removed\)$' "$tmp2/colon-body.txt" \
    || fail "a path whose NAME begins with ':' that this diff DELETES must render a (removed) row naming it (the pre-fix tree rendered it as a carried (file))"
  grep -qE '^  :colonpath  .*\(file\)$' "$tmp2/colon-body.txt" \
    && fail "a path this diff DELETES must NOT render a (file) row — it carries no staged blob"

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

  # removed_row: the row for a path this diff DELETES. It names the path and carries
  # NO `=`/`!` flag: the index records nothing for it, so there is no staged pin to
  # compare against a remote — a removal is not a divergence.
  got=$(removed_row sub2)
  [ "$got" = '  sub2  (removed)' ] \
    || fail "removed_row must render a flagless (removed) row, got '$got'"
  printf '%s\n' "$got" | grep -qE '[!=]$' \
    && fail "a removed row must carry NO =/! flag (there is no staged pin to compare)"

  # THE BODY ON A REMOVED GITLINK — the coverage this defect had none of.
  #
  # The arm above exercises staged_gitlink's HEAD fallback, and the pre-fix tree
  # stopped there: it never asked what the BODY does with the value that fallback
  # hands it. The body generated on origin/main for a diff that DELETES a gitlink
  # compared the deleted pin against the remote's default-branch HEAD and flagged it
  # `!` (measured 2026-10-27 on origin/main's script: `  sub  00f95b3fbbcb
  # 006ddb64b729  !`) — a false finding that reads exactly like a divergence, and
  # a removal and a divergence are different facts.
  #
  # So this arm runs the LIVE body (the script's own body mode, not a helper) on the
  # fixture whose HEAD records `sub2` and whose INDEX no longer does, and asserts the
  # row it produces. It is the discriminating arm: on the pre-fix tree it fails.
  printf 'charly task pin-check: OK\n' > "$tmp/pinlog"
  if printf 'sub2\n' | bash "$SCRIPT_DIR/sync-pin-evidence.sh" "$tmp" "$tmp/pinlog" \
       > "$tmp/removed-body.txt" 2> "$tmp/removed-body.err"; then
    removed_rc=0
  else
    removed_rc=$?
  fi
  [ "$removed_rc" -eq 0 ] \
    || fail "the body must run on a diff that removes a gitlink (err: $(tail -c 300 "$tmp/removed-body.err"))"
  grep -qE '^  sub2  \(removed\)$' "$tmp/removed-body.txt" \
    || fail "a REMOVED path must render a (removed) row naming it"
  grep -qE '^  sub2  [^ ]+  [^ ]+  [!=]$' "$tmp/removed-body.txt" \
    && fail "a REMOVED path must NOT render a comparison row — it carries no staged pin to compare (the pre-fix tree flagged the DELETED pin '!')"
  [ "$(grep -cE '^  sub2  ' "$tmp/removed-body.txt")" -eq 1 ] \
    || fail "a REMOVED path must render exactly ONE row"
  # A removed GITLINK still changes the index's gitlinks — one of the pin check's three
  # commit-carried inputs — so the check is still this diff's coverage, exactly as the
  # commit gate reads it (`:160000 000000` is a gitlink path there too).
  grep -q 'this diff changes 1 of them' "$tmp/removed-body.txt" \
    || fail "a removed gitlink still touches the pin check's commit-carried inputs"

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
  printf '%s\n' "$LEGEND" | grep -q 'is rendered `  <path>  (removed)`' \
    || fail "legend must keep the removed-row clause (a removal is not a divergence)"

  echo "sync-pin-evidence: self-test OK (compact <path> <staged> <remote> <flag> rows both ways; coverage both directions; bounded_rows emits all under budget and >=1 + elision notice over budget; staged-gitlink reads the index + falls back to HEAD; a REMOVED gitlink renders a (removed) row and NO comparison row; evidence_legend states BOTH readings of a non-distro-* ! and the check that tells them apart)"
  exit 0
fi

ROOT="${1:?usage: sync-pin-evidence.sh <root> <pin-check-log>}"
PIN_CHECK_LOG="${2:?usage: sync-pin-evidence.sh <root> <pin-check-log>}"
cd "$ROOT"

MOVED="$(cat)"
MOVED_COUNT=$(printf '%s\n' "$MOVED" | grep -c . || true); MOVED_COUNT=${MOVED_COUNT:-0}

evidence_legend
# Render every row to a temp file, THEN bound — never pipe the producer into the bounder.
# This environment ignores SIGPIPE, so an early-exiting bounder would leave the producer
# writing to a closed pipe; under `set -o pipefail` those failed writes would abort the
# script. A file sidesteps that entirely (only a few hundred rows).
scratch ROWS_FILE file
GITLINK_COUNT=0; FILE_COUNT=0; REMOVED_COUNT=0
GITLINK_PATHS=""
while IFS= read -r p; do
  [ -n "$p" ] || continue
  if is_removed_path "$ROOT" "$p"; then
    # This diff DELETES the path: the index records nothing for it, so there is no
    # staged pin to compare and no staged blob to name. The row says exactly that.
    removed_row "$p" >> "$ROWS_FILE"
    REMOVED_COUNT=$((REMOVED_COUNT + 1))
    if is_gitlink_path "$ROOT" "$p"; then
      # A removed GITLINK still changes the INDEX's gitlinks — one of the pin check's
      # three commit-carried inputs — so it stays in the gitlink-path set the coverage
      # decision reads. The commit gate reads the SAME set and counts a removal as a
      # gitlink path (`:160000 000000`), so the two must not disagree.
      GITLINK_PATHS="${GITLINK_PATHS}${p}"$'\n'
    fi
  elif is_gitlink_path "$ROOT" "$p"; then
    pin_row "$p" "$(staged_gitlink "$ROOT" "$p")" \
      "$(git ls-remote "$(git config -f .gitmodules --get "submodule.$p.url" 2>/dev/null || echo '')" HEAD 2>/dev/null | awk '{print $1}' || echo '')" \
      >> "$ROWS_FILE"
    GITLINK_COUNT=$((GITLINK_COUNT + 1))
    GITLINK_PATHS="${GITLINK_PATHS}${p}"$'\n'
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
  printf 'GITLINK_COUNT=%s\nFILE_COUNT=%s\nREMOVED_COUNT=%s\n' \
    "$GITLINK_COUNT" "$FILE_COUNT" "$REMOVED_COUNT" > "$SYNC_EVIDENCE_TYPE_OUT"
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
# The pin contract's commit-carried inputs THIS diff touches — named, because a body
# that says "the check covers this diff" without saying WHICH input changed is a claim
# a reader cannot check.
TOUCHED_INPUTS=""
TOUCHED_COUNT=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  if pin_contract_is_declaration_input "$p" || printf '%s\n' "$GITLINK_PATHS" | grep -qxF -- "$p"; then
    TOUCHED_COUNT=$((TOUCHED_COUNT + 1))
    TOUCHED_INPUTS="${TOUCHED_INPUTS}${TOUCHED_INPUTS:+, }${p}"
  fi
done <<< "$MOVED"

# The DECISION — the shared rule (scripts/pin-contract-inputs.sh), the same one the
# commit gate's change class reads. Both ask the same question: can this diff violate
# the pin check?
if pin_contract_touches_input "$MOVED" "$GITLINK_PATHS"; then
  COVERED=1
else
  COVERED=0
fi

if [ "$(coverage_note "$COVERED")" = "PIN_CHECK_IS_COVERAGE" ]; then
  echo "**The pin check — the gate that judges this diff's pin-contract inputs**"
  echo "(\`charly task pin-check\`). It reads the index's gitlinks, the manifest that"
  echo "declares the pin contract (\`charly.yml\`) and the declared path set"
  echo "(\`.gitmodules\`), and **this diff changes ${TOUCHED_COUNT} of them**"
  echo "(${TOUCHED_INPUTS}), so that gate CAN fail on it. The check reads charly's own"
  echo "gitlinks with \`git ls-tree\` (tree objects — present in a shallow clone; this"
  echo "half reads charly's own tree, NOT its nested checkouts) and asserts every umbrella"
  echo "\`distro-*\` gitlink equals it, then audits every submodule's checkout against its"
  echo "recorded gitlink, pasted verbatim from this run:"
  echo
  echo '```'
  cat "$PIN_CHECK_LOG"
  echo '```'
else
  echo "**The pin check is NOT offered as this diff's coverage:** **this diff changes NONE"
  echo "of the pin contract's commit-carried inputs** (no gitlink, the manifest"
  echo "\`charly.yml\`, the declared path set \`.gitmodules\`), so that gate cannot fail on"
  echo "this diff. For transparency the pin-check gate still ran and passed:"
  echo
  echo '```'
  cat "$PIN_CHECK_LOG"
  echo '```'
fi
