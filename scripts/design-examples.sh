#!/usr/bin/env bash
# design-examples.sh — validate every example of DESIGN.md and every negative case against
# DESIGN.cue with CUE v0.17.1 (DESIGN.md Appendix A, D-PAT-4).
#
# Examples. Every ```yaml block in DESIGN.md is preceded by a marker line:
#   <!-- example: <id> -->               a complete document
#   <!-- example: <id> context -->       part of the shared project context (also validated alone)
#   <!-- example: <id> uses-context -->  a fragment of the shared project
# An unmarked block, a ```yml fence or an indented yaml fence fails the check, so no example
# escapes validation. The context blocks and every uses-context block form ONE project, validated
# as one document (so project-wide rules see all of it). Each document must pass
#   1. shape, as the loader checks it (§4.2 rule 3): each node against the one definition its
#      kind key selects —  cue vet -c DESIGN.cue load.cue -l '"doc"' <doc>
#   2. the same verdict from the root union —  cue vet -d '#Document' DESIGN.cue <doc>
#      (proves the user-facing command and the loader dispatch agree)
#   3. design/example/rules.cue: an empty `violation` list         (D-VAL-1, D-VAL-2, D-VAL-4)
#
# Negatives. Each design/negative/*.yaml starts with header comments:
#   # rule: D-…            the rule it breaks (a DESIGN.cue tag or a §5.4 rule)
#   # expect: <text>       text the failure output must contain
#   # def: #Reply          optional; the definition to validate against (default #Document)
# A §5.4 rule (D-VAL-*) is checked through rules.cue; a protocol case (# def:) with
# `cue vet -d <def>`; any other through the loader dispatch, and the root union must reject it
# too. A case that passes, or fails without its expected text, fails the check.
#
# Usage: scripts/design-examples.sh [root]   (root defaults to the repository root)
set -euo pipefail

root="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
cue="$(bash "$root/scripts/design-cue.sh")"
schema="$root/DESIGN.cue"
load="$root/design/example/load.cue"
rules="$root/design/example/rules.cue"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0
bad() { echo "FAIL $*"; fail=1; }

# shape <doc>: the loader's view (§4.2): the node definitions its kind keys select, then the steps
# dispatched by their intent and verb keys (D-LOAD-5). Prints the diagnostics; fails on any.
shape() {
	local out disp rc=0
	out="$("$cue" vet -c "$schema" "$load" -l '"doc"' "$1" 2>&1)" || rc=1
	[[ -z "$out" ]] || echo "$out"
	if ! disp="$("$cue" export "$schema" "$load" -l '"doc"' "$1" -e dispatch 2>&1)"; then
		echo "$disp"
		return 1
	fi
	if [[ "$(tr -d ' \n' <<<"$disp")" != "[]" ]]; then
		echo "$disp"
		rc=1
	fi
	return "$rc"
}

# ── extract ──────────────────────────────────────────────────────────────────
# Writes $work/<id>.yaml and $work/<id>.mode; reports unmarked blocks and duplicate ids.
awk -v out="$work" '
	function flush() { close(file) }
	# a fence that is not a yaml block (```text, ```bash, …) is skipped whole: markers shown in
	# it are illustrations, not markers
	/^[ \t]*```[ \t]*(yaml|yml)/ && !/^```yaml[ \t]*$/ && inblock == 0 && !other {
		printf "BADFENCE DESIGN.md:%d\n", NR; next
	}
	/^```/ && !/^```yaml[ \t]*$/ && inblock == 0 { other = !other; next }
	other { next }
	/^<!-- example: / {
		n = split($0, w, " "); id = w[3]; mode = (w[4] == "-->") ? "alone" : w[4]
		marked = NR; prev_nonblank = NR; next
	}
	/^```yaml[ \t]*$/ {
		if (marked != prev_nonblank) { printf "UNMARKED DESIGN.md:%d\n", NR; inblock = 2; next }
		if (seen[id]++) { printf "DUPLICATE DESIGN.md:%d %s\n", NR, id }
		file = out "/" id ".yaml"; printf "" > file
		print mode > (out "/" id ".mode"); close(out "/" id ".mode")
		printf "%d\n", NR > (out "/" id ".line"); close(out "/" id ".line")
		inblock = 1; next
	}
	/^```[ \t]*$/ && inblock { if (inblock == 1) flush(); inblock = 0; next }
	inblock == 1 { print > file }
	NF { prev_nonblank = NR }
' "$root/DESIGN.md" > "$work/extract.log"

while read -r kind where id; do
	case "$kind" in
	UNMARKED) bad "$where: a yaml block without an <!-- example: … --> marker" ;;
	BADFENCE) bad "$where: a yaml example starts with \`\`\`yaml at the start of a line" ;;
	DUPLICATE) bad "$where: example id '$id' is used twice" ;;
	esac
done < "$work/extract.log"

shopt -s nullglob
: > "$work/project.yaml"
for m in "$work"/*.mode; do
	[[ "$(cat "$m")" == context ]] && cat "${m%.mode}.yaml" >> "$work/project.yaml"
done
for m in "$work"/*.mode; do
	[[ "$(cat "$m")" == uses-context ]] && cat "${m%.mode}.yaml" >> "$work/project.yaml"
done
echo shared > "$work/project.mode"
echo "the shared project" > "$work/project.line"

# ── validate examples ───────────────────────────────────────────────────────────
count=0
for y in "$work"/*.yaml; do
	id="$(basename "$y" .yaml)"
	[[ -f "$work/$id.mode" ]] || continue
	mode="$(cat "$work/$id.mode")"
	line="$(cat "$work/$id.line")"
	doc="$y"
	case "$mode" in
	alone | context | shared) ;;
	uses-context) continue ;; # validated as part of the shared project
	*) bad "DESIGN.md:$line: example '$id' has unknown mode '$mode'"; continue ;;
	esac
	count=$((count + 1))
	if ! out="$(shape "$doc")"; then
		bad "DESIGN.md:$line: example '$id' does not validate:"
		echo "$out" | sed 's/^/    /' | head -20
		continue
	fi
	if ! out="$("$cue" vet -d '#Document' "$schema" "$doc" 2>&1)"; then
		bad "DESIGN.md:$line: example '$id' passes the loader dispatch but not #Document:"
		echo "$out" | sed 's/^/    /' | head -20
		continue
	fi
	if ! v="$("$cue" export "$schema" "$load" "$rules" -l '"doc"' "$doc" -e violation 2>&1)"; then
		bad "DESIGN.md:$line: example '$id': rules.cue failed:"
		echo "$v" | sed 's/^/    /' | head -20
	elif [[ "$v" != "[]" ]]; then
		bad "DESIGN.md:$line: example '$id' breaks a whole-document rule:"
		echo "$v" | sed 's/^/    /'
	fi
done
echo "examples: $count validated"

# ── negatives ─────────────────────────────────────────────────────────────────
ncount=0
for n in "$root"/design/negative/*.yaml; do
	name="$(basename "$n")"
	rule="$(sed -n 's/^# rule: //p' "$n" | head -1)"
	expect="$(sed -n 's/^# expect: //p' "$n" | head -1)"
	def="$(sed -n 's/^# def: //p' "$n" | head -1)"
	def="${def:-#Document}"
	ncount=$((ncount + 1))
	if [[ -z "$rule" || -z "$expect" ]]; then
		bad "design/negative/$name: missing '# rule:' or '# expect:' header"
		continue
	fi
	if [[ "$rule" == D-VAL-* ]]; then
		if ! out="$("$cue" export "$schema" "$load" "$rules" -l '"doc"' "$n" -e violation 2>&1)"; then
			bad "design/negative/$name ($rule): rejected by the schema instead of by rules.cue:"
			echo "$out" | sed 's/^/    /' | head -10
			continue
		fi
		if ! grep -q "\"rule\": \"$rule\"" <<<"$out"; then
			bad "design/negative/$name: expected a $rule violation, got: $(tr -d '\n' <<<"$out")"
			continue
		fi
	elif [[ "$def" != "#Document" ]]; then
		if out="$("$cue" vet -d "$def" "$schema" "$n" 2>&1)"; then
			bad "design/negative/$name ($rule): accepted by $def, but must be rejected"
			continue
		fi
	else
		if out="$(shape "$n")"; then
			bad "design/negative/$name ($rule): accepted by the loader dispatch, but must be rejected"
			continue
		fi
		if "$cue" vet -d '#Document' "$schema" "$n" >/dev/null 2>&1; then
			bad "design/negative/$name ($rule): rejected by the loader dispatch but accepted by #Document"
			continue
		fi
	fi
	if ! grep -qF -- "$expect" <<<"$out"; then
		bad "design/negative/$name ($rule): rejected, but not with '$expect':"
		echo "$out" | sed 's/^/    /' | head -12
	fi
done
echo "negatives: $ncount checked"

exit "$fail"
