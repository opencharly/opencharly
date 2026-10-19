# CONTAINERD.md

Configuration reference for containerd, nerdctl, k3s and crun/krun on one Linux host —
rootful and rootless, with and without nested instances.

Baseline: containerd ≥ 2.3 (config version 4; on 2.1/2.2 use `version = 3`), nerdctl 2.x,
crun with libkrun support, k3s, cgroup v2, systemd, kernel ≥ 5.13 (rootless overlayfs).

## 1. Principles

1. **One daemon.** One containerd per instance. nerdctl uses namespace `default`, k3s uses
   `k8s.io` on the same socket.
2. **One runtime family.** Every container runs with crun: `crun` for containers, `krun`
   (the same binary in libkrun mode) for microVMs. The default runtime handlers never use
   runc; the optional `nvidia` handler added for GPUs (§14.2) is the only exception.
3. **One snapshotter by default.** `overlayfs` everywhere; the btrfs snapshotter is an
   optional alternative for subvolume-level layer snapshots (§3.3.3).
4. **One switch for VM isolation.** The only difference between a container and a microVM is
   the runtime value: `$RT` for nerdctl, `runtimeClassName` for k3s.
5. **Safe restarts.** containerd's unit uses `KillMode=process`, so each container is held by
   its own shim and a containerd restart does not stop containers.
6. **Startup order.** containerd must be configured and running before k3s starts. k3s takes
   its cgroup driver from the CRI runtime once, at startup; if containerd is still stock
   (`runc`/`cgroupfs`) at that moment, kubelet latches `cgroupfs` and crun pod sandboxes fail
   with `bpf pin to '/sys/fs/bpf/crun/kubepods/...': No such file or directory`. After any
   runtime-handler change, restart k3s as well.

### 1.1 Rootful vs rootless

A non-root `nerdctl` always talks to the **rootless** containerd, even when `--address`
points at the rootful socket (the socket is `root:root 0660`). Rootful commands therefore
use `sudo`.

| | Rootful | Rootless |
|---|---|---|
| Config | `/etc/containerd/config.toml` | none needed |
| Socket | `/run/containerd/containerd.sock` | `$XDG_RUNTIME_DIR/containerd/containerd.sock` |
| Select with | `sudo nerdctl` | `nerdctl` |
| Apply config | `sudo systemctl restart containerd` | `systemctl --user restart containerd` |
| k3s | yes | no |

| Runtime | nerdctl | k3s |
|---|---|---|
| container | `RT=/usr/bin/crun` | default (no `runtimeClassName`) |
| microVM | `RT=/usr/bin/krun` | `runtimeClassName: krun` |

nerdctl has no setting for a default runtime: every `nerdctl run` passes `--runtime "$RT"`.
Set `RT=/usr/bin/crun` in the shell profile. `nerdctl compose` passes `--runtime` only when a
service declares `runtime:` — set it in the compose file, otherwise services run on runc.

## 2. Host preparation

Packages (names per distro):

- Arch/CachyOS: `crun`, `krun` (a symlink to `crun`; pulls `libkrun`/`libkrunfw`), `criu`,
  `fuse-overlayfs`, `containerd`, `nerdctl`, `buildkit`, `cni-plugins`, `rootlesskit`,
  `slirp4netns`, `gcc`, `python`, `sqlite`, `e2fsprogs`, `curl` (the last five are used by
  the checks in this document: `nerdctl build`, the host-side vsock/TSI scripts, the k3s
  backup, the block-image recipe and the k3s installer).
- Enable the buildkit daemon: `sudo systemctl enable --now buildkit`. The package ships the
  unit disabled; until it runs, `nerdctl build` fails with
  `no buildkit host is available, tried 2 candidates` (the count and paths depend on the
rootless/rootful instance).
- Fedora: `crun`, `crun-krun`, `criu`, `fuse-overlayfs`, `containerd`, `nerdctl` (or the
  `nerdctl-full` tarball).

Requirements:

- **cgroup v2** (`stat -fc %T /sys/fs/cgroup` → `cgroup2fs`).
- **systemd** as the init system.
- **`/dev/kvm`** readable by the user that runs krun (mode `0666`, or that user in group
  `kvm`).
- **crun with CRIU and libkrun**: `crun --version` shows `+CRIU` and `+LIBKRUN`.
- For rootless: `/etc/subuid` and `/etc/subgid` entries for the user
  (`user:100000:65536` in both).

One-time rootless delegation (as root):

```ini
# /etc/systemd/system/user@.service.d/delegate.conf
[Service]
Delegate=cpu cpuset io memory pids
```

```sh
sudo systemctl daemon-reload
```

This gives the user manager the cpuset and io controllers (`--cpuset-cpus` and friends need
them). A new login session always picks it up.

## 3. Rootful instance

### 3.1 containerd config

`/etc/containerd/config.toml`:

```toml
version = 4

# k3s: pod network
[plugins.'io.containerd.cri.v1.runtime'.cni]
  bin_dirs = ["/var/lib/rancher/k3s/data/current/bin"]
  conf_dir = "/var/lib/rancher/k3s/agent/etc/cni/net.d"

# k3s: crun is the default runtime handler
[plugins.'io.containerd.cri.v1.runtime'.containerd]
  default_runtime_name = "crun"

[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.crun]
  runtime_type = "io.containerd.runc.v2"
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.crun.options]
  BinaryName    = "/usr/bin/crun"
  SystemdCgroup = true

# k3s: runtime handler "krun" for pods with runtimeClassName: krun
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.krun]
  runtime_type = "io.containerd.runc.v2"
  pod_annotations = ["krun.*"]
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.krun.options]
  BinaryName    = "/usr/bin/krun"
  SystemdCgroup = true
```

Notes:

- The NVIDIA toolkit (§14.2) adds `imports = ["/etc/containerd/conf.d/*.toml"]` to this
  file and keeps the nvidia runtime handler in a drop-in; the block above is the base config.
- `version = 4` is current since containerd 2.3.0. containerd 2.1/2.2 need `version = 3`;
  on 2.4 a version-3 file still loads but logs a migration warning on every start.
- The CRI plugin blocks are used only by k3s. nerdctl selects its runtime per container with
  `--runtime`.
- `crun` and `krun` use the same shim (`io.containerd.runc.v2`) and differ only in
  `BinaryName`.
- `pod_annotations = ["krun.*"]` forwards pod annotations to the VM, so
  `krun.ram_mib`/`krun.cpus` can be set on a pod.
- `SystemdCgroup = true` matches nerdctl's default cgroup manager on cgroup v2.

Apply and check:

```sh
sudo systemctl enable --now containerd
sudo systemctl restart containerd          # after every config change

sudo containerd config dump | grep -A2 default_runtime_name   # → 'crun'
sudo journalctl -u containerd -b | grep 'starting cri plugin' | tail -1
```

The journal line shows the CRI plugin's loaded runtime map and CNI dirs — that is the state
the daemon actually runs with (`config dump` only reads the file).

### 3.2 nerdctl

```sh
export RT=/usr/bin/crun

sudo nerdctl run --rm --runtime "$RT" alpine echo ok
sudo nerdctl info | grep -i 'storage driver'        # → overlayfs
```

Namespaces and k3s are covered in §6; the CRI default runtime applies to k3s, not to
nerdctl.

### 3.3 Containerd snapshotters

A snapshotter stores every image layer and every container's writable layer as a **snapshot**.
`overlayfs` is containerd's default; the other core plugins (`native`, `btrfs`, `zfs`,
`erofs`, `blockfile`, `devmapper`) are enabled when their backing filesystem/tooling exists.
This section covers everything about *using* a snapshotter: the data model, the default
overlayfs, the optional btrfs snapshotter, selection, and snapshot/revert at every level. The
filesystem layouts that host the store are §12 (BTRFS) and §13 (XFS).

#### 3.3.1 The snapshot model

- **Committed** snapshots are immutable layers: image layers and `nerdctl commit` results.
- **Active** snapshots are a container's writable layer, parented on a committed snapshot.
- A container rootfs is an overlay mount: the committed snapshots form the `lowerdir` chain,
  and the active snapshot supplies `upperdir` and `workdir`.
- `sudo ctr -n default snapshots --snapshotter <name> list` shows `KEY PARENT KIND`; an active
  key is normally the container ID.

#### 3.3.2 Overlayfs (the default)

`overlayfs` is containerd's default — the same mechanism as Docker's `overlay2` driver,
though containerd does not call it that. It is the generic choice: it works on btrfs, XFS,
ext4 and any filesystem that supports overlayfs, rootful and rootless (the rootless instance
uses unprivileged overlayfs in a user namespace). Measured on both deployed hosts (btrfs root
and XFS root): explicit `--snapshotter overlayfs` runs succeed rootful and rootless.

Inspect it:

```sh
sudo nerdctl info | grep -i 'storage driver'                       # overlayfs
sudo ctr -n default snapshots --snapshotter overlayfs list | head  # KEY PARENT KIND
id=$(sudo nerdctl ps -q --filter name=<ctr>)
mount | grep -F "$id"    # overlay … lowerdir=…:…,upperdir=…,workdir=…
```

Selection is per command or by default:

```sh
sudo nerdctl --snapshotter overlayfs run --rm alpine echo ok   # explicit
# default in nerdctl.toml:  snapshotter = "overlayfs"
# rootless: CONTAINERD_SNAPSHOTTER=overlayfs (rootless containerd uses it anyway)
```

Each snapshotter has its own image unpacking and its own snapshot list; an image pulled for
`overlayfs` is not unpacked for `native` (or `btrfs`).

#### 3.3.3 The btrfs snapshotter (optional)

On btrfs the default overlayfs stays fully supported; the btrfs snapshotter is an optional
alternative that stores each snapshot as a btrfs subvolume. Use it only when you want O(1)
subvolume snapshots of a container's writable layer.

With `--snapshotter btrfs`, each snapshot is a real btrfs subvolume under
`/var/lib/containerd/io.containerd.snapshotter.v1.btrfs/active/<n>` (active) and
`.../snapshots/<n>` (committed), so a layer snapshot is O(1):

```sh
sudo nerdctl --snapshotter btrfs run -d --name c2 alpine sh -c 'echo A > /state; sleep 600'
n=$(sudo ls /var/lib/containerd/io.containerd.snapshotter.v1.btrfs/active/ | head -1)
sudo btrfs subvolume snapshot "/var/lib/containerd/io.containerd.snapshotter.v1.btrfs/active/$n" \
  /var/lib/containerd/c2-A
sudo nerdctl --snapshotter btrfs exec c2 sh -c 'echo B > /state'   # change state
sudo nerdctl --snapshotter btrfs stop c2
sudo rsync -a --delete /var/lib/containerd/c2-A/ \
  "/var/lib/containerd/io.containerd.snapshotter.v1.btrfs/active/$n/"
sudo nerdctl --snapshotter btrfs start c2
sudo nerdctl --snapshotter btrfs exec c2 cat /state            # A
```

The O(1) alternative is to swap subvolumes (`mv active/<n> active/<n>.orig` then
`btrfs subvolume snapshot c2-A active/<n>`), which also works while the container is stopped.
After either procedure, `nerdctl rm` can leave the active subvolume behind — remove it with
`sudo btrfs subvolume delete /var/lib/containerd/io.containerd.snapshotter.v1.btrfs/active/<n>`.
Measured: the recipe restored `A` after the container had written `B`.

Caveats: the btrfs snapshotter is root-only (measured rootless failure: `operation not
permitted` while mounting the subvolume), its layers are nested subvolumes so a store
snapshot excludes them (§12.6), and the store layout/migration on btrfs is §12.

#### 3.3.4 Snapshot and revert

Five levels, all tested on the deployed hosts.

##### Image-level (any snapshotter)

`commit` freezes the writable layer into an image; running that image restores the state;
running the original image is the revert:

```sh
sudo nerdctl run --name c1 alpine sh -c 'echo v1 > /data; sleep 1'
sudo nerdctl commit c1 snap:v1
sudo nerdctl rm -f c1
sudo nerdctl run --rm snap:v1 cat /data        # v1   (snapshot restored)
sudo nerdctl run --rm alpine sh -c 'cat /data 2>/dev/null || echo clean'   # clean (revert)
```

##### A container's writable layer (overlayfs)

```sh
sudo nerdctl run -d --name c1 alpine sh -c 'echo A > /data; sleep 600'
id=$(sudo nerdctl ps -q --filter name=c1)
upper=$(mount | grep -F "$id" | sed -n 's/.*upperdir=\([^,]*\).*/\1/p')
sudo cp -a --reflink=auto "$upper" /var/lib/containerd/c1-A    # snapshot (reflink where supported, §12/§13)
sudo nerdctl exec c1 sh -c 'echo B > /data; echo extra > /later'   # change state
sudo nerdctl stop c1
sudo rsync -a --delete /var/lib/containerd/c1-A/ "$upper/"     # revert contents
sudo nerdctl start c1
sudo nerdctl exec c1 cat /data                                 # A
```

Measured: the container came back with `A` and `/later` gone.

##### The whole store

Stop containerd, snapshot with the filesystem primitive, swap it back to revert:

```sh
sudo systemctl stop k3s && sudo systemctl stop containerd
# btrfs — only when the store is its own subvolume (§12.2); on the deployed btrfs host it
# still lives inside @, so run the §12.5 migration first:
sudo btrfs subvolume snapshot /var/lib/containerd /var/lib/containerd-A
# XFS (§13.1) — the deployed XFS host:
sudo cp -a --reflink=always /var/lib/containerd /var/lib/containerd-A
sudo systemctl start containerd && sudo systemctl start k3s
```

Revert: stop the services, move the current store aside, put the snapshot at
`/var/lib/containerd`, start again. Measured: the XFS branch on the XFS deployment (a removed
image was back after the revert, containers and k3s pods ran) and the btrfs subvolume branch
on a scratch store (§12.6).

Operator-run: the destructive swap was executed on the deployed hosts under explicit operator
direction during the specification spikes; it is not an autonomous-validation claim (no
`disposable: true` target was used).

##### The snapshotter API: discard and re-prepare

```sh
# the parent must be a Committed key of the *same* snapshotter
parent=$(sudo ctr -n default snapshots --snapshotter overlayfs list | awk '$3=="Committed"{print $1; exit}')
sudo ctr -n default snapshots prepare --snapshotter overlayfs demo-active "$parent"
sudo ctr -n default snapshots commit  --snapshotter overlayfs demo-committed demo-active
sudo ctr -n default snapshots list | grep demo
sudo ctr -n default snapshots remove demo-committed
```

Prepare/commit/remove is the lifecycle. To **revert** a container with the snapshotter
itself, stop it, discard its active snapshot and prepare a fresh one from the same parent:

```sh
key=$(sudo nerdctl ps -a -q --no-trunc --filter name=<ctr>)   # full ID = active snapshot key
parent=$(sudo ctr -n default snapshots --snapshotter overlayfs list | awk -v k="$key" '$1==k{print $2}')
sudo nerdctl stop <ctr>
sudo ctr -n default snapshots remove  --snapshotter overlayfs "$key"
sudo ctr -n default snapshots prepare --snapshotter overlayfs "$key" "$parent"
sudo nerdctl start <ctr>
```

The full container ID is the key (a short prefix fails with `snapshot … does not exist`).
Measured on both backends (overlayfs and btrfs): a `/data` file written via `exec` was gone
after the restart. The entrypoint must not recreate it — the test container ran `sleep 300`.

`ctr snapshots mounts <target> <key>` prints the mount command for a *prepared* snapshot; a
committed snapshot is not mountable directly
(`ctr: failed to get active mount: requested snapshot <ns>/<id>/<key> not active or view: failed precondition`).

##### MicroVMs (krun)

A microVM's writable layer is an ordinary containerd snapshot, so the image-level and overlayfs recipes above apply
unchanged. Measured on a `--runtime /usr/bin/krun` container: `/state=A` was committed into
an image, running the committed image with krun printed `A`, and running the original image
printed nothing (clean) — the revert. The overlayfs `upperdir` copy/restore above was
also exercised on that same krun container (A → B → A).

Snapshots never include volumes or bind mounts; capture those separately (§10). Snapshot and
revert are **offline** operations: stop the container (or the daemon for the store level)
before touching the writable layer.

#### 3.3.5 Rootless

Rootless containerd uses `overlayfs` — unprivileged overlayfs in a user namespace, measured on
both btrfs and XFS. The btrfs snapshotter is not usable rootless (measured: `operation not
permitted` while mounting the subvolume). See §4.4 for the rootless fallback when the kernel
lacks unprivileged overlayfs.


### 3.4 Storage backends

The snapshotter runs on whatever filesystem holds `/var/lib/containerd` (or the rootless
store): a btrfs root on one deployment, a single XFS root on another. Both are covered in
dedicated sections — §12 (BTRFS) and §13 (XFS).

## 4. Rootless instance

### 4.1 Setup (as the user)

```sh
containerd-rootless-setuptool.sh install
containerd-rootless-setuptool.sh install-buildkit
sudo loginctl enable-linger "$USER"
```

`enable-linger` needs root (or a polkit agent that authorizes it); as the plain user it fails
with `Could not enable linger: Access denied`.

No containerd config file is needed. containerd runs under RootlessKit in its own user,
mount and network namespace; `~/.config/containerd`, `~/.local/share/containerd` and
`$XDG_RUNTIME_DIR/containerd` are bind-mounted to the standard paths.

### 4.2 Checks

```sh
nerdctl run --rm --runtime "$RT" alpine echo ok
nerdctl run --rm --runtime "$RT" --memory 64m alpine echo ok
nerdctl run --rm --runtime "$RT" --cpuset-cpus 0-1 alpine grep Cpus_allowed_list /proc/self/status
nerdctl info | grep -i 'storage driver'             # → overlayfs
systemctl --user is-active containerd buildkit      # → active active
```

### 4.3 Networking properties

- **Published ports bind `0.0.0.0`.** The rootlesskit `builtin` port driver listens on all
  interfaces, so `-p 8080:80` answers on `127.0.0.1` and on the host IP.
- **Container → host loopback is blocked.** Containers cannot reach the host's `127.0.0.1`;
  use `--add-host host.internal:host-gateway` to reach host services by the host IP.
  `host-gateway` resolves to the host's primary address: if that address lies inside
  slirp4netns's own `10.0.2.0/24` (common on a VM whose only address is `10.0.2.15`), the
  path stays blocked and no host service is reachable from a rootless container.
- Resource limits (memory, cpuset, io) require the `Delegate=` line from §2.

### 4.4 Rootless overlayfs fallback

Rootless overlayfs needs kernel ≥ 5.13 (any distro), ≥ 5.11 on non-SELinux distros, or
Ubuntu. Not exercised in this deployment: both hosts support unprivileged overlayfs, so the
fallback is not installed. Otherwise:

```sh
containerd-rootless-setuptool.sh install-fuse-overlayfs
```

Add to `~/.config/containerd/config.toml` (replace `1000` with the UID):

```toml
version = 3
[proxy_plugins."fuse-overlayfs"]
  type = "snapshot"
  address = "/run/user/1000/containerd-fuse-overlayfs.sock"
```

and export `CONTAINERD_SNAPSHOTTER=fuse-overlayfs`. If that fails too, use
`CONTAINERD_SNAPSHOTTER=native` (copies files; slow).

## 5. Runtimes: crun and krun

containerd starts one shim (`containerd-shim-runc-v2`) per container; the shim executes the
OCI runtime binary named by `BinaryName` (k3s) or `--runtime` (nerdctl), which sets the
container up and exits.

- `crun` runs a normal container, sharing the host kernel.
- `krun` (the same binary called by another name) boots the container in a libkrun microVM
  with its own guest kernel. It needs `/dev/kvm`.

### 5.1 crun

```sh
sudo nerdctl run --rm --runtime /usr/bin/crun alpine uname -r    # → host kernel
```

For k3s, a pod without `runtimeClassName` uses the CRI default handler (`crun`):

```sh
kubectl run c --image=alpine --restart=Never -- sh -c 'uname -r'
kubectl logs c && kubectl delete pod c                            # → host kernel
```

Do not use `kubectl run --rm` without a TTY (`--rm should only be used for attached
containers`); add `-it` only when interactive.

### 5.2 krun

VM settings come from `krun.*` OCI annotations or a `/.krun_vm.json` file in the image;
annotations take precedence.

| Annotation | Effect |
|---|---|
| `krun.ram_mib=N` | VM RAM in MiB (default: the container memory limit, else 1024) |
| `krun.cpus=N` | vCPUs (default: the container's CPU affinity) |
| `krun.nested_virt=1` | expose VT-x/SVM to the guest |
| `krun.gpu_flags=N` | virtio-gpu with virgl flags (needs `/dev/dri`; the crun form fails on this host — see §14.3) |
| `krun.use_passt=1` | passt-based networking |
| `krun.variant=sev\|aws-nitro` | alternative libkrun variant |

nerdctl:

```sh
sudo nerdctl run --rm --runtime /usr/bin/krun alpine uname -r          # → guest kernel
sudo nerdctl run --rm --runtime /usr/bin/krun --memory 512m alpine free -m
sudo nerdctl run --rm --runtime /usr/bin/krun --annotation krun.ram_mib=768 --annotation krun.cpus=2 \
  alpine sh -c 'free -m | sed -n 2p; nproc'
```

k3s: uncomment/enable the `krun` handler (§3.1), create the RuntimeClass, and set
`runtimeClassName: krun`:

```sh
sudo -E kubectl apply -f - <<'EOF'
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: krun
handler: krun
EOF
```

Pods can then carry `krun.*` annotations (forwarded by `pod_annotations`).

**Limits of a krun container:**

| Operation | Behaviour |
|---|---|
| `nerdctl exec` / `kubectl exec` | not supported (`the handler does not support exec`) |
| `nerdctl logs` | early-boot guest console lines only; later output is not reliably captured — verify services by HTTP |
| `nerdctl stats` | works, but the memory limit shown is the host's |
| `nerdctl top` | works (`[libcrun:krun]`) |
| networking, published ports, DNS | work like a normal container |

Size a microVM with `--memory` (or the annotation); it is not readable from inside via
control-plane tools.

libkrun's full virtio device model, and the setup of virtio-vsock and TSI, are specified in
[LIBKRUN.md](LIBKRUN.md).

## 6. k3s

The complete k3s specification — the shared-containerd configuration, runtime selection, and
a tested cluster backup/restore procedure — is in [K3S.md](K3S.md).

`/etc/rancher/k3s/config.yaml`:

```yaml
container-runtime-endpoint: unix:///run/containerd/containerd.sock
```

Add `https-listen-port: 6444` if 6443 is already taken on the host.

`kubelet-arg: cgroup-driver=systemd` is not needed: k3s asks the CRI runtime for the driver
and uses the answer (with the containerd config above it is `systemd`).

Install and start, in this order:

```sh
# 1. containerd configured and running (§3.1)
# 2. k3s config written
curl -sfL https://get.k3s.io | sh -      # the installer starts k3s immediately

# the admin kubeconfig is root-only; either export it for sudo -E kubectl,
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
sudo -E kubectl get nodes -o wide        # → Ready, containerd://2.x

# or give your user its own copy and point kubectl at it
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER" ~/.kube/config
export KUBECONFIG=$HOME/.kube/config
kubectl get nodes -o wide
```

If k3s is already running and the containerd runtime config changes, restart k3s
(`sudo systemctl restart k3s`) so kubelet re-reads the CRI cgroup driver.

### 6.1 nerdctl against k3s

```sh
sudo nerdctl -n k8s.io ps                    # containers started by k3s
sudo nerdctl -n k8s.io build -t app:dev .    # image for pods with imagePullPolicy: Never
sudo nerdctl -n k8s.io load -i image.tar     # any image, including airgap images
```

No `--address` is needed when the external containerd is at its default socket. (The
`--address=/run/k3s/containerd/containerd.sock` form applies to k3s's *bundled* containerd.)

A pod using a locally built image:

```sh
kubectl run app --image=app:dev --image-pull-policy=Never --restart=Never -- cat /app.txt
```

### 6.2 Airgap images

k3s imports the tarballs in `/var/lib/rancher/k3s/agent/images/` only when it runs its own
(bundled) containerd. With an external containerd, load them explicitly:

```sh
sudo nerdctl -n k8s.io load -i /path/to/k3s-airgap-images-<arch>.tar.zst
```

Not exercised in this deployment: no airgap tarball was available, so the load path is
specified from the k3s documentation rather than measured here.

### 6.3 RuntimeClasses

k3s ships RuntimeClasses for the handlers it knows (`crun`, `nvidia`, wasm runtimes, …) but
not for `krun`; create it once (§5.2).

## 7. Name resolution and DNS

### 7.1 How resolution works

- **nerdctl** resolves container names through `/etc/hosts` entries that nerdctl maintains
  per network: every container on the same user-defined network gets the names of its peers
  (and compose service names, which are the container hostnames). Cross-network names do not
  resolve.
- **k3s** uses CoreDNS: `<service>.<namespace>.svc.cluster.local`, and the `NodeHosts` block
  of the CoreDNS Corefile, which maps node names to node IPs so pods can reach
  `<node-name>:<port>`.
- **krun microVMs** receive the same `/etc/hosts`/`resolv.conf` as a normal container, and
  their traffic is proxied, so name resolution inside a microVM behaves the same.

### 7.2 Matrix

| Scope | How |
|---|---|
| nerdctl ↔ nerdctl (same network) | names; compose service names |
| nerdctl ↔ nerdctl (different networks) | not resolvable; publish ports instead |
| microVM ↔ container (same network) | names, both directions |
| pod ↔ pod | `<svc>.<ns>.svc.cluster.local` |
| nerdctl container → k3s Service | `<host-ip>:<nodePort>` |
| pod → nerdctl container | `<node-name>:<port>` (CoreDNS `NodeHosts`) |
| nerdctl container → host | `--add-host host.internal:host-gateway` |
| anything → rootless container | `<host-ip>` or `127.0.0.1` on the published port |
| rootless container → host loopback | blocked; use the host IP |
| nested containers → each other | names on the inner user-defined network (§9) |
| nested container → outer/k3s | publish the inner port on the outer container too (§9.4) |

### 7.3 Checks

```sh
# rootful: container ↔ microVM by name
sudo nerdctl network create app
sudo nerdctl run -d --runtime "$RT" --network app --name web nginx
sudo nerdctl run -d --runtime /usr/bin/krun --network app --name vm -p 8081:80 nginx
sudo nerdctl exec web curl -s -m5 http://vm >/dev/null && echo name-ok
sudo nerdctl run --rm --runtime /usr/bin/krun --network app alpine sh -c 'wget -qO- -T5 http://web >/dev/null && echo vm-name-ok'

# rootless: plain names and external DNS
nerdctl network create rlapp
nerdctl run -d --network rlapp --name db alpine sleep 120
nerdctl run --rm --network rlapp alpine ping -c1 -W2 db
nerdctl run --rm alpine getent hosts example.com

# k3s
kubectl run net --image=alpine --restart=Never -- sh -c \
  'getent hosts kube-dns.kube-system.svc.cluster.local; getent hosts '"$(hostname -s)"'; sleep 20'
kubectl wait --for=condition=Ready pod/net --timeout=60s
kubectl logs net
```

## 8. systemd images

The image needs systemd and `/sbin/init` as its command:

```dockerfile
FROM fedora:43
RUN dnf -y install systemd httpd && systemctl enable httpd && dnf clean all
CMD ["/sbin/init"]
```

Use a supported release (`fedora:42` is past end of support and logs an end-of-support
warning inside the guest).

| Mode | Run |
|---|---|
| rootful, crun | `sudo nerdctl run -d --runtime /usr/bin/crun --systemd=true --name sd -p 8082:80 sd-httpd` |
| rootful, krun | `sudo nerdctl run -d --runtime /usr/bin/krun -e KRUN_INIT_PID1=1 --ulimit nofile=524288:524288 --name sdvm -p 8083:80 sd-httpd` |
| rootless, crun | `nerdctl run -d --runtime /usr/bin/crun --systemd=true --name sdrl -p 8086:80 sd-httpd` |
| rootless, krun | `nerdctl run -d --runtime /usr/bin/krun -e KRUN_INIT_PID1=1 --ulimit nofile=524288:524288 --name sdvmrl -p 8087:80 sd-httpd` |

Rules:

- `--systemd=true` applies only when the entrypoint is `/sbin/init`, `/usr/sbin/init` or
  `/usr/local/sbin/init`; `--systemd=always` applies it regardless. Use the `=` form.
- Under krun, systemd must be PID 1: set `KRUN_INIT_PID1=1` in the container's environment
  (libkrun ≥ 1.16). Without it systemd refuses to start — the message varies by systemd
  version (`init: required argument missing.` on Fedora 42, `Explicit --user argument
  required to run as user manager.` on Fedora 43). The cost is that the container's exit code
  is not propagated.
- Do not combine `--systemd` with krun.
- A plain httpd with an empty docroot answers `403`; that is a successful HTTP response for
  reachability checks (`curl -s ... >/dev/null` exits 0).

Checks:

```sh
sudo nerdctl build -t sd-httpd .
# artefacts used by the nested examples in section 9.4
sudo nerdctl tag sd-httpd sd-httpd:43
sudo nerdctl save -o sd-httpd.tar sd-httpd:43

sudo nerdctl run -d --runtime /usr/bin/crun --systemd=true --name sd -p 8082:80 sd-httpd
sleep 10
sudo nerdctl exec sd systemctl is-system-running --wait || true   # "running" or "degraded"
curl -s -m5 -o /dev/null -w '%{http_code}\n' localhost:8082        # 403

sudo nerdctl run -d --runtime /usr/bin/krun -e KRUN_INIT_PID1=1 --ulimit nofile=524288:524288 \
  --name sdvm -p 8083:80 sd-httpd
sleep 15
curl -s -m5 -o /dev/null -w '%{http_code}\n' localhost:8083        # 403
sudo nerdctl logs sdvm | head                                     # early-boot guest lines only
```

`--ulimit nofile=524288:524288` is required under krun: the guest systemd inherits the
container's file-descriptor limit and, with the default soft limit (1024), cannot spawn
services (`httpd.service: Failed to spawn 'start' task: Too many open files`), so the port
returns `000` instead of `403`.

`systemctl is-system-running` exits non-zero for `degraded`, which is normal for a container;
tolerate it (`|| true`) or compare the printed word. Under krun `nerdctl logs` only reliably
carries early-boot console lines (later guest output stays in the guest journal) — verify the
VM by HTTP.

DNS inside a systemd container works like in any other container: external names resolve,
and on a user-defined network peers resolve by name.

## 9. Nesting

Nested instances run a full systemd + containerd + nerdctl stack inside a privileged
container (the kind pattern). It works rootful and rootless; the inner instance is
independent of the outer one (own store, own networks).

### 9.1 Inner image

```dockerfile
FROM fedora:43
RUN dnf -y install systemd iptables-nft iproute crun && dnf clean all
RUN curl -sSL https://github.com/containerd/nerdctl/releases/download/v2.4.1/nerdctl-full-2.4.1-linux-amd64.tar.gz \
    | tar -C /usr/local -xz \
 && systemctl enable containerd \
 && ln -sf /usr/local/bin/nerdctl /usr/bin/nerdctl
CMD ["/sbin/init"]
```

The `nerdctl-full` tarball provides containerd, nerdctl, buildkitd and runc; the `crun`
package adds `/usr/bin/crun` so the inner instance can use the same runtime family as the
outer one.

### 9.2 Rootful nesting

```sh
sudo nerdctl run -d --runtime /usr/bin/crun --name inner \
  --privileged --security-opt privileged-without-host-devices --systemd=always \
  -p 8095:8095 -v inner-var:/var -v "$PWD":/spike:ro inner-nerdctl /sbin/init
```

`--privileged` with `--systemd` is rejected unless `--security-opt
privileged-without-host-devices` is also passed.

### 9.3 Rootless nesting

The rootless instance has its own image store, so transfer the image built in §9.1:

```sh
sudo nerdctl save -o /tmp/inner-nerdctl.tar inner-nerdctl
nerdctl load -i /tmp/inner-nerdctl.tar
```

```sh
nerdctl run -d --runtime /usr/bin/crun --name innerrl \
  --privileged --security-opt privileged-without-host-devices --systemd=always \
  -p 8096:8096 -v innerrl-var:/var -v "$PWD":/spike:ro inner-nerdctl /sbin/init
```

The same image and flags; the outer instance is rootless, the inner systemd/containerd run as
namespace-root inside it. The inner systemd usually reports `degraded` (normal in a
container); `systemctl is-active containerd` must be `active`.

### 9.4 Inner configuration and checks

Give the inner nerdctl a bridge subnet that does not collide with the outer container's own
network (`10.4.0.0/24` by default):

```sh
sudo nerdctl exec inner sh -c 'mkdir -p /etc/nerdctl && printf "bridge_ip = \"10.99.0.1/24\"\n" > /etc/nerdctl/nerdctl.toml'

sudo nerdctl exec inner systemctl is-active containerd          # active
sudo nerdctl exec inner nerdctl run --rm --runtime /usr/bin/crun alpine echo ok
```

Without the override, a *fresh* nested instance fails its first bridge-network run with
`failed to verify networking settings: failed to create default network: subnet 10.4.0.0/24
overlaps with other one on this address space`. (Once the inner default network exists the
run succeeds, so test this before writing the override.) `--network none` needs no override.

nerdctl requires container names of at least two characters; a one-character name is rejected
with `identifier "a" must match pattern ...`.

Inner DNS and inner systemd images:

```sh
sudo nerdctl exec inner nerdctl network create inapp
sudo nerdctl exec inner nerdctl run -d --name peer --network inapp alpine sleep 120
sudo nerdctl exec inner nerdctl run --rm --network inapp alpine ping -c1 peer

# systemd image inside the inner instance (load it into the inner store first)
sudo nerdctl exec inner nerdctl load -i /spike/sd-httpd.tar
sudo nerdctl exec inner nerdctl run -d --runtime /usr/bin/crun --systemd=true --name sdi -p 8090:80 sd-httpd:43
sudo nerdctl exec inner curl -s -m5 -o /dev/null -w '%{http_code}\n' localhost:8090   # 403
```

Reaching an inner service from the host: publish the inner port on the outer container
(`-p 8095:8095` for the rootful example, `-p 8096:8096` for the rootless one) and publish the
same port inside:

```sh
sudo nerdctl exec inner nerdctl run -d --runtime /usr/bin/crun --systemd=true --name sdi-host -p 8095:80 sd-httpd:43
curl -s -m5 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8095                    # 403
```

For a rootful outer container the inner published port is also reachable at the outer
container's IP without an outer publish; for a rootless outer, the outer publish is required
(the container network is not routable from the host).

The inner store lives in the `-v <name>:/var` volume. Recreate it for a clean nested
instance (`nerdctl rm -f inner && nerdctl volume rm inner-var`), and remember that container
names persist in that volume across restarts.

## 10. Images, state and fast reset

| Level | Create | Restore |
|---|---|---|
| Images | `nerdctl save -o img.tar <image>…` | `nerdctl load -i img.tar` |
| Container filesystem | `nerdctl commit <ctr> <image>` | `nerdctl run --runtime "$RT" <image>` |
| Volume | `nerdctl run --rm --runtime "$RT" -v <vol>:/v -v "$PWD":/b alpine tar czf /b/<vol>.tgz -C /v .` | the same with `tar xzf /b/<vol>.tgz -C /v` |
| Process state (CRIU) | `nerdctl checkpoint create [--leave-running] <ctr> <cp>` | `nerdctl start --checkpoint <cp> <ctr>` (stop the container first) |

The table is written for the rootful instance: prefix every command with `sudo` (running it
without `sudo` acts on the rootless instance, whose paths and stores are different).

Images, commits and volumes are the *portable* backup/restore layer. For same-host,
instant snapshots and revert of a container's writable layer see §3.3.4 (all levels), with the
filesystem primitives in §12.6 (BTRFS) and §13.1 (XFS).

Rules:

- Volumes are never included in a commit or checkpoint; capture them separately.
- For k3s images, add `-n k8s.io`.
- Never back up containerd's internal directories.

**Checkpointing.** Checkpoint names are global to the containerd namespace, not per container:
`nerdctl checkpoint ls <ctr>` lists every checkpoint, and creating a name that already exists
fails with `checkpoint with name <cp> already exists for container <id>`. Checkpoints also outlive their
container; remove one with `nerdctl checkpoint rm <existing-ctr> <cp>` (any existing container
works, because the store is global).

`nerdctl checkpoint create [--leave-running] <ctr> <cp>` works with rootful crun: without
`--leave-running` the container is killed (`Exited (137)`), with it the container keeps
running. Restoring works too: `nerdctl start --checkpoint <cp> <ctr>` resumes the process —
measured on a counter container that had logged `tick-4`, the restore continued at `tick-9`,
not from `tick-1`. The container must be stopped first: while it still runs,
`start --checkpoint` only warns `container <id> is already running` and does nothing.
`nerdctl rm -f <ctr>` after a checkpoint succeeds.

**Fast reset.** `--rm` discards the writable layer; a new container starts from the image
with an empty one, so resetting to a known state costs one container start, independent of
image size, as long as the image is local.

- Bake the warm state into the image (Dockerfile or `nerdctl commit`).
- Keep per-run state out of volumes.
- Use `--read-only --tmpfs <dir>` so nothing can be written outside the tmpfs dirs.
- `RT=/usr/bin/krun` makes each run a fresh microVM.

```sh
sudo nerdctl run --rm --runtime "$RT" --read-only --tmpfs /tmp --tmpfs /work <image> ./job
```

## 11. Reference

### 11.1 Files

| File | Purpose |
|---|---|
| `/etc/containerd/config.toml` | rootful containerd: runtimes, CRI default runtime, k3s CNI dirs |
| `/etc/rancher/k3s/config.yaml` | k3s: external containerd endpoint (and port override) |
| `/etc/systemd/system/user@.service.d/delegate.conf` | rootless cgroup delegation |
| `~/.config/containerd/config.toml` | only for the fuse-overlayfs fallback |
| `/etc/nerdctl/nerdctl.toml` | only inside a nested instance (`bridge_ip`) |

### 11.2 Apply order

1. Write `/etc/containerd/config.toml`; `sudo systemctl restart containerd`.
2. Write `/etc/rancher/k3s/config.yaml`; install/start k3s (restart it after any containerd
   runtime change).
3. Write the delegation drop-in; `sudo systemctl daemon-reload`.
4. As the user: `containerd-rootless-setuptool.sh install`, `… install-buildkit`,
   `loginctl enable-linger "$USER"`.
5. `export RT=/usr/bin/crun` in the shell profile.

### 11.3 Acceptance checks

```sh
# rootful
sudo nerdctl run --rm --runtime /usr/bin/crun alpine echo ok
sudo nerdctl run --rm --runtime /usr/bin/krun alpine uname -r           # differs from host
sudo nerdctl info | grep -i 'storage driver'                            # overlayfs

# rootless
nerdctl run --rm --runtime /usr/bin/crun alpine echo ok
nerdctl run --rm --runtime /usr/bin/krun alpine uname -r
nerdctl run --rm --runtime /usr/bin/crun --memory 64m alpine echo ok
systemctl --user is-active containerd buildkit                          # active active

# k3s
kubectl get nodes -o wide                                               # containerd://2.x
kubectl run t --image=alpine --restart=Never -- sh -c 'uname -r'
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/t --timeout=60s
kubectl logs t && kubectl delete pod t

kubectl run v --image=alpine --restart=Never --overrides='{"apiVersion":"v1","spec":{"runtimeClassName":"krun","containers":[{"name":"c","image":"alpine","command":["uname","-r"]}]}}'
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/v --timeout=90s
kubectl logs v && kubectl delete pod v

# systemd images
curl -s -m5 -o /dev/null -w '%{http_code}\n' localhost:8082             # 403
sudo nerdctl logs sdvm | head                                           # early guest boot lines (not a reliable check)

# nesting
sudo nerdctl exec inner systemctl is-active containerd                  # active
sudo nerdctl exec inner nerdctl run --rm --runtime /usr/bin/crun alpine echo ok
```

## 12. BTRFS layout

Btrfs provides subvolumes as independent snapshot / send / receive units that can carry
their own mount options, so the containerd store and the k3s data dir can be snapshotted,
reverted and compressed independently. Everything btrfs-specific in this document is here.

**The btrfs snapshotter is optional.** Overlayfs is fully supported on btrfs and remains the
default (§3.3); enabling the btrfs snapshotter only adds subvolume snapshots of individual
container layers (§3.3.3). The measured plugin status on this host shows both `overlayfs` and
`btrfs` as `ok`.

| Path | Subvolume | Mount options | Why |
|---|---|---|---|
| `/var/lib/containerd` | recommended (currently on `@`) | `compress=zstd:3,noatime` | image/snapshot store; store-level snapshot + revert |
| `/var/lib/rancher/k3s` | yes | inherited from `/` | cluster state (K3S.md §8) |
| `/var/lib/rancher/k3s/storage` | **no** — keep it inside the datadir | — | snapshots skip nested subvolumes; one datadir snapshot then covers every local-path PVC |
| `~/.local/share/containerd` (rootless) | yes | `compress=zstd:3,noatime` | per-user store, isolated from `@home` snapshots |

### 12.1 Overlayfs or the btrfs snapshotter?

`overlayfs` is containerd's default and works on btrfs with no extra setup. The `btrfs`
snapshotter is an alternative, not a replacement: it stores each snapshot as a btrfs
subvolume. Choose by how you want to snapshot a single container's writable layer:

| | `overlayfs` (default) | `btrfs` snapshotter |
|---|---|---|
| Snapshot storage | writable upperdir is a plain directory | each snapshot is a subvolume under `.../io.containerd.snapshotter.v1.btrfs/{active,snapshots}/<n>` |
| Snapshot one container layer | reflink copy of its `upperdir` (O(1)) | `btrfs subvolume snapshot` of `active/<n>` (O(1)) |
| Store-level snapshot | includes content store + overlayfs dirs | same, but the btrfs snapshotter's layers are nested subvolumes and appear as empty dirs (excluded) |
| Rootless | works (native unprivileged overlayfs, measured) | not usable rootless: mounting the subvolume fails with `operation not permitted` (measured) |
| Image unpacking | per snapshotter | per snapshotter |

Use `overlayfs` by default — for containers, k3s and krun — and follow §3.3.4 for
snapshot/revert. Enable the btrfs snapshotter only when you want O(1) subvolume snapshots of
container filesystems; its recipe is §3.3.3. Both can coexist on one host (separate image
stores). Note that a store snapshot then contains the overlayfs layers but not the btrfs
snapshotter's layers.

### 12.2 Rootful store

```sh
sudo btrfs subvolume create /var/lib/containerd
# /etc/fstab
# /dev/mapper/root /var/lib/containerd btrfs defaults,noatime,compress=zstd:3,space_cache=v2,subvol=/@/var/lib/containerd 0 0
sudo systemctl daemon-reload && sudo mount /var/lib/containerd
findmnt -no TARGET,OPTIONS /var/lib/containerd
```

`subvol=` is the path *inside the filesystem*, so it includes the parent subvolume's name
(`/@/var/lib/containerd` here; drop the `/@` when the root subvolume is mounted differently).
A subvolume may be mounted at its own path — that is how it gets options that differ from
`/` (measured).

State of the deployed host: the rootful store currently lives on the root subvolume `@`
(already compressed with zstd, but with `relatime` and no dedicated subvolume). The layout
above is the recommended target and §12.5 is the migration; the rootless store (§12.3) and
the k3s datadir (K3S.md §8) already are dedicated subvolumes.

### 12.3 Rootless store (rootless pods)

Rootless containerd keeps its data in `$XDG_DATA_HOME/containerd` (normally
`~/.local/share/containerd`) and its socket/state in `$XDG_RUNTIME_DIR/containerd`. Give the
store its own subvolume, owned by the user, and mount it with its own options:

```sh
systemctl --user stop containerd
mv ~/.local/share/containerd ~/.local/share/containerd.old
sudo btrfs subvolume create /home/$USER/.local/share/containerd
sudo chown "$USER" /home/$USER/.local/share/containerd
# the store holds files owned by the mapped subuid root: copy as root, preserving owners
sudo cp -a --reflink=auto ~/.local/share/containerd.old/. ~/.local/share/containerd/

# /etc/fstab
# /dev/mapper/root /home/<user>/.local/share/containerd btrfs defaults,noatime,compress=zstd:3,space_cache=v2,subvol=/@home/<user>/.local/share/containerd 0 0
sudo systemctl daemon-reload && sudo mount /home/$USER/.local/share/containerd
systemctl --user start containerd
nerdctl ps -a && nerdctl run --rm alpine echo ok
```

Measured: a 7.5 GiB store migrated this way kept its containers, the mount showed
`noatime,compress=zstd:3`, and a new rootless container ran. Copying as the user fails on
the subuid-owned files, so the `cp` runs as root while preserving ownership.

Rootless containerd uses the `overlayfs` snapshotter. Unprivileged overlayfs on btrfs works
in a user namespace (measured with `unshare -Ur -m` and upper/work on btrfs); with that
support present rootless containerd does not need `fuse-overlayfs` for the overlayfs
snapshotter. The `btrfs` snapshotter is not usable rootless
(measured: `operation not permitted` while mounting the subvolume).

`chattr +C` marks new files in a tree nodatacow; a user can set it on a directory they own
(measured: `lsattr -d` shows `C`). It disables CoW for that tree, so use it only where you do
not rely on CoW/snapshot sharing.

Keeping the store in its own subvolume also keeps the container layers out of `@home`
snapshots.

### 12.4 The btrfs snapshotter (optional)

Snapshotter usage — the subvolume layout, the recipe and the orphan cleanup — is with the
other snapshotter usage in §3.3.3. This section keeps the filesystem side: the store on its
own subvolume (§12.2), migration (§12.5) and the snapshot/send semantics (§12.6).

### 12.5 Migration (existing store)

containerd's btrfs snapshotter keeps its own snapshots as *nested* subvolumes under
`.../io.containerd.snapshotter.v1.btrfs/{snapshots,active,view}`; a plain copy flattens them
into ordinary directories and breaks them. Move the nested subvolumes first (same
filesystem: `mv` preserves subvolume identity), then copy the flat remainder:

```sh
sudo systemctl stop k3s && sudo systemctl stop containerd
sudo btrfs subvolume create /var/lib/containerd.new
sudo mkdir -p /var/lib/containerd.new/io.containerd.snapshotter.v1.btrfs/{snapshots,active,view}
sudo mv /var/lib/containerd/io.containerd.snapshotter.v1.btrfs/snapshots/* \
        /var/lib/containerd.new/io.containerd.snapshotter.v1.btrfs/snapshots/
sudo mv /var/lib/containerd/io.containerd.snapshotter.v1.btrfs/active/* \
        /var/lib/containerd.new/io.containerd.snapshotter.v1.btrfs/active/
sudo mv /var/lib/containerd/io.containerd.snapshotter.v1.btrfs/view/* \
        /var/lib/containerd.new/io.containerd.snapshotter.v1.btrfs/view/
sudo rsync -a --exclude 'io.containerd.snapshotter.v1.btrfs/snapshots' \
        --exclude 'io.containerd.snapshotter.v1.btrfs/active' \
        --exclude 'io.containerd.snapshotter.v1.btrfs/view' \
        /var/lib/containerd/ /var/lib/containerd.new/
sudo mv /var/lib/containerd /var/lib/containerd.old
sudo mv /var/lib/containerd.new /var/lib/containerd
sudo systemctl start containerd && sudo systemctl start k3s
```

Operator-run on a scratch store on the deployed host (not a `disposable: true` target): moved subvolumes stayed subvolumes (`btrfs subvolume show`
succeeds, layer files intact), the copy kept content store and metadata, and the migrated
store served containers normally.

### 12.6 Snapshot and send semantics (measured)

- `btrfs subvolume snapshot` is O(1) and does **not** descend into nested subvolumes: a
  snapshot of a parent subvolume shows the nested child as an empty directory. `btrfs send`
  has the same rule — the child must be sent separately (both measured locally).
- Store-level snapshot + revert: the procedure is §3.3.4; on btrfs the primitive is a
  subvolume snapshot. Operator-run end-to-end on a scratch store: an image removed with
  `ctr images remove` after the snapshot left 0 images, and after the swap the image was back
  (1) and a container ran.
- `chattr +C`: measured that a user can set it on a directory they own on btrfs; it makes new
  files nodatacow. It reduces CoW sharing, so it conflicts with snapshot-based revert for
  that tree.
- What is *not* covered here: shipping the `btrfs send` stream to another host. The stream
  was exercised locally only; treat transport as outside this document.

## 13. XFS layout

The XFS deployment is a **single XFS root filesystem** — no separate device, no LVM, no
extra partition. Everything runs on that one filesystem:

| Path | Where | Notes |
|---|---|---|
| `/var/lib/containerd` | directory on the XFS root | image/snapshot store |
| `/var/lib/rancher/k3s` | directory on the XFS root | cluster state + local-path storage |
| `~/.local/share/containerd` | directory on the XFS root | rootless store |

Verify the filesystem (measured on the deployed host: one disk, `sda1` mounted at `/`):

```sh
findmnt -no SOURCE,FSTYPE,OPTIONS /        # /dev/sda1 xfs rw,noatime,inode64,…
xfs_info / | grep -E 'reflink|ftype'       # reflink=1  ftype=1
```

`ftype=1` is required for overlayfs; `noatime` removes atime writes. Nothing needs to be
created or mounted: containerd writes its store on the root filesystem. Measured snapshotter
status on this host: `overlayfs` and `native` are `ok`; `btrfs` and `zfs` are `skip`.

### 13.1 Reflink snapshot and revert (measured)

XFS reflink copies are the snapshot primitive here:

```sh
sudo cp -a --reflink=always /var/lib/containerd /var/lib/containerd-A
```

The store-level procedure (stop services, snapshot, swap back) is §3.3.4; the k3s datadir
procedure is K3S.md §10.2. Measured on the deployed host: an 810 MiB store snapshot took
**1.7 s** and added **2 MiB** of disk usage; an image removed after the snapshot was back
after the revert and the node returned `Ready`; a k3s datadir reflink copy took **0.07 s**.

Rootless: the store is `~/.local/share/containerd` on the same XFS root; the `overlayfs`
snapshotter works in a user namespace (measured: `nerdctl run` returns `ok`), and the same
reflink copy can snapshot that store while the rootless daemon is stopped.

Durability: reflink copies share the same filesystem, so they protect against in-place
damage only. For off-host backups use the §10 image/volume exports and the §6.2
`sqlite3 .backup` + `storage.tar.gz` pair (K3S.md §6.2).

## 14. GPU devices

Two mechanisms: vendor-neutral DRM/render devices (`/dev/dri`, `/dev/kfd`) passed with
`--device`, and NVIDIA GPUs through the NVIDIA Container Toolkit (nct) with a runtime handler
or CDI. Measured on the deployed host (NVIDIA RTX 4080 SUPER, driver 615.78.08, plus an AMD
Radeon 610M iGPU).

### 14.1 DRM/render devices (`/dev/dri`, `/dev/kfd`)

```sh
sudo nerdctl run --rm --device /dev/dri alpine ls -l /dev/dri
sudo nerdctl run --rm --device /dev/kfd --device /dev/dri <image> <cmd>
```

Measured: `--device /dev/dri` exposes `card1`, `card2`, `renderD128` and `renderD129`; the
render nodes are readable inside the container, and the container's root user is in the
`video` group. `--device /dev/kfd` exposes the AMD compute queue the same way. For a
non-root user inside the container, add the matching group (`--group-add video`,
`--group-add render` where used). The rootless instance accepts `--device /dev/dri` too
(measured: the devices appear, owned by the mapped `nobody`).

### 14.2 NVIDIA Container Toolkit (nct)

The host must run the NVIDIA driver. Install the toolkit (`nvidia-container-toolkit` on
Arch; NVIDIA's package repository on Fedora/Debian), then configure containerd:

```sh
sudo nvidia-ctk runtime configure --runtime=containerd
sudo systemctl restart containerd
```

Measured: the command writes `/etc/containerd/conf.d/99-nvidia.toml` and adds
`imports = ["/etc/containerd/conf.d/*.toml"]` to `/etc/containerd/config.toml`. The drop-in
registers the runtime handler

```toml
[plugins."io.containerd.cri.v1.runtime".containerd.runtimes.nvidia]
  runtime_type = "io.containerd.runc.v2"
[plugins."io.containerd.cri.v1.runtime".containerd.runtimes.nvidia.options]
  BinaryName = "/usr/bin/nvidia-container-runtime"
  SystemdCgroup = true
```

The drop-in is a full copy of the CRI config (cni, crun, krun) plus the nvidia handler, so
it shadows later `config.toml` edits for those keys; keep that in mind when editing the config
(the same handler keys can be added to `config.toml` by hand instead). Then
generate the CDI spec and check it:

```sh
sudo mkdir -p /etc/cdi
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
sudo nvidia-ctk cdi list       # nvidia.com/gpu=0, nvidia.com/gpu=GPU-…, nvidia.com/gpu=all
```

Run a GPU container — both forms measured:

```sh
sudo nerdctl run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu24.04 \
  nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
sudo nerdctl run --rm --device nvidia.com/gpu=all nvidia/cuda:12.6.0-base-ubuntu24.04 \
  nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
```

Both printed `NVIDIA GeForce RTX 4080 SUPER, 615.78.08`. The image must provide `nvidia-smi`
(the CUDA base images do); the driver libraries and device nodes are injected by the toolkit.

Rootless: NVIDIA access is **not** available in the rootless instance here (measured:
`no known GPU vendor found in CDI specs`, and `unresolvable CDI devices nvidia.com/gpu=all`);
use the rootful daemon for NVIDIA GPUs.

### 14.3 krun

krun passes a paravirtualized virtio-gpu to the guest: with the libkrun API (`krun_set_gpu_options(1)`,
LIBKRUN.md §5) the guest sees `/dev/dri/card0` and `renderD128`. The crun annotation form
fails on this host — `sudo nerdctl run --runtime /usr/bin/krun --annotation krun.gpu_flags=1 …`
prints `Couldn't open libEGL.so.1` and exits 139, because the VMM looks for libEGL inside the
container rootfs; use the API launcher path. The host's NVIDIA GPU is not passed through to a
krun guest; use crun/runc with §14.2 for NVIDIA work. For k3s pods, see K3S.md §12.

## Sources

- containerd snapshotters: https://github.com/containerd/containerd/blob/main/docs/snapshotters/README.md
- NVIDIA Container Toolkit: https://github.com/NVIDIA/nvidia-container-toolkit
- NVIDIA Container Toolkit docs (install: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html, user guide: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/user-guide.html)
- containerd config versions: https://github.com/containerd/containerd/blob/main/RELEASES.md
- containerd CRI config: https://github.com/containerd/containerd/blob/main/docs/cri/config.md
- containerd ops (`KillMode=process`, safe restarts): https://github.com/containerd/containerd/blob/main/docs/ops.md
- nerdctl command reference: https://github.com/containerd/nerdctl/blob/main/docs/command-reference.md
- nerdctl FAQ (crun handler, k8s.io namespace): https://github.com/containerd/nerdctl/blob/main/docs/faq.md
- nerdctl config: https://github.com/containerd/nerdctl/blob/main/docs/config.md
- nerdctl rootless: https://github.com/containerd/nerdctl/blob/main/docs/rootless.md
- containerd-rootless.sh: https://github.com/containerd/nerdctl/blob/main/extras/rootless/containerd-rootless.sh
- rootlesskit port driver: https://github.com/rootless-containers/rootlesskit/blob/master/docs/port.md
- k3s data dir (`current`): https://docs.k3s.io/blog/2025/03/25/K3s-initialization
- k3s airgap images: https://docs.k3s.io/installation/airgap
- k3s external containerd: https://github.com/k3s-io/k3s/blob/master/pkg/cli/cmds/agent.go
- k3s CoreDNS (`NodeHosts`): https://github.com/k3s-io/k3s/blob/master/manifests/coredns.yaml
- krun man page: https://codegraph.jelmer.uk/crun/1.28-1/krun.1.md
- libkrun `KRUN_INIT_PID1`: https://github.com/libkrun/libkrun/pull/424
- kind / rootless Kubernetes: https://kubernetes.io/docs/tasks/administer-cluster/kubelet-in-userns
- Checkpoint/restore (CRIU): https://docs.docker.com/engine/reference/commandline/checkpoint/
