#!/usr/bin/env bash
# sync-gitlinks.sh — bump every umbrella submodule pin (policy B, see README).
#
#   charly                → its default-branch HEAD (rolling)
#   plugins distro-* → exactly the commits charly's own gitlinks pin
#   everything else       → its own default-branch HEAD (sdk, spec and docs are NOT
#                           charly-pinned anymore — sdk and spec resolve from the
#                           Go proxy at pinned go.mod requires, and docs pins charly
#                           in its own .gitmodules since the docs de-submodule
#                           cutover — so the umbrella pins them to their own
#                           default branches like every other repo)
#
# Never pins a PR branch — only merged refs. Does not commit or open PRs itself;
# the sync workflow (or a human) commits the staged gitlinks and PRs them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The charly-pinned set, and why sdk/spec/docs/plugins are absent from it, are
# documented once in the sourced library.
# shellcheck source=scripts/lib/policy-b.sh
source "$ROOT/scripts/lib/policy-b.sh"

submodule_url() { git config -f .gitmodules --get "submodule.$1.url"; }
submodule_branch() { git config -f .gitmodules --get "submodule.$1.branch"; }

# pin <path> <ref> — fetch, detach at ref, stage the gitlink
pin() {
  local path="$1" ref="$2"
  git -C "$path" fetch --quiet origin
  git -C "$path" switch --quiet --detach "$ref"
  git add "$path"
  echo "  $path -> $(git -C "$path" rev-parse --short HEAD)"
}

mapfile -t MODULES < <(git config -f .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}')

echo "== charly (default-branch HEAD) =="
pin charly "origin/$(submodule_branch charly)"

echo "== charly-pinned repos (exactly charly's gitlinks) =="
for cpath in "${!CHARLY_PINNED[@]}"; do
  upath="${CHARLY_PINNED[$cpath]}"
  sha="$(git -C charly ls-tree HEAD "$cpath" | awk '{print $3}')"
  [ -n "$sha" ] || { echo "ERROR: charly has no gitlink at $cpath" >&2; exit 1; }
  pin "$upath" "$sha"
done

echo "== everything else (own default-branch HEAD) =="
for path in "${MODULES[@]}"; do
  case "$path" in
    charly | distro-*) continue ;;
  esac
  pin "$path" "origin/$(submodule_branch "$path")"
done

echo "sync-gitlinks: done — review with 'git status' and 'git diff --submodule'"
