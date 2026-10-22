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
# self-test that proves the comparison can fail — IS in the gate.
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
# builds the binary from the `charly` checkout the initializer materialized).
#
# The superproject is cloned FROM THIS CHECKOUT (the tree under test is not on the
# remote yet), while every SUBMODULE comes from its own HTTPS URL — the remote's cost
# is the cost a reader pays.
#
# usage: bash scripts/measure-clone.sh [--ref <ref>] [--no-full] [--keep]
#   --ref <ref>  the tree under test (default: HEAD of this checkout)
#   --no-full    skip the --all shape (the slow half: ~2 G and six minutes)
#   --keep       keep the clones (default: they are removed at the end)
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF=""
FULL=1
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="${2:?--ref needs a ref}"; shift 2 ;;
    --no-full) FULL=0; shift ;;
    --keep) KEEP=1; shift ;;
    *) echo "measure-clone: unknown argument: $1" >&2; exit 2 ;;
  esac
done

for req in git python3 go; do
  if ! command -v "$req" >/dev/null 2>&1; then
    echo "measure-clone: the measurement needs '$req', and it is not on PATH." >&2
    echo "  install it, or the readings would be empty and the band would be unchecked." >&2
    exit 1
  fi
done

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
echo "WORK=$WORK"

# --- a fresh clone of the tree under test, with the superproject's objects local
# `--no-hardlinks` copies the objects instead of linking them: a link cannot cross a
# filesystem boundary, and the measurement's tree may well be on another one. The
# clone's SIZE is the same either way — the same objects, in the same pack.
clone_at() {  # clone_at <dir>
  git clone --no-checkout --no-hardlinks "$ROOT" "$1" >/dev/null 2>&1 || return 1
  git -C "$1" checkout --detach "$SHA" >/dev/null 2>&1 || return 1
  return 0
}

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
