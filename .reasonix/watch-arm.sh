#!/usr/bin/env bash
# watch-arm.sh — reasonix SessionStart hook: arm the PR watcher for this repo.
#
# A SessionStart hook's stdout is injected ONCE into the next user turn, so this
# script's job is to tell the agent the exact command to run — it does NOT spawn
# a background watcher itself. Spawning one from a session-start hook would be
# invisible, unkillable from the transcript, and would fight the watcher's own
# single-instance lock.
#
# The watcher itself is `node scripts/gh/cli.ts watch` — the ONE watcher every
# harness uses (opencharly/opencharly#1140), carrying the verdict, the poll floor,
# the rate-limit guard and the stall alarm. This hook only binds it to
# `.reasonix/watch.items`.
#
# Payload: one line of JSON on stdin (event, sessionId, cwd, ...). Exit 0.
# Outside an OpenCharly checkout, or with no armed items, it prints nothing.

set -u

ROOT="${PWD:-}"

# Repo guard: only act inside an OpenCharly umbrella checkout.
[ -f "$ROOT/.claude/hooks/pre-push-gate.sh" ] || exit 0

ITEMS_FILE="$ROOT/.reasonix/watch.items"
[ -f "$ITEMS_FILE" ] || exit 0

WATCHER="$ROOT/scripts/gh/cli.ts"
[ -f "$WATCHER" ] || exit 0

# Collect armed items through the ENGINE's reader — the ONE grammar (opencharly/opencharly#1308).
# This used to carry its own `grep -E` acceptance set, which silently dropped
# `#issuecomment-N` URLs (the shape `gh pr comment` prints), a scheme-less `github.com/...`
# and a trailing-slash URL that the engine accepts. A malformed line is now refused by name
# when the watcher starts (exit 5), never filtered out here into silence.
ITEMS="$(node "$WATCHER" items "$ITEMS_FILE" 2>/dev/null | awk 'NR<=50')"

# Inert by default: a comment-only items file prints nothing at all.
[ -n "$ITEMS" ] || exit 0

# shellcheck disable=SC2086
printf 'PR watcher: %d item(s) armed in .reasonix/watch.items.\n' "$(printf '%s\n' "$ITEMS" | wc -l)"
printf 'Arm it as a background job (it exits when an event fires, and the host notifies you):\n\n'
# shellcheck disable=SC2086
printf '  node %s watch --events verdict,merged,closed,conflict,comment,stall --stallmin 60 %s\n' "$WATCHER" "$(printf '%s ' $ITEMS)"
printf '\nIt wakes on a validator verdict (a re-run included), a merge, a close, a\n'
printf 'new comment, or a stall (no progress for the window while an item is still\n'
printf 'open+unmerged: a takeover candidate). Re-arm it after acting on a wake, adding\n'
printf '--no-arm-wake so a verdict already reported is not reported again. A watcher\n'
printf 'alert is an ADDITION to the ledger, never a reason to consider the item done.\n'

exit 0
