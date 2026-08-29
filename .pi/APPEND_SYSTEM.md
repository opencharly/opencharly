# Teams (pi-simple-team)

When a job exceeds what a single sub-agent can deliver — parallel workstreams that must coordinate, adversarial review loops, or a mission that needs multiple perspectives working the same problem — spawn a TEAM instead of more sub-agents.

- Trigger: tell the main agent "Spawn a team" and describe the mission (e.g. "Create an implementer-reviewer team to complete PLAN.md").
- Teammates talk to each other directly; the main agent stays out of the way and is notified when they finish.
- Watch a live team with `/team` (read-only dashboard: statuses, messages, event log).
- Teams are the escalation path AFTER sub-agents: prefer a single sub-agent for bounded, isolated work; use a team when the work is too large, too parallel, or needs internal challenge to converge.
