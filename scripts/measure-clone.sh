#!/usr/bin/env bash
# measure-clone.sh — measure the umbrella's clone shapes from FRESH clones of the tree
# under test, and print every reading.
#
# WHY IT EXISTS (opencharly/opencharly#608): the README's clone-shape table carries
# BANDS — the range the runs produced — and a band that no committed script re-derives
# is a fence about a session: the next edit can restate a figure inside it, and no
# control notices, so the next reader inherits a number that was measured once and
# never re-measured. This script is the MEASUREMENT half;
# `scripts/check-readme-measurements.mjs` is the COMPARISON half — it reads the bands
# the README commits and, with `--samples <log>`, checks every reading this script
# produced against them. One rule, one implementation, two halves (R2).
#
# It is a MANUAL tool: it needs the network, the toolchain, and about ten minutes, so
# it is NOT a `charly task verify` step. Its durable half — the comparison, and the
# self-test that proves the comparison can fail — IS in the gate. The clone path this
# script owns IS in the gate too, through this script's own `--self-test`: a fixture
# of its own, no network, every assertion able to fail.
#
# WHAT IT MEASURES:
#   1. the LIGHT shape — the derived working set, blobless — from THREE fresh clones,
#      so the size and the wall clock are a BAND of samples and not one number;
#   2. the light tree AFTER the bootstrap, because the bootstrap adds the binary and
#      its build cache on top of the clone;
#   3. the FULL shape — every declared path, blobless — from one fresh clone, and the
#      `openclaw` module store inside it, before and after the gate.
# The `--recurse-submodules` baseline (9.5 G) is NOT re-measured: it is the shape this
# recipe replaces, it costs a full checkout of every repo, and its one dated
# measurement is what the README's baseline row quotes.
#
# REQUIREMENTS — checked, and a missing one is NAMED, never a silently empty
# measurement: `git` and `python3` (the initializer's own two) and `go` (the bootstrap
# builds the binary from the `charly` checkout the initializer materialized). The
# self-test needs `git` alone.
#
# The superproject is cloned FROM THIS CHECKOUT (the tree under test is not on the
# remote yet), while every SUBMODULE comes from its own HTTPS URL — the remote's cost
# is the cost a reader pays.
#
# The superproject's clone is made OVER THE TRANSPORT, on the ONE branch that holds
# the tree under test (`--no-local --single-branch`): the LOCAL transport COPIES the
# source's ENTIRE object store — every commit on every branch, including other
# sessions' pushed branches and their loose objects — so a clone made that way
# measures the MACHINE's accumulated store, not the tree. That is measurable, and it
# is what this flag exists to stop: with the tree, the `charly` pin and the built
# version stamp all unchanged, the light clone read 75 M, then 76 M, then 77 M over
# six hours, and the bootstrapped tree read 126, 127, 128 and 129 M — the readings
# drifted with the org's push traffic and the band the README commits rotted with
# them. Over the transport the clone carries the TREE's history, so a reading is a
# property of the tree under test. And the tree under test is fetched BY ITS SHA when
# the clone does not carry it — the source's branch can move while a run is in flight,
# and a run that died there would have measured nothing (see `clone_at` below).
#
# usage: bash scripts/measure-clone.sh [--ref <ref>] [--no-full] [--keep] [--self-test]
#   --ref <ref>  the tree under test (default: HEAD of this checkout)
#   --no-full    skip the --all shape (the slow half: ~2 G and six minutes)
#   --keep       keep the clones (default: they are removed at the end)
#   --self-test  exercise the clone path against a fixture of its own (no network)
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF=""
FULL=1
KEEP=0
SELF_TEST=0
# The tree under test. Empty until it is resolved, and the self-test sets it per
# assertion — so it is declared here rather than left to `set -u` to discover.
SHA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="${2:?--ref needs a ref}"; shift 2 ;;
    --no-full) FULL=0; shift ;;
    --keep) KEEP=1; shift ;;
    --self-test) SELF_TEST=1; shift ;;
    *) echo "measure-clone: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ "$SELF_TEST" = "0" ]; then
  for req in git python3 go; do
    if ! command -v "$req" >/dev/null 2>&1; then
      echo "measure-clone: the measurement needs '$req', and it is not on PATH." >&2
      echo "  install it, or the readings would be empty and the band would be unchecked." >&2
      exit 1
    fi
  done
fi

# --- a fresh clone of the tree under test, carrying the TREE's history ---------
# Over the transport, on ONE branch: the branch that holds the tree under test, so
# the clone carries that branch's history and not the source's whole object store.
# The branch is found from the tree itself — the checkout's own branch when it holds
# the tree, else the first branch that does.
#
# The tree under test is fetched BY ITS SHA when the clone does not carry it, which is
# what happens when the source's branch MOVES while the measurement runs: the clone
# carries the branch as it was at clone time, and a branch that was rewritten no longer
# holds the tree the run resolved. Fetching the SHA carries the tree's own history and
# no other branch's, so the reading is still of the tree. It is also the only way to
# measure a commit on NO branch: a clone of the source's refs would carry every one of
# them — the machine's accumulated store, the defect this script exists to avoid.
#
# And git's own error is never silenced: a measurement that dies must say WHY, or the
# operator is left with a bare "the clone failed" and no way to tell a network failure
# from a moved ref. (Measured: a run whose source branch was rewritten between the
# light and the full shape died with that bare message, while the cause was a ref that
# had moved — the cause was in git's output, which the script threw away.)
clone_at() {  # clone_at <dir>
  local br=""
  local head_br
  local err=""
  local err2=""
  head_br="$(git -C "$ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  if [ -n "$head_br" ] && git -C "$ROOT" merge-base --is-ancestor "$SHA" "$head_br" 2>/dev/null; then
    br="$head_br"
  else
    br="$(git -C "$ROOT" for-each-ref --contains "$SHA" --format='%(refname:short)' refs/heads 2>/dev/null | head -1)"
  fi
  if [ -n "$br" ]; then
    if ! err="$(git clone --no-local --single-branch --branch "$br" --no-checkout "$ROOT" "$1" 2>&1)"; then
      echo "measure-clone: the clone of the tree under test failed:" >&2
      printf '%s\n' "$err" >&2
      return 1
    fi
  else
    # No branch holds the tree under test, so there is no branch to clone: the tree is
    # fetched into an empty repository, which carries the tree and nothing else.
    if ! err="$(git init --quiet "$1" 2>&1)"; then
      echo "measure-clone: the repository for the tree under test could not be created:" >&2
      printf '%s\n' "$err" >&2
      return 1
    fi
  fi
  if ! err="$(git -C "$1" checkout --detach "$SHA" 2>&1)"; then
    # The clone does not carry the tree under test: the source's branch moved between
    # the resolution and the clone, or no branch holds the tree at all. Fetch the tree
    # BY ITS SHA — that carries the tree's own history and no other branch's.
    if ! err2="$(git -C "$1" fetch --no-tags "$ROOT" "$SHA" 2>&1)"; then
      echo "measure-clone: the tree under test ($SHA) is not in the clone, and fetching" >&2
      echo "  it by its SHA failed:" >&2
      printf '%s\n' "$err2" >&2
      echo "  the clone's own checkout of that tree had failed with:" >&2
      printf '%s\n' "$err" >&2
      return 1
    fi
    if ! err2="$(git -C "$1" checkout --detach "$SHA" 2>&1)"; then
      echo "measure-clone: the tree under test ($SHA) could not be checked out." >&2
      echo "  the checkout of the fetched tree failed:" >&2
      printf '%s\n' "$err2" >&2
      echo "  and the clone's first checkout had failed with:" >&2
      printf '%s\n' "$err" >&2
      return 1
    fi
  fi
  return 0
}

# --- the self-test: the clone path, against a fixture of its own --------------
# The measurement is a MANUAL tool — it needs the network, the toolchain and about ten
# minutes — so the only place its clone path can be exercised CHEAPLY is a fixture: a
# source repo of its own, with a tree under test that a branch holds and one that no
# branch holds. Every assertion here can fail, and two of them are the ones the
# pre-fix clone path could not pass: it could not clone a tree no branch holds (it
# cloned every ref, and the checkout of the tree failed), and it SWALLOWED git's error,
# so a failure said nothing about the cause.
self_test() {
  local fails=0
  local fixture
  local src
  local held
  local orphan
  local dir
  local out
  local saved_root
  local saved_sha
  fixture="$(mktemp -d "${TMPDIR:-/tmp}/charly-measure-selftest.XXXXXX")"
  src="$fixture/src"
  git init --quiet -b main "$src" >/dev/null 2>&1
  git -C "$src" config user.email selftest@example.invalid
  git -C "$src" config user.name selftest
  printf 'one\n' >"$src/file.txt"
  git -C "$src" add file.txt
  git -C "$src" commit --quiet -m "the tree under test"
  held="$(git -C "$src" rev-parse HEAD)"
  # A tree NO branch holds: the commit is made on a detached HEAD and the branch never
  # takes it — the case a rewritten branch leaves behind.
  git -C "$src" checkout --detach HEAD >/dev/null 2>&1
  printf 'two\n' >"$src/file.txt"
  git -C "$src" add file.txt
  git -C "$src" commit --quiet -m "the abandoned tree" >/dev/null 2>&1
  orphan="$(git -C "$src" rev-parse HEAD)"
  git -C "$src" checkout main >/dev/null 2>&1

  saved_root="$ROOT"
  saved_sha="$SHA"
  ROOT="$src"
  # The fixture must be in the state the assertions assume: its HEAD on the branch
  # that holds the first tree, and the second tree on no branch at all. A fixture
  # that silently degraded would make the assertions prove nothing.
  if [ "$(git -C "$src" symbolic-ref --quiet --short HEAD 2>/dev/null)" != "main" ]; then
    echo "measure-clone: the self-test's fixture is not in the expected state." >&2
    rm -rf "$fixture"
    return 1
  fi
  if [ -n "$(git -C "$src" for-each-ref --contains "$orphan" --format='%(refname:short)' refs/heads 2>/dev/null)" ]; then
    echo "measure-clone: the self-test's fixture holds the second tree on a branch." >&2
    rm -rf "$fixture"
    return 1
  fi

  # 1. a branch holds the tree: the clone carries it.
  SHA="$held"
  dir="$fixture/clone-held"
  if clone_at "$dir" >/dev/null 2>&1 &&
    [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$held" ]; then
    echo "  PASS  a tree a branch holds is cloned with the tree"
  else
    echo "  FAIL  a tree a branch holds is cloned with the tree"
    fails=$((fails + 1))
  fi

  # 2. no branch holds the tree: it is fetched by its SHA.
  SHA="$orphan"
  dir="$fixture/clone-orphan"
  if clone_at "$dir" >/dev/null 2>&1 &&
    [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$orphan" ]; then
    echo "  PASS  a tree no branch holds is fetched by its SHA"
  else
    echo "  FAIL  a tree no branch holds is fetched by its SHA"
    fails=$((fails + 1))
  fi

  # 3. a failure NAMES git's own error: a measurement that dies must say why.
  SHA="0000000000000000000000000000000000000000"
  dir="$fixture/clone-bogus"
  out="$(clone_at "$dir" 2>&1)"
  if printf '%s\n' "$out" | grep -q "fatal"; then
    echo "  PASS  a failed clone names git's own error"
  else
    echo "  FAIL  a failed clone names git's own error (got: $out)"
    fails=$((fails + 1))
  fi

  ROOT="$saved_root"
  SHA="$saved_sha"
  rm -rf "$fixture"
  if [ "$fails" -eq 0 ]; then
    echo "measure-clone: the self-test passed."
    return 0
  fi
  echo "measure-clone: the self-test FAILED ($fails assertion(s))." >&2
  return 1
}

if [ "$SELF_TEST" = "1" ]; then
  self_test
  exit $?
fi

SHA="$(git -C "$ROOT" rev-parse HEAD)"
if [ -n "$REF" ]; then
  SHA="$(git -C "$ROOT" rev-parse "$REF^{commit}")" || exit 1
fi
WORK="$(mktemp -d "${TMPDIR:-/tmp}/charly-measure.XXXXXX")"
cleanup() {
  if [ "$KEEP" = "1" ]; then
    echo "measure-clone: the clones are kept at $WORK"
  else
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

echo "HEAD=$SHA"
echo "TREE=$(git -C "$ROOT" rev-parse "${SHA}^{tree}")"
# The DAY the readings were taken. A band is dated: the README's table states the span
# of days its readings were taken on, and the comparison half checks that the samples
# it is handed fall INSIDE that span. A band that is older than the readings it governs
# is a fence about a head that has moved on, so the stamp is what makes the check
# possible — without it the samples' day is unstated, and an unstated day is unchecked.
echo "MEASURED=$(date +%F)"
echo "WORK=$WORK"

echo
echo "===== the light shape, from FRESH clones ====="
LIGHT=""
n=0
while [ "$n" -lt 3 ]; do
  n=$((n + 1))
  L="$WORK/light-$n"
  if ! clone_at "$L"; then
    echo "measure-clone: the clone at $L failed." >&2
    exit 1
  fi
  echo "-- clone $n: $(git -C "$L" rev-parse HEAD)"
  start=$(date +%s)
  # the initializer's own output is EVIDENCE (it names the paths it materialized),
  # so it is not silenced
  ( cd "$L" && bash scripts/init-submodules.sh )
  rc=$?
  end=$(date +%s)
  echo "rc=$rc elapsed=$((end-start))s"
  du -sh "$L" | awk -F'\t' '{print $1 "\t" $2}'
  if [ -z "$LIGHT" ]; then LIGHT="$L"; fi
done

echo
echo "===== the light tree, bootstrapped and gated ====="
cd "$LIGHT" || exit 1
./charly/scripts/bootstrap-charly.sh >/dev/null 2>&1; echo "bootstrap rc=$?"
./charly/bin/charly version
du -sh "$LIGHT" | awk -F'\t' '{print $1 "\t" $2}'
./charly/bin/charly task verify >"$WORK/verify-light.log" 2>&1; echo "verify rc=$?"
grep -E '^task verify:' "$WORK/verify-light.log"
echo "skipped steps: $(grep -c '\[skip\]' "$WORK/verify-light.log")"
echo "failed steps: $(grep -c '\[fail\]' "$WORK/verify-light.log")"
du -sh "$LIGHT" | awk -F'\t' '{print $1 "\t" $2}'

if [ "$FULL" = "1" ]; then
  echo
  echo "===== the full shape, from a FRESH clone ====="
  F="$WORK/full"
  if ! clone_at "$F"; then
    echo "measure-clone: the clone at $F failed." >&2
    exit 1
  fi
  cd "$F" || exit 1
  git rev-parse HEAD
  start=$(date +%s)
  CHARLY_INIT_MODE=all bash scripts/init-submodules.sh
  rc=$?
  end=$(date +%s)
  echo "rc=$rc elapsed=$((end-start))s"
  du -sh "$F" | awk -F'\t' '{print $1 "\t" $2}'
  echo "-- the openclaw module store, from scratch, before the gate --"
  du -sh "$F/.git/modules/openclaw" | awk -F'\t' '{print $1 "\t" $2}'
  ./charly/scripts/bootstrap-charly.sh >/dev/null 2>&1; echo "bootstrap rc=$?"
  ./charly/bin/charly version
  ./charly/bin/charly task verify >"$WORK/verify-full.log" 2>&1; echo "verify rc=$?"
  grep -E '^task verify:' "$WORK/verify-full.log"
  echo "skipped steps: $(grep -c '\[skip\]' "$WORK/verify-full.log")"
  echo "failed steps: $(grep -c '\[fail\]' "$WORK/verify-full.log")"
  du -sh "$F" | awk -F'\t' '{print $1 "\t" $2}'
  echo "-- the openclaw module store, after the gate --"
  du -sh "$F/.git/modules/openclaw" | awk -F'\t' '{print $1 "\t" $2}'
fi

echo
echo "measure-clone: every reading is above; compare them against the bands the"
echo "README commits with: node scripts/check-readme-measurements.mjs --samples <this log>"
