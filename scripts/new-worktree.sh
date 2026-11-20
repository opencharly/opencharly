#!/usr/bin/env bash
# new-worktree.sh — ONE command from a session slug to a ready session worktree
# (opencharly/opencharly#1155).
#
# AGENTS.md Part II #2 puts every session's edits in `<umbrella>/.worktrees/<slug>/opencharly/`,
# branched off fresh `origin/main`. A bare `git worktree add` gives a tree with NO working set and
# NO binary: its pre-commit cannot run the pin check, and its pre-push could not run the body
# linter (measured: a one-line body passed a push from a bare worktree, and the same body was
# BLOCKED with 14 findings once `marketplace/` was there). This script composes the steps every
# session otherwise repeats by hand:
#
#   1. fetch `origin/main` (no submodule recursion: the stores are step 3's business);
#   2. add the worktree at `.worktrees/<slug>/opencharly` on `feat/<slug>`, off `origin/main`;
#   3. bring every module STORE up to the new pins (`init-submodules.sh --stores`, into the
#      clone's common git dir), so the pre-push DESIGN gate can read every pin;
#   4. materialize the working set in the worktree (`init-submodules.sh`);
#   5. build the worktree's own `charly/bin/charly` (R9 — never the main clone's binary).
#
# Usage: bash scripts/new-worktree.sh <slug>
#        CHARLY_WORKTREE_SLUG=<slug> charly task worktree
# The slug is lower-case kebab: [a-z0-9][a-z0-9-]*. It is DATA, never substituted into a
# command's text (AGENTS.md Part II #2).
set -euo pipefail

say() { printf 'worktree: %s\n' "$*"; }
die() { printf 'worktree: FAIL — %s\n' "$*" >&2; exit 1; }

slug="${1:-}"
[ -n "$slug" ] || die "usage: bash scripts/new-worktree.sh <slug>   (or CHARLY_WORKTREE_SLUG=<slug> charly task worktree)"
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "the slug '$slug' is not lower-case kebab ([a-z0-9][a-z0-9-]*)"

# The UMBRELLA is the main clone: the parent of the common git dir, so this works from the main
# clone and from any of its worktrees alike.
# The initializer is the one BESIDE this script — the version this entrypoint was written
# against — run on the new tree with --root.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
common="$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)" || die "not inside a git checkout"
umbrella="$(dirname "$common")"
dest="$umbrella/.worktrees/$slug/opencharly"
branch="feat/$slug"

[ ! -e "$dest" ] || die "$dest already exists — a slug names ONE session's worktree; choose another, or work in that one"
if git -C "$umbrella" show-ref --verify --quiet "refs/heads/$branch"; then
  die "the branch $branch already exists — choose another slug, or reuse that session's worktree"
fi

say "1/5 fetch origin/main"
git -C "$umbrella" fetch -q --no-recurse-submodules origin main

say "2/5 add $dest on $branch, off origin/main"
mkdir -p "$(dirname "$dest")"
git -C "$umbrella" worktree add -q -b "$branch" "$dest" origin/main

say "3/5 bring every module store up to the new pins (the DESIGN gate reads them)"
bash "$here/init-submodules.sh" --root "$dest" --stores

say "4/5 materialize the working set"
bash "$here/init-submodules.sh" --root "$dest"

say "5/5 build the worktree's own charly"
(cd "$dest" && ./charly/scripts/bootstrap-charly.sh)

say "ready — cd $dest   (binary: ./charly/bin/charly $(cd "$dest" && ./charly/bin/charly version 2>/dev/null || echo '?'))"
