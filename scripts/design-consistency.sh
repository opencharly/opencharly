#!/usr/bin/env bash
# design-consistency.sh — check that DESIGN.md and DESIGN.cue say the same thing
# (DESIGN.md Appendix A). CUE v0.17.1 only; no other toolchain.
#
#   1 tables   every table under <!-- schema: <source>… [col=N] --> lists exactly the names of
#              its sources, in both directions. A source is
#                #Def        the fields of a struct definition (from `cue exp gengotypes`, which
#                            also lists optional fields — CUE itself cannot enumerate those)
#                _word       a word list in DESIGN.cue
#                keys(#Alt)  the tags of a registry definition (an S4 union's alternatives)
#              col=N picks the table column whose `backticked` words are compared (default 1).
#   2 lists    the word lists that mirror definitions equal them (the pairs in LIST_PAIRS), and the
#              @ref kind lists of DESIGN.cue equal the `want:` lists of design/example/rules.cue
#   3 rules    every `// D-…` tag in DESIGN.cue names a requirement of DESIGN.md and has a
#              negative case; every negative names a tag or a §5.4 rule; every §5.4 rule has a
#              negative and an owner from the §7.1 ownership table
#   4 ids      requirement IDs are unique and numbered 1..n per area in order of appearance;
#              every ID (ranges D-X-a..b included) in DESIGN.md, TODO.md, DESIGN.cue and the
#              design/ files resolves, and every § reference in DESIGN.md, TODO.md and DESIGN.cue
#   5 words    no "Not" term of the §2 registry (or its plural) appears outside §2; every key in DESIGN.cue is
#              singular (keys ending in `s` must be listed in D-NAME-1); a backticked
#              protocol method is spelled as its word list spells it; kind words,
#              directives and the field names of node-bearing bodies are disjoint (D-SCH-6)
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
g() { grep "$@" || (($? == 1)); }

# ── sources ────────────────────────────────────────────────────────────────────
mkdir -p "$work/gen/cue.mod"
cp "$schema" "$work/gen/"
printf 'module: "opencharly.dev/design"\nlanguage: version: "v0.17.1"\n' > "$work/gen/cue.mod/module.cue"
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

# ── 2 word lists that mirror definitions ─────────────────────────────────────────
LIST_PAIRS=(
	"_candyField=#Candy #BoxFields"
	"_deployField=#DeploymentFields #Pod #Vm #TopLocal #Android #KubernetesFields keys(#KubernetesAlt)"
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
cut -d: -f2 "$work/defs" | sort | uniq -d | while read -r id; do bad "DESIGN.md: $id is defined twice"; done
awk -F: '{ split($2, p, "-"); a = p[2]; n = p[3] + 0
	if (n != ++next_[a]) printf "DESIGN.md:%s: %s out of order (expected D-%s-%d)\n", $1, $2, a, next_[a] }' "$work/defs" > "$work/order"
while read -r l; do bad "$l"; done < "$work/order"
cut -d: -f2 "$work/defs" | sort -u > "$work/ids"

refs_in=("$md" "$schema" "$root"/design/example/*.cue "$root"/design/negative/*.yaml)
[[ -f "$root/TODO.md" ]] && refs_in+=("$root/TODO.md")
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
for f in "$md" "$root/TODO.md" "$schema"; do
	[[ -f "$f" ]] || continue
	g -no '§[0-9][0-9]*\(\.[0-9][0-9]*\)\?' "$f" | while IFS=: read -r ln ref; do
		grep -qx "${ref#§}" "$work/sections" || echo "FAIL ${f#"$root"/}:$ln: $ref names no section of DESIGN.md"
	done
done > "$work/secrefs"
if [[ -s "$work/secrefs" ]]; then cat "$work/secrefs"; fail=1; fi

# references: every @ref kind list in DESIGN.cue is a `want:` list in rules.cue and vice versa
g -o '@ref([^)]*)' "$schema" | sed 's/@ref(//; s/)//; s/ //g' |
	while read -r l; do tr ',' '\n' <<<"$l" | sort | paste -sd,; done | sort -u > "$work/refkinds"
g -o 'want: \[[^]]*\]' "$root/design/example/rules.cue" | sed 's/want: \[//; s/\]//; s/[" ]//g' |
	while read -r l; do tr ',' '\n' <<<"$l" | sort | paste -sd,; done | sort -u > "$work/wantkinds"
missing="$(setdiff "$work/refkinds" "$work/wantkinds" | tr '\n' ' ')"
extra="$(setdiff "$work/wantkinds" "$work/refkinds" | tr '\n' ' ')"
[[ -z "$missing" ]] || bad "design/example/rules.cue: no reference rule checks the @ref kinds: $missing"
[[ -z "$extra" ]] || bad "design/example/rules.cue: want: lists that match no @ref attribute of DESIGN.cue: $extra"

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
	sed 's/([^)]*)//g' | tr ',' '\n' | sed 's/^ *//; s/ *$//' | g -v '^—\?$' | sort -u > "$work/banned"
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

# disjointness (D-SCH-6)
words _kindWord | sort -u > "$work/k"
for other in _directiveWord _candyField _deployField; do
	words "$other" | sort -u > "$work/o"
	both="$(comm -12 "$work/k" "$work/o" | tr '\n' ' ')"
	[[ -z "$both" ]] || bad "DESIGN.cue: kind words and $other overlap: $both"
done

if ((fail)); then exit 1; fi
echo "consistency: tables, word lists, rule tags, ids and § references, vocabulary — all agree"
