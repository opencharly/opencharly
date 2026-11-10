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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DULLING_HEADER=$'capability\ttoday\tguideline\ttarget_form\tverdict\tdulling\tevidence\taction'
ADMISSION_HEADER=$'path\tadmits\ttoday\tguideline\tcan_add_without_amending\tverdict\twhy\tevidence'

# check_all <dulling> <admission> <out> <root> — writes FAIL lines to <out>; returns 0 when clean.
# <root> is the tree the supporting files are read from, so the self-test can judge its own
# isolated copies instead of the repository's files.
check_all() {
	local dulling="$1" admission="$2" out="$3" root="$4" defs
	local parity="$root/design/parity.tsv" md="$root/DESIGN.md" schema="$root/DESIGN.cue"
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
		# A.9 promises that every retirement it records cites it: a retirement a reader cannot find
		# the reason for is a dropped capability with no record (batch 38).
		if ($8 == "accept retirement" && $7 !~ /DESIGN\.md:§A\.9/)
			printf "FAIL %s:%d: action is accept retirement but the evidence does not cite §A.9\n", FILENAME, FNR
	}' "$dulling" >>"$out"
	awk -F'\t' -v n=8 '!/^#/ && $1 != "path" {
		if (NF != n) { printf "FAIL %s:%d: %d columns, expected %d\n", FILENAME, FNR, NF, n; next }
		for (i = 1; i <= NF; i++) if ($i == "") { printf "FAIL %s:%d: empty column %d\n", FILENAME, FNR, i; next }
		if ($6 !~ /^(sharp|dulled|forbidden|unknown)$/)
			printf "FAIL %s:%d: verdict %s is not sharp|dulled|forbidden|unknown\n", FILENAME, FNR, $6
	}' "$admission" >>"$out"

	# 5 citations + 6 provenance
	cite_check "$dulling" 6 "$out"
	cite_check "$admission" 7 "$out"
	defs="$out.defs"
	grep -oE '^#[A-Za-z0-9]+:' "$schema" | tr -d ':' | sort >"$defs.all"
	sort -u "$defs.all" >"$defs"
	uniq -d "$defs.all" | while read -r dup; do
		printf 'FAIL DESIGN.cue: %s is defined more than once\n' "$dup" >>"$out"
	done
	def_names_check "$dulling" 6 "$out" "$defs"
	def_names_check "$admission" 7 "$out" "$defs"
	# a row that QUOTES a definition's shape must quote it whole: a definition that grows leaves every
	# row copying the old shape false, and the citation check cannot see it because the citation still
	# resolves (batch 21 shipped exactly that).
	# its stderr goes to the finding file too: a checker that crashes must fail the control, not
	# print a traceback beside a green summary (opencharly/opencharly#921).
	python3 "$SCRIPT_DIR/design-shape-check.py" "$dulling" "$schema" >>"$out" 2>&1
	python3 "$SCRIPT_DIR/design-shape-check.py" "$admission" "$schema" >>"$out" 2>&1
	# and the parser itself: a definition it skips is silently unchecked, so the count is a control.
	# Its output is a REPORT, not a finding -- only a missed definition reaches the finding file.
	if ! count_out=$(python3 "$SCRIPT_DIR/design-shape-check.py" --count "$schema" 2>&1); then
		printf 'FAIL DESIGN.cue: the shape check skipped a definition\n' >>"$out"
		printf '%s\n' "$count_out" >>"$out"
	fi

	# a line citation in ANY column is a failure: columns other than `evidence` carry prose, and a
	# mechanical sweep that only reads `evidence` leaves dangling references behind (round 3).
	awk -F'\t' '!/^#/ && $1 != "capability" && $1 != "path" {
		for (i = 1; i <= NF; i++)
			if ($i ~ /DESIGN\.(md|cue):[0-9]/) { printf "FAIL %s:%d: column %d cites a document by line; name it instead (A.8)\n", FILENAME, FNR, i; next }
	}' "$dulling" >>"$out"
	awk -F'\t' '!/^#/ && $1 != "capability" && $1 != "path" {
		for (i = 1; i <= NF; i++)
			if ($i ~ /DESIGN\.(md|cue):[0-9]/) { printf "FAIL %s:%d: column %d cites a document by line; name it instead (A.8)\n", FILENAME, FNR, i; next }
	}' "$admission" >>"$out"

	# the disposition table is GENERATED from this ledger; a stale copy describes a state the ledger
	# does not have, so it is a failure like any other (A.10).
	local gen
	gen="$(mktemp)"
	if bash "$root/scripts/design-disposition.sh" "$root" >"$gen" 2>/dev/null; then
		diff -q "$gen" "$root/design/dulling-disposition.md" >/dev/null 2>&1 ||
			printf 'FAIL design/dulling-disposition.md: stale; regenerate with scripts/design-disposition.sh (A.10)\n' >>"$out"
	else
		printf 'FAIL design/dulling-disposition.md: the generator failed\n' >>"$out"
	fi
	rm -f "$gen"
}

# def_names_check <file> <evidence-index> <out> <defs> — the definitions a row NAMES are real,
# and its `evidence` cell cites each of them. A name that is real but uncited is the defect this
# control exists for: the reader is told which definition the row is about and cannot verify it.
#
# A name a row cites as `<pinned path>:#<Name>` is a claim about THAT FILE, not about DESIGN.cue: it
# says "the pinned module declares this construct", and scripts/design-cite.sh resolves it at the
# pin (A.13). Without this split the two forms would collide — every pinned module's definition
# would have to be a `DESIGN.cue` definition too, which is exactly what §10.2 means by moving a
# definition into its owning module — so the name's home decides which control answers for it.
def_names_check() {
	local file="$1" eidx="$2" out="$3" defs="$4" ev name row
	while IFS=$'\t' read -r -a f; do
		[[ "${f[0]}" == "capability" || "${f[0]}" == "path" ]] && continue
		ev="${f[$eidx]:-}"
		row="$(printf '%s' "${f[*]}")"
		for name in $(printf '%s\n' "${f[*]}" | grep -oE '`?#[A-Z][A-Za-z0-9]*`?' | tr -d '`' | sort -u); do
			# a construct of a pinned module: design-cite.sh checks it is declared at the pin
			if grep -qE "(^|[[:space:];])([A-Za-z0-9_.@/-]+):#${name#\#}([^A-Za-z0-9]|$)" <<<"$row" &&
				! grep -qE "(^|[[:space:];])DESIGN\.cue:#${name#\#}([^A-Za-z0-9]|$)" <<<"$row"; then
				continue
			fi
			if ! grep -qx -- "$name" "$defs"; then
				printf 'FAIL %s:%s: %s is not a definition of DESIGN.cue\n' \
					"$(basename "$file")" "${f[0]}" "$name" >>"$out"
				continue
			fi
			grep -qF -- "DESIGN.cue:$name" <<<"$ev" ||
				printf 'FAIL %s:%s: names %s but its evidence does not cite it\n' \
					"$(basename "$file")" "${f[0]}" "$name" >>"$out"
		done
	done < <(grep -v '^#' "$file")
}

# cite_check <file> <evidence-index> <out> (index is 0-based)
# A DESIGN.md citation names a REQUIREMENT (D-X-n) or a SECTION (§N), never a line: a line number
# drifts on every edit of this document, and the ledger is edited alongside it.
cite_check() {
	local file="$1" eidx="$2" out="$3" cap ev seg n
	while IFS=$'\t' read -r -a f; do
		[[ "${f[0]}" == "capability" || "${f[0]}" == "path" ]] && continue
		cap="${f[0]}"; ev="${f[$eidx]:-}"
		[[ -n "$ev" ]] || continue
		for seg in $(tr ';' '\n' <<<"$ev" | sed 's/^ *//; s/ *$//' | grep -E '^DESIGN\.(md|cue):'); do
			case "$seg" in
			DESIGN.md:D-*)
				n=$(grep -cE "^\| ${seg#DESIGN.md:} \|" "$md")
				[[ "$n" == "1" ]] || printf 'FAIL %s:%s: %s is not a requirement of DESIGN.md\n' \
					"$(basename "$file")" "$cap" "${seg#DESIGN.md:}" >>"$out"
				;;
			DESIGN.md:§*)
				grep -qE "^#{2,3} ${seg#DESIGN.md:§}([. ]|$)" "$md" ||
					printf 'FAIL %s:%s: %s names no section of DESIGN.md\n' \
						"$(basename "$file")" "$cap" "${seg#DESIGN.md:}" >>"$out"
				;;
			DESIGN.cue:#*)
				: # a definition citation; def_names_check validates it
				;;
			DESIGN.cue:*)
				printf 'FAIL %s:%s: cites DESIGN.cue by line; name the definition (A.8)\n' \
					"$(basename "$file")" "$cap" >>"$out"
				;;
			*)
				printf 'FAIL %s:%s: cites DESIGN.md by line; name the requirement or section (A.8)\n' \
					"$(basename "$file")" "$cap" >>"$out"
				;;
			esac
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
	mkdir -p "$work/scripts"
	cp "$root/scripts/design-disposition.sh" "$work/scripts/"
	cp "$root/design/dulling-disposition.md" "$work/design/dulling-disposition.md"
	cases=0

	# the harness itself: unmutated copies must pass
	if ! check_all "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" "$work/out.clean" "$work"; then :; fi
	if [[ -s "$work/out.clean" ]]; then
		printf 'FAIL self-test: the unmutated copies do not pass — the harness is broken, not the data\n'
		cat "$work/out.clean"
		exit 1
	fi

	# fixture_digest — one digest over every input check_all reads, so a case can prove it changed
	# at least one of them. The set is the fixture's own, not the repository's.
	fixture_digest() {
		cat "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" \
			"$work/DESIGN.md" "$work/DESIGN.cue" "$work/design/dulling-disposition.md" |
			sha256sum | cut -c1-16
	}
	pristine="$(fixture_digest)"

	expect() { # expect <name> <pattern>
		cases=$((cases + 1))
		if [[ "$(fixture_digest)" == "$pristine" ]]; then
			printf 'FAIL self-test: %s mutated nothing — a case that applies no mutation dies for free\n' "$1"
			exit 1
		fi
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

	# a DESIGN.md line citation (out of range or not) -> line citations are refused
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		!done { $7 = $7 "; DESIGN.md:999999"; done = 1 } { print }' "$dulling" >"$work/design/dulling.tsv"
	expect "a DESIGN.md line citation" 'cites DESIGN.md by line'

	# a definition name that does not exist -> names
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		$1 == "verb:http" { $6 = $6 " `#NoSuchDefinition`"; print; next } { print }' \
		"$dulling" >"$work/design/dulling.tsv"
	expect "a nonexistent definition name" 'is not a definition of DESIGN.cue'

	# a named definition its evidence does not cite -> placement
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		$1 == "verb:file" { n = split($7, parts, "; "); out = ""; for (i = 1; i <= n; i++) if (parts[i] !~ /^DESIGN\.cue:/) out = out (out == "" ? "" : "; ") parts[i]; $7 = out; print; next } { print }' \
		"$dulling" >"$work/design/dulling.tsv"
	expect "a named definition its evidence omits" 'evidence does not cite it'

	# a cue line citation reintroduced -> line citations are refused
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		$1 == "verb:http" { $7 = $7 "; DESIGN.cue:596"; print; next } { print }' \
		"$dulling" >"$work/design/dulling.tsv"
	expect "a cue line citation" 'cites DESIGN.cue by line'

	# a line citation hidden in target_form -> every column is read
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		$1 == "verb:http" { $4 = $4 " (DESIGN.md:2321)"; print; next } { print }' \
		"$dulling" >"$work/design/dulling.tsv"
	expect "a line citation in target_form" 'cites a document by line'

	# a requirement DESIGN.md does not define -> requirement
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "capability" { print; next }
		$1 == "verb:file" { $7 = $7 "; DESIGN.md:D-NOPE-9"; print; next } { print }' \
		"$dulling" >"$work/design/dulling.tsv"
	expect "a requirement DESIGN.md does not define" 'is not a requirement of DESIGN.md'

	# wrong column count in the admission file -> shape
	awk -F'\t' 'BEGIN { OFS = "\t" } /^#/ || $1 == "path" { print; next }
		!done { NF = 7; done = 1 } { print }' "$admission" >"$work/design/dulling-admission.tsv"
	expect "a seven-column admission row" 'columns, expected 8'

	# a stale disposition table -> current (it is generated, so it must match the ledger)
	printf '| a-capability | sharp | none | kept whole |\n' >>"$work/design/dulling-disposition.md"
	expect "a stale disposition table" 'stale; regenerate'

	# supporting-file isolation: a check that read the REPOSITORY's DESIGN.md would not notice
	# a change to the work copy, so truncating the copy proves the self-test judges its own tree.
	cases=$((cases + 1))
	head -n 200 "$md" >"$work/DESIGN.md"
	check_all "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" "$work/out.$cases" "$work"
	if [[ ! -s "$work/out.$cases" ]] || ! grep -qE 'is not a requirement of DESIGN.md' "$work/out.$cases"; then
		printf 'FAIL self-test: a truncated work DESIGN.md did not fail the check — the self-test is not isolated\n'
		exit 1
	fi
	cp "$md" "$work/DESIGN.md"
	printf '  self-test %-38s fails as designed\n' "a truncated self-test DESIGN.md"

	# a definition name that is defined twice -> uniqueness
	cases=$((cases + 1))
	{ cat "$schema"; grep -m1 -E '^#[A-Za-z0-9]+:' "$schema"; } >"$work/DESIGN.cue"
	check_all "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" "$work/out.$cases" "$work"
	if [[ ! -s "$work/out.$cases" ]] || ! grep -qE 'defined more than once' "$work/out.$cases"; then
		printf 'FAIL self-test: a duplicated definition did not fail the check\n'
		exit 1
	fi
	cp "$schema" "$work/DESIGN.cue"
	printf '  self-test %-38s fails as designed\n' "a duplicated definition"

	# a row quoting a definition's SHAPE with a stale field list -> the shape must be quoted whole.
	# The mutation is written against the QUOTE THE ROW CARRIES, not against the text it carried on
	# the day this case was authored: a literal that stops matching turns the case into a silent
	# no-op, and a no-op "dies" for free, which is how this case read red on a healthy tree
	# (opencharly/opencharly#963 discovered it). `expect` also asserts, generically, that every
	# mutation changed the fixture, so an unapplied one can never pass again.
	cases=$((cases + 1))
	python3 - "$work/design/dulling.tsv" <<'SHAPE_PY' || {
import re
import sys
path = sys.argv[1]
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if line.startswith("kind:pipeline\t"):
        cells = line.split("\t")
        m = re.search(r"#StageAsk: \{([^}]*)\}", cells[5])
        if not m:
            sys.exit("the kind:pipeline row no longer quotes #StageAsk")
        first = m.group(1).split(",")[0].strip()
        cells[5] = cells[5][: m.start()] + "#StageAsk: {" + first + "}" + cells[5][m.end() :]
        lines[i] = "\t".join(cells)
        break
else:
    sys.exit("no kind:pipeline row")
open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
SHAPE_PY
		printf 'FAIL self-test: the stale-shape-quote mutation did not apply\n'
		exit 1
	}
	check_all "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" "$work/out.$cases" "$work"
	if [[ ! -s "$work/out.$cases" ]] || ! grep -qE 'is quoted as' "$work/out.$cases"; then
		printf 'FAIL self-test: a stale shape quote did not fail the check\n'
		exit 1
	fi
	cp "$dulling" "$work/design/dulling.tsv"
	printf '  self-test %-38s fails as designed\n' "a stale shape quote"

	# a retirement that does not cite A.9 -> the promise A.9 makes about its own table
	cases=$((cases + 1))
	python3 - "$work/design/dulling.tsv" <<'RETIRE_PY'
import sys
path = sys.argv[1]
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if line.startswith("#"):
        continue
    cells = line.split("\t")
    if len(cells) > 7 and cells[7] == "accept retirement":
        cells[6] = "; ".join(c for c in cells[6].split("; ") if "§A.9" not in c)
        lines[i] = "\t".join(cells)
        break
open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
RETIRE_PY
	check_all "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" "$work/out.$cases" "$work"
	if [[ ! -s "$work/out.$cases" ]] || ! grep -qE 'does not cite §A.9' "$work/out.$cases"; then
		printf 'FAIL self-test: an uncited retirement did not fail the check\n'
		exit 1
	fi
	cp "$dulling" "$work/design/dulling.tsv"
	printf '  self-test %-38s fails as designed\n' "an uncited retirement"

	# a definition whose body runs to the end of the file with its brace still open -> the shape
	# walk must report the row's stale quote, not die on lines[cursor]. A crash here used to fail
	# the mutation by exception while the run still said "passed": the control's own finding is
	# the proof, and any Traceback in its output is the defect (opencharly/opencharly#921).
	cases=$((cases + 1))
	{ cat "$schema"; printf '\n#SelfTestTruncated: {\n\talpha: int\n'; } >"$work/DESIGN.cue"
	python3 - "$work/design/dulling.tsv" <<'TRUNCATED_DEF_PY'
import sys
path = sys.argv[1]
lines = open(path, encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if line.startswith("kind:pipeline\t"):
        cells = line.split("\t")
        cells[5] = cells[5] + " `#SelfTestTruncated: {beta}`"
        cells[6] = cells[6] + "; DESIGN.cue:#SelfTestTruncated"
        lines[i] = "\t".join(cells)
        break
open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
TRUNCATED_DEF_PY
	check_all "$work/design/dulling.tsv" "$work/design/dulling-admission.tsv" "$work/out.$cases" "$work"
	if [[ ! -s "$work/out.$cases" ]] || ! grep -qE 'SelfTestTruncated is quoted as' "$work/out.$cases"; then
		printf 'FAIL self-test: a truncated definition walk did not report the shape finding\n'
		sed 's/^/  /' "$work/out.$cases"
		exit 1
	fi
	if grep -q 'Traceback' "$work/out.$cases"; then
		printf 'FAIL self-test: a truncated definition walk crashed instead of reporting\n'
		sed 's/^/  /' "$work/out.$cases"
		exit 1
	fi
	cp "$schema" "$work/DESIGN.cue"
	cp "$dulling" "$work/design/dulling.tsv"
	printf '  self-test %-38s fails as designed\n' "a truncated definition walk"

	printf 'design-ledger: self-test passed (%s mutations, every one failed the check)\n' "$cases"
	exit 0
fi

out="$(mktemp)"
trap 'rm -f "$out" "${out}".*' EXIT
check_all "$dulling" "$admission" "$out" "$root"
report "$out"
