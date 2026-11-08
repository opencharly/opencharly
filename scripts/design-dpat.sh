#!/usr/bin/env bash
# design-dpat.sh — the §25 schema-pattern gate over every pinned plugin CUE module.
#
# DESIGN.md §25 names "schema patterns on every plugin CUE module (D-PAT-1..3)" as a gate, and
# §10.1 states the patterns. This script is the control for all three, over the half of each that
# the pinned CUE text decides:
#
#   D-PAT-1  no `close(` call, no field written `f?: _|_`, no open struct except the `#Opaque`
#            definition, and every use of `#Opaque` marks itself `// S10`.
#   D-PAT-2  one name, one home: a top-level definition is declared in exactly one pinned module,
#            so no module restates a definition another module already owns (D-SCH-1, D-SCH-2).
#   D-PAT-3  no union is written out alternative by alternative: a `|` disjunction outside an
#            `or(...)` is a violation, except the two-value literal default S3 permits.
#
# WHAT THE GATE DOES NOT DECIDE, and does not pretend to (DESIGN.md A.11 states the same split):
# D-PAT-2's OWNERSHIP half — whether the one home is the plugin that owns the word — needs the
# word-to-owner registry the loader builds from each plugin's `describe`, which is Go, not the
# pinned CUE text; its COMPOSITION half — that core derives the document schema from that registry
# (§10.3) — is the loader's runtime behaviour. D-PAT-3's DERIVATION half — whether an `or(...)`
# ranges over the registry's own table rather than a local list — and its S5 half — whether a
# collection with identities is a map — are the same kind of runtime and design fact. So this
# control judges the FORM, and the design prose names the rest.
#
# WHAT IT READS. The tree's own pin set, from the INDEX (`git ls-files --stage`), so the schema
# judged is the schema that ships: `spec` and every `plugin-*` gitlink. A pinned repository is read
# from its own object store, `<git-common-dir>/modules/<path>`, at the pinned commit — never from a
# checkout, which can be stale, dirty, or absent (a session worktree materializes no gitlink).
# Every `.cue` file in the pinned tree is in scope except a `vendor/` tree, which mirrors another
# system's published schema (the egress vendoring pipeline) instead of a shape of charly's own; the
# run reports how many files it left out, so the boundary is visible rather than silent.
#
# THE CENSUS. The tree carries known violations today — the §10.1 rewrite is TODO.md 2.16 — and a
# gate that is red on landing enforces nothing, so `design/dpat-baseline.tsv` records them as a
# census: one row per (file, rule, symbol) with the count of occurrences. The check tolerates
# exactly what the census records, reports each tolerated violation as known and names the issue
# that retires the census, and FAILS on anything else:
#   * MORE occurrences of a construct than its count — a new violation;
#   * FEWER — the census overstates the debt, so it is lowered in the change that fixes it. That
#     is what makes "the census must reach zero" true instead of aspirational: the last row
#     deleted leaves a plain check with nothing to tolerate.
# The line a violation sits on is NOT part of a row's key: an edit that shifts a known violation
# must not turn the gate red, and a new violation landing on a tolerated line must not be blessed.
#
# RULES, in the order a run reports them:
#   close    a `close(` call
#   absence  a field written `f?: _|_`, on one line or wrapped onto the next
#   open     an open struct that is not the `#Opaque` definition
#   opaque   a `#Opaque` use whose line does not mark itself `// S10`
#   dup      a top-level definition name declared in a second pinned module (D-PAT-2)
#   union    a `|` disjunction outside `or(...)`, other than a two-value literal default (D-PAT-3)
#
# Comments and string literals are removed before a line is judged, so a schema that MENTIONS
# `close()` in prose is not a violation. Usage:
#
#   bash scripts/design-dpat.sh [<root>]        check the tree (exit 1 on any finding)
#   bash scripts/design-dpat.sh --self-test     prove every rule and both census directions fail
#   bash scripts/design-dpat.sh --emit-census   print the census these pins produce
#   bash scripts/design-dpat.sh -v              also list every known violation
set -uo pipefail

SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SELF/.." && pwd)
MODE=check
VERBOSE=0
for arg in "$@"; do
	case "$arg" in
	--self-test) MODE=self-test ;;
	--emit-census) MODE=emit ;;
	-v | --verbose) VERBOSE=1 ;;
	-*) printf 'design-dpat: unknown option %s\n' "$arg" >&2; exit 2 ;;
	*) ROOT=$(cd "$arg" && pwd) || exit 2 ;;
	esac
done
BASELINE="$ROOT/design/dpat-baseline.tsv"

# ── the rule catalogue ─────────────────────────────────────────────────────────────────────────
# ONE place per rule: the id the census records, the pattern it enforces, and the sentence a report
# prints with it. RULES is the one list a run counts and --emit-census prints, so adding a rule is a
# case here and nothing else.
RULES="close absence open opaque dup union"
rule_text() {
	case "$1" in
	close) printf '%s' 'a close() call — write the shape as a definition (#Name: {...}); CUE closes a definition recursively, so close() is never written (§10.1 S1)' ;;
	absence) printf '%s' 'a field written f?: _|_ — a union whose alternatives differ only by an absent field never resolves; tag the alternatives in one table and derive the union (§10.1 S4)' ;;
	open) printf '%s' 'an open struct that is not the #Opaque definition — declare the shape as a closed definition; only #Opaque is open (§10.1 S10)' ;;
	opaque) printf '%s' 'a #Opaque use with no // S10 marker — mark the line, or type the field (D-KIND-5)' ;;
	dup) printf '%s' 'a definition name with a second home — one name is one S1 definition in its owning module; import the one definition instead of restating it (D-PAT-2, D-SCH-1, D-SCH-2)' ;;
	union) printf '%s' 'a union written out alternative by alternative — derive it from one tag table (S4) or one vocabulary table (S3); only a two-value literal default is written inline (D-PAT-3)' ;;
	*) printf 'an unknown rule %s' "$1" ;;
	esac
}

# catalogue — "id=sentence" per rule, in RULES order. The one thing a caller passes when it needs
# the sentences; a rule added to RULES and rule_text is in every report with no further case.
catalogue() {
	local r
	for r in $RULES; do
		printf '%s=%s\n' "$r" "$(rule_text "$r")"
	done
}

# ── the pins ───────────────────────────────────────────────────────────────────────────────────
# pins <root> — "<path>\t<commit>" for every pinned plugin module of the tree, read from the index.
pins() {
	git -C "$1" ls-files --stage | awk -F'\t' '
		$1 ~ /^160000 / {
			split($1, meta, " ")
			if (meta[3] != "0") next
			if ($2 != "spec" && $2 !~ /^plugin-/) next
			printf "%s\t%s\n", $2, meta[2]
		}'
}

# ── the file stream ────────────────────────────────────────────────────────────────────────────
# Both readers below produce ONE stream of "@@FILE<TAB><display path>" markers followed by file
# content; the awk scanner is the only thing that judges it, so the fixture reader and the pin
# reader cannot drift apart in what they check. The counters are globals so the run can report the
# boundary: IN_SCOPE files judged, SKIPPED files a `vendor/` tree took out of scope.
#
# EVERY file body goes through `awk '1'`, which costs one process per file and buys the property
# the stream's grammar needs: the marker that opens a file starts a LINE. A blob with no trailing
# newline would otherwise glue the next file's marker onto its own last line — the scanner would
# not see the marker, and every line of the next file would be judged under the PREVIOUS file's
# name, silently. That is a smaller scan reporting success over a file it never attributed, the
# exact failure the loud-read and blind-run guards exist to prevent; measured on the pins, two of
# the in-scope files sat behind a blob without a final newline.
IN_SCOPE=0
SKIPPED=0
MODULES=0

# stream_pins <root> — the pinned modules. Fails LOUD when a pin cannot be read: a gate that
# silently judges fewer modules than it claims is the failure this control exists to prevent.
stream_pins() {
	local root="$1" common path sha gitdir file
	common=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir) || return 1
	while IFS=$'\t' read -r path sha; do
		[[ -n "$path" ]] || continue
		MODULES=$((MODULES + 1))
		gitdir="$common/modules/$path"
		if [[ ! -d "$gitdir" ]]; then
			printf 'design-dpat: %s is pinned and has no repository at %s — run `git submodule update --init %s`; the gate cannot read the schema it judges\n' \
				"$path" "$gitdir" "$path" >&2
			return 1
		fi
		if ! git --git-dir "$gitdir" cat-file -e "$sha" 2>/dev/null; then
			printf 'design-dpat: %s is pinned at %s and its repository does not have that commit — fetch it; the gate cannot read the schema it judges\n' \
				"$path" "$sha" >&2
			return 1
		fi
		while IFS= read -r file; do
			case "$file" in *.cue) ;; *) continue ;; esac
			emit_file "$path/$file" "$gitdir" "$sha" "$file"
		done < <(git --git-dir "$gitdir" ls-tree -r --name-only "$sha")
	done < <(pins "$root")
}

# emit_file <display> <gitdir> <commit> <path in the tree> — one stream entry, or nothing when a
# `vendor/` tree puts the file out of scope.
emit_file() {
	local display="$1" gitdir="$2" commit="$3" file="$4"
	case "/$file/" in
	*/vendor/*)
		SKIPPED=$((SKIPPED + 1))
		return 0
		;;
	esac
	IN_SCOPE=$((IN_SCOPE + 1))
	printf '@@FILE\t%s\n' "$display"
	git --git-dir "$gitdir" show "$commit:$file" | awk '1'
}

# stream_dir <dir> — the same stream from a plain directory tree (the self-test's fixture).
stream_dir() {
	local dir="$1" file display
	while IFS= read -r file; do
		display="${file#"$dir"/}"
		case "$display" in *.cue) ;; *) continue ;; esac
		case "/$display/" in
		*/vendor/*)
			SKIPPED=$((SKIPPED + 1))
			continue
			;;
		esac
		IN_SCOPE=$((IN_SCOPE + 1))
		printf '@@FILE\t%s\n' "$display"
		awk '1' "$file"
	done < <(find "$dir" -type f -name '*.cue' | sort)
}

# ── the scanner ───────────────────────────────────────────────────────────────────────────────
# scan <defs-out> — read the stream on stdin, write "<file>\t<line>\t<rule>\t<symbol>" per finding,
# and one "<file>\t<line>\t<name>\t<module>" record per TOP-LEVEL definition to <defs-out>. The
# symbol is the offending line's code with comments and strings removed and whitespace collapsed:
# the census keys on it, so a violation is recognised by WHAT it says, not by where it sits. The
# definition records are the one thing a line-by-line judge cannot decide — one name, one home is a
# fact about the WHOLE pinned set — so they leave this pass and `finish_dup` decides them, over the
# same `strip` state machine, rather than a second reader that could drift from this one.
scan() {
	local defs="$1"
	awk -v defs="$defs" '
	BEGIN { FS = "\t"; file = ""; ln = 0; depth = 0; blk = 0; str = 0; pending = 0; orcount = 0 }
	function norm(s) { gsub(/[ \t]+/, " ", s); sub(/^ /, "", s); sub(/ $/, "", s); return s }
	function emit(rule, text) { printf "%s\t%d\t%s\t%s\n", file, ln, rule, text }
	# literal_default(pos) — is the single bare `|` at pos one of the two alternatives of a LITERAL
	# default (§10.1 S3 permits `*false | bool` and nothing else inline)? The `*` alternative must be
	# a string, a number, true or false: a `*` on a DEFINITION or a struct is a shape choice, not a
	# default, and stays a union. Positions are shared between CODE and KEEP, so the test reads KEEP
	# (which keeps the quoted words) at the position CODE gave.
	function literal_default(pos,   l, r, lit) {
		lit = "\\*(\"[^\"]*\"|[0-9][0-9.eE+-]*|true|false)"
		l = substr(KEEP, 1, pos - 1); sub(/[ \t]+$/, "", l)
		r = substr(KEEP, pos + 1); sub(/^[ \t]+/, "", r)
		if (l ~ (lit "$")) return 1
		if (r ~ ("^" lit "([^A-Za-z0-9_\"]|$)")) return 1
		return 0
	}

	# strip(s) — the line as CODE with its comments and string literals blanked (positions
	# preserved), and in KEEP the same line with its comments dropped and its strings kept. Code
	# decides what a line SAYS, so a `close()` inside a comment or a string is not a call. KEEP is
	# what a report and the census name it BY, because a quoted label (a containerd plugin ID, an
	# "@go(...)" value) is the shape, and blanking it would merge two different findings into one.
	# The state (blk, str) carries across lines, so a /* ... */ block and a """ string are read as
	# what they are rather than as code.
	function strip(s,   out, kept, i, n, c, rest, j) {
		out = ""; kept = ""; i = 1; n = length(s)
		while (i <= n) {
			c = substr(s, i, 1)
			if (blk) {
				rest = substr(s, i)
				if (index(rest, "*/") == 0) { KEEP = kept; return out }
				i += index(rest, "*/") + 1
				blk = 0
				continue
			}
			if (str) {
				if (c == "\\") { out = out "  "; kept = kept c substr(s, i + 1, 1); i += 2; continue }
				if (substr(s, i, 3) == "\"\"\"") { out = out "   "; kept = kept "\"\"\""; i += 3; str = 0; continue }
				if (c == "\"") { out = out " "; kept = kept c; i += 1; str = 0; continue }
				out = out " "; kept = kept c; i += 1; continue
			}
			if (substr(s, i, 2) == "//") break
			if (substr(s, i, 2) == "/*") { blk = 1; out = out "  "; i += 2; continue }
			if (substr(s, i, 3) == "\"\"\"") {
				out = out "   "; kept = kept "\"\"\""; i += 3; str = 1
				rest = substr(s, i)
				if (index(rest, "\"\"\"") > 0) { j = index(rest, "\"\"\""); kept = kept substr(rest, 1, j + 2); i += j + 2; str = 0 }
				continue
			}
			if (c == "\"") { out = out " "; kept = kept c; i += 1; str = 1; continue }
			out = out c; kept = kept c; i += 1
		}
		KEEP = kept
		return out
	}

	/^@@FILE\t/ { file = substr($0, 8); ln = 0; depth = 0; blk = 0; str = 0; pending = 0; next }

	{
		if (file == "") next
		ln += 1
		raw = $0
		code = strip(raw)

		# absence, wrapped: the field ends its line and _|_ is alone on the next one
		if (pending && code ~ /^[ \t]*_\|_/) {
			emit("absence", pendingkeep " _|_")
			pending = 0
		} else if (pending) {
			pending = 0
		}

		if (code ~ /(^|[^A-Za-z0-9_])close[ \t]*[(]/) emit("close", norm(KEEP))
		if (code ~ /\?[ \t]*:[ \t]*_\|_/) emit("absence", norm(KEEP))
		if (code ~ /\?[ \t]*:[ \t]*$/) { pending = 1; pendingkeep = norm(KEEP) }

		# a #Opaque use outside its own definition marks itself // S10
		if (code ~ /#Opaque/ && code !~ /^[ \t]*#Opaque[ \t]*:/ && raw !~ /\/\/ *S10/) emit("opaque", norm(KEEP))

		# a TOP-LEVEL definition is one that starts in column 1; a definition nested in a struct is
		# its parent shape, so it is not a home of its own. CODE has comments and strings
		# blanked, so a `#Name:` inside either is not a definition, and it still starts with `#Name:`
		# when the line carries a trailing comment or a quoted value.
		if (code ~ /^#[A-Za-z0-9_]+[ \t]*:/) {
			nm = code; sub(/[ \t]*:.*$/, "", nm)
			mod = file; sub(/\/.*$/, "", mod)
			printf "%s\t%d\t%s\t%s\n", file, ln, nm, mod > defs
		}

		# open structs and unions, in ONE pass over the delimiters of a line. A standalone ... is an
		# open struct when its innermost open delimiter is a brace no #Opaque definition opened (a
		# spread and an open list are not). A `|` is a union written out alternative by alternative
		# unless it is inside an or(...) call (a derivation, S4/S3), is half of `_|_` (bottom), or is
		# one of the two alternatives of a literal default (literal_default above).
		i = 1
		nbar = 0
		while (i <= length(code)) {
			c = substr(code, i, 1)
			if (c == "{" || c == "(" || c == "[") {
				depth += 1
				delim[depth] = c
				mark[depth] = (c == "{" && substr(code, 1, i - 1) ~ /#Opaque[ \t]*:[ \t]*$/)
				opener[depth] = norm(KEEP)
				isor[depth] = (c == "(" && substr(code, 1, i - 1) ~ /(^|[^A-Za-z0-9_])or[ \t]*$/)
				if (isor[depth]) orcount += 1
				i += 1
				continue
			}
			if (c == "}" || c == ")" || c == "]") {
				if (depth > 0) { if (isor[depth]) orcount -= 1; depth -= 1 }
				i += 1
				continue
			}
			if (substr(code, i, 3) == "...") {
				if (depth > 0 && delim[depth] == "{" && !mark[depth]) {
					prev = substr(code, 1, i - 1); sub(/[ \t]+$/, "", prev)
					pc = tolower(substr(prev, length(prev), 1))
					# the symbol is the line that OPENED the struct: a lone ... on its own line
					# names nothing, and the definition that admitted it is what a reader needs.
					if (!(pc ~ /[a-z0-9_#]/ || pc == "]" || pc == ")" || pc == "\"")) emit("open", opener[depth])
				}
				i += 3
				continue
			}
			if (c == "|" && orcount == 0 &&
				!(i > 1 && substr(code, i - 1, 1) == "_" && substr(code, i + 1, 1) == "_")) {
				nbar += 1
				barpos[nbar] = i
			}
			i += 1
		}
		if (nbar == 1 && literal_default(barpos[1])) nbar = 0
		if (nbar > 0) emit("union", norm(KEEP))
	}
	'
}

# finish_dup <defs> — the whole-set rule: one name, one home (D-PAT-2). A name declared in two
# pinned MODULES is two shapes wearing one name, so it can no longer be one S1 definition in its
# owning module; every definition site of such a name is a finding, and the report names the other
# homes. A name declared twice inside ONE module is not a finding: CUE unifies the declarations
# into the one definition (a pattern constraint and the rows of the same map are written that way).
finish_dup() {
	awk -F'\t' '
	BEGIN { n = 0 }
	{
		n += 1
		d_file[n] = $1; d_line[n] = $2; d_name[n] = $3; d_mod[n] = $4
		if (!(($3 SUBSEP $4) in home)) { home[$3 SUBSEP $4] = 1; homes[$3] += 1 }
		if (!(($3 SUBSEP $1) in seenfile)) {
			seenfile[$3 SUBSEP $1] = 1
			fl_n[$3] += 1
			fl[$3 SUBSEP fl_n[$3]] = $1
		}
	}
	END {
		for (i = 1; i <= n; i++) {
			if (homes[d_name[i]] < 2) continue
			others = ""
			for (j = 1; j <= fl_n[d_name[i]]; j++) {
				if (fl[d_name[i] SUBSEP j] == d_file[i]) continue
				others = others (others == "" ? "" : ", ") fl[d_name[i] SUBSEP j]
			}
			printf "%s\t%d\tdup\t%s\talso defined in %s\n", d_file[i], d_line[i], d_name[i], others
		}
	}
	' "$1"
}

# ── the census ────────────────────────────────────────────────────────────────────────────────
# census <findings> <baseline> <fail-out> <known-out> — compare the findings with the census. A
# finding within its count is KNOWN and is written to <known-out>; anything else, in either
# direction, is a FAIL line. A malformed census row and a missing header are FAIL lines too.
census() {
	awk -F'\t' \
		-v fail="$3" -v known="$4" \
		-v catalogue="$(catalogue)" '
	BEGIN {
		OFS = "\t"
		# the catalogue is the ONE place the sentence of a rule lives; here it is read back into
		# the map a failure message needs, so a rule added to RULES/rule_text needs no case here.
		n = split(catalogue, line, "\n")
		for (i = 1; i <= n; i++) {
			k = index(line[i], "=")
			if (k > 0) T[substr(line[i], 1, k - 1)] = substr(line[i], k + 1)
		}
	}
	function text(r) { return (r in T) ? T[r] : ("an unknown rule " r) }
	FNR == NR {
		if ($0 ~ /^#/ || $0 == "") next
		if ($1 == "file" && $2 == "rule" && $3 == "symbol" && $4 == "count") { hdr = 1; next }
		if (NF != 4 || $4 !~ /^[0-9]+$/) {
			printf "FAIL design/dpat-baseline.tsv:%d: a census row is file, rule, symbol, count; this row is not\n", FNR > fail
			next
		}
		k = $1 SUBSEP $2 SUBSEP $3
		if (k in want) {
			printf "FAIL design/dpat-baseline.tsv:%d: a second row for %s %s in %s\n", FNR, $2, $3, $1 > fail
			next
		}
		want[k] = $4 + 0; wfile[k] = $1; wrule[k] = $2; wsym[k] = $3
		order[++n] = k
		next
	}
	{
		k = $1 SUBSEP $3 SUBSEP $4
		seen[k] += 1
		# within its count: KNOWN, and reported as such; beyond it: a new violation, with its line.
		# A fifth field says WHY (the other homes of a duplicated name); only `dup` writes one.
		if (seen[k] <= want[k] + 0) printf "%s\t%s\t%s\t%s\n", $1, $2, $3, $4 > known
		else printf "FAIL %s:%s: %s: %s%s\n", $1, $2, $3, text($3), ($5 == "" ? "" : " — " $5) > fail
	}
	END {
		if (!hdr) printf "FAIL design/dpat-baseline.tsv: the documented header row (file, rule, symbol, count) is missing\n" > fail
		# the other direction: a row the tree no longer needs. An occurrence BEYOND its row was
		# already reported above, with its line, so this loop only reports the shortfall.
		for (i = 1; i <= n; i++) {
			k = order[i]
			if (seen[k] + 0 >= want[k]) continue
			printf "FAIL design/dpat-baseline.tsv: still records %d x %s \"%s\" in %s and the tree has %d — lower it, the census must reach zero\n", \
				want[k], wrule[k], wsym[k], wfile[k], seen[k] > fail
		}
	}
	' "$2" "$1"
}

# emit_census <findings> — the census rows the current tree produces, in first-seen order.
emit_census() {
	awk -F'\t' '
	BEGIN { OFS = "\t" }
	{ k = $1 SUBSEP $3 SUBSEP $4; if (!(k in seen)) { seen[k] = 0; file[k] = $1; rule[k] = $3; sym[k] = $4; order[++n] = k } seen[k] += 1 }
	END { for (i = 1; i <= n; i++) { k = order[i]; print file[k], rule[k], sym[k], seen[k] } }
	' "$1"
}

# ── the baseline's header block ───────────────────────────────────────────────────────────────
# ONE owner of the census file's shape: the check validates it, --emit-census prints it, and the
# tracked-by line is carried over from the committed file so a regenerate preserves the record.
tracked_by() {
	[[ -f "$BASELINE" ]] || return 0
	grep -m1 -E '^# tracked-by: ' "$BASELINE" | sed 's/^# tracked-by: *//'
}

baseline_header() {
	cat <<'EOF'
# design/dpat-baseline.tsv — the §25 schema-pattern violations the gate tolerates.
#
# `scripts/design-dpat.sh` checks every pinned plugin CUE module against the §10.1 patterns and
# fails on each violation. It judges the half of each requirement that the pinned CUE text decides:
# D-PAT-1's never-table (`close(`, `f?: _|_`, an open struct that is not #Opaque, a #Opaque use with
# no `// S10`), D-PAT-2's one-name-one-home (a top-level definition declared in a second pinned
# module), and D-PAT-3's no-union-written-out (a `|` disjunction outside `or(...)`, other than the
# two-value literal default). The tree carries violations of all three today — the §10.1 rewrite is
# TODO.md 2.16 — and a gate that is red on landing enforces nothing, so they are recorded here as a
# census: the gate is green on this tree, and red on every new violation. DESIGN.md A.11 states
# which half of D-PAT-2 and D-PAT-3 is NOT decidable from this text and why.
#
# A row is file, rule, symbol, count — the number of times that construct occurs in that file. A
# construct's symbol is its line's code with comments and strings removed and whitespace collapsed,
# so a row is recognised by WHAT the line says, never by where it sits: an edit that shifts a known
# violation must not turn the gate red, and a new violation landing on a tolerated line must not be
# blessed. The check fails in both directions:
#   * a construct occurring MORE often than its count is a new violation;
#   * a construct occurring LESS often means the census overstates the debt, so the row is lowered
#     in the change that fixes it. That is what makes "the census must reach zero" true: delete the
#     last row and the gate is a plain check with nothing to tolerate.
#
# `bash scripts/design-dpat.sh --emit-census` prints this file from the current pins; a regenerate
# is a reviewed diff, because every row it drops is a violation somebody fixed.
EOF
	printf '# tracked-by: %s\n' "${1:-opencharly/opencharly#0 — filed before this gate landed}"
	printf 'file\trule\tsymbol\tcount\n'
}

# ── the check ────────────────────────────────────────────────────────────────────────────────
# reconcile_markers <stream> — the file count the readers reported (IN_SCOPE) must be the number of
# markers the scanner can SEE: a marker that does not start a line is invisible to it, and that
# file is judged under the name of the one before it. Prints the refusal and returns 1 on a
# mismatch, so "the gate judges every in-scope file" is a check rather than an assumption; the
# callers keep their own action (a FAIL line, or a refused census).
reconcile_markers() {
	local seen
	seen=$(grep -c '^@@FILE' "$1")
	if ((seen == IN_SCOPE)); then
		return 0
	fi
	printf 'the readers reported %s in-scope file(s) but only %s marker(s) start a line — a file whose marker is not at a line start is judged under the name of another file' \
		"$IN_SCOPE" "$seen"
	return 1
}

run_check() { # <stream file> <baseline> <fail-out> <known-out>
	: >"$3"
	: >"$4"
	if [[ ! -f "$2" ]]; then
		printf 'FAIL %s: the census is missing — the gate tolerates known violations only through it\n' "${2#"$ROOT"/}" >>"$3"
		return 0
	fi
	scan "$1.defs" <"$1" >"$1.findings"
	finish_dup "$1.defs" >>"$1.findings"
	census "$1.findings" "$2" "$3" "$4"
	if ! why=$(reconcile_markers "$1"); then
		printf 'FAIL %s: %s\n' "${1##*/}" "$why" >>"$3"
	fi
	local issue
	issue=$(grep -m1 -E '^# tracked-by: ' "$2" | sed 's/^# tracked-by: *//')
	[[ -n "$issue" ]] || printf 'FAIL %s: no "# tracked-by: <owner>/<repo>#<n>" line — the census must name the issue that retires it\n' "${2#"$ROOT"/}" >>"$3"
}

summary() { # <known file> <issue>
	local total counts r n
	total=$(wc -l <"$1" | tr -d ' ')
	counts=""
	for r in $RULES; do
		n=$(awk -F'\t' -v r="$r" '$3 == r { n += 1 } END { print n + 0 }' "$1")
		counts="$counts${counts:+, }$r $n"
	done
	printf 'design-dpat: %s pinned modules, %s CUE files in scope, %s under a vendor/ tree (foreign mirrors, out of scope)\n' \
		"$MODULES" "$IN_SCOPE" "$SKIPPED"
	printf 'design-dpat: %s known violations (%s) — tracked by %s\n' \
		"$total" "$counts" "$2"
}

# ── the self-test ────────────────────────────────────────────────────────────────────────────
# Prove the check can FAIL: a rule that cannot fail is not a control. Every case plants a
# violation (or bends the census) in an isolated fixture, runs the SAME scanner and the SAME census
# comparison, and asserts the run reports the finding. The clean fixture must pass first, or the
# harness — not the data — is broken.
self_test() {
	local cases=0
	work=$(mktemp -d)
	trap 'rm -rf "$work"' EXIT
	mkdir -p "$work/tree/fixture/schema" "$work/tree/other/schema" "$work/tree/vendor" "$work/b"
	IN_SCOPE=0
	SKIPPED=0
	MODULES=0

	# The fixture: every rule's tolerated form (a comment that mentions close(), strings that
	# contain `close(` and `|`, a spread, an open list, the #Opaque definition and a marked use, the
	# two-value literal defaults, and a derived union), in TWO modules so one-name-one-home has
	# something to judge. A fixture path's first component is its module, exactly as a pin's display
	# path (`<module>/<path inside the module>`) is.
	cat >"$work/tree/fixture/schema/ok.cue" <<'EOF'
package schema

// close() is what §10.1 rules out, and this comment proves a mention is not a call.
// a | b in a comment is not a union either.
#Endpoint: {
	port!:    #Port
	path?:    string
	probe?:   "a close( in a string is not a call"
	sep?:     "a|b in a string is not a union"
	fields?:  [#Field, ...#Field]
	spread?:  {#StepFields..., timeout?: string}
	config?:  #Opaque // S10
	readiness?: {
		ready: bool
	}
}
#Opaque: {...}
#StepFields: {
	id?: string
}
#Field: string
#Port: int
#Default: *false | bool
#Rows: *120 | (int & >0 & <=1000)
#Scoped: #Endpoint | *"any"
#Derived: or([for _, a in #Table {a}])
#DerivedWord: or(#WordList)
EOF
	printf 'package schema\n\n#Other: {a: int}\n' >"$work/tree/other/schema/other.cue"
	# A blob with no trailing newline, and a module AFTER it: the marker that opens the next file
	# must still start a line, or that file would be judged under this one's name.
	printf '#Tail: {a: int}' >"$work/tree/fixture/schema/tail.cue"
	# A vendored foreign mirror: out of scope by the reader's documented boundary.
	printf '#Foreign: close({\n\tx?: int\n})\n' >"$work/tree/vendor/mirror.cue"

	baseline_header "opencharly/opencharly#0 — self-test fixture" >"$work/b/census.tsv"

	cases_up() {
		cases=$((cases + 1))
		IN_SCOPE=0
		SKIPPED=0
		stream_dir "$work/tree" >"$work/stream"
		run_check "$work/stream" "$work/b/census.tsv" "$work/b/fail.$cases" "$work/b/known.$cases"
	}

	fail_like() { # fail_like <name> <pattern>
		if [[ ! -s "$work/b/fail.$cases" ]]; then
			printf 'FAIL self-test: %s did NOT fail the check\n' "$1"
			exit 1
		fi
		if ! grep -qE "$2" "$work/b/fail.$cases"; then
			printf 'FAIL self-test: %s failed for the wrong reason (no %s)\n' "$1" "$2"
			sed 's/^/  /' "$work/b/fail.$cases"
			exit 1
		fi
		printf '  self-test %-52s fails as designed\n' "$1"
	}
	pass_like() { # pass_like <name>
		if [[ -s "$work/b/fail.$cases" ]]; then
			printf 'FAIL self-test: %s was reported as a finding\n' "$1"
			sed 's/^/  /' "$work/b/fail.$cases"
			exit 1
		fi
		printf '  self-test %-52s passes as designed\n' "$1"
	}

	# the harness itself: the clean fixture must pass, or every case below proves nothing
	cases_up
	if [[ -s "$work/b/fail.$cases" ]]; then
		printf 'FAIL self-test: the clean fixture does not pass — the harness is broken, not the data\n'
		sed 's/^/  /' "$work/b/fail.$cases"
		exit 1
	fi
	printf '  self-test %-52s passes as designed\n' "the clean fixture"

	# ── every rule
	cat >>"$work/tree/fixture/schema/ok.cue" <<'EOF'

#Bad: close({
	x?: int
})
EOF
	cases_up
	fail_like "a close( call" 'ok.cue:[0-9]+: close:'
	head -n -3 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	cat >>"$work/tree/fixture/schema/ok.cue" <<'EOF'
#Absent: {a?: _|_, b: string}
EOF
	cases_up
	fail_like "a field written f?: _|_" 'ok.cue:[0-9]+: absence:'
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	printf '#Wrapped: {\n\ta?:\n\t\t_|_\n\tb: string\n}\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	fail_like "f?: on one line, _|_ on the next" 'ok.cue:[0-9]+: absence:'
	head -n -5 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	printf '#Open: {a: int, ...}\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	fail_like "an open struct that is not #Opaque" 'ok.cue:[0-9]+: open:'
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	printf '#Uses: {payload?: #Opaque}\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	fail_like "a #Opaque use with no // S10 marker" 'ok.cue:[0-9]+: opaque:'
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	# the marking is the difference: the same use WITH // S10 must pass
	printf '#Uses: {payload?: #Opaque // S10}\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	pass_like "a #Opaque use marked // S10"
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	# ── D-PAT-3: a union written out alternative by alternative
	printf '#Three: "a" | "b" | "c"\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	fail_like "a word union of three alternatives" 'ok.cue:[0-9]+: union:'
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	printf '#Choice: (#Endpoint | #Field)\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	fail_like "a shape union of two definitions" 'ok.cue:[0-9]+: union:'
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	printf '#TwoWords: "root" | "any"\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	fail_like "two words with no literal default" 'ok.cue:[0-9]+: union:'
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	# a `*` on a DEFINITION is a choice of shape, not the S3 default, so it stays a union
	printf '#Dflt: (*#Candy | #Image)\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	fail_like "a default on a definition, not a literal" 'ok.cue:[0-9]+: union:'
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	# the must-PASS forms: S3 permits exactly a two-value LITERAL default, and a derivation is not
	# an inline union. Each is planted alone and must be silent, or the reader is over-eager.
	printf '#D1: *true | bool\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	pass_like "a literal default with a type (*true | bool)"
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	printf '#D2: *2 | (int & >0 & <=1000)\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	pass_like "a literal default with a constraint"
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	printf '#D3: #Port | *"any"\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	pass_like "a literal default on the RIGHT of the union"
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	printf '#D4: or([for k, _ in #Table {k}])\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	pass_like "a union derived from one table (or([for ...]))"
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	printf '#D5: {text: """\na | b\n"""}\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	pass_like "a | inside a triple-quoted string"
	head -n -3 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	# `_|_` is the absence idiom (a D-PAT-1 finding), and it must not ALSO be read as a union:
	# one construct, one rule, or a fix would leave a phantom row behind.
	printf '#Abs2: {a?: _|_, b: string}\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	fail_like "f?: _|_ is judged as absence" 'ok.cue:[0-9]+: absence:'
	if grep -q ' union: ' "$work/b/fail.$cases"; then
		printf 'FAIL self-test: f?: _|_ was ALSO read as a union\n'
		sed 's/^/  /' "$work/b/fail.$cases"
		exit 1
	fi
	printf '  self-test %-52s passes as designed\n' "_|_ is not read as a union"
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	# ── the stream's grammar: a blob with no trailing newline must not swallow the next marker.
	# `fixture/schema/tail.cue` has no final newline and `other/schema/other.cue` sorts after it, so
	# a violation planted in the second must be reported under the SECOND file's name.
	printf '\n#Leak: close({\n\ta?: int\n})\n' >>"$work/tree/other/schema/other.cue"
	cases_up
	fail_like "a file after one with no trailing newline" 'other/schema/other.cue:[0-9]+: close:'
	head -n -4 "$work/tree/other/schema/other.cue" >"$work/trim" && mv "$work/trim" "$work/tree/other/schema/other.cue"

	# the guard behind that grammar: a stream whose marker is NOT at a line start is refused,
	# rather than judging that file under the name of the one before it. The readers' file count and
	# the count the scanner can see must agree, so "the gate judges every in-scope file" is a check.
	printf '@@FILE\tfixture/schema/a.cue\n#A: {a: int}@@FILE\tfixture/schema/b.cue\n#B: close({\n})\n' >"$work/b/glued"
	cases=$((cases + 1))
	IN_SCOPE=2
	run_check "$work/b/glued" "$work/b/census.tsv" "$work/b/fail.$cases" "$work/b/known.$cases"
	fail_like "a marker that does not start a line" 'marker\(s\) start a line'

	# ── D-PAT-2: one name, one home
	printf '#Shared: {a: int}\n' >>"$work/tree/fixture/schema/ok.cue"
	printf '\n#Shared: {b: int}\n' >>"$work/tree/other/schema/other.cue"
	cases_up
	fail_like "a definition name with a second home" 'other/schema/other.cue:[0-9]+: dup:'
	if ! grep -q 'also defined in fixture/schema/ok.cue' "$work/b/fail.$cases"; then
		printf 'FAIL self-test: the dup finding did not name the other home\n'
		sed 's/^/  /' "$work/b/fail.$cases"
		exit 1
	fi
	printf '  self-test %-52s names the other home\n' "the dup finding"
	head -n -1 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"
	head -n -2 "$work/tree/other/schema/other.cue" >"$work/trim" && mv "$work/trim" "$work/tree/other/schema/other.cue"

	# one MODULE declaring a name twice is one home (CUE unifies the declarations: a pattern
	# constraint and the rows of the same map are written that way, as spec does for its distros)
	printf '#Twice: [string]: string\n#Twice: {a: string}\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	pass_like "one name declared twice inside one module"
	head -n -2 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	# a NESTED definition is its parent shape's business, so it is not a home of its own
	printf '\n#Holder: {\n\t#Endpoint: {b: int}\n}\n' >>"$work/tree/other/schema/other.cue"
	cases_up
	pass_like "a nested definition with a name another module owns"
	head -n -4 "$work/tree/other/schema/other.cue" >"$work/trim" && mv "$work/trim" "$work/tree/other/schema/other.cue"

	# a vendored mirror is out of scope, and the boundary is counted rather than silent
	cases_up
	if [[ "$SKIPPED" != 1 ]]; then
		printf 'FAIL self-test: the vendor/ boundary was not reported (SKIPPED=%s)\n' "$SKIPPED"
		exit 1
	fi
	printf '  self-test %-52s passes as designed\n' "a close( inside a vendor/ mirror"

	# ── the census, in both directions
	cat >>"$work/tree/fixture/schema/ok.cue" <<'EOF'

#Known: close({
	x?: int
})
EOF
	baseline_header "opencharly/opencharly#0 — self-test fixture" >"$work/b/census.tsv"
	printf 'fixture/schema/ok.cue\tclose\t#Known: close({\t1\n' >>"$work/b/census.tsv"
	cases_up
	pass_like "a violation the census records"
	if ! grep -q '^fixture/schema/ok.cue	.*	close	' "$work/b/known.$cases"; then
		printf 'FAIL self-test: a tolerated violation was not reported as known\n'
		exit 1
	fi
	printf '  self-test %-52s reported as known\n' "the tolerated violation"

	# a tolerated line and a new one: the second occurrence is a new violation
	printf '#Also: close({\n\ty?: int\n})\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	fail_like "a second violation of a tolerated construct" 'ok.cue:[0-9]+: close:'
	head -n -3 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	# the census overstates the debt: a tolerated construct that is gone
	printf 'schema/gone.cue\tclose\t#Gone: close({\t1\n' >>"$work/b/census.tsv"
	cases_up
	fail_like "a census row the tree no longer needs" 'census must reach zero'
	sed -i '$d' "$work/b/census.tsv"

	# the line a violation sits on is not the key: shifting it must not turn the gate red
	printf '\n\n' >>"$work/tree/fixture/schema/ok.cue"
	printf '#Shifted: {a: int}\n' >>"$work/tree/fixture/schema/ok.cue"
	cases_up
	pass_like "a known violation whose line moved"
	head -n -3 "$work/tree/fixture/schema/ok.cue" >"$work/trim" && mv "$work/trim" "$work/tree/fixture/schema/ok.cue"

	# a malformed census row is a finding, not a silent zero
	printf 'schema/ok.cue\tclose\n' >>"$work/b/census.tsv"
	cases_up
	fail_like "a census row with no count" 'a census row is file, rule, symbol, count'
	sed -i '$d' "$work/b/census.tsv"

	# a census with no tracked-by line names no owner for the debt
	{ printf 'file\trule\tsymbol\tcount\n'; printf 'fixture/schema/ok.cue\tclose\t#Known: close({\t1\n'; } >"$work/b/untracked.tsv"
	cases_up
	run_check "$work/stream" "$work/b/untracked.tsv" "$work/b/fail.$cases" "$work/b/known.$cases"
	fail_like "a census that names no tracked issue" 'tracked-by'

	# a missing baseline is a finding: a check cannot silently run with no census
	cases_up
	run_check "$work/stream" "$work/b/absent.tsv" "$work/b/fail.$cases" "$work/b/known.$cases"
	fail_like "no census file at all" 'the census is missing'

	printf 'design-dpat: self-test passed (%s cases; every rule, both census directions, and the boundary each fail when they must)\n' "$cases"
}

# ── the modes ────────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == self-test ]]; then
	self_test
	exit 0
fi

# scope — a run that judged no CUE file proves nothing, in either direction: a census printed over
# nothing would be committed as an empty allowlist, and a check over nothing would report green.
scope() {
	if ((MODULES == 0)); then
		printf 'design-dpat: this tree records no pinned plugin module (no `spec` or `plugin-*` gitlink in its index), so there is nothing to judge — a run over nothing is blind, not green\n' >&2
		return 1
	fi
	if ((IN_SCOPE == 0)); then
		printf 'design-dpat: the %s pinned modules hold no CUE file in scope, so there is nothing to judge — a run over nothing is blind, not green\n' "$MODULES" >&2
		return 1
	fi
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
if [[ "$MODE" == emit ]]; then
	stream_pins "$ROOT" >"$work/stream" || { printf 'design-dpat: the pins could not be read (above)\n' >&2; exit 2; }
	scope || exit 2
	if ! why=$(reconcile_markers "$work/stream"); then
		printf 'design-dpat: %s — refusing to print a census over files it cannot attribute\n' "$why" >&2
		exit 2
	fi
	scan "$work/defs" <"$work/stream" >"$work/findings"
	finish_dup "$work/defs" >>"$work/findings"
	baseline_header "$(tracked_by)"
	emit_census "$work/findings"
	exit 0
fi

if [[ ! -f "$BASELINE" ]]; then
	printf 'FAIL design/dpat-baseline.tsv: the census is missing — the gate tolerates known violations only through it\n'
	printf 'design-dpat: FAILED (1 finding)\n'
	exit 1
fi
stream_pins "$ROOT" >"$work/stream" || {
	printf 'design-dpat: FAILED — the schema of every pinned module could not be read, so this run proves nothing\n'
	exit 1
}
scope || { printf 'design-dpat: FAILED — this run judged no schema\n'; exit 1; }
run_check "$work/stream" "$BASELINE" "$work/fail" "$work/known"
if [[ -s "$work/fail" ]]; then
	sed 's/^/  /' "$work/fail"
	printf 'design-dpat: FAILED (%s finding(s))\n' "$(wc -l <"$work/fail" | tr -d ' ')"
	exit 1
fi
if ((VERBOSE)); then
	issue=$(tracked_by)
	while IFS=$'\t' read -r file line rule symbol; do
		printf 'known %s:%s: %s "%s" — tracked by %s\n' "$file" "$line" "$rule" "$symbol" "$issue"
	done <"$work/known"
fi
summary "$work/known" "$(tracked_by)"
printf 'design-dpat: no new violation, and the census matches the tree\n'
