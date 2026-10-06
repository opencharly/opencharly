#!/usr/bin/env bash
# watch-arm.sh — reasonix SessionStart hook: arm the PR watcher for this repo.
#
# A SessionStart hook's stdout is injected ONCE into the next user turn, so this
# script's job is to tell the agent the exact command to run — it does NOT spawn
# a background watcher itself. Spawning one from a session-start hook would be
# invisible, unkillable from the transcript, and would fight the watcher's own
# single-instance lock.
#
# The watcher itself is `marketplace/scripts/gh_watch.sh` — harness-INDEPENDENT,
# already carrying the poll floor, the rate-limit guard, the stall alarm and
# `--auto-rearm`. This hook only binds it to `.reasonix/watch.items`.
#
# Payload: one line of JSON on stdin (event, sessionId, cwd, ...). Exit 0.
# Outside an OpenCharly checkout, or with no armed items, it prints nothing.

set -u

ROOT="${PWD:-}"

# Repo guard: only act inside an OpenCharly umbrella checkout.
[ -f "$ROOT/.claude/hooks/pre-push-gate.sh" ] || exit 0

ITEMS_FILE="$ROOT/.reasonix/watch.items"
[ -f "$ITEMS_FILE" ] || exit 0

WATCHER="$ROOT/marketplace/scripts/gh_watch.sh"
[ -x "$WATCHER" ] || exit 0

# Collect armed items: strip comments and blank lines, keep only well-formed
# entries. `grep -m` bounds the work (never pipe an unbounded grep into head).
ITEMS="$(
  grep -v '^[[:space:]]*#' "$ITEMS_FILE" 2>/dev/null \
    | grep -v '^[[:space:]]*$' \
    | grep -E -m 50 '^([A-Za-z0-9._-]+/[A-Za-z0-9._-]+(#|/(pull|issues)/)[0-9]+|https?://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/(pull|issues)/[0-9]+)$'
)"

# Inert by default: a comment-only items file prints nothing at all.
[ -n "$ITEMS" ] || exit 0

# shellcheck disable=SC2086
printf 'PR watcher: %d item(s) armed in .reasonix/watch.items.\n' "$(printf '%s\n' "$ITEMS" | wc -l)"
printf 'Arm it as a background job (it exits when an event fires, and the host notifies you):\n\n'
# shellcheck disable=SC2086
printf '  %s --auto-rearm --stallmin 60 %s\n' "$WATCHER" "$(printf '%s ' $ITEMS)"
printf '\nThe stall alarm is ON: no progress for the window while an item is still\n'
printf 'open+unmerged means a takeover candidate. `--auto-rearm` keeps the watch\n'
printf 'alive across fires; a watcher alert is an ADDITION to the ledger, never a\n'
printf 'reason to consider the current item done.\n'

exit 0
