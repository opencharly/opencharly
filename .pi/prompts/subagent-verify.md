---
description: Spawn a sub-agent to run the pinning gate and report results
argument-hint: "<none>"
---
# Sub-agent Verify: $1

## Task for the verifier

Run `bash scripts/verify-pins.sh` (and `task map` for submodule status) to
completion and report verbatim output.

Use a fresh-context sub-agent:

- agent: `validator` (see `.pi/subagents/umbrella-agents.json`)
- context: `fresh` — must not inherit your working tree assumptions

## Report format

- PASS or BLOCK with the exact failing invariant
- Clean submodule status (no `+`/`-` prefixes in `git submodule status`)
