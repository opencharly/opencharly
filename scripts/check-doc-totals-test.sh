#!/usr/bin/env bash
# Each case isolates ONE check against ONE fixture that triggers only that defect,
# so a check that stops working cannot be hidden behind another check's finding.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
bad=0

# expect_fail <name> <fixture> <substring that MUST appear in the output>
expect_fail() {
  local name="$1" file="$2" want="$3" out
  out="$(python3 "$here/check-doc-totals.py" "$file" 2>&1)" || true
  if ! printf '%s' "$out" | grep -qF "$want"; then
    echo "FAIL $name: output lacks '$want'; got: $(printf '%s' "$out" | head -2 | tr '\n' ' ')"
    bad=$((bad+1)); return
  fi
  local n; n="$(printf '%s' "$out" | grep -c '^FAIL')"
  if [ "$n" -ne 1 ]; then
    echo "FAIL $name: fixture is not isolated — $n findings, expected 1"
    bad=$((bad+1)); return
  fi
  echo "ok   $name"
}

expect_pass() {
  local name="$1" file="$2"
  if python3 "$here/check-doc-totals.py" "$file" >/dev/null 2>&1; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected no finding"; bad=$((bad+1))
  fi
}

expect_fail "check 1: table total vs its rows"   "$here/testdata/totals-bad-table.md"    "rows sum to 14"
expect_fail "check 2: sentence count vs parts"   "$here/testdata/totals-bad-sentence.md" "parts sum to 14"
expect_fail "check 3: an unplaced open section"  "$here/testdata/totals-bad-unplaced.md" "no wave places"
expect_fail "check 4: heading count vs census"   "$here/testdata/totals-bad-heading.md"  "states 17"
expect_pass "a correct file"                     "$here/testdata/totals-good.md"

echo "check-doc-totals-test: $bad failure(s)"
exit $((bad > 0))
