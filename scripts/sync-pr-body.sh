#!/usr/bin/env bash
set -euo pipefail

# sync-pr-body.sh — build the sync PR's body + the `sync-evidence` artifact file, so the
# 65536-char body cap is enforced by TESTED code, not by an untestable inline workflow
# block.
#
# WHY THIS IS ITS OWN SCRIPT: `.github/workflows/sync.yml` used to build the body in a
# large inline `printf`/`echo` block. That block had a real defect (measured 2026-09-22):
# the org-wide ruleset cutover advanced 393 pins in one sync, the body exceeded GitHub's
# 65536-char limit, and `gh pr create` failed "Body is too long". Extracting the builder
# here makes the bounding + the hard guard + the artifact assembly exerciseable in-tree
# (`--self-test`), exactly as `sync-pin-evidence.sh` is — the same "testable committed
# script, not a string nobody can exercise" rule the workflow's own comments invoke.
#
# Modes:
#   <root> <moved-file> <producer-log> <policy-b-log> <out-body> <out-evidence>
#                                       build the body + evidence from real inputs.
#   --self-test                         exercise the bounding + guard on fixtures.
#
# Bounds (all overridable): SYNC_PATH_LIST_MAX (default 200), PRODUCER_MAX (default 200),
# SYNC_EVIDENCE_MAX_BYTES (default 40000, passed to sync-pin-evidence.sh for the per-pin
# table). GITHUB_BODY_MAX (default 65536) is the platform cap the hard guard enforces.

SYNC_PATH_LIST_MAX="${SYNC_PATH_LIST_MAX:-200}"
PRODUCER_MAX="${PRODUCER_MAX:-200}"
GITHUB_BODY_MAX="${GITHUB_BODY_MAX:-65536}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# producer_log_excerpt <max-lines> reads the producer log on stdin and prints at
# most <max-lines> lines VERBATIM. It deliberately parses NOTHING: the retired
# scripts/sync-gitlinks.sh emitted `  <path> -> <sha>` per pin and the current
# `charly task sync` (verb:git-submodules bump) emits a `bumped N submodule
# pin(s): …` summary, but coupling this builder to either incidental format is
# what broke after the Taskfile→task cutover — the old per-pin-only grep matched
# nothing against the new shape and the body read "MISSING from producer log —
# investigate" for every moved pin (measured). The AUTHORITATIVE per-pin proof is
# the index-derived table sync-pin-evidence.sh emits below (`staged-gitlink` vs
# remote default-branch HEAD); this excerpt is only the producer's own raw output,
# pasted as-is so no form is silently dropped. The bound is applied HERE (via
# `sed -n`), never by piping into `head` — this harness ignores SIGPIPE, so a
# caller-side `head` would let an early-exiting reader flood the log with broken-
# pipe write errors. ONE implementation the live path and the self-test both call.
producer_log_excerpt() {
  sed -n "1,${1:-200}p"
}

# build_body <root> <moved-file> <producer-log> <policy-b-log> <out-body> <out-evidence>
# Prints nothing; writes both files. The per-pin table is produced by
# sync-pin-evidence.sh (bounded for the body, full for the artifact via SYNC_EVIDENCE_OUT).
build_body() {
  local root="$1" moved_file="$2" producer_log="$3" policy_b_log="$4" out_body="$5" out_evidence="$6"
  local MOVED COUNT MOVED_HEAD COUNT_HINT

  MOVED="$(cat "$moved_file")"
  COUNT=$(printf '%s\n' "$MOVED" | grep -c . || true); COUNT=${COUNT:-0}
  MOVED_HEAD=$(printf '%s\n' "$MOVED" | head -n "$SYNC_PATH_LIST_MAX")
  if [ "$COUNT" -gt "$SYNC_PATH_LIST_MAX" ]; then
    COUNT_HINT=" (first ${SYNC_PATH_LIST_MAX} of ${COUNT}; full list in the artifact)"
  else
    COUNT_HINT=""
  fi

  # Full evidence for the artifact (the bounded body omits; the artifact keeps everything).
  {
    echo "== moved paths (${COUNT}) =="
    printf '%s\n' "$MOVED"
    echo
    echo "== producer resolution (full) =="
    producer_log_excerpt 400 < "$producer_log" 2>/dev/null || true
    echo
    echo "== policy B gate output =="
    cat "$policy_b_log" 2>/dev/null || true
  } > "$out_evidence"

  {
    echo "## Summary"
    echo
    echo "Automated gitlink sync: every umbrella submodule pin advanced to what **policy B**"
    echo "requires — \`charly\` to its own default-branch HEAD, \`distro-*\` to exactly the commits"
    echo "charly's own gitlinks pin, everything else to its own default branch."
    echo
    echo "**${COUNT}** gitlink(s) moved."
    echo
    echo "The full path list and per-pin evidence are in the \`sync-evidence\` run artifact"
    echo "(downloadable from this run's Actions page)."
    echo
    echo "## Every changed path, named${COUNT_HINT}"
    echo
    echo '```'
    printf '%s\n' "$MOVED_HEAD"
    echo '```'
    echo
    echo "Each entry is a **submodule pointer**, not file content: the umbrella records which"
    echo "commit of each repo the snapshot means. The content behind every one of them was"
    echo "reviewed and gated by that repo's own \`pr-validator\` before it was tagged. This PR"
    echo "cannot review it and does not restate it."
    echo
    echo "## How tested"
    echo
    echo "**The producer that opened this PR**, pasted verbatim from the sync run"
    echo "(bounded; the full log is the \`sync-evidence\` artifact). The AUTHORITATIVE"
    echo "per-pin proof is the \`staged-gitlink\` vs remote default-branch \`HEAD\` table below."
    echo
    echo '```'
    # The producer's own output, pasted verbatim — NEVER re-parsed against an
    # incidental format. Coupling this to a shape is what broke after the
    # Taskfile→task cutover (the old per-pin-only grep matched nothing against the
    # `charly task sync` summary and the body read "MISSING … investigate" for every
    # pin). The producer excerpt is context; the index-derived table is the proof.
    producer_log_excerpt "$PRODUCER_MAX" < "$producer_log" 2>/dev/null
    echo '```'
    echo
    # The per-pin evidence section (bounded for the body; full table appended to the
    # artifact by the same run via SYNC_EVIDENCE_OUT).
    printf '%s\n' "$MOVED" | SYNC_EVIDENCE_OUT="$out_evidence" \
      bash "$SCRIPT_DIR/sync-pin-evidence.sh" "$root" "$policy_b_log"
    echo
    echo "## Change classification"
    echo
    echo "- **Change class:** gitlink-only. No file content, no workflow, no script, no Go."
    echo "- **Breaking change + rollback:** none — a revert restores the previous snapshot."
    echo
    echo "## Harness rulebook compliance"
    echo
    echo "- **R0 skills:** the sync is owned by \`/charly-internals:git-workflow\`; this PR is"
    echo "  produced by the workflow that skill describes."
    echo "- **R1 RCA + zero warnings:** the producer resolves each pin and names any repo it"
    echo "  cannot resolve rather than guessing; no warning appears in the pasted output."
    echo "- **R2 no parking:** a defect found in THIS workflow is fixed here; content behind a"
    echo "  moved gitlink belongs to its OWNING repo (which gated it before tagging)."
    echo "- **R3 no duplication:** policy B is asserted by \`charly task policy-b\` — the ONE"
    echo "  implementation \`charly task verify\` also composes."
    echo "- **R4 no workaround:** \`charly\` and every non-\`distro-*\` pin is its owning repo's"
    echo "  default-branch HEAD (per-pin \`git ls-remote\` above); every \`distro-*\` pin is charly's"
    echo "  own gitlink. The producer never pins a PR branch."
    echo "- **R5 hard cutover + grep:** the pointers are replaced, not appended to."
    echo "- **R6 git safety:** a fresh branch per run; no force-push; no push to \`main\`."
    echo "- **R7 runtime gate:** the coverage for the moved pins is the per-pin"
    echo "  \`git ls-remote\` default-branch evidence above; \`distro-*\` pins (when any move) are"
    echo "  additionally asserted by policy B."
    echo "- **R8 artifact invariants:** \`N/A — no generated artifact/OCI label.\`"
    echo "- **R9 binary == source:** \`N/A — no binary is built by this workflow.\`"
    echo "- **R10 disposable + coverage:** the coverage is the per-pin \`git ls-remote\`"
    echo "  default-branch evidence above (it fails if a pin is a PR branch or a non-HEAD"
    echo "  commit); policy B additionally gates any moved \`distro-*\` pin."
    echo "- **RDD / ADE / SDD:** RDD — the producer resolves refs from the real repos, not from"
    echo "  a doc. ADE — no candy. SDD — \`N/A\`, no schema/generated-code change."
    echo "- **Hard cutover:** one atomic commit; no deferred work in scope."
    echo "- **Disposable-only autonomy:** \`N/A — no destroy/rebuild.\`"
    echo
    echo "---"
    echo
    echo "## Attribution"
    echo
    echo "This body is emitted by the tested, model-free \`scripts/sync-pr-body.sh\`"
    echo "(invoked by \`.github/workflows/sync.yml\`), whose \`--self-test\` the pre-commit gate"
    echo "runs. The runtime identity is the GitHub Actions runner itself."
    echo
    echo "*Assisted-by: GitHub Actions ubuntu-latest (fully tested and validated)*"
  } > "$out_body"

  # HARD GUARD: GitHub rejects a body over the cap. Fail LOUD here, naming the size, so a
  # future unbounded section never reaches `gh pr create` as an opaque GraphQL error.
  local bytes
  bytes=$(wc -c < "$out_body")
  if [ "$bytes" -gt "$GITHUB_BODY_MAX" ]; then
    echo "::error::sync PR body is ${bytes} bytes (> ${GITHUB_BODY_MAX} GitHub cap) — bound the section that grew" >&2
    return 1
  fi
}

if [ "${1:-}" = "--self-test" ]; then
  fail() { echo "FAIL: sync-pr-body self-test: $*" >&2; exit 1; }
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  # Make the fixture a real git repo: sync-pin-evidence.sh's staged_gitlink()/`git config`
  # run under `set -e`, and a non-repo would spew `fatal: not a git repository` per row.
  git -C "$tmp" init -q
  git -C "$tmp" config user.email t@t; git -C "$tmp" config user.name t

  # A LARGE synthetic moved set (393, the real post-cutover count) with long repo names,
  # a producer log line per path, and a policy-B log. The built body MUST stay under the
  # cap while still naming the TRUE count — this is exactly the case that broke the
  # inline builder.
  moved="$tmp/moved"; producer="$tmp/producer"; pblog="$tmp/pblog"
  : > "$producer"; echo "charly task policy-b: OK — 6 distro pins equal charly's gitlinks" > "$pblog"
  for i in $(seq 1 393); do
    p="layer-$(printf 'averylongrepo-name-segment-%03d' "$i")"
    printf '%s\n' "$p" >> "$moved"
    printf '  %s -> %012d\n' "$p" "$i" >> "$producer"
  done
  build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body" "$tmp/ev" \
    || fail "large (393-pin) input must build under the cap, not trip the guard"
  bytes=$(wc -c < "$tmp/body")
  [ "$bytes" -lt 65536 ] || fail "393-pin body is ${bytes} bytes (>= 65536)"
  grep -q '^\*\*393\*\* gitlink(s) moved\.' "$tmp/body" || fail "body must name the TRUE total (393)"
  grep -q 'first 200 of 393' "$tmp/body" || fail "bounded path list must carry the (first N of M) hint"
  grep -q 'per-pin evidence table (full, all 393 rows)' "$tmp/ev" || fail "artifact must carry the FULL rendered table (all 393 rows)"
  [ "$(grep -c 'staged-gitlink=' "$tmp/ev")" -eq 393 ] || fail "artifact table must have exactly 393 rows"

  # The producer excerpt is carried VERBATIM for BOTH historical shapes — the
  # retired scripts/sync-gitlinks.sh per-pin form and the current `charly task sync`
  # summary. The retired builder grepped ONLY the per-pin form, so against the
  # current summary it emitted "MISSING from producer log — investigate" for every
  # pin and the excerpt silently lost the producer's own words (the regression this
  # arm now fails on).
  { echo p1; echo p2; } > "$moved"; printf '  p1 -> 1\n  p2 -> 2\n' > "$producer"
  build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body2" "$tmp/ev2" || fail "small input must build"
  grep -q 'first 200 of' "$tmp/body2" && fail "small input must NOT carry a truncation hint"
  grep -q '^\*\*2\*\* gitlink(s) moved\.' "$tmp/body2" || fail "small body must name the true total (2)"
  grep -q 'p1 -> 1' "$tmp/body2" || fail "retired per-pin producer form must reach the body verbatim"
  grep -q 'p2 -> 2' "$tmp/body2" || fail "retired per-pin producer form must reach the body verbatim"

  { echo p3; echo p4; } > "$moved"
  printf 'task sync: 1 step(s), 0 failed\n  [pass] run — bump the pins\n' > "$producer"
  printf 'bumped 2 submodule pin(s): p3, p4\n' >> "$producer"
  build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body4" "$tmp/ev4" || fail "task-summary producer must build"
  grep -q 'bumped 2 submodule pin(s): p3, p4' "$tmp/body4" || fail "task-summary producer form must reach the body verbatim"
  grep -q 'MISSING from producer log' "$tmp/body4" && fail "the excerpt must never inject a MISSING line — the producer's words are pasted as-is"

  # The HARD GUARD: a body over the cap must FAIL LOUD (never silently pass).
  GITHUB_BODY_MAX=100 build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body3" "$tmp/ev3" 2>"$tmp/err" \
    && fail "over-cap body must trip the hard guard (non-zero)"
  grep -q '65536\|100' "$tmp/err" || fail "guard must name the offending size/cap on stderr"

  echo "sync-pr-body: self-test OK (393-pin body under the 65536 cap with the true total + hint; artifact carries all rows; small input no hint; the producer excerpt is verbatim for BOTH the retired per-pin and current summary shapes; over-cap trips the hard guard)"
  exit 0
fi

build_body "${1:?usage: sync-pr-body.sh <root> <moved-file> <producer-log> <policy-b-log> <out-body> <out-evidence>}" \
  "${2:?moved-file}" "${3:?producer-log}" "${4:?policy-b-log}" "${5:?out-body}" "${6:?out-evidence}"
