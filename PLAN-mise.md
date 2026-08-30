# Full mise support in charly — implementation plan

**Status:** Draft for review · **Owner:** TBD · **Scope:** new plugin repo + spec/sdk vocabulary + layer candy + beds

## 1. Goal

Make [mise](https://github.com/jdx/mise) (the polyglot dev-tool version manager: tools, tasks, env, shims — asdf-compatible, Rust) a first-class citizen of charly, on the same footing as the existing pixi/npm/cargo/aur builders:

1. **A charly mise plugin** — a standalone out-of-tree plugin repo serving `builder:mise`, `verb:mise`, and (phase 2) `command:mise`, with its own self-contained CUE schema.
2. **mise as a builder** — a candy can install mise-managed tools at image build via a multi-stage build, selected by `external_builder: mise` and (phase 3) auto-detected from a `mise.toml` / `.tool-versions` file in the candy dir, exactly like `pixi.toml` triggers the pixi builder.
3. **mise in the image** — a layer candy that installs the mise binary + shims + activation so images can run `mise run` tasks and `mise x` at runtime.
4. **mise as a plan-step verb** — candies can run mise commands at build/check time via a `mise:` step.

## 2. Background (verified facts)

### 2.1 The charly plugin model (from /charly-internals:plugin + the corpus)

- A **plugin is a candy** with a `plugin:` block: `providers: [<class>:<word>]`, `source: github.com/opencharly/<repo>/candy/<name>`, optional `primary:` scalar-sugar, and a self-contained `schema/*.cue` input def. Classes: kind/verb/deploy/step/builder/command/build.
- **Placement is free**: the same provider compiles into `charly` (builtin, `compiled_plugins:` — currently 48) or serves out-of-process over go-plugin gRPC (external). The strategic direction is external; author placement-agnostic.
- **Builder class**: an external builder plugin is a standalone Go module (`go.mod` requiring `github.com/opencharly/sdk` + `github.com/opencharly/spec`, `plugin.go`, `cmd/serve/main.go`, `schema/<word>.cue`). `NewMeta()` advertises `sdk.ProvidedCapability{Class: "builder", Word: <word>, InputDef: "#<Word>Input"}`; `Invoke` handles the build-time `OpResolve` ("resolve") and returns `spec.BuilderResolveReply{Stage, CopyArtifacts, CopyBinary, InlineFragment}` — the `FROM … AS <stage>` block is spliced pre-main-FROM, the `COPY --from=<stage>` artifacts post-main-FROM. The host marshals the requesting candy name as `op.Params` and a `spec.BuildEnv` (with `Distros`) as `op.Env`. Reference: `plugin-example-builder` (builder:examplebuilder, consumed via `external_builder: examplebuilder`).
- **Selection**: custom builders via `external_builder: <word>` on a candy; the four detection builders (pixi/npm/cargo/aur) are external plugins selected by detection FILES via `spec.ExternalizedBuilders` (word set) + `spec.ExternalBuilderPluginRef(word)` (word → plugin candy ref) + `deploykit.DetectExternalizedBuilders` (host pre-pass). Their stage templates live in `sdk/kit/builder_resolve.go` (`kit.BuilderResolve`), deploy-time legs in `sdk/kit/builder.go` (`BuilderCollectContext` / `BuilderReverse`).
- **Verb class**: `verb:<word>` with `primary: {<word>: <field>}` sugar; a `run:` step carrying `<word>: <input>` dispatches to the provider — at build time `OpEmit` returns a Containerfile fragment (spliced verbatim, egress-validated); at deploy/check time `OpExecute`. References: `plugin-cdp`, `plugin-http`.
- **Marketplace registration**: the corpus is registered in `marketplace/candy/charly-marketplace/charly.yml` via `@github.com/opencharly/<repo>:vTAG` refs; `charly docs generate` renders one opencharly.ai page per plugin from the `providers` list + `schema/*.cue` + `description:`.
- **sdk pin**: charly currently requires `github.com/opencharly/sdk v0.2026241.2111` (proxy-resolved contract module, no submodule).

### 2.2 mise surface (from mise.jdx.dev, verified 2026-08-30)

- **Config**: hierarchical `mise.toml` (project) + `~/.config/mise/config.toml` (global) + `/etc/mise/config.toml` (system); asdf-compatible `.tool-versions`; sections `[tools]`, `[env]`, `[tasks]`, `[settings]`, `[plugins]`, `[tool_alias]`, `[shell_alias]`, `[vars]`, `[tool_config]` (locked), `min_version`, `monorepo_root`; JSON schema published at `mise.jdx.dev/schema/mise.json`.
- **Tools**: `mise use/install/ls/ls-remote/outdated/upgrade/unuse/prune/cache/exec/x`; backends: asdf plugins (default) + native cargo/npm/pip/go/ubi/vfox/aqua/dotnet/gem; scopes `ref:`/`prefix:`/`path:`/`sub-:`; idiomatic version files (.node-version, .python-version, …); lockfile `mise.lock` + `[tool_config] locked = true`.
- **Tasks**: `[tasks.*]` in mise.toml, `mise run <task>`, `mise tasks ls`, dependencies, watchers, monorepo tasks.
- **Env**: `[env]` section, `mise env` (prints resolved env), `mise activate` (shell hook), `mise shims` (shim dir), `mise direnv`.
- **Docker/CI**: `MISE_DATA_DIR` relocation, `mise install` + `mise x`/shims in images, `mise trust`, `mise doctor`, `mise generate` (completions/hooks). Official Docker cookbook exists.

## 3. Architecture — the four surfaces

| Surface | Class | Word | Serves | Selected by |
|---|---|---|---|---|
| Builder | `builder` | `mise` | Multi-stage tool install at image build (OpResolve) | `external_builder: mise` (P1); detection from `mise.toml`/`.tool-versions` (P3) |
| Verb | `verb` | `mise` | `mise:` plan-step (OpEmit at build, OpExecute at check/deploy) | `mise: <input>` step sugar |
| Command | `command` | `mise` | `charly mise …` CLI (P2) | CLI invocation |
| Layer | — (candy) | `mise` | mise binary + shims + activation in the image | `add_candy: [mise]` / package list |

All four live in ONE new repo `opencharly/plugin-mise` (builder + verb + command as one importable module, like plugin-cdp serves one verb; the layer candy can live in the same repo's `candy/mise` or a distro repo — see §8).

## 4. Deliverable 1 — `opencharly/plugin-mise` (the plugin)

Repo layout (mirrors `plugin-example-builder` / `plugin-cdp`):

```
plugin-mise/
  candy/plugin-mise/
    charly.yml            # plugin: block + ADE plan
    go.mod                # requires opencharly/sdk + opencharly/spec
    plugin.go             # NewProvider() + NewMeta()
    provider.go           # Invoke dispatch: OpResolve (builder) / OpEmit+OpExecute (verb) / OpRun (command)
    mise_builder.go       # builder:mise OpResolve → spec.BuilderResolveReply
    mise_verb.go          # verb:mise OpEmit/OpExecute
    cmd/serve/main.go     # sdk.Serve(NewProvider(), NewMeta())
    schema/mise.cue       # #MiseInput (self-contained; no base def)
    schema/cue_types_gen.go  # generated by task cue:gen (gengotypes)
```

`charly.yml` skeleton:

```yaml
plugin-mise:
  candy:
    version: <calver>
    description: |-
      The mise builder + verb plugin: installs mise-managed dev tools into images
      via a multi-stage build (builder:mise), runs mise commands as plan steps
      (verb:mise), and (P2) a `charly mise` CLI (command:mise).
    plugin:
      providers:
        - builder:mise
        - verb:mise
        - command:mise          # P2
      source: github.com/opencharly/plugin-mise/candy/plugin-mise
      primary:
        mise: command           # verb sugar: `mise: install node@22` == {command: install, args: [node@22]}
    plan:
      - check: the out-of-tree mise plugin ships a buildable Go module the host builds + serves out-of-process
        id: mise-module-present
        context: [build]
        command: "true"
      - check: the mise verb dispatches through the provider registry
        id: mise-verb-dispatches
        mise: { command: version }
        context: [runtime]
```

`schema/mise.cue` (self-contained, mirrors `#CdpInput`):

```cue
#MiseInput: {
  command: "install" | "use" | "run" | "exec" | "x" | "env" | "ls" | "doctor" | "version" | "shims" | "reshim" | "trust" | string
  args?: [...string]
  tool?: string            // shorthand for `mise use <tool>` / `mise install <tool>`
  task?: string            // shorthand for `mise run <task>`
  config?: string          // path to mise.toml/.tool-versions to copy into the stage (builder)
  tools?: { [string]: string }  // inline [tools] map (builder; P4 optional)
  env?: { [string]: string }    // inline [env] map (builder; P4 optional)
  run_as?: string
}
```

## 5. Deliverable 2 — mise as a builder (the core)

### 5.1 Selection

```yaml
# candy/<name>/charly.yml
<name>:
  candy:
    external_builder: mise
    # the candy dir ships mise.toml (or .tool-versions) — copied into the stage
```

The generator resolves `builder:mise` (plugin_loader.go collects `candy.GetExternalBuilder()`), connects the plugin out-of-process, and Invokes `OpResolve` with the candy name as `op.Params` + `spec.BuildEnv` as `op.Env`.

### 5.2 OpResolve → BuilderResolveReply

The plugin renders (from `BuilderResolveInput`-shaped params: builder ref, stage name, UID/GID/Home, CopySrc, manifest name, cache mounts):

```
# Stage (spliced pre-main-FROM)
FROM <mise-enabled-base> AS mise-build
USER <UID>
WORKDIR <Home>
ENV MISE_DATA_DIR=/mise MISE_YES=1
COPY --chown=<UID>:<GID> <CopySrc>/mise.toml mise.toml        # or .tool-versions
RUN <cache-mounts> mise install && mise reshim && cp -a /mise/. /mise-out/

# CopyArtifacts (spliced post-main-FROM)
COPY --from=mise-build /mise-out/ /usr/local/share/mise/

# InlineFragment (env + shims into the final image)
ENV MISE_DATA_DIR=/usr/local/share/mise
ENV PATH=/usr/local/share/mise/shims:$PATH
```

Design decisions to lock in §11:
- **Base**: either a distro image with mise preinstalled (the §7 layer candy as a builder ref) or the stage installs mise itself (`curl https://mise.run | sh` or a pinned release tarball via `download:`-style fetch). Prefer the pinned-release tarball (reproducible, no curl-pipe). **VALIDATED**: the asset is `mise-v<ver>-linux-x64.tar.gz` (Go-style `x64`, NOT `x86_64` — the layer candy must map `${BUILD_ARCH}`: x86_64→x64, aarch64→arm64); the tarball nests under `mise/` so `strip_components: 1` is required.
- **Artifacts**: copy the whole `MISE_DATA_DIR` (installs + shims) — simplest and matches mise's own Docker cookbook; shims make every tool available on PATH without `mise activate`. **VALIDATED**: `/mise` layout is `downloads/installs/migrations/shims`; `mise reshim` creates shims (node/npm/npx/corepack). **CRITICAL**: shims resolve versions ONLY from a config file — the builder must ALSO copy the candy's config into the image at `/etc/mise/config.toml` (the system-config path; `/etc/mise.toml` is NOT recognized). Verified end-to-end: fresh container with copied `MISE_DATA_DIR` + `/etc/mise/config.toml` → `node --version` = v22.23.2, `npm --version` = 10.9.8.
- **Caching**: `MISE_DATA_DIR` on a BuildKit cache mount owned by the user (mise installs as user), with the sentinel pattern from the android-SDK example (`/mise/.charly-complete` written only after a fully-successful `mise install`), then `cp -a` into the stage output. v1 may skip the cache mount and rely on BuildKit stage-layer caching.
- **Env**: optionally emit `mise env` output as ENV lines in the InlineFragment (for `[env]`-declared vars). v1: PATH + MISE_DATA_DIR only. **VALIDATED**: `mise env` emits `export PATH='…/shims:…'` lines; `mise x <tool> -- <cmd>` requires the `--` separator (`mise x node --version` is a mise-arg parse error).

### 5.3 Deploy-time legs (P3, with detection)

When mise becomes a detection builder, add the deploy-time shim to the plugin (mirroring `kit.BuilderCollectContext`/`BuilderReverse`): `OpCollectContext` (per-candy stage-context keys — the tool list from mise.toml) and `OpReverse` (teardown ops — `mise uninstall` per tool, or a `mise-prune` reverse op). Until then, `external_builder:` selection needs no deploy-time legs (the examplebuilder proves the build-only path).

## 6. Deliverable 3 — detection integration (spec + sdk changes, P3)

To make `mise.toml` / `.tool-versions` in a candy dir auto-trigger the builder (like `pixi.toml`):

1. **charly** — the EMBEDDED builder vocabulary (`charly/charly/charly.yml`, compiled into the binary): add a `mise:` builder entry with `detect_file: [mise.toml, .tool-versions]`, `cache_mount`, `path_contribution`, `runtime_env`, `phase.install.host` — mirroring the pixi entry (charly.yml:314-328). **VALIDATED**: the four detection builders' `detect_file` entries live HERE (cargo/npm/pixi at charly.yml:284-328), read by `deploykit.CandyNeedsBuilder` via `img.BuilderConfig` — no sdk change needed.
2. **spec** — the Go maps in `spec/externalized_builders.go` (NOT CUE): add `"mise": true` to `ExternalizedBuilders` and `"mise": "candy/plugin-mise"` to `externalBuilderPlugins` (feeds `ExternalBuilderPluginRef` → `@github.com/opencharly/plugin-mise/candy/plugin-mise`).
3. **charly project closure** — pin the plugin in the `add_candy:` closure (like the four detection builders at charly.yml:465-468) so the connect path vendors it by tag.
2. **sdk** (only if the shared-template route is chosen): add a `miseStageTemplate` to `kit/builder_resolve.go` + `BuilderCollectContext`/`BuilderReverse` arms in `kit/builder.go`. **Alternative (preferred, R3): the plugin renders its own stage from the host-computed `BuilderResolveInput`** — the sdk stays untouched and mise logic lives in the mise plugin. Decide in §11.
3. **charly**: no core change expected — the host pre-pass already invokes the plugin's OpResolve for any word in `ExternalizedBuilders`.

## 7. Deliverable 4 — the mise layer candy (mise in the image)

A layer candy (in `plugin-mise`'s repo as `candy/mise`, or a distro repo) that installs the mise binary + shims so images can use mise at runtime:

```yaml
mise:
  candy:
    version: <calver>
    description: Installs the mise dev-tool manager (binary + shims + activation) into the image.
    var:
      MISE_VERSION: v2025.x.y        # pinned release
    plan:
      - run: install the mise release binary
        download: "https://github.com/jdx/mise/releases/download/${MISE_VERSION}/mise-${MISE_VERSION}-linux-${BUILD_ARCH}.tar.gz"
        extract: tar.gz
        to: /usr/local
        strip_components: 1          # tarball nests under mise-<ver>-linux-<arch>/
        run_as: root
      - run: create the shims dir and put it on PATH
        mkdir: /usr/local/share/mise/shims
        run_as: root
      - run: write the mise env profile drop-in
        write: /etc/profile.d/mise.sh
        content: |
          export MISE_DATA_DIR=/usr/local/share/mise
          export PATH="/usr/local/share/mise/shims:$PATH"
        run_as: root
    plan:
      - check: mise is on PATH and reports its version
        mise: { command: version }
        context: [runtime]
```

(Follows the canonical `/charly-coder:uv` download+extract pattern; `strip_components: 1` handles the nested tarball dir.)

## 8. Deliverable 5 — marketplace + docs registration

- Add `@github.com/opencharly/plugin-mise:v<tag>` to `marketplace/candy/charly-marketplace/charly.yml` (the corpus source).
- `charly docs generate` renders the plugin's opencharly.ai page from the `providers` list + `schema/mise.cue` + `description:` — regenerate + commit the docs page (docs repo PR) in the same batch (the projection model, /charly-build:docs).
- No `compiled_plugins:` change — the plugin is external by design (boundary law: it is a plugin, R; nothing here is E/M/B/D).

## 9. Schema changes

- `plugin-mise`: `schema/mise.cue` (self-contained `#MiseInput`) → `task cue:gen` → `params/cue_types_gen.go` (reproducible; second run is a no-op).
- `spec` (P3): detection vocabulary + `ExternalizedBuilders`/`ExternalBuilderPluginRef` entries — CUE edit → `task cue:gen` in the spec repo.
- No `#Candy` schema change in v1 (tools come from the candy's `mise.toml` file). The inline `mise:` candy field (tools/env declared in charly.yml) is a P4 optional spec change.

## 10. Verification (R7/R10 + ADE)

1. **ADE**: the plugin's own `plan:` checks (module-present, verb-dispatches) — deterministic, run by `charly check`.
2. **Unit**: `go test ./...` in `plugin-mise` (OpResolve reply shape, schema splice via `TestPluginSchemaSpliceValidation`-style test); `task cue:gen` reproducibility.
3. **R10 disposable bed**: a check bed (e.g. `check-mise-pod` in a distro repo) composing a candy with `external_builder: mise` + a `mise:` verb step, driven to a fresh `charly update`; check-live asserts: `mise --version`, `mise ls` shows the declared tools, `mise x node --version` runs the installed node, shims resolve on PATH.
4. **Gate**: `task verify` on the final umbrella tree (pins: plugin-mise gitlink + marketplace ref + spec/sdk bumps), pasted in the PR body.
5. **Attribution**: `fully tested and validated` only after the bed is green end-to-end.

## 11. Landing order (PR sequence, per /charly-internals:git-workflow)

| Step | Repo | Change | Depends on |
|---|---|---|---|
| 1 | `opencharly/plugin-mise` (new) | builder:mise + verb:mise + schema + ADE | — |
| 2 | `opencharly/marketplace` | register plugin-mise in charly-marketplace candy | 1 (tag) |
| 3 | distro repo (e.g. `distro-fedora`) | `candy/mise` layer + `check-mise-pod` bed | 1 |
| 4 | `opencharly/spec` | ExternalizedBuilders + externalBuilderPlugins Go maps (P3) | 1 |
| 4b | `opencharly/charly` | embedded `builder: mise:` vocabulary in `charly/charly/charly.yml` + add_candy pin (P3) | 1 |
| 5 | `opencharly/sdk` | only if shared-template route chosen (P3) | 4 |
| 6 | `opencharly/docs` | regenerated plugin page | 1 |
| 7 | `opencharly/charly` | only if a core seam is needed (expected: none) | — |

Each PR: feat/ branch, R10-gated, PR-only landing, validator PASS before the next step. The plugin repo is the root of the DAG — everything else references its tag.

## 12. Phases

- **P1 (core)**: `plugin-mise` with `builder:mise` (external_builder path) + `verb:mise` + schema + ADE checks; marketplace registration; unit tests. *Proves the builder leg end-to-end on a bed.*
- **P2 (runtime)**: `candy/mise` layer + `command:mise` CLI + check bed; docs page.
- **P3 (detection)**: spec vocabulary so `mise.toml`/`.tool-versions` auto-trigger the builder; deploy-time legs (OpCollectContext/OpReverse) if needed.
- **P4 (deep)**: optional inline `mise:` candy field (tools/env in charly.yml), `mise env` → ENV emission, task mapping (`mise run` ↔ charly check/run steps), `mise.lock` lockfile support.

## 13. Open decisions (lock before P1)

1. **Stage base**: pinned mise release tarball installed in-stage vs a mise-enabled base image (the §7 layer as builder ref). *Recommend: pinned tarball in-stage — self-contained, reproducible.*
2. **Stage template location**: plugin-rendered (recommended, R3) vs `kit.BuilderResolve` shared template (needed only if detection must reuse the four-builder machinery).
3. **Artifact shape**: whole `MISE_DATA_DIR` (installs + shims) vs per-tool `COPY` of install dirs. *Recommend: whole dir — matches mise's Docker cookbook, shims included.*
4. **Cache**: BuildKit cache mount on `MISE_DATA_DIR` with sentinel (v1.1) vs stage-layer caching only (v1).
5. **Runtime env**: shims-on-PATH only (recommended) vs `mise activate` hook vs `mise env` ENV emission.
6. **Inline `mise:` candy field**: in v1 (spec change, more charly-native) or P4 (mise.toml files only in v1). *Recommend P4 — keeps v1 to the plugin repo + marketplace.*
7. **command:mise scope**: what `charly mise …` should do (run mise in a container? manage a host mise?) — needs a concrete use case before P2.

## 14. Risks

- **mise version churn**: mise releases weekly; pin `MISE_VERSION` in the layer candy and the stage, bump deliberately (same policy as other pinned tools).
- **Backend network access at build**: asdf/cargo/npm backends fetch from their registries inside the build — the bed must have egress; cache mounts mitigate rebuild cost.
- **Shim PATH ordering**: shims must precede system paths or the image's distro packages shadow mise tools — document and test (`mise x` is the escape hatch).
- **Detection collision**: `.tool-versions` is also read by asdf — harmless (mise is asdf-compatible), but the detection vocabulary must not claim files other builders own.


## 15. Validation results (2026-08-30 — code audit + live spikes)

### 15.1 Code-level audit (all claims verified against the tree)

| Plan claim | Verdict | Evidence |
|---|---|---|
| Builder plugin = standalone Go module, `builder:<word>` over gRPC | ✅ | `plugin-example-builder` (builder:examplebuilder), `plugin-builder-pixi` (builder:pixi) — both `go.mod` + `plugin.go` + `cmd/serve/main.go` + `schema/*.cue` |
| `external_builder: <word>` selects a custom builder | ✅ | `plugin_loader.go:749` `add(candy.GetExternalBuilder())`; `plugin_scope_test.go` examplebuilder-consumer fixture |
| OpResolve returns `BuilderResolveReply{stage, copy_artifacts, copy_binary, inline_fragment}` | ✅ | `spec/schema/buildwire.cue` #BuilderResolveReply; examplebuilder's `Invoke` (op `"resolve"`) |
| Host computes `BuilderResolveInput` (candy, builder_ref, stage_name, copy_src, uid/gid/home, manifest, install_cmd, cache_mounts_*) | ✅ | `spec/schema/buildwire.cue` #BuilderResolveInput; `deploykit.BuildStageContext` |
| Verb `<word>: <input>` sugar → `plugin`/`plugin_input` desugar → OpEmit → `EmitReply{fragment, act_script}` | ✅ | `reserved_registry.go` desugar; `spec/schema/buildwire.cue` #EmitReply; `plugin-cdp`/`plugin-http` |
| Detection builders selected by `detect_file` from the embedded `builder:` vocabulary | ✅ | `charly/charly/charly.yml:284-328` (cargo/npm/pixi entries); `deploykit.CandyNeedsBuilder` reads `img.BuilderConfig` |
| `spec.ExternalizedBuilders` + `ExternalBuilderPluginRef` are the external-builder D-fact | ✅ | `spec/externalized_builders.go` (Go maps: cargo/npm/pixi/aur → candy subpaths) |
| Ops: `OpResolve` = builder build-time multi-stage | ✅ | `sdk/ops.go:22` |
| sdk pin | ✅ | charly go.mod: `github.com/opencharly/sdk v0.2026241.2111` |

### 15.2 Live spikes (podman, fedora:43, mise v2026.8.14)

1. **Tarball**: `mise-v2026.8.14-linux-x64.tar.gz` (37.6MB) — **`x64` not `x86_64`**; nests under `mise/` (bin/mise, share/, LICENSE) → `strip_components: 1` + ARCH mapping required.
2. **Install**: `MISE_DATA_DIR=/mise mise install node@22` → node@22.23.2 installed; `/mise` = downloads/installs/migrations/shims.
3. **Shims**: `mise reshim` → node/npm/npx/corepack shims. **Shims fail without a config** ("No version is set for shim: node").
4. **Config**: `/etc/mise.toml` is NOT a recognized path; **`/etc/mise/config.toml` (system config) works** — with it, shims resolve: `node --version` = v22.23.2, `npm --version` = 10.9.8, `mise ls` shows the tool + config source.
5. **`mise x`**: requires `--` separator (`mise x node -- node --version`); `mise env` emits `export PATH='…/shims:…'`.
6. **Image-runtime end-to-end**: build with mise + `mise install` + `mise reshim` + copy `MISE_DATA_DIR` + `/etc/mise/config.toml` → fresh container shims resolve correctly. The §5.2 stage design is proven.

### 15.3 Plan corrections from validation

- §5.2: tarball URL uses `x64`/`arm64` (ARCH mapping needed); `strip_components: 1`; **config must land at `/etc/mise/config.toml`** (not /etc/mise.toml); `mise x` needs `--`.
- §6: detection vocabulary = **embedded `builder:` map in `charly/charly/charly.yml`** (charly repo change), NOT spec CUE; spec change is the two Go maps in `externalized_builders.go`; plugin must be pinned in the project `add_candy:` closure.
- §11: add the charly embedded-vocabulary step (4b) to the landing order.
# mise support
