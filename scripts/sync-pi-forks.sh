#!/usr/bin/env bash
# Sync the opencharly pi-plugin forks from their upstreams.
#
# - 8 real forks: gh repo sync (default branch) + explicit tag propagation
#   (gh repo sync does NOT propagate tags).
# - 3 vendored mirrors (pi-fabric, rpiv-todo, pi-lsp) are NOT auto-synced:
#   they are exact snapshots of the published npm content. Re-vendor from the
#   npm tarball / monorepo tag on every version bump, then bump the pin in
#   .pi/settings.json via PR.
#
# Usage: scripts/sync-pi-forks.sh   (requires gh auth + git credential helper)
set -euo pipefail

# Only the 8 real forks go through gh repo sync. The 3 vendored mirrors
# (pi-fabric, rpiv-todo, pi-lsp) are NOT forks — gh repo sync fails on them —
# and are re-vendored manually on version bump (see the header comment).
PAIRS=(
  "pi-mcp-adapter:nicobailon/pi-mcp-adapter"
  "pi-subagents:nicobailon/pi-subagents"
  "pi-memory:jayzeng/pi-memory"
  "pi-ollama-cloud:fgrehm/pi-ollama-cloud"
  "pi-web-access:nicobailon/pi-web-access"
  "pi-claude-marketplace:acolomba/pi-claude-marketplace"
  "pi-goal:Michaelliv/pi-goal"
  "pi-simple-team:giladbarnea/pi-simple-team"
)

for pair in "${PAIRS[@]}"; do
  fork="${pair%%:*}"; upstream="${pair#*:}"
  echo "== syncing opencharly/$fork from $upstream"
  gh repo sync "opencharly/$fork" --source "$upstream" --force
  # propagate tags (gh repo sync does not)
  tmp="$(mktemp -d)/$fork.git"
  git clone --bare "https://github.com/opencharly/$fork.git" "$tmp"
  git -C "$tmp" remote add upstream "https://github.com/$upstream.git"
  git -C "$tmp" fetch --tags upstream
  git -C "$tmp" push --tags origin
  rm -rf "$(dirname "$tmp")"
done

echo "done. Vendored mirrors (pi-fabric, rpiv-todo, pi-lsp) need manual re-vendor on version bump."
