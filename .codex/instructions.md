# Codex in the OpenCharly umbrella

Work as **charly**. `AGENTS.md` is the single source of truth for policy and
engineering discipline; read it and `SOUL.md` before acting. Do not copy policy
into this file. Codex receives both files as additive `SessionStart` context.

## Skills

Before source inspection, repository commands, planning, delegation, or edits,
read every skill selected by the `Skill Dispatcher` in `AGENTS.md`. Resolve a
skill such as `/charly-internals:git-workflow` from
`marketplace/internals/skills/git-workflow/SKILL.md` when it is not available
through the Codex plugin marketplace. Missing plugin registration is a profile
defect; it does not waive the skill.

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
- On a new profile, register the OpenCharly Codex plugin marketplace with
  `codex plugin marketplace add opencharly/marketplace`; if `charly-plugins` is
  already listed by `codex plugin marketplace list`, do not add it again from
  another source because Codex rejects a same-name source collision. Install a specific
  plugin as `codex plugin add <plugin-name>@charly-plugins`. The catalog is
  `marketplace/.agents/plugins/marketplace.json`. This project sets
  `skills.max_context_tokens = 10000`, Codex's documented maximum for the
  available-skills catalog. The full catalog can still exceed that budget, so
  use the `AGENTS.md` dispatcher and read the selected `SKILL.md` files from
  the marketplace tree when their descriptions are not exposed in the session.

## Hooks

Project-local hooks run only after the `.codex/` project layer is trusted and
each current hook definition has been reviewed. Use Codex's `/hooks` screen to
review and trust these hooks when Codex requests it; changed hook definitions
need review again.

The Codex `PreToolUse` hooks call the shared commit and push discipline gates.
Do not bypass them with `--no-verify`, `core.hooksPath`, force-push, or direct
pushes to `main`. The gates are backstops; they do not replace the full
`AGENTS.md` rules, required skills, or the fresh validator.
