#!/usr/bin/env bash
# design-selftest.sh — prove that a design check catches what it claims to (DESIGN.md Appendix A).
#
# For each row of the table, copy the repository, plant one defect with a sed expression, run
# the check on the copy, and require it to FAIL with the expected text. A check that passes on a
# planted defect, fails for another reason, or an edit that changes nothing, fails the self-test.
#
# Table rows (tab-separated; lines starting with # are comments):
#   <name>  <file relative to the root>  <sed expression>  <text the check must report>
#
# Usage: scripts/design-selftest.sh <check script> <table> [root]
#   e.g. scripts/design-selftest.sh scripts/design-consistency.sh design/consistency/selftest.tsv
set -euo pipefail

[[ $# -ge 2 ]] || { echo "usage: $0 <check script> <table> [root]" >&2; exit 2; }
check="$1"
table="$2"
root="$(cd "${3:-$(dirname "$0")/..}" && pwd)"
fail=0
count=0
while IFS=$'\t' read -r name file expr expect; do
	[[ -z "$name" || "$name" == \#* ]] && continue
	count=$((count + 1))
	copy="$(mktemp -d)"
	cp -r "$root/." "$copy/"
	sed -i -e "$expr" "$copy/$file"
	if cmp -s "$root/$file" "$copy/$file"; then
		echo "SELFTEST $name: the edit did not change $file"
		fail=1
	elif out="$(bash "$copy/$check" "$copy" 2>&1)"; then
		echo "SELFTEST $name: the planted defect was not caught"
		fail=1
	elif ! grep -qF -- "$expect" <<<"$out"; then
		echo "SELFTEST $name: caught, but without '$expect':"
		sed 's/^/    /' <<<"$out" | head -8
		fail=1
	else
		echo "selftest $name: caught"
	fi
	rm -rf "$copy"
done < "$root/$table"
echo "selftest $(basename "$check"): $count planted defects"
exit "$fail"
