# TODO — mise follow-up (pick up in a fresh session)

> **Config note:** the loop-protection plugin is active in this repo's pi config
> (`.pi/extensions/loop-protection.ts`, registered in `.pi/settings.json`). It
> blocks repeated identical tool calls, intercepts truncation retries, injects
> corrective context on loops, and auto-compacts huge tool results. Keep tool
> calls SHORT; on an output-token-limit failure NEVER retry the same call —
> change approach or delegate to a subagent.

## 1. Umbrella PR #60 (loop-protection) — DONE ✅

- [x] Validator PASS on head 1d41f797d7 (run 33321770587) after the pasted-output body update + re-trigger commit.
- [x] MERGED 2026-08-30T16:12:44Z, merge commit 87f1109a, tag v2026.242.1612.

## 2. plugin-mise PR — the builder refactor

- [ ] Branch `feat/mise-builder-shared-resolve` in plugin-mise (from origin/main).
- [ ] Commit the dirty tree: `mise_builder.go` (shared `sdk/kit.BuilderResolve` render, distro-agnostic), `mise_builder_test.go`, `charly.yml` (root + candy), `go.mod`/`go.sum`.
- [ ] R10: `go test ./...` in plugin-mise; run the check-mise-* beds fresh rebuild (cachyos, fedora, arch, omarchy, alpine, debian, ubuntu).
- [ ] PR with full body (Summary / How tested with pasted output / Rulebook compliance / Change classification / Assisted-by footer).
- [ ] `gh_pr_status` watch → PASS → auto-merge.

## 3. charly PR — vocabulary improvements + loop-protection mirror

- [ ] Branch `feat/mise-vocabulary-home-shims` in charly (from origin/main).
- [ ] Commit: `charly/charly.yml` (Home-based shims `~/.local/share/mise/shims`, `install_command`, no `cache_mount`), `charly/embed_defaults_test.go`, `charly/go.mod`/`go.sum`, `.pi/settings.json` + `.pi/extensions/loop-protection.ts` (the mirror).
- [ ] R10: `go test ./...` in charly; `charly box validate`.
- [ ] PR with full body; `gh_pr_status` watch → PASS → auto-merge.

## 4. Ubuntu 26.04 LTS test image

- [ ] Add the ubuntu-26.04 builder box (distro vocabulary — NO hard-coded distro names; use the charly distro polymorphism).
- [ ] Add the check-mise-ubuntu-26.04 bed (disposable: true, mirroring the other distro beds).
- [ ] FIX the build-graph ordering defect: the builder box must be built BEFORE the stage that consumes it (the debian/ubuntu beds failed with `unable to copy from source docker://ghcr.io/opencharly/fedora-builder:check-mise-f…`). RCA the build-graph computation (where builder boxes enter the order) and fix in the same PR.
- [ ] R10: check-mise-ubuntu-26.04 bed green on a fresh rebuild.

## 5. Umbrella gitlink sync

- [ ] After plugin-mise + charly PRs land: sync the gitlinks (`task sync`), commit the pointer updates for plugin-mise, charly, sdk (f476722d), spec (90c1b7c7).
- [ ] R10: `task verify` green (submodules clean).
- [ ] PR + validator watch → PASS → auto-merge.

## 6. Docs follow-up (from the mise landing)

- [ ] The docs repo cutover: bump the charly CI pin in `docs/.github/workflows/deploy.yml` + regenerate the content tree (local generation can't resolve the runtime plugin-docs without the docs deploy's clone context).


---

# Progress update (2026-08-30 evening session)

- [x] RCA addendum: the build-graph ordering defect and the alpine `mise: not found` failure share ONE root cause — `BoxNeedsBuilder` not recognizing the mise detection files (plus the glibc release on musl). Both fixed in sdk PR #198.
- [x] All 7 check-mise beds PASS (steps=13) on the final plugin-mise tree; ubuntu-26.04 bed still to add (blocker for item 3's own re-run).