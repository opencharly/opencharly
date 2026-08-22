#!/usr/bin/env bash
# sync-gitlinks.sh — bump every umbrella submodule pin (policy B, see README).
#
#   charly                → its default-branch HEAD (rolling)
#   sdk spec plugins docs distro-* → exactly the commits charly's own gitlinks pin
#   everything else       → its own default-branch HEAD
#
# Never pins a PR branch — only merged refs. Does not commit or open PRs itself;
# the sync workflow (or a human) commits the staged gitlinks and PRs them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# charly-path → umbrella-path for the repos charly itself pins
declare -A CHARLY_PINNED=(
  [sdk]=sdk
  [spec]=spec
  [plugins]=plugins
  [docs]=docs
  [box/arch]=distro-arch
  [box/cachyos]=distro-cachyos
  [box/debian]=distro-debian
  [box/fedora]=distro-fedora
  [box/ubuntu]=distro-ubuntu
)

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
    charly | sdk | spec | plugins | docs | distro-*) continue ;;
  esac
  pin "$path" "origin/$(submodule_branch "$path")"
done

echo "sync-gitlinks: done — review with 'git status' and 'git diff --submodule'"
