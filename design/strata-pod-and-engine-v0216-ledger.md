# Ledger — strata POD extraction into `pod-strata` + layer-strata engine upgrade (v0.2.16)

Operator request (2026-11-19): *"move the strata pod into a dedicated pod-strata repo, upgrade
layer-strata to the latest strata version and use pod-cdi as base for pod-strata"* — following
`AGENTS.md` and every relevant skill, including the org's new-repo procedure (`/charly-internals:repo-setup`).

This document is the decision record for that cutover. It is the handoff contract for every
teammate and the reference the PR bodies cite. It is NOT a plan file that authorizes phasing:
the cutover runs to the end (AGENTS.md "Hard Cutover by Default", `/charly-internals:cutover-policy`).

## 1. What exists today (measured, 2026-11-19)

`opencharly/layer-strata` (pinned in the umbrella at `3639a7c`, tag `v2026.320.2149`) holds ALL of:

| Path | What it is |
|---|---|
| `candy/strata/` | the engine layer: bakes the engine from upstream source at `STRATA_VERSION: v0.1.44.1` via `charly-build-engine.py` (imports upstream `setup.py`), plus `charly-entrypoint.sh`, `charly-vision.py`, `charly-merge-config.py`, `charly-merge-args.py` — charly's own re-implementation of upstream's runtime |
| `box/strata/` | the `strata` IMAGE — `base: cachyos.cachyos` (a VM-contract GPU image: `layer-nvidia` + `layer-cuda`) — **the thing this cutover moves** |
| `charly.yml` (root) | the family bed `check-strata-gpu-pod` — a `pod:` deploy of image `strata`, `disposable: true`, `requires_shared: [nvidia-gpu]`, 7 runtime assertions about the OLD runtime surface |
| `.agents/skills/strata/` | the BOX skill ("the headless Strata gateway box") — belongs with the box |
| `.agents/skills/strata-layer/` | the LAYER skill — belongs with the candy |
| `LEDGER.md` | the family's decision record (V1–V9, D1–D16) — mostly about the OLD runtime |

`opencharly/pod-cdi` (tag `v2026.323.1302` at time of writing) is the **POD** contract box: it
composes `layer-cdi` (which itself requires `layer-cuda`) and NO `layer-nvidia`, and
`layer-cdi`'s build-time `run:` steps FAIL the build if any host-coupled driver library or
`nvidia*` binary is baked. That is exactly the substrate a GPU *pod* must sit on, and it is why
the user asked for it as the base.

## 2. Upstream moved (the upgrade is not a version bump)

Pinned today: `Niko1221/Strata` `v0.1.44.1`. Latest: **`v0.2.16`** (2026-11-18).

The v0.1.x tree the candy bakes against is GONE at v0.2.16. Measured (tag trees, `gh api`):

| v0.1.44.1 | v0.2.16 |
|---|---|
| `Dockerfile`, `setup.py`, `CMakeLists.txt`, `src/`, `include/`, `serve/`, `requirements.txt`, `docker-entrypoint.sh` at the root | `engine/` (its own `CMakeLists.txt` + `CMakePresets.json`), `terminal/` (bundled CPython + `strata_cli/`, `strata_control/`, `serve/`, `setup.py`, `tools/`), `app/`, `tools/docker/` (`Dockerfile`, `Dockerfile.src`, `build.sh`, `entrypoint.sh`, `healthcheck.sh`, `strata-wrapper.sh`), `setup.sh` |

So `charly-build-engine.py` — which imports upstream `setup.py`'s own functions — cannot survive.
Every one of the four charly-authored runtime scripts is superseded by upstream's shipped
container contract.

**The release ships the compiled artifacts.** Measured (release assets of `v0.2.16`):

| Asset | Bytes | sha256 |
|---|---|---|
| `strata-control-0.1.62-linux-x86_64.tar.gz` (the Terminal) | 94 383 559 | `045b6a7d7fbfbddab814794db5763d6244c887a394403b9fe0e8a4714d9bef8c` |
| `strata-engine-0.1.62-linux-x86_64-cuda-cuda13.tar.gz` (the engine component) | 580 095 243 | `6723e1b6b6042bfe1d368723ebf873afb0fa65f4f1908d948dd865098f6cfb9e` |

The engine package is **self-contained**: `SYSTEM-LIBS.txt` names only `libc/libdl/libgcc_s/libm/
libpthread/librt/libstdc++` (all in any Arch base), it BUNDLES `libcudart.so.13`, `libcublas.so.13`,
`libcublasLt.so.13` and the `strata-vision` encoder binary, and it carries an ed25519 signature plus
per-file sha256 (`engine-component.json`). `min_driver: nvidia 580.65`.

## 3. Decisions

**D-1 — The POD moves; the LAYER stays.** `box/strata` (image) + the bed + the box skill move to a
new `opencharly/pod-strata`; `candy/strata` (the layer whose job is "the engine is IN the image, no
first-start compile") + the layer skill stay in `opencharly/layer-strata`. Class rule (umbrella
`AGENTS.md` "Repo classes and naming" + `README.md` "The org map"): the pod-side of a family is a
`pod-*` repo; the sibling precedent is `pod-qdrant` (box + disposable bed) and `pod-cdi` (pod base).

**D-2 — `base: pod-cdi`.** `pod-strata`'s box composes `@github.com/opencharly/pod-cdi:<tag>`, i.e.
the POD contract (driver injected by the host through CDI, nothing nvidia-baked). Consequence: the
strata candy must STOP requiring the VM-contract GPU stack. It drops `layer-nvidia` entirely and
pins `layer-cuda` at the tag `layer-cdi`'s own chain resolves (a bare `require:` of a second version
of the same candy in one scope is a hard refusal: "resolved to multiple git tags with differing
content within one scope").

**D-3 — Bake the RELEASED artifacts, do not compile.** The candy installs upstream's own published
Terminal + CUDA-13 engine component (pinned by `STRATA_VERSION` + `STRATA_ENGINE_VERSION` + both
sha256 digests), exactly as upstream's published container image does (`tools/docker/Dockerfile`).
The engine is still "in the image, never compiled at first start" — which is what the family's D6
ever meant — and the image no longer needs `nvcc`, a CUDA toolkit, or `nvidia-utils`.
It also deletes the compile path's failure surface (18–25 min builds, a stamp that can lie after a
failed build — upstream #2054).

**D-4 — Adopt upstream's container entrypoint, delete charly's four scripts.** Install upstream's
`tools/docker/entrypoint.sh`, `healthcheck.sh`, `strata-wrapper.sh` at the pinned tag and run the
entrypoint as the supervisord service. `charly-entrypoint.sh`, `charly-vision.py`,
`charly-merge-config.py`, `charly-merge-args.py`, `charly-build-engine.py` are DELETED (R5: no
legacy path, no shim). Rationale (R2/R4): the runtime contract is upstream's product surface now —
config presets, `STRATA_SET`, the vision pass, `/data/Strata-data`, the API key rule. A second
implementation of it inside charly is exactly the duplication R2 forbids, and it was the part that
kept breaking silently (`VISION` inert before the pass existed).

**D-5 — The env surface is upstream's own, renamed by nothing.** The candy's `var:` block carries
upstream defaults: `MODEL`, `FAMILY`, `MODEL_PATH`, `CONTEXT`, `PARALLEL`, `VISION` (charly default
`cpu` — pictures ON stays a family posture, now applied by `launch --vision` on every start instead
of by a charly pass), `KV`, `DRAFTING`, `DRAFT_VOCAB`, `GPU`/`GPUS`, `GPU_ROLES`, `TUNE`, `PRESET`,
`STRATA_SET`, `PORT`, `API_KEY`. `STRATA_RUN_ARGS` / `STRATA_OVERLAY_JSON` / `LOW_RAM` /
`LAYER_SPLIT` / `REINSTALL` / `KV_STREAMING` / `RESIDENT_BUDGET_GIB` are GONE upstream (ignored with
a warning by the entrypoint) → gone here too. `GGUF_DIR` → `MODEL_PATH` (upstream still accepts the
old alias; we emit only the new one).

**D-6 — The secret is `API_KEY`.** Upstream's own name, injected by the deployment's `secret:`.
`STRATA_API_KEY` was charly's projection into `API_KEY` by `charly-entrypoint.sh`, which is deleted.
`--access lan` refuses to serve without a key (it mints one on the volume when none is supplied).

**D-7 — The umbrella imports `pod-strata` under the key `strata`** and drops the `layer-strata`
import, so the bed keeps its qualified name `strata.check-strata-gpu-pod` (no roster churn) while its
file lives in the pod repo. `plugin-strata` stays imported as `strata-cli`.

**D-8 — Skills follow their entity** (Part II #5): `.agents/skills/strata` moves to `pod-strata`
with the box; `.agents/skills/strata-layer` stays with the candy and is rewritten for D-3/D-4.
`opencharly/marketplace`'s `refs` list gains the `pod-strata` entry (the corpus is generated from
it) and keeps `layer-strata`.

## 4. Ordering (producer-first; content exists somewhere at every commit)

0. **plugin-deploy-pod (+ sdk) — the CDI × keep-id fix.** Discovered by the live gate (§8); it
   blocks leg 1's bed, so it goes first. Filed as `opencharly/plugin-deploy-pod#81`.
1. **layer-strata PR-1 — the engine upgrade.** Candy rewritten (D-3…D-6), bed `check-strata-gpu-pod`
   adapted to the new surface, `LEDGER.md` rewritten, layer skill rewritten. Gate: the GPU bed, run
   live on this venue (RTX 4080 SUPER, driver 615.78.08, CDI spec present, 234 GB model store).
   Merges → tag `T1`.
2. **pod-strata PR-1 — the new repo.** `box/strata` (`base: pod-cdi.pod-cdi`, candy pinned at `T1`),
   the bed moved + re-gated, `AGENTS.md`, `README.md`, `.github/workflows/tag-on-merge.yml`, the box
   skill. Gate: the GPU bed run from THIS repo. Merges → tag.
3. **layer-strata PR-2 — the deletion.** `box/strata`, the root bed, and `.agents/skills/strata`
   deleted; `AGENTS.md`/`README.md`/root `charly.yml` trimmed to the layer. Gate: `box validate` +
   the bed in pod-strata is the live witness (cited).
4. **umbrella — the pin wave + import.** `pod-strata` added as a submodule, `import:` keys per D-7,
   the roster's exclusion line kept, `README.md` org map rows. Gate: `./charly/bin/charly task verify`.
5. **marketplace — the corpus ref.** `pod-strata` added to `refs`, `layer-strata` kept. Gate:
   generator run.

## 5. RDD — the spike that already cleared the highest risk (2026-11-19)

Run on this host, from the pinned release assets, no image involved:

```
$ sha256sum strata-control.tar.gz strata-engine-cuda13.tar.gz
045b6a7d7fbfbddab814794db5763d6244c887a394403b9fe0e8a4714d9bef8c  strata-control.tar.gz
6723e1b6b6042bfe1d368723ebf873afb0fa65f4f1908d948dd865098f6cfb9e  strata-engine-cuda13.tar.gz
$ x/bin/strata --version
strata 0.2.16 (build 0.1.62; python 3.12.15 at …/python/bin/python3.12)
$ STRATA_COMPONENTS_DIR=… x/bin/strata components engine --output json
{"…","backend":"cuda","backend_source":"nvidia-smi","installed":[{…"version":"0.1.62"…"signed":true…}],"usable": true}
$ eng/strata --version
strata 0.1.62
```

So: the released Terminal runs on this Arch-derived host, the released engine component is
discovered, signature-verified and reported `usable: true` against the local driver, and the
component needs no CUDA toolkit. The remaining unknown is only whether the containerised pod
(layer-cdi contract) serves a completion — which the bed proves.

## 6. Open risks

| Risk | Mitigation |
|---|---|
| The new entrypoint MOVES an existing old-layout store (`/data/models`, `/data/packs`, `/data/mtp` → `/data/Strata-data/…`, rename-only, skips existing targets) | It is upstream's own idempotent migration; the bed's bind is the operator store, so the move is recorded in the bed's evidence and the AGENTS.md |
| First start of the new layout re-derives run settings and may re-fetch the vision encoder (~0.9 GB) | The store keeps its GGUF; `MODEL_PATH` names it, so no weights are re-downloaded |
| `pod-cdi`'s `layer-cdi` chain and the strata candy could pin `layer-cuda` at different tags | D-2: the candy pins exactly the tag the chosen `pod-cdi` tag resolves; `charly box generate` proves it |
| The bed needs the GPU venue (excluded from the default roster) | This host IS the venue; the bed is run on demand and its evidence pasted |

## 7. Ledger entries that this cutover retires (R5, claim-keyed)

`candy/strata/charly.yml`'s comments and `LEDGER.md` cite decisions that no longer hold:
`STRATA_VERSION v0.1.44.1`, `charly-build-engine.py`, the `source_hash(ENGINE_SOURCES)` stamp, the
`SETUP_OWNED` refusal in `charly-merge-config.py`, `charly-vision.py`'s "applied on EVERY start"
pass, `STRATA_RUN_ARGS`' `--vram-reserve-mib 1024` default, `LOW_RAM`, `STRATA_MEMORY_LIMIT_MIB`,
`REINSTALL`, `/opt/strata/engine/BUILD.json`, `/data/config/strata-<model>.json`. Every one is
updated or deleted in the same cutover, and the PR body pastes the claim-keyed grep.

## 8. Discovered mid-cutover — the CDI × `keep-id` defect (blocking, producer leg 0)

The first live bed run reached `charly start` and died there:

```
$ journalctl --user -u charly-check-strata-gpu-pod.service
… Error: crun: mount_setattr `/usr/bin/nvidia-cuda-mps-control`: Operation not permitted: OCI permission denied
… charly-check-strata-gpu-pod.service: Main process exited, code=exited, status=126/n/a
```

Isolated in ten `podman run` variants across two images (the strata image and the running comfyui
image, so the image is ruled out), and filed with its RCA as `opencharly/plugin-deploy-pod#81`:

| flags | result |
|---|---|
| `--device nvidia.com/gpu=all` | rc=0 |
| `--userns=keep-id --device nvidia.com/gpu=all` | rc=126, the error above |
| `--userns=keep-id:uid=0,gid=0 --device nvidia.com/gpu=all` | rc=126 |
| `--userns=keep-id --group-add keep-groups --device nvidia.com/gpu=all` | rc=126 |
| `--userns=keep-id` (no device) | rc=0 |
| `--userns=keep-id` + a FILE bind or a DIR bind | rc=0 |
| the same CDI failure on an image whose CDI target paths were PRE-CREATED | rc=126 |
| `--userns=host --device nvidia.com/gpu=all` | rc=0 |
| `--userns=host --user 0 --device nvidia.com/gpu=all` + the bind | rc=0, bind writable, host file owned by 1000, engine `usable: true`/`signed: true` |

Mechanism: the pod deploy emits `--userns=keep-id` whenever the deployment has a bind mount
(`engineKeepID`, `candy/plugin-deploy-pod/engine_ops.go:280`, and the quadlet `UserNS=` line at
`sdk/deploykit/quadlet.go:207`), and `keep-id` + a CDI device is fatal on this runtime stack
(podman 6.2.0, crun 1.31, rootless). The strata bed is the first pod in the org with BOTH a CDI GPU
device and a bind volume, which is why nothing had surfaced it.

**Classification: blocking** for this cutover (the gate cannot be green), and **not ours** — it is
a charly product defect in another repo. It lands producer-first as TWO legs because the quadlet
emitter lives in the sdk contract module: `sdk` (the `UserNS=`/`User=` decision) → merge → tag →
`plugin-deploy-pod` (the argv emitters + the sdk pin). The rule is ONE predicate: *a CDI deploy with
a bind mount runs `userns=host` with the workload as container root; a bind-only deploy keeps
`keep-id` byte-identically.* The plugin is consumed from `main`, so the strata bed needs no pin bump
of its own to pick the fix up.

No workaround was taken in this family: the store bind stays a bind, no named-volume substitution, no
`userns`/`user` override smuggled into the bed, and no pre-created CDI mount points in the image (that
last one does not even work — see the table).

### 8a. The mechanism, from the syscall down (operator-requested independent RCA)

The first fix (`userns=host` + container root) was challenged by the operator as a rootless regression,
which forced the mechanism to be derived instead of inferred:

```
$ strace -f -e trace=mount,mount_setattr podman run --rm --userns=keep-id --device nvidia.com/gpu=all …
mount_setattr(14, "", AT_EMPTY_PATH|AT_RECURSIVE, {attr_set=MOUNT_ATTR_IDMAP, …, userns_fd=13}, 32) = -1 EPERM
```

It is the **idmapped mount** crun performs on the injected CDI mount. An idmapped mount requires
`CAP_SYS_ADMIN` in the user namespace that owns the *filesystem's superblock*; the CDI sources are host
files on the host filesystem, whose superblock belongs to the initial user namespace — a rootless
container can never hold that. So it is not btrfs (an `:idmap` bind of a file fails identically from
**btrfs AND tmpfs**, and tmpfs supports idmapped mounts), and not the image (the same failure reproduces
on the comfyui image). Podman asks for the idmap only when the container carries a user-namespace
MAPPING (host root is unmapped there, so root-owned injected files would read as `nobody`); with no
mapping (`userns=host`) no idmap is requested and the injection works.

Consequence, and the verdict this ledger records: **`keep-id` (or any `--uidmap`) + a CDI device is
impossible for a rootless container whose injected files are host-root-owned**, and under `userns=host`
container uid 0 *is* the invoking host user. Measured on the strata image, end to end:

```
$ podman run --rm --userns=host --user 0 --cap-drop ALL --security-opt no-new-privileges       --device nvidia.com/gpu=all -v /tmp/bindtest:/data:rw <strata image> …
supervisord started → strata RUNNING → "Engine 0.1.62 (cuda) is installed"
strata components engine --output json → "usable": true, "signed": true
touch /data/probe → host  1000 1000
$ podman info --format '{{.Host.Security.Rootless}}' → true
```

So the shipped shape is rootless in every sense that touches the host: no host privilege, workload =
the mapped host user, and (with `security_opt: [no-new-privileges]`, which `box/strata` declares) no
privilege escalation. `cap_drop` is not expressible in `#Security` — filed as a capability gap, and the
pod declares what it can.

**Audit of the org's posture at this point (measured, for the record):** `podman info` → `rootless=true`;
every running charly workload (`charly-qdrant-pod`, `charly-comfyui-lab`, `charly-openwebui-stt`,
`charly-whisper-pod`, `charly-qwen3-tts`, `charly-ollama`) → `Privileged=false`, `CapAdd=[]`, `User=1000`
(none uses `keep-id` — they have no bind mounts, which is exactly why the CDI defect never surfaced).
Three manifests in the tree declare `privileged: true` by design (`charly/charly.yml` and the two
bundles of it inside `plugin-herdr`/`pod-herdr`, plus `vm-k3s-server`) — the toolchain and VM boxes, not
pods. `charly settings` carries `engine.rootful=sudo` (a configured privilege PREFIX for deploys that
elect rootful; every pod in this cutover ran as a user unit).

