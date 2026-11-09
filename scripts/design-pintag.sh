#!/usr/bin/env bash
# design-pintag.sh — the pin-tag control (DESIGN.md A.12).
#
# Every release lands as a squash merge, `tag-on-merge` writes a `CHANGELOG/<CalVer>.md`
# commit on top of the merged HEAD, and this umbrella's pin advances to the branch tip.
# The tip is therefore usually ONE CHANGELOG commit ABOVE the tag, and `git ls-remote
# --tags | grep -F <pin>` is empty for it. This control answers, for every pinned module
# of the tree's index, the one question nothing else asked: is the pin at a tagged
# release, or is its untagged-ness recorded and explained?
#
# WHAT IT READS. The tree's own pins, from the INDEX (`git ls-files --stage`), so the pin
# judged is the pin that ships: every mode-160000 entry at stage 0 — the whole pin set,
# not only the plugin modules the schema-pattern gate reads. Each module is read from its
# own repository, `<git-common-dir>/modules/<path>`, at the pinned commit — never from a
# checkout, which can be stale, dirty or absent (a session worktree materializes no
# gitlink). A pin whose module store is absent is SKIPPED VISIBLY and counted, with the
# remedy named; a store that has the module but not the pinned commit is a FAILURE that
# names the path and the remedy, never a smaller scan that still reports success.
#
# THE STATES, one per pin:
#   tagged               the pin is the commit a tag points at. The release itself.
#   changelog-tip        the pin is one commit above a tag, and that commit's subject is
#                        `docs: add CHANGELOG …` — the structure every merge produces.
#   changelog-chain      the pin is a `docs: add CHANGELOG …` commit, and every commit
#                        between it and the first tagged ancestor is one too. This is the
#                        tip after `tag-on-merge` re-ran for an earlier merge out of order:
#                        the untagged-ness is still made only of CHANGELOG commits.
#   pre-release-process  the pin is the commit that ADDS `.github/workflows/tag-on-merge.yml`
#                        to a repository that did not have it; its parent could not mint a
#                        tag, so the absence of one here is the repository's birth, not a
#                        missed release.
#   not-applicable       the pinned tree has no tag-on-merge caller at all, so this
#                        repository mints no release tag (a fork, a vendored mirror, an
#                        artifact store). The question does not apply; the pin is counted.
#   untagged             none of the above. This is the signal: a pin that is neither at a
#                        tag nor explained by the structure of tag-on-merge, and whose
#                        module runs tag-on-merge at the pin and at its parent — so a merge
#                        above a tag wrote no CHANGELOG commit. It FAILS unless a census
#                        row (design/pintag-baseline.tsv) records it and explains it.
#
# THE SPLIT. A POSITIVE reading needs no network: a tag ref in the module store that points
# at the pin, or at the first-parent ancestor the walk reaches, is proof the pin is tagged,
# and tags are immutable, so a store's tag cannot be stale into a false pass. An ABSENCE is
# the other direction: a tag that exists upstream but was never fetched into the module
# store is invisible here, and a pin fetched before its tag would read as untagged. That
# direction is FAIL-CLOSED — it can only make the run report an untagged pin (which the
# census must explain) or fail it, never bless a pin — and the run prints the store boundary
# it used. `--remote` is the opt-in cross-check: it asks the remote for the tag set of every
# pin this run called untagged, and a remote it cannot reach is a LOUD FAILURE naming the
# module and the URL, never a green run over a question that was not answered. The gate the
# design check runs is the offline reading; A.12 states exactly what it cannot see.
#
# THE CENSUS. The tree carries pins today that are neither tagged nor explained by
# tag-on-merge — the live instances of opencharly/.github#286, the failure mode with no
# detector. A gate that is red on landing enforces nothing, so `design/pintag-baseline.tsv`
# records them: one row per module, commit, state and reason, with the issue that retires
# the census. The control tolerates exactly what the census records, reports each tolerated
# pin as known, and fails on anything else:
#   * an untagged pin with no row is a new finding;
#   * a row whose commit is no longer the module's pin — the pin moved — means the new pin
#     was never examined, so it fails until the row is re-argued or lowered;
#   * a row whose pin is no longer untagged is stale, so it is lowered in the change that
#     fixes it. Delete the last row and the control is a plain check with nothing to excuse.
#
# Usage:
#   bash scripts/design-pintag.sh [<root>]   check the tree (exit 1 on any finding)
#   bash scripts/design-pintag.sh --self-test  prove every state and census direction fails
#   bash scripts/design-pintag.sh --remote     cross-check the untagged pins against the remote
#   bash scripts/design-pintag.sh --explain    print every pin and its state
set -uo pipefail

SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SELF/.." && pwd)
MODE=check
VERBOSE=0
REMOTE=0
for arg in "$@"; do
	case "$arg" in
	--self-test) MODE=self-test ;;
	--remote) REMOTE=1 ;;
	--explain | -v | --verbose) VERBOSE=1 ;;
	-*) printf 'design-pintag: unknown option %s\n' "$arg" >&2; exit 2 ;;
	*) ROOT=$(cd "$arg" && pwd) || exit 2 ;;
	esac
done
BASELINE="$ROOT/design/pintag-baseline.tsv"
WF=.github/workflows/tag-on-merge.yml
CHANGELOG='docs: add CHANGELOG '
STATES="tagged changelog-tip changelog-chain pre-release-process not-applicable untagged"

# ── the pins ────────────────────────────────────────────────────────────────────────────────
# pins <root> — "<path>\t<commit>" for every gitlink of the tree, read from the index.
pins() {
	git -C "$1" ls-files --stage | awk -F'\t' '
		$1 ~ /^160000 / {
			split($1, meta, " ")
			if (meta[3] != "0") next
			printf "%s\t%s\n", $2, meta[2]
		}'
}

MODULES=0
JUDGED=0
SKIPPED=0
REMOTE_CHECKS=0
REMOTE_FAILED=0
GITDIR=""
TAGMAP=""

# tags_at <commit> — the tag names pointing at <commit> in the current module's tag map,
# space-separated. A tag name is printed once: an annotated tag appears twice in the map
# (its tag object and its peeled commit), and only the commit line can match this.
tags_at() {
	awk -F'\t' -v s="$1" '$1 == s && !seen[$2]++ { printf "%s ", $2 }' "$TAGMAP"
}

subject_of() { git --git-dir "$GITDIR" log -1 --format=%s "$1" 2>/dev/null; }
parent_of() { git --git-dir "$GITDIR" log -1 --format=%P "$1" 2>/dev/null | awk '{ print $1 }'; }
has_wf() { git --git-dir "$GITDIR" cat-file -e "$1:$WF" 2>/dev/null; }

# tagmap_local <gitdir> — "<commit>\trefs/tags/<name>" for every tag of the module's own
# repository. An annotated tag is peeled to the commit it points at, because a pin is a
# commit and never a tag object.
tagmap_local() {
	git --git-dir "$1" for-each-ref --format='%(objecttype)%00%(objectname)%00%(*objectname)%00%(refname)' refs/tags |
		awk -F'\0' '{
			if ($1 == "tag") { if ($3 == "") next; printf "%s\t%s\n", $3, $4 }
			else printf "%s\t%s\n", $2, $4
		}'
}

# tagmap_remote <url> — the same map from `git ls-remote --tags`. Fails (non-zero) when the
# remote cannot be reached, so the caller can fail loud rather than read an empty answer as
# "no tag".
tagmap_remote() {
	local out
	out=$(git ls-remote --tags "$1" 'refs/tags/*' 2>/dev/null) || return 1
	printf '%s\n' "$out" | awk -F'\t' 'NF == 2 {
		ref = $2
		sub(/^refs\/tags\//, "", ref)
		sub(/\^\{\}$/, "", ref)
		if ($1 != "" && ref != "") printf "%s\trefs/tags/%s\n", $1, ref
	}'
}

# nearest_tag <commit> — the first tag `git describe` reaches on the first-parent line.
nearest_tag() {
	git --git-dir "$GITDIR" describe --tags --first-parent --abbrev=0 "$1" 2>/dev/null
}

# ── the classification ──────────────────────────────────────────────────────────────────────
# classify <path> <commit> — one report row: "<path>\t<commit>\t<state>\t<detail>".
# The order is the rule: a tag is the release itself; a CHANGELOG commit is the structure
# tag-on-merge leaves; the tag-on-merge caller's own installation is the repository's birth;
# its absence in the pinned tree makes the question inapplicable; everything else is the
# signal — and it carries the measurement a reader needs to judge it.
classify() {
	local path="$1" sha="$2" tags cur par t subj steps=0 tag count

	tags=$(tags_at "$sha")
	if [[ -n "$tags" ]]; then
		printf '%s\t%s\ttagged\t%s\n' "$path" "$sha" "${tags% }"
		return
	fi

	subj=$(subject_of "$sha")
	if [[ "$subj" == "$CHANGELOG"* ]]; then
		cur="$sha"
		while :; do
			par=$(parent_of "$cur")
			if [[ -z "$par" ]]; then
				printf '%s\t%s\tuntagged\ta CHANGELOG commit with no parent: no tag can be below it\n' "$path" "$sha"
				return
			fi
			steps=$((steps + 1))
			t=$(tags_at "$par")
			if [[ -n "$t" ]]; then
				if ((steps == 1)); then
					printf '%s\t%s\tchangelog-tip\t%s\n' "$path" "$sha" "${t% }"
				else
					printf '%s\t%s\tchangelog-chain\t%s after %s CHANGELOG commits\n' \
						"$path" "$sha" "${t% }" "$steps"
				fi
				return
			fi
			subj=$(subject_of "$par")
			if [[ "$subj" != "$CHANGELOG"* ]]; then
				printf '%s\t%s\tuntagged\tthe walk stopped %s step(s) below the pin at a commit that is not a CHANGELOG commit: "%s"\n' \
					"$path" "$sha" "$steps" "$subj"
				return
			fi
			cur="$par"
		done
	fi

	if ! has_wf "$sha"; then
		printf '%s\t%s\tnot-applicable\t%s has no %s, so this repository mints no release tag\n' \
			"$path" "$sha" "$path" "$WF"
		return
	fi
	par=$(parent_of "$sha")
	if [[ -n "$par" ]] && ! has_wf "$par"; then
		printf '%s\t%s\tpre-release-process\tthe pin adds %s; its parent could not mint a tag\n' \
			"$path" "$sha" "$WF"
		return
	fi

	tag=$(nearest_tag "$sha")
	count=0
	if [[ -n "$tag" ]]; then
		count=$(git --git-dir "$GITDIR" rev-list --count --first-parent "$tag..$sha" 2>/dev/null)
		printf '%s\t%s\tuntagged\t%s first-parent commit(s) above %s; the pin is not a CHANGELOG commit and none follows it, while tag-on-merge is present at the pin and at its parent — so the merge that produced the pin wrote no CHANGELOG commit\n' \
			"$path" "$sha" "${count:-?}" "$tag"
	else
		printf '%s\t%s\tuntagged\tno tagged ancestor is reachable from the pin, and tag-on-merge is present at the pin and at its parent\n' \
			"$path" "$sha"
	fi
}

# ── the census ──────────────────────────────────────────────────────────────────────────────
# census <report> <baseline> <fail-out> <known-out> <note-out> — compare the report with the
# census. A row matches a report row on module AND commit, so a pin that moved is a finding
# in both directions: the census's row no longer describes a pin, and the new pin has no
# explanation.
census() {
	local report="$1" baseline="$2" fail="$3" known="$4" note="$5"
	: >"$fail"
	: >"$known"
	: >"$note"
	if [[ ! -f "$baseline" ]]; then
		printf 'FAIL %s: the census is missing — the control explains an untagged pin only through it\n' "${baseline#"$ROOT"/}" >>"$fail"
		return
	fi
	local -A want=() matched=() seen=()
	local m c s r key hdr=0
	while IFS=$'\t' read -r m c s r; do
		[[ "$m" == \#* || -z "$m" ]] && continue
		if [[ "$m" == module && "$c" == commit && "$s" == state && "$r" == reason ]]; then
			hdr=1
			continue
		fi
		if [[ -z "$c" || -z "$s" || -z "$r" ]]; then
			printf 'FAIL %s: a census row is module, commit, state, reason; this row is not\n' "${baseline#"$ROOT"/}" >>"$fail"
			continue
		fi
		if [[ "$s" != untagged ]]; then
			printf 'FAIL %s: state "%s" is not untagged — the census records exactly the untagged pins\n' "${baseline#"$ROOT"/}" "$s" >>"$fail"
			continue
		fi
		key="$m"$'\t'"$c"
		if [[ -n "${want[$key]:-}" ]]; then
			printf 'FAIL %s: a second row for %s@%s\n' "${baseline#"$ROOT"/}" "$m" "$c" >>"$fail"
			continue
		fi
		want[$key]="$r"
	done <"$baseline"
	((hdr)) || printf 'FAIL %s: the documented header row (module, commit, state, reason) is missing\n' "${baseline#"$ROOT"/}" >>"$fail"
	if [[ -z "$(grep -m1 -E '^# tracked-by: ' "$baseline")" ]]; then
		printf 'FAIL %s: no "# tracked-by: <owner>/<repo>#<n>" line — the census must name the issue that retires it\n' "${baseline#"$ROOT"/}" >>"$fail"
	fi

	while IFS=$'\t' read -r m c s r; do
		[[ -n "$m" ]] || continue
		key="$m"$'\t'"$c"
		seen[$key]=1
		if [[ "$s" == untagged ]]; then
			if [[ -n "${want[$key]:-}" ]]; then
				printf '%s\t%s\t%s\t%s\n' "$m" "$c" "$s" "${want[$key]}" >>"$known"
				matched[$key]=1
			else
				printf 'FAIL %s@%s: untagged — %s; no census row records and explains it\n' "$m" "$c" "$r" >>"$fail"
			fi
		elif [[ "$s" == skip-no-store && -n "${want[$key]:-}" ]]; then
			matched[$key]=1
			printf '%s@%s: the census row is unconfirmed — the module store is absent\n' "$m" "$c" >>"$note"
		fi
	done <"$report"

	for key in "${!want[@]}"; do
		[[ -n "${matched[$key]:-}" ]] && continue
		m="${key%%$'\t'*}"
		c="${key#*$'\t'}"
		if [[ -n "${seen[$key]:-}" ]]; then
			printf 'FAIL %s: still records %s@%s, and the pin is no longer untagged — lower the row\n' "${baseline#"$ROOT"/}" "$m" "$c" >>"$fail"
		else
			printf 'FAIL %s: records %s@%s, which is not a pin of this tree (the pin moved or the module is gone) — re-examine it and lower the row\n' "${baseline#"$ROOT"/}" "$m" "$c" >>"$fail"
		fi
	done
}

# ── the run ─────────────────────────────────────────────────────────────────────────────────
# run_check <root> <baseline> <report-out> <fail-out> <known-out> <note-out> — classify every
# pin, then compare with the census. Returns non-zero only when a pin cannot be READ at all
# (an absent commit), which is a failure of the run rather than a finding about a pin.
run_check() {
	local root="$1" baseline="$2" report="$3" fail="$4" known="$5" note="$6"
	local common path sha row state url
	: >"$report"
	: >"$work/remote-fail"
	MODULES=0
	JUDGED=0
	SKIPPED=0
	REMOTE_CHECKS=0
	REMOTE_FAILED=0
	common=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir) || return 1
	while IFS=$'\t' read -r path sha; do
		[[ -n "$path" ]] || continue
		MODULES=$((MODULES + 1))
		GITDIR="$common/modules/$path"
		if [[ ! -d "$GITDIR" ]]; then
			SKIPPED=$((SKIPPED + 1))
			printf '%s\t%s\tskip-no-store\tthe module store at %s is absent; run git submodule update --init %s\n' \
				"$path" "$sha" "$GITDIR" "$path" >>"$report"
			continue
		fi
		if ! git --git-dir "$GITDIR" cat-file -e "$sha^{commit}" 2>/dev/null; then
			printf 'design-pintag: %s is pinned at %s and %s does not have that commit — run `git submodule update --init %s`; the control cannot read the pin it judges\n' \
				"$path" "$sha" "$GITDIR" "$path" >&2
			return 1
		fi
		TAGMAP="$work/tags.$MODULES"
		tagmap_local "$GITDIR" >"$TAGMAP"
		row=$(classify "$path" "$sha")
		JUDGED=$((JUDGED + 1))
		if ((REMOTE)); then
			state=$(printf '%s\n' "$row" | cut -f3)
			if [[ "$state" == untagged ]]; then
				url=$(git --git-dir "$GITDIR" config --get remote.origin.url)
				REMOTE_CHECKS=$((REMOTE_CHECKS + 1))
				if [[ -z "$url" ]] || ! tagmap_remote "$url" >>"$TAGMAP"; then
					REMOTE_FAILED=1
					printf 'FAIL %s@%s: the control cannot reach %s, so it cannot decide whether this pin is tagged — the run is not green over an unanswered question\n' \
						"$path" "$sha" "${url:-<no remote.origin.url in the module store>}" >>"$work/remote-fail"
				else
					row=$(classify "$path" "$sha")
				fi
			fi
		fi
		printf '%s\n' "$row" >>"$report"
	done < <(pins "$root")
	census "$report" "$baseline" "$fail" "$known" "$note"
	if [[ -s "$work/remote-fail" ]]; then
		cat "$work/remote-fail" >>"$fail"
	fi
	if ((REMOTE_FAILED)); then
		printf 'FAIL remote: at least one untagged pin could not be cross-checked against its remote\n' >>"$fail"
	fi
	return 0
}

# scope — a run that judged no pin proves nothing, in either direction.
scope() {
	if ((MODULES == 0)); then
		printf 'FAIL scope: this tree records no gitlink in its index, so there is no pin to judge — a run over nothing is blind, not green\n'
		return 1
	fi
	if ((JUDGED == 0)); then
		printf 'FAIL scope: every one of the %s pinned module(s) was skipped, so this run judged no pin\n' "$MODULES"
		return 1
	fi
	return 0
}

summary() { # <report> <known> <note>
	local counts="" s n total known
	for s in $STATES; do
		n=$(awk -F'\t' -v s="$s" '$3 == s { c += 1 } END { print c + 0 }' "$1")
		counts="$counts${counts:+, }$s $n"
	done
	total=$(wc -l <"$1" | tr -d ' ')
	known=$(wc -l <"$2" | tr -d ' ')
	printf 'design-pintag: %s pinned module(s) in the index, %s judged, %s skipped (no module store)\n' \
		"$MODULES" "$JUDGED" "$SKIPPED"
	printf 'design-pintag: %s pin(s): %s\n' "$total" "$counts"
	printf 'design-pintag: %s recorded in %s (tracked by %s)\n' \
		"$known" "${BASELINE#"$ROOT"/}" "$(grep -m1 -E '^# tracked-by: ' "$BASELINE" | sed 's/^# tracked-by: *//')"
	printf 'design-pintag: tags read from the module stores under %s; a tag that was never fetched into a store is invisible to this reading (run --remote to cross-check the untagged pins)\n' \
		"$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)/modules"
	if ((REMOTE)); then
		printf 'design-pintag: remote cross-check: %s untagged pin(s) queried, %s unreachable\n' \
			"$REMOTE_CHECKS" "$REMOTE_FAILED"
	fi
	if [[ -s "$3" ]]; then
		while IFS= read -r s; do printf '  unconfirmed %s\n' "$s"; done <"$3"
	fi
}

# ── the self-test ──────────────────────────────────────────────────────────────────────────
# A rule that cannot fail is not a control. Every case builds a disposable umbrella whose
# index carries gitlinks, and a bare module store for each, then runs the SAME classifier and
# the SAME census comparison the check runs. The clean fixture must pass first, or the
# harness — not the data — is broken.
fixture_tree() { # <gitdir> <with-workflow: 0|1> -> tree
	local gd="$1" with="$2" readme wf workflows github entries
	readme=$(printf 'fixture\n' | git --git-dir "$gd" hash-object -w --stdin)
	entries="100644 blob $readme	README"
	if ((with)); then
		wf=$(printf 'name: tag-on-merge\n' | git --git-dir "$gd" hash-object -w --stdin)
		workflows=$(printf '100644 blob %s\ttag-on-merge.yml\n' "$wf" | git --git-dir "$gd" mktree)
		github=$(printf '040000 tree %s\tworkflows\n' "$workflows" | git --git-dir "$gd" mktree)
		entries="$entries
040000 tree $github	.github"
	fi
	printf '%s\n' "$entries" | git --git-dir "$gd" mktree
}

fixture_commit() { # <gitdir> <tree> <parent or -> <subject> -> commit
	local gd="$1" tree="$2" parent="$3" subject="$4"
	if [[ "$parent" == "-" ]]; then
		GIT_AUTHOR_DATE='2026-01-01T00:00:00Z' GIT_COMMITTER_DATE='2026-01-01T00:00:00Z' \
			git --git-dir "$gd" -c user.name=fixture -c user.email=fixture@example.invalid commit-tree "$tree" -m "$subject"
	else
		GIT_AUTHOR_DATE='2026-01-01T00:00:00Z' GIT_COMMITTER_DATE='2026-01-01T00:00:00Z' \
			git --git-dir "$gd" -c user.name=fixture -c user.email=fixture@example.invalid commit-tree "$tree" -p "$parent" -m "$subject"
	fi
}

fixture_repo() { # <umbrella> <module path> -> prints gitdir; creates the bare store
	local um="$1" path="$2"
	mkdir -p "$um/.git/modules/$(dirname "$path")"
	git init -q --bare "$um/.git/modules/$path"
	printf '%s/.git/modules/%s\n' "$um" "$path"
}

fixture_pin() { # <umbrella> <path> <commit>
	git -C "$1" update-index --add --cacheinfo "160000,$3,$2"
}

self_test() {
	local cases=0 work um gd t
	local tagged_c tip_c chain_c pre_c na_c stray_c stray2_c two_c clabove_c ann_c old
	work=$(mktemp -d)
	trap 'rm -rf "${work:-}"' EXIT
	um="$work/um"
	git init -q "$um"

	# ── the module stores. One history per shape the classifier must tell apart.
	gd=$(fixture_repo "$um" at-tag)
	t=$(fixture_tree "$gd" 1)
	tagged_c=$(fixture_commit "$gd" "$t" - 'feat: a release')
	git --git-dir "$gd" tag v2026.001.0001 "$tagged_c"

	gd=$(fixture_repo "$um" tip)
	t=$(fixture_tree "$gd" 1)
	old=$(fixture_commit "$gd" "$t" - 'feat: a release')
	git --git-dir "$gd" tag v2026.001.0001 "$old"
	tip_c=$(fixture_commit "$gd" "$t" "$old" 'docs: add CHANGELOG 2026.001.0001 for PR #1')

	gd=$(fixture_repo "$um" chain)
	t=$(fixture_tree "$gd" 1)
	old=$(fixture_commit "$gd" "$t" - 'feat: a release')
	git --git-dir "$gd" tag v2026.001.0001 "$old"
	old=$(fixture_commit "$gd" "$t" "$old" 'docs: add CHANGELOG 2026.001.0001 for PR #1')
	chain_c=$(fixture_commit "$gd" "$t" "$old" 'docs: add CHANGELOG 2026.001.0002 for PR #2')

	gd=$(fixture_repo "$um" pre)
	t=$(fixture_tree "$gd" 0)
	old=$(fixture_commit "$gd" "$t" - 'feat: a release before the caller')
	git --git-dir "$gd" tag v2026.001.0001 "$old"
	t=$(fixture_tree "$gd" 1)
	pre_c=$(fixture_commit "$gd" "$t" "$old" 'feat(ci): install the tag-on-merge caller')

	gd=$(fixture_repo "$um" na)
	t=$(fixture_tree "$gd" 0)
	old=$(fixture_commit "$gd" "$t" - 'feat: a vendored mirror')
	na_c=$(fixture_commit "$gd" "$t" "$old" 'feat: another upstream commit')

	gd=$(fixture_repo "$um" stray)
	t=$(fixture_tree "$gd" 1)
	old=$(fixture_commit "$gd" "$t" - 'feat: a release')
	git --git-dir "$gd" tag v2026.001.0001 "$old"
	stray_c=$(fixture_commit "$gd" "$t" "$old" 'feat: a merge that wrote no CHANGELOG commit')
	stray2_c=$(fixture_commit "$gd" "$t" "$stray_c" 'feat: a later merge that wrote no CHANGELOG commit')

	gd=$(fixture_repo "$um" two)
	t=$(fixture_tree "$gd" 1)
	old=$(fixture_commit "$gd" "$t" - 'feat: a release')
	git --git-dir "$gd" tag v2026.001.0001 "$old"
	old=$(fixture_commit "$gd" "$t" "$old" 'feat: one step above the tag')
	two_c=$(fixture_commit "$gd" "$t" "$old" 'feat: two steps above the tag')

	gd=$(fixture_repo "$um" clabove)
	t=$(fixture_tree "$gd" 1)
	old=$(fixture_commit "$gd" "$t" - 'feat: a release')
	git --git-dir "$gd" tag v2026.001.0001 "$old"
	old=$(fixture_commit "$gd" "$t" "$old" 'feat: an untagged merge above the tag')
	clabove_c=$(fixture_commit "$gd" "$t" "$old" 'docs: add CHANGELOG 2026.001.0001 for PR #9')

	gd=$(fixture_repo "$um" annotated)
	t=$(fixture_tree "$gd" 1)
	ann_c=$(fixture_commit "$gd" "$t" - 'feat: a release')
	GIT_COMMITTER_DATE='2026-01-01T00:00:00Z' git --git-dir "$gd" -c user.name=fixture -c user.email=fixture@example.invalid tag -a -m 'release' v2026.001.0001 "$ann_c"

	# ── the case harness
	new_case() {
		cases=$((cases + 1))
		rm -f "$um/.git/index"
		{
			printf '# fixture census\n'
			printf '# tracked-by: opencharly/opencharly#0 — self-test fixture\n'
			printf 'module\tcommit\tstate\treason\n'
		} >"$work/baseline.tsv"
	}
	run_case() { # <root> [<baseline>]
		run_check "$1" "${2:-$work/baseline.tsv}" "$work/report.$cases" "$work/fail.$cases" "$work/known.$cases" "$work/note.$cases" 2>"$work/err.$cases"
	}
	pass_like() { # <name>
		if [[ -s "$work/fail.$cases" ]]; then
			printf 'FAIL self-test: %s was reported as a finding\n' "$1"
			sed 's/^/  /' "$work/fail.$cases"
			exit 1
		fi
		printf '  self-test %-56s passes as designed\n' "$1"
	}
	fail_like() { # <name> <pattern>
		if [[ ! -s "$work/fail.$cases" ]]; then
			printf 'FAIL self-test: %s did NOT fail the check\n' "$1"
			exit 1
		fi
		if ! grep -qE "$2" "$work/fail.$cases"; then
			printf 'FAIL self-test: %s failed for the wrong reason (no %s)\n' "$1" "$2"
			sed 's/^/  /' "$work/fail.$cases"
			exit 1
		fi
		printf '  self-test %-56s fails as designed\n' "$1"
	}
	state_is() { # <path> <state>
		if ! awk -F'\t' -v p="$1" -v s="$2" '$1 == p && $3 == s { found = 1 } END { exit !found }' "$work/report.$cases"; then
			printf 'FAIL self-test: %s was not classified %s\n' "$1" "$2"
			sed 's/^/  /' "$work/report.$cases"
			exit 1
		fi
	}

	# ── the harness itself: the clean fixture must pass, or every case below proves nothing
	new_case
	fixture_pin "$um" at-tag "$tagged_c"
	fixture_pin "$um" tip "$tip_c"
	fixture_pin "$um" chain "$chain_c"
	fixture_pin "$um" pre "$pre_c"
	fixture_pin "$um" na "$na_c"
	fixture_pin "$um" annotated "$ann_c"
	run_case "$um" "$work/baseline.tsv"
	pass_like "the clean fixture (tag, tip, chain, birth, no caller, annotated)"
	for pair in "at-tag tagged" "tip changelog-tip" "chain changelog-chain" "pre pre-release-process" "na not-applicable" "annotated tagged"; do
		state_is ${pair% *} ${pair#* }
	done
	printf '  self-test %-56s every state named\n' "the clean fixture"

	# ── (c) a pin exactly at a tag
	new_case
	fixture_pin "$um" at-tag "$tagged_c"
	run_case "$um"
	pass_like "a pin exactly at a tag"
	state_is at-tag tagged
	if ! grep -q 'refs/tags/v2026.001.0001' "$work/report.$cases"; then
		printf 'FAIL self-test: the lightweight tag name did not reach the report\n'
		exit 1
	fi

	# ── (d) a pin exactly one CHANGELOG commit above a tag
	new_case
	fixture_pin "$um" tip "$tip_c"
	run_case "$um"
	pass_like "a pin exactly one CHANGELOG commit above a tag"
	state_is tip changelog-tip
	if ! grep -q 'refs/tags/v2026.001.0001' "$work/report.$cases"; then
		printf 'FAIL self-test: the tag name did not reach the changelog-tip report\n'
		exit 1
	fi

	# ── (a) a pin at an arbitrary untagged commit
	new_case
	fixture_pin "$um" stray "$stray_c"
	run_case "$um"
	fail_like "a pin at an arbitrary untagged commit" 'stray@.*untagged'

	# ── (b) a pin two-or-more steps above a tag
	new_case
	fixture_pin "$um" two "$two_c"
	run_case "$um"
	fail_like "a pin two steps above a tag" 'two@.*2 first-parent commit'
	state_is two untagged

	# a CHANGELOG commit above an untagged merge above a tag: the walk stops at the merge
	new_case
	fixture_pin "$um" clabove "$clabove_c"
	run_case "$um"
	fail_like "a CHANGELOG commit above an untagged merge" 'clabove@.*not a CHANGELOG commit'

	# ── the census, in both directions
	new_case
	fixture_pin "$um" stray "$stray_c"
	printf 'stray\t%s\tuntagged\tthe merge wrote no CHANGELOG commit\n' "$stray_c" >>"$work/baseline.tsv"
	run_case "$um" "$work/baseline.tsv"
	pass_like "an untagged pin the census records"
	if ! grep -q 'stray' "$work/known.$cases"; then
		printf 'FAIL self-test: the tolerated pin was not reported as known\n'
		exit 1
	fi

	new_case
	fixture_pin "$um" stray "$stray_c"
	fixture_pin "$um" two "$two_c"
	printf 'stray\t%s\tuntagged\tthe merge wrote no CHANGELOG commit\n' "$stray_c" >>"$work/baseline.tsv"
	run_case "$um" "$work/baseline.tsv"
	fail_like "a new untagged pin beside a recorded one" 'two@.*no census row'

	new_case
	fixture_pin "$um" stray "$stray2_c"
	printf 'stray\t%s\tuntagged\tthe merge wrote no CHANGELOG commit\n' "$stray_c" >>"$work/baseline.tsv"
	run_case "$um" "$work/baseline.tsv"
	fail_like "a census row whose pin moved" 'not a pin of this tree'

	new_case
	fixture_pin "$um" at-tag "$tagged_c"
	printf 'at-tag\t%s\tuntagged\ta reason\n' "$tagged_c" >>"$work/baseline.tsv"
	run_case "$um" "$work/baseline.tsv"
	fail_like "a census row whose pin is no longer untagged" 'no longer untagged'

	new_case
	fixture_pin "$um" at-tag "$tagged_c"
	printf 'at-tag\t%s\ttagged\ta reason\n' "$tagged_c" >>"$work/baseline.tsv"
	run_case "$um" "$work/baseline.tsv"
	fail_like "a census row whose state is not untagged" 'is not untagged'

	new_case
	fixture_pin "$um" at-tag "$tagged_c"
	printf 'at-tag\t%s\tuntagged\n' "$tagged_c" >>"$work/baseline.tsv"
	run_case "$um" "$work/baseline.tsv"
	fail_like "a census row with no reason" 'a census row is module, commit, state, reason'

	new_case
	fixture_pin "$um" at-tag "$tagged_c"
	{ printf 'module\tcommit\tstate\treason\n'; printf 'at-tag\t%s\tuntagged\ta reason\n' "$tagged_c"; } >"$work/untracked.tsv"
	run_case "$um" "$work/untracked.tsv"
	fail_like "a census that names no tracked issue" 'tracked-by'

	new_case
	fixture_pin "$um" at-tag "$tagged_c"
	run_case "$um" "$work/absent.tsv"
	fail_like "no census file at all" 'the census is missing'

	# ── a pin whose module store is absent is skipped visibly, and counted
	new_case
	fixture_pin "$um" at-tag "$tagged_c"
	fixture_pin "$um" no-store "$tagged_c"
	run_case "$um"
	pass_like "an absent module store (skipped visibly)"
	if ! grep -q 'skip-no-store' "$work/report.$cases"; then
		printf 'FAIL self-test: the skipped pin was not reported\n'
		exit 1
	fi
	if [[ "$SKIPPED" != 1 || "$JUDGED" != 1 ]]; then
		printf 'FAIL self-test: the skip was not counted (JUDGED=%s SKIPPED=%s)\n' "$JUDGED" "$SKIPPED"
		exit 1
	fi

	# ── every pin skipped is a run over nothing, not green
	new_case
	fixture_pin "$um" no-store "$tagged_c"
	run_case "$um"
	if scope >>"$work/fail.$cases"; then
		printf 'FAIL self-test: a run over only skipped pins did not fail scope\n'
		exit 1
	fi
	fail_like "every pin skipped (a run over nothing)" 'judged no pin'

	# ── a pin whose commit the store does not have is a loud failure of the run
	new_case
	fixture_pin "$um" at-tag "$tip_c"
	if run_case "$um"; then
		printf 'FAIL self-test: a pin the store does not have did not fail the run\n'
		exit 1
	fi
	if ! grep -q 'does not have that commit' "$work/err.$cases"; then
		printf 'FAIL self-test: the unreadable pin did not name the commit and the remedy\n'
		sed 's/^/  /' "$work/err.$cases"
		exit 1
	fi
	printf '  self-test %-56s fails as designed\n' "a pin the module store does not have"

	# ── --remote: an unreachable remote is a loud failure, not a green run
	new_case
	fixture_pin "$um" stray "$stray_c"
	git --git-dir "$um/.git/modules/stray" config remote.origin.url 'https://127.0.0.1:1/none.git'
	REMOTE=1
	run_case "$um"
	REMOTE=0
	fail_like "--remote with an unreachable remote" 'cannot reach https://127.0.0.1:1/none.git'

	# ── --remote resolves a tag the module store never fetched: the pin is healthy and the
	#    local reading's absence was the stale store, not an untagged pin
	new_case
	gd="$work/upstream.git"
	git init -q --bare "$gd"
	t=$(fixture_tree "$gd" 1)
	old=$(fixture_commit "$gd" "$t" - 'feat: a release')
	git --git-dir "$gd" tag v2026.001.0001 "$old"
	old=$(fixture_commit "$gd" "$t" "$old" 'docs: add CHANGELOG 2026.001.0001 for PR #1')
	git --git-dir "$gd" update-ref refs/heads/main "$old"
	gd=$(fixture_repo "$um" fetched-late)
	git --git-dir "$gd" config remote.origin.url "file://$work/upstream.git"
	git --git-dir "$gd" fetch -q --no-tags "file://$work/upstream.git" refs/heads/main
	fixture_pin "$um" fetched-late "$old"
	REMOTE=1
	run_case "$um"
	REMOTE=0
	pass_like "--remote resolves a tag the store never fetched"
	state_is fetched-late changelog-tip

	printf 'design-pintag: self-test passed (%s cases; every state, both census directions, the skip, the unreadable pin and both remote outcomes each fail when they must)\n' "$cases"
}

# ── the modes ──────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == self-test ]]; then
	self_test
	exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "${work:-}"' EXIT
if ! run_check "$ROOT" "$BASELINE" "$work/report" "$work/fail" "$work/known" "$work/note"; then
	printf 'design-pintag: FAILED — the pins could not be read (above), so this run proves nothing\n'
	exit 1
fi
scope >>"$work/fail" || true
if [[ -s "$work/fail" ]]; then
	sed 's/^/  /' "$work/fail"
	printf 'design-pintag: FAILED (%s finding(s))\n' "$(wc -l <"$work/fail" | tr -d ' ')"
	exit 1
fi
summary "$work/report" "$work/known" "$work/note"
if ((VERBOSE)); then
	while IFS=$'\t' read -r path sha state detail; do
		printf '%s %s %s — %s\n' "$state" "$path" "$sha" "$detail"
	done <"$work/report"
fi
printf 'design-pintag: every pin is at a tag, one CHANGELOG commit above one, or explained\n'
