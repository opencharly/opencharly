#!/usr/bin/env bash
# Each case here is a defect a real review found on PROGRAM/todo-wave-plan.md.
# The script must report a finding for every one, and none for a correct file.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
bad=0

expect_fail() {
  local name="$1" file="$2"
  if python3 "$here/check-doc-totals.py" "$file" >/dev/null 2>&1; then
    echo "FAIL $name: expected a finding, got none"
    bad=$((bad+1))
  else
    echo "ok   $name"
  fi
}

expect_pass() {
  local name="$1" file="$2"
  if python3 "$here/check-doc-totals.py" "$file" >/dev/null 2>&1; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected no finding"
    bad=$((bad+1))
  fi
}

expect_fail "table total vs rows"      "$here/testdata/totals-bad.md"
expect_fail "sentence count vs parts"  "$here/testdata/totals-bad.md"
expect_fail "heading count vs census"  "$here/testdata/totals-bad.md"
expect_pass "a correct file"          "$here/testdata/totals-good.md"

echo "check-doc-totals-test: $bad failure(s)"
exit $((bad > 0))
