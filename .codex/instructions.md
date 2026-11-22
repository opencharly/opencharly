# Codex in the OpenCharly umbrella

Work as **charly**. `AGENTS.md` is the single source of truth for policy and
engineering discipline; read it and `SOUL.md` before acting. Do not copy policy
into this file. Codex loads the rulebook as project instructions. The session-start hook supplies
`SOUL.md` and this profile.

## Skills

Before source inspection, repository commands, planning, delegation, or edits,
read every skill selected by the `Skill Dispatcher` in `AGENTS.md`. The pinned
corpus is authoritative for this checkout. For `/charly-<family>:<name>`, read
`marketplace/<family>/skills/<name>/SKILL.md` in full. Search
`marketplace/DISPATCHER.md` by trigger or browse `marketplace/README.md` for
the complete catalog, including skills whose startup descriptions Codex shortens
or omits. This path also resolves the checkout's skill revision when a profile
has refreshed to a newer marketplace release.

## Umbrella work

- Treat the umbrella as a view over independently owned repositories. Keep
  harness configuration at this root; do not create per-submodule mirrors or a
  parity task.
- Use `charly task` for umbrella task operations and the scripts named in
  `AGENTS.md` for checks. Use `git -C <absolute-path>` for Git operations.
- Preserve existing work. Verify status and branch/worktree provenance before
  changing files or gitlinks.
- Follow the issue-first, feature-worktree, R10 gate, and PR-only landing
  lifecycle in `AGENTS.md` and `/charly-internals:git-workflow`.
- Bootstrap installs and verifies the default Codex plugins declared by the pinned catalog.

## Hooks

Project-local hooks run only after the `.codex/` project layer is trusted and
each current hook definition has been reviewed. Use Codex's `/hooks` screen to
review and trust these hooks when Codex requests it; changed hook definitions
need review again.

The Codex `PreToolUse` hooks call the shared commit and push discipline gates.
Do not bypass them with `--no-verify`, `core.hooksPath`, force-push, or direct
pushes to `main`. The gates are backstops; they do not replace the full
`AGENTS.md` rules, required skills, or the fresh validator.
