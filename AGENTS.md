# AGENTS.md — rules for agent workers in the umbrella

The umbrella is a *view* of the org: 22 submodules at the root, each a real repo owned
elsewhere. Short rulebook — every rule exists because breaking it corrupts someone
else's repo.

1. **Never edit inside a submodule.** All change lands via PR to the owning repo; the
   umbrella only records gitlinks. A dirty submodule fails CI (`verify`) and is a
   review blocker.
2. **Git op rule:** run submodule git through `git -C <absolute-path>` from the
   umbrella root. Never root a worker in a submodule, and never run git commands that
   cross the boundary implicitly (no `git add -A` from a submodule, no `git pull` at
   the umbrella root and then assuming submodules moved).
3. **No nested `go.work`.** `charly/` carries its own `go.work` (spanning `sdk/` +
   `spec/`); Go forbids nested workspace files. No `go.work` at the umbrella root —
   all Go builds happen inside `charly/`.
4. **No worktrees inside submodules.** The `.claude/worktrees/` pattern belongs to the
   `charly` checkout, not here.
5. **Pin discipline:** only pin merged refs (default branches or gitlinks charly
   records). Never a PR branch. `verify` treats dangling pins as failures.
6. **Policy B is the contract:** `sdk spec plugins docs distro-*` must equal charly's
   own gitlinks. If charly's pinning changed, the fix is a sync (`task sync` + PR),
   not a hand-pin.
7. When a task touches a subrepo, read that subrepo's own `AGENTS.md`/`CLAUDE.md`
   first — its rulebook applies inside it.

Reference: README (pinning policy), `.github/workflows/` (CI contract).
