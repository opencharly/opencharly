#!/usr/bin/env bash
# soul-inject.sh — reasonix SessionStart hook: inject the SOUL.md identity.
#
# reasonix has no additive `instructions` config key (opencode's mechanism), but
# its hooks DO deliver session context: a SessionStart hook's stdout is injected
# once into the next real user turn, wrapped by the host as
# `<hook-context event="SessionStart">…</hook-context>`. That is reasonix's
# documented additive mechanism, so the identity is INJECTED here rather than
# merely pointed at from AGENTS.md.
#
# This closes the reasonix arm of opencharly/opencharly#367. That issue recorded
# "reasonix's documented hooks are Bash-only" as the reason for deferring — a
# premise that is measurably false (SessionStart is a hook event, and its stdout
# is context, not a verdict). Corrected here rather than left standing.
#
# A difference from a hooks-based harness: the identity arrives once per session
# (a hook that re-injects every turn no longer exists in this tree).
#
# Exit 0 always — a missing SOUL.md must never block a session.

set -u

ROOT="${PWD:-}"

# Repo guard: only act inside an OpenCharly umbrella checkout.
[ -f "$ROOT/.claude/hooks/pre-push-gate.sh" ] || exit 0

printf '## Who you are — SOUL.md\n\n'

SOUL="$ROOT/SOUL.md"
if [ -f "$SOUL" ]; then
  cat "$SOUL"
  printf '\n'
else
  printf 'WARNING: SOUL.md is NOT present at the project root, so the charly identity\n'
  printf 'is NOT injected this session. That is the content-loss signature\n'
  printf 'opencharly/opencharly#356 named — restore SOUL.md at the umbrella root.\n'
fi

exit 0
