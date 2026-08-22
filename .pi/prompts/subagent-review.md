---
description: Spawn a fresh-context reviewer sub-agent for adversarial review
argument-hint: "<review-angle>"
---
# Sub-agent Review: $1

## Task for the reviewer

Review the current diff / plan / implementation with a focus on $1.

Use a fresh-context sub-agent:

- agent: `reviewer` (see `.pi/subagents/umbrella-agents.json`)
- context: `fresh` — must not inherit this session's reasoning

## What the reviewer checks

- Policy B equality (pins match charly's gitlinks)
- No dirty submodules, no edits inside submodules
- Only merged refs pinned (no PR branches)
- Rulebook compliance table complete
- Attribution tier matches the evidence in the PR body
