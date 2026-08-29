# Candy De-Submodule Cutover — Plan, Open PRs, Todo

**Status:** `charly/candy/` is EMPTY and the directory is gone (`charly#457`, 2026-08-29).
Last updated 2026-08-29.

**Phase 1 FULLY LANDED (2026-08-25):** all 213 config-only candies moved to standalone repos in batches 2.1-2.8 (umbrella#22/23/24/25 + charly#403/404/405/406 MERGED). Batches 2.1-2.8 all landed; the repo-wide sweep gate (charly/refs_sweep_test.go, landed in charly#405) is the one canonical R10 gate. Junk repo opencharly/heroic-heroic to delete (operator).

## Goal

Move every candy in `@charly/candy/` into its own repo in the `opencharly` org,
add each as a submodule of the umbrella repo, and make sure the charly config
resolves every candy to the new repo name — with zero candies loaded from the
old `candy/` path by accident.

## Naming

- Every candy repo gets a proper kind prefix from the charly kind vocabulary:
  `layer-`, `box-`, `pod-`, `vm-`, `plugin-` (e.g. `layer-ripgrep`,
  `pod-dbus`, `plugin-generate-packages`).
- The `charly` meta-candy is **`layer-charly`**. It no longer stays in the main repo:
  `charly/candy/charly` was the last directory in `candy/`, nothing referenced it by name,
  and the distro boxes pin `layer-charly` instead. What charly kept is its own native-package
  metadata, which is packaging DATA rather than a deployable candy and now lives at
  `packaging/charly.yml` — still published as the `charly-candy-charly.yml` release asset the
  six per-distro package repos consume (`charly#457`).
- `generate-packages` is served by the standalone `plugin-generate-packages`. charly keeps a
  thin re-export **shim** at `tools/generate-packages/` — NOT under `candy/` — because that is
  what makes `charly generate-packages` resolvable from a checkout. It cannot simply be
  deleted: a remote candy ref does not register a command word (measured — a project pinning
  only the plugin exits 80), and making it do so would put a network fetch in CLI startup
  (`charly#455`).

## Standalone candy repo layout

- Manifest (`charly.yml`) at the repo root.
- `.gitmodules` pins `charly` (the repo's own build toolchain).
- Deploy gate: `charly box validate` (the repo's CI).
- Bootstrap, in this order — the first three are NOT optional, each fails differently:
  1. `gh repo create`, then establish `main` through the **contents API** (a README stub).
     Pushing `main` directly is blocked by the pre-push gate and must not be bypassed.
  2. `allow_auto_merge: true` — off by default; without it the validator PASSes and its
     final step dies with GraphQL `Pull request is in unstable status`.
  3. Install the three dispatchers (`deploy`, `pr-validator`, `tag-on-merge`) on `main`
     **via the contents API, before the first PR**. `tag-on-merge` fires on `workflow_run`
     of the validator, and `workflow_run` only fires for workflows already on the default
     branch — so the PR that *installs* the dispatcher can never be tagged by it. Symptom:
     the PR merges, no tag appears, and `tag-on-merge` shows no runs at all. This matters
     because the marketplace refs list pins repos **by tag**.
  4. Apply the org `main branch protection` ruleset (required check `validate / validate`).
  5. Land the content by PR like any other change.

  Repos already merged untagged are backfilled add-only:
  `gh api repos/opencharly/<r>/git/refs -X POST -f ref=refs/tags/v<CalVer> -f sha=<main HEAD>`.

## Remote-ref resolution

Every bare `require:` / `candy:` reference becomes
`@github.com/opencharly/<kind>-<name>:v<tag>`.

Supporting sdk/spec changes (all merged):

- sdk name-derivation from the repo name (`sdk#159`)
- spec `CandyMapKey` guard (`spec#49`)
- `QualifyRemoteSiblingDeps` skips when `SubPathPrefix == ""` (`sdk#161`)
- enqueue leg skips when `SubPathPrefix == ""` (`sdk#161`)
- `CompileLocalPkgStep` skips when the candy's `distro:` repo provides the
  packaged name (`sdk#162`, v0.2026236.813)
- spec pin: pseudo-version `v0.2026232.521-0.20260823190543-d35d15fd2a87`

## The charly meta-candy installs charly from the published distro repos

Declarative `distro:` + `package:` + `repo:` (NOT the baked `copy: bin/charly`,
NOT a curl step). Configured for ALL distros:

- **debian/ubuntu** — apt, suite `stable`, component `main`, key `charly.gpg`
- **fedora** — dnf, baseurl `https://opencharly.github.io/charly-fedora/amd64/`,
  gpgkey `RPM-GPG-KEY-charly` (field is `gpgkey:` — the container template reads
  `{{.gpgkey}}`; the rpm host cell was the gap, see the gotcha below)
- **arch** — pacman, `server: https://opencharly.github.io/charly-arch/amd64/`,
  key `978DFF11A951A830F7ADA2D4062B073E9D1BAE2E`,
  `siglevel: Required DatabaseOptional`
- **alpine** — apk, `url: https://opencharly.github.io/charly-alpine/amd64/`,
  key `charly.rsa.pub` (blocked: the repo publishes the .apk but NO
  APKINDEX.tar.gz — `apk add charly` can't resolve; needs a publishing-repo fix)

Regression test: `TestDistroRepoInstallDeclared` (`charly#388`).

## Phases

### Phase 0 — Pilot (DONE)

`layer-ripgrep` end-to-end. Merged: `sdk#159`, `spec#49`, `umbrella#17` + `#18`,
`distro-arch#23`, `charly#384`, `marketplace#231` (pilot ripple).

### Phase 1 — Config-only candies (~242), in batches

Batch 1 (39 repos, `umbrella#19` MERGED):

- Standalone repos + tags: layer-supervisord/nodejs/golang/ffmpeg/tmux/socat/
  chrome/python/cuda/nvidia/gemini, pod-dbus/pipewire/sway/selkies/chrome-cdp,
  etc. (tags v2026.235.2056–2121).
- Box distro PRs advancing the charly ref + the standalone refs:
  - `distro-arch#24` MERGED, `distro-debian#15` MERGED, `distro-ubuntu#15` MERGED
  - `distro-fedora#36` — in validator (description fix, accounting, R10 evidence)
  - `distro-cachyos#23` — BLOCKED: VM checks need ≥102 GiB build disk (host has
    62G tmpfs; the charly VM builder's default, no in-tree knob); dep fixes are
    in `charly#385` (a different repo this PR can't advance)
- `charly#385` (feat/candy-batch1) — the sequencing blocker: rewrites the
  in-repo candies' deps to the standalone refs + the distro-repo charly candy;
  beds green (check-marketplace, check-pod-overlay, check-docs all steps=13);
  needs the box gitlink advances to fix
  `TestCandySourceDirs_OverrideAnchorsRemoteApk`
- `charly#395` — CLOSED (wrong RCA). It changed `gpgkey:` → `key:` claiming the
  spec rejects `gpgkey`; verified false: `charly box validate` accepts both fields,
  and the container template reads `{{.gpgkey}}` so the rename would have REMOVED
  the key import on the container path. The real bug is the rpm host cell (below).

Batches 2+ — the remaining ~200 config-only candies, same pattern.

### Phase 2 — Plugins (93)

`plugin-*` candies to standalone repos; `generate-packages` merges into
`plugin-generate-packages`. Module paths + proxy + compiled_plugins rework.

#### Mechanism study (2026-08-25, after Phase 1 landed)

The compiled-in plugin wiring is generated by `charly/charly/internal/pluginsgen/main.go`
(260 lines, stdlib + yaml.v3 only, run by `task build:binary` with GOWORK=off):

- Reads `compiled_plugins:` from charly.yml; for each name reads
  `candy/<name>/go.mod` module path + the `plugin:` block + shape (kit vs pb);
- Emits `charly/plugins_generated.go` — imports `github.com/opencharly/charly/candy/<name>`
  and calls `registerCompiledPlugin`/`registerCompiledCheckVerb` per entry;
- Emits the repo-root `go.work` — `use ./charly` + `use ./candy/<name>` per compiled plugin
  (64 `use` lines today), so `go build ./charly` resolves the generated imports through the
  workspace.

Moving plugin candies out therefore requires the MODULE PATH change (imports become
`github.com/opencharly/<plugin>` or a proxy-pinned module) + the go.work/proxy rework
(the `use` directives become `require` pins resolved from the module proxy, like the
sdk/spec contract modules) + compiled_plugins generation reading remote go.mod paths.
That is a real mechanism rework, NOT a ref rewrite — a cutover of its own with RDD
disposable-bed proof (build a binary with one out-of-tree compiled plugin).

TODO for Phase 2:
1. RCA the pluginsgen module-path resolution (read candy/<name>/go.mod today — must
   read the standalone repo's go.mod after the move, or take the module path from the
   candy ref).
2. Decide the plugin module naming (standalone repo `go.mod` `module github.com/opencharly/<kind>-<name>`?).
3. Proxy + go.work: compiled-in plugins resolve as proxy modules (require pins), NOT
   workspace members — mirroring the sdk/spec de-submodule cutover.
4. `generate-packages` → `plugin-generate-packages` merge (plan).
5. RDD bed: build charly with ONE out-of-tree compiled plugin from a standalone repo;
   then the 93-plugin sweep in dependency batches (same scaffolding + umbrella-submodule
   + sweep-gate pattern as Phase 1).



`plugin-*` candies to standalone repos; `generate-packages` merges into
`plugin-generate-packages`. Module paths + proxy + compiled_plugins rework.

### Phase 3 — Generators

Generator candies to standalone repos; ref-driven discovery.

### Phase 4 — Umbrella sync + final gates

- `task sync` + `task verify` green on the final tree.
- Remove the moved candies from the charly repo's `candy/` path (fail-closed
  only works AFTER `charly#385` merges — the pre-#385 charly candy closure
  still references the old paths).
- Sweep every box repo for stale `candy/<moved>` refs (R5 — e.g. fedora's
  tutorial-shell `candy/ripgrep` → `@github.com/opencharly/layer-ripgrep`).

## Open PRs

| Repo | PR | Title | Branch | Status |
|---|---|---|---|---|
| charly | #396 | fix(charly): rpm host cell handles distro repos | feat/rpm-host-repo | MERGED + tagged v2026.236.1711 |
| sdk | #163 | test(buildkit): rpm host cell renders repo setup (regression for check-fedora-vm) | feat/rpm-host-repo-render | MERGED |
| charly | #395 | CLOSED — wrong RCA (gpgkey→key would break the container path; validate accepts both fields) | feat/fedora-key-field | CLOSED |
| charly | #385 | feat: the batch-1 candies move to their standalone kind-prefixed repos | feat/candy-batch1 | OPEN (beds green; sequencing blocker) |
| distro-fedora | #36 | feat: bump layer-cuda to v2026.235.2121 (the nvidia-dep rewrite tag) | feat/candy-batch1-refs | MERGED + tagged v2026.236.1714 (incl. typst->v2026.236.1354 fix) |
| distro-cachyos | #23 | feat: bump layer-cuda to v2026.235.2121 (the nvidia-dep rewrite tag) | feat/candy-batch1-refs | MERGED + tagged v2026.236.2135 |

Merged (recent): charly#384/#386/#388/#389/#391/#392/#393/#396/#400/#401/#402, sdk#159–#165,
spec#49/#50, umbrella#17–#19/#21, distro-arch#23/#24, distro-debian#15,
distro-ubuntu#15, distro-fedora#36, marketplace#231.

## Todo list

- [x] #1 Preflight: skills, universal PR-gate, toolchain
- [x] #2 Create charly worktree off fresh origin/main
- [x] #3 Charly cutover: remove sdk submodule + proxy pin (12-item edit set)
- [x] #4 In-repo gates: go vet/test, build:binary, mods:tidy, canonical
- [x] #5 R7 fresh non-recursive clone build proof
- [x] #6 R5 grep self-test + CHANGELOG + commit + charly PR
- [x] #7 Plugins corpus PR (sdk-submodule claims → proxy reality)
- [x] #8 Umbrella PR: drop sdk from CHARLY_PINNED + policy docs
- [x] #9 Final verification of the landed state
- [x] #10 RDD bed: prove foreign-cwd `charly docs generate` from a scratch docs checkout
- [x] #11 charly cutover PR: de-submodule docs + delete docs tasks/baseline + rework docs:pin + comments
- [x] #12 plugins corpus PR: docs + docs-site skills teach the standalone flow
- [x] #13 docs cutover PR: .gitmodules (charly pin) + deploy.yml rewrite + content regeneration
- [x] #14 umbrella PR: drop docs from CHARLY_PINNED + sync/verify scripts + README
- [x] #15 Final verification + report
- [x] #16 RDD: prove the new generator shape reproduces the corpus + docs no-op
- [x] #17 charly PR: generator --out split + new emissions + cutover + harness rewires
- [x] #18 Rename opencharly/plugins → opencharly/marketplace
- [x] #19 marketplace PR: standalone repo (submodule + deploy.yml + Pages + corpus)
- [x] #20 docs PR: marketplace submodule + --plugins in deploy.yml + content regen iff RDD drift
- [x] #21 umbrella PR: de-submodule plugins + policy B + harness rewires
- [x] #22 Final: post-landing R10 bed + pin syncs + org-wide verify + memory
- [x] #24 Research the candy resolution mechanism (bare-name fallback, require-edge walk, remote refs)
- [x] #25 Build the candy-repo scaffold tooling
- [x] #26 Phase 0 — the ripgrep pilot end-to-end
- [x] #27 Phase 1 — the config-only candies (~242) in dependency-layer batches — **FULLY LANDED (2026-08-25): batches 2.1-2.8 all MERGED (umbrella#22/23/24/25 + charly#403/404/405/406); 220 repos scaffolded + public + tagged; the repo-wide sweep (charly/refs_sweep_test.go) is the gate; the check-* fixtures stay in-repo pending the fleet-add remote-candy gap**
- [ ] #28 Phase 2 — the plugin candies (93): module paths + proxy + compiled_plugins rework
- [ ] #29 Phase 3 — the generators' ref-driven discovery
- [ ] #30 Phase 4 — the umbrella sync + final gates
- [ ] #31 Land charly#391 (fedora URL fix) + the charly-alpine APKINDEX publishing fix — **IN PROGRESS** (charly#391 merged; alpine APKINDEX pending)

## Key mechanisms / gotchas

- **vm deploy provider** (`plugin-deploy-vm`) auto-injects ONLY in a submodule
  context (inside the umbrella superproject — `SelfSuperprojectOverridePair`);
  a standalone checkout skips it → the vm checks must run from the umbrella's
  `distro-<name>` submodule.
- **Warning allowlist** (`charly#392`): `update-rc-d-chroot-fallback` — the
  debootstrap chroot `update-rc.d` warning (scoped regex + boundary test,
  Why ≥ 80 chars).
- **typst per-distro package names** (`charly#393`): `xz-utils` is deb-family;
  fedora/arch/alpine use `xz`; `curl` global.
- **fedora repo URL** (`charly#391`): repodata is at `amd64/repodata/repomd.xml`
  (200); `repo/amd64/` 404s.
- **rpm host cell missing repo handling** (the real check-fedora-vm blocker): the
  rpm `phase.install.host` cell in `charly/charly.yml` was bare `dnf install -y ...`
  — no .repo write, no key import, no `--enable-repo` — so a candy's `distro:` repo
  was never added on the host/VM venue (`No match for argument: charly`). The
  container cell and the deb host cell both handle repos; the rpm host cell was the
  gap. Fix: mirror the container cell's repo handling into the host cell (write
  `.repo` with `gpgkey=`, `rpm --import {{.gpgkey}}`, `--enable-repo=<name>`). Keep
  `gpgkey:` as the field name — the container template reads `{{.gpgkey}}`.
  Render test lives in the SDK repo (`buildkit/render_test.go`, literal host-cell
  fixture) because `charly/` core must not import `sdk` (import-purity gate).
- **Alpine APKINDEX gap**: `opencharly/charly-alpine` must generate
  APKINDEX.tar.gz for `apk add charly` to resolve.
- **Package-list entries** (`distro: package:`, packaging `depends:`/
  `recommends:`/etc.) are package names, NOT candy refs — never rewrite them.
- **The out-of-process plugin builds** resolve their OWN go.mod's sdk/spec pins
  — the plugin-loader/plugin-build/plugin-deploy-pod go.mods need the bumps
  separately from the charly module's MVS require.
- **R3: ONE unified phase.install body per format** (spec#50 + sdk#165 + charly#402):
  the pac/rpm host cells had drifted bare (repos never added on the host/VM
  venue — the #396/#401 bug class). The install body is now ONE venue-agnostic
  template per format; `spec.FormatPhaseTemplate` wraps it per venue (RUN
  {{cacheMounts}} for container, verbatim for host). Key handling is
  deterministic: an http(s) repo key is a published key FILE fetched via curl +
  pacman-key --add / rpm --import (no keyserver dependency — the VM guest
  couldn't reach keyservers). The host/container cells are deleted (R5).
- The override worktree must keep the moved candies until `charly#385`
  merges (the pre-#385 charly candy closure references the old paths);
  fail-closed only works post-#385.

## PR body requirements (every PR)

1. `## Summary` — what changed and why
2. `## How tested` — pasted command + output for every verification step
3. `## Rulebook compliance` — table with every applicable umbrella rule
4. `## Change Classification` — change class, verification gate, attribution tier
5. The PR body IS the changelog (tag-on-merge writes it at merge time)
6. `*Assisted-by: <Harness> <Provider Full Model Name> (<confidence>)*` — last line

Attribution tiers: `fully tested and validated` (task verify passed on the
final tree), `analysed on a live system` (changed runtime path ran live, full
gate did not pass), `documentation reviewed`, `syntax check only` (never
commit), `theoretical suggestion` (never ship).

## Phase-4 landing status (2026-08-27)

**DONE:**
- charly#409 (Phase-4 cutover) MERGED + tagged
- 5 distro box sweeps: cachyos#25, fedora#37, debian#16, ubuntu#16 MERGED; **arch#25 OPEN** (see residual)
- Residue sweep (66 repos: 42 initial + 24 org-wide + plugin-* class): 51 MERGED, 10 CLOSED (false positives / already-fixed no-ops), 0 open
- Umbrella#27 (gitlink sync, policy B) MERGED 2026-08-27
- .github#76 (tag-on-merge subdir module tag) MERGED
- All 322 candy repos: allow_auto_merge=true (scaffold defect fixed)
- Authorization-comment discipline for T3/T4 (validator) established

**RESIDUAL — distro-arch#25 (in progress, 2026-08-27 late):** the sweep advances charly → `v2026.238.1242` (the package-only candy — the `copy: bin/charly` step is GONE, verified in the fetched candy). The 4 previously-failing boxes (arch-coder, charly-arch, check-agent-box, cuda-arch-builder) now fail at a NEW point: the generated Containerfile's `ARG BASE_IMAGE=ghcr.io/opencharly/arch-layer-gnupg:2026.239.1453` — an image NEVER published to ghcr (NAME_UNKNOWN on both anonymous and authenticated pulls). The buildah nil-pointer panic in `intermediateImageExists` is the symptom of pulling a non-existent base. Whether the merged distro sweeps (cachyos/fedora/debian/ubuntu) share the same ghcr `<project>-<candy>` base pattern and how their images resolve is under RCA (subagent 52687a1d); the likely fix is either a publish step for the arch base layers or a resolver fix for the localhost fallback. Validator continues to demand fresh rebuilds of the 4 boxes + R8 label evidence; the honest evidence shape is the base-reproduction (main==swept for the environment failure) + named batch `feat/box-build-race` routing, plus the newly-discovered unpublishd-base root cause.

**Carry-overs (unchanged):** heroic-heroic junk repo (operator delete), fleet-add remote-candy gap, alpine APKINDEX final green-run confirmation.

**In flight (2026-08-27):** layer-supervisord consumer syncs — distro-cachyos#26, distro-fedora#38, pod-pipewire#2 ALL MERGED. The stray-charly-submodule scaffold defect (324 repos) is being removed org-wide: layer-pre-commit#2 MERGED (tag v2026.239.1552, clean tree); 321-repo batch 321/321 PRs created, ~243+ merged via auto-merge; docs#102 + marketplace#232 OPEN (generator-based, recursive CI-time clone). **charly#410 MERGED 20:38Z** (candy split + substrate refs + layer-supervisord refs + sdk v0.2026239.1643 + plugin-check v0.2026239.2017). **sdk#171 MERGED** (multi-root materializeBuildConfigAsset — the REAL arch#25 box-build blocker). **plugin-check#2 MERGED** (pacman pacnew allowance; fresh bed run reports allowlisted=4 zero warnings). distro-arch#25 residual: the 4 boxes build past the header stage with the sdk fix; the residual stop is the GPG-signing-key absence for the charly-arch package repo (routed to feat/box-build-race); the sweep also needs the layer-supervisord ref advance (v2026.235.2056→v2026.239.1300) applied locally in the sweep worktree.

## Phase-4 landing status update (2026-08-28)

**DONE (this session):**
- **marketplace#232 FIXED + PUSHED** (commit 1de7033, branch feat/remove-charly-submodule):
  - Root cause: the de-submodule cutover left deploy.yml's `--root .` pointing at the post-cutover charly checkout (14 candy dirs, no marketplace entity) → `charly marketplace generate` exited 1 "no marketplace entity found". The OLD workflow used the pre-cutover charly submodule (c35813d9, 335 candy dirs with all entities).
  - Fix: the marketplace repo carries `candy/charly-marketplace/charly.yml` — the corpus SOURCE referencing pod-charly-hooks (the single `marketplace:` entity + hooks) + every standalone candy repo via @github refs (170 refs). deploy.yml: clone charly at v2026.238.1242, COPY the marketplace's candy/charly-marketplace/charly.yml OVER the charly checkout's copy, then `charly marketplace generate --root /tmp/charly --out ${{ github.workspace }}`. Key insight: --root must be the CHARLY CHECKOUT (its candy/ dirs own the in-repo skill entities charly-build/charly-check etc.), NOT the marketplace repo. The charly ref `@github.com/opencharly/charly` is SKIPPED by candywalk collectRefs (RepoPath == github.com/opencharly/charly), so plugin repos need the `/candy/<name>` subpath form (e.g. plugin-agentteams/candy/plugin-agentteams:v...).
  - R10: generate writes 406 artifacts across 26 families (matches committed corpus); drift gate PASS (zero diff). Body rewritten with real diff stat (52 files/1220+/109-), R6 evidence, fully-tested-and-validated.
- **docs#102 FIXED + PUSHED** (commit 5c38b33, branch feat/remove-charly-submodule):
  - Root cause: the post-cutover tag v2026.238.1242 cannot generate the docs site — candy/plugin-docs moved to a standalone repo (exit 80 "unexpected argument docs"), and the committed content's links to in-repo candy pages (sshd, fleet, plugin-example) resolve to nothing at that tag.
  - Fix: pin the CI-time charly clone at 5716706651 (the SAME commit the removed submodule recorded — pre-cutover, candy/plugin-docs in-repo). Fix submodule init order: clone WITHOUT --recursive, checkout the pinned commit, THEN `git submodule update --init --recursive` (--recursive at clone pulls box/* at default-branch HEAD, not the pinned commits the content was generated against).
  - R10: generate writes 911 pages; drift gate exit 0 zero diff. Body rewritten with real diff stat (3 files/26+/18-).
- **78/78 batch submodule-removal PR bodies fixed** (stale diff stat 8+→9+/11- + R6 git-status evidence) + **validators re-triggered** (76 via `gh run rerun --failed`, 2 via empty-commit push for layer-nvidia/layer-ripgrep whose checks never ran).

**RESIDUAL — distro-arch#25 (still BLOCKED):** validator demands fresh rebuilds of arch-coder/charly-arch/check-agent-box/cuda-arch-builder + root add_candy beds at ZERO warnings (install-time coverage: only 8/51 refs have clean-install proof) + R8 label/Containerfile verification. The GPG-signing-key absence for the charly-arch package repo (routed to feat/box-build-race, which has NO open PR yet) blocks the builds. Rebuild evidence worker in flight (2026-08-28).

**Carry-overs (unchanged):** heroic-heroic junk repo (operator delete), fleet-add remote-candy gap, alpine APKINDEX final green-run confirmation.

## FINAL LANDING STATUS (2026-08-28, all goals reached)

**ALL OPEN PRs LANDED — zero open across charly/sdk/spec/docs/marketplace/distro-arch/plugin-fleet:**
- **distro-arch#25 MERGED** — the Phase-4 residue sweep (10 boxes, +56/−56). Validator PASSED on the 10-box fresh-rebuild table (arch-coder 0516, check-agent-box 0534, charly-arch 0537, cuda-arch-builder 0150, arch-builder 0604, arch-pacstrap-builder 0605, arch-test 0606, check-tmux-box 0607, vscode-test 0608) + the check-arch-vm bed run (deploy-add PASS, 18/19 — the residual teardown failure routed to the named batch charly#412).
- **docs#102 MERGED** — generator-based deploy.yml (CI-time charly clone pinned at 5716706651, checkout-then-init submodule order); drift gate exit 0 (911 pages).
- **marketplace#232 MERGED** — candy/charly-marketplace/charly.yml corpus source + deploy.yml --root at the charly checkout + mkdir -p fix + stale heroic-heroic ref dropped (corpus byte-identical) + ADE plan on the new candy + umbrella gate hooks; drift gate exit 0 (406 artifacts / 26 families).
- **plugin-fleet#4 MERGED + TAGGED v2026.240.0756** — the bare-remote-candy-ref classification fix (preferKind threaded into resolveRemoteRef); proven live on the check-arch-vm bed deploy-add step.
- **charly#412 MERGED + TAGGED v2026.240.0759** — tailscale moved from hard depends to optdepends (arch) / suggests (rpm, apk); teardown proven live in both directions (disposable Arch container: pacman -R tailscale succeeds with the fix, fails with the old package).
- **charly#413 MERGED + TAGGED v2026.240.0831** — plugin-fleet go.mod bump to v0.2026240.756.
- **distro-arch#27 MERGED** — charly refs advanced to v2026.240.0759 in arch-coder/charly-arch/check-agent-box; all 3 boxes fresh-rebuilt at zero charly warnings (0811/0812/0815) + teardown proven live with the exact v2026.240.0759 package.
- **Alpine APKINDEX RESOLVED** — charly-alpine Pages site live (HTTP 200), APKINDEX.tar.gz reachable (200 gzip), install-test passed (apk add charly + version + doctor).

**Carry-overs (unchanged):** heroic-heroic junk repo (operator delete — token lacks delete_repo/admin). The fleet-add remote-candy gap is FULLY RESOLVED by plugin-fleet#4 (--add-candy bare-ref path, v2026.240.0756) + plugin-fleet#5 (remote PRIMARY layer-* ref path, v2026.240.0909 — preferKind + layer-* classification, proven live with real non-dry-run fleet add + negative control); the alpine APKINDEX is RESOLVED (Pages live, install-test passed). The 3 check-* fixtures (charly-check, check-local-layer, check-stack-layer) can now advance to standalone repos — the refs_sweep_test.go exemption (line 208) can be removed once layer-charly-check / layer-check-local-layer / layer-check-stack-layer repos are scaffolded (follow-on).
