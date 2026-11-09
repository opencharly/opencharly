#!/usr/bin/env bash
# design-module-store.sh — WHERE a pinned module's object store is: ONE definition.
#
# The two design controls that read a pinned module's own repository — design-dpat.sh (its CUE)
# and design-pintag.sh (its relation to a release tag) — read it from the object store AT THE
# PINNED COMMIT, never from the checkout: a checkout can be stale, dirty or absent, and a gate
# that judged it would be judging a tree nobody ships. Both used to assume the store is
# `<git-common-dir>/modules/<path>`. That is true of a plain clone and FALSE in the shape
# AGENTS.md Part II #2 mandates for every session: a LINKED WORKTREE keeps its submodule
# repositories under `<git-common-dir>/worktrees/<name>/modules/<path>`, and a pin advanced
# inside that worktree is fetched THERE (measured, git 2.56).
#
# The consequence was a control that failed LOUD on a healthy pin — and it is not hypothetical:
# measured 2026-11-09, the merged `main` pins `dotgithub` at 3f1ad6cab29c5ba58ad13778e139f4f24da0fd2b,
# which is absent from `.git/modules/dotgithub` and present in
# `.git/worktrees/opencharly-gate/modules/dotgithub`, so `design-pintag.sh` reported
# "does not have that commit — the control cannot read the pin it judges". A LOUD refusal is the
# right shape for an unreadable pin, so the defect is the LOCATION, not the refusal.
#
# design_module_store <root> <path> — print the repository GIT uses for the submodule at <path>,
# which is where a fetch from any worktree of this clone lands. GIT is asked, so the answer
# follows the clone's own layout instead of a layout assumed here. When no checkout exists (a
# light tree, which is a normal session shape) git cannot answer for the path, and the plain
# clone's store is the answer — and if that store is absent too, the caller's existing loud
# refusal still names it.
#
# Sourced, not executed: it defines the resolver and runs nothing.
design_module_store() {
	local root="$1" path="$2" store=""
	if [ -e "$root/$path/.git" ]; then
		store=$(git -C "$root/$path" rev-parse --path-format=absolute --git-dir 2>/dev/null) || store=""
		if [ -n "$store" ]; then
			printf '%s\n' "$store"
			return 0
		fi
	fi
	store=$(git -C "$root" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 1
	[ -n "$store" ] || return 1
	printf '%s\n' "$store/modules/$path"
}
