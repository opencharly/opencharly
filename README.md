# OpenCharly — umbrella

**One clone of the whole org.** `opencharly/opencharly` is an org-level umbrella repo:
every OpenCharly repo (394 today) is pinned here as a git submodule ("gitlink", in the
org's vocabulary), flat at the root — submodule path == repo name, except the one
alias below. `charly` is the product repo and the single source of truth; this
umbrella is a *view* of the org, not a new home for anything.

```
git clone --recurse-submodules https://github.com/opencharly/opencharly.git
```

All submodule URLs are plain HTTPS, so **forks work without extra configuration**:
every gitlink resolves to its `opencharly/<repo>` upstream over HTTPS, no credentials
needed for a read-only checkout.

## The org map

Every submodule is listed below, grouped by category and alphabetically ordered
within each table. The pinning policy in the next section says how each pin is kept
current.

Two repos are deliberately **not** listed as their own-name submodules:

- `opencharly/opencharly` itself — the umbrella cannot pin itself; it *is* this repo.
- `opencharly/.github` — the org-wide community-health defaults and the reusable
  validation/merge workflows every repo inherits. It is pinned at the `dotgithub/`
  path (submodule path != repo name), so this repo's own `.github/workflows/` stays
  free for its CI dispatchers.

`heroic-heroic` (an accidental scaffold repo from a batch cutover bug) is archived
and intentionally not a submodule.

### Core & contract

5 repos — the product and the contracts it consumes.

| path | repo | role |
|---|---|---|
| `charly/` | [opencharly/charly](https://github.com/opencharly/charly) | The open infrastructure compiler — for you and your agents. |
| `docs/` | [opencharly/docs](https://github.com/opencharly/docs) | Documentation site for OpenCharly — the candy factory for you and your agents. Published at opencharly.ai. |
| `marketplace/` | [opencharly/marketplace](https://github.com/opencharly/marketplace) | OpenCharly plugins — Claude Code skills, agents, and workflows for the charly CLI |
| `sdk/` | [opencharly/sdk](https://github.com/opencharly/sdk) | OpenCharly plugin SDK + contract repo |
| `spec/` | [opencharly/spec](https://github.com/opencharly/spec) | OpenCharly wire/IR contract module: spec + proto (generated from CUE schema). The dedicated contract every pl… |


### Distro image families

6 repos — each maps to a `box/<distro>` inside `charly`; their pins follow charly's own gitlinks (policy B).

| path | repo | role |
|---|---|---|
| `distro-arch/` | [opencharly/distro-arch](https://github.com/opencharly/distro-arch) | OpenCharly — the Arch Linux image family |
| `distro-cachyos/` | [opencharly/distro-cachyos](https://github.com/opencharly/distro-cachyos) | OpenCharly — the CachyOS image family |
| `distro-debian/` | [opencharly/distro-debian](https://github.com/opencharly/distro-debian) | OpenCharly — the Debian image family |
| `distro-fedora/` | [opencharly/distro-fedora](https://github.com/opencharly/distro-fedora) | OpenCharly — the Fedora image family (incl. the nvidia GPU base) |
| `distro-omarchy/` | [opencharly/distro-omarchy](https://github.com/opencharly/distro-omarchy) | Omarchy image family (charly's box/omarchy) - vanilla Arch + Hyprland |
| `distro-ubuntu/` | [opencharly/distro-ubuntu](https://github.com/opencharly/distro-ubuntu) | OpenCharly — the Ubuntu image family |


### Package repositories

10 repos — native package repos for supported distros.

| path | repo | role |
|---|---|---|
| `charly-alpine/` | [opencharly/charly-alpine](https://github.com/opencharly/charly-alpine) | charly native package repo |
| `charly-arch/` | [opencharly/charly-arch](https://github.com/opencharly/charly-arch) | charly native package repo |
| `charly-debian/` | [opencharly/charly-debian](https://github.com/opencharly/charly-debian) | charly native package repo |
| `charly-fedora/` | [opencharly/charly-fedora](https://github.com/opencharly/charly-fedora) | charly native package repo |
| `charly-openwrt/` | [opencharly/charly-openwrt](https://github.com/opencharly/charly-openwrt) | charly native package repo |
| `charly-ubuntu/` | [opencharly/charly-ubuntu](https://github.com/opencharly/charly-ubuntu) | charly native package repo |
| `pkg-arch/` | [opencharly/pkg-arch](https://github.com/opencharly/pkg-arch) | OpenCharly — native Arch PKGBUILD for the charly CLI binary |
| `pkg-debian/` | [opencharly/pkg-debian](https://github.com/opencharly/pkg-debian) | OpenCharly — native Debian/Ubuntu packaging for the charly CLI binary |
| `pkg-fedora/` | [opencharly/pkg-fedora](https://github.com/opencharly/pkg-fedora) | OpenCharly — native Fedora RPM packaging for the charly CLI binary |
| `plugin-generate-packages/` | [opencharly/plugin-generate-packages](https://github.com/opencharly/plugin-generate-packages) | charly native package repo |


### Product & tooling

5 repos — streamer product, org action, and third-party pins.

| path | repo | role |
|---|---|---|
| `charly-streamer/` | [opencharly/charly-streamer](https://github.com/opencharly/charly-streamer) | charly-streamer (cstream) — Hyprland desktops streamed to a browser over WebRTC: Rust streamer + leader, Go g… |
| `dotgithub/` | [opencharly/.github](https://github.com/opencharly/.github) | OpenCharly org-wide community-health defaults (PR template, etc.) — single source inherited by every repo wit… |
| `gst-wayland-display/` | [opencharly/gst-wayland-display](https://github.com/opencharly/gst-wayland-display) | A micro Wayland compositor that can be used as a Gstreamer plugin |
| `pi-review-action/` | [opencharly/pi-review-action](https://github.com/opencharly/pi-review-action) | OpenCharly's org-wide PR-review GitHub Action: runs a fresh independent AI validator with read-only GitHub to… |
| `pixelflux/` | [opencharly/pixelflux](https://github.com/opencharly/pixelflux) | Patched pixelflux wl-screenshot/record library for OpenCharly selkies desktops (migrated from overthinkos) |


### Charly candy layers

22 repos — the charly meta/skill candy layers.

| path | repo | role |
|---|---|---|
| `layer-charly-build/` | [opencharly/layer-charly-build](https://github.com/opencharly/layer-charly-build) | The charly-build candy — 15 build skills (extracted from charly/candy) |
| `layer-charly-check/` | [opencharly/layer-charly-check](https://github.com/opencharly/layer-charly-check) | The charly-check candy — 13 check skills (extracted from charly/candy) |
| `layer-charly-coder/` | [opencharly/layer-charly-coder](https://github.com/opencharly/layer-charly-coder) | image layer / candy |
| `layer-charly-comfyui/` | [opencharly/layer-charly-comfyui](https://github.com/opencharly/layer-charly-comfyui) | image layer / candy |
| `layer-charly-distros/` | [opencharly/layer-charly-distros](https://github.com/opencharly/layer-charly-distros) | image layer / candy |
| `layer-charly-filebrowser/` | [opencharly/layer-charly-filebrowser](https://github.com/opencharly/layer-charly-filebrowser) | image layer / candy |
| `layer-charly-hermes/` | [opencharly/layer-charly-hermes](https://github.com/opencharly/layer-charly-hermes) | image layer / candy |
| `layer-charly-image/` | [opencharly/layer-charly-image](https://github.com/opencharly/layer-charly-image) | The charly-image candy — 2 image skills (extracted from charly/candy) |
| `layer-charly-immich/` | [opencharly/layer-charly-immich](https://github.com/opencharly/layer-charly-immich) | The charly-immich candy — 2 immich skills (extracted from charly/candy) |
| `layer-charly-infrastructure/` | [opencharly/layer-charly-infrastructure](https://github.com/opencharly/layer-charly-infrastructure) | image layer / candy |
| `layer-charly-internals/` | [opencharly/layer-charly-internals](https://github.com/opencharly/layer-charly-internals) | The charly-internals concept candy — contributor skills (go, plugin, agents, install-plan, cutover-policy, …)… |
| `layer-charly-internals-extra/` | [opencharly/layer-charly-internals-extra](https://github.com/opencharly/layer-charly-internals-extra) | The charly-internals-extra candy — 8 internals skills (extracted from charly/candy) |
| `layer-charly-jupyter/` | [opencharly/layer-charly-jupyter](https://github.com/opencharly/layer-charly-jupyter) | image layer / candy |
| `layer-charly-kubernetes/` | [opencharly/layer-charly-kubernetes](https://github.com/opencharly/layer-charly-kubernetes) | The charly-kubernetes candy — 3 kubernetes skills (extracted from charly/candy) |
| `layer-charly-languages/` | [opencharly/layer-charly-languages](https://github.com/opencharly/layer-charly-languages) | image layer / candy |
| `layer-charly-local/` | [opencharly/layer-charly-local](https://github.com/opencharly/layer-charly-local) | image layer / candy |
| `layer-charly-ollama/` | [opencharly/layer-charly-ollama](https://github.com/opencharly/layer-charly-ollama) | image layer / candy |
| `layer-charly-openclaw/` | [opencharly/layer-charly-openclaw](https://github.com/opencharly/layer-charly-openclaw) | image layer / candy |
| `layer-charly-openwebui/` | [opencharly/layer-charly-openwebui](https://github.com/opencharly/layer-charly-openwebui) | image layer / candy |
| `layer-charly-pod/` | [opencharly/layer-charly-pod](https://github.com/opencharly/layer-charly-pod) | image layer / candy |
| `layer-charly-selkies/` | [opencharly/layer-charly-selkies](https://github.com/opencharly/layer-charly-selkies) | image layer / candy |
| `layer-charly-tools/` | [opencharly/layer-charly-tools](https://github.com/opencharly/layer-charly-tools) | image layer / candy |


### Omarchy layers

13 repos — the omarchy desktop image composition layers.

| path | repo | role |
|---|---|---|
| `layer-omarchy-base/` | [opencharly/layer-omarchy-base](https://github.com/opencharly/layer-omarchy-base) | Omarchy base - the [omarchy] pacman repo, keyring and core runtime |
| `layer-omarchy-boot/` | [opencharly/layer-omarchy-boot](https://github.com/opencharly/layer-omarchy-boot) | Omarchy boot chain - limine, snapper, plymouth, sddm (machine-only) |
| `layer-omarchy-desktop-apps/` | [opencharly/layer-omarchy-desktop-apps](https://github.com/opencharly/layer-omarchy-desktop-apps) | Omarchy desktop applications - files, productivity, input methods, web apps |
| `layer-omarchy-dev/` | [opencharly/layer-omarchy-dev](https://github.com/opencharly/layer-omarchy-dev) | Omarchy developer toolchain - editors, language runtimes, containers |
| `layer-omarchy-fonts/` | [opencharly/layer-omarchy-fonts](https://github.com/opencharly/layer-omarchy-fonts) | Omarchy font set |
| `layer-omarchy-gpu-nvidia/` | [opencharly/layer-omarchy-gpu-nvidia](https://github.com/opencharly/layer-omarchy-gpu-nvidia) | Omarchy NVIDIA GPU stack (machine-only, opt-in) |
| `layer-omarchy-hardware/` | [opencharly/layer-omarchy-hardware](https://github.com/opencharly/layer-omarchy-hardware) | Omarchy hardware and laptop support - dkms and vendor quirks (machine-only, opt-in) |
| `layer-omarchy-hyprland/` | [opencharly/layer-omarchy-hyprland](https://github.com/opencharly/layer-omarchy-hyprland) | Omarchy Hyprland compositor stack and desktop portals |
| `layer-omarchy-media/` | [opencharly/layer-omarchy-media](https://github.com/opencharly/layer-omarchy-media) | Omarchy media stack - audio, video, imaging, capture |
| `layer-omarchy-network/` | [opencharly/layer-omarchy-network](https://github.com/opencharly/layer-omarchy-network) | Omarchy networking - NetworkManager, bluetooth, printing, firewall (machine-only) |
| `layer-omarchy-shell/` | [opencharly/layer-omarchy-shell](https://github.com/opencharly/layer-omarchy-shell) | Omarchy Quickshell desktop shell - bar, notifier, launcher, OSD |
| `layer-omarchy-terminal/` | [opencharly/layer-omarchy-terminal](https://github.com/opencharly/layer-omarchy-terminal) | Omarchy terminal and CLI toolkit - foot, starship, modern coreutils |
| `layer-omarchy-themes/` | [opencharly/layer-omarchy-themes](https://github.com/opencharly/layer-omarchy-themes) | Omarchy's 22 themes and the theme-token renderers |


### Omarchy evaluation

2 repos — the omarchy PR evaluation beds and their run artifacts.

| path | repo | role |
|---|---|---|
| `eval-omarchy/` | [opencharly/eval-omarchy](https://github.com/opencharly/eval-omarchy) | omarchy PR evaluation: check beds + eval results |
| `omarchy-eval-artifacts/` | [opencharly/omarchy-eval-artifacts](https://github.com/opencharly/omarchy-eval-artifacts) | omarchy PR evaluation artifacts (screenshots, GIFs, run logs) |


### Check & fixture layers

15 repos — check-bed and plugin fixture layers.

| path | repo | role |
|---|---|---|
| `layer-check-base-layer/` | [opencharly/layer-check-base-layer](https://github.com/opencharly/layer-check-base-layer) | image layer / candy |
| `layer-check-builder-npm/` | [opencharly/layer-check-builder-npm](https://github.com/opencharly/layer-check-builder-npm) | image layer / candy |
| `layer-check-composition-layer/` | [opencharly/layer-check-composition-layer](https://github.com/opencharly/layer-check-composition-layer) | image layer / candy |
| `layer-check-cross-local-driver-layer/` | [opencharly/layer-check-cross-local-driver-layer](https://github.com/opencharly/layer-check-cross-local-driver-layer) | image layer / candy |
| `layer-check-group-layer/` | [opencharly/layer-check-group-layer](https://github.com/opencharly/layer-check-group-layer) | image layer / candy |
| `layer-check-local-layer/` | [opencharly/layer-check-local-layer](https://github.com/opencharly/layer-check-local-layer) | The check-local-layer candy — kind:local check fixture (extracted from charly/candy) |
| `layer-check-retention-fixture/` | [opencharly/layer-check-retention-fixture](https://github.com/opencharly/layer-check-retention-fixture) | image layer / candy |
| `layer-check-stack-layer/` | [opencharly/layer-check-stack-layer](https://github.com/opencharly/layer-check-stack-layer) | The check-stack-layer candy — stack check fixture (extracted from charly/candy) |
| `layer-check-structkind-layer/` | [opencharly/layer-check-structkind-layer](https://github.com/opencharly/layer-check-structkind-layer) | image layer / candy |
| `layer-check-substrate-layer/` | [opencharly/layer-check-substrate-layer](https://github.com/opencharly/layer-check-substrate-layer) | image layer / candy |
| `layer-check-tier1-layer/` | [opencharly/layer-check-tier1-layer](https://github.com/opencharly/layer-check-tier1-layer) | image layer / candy |
| `layer-examplebuilder-consumer/` | [opencharly/layer-examplebuilder-consumer](https://github.com/opencharly/layer-examplebuilder-consumer) | image layer / candy |
| `layer-examplestep-consumer/` | [opencharly/layer-examplestep-consumer](https://github.com/opencharly/layer-examplestep-consumer) | The examplestep-consumer fixture — build-context plugin-execution consumer (extracted from charly/candy) |
| `layer-examplestep-deploy-consumer/` | [opencharly/layer-examplestep-deploy-consumer](https://github.com/opencharly/layer-examplestep-deploy-consumer) | The examplestep-deploy-consumer fixture — deploy-context plugin-execution consumer (extracted from charly/can… |
| `layer-stepkind-build-consumer/` | [opencharly/layer-stepkind-build-consumer](https://github.com/opencharly/layer-stepkind-build-consumer) | The stepkind-build-consumer fixture — class:step build-emit consumer (extracted from charly/candy) |


### Other layers

137 repos.

| path | repo | role |
|---|---|---|
| `layer-a11y-tools/` | [opencharly/layer-a11y-tools](https://github.com/opencharly/layer-a11y-tools) | image layer / candy |
| `layer-agent-forwarding/` | [opencharly/layer-agent-forwarding](https://github.com/opencharly/layer-agent-forwarding) | image layer / candy |
| `layer-agentteams/` | [opencharly/layer-agentteams](https://github.com/opencharly/layer-agentteams) | image layer / candy |
| `layer-agentteams-cli/` | [opencharly/layer-agentteams-cli](https://github.com/opencharly/layer-agentteams-cli) | image layer / candy |
| `layer-agentteams-openclaw/` | [opencharly/layer-agentteams-openclaw](https://github.com/opencharly/layer-agentteams-openclaw) | image layer / candy |
| `layer-agentteams-snapshot/` | [opencharly/layer-agentteams-snapshot](https://github.com/opencharly/layer-agentteams-snapshot) | image layer / candy |
| `layer-android-apidemos/` | [opencharly/layer-android-apidemos](https://github.com/opencharly/layer-android-apidemos) | image layer / candy |
| `layer-android-sdk/` | [opencharly/layer-android-sdk](https://github.com/opencharly/layer-android-sdk) | image layer / candy |
| `layer-android-test-apps/` | [opencharly/layer-android-test-apps](https://github.com/opencharly/layer-android-test-apps) | image layer / candy |
| `layer-asciinema/` | [opencharly/layer-asciinema](https://github.com/opencharly/layer-asciinema) | image layer / candy |
| `layer-blogwatcher/` | [opencharly/layer-blogwatcher](https://github.com/opencharly/layer-blogwatcher) | image layer / candy |
| `layer-build-toolchain/` | [opencharly/layer-build-toolchain](https://github.com/opencharly/layer-build-toolchain) | image layer / candy |
| `layer-cachyos-extras/` | [opencharly/layer-cachyos-extras](https://github.com/opencharly/layer-cachyos-extras) | image layer / candy |
| `layer-camsnap/` | [opencharly/layer-camsnap](https://github.com/opencharly/layer-camsnap) | image layer / candy |
| `layer-charly/` | [opencharly/layer-charly](https://github.com/opencharly/layer-charly) | The charly meta-candy — the full charly toolchain layer (extracted from charly/candy) |
| `layer-chrome/` | [opencharly/layer-chrome](https://github.com/opencharly/layer-chrome) | charly candy: layer-chrome (standalone repo of the candy de-submodule cutover) |
| `layer-chrome-sway/` | [opencharly/layer-chrome-sway](https://github.com/opencharly/layer-chrome-sway) | image layer / candy |
| `layer-claude-code/` | [opencharly/layer-claude-code](https://github.com/opencharly/layer-claude-code) | image layer / candy |
| `layer-clawhub/` | [opencharly/layer-clawhub](https://github.com/opencharly/layer-clawhub) | image layer / candy |
| `layer-codex/` | [opencharly/layer-codex](https://github.com/opencharly/layer-codex) | image layer / candy |
| `layer-container-nesting/` | [opencharly/layer-container-nesting](https://github.com/opencharly/layer-container-nesting) | image layer / candy |
| `layer-cstream-desktop/` | [opencharly/layer-cstream-desktop](https://github.com/opencharly/layer-cstream-desktop) | charly metalayer: the full cstream streaming desktop — pod-cstream + pod-hyprland + fixings |
| `layer-cuda/` | [opencharly/layer-cuda](https://github.com/opencharly/layer-cuda) | charly candy: layer-cuda (standalone repo of the candy de-submodule cutover) |
| `layer-cue/` | [opencharly/layer-cue](https://github.com/opencharly/layer-cue) | image layer / candy |
| `layer-debootstrap-builder/` | [opencharly/layer-debootstrap-builder](https://github.com/opencharly/layer-debootstrap-builder) | image layer / candy |
| `layer-debug-tools/` | [opencharly/layer-debug-tools](https://github.com/opencharly/layer-debug-tools) | image layer / candy |
| `layer-desktop-fonts/` | [opencharly/layer-desktop-fonts](https://github.com/opencharly/layer-desktop-fonts) | image layer / candy |
| `layer-desktop-media/` | [opencharly/layer-desktop-media](https://github.com/opencharly/layer-desktop-media) | image layer / candy |
| `layer-dev-tools/` | [opencharly/layer-dev-tools](https://github.com/opencharly/layer-dev-tools) | image layer / candy |
| `layer-devops-tools/` | [opencharly/layer-devops-tools](https://github.com/opencharly/layer-devops-tools) | image layer / candy |
| `layer-direnv/` | [opencharly/layer-direnv](https://github.com/opencharly/layer-direnv) | image layer / candy |
| `layer-docker-ce/` | [opencharly/layer-docker-ce](https://github.com/opencharly/layer-docker-ce) | image layer / candy |
| `layer-docs-site/` | [opencharly/layer-docs-site](https://github.com/opencharly/layer-docs-site) | image layer / candy |
| `layer-fastfetch/` | [opencharly/layer-fastfetch](https://github.com/opencharly/layer-fastfetch) | image layer / candy |
| `layer-ffmpeg/` | [opencharly/layer-ffmpeg](https://github.com/opencharly/layer-ffmpeg) | charly candy: layer-ffmpeg (standalone repo of the candy de-submodule cutover) |
| `layer-fonts-extended/` | [opencharly/layer-fonts-extended](https://github.com/opencharly/layer-fonts-extended) | image layer / candy |
| `layer-forgecode/` | [opencharly/layer-forgecode](https://github.com/opencharly/layer-forgecode) | image layer / candy |
| `layer-gemini/` | [opencharly/layer-gemini](https://github.com/opencharly/layer-gemini) | charly candy: layer-gemini (standalone repo of the candy de-submodule cutover) |
| `layer-gh/` | [opencharly/layer-gh](https://github.com/opencharly/layer-gh) | image layer / candy |
| `layer-gifgrep/` | [opencharly/layer-gifgrep](https://github.com/opencharly/layer-gifgrep) | image layer / candy |
| `layer-github-actions/` | [opencharly/layer-github-actions](https://github.com/opencharly/layer-github-actions) | image layer / candy |
| `layer-gnupg/` | [opencharly/layer-gnupg](https://github.com/opencharly/layer-gnupg) | image layer / candy |
| `layer-gocryptfs/` | [opencharly/layer-gocryptfs](https://github.com/opencharly/layer-gocryptfs) | image layer / candy |
| `layer-gogcli/` | [opencharly/layer-gogcli](https://github.com/opencharly/layer-gogcli) | image layer / candy |
| `layer-golang/` | [opencharly/layer-golang](https://github.com/opencharly/layer-golang) | charly candy: layer-golang (standalone repo of the candy de-submodule cutover) |
| `layer-google-cloud/` | [opencharly/layer-google-cloud](https://github.com/opencharly/layer-google-cloud) | image layer / candy |
| `layer-google-cloud-npm/` | [opencharly/layer-google-cloud-npm](https://github.com/opencharly/layer-google-cloud-npm) | image layer / candy |
| `layer-goplaces/` | [opencharly/layer-goplaces](https://github.com/opencharly/layer-goplaces) | image layer / candy |
| `layer-grafana-tools/` | [opencharly/layer-grafana-tools](https://github.com/opencharly/layer-grafana-tools) | image layer / candy |
| `layer-gst-wayland-display/` | [opencharly/layer-gst-wayland-display](https://github.com/opencharly/layer-gst-wayland-display) | charly candy building gst-wayland-display — the Smithay compositor packaged as the GStreamer source waylanddi… |
| `layer-helm-chart/` | [opencharly/layer-helm-chart](https://github.com/opencharly/layer-helm-chart) | image layer / candy |
| `layer-hermes-playwright/` | [opencharly/layer-hermes-playwright](https://github.com/opencharly/layer-hermes-playwright) | image layer / candy |
| `layer-heroic/` | [opencharly/layer-heroic](https://github.com/opencharly/layer-heroic) | image layer / candy |
| `layer-himalaya/` | [opencharly/layer-himalaya](https://github.com/opencharly/layer-himalaya) | image layer / candy |
| `layer-java-openjdk/` | [opencharly/layer-java-openjdk](https://github.com/opencharly/layer-java-openjdk) | image layer / candy |
| `layer-jupyter-mcp/` | [opencharly/layer-jupyter-mcp](https://github.com/opencharly/layer-jupyter-mcp) | image layer / candy |
| `layer-k3s/` | [opencharly/layer-k3s](https://github.com/opencharly/layer-k3s) | image layer / candy |
| `layer-k3s-kernel/` | [opencharly/layer-k3s-kernel](https://github.com/opencharly/layer-k3s-kernel) | image layer / candy |
| `layer-kde-shell/` | [opencharly/layer-kde-shell](https://github.com/opencharly/layer-kde-shell) | image layer / candy |
| `layer-keepassxc/` | [opencharly/layer-keepassxc](https://github.com/opencharly/layer-keepassxc) | image layer / candy |
| `layer-kimi/` | [opencharly/layer-kimi](https://github.com/opencharly/layer-kimi) | image layer / candy |
| `layer-kubernetes/` | [opencharly/layer-kubernetes](https://github.com/opencharly/layer-kubernetes) | image layer / candy |
| `layer-language-runtimes/` | [opencharly/layer-language-runtimes](https://github.com/opencharly/layer-language-runtimes) | image layer / candy |
| `layer-libnotify/` | [opencharly/layer-libnotify](https://github.com/opencharly/layer-libnotify) | image layer / candy |
| `layer-llama-cpp/` | [opencharly/layer-llama-cpp](https://github.com/opencharly/layer-llama-cpp) | image layer / candy |
| `layer-maplibre-versatiles-styler/` | [opencharly/layer-maplibre-versatiles-styler](https://github.com/opencharly/layer-maplibre-versatiles-styler) | image layer / candy |
| `layer-mcporter/` | [opencharly/layer-mcporter](https://github.com/opencharly/layer-mcporter) | image layer / candy |
| `layer-nano-pdf/` | [opencharly/layer-nano-pdf](https://github.com/opencharly/layer-nano-pdf) | image layer / candy |
| `layer-nodejs/` | [opencharly/layer-nodejs](https://github.com/opencharly/layer-nodejs) | charly candy: layer-nodejs (standalone repo of the candy de-submodule cutover) |
| `layer-notebook-finetuning/` | [opencharly/layer-notebook-finetuning](https://github.com/opencharly/layer-notebook-finetuning) | image layer / candy |
| `layer-notebook-graph/` | [opencharly/layer-notebook-graph](https://github.com/opencharly/layer-notebook-graph) | image layer / candy |
| `layer-notebook-llm-on-supercomputers/` | [opencharly/layer-notebook-llm-on-supercomputers](https://github.com/opencharly/layer-notebook-llm-on-supercomputers) | image layer / candy |
| `layer-notebook-ollama/` | [opencharly/layer-notebook-ollama](https://github.com/opencharly/layer-notebook-ollama) | image layer / candy |
| `layer-notebook-openrouter/` | [opencharly/layer-notebook-openrouter](https://github.com/opencharly/layer-notebook-openrouter) | image layer / candy |
| `layer-notebook-osm/` | [opencharly/layer-notebook-osm](https://github.com/opencharly/layer-notebook-osm) | image layer / candy |
| `layer-notebook-templates/` | [opencharly/layer-notebook-templates](https://github.com/opencharly/layer-notebook-templates) | image layer / candy |
| `layer-nvenc-headers/` | [opencharly/layer-nvenc-headers](https://github.com/opencharly/layer-nvenc-headers) | image layer / candy |
| `layer-nvidia/` | [opencharly/layer-nvidia](https://github.com/opencharly/layer-nvidia) | charly candy: layer-nvidia (standalone repo of the candy de-submodule cutover) |
| `layer-ollama-cuda/` | [opencharly/layer-ollama-cuda](https://github.com/opencharly/layer-ollama-cuda) | image layer / candy |
| `layer-ollama-rocm/` | [opencharly/layer-ollama-rocm](https://github.com/opencharly/layer-ollama-rocm) | image layer / candy |
| `layer-openclaw-full/` | [opencharly/layer-openclaw-full](https://github.com/opencharly/layer-openclaw-full) | image layer / candy |
| `layer-openclaw-full-ml/` | [opencharly/layer-openclaw-full-ml](https://github.com/opencharly/layer-openclaw-full-ml) | image layer / candy |
| `layer-oracle/` | [opencharly/layer-oracle](https://github.com/opencharly/layer-oracle) | image layer / candy |
| `layer-ordercli/` | [opencharly/layer-ordercli](https://github.com/opencharly/layer-ordercli) | image layer / candy |
| `layer-pacstrap-builder/` | [opencharly/layer-pacstrap-builder](https://github.com/opencharly/layer-pacstrap-builder) | image layer / candy |
| `layer-pavucontrol/` | [opencharly/layer-pavucontrol](https://github.com/opencharly/layer-pavucontrol) | image layer / candy |
| `layer-pi-agent/` | [opencharly/layer-pi-agent](https://github.com/opencharly/layer-pi-agent) | image layer / candy |
| `layer-pixi/` | [opencharly/layer-pixi](https://github.com/opencharly/layer-pixi) | image layer / candy |
| `layer-playwright/` | [opencharly/layer-playwright](https://github.com/opencharly/layer-playwright) | image layer / candy |
| `layer-pod-addcandy-marker/` | [opencharly/layer-pod-addcandy-marker](https://github.com/opencharly/layer-pod-addcandy-marker) | image layer / candy |
| `layer-pre-commit/` | [opencharly/layer-pre-commit](https://github.com/opencharly/layer-pre-commit) | image layer / candy |
| `layer-punktfunk/` | [opencharly/layer-punktfunk](https://github.com/opencharly/layer-punktfunk) | Punktfunk streaming host candy — punktfunk/1 QUIC host daemon, web console and plugin runner from unom's sign… |
| `layer-punktfunk-client/` | [opencharly/layer-punktfunk-client](https://github.com/opencharly/layer-punktfunk-client) | The punktfunk streaming CLIENT — punktfunk-client and its headless punktfunk CLI, installed from unom's signe… |
| `layer-python/` | [opencharly/layer-python](https://github.com/opencharly/layer-python) | charly candy: layer-python (standalone repo of the candy de-submodule cutover) |
| `layer-python-ml/` | [opencharly/layer-python-ml](https://github.com/opencharly/layer-python-ml) | image layer / candy |
| `layer-ripgrep/` | [opencharly/layer-ripgrep](https://github.com/opencharly/layer-ripgrep) | charly candy: ripgrep (standalone repo of the candy de-submodule cutover) |
| `layer-rocm/` | [opencharly/layer-rocm](https://github.com/opencharly/layer-rocm) | image layer / candy |
| `layer-rpmfusion/` | [opencharly/layer-rpmfusion](https://github.com/opencharly/layer-rpmfusion) | image layer / candy |
| `layer-rust/` | [opencharly/layer-rust](https://github.com/opencharly/layer-rust) | image layer / candy |
| `layer-sag/` | [opencharly/layer-sag](https://github.com/opencharly/layer-sag) | image layer / candy |
| `layer-selkies-kde-desktop/` | [opencharly/layer-selkies-kde-desktop](https://github.com/opencharly/layer-selkies-kde-desktop) | image layer / candy |
| `layer-sherpa-onnx/` | [opencharly/layer-sherpa-onnx](https://github.com/opencharly/layer-sherpa-onnx) | image layer / candy |
| `layer-shortbread/` | [opencharly/layer-shortbread](https://github.com/opencharly/layer-shortbread) | image layer / candy |
| `layer-socat/` | [opencharly/layer-socat](https://github.com/opencharly/layer-socat) | charly candy: layer-socat (standalone repo of the candy de-submodule cutover) |
| `layer-songsee/` | [opencharly/layer-songsee](https://github.com/opencharly/layer-songsee) | image layer / candy |
| `layer-sqlite/` | [opencharly/layer-sqlite](https://github.com/opencharly/layer-sqlite) | image layer / candy |
| `layer-ssh-client/` | [opencharly/layer-ssh-client](https://github.com/opencharly/layer-ssh-client) | image layer / candy |
| `layer-steam/` | [opencharly/layer-steam](https://github.com/opencharly/layer-steam) | image layer / candy |
| `layer-summarize/` | [opencharly/layer-summarize](https://github.com/opencharly/layer-summarize) | image layer / candy |
| `layer-supervisord/` | [opencharly/layer-supervisord](https://github.com/opencharly/layer-supervisord) | charly candy: layer-supervisord (standalone repo of the candy de-submodule cutover) |
| `layer-sway-desktop/` | [opencharly/layer-sway-desktop](https://github.com/opencharly/layer-sway-desktop) | image layer / candy |
| `layer-sway-desktop-vnc/` | [opencharly/layer-sway-desktop-vnc](https://github.com/opencharly/layer-sway-desktop-vnc) | image layer / candy |
| `layer-tailscale/` | [opencharly/layer-tailscale](https://github.com/opencharly/layer-tailscale) | image layer / candy |
| `layer-tailscale-up/` | [opencharly/layer-tailscale-up](https://github.com/opencharly/layer-tailscale-up) | image layer / candy |
| `layer-thunar/` | [opencharly/layer-thunar](https://github.com/opencharly/layer-thunar) | image layer / candy |
| `layer-tmux/` | [opencharly/layer-tmux](https://github.com/opencharly/layer-tmux) | charly candy: layer-tmux (standalone repo of the candy de-submodule cutover) |
| `layer-typst/` | [opencharly/layer-typst](https://github.com/opencharly/layer-typst) | image layer / candy |
| `layer-unsloth/` | [opencharly/layer-unsloth](https://github.com/opencharly/layer-unsloth) | image layer / candy |
| `layer-uv/` | [opencharly/layer-uv](https://github.com/opencharly/layer-uv) | image layer / candy |
| `layer-vectorchord/` | [opencharly/layer-vectorchord](https://github.com/opencharly/layer-vectorchord) | image layer / candy |
| `layer-versatiles-fonts/` | [opencharly/layer-versatiles-fonts](https://github.com/opencharly/layer-versatiles-fonts) | image layer / candy |
| `layer-versatiles-style/` | [opencharly/layer-versatiles-style](https://github.com/opencharly/layer-versatiles-style) | image layer / candy |
| `layer-vscode/` | [opencharly/layer-vscode](https://github.com/opencharly/layer-vscode) | image layer / candy |
| `layer-wacli/` | [opencharly/layer-wacli](https://github.com/opencharly/layer-wacli) | image layer / candy |
| `layer-wf-recorder/` | [opencharly/layer-wf-recorder](https://github.com/opencharly/layer-wf-recorder) | image layer / candy |
| `layer-whisper/` | [opencharly/layer-whisper](https://github.com/opencharly/layer-whisper) | image layer / candy |
| `layer-wl-overlay/` | [opencharly/layer-wl-overlay](https://github.com/opencharly/layer-wl-overlay) | image layer / candy |
| `layer-wl-record-pixelflux/` | [opencharly/layer-wl-record-pixelflux](https://github.com/opencharly/layer-wl-record-pixelflux) | image layer / candy |
| `layer-wl-screenshot-grim/` | [opencharly/layer-wl-screenshot-grim](https://github.com/opencharly/layer-wl-screenshot-grim) | image layer / candy |
| `layer-wl-screenshot-pixelflux/` | [opencharly/layer-wl-screenshot-pixelflux](https://github.com/opencharly/layer-wl-screenshot-pixelflux) | image layer / candy |
| `layer-wl-tools/` | [opencharly/layer-wl-tools](https://github.com/opencharly/layer-wl-tools) | image layer / candy |
| `layer-workspace-mount/` | [opencharly/layer-workspace-mount](https://github.com/opencharly/layer-workspace-mount) | image layer / candy |
| `layer-xdg-portal/` | [opencharly/layer-xdg-portal](https://github.com/opencharly/layer-xdg-portal) | image layer / candy |
| `layer-xfce4-terminal/` | [opencharly/layer-xfce4-terminal](https://github.com/opencharly/layer-xfce4-terminal) | image layer / candy |
| `layer-xterm/` | [opencharly/layer-xterm](https://github.com/opencharly/layer-xterm) | image layer / candy |
| `layer-xurl/` | [opencharly/layer-xurl](https://github.com/opencharly/layer-xurl) | image layer / candy |
| `layer-yay/` | [opencharly/layer-yay](https://github.com/opencharly/layer-yay) | image layer / candy |


### Plugins

103 repos — charly plug-ins (verb/substrate providers).

| path | repo | role |
|---|---|---|
| `plugin-adb/` | [opencharly/plugin-adb](https://github.com/opencharly/plugin-adb) | charly plugin |
| `plugin-addr/` | [opencharly/plugin-addr](https://github.com/opencharly/plugin-addr) | charly plugin |
| `plugin-agent/` | [opencharly/plugin-agent](https://github.com/opencharly/plugin-agent) | charly plugin |
| `plugin-agent-pi/` | [opencharly/plugin-agent-pi](https://github.com/opencharly/plugin-agent-pi) | charly plugin |
| `plugin-agentteams/` | [opencharly/plugin-agentteams](https://github.com/opencharly/plugin-agentteams) | charly plugin |
| `plugin-alias/` | [opencharly/plugin-alias](https://github.com/opencharly/plugin-alias) | charly plugin |
| `plugin-appium/` | [opencharly/plugin-appium](https://github.com/opencharly/plugin-appium) | charly plugin |
| `plugin-authoring/` | [opencharly/plugin-authoring](https://github.com/opencharly/plugin-authoring) | charly plugin |
| `plugin-boot-kind/` | [opencharly/plugin-boot-kind](https://github.com/opencharly/plugin-boot-kind) | charly plugin: the bootloader and snapshot kinds |
| `plugin-box/` | [opencharly/plugin-box](https://github.com/opencharly/plugin-box) | charly plugin |
| `plugin-bpf/` | [opencharly/plugin-bpf](https://github.com/opencharly/plugin-bpf) | charly generic eBPF/BPF kernel plugin — command:bpf (status/lsm/config/probe) + verb:bpf check steps |
| `plugin-build/` | [opencharly/plugin-build](https://github.com/opencharly/plugin-build) | charly plugin |
| `plugin-builder/` | [opencharly/plugin-builder](https://github.com/opencharly/plugin-builder) | charly plugin |
| `plugin-builder-aur/` | [opencharly/plugin-builder-aur](https://github.com/opencharly/plugin-builder-aur) | charly plugin |
| `plugin-builder-cargo/` | [opencharly/plugin-builder-cargo](https://github.com/opencharly/plugin-builder-cargo) | charly plugin |
| `plugin-builder-npm/` | [opencharly/plugin-builder-npm](https://github.com/opencharly/plugin-builder-npm) | charly plugin |
| `plugin-builder-pixi/` | [opencharly/plugin-builder-pixi](https://github.com/opencharly/plugin-builder-pixi) | charly plugin |
| `plugin-candy/` | [opencharly/plugin-candy](https://github.com/opencharly/plugin-candy) | charly plugin |
| `plugin-candy-kind/` | [opencharly/plugin-candy-kind](https://github.com/opencharly/plugin-candy-kind) | charly plugin |
| `plugin-cardwire/` | [opencharly/plugin-cardwire](https://github.com/opencharly/plugin-cardwire) | charly plugin: cardwire (eBPF LSM GPU manager) — install + command:cardwire CLI |
| `plugin-cdp/` | [opencharly/plugin-cdp](https://github.com/opencharly/plugin-cdp) | charly plugin |
| `plugin-check/` | [opencharly/plugin-check](https://github.com/opencharly/plugin-check) | charly plugin |
| `plugin-clean/` | [opencharly/plugin-clean](https://github.com/opencharly/plugin-clean) | charly plugin |
| `plugin-cmd/` | [opencharly/plugin-cmd](https://github.com/opencharly/plugin-cmd) | charly plugin |
| `plugin-command/` | [opencharly/plugin-command](https://github.com/opencharly/plugin-command) | charly plugin |
| `plugin-cstream/` | [opencharly/plugin-cstream](https://github.com/opencharly/plugin-cstream) | charly plugin serving the cstream: check verb — session/login/frame/stats probes for charly-streamer deployme… |
| `plugin-dbus/` | [opencharly/plugin-dbus](https://github.com/opencharly/plugin-dbus) | charly plugin |
| `plugin-deploy-local/` | [opencharly/plugin-deploy-local](https://github.com/opencharly/plugin-deploy-local) | charly plugin |
| `plugin-deploy-pod/` | [opencharly/plugin-deploy-pod](https://github.com/opencharly/plugin-deploy-pod) | charly plugin |
| `plugin-deploy-vm/` | [opencharly/plugin-deploy-vm](https://github.com/opencharly/plugin-deploy-vm) | charly plugin |
| `plugin-desktop-kind/` | [opencharly/plugin-desktop-kind](https://github.com/opencharly/plugin-desktop-kind) | charly plugin: the theme, session, displaymanager and desktopentry kinds |
| `plugin-distro/` | [opencharly/plugin-distro](https://github.com/opencharly/plugin-distro) | charly plugin |
| `plugin-dns/` | [opencharly/plugin-dns](https://github.com/opencharly/plugin-dns) | charly plugin |
| `plugin-docs/` | [opencharly/plugin-docs](https://github.com/opencharly/plugin-docs) | charly plugin |
| `plugin-doctor/` | [opencharly/plugin-doctor](https://github.com/opencharly/plugin-doctor) | charly plugin |
| `plugin-dsh/` | [opencharly/plugin-dsh](https://github.com/opencharly/plugin-dsh) | charly plugin |
| `plugin-egress/` | [opencharly/plugin-egress](https://github.com/opencharly/plugin-egress) | charly plugin |
| `plugin-enc/` | [opencharly/plugin-enc](https://github.com/opencharly/plugin-enc) | charly plugin |
| `plugin-example/` | [opencharly/plugin-example](https://github.com/opencharly/plugin-example) | charly plugin |
| `plugin-example-bootstrap/` | [opencharly/plugin-example-bootstrap](https://github.com/opencharly/plugin-example-bootstrap) | charly plugin |
| `plugin-example-builder/` | [opencharly/plugin-example-builder](https://github.com/opencharly/plugin-example-builder) | charly plugin |
| `plugin-example-command/` | [opencharly/plugin-example-command](https://github.com/opencharly/plugin-example-command) | charly plugin |
| `plugin-example-deploy/` | [opencharly/plugin-example-deploy](https://github.com/opencharly/plugin-example-deploy) | charly plugin |
| `plugin-example-dispatch/` | [opencharly/plugin-example-dispatch](https://github.com/opencharly/plugin-example-dispatch) | charly plugin |
| `plugin-example-external/` | [opencharly/plugin-example-external](https://github.com/opencharly/plugin-example-external) | charly plugin |
| `plugin-example-kind/` | [opencharly/plugin-example-kind](https://github.com/opencharly/plugin-example-kind) | charly plugin |
| `plugin-example-lifecycle/` | [opencharly/plugin-example-lifecycle](https://github.com/opencharly/plugin-example-lifecycle) | charly plugin |
| `plugin-example-step/` | [opencharly/plugin-example-step](https://github.com/opencharly/plugin-example-step) | charly plugin |
| `plugin-example-stepkind/` | [opencharly/plugin-example-stepkind](https://github.com/opencharly/plugin-example-stepkind) | charly plugin |
| `plugin-example-structkind/` | [opencharly/plugin-example-structkind](https://github.com/opencharly/plugin-example-structkind) | charly plugin |
| `plugin-examplerunverb/` | [opencharly/plugin-examplerunverb](https://github.com/opencharly/plugin-examplerunverb) | charly plugin |
| `plugin-feature/` | [opencharly/plugin-feature](https://github.com/opencharly/plugin-feature) | charly plugin |
| `plugin-file/` | [opencharly/plugin-file](https://github.com/opencharly/plugin-file) | charly plugin |
| `plugin-fleet/` | [opencharly/plugin-fleet](https://github.com/opencharly/plugin-fleet) | charly plugin |
| `plugin-gpu/` | [opencharly/plugin-gpu](https://github.com/opencharly/plugin-gpu) | charly plugin |
| `plugin-group/` | [opencharly/plugin-group](https://github.com/opencharly/plugin-group) | charly plugin |
| `plugin-harness-kind/` | [opencharly/plugin-harness-kind](https://github.com/opencharly/plugin-harness-kind) | charly plugin |
| `plugin-helm/` | [opencharly/plugin-helm](https://github.com/opencharly/plugin-helm) | charly plugin |
| `plugin-herdr/` | [opencharly/plugin-herdr](https://github.com/opencharly/plugin-herdr) | charly plugin: command:herdr + verb:herdr — control a Herdr terminal-multiplexer session over its NDJSON socket API |
| `plugin-http/` | [opencharly/plugin-http](https://github.com/opencharly/plugin-http) | charly plugin |
| `plugin-init/` | [opencharly/plugin-init](https://github.com/opencharly/plugin-init) | charly plugin |
| `plugin-installstep/` | [opencharly/plugin-installstep](https://github.com/opencharly/plugin-installstep) | charly plugin |
| `plugin-interface/` | [opencharly/plugin-interface](https://github.com/opencharly/plugin-interface) | charly plugin |
| `plugin-k8sgen/` | [opencharly/plugin-k8sgen](https://github.com/opencharly/plugin-k8sgen) | charly plugin |
| `plugin-kernel-param/` | [opencharly/plugin-kernel-param](https://github.com/opencharly/plugin-kernel-param) | charly plugin |
| `plugin-kube/` | [opencharly/plugin-kube](https://github.com/opencharly/plugin-kube) | charly plugin |
| `plugin-loader/` | [opencharly/plugin-loader](https://github.com/opencharly/plugin-loader) | charly plugin |
| `plugin-marketplace/` | [opencharly/plugin-marketplace](https://github.com/opencharly/plugin-marketplace) | charly plugin |
| `plugin-matching/` | [opencharly/plugin-matching](https://github.com/opencharly/plugin-matching) | charly plugin |
| `plugin-mcp/` | [opencharly/plugin-mcp](https://github.com/opencharly/plugin-mcp) | charly plugin |
| `plugin-migrate/` | [opencharly/plugin-migrate](https://github.com/opencharly/plugin-migrate) | charly plugin |
| `plugin-mise/` | [opencharly/plugin-mise](https://github.com/opencharly/plugin-mise) | charly plugin: builder:mise + verb:mise — full mise (jdx/mise) support |
| `plugin-mount/` | [opencharly/plugin-mount](https://github.com/opencharly/plugin-mount) | charly plugin |
| `plugin-oci/` | [opencharly/plugin-oci](https://github.com/opencharly/plugin-oci) | charly plugin |
| `plugin-ollama/` | [opencharly/plugin-ollama](https://github.com/opencharly/plugin-ollama) | charly plugin |
| `plugin-omarchy/` | [opencharly/plugin-omarchy](https://github.com/opencharly/plugin-omarchy) | charly plugin: the omarchy CLI surface as a check verb |
| `plugin-package/` | [opencharly/plugin-package](https://github.com/opencharly/plugin-package) | charly plugin |
| `plugin-pod/` | [opencharly/plugin-pod](https://github.com/opencharly/plugin-pod) | charly plugin |
| `plugin-port/` | [opencharly/plugin-port](https://github.com/opencharly/plugin-port) | charly plugin |
| `plugin-preempt/` | [opencharly/plugin-preempt](https://github.com/opencharly/plugin-preempt) | charly plugin |
| `plugin-process/` | [opencharly/plugin-process](https://github.com/opencharly/plugin-process) | charly plugin |
| `plugin-punktfunk/` | [opencharly/plugin-punktfunk](https://github.com/opencharly/plugin-punktfunk) | OUT-OF-TREE charly plugin serving the punktfunk: check verb — probe and manage a punktfunk streaming host ove… |
| `plugin-quickshell/` | [opencharly/plugin-quickshell](https://github.com/opencharly/plugin-quickshell) | The quickshell: check verb — IPC against any Quickshell desktop shell |
| `plugin-record/` | [opencharly/plugin-record](https://github.com/opencharly/plugin-record) | charly plugin |
| `plugin-refs/` | [opencharly/plugin-refs](https://github.com/opencharly/plugin-refs) | charly plugin |
| `plugin-resource/` | [opencharly/plugin-resource](https://github.com/opencharly/plugin-resource) | charly plugin |
| `plugin-secrets/` | [opencharly/plugin-secrets](https://github.com/opencharly/plugin-secrets) | charly plugin |
| `plugin-service/` | [opencharly/plugin-service](https://github.com/opencharly/plugin-service) | charly plugin |
| `plugin-settings/` | [opencharly/plugin-settings](https://github.com/opencharly/plugin-settings) | charly plugin |
| `plugin-sidecar/` | [opencharly/plugin-sidecar](https://github.com/opencharly/plugin-sidecar) | charly plugin |
| `plugin-spice/` | [opencharly/plugin-spice](https://github.com/opencharly/plugin-spice) | charly plugin |
| `plugin-ssh/` | [opencharly/plugin-ssh](https://github.com/opencharly/plugin-ssh) | charly plugin |
| `plugin-status/` | [opencharly/plugin-status](https://github.com/opencharly/plugin-status) | charly plugin |
| `plugin-substrate/` | [opencharly/plugin-substrate](https://github.com/opencharly/plugin-substrate) | charly plugin |
| `plugin-tmux/` | [opencharly/plugin-tmux](https://github.com/opencharly/plugin-tmux) | charly plugin |
| `plugin-tunnel/` | [opencharly/plugin-tunnel](https://github.com/opencharly/plugin-tunnel) | charly plugin |
| `plugin-udev/` | [opencharly/plugin-udev](https://github.com/opencharly/plugin-udev) | charly plugin |
| `plugin-unit/` | [opencharly/plugin-unit](https://github.com/opencharly/plugin-unit) | charly plugin serving the unit: act/assert verb — declarative init-unit authoring (.socket/.target/.slice/dro… |
| `plugin-unix-group/` | [opencharly/plugin-unix-group](https://github.com/opencharly/plugin-unix-group) | charly plugin |
| `plugin-user/` | [opencharly/plugin-user](https://github.com/opencharly/plugin-user) | charly plugin |
| `plugin-vm/` | [opencharly/plugin-vm](https://github.com/opencharly/plugin-vm) | charly plugin |
| `plugin-vnc/` | [opencharly/plugin-vnc](https://github.com/opencharly/plugin-vnc) | charly plugin |
| `plugin-wl/` | [opencharly/plugin-wl](https://github.com/opencharly/plugin-wl) | charly plugin |


### Pods

73 repos — pod/deployment bundles.

| path | repo | role |
|---|---|---|
| `pod-agentteams-controller/` | [opencharly/pod-agentteams-controller](https://github.com/opencharly/pod-agentteams-controller) | pod / deployment bundle |
| `pod-agentteams-element/` | [opencharly/pod-agentteams-element](https://github.com/opencharly/pod-agentteams-element) | pod / deployment bundle |
| `pod-agentteams-higress/` | [opencharly/pod-agentteams-higress](https://github.com/opencharly/pod-agentteams-higress) | pod / deployment bundle |
| `pod-agentteams-manager/` | [opencharly/pod-agentteams-manager](https://github.com/opencharly/pod-agentteams-manager) | pod / deployment bundle |
| `pod-agentteams-matrix/` | [opencharly/pod-agentteams-matrix](https://github.com/opencharly/pod-agentteams-matrix) | pod / deployment bundle |
| `pod-agentteams-minio/` | [opencharly/pod-agentteams-minio](https://github.com/opencharly/pod-agentteams-minio) | pod / deployment bundle |
| `pod-agentteams-worker/` | [opencharly/pod-agentteams-worker](https://github.com/opencharly/pod-agentteams-worker) | pod / deployment bundle |
| `pod-airflow/` | [opencharly/pod-airflow](https://github.com/opencharly/pod-airflow) | pod / deployment bundle |
| `pod-android-emulator-layer/` | [opencharly/pod-android-emulator-layer](https://github.com/opencharly/pod-android-emulator-layer) | pod / deployment bundle |
| `pod-appium-server/` | [opencharly/pod-appium-server](https://github.com/opencharly/pod-appium-server) | pod / deployment bundle |
| `pod-charly-automation/` | [opencharly/pod-charly-automation](https://github.com/opencharly/pod-charly-automation) | pod / deployment bundle |
| `pod-charly-core/` | [opencharly/pod-charly-core](https://github.com/opencharly/pod-charly-core) | pod / deployment bundle |
| `pod-charly-hooks/` | [opencharly/pod-charly-hooks](https://github.com/opencharly/pod-charly-hooks) | pod / deployment bundle |
| `pod-charly-mcp/` | [opencharly/pod-charly-mcp](https://github.com/opencharly/pod-charly-mcp) | The charly-mcp candy — the charly MCP gateway pod (extracted from charly/candy) |
| `pod-charly-versa/` | [opencharly/pod-charly-versa](https://github.com/opencharly/pod-charly-versa) | pod / deployment bundle |
| `pod-check-keepalive/` | [opencharly/pod-check-keepalive](https://github.com/opencharly/pod-check-keepalive) | pod / deployment bundle |
| `pod-check-redis-init-layer/` | [opencharly/pod-check-redis-init-layer](https://github.com/opencharly/pod-check-redis-init-layer) | pod / deployment bundle |
| `pod-check-tier23-layer/` | [opencharly/pod-check-tier23-layer](https://github.com/opencharly/pod-check-tier23-layer) | pod / deployment bundle |
| `pod-chrome-cdp/` | [opencharly/pod-chrome-cdp](https://github.com/opencharly/pod-chrome-cdp) | charly candy: pod-chrome-cdp (standalone repo of the candy de-submodule cutover) |
| `pod-chrome-devtools-mcp/` | [opencharly/pod-chrome-devtools-mcp](https://github.com/opencharly/pod-chrome-devtools-mcp) | pod / deployment bundle |
| `pod-chrome-headless/` | [opencharly/pod-chrome-headless](https://github.com/opencharly/pod-chrome-headless) | pod / deployment bundle |
| `pod-cloud-init/` | [opencharly/pod-cloud-init](https://github.com/opencharly/pod-cloud-init) | pod / deployment bundle |
| `pod-comfyui/` | [opencharly/pod-comfyui](https://github.com/opencharly/pod-comfyui) | pod / deployment bundle |
| `pod-cstream/` | [opencharly/pod-cstream](https://github.com/opencharly/pod-cstream) | charly candy: the charly-streamer transport spine — streamer/gateway/broker/leader services, PAM stack, PipeW… |
| `pod-dbus/` | [opencharly/pod-dbus](https://github.com/opencharly/pod-dbus) | charly candy: pod-dbus (standalone repo of the candy de-submodule cutover) |
| `pod-dsh/` | [opencharly/pod-dsh](https://github.com/opencharly/pod-dsh) | pod / deployment bundle |
| `pod-filebrowser/` | [opencharly/pod-filebrowser](https://github.com/opencharly/pod-filebrowser) | pod / deployment bundle |
| `pod-github-runner/` | [opencharly/pod-github-runner](https://github.com/opencharly/pod-github-runner) | pod / deployment bundle |
| `pod-herdr/` | [opencharly/pod-herdr](https://github.com/opencharly/pod-herdr) | pod / deployment bundle — the herdr stack box + check-herdr-pod R10 bed |
| `pod-hermes/` | [opencharly/pod-hermes](https://github.com/opencharly/pod-hermes) | pod / deployment bundle |
| `pod-hermes-full/` | [opencharly/pod-hermes-full](https://github.com/opencharly/pod-hermes-full) | pod / deployment bundle |
| `pod-hyprland/` | [opencharly/pod-hyprland](https://github.com/opencharly/pod-hyprland) | charly candy: Hyprland as a nested compositor inside charly-streamer's Wayland parent |
| `pod-immich/` | [opencharly/pod-immich](https://github.com/opencharly/pod-immich) | pod / deployment bundle |
| `pod-immich-ml/` | [opencharly/pod-immich-ml](https://github.com/opencharly/pod-immich-ml) | pod / deployment bundle |
| `pod-jupyter/` | [opencharly/pod-jupyter](https://github.com/opencharly/pod-jupyter) | pod / deployment bundle |
| `pod-jupyter-ml/` | [opencharly/pod-jupyter-ml](https://github.com/opencharly/pod-jupyter-ml) | pod / deployment bundle |
| `pod-k8s-layer/` | [opencharly/pod-k8s-layer](https://github.com/opencharly/pod-k8s-layer) | pod / deployment bundle |
| `pod-kde-desktop/` | [opencharly/pod-kde-desktop](https://github.com/opencharly/pod-kde-desktop) | pod / deployment bundle |
| `pod-kde-selkies/` | [opencharly/pod-kde-selkies](https://github.com/opencharly/pod-kde-selkies) | pod / deployment bundle |
| `pod-labwc/` | [opencharly/pod-labwc](https://github.com/opencharly/pod-labwc) | pod / deployment bundle |
| `pod-maputnik/` | [opencharly/pod-maputnik](https://github.com/opencharly/pod-maputnik) | pod / deployment bundle |
| `pod-marimo/` | [opencharly/pod-marimo](https://github.com/opencharly/pod-marimo) | pod / deployment bundle |
| `pod-mcp-layer/` | [opencharly/pod-mcp-layer](https://github.com/opencharly/pod-mcp-layer) | pod / deployment bundle |
| `pod-nested-podman-socket/` | [opencharly/pod-nested-podman-socket](https://github.com/opencharly/pod-nested-podman-socket) | pod / deployment bundle |
| `pod-ollama/` | [opencharly/pod-ollama](https://github.com/opencharly/pod-ollama) | pod / deployment bundle |
| `pod-openclaw/` | [opencharly/pod-openclaw](https://github.com/opencharly/pod-openclaw) | pod / deployment bundle |
| `pod-openwebui/` | [opencharly/pod-openwebui](https://github.com/opencharly/pod-openwebui) | pod / deployment bundle |
| `pod-os-layer/` | [opencharly/pod-os-layer](https://github.com/opencharly/pod-os-layer) | pod / deployment bundle |
| `pod-osm-tools/` | [opencharly/pod-osm-tools](https://github.com/opencharly/pod-osm-tools) | pod / deployment bundle |
| `pod-pipewire/` | [opencharly/pod-pipewire](https://github.com/opencharly/pod-pipewire) | charly candy: pod-pipewire (standalone repo of the candy de-submodule cutover) |
| `pod-pmtiles-viewer/` | [opencharly/pod-pmtiles-viewer](https://github.com/opencharly/pod-pmtiles-viewer) | pod / deployment bundle |
| `pod-postgresql/` | [opencharly/pod-postgresql](https://github.com/opencharly/pod-postgresql) | pod / deployment bundle |
| `pod-qemu-guest-agent/` | [opencharly/pod-qemu-guest-agent](https://github.com/opencharly/pod-qemu-guest-agent) | pod / deployment bundle |
| `pod-redis/` | [opencharly/pod-redis](https://github.com/opencharly/pod-redis) | pod / deployment bundle |
| `pod-redis-client-layer/` | [opencharly/pod-redis-client-layer](https://github.com/opencharly/pod-redis-client-layer) | pod / deployment bundle |
| `pod-redis-server-layer/` | [opencharly/pod-redis-server-layer](https://github.com/opencharly/pod-redis-server-layer) | pod / deployment bundle |
| `pod-selkies/` | [opencharly/pod-selkies](https://github.com/opencharly/pod-selkies) | charly candy: pod-selkies (standalone repo of the candy de-submodule cutover) |
| `pod-selkies-core/` | [opencharly/pod-selkies-core](https://github.com/opencharly/pod-selkies-core) | pod / deployment bundle |
| `pod-selkies-desktop/` | [opencharly/pod-selkies-desktop](https://github.com/opencharly/pod-selkies-desktop) | pod / deployment bundle |
| `pod-sshd/` | [opencharly/pod-sshd](https://github.com/opencharly/pod-sshd) | pod / deployment bundle |
| `pod-sway/` | [opencharly/pod-sway](https://github.com/opencharly/pod-sway) | charly candy: pod-sway (standalone repo of the candy de-submodule cutover) |
| `pod-swaync/` | [opencharly/pod-swaync](https://github.com/opencharly/pod-swaync) | pod / deployment bundle |
| `pod-testapi/` | [opencharly/pod-testapi](https://github.com/opencharly/pod-testapi) | pod / deployment bundle |
| `pod-traefik/` | [opencharly/pod-traefik](https://github.com/opencharly/pod-traefik) | pod / deployment bundle |
| `pod-unsloth-studio/` | [opencharly/pod-unsloth-studio](https://github.com/opencharly/pod-unsloth-studio) | pod / deployment bundle |
| `pod-valkey/` | [opencharly/pod-valkey](https://github.com/opencharly/pod-valkey) | pod / deployment bundle |
| `pod-versatiles/` | [opencharly/pod-versatiles](https://github.com/opencharly/pod-versatiles) | pod / deployment bundle |
| `pod-versatiles-frontend/` | [opencharly/pod-versatiles-frontend](https://github.com/opencharly/pod-versatiles-frontend) | pod / deployment bundle |
| `pod-virtualization/` | [opencharly/pod-virtualization](https://github.com/opencharly/pod-virtualization) | pod / deployment bundle |
| `pod-waybar/` | [opencharly/pod-waybar](https://github.com/opencharly/pod-waybar) | pod / deployment bundle |
| `pod-waybar-labwc/` | [opencharly/pod-waybar-labwc](https://github.com/opencharly/pod-waybar-labwc) | pod / deployment bundle |
| `pod-wayvnc/` | [opencharly/pod-wayvnc](https://github.com/opencharly/pod-wayvnc) | pod / deployment bundle |
| `pod-web-layer/` | [opencharly/pod-web-layer](https://github.com/opencharly/pod-web-layer) | pod / deployment bundle |


### VMs

3 repos.

| path | repo | role |
|---|---|---|
| `vm-charly-vm/` | [opencharly/vm-charly-vm](https://github.com/opencharly/vm-charly-vm) | VM image definition |
| `vm-k3s-agent/` | [opencharly/vm-k3s-agent](https://github.com/opencharly/vm-k3s-agent) | VM image definition |
| `vm-k3s-server/` | [opencharly/vm-k3s-server](https://github.com/opencharly/vm-k3s-server) | VM image definition |

## Pinning — the umbrella tracks charly's graph

Every submodule is pinned to a specific commit (a gitlink). The policy (`policy B`):

1. `charly` → its own default-branch HEAD (`main`).
2. `distro-*` → **exactly the commits charly's own
   gitlinks pin** (charly's `box/<distro>` maps to `distro-<distro>` here). The umbrella
   therefore means *"the org exactly as charly sees it"* — one coherent snapshot.
3. Every other repo (the `sdk`, `spec`, `marketplace`, `docs`, `charly-*`, `pkg-*`,
   `layer-*`, `plugin-*`, `pod-*`, `vm-*` families, `pi-review-action`, `pixelflux`,
   `gst-wayland-display`, `dotgithub`, …) → its own default-branch HEAD
   (`av1` for `pixelflux`, `stable` for `gst-wayland-display`). (`sdk`, `spec` and
   `docs` are no longer charly-pinned — `sdk` and `spec` resolve from the Go proxy at
   pinned go.mod requires since the de-submodule cutovers (spec: charly#371; sdk:
   mirroring it), and `docs` pins charly in ITS .gitmodules since the docs
   de-submodule cutover, so they follow the every-other-repo rule.)

`.gitmodules` carries `branch = <repo default>` on every entry; nothing ever assumes
`main` — defaults are resolved via `git ls-remote --symref`, so a future default-branch
rename keeps working.

The daily `sync` workflow runs `scripts/sync-gitlinks.sh`, opens a `chore: sync
gitlinks` PR when anything moved, and the org-wide validation chain lands it:
`charly/pr-validator` runs the fresh AI validator (`pi-review-action`) and
enables native auto-merge on PASS; `tag-on-merge` tags the merged snapshot —
same discipline as charly. There is no CI gate: an audit found the verify
workflow's assertions were either created by `actions/checkout` itself or already
enforced by their consumer, so it was deleted. The assertions a commit can actually
violate — policy B, the pi-extension parse, harness parity — run in `hooks/pre-commit`
(`task hooks` to install); the full pinning audit stays available as `task verify`.

## House rules

- **Never edit inside a submodule.** Changes land via PR to the owning repo; this repo
  only bumps gitlinks.
- **Git ops on submodules go through `git -C <path>`** — never root a worker in a
  submodule.
- **No `go.work` at the umbrella root.** `charly/` has its own workspace spanning
  the charly module + the compiled plugin candies (the sdk + spec contract modules
  resolve from the Go proxy at pinned go.mod requires — no workspace members); Go
  forbids nested workspace files. All Go work happens inside
  `charly/`.
- **Pin only merged refs** — never a PR branch. `verify` fails on dangling pins.
- Read each subrepo's own `README.md` / `AGENTS.md` before editing inside it.

## AI & harness parity

This repo runs the same agent harness config and discipline as `charly/` — pi
(`.pi/`, same packages), Claude Code (`.claude/`), opencode
(`opencode.json`), reasonix (`reasonix.toml`), and skills (the marketplace repo —
each harness loads it natively). See `HARNESS-PARITY.md` for the full map.
`AGENTS.md`/`CLAUDE.md` own the umbrella rulebook; `charly/AGENTS.md` owns charly's.
Shared gate scripts are diff-checked by `scripts/check-harness-parity.sh`.

## Helpers

```
task map      # list every submodule with its pin and sync state
task sync     # run scripts/sync-gitlinks.sh (preview a pin bump)
task hooks    # install hooks/pre-commit for this clone (do this once)
task verify   # run scripts/verify-pins.sh (the full pinning audit, on demand)
task harness  # run scripts/check-harness-parity.sh (harness config vs charly/)
```

`--depth 1` keeps the clone light (~50 MB of working trees):

```
git clone --recurse-submodules --depth 1 https://github.com/opencharly/opencharly.git
```

## License

MIT — see [LICENSE](LICENSE). Each submodule is governed by its own repository's
license.
