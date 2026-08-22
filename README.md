# OpenCharly — umbrella

**One clone of the whole org.** `opencharly/opencharly` is an org-level umbrella repo:
every OpenCharly repo is pinned here as a git submodule ("gitlink", in the org's
vocabulary), flat at the root — submodule path == repo name. `charly` is the product
repo and the single source of truth; this umbrella is a *view* of the org, not a new
home for anything.

```
git clone --recurse-submodules https://github.com/opencharly/opencharly.git
```

All submodule URLs are plain HTTPS, so **forks work without extra configuration**:
every gitlink resolves to its `opencharly/<repo>` upstream over HTTPS, no credentials
needed for a read-only checkout.

## The org map

| path | repo | role |
|---|---|---|
| `charly/` | [opencharly/charly](https://github.com/opencharly/charly) | the CLI + core — itself a superrepo (nested gitlinks for sdk/spec/plugins/docs/box/*) |
| `sdk/` | [opencharly/sdk](https://github.com/opencharly/sdk) | plugin SDK + contract |
| `spec/` | [opencharly/spec](https://github.com/opencharly/spec) | wire/IR contract (CUE → proto) |
| `plugins/` | [opencharly/plugins](https://github.com/opencharly/plugins) | skills, agents, workflows |
| `docs/` | [opencharly/docs](https://github.com/opencharly/docs) | the opencharly.ai site |
| `distro-arch/` | [opencharly/distro-arch](https://github.com/opencharly/distro-arch) | Arch image family (charly's `box/arch`) |
| `distro-cachyos/` | [opencharly/distro-cachyos](https://github.com/opencharly/distro-cachyos) | CachyOS image family (`box/cachyos`) |
| `distro-debian/` | [opencharly/distro-debian](https://github.com/opencharly/distro-debian) | Debian image family (`box/debian`) |
| `distro-fedora/` | [opencharly/distro-fedora](https://github.com/opencharly/distro-fedora) | Fedora image family incl. nvidia GPU base (`box/fedora`) |
| `distro-ubuntu/` | [opencharly/distro-ubuntu](https://github.com/opencharly/distro-ubuntu) | Ubuntu image family (`box/ubuntu`) |
| `charly-alpine/` | [opencharly/charly-alpine](https://github.com/opencharly/charly-alpine) | `apk` package repo |
| `charly-arch/` | [opencharly/charly-arch](https://github.com/opencharly/charly-arch) | `pacman` package repo |
| `charly-debian/` | [opencharly/charly-debian](https://github.com/opencharly/charly-debian) | `apt` package repo |
| `charly-fedora/` | [opencharly/charly-fedora](https://github.com/opencharly/charly-fedora) | `dnf` package repo |
| `charly-openwrt/` | [opencharly/charly-openwrt](https://github.com/opencharly/charly-openwrt) | `opkg` package repo |
| `charly-ubuntu/` | [opencharly/charly-ubuntu](https://github.com/opencharly/charly-ubuntu) | `apt` package repo |
| `pkg-arch/` | [opencharly/pkg-arch](https://github.com/opencharly/pkg-arch) | legacy packaging (nFPM cutover in progress) |
| `pkg-debian/` | [opencharly/pkg-debian](https://github.com/opencharly/pkg-debian) | legacy packaging |
| `pkg-fedora/` | [opencharly/pkg-fedora](https://github.com/opencharly/pkg-fedora) | legacy RPM packaging |
| `plugin-generate-packages/` | [opencharly/plugin-generate-packages](https://github.com/opencharly/plugin-generate-packages) | nFPM packaging plugin |
| `pi-review-action/` | [opencharly/pi-review-action](https://github.com/opencharly/pi-review-action) | org-wide PR-review GitHub Action |
| `pixelflux/` | [opencharly/pixelflux](https://github.com/opencharly/pixelflux) | patched wl-screenshot lib for selkies desktops — **default branch `av1`** |

Not a submodule: [opencharly/.github](https://github.com/opencharly/.github) — the
org-wide community-health defaults. Every org repo inherits them automatically, and
this repo needs its own `.github/workflows/` for CI, so the `.github` path is not
occupied by a submodule.

## Pinning — the umbrella tracks charly's graph

Every submodule is pinned to a specific commit (a gitlink). The policy (`policy B`):

1. `charly` → its own default-branch HEAD (`main`).
2. `sdk`, `spec`, `plugins`, `docs`, `distro-*` → **exactly the commits charly's own
   gitlinks pin** (charly's `box/<distro>` maps to `distro-<distro>` here). The umbrella
   therefore means *"the org exactly as charly sees it"* — one coherent snapshot, never
   two versions of sdk/spec visible.
3. Everything else (`charly-*`, `pkg-*`, `plugin-generate-packages`,
   `pi-review-action`, `pixelflux`) → its own default-branch HEAD (`av1` for
   `pixelflux`).

`.gitmodules` carries `branch = <repo default>` on every entry; nothing ever assumes
`main` — defaults are resolved via `git ls-remote --symref`, so a future default-branch
rename keeps working.

The daily `sync` workflow runs `scripts/sync-gitlinks.sh`, opens a `chore: sync
gitlinks` PR when anything moved, and the `auto-merge` workflow merges it when
`verify` passes — same discipline as charly. `verify.yml` runs on every push/PR and
enforces the three invariants (branch == real default, pins reachable + clean, policy B
equality).

## House rules

- **Never edit inside a submodule.** Changes land via PR to the owning repo; this repo
  only bumps gitlinks.
- **Git ops on submodules go through `git -C <path>`** — never root a worker in a
  submodule.
- **No `go.work` at the umbrella root.** `charly/` has its own workspace spanning
  `sdk/` + `spec/`; Go forbids nested workspace files. All Go work happens inside
  `charly/`.
- **Pin only merged refs** — never a PR branch. `verify` fails on dangling pins.
- Read each subrepo's own `README.md` / `AGENTS.md` before editing inside it.

## AI & harness parity

This repo runs the same agent harness config and discipline as `charly/` — pi
(`.pi/`, same packages + `umbrella-gates.ts`), Claude Code (`.claude/`), opencode
(`opencode.json`), reasonix (`reasonix.toml`), and skills (`.agents/skills/` links
into the `plugins/` submodule). See `HARNESS-PARITY.md` for the full map.
`AGENTS.md`/`CLAUDE.md` own the umbrella rulebook; `charly/AGENTS.md` owns charly's.
Shared gate scripts are diff-checked by `scripts/check-harness-parity.sh`.

## Helpers

```
task map      # list every submodule with its pin and sync state
task sync     # run scripts/sync-gitlinks.sh (preview a pin bump)
task verify   # run scripts/verify-pins.sh (the CI gate, locally)
task harness  # run scripts/check-harness-parity.sh (harness config vs charly/)
```

`--depth 1` keeps the clone light (~50 MB of working trees):

```
git clone --recurse-submodules --depth 1 https://github.com/opencharly/opencharly.git
```

## License

MIT — see [LICENSE](LICENSE). Each submodule is governed by its own repository's
license.
