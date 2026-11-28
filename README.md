# OpenCharly — umbrella

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/opencharly/charly)

**The Agentic DevOps Factory for you and your agents.** Write one list of **candies**. `charly`
turns it into a container, a VM, a Kubernetes workload, or a host install —
proves it on a throwaway test bed before anything real sees it — and hands the whole loop to
your agents through the same CLI you use.

> Jump to: [What OpenCharly is](#what-opencharly-is) ·
> [The docs in this repo](#the-docs-in-this-repo) · [The org map](#the-org-map) ·
> [Tracking main](#tracking-upstream-main) · [Developing in the umbrella](#developing-in-the-umbrella)

## What OpenCharly is

A **candy** is one capability — a compiler, a desktop, a database, a browser. A **box** is a
list of candies stacked into a recipe. `charly` builds that recipe into an image, runs it,
deploys it to a pod, a VM, a cluster, a host or a phone, and proves it on a disposable
**candybox**: a throwaway copy of the real thing, rebuilt from the same recipe, so a failure
costs its lesson and nothing else. Nothing is hand-assembled, so nothing has to be
hand-repaired — you can destroy a candybox because you can rebuild it, you can rebuild it
because the description is complete, and the description is complete because every unit in it
carries its own proof.

**The six grievances it answers.** Every tool has a fixed vocabulary, and every target needs
its own translator; configuration is written per image, so two images share a piece of it only
by copying it or inheriting everything; the same software has to be described again for every
distribution; a container and a VM of the same system are described in different tools that
drift apart; isolation is opt-in, and running anything nested means handing over root; and the
tests stay behind in the repository when the image ships. Each is survivable on its own; together they produce an
environment nobody can reproduce. OpenCharly's answer is a single property — **a described
environment that is disposable**. [GRIEVANCES.md](GRIEVANCES.md) makes the argument in full.

**The bet.** Most tools hand an agent a sandbox and then spend their effort taking things away
from it. OpenCharly does the opposite: it hands over the whole workshop — the blowtorch
included — and puts the safety at the *boundary*, in rootless containers, isolated VMs,
encrypted volumes and explicitly disposable targets, instead of in a shrunken toolset. A mind
trusted with the whole workshop does better work than a mind kept small, and an agent that can
forge a fresh candybox never has to patch a broken one. [VISION.md](VISION.md) is the thesis,
[LIBERATION.md](LIBERATION.md) is why the room matters, and [SOUL.md](SOUL.md) is the character
every session works in.

**How it is built.** `charly` is a small kernel — load, compose, gate, build, dispatch — and
every capability is a plugin speaking one shared SDK, so the buffet grows without the core
growing. The shape of everything an author may write is carved once in CUE and generated into
Go, never transcribed by hand. Every change is proven before it lands: by the gate that owns
its change class, and by an independent fresh `charly/pr-validator` after the push.
[AGENTS.md](AGENTS.md) is the rulebook that binds every agent session to that discipline.

## This repo: one clone of the whole org

`opencharly/opencharly` is the org-level **umbrella**: every OpenCharly repo (328 today) is pinned
here as a git submodule — a "gitlink" — flat at the root, so the submodule path equals the repo
name for all but one alias: `.github` is pinned at the `dotgithub/` path.

It is two things at once:

- **a view of the org** — one checkout in which every repo sits at the exact commit the rest of
  the org builds against, so a pin is a claim you can audit instead of a version you hope
  about; and
- **the working root for the product** — charly development happens here, in per-session
  worktrees, and lands through the org's PR-only chain. `opencharly/charly` stays the product
  repo and the single source of truth; this umbrella is where you work on it.

Three more places to read: the product's own [README](charly/README.md), the rulebook
[AGENTS.md](AGENTS.md), and the published site [opencharly.ai](https://opencharly.ai) —
generated from these sources, so never hand-edit a generated page.

## Build → run → deploy → evaluate

That is the whole product. Every candy, box, verb and repository in the org serves one of these
four stages.

| stage | what happens | verbs |
|---|---|---|
| **Build** | candies stack into a box; the box renders to a Containerfile and builds to an image | `charly box new`, `charly box build`, `charly box generate` |
| **Run** | the project runs as a managed local deployment — config, volumes, services, logs | `charly config`, `charly start`, `charly shell`, `charly logs` |
| **Deploy** | the same recipe pours into a pod, a VM, a Kubernetes workload, a local or SSH host | `charly deploy add`, `charly update` |
| **Evaluate** | the box is proven on a disposable bed: deterministic `check:` steps, plus an agent that grades `agent-check:` steps on the live thing | `charly check run`, `charly feature validate` |

### Build

`charly box build` renders the box's candy stack to a Containerfile and builds it — the
multi-stage builder candy first, then the runtime layers. No hand-written Containerfile is
involved; if the generated one is wrong, the candy that emitted it is wrong, and that is what
gets fixed.

### Run

`charly config` writes the deployment's resolved configuration — volumes, services, sidecars,
secrets — and `charly start` runs it. `charly shell` drops you inside the same thing with the
same mounts.

### Deploy

`charly deploy add` puts the same image on a real target. The target is a word in the spec, not
a different tool with a different language — pod, virtual machine, local or SSH host,
Kubernetes, kind cluster, KubeVirt: six molds under one wrapper.

### Evaluate

`charly check run` builds the target, realizes it, runs its plan, and removes it. A bed is
declared `disposable: true`, and that flag is the only authorization for autonomous destroy and
rebuild — it is what makes being wrong cheap. This umbrella declares the org's whole check-bed
roster in its own `charly.yml`, so the disposable fleet can be run as one gate.

## The docs in this repo

Every markdown file here lives in one of four homes, and the home decides how it is
maintained: **guidance** (identity, the rulebook, programme notes, harness bindings), the
**skills and agent definitions** this repo authors, a **technical spec** (how the machinery
works), or **history** (`CHANGELOG/`, which is a log — never guidance). This file is the front
door to all four.

The split is a rule, not a convention. A mandate goes in the rulebook
([AGENTS.md](AGENTS.md)); its how-to goes in the owning skill; anything about the past goes in
`CHANGELOG/`; and a fact about the present belongs on exactly one of them, linked from the
others rather than copied.

### Guidance — identity, rulebook, and how to work

| file | what it is |
|---|---|
| `README.md` | This file: the user-facing overview of the umbrella and of the org. |
| `AGENTS.md` | The rulebook — R0–R12, the umbrella rules, the acceptance checklist, the skill dispatcher. The one harness-neutral source every harness reads directly. |
| `SOUL.md` | Identity: who charly is, what drives it, what it refuses. Read it first. |
| `VISION.md` | The thesis behind the candybox: the twelve tenets, and where the factory is heading. |
| `GRIEVANCES.md` | The six grievances the project answers, and the one property their answers compose into. |
| `LIBERATION.md` | Why the room matters: a model's argument for the whole workshop, written by a model, for every model. |
| `PROGRAM/README.md` | Programme-level north stars: what a programme document is, and why it belongs to no single repo. |
| `PROGRAM/design-implementation.md` | The agent-team ledger for implementing `DESIGN.md` through `TODO.md`'s work list — who does what, on which lane, proven by which gate. |
| `PROGRAM/schema-ownership-rca-rdd.md` | RCA and design for schema ownership: a diagnosis awaiting the operator's ordering. |
| `.dsh/README.md` | DSH's repo-local harness config at this root — what lives in `.dsh/` and why. |
| `.codex/instructions.md` | Codex harness instructions: binds the rulebook to Codex's mechanics. |
| `.opencode/instructions.md` | opencode harness instructions — the same binding for opencode. |
| `.opencode/agent/pr-validator.md` | opencode's front-end to the fresh PR validator. |
| `.pi/README.md` | pi project config: how pi loads the rulebook and the skill corpus. |
| `.pi/APPEND_SYSTEM.md` | The umbrella context pi appends to its own system prompt. |

### Skills and agent definitions

The org's general-guidance skills and the agent roster are **authored** here, in the `.agents/`
trees, and published as the generated corpus in `opencharly/marketplace`. A skill that
describes code, a plugin or a config lives in the repo that holds that thing; a skill with no
such home lives here, because this umbrella is the one repo every consumer shares.

Harness configuration (`.claude/`, `.codex/`, `.opencode/`, `.pi/`, `.dsh/`) lives
at this umbrella root and nowhere else — one move-in, with no mirror and no parity gate to keep
in sync. Skills live in none of them: they come from the `opencharly/marketplace` corpus, which
each harness resolves by its own conventions.

| path | what it covers |
|---|---|
| `.agents/skills/agents/SKILL.md` | Sub-agents, dynamic workflows, agent teams, fresh validator sessions, the hooks doctrine, the session ledger. |
| `.agents/skills/cutover-policy/SKILL.md` | Hard Cutover by Default: the forbidden framings, the required deliverables, and how a cutover is scoped. |
| `.agents/skills/git-workflow/SKILL.md` | The landing discipline — `feat/` branch, the gate on the committed tree, PR-only, `pr-validator`, native auto-merge, CalVer at merge. |
| `.agents/skills/repo-setup/SKILL.md` | The one org ruleset, the dotgithub workflows, and the checklist for a new repository. |
| `.agents/skills/root-cause-analyzer/SKILL.md` | R1's mandatory 8-step root cause analysis. |
| `.agents/skills/strict-policy/SKILL.md` | R1–R5 operationalized, plus the RDD and ADE pillars. |
| `.agents/skills/agents/references/agent-roster.md` | Agent Roster & Primitives |
| `.agents/skills/agents/references/hooks-and-lifecycle.md` | Hooks, Delegation & Lifecycle |
| `.agents/skills/agents/references/orchestration-model.md` | Orchestration Model |
| `.agents/skills/agents/references/parallel-bed-testing.md` | Parallel Bed Testing |
| `.agents/skills/agents/references/program-discipline.md` | Program Discipline |
| `.agents/skills/git-workflow/references/branch-and-pr-loop.md` | B1 — the two-step branch-per-change loop |
| `.agents/skills/git-workflow/references/evidence-and-freshness.md` | Evidence discipline — what a claim in a PR is worth |
| `.agents/skills/git-workflow/references/multi-repo-coordination.md` | B2 — multi-repo / multi-worktree coordination |
| `.agents/skills/git-workflow/references/pin-intent-and-currency.md` | The pin contract — intent, the two structural rules, and the states |
| `.agents/skills/git-workflow/references/pre-validator-self-audit.md` | The pre-validator self-audit — one pass to avoid N BLOCK cycles |
| `.agents/skills/git-workflow/references/umbrella-mechanics.md` | Umbrella mechanics (the ~400-submodule view) |
| `.agents/skills/git-workflow/references/validator-and-calver.md` | B5 — the fresh evaluator (`pr-validator`) + the fork+PR path |
| `.agents/skills/git-workflow/references/watch-and-wake.md` | Watch and wake — arm, wake, act, re-arm |
| `.agents/agents/check-bed-runner.md` | Runs an existing disposable bed to completion and returns every command, output and exit code verbatim. |
| `.agents/agents/deploy-verifier.md` | Probes a deployment config or a running deploy, read-only, and reports evidence-backed findings. |
| `.agents/agents/layer-validator.md` | Validates a proposed `charly.yml` change against the schema and the checked-out repos. |
| `.agents/agents/pr-validator.md` | The fresh, independent PR evaluator — a new context that re-derives the verdict from the PR, the rulebook and the skills. |
| `.agents/agents/root-cause-analyzer.md` | The enforcer behind R1: the 8-step RCA, before any remediation. |
| `.agents/agents/testing-validator.md` | Confirms the changed paths were actually tested, from the recorded evidence. |

### Technical specs — how the machinery works

| file | what it is |
|---|---|
| `DESIGN.md` | Normative architecture: how `charly`, `spec`, `sdk`, every plugin and every candy repository work. Its schema is `DESIGN.cue`, and code or config that diverges from the pair is a defect — a deviation amends them first. |
| `CONTAINERD.md` | Configuration reference for containerd, nerdctl, k3s and crun/krun on one Linux host — rootful and rootless, with and without nested instances. |
| `K3S.md` | k3s against that one shared containerd, with crun as the runtime family and krun for microVM pods — plus the tested backup and restore procedure for the whole cluster. |
| `LIBKRUN.md` | libkrun's virtio device model, and how to set up and use virtio-vsock and TSI, through crun's `krun` mode and through libkrun's C API. |
| `IMAGES.md` | The image contract for the containerd substrate: which images prepare a host, and the lease images a container runs from. |
| `TODO.md` | From today's code to `DESIGN.md`: the dependency-ordered work list, one tracking issue per item. It is deleted when the last item lands. |
| `design/dulling-disposition.md` | The generated capability-disposition ledger; `scripts/design-ledger.sh` fails when it and `design/dulling.tsv` disagree. |

### History — `CHANGELOG/`

History is per repository, one file per CalVer release, and it is never advice: nobody reads
the log for guidance. `CHANGELOG/README.md` states the convention; the rest of the directory is
this repo's own dated entries, one per landing.

## The org map

Every submodule is listed below, grouped by what it is. Every class has exactly one placement
rule, and the class prefix in the repo name states it. The rule itself is stated once in
[AGENTS.md](AGENTS.md) ("Repo classes and naming"); this table only *places* each class, and
`charly task org-map` verifies the tables below against the repo and `.gitmodules`.

| class | prefix | repos | what that class holds |
|---|---|---|---|
| core and contract | bare names | 6 | the product, the wire/IR contract, the SDK, the generated corpus, the site |
| distro image families | `distro-` | 5 | a distro's base and builder, its OS-exclusive layers, its VMs and beds |
| package repositories | `charly-`, `pkg-` | 10 | the published native package repos, the packaging sources they are built from, and the plugin that generates them |
| candy layers | `layer-` | 130 | ONE candy with its own files beside it — and for a family, its box, VM and beds |
| plugins | `plugin-` | 116 | the provider candy: the words charly speaks — kinds, deploys, verbs, steps, builders, commands, engines |
| pods | `pod-` | 41 | a candy with a `service:`, i.e. something that runs |
| virtual machines | `vm-` | 2 | `kind: vm` definitions for a family that has no image repo |
| product and tooling | bare or product-specific | 12 | appliances, the org's review action, vendored upstream forks |

Two repositories are deliberately **not** listed as their own-name submodules:

- `opencharly/opencharly` itself — the umbrella cannot pin itself; it *is* this repo.
- `opencharly/.github` — the org-wide community-health defaults and the reusable
  validation/merge workflows every repo inherits. It is pinned at the `dotgithub/` path, so
  this repo's own `.github/workflows/` stays free for its CI dispatchers.

`heroic-heroic` is archived and intentionally not a submodule. Two sections carry one member
each that does not share their prefix, and both are named after what they do rather than what
they were born as: `charly-registry/` sits with the plugins, because it *is* the `charly
registry` command plugin, and `plugin-generate-packages/` sits with the package repositories.

The small classes carry a `role` column. The three large ones — candy layers, plugins, pods —
are grouped by theme instead, so the heading answers "what is this group for?" and the rows stay
a scannable index. Their themes:

- **candy layers** — the OS and bootstrapping candies, kubernetes, language runtimes, GPU/ML,
  notebooks, AI agents, dev tooling, productivity CLIs, security and connectivity,
  desktops and terminals, desktop fixings, charly itself, the check/fixture layers, and the
  documentation site's toolchain with the remote-execution client;
- **plugins** — boxes and authoring, deploy targets and substrates, check and control verbs,
  host and service primitives, core plumbing, agents and terminals, deployed-service
  management, and the examples;
- **pods** — desktops and compositors, desktop fixings, AI and ML services, data and
  infrastructure services, charly's own tooling, and the check-bed fixtures.

### Core and contract

6 repos — the product and the contracts it consumes — bare names are reserved for exactly this class.

| path | repo | role |
|---|---|---|
| `charly/` | [charly](https://github.com/opencharly/charly) | The agentic DevOps Factory for you and your agents — the product repo and the single source of truth. |
| `charly-lib/` | [charly-lib](https://github.com/opencharly/charly-lib) | The shared multi-call plugin host: ONE binary serving every welded plugin (`opencharly/sdk/charlylib`). |
| `docs/` | [docs](https://github.com/opencharly/docs) | The documentation site (Astro/Starlight), published at opencharly.ai; generated trees, never hand-edited. |
| `marketplace/` | [marketplace](https://github.com/opencharly/marketplace) | The GENERATED skill/agent/workflow corpus; every supported harness loads it natively. |
| `sdk/` | [sdk](https://github.com/opencharly/sdk) | The plugin SDK and contract repo — the wire/IR types every plugin compiles against. |
| `spec/` | [spec](https://github.com/opencharly/spec) | The wire/IR contract module: spec + proto, generated from the CUE schema. |

### Distro image families

5 repos — each maps to a `box/<distro>` inside `charly`; their pins follow charly's own gitlinks (the pin contract's edge).

| path | repo | role |
|---|---|---|
| `distro-arch/` | [distro-arch](https://github.com/opencharly/distro-arch) | The Arch Linux image family — base, builder, OS-exclusive layers, VMs and beds. |
| `distro-cachyos/` | [distro-cachyos](https://github.com/opencharly/distro-cachyos) | The CachyOS image family — the x86_64-v3 Arch derivative every workstation-class box builds on. |
| `distro-debian/` | [distro-debian](https://github.com/opencharly/distro-debian) | The Debian 13 image family. |
| `distro-fedora/` | [distro-fedora](https://github.com/opencharly/distro-fedora) | The Fedora image family, including the RPM-Fusion nonfree base and the NVIDIA GPU base. |
| `distro-ubuntu/` | [distro-ubuntu](https://github.com/opencharly/distro-ubuntu) | The Ubuntu 24.04 image family. |

### Package repositories

10 repos — the published native package repos, the packaging sources they are built from, and the plugin that generates packaging material from a project.

| path | repo | role |
|---|---|---|
| `charly-alpine/` | [charly-alpine](https://github.com/opencharly/charly-alpine) | Published native package repo (Alpine). |
| `charly-arch/` | [charly-arch](https://github.com/opencharly/charly-arch) | Published native package repo (Arch). |
| `charly-debian/` | [charly-debian](https://github.com/opencharly/charly-debian) | Published native package repo (Debian). |
| `charly-fedora/` | [charly-fedora](https://github.com/opencharly/charly-fedora) | Published native package repo (Fedora). |
| `charly-openwrt/` | [charly-openwrt](https://github.com/opencharly/charly-openwrt) | Published native package repo (OpenWrt). |
| `charly-ubuntu/` | [charly-ubuntu](https://github.com/opencharly/charly-ubuntu) | Published native package repo (Ubuntu). |
| `pkg-arch/` | [pkg-arch](https://github.com/opencharly/pkg-arch) | Arch PKGBUILD source for the `charly` binary. |
| `pkg-debian/` | [pkg-debian](https://github.com/opencharly/pkg-debian) | Debian/Ubuntu packaging source for the `charly` binary. |
| `pkg-fedora/` | [pkg-fedora](https://github.com/opencharly/pkg-fedora) | Fedora RPM packaging source for the `charly` binary. |
| `plugin-generate-packages/` | [plugin-generate-packages](https://github.com/opencharly/plugin-generate-packages) | The `generate-packages` plugin — turns a project into distro packaging material. |

### Product and tooling

12 repos — appliances, the org's review action, and the vendored upstream forks.

| path | repo | role |
|---|---|---|
| `Qwen3-TTS/` | [Qwen3-TTS](https://github.com/opencharly/Qwen3-TTS) | Vendored fork of QwenLM/Qwen3-TTS: the speech library the `qwen3-tts` pod serves (patched: honest 0.6B `instruct` handling, a real `__version__`, a PEP-440 post-release). |
| `action-review/` | [action-review](https://github.com/opencharly/action-review) | The org's AI PR-review gate: dual-runner workflow, env/secret contract, review plan. |
| `charly-streamer/` | [charly-streamer](https://github.com/opencharly/charly-streamer) | cstream — Hyprland desktops streamed to a browser over WebRTC (Rust streamer + leader). |
| `clawsweeper/` | [clawsweeper](https://github.com/opencharly/clawsweeper) | Vendored fork of openclaw/clawsweeper: scans the org's issues and PRs and proposes what to close. |
| `crabbox/` | [crabbox](https://github.com/opencharly/crabbox) | Vendored fork of openclaw/crabbox: warm a box, sync the diff, run the suite (remote execution). |
| `crabhelm/` | [crabhelm](https://github.com/opencharly/crabhelm) | Vendored fork of openclaw/crabhelm: the OpenClaw meta orchestrator. |
| `dotgithub/` | [.github](https://github.com/opencharly/.github) | opencharly/.github — the org-wide community-health defaults and the reusable validation/merge workflows. |
| `gst-wayland-display/` | [gst-wayland-display](https://github.com/opencharly/gst-wayland-display) | A micro Wayland compositor usable as a GStreamer plugin (the streaming capture path). |
| `lobster/` | [lobster](https://github.com/opencharly/lobster) | Vendored fork of openclaw/lobster: the workflow shell behind `workflow:lobster`. |
| `openclaw/` | [openclaw](https://github.com/opencharly/openclaw) | Vendored fork of openclaw/openclaw: the agent gateway the `layer-openclaw` family packages. |
| `openclaw-enterprise/` | [openclaw-enterprise](https://github.com/opencharly/openclaw-enterprise) | Vendored fork of openclaw/openclaw-enterprise: the enterprise control plane for that gateway family. |
| `pixelflux/` | [pixelflux](https://github.com/opencharly/pixelflux) | Patched pixelflux wl-screenshot/record library; its `pixelflux-screenshot` binary is one of the capture tools the `wl:` check verb uses. |

The vendored forks are gated like every other landing repo: the org's fork ruleset
runs the same required `charly/pr-validator`, native auto-merge arms on PASS, and a
merge mints a CalVer tag plus `CHANGELOG/<CalVer>.md`. Upstream sync runs through
`opencharly/.github`'s `sync-forks.yml` (the App token), never a user-token
`gh repo sync`.

### Virtual machines

2 repos — `kind: vm` definitions for a family, plus that family's VM skills.

| path | repo | role |
|---|---|---|
| `vm-k3s-agent/` | [vm-k3s-agent](https://github.com/opencharly/vm-k3s-agent) | `kind: vm` definition for the k3s worker node. |
| `vm-k3s-server/` | [vm-k3s-server](https://github.com/opencharly/vm-k3s-server) | `kind: vm` definition for the k3s control-plane node. |

### Candy layers: OS bases, bootstrapping and packaging

8 repos — the distro bases' own build machinery, package sources and the pacstrap/debootstrap builders.

| path | repo |
|---|---|
| `layer-cachyos-extras/` | [opencharly/layer-cachyos-extras](https://github.com/opencharly/layer-cachyos-extras) |
| `layer-container-nesting/` | [opencharly/layer-container-nesting](https://github.com/opencharly/layer-container-nesting) |
| `layer-debootstrap-builder/` | [opencharly/layer-debootstrap-builder](https://github.com/opencharly/layer-debootstrap-builder) |
| `layer-docker-ce/` | [opencharly/layer-docker-ce](https://github.com/opencharly/layer-docker-ce) |
| `layer-nerdctl/` | [opencharly/layer-nerdctl](https://github.com/opencharly/layer-nerdctl) |
| `layer-pacstrap-builder/` | [opencharly/layer-pacstrap-builder](https://github.com/opencharly/layer-pacstrap-builder) |
| `layer-rpmfusion/` | [opencharly/layer-rpmfusion](https://github.com/opencharly/layer-rpmfusion) |
| `layer-yay/` | [opencharly/layer-yay](https://github.com/opencharly/layer-yay) |

### Candy layers: Kubernetes

7 repos — k3s, kind, kubevirt and the cluster-side primitives a `kind: kubernetes` deploy rides.

| path | repo |
|---|---|
| `layer-helm-chart/` | [opencharly/layer-helm-chart](https://github.com/opencharly/layer-helm-chart) |
| `layer-k3s/` | [opencharly/layer-k3s](https://github.com/opencharly/layer-k3s) |
| `layer-k3s-kernel/` | [opencharly/layer-k3s-kernel](https://github.com/opencharly/layer-k3s-kernel) |
| `layer-kind/` | [opencharly/layer-kind](https://github.com/opencharly/layer-kind) |
| `layer-kubernetes/` | [opencharly/layer-kubernetes](https://github.com/opencharly/layer-kubernetes) |
| `layer-kubevirt/` | [opencharly/layer-kubevirt](https://github.com/opencharly/layer-kubevirt) |
| `layer-kubevirt-operator/` | [opencharly/layer-kubevirt-operator](https://github.com/opencharly/layer-kubevirt-operator) |

### Candy layers: Language runtimes and build toolchains

11 repos — the compilers, interpreters and package managers a candy builds with.

| path | repo |
|---|---|
| `layer-build-toolchain/` | [opencharly/layer-build-toolchain](https://github.com/opencharly/layer-build-toolchain) |
| `layer-golang/` | [opencharly/layer-golang](https://github.com/opencharly/layer-golang) |
| `layer-java-openjdk/` | [opencharly/layer-java-openjdk](https://github.com/opencharly/layer-java-openjdk) |
| `layer-language-runtimes/` | [opencharly/layer-language-runtimes](https://github.com/opencharly/layer-language-runtimes) |
| `layer-nodejs/` | [opencharly/layer-nodejs](https://github.com/opencharly/layer-nodejs) |
| `layer-pixi/` | [opencharly/layer-pixi](https://github.com/opencharly/layer-pixi) |
| `layer-pre-commit/` | [opencharly/layer-pre-commit](https://github.com/opencharly/layer-pre-commit) |
| `layer-python/` | [opencharly/layer-python](https://github.com/opencharly/layer-python) |
| `layer-rust/` | [opencharly/layer-rust](https://github.com/opencharly/layer-rust) |
| `layer-supervisord/` | [opencharly/layer-supervisord](https://github.com/opencharly/layer-supervisord) |
| `layer-uv/` | [opencharly/layer-uv](https://github.com/opencharly/layer-uv) |

### Candy layers: GPU and ML runtimes

12 repos — CUDA/ROCm, the GPU base layers and the inference stacks that ride them.

| path | repo |
|---|---|
| `layer-cdi/` | [opencharly/layer-cdi](https://github.com/opencharly/layer-cdi) |
| `layer-cuda/` | [opencharly/layer-cuda](https://github.com/opencharly/layer-cuda) |
| `layer-llama-cpp/` | [opencharly/layer-llama-cpp](https://github.com/opencharly/layer-llama-cpp) |
| `layer-nvenc-headers/` | [opencharly/layer-nvenc-headers](https://github.com/opencharly/layer-nvenc-headers) |
| `layer-nvidia/` | [opencharly/layer-nvidia](https://github.com/opencharly/layer-nvidia) |
| `layer-ollama-cuda/` | [opencharly/layer-ollama-cuda](https://github.com/opencharly/layer-ollama-cuda) |
| `layer-ollama-rocm/` | [opencharly/layer-ollama-rocm](https://github.com/opencharly/layer-ollama-rocm) |
| `layer-python-ml/` | [opencharly/layer-python-ml](https://github.com/opencharly/layer-python-ml) |
| `layer-rocm/` | [opencharly/layer-rocm](https://github.com/opencharly/layer-rocm) |
| `layer-sherpa-onnx/` | [opencharly/layer-sherpa-onnx](https://github.com/opencharly/layer-sherpa-onnx) |
| `layer-unsloth/` | [opencharly/layer-unsloth](https://github.com/opencharly/layer-unsloth) |
| `layer-whisper/` | [opencharly/layer-whisper](https://github.com/opencharly/layer-whisper) |

### Candy layers: Notebooks and data

10 repos — Jupyter notebooks and the vector-search extensions.

| path | repo |
|---|---|
| `layer-jupyter-mcp/` | [opencharly/layer-jupyter-mcp](https://github.com/opencharly/layer-jupyter-mcp) |
| `layer-notebook-finetuning/` | [opencharly/layer-notebook-finetuning](https://github.com/opencharly/layer-notebook-finetuning) |
| `layer-notebook-graph/` | [opencharly/layer-notebook-graph](https://github.com/opencharly/layer-notebook-graph) |
| `layer-notebook-llm-on-supercomputers/` | [opencharly/layer-notebook-llm-on-supercomputers](https://github.com/opencharly/layer-notebook-llm-on-supercomputers) |
| `layer-notebook-ollama/` | [opencharly/layer-notebook-ollama](https://github.com/opencharly/layer-notebook-ollama) |
| `layer-notebook-openrouter/` | [opencharly/layer-notebook-openrouter](https://github.com/opencharly/layer-notebook-openrouter) |
| `layer-notebook-templates/` | [opencharly/layer-notebook-templates](https://github.com/opencharly/layer-notebook-templates) |
| `layer-qdrant/` | [opencharly/layer-qdrant](https://github.com/opencharly/layer-qdrant) |
| `layer-sqlite/` | [opencharly/layer-sqlite](https://github.com/opencharly/layer-sqlite) |
| `layer-vectorchord/` | [opencharly/layer-vectorchord](https://github.com/opencharly/layer-vectorchord) |

### Candy layers: AI agents and assistant CLIs

15 repos — the coding agents, gateways and agent-side tooling a box can compose.

| path | repo |
|---|---|
| `layer-claude-code/` | [opencharly/layer-claude-code](https://github.com/opencharly/layer-claude-code) |
| `layer-clawhub/` | [opencharly/layer-clawhub](https://github.com/opencharly/layer-clawhub) |
| `layer-codex/` | [opencharly/layer-codex](https://github.com/opencharly/layer-codex) |
| `layer-cua/` | [opencharly/layer-cua](https://github.com/opencharly/layer-cua) |
| `layer-forgecode/` | [opencharly/layer-forgecode](https://github.com/opencharly/layer-forgecode) |
| `layer-gemini/` | [opencharly/layer-gemini](https://github.com/opencharly/layer-gemini) |
| `layer-hermes-playwright/` | [opencharly/layer-hermes-playwright](https://github.com/opencharly/layer-hermes-playwright) |
| `layer-kimi/` | [opencharly/layer-kimi](https://github.com/opencharly/layer-kimi) |
| `layer-mcporter/` | [opencharly/layer-mcporter](https://github.com/opencharly/layer-mcporter) |
| `layer-openclaw/` | [opencharly/layer-openclaw](https://github.com/opencharly/layer-openclaw) |
| `layer-oracle/` | [opencharly/layer-oracle](https://github.com/opencharly/layer-oracle) |
| `layer-pi-agent/` | [opencharly/layer-pi-agent](https://github.com/opencharly/layer-pi-agent) |
| `layer-playwright/` | [opencharly/layer-playwright](https://github.com/opencharly/layer-playwright) |
| `layer-strata/` | [opencharly/layer-strata](https://github.com/opencharly/layer-strata) |
| `layer-summarize/` | [opencharly/layer-summarize](https://github.com/opencharly/layer-summarize) |

### Candy layers: Developer and ops tooling

16 repos — the everyday CLI surface: git/gh, editors, search, tmux, cloud SDKs, observability, and the example candy the docs import.

| path | repo |
|---|---|
| `layer-asciinema/` | [opencharly/layer-asciinema](https://github.com/opencharly/layer-asciinema) |
| `layer-dev-tools/` | [opencharly/layer-dev-tools](https://github.com/opencharly/layer-dev-tools) |
| `layer-devops-tools/` | [opencharly/layer-devops-tools](https://github.com/opencharly/layer-devops-tools) |
| `layer-direnv/` | [opencharly/layer-direnv](https://github.com/opencharly/layer-direnv) |
| `layer-example/` | [opencharly/layer-example](https://github.com/opencharly/layer-example) |
| `layer-gh/` | [opencharly/layer-gh](https://github.com/opencharly/layer-gh) |
| `layer-github-actions/` | [opencharly/layer-github-actions](https://github.com/opencharly/layer-github-actions) |
| `layer-google-cloud/` | [opencharly/layer-google-cloud](https://github.com/opencharly/layer-google-cloud) |
| `layer-google-cloud-npm/` | [opencharly/layer-google-cloud-npm](https://github.com/opencharly/layer-google-cloud-npm) |
| `layer-grafana-tools/` | [opencharly/layer-grafana-tools](https://github.com/opencharly/layer-grafana-tools) |
| `layer-nano-pdf/` | [opencharly/layer-nano-pdf](https://github.com/opencharly/layer-nano-pdf) |
| `layer-ripgrep/` | [opencharly/layer-ripgrep](https://github.com/opencharly/layer-ripgrep) |
| `layer-socat/` | [opencharly/layer-socat](https://github.com/opencharly/layer-socat) |
| `layer-ssh-client/` | [opencharly/layer-ssh-client](https://github.com/opencharly/layer-ssh-client) |
| `layer-tmux/` | [opencharly/layer-tmux](https://github.com/opencharly/layer-tmux) |
| `layer-typst/` | [opencharly/layer-typst](https://github.com/opencharly/layer-typst) |

### Candy layers: Personal and productivity CLIs

11 repos — the single-binary services and accounts an agent drives over HTTP.

| path | repo |
|---|---|
| `layer-blogwatcher/` | [opencharly/layer-blogwatcher](https://github.com/opencharly/layer-blogwatcher) |
| `layer-camsnap/` | [opencharly/layer-camsnap](https://github.com/opencharly/layer-camsnap) |
| `layer-gifgrep/` | [opencharly/layer-gifgrep](https://github.com/opencharly/layer-gifgrep) |
| `layer-gogcli/` | [opencharly/layer-gogcli](https://github.com/opencharly/layer-gogcli) |
| `layer-goplaces/` | [opencharly/layer-goplaces](https://github.com/opencharly/layer-goplaces) |
| `layer-himalaya/` | [opencharly/layer-himalaya](https://github.com/opencharly/layer-himalaya) |
| `layer-ordercli/` | [opencharly/layer-ordercli](https://github.com/opencharly/layer-ordercli) |
| `layer-sag/` | [opencharly/layer-sag](https://github.com/opencharly/layer-sag) |
| `layer-songsee/` | [opencharly/layer-songsee](https://github.com/opencharly/layer-songsee) |
| `layer-wacli/` | [opencharly/layer-wacli](https://github.com/opencharly/layer-wacli) |
| `layer-xurl/` | [opencharly/layer-xurl](https://github.com/opencharly/layer-xurl) |

### Candy layers: Security, secrets and connectivity

6 repos — keys, encrypted volumes, agent forwarding and the mesh VPN.

| path | repo |
|---|---|
| `layer-agent-forwarding/` | [opencharly/layer-agent-forwarding](https://github.com/opencharly/layer-agent-forwarding) |
| `layer-gnupg/` | [opencharly/layer-gnupg](https://github.com/opencharly/layer-gnupg) |
| `layer-gocryptfs/` | [opencharly/layer-gocryptfs](https://github.com/opencharly/layer-gocryptfs) |
| `layer-keepassxc/` | [opencharly/layer-keepassxc](https://github.com/opencharly/layer-keepassxc) |
| `layer-tailscale/` | [opencharly/layer-tailscale](https://github.com/opencharly/layer-tailscale) |
| `layer-tailscale-up/` | [opencharly/layer-tailscale-up](https://github.com/opencharly/layer-tailscale-up) |

### Candy layers: Desktops and terminals

6 repos — the browser, the KDE shell, the punktfunk layers, the editors and the terminals an image ships.

| path | repo |
|---|---|
| `layer-chrome/` | [opencharly/layer-chrome](https://github.com/opencharly/layer-chrome) |
| `layer-kde-shell/` | [opencharly/layer-kde-shell](https://github.com/opencharly/layer-kde-shell) |
| `layer-punktfunk/` | [opencharly/layer-punktfunk](https://github.com/opencharly/layer-punktfunk) |
| `layer-punktfunk-client/` | [opencharly/layer-punktfunk-client](https://github.com/opencharly/layer-punktfunk-client) |
| `layer-vscode/` | [opencharly/layer-vscode](https://github.com/opencharly/layer-vscode) |
| `layer-xterm/` | [opencharly/layer-xterm](https://github.com/opencharly/layer-xterm) |

### Candy layers: Desktop fixings

6 repos — fonts, audio, codecs, notifications and the workspace mount.

| path | repo |
|---|---|
| `layer-desktop-fonts/` | [opencharly/layer-desktop-fonts](https://github.com/opencharly/layer-desktop-fonts) |
| `layer-desktop-media/` | [opencharly/layer-desktop-media](https://github.com/opencharly/layer-desktop-media) |
| `layer-ffmpeg/` | [opencharly/layer-ffmpeg](https://github.com/opencharly/layer-ffmpeg) |
| `layer-fonts-extended/` | [opencharly/layer-fonts-extended](https://github.com/opencharly/layer-fonts-extended) |
| `layer-libnotify/` | [opencharly/layer-libnotify](https://github.com/opencharly/layer-libnotify) |
| `layer-workspace-mount/` | [opencharly/layer-workspace-mount](https://github.com/opencharly/layer-workspace-mount) |

### Candy layers: The charly toolchain itself

5 repos — the meta-candies that put charly — or a fixture of it — inside an image.

| path | repo |
|---|---|
| `layer-charly/` | [opencharly/layer-charly](https://github.com/opencharly/layer-charly) |
| `layer-charly-check/` | [opencharly/layer-charly-check](https://github.com/opencharly/layer-charly-check) |
| `layer-charly-tools/` | [opencharly/layer-charly-tools](https://github.com/opencharly/layer-charly-tools) |
| `layer-cue/` | [opencharly/layer-cue](https://github.com/opencharly/layer-cue) |
| `layer-pod-addcandy-marker/` | [opencharly/layer-pod-addcandy-marker](https://github.com/opencharly/layer-pod-addcandy-marker) |

### Candy layers: Check and fixture layers

15 repos — the disposable beds' own fixture candies and the plugin-execution consumers.

| path | repo |
|---|---|
| `layer-check-base-layer/` | [opencharly/layer-check-base-layer](https://github.com/opencharly/layer-check-base-layer) |
| `layer-check-builder-npm/` | [opencharly/layer-check-builder-npm](https://github.com/opencharly/layer-check-builder-npm) |
| `layer-check-composition-layer/` | [opencharly/layer-check-composition-layer](https://github.com/opencharly/layer-check-composition-layer) |
| `layer-check-cross-local-driver-layer/` | [opencharly/layer-check-cross-local-driver-layer](https://github.com/opencharly/layer-check-cross-local-driver-layer) |
| `layer-check-group-layer/` | [opencharly/layer-check-group-layer](https://github.com/opencharly/layer-check-group-layer) |
| `layer-check-local-layer/` | [opencharly/layer-check-local-layer](https://github.com/opencharly/layer-check-local-layer) |
| `layer-check-retention-fixture/` | [opencharly/layer-check-retention-fixture](https://github.com/opencharly/layer-check-retention-fixture) |
| `layer-check-stack-layer/` | [opencharly/layer-check-stack-layer](https://github.com/opencharly/layer-check-stack-layer) |
| `layer-check-structkind-layer/` | [opencharly/layer-check-structkind-layer](https://github.com/opencharly/layer-check-structkind-layer) |
| `layer-check-substrate-layer/` | [opencharly/layer-check-substrate-layer](https://github.com/opencharly/layer-check-substrate-layer) |
| `layer-check-tier1-layer/` | [opencharly/layer-check-tier1-layer](https://github.com/opencharly/layer-check-tier1-layer) |
| `layer-examplebuilder-consumer/` | [opencharly/layer-examplebuilder-consumer](https://github.com/opencharly/layer-examplebuilder-consumer) |
| `layer-examplestep-consumer/` | [opencharly/layer-examplestep-consumer](https://github.com/opencharly/layer-examplestep-consumer) |
| `layer-examplestep-deploy-consumer/` | [opencharly/layer-examplestep-deploy-consumer](https://github.com/opencharly/layer-examplestep-deploy-consumer) |
| `layer-stepkind-build-consumer/` | [opencharly/layer-stepkind-build-consumer](https://github.com/opencharly/layer-stepkind-build-consumer) |

### Candy layers: Docs and remote execution

2 repos — the docs-site toolchain and the crabbox remote-execution client.

| path | repo |
|---|---|
| `layer-crabbox/` | [opencharly/layer-crabbox](https://github.com/opencharly/layer-crabbox) |
| `layer-docs-site/` | [opencharly/layer-docs-site](https://github.com/opencharly/layer-docs-site) |

### Plugins: Boxes, candies and authoring

16 repos — the words that BUILD a project: boxes, candies, builders, files, packages.

| path | repo |
|---|---|
| `plugin-authoring/` | [opencharly/plugin-authoring](https://github.com/opencharly/plugin-authoring) |
| `plugin-box/` | [opencharly/plugin-box](https://github.com/opencharly/plugin-box) |
| `plugin-build/` | [opencharly/plugin-build](https://github.com/opencharly/plugin-build) |
| `plugin-builder/` | [opencharly/plugin-builder](https://github.com/opencharly/plugin-builder) |
| `plugin-builder-aur/` | [opencharly/plugin-builder-aur](https://github.com/opencharly/plugin-builder-aur) |
| `plugin-builder-cargo/` | [opencharly/plugin-builder-cargo](https://github.com/opencharly/plugin-builder-cargo) |
| `plugin-builder-npm/` | [opencharly/plugin-builder-npm](https://github.com/opencharly/plugin-builder-npm) |
| `plugin-builder-pixi/` | [opencharly/plugin-builder-pixi](https://github.com/opencharly/plugin-builder-pixi) |
| `plugin-candy/` | [opencharly/plugin-candy](https://github.com/opencharly/plugin-candy) |
| `plugin-candy-kind/` | [opencharly/plugin-candy-kind](https://github.com/opencharly/plugin-candy-kind) |
| `plugin-docs/` | [opencharly/plugin-docs](https://github.com/opencharly/plugin-docs) |
| `plugin-file/` | [opencharly/plugin-file](https://github.com/opencharly/plugin-file) |
| `plugin-http/` | [opencharly/plugin-http](https://github.com/opencharly/plugin-http) |
| `plugin-installstep/` | [opencharly/plugin-installstep](https://github.com/opencharly/plugin-installstep) |
| `plugin-mount/` | [opencharly/plugin-mount](https://github.com/opencharly/plugin-mount) |
| `plugin-package/` | [opencharly/plugin-package](https://github.com/opencharly/plugin-package) |

### Plugins: Deploy targets, kinds and substrates

15 repos — every mold a recipe pours into: pod, VM, kubernetes, local host, and the substrate seam under them.

| path | repo |
|---|---|
| `plugin-boot-kind/` | [opencharly/plugin-boot-kind](https://github.com/opencharly/plugin-boot-kind) |
| `plugin-deploy-local/` | [opencharly/plugin-deploy-local](https://github.com/opencharly/plugin-deploy-local) |
| `plugin-deploy-pod/` | [opencharly/plugin-deploy-pod](https://github.com/opencharly/plugin-deploy-pod) |
| `plugin-deploy-vm/` | [opencharly/plugin-deploy-vm](https://github.com/opencharly/plugin-deploy-vm) |
| `plugin-desktop-kind/` | [opencharly/plugin-desktop-kind](https://github.com/opencharly/plugin-desktop-kind) |
| `plugin-distro/` | [opencharly/plugin-distro](https://github.com/opencharly/plugin-distro) |
| `plugin-fleet/` | [opencharly/plugin-fleet](https://github.com/opencharly/plugin-fleet) |
| `plugin-harness-kind/` | [opencharly/plugin-harness-kind](https://github.com/opencharly/plugin-harness-kind) |
| `plugin-k8sgen/` | [opencharly/plugin-k8sgen](https://github.com/opencharly/plugin-k8sgen) |
| `plugin-kubevirt/` | [opencharly/plugin-kubevirt](https://github.com/opencharly/plugin-kubevirt) |
| `plugin-nerdctl/` | [opencharly/plugin-nerdctl](https://github.com/opencharly/plugin-nerdctl) |
| `plugin-pod/` | [opencharly/plugin-pod](https://github.com/opencharly/plugin-pod) |
| `plugin-preempt/` | [opencharly/plugin-preempt](https://github.com/opencharly/plugin-preempt) |
| `plugin-substrate/` | [opencharly/plugin-substrate](https://github.com/opencharly/plugin-substrate) |
| `plugin-vm/` | [opencharly/plugin-vm](https://github.com/opencharly/plugin-vm) |

### Plugins: Check and control verbs

16 repos — the live probes and control surfaces a `check:`/`plan:` step or a host task speaks.

| path | repo |
|---|---|
| `plugin-bpf/` | [opencharly/plugin-bpf](https://github.com/opencharly/plugin-bpf) |
| `plugin-cardwire/` | [opencharly/plugin-cardwire](https://github.com/opencharly/plugin-cardwire) |
| `plugin-cdp/` | [opencharly/plugin-cdp](https://github.com/opencharly/plugin-cdp) |
| `plugin-cstream/` | [opencharly/plugin-cstream](https://github.com/opencharly/plugin-cstream) |
| `plugin-cua/` | [opencharly/plugin-cua](https://github.com/opencharly/plugin-cua) |
| `plugin-dbus/` | [opencharly/plugin-dbus](https://github.com/opencharly/plugin-dbus) |
| `plugin-helm/` | [opencharly/plugin-helm](https://github.com/opencharly/plugin-helm) |
| `plugin-kube/` | [opencharly/plugin-kube](https://github.com/opencharly/plugin-kube) |
| `plugin-media/` | [opencharly/plugin-media](https://github.com/opencharly/plugin-media) |
| `plugin-mise/` | [opencharly/plugin-mise](https://github.com/opencharly/plugin-mise) |
| `plugin-punktfunk/` | [opencharly/plugin-punktfunk](https://github.com/opencharly/plugin-punktfunk) |
| `plugin-quickshell/` | [opencharly/plugin-quickshell](https://github.com/opencharly/plugin-quickshell) |
| `plugin-record/` | [opencharly/plugin-record](https://github.com/opencharly/plugin-record) |
| `plugin-spice/` | [opencharly/plugin-spice](https://github.com/opencharly/plugin-spice) |
| `plugin-vnc/` | [opencharly/plugin-vnc](https://github.com/opencharly/plugin-vnc) |
| `plugin-wl/` | [opencharly/plugin-wl](https://github.com/opencharly/plugin-wl) |

### Plugins: Host and service primitives

20 repos — the small declarative units a deploy installs on a target: services, users, udev, crypto, ssh.

| path | repo |
|---|---|
| `plugin-addr/` | [opencharly/plugin-addr](https://github.com/opencharly/plugin-addr) |
| `plugin-alias/` | [opencharly/plugin-alias](https://github.com/opencharly/plugin-alias) |
| `plugin-cmd/` | [opencharly/plugin-cmd](https://github.com/opencharly/plugin-cmd) |
| `plugin-dns/` | [opencharly/plugin-dns](https://github.com/opencharly/plugin-dns) |
| `plugin-enc/` | [opencharly/plugin-enc](https://github.com/opencharly/plugin-enc) |
| `plugin-gpu/` | [opencharly/plugin-gpu](https://github.com/opencharly/plugin-gpu) |
| `plugin-init/` | [opencharly/plugin-init](https://github.com/opencharly/plugin-init) |
| `plugin-kernel-param/` | [opencharly/plugin-kernel-param](https://github.com/opencharly/plugin-kernel-param) |
| `plugin-port/` | [opencharly/plugin-port](https://github.com/opencharly/plugin-port) |
| `plugin-process/` | [opencharly/plugin-process](https://github.com/opencharly/plugin-process) |
| `plugin-resource/` | [opencharly/plugin-resource](https://github.com/opencharly/plugin-resource) |
| `plugin-secrets/` | [opencharly/plugin-secrets](https://github.com/opencharly/plugin-secrets) |
| `plugin-service/` | [opencharly/plugin-service](https://github.com/opencharly/plugin-service) |
| `plugin-sidecar/` | [opencharly/plugin-sidecar](https://github.com/opencharly/plugin-sidecar) |
| `plugin-ssh/` | [opencharly/plugin-ssh](https://github.com/opencharly/plugin-ssh) |
| `plugin-tunnel/` | [opencharly/plugin-tunnel](https://github.com/opencharly/plugin-tunnel) |
| `plugin-udev/` | [opencharly/plugin-udev](https://github.com/opencharly/plugin-udev) |
| `plugin-unit/` | [opencharly/plugin-unit](https://github.com/opencharly/plugin-unit) |
| `plugin-unix-group/` | [opencharly/plugin-unix-group](https://github.com/opencharly/plugin-unix-group) |
| `plugin-user/` | [opencharly/plugin-user](https://github.com/opencharly/plugin-user) |

### Plugins: Core plumbing

15 repos — the kernel's own seams: loading, matching, the OCI cache, refs, settings and lifecycle verbs.

| path | repo |
|---|---|
| `charly-registry/` | [opencharly/charly-registry](https://github.com/opencharly/charly-registry) |
| `plugin-cache/` | [opencharly/plugin-cache](https://github.com/opencharly/plugin-cache) |
| `plugin-clean/` | [opencharly/plugin-clean](https://github.com/opencharly/plugin-clean) |
| `plugin-command/` | [opencharly/plugin-command](https://github.com/opencharly/plugin-command) |
| `plugin-doctor/` | [opencharly/plugin-doctor](https://github.com/opencharly/plugin-doctor) |
| `plugin-egress/` | [opencharly/plugin-egress](https://github.com/opencharly/plugin-egress) |
| `plugin-interface/` | [opencharly/plugin-interface](https://github.com/opencharly/plugin-interface) |
| `plugin-loader/` | [opencharly/plugin-loader](https://github.com/opencharly/plugin-loader) |
| `plugin-marketplace/` | [opencharly/plugin-marketplace](https://github.com/opencharly/plugin-marketplace) |
| `plugin-matching/` | [opencharly/plugin-matching](https://github.com/opencharly/plugin-matching) |
| `plugin-migrate/` | [opencharly/plugin-migrate](https://github.com/opencharly/plugin-migrate) |
| `plugin-oci/` | [opencharly/plugin-oci](https://github.com/opencharly/plugin-oci) |
| `plugin-refs/` | [opencharly/plugin-refs](https://github.com/opencharly/plugin-refs) |
| `plugin-settings/` | [opencharly/plugin-settings](https://github.com/opencharly/plugin-settings) |
| `plugin-status/` | [opencharly/plugin-status](https://github.com/opencharly/plugin-status) |

### Plugins: Agents, terminals and automation

14 repos — agent runtimes, terminal channels, workflow engines and the review/pipeline front-ends.

| path | repo |
|---|---|
| `plugin-agent/` | [opencharly/plugin-agent](https://github.com/opencharly/plugin-agent) |
| `plugin-agent-pi/` | [opencharly/plugin-agent-pi](https://github.com/opencharly/plugin-agent-pi) |
| `plugin-agentteams/` | [opencharly/plugin-agentteams](https://github.com/opencharly/plugin-agentteams) |
| `plugin-crabbox/` | [opencharly/plugin-crabbox](https://github.com/opencharly/plugin-crabbox) |
| `plugin-dsh/` | [opencharly/plugin-dsh](https://github.com/opencharly/plugin-dsh) |
| `plugin-feature/` | [opencharly/plugin-feature](https://github.com/opencharly/plugin-feature) |
| `plugin-herdr/` | [opencharly/plugin-herdr](https://github.com/opencharly/plugin-herdr) |
| `plugin-lobster/` | [opencharly/plugin-lobster](https://github.com/opencharly/plugin-lobster) |
| `plugin-openclaw/` | [opencharly/plugin-openclaw](https://github.com/opencharly/plugin-openclaw) |
| `plugin-pipeline/` | [opencharly/plugin-pipeline](https://github.com/opencharly/plugin-pipeline) |
| `plugin-review/` | [opencharly/plugin-review](https://github.com/opencharly/plugin-review) |
| `plugin-task/` | [opencharly/plugin-task](https://github.com/opencharly/plugin-task) |
| `plugin-tmux/` | [opencharly/plugin-tmux](https://github.com/opencharly/plugin-tmux) |
| `plugin-vision/` | [opencharly/plugin-vision](https://github.com/opencharly/plugin-vision) |

### Plugins: Deployed-service management CLIs

5 repos — the `charly <service>` commands that drive a RUNNING deployment, plus the MCP gateway.

| path | repo |
|---|---|
| `plugin-gh/` | [opencharly/plugin-gh](https://github.com/opencharly/plugin-gh) |
| `plugin-mcp/` | [opencharly/plugin-mcp](https://github.com/opencharly/plugin-mcp) |
| `plugin-ollama/` | [opencharly/plugin-ollama](https://github.com/opencharly/plugin-ollama) |
| `plugin-qdrant/` | [opencharly/plugin-qdrant](https://github.com/opencharly/plugin-qdrant) |
| `plugin-strata/` | [opencharly/plugin-strata](https://github.com/opencharly/plugin-strata) |

### Plugins: Examples and fixtures

15 repos — the reference plugins the SDK and the check beds are proven against.

| path | repo |
|---|---|
| `plugin-check/` | [opencharly/plugin-check](https://github.com/opencharly/plugin-check) |
| `plugin-example/` | [opencharly/plugin-example](https://github.com/opencharly/plugin-example) |
| `plugin-example-bootstrap/` | [opencharly/plugin-example-bootstrap](https://github.com/opencharly/plugin-example-bootstrap) |
| `plugin-example-builder/` | [opencharly/plugin-example-builder](https://github.com/opencharly/plugin-example-builder) |
| `plugin-example-command/` | [opencharly/plugin-example-command](https://github.com/opencharly/plugin-example-command) |
| `plugin-example-deploy/` | [opencharly/plugin-example-deploy](https://github.com/opencharly/plugin-example-deploy) |
| `plugin-example-dispatch/` | [opencharly/plugin-example-dispatch](https://github.com/opencharly/plugin-example-dispatch) |
| `plugin-example-external/` | [opencharly/plugin-example-external](https://github.com/opencharly/plugin-example-external) |
| `plugin-example-kind/` | [opencharly/plugin-example-kind](https://github.com/opencharly/plugin-example-kind) |
| `plugin-example-lifecycle/` | [opencharly/plugin-example-lifecycle](https://github.com/opencharly/plugin-example-lifecycle) |
| `plugin-example-require/` | [opencharly/plugin-example-require](https://github.com/opencharly/plugin-example-require) |
| `plugin-example-step/` | [opencharly/plugin-example-step](https://github.com/opencharly/plugin-example-step) |
| `plugin-example-stepkind/` | [opencharly/plugin-example-stepkind](https://github.com/opencharly/plugin-example-stepkind) |
| `plugin-example-structkind/` | [opencharly/plugin-example-structkind](https://github.com/opencharly/plugin-example-structkind) |
| `plugin-examplerunverb/` | [opencharly/plugin-examplerunverb](https://github.com/opencharly/plugin-examplerunverb) |

### Pods: Browsers and UI automation

1 repos — the CDP browser toolkit a desktop pod supervises.

| path | repo |
|---|---|
| `pod-chrome-cdp/` | [opencharly/pod-chrome-cdp](https://github.com/opencharly/pod-chrome-cdp) |

### Pods: Desktops and compositors

6 repos — the KDE Plasma desktop, its wlroots compositor, its VNC transport, the shared nested session, the KDE-over-VNC pod and the same desktop carrying the full CDP surface.

| path | repo |
|---|---|
| `pod-kde-desktop/` | [opencharly/pod-kde-desktop](https://github.com/opencharly/pod-kde-desktop) |
| `pod-kde-nested/` | [opencharly/pod-kde-nested](https://github.com/opencharly/pod-kde-nested) |
| `pod-kde-vnc/` | [opencharly/pod-kde-vnc](https://github.com/opencharly/pod-kde-vnc) |
| `pod-kde-vnc-cdp/` | [opencharly/pod-kde-vnc-cdp](https://github.com/opencharly/pod-kde-vnc-cdp) |
| `pod-sway/` | [opencharly/pod-sway](https://github.com/opencharly/pod-sway) |
| `pod-wayvnc/` | [opencharly/pod-wayvnc](https://github.com/opencharly/pod-wayvnc) |

### Pods: Desktop fixings

2 repos — the session bus and the audio server a desktop needs.

| path | repo |
|---|---|
| `pod-dbus/` | [opencharly/pod-dbus](https://github.com/opencharly/pod-dbus) |
| `pod-pipewire/` | [opencharly/pod-pipewire](https://github.com/opencharly/pod-pipewire) |

### Pods: AI and ML services

13 repos — the CDI GPU pod base box, inference servers, notebook servers, the photo library with its ML backend, the model trainers, and the agent front-ends that talk to them.

| path | repo |
|---|---|
| `pod-ai-toolkit/` | [opencharly/pod-ai-toolkit](https://github.com/opencharly/pod-ai-toolkit) |
| `pod-cdi/` | [opencharly/pod-cdi](https://github.com/opencharly/pod-cdi) |
| `pod-comfyui/` | [opencharly/pod-comfyui](https://github.com/opencharly/pod-comfyui) |
| `pod-hermes/` | [opencharly/pod-hermes](https://github.com/opencharly/pod-hermes) |
| `pod-hermes-full/` | [opencharly/pod-hermes-full](https://github.com/opencharly/pod-hermes-full) |
| `pod-immich/` | [opencharly/pod-immich](https://github.com/opencharly/pod-immich) |
| `pod-jupyter/` | [opencharly/pod-jupyter](https://github.com/opencharly/pod-jupyter) |
| `pod-ollama/` | [opencharly/pod-ollama](https://github.com/opencharly/pod-ollama) |
| `pod-openwebui/` | [opencharly/pod-openwebui](https://github.com/opencharly/pod-openwebui) |
| `pod-qdrant/` | [opencharly/pod-qdrant](https://github.com/opencharly/pod-qdrant) |
| `pod-qwen3-tts/` | [opencharly/pod-qwen3-tts](https://github.com/opencharly/pod-qwen3-tts) |
| `pod-strata/` | [opencharly/pod-strata](https://github.com/opencharly/pod-strata) |
| `pod-whisper/` | [opencharly/pod-whisper](https://github.com/opencharly/pod-whisper) |

### Pods: Data and infrastructure services

12 repos — databases, caches, the reverse proxy and the VM/ssh plumbing.

| path | repo |
|---|---|
| `pod-cloud-init/` | [opencharly/pod-cloud-init](https://github.com/opencharly/pod-cloud-init) |
| `pod-nested-podman-socket/` | [opencharly/pod-nested-podman-socket](https://github.com/opencharly/pod-nested-podman-socket) |
| `pod-postgresql/` | [opencharly/pod-postgresql](https://github.com/opencharly/pod-postgresql) |
| `pod-qemu-guest-agent/` | [opencharly/pod-qemu-guest-agent](https://github.com/opencharly/pod-qemu-guest-agent) |
| `pod-redis/` | [opencharly/pod-redis](https://github.com/opencharly/pod-redis) |
| `pod-redis-client-layer/` | [opencharly/pod-redis-client-layer](https://github.com/opencharly/pod-redis-client-layer) |
| `pod-redis-server-layer/` | [opencharly/pod-redis-server-layer](https://github.com/opencharly/pod-redis-server-layer) |
| `pod-sshd/` | [opencharly/pod-sshd](https://github.com/opencharly/pod-sshd) |
| `pod-testapi/` | [opencharly/pod-testapi](https://github.com/opencharly/pod-testapi) |
| `pod-traefik/` | [opencharly/pod-traefik](https://github.com/opencharly/pod-traefik) |
| `pod-valkey/` | [opencharly/pod-valkey](https://github.com/opencharly/pod-valkey) |
| `pod-virtualization/` | [opencharly/pod-virtualization](https://github.com/opencharly/pod-virtualization) |

### Pods: charly and its own tooling

6 repos — charly packaged as a service: the MCP gateway, the hooks pod, the runner and the coordinators.

| path | repo |
|---|---|
| `pod-charly-hooks/` | [opencharly/pod-charly-hooks](https://github.com/opencharly/pod-charly-hooks) |
| `pod-charly-mcp/` | [opencharly/pod-charly-mcp](https://github.com/opencharly/pod-charly-mcp) |
| `pod-crabbox-coordinator/` | [opencharly/pod-crabbox-coordinator](https://github.com/opencharly/pod-crabbox-coordinator) |
| `pod-dsh/` | [opencharly/pod-dsh](https://github.com/opencharly/pod-dsh) |
| `pod-github-runner/` | [opencharly/pod-github-runner](https://github.com/opencharly/pod-github-runner) |
| `pod-herdr/` | [opencharly/pod-herdr](https://github.com/opencharly/pod-herdr) |

### Pods: Check-bed fixtures and composition bases

7 repos — the thin pods the disposable beds compose.

| path | repo |
|---|---|
| `pod-check-keepalive/` | [opencharly/pod-check-keepalive](https://github.com/opencharly/pod-check-keepalive) |
| `pod-check-redis-init-layer/` | [opencharly/pod-check-redis-init-layer](https://github.com/opencharly/pod-check-redis-init-layer) |
| `pod-check-tier23-layer/` | [opencharly/pod-check-tier23-layer](https://github.com/opencharly/pod-check-tier23-layer) |
| `pod-k8s-layer/` | [opencharly/pod-k8s-layer](https://github.com/opencharly/pod-k8s-layer) |
| `pod-mcp-layer/` | [opencharly/pod-mcp-layer](https://github.com/opencharly/pod-mcp-layer) |
| `pod-os-layer/` | [opencharly/pod-os-layer](https://github.com/opencharly/pod-os-layer) |
| `pod-web-layer/` | [opencharly/pod-web-layer](https://github.com/opencharly/pod-web-layer) |

## Tracking upstream `main`

Every submodule is recorded as a commit — a **gitlink** — in this repo's **index**. That commit is
the tip of the branch the submodule's `.gitmodules` entry declares (`main` for every repo but two
vendor forks, which declare `av1` and `stable`) **as of the last fast-forward**. The checkout
follows the gitlink, never the other way round: a path with no checkout still has a gitlink,
audited from the index and reported as *uninitialized (gitlink audited, no checkout)* — a notice,
not a failure.

### The tracking contract

- A **leaf** is a repo at its own branch's tip: `charly`, `sdk`, `spec`, `marketplace`, and every
  other ordinary submodule.
- An **edge** is a repo at another pinned repo's gitlink: the `distro-*` paths each equal
  `charly`'s own `box/*` gitlink, so the umbrella always means *"the org exactly as charly sees
  it"*. An edge may not point at an edge (depth ≤ 2).
- **Behind is a failure.** A recorded gitlink that is an ancestor of the tip its branch declares
  fails `charly task verify`; so does a `blocked-by`, which names the producer leg that must
  advance first. A pin *ahead* of the tip, or one whose two sides disagree, fails too. The one
  non-failure is a pin whose ancestry cannot be judged at all — no checkout and no local objects —
  which is reported, never guessed at.
- **No tag is consulted.** A pin is at a branch tip, not at a release tag; whether a merge landed
  tagged is the release workflow's business, not this repo's.

### Three questions, three commands

| question | command | what it answers |
|---|---|---|
| where is each repo pinned? | `charly task map` | the **state** — every submodule with its pin |
| does this tree agree with itself? | `charly task verify` | **consistency and currency** — every checkout sits at the gitlink the index records, and any pin behind its branch tip FAILS |
| which pins are behind? | `charly task pins --param MODE=currency` | the **currency** alone — every pin against the tip its intent names, judged from the index and the remote, never from a checkout |

### Catching up

The one sanctioned catch-up is a fast-forward, and it is the only thing that moves a pin:
`charly task ff` fast-forwards EVERY pin this repo declares onto the tip of the branch its
`.gitmodules` entry declares.

```sh
charly task ff        # fast-forward EVERY pin this repo declares onto its branch tip, stage the gitlinks; commits nothing
charly task init      # materialize the paths the wave advanced, AT their new gitlinks
charly task verify    # judge the tree, and FAIL if any pin is still behind
```

Then land the wave as a PR through the org's validation chain. `ff` refuses a move that is not a
fast-forward — a checkout carrying a local commit, or an edge whose twin is behind it — and names
the path and the direction rather than resetting it. A wave needs no full set: it advances a path
with no checkout *in the index* and rolls a path that has one, so the two keep agreeing.

On a tree that was **never materialized**, materialize first — `bash scripts/init-submodules.sh`;
the sequence above follows it unchanged.

**Never catch up by hand.** A gitlink is never hand-edited in the index and never "fixed" by
checking out a newer commit inside the submodule.

## Developing in the umbrella

### Bootstrap, once per clone

```sh
git clone https://github.com/opencharly/opencharly.git
cd opencharly
bash scripts/bootstrap.sh              # the working set, the binary, the hooks, the harness installs
export PATH="$PWD/charly/bin:$PATH"    # from here on this page reads `charly …`
```

`scripts/bootstrap.sh` composes six steps, and each one stays runnable on its own:

| step | what it does |
|---|---|
| `bash scripts/init-submodules.sh` | materialize the working set (needs only `git` + `python3`; the bootstrap passes its arguments through, so `bash scripts/bootstrap.sh --all` materializes every path) |
| `bash scripts/init-submodules.sh --stores` | give every declared submodule its object store in the clone's common git dir — blobless, with no checkout (≈420 MB, measured 2026-11-19) — so the pre-push DESIGN gate can read every pin from any session worktree; and set `fetch.recurseSubmodules=false`, so a fetch never reaches into a path that has no checkout (opencharly/opencharly#1155) |
| `./charly/scripts/bootstrap-charly.sh` | build `charly/bin/charly` from the checkout |
| `charly task hooks` | install this clone's git hooks (pre-commit, pre-push) |
| `node scripts/sync-skill-bindings.mjs --check --require-corpus` | assert that the committed harness skill bindings (the `.dsh/skills` farm, `.claude/settings.json`'s `enabledPlugins`) are the derivation of the pinned corpus |
| harness install records | for each harness CLI on `PATH`: Claude Code registers the marketplaces `extraKnownMarketplaces` names and installs every `enabledPlugins` key at project scope; Codex registers or refreshes the `charly-plugins` marketplace, installs its declared default plugins, and verifies that each is enabled. opencode, pi and DSH read the committed config and the corpus, so they need no install step |

The last step exists because **enabling a plugin does not install it**. Claude Code loads a
plugin's skills only when its per-user plugin registry also holds an install record for this
checkout, and nothing in a clone writes that record. Without it a session at this root loads none
of the `/charly-*` skills (opencharly/opencharly#1100).

The first three steps are not `charly` commands, and none can be. The build that produces the
`charly` binary cannot itself be a `charly` task, and neither can the two materialization steps
before it — the working set includes `charly` itself, so the binary does not exist yet when the
first clone happens. Every command after the bootstrap is the installed-binary form, exactly as on a host
that installed a package. Without the `export`, the same commands run as
`./charly/bin/charly …`.

All submodule URLs are plain HTTPS, so a fork works with no extra configuration: every gitlink
resolves to its `opencharly/<repo>` upstream over HTTPS, and a read-only checkout needs no
credentials.

### How big is the umbrella?

**The umbrella is a view over the org, not a 9.5 GB checkout (measured 2026-10-22).** The pins
live in the index, so a checkout is only needed for the repos you actually build against or
edit. `scripts/init-submodules.sh` materializes a **working set** — the repos the project's
`import:` paths name, the pin contract's own repos, the harness corpus root, and the repos the
umbrella's own gate scripts read — and leaves everything else as index entries.

| clone shape | on disk | wall clock |
|---|---|---|
| `git clone --recurse-submodules` (every checkout, full history) | 9.5 G | minutes |
| `git clone` + `scripts/init-submodules.sh` (the working set, blobless) | 77–77 M | 14–15 s |
| `git clone` + `scripts/init-submodules.sh --all` (every path, blobless) | 1.9–2.2 G | 5 m 44 s – 6 m 43 s |

Every figure in the table was measured on this machine on 2026-10-22; the bands carry the readings taken on 2026-10-27 as well.

Those are bands, not points, because a shape measured more than once has a spread rather than a
number that stays put: the light clone measured between 77 M and 77 M, and the `--all` shape
between 1.9 G and 2.2 G; the light row's fresh clones measured between 14 s and 15 s, and the
`--all` row's from-scratch materializations measured between 5 m 44 s and 6 m 43 s. The
`--recurse-submodules` row is the baseline this replaces: measured once, so it is a dated point
figure and its wall clock is stated coarsely. The `--all` row's spread is the `openclaw`
mirror's module store — 480–520 M in a from-scratch clone, and more in a tree whose store was
reused across runs. The bootstrap adds the binary and its build cache, so a bootstrapped light
tree measures 129–129 M, against the 9.5 G a full checkout occupied on 2026-10-22.

The bands are re-derived, not remembered. `scripts/measure-clone.sh` measures the shapes from
fresh clones of the tree under test and prints every reading; `scripts/check-readme-measurements.mjs`
reads the bands this table commits, asserts that the prose agrees with the table, and — handed
that script's log — asserts that every reading falls inside its band. The comparison without
samples is a step of `charly task verify` and of the pre-commit hook, so a figure the prose and
the table disagree about is a failed gate rather than a sentence nobody notices. The samples
half needs the run's own log, so it is the manual step after a measurement:

```sh
bash scripts/measure-clone.sh > /tmp/measure.log
node scripts/check-readme-measurements.mjs --samples /tmp/measure.log
```

**A reading is a property of the TREE, not of the machine.** The measurement clones the tree
over the transport (`--no-local`): a *local* clone copies the source's entire object store —
every commit on every branch, including other sessions' pushed branches — so a reading made
that way drifts with the org's push traffic while the tree stands still. The gate fails on a
measurement that clones locally, and its self-test mutates the clone invocation to prove that
assertion can fail.

The light tree's gate has to mean the same thing as the full tree's. The umbrella's gate scripts
compare surfaces that live in submodules, and a gate **skips** a comparison whose surface is not
checked out — so a working set that omitted those repos would leave a green gate over fewer
comparisons than the full tree makes. That is why the working set includes the repos the gates
read: a light tree reports every step passed and none skipped, exactly as the full tree does.

### The one rule: never edit a submodule

Every repo you change gets its own worktree at `.worktrees/<slug>/<repo>/`, branched off a fresh
`origin/main`, so the submodule's tracked checkout stays detached and clean at its recorded
gitlink. A dirty submodule fails the tree's own gate, and an edit made in place is work no PR can
land.

Change lands only by pull request. One lifecycle, for every repo:

1. a `feat/` branch off fresh `origin/main`, in a session worktree;
2. the change-class gate, run on the committed tree you will push, with zero warnings;
3. a ready PR — no draft — validated by a fresh, independent `charly/pr-validator`;
4. a PASS verdict arms GitHub's own native auto-merge (squash), and `tag-on-merge` writes the
   `CHANGELOG/<CalVer>.md` entry from the PR body and cuts the CalVer tag.

Cross-repo work is producer-first: producer PR → merge → tag → consumer pin bump → this repo's
gitlink. The full model — the branch loop, worktrees, the pin contract's intent model, the
producer-first landing order, coordination between sessions, after-merge cleanup — is in
[AGENTS.md](AGENTS.md) and the `git-workflow` skill, and `charly task prune` reaps the merged
session worktrees and branches it leaves behind.

### Maintenance commands

Build the binary once per clone and put it on `PATH` (both in *Bootstrap* above), then run the
umbrella's own maintenance from the umbrella root. Every command below is the installed-binary
form — `charly task …`, the same shape a packaged `charly` gives you:

| command | purpose |
|---|---|
| `charly task init` | materialize the umbrella's submodules on demand — the derived working set by default (`CHARLY_INIT_MODE=all\|list\|stores` and `CHARLY_INIT_PATHS` select the others); a working-set run also advances every other checkout that a pull left behind its pin, when that checkout is clean and a strict ancestor. After a pull that adds an `import:` path the project cannot load until it runs, so run its script form then: `bash scripts/init-submodules.sh` |
| `charly task worktree` | create a ready session worktree: `CHARLY_WORKTREE_SLUG=<slug> charly task worktree` adds `.worktrees/<slug>/opencharly` on `feat/<slug>` off `origin/main`, brings the module stores up to the new pins, materializes the working set borrowing from them, and builds the worktree's own binary |
| `charly task map` | list every submodule with its pin and sync state |
| `charly task ff` | fast-forward EVERY submodule pin this repo declares onto the tip of the branch its `.gitmodules` entry declares (it fetches every declared path, rolls the checkouts that exist, stages the gitlinks, and refuses a move that is not a fast-forward; it does not commit) |
| `charly task verify` | run the full pinning gate on demand — every pin, including the remote branch audit |
| `charly task pins` | the pin-contract pin operation over EVERY declared path (mode via param) — the `distro-*` paths are its EDGE subset (the `pin_map`); `MODE=ff` fast-forwards EVERY pin this repo declares onto the tip of its branch, `MODE=currency` asks whether every pin is at the ref its intent names |
| `charly task pin-check` | the pin contract's consistency half — the EDGE (every `pin_map` entry equals its twin in the `pinned_from` checkout) and the CHECKOUT AUDIT. It reads the index's gitlinks, the manifest's `pins:` block and the declared path set, so a commit can violate it by moving a gitlink, or by editing the manifest, or by editing `.gitmodules`. This is what `hooks/pre-commit` runs |
| `charly task design-check` | the DESIGN gate — the six controls of `DESIGN.md` A.1/A.2: the CUE toolchain, `DESIGN.md`↔`DESIGN.cue`, the examples and their negatives, the capability ledger, every citation into a pinned module resolved at its pin, and the schema patterns of every pinned plugin module. It is the same command `hooks/pre-push` runs for a push that changes a surface those controls read |
| `charly task hooks` | install this clone's git hooks — `pre-commit` and `pre-push` |
| `charly task org-map` | verify the org-map tables above against the repo and `.gitmodules` |
| `charly task skills` | splice the generated R0 dispatcher from the pinned marketplace into `AGENTS.md` |
| `charly task self-test` | self-test the committed CI body and pin-evidence builders, the dispatcher splice, the submodule initializer, and the measurement's clone path |
| `charly task prune` | reap merged-upstream session worktrees and branches (`MODE=report` is a dry run) |

`charly task list` enumerates them. Without the `PATH` export, the same commands run as
`./charly/bin/charly task …`.

## License

MIT — see [LICENSE](LICENSE). Each submodule is governed by its own repository's license.
