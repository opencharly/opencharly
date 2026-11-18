#!/usr/bin/env bash
# bootstrap.sh — one command from a fresh clone of the umbrella to a working session root.
#
# It COMPOSES the existing steps; it re-implements none of them (R2):
#
#   1. scripts/init-submodules.sh          materialize the working set (args pass through: --all, …)
#   2. charly/scripts/bootstrap-charly.sh  build ./charly/bin/charly from the checkout (R9)
#   3. charly task hooks                   install this clone's git hooks
#   4. scripts/sync-skill-bindings.mjs     assert the committed harness skill bindings ARE the
#                                          corpus derivation (--check: a bootstrap never rewrites
#                                          a tracked file; a stale binding is a finding, not a fix)
#   5. harness install records             the per-USER state a harness keeps outside the repo
#
# Step 5 exists because enablement is not installation. `.claude/settings.json`'s `enabledPlugins`
# is the enablement half; Claude Code loads a plugin's skills only when its plugin registry
# (~/.claude/plugins/installed_plugins.json) ALSO holds an install record for this project — and
# nothing in a clone writes that record (measured twice: CHANGELOG/2026.240.2141, and
# opencharly/opencharly#1100, where the registry was empty and the session loaded no /charly-* skill
# at all). So the bootstrap writes it, from the repo's own declaration: the marketplace source
# from `extraKnownMarketplaces`, the plugin keys from the derived `enabledPlugins`.
#
# Codex registers the same corpus marketplace (its catalog is `.agents/plugins/marketplace.json`;
# `INSTALLED_BY_DEFAULT` entries install on registration — see the corpus README's harness table).
# opencode, pi, reasonix and DSH read committed config plus the materialized corpus, and need no
# per-clone install step; the script says so instead of inventing one.
#
# A harness whose CLI is not on PATH is a visible SKIP, never a failure: the umbrella supports
# several harnesses and no host runs all of them. A harness that IS present and fails to install is
# a failure — a session root that silently loads nothing is the defect this script exists to end.
#
# Usage: bash scripts/bootstrap.sh [init-submodules args…]   (from any directory)
# Needs: the tools in DEPS below — it warns about each missing one and installs nothing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say() { printf 'bootstrap: %s\n' "$*"; }
die() { printf 'bootstrap: FAIL: %s\n' "$*" >&2; exit 1; }

warn() { printf 'bootstrap: WARNING: %s\n' "$*" >&2; }

# Every external tool this umbrella's bootstrap, hooks and harness config call, with what breaks
# without it and how to install it. The bootstrap WARNS about each missing one and never installs
# anything itself: installing host tools is the operator's call. `core` tools are the bootstrap's
# own steps, so a missing one also stops the run below; the rest only degrade what they serve —
# golangci-lint's absence is the quiet one, because the pre-commit gate fails OPEN without it.
#   <tool> | <core|optional> | <what needs it> | <how to install it>
DEPS='git|core|every step|your distro package manager
python3|core|scripts/init-submodules.sh, the hooks|your distro package manager
go|core|the charly build (charly/scripts/bootstrap-charly.sh)|https://go.dev/dl/
node|core|scripts/sync-skill-bindings.mjs, the hooks|https://nodejs.org/
gh|optional|hooks/pre-push (the PR-body gate) and every PR action|https://cli.github.com/
golangci-lint|optional|the lint leg of .claude/hooks/pre-commit-gate.sh, which is SKIPPED without it|https://golangci-lint.run/docs/welcome/install/'
# gopls is needed only while the gopls-lsp Claude plugin is enabled in the committed settings.
if grep -q '"gopls-lsp@claude-plugins-official": true' .claude/settings.json 2>/dev/null; then
  DEPS="$DEPS
gopls|optional|Claude Code's LSP tool (the enabled gopls-lsp plugin)|go install golang.org/x/tools/gopls@latest (into a directory on PATH)"
fi

missing_core=()
while IFS='|' read -r tool class needed_by how; do
  command -v "$tool" >/dev/null 2>&1 && continue
  warn "$tool is not on PATH — needed by $needed_by. Install: $how"
  [ "$class" = core ] && missing_core+=("$tool")
done <<< "$DEPS"
[ ${#missing_core[@]} -eq 0 ] || die "cannot bootstrap without: ${missing_core[*]} (see the warnings above)"

say "1/5 materialize the working set"
bash scripts/init-submodules.sh "$@"

say "2/5 build charly/bin/charly"
./charly/scripts/bootstrap-charly.sh
CHARLY="$ROOT/charly/bin/charly"

say "3/5 install this clone's git hooks"
"$CHARLY" task hooks

say "4/5 assert the harness skill bindings match the pinned corpus"
node scripts/sync-skill-bindings.mjs --check --require-corpus

say "5/5 harness install records"

# A harness CLI may rewrite a TRACKED file while it records an install: `claude plugin install
# --scope project` re-serializes `.claude/settings.json` in Claude Code's own key order and layout
# whenever it writes a NEW install record — a fresh clone's case — even though every key it would
# add is already there; with the record present it writes nothing (both measured,
# opencharly/opencharly#1100). The
# committed file is kept in exactly that form so the install is a fixed point, and this snapshot is
# the control that keeps it one: any tracked file step 5 changes is a failure, named, below.
dirty_before="$(git diff --name-only)"

# The marketplaces and plugin keys Claude Code must hold, read from the committed settings — the
# ONE declaration — as tab-separated lines: `M <name> <github repo>` and `P <plugin@market>`.
claude_plan() {
  node -e '
    const s = JSON.parse(require("fs").readFileSync(".claude/settings.json", "utf8"));
    for (const [name, m] of Object.entries(s.extraKnownMarketplaces ?? {})) {
      if (m?.source?.source !== "github" || !m.source.repo) { console.error(`marketplace ${name}: only a github source is supported`); process.exit(1); }
      console.log(`M\t${name}\t${m.source.repo}`);
    }
    for (const [key, on] of Object.entries(s.enabledPlugins ?? {})) if (on === true) console.log(`P\t${key}`);
  '
}

if command -v claude >/dev/null 2>&1; then
  plan="$(claude_plan)" || die "could not read .claude/settings.json"
  known="$(claude plugin marketplace list --json)" || die "claude plugin marketplace list failed"
  # A marketplace this project names must be registered under that name, at that source. The
  # official one is known to every Claude Code install; the corpus one is added once per user.
  while IFS=$'\t' read -r _ name repo; do
    if printf '%s' "$known" | node -e 'const n=process.argv[1]; const l=JSON.parse(require("fs").readFileSync(0,"utf8")); process.exit(l.some((m)=>m.name===n)?0:1)' "$name"; then
      say "claude: marketplace $name — refreshing"
      claude plugin marketplace update "$name"
    else
      say "claude: marketplace $name — adding $repo"
      claude plugin marketplace add "$repo"
    fi
  done < <(printf '%s\n' "$plan" | grep '^M')
  # Install every enabled plugin at PROJECT scope (the scope whose install record is keyed to this
  # checkout, and the one `enabledPlugins` in the project settings declares), THEN update it.
  # `install` writes a MISSING record and is a no-op on an existing one, so on a clone bootstrapped
  # before, it leaves the record — and the cached copy a session loads — at the OLD marketplace
  # commit even though the refresh above fetched the new one. `update` moves an existing record to
  # the marketplace's current commit. Measured (opencharly/opencharly#1100): after a corpus change
  # merged, the refreshed clone had it, the cache held the new copy, and every session still loaded
  # the record's old copy until `update` ran.
  n=0
  while IFS=$'\t' read -r _ key; do
    claude plugin install "$key" --scope project >/dev/null || die "claude: installing $key failed"
    claude plugin update "$key" --scope project >/dev/null || die "claude: updating $key failed"
    n=$((n + 1))
  done < <(printf '%s\n' "$plan" | grep '^P')
  say "claude: $n plugin(s) installed and updated at project scope"
else
  say "claude: SKIP — the claude CLI is not on PATH"
fi

if command -v codex >/dev/null 2>&1; then
  if codex plugin marketplace list | awk 'NR>1{print $1}' | grep -qx charly-plugins; then
    say "codex: marketplace charly-plugins — refreshing"
    codex plugin marketplace upgrade charly-plugins
  else
    say "codex: marketplace charly-plugins — adding opencharly/marketplace"
    codex plugin marketplace add opencharly/marketplace
  fi
else
  say "codex: SKIP — the codex CLI is not on PATH"
fi

dirty_after="$(git diff --name-only)"
if [ "$dirty_before" != "$dirty_after" ]; then
  changed="$(comm -13 <(printf '%s\n' "$dirty_before" | sort) <(printf '%s\n' "$dirty_after" | sort) | tr '\n' ' ')"
  die "a harness install rewrote tracked file(s): ${changed:-<an already-modified file>}— commit them in the form the harness writes (git diff shows it), so its install is a fixed point"
fi

say "opencode, pi, reasonix, dsh: nothing per clone — they read the committed config and the corpus"
say "done — put the binary on PATH with: export PATH=\"$ROOT/charly/bin:\$PATH\""
