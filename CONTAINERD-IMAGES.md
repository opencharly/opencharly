# CONTAINERD-IMAGES.md — the image contract for the containerd substrate

`CONTAINERD.md`, `K3S.md` and `LIBKRUN.md` describe what a **prepared host** must look
like. This file describes the **images** that prepare one, and the **lease images** a
container is run from, so the features those three files specify are available without an
operator assembling a host by hand.

Two boundaries, both deliberate:

- **This is a contract, not a build.** The candies and boxes that implement it are separate
  work; every requirement below is written so it can be an image layer, a `plan:` step or a
  `check:` assertion. Where an existing candy already promises part of a row, the row names
  it, and the gap is filed in that candy's repo rather than fixed here.
- **Every requirement that constrains a host or a lease cites where it was measured** — a
  `CONTAINERD.md` §N, `K3S.md` §N, `LIBKRUN.md` §N or an `RDD` item — in its own row, or in
  the source index that closes each section. This file is not a second repository of
  evidence; it is a contract over evidence stated elsewhere.

An image is only "conforming" if its own `plan:` proves it (see §5). An image that merely
contains the packages is not conforming.

## 1. Host images — one per supported distro base

`distro-arch`, `distro-cachyos`, `distro-fedora`, `distro-debian`, `distro-ubuntu`. Each
host image is built twice from the same definition — once rootful, once with the rootless
checklist — never as two divergent Dockerfiles.

### 1.1 `containerd-host` (new)

The daemon and its config, rootful.

| Requirement | Why | Source |
|---|---|---|
| containerd ≥ 2.3, written as a `version = 4` config with `imports = ["/etc/containerd/conf.d/*.toml"]` | the config shape the rest of the specs assume; a top-level `[grpc]` address is ignored in v4 and must live under `plugins."io.containerd.server.v1.grpc"` | CONTAINERD.md §3.1 |
| a `crun` default handler **and** a `krun` handler with `pod_annotations = ["krun.*"]`, plus an `nvidia` handler when the NVIDIA toolkit is installed | the annotations do not reach the handler without `pod_annotations`; a missing handler is silent until a container asks for it | CONTAINERD.md §3.1, §5.2, §14.2 |
| `SystemdCgroup = true`, and `dbus-user-session` present for the rootless variant | the cgroup driver needs the user D-Bus for a rootless instance | CONTAINERD.md §2, §4 |
| the narrow seccomp profile at `/etc/containerd/seccomp/crabbox-userns.json` — containerd's own `DefaultProfile()` **plus** `{"names":["unshare","clone"],"action":"SCMP_ACT_ALLOW"}`, `clone3` left `ENOSYS` | the stock profile blocks `unshare`/`clone` with namespace flags, which is what breaks Chromium's sandbox; this profile restores it while keeping `keyctl`/`mount` enforced | **not in any spec — measured (RDD7 C10)**, with the stock profile and `unconfined` as its two controls. A spec section documenting the profile is still owed |
| `kernel.unprivileged_userns_clone=1` where that sysctl exists | where it does not, user namespaces are gated by AppArmor instead | CONTAINERD.md §4 |
| `containerd.service` and `buildkit.service` enabled | `nerdctl build` fails with `no buildkit host is available` until buildkit runs | CONTAINERD.md §2 |
| the `shadow`/`uidmap`/`shadow-utils` package — `newuidmap`, `newgidmap` | rootlesskit execs them to write the UID/GID map; the rootless setup tool never checks them | CONTAINERD.md §2 |
| `/dev/fuse` reachable | the `fuse-overlayfs` fallback's libfuse3 client opens it | CONTAINERD.md §2, §4.4 |
| `net.ipv4.ip_unprivileged_port_start` configurable and documented | publishing a port below 1024 rootless needs it; the *container*-side bind does not | CONTAINERD.md §4.3 |

**Acceptance** = `CONTAINERD.md` §11.3's checks as the candy's `plan:` steps. A host image
whose `check:` steps do not exercise them is not conforming.

### 1.2 `containerd-rootless` (new)

The §4 checklist as one unit, because it is the half that fails in ways the setup tool does
not detect: `shadow`/`uidmap`, `/etc/subuid` + `/etc/subgid` entries, the
`user@.service.d/delegate.conf` drop-in (`Delegate=cpu cpuset io memory pids`), linger
enabled, `/dev/fuse`, the setuptool run, the network driver, and the low-port sysctl.
Every item is a `check:` — a rootless host that cannot start is exactly the failure this
image exists to prevent (CONTAINERD.md §4).

### 1.3 `krun-host` (new)

| Requirement | Why | Source |
|---|---|---|
| `crun` built from a commit that carries **both** the passt fix (`ca04fdb6`) **and** the `/proc` remount that makes passt work under a declared PID namespace (`handlers/krun.c:824-838`), with `+LIBKRUN` | no release carries them: 1.30.1 cannot start passt at all (`start passt`, rc 1), so in-guest CRIU is main-only until a release ships both | LIBKRUN.md §7 |
| `libkrun` **1.x** pinned — not `main` | crun's handler resolves the 1.x API; libkrun `main` is a 2.0 rewrite that drops it | **source read (RDD7 S3, B.5)**: `handlers/krun.c` resolves `krun_set_vm_config`, `krun_set_gpu_options` and `krun_start_enter`, which libkrun `main` removes. No spec section states the pin yet |
| `libkrunfw`, and `/dev/kvm` readable by the krun user | the guest kernel and the VM device | CONTAINERD.md §2 |
| `bwrap` at **`/usr/bin/bwrap`** and `virgl_render_server` at **`/usr/libexec/virgl_render_server`** | crun hardcodes both paths; Arch installs the server at `/usr/lib/…`, so the image provides the path | CONTAINERD.md §14.3 |
| mesa Vulkan on the host for the render server; on Arch, `vulkan-virtio` **and** `vulkan-swrast` as separate packages | `mesa` no longer ships Vulkan ICDs; without them every krun GPU run fails `Found no drivers` | CONTAINERD.md §14.3 |
| the NVIDIA Vulkan ICD on an NVIDIA host | venus runs the **host's** Vulkan loader inside the render server's sandbox | CONTAINERD.md §14.3 |
| `kvm_* nested=1` where nested VMs are wanted | `krun.nested_virt` exposes VMX/SVM only if the host has it | LIBKRUN.md §6 |
| a **custom guest kernel `libkrunfw-crabbox`** — libkrunfw v5.6.2's own patches and config, `make vmlinux` only, plus `CHECKPOINT_RESTORE` and INET/UNIX/NETLINK/PACKET_DIAG (in-guest CRIU) **and** `NETFILTER_XTABLES`, `NFT_COMPAT`, `NFT_NUMGEN`, the `IP_NF_*`/`XT_*` set k3s uses, `IP_SET*`, `IP_VS*`, `VXLAN`, `IP_MULTIPLE_TABLES`, `BASE_SMALL=n` (k3s in a guest) | the stock config has none of these; a stock kernel gives no `ns_last_pid` and `Diag module missing (-2)`, and k3s in a guest loses Services | LIBKRUN.md §7, K3S.md §8 |
| the kernel shipped two ways: at a fixed path for `krun.custom_kernel`, **and** selectable per lease without a rebuild | a wrapper's `LD_LIBRARY_PATH`, or `/.krun_vm.json` + `krun.custom_kernel` | LIBKRUN.md §6 |

### 1.4 `criu-host` (new)

`criu`, and the pre-flight as a `check:`: `criu check --unprivileged --feature
seccomp_suspend` run **from the namespace the daemon actually runs in**. The named form
short-circuits CRIU's check (`criu/cr-check.c:1659-1664`), so its exit status *is* the
feature's result; the bulk form (`--extra`) is never a gate, because it is non-zero on a host
that checkpoints perfectly (CONTAINERD.md §10).

### 1.5 `nvidia-cdi-host` (extends `layer-nvidia`)

| Requirement | Why | Source |
|---|---|---|
| the containerd drop-in exactly as `nvidia-ctk runtime configure --runtime=containerd` writes it, **without** `--enable-cdi` | CDI is always on in containerd 2.x and the key is ignored with a warning | CONTAINERD.md §14.2 |
| `nvidia-cdi-refresh.path` / `.service` enabled, so **`/var/run/cdi/nvidia.yaml`** is regenerated at boot, on module load and when the toolkit changes | a one-shot `cdi generate --output=/etc/cdi/nvidia.yaml` is a snapshot that goes stale on the first driver upgrade — the driver version appears 115× in the generated spec | CONTAINERD.md §14.2 |
| the rootless link `~/.config/cdi/nvidia.yaml → /var/run/cdi/nvidia.yaml` | the rootless client's spec dirs are `$XDG_CONFIG_HOME/cdi` and `$XDG_RUNTIME_DIR/cdi`, never `/etc/cdi` | CONTAINERD.md §14.2 |
| a `check:` that the **device lists** (`nvidia-ctk cdi list`), not that a file exists | `cdi list` exits **0** on an invalid spec, and two same-priority specs leave the device **dropped** | CONTAINERD.md §14.2 |

This row **replaces** the one-shot generate step in `distro-cachyos/candy/nvidia-driver`;
that gap is filed as **opencharly/distro-cachyos#151**, and is not fixed by copying the
candy's approach here.

### 1.6 `layer-nerdctl` — existing candy, two gaps (opencharly/layer-nerdctl#10)

The candy's `description:` promises the rootless containerd/buildkit units that no `plan:`
step writes, and its `nerdctl-full` install runs `sha256sum -c … || true`, which makes the
checksum advisory. Both are requirements here rather than preferences: §1.2's rootless
checklist is written as `check:` assertions, which a candy that does not write the units
cannot satisfy, and an unverified tarball is not an install step. Tracked in
**opencharly/layer-nerdctl#10**.

### 1.7 `k3s-shared-containerd` (extends `layer-k3s`)

k3s pointed at the shared containerd (`container-runtime-endpoint`), the `krun` and `nvidia`
RuntimeClasses, and the restart-after-config rule: k3s reads the runtime set at start, so a
handler added later is invisible until the service restarts (K3S.md §2, §4).

## 2. Lease images — what a container is run from

The base contract is an SSH-reachable lease: `/usr/sbin/sshd`, a user with sudo, `git rsync
curl sudo python3 jq tmux flock iproute2 openssl`, and the shared bootstrap. Two init modes,
one input path — a read-only directory at **`/crabbox`** (never `/run`, which systemd covers
with a tmpfs): `authorized_keys`, `lease.env`, `bootstrap.sh`. Files are written temp + `mv`;
a krun guest's virtiofs serves an in-place rewrite torn for up to 5 s, and host-side writes
raise no inotify in the guest. Secrets go there `0600`, never on argv.

| Image | Contents and requirements |
|---|---|
| `crabbox-lease` | the base contract; **direct** mode ends in `exec sshd -D`, **systemd** mode enables `sshd.service` + `crabbox-bootstrap.service` and reads its inputs from `/crabbox` |
| `crabbox-lease-systemd` | systemd as PID 1 — crun/runc `--systemd=always`, krun `KRUN_INIT_PID1=1` plus `--ulimit nofile=524288:524288`; **`/usr/lib/systemd/system-shutdown/krun-poweroff`** (runs `systemctl reboot -ff` on poweroff/halt — the only clean krun stop); `/etc/sysctl.d/50-pid-max.conf` `kernel.pid_max=32768`; **`serial-getty@hvc0` masked** (else the boot hangs on `dev-hvc0.device` under krun); Actions-runner prerequisites |
| `crabbox-lease-desktop` | xfce (`tigervnc`, `xfce4-*`, `dbus-x11`) and wayland (`labwc`, `wayvnc`), `novnc` + `websockify`, `/usr/local/bin/crabbox-start-desktop`; started over SSH, never `exec` |
| `crabbox-lease-browser` | chrome/chromium/firefox + `/usr/local/bin/crabbox-browser`; on crun/runc the lease runs with `--security-opt seccomp=/etc/containerd/seccomp/crabbox-userns.json` so the sandbox works **without** `--no-sandbox` and **never** `unconfined`; krun needs nothing (the guest kernel is the boundary) |
| `crabbox-lease-code` | code-server at a pinned version, started on `127.0.0.1:8080` over SSH |
| `crabbox-lease-tailscale` | `tailscale` **and `tailscaled`** — a lease without the daemon fails `exec /usr/bin/tailscaled: no such file or directory` before any login; a `tailscaled.service` drop-in setting `TS_DEBUG_DISABLE_UDP_GSO=1` for TSI leases only (the libkrunfw TSI socket deadlock) |
| `crabbox-lease-nested` | fedora:43 + `systemd iptables-nft iproute crun` + nerdctl-full in `/usr/local` (`containerd` enabled) + `openssh-server libkrun libkrunfw crun-krun`, **`virglrenderer`, `bzip2-libs` and a `libbz2.so.1.0` symlink**, and `libkrun.so.1` on the loader path (**not** under a `lib64/` subdirectory); `/etc/nerdctl/nerdctl.toml` `bridge_ip = "10.99.0.1/24"`; **an empty `/etc/machine-id`** and `/etc/systemd/network/99-default.link` (`MACAddressPolicy=none`) — without them every lease gets the same MAC; **`systemd-udevd` masked** (udev in a privileged lease acts on host devices) and no `rtkit`; `sys-kernel-{config,debug,tracing}.mount` masked for a rootless outer; `/var` = the state volume; a docker-compatible socket for the Actions runner |
| `crabbox-lease-k3s` | `crabbox-lease-nested` + `sqlite procps-ng kmod iputils` + k3s at `/usr/local/bin/k3s`; `write-kubeconfig-mode: "0644"`, `tls-san` including the stable node address; a `config.yaml.d/` drop-in with `node-ip: 172.31.255.1` (plus the `KubeletInUserNamespace` gates rootless); `k3s-dummy.service` creating `k3s0`; `k3s.service` with `KillMode=process`, `Delegate=yes`, `Restart=always`, **no** `ExecStartPre=modprobe`; run with `--device /dev/kmsg` |
| `crabbox-lease-k3s-krun` | the k3s image for a **krun** guest: `/krun/vmlinux` = `libkrunfw-crabbox` + `/.krun_vm.json` (`kernel_path`, `kernel_format: 1`), label `crabbox.krun.network=passt`; run with `krunKernel: image`, `krunNetwork: passt` |
| `crabbox-lease-k3s-gpu` | `crabbox-lease-k3s` + `nvidia-container-toolkit` (k3s auto-detects the runtime and creates the `nvidia` RuntimeClass), and **the toolkit's own refresh unit enabled inside the lease so `/var/run/cdi/nvidia.yaml` is regenerated** — not a one-shot `--output=/etc/cdi/nvidia.yaml`, which is the stale form §1.5 rejects; the NVIDIA device plugin with `DEVICE_LIST_STRATEGY=cdi-cri`, `NVIDIA_DRIVER_ROOT=/`, `NVIDIA_CDI_HOOK_PATH=/usr/bin/nvidia-cdi-hook`, so a plain pod with `limits: nvidia.com/gpu: 1` gets the GPU without a `runtimeClassName` |
| `crabbox-lease-gpu` | **krun:** mesa with the venus ICD (`vulkan-virtio`), and for DRM native context a mesa that carries amdgpu-virtio, plus `vulkan-tools`; **no** NVIDIA userspace (the host's runs in the render server). **crun/runc:** no driver in the image — the NVIDIA userspace arrives by CDI injection |
| `crabbox-lease-criu` | `criu` in the image, for a lease that checkpoints its own processes |

**Sources for §2**, matching the rows above in order: the base contract and the two init
modes — `CONTAINERD.md` §8 (`--systemd`, `KRUN_INIT_PID1`, the `/crabbox` input path, the
`pid_max` and `serial-getty@hvc0` findings); `desktop`, `browser`, `code` — `CONTAINERD.md`
§8 plus the narrow seccomp profile in §1.1 of this file; `tailscale` — `LIBKRUN.md` §7 (the TSI
`TS_DEBUG_DISABLE_UDP_GSO` measurement); `nested`, `k3s`, `k3s-krun` — `CONTAINERD.md` §9 and
`K3S.md` §2–§8 and `LIBKRUN.md` §6–§7; `k3s-gpu`, `gpu` — `CONTAINERD.md` §14.2–§14.3;
`criu` — `CONTAINERD.md` §10 and `LIBKRUN.md` §7.

## 3. Cross-cutting rules

These apply to every image above and are the ones that cost a debugging round when missed.

1. **Every lease's `/var` is a volume** when an engine runs inside it. Overlay cannot stack
   on overlay (CONTAINERD.md §9), and a commit alone then costs 70 s and a multi-GB image
   instead of a 1 s volume clone.
2. **A clone carries `/var` but not `/run`.** A forked k3s lease therefore reports node
   `Ready` about 8 s before it is workload-usable: the kubelet rebuilds every CRI sandbox
   and `host-local` must issue fresh IPs, while the apiserver's Pods/Endpoints still name the
   source's IPs. Readiness must be probed at the workload level, and the window reported
   rather than treated as a failure (K3S.md §6–§7).
3. **The inner engine must not start rate-limited.** `systemctl reset-failed containerd`
   before (re)starting it: five rapid starts hit `StartLimitBurst=5`/`start-limit-hit`, after
   which every start is refused. Measured: the next start after a reset is active in 82 ms (RDD8 track T7, item N2).
4. **A readiness probe never reports its deadline as a duration.** The one recorded "94.7 s"
   boot was `90 × ~1.05 s` — the harness's poll budget — against a real 486–644 ms (T7, N2).
5. **`/etc/machine-id` is emptied before a commit and restored after**, and
   `MACAddressPolicy=none` is set, or every lease cloned from one image shares a MAC and
   traffic reaches the wrong lease (K3S.md §6–§7; RDD7 N6).
6. **Nothing in these images is set to `seccomp=unconfined` or run with `--no-sandbox`.** The
   narrow profile exists so neither is needed (measured, RDD7 C10; §1.1 of this file).

## 4. Non-goals

- Building the images. This file is the contract they will implement.
- The `variant` annotation (`sev`, `aws-nitro`): it needs SEV-SNP or Nitro hardware that the
  test hosts do not have, so it is unmeasured and must not be offered.
- CUDA inside a krun guest: libkrun 1.x has no path for it. CUDA leases use crun/runc with
  CDI (CONTAINERD.md §14.2).

## 5. The acceptance beds

Each image carries a `plan:` whose `check:` steps prove its row, and each variant is
exercised under **crun and krun**, **rootful and rootless**, on a `disposable: true` target:

| Bed | Proves |
|---|---|
| `containerd-host` | CONTAINERD.md §11.3's acceptance checks |
| `containerd-rootless` | the §4 checklist end to end, including the uidmap helpers and `/dev/fuse` |
| `krun-host` | a guest boots, `uname -r` shows the libkrunfw kernel, and the GPU flags produce a venus device |
| `criu-host` | the `seccomp_suspend` pre-flight in the daemon's own namespace |
| `nvidia-cdi-host` | the device lists and injects, rootful **and** rootless |
| `crabbox-lease-nested` | an inner containerd, an inner krun, and k3s, in one lease |
| `crabbox-lease-k3s` | node Ready, a workload, a PVC round-trip, and a full snapshot → mutate → revert |

A bed that cannot run on a given host skips **visibly** with its reason. It never passes
silently.
