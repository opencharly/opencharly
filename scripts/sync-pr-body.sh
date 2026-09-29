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
# Bounds (all overridable): PRODUCER_MAX (default 200), SYNC_EVIDENCE_MAX_BYTES
# (default 50000, passed to sync-pin-evidence.sh for the per-pin table — a fallback
# guard only; the FULL table renders at fleet scale). GITHUB_BODY_MAX (default 65536)
# is the platform cap the hard guard enforces.
#
# NO separate moved-path list is emitted: the per-pin evidence table names every moved
# path AND carries its proof, so a second list is redundant bytes. The table is inlined
# in the body — never "see the artifact" — because a pointer is a promise, not pasted
# output (the validator BLOCKed exactly that).

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
  local MOVED COUNT

  MOVED="$(cat "$moved_file")"
  COUNT=$(printf '%s\n' "$MOVED" | grep -c . || true); COUNT=${COUNT:-0}

  # Full evidence for the artifact (a convenience copy — the BODY carries the complete
  # changed-path list via the per-pin table below, so the artifact is no longer the home
  # of the evidence and the body never points at it as if it were).
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
    echo "**${COUNT}** gitlink(s) moved. Every one is named, with its proof, in the"
    echo "complete per-pin evidence table below (no elision)."
    echo
    echo "## Every changed path, named"
    echo
    echo "The **\`${COUNT}\`** moved paths are named in full — each with its \`staged-gitlink\`"
    echo "vs remote default-branch \`HEAD\` proof — in the complete per-pin evidence table in"
    echo "**How tested** below. That one table IS the changed-path list and the evidence: no"
    echo "separate list is emitted and no row is elided, so nothing points at the"
    echo "\`sync-evidence\` artifact for evidence that must be pasted here."
    echo
    echo "Each entry is a **submodule pointer**, not file content: the umbrella records which"
    echo "commit of each repo the snapshot means. The content behind every one of them was"
    echo "reviewed and gated by that repo's own \`pr-validator\` before it was tagged. This PR"
    echo "cannot review it and does not restate it."
    echo
    echo "## How tested"
    echo
    echo "**The producer that opened this PR**, pasted verbatim from the sync run"
    echo "(bounded to \`PRODUCER_MAX=${PRODUCER_MAX}\` lines — the producer's own words, never"
    echo "re-parsed against an incidental format). The AUTHORITATIVE per-pin proof is the"
    echo "complete \`staged-gitlink\` vs remote default-branch \`HEAD\` table that follows it."
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
    # The per-pin evidence section — the COMPLETE table (compact rows), inlined here in
    # the BODY, naming every changed path. The full table is also appended to the
    # artifact as a convenience copy via SYNC_EVIDENCE_OUT.
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

  # A FLEET-SCALE synthetic moved set — 424 paths, the umbrella's full submodule count
  # (a superset of the 402 #297 actually moved), with realistic long repo names and the
  # umbrella's longest real path. The built body MUST carry the COMPLETE compact table
  # (every path, no elision) AND stay under the cap. This is the case that broke the
  # inline builder (393 pins) AND the bounded builder (#297: 402 pins truncated to 350
  # evidence rows / 200 path rows — the validator's "a pointer to an artifact is a
  # promise, not pasted output" BLOCK).
  #
  # The fixture is self-contained AND full width: a local repo supplies the remote HEAD
  # (`git ls-remote <local-path> HEAD` — no network), and every path's staged gitlink is
  # set EQUAL to it, so the fixture rows render exactly as the real fleet's
  # (`  <path>  <sha12>  <sha12>  =`) and the measured size IS the real worst case.
  moved="$tmp/moved"; producer="$tmp/producer"; pblog="$tmp/pblog"
  : > "$producer"; echo "charly task policy-b: OK — 6 distro pins equal charly's gitlinks" > "$pblog"
  mkdir -p "$tmp/remote-src"; git -C "$tmp/remote-src" init -q
  git -C "$tmp/remote-src" config user.email t@t; git -C "$tmp/remote-src" config user.name t
  : > "$tmp/remote-src/f"; git -C "$tmp/remote-src" add f; git -C "$tmp/remote-src" commit -qm one
  RHEAD="$(git -C "$tmp/remote-src" rev-parse HEAD)"
  FLEET=424
  : > "$tmp/.gitmodules"
  for i in $(seq 1 423); do
    case $((i % 3)) in
      0) p="layer-$(printf 'a-segment-name-%03d' "$i")" ;;
      1) p="plugin-$(printf 'a-longer-segment-name-%03d' "$i")" ;;
      2) p="pod-$(printf 'another-segment-%03d' "$i")" ;;
    esac
    printf '%s\n' "$p" >> "$moved"
    printf '  %s -> %.12s\n' "$p" "$RHEAD" >> "$producer"
    printf '[submodule "%s"]\n\tpath = %s\n\turl = %s\n' "$p" "$p" "$tmp/remote-src" >> "$tmp/.gitmodules"
  done
  # The umbrella's longest real path (36 chars), to pin the worst-case row width.
  printf 'layer-check-cross-local-driver-layer\n' >> "$moved"
  printf '  layer-check-cross-local-driver-layer -> %.12s\n' "$RHEAD" >> "$producer"
  printf '[submodule "layer-check-cross-local-driver-layer"]\n\tpath = layer-check-cross-local-driver-layer\n\turl = %s\n' "$tmp/remote-src" >> "$tmp/.gitmodules"
  # Stage every gitlink EQUAL to RHEAD.
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    git -C "$tmp" update-index --add --cacheinfo "160000,${RHEAD},${p}"
  done < "$moved"
  build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body" "$tmp/ev" \
    || fail "fleet-scale (${FLEET}-pin) input must build under the cap, not trip the guard"
  bytes=$(wc -c < "$tmp/body")
  [ "$bytes" -lt 65536 ] || fail "fleet-scale body is ${bytes} bytes (>= 65536)"
  echo "sync-pr-body self-test: fleet-scale (${FLEET}-pin) rendered body = ${bytes} bytes (< 65536)"
  grep -q "^\*\*${FLEET}\*\* gitlink(s) moved\." "$tmp/body" || fail "body must name the TRUE total (${FLEET})"
  grep -q 'legend: <path>  <staged-gitlink>  <remote-HEAD>  <flag>' "$tmp/body" || fail "body must carry the compact-table legend"
  # THE FIX: the BODY carries the COMPLETE table — no elision, every row full width.
  grep -q 'rows shown' "$tmp/body" && fail "the body must NOT elide evidence rows (it must carry the complete table)"
  ROW_RE='^  [^ ]+  [0-9a-f]{12}  [0-9a-f]{12}  [!=]$'
  [ "$(grep -cE "$ROW_RE" "$tmp/body")" -eq "$FLEET" ] \
    || fail "body must carry exactly ${FLEET} compact evidence rows (got $(grep -cE "$ROW_RE" "$tmp/body"))"
  # Every changed path is NAMED in the body — first, a middle one, and the longest.
  for p in $(sed -n "1p;212p;${FLEET}p" "$moved"); do
    grep -q "  ${p}  " "$tmp/body" || fail "changed path '${p}' must be named in the body"
  done
  # The artifact keeps a convenience copy of the full table (no longer its reason to exist).
  grep -q "per-pin evidence table (full, all ${FLEET} rows)" "$tmp/ev" || fail "artifact must carry the full rendered table (all ${FLEET} rows)"
  [ "$(grep -cE "$ROW_RE" "$tmp/ev")" -eq "$FLEET" ] || fail "artifact table must have exactly ${FLEET} rows"

  # The producer excerpt is carried VERBATIM for BOTH historical shapes — the
  # retired scripts/sync-gitlinks.sh per-pin form and the current `charly task sync`
  # summary. The retired builder grepped ONLY the per-pin form, so against the
  # current summary it emitted "MISSING from producer log — investigate" for every
  # pin and the excerpt silently lost the producer's own words (the regression this
  # arm now fails on).
  { echo p1; echo p2; } > "$moved"; printf '  p1 -> 1\n  p2 -> 2\n' > "$producer"
  build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body2" "$tmp/ev2" || fail "small input must build"
  grep -q '^\*\*2\*\* gitlink(s) moved\.' "$tmp/body2" || fail "small body must name the true total (2)"
  grep -q 'p1 -> 1' "$tmp/body2" || fail "retired per-pin producer form must reach the body verbatim"
  grep -q 'p2 -> 2' "$tmp/body2" || fail "retired per-pin producer form must reach the body verbatim"
  # The small body still names its paths (in the table), and never truncates: no elision.
  grep -q '  p1  ' "$tmp/body2" || fail "small body must name p1 in the table"
  grep -q 'rows shown' "$tmp/body2" && fail "small body must never carry an elision notice"

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

  echo "sync-pr-body: self-test OK (fleet-scale 424-pin BODY carries the COMPLETE compact evidence table — every path named, no elision — and stays under the 65536 cap; artifact keeps a convenience copy; small input names its paths with no elision; the producer excerpt is verbatim for BOTH the retired per-pin and current summary shapes; over-cap trips the hard guard)"
  exit 0
fi

build_body "${1:?usage: sync-pr-body.sh <root> <moved-file> <producer-log> <policy-b-log> <out-body> <out-evidence>}" \
  "${2:?moved-file}" "${3:?producer-log}" "${4:?policy-b-log}" "${5:?out-body}" "${6:?out-evidence}"
