#!/usr/bin/env bash
# design-cite.sh — the CITATION-AT-THE-PIN control (DESIGN.md A.13).
#
# design/dulling.tsv cites the pinned source it reasons about by `path:line` —
# `plugin-jetkvm/candy/plugin-jetkvm/schema/jetkvm.cue:437-473`. That is a claim about a PINNED
# commit's BYTES, and nothing in this tree resolved it: `scripts/design-ledger.sh` checks that a
# citation into `DESIGN.md`/`DESIGN.cue` names a requirement, a section or a definition, and
# deliberately refuses a LINE there ("a line number drifts on every edit of this document") — but a
# citation into a pinned submodule was accepted in the line form and never opened. So the one
# citation form that rots on somebody ELSE's schedule was the one form no control read
# (opencharly/opencharly#963).
#
# MEASURED, on the pins `main` carried when this control was written: `jetkvm.cue:437-473` ends two
# lines short of `#JetkvmDeviceInput` (its doc comment starts at :470, its body at :475) and
# `jetkvm.cue:481-578` spans `_method` (:516-605) instead of the enum `#JetkvmMethod` (:614). Both
# rows survived every `bash scripts/design-check.sh` run because nothing read them; two `cua` rows
# of the same shape were falsified by the pin advance of #962 and repaired by hand in #964 — which
# is the proof that the class recurs on every advance.
#
# WHAT THE CONTROL DECIDES, AND WHAT IT DOES NOT (the split A.11 makes for the schema-pattern gate).
# A row's citation is one of three things, and each is judged on what its own text can decide:
#
#   A PATH REFERENCE   `<pinned module>/<path in it>` — "this is the artifact that shows today".
#      Judged: the path EXISTS in the module's tree AT THE PINNED COMMIT (a file or a directory,
#      `git cat-file -t`). A path the pin does not have is a failure, never a skip.
#
#   A NAME CITATION    `<path>:#<Definition>` — "this file declares this construct". Judged: the
#      pinned file declares `<Definition>` as a top-level header at the pin. This is the form a
#      pin advance CANNOT falsify, which is why A.8 offers it: the design document moved its own
#      citations off line numbers for exactly this reason, and a pinned schema's construct has a
#      name too.
#
#   A LINE CITATION    `<path>:<a>` or `<path>:<a>-<b>` — "these lines are the artifact". Judged on
#      three decidable facts, and NOT on a fourth that is not decidable:
#        (1) the range is inside the file at the pin: `1 <= a <= b <= <lines>`, non-empty;
#        (2) the CONSTRUCT the range sat inside when the row was affirmed still encloses it, and
#        (3) the BYTES at those lines are still the bytes the row was affirmed against.
#
# WHAT IT DOES NOT DECIDE. It does not decide whether those bytes are what the row's PROSE means.
# The ledger carries no machine-readable statement of a line range's subject — a row names a
# `#Definition` of `DESIGN.cue`, never the construct of a pinned module — so "the range contains
# what the row claims" is NOT decidable from the ledger's own data, and a control that asserted it
# would be asserting something it cannot know. That judgement is stated here instead of faked: the
# two facts above are recorded at affirmation time in `design/cite-baseline.tsv`, and they turn the
# silent failure — a pin advance re-pointing a citation at a different construct — into a LOUD one.
# A row that wants its subject checked cites the construct by NAME (form 2), which cannot drift.
#
# WHY THE BASELINE IS NOT AN EXEMPTION. `design/cite-baseline.tsv` records, per line citation, the
# construct that enclosed it and a digest of its bytes. BOTH directions are failures: a citation
# ABSENT from the file is a claim nobody affirmed, and a ROW of the file whose citation the ledger
# no longer carries overstates the record — it is lowered in the change that re-anchored the row.
# So the file can only shrink toward the rows that cite a name, and it can never bless a citation
# it does not already record. That is the discipline `design/dpat-baseline.tsv` states for its
# census (A.11), applied to the citations instead of the constructs.
#
# A CITATION INTO THIS REPOSITORY'S OWN FILES is judged for existence and range only. It cannot
# drift under a third party's commit — the author who moves those lines is the author who edits
# this ledger, in this repository — whereas a pinned module's citation drifts under a pin advance
# this tree did not make. That difference is why the baseline covers the pins and not the local
# files, and it is not a hole: the range and the file are still checked.
#
# WHERE IT READS. The pins come from the tree's INDEX (`git ls-files --stage`), and each pinned
# module is read FROM ITS OWN OBJECT STORE AT THE PINNED COMMIT — never from a checkout, which can
# be stale, dirty or absent. Where that store is, is `scripts/design-module-store.sh`'s answer (a
# linked worktree keeps its submodule repositories under
# `<git-common-dir>/worktrees/<name>/modules/<path>`), so this control sources the ONE resolver
# `design-dpat.sh` and `design-pintag.sh` already use instead of writing a second one. A pin whose
# store or commit cannot be read is a failure that names the path and the remedy, never a smaller
# scan that still reports success.
#
# Usage:
#   bash scripts/design-cite.sh [<root>]         check both ledgers (exit 1 on any finding)
#   bash scripts/design-cite.sh --self-test      mutate every arm and prove each one fails
#   bash scripts/design-cite.sh --emit-baseline  print design/cite-baseline.tsv for this tree
#   bash scripts/design-cite.sh -v               also list the citations that pass
set -uo pipefail

SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SELF/.." && pwd)
MODE=check
VERBOSE=0
for arg in "$@"; do
	case "$arg" in
	--self-test) MODE=self-test ;;
	--emit-baseline) MODE=emit ;;
	-v | --verbose) VERBOSE=1 ;;
	-*) printf 'design-cite: unknown option %s\n' "$arg" >&2; exit 2 ;;
	*) ROOT=$(cd "$arg" && pwd) || exit 2 ;;
	esac
done

DULLING=design/dulling.tsv
ADMISSION=design/dulling-admission.tsv
BASELINE=design/cite-baseline.tsv
BASELINE_HEADER=$'capability\tpath\tlines\tanchor\tdigest'

# The store resolver is SOURCED, not reimplemented: a second copy of "where is this module's
# repository" is how the pin-tag control came to fail LOUD on a healthy pin
# (scripts/design-module-store.sh states that measurement).
. "$SELF/design-module-store.sh"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

declare -A PIN_OF STORE_OF FILE_OF CONSTR_OF
FETCH_FINDINGS=""

# ── the pins ─────────────────────────────────────────────────────────────────────────────────
# pins <root> — "<path>\t<commit>" for every gitlink of the tree's index. A gitlink is a MODE, not a
# name: the mode is what is asked, so a newly pinned module is in scope with nothing to remember.
pins() {
	git -C "$1" ls-files --stage | awk -F'\t' '
		$1 ~ /^160000 / { split($1, meta, " "); if (meta[3] != "0") next; printf "%s\t%s\n", $2, meta[2] }'
}

# load_pins <root> — fill PIN_OF and STORE_OF once per run.
load_pins() {
	local root="$1" path sha
	PIN_OF=()
	STORE_OF=()
	FILE_OF=()
	CONSTR_OF=()
	while IFS=$'\t' read -r path sha; do
		[[ -n "$path" ]] || continue
		PIN_OF[$path]="$sha"
		STORE_OF[$path]=$(design_module_store "$root" "$path" 2>/dev/null || true)
	done < <(pins "$root")
}

# ── the citations ───────────────────────────────────────────────────────────────────────────
# cite_scan <root> — one record per citation, from EVERY column of both ledgers:
#
#   <ledger>\t<capability>\t<column>\t<path>\t<subject>
#
# <subject> is `<a>`, `<a>-<b>` or `#<Name>`, and empty for a path reference with no subject, so one
# stream decides both "does this path exist" and "does the subject resolve". A token whose path has
# no `/` and names no file of this repository is PROSE — `(plugin-omarchy schema:7-12)` in a `today`
# cell is a sentence, and a control that read it as a citation would report a defect nobody can act
# on. That decision needs the tree, so it is made by the caller, not here.
#
# EVERY COLUMN, not only `evidence`: the ledger control's own header says a mechanical sweep that
# reads one column leaves dangling references behind (round 3), and a citation in `today` is a claim
# like any other.
cite_scan() {
	local root="$1" ledger line i n
	for ledger in "$DULLING" "$ADMISSION"; do
		[[ -f "$root/$ledger" ]] || continue
		while IFS= read -r line; do
			[[ "$line" == \#* ]] && continue
			IFS=$'\t' read -r -a cells <<<"$line"
			[[ "${cells[0]}" == "capability" || "${cells[0]}" == "path" ]] && continue
			n=${#cells[@]}
			for ((i = 1; i < n; i++)); do
				[[ "${cells[i]}" == */* || "${cells[i]}" == *:* ]] || continue
				printf '%s\t%s\t%d\t%s\n' "$ledger" "${cells[0]}" "$((i + 1))" "${cells[i]}"
			done
		done <"$root/$ledger"
	done | awk -F'\t' '
		# A CITATION: a path with a subject — a line, a line range, or a #definition. Its path is
		# blanked out of the text as it is taken, so the bare pass below never re-reads it.
		function pathlike(t,   base) {
			if (t !~ /\//) return 0
			if (t ~ /^\// || t ~ /\/$/) return 0
			base = t; sub(/.*\//, "", base)
			if (base !~ /\.(cue|go|yml|yaml|json|md|sh|py|tsv|toml|txt|conf|sql|proto|mod|sum)$/) {
				# no extension: a path only when its first segment is a pinned-looking module name,
				# so a prose token like `and/or` is a sentence and not a citation of nothing
				if (t !~ /^(plugin-|charly|spec|sdk|layer-|distro-|pod-|vm-)[A-Za-z0-9_.@-]*\//) return 0
			}
			return 1
		}
		{
			ledger = $1; cap = $2; col = $3; text = $4
			while (match(text, /[A-Za-z0-9_.@\/-]+:(#[A-Za-z][A-Za-z0-9_]*|[0-9]+(-[0-9]+)?)/)) {
				tok = substr(text, RSTART, RLENGTH)
				text = substr(text, 1, RSTART - 1) " " substr(text, RSTART + RLENGTH)
				split(tok, parts, ":")
				path = parts[1]
				subject = substr(tok, length(path) + 2)
				printf "%s\t%s\t%s\t%s\t%s\n", ledger, cap, col, path, subject
			}
			while (match(text, /[A-Za-z0-9_.@\/-]+\/[A-Za-z0-9_.@\/-]+/)) {
				tok = substr(text, RSTART, RLENGTH)
				text = substr(text, 1, RSTART - 1) " " substr(text, RSTART + RLENGTH)
				sub(/\.+$/, "", tok)
				if (!pathlike(tok)) continue
				printf "%s\t%s\t%s\t%s\t\n", ledger, cap, col, tok
			}
		}' | sort -u
}

# ── the pinned bytes ─────────────────────────────────────────────────────────────────────────
# file_at <root> <module> <path> — the cited file's bytes at the pin, into $WORK, or nothing and a
# failure recorded in FETCH_FINDINGS. Read from the module's OBJECT STORE at the pinned commit:
# a checkout beside it is never consulted, however stale or convenient.
file_at() {
	local root="$1" module="$2" path="$3" sha store rel key out
	key="$module/$path"
	if [[ -n "${FILE_OF[$key]+set}" ]]; then
		[[ -n "${FILE_OF[$key]}" ]] || return 1
		printf '%s' "${FILE_OF[$key]}"
		return 0
	fi
	sha="${PIN_OF[$module]:-}"
	store="${STORE_OF[$module]:-}"
	rel="${path#"$module"/}"
	if [[ -z "$sha" ]]; then
		FETCH_FINDINGS+="FAIL pins: $module is pinned with no commit in the index"$'\n'
		FILE_OF[$key]=""
		return 1
	fi
	if [[ -z "$store" || ! -d "$store" ]]; then
		FETCH_FINDINGS+="FAIL pins: $module is pinned at ${sha:0:12} and has no repository at ${store:-<unresolved>} — run \`git submodule update --init -- $module\`"$'\n'
		FILE_OF[$key]=""
		return 1
	fi
	out="$WORK/f$(printf '%s' "$key" | sha256sum | cut -c1-16)"
	if ! git --git-dir "$store" show "$sha:$rel" >"$out" 2>/dev/null; then
		FILE_OF[$key]=""
		return 1
	fi
	FILE_OF[$key]="$out"
	printf '%s' "$out"
}

# commit_readable <module> — does the module's object store hold the PINNED COMMIT? A pinned commit
# the store does not have is a failure with a remedy (fetch it), never a smaller scan: a gate that
# cannot read the pin it judges reports nothing about the pin the tree ships.
commit_readable() {
	local module="$1" sha store
	sha="${PIN_OF[$module]:-}"
	store="${STORE_OF[$module]:-}"
	[[ -n "$sha" && -n "$store" && -d "$store" ]] || return 1
	git --git-dir "$store" cat-file -e "$sha" 2>/dev/null
}

# kind_at <module> <path> — git's own answer for the pinned entry: `blob`, `tree`, or empty when the
# pin does not carry it. One question, asked once, deciding "does this path exist" and "is it a
# file" — so a directory is a path reference and never a phantom file of zero lines.
kind_at() {
	local module="$1" path="$2"
	git --git-dir "${STORE_OF[$module]:-/nonexistent}" cat-file -t \
		"${PIN_OF[$module]:-0000000000000000000000000000000000000000}:${path#"$module"/}" 2>/dev/null
}

# ── the constructs ──────────────────────────────────────────────────────────────────────────
# constructs <file> <ext> — "<start>\t<end>\t<name>" for every TOP-LEVEL construct of the file: the
# span a line citation must still sit inside. CUE: a column-0 `#Definition:` / `_table:` header and
# its balanced body. Go: a column-0 `func`/`type`/`var`/`const` declaration and its balanced body.
# Any other language: nothing, and the anchor is `-`, because a construct this control cannot
# locate is not one it may pretend to have judged.
constructs() {
	local file="$1" ext="$2" key="$1"
	[[ -n "${CONSTR_OF[$key]+set}" ]] && { printf '%s' "${CONSTR_OF[$key]}"; return 0; }
	local out="$WORK/c$(printf '%s' "$key" | sha256sum | cut -c1-16)"
	case "$ext" in
	.cue)
		awk '
			function strip(s) { gsub(/\\"([^"\\]|\\.)*\\"/, "\"\"", s); sub(/\/\/.*$/, "", s); return s }
			function balance(s,   d, t) { t = s; d = gsub(/\{/, "", t); t = s; d += gsub(/\(/, "", t); t = s; d += gsub(/\[/, "", t); t = s; d -= gsub(/\}/, "", t); t = s; d -= gsub(/\)/, "", t); t = s; d -= gsub(/\]/, "", t); return d }
			{ line[NR] = $0 }
			END {
				for (i = 1; i <= NR; i++) {
					if (line[i] !~ /^(#[A-Za-z][A-Za-z0-9_]*|_[A-Za-z][A-Za-z0-9_]*)[ \t]*:/) continue
					name = line[i]; sub(/[ \t]*:.*$/, "", name)
					depth = 0; opened = 0; end = i
					for (k = i; k <= NR; k++) {
						s = strip(line[k])
						depth += balance(s)
						if (s ~ /[\{\(\[]/) opened = 1
						end = k
						if (opened && depth <= 0) break
					}
					printf "%d\t%d\t%s\n", i, end, name
					i = end
				}
			}' "$file" >"$out"
		;;
	.go)
		awk '
			function balance(s,   d, t) { t = s; d = gsub(/\{/, "", t); t = s; d += gsub(/\(/, "", t); t = s; d -= gsub(/\}/, "", t); t = s; d -= gsub(/\)/, "", t); return d }
			{ line[NR] = $0 }
			END {
				for (i = 1; i <= NR; i++) {
					if (line[i] !~ /^(func|type|var|const)[ \t]/) continue
					name = line[i]
					if (name ~ /^func[ \t]+\(/) sub(/^func[ \t]+\([^)]*\)[ \t]*/, "", name)
					else sub(/^(func|type|var|const)[ \t]+/, "", name)
					sub(/[^A-Za-z0-9_].*$/, "", name)
					if (name == "") continue
					depth = 0; opened = 0; end = i
					for (k = i; k <= NR; k++) {
						s = line[k]
						gsub(/"([^"\\]|\\.)*"/, "\"\"", s); sub(/\/\/.*$/, "", s)
						depth += balance(s)
						if (s ~ /[\{\(]/) opened = 1
						end = k
						if (opened && depth <= 0) break
					}
					printf "%d\t%d\t%s\n", i, end, name
					i = end
				}
			}' "$file" >"$out"
		;;
	*) : >"$out" ;;
	esac
	CONSTR_OF[$key]="$out"
	printf '%s' "$out"
}

# anchor_of <constructs-file> <line> — the INNERMOST construct containing <line>, or `-` when the
# line sits in none (a comment block above every header, a blank line, a language with no construct
# model). The name is what a reader needs: `#JetkvmDeviceInput` says which construct the row meant,
# `line 437` does not.
anchor_of() {
	awk -F'\t' -v ln="$2" '
		$1 <= ln && ln <= $2 { if (name == "" || ($2 - $1) < best) { best = $2 - $1; name = $3 } }
		END { if (name == "") print "-"; else print name }' "$1"
}

# digest_of <file> <a> <b> — the cited lines' bytes as a short digest. This is what makes a LINE
# SHIFT loud: a pin advance that inserts five lines above a construct leaves the file long enough
# and the range in bounds, and every byte the row pointed at has moved.
digest_of() { sed -n "$2,$3p" "$1" | sha256sum | cut -c1-16; }

# line_count <file>
line_count() { awk 'END { print NR }' "$1"; }

# ── the judgement ───────────────────────────────────────────────────────────────────────────
# judge <root> <out> — write FAIL lines to <out>; returns 0 when clean. Everything it reads comes
# from <root>, so the self-test judges its own isolated fixture and not the repository's files.
judge() {
	local root="$1" out="$2" ledger cap col path subject module kind a b anchor digest
	local -A recorded=() rec_anchor=() rec_digest=() cited=() rowtext=()
	: >"$out"
	: >"$out.notice"
	load_pins "$root"
	local l f c0
	for l in "$DULLING" "$ADMISSION"; do
		[[ -f "$root/$l" ]] || continue
		while IFS= read -r f; do
			[[ "$f" == \#* ]] && continue
			IFS=$'\t' read -r -a c0 <<<"$f"
			rowtext["$l"$'\t'"${c0[0]}"]="$f"
		done <"$root/$l"
	done
	FETCH_FINDINGS=""

	if [[ ${#PIN_OF[@]} -eq 0 ]]; then
		printf 'FAIL %s: the index carries no gitlink, so no citation can be judged — is this a tree root?\n' "$root" >>"$out"
		return 0
	fi

	if [[ -f "$root/$BASELINE" ]]; then
		local cap0 path0 lines0 anchor0 digest0
		while IFS=$'\t' read -r cap0 path0 lines0 anchor0 digest0; do
			[[ "$cap0" == \#* ]] && continue
			[[ "$cap0" == "capability" || -z "${digest0:-}" ]] && continue
			recorded["$cap0"$'\t'"$path0"$'\t'"$lines0"]=1
			rec_anchor["$cap0"$'\t'"$path0"$'\t'"$lines0"]="$anchor0"
			rec_digest["$cap0"$'\t'"$path0"$'\t'"$lines0"]="$digest0"
		done <"$root/$BASELINE"
	fi

	local ledger_name
	while IFS=$'\t' read -r ledger cap col path subject; do
		[[ -n "${path:-}" ]] || continue
		ledger_name="$(basename "$ledger")"
		module="${path%%/*}"

		if [[ -z "${PIN_OF[$module]:-}" ]]; then
			# A citation into this repository's own files: existence and range, never a baseline.
			if [[ ! -e "$root/$path" ]]; then
				if [[ "$path" != */* ]]; then
					continue # prose before a `:lines` (`(plugin-omarchy schema:7-12)`) is not a citation
				fi
				# A row may cite a repository THIS TREE DOES NOT PIN, at a commit
				# (`opencharly/<repo>@<sha>` beside a repository-relative path). A commit id is
				# immutable, so such a citation cannot drift — and this tree does not carry the
				# repository to read it from, so it is reported as UNCHECKED, never as a failure and
				# never silently. A PINNED repository cited that way IS a failure: the path must name
				# the pin (`<module>/<path>`), because a commit in the row can be any commit.
				local repo=""
				repo=$(printf '%s' "${rowtext[$ledger$'\t'$cap]:-}" | grep -oE 'opencharly/[A-Za-z0-9_.-]+@[0-9a-f]{7,40}' | sed -n 1p | sed 's|opencharly/||; s|@.*||')
				if [[ -n "$repo" && -z "${PIN_OF[$repo]:-}" ]]; then
					printf '  note %s:%s: %s is in the repository %s, cited at a commit — this tree does not pin %s, so a commit id cannot drift and the control cannot read it\n' \
						"$ledger_name" "$cap" "$path" "$repo" "$repo" >>"$out.notice"
					continue
				fi
				if [[ -n "$repo" ]]; then
					printf 'FAIL %s:%s: %s:%s cites %s by a commit, and %s IS pinned — name the pin instead (`%s/<repository path>:%s`)\n' \
						"$ledger_name" "$cap" "$path" "$subject" "$repo" "$repo" "$repo" "$subject" >>"$out"
					continue
				fi
				printf 'FAIL %s:%s: %s:%s identifies no file — a citation names a pinned module (`<module>/<path>:<lines>`, resolved at its pin) or a file of this repository\n' \
					"$ledger_name" "$cap" "$path" "$subject" >>"$out"
				continue
			fi
			[[ -n "$subject" && "$subject" != "#"* ]] || continue
			a="${subject%%-*}"
			b="${subject#*-}"
			[[ "$b" == "$subject" ]] && b="$a"
			if [[ ! "$a" =~ ^[0-9]+$ || ! "$b" =~ ^[0-9]+$ || "$a" -lt 1 || "$a" -gt "$b" || "$b" -gt "$(line_count "$root/$path")" ]]; then
				printf 'FAIL %s:%s: %s:%s is not inside %s — it has %s lines\n' \
					"$ledger_name" "$cap" "$path" "$subject" "$path" "$(line_count "$root/$path")" >>"$out"
			fi
			continue
		fi

		if ! commit_readable "$module"; then
			printf 'FAIL %s:%s: %s is pinned at %s and its repository does not have that commit — run `git submodule update --remote -- %s`; the control cannot judge a pin it cannot read\n' \
				"$ledger_name" "$cap" "$module" "${PIN_OF[$module]:0:12}" "$module" >>"$out"
			continue
		fi
		kind=$(kind_at "$module" "$path")
		if [[ -z "$kind" ]]; then
			printf 'FAIL %s:%s: %s is not in %s at its pin %s, so the row cites an artifact that pin does not carry\n' \
				"$ledger_name" "$cap" "$path" "$module" "${PIN_OF[$module]:0:12}" >>"$out"
			continue
		fi
		if [[ -z "$subject" ]]; then
			[[ "$VERBOSE" == 1 ]] && printf '  ok   %s:%s  %s exists at the pin\n' "$ledger_name" "$cap" "$path"
			continue
		fi
		if [[ "$kind" == "tree" ]]; then
			printf 'FAIL %s:%s: %s is a directory at the pin, so it has no %s to cite\n' \
				"$ledger_name" "$cap" "$path" "$subject" >>"$out"
			continue
		fi
		local file
		if ! file=$(file_at "$root" "$module" "$path"); then
			printf 'FAIL %s:%s: %s cannot be read at the pin of %s — the control cannot judge what it cannot read\n' \
				"$ledger_name" "$cap" "$path" "$module" >>"$out"
			continue
		fi

		case "$subject" in
		\#*)
			if ! grep -qE "^${subject}[[:space:]]*:" "$file"; then
				printf 'FAIL %s:%s: %s does not declare %s at the pin %s\n' \
					"$ledger_name" "$cap" "$module" "$subject" "${PIN_OF[$module]:0:12}" >>"$out"
			elif [[ "$VERBOSE" == 1 ]]; then
				printf '  ok   %s:%s  %s declares %s\n' "$ledger_name" "$cap" "$module" "$subject"
			fi
			continue
			;;
		esac

		a="${subject%%-*}"
		b="${subject#*-}"
		[[ "$b" == "$subject" ]] && b="$a"
		local ext=".${path##*.}" total
		total=$(line_count "$file")
		if [[ ! "$a" =~ ^[0-9]+$ || ! "$b" =~ ^[0-9]+$ ]]; then
			printf 'FAIL %s:%s: %s:%s is not a line, a line range or a #definition\n' \
				"$ledger_name" "$cap" "$module" "$subject" >>"$out"
			continue
		fi
		if [[ "$a" -lt 1 || "$a" -gt "$b" || "$b" -gt "$total" ]]; then
			printf 'FAIL %s:%s: %s:%s is not inside the pinned file — %s has %s lines at the pin %s\n' \
				"$ledger_name" "$cap" "$module" "$subject" "$path" "$total" "${PIN_OF[$module]:0:12}" >>"$out"
			continue
		fi
		anchor=$(anchor_of "$(constructs "$file" "$ext")" "$a")
		digest=$(digest_of "$file" "$a" "$b")
		local key="$cap"$'\t'"$path"$'\t'"$a-$b"
		cited[$key]=1
		if [[ -z "${recorded[$key]:-}" ]]; then
			printf 'FAIL %s:%s: %s:%s-%s is not in %s — cite the construct by name (%s:#Name), or read the pin and record it with --emit-baseline\n' \
				"$ledger_name" "$cap" "$path" "$a" "$b" "$BASELINE" "$path" >>"$out"
			continue
		fi
		if [[ "${rec_anchor[$key]}" != "$anchor" ]]; then
			printf 'FAIL %s:%s: %s:%s now sits inside %s, not the %s this row was affirmed against (pin %s) — the pin advance moved the construct out from under the citation\n' \
				"$ledger_name" "$cap" "$path" "$a" "$anchor" "${rec_anchor[$key]}" "${PIN_OF[$module]:0:12}" >>"$out"
			continue
		fi
		if [[ "${rec_digest[$key]}" != "$digest" ]]; then
			printf 'FAIL %s:%s: %s:%s-%s no longer holds the bytes this row was affirmed against (pin %s) — re-read it, re-anchor the row, then --emit-baseline\n' \
				"$ledger_name" "$cap" "$path" "$a" "$b" "${PIN_OF[$module]:0:12}" >>"$out"
			continue
		fi
		[[ "$VERBOSE" == 1 ]] && printf '  ok   %s:%s  %s:%s-%s inside %s\n' "$ledger_name" "$cap" "$path" "$a" "$b" "$anchor"
	done <<<"$(cite_scan "$root")"

	if [[ -n "$FETCH_FINDINGS" ]]; then
		printf '%s' "$FETCH_FINDINGS" >>"$out"
	fi

	# ONE finding per claim: a path cited in two columns of one row is one defect, and a report that
	# printed it twice would overstate the damage it is describing.
	awk '!seen[$0]++' "$out" >"$out.d" && mv "$out.d" "$out"

	# The census, the other direction: a row the ledger no longer carries overstates the record.
	local key0 cap0 path0 lines0
	for key0 in "${!recorded[@]}"; do
		[[ -n "${cited[$key0]:-}" ]] && continue
		IFS=$'\t' read -r cap0 path0 lines0 <<<"$key0"
		printf 'FAIL %s: records %s:%s for %s and the ledger no longer cites it — lower the census in the change that re-anchored the row\n' \
			"$BASELINE" "$path0" "$lines0" "$cap0" >>"$out"
	done
	:
}

# ── the census, emitted ─────────────────────────────────────────────────────────────────────
# emit_baseline <root> — the baseline this tree's pins produce: one row per LINE citation into a
# pinned module, with the construct enclosing its range and a digest of its bytes. Used to seed the
# file and to re-affirm a row after a pin advance; its DIFF is reviewed like any other, because
# every row it changes is a citation whose bytes moved and that nobody re-read.
emit_baseline() {
	local root="$1" ledger cap col path subject module file ext a b
	load_pins "$root"
	printf '%s\n' "$BASELINE_HEADER"
	cite_scan "$root" >"$WORK/cites"
	while IFS=$'\t' read -r ledger cap col path subject; do
		[[ -n "${subject:-}" && "$subject" != "#"* ]] || continue
		module="${path%%/*}"
		[[ -n "${PIN_OF[$module]:-}" ]] || continue
		commit_readable "$module" || continue
		[[ "$(kind_at "$module" "$path")" == "blob" ]] || continue
		file=$(file_at "$root" "$module" "$path") || continue
		ext=".${path##*.}"
		a="${subject%%-*}"
		b="${subject#*-}"
		[[ "$b" == "$subject" ]] && b="$a"
		[[ "$a" =~ ^[0-9]+$ && "$b" =~ ^[0-9]+$ ]] || continue
		[[ "$a" -ge 1 && "$a" -le "$b" && "$b" -le "$(line_count "$file")" ]] || continue
		printf '%s\t%s\t%s-%s\t%s\t%s\n' "$cap" "$path" "$a" "$b" \
			"$(anchor_of "$(constructs "$file" "$ext")" "$a")" "$(digest_of "$file" "$a" "$b")"
	done <"$WORK/cites" | sort -u
}

# ── report ─────────────────────────────────────────────────────────────────────────────────
report() { # report <out>
	local n
	if [[ -s "$1" ]]; then
		sed 's/^/  /' "$1"
		printf 'design-cite: FAILED (%s finding(s))\n' "$(wc -l <"$1" | tr -d ' ')"
		return 1
	fi
	n=$(awk -F'\t' '!/^#/ && $1 != "capability" { c++ } END { print c + 0 }' "$ROOT/$BASELINE" 2>/dev/null)
	printf 'design-cite: every citation resolves at its pin; %s line citation(s) still hold the construct and the bytes they were affirmed against\n' "$n"
	return 0
}

# ── the self-test ──────────────────────────────────────────────────────────────────────────
# The fixture is a REAL git repository with a REAL module store: the pins are written into the
# fixture's own index with `git update-index --cacheinfo 160000,<sha>,<path>` (a gitlink needs no
# submodule to exist), and the module's objects live in `<fixture>/.git/modules/<path>` — the plain
# clone's shape, which is where `design-module-store.sh` points when no checkout exists. A STALE
# CHECKOUT is planted beside it with DIFFERENT content, and every judgement must be unmoved by it:
# this campaign has paid five rounds for gates that read a checkout.
self_test() {
	local work rc=0 n=0 sha
	work=$(mktemp -d)

	# commit_pin <work> <message> — advance the fixture's pin the way a pin wave does: commit in the
	# module's own repository, publish it to the store, and move the gitlink in the fixture's index.
	# One definition, so no case can move a pin differently from another.
	commit_pin() {
		local w="$1" msg="$2" newsha
		git -C "$w/src" add -A
		git -C "$w/src" commit -q -m "$msg"
		newsha=$(git -C "$w/src" rev-parse HEAD)
		git -C "$w/src" push -q "$w/.git/modules/plugin-fixture" HEAD:refs/heads/main
		git -C "$w" update-index --add --cacheinfo 160000,"$newsha",plugin-fixture
	}

	write_ledger() { # <alpha-lines> <beta-lines> <name-suffix> <path-reference>
		{
			printf '%s\n' '# the fixture ledger — one row per arm of the control'
			printf 'capability\ttoday\tguideline\ttarget_form\tverdict\tdulling\tevidence\taction\n'
			printf 'fixture:range\t`fixture:` shows the alpha definition\t—\tone row\tsharp\t—\t%s:%s; DESIGN.md:§A.13\tnone\n' \
				"plugin-fixture/candy/plugin-fixture/schema/fixture.cue" "$1"
			printf 'fixture:range2\t`fixture:` shows the beta definition\t—\tone row\tsharp\t—\t%s:%s; DESIGN.md:§A.13\tnone\n' \
				"plugin-fixture/candy/plugin-fixture/schema/fixture.cue" "$2"
			printf 'fixture:path\t`fixture:` is a plugin\t—\tone row\tsharp\t—\t%s; DESIGN.md:§A.13\tnone\n' "$4"
			printf 'fixture:name\t`fixture:` names the gamma definition\t—\tone row\tsharp\t—\t%s%s; DESIGN.md:§A.13\tnone\n' \
				"plugin-fixture/candy/plugin-fixture/schema/fixture.cue" "$3"
		} >"$work/design/dulling.tsv"
	}

	expect() { # expect <name> <pattern>
		n=$((n + 1))
		judge "$work" "$work/out.$n"
		if [[ ! -s "$work/out.$n" ]]; then
			printf 'FAIL self-test: %s did NOT fail the check\n' "$1"
			rc=1
			return 0
		fi
		if ! grep -qE "$2" "$work/out.$n"; then
			printf 'FAIL self-test: %s failed for the wrong reason (no %s)\n' "$1" "$2"
			sed 's/^/  /' "$work/out.$n"
			rc=1
			return 0
		fi
		printf '  self-test %-48s fails as designed\n' "$1"
		return 0
	}
	green() { # green <name>
		n=$((n + 1))
		judge "$work" "$work/out.$n"
		if [[ -s "$work/out.$n" ]]; then
			printf 'FAIL self-test: %s did NOT pass the check\n' "$1"
			sed 's/^/  /' "$work/out.$n"
			rc=1
			return 0
		fi
		printf '  self-test %-48s passes as designed\n' "$1"
		return 0
	}

	mkdir -p "$work/design"
	git -C "$work" init -q .
	git -C "$work" config user.email fixture@example.com
	git -C "$work" config user.name fixture

	mkdir -p "$work/src/candy/plugin-fixture/schema"
	printf '#FixtureAlpha: {\n\talpha?: string\n}\n\n#FixtureBeta: {\n\tbeta?: string\n\tbeta2?: int\n}\n\n#FixtureGamma: {\n\tgamma?: bool\n\tgamma2?: bool\n}\n' \
		>"$work/src/candy/plugin-fixture/schema/fixture.cue"
	printf 'package fixture\n' >"$work/src/candy/plugin-fixture/schema/plugin.cue"
	git -C "$work/src" init -q .
	git -C "$work/src" config user.email fixture@example.com
	git -C "$work/src" config user.name fixture
	git -C "$work/src" add -A
	git -C "$work/src" commit -q -m fixture
	sha=$(git -C "$work/src" rev-parse HEAD)
	git -C "$work" init -q --bare .git/modules/plugin-fixture
	git -C "$work/src" push -q "$work/.git/modules/plugin-fixture" HEAD:refs/heads/main
	git -C "$work" update-index --add --cacheinfo 160000,"$sha",plugin-fixture
	: >"$work/design/dulling-admission.tsv"
	printf '%s\n' 'path	admits	today	guideline	can_add_without_amending	verdict	why	evidence' \
		>>"$work/design/dulling-admission.tsv"
	# a STALE CHECKOUT, deliberately wrong, exactly where a checkout-shaped resolver would look
	mkdir -p "$work/plugin-fixture/candy/plugin-fixture/schema"
	printf '#FixtureAlpha: {\n\talpha?: string\n}\n' >"$work/plugin-fixture/candy/plugin-fixture/schema/fixture.cue"

	printf 'one\ntwo\nthree\n' >"$work/FIXTURE.md"
	write_ledger '1-3' '5-8' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	green "a correct fixture over a stale checkout"

	# 0. a citation into THIS repository's own files: existence and range, and nothing else — it
	#    cannot drift under a third party's commit, because whoever moves those lines is editing the
	#    ledger too. A range inside the file passes; one past its end fails.
	{
		cat "$work/design/dulling.tsv"
		printf 'fixture:local\t`fixture:` shows a local file\t—\tx\tsharp\t—\t%s\tnone\n' 'FIXTURE.md:1-2'
	} >"$work/l" && mv "$work/l" "$work/design/dulling.tsv"
	green "a citation inside this repository's own file"
	{
		cat "$work/design/dulling.tsv"
		printf 'fixture:local\t`fixture:` shows a local file\t—\tx\tsharp\t—\t%s\tnone\n' 'FIXTURE.md:2-9'
	} >"$work/l" && mv "$work/l" "$work/design/dulling.tsv"
	expect "a citation past the end of this repository's file" 'is not inside FIXTURE.md'
	write_ledger '1-3' '5-8' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'

	# 1. a range whose end is past the last line at the pin
	write_ledger '1-3' '5-900' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	expect "a range past the end of the pinned file" 'is not inside the pinned file'

	# 2. a range whose start is after its end
	write_ledger '1-3' '8-5' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	expect "a range whose start is after its end" 'is not inside the pinned file'

	# 3. a path the pinned tree does not have — a failure, never a skip
	write_ledger '1-3' '5-8' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema/missing.cue'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	expect "a path the pin does not have" 'is not in plugin-fixture at its pin'

	# 4. a citation that identifies no file at all: the module prefix is missing, so the path names
	#    nothing here and nothing at a pin. This is the shape of an unreachable citation.
	write_ledger '1-3' '5-8' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	{
		cat "$work/design/dulling.tsv"
		printf 'fixture:bare\t`fixture:` shows a file\t—\tx\tsharp\t—\t%s\tnone\n' 'candy/plugin-fixture/schema/fixture.cue:1-3'
	} >"$work/l" && mv "$work/l" "$work/design/dulling.tsv"
	expect "a citation that identifies no file" 'identifies no file'

	# 5. a line citation of a path that is a DIRECTORY at the pin
	write_ledger '1-3' '5-8' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	{
		cat "$work/design/dulling.tsv"
		printf 'fixture:dir\t`fixture:` cites a directory by line\t—\tx\tsharp\t—\t%s\tnone\n' 'plugin-fixture/candy/plugin-fixture/schema:3'
	} >"$work/l" && mv "$work/l" "$work/design/dulling.tsv"
	expect "a line citation of a directory" 'is a directory at the pin'

	# 6. a range that no longer sits inside the construct it was affirmed against — THE LIVE DEFECT.
	#    `jetkvm.cue:437-473` was in bounds and showed `#JetkvmFlowNode` where the row meant
	#    `#JetkvmDeviceInput`; here a pin advance inserts a definition above, so the affirmed lines
	#    fall inside a different construct.
	write_ledger '1-3' '5-8' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	python3 - "$work/src/candy/plugin-fixture/schema/fixture.cue" <<'ABOVE_PY'
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
open(path, "w", encoding="utf-8").write("#FixtureZero: {zero?: bool}\n\n" + text)
ABOVE_PY
	commit_pin "$work" above
	expect "a pin advance that moves the construct under a range" 'now sits inside'

	# 7. the bytes at the cited lines moved while the construct stayed: a field inserted INSIDE the
	#    affirmed definition. In bounds, right construct, wrong bytes.
	python3 - "$work/src/candy/plugin-fixture/schema/fixture.cue" <<'INSIDE_PY'
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
open(path, "w", encoding="utf-8").write(text.replace("\talpha?: string", "\talpha?: string\n\talpha2?: int"))
INSIDE_PY
	commit_pin "$work" inside
	write_ledger '5-8' '11-14' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	python3 - "$work/src/candy/plugin-fixture/schema/fixture.cue" <<'INSIDE2_PY'
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
open(path, "w", encoding="utf-8").write(text.replace("\talpha2?: int", "\talpha2?: int\n\talpha3?: int"))
INSIDE2_PY
	commit_pin "$work" inside2
	expect "the bytes at a cited range moved at the pin" 'no longer holds the bytes this row was affirmed against'

	# 8. the same citations where they are still correct, one construct later: a gate that fired on
	#    a pin advance alone would be a wall, not a control
	write_ledger '1-3' '5-8' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	green "the same citations one construct later"

	# 9. a #name the pinned file does not declare
	write_ledger '1-3' '5-8' ':#FixtureDelta' 'plugin-fixture/candy/plugin-fixture/schema'
	expect "a #name the pin does not declare" 'does not declare #FixtureDelta'

	# 10. a line citation nobody affirmed
	write_ledger '2-4' '5-8' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	expect "a line citation missing from the census" 'is not in design/cite-baseline.tsv'

	# 11. the census overstating: a row the ledger no longer cites
	write_ledger '1-3' '5-8' ':#FixtureGamma' 'plugin-fixture/candy/plugin-fixture/schema'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"
	printf 'fixture:path\tplugin-fixture/candy/plugin-fixture/schema\t1-3\t#FixtureAlpha\t0123456789abcdef\n' \
		>>"$work/design/cite-baseline.tsv"
	expect "a census row the ledger no longer cites" 'lower the census'
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"

	# 12. a pin the module store cannot read: a loud refusal, never a smaller scan that still
	#     reports success
	git -C "$work" update-index --add --cacheinfo 160000,"1111111111111111111111111111111111111111",plugin-fixture
	expect "a pin the module store cannot read" 'does not have that commit'
	git -C "$work" update-index --add --cacheinfo 160000,"$sha",plugin-fixture
	emit_baseline "$work" >"$work/design/cite-baseline.tsv"

	if [[ "$rc" -ne 0 ]]; then
		printf 'design-cite: self-test FAILED\n'
		rm -rf "$work"
		return 1
	fi
	printf 'design-cite: self-test passed (%s cases: every planted defect failed the check, the correct citations passed, and a stale checkout in the fixture changed nothing)\n' "$n"
	rm -rf "$work"
	return 0
}

case "$MODE" in
self-test)
	self_test
	exit $?
	;;
emit)
	emit_baseline "$ROOT"
	exit 0
	;;
*)
	out="$WORK/findings"
	judge "$ROOT" "$out"
	# the citations this control CANNOT check, said out loud: an unchecked citation a reader is
	# never told about is the silence this control exists to end.
	awk '!seen[$0]++' "$out.notice" >"$out.notice.d" 2>/dev/null && mv "$out.notice.d" "$out.notice"
	if [[ -s "$out.notice" ]]; then
		cat "$out.notice"
		printf 'design-cite: %s citation(s) of a repository this tree does not pin are unchecked (not findings)\n' \
			"$(wc -l <"$out.notice" | tr -d ' ')"
	fi
	report "$out"
	exit $?
	;;
esac
