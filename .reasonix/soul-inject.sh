#!/usr/bin/env bash
# soul-inject.sh — reasonix SessionStart hook: inject the SOUL.md identity AND the
# reasonix harness binding (design/REASONIX.md).
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
# The SECOND payload is the harness binding. reasonix loads instruction files ONLY
# from the workspace root (`REASONIX.md` / `AGENTS.md` / `CLAUDE.md`); the binding
# lives in `design/` beside the design ledger, so it is injected here too — the
# same mechanism, the same once-per-session contract. Both payloads are asserted
# by `scripts/check-harness-config.mjs` (check 7 the identity, check 7b the
# binding), so a hook that stops emitting either one is RED, not silent.
#
# A difference from a hooks-based harness: the context arrives once per session
# (a hook that re-injects every turn no longer exists in this tree).
#
# Exit 0 always — a missing SOUL.md or a missing binding must never block a session.

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

# The reasonix harness binding. reasonix auto-loads only the instruction files it
# finds in the WORKSPACE ROOT (`REASONIX.md` / `AGENTS.md` / `CLAUDE.md`), and this
# binding lives in `design/` beside the design ledger — so it is delivered here, by
# the same SessionStart mechanism, rather than left to be loaded natively. A hook
# that stops emitting it is a silent capability loss: the session would run with
# `AGENTS.md`'s `/charly-<family>:<skill>` references and no mapping from them to a
# bare-name skill call. `scripts/check-harness-config.mjs` check 7b asserts it.
printf '## The reasonix harness binding — design/REASONIX.md\n\n'

RIX="$ROOT/design/REASONIX.md"
if [ -f "$RIX" ]; then
  cat "$RIX"
  printf '\n'
else
  printf 'WARNING: design/REASONIX.md is NOT present, so the reasonix harness binding\n'
  printf '(how every /charly-<family>:<skill> reference resolves to a skill call, and\n'
  printf 'which gate hooks this repo arms) is NOT injected this session — reasonix runs\n'
  printf 'with AGENTS.md alone. That is the content-loss signature\n'
  printf 'opencharly/opencharly#356 named — restore design/REASONIX.md.\n'
fi

exit 0
