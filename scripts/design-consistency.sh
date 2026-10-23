#!/usr/bin/env bash
# design-consistency.sh — check that DESIGN.md and DESIGN.cue say the same thing
# (DESIGN.md Appendix A). CUE v0.18.0-rc.1 only; no other toolchain.
#
#   1 tables   every table under <!-- schema: <source>… [col=N] --> lists exactly the names of
#              its sources, in both directions. A source is
#                #Def        the fields of a struct definition (from `cue exp gengotypes`, which
#                            also lists optional fields — CUE itself cannot enumerate those)
#                _word       a word list in DESIGN.cue
#                keys(#Alt)  the tags of a registry definition (an S4 union's alternatives)
#              col=N picks the table column whose `backticked` words are compared (default 1).
#   2 lists    the word lists that mirror definitions equal them (the pairs in LIST_PAIRS), the
#              @ref kind lists and type-table `ref` lists of DESIGN.cue equal the `want:` lists of
#              design/example/rules.cue,
#              and the two verb tables #FactVerb and #ProtocolVerb share no word (D-VERB-6)
#   3 rules    every `// D-…` tag in DESIGN.cue names a requirement of DESIGN.md and has a
#              negative case; every negative names a tag or a §5.4 rule; rules.cue emits exactly
#              the §5.4 rules marked `rules.cue`, each with a negative; every §5.4 owner is an
#              owner in the §7.1 ownership table
#   4 ids      requirement IDs are unique and numbered 1..n per area in order of appearance;
#              every ID (ranges D-X-a..b included) in DESIGN.md, TODO.md, DESIGN.cue, the design/
#              files and the parity ledger resolves, and every § reference in DESIGN.md, TODO.md,
#              DESIGN.cue and design/parity.tsv; the ledger's mechanism column is M1–M8,
#              workflow or authoring (§1.1)
#   5 words    no "Not" term of the §2 registry (or its plural) appears outside §2; every key in DESIGN.cue is
#              singular (keys ending in `s` must be listed in D-NAME-1); every S<n> pattern
#              reference is defined in §3.1 and a range S1–S<n> ends at the last; a backticked
#              protocol method is spelled as its word list spells it; kind words,
#              directives and the field names of node-bearing bodies are disjoint (D-SCH-6); every
#              backticked `#…`/`_…` name in DESIGN.md prose is a definition of DESIGN.cue
#   6 patterns DESIGN.cue uses only §3.1's constructs (D-PAT-1): no close(), no matchN, no
#              forbidden field ?: _|_, exactly one open struct {...} (#Opaque), and every other use of
#              #Opaque marks itself `// S10` — no first-party word is left untyped (D-KIND-5)
#   7 shape    every table row of DESIGN.md and TODO.md has its header's cell count and ends with |
#   8 grammar  DESIGN.cue vets as a package; every list comprehension is one of the derivation forms
#              D1–D6 (D-GEN-8); no word beside a word union, and a default word is a row of its table;
#              no inline enum of 3+ words, no @go(, no retired suffix; every table has an @vocab owner;
#              schema words are snake_case; no inline struct with named fields besides its S4 tag, at
#              any depth (C1); no row writes an inline struct into a shape slot (S11)
#
# Usage: scripts/design-consistency.sh [root]
# Self-test: scripts/design-selftest.sh scripts/design-consistency.sh design/consistency/selftest.tsv
set -euo pipefail

root="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
cue="$(bash "$root/scripts/design-cue.sh")"

md="$root/DESIGN.md"
schema="$root/DESIGN.cue"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0
bad() { echo "FAIL $*"; fail=1; }
# g: grep for listings. "No match" (exit 1) is an empty result, not a failure; a real error
# (exit 2) still fails. Under `set -e -o pipefail` a bare grep would end the script silently.
# g is for listings only: it maps "no match" to success, so a presence TEST is `grep -q`, never
# `g -q` — `g -q … || bad` can never fail (self-tests open-struct-not-opaque, prose-stale-definition).
g() { grep "$@" || (($? == 1)); }

# ── sources ────────────────────────────────────────────────────────────────────
mkdir -p "$work/gen/cue.mod"
cp "$schema" "$work/gen/"
printf 'module: "opencharly.dev/design"\nlanguage: version: "v0.18.0"\n' > "$work/gen/cue.mod/module.cue"
(cd "$work/gen" && "$cue" exp gengotypes . >/dev/null) || { echo "FAIL gengotypes on DESIGN.cue"; exit 1; }
gotypes="$work/gen/cue_types_gen.go"

# fields <Type>: the top-level json field names of a generated struct.
fields() {
	grep -q "^type $1 struct" "$gotypes" || { echo "!no struct definition #$1"; return; }
	awk -v T="$1" '
		$0 ~ "^type " T " struct" { on = 1; d = 0 }
		on {
			o = gsub(/{/, "{"); c = gsub(/}/, "}"); d += o - c
			if (d == 1 && match($0, /json:"[^",]+/)) print substr($0, RSTART + 6, RLENGTH - 6)
			if (d == 0 && (o || c)) on = 0
		}' "$gotypes"
}
# export <expr>: a CUE list of strings, one per line.
export_words() {
	local out
	out="$("$cue" export "$schema" -e "$1" --out yaml 2>&1)" || { echo "!cannot export $1: $out"; return; }
	sed -n 's/^- //p' <<<"$out" | sed "s/^'\(.*\)'$/\1/; s/^\"\(.*\)\"$/\1/"
}
# words <source>: the names a marker source stands for.
words() {
	case "$1" in
	\#*) fields "${1#\#}" ;;
	_*) export_words "$1" ;;
	keys\(\#*\)) local d="${1#keys(}"; export_words "[for k, _ in ${d%)} {k}]" ;;
	*) echo "!unknown source $1" ;;
	esac
}
setdiff() { comm -23 <(sort -u "$1") <(sort -u "$2"); }

# ── 1 tables ────────────────────────────────────────────────────────────────────
awk -v work="$work" '
	/^ *```/ { fence = !fence; next }
	fence { next }
	/^<!-- schema: .* -->$/ { sub(/^<!-- schema: /, ""); sub(/ -->$/, ""); spec[++n] = $0; line[n] = NR; pending = 1; next }
	pending && /^\|/ {
		for (i = 1; i <= n; i++) printf "%d\t%s\n", line[i], spec[i] > (work "/markers")
		for (i = 1; i <= n; i++) { start[i] = NR }
		table = 1; rows = 0; pending = 0; nspec = n; n = 0
	}
	table && /^\|/ { rows++; if (rows > 2) for (i = 1; i <= nspec; i++) print NR "\t" $0 > (work "/table." start[1]); next }
	table { table = 0 }
	pending && NF && !/^<!--/ { printf "%d\tORPHAN\n", line[1] > (work "/markers"); pending = 0; n = 0 }
' "$md"
touch "$work/markers"
declare -A tablestart=()
while IFS=$'\t' read -r mline spec; do
	if [[ "$spec" == ORPHAN ]]; then bad "DESIGN.md:$mline: a schema marker with no table under it"; continue; fi
	col=1
	srcs=()
	for tok in $spec; do
		case "$tok" in col=*) col="${tok#col=}" ;; *) srcs+=("$tok") ;; esac
	done
	# the table that follows this marker: the first table.<n> with n > mline
	tfile=""
	for t in $(ls "$work"/table.* 2>/dev/null | sed 's/.*table\.//' | sort -n); do
		if ((t > mline)); then tfile="$work/table.$t"; break; fi
	done
	[[ -n "$tfile" ]] || { bad "DESIGN.md:$mline: no table after the marker"; continue; }
	awk -F'|' -v c=$((col + 1)) '{ print $c }' "$tfile" | g -o '`[a-z][a-z0-9_-]*`' | tr -d '`' | sort -u > "$work/have"
	: > "$work/want"
	for s in "${srcs[@]}"; do words "$s" >> "$work/want"; done
	if grep -q '^!' "$work/want"; then bad "DESIGN.md:$mline: $(grep -m1 '^!' "$work/want" | cut -c2-)"; continue; fi
	missing="$(setdiff "$work/want" "$work/have" | tr '\n' ' ')"
	extra="$(setdiff "$work/have" "$work/want" | tr '\n' ' ')"
	[[ -z "$missing" ]] || bad "DESIGN.md:$mline: table column $col lacks what ${srcs[*]} defines: $missing"
	[[ -z "$extra" ]] || bad "DESIGN.md:$mline: table column $col names what ${srcs[*]} does not define: $extra"
done < "$work/markers"

# an UNMARKED table whose backticked first column contains every name of a source (three or
# more names), those names being more than half of the column, mirrors the schema unchecked,
# whether or not it adds words of its own
awk '
	/^ *```/ { fence = !fence; next }
	fence { next }
	/^<!-- schema: .* -->$/ { marked = 1; next }
	/^\|/ {
		if (!intable) { intable = 1; start = NR; rows = 0; words = "" }
		rows++
		if (rows > 2) { n = split($0, c, "|"); cell = c[2]
			while (match(cell, /`[a-z][a-z0-9_-]*`/)) { words = words substr(cell, RSTART + 1, RLENGTH - 2) "\n"; cell = substr(cell, RSTART + RLENGTH) } }
		next
	}
	intable { if (!marked) printf "%d\t%s%c", start, words, 0; intable = 0; marked = 0; next }
	NF { marked = 0 }
' "$md" > "$work/unmarked"
: > "$work/sources"
for t in $(g -o '^type [A-Za-z0-9]* struct' "$gotypes" | awk '{print $2}'); do
	fields "$t" | sort -u | paste -sd, | sed "s/^/#$t\t/" >> "$work/sources"
done
for alt in $(g -o '^#[A-Za-z]*Alt:\|^#KindNode:\|^#Verb:' "$schema" | tr -d ':'); do
	words "keys($alt)" | g -v '^!' | sort -u | paste -sd, | sed "s/^/keys($alt)\t/" >> "$work/sources"
done
for w in $(g -o '^_[a-zA-Z]*:' "$schema" | tr -d ':'); do
	out="$(words "$w" | g -v '^!' | sort -u | paste -sd,)"
	[[ -n "$out" ]] && printf '%s\t%s\n' "$w" "$out" >> "$work/sources"
done
while IFS=$'\t' read -r -d '' start list; do
	set="$(printf '%s' "$list" | g -v '^$' | sort -u | paste -sd,)"
	[[ "$set" == *,* ]] || continue
	src="$(awk -F'\t' -v s="$set" '
		BEGIN { n = split(s, t, ","); for (i = 1; i <= n; i++) have[t[i]] = 1 }
		{ m = split($2, w, ","); if (m < 3 || 2 * m <= n) next
		  for (i = 1; i <= m; i++) if (!(w[i] in have)) next
		  print $1; exit }' "$work/sources")"
	[[ -z "$src" ]] || bad "DESIGN.md:$start: this table lists every name of $src but has no <!-- schema: … --> marker"
done < "$work/unmarked"

# ── 2 word lists that mirror definitions ─────────────────────────────────────────
LIST_PAIRS=(
	"_candyField=#Candy #BoxFields"
	"_deployField=#DeploymentFields #ContentFields _placementWord #MachineFields #KubernetesFields #AndroidFields #LocalFields #AgentFields"
	"_directiveWord=#Document"
)
for pair in "${LIST_PAIRS[@]}"; do
	list="${pair%%=*}"
	words "$list" > "$work/have"
	: > "$work/want"
	for s in ${pair#*=}; do words "$s" >> "$work/want"; done
	missing="$(setdiff "$work/want" "$work/have" | tr '\n' ' ')"
	extra="$(setdiff "$work/have" "$work/want" | tr '\n' ' ')"
	[[ -z "$missing" ]] || bad "DESIGN.cue: $list lacks fields of ${pair#*=}: $missing"
	[[ -z "$extra" ]] || bad "DESIGN.cue: $list lists names no definition of ${pair#*=} has: $extra"
done

# ── 4 ids (defined set first; checks 3 and 4 use it) ─────────────────────────────
g -no '^| D-[A-Z]*-[0-9]* |' "$md" | sed 's/| //; s/ |$//' > "$work/defs" # line:ID
# the loop reads a file in THIS shell: a `| while … bad` pipeline would set fail in a subshell
cut -d: -f2 "$work/defs" | sort | uniq -d > "$work/dupids"
while read -r id; do bad "DESIGN.md: $id is defined twice"; done < "$work/dupids"
awk -F: '{ split($2, p, "-"); a = p[2]; n = p[3] + 0
	if (n != ++next_[a]) printf "DESIGN.md:%s: %s out of order (expected D-%s-%d)\n", $1, $2, a, next_[a] }' "$work/defs" > "$work/order"
while read -r l; do bad "$l"; done < "$work/order"
cut -d: -f2 "$work/defs" | sort -u > "$work/ids"

refs_in=("$md" "$schema" "$root"/design/example/*.cue "$root"/design/negative/*.yaml)
[[ -f "$root/TODO.md" ]] && refs_in+=("$root/TODO.md")
[[ -f "$root/design/parity.tsv" ]] && refs_in+=("$root/design/parity.tsv")
for f in "${refs_in[@]}"; do
	rel="${f#"$root"/}"
	g -no 'D-[A-Z]*-[0-9][0-9]*\(\.\.[0-9][0-9]*\)\?' "$f" | while IFS=: read -r ln ref; do
		area="${ref%-*}"; area="${area%%-[0-9]*}"
		first="${ref##*-}"; first="${first%%..*}"
		last="${ref##*..}"; [[ "$ref" == *..* ]] || last="$first"
		base="$(sed 's/-[0-9][0-9.]*$//' <<<"$ref")"
		for ((k = first; k <= last; k++)); do
			grep -qx "$base-$k" "$work/ids" || echo "FAIL $rel:$ln: $base-$k is not a requirement of DESIGN.md"
		done
	done
done > "$work/refs"
if [[ -s "$work/refs" ]]; then cat "$work/refs"; fail=1; fi

g -o '^#\{2,3\} [0-9][0-9]*\(\.[0-9][0-9]*\)\?' "$md" | sed 's/^#* //' | sort -u > "$work/sections"
for f in "$md" "$root/TODO.md" "$schema" "$root/design/parity.tsv"; do
	[[ -f "$f" ]] || continue
	# the ledger's evidence column cites sections of other documents; its `home` column cites DESIGN.md
	src="$f"
	if [[ "$f" == */parity.tsv ]]; then awk -F'\t' '{ print $6 }' "$f" > "$work/parity-home"; src="$work/parity-home"; fi
	g -no '§[0-9][0-9]*\(\.[0-9][0-9]*\)\?' "$src" | while IFS=: read -r ln ref; do
		grep -qx "${ref#§}" "$work/sections" || echo "FAIL ${f#"$root"/}:$ln: $ref names no section of DESIGN.md"
	done
done > "$work/secrefs"
if [[ -s "$work/secrefs" ]]; then cat "$work/secrefs"; fail=1; fi

# the ledger's `mechanism` column names a mechanism of §1.1, or one of the two things on top of them
if [[ -f "$root/design/parity.tsv" ]]; then
	awk -F'\t' '!/^#/ && $1 != "current" && $5 !~ /^(M[1-8]|workflow|authoring)$/ {
		printf "FAIL design/parity.tsv:%d: mechanism %s is not M1–M8, workflow or authoring (§1.1)\n", NR, $5 }' \
		"$root/design/parity.tsv" > "$work/mechcol"
	if [[ -s "$work/mechcol" ]]; then cat "$work/mechcol"; fail=1; fi
fi

# references: every @ref kind list in DESIGN.cue is a `want:` list in rules.cue and vice versa
{ g -o '@ref([^)]*)' "$schema" | sed 's/@ref(//; s/)//; s/ //g'
  # a type-table row whose keys name nodes states its kinds as `ref: [...]` (S9)
  g -v '^[[:space:]]*//' "$schema" | g -o 'ref: \[[^]]*\]' | sed 's/ref: \[//; s/\]//; s/[" ]//g'
} | while read -r l; do tr ',' '\n' <<<"$l" | sort | paste -sd,; done | sort -u > "$work/refkinds"
g -o 'want: \[[^]]*\]' "$root/design/example/rules.cue" | sed 's/want: \[//; s/\]//; s/[" ]//g' |
	while read -r l; do tr ',' '\n' <<<"$l" | sort | paste -sd,; done | sort -u > "$work/wantkinds"
missing="$(setdiff "$work/refkinds" "$work/wantkinds" | tr '\n' ' ')"
extra="$(setdiff "$work/wantkinds" "$work/refkinds" | tr '\n' ' ')"
[[ -z "$missing" ]] || bad "design/example/rules.cue: no reference rule checks the @ref kinds: $missing"
[[ -z "$extra" ]] || bad "design/example/rules.cue: want: lists that match no @ref attribute of DESIGN.cue: $extra"

# the two verb tables share no word (D-VERB-6): a verb is a fact verb or a protocol verb, never both
words "keys(#FactVerbAlt)" | sort -u > "$work/factverb"
words "keys(#ProtocolVerbAlt)" | sort -u > "$work/protoverb"
both="$(comm -12 "$work/factverb" "$work/protoverb" | tr '\n' ' ')"
[[ -z "$both" ]] || bad "DESIGN.cue: words in both verb tables (#FactVerbAlt, #ProtocolVerbAlt): $both"

# ── 3 rules ─────────────────────────────────────────────────────────────────────
g -no '// D-[A-Z]*-[0-9]*\(, D-[A-Z]*-[0-9]*\)*' "$schema" | sed 's|// ||' |
	while IFS=: read -r ln tags; do tr ',' '\n' <<<"$tags" | tr -d ' ' | sed "s/^/$ln:/"; done > "$work/tags"
sed -n 's/^# rule: //p' "$root"/design/negative/*.yaml | sort -u > "$work/negrules"
# §5.4 rules whose "Design check" column is `rules.cue` must have a negative case
g '^| D-VAL-[0-9]* |' "$md" | awk -F'|' '$(NF-1) ~ /rules\.cue/ { gsub(/ /, "", $2); print $2 }' | sort -u > "$work/valrules"
while IFS=: read -r ln tag; do
	grep -qx "$tag" "$work/negrules" || bad "DESIGN.cue:$ln: $tag is enforced here but no design/negative case tests it"
done < "$work/tags"
while read -r r; do
	grep -qx "$r" "$work/negrules" || bad "DESIGN.md: §5.4 rule $r is checked by rules.cue but has no design/negative case"
done < "$work/valrules"
# the rules rules.cue emits are exactly the §5.4 rules marked `rules.cue`
g -o 'rule: "D-VAL-[0-9]*"' "$root/design/example/rules.cue" | sed 's/rule: "//; s/"//' | sort -u > "$work/emitted"
missing="$(setdiff "$work/valrules" "$work/emitted" | tr '\n' ' ')"
extra="$(setdiff "$work/emitted" "$work/valrules" | tr '\n' ' ')"
[[ -z "$missing" ]] || bad "design/example/rules.cue: emits no violation for the §5.4 rules marked rules.cue: $missing"
[[ -z "$extra" ]] || bad "design/example/rules.cue: emits rules §5.4 does not mark rules.cue: $extra"
cut -d: -f2 "$work/tags" | cat - "$work/valrules" | sort -u > "$work/testable"
while read -r r; do
	grep -qx "$r" "$work/testable" || bad "design/negative: '# rule: $r' is neither a DESIGN.cue tag nor a §5.4 rule"
done < "$work/negrules"
# owners: the §7.1 ownership table's owner column
awk '/^### 7\.1 /{s=1} s && /^## 8\./{s=0} s && /^\| / && !/^\| Concept/ && !/^\|---/ { n=split($0, c, "|"); print c[n-1] }' "$md" |
	sed 's/^ *//; s/ *$//' | sort -u > "$work/owners"
g '^| D-VAL-[0-9]* |' "$md" | while IFS= read -r row; do
	id="$(cut -d'|' -f2 <<<"$row" | tr -d ' ')"
	owner="$(awk -F'|' '{ print $(NF-2) }' <<<"$row" | sed 's/^ *//; s/ *$//')"
	tr ',' '\n' <<<"$owner" | sed 's/^ *//; s/ *$//' | while read -r o; do
		grep -qxF "$o" "$work/owners" || echo "FAIL DESIGN.md: $id names owner '$o', which is not an owner in §7.1"
	done
done > "$work/own"
if [[ -s "$work/own" ]]; then cat "$work/own"; fail=1; fi

# ── 5 words ─────────────────────────────────────────────────────────────────────
# the §2 registry: | **term** | meaning | Not |
awk '/^## 2\. /{s=1} /^### 2\.1 /{s=0} s && /^\| \*\*/ { n=split($0, c, "|"); print c[n-1] }' "$md" |
	sed 's/([^)]*)//g' > "$work/notcells"
# a banned term is a comma-separated bare word OR a `backticked phrase` — the latter is how a MULTI-WORD
# ban is written, and a comma split alone can never express one.
{ tr ',' '\n' < "$work/notcells" | sed 's/^ *//; s/ *$//'
  g -o '`[^`]*`' "$work/notcells" | tr -d '`'
} | tr -d '`' | sed 's/^ *//; s/ *$//' | g -v '^—\?$' | g -v '^$' | sort -u > "$work/banned"
# the prose outside §2, as "<line>:<text>" — the file name is never part of the matched text
awk '/^## 2\. /{s=1} /^### 2\.1 /{s=0} { if (!s) print FNR ":" $0 }' "$md" > "$work/prose"
awk '{ print FNR ":" $0 }' "$schema" > "$work/schema-lines"
while read -r term; do
	pat="(^|[^[:alnum:]_-])$(sed 's/[][\.*^$]/\\&/g' <<<"$term")(s|es)?([^[:alnum:]_-]|$)"
	g -iE -- "$pat" "$work/prose" | cut -d: -f1 | while read -r ln; do
		echo "FAIL DESIGN.md:$ln: '$term' is a §2 \"Not\" term"
	done
	g -iE -- "$pat" "$work/schema-lines" | cut -d: -f1 | while read -r ln; do
		echo "FAIL DESIGN.cue:$ln: '$term' is a §2 \"Not\" term"
	done
done < "$work/banned" > "$work/wording"
if [[ -s "$work/wording" ]]; then cat "$work/wording"; fail=1; fi

# singular keys: every json field of every generated struct and every registry key
g '^| D-NAME-1 |' "$md" | g -o 'ending in `s`[^|]*' | g -o '`[a-z_]*`' | tr -d '`' | g -vx s | sort -u > "$work/plural_ok"
{
	g -o 'json:"[^",]*' "$gotypes" | sed 's/json:"//'
	for alt in $(g -o '^#[A-Za-z]*Alt:' "$schema" | tr -d ':#'); do words "keys(#$alt)"; done
	for w in _kindWord _verbWord _directiveWord _intentWord _managerWord _roleWord _methodWord _hostMethodWord _errorCodeWord; do words "$w"; done
} | g -v '^!' | sort -u > "$work/keys"
g 's$' "$work/keys" | while read -r k; do
	grep -qx "${k##* }" "$work/plural_ok" || echo "FAIL DESIGN.cue: key '$k' ends in s and is not listed as singular in D-NAME-1"
done > "$work/plural"
if [[ -s "$work/plural" ]]; then cat "$work/plural"; fail=1; fi

# one spelling per term: a backticked protocol method is written as its word list spells it
for w in $(words _methodWord; words _hostMethodWord; words _pluginMethodWord); do
	cap="$(tr '[:lower:]' '[:upper:]' <<<"${w:0:1}")${w:1}"
	g -n "\`$cap\`" "$md" | cut -d: -f1 | while read -r ln; do
		echo "FAIL DESIGN.md:$ln: \`$cap\` — the method is spelled \`$w\` (§8.2)"
	done
done > "$work/spelling"
if [[ -s "$work/spelling" ]]; then cat "$work/spelling"; fail=1; fi

# schema-pattern references: every S<n> is a pattern §3.1 defines; a range S1–S<n> ends at the last
awk '/^### 3\.1 /{s=1} /^### 3\.2 /{s=0} s && /^\| S[0-9]+ \|/ { sub(/^\| S/, ""); sub(/ \|.*/, ""); print }' "$md" | sort -n > "$work/patterns"
last="$(tail -1 "$work/patterns")"
for f in "$md" "$schema" "$root/TODO.md"; do
	[[ -f "$f" ]] || continue
	g -no 'S[0-9][0-9]*\(–S[0-9][0-9]*\)\?' "$f" | while IFS=: read -r ln ref; do
		for n in $(sed 's/S//g; s/–/ /' <<<"$ref"); do
			grep -qx "$n" "$work/patterns" || echo "FAIL ${f#"$root"/}:$ln: S$n is not a schema pattern of §3.1"
		done
		if [[ "$ref" == *–* && "${ref##*S}" != "$last" ]]; then
			echo "FAIL ${f#"$root"/}:$ln: $ref — the pattern range ends at S$last (§3.1)"
		fi
	done
done > "$work/patref"
if [[ -s "$work/patref" ]]; then cat "$work/patref"; fail=1; fi

# disjointness (D-SCH-6)
words _kindWord | sort -u > "$work/k"
for other in _directiveWord _candyField _deployField; do
	words "$other" | sort -u > "$work/o"
	both="$(comm -12 "$work/k" "$work/o" | tr '\n' ' ')"
	[[ -z "$both" ]] || bad "DESIGN.cue: kind words and $other overlap: $both"
done

# prose names only definitions the schema has: a backticked #… or _… outside a code block
awk '/^[[:space:]]*```/ { f = !f; next }
	!f { s = $0; while (match(s, /`[#_][A-Za-z][A-Za-z0-9_]*/)) { print FNR "\t" substr(s, RSTART + 1, RLENGTH - 1); s = substr(s, RSTART + RLENGTH) } }' "$md" |
	while IFS=$'\t' read -r ln d; do
		grep -q "^$d:" "$schema" || echo "FAIL DESIGN.md:$ln: \`$d\` names no definition of DESIGN.cue"
	done > "$work/defnames"
if [[ -s "$work/defnames" ]]; then cat "$work/defnames"; fail=1; fi

# ── 6 patterns (D-PAT-1) ─────────────────────────────────────────────────────────
g -n 'close(\|matchN\|?: *_|_' "$schema" | g -v '^[0-9]*:[[:space:]]*//' | while IFS=: read -r ln _; do
	echo "FAIL DESIGN.cue:$ln: a construct §3.1 rules out (close(), matchN or a forbidden field ?: _|_)"
done > "$work/patterns-out"
open="$(g -c '{\.\.\.}' "$schema")"
[[ "$open" == 1 ]] || echo "FAIL DESIGN.cue: $open open structs {...}; exactly one (#Opaque) is allowed" >> "$work/patterns-out"
grep -q '^#Opaque: {\.\.\.}' "$schema" || echo "FAIL DESIGN.cue: the one open struct is not the #Opaque definition" >> "$work/patterns-out"
# every use of #Opaque outside its definition and outside comments marks itself `// S10` (D-KIND-5)
g -n '#Opaque' "$schema" | g -v '^[0-9]*:#Opaque: {\.\.\.}' | g -v '^[0-9]*:[[:space:]]*//' | g -v '// S10' |
	while IFS=: read -r ln _; do echo "FAIL DESIGN.cue:$ln: an #Opaque use outside S10 — type the field, or mark a foreign payload // S10"; done >> "$work/patterns-out"
if [[ -s "$work/patterns-out" ]]; then cat "$work/patterns-out"; fail=1; fi

# ── 7 table shape ───────────────────────────────────────────────────────────────
# Every row of a markdown table carries its header's cell count and ends with `|`. A stray cell
# silently misaligns a NORMATIVE table and no other check sees it: a §5.4 rule row once shipped with a
# fifth cell because a split-proof note was appended instead of folded into its `Design check` cell.
shape() {
	awk '
		function cells(line,   n,i,c,prev) {
			n = 0; prev = ""
			for (i = 1; i <= length(line); i++) {
				c = substr(line, i, 1)
				if (c == "|" && prev != "\\") n++
				prev = c
			}
			return n - 1
		}
		/^\|/ {
			if (!inrow) { hdr = cells($0); inrow = 1 }
			else {
				if (cells($0) != hdr)
					printf "FAIL %s:%d: a table row has %d cells where its table has %d\n", FILE, FNR, cells($0), hdr
				if (substr($0, length($0), 1) != "|")
					printf "FAIL %s:%d: a table row does not end with a `|`\n", FILE, FNR
			}
			next
		}
		{ inrow = 0 }
	' "$@"
}
shape "$md" "$root/TODO.md" > "$work/shape"
if [[ -s "$work/shape" ]]; then cat "$work/shape"; fail=1; fi

# ── 8 grammar (§3.1, §6) ─────────────────────────────────────────────────────────
# Every shape is spelled one way, so the generator maps each to one Go shape (D-GEN-8, D-NAME-2).
# The schema itself evaluates: a package-level vet checks the invariants of its own tables (one
# default driver per subsystem, D-DRV-1), which a document vet does not reach.
"$cue" vet "$schema" > "$work/pkgvet" 2>&1 || { sed -n '1,5s/^/FAIL DESIGN.cue: /p' "$work/pkgvet"; fail=1; }
# the S10 marker lines and comments are not code
g -n '' "$schema" | sed 's|//.*$||' > "$work/code"
{
	# a word list is derived from its table, never written out (S3)
	g '^[0-9]*:_[a-zA-Z]*Word: \[' "$work/code" | g -v '\[for ' |
		while IFS=: read -r ln _; do echo "FAIL DESIGN.cue:$ln: a hand-written word list; derive it from its table: [for w, _ in _x {w}] (S3)"; done
	# every list comprehension is one of the derivation forms D1–D6 (D-GEN-8): strip each form where
	# it may stand, and whatever comprehension is left is spelled some other way
	sed -E \
		-e 's/^([0-9]+):_[a-zA-Z]+Word: \[for w, _ in [_#][a-zA-Z]+ \{w\}\][[:space:]]*$/\1:D1/' \
		-e 's/^([0-9]+):_[a-zA-Z]+Word: \[for w, r in _[a-zA-Z]+ if [^][{}]+ \{w\}\][[:space:]]*$/\1:D2/' \
		-e 's/^([0-9]+):_[a-zA-Z]+: \{for k, _ in _[a-zA-Z]+ \{\(k\): \[for w, r in _[a-zA-Z]+ if [^][{}]+ \{w\}\]( & [^{}]+)?\}\}[[:space:]]*$/\1:D3/' \
		-e 's/or\(\[for _, a in #[A-Za-z]+Alt \{a\}\]\)/D4/g' \
		-e 's/or\(\[for ([a-z]) in r\.[a-z_]+ \{[_#A-Za-z]+(\[[a-z]\])?\[\1\]\}\]\)/D6/g' \
		"$work/code" | g -E '\[(for|if) ' |
		while IFS=: read -r ln _; do echo "FAIL DESIGN.cue:$ln: a list comprehension outside the derivation forms D1–D6; name the filter as a D2 or D3 word list (D-GEN-8)"; done
	# a word union admits only its table's words: no word written beside it, and a default is a row (S3)
	g -nE '(^|[^*])"[a-z_]+" *\| *or\(_|or\(_[^)]*\) *\| *"' "$work/code" |
		while IFS=: read -r ln _; do echo "FAIL DESIGN.cue:$ln: a word written beside a word union; make it a row of the table (S3)"; done
	g -oE '^[0-9]+:.*\*"[a-z_]+" *\| *or\(_[a-zA-Z]+Word\)' "$work/code" |
		sed -E 's/^([0-9]+):.*\*"([a-z_]+)" *\| *or\((_[a-zA-Z]+Word)\)$/\1 \2 \3/' |
		while read -r ln w list; do
			words "$list" | grep -qxF "$w" || echo "FAIL DESIGN.cue:$ln: the default \"$w\" is not a row of the table of $list (S3)"
		done
	# no inline enum of three or more words: a closed set of words is a table (S3)
	g -n '"[a-z_]*" *| *"[a-z_]*" *| *"' "$schema" | g -v '^[0-9]*:[[:space:]]*//' |
		while IFS=: read -r ln _; do echo "FAIL DESIGN.cue:$ln: an inline enum of three or more words; make it a vocabulary table (S3)"; done
	# no Go annotation: Go names and types derive from the shapes (§6, C1–C7)
	g -n '@go(' "$schema" | while IFS=: read -r ln _; do echo "FAIL DESIGN.cue:$ln: an @go attribute; Go names and types derive from the shapes (§6)"; done
	# a definition's name ends in a suffix of the closed set (D-NAME-4)
	g -no '^#[A-Za-z0-9]\+\(Body\|Only\|Type\|IO\|Entry\|Attr\|Reply\|Info\|Spec\):' "$schema" |
		while IFS=: read -r ln name; do echo "FAIL DESIGN.cue:$ln: $name ends in a retired suffix; name it by its shape (D-NAME-4)"; done
} > "$work/grammar"
# every vocabulary table names its owner with @vocab, and the owner is core, registry, spec or a §7.1 plugin
sed -n 's/^\([a-z]*\) plugin$/\1/p' "$work/owners" | cat - <(printf 'core\nregistry\nspec\n') | sort -u > "$work/vocabowners"
g -o '^_[a-zA-Z]*Word: \[for w, _ in _[a-zA-Z]* {w}\]' "$schema" | sed 's/.* in \(_[a-zA-Z]*\) .*/\1/' | sort -u |
	while read -r t; do
		line="$(g -n "^$t: {.*@vocab(\|^$t: {" "$schema" | tail -1)"
		# the table's own text: its one line, or its block up to the closing `}` at column 0
		blk="$(awk -v t="$t" '$0 ~ "^"t": \\{" { on = 1; print; if ($0 !~ /\{[ \t]*$/) exit; next } on { print } on && /^}/ { exit }' "$schema" | g -m1 -o '@vocab([a-z]*)')"
		ln="${line%%:*}"
		if [[ -z "$blk" ]]; then echo "FAIL DESIGN.cue:$ln: the table $t names no @vocab owner (S3)"; continue; fi
		owner="${blk#@vocab(}"; owner="${owner%)}"
		grep -qxF "$owner" "$work/vocabowners" || echo "FAIL DESIGN.cue:$ln: @vocab($owner) of $t is not core, registry, spec or a §7.1 plugin"
	done >> "$work/grammar"
# every schema word is snake_case: field names, tag-table keys and the word lists (D-NAME-2)
{
	g -o 'json:"[^",]*' "$gotypes" | sed 's/json:"//'
	for alt in $(g -o '^#[A-Za-z]*Alt:' "$schema" | tr -d ':#'); do words "keys(#$alt)"; done
	for w in $(g -o '^_[a-zA-Z]*Word:' "$schema" | tr -d ':'); do words "$w"; done
} | g -v '^!' | sort -u | g -vE '^[a-z][a-z0-9]*(_[a-z0-9]+)*$' |
	while read -r w; do echo "FAIL DESIGN.cue: '$w' is not a snake_case schema word (D-NAME-2)"; done >> "$work/grammar"
# an inline struct declares at most one named field, its S4 tag (S1, C1), at any depth; tables and
# derived definitions (lines under `_…`) are data, and a definition's own one-line body is the
# definition, while a struct nested inside it is not
awk '
	function scan(text, skipfirst,   i, c, d, st, n, depth, fields, seg, j, first) {
		d = 0; first = 1
		for (i = 1; i <= length(text); i++) {
			c = substr(text, i, 1)
			if (c == "{") { d++; st[d] = i; nf[d] = 0; seen[d] = "" }
			else if (c == "}" && d > 0) {
				if (!(skipfirst && first && d == 1) && nf[d] > 1) printf "FAIL DESIGN.cue:%d: an inline struct with %d named fields; name it as a definition (S1, §6 C1)\n", NR, nf[d]
				if (d == 1) first = 0
				d--
			}
			else if (d > 0 && c == ":" && substr(text, i + 1, 1) != "=") {
				seg = substr(text, st[d] + 1, i - st[d] - 1)
				sub(/.*[{,][ \t]*/, "", seg); sub(/^[ \t]*/, "", seg)
				if (seg ~ /^"?[a-z_][a-z0-9_]*"?[!?]?$/) nf[d]++
			}
		}
	}
	/^[ \t]*\/\// { next }
	{ sub(/[ \t]*\/\/.*$/, "") }
	/^_/ { data = ($0 ~ /\{[ \t]*$/ || $0 ~ /[{(][ \t]*$/); if (!data) next; next }
	data && /^}/ { data = 0; next }
	data { next }
	/^#[A-Za-z0-9]*: / { scan($0, 1); next }
	{ scan($0, 0) }
' "$schema" >> "$work/grammar"
# a row of a typed row table is data: a shape slot (a field its #XRow types `_`) holds a named
# definition, a scalar, a word union or {}, never an inline struct with fields (S11)
awk '/^#[A-Za-z]*Row: \{/ { on = 1 } on { print } on && /}[ \t]*$/ && (/^}/ || /^#[A-Za-z]*Row: \{.*}[ \t]*$/) { on = 0 }' "$schema" |
	g -oE '[a-z_]+[!?]?: +_([,} ]|$)' | sed -E 's/[!?]?:.*//' | sort -u > "$work/slots"
awk '/^_[a-zA-Z]+: \{/ { on = 1 } on { print NR ": " $0 } on && /^}/ { on = 0 } on && /^_[a-zA-Z]+: \{.*}[ \t]*(@[a-z]+\([a-z]*\))?[ \t]*$/ { on = 0 }' "$schema" |
	sed 's|//.*$||' > "$work/rows"
while read -r slot; do
	g -E "[{ ,]$slot: *\{ *[^} ]" "$work/rows" |
		while IFS=: read -r ln _; do echo "FAIL DESIGN.cue:$ln: the row writes an inline struct into its shape slot '$slot'; name it as a definition (S11)"; done
done < "$work/slots" >> "$work/grammar"
if [[ -s "$work/grammar" ]]; then cat "$work/grammar"; fail=1; fi

if ((fail)); then exit 1; fi
echo "consistency: tables, table shape, word lists, rule tags, ids and § references, vocabulary, grammar — all agree"
