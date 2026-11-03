#!/usr/bin/env bash
# design-ledger.sh — the capability ledger's control (DESIGN.md A.8).
#
# design/parity.tsv proves WHERE every capability lands; design/dulling.tsv records WHETHER it
# lands whole. This script is the check that keeps the second ledger honest. It runs in the
# repository root and writes nothing to it.
#
# Controls, in order:
#   1 header     both ledgers carry their documented column set
#   2 coverage   design/dulling.tsv has exactly one row per design/parity.tsv capability, in
#                parity order, with no duplicate and no extra row
#   3 shape      every row has its column count and no empty cell
#   4 enums      verdict is sharp|dulled|forbidden|unknown; action is none|amend <id>|
#                accept retirement|verify live
#   5 citations  every DESIGN.md:<line> and DESIGN.cue:<line> a row cites is a real line of
#                that file
#   6 provenance a row whose `guideline` names a requirement (D-…) cites at least one
#                DESIGN.md line that actually contains that requirement
#
# Usage: bash scripts/design-ledger.sh          check the committed ledgers
#        bash scripts/design-ledger.sh --self-test   mutate every invariant and prove it fails
set -uo pipefail

root="$PWD"
dulling="$root/design/dulling.tsv"
admission="$root/design/dulling-admission.tsv"
parity="$root/design/parity.tsv"
md="$root/DESIGN.md"
schema="$root/DESIGN.cue"

DULLING_HEADER=$'capability\ttoday\tguideline\ttarget_form\tverdict\tdulling\tevidence\taction'
ADMISSION_HEADER=$'path\tadmits\ttoday\tguideline\tcan_add_without_amending\tverdict\twhy\tevidence'

# check_all <dulling> <admission> <out> <root> — writes FAIL lines to <out>; returns 0 when clean.
# <root> is the tree the supporting files are read from, so the self-test can judge its own
# isolated copies instead of the repository's files.
check_all() {
	local dulling="$1" admission="$2" out="$3" root="$4"
	local parity="$root/design/parity.tsv" md="$root/DESIGN.md" schema="$root/DESIGN.cue" md_lines cue_lines
	: >"$out"

	local f
	for f in "$dulling" "$admission" "$parity" "$md" "$schema"; do
		[[ -f "$f" ]] || { printf 'FAIL %s: file is missing\n' "$f" >>"$out"; return 0; }
	done

	# 1 header
	[[ "$(grep -m1 -v '^#' "$dulling")" == "$DULLING_HEADER" ]] ||
		printf 'FAIL %s: the first non-comment line is not the documented eight columns\n' "$dulling" >>"$out"
	[[ "$(grep -m1 -v '^#' "$admission")" == "$ADMISSION_HEADER" ]] ||
		printf 'FAIL %s: the first non-comment line is not the documented eight columns\n' "$admission" >>"$out"

	# 2 coverage: one row per parity capability, in parity order, no duplicate, no extra
	local pc dc
	pc=$(awk -F'\t' '!/^#/ && $1 != "current" && $1 != "capability"' "$parity" | wc -l)
	dc=$(awk -F'\t' '!/^#/ && $1 != "capability"' "$dulling" | wc -l)
	[[ "$pc" == "$dc" ]] ||
		printf 'FAIL coverage: design/parity.tsv has %s capabilities, design/dulling.tsv has %s rows\n' "$pc" "$dc" >>"$out"
	awk -F'\t' '!/^#/ && $1 != "current" && $1 != "capability" { print $1 }' "$parity" >"$out.parity"
	awk -F'\t' '!/^#/ && $1 != "capability" { print $1 }' "$dulling" >"$out.dulling"
	awk 'FNR == NR { want[FNR] = $0; n++; next }
	     { have[FNR] = $0; m++ }
	     END {
	       if (n != m) printf "FAIL coverage: %d parity rows vs %d ledger rows\n", n, m
	       k = (n < m ? n : m)
	       for (i = 1; i <= k; i++) if (want[i] != have[i])
	         printf "FAIL order: row %d is %s in the ledger and %s in design/parity.tsv\n", i, have[i], want[i]
	     }' "$out.parity" "$out.dulling" >>"$out"
	sort "$out.dulling" | uniq -d | while read -r dup; do
		printf 'FAIL duplicate: %s appears more than once in design/dulling.tsv\n' "$dup" >>"$out"
	done

	# 3 shape + 4 enums (both ledgers)
	awk -F'\t' -v n=8 '!/^#/ && $1 != "capability" {
		if (NF != n) { printf "FAIL %s:%d: %d columns, expected %d\n", FILENAME, FNR, NF, n; next }
		for (i = 1; i <= NF; i++) if ($i == "") { printf "FAIL %s:%d: empty column %d\n", FILENAME, FNR, i; next }
		if ($5 !~ /^(sharp|dulled|forbidden|unknown)$/)
			printf "FAIL %s:%d: verdict %s is not sharp|dulled|forbidden|unknown\n", FILENAME, FNR, $5
		if ($8 !~ /^(none|accept retirement|verify live|amend .+)$/)
			printf "FAIL %s:%d: action %s is not none|amend <id>|accept retirement|verify live\n", FILENAME, FNR, $8
	}' "$dulling" >>"$out"
	awk -F'\t' -v n=8 '!/^#/ && $1 != "path" {
		if (NF != n) { printf "FAIL %s:%d: %d columns, expected %d\n", FILENAME, FNR, NF, n; next }
		for (i = 1; i <= NF; i++) if ($i == "") { printf "FAIL %s:%d: empty column %d\n", FILENAME, FNR, i; next }
		if ($6 !~ /^(sharp|dulled|forbidden|unknown)$/)
			printf "FAIL %s:%d: verdict %s is not sharp|dulled|forbidden|unknown\n", FILENAME, FNR, $6
	}' "$admission" >>"$out"

	# 5 citations + 6 provenance
	md_lines=$(awk 'END { print NR }' "$md")
	cue_lines=$(awk 'END { print NR }' "$schema")
	cite_check "$dulling" 2 6 "$out"
	cite_check "$admission" 3 7 "$out"
	cue_content_check "$dulling" 3 5 6 "$out"
	cue_content_check "$admission" 1 6 7 "$out"
}

# cue_content_check <file> <target-index> <dulling-index> <evidence-index> <out>
# A line number in bounds is not a citation: the cited DESIGN.cue line (or range) must carry one
# of the identifiers the row itself names, so a definition that moved cannot be cited by a stale
# offset.
cue_content_check() {
	local file="$1" tcol="$2" dcol="$3" ecol="$4" out="$5" cap ev toks
	while IFS=$'\t' read -r -a f; do
		[[ "${f[0]}" == "capability" || "${f[0]}" == "path" ]] && continue
		cap="${f[0]}"; ev="${f[$ecol]:-}"
		[[ -n "$ev" ]] || continue
		grep -qE 'DESIGN\.cue:[0-9]' <<<"$ev" || continue
		toks="$(grep -oE '`#[A-Za-z0-9]+`' <<<"${f[$tcol]:-} ${f[$dcol]:-}" | tr -d '`' | sort -u)"
		[[ -n "$toks" ]] || continue
		local matched=0 cite n1 n2 tok
		while IFS= read -r cite; do
			n1="${cite#DESIGN.cue:}"; n2="${n1##*-}"; n1="${n1%%-*}"
			(( n1 < 1 || n2 > cue_lines || n1 > n2 )) && continue # bounds are reported elsewhere
			while IFS= read -r tok; do
				[[ -n "$tok" ]] || continue
				if sed -n "${n1},${n2}p" "$schema" | grep -qiF -- "$tok"; then matched=1; break 2; fi
			done <<<"$toks"
		done < <(grep -oE 'DESIGN\.cue:[0-9]+(-[0-9]+)?' <<<"$ev")
		(( matched )) || printf 'FAIL %s:%s: no cited DESIGN.cue line names what the row claims\n' \
			"$(basename "$file")" "$cap" >>"$out"
	done < <(grep -v '^#' "$file")
}

# cite_check <file> <guideline-index> <evidence-index> <out> (indices are 0-based)
cite_check() {
	local file="$1" gidx="$2" eidx="$3" out="$4" cap gcol_v ecol_v line_scope
	while IFS=$'\t' read -r -a f; do
		[[ "${f[0]}" == "capability" || "${f[0]}" == "path" ]] && continue
		cap="${f[0]}"
		gcol_v="${f[$gidx]:-}"; ecol_v="${f[$eidx]:-}"
		[[ -z "$ecol_v" ]] && continue # a short row is already a shape FAIL; do not index past it
		local hit=0
		# every cited document line resolves
		local cite
		while IFS= read -r cite; do
			[[ -z "$cite" ]] && continue
			line_scope="${cite#*:}"
			local lo="${line_scope%%-*}" hi="${line_scope##*-}" max
			max="$md_lines"
			[[ "$cite" == DESIGN.cue:* ]] && max="$cue_lines"
			if (( lo < 1 || hi > max || lo > hi )); then
				printf 'FAIL %s:%s: %s cites a line outside the file (%s lines)\n' \
					"$(basename "$file")" "$cap" "$cite" "$max" >>"$out"
			fi
		done < <(grep -oE 'DESIGN\.(md|cue):[0-9]+(-[0-9]+)?' <<<"$ecol_v")
		# a cited requirement must appear on a cited DESIGN.md line
		local id
		for id in $(grep -oE 'D-[A-Z]+-[0-9]+' <<<"$gcol_v" | sort -u); do
			hit=0
			while IFS= read -r cite; do
				[[ -z "$cite" ]] && continue
				line_scope="${cite#*:}"
				if sed -n "${line_scope/-/,}p" "$md" | grep -qE "$id([^0-9]|$)"; then hit=1; break; fi
			done < <(grep -oE 'DESIGN\.md:[0-9]+(-[0-9]+)?' <<<"$ecol_v")
			(( hit )) || printf 'FAIL %s:%s: guideline names %s but no cited DESIGN.md line contains it\n' \
				"$(basename "$file")" "$cap" "$id" >>"$out"
		done
	done < <(grep -v '^#' "$file")
}

report() { # report <out>
	if [[ -s "$1" ]]; then
		sed 's/^/  /' "$1"
		printf 'design-ledger: FAILED (%s finding(s))\n' "$(wc -l <"$1" | tr -d ' ')"
		return 1
	fi
	printf 'design-ledger: %s rows vs %s parity capabilities; citations resolve and name their subject; enums hold\n' \
		"$(awk -F'\t' '!/^#/ && $1 != "capability"' "$dulling" | wc -l | tr -d ' ')" \
		"$(awk -F'\t' '!/^#/ && $1 != "current"' "$parity" | wc -l | tr -d ' ')"
	return 0
}

if [[ "${1:-}" == "--self-test" ]]; then
	work="$(mktemp -d)"
	trap 'rm -rf "$work"' EXIT
	mkdir -p "$work/design"
	cp "$parity" "$work/design/parity.tsv"
	cp "$md" "$work/DESIGN.md"
	cp "$schema" "$work/DESIGN.cue"
	cp "$dulling" "$work/design/dulling.tsv"
	cp "$admission" "$work/design/dulling-admission.tsv"
	cases=0

	# the harness itself: unmutated copies must pass
	if ! check_all "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" "$work/out.clean" "$work"; then :; fi
	if [[ -s "$work/out.clean" ]]; then
		printf 'FAIL self-test: the unmutated copies do not pass — the harness is broken, not the data\n'
		cat "$work/out.clean"
		exit 1
	fi

	expect() { # expect <name> <pattern>
		cases=$((cases + 1))
		check_all "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" "$work/out.$cases" "$work"
		if [[ ! -s "$work/out.$cases" ]]; then
			printf 'FAIL self-test: %s did NOT fail the check\n' "$1"
			exit 1
		fi
		grep -qE "$2" "$work/out.$cases" || {
			printf 'FAIL self-test: %s failed for the wrong reason (no %s)\n' "$1" "$2"
			sed 's/^/  /' "$work/out.$cases"
			exit 1
		}
		cp "$dulling" "$work/design/dulling.tsv"
		cp "$admission" "$work/design/dulling-admission.tsv"
		printf '  self-test %-38s fails as designed\n' "$1"
	}

	# drop a row -> coverage
	sed '$d' "$dulling" >"$work/design/dulling.tsv"
	expect "a dropped capability row" 'FAIL coverage'

	# duplicate a data row -> duplicate
	{ cat "$dulling"; awk '!/^#/ && $1 != "capability" { last = $0 } END { print last }' "$dulling"; } \
		>"$work/design/dulling.tsv"
	expect "a duplicate capability row" 'FAIL duplicate'

	# swap two data rows -> order
	awk '!/^#/ && $1 != "capability" { buf[n++] = $0; next } { print } END {
		if (n >= 2) { t = buf[n-2]; buf[n-2] = buf[n-1]; buf[n-1] = t }
		for (i = 0; i < n; i++) print buf[i] }' "$dulling" >"$work/design/dulling.tsv"
	expect "two rows out of parity order" 'FAIL order'

	# bad verdict -> enum
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		!done { $5 = "blunted"; done = 1 } { print }' "$dulling" >"$work/design/dulling.tsv"
	expect "a verdict outside the enum" 'verdict blunted'

	# empty cell -> shape
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		!done { $6 = ""; done = 1 } { print }' "$dulling" >"$work/design/dulling.tsv"
	expect "an empty cell" 'empty column'

	# out-of-range citation -> citation
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		!done { $7 = $7 "; DESIGN.md:999999"; done = 1 } { print }' "$dulling" >"$work/design/dulling.tsv"
	expect "a citation past the end of DESIGN.md" 'outside the file'

	# a DESIGN.cue citation that points at an unrelated definition -> content
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		$1 == "verb:http" { $7 = "DESIGN.cue:592; DESIGN.md:2321"; print; next } { print }' \
		"$dulling" >"$work/design/dulling.tsv"
	expect "a cue citation naming another definition" 'no cited DESIGN.cue line names'

	# guideline ID that no cited line contains -> provenance
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		!done { $3 = "D-NOPE-9"; done = 1 } { print }' "$dulling" >"$work/design/dulling.tsv"
	expect "a guideline ID no cited line contains" 'no cited DESIGN.md line contains it'

	# wrong column count in the admission file -> shape
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "path" { print; next }
		!done { NF = 7; done = 1 } { print }' "$admission" >"$work/design/dulling-admission.tsv"
	expect "a seven-column admission row" 'columns, expected 8'

	# supporting-file isolation: a check that read the REPOSITORY's DESIGN.md would not notice
	# a change to the work copy, so truncating the copy proves the self-test judges its own tree.
	cases=$((cases + 1))
	head -n 200 "$md" >"$work/DESIGN.md"
	check_all "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" "$work/out.$cases" "$work"
	if [[ ! -s "$work/out.$cases" ]] || ! grep -qE 'outside the file' "$work/out.$cases"; then
		printf 'FAIL self-test: a truncated work DESIGN.md did not fail the check — the self-test is not isolated\n'
		exit 1
	fi
	cp "$md" "$work/DESIGN.md"
	printf '  self-test %-38s fails as designed\n' "a truncated self-test DESIGN.md"

	printf 'design-ledger: self-test passed (%s mutations, every one failed the check)\n' "$cases"
	exit 0
fi

out="$(mktemp)"
trap 'rm -f "$out" "${out}".*' EXIT
check_all "$dulling" "$admission" "$out" "$root"
report "$out"
