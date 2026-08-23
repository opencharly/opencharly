#!/usr/bin/env bash
# verify-pins.sh — the umbrella's pinning gate (runs in CI, safe locally).
# Assumes a fresh `git clone --recurse-submodules` (actions/checkout guarantees it).
# Enforces the README's three invariants:
#   1. every .gitmodules branch = the repo's real default branch
#   2. every submodule is clean and checked out at its recorded gitlink
#   3. policy B: distro-* pins == charly's own gitlinks
#      (spec, sdk, plugins and docs are NOT charly-pinned anymore — spec and sdk
#      resolve from the Go proxy at pinned go.mod requires since their
#      de-submodule cutovers, docs pins charly in ITS .gitmodules since the docs
#      cutover, and the plugins corpus moved to the standalone opencharly/marketplace
#      repo (charly de-submoduled it) — the umbrella pins them to their own default
#      branches like every non-pinned repo)
#   4. charly's nested submodules are fully checked out at their gitlinks
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { echo "FAIL: $*" >&2; exit 1; }

submodule_url() { git config -f .gitmodules --get "submodule.$1.url"; }
submodule_branch() { git config -f .gitmodules --get "submodule.$1.branch"; }

declare -A CHARLY_PINNED=(
  [box/arch]=distro-arch
  [box/cachyos]=distro-cachyos
  [box/debian]=distro-debian
  [box/fedora]=distro-fedora
  [box/ubuntu]=distro-ubuntu
)

mapfile -t MODULES < <(git config -f .gitmodules --get-regexp '^submodule\..*\.path$' | awk '{print $2}')
[ "${#MODULES[@]}" -ge 20 ] || fail "suspiciously few submodules (${#MODULES[@]})"

for path in "${MODULES[@]}"; do
  url="$(submodule_url "$path" 2>/dev/null || true)"
  branch="$(submodule_branch "$path" 2>/dev/null || true)"
  [ -n "$url" ] || fail "$path: no url in .gitmodules"
  [ -n "$branch" ] || fail "$path: missing branch= in .gitmodules (should be the repo default)"

  default="$(git ls-remote --symref "$url" HEAD | sed -n 's/^ref: refs\/heads\/\(.*\)\tHEAD/\1/p')"
  [ "$branch" = "$default" ] || fail "$path: .gitmodules branch=$branch but remote default is $default"

  [ -d "$path" ] || fail "$path: not checked out"
  [ -z "$(git -C "$path" status --porcelain)" ] || fail "$path: dirty working tree"

  gitlink="$(git ls-files -s "$path" | awk '{print $2}')"
  head="$(git -C "$path" rev-parse HEAD)"
  [ "$gitlink" = "$head" ] || fail "$path: checked-out HEAD $head != gitlink $gitlink"
done

# policy B: umbrella pins must equal charly's own pins
for cpath in "${!CHARLY_PINNED[@]}"; do
  upath="${CHARLY_PINNED[$cpath]}"
  cp="$(git -C charly ls-tree HEAD "$cpath" | awk '{print $3}')"
  up="$(git ls-files -s "$upath" | awk '{print $2}')"
  [ -n "$cp" ] || fail "charly has no gitlink at $cpath"
  [ "$cp" = "$up" ] || fail "policy B: $upath ($up) != charly's $cpath ($cp)"
done

# charly's own nested submodules must be initialized at their gitlinks
# (docs' nested charly pin is NOT checked here — the docs repo owns its content;
# its own deploy workflow checks out the pinned charly recursively on every run)
dirty="$(git -C charly submodule status --recursive | grep -E '^[+-]' || true)"
[ -z "$dirty" ] || fail "charly nested submodules not at their gitlinks:
$dirty"

echo "verify-pins: OK — ${#MODULES[@]} submodules, policy B holds"
