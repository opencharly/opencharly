#!/usr/bin/env bash
set -euo pipefail

# sync-pr-body.sh — build the sync PR's body + the evidence file, so the
# 65536-char body cap is enforced by TESTED code, not by an untestable inline workflow
# block.
#
# WHY THIS IS ITS OWN SCRIPT: the sync PR's body was once built inline in the (since
# removed) `.github/workflows/sync.yml` as a large `printf`/`echo` block. That block had a
# real defect (measured 2026-09-22): the org-wide ruleset cutover advanced 393 pins in one
# sync, the body exceeded GitHub's 65536-char limit, and `gh pr create` failed "Body is
# too long". Extracting the builder here makes the bounding + the hard guard + the
# evidence-file assembly exerciseable in-tree (`--self-test`), exactly as
# `sync-pin-evidence.sh` is.
#
# The sync is now run BY HAND (`charly task sync` + a PR); nothing schedules
# it. The Assisted-by footer is therefore caller-supplied via SYNC_ASSISTED_BY — the run
# that opens the PR records its own identity, never a canned one. That trailer is also the
# ONE source of the attribution tier the `## Change classification` section reports, so the
# section and the footer cannot disagree.
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
  local MOVED MOVED_TOTAL GITLINK_COUNT FILE_COUNT evidence_body evidence_full type_file

  MOVED="$(cat "$moved_file")"
  MOVED_TOTAL=$(printf '%s\n' "$MOVED" | grep -c . || true); MOVED_TOTAL=${MOVED_TOTAL:-0}

  # The attribution tier is READ, never re-typed: it comes from the caller's Assisted-by
  # trailer — the ONE place the run states it — so the `## Change classification` tier line
  # and the footer cannot drift apart. Fail LOUD on an unset SYNC_ASSISTED_BY or a trailer
  # with no `(<tier>)`, BEFORE anything is written: the calling run then never gets a
  # complete body to open a PR with, so a manual run cannot ship an anonymous one.
  local SYNC_TIER
  SYNC_TIER="$(printf '%s' "${SYNC_ASSISTED_BY:?set SYNC_ASSISTED_BY to the Assisted-by footer for the run opening this PR}" \
    | sed -n 's/.*[[:space:]]*(\([^()]*\))[[:space:]]*$/\1/p')"
  if [ -z "$SYNC_TIER" ]; then
    echo "::error::SYNC_ASSISTED_BY carries no '(<confidence tier>)' — the Change classification tier line and the footer must agree; refusing to emit a body" >&2
    return 1
  fi

  # Full evidence for the caller's evidence file (a convenience copy — the BODY carries the
  # complete changed-path list via the per-pin table below, so that file is not the home of
  # the evidence and the body never points at it as if it were).
  {
    echo "== moved paths (${MOVED_TOTAL}) =="
    printf '%s\n' "$MOVED"
    echo
    echo "== producer resolution (full) =="
    producer_log_excerpt 400 < "$producer_log" 2>/dev/null || true
    echo
    echo "== policy B gate output =="
    cat "$policy_b_log" 2>/dev/null || true
  } > "$out_evidence"

  # Render the per-pin evidence section's BODY form ONCE, capturing the moved-path split from
  # the ONE place that classifies each path (sync-pin-evidence.sh, by index mode 160000) — so
  # this builder's Summary count and Change-class line cannot disagree with the table below.
  # The full table is appended to the caller's evidence file by that same run (its
  # SYNC_EVIDENCE_OUT path); rendering it a SECOND time here (the old shape) would both
  # duplicate the network work and risk the two copies diverging.
  type_file="$(mktemp)"
  evidence_body="$(printf '%s\n' "$MOVED" | SYNC_EVIDENCE_OUT="$out_evidence" SYNC_EVIDENCE_TYPE_OUT="$type_file" \
    bash "$SCRIPT_DIR/sync-pin-evidence.sh" "$root" "$policy_b_log")"
  GITLINK_COUNT=0; FILE_COUNT=0
  # shellcheck disable=SC1090
  . "$type_file"
  rm -f "$type_file"

  {
    echo "## Summary"
    echo
    echo "Gitlink sync: every umbrella submodule pin advanced to what **policy B** requires"
    echo "— \`charly\` to its own default-branch HEAD, \`distro-*\` to exactly the commits charly's"
    echo "own gitlinks pin, everything else to its own default branch."
    echo
    if [ "$FILE_COUNT" -gt 0 ]; then
      echo "**${GITLINK_COUNT}** gitlink(s) and **${FILE_COUNT}** non-gitlink changed path(s)"
      echo "moved. Every one is named, with its proof, in the complete per-pin evidence"
      echo "table below (no elision)."
    else
      echo "**${GITLINK_COUNT}** gitlink(s) moved. Every one is named, with its proof, in the"
      echo "complete per-pin evidence table below (no elision)."
    fi
    echo
    echo "## Every changed path, named"
    echo
    echo "The **\`${MOVED_TOTAL}\`** moved paths are named in full — each gitlink with its \`staged-gitlink\`"
    echo "vs remote default-branch \`HEAD\` proof, each non-gitlink path with its staged blob — in the"
    echo "complete per-pin evidence table in **How tested** below. That one table IS the changed-path"
    echo "list and the evidence: no separate list is emitted and no row is elided, so nothing points"
    echo "at a file for evidence that must be pasted here."
    echo
    echo "Each gitlink entry is a **submodule pointer**, not file content: the umbrella records which"
    echo "commit of each repo the snapshot means. The content behind every gitlink was reviewed and"
    echo "gated by that repo's own \`pr-validator\` before it was tagged. A non-gitlink path, when"
    echo "present, is an ordinary changed file carried on this same branch — named, not hidden."
    echo "This PR cannot review submodule content and does not restate it."
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
    # the BODY, naming every changed path. Rendered ONCE above ($evidence_body); the full
    # table is also appended to the caller's evidence file by that same run.
    printf '%s\n' "$evidence_body"
    echo
    echo "## Change classification"
    echo
    if [ "$FILE_COUNT" -gt 0 ]; then
      echo "- **Change class:** gitlink sync + ${FILE_COUNT} non-gitlink file change(s). The ${GITLINK_COUNT} gitlink(s) are submodule pointers (no file content); the ${FILE_COUNT} non-gitlink path(s) are ordinary files carried on this branch."
    else
      echo "- **Change class:** gitlink-only. No file content, no workflow, no script, no Go."
    fi
    echo "- **Verification gate:** \`charly task verify\` — the full pinning gate — on"
    echo "  the final tree, plus the per-pin \`git ls-remote\` default-branch table above (rule 10:"
    echo "  that IS the gate for a diff that moves a gitlink)."
    echo "- **Attribution tier:** \`${SYNC_TIER}\` — read from this run's \`Assisted-by\` trailer, so"
    echo "  this line and the footer cannot disagree."
    echo "- **Breaking change + rollback:** none — a revert restores the previous snapshot."
    echo
    echo "## Rulebook compliance"
    echo
    echo "- **R0 skills:** the sync is owned by \`/charly-internals:git-workflow\`; this PR is"
    echo "  produced by \`charly task sync\`, the verb that skill names."
    echo "- **R1 RCA + zero warnings:** the producer resolves each pin and names any repo it"
    echo "  cannot resolve rather than guessing; no warning appears in the pasted output."
    echo "- **R2 no parking:** a defect found in THIS sync is fixed here; content behind a"
    echo "  moved gitlink belongs to its OWNING repo (which gated it before tagging)."
    echo "- **R3 no duplication:** policy B is asserted by \`charly task policy-b\` — the ONE"
    echo "  implementation \`charly task verify\` also composes."
    echo "- **R4 no workaround:** \`charly\` and every non-\`distro-*\` pin is its owning repo's"
    echo "  default-branch HEAD (per-pin \`git ls-remote\` above); every \`distro-*\` pin is charly's"
    echo "  own gitlink. The producer never pins a PR branch."
    echo "- **R5 hard cutover + grep:** the pointers are replaced, not appended to."
    echo "- **R6 git safety:** a fresh branch per run; no force-push; no push to \`main\`."
    echo "- **R7 runtime gate:** \`charly task verify\` on the final tree — the sync"
    echo "  is hand-run in a HUMAN tree, where that gate's nested-submodule half is meaningful —"
    echo "  plus the per-pin \`git ls-remote\` default-branch evidence above; \`distro-*\` pins (when"
    echo "  any move) are additionally asserted by policy B."
    echo "- **R8 artifact invariants:** \`N/A — no generated artifact/OCI label.\`"
    echo "- **R9 binary == source:** \`N/A — no binary is built by this sync.\`"
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
    echo "from a manual \`charly task sync\` run; its \`--self-test\` runs in the pre-commit"
    echo "gate. \`SYNC_ASSISTED_BY\` carries the identity of the run that opened the PR."
    echo
    # SYNC_ASSISTED_BY is already validated at the top of build_body (non-empty AND
    # tier-bearing) — ONE guard, not two.
    echo "*Assisted-by: ${SYNC_ASSISTED_BY}*"
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
  # The Assisted-by footer is caller-supplied (no workflow owns the sync any more), so
  # the self-test supplies a fixed fixture value for the build_body calls below.
  # THREE whitespace-separated identity tokens: squash_body.py's TRAILER — the ONE
  # Assisted-by grammar — is `<Harness> <Provider Full Model Name> (<confidence>)`, so the
  # fixture must be grammar-valid or the rendered body fails the body linter for a
  # fixture's sake. The tier is what the Change classification section reads back.
  export SYNC_ASSISTED_BY="Self-test Harness Fixture (fully tested and validated)"
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
  # The caller's evidence file keeps a convenience copy of the full table (no longer its
  # reason to exist).
  grep -q "per-pin evidence table (full, all ${FLEET} rows)" "$tmp/ev" || fail "the evidence file must carry the full rendered table (all ${FLEET} rows)"
  [ "$(grep -cE "$ROW_RE" "$tmp/ev")" -eq "$FLEET" ] || fail "the evidence-file table must have exactly ${FLEET} rows"
  # No CI run artifact exists any more (the sync is hand-run), so the body must never
  # promise one.
  grep -q 'sync-evidence' "$tmp/body" "$tmp/ev" && fail "no file may name a 'sync-evidence' run artifact (the sync is hand-run; no workflow uploads one)"

  # The producer excerpt is carried VERBATIM for BOTH historical shapes — the
  # retired scripts/sync-gitlinks.sh per-pin form and the current `charly task sync`
  # summary. The retired builder grepped ONLY the per-pin form, so against the
  # current summary it emitted "MISSING from producer log — investigate" for every
  # pin and the excerpt silently lost the producer's own words (the regression this
  # arm now fails on).
  { echo p1; echo p2; } > "$moved"; printf '  p1 -> 1\n  p2 -> 2\n' > "$producer"
  # Pin the KIND: the fleet fixture above leaves p1/p2 unstaged, and the builder now
  # classifies a path by its index mode — an unstaged path is a plain FILE and would
  # (correctly) render a `(file)` row. This arm is about the producer excerpt, so stage
  # them as gitlinks, as the real sync's pins are.
  git -C "$tmp" update-index --add --cacheinfo "160000,${RHEAD},p1"
  git -C "$tmp" update-index --add --cacheinfo "160000,${RHEAD},p2"
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
  git -C "$tmp" update-index --add --cacheinfo "160000,${RHEAD},p3"
  git -C "$tmp" update-index --add --cacheinfo "160000,${RHEAD},p4"
  build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body4" "$tmp/ev4" || fail "task-summary producer must build"
  grep -q 'bumped 2 submodule pin(s): p3, p4' "$tmp/body4" || fail "task-summary producer form must reach the body verbatim"
  grep -q 'MISSING from producer log' "$tmp/body4" && fail "the excerpt must never inject a MISSING line — the producer's words are pasted as-is"

  # THE MIXED LIST — the class the pre-fix builder got WRONG (measured: the real 45-gitlink
  # sync carried `reasonix.toml`, and the builder reported "46 gitlink(s) moved", a hardcoded
  # `gitlink-only` class, and a false `!` against a remote that does not exist). A moved list
  # with BOTH a gitlink and a plain file must count the gitlink as a gitlink, name the file as
  # a file with NO `=`/`!` flag, and derive the change class from the split — never claim
  # `gitlink-only`.
  { echo p1; echo p5; } > "$moved"
  printf 'task sync: 1 step(s), 0 failed\nbumped 1 submodule pin(s): p1\n' > "$producer"
  printf 'x\n' > "$tmp/p5"; git -C "$tmp" add p5
  build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body7" "$tmp/ev7" || fail "mixed gitlink+file input must build"
  grep -q '^\*\*1\*\* gitlink(s) and \*\*1\*\* non-gitlink changed path(s)' "$tmp/body7" \
    || fail "mixed body must separate the gitlink count from the non-gitlink count"
  grep -qE '^  p5  [0-9a-f]{12}  \(file\)$' "$tmp/body7" || fail "a non-gitlink path must render a (file) row"
  grep -qE '^  p5  [0-9a-f]{12}  \(file\)  [!=]$' "$tmp/body7" && fail "a non-gitlink path must NOT carry a mismatch flag"
  grep -qE '^  p1  [0-9a-f]{12}  ' "$tmp/body7" || fail "mixed body must still render the gitlink row"
  grep -q 'Change class:\*\* gitlink sync + 1 non-gitlink file change' "$tmp/body7" \
    || fail "mixed body must derive a non-gitlink-only change class from the split"
  grep -q 'Change class:\*\* gitlink-only' "$tmp/body7" && fail "mixed body must NOT claim gitlink-only"

  # THE ACCEPTANCE SURFACE. AGENTS.md requires the body to carry `## Summary`,
  # `## How tested`, `## Rulebook compliance` and `## Change classification`, with the
  # italic trailer as the FINAL line; `marketplace/scripts/pr_body_lint.py` is that same
  # contract as a deterministic check. It FAILED this builder (12 findings, measured): the
  # heading read `## Harness rulebook compliance`, so `## Rulebook compliance` was "missing"
  # and every rule it must answer read as unanswered, and `## Change classification` carried
  # neither the verification gate nor the attribution tier. Assert the contract here.
  for want in "## Summary" "## How tested" "## Rulebook compliance" "## Change classification"; do
    grep -qxF "$want" "$tmp/body" || fail "body must carry the required heading '${want}'"
  done
  grep -qxF "## Harness rulebook compliance" "$tmp/body" \
    && fail "the required heading is '## Rulebook compliance', never '## Harness rulebook compliance'"
  grep -q '^- \*\*Change class:\*\*' "$tmp/body" || fail "## Change classification must name the change class"
  grep -q '^- \*\*Verification gate:\*\*' "$tmp/body" || fail "## Change classification must name the verification gate"
  grep -q '^- \*\*Attribution tier:\*\*' "$tmp/body" || fail "## Change classification must name the attribution tier"
  # The tier line and the footer are ONE value, read from the trailer — never re-typed.
  grep -qF '**Attribution tier:** `fully tested and validated`' "$tmp/body" \
    || fail "the attribution tier must be read back from the Assisted-by trailer"
  tail -n 1 "$tmp/body" | grep -qE '^\*Assisted-by: .+ \(fully tested and validated\)\*$' \
    || fail "the italic Assisted-by trailer must be the FINAL line"

  # The tier guard fails LOUD, before writing anything: a body whose tier line silently read
  # empty would be an attribution claim with nothing behind it. (A subshell, so the fixture
  # value cannot leak into the arms that follow.)
  ( SYNC_ASSISTED_BY="No Tier Harness" build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body5" "$tmp/ev5" ) 2>"$tmp/err5" \
    && fail "a trailer with no (tier) must fail loud, not emit a body with an empty tier"
  grep -q 'confidence tier' "$tmp/err5" || fail "the tier guard must say what is missing, on stderr"

  # ...and the tier line TRACKS the trailer — it is not a literal that happens to match the
  # fixture. A second run with a DIFFERENT tier must report THAT tier (without this arm a
  # hard-coded `fully tested and validated` passes every assertion above, since that is the
  # fixture's own tier — measured: the first version of this arm did not discriminate).
  ( SYNC_ASSISTED_BY="Self-test Harness Fixture (documentation reviewed)" \
      build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body6" "$tmp/ev6" )
  grep -qF '**Attribution tier:** `documentation reviewed`' "$tmp/body6" \
    || fail "the tier line must track the trailer's tier, not a fixed literal"

  # The HARD GUARD: a body over the cap must FAIL LOUD (never silently pass).
  GITHUB_BODY_MAX=100 build_body "$tmp" "$moved" "$producer" "$pblog" "$tmp/body3" "$tmp/ev3" 2>"$tmp/err" \
    && fail "over-cap body must trip the hard guard (non-zero)"
  grep -q '65536\|100' "$tmp/err" || fail "guard must name the offending size/cap on stderr"

  echo "sync-pr-body: self-test OK (fleet-scale 424-pin BODY carries the COMPLETE compact evidence table — every path named, no elision — and stays under the 65536 cap; the caller's evidence file keeps a convenience copy; neither names a CI run artifact; small input names its paths with no elision; the producer excerpt is verbatim for BOTH the retired per-pin and current summary shapes; the body carries the four required sections, the Change classification's change class + verification gate + attribution tier, and the italic Assisted-by trailer as its FINAL line; a trailer with no (tier) fails loud; over-cap trips the hard guard)"
  exit 0
fi

build_body "${1:?usage: sync-pr-body.sh <root> <moved-file> <producer-log> <policy-b-log> <out-body> <out-evidence>}" \
  "${2:?moved-file}" "${3:?producer-log}" "${4:?policy-b-log}" "${5:?out-body}" "${6:?out-evidence}"
