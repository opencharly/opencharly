# LIBKRUN.md

libkrun's virtio device model, and how to set up and use **virtio-vsock** and **TSI**
(Transparent Socket Impersonation) — on a Linux host, both through crun's `krun` mode and
through libkrun's C API directly.

Baseline: libkrun 1.19.6 + libkrunfw 5.6.2 (guest kernel 6.12.109), crun 1.30.1 with
libkrun support, Linux host with `/dev/kvm`, cgroup v2, systemd. See §10 for the two
version bounds that are load-bearing.

## 1. Device inventory

libkrun implements the following virtio devices. "Guest" is what appears inside the microVM;
"API" is the libkrun C function that enables it; "crun" is the value reachable from
`nerdctl run --runtime /usr/bin/krun` through annotations or `/.krun_vm.json`.

| Device | Guest interface | libkrun API | crun / `.krun_vm.json` | Tested |
|---|---|---|---|---|
| virtio-console | `hvc0`, stdio | implicit (`krun_add_virtio_console_*`, `krun_set_console_output`) | always on; early-boot guest console lines appear in `nerdctl logs` (not a reliable service check) | yes |
| virtio-block | `/dev/vda`, `vdb`, … | `krun_add_disk`, `krun_add_disk2`, `krun_add_disk3` | not exposed | yes (API) |
| virtio-fs | root filesystem and shares | `krun_set_root`, `krun_add_virtiofs*` | root filesystem + `-v` mounts | yes |
| virtio-gpu | `/dev/dri/card0`, `renderD128` | `krun_set_gpu_options`, `krun_set_gpu_options2`, render-server fd | `krun.gpu_flags`, `gpu_flags` | yes (API); the crun annotation form fails here (libEGL lookup inside the container rootfs) |
| virtio-net | `eth0`, `eth1`, … | `krun_add_net_tap`, `krun_add_net_unixstream`, `krun_add_net_unixgram`, `krun_set_passt_fd` | `krun.tap_name`, `krun.use_passt`, `use_passt` | yes (tap backend) |
| virtio-vsock | `/dev/vsock`, AF_VSOCK | implicit, or `krun_disable_implicit_vsock` + `krun_add_vsock`; port maps `krun_add_vsock_port`, `krun_add_vsock_port2` | implicit only; no port-map control | yes (both directions) |
| virtio-balloon | free-page reporting | implicit (free page reporting) | — | not directly observable |
| virtio-rng | `/dev/hwrng` | implicit | — | yes |
| virtio-snd | `/dev/snd` | `krun_set_snd_device` | not exposed | yes (requires PipeWire) |
| virtio-input | evdev | `krun_input_*` backend (`libkrun_input.h`) | not exposed | not exercised |
| virtio-gpu display | framebuffer | `krun_add_display`, `krun_set_display_backend` | not exposed | not exercised |

All of these are also gated by compile-time features: `krun_has_feature()` reports
`KRUN_FEATURE_NET`, `KRUN_FEATURE_BLK`, `KRUN_FEATURE_GPU`, `KRUN_FEATURE_SND`,
`KRUN_FEATURE_INPUT`, `KRUN_FEATURE_EFI`, `KRUN_FEATURE_TEE` for the build you linked
against.

Filesystem state is not a libkrun device: a microVM's writable layer is the same containerd
snapshot as a container's (the guest rootfs is that snapshot shared over virtio-fs). The
snapshotter choice, snapshots and revert are therefore the CONTAINERD.md §3.3 recipes plus
the filesystem sections CONTAINERD.md §12 (BTRFS) and §13 (XFS); nothing extra is needed for krun.

### 1.1 Networking is one choice or the other

libkrun has two mutually exclusive networking techniques:

1. **virtio-vsock + TSI** (default, no network interface): sockets are proxied through the
   VMM. Nothing to configure as long as no network device is added.
2. **virtio-net + a userspace proxy**: a real `eth0` in the guest, backed by passt,
   gvproxy or a tap device. Calling any `krun_add_net_*` or `krun_set_passt_fd` disables TSI.

Do not mix them in one VM.

## 2. virtio-vsock

The vsock device carries AF_VSOCK traffic between guest and host, and is also the transport
under TSI. The guest sees `/dev/vsock` and uses the standard AF_VSOCK API with
`VMADDR_CID_HOST` (2) to reach the host.

By default libkrun creates the vsock device implicitly, with TSI hijacking enabled based on
heuristics (see §3). For explicit control:

```c
krun_disable_implicit_vsock(ctx);
krun_add_vsock(ctx, KRUN_TSI_HIJACK_INET | KRUN_TSI_HIJACK_UNIX);  /* or 0 for no TSI */
```

Only one vsock device is supported. A second `krun_add_vsock` returns an error.

### 2.1 Guest to host: socket redirection

`krun_add_vsock_port(ctx, port, host_unix_socket)` pairs a guest vsock port with a host UNIX
socket. When the guest connects to `2:port`, libkrun connects to the UNIX socket; bytes flow
both ways.

```c
krun_add_vsock_port(ctx, 5000, "/tmp/vsock.sock");
```

Host side (must be listening before the guest connects):

```python
import socket
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.bind("/tmp/vsock.sock"); s.listen(1)
c, _ = s.accept()
print("host-received:", c.recv(512).decode())
c.sendall(b"hello-from-host")
```

Guest side: the complete static client is listed in Appendix C (`vsock-client.c`); compile
it with `gcc -static -O2 -o vsock-client vsock-client.c` and put it in the guest rootfs.

Observed: host printed `host-received: hello-from-guest`, the guest read
`hello-from-host`.

### 2.2 Host to guest: listening redirection

`krun_add_vsock_port2(ctx, port, host_unix_socket, true)` makes libkrun create the UNIX socket
itself (the path must not exist at start); a host process connecting to it is forwarded to
the guest's listening vsock port.

```c
krun_add_vsock_port2(ctx, 5001, "/tmp/vsock-guest.sock", true);
```

Guest side binds `VMADDR_CID_ANY` on port 5001, accepts, reads, and replies. Host side:

```python
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect("/tmp/vsock-guest.sock")
s.sendall(b"hello-from-host")
print(s.recv(512).decode())
```

Observed: the socket appears as `srwxr-xr-x root root`; the host read
`hello-from-guest`, the guest printed `guest-received:hello-from-host`. The socket's mode is
`0755`, so a non-root host client needs write access or root.

### 2.3 vsock without TSI

`krun_add_vsock(ctx, 0)` gives a vsock device with no socket hijacking. The Appendix A
launcher exposes this as mode `vsock0` (and `vsock0g2h` when a port map is added). Measured in
the guest: `wget http://10.4.0.1:8082` → `Network unreachable`, while the port mapping from
§2.1 still worked. This is the clean way to give a guest an IPC channel and no network.

### 2.4 From crun / nerdctl

crun's `krun` mode configures the vsock implicitly and exposes **no** annotation for vsock
port maps; the annotations are limited to `krun.cpus`, `krun.ram_mib`, `krun.gpu_flags`,
`krun.use_passt`, `krun.tap_name`, `krun.nested_virt`, `krun.variant`. Use a small launcher
against `libkrun` (Appendix A) when you need vsock redirection.

## 3. TSI (Transparent Socket Impersonation)

TSI lets a VM have full socket connectivity without any virtual network interface. The guest
kernel forwards socket syscalls over virtio-vsock; the VMM (libkrun) performs the real
socket operations in its own network and filesystem context.

### 3.1 Enabling

- **AF_INET / AF_INET6**: enabled automatically when **no** network interface is added
  (`krun_add_net_*` / `krun_set_passt_fd` not called). The guest then has only `lo` and a
  `dummy0` (`203.0.113.1/24`), no `eth0`.
- **AF_UNIX**: enabled only with an **explicit** vsock carrying `KRUN_TSI_HIJACK_UNIX`:

  ```c
  krun_disable_implicit_vsock(ctx);
  krun_add_vsock(ctx, KRUN_TSI_HIJACK_INET | KRUN_TSI_HIJACK_UNIX);
  ```

  The implicit vsock enables only `KRUN_TSI_HIJACK_INET`; a VM started with `krun_set_root`
  alone cannot use AF_UNIX TSI.
- The root share must be mounted at `/` in the guest (what `krun_set_root` does). AF_UNIX
  paths are absolute and are resolved **on the host**, as host paths. Measured with the guest
  root being an unpacked alpine rootfs (not the host root): a guest
  `connect("/tmp/spike/tsi.sock")` reached the host's `/tmp/spike/tsi.sock`, confirmed with
  `strace` on the VMM (`connect(71, {sa_family=AF_UNIX, sun_path="/tmp/spike/tsi.sock"})`).

### 3.2 Semantics

- **Outgoing**: any `connect()` in the guest (TCP, UDP, UNIX) is performed by the VMM.
  Measured: guest reached `192.168.1.1:80`, `example.com` over HTTPS, the pod/container
  gateway, and the host's LAN services subject to the VMM's network namespace.
- **Incoming**: a `listen()`/`bind()` in the guest is impersonated in the VMM's network
  namespace, so a host-side client reaches it at the VMM's address, not the guest's.
  Measured under crun: the krun container had IP `10.4.0.64`; `curl http://10.4.0.64:9000`
  from the host returned the guest's response.
- **Network context = the VMM's.** With `--network none` the VMM sits in an isolated netns and
  the guest can reach nothing; with the default nerdctl network the guest can reach whatever
  that netns can reach. Restrictions (nftables, seccomp) must be applied to the VMM.
- **AF_UNIX paths are host paths.** Measured: with the guest root being an unpacked alpine
  rootfs, a guest `connect("/tmp/spike/tsi.sock")` reached the host's
  `/tmp/spike/tsi.sock` (confirmed with `strace`: the VMM issued
  `connect(77, {sa_family=AF_UNIX, sun_path="/tmp/spike/tsi.sock"})`), and the host server
  received the guest's message. Only absolute paths are supported.
- **UDP works** (DNS resolution inside the guest uses it).

### 3.3 TSI checks

Guest network shape (no interface):

```sh
sudo nerdctl run --rm --runtime /usr/bin/krun alpine ip -o link show
# 1: lo ...   2: dummy0 ...    (no eth0)
```

Outbound and inbound under TSI (nerdctl):

```sh
# guest listens; host reaches it at the container IP
sudo nerdctl run -d --runtime /usr/bin/krun --name tsi alpine \
  sh -c 'while true; do echo -e "HTTP/1.1 200 OK\r\nContent-Length: 9\r\n\r\nhello-tsi" | nc -l -p 9000; done'
ip=$(sudo nerdctl inspect tsi --format '{{.NetworkSettings.IPAddress}}')
curl -s http://$ip:9000                      # → hello-tsi
sudo nerdctl rm -f tsi

# guest reaches the outside
sudo nerdctl run --rm --runtime /usr/bin/krun alpine \
  sh -c 'wget -qO- http://example.com >/dev/null && echo outbound-ok'
```

AF_UNIX with an explicit vsock (Appendix A launcher):

```sh
# host listener (the one-shot server from Appendix C)
python3 -c 'import socket;s=socket.socket(socket.AF_UNIX);s.bind("/tmp/tsi.sock");s.listen(1);
c,_=s.accept();print("host-received:",c.recv(512).decode());c.sendall(b"ok")' &

# unix-client: the complete source is in Appendix C; copy the static binary into the rootfs
sudo ./lk-launch /path/to/rootfs tsi /tmp/tsi.sock /unix-client /tmp/tsi.sock hello
# guest prints: reply:ok        host prints: host-received: hello
```

## 4. virtio-net

A real NIC in the guest. Any of these disables TSI:

| Backend | API | Guest | Notes |
|---|---|---|---|
| tap | `krun_add_net_tap(ctx, "tapname", mac, features, flags)` | `eth0` | tap must exist on the host and be up; assign addresses manually. The *annotation* form `krun.tap_name` hung in testing — use the API |
| passt | `krun_set_passt_fd(ctx, fd)` | `eth0` | passt must bind the requested host ports; `-t all` fails on a busy host |
| gvproxy | `krun_add_net_unixgram(ctx, path, -1, mac, feats, NET_FLAG_VFKIT)` | `eth0` | gvproxy provides DHCP; it also binds `127.0.0.1:2222` by default; not exercised here |

Tap, measured:

```sh
sudo ip tuntap add dev krun-tap mode tap
sudo ip addr add 10.99.99.1/24 dev krun-tap
sudo ip link set krun-tap up
# launcher mode "tap" adds krun_add_net_tap(ctx, "krun-tap", mac, COMPAT_NET_FEATURES, 0)
# guest: ip link set eth0 up; ip addr add 10.99.99.2/24 dev eth0
#        ping -c1 10.99.99.1  →  1 packets received
```

Measured caveats:

- passt: through crun's `krun.use_passt=1` the runtime reports
  `failed configuring mounts for handler at phase: HANDLER_CONFIGURE_AFTER_MOUNTS: start passt`.
  Running passt with crun's arguments (`passt -t all -u all --no-dhcp-dns --no-map-gw --fd N`)
  by hand shows why: `All listens failed for HOST TCP */1-32767` — `-t all` asks passt to bind
  every host port, which fails on a host with services listening. Use a narrower port map
  (`krun_set_port_map`) or gvproxy/tap on such a host.
- gvproxy: fails to start if `127.0.0.1:2222` is taken (`bind: address already in use`).

Under crun the two annotations are `krun.tap_name` (tap name) and `krun.use_passt=1`; they are
mutually exclusive.

## 5. Other devices

- **virtio-fs** — `krun_set_root` shares the root; `krun_add_virtiofs` (and `…2/3/4`) add more
  shares with tags. Under crun, `-v host:guest` appears inside the shared root. Measured:
  guest read a host file and wrote a file the host saw. Security: a virtio-fs share gives the
  guest access to the whole host filesystem subtree backing it — isolate with mount
  namespaces.
- **virtio-block** — `krun_add_disk(ctx, "disk0", "/path/disk.img", read_only)` (raw images;
  `krun_add_disk2/3` add qcow2/vmdk formats with a security caveat about referenced files).
  Measured: guest mounted `/dev/vda` (ext4) and read a file.
- **virtio-gpu** — `krun_set_gpu_options(ctx, virgl_flags)` (or `…2` plus
  `krun_set_gpu_render_server_fd`). Measured with flags `1`: guest saw
  `/dev/dri/card0` and `renderD128`. A display additionally needs
  `krun_add_display` + `krun_set_display_backend`. This is a paravirtualized GPU, not the
  host's device: an NVIDIA GPU is not passed through to a krun guest — use crun/runc with
  the NVIDIA Container Toolkit (CONTAINERD.md §14.2) for that.
- **virtio-rng** — always present: guest `/dev/hwrng`. Measured random bytes.
- **virtio-console** — always present; the guest console is libkrun's stdout, which is why
  `nerdctl logs <krun-container>` shows guest kernel/systemd lines.
- **virtio-snd** — `krun_set_snd_device(ctx, true)`. The audio backend is PipeWire; if the VMM
  has no PipeWire session the VMM panics at device start (`Failed to connect to core:
  CreationFailed`, pipewire.rs:95; the exact line moves between libkrun releases). Run the VMM
  with access to the user's PipeWire socket.
- **virtio-balloon** — free-page reporting is automatic; there is no guest-visible control.
- **virtio-input** — `krun_input_*` backend structures in `libkrun_input.h`.

## 6. crun/krun annotation reference

| Annotation / `.krun_vm.json` key | libkrun API | Effect |
|---|---|---|
| `krun.cpus` / `cpus` | `krun_set_vm_config` | vCPUs (max 16) |
| `krun.ram_mib` / `ram_mib` | `krun_set_vm_config` | RAM in MiB (<128 ignored) |
| `krun.gpu_flags` / `gpu_flags` | `krun_set_gpu_options` | virtio-gpu + virgl flags |
| `krun.use_passt` / `use_passt` | passt backend | virtio-net via passt |
| `krun.tap_name` | `krun_add_net_tap` | virtio-net via tap |
| `krun.nested_virt` / `nested_virt` | `krun_set_nested_virt` | expose VT-x/SVM to the guest |
| `krun.variant` / `flavor` | variant build | `sev`, `aws-nitro` |
| `kernel_path`, `kernel_format`, `initrd_path`, `kernel_cmdline` | `krun_set_kernel` | custom kernel instead of libkrunfw |
| `virtiofs_tag`, `virtiofs_shm_size` | `krun_add_virtiofs*` | root share tuning |

There is no crun annotation for vsock port maps or for TSI UNIX hijacking: crun uses the
implicit vsock, so a crun/krun guest gets **TSI INET only** (no AF_UNIX TSI).

## 7. Containerd snapshotters

krun containers use containerd's default snapshotter, `overlayfs`: the guest rootfs is an
overlayfs snapshot (committed image layers as `lowerdir`, the container's writable layer as
`upperdir`), shared into the guest over virtio-fs. Nothing in libkrun depends on the
snapshotter; the btrfs snapshotter is optional and none of the recipes here enable it.

Verify: `nerdctl info | grep -i 'storage driver'` → `overlayfs`.

Snapshot and revert: the guest rootfs is an ordinary containerd snapshot, so every level of
CONTAINERD.md §3.3.4 applies unchanged (image-level, the overlayfs `upperdir`, the
snapshotter API, and the store — btrfs subvolume when the store is one, CONTAINERD.md §12.2,
or XFS reflink, CONTAINERD.md §13.1). Measured on a `--runtime /usr/bin/krun` container: `/state=A` was committed into an
image, the committed image printed `A`, and the original image printed nothing (clean) — the
revert; the `upperdir` copy/restore was exercised on the same container (A → B → A).

**A krun guest's process state is not checkpointable FROM THE HOST — but it is from inside
the guest.** The filesystem levels above all apply to a krun container unchanged, because its
rootfs is an ordinary containerd snapshot. The *host-side* process level does not work, and
the reason is narrower than "CRIU cannot reach the processes": CRIU **does** attach to them
and fails when it resolves the container root's file descriptor against the **host's** mount
table, where the guest's rootfs is not a mount. Measured on the same host, with the same
image and the same command, the crun container checkpoints successfully and the krun guest
fails with

```
Error (criu/files-reg.c:1790): Can't lookup mount=3942 for fd=-3 path=/
Error (criu/cr-dump.c:1440): Collect mappings (pid: …) failed with -1
```

**CRIU run inside the guest works**, because there the guest's own mount table is the host
table. Measured: `criu check` → `Looks good`, a counter dumped at tick 4, and a restore into a
**fresh VM** continuing at 5 → 9. It needs three things and no privilege on the outer host:

- a guest kernel with `CHECKPOINT_RESTORE` and the socket-diag options — the stock
  libkrunfw config disables them, so this is a custom kernel (`krun.custom_kernel`);
- **passt** rather than TSI (`krun.use_passt`) — with TSI, CRIU's own loopback self-test is
  proxied by the VMM and `criu check` fails before it starts;
- a crun new enough to start passt at all: 1.30.1 cannot (`start passt`, rc 1), and main adds
  the `/proc` remount that makes it work under a declared PID namespace
  (`handlers/krun.c:824-838`). Until a release ships that, the in-guest path is a
  main-only crun.

A krun container is therefore covered by the image, `upperdir` and store levels for its
filesystem, and by the **in-guest** CRIU for its processes — not by the host-side CRIU level
of CONTAINERD.md §10, which describes the crun and runc handlers.

## 8. BTRFS

A microVM's writable layer is a containerd snapshot — the guest rootfs is that snapshot
shared over virtio-fs — so the btrfs layout of CONTAINERD.md §12 applies to the store that
holds the guest rootfs. **The btrfs snapshotter is optional**: krun uses overlayfs (see
§7 above), and enabling the btrfs snapshotter only adds subvolume
snapshots of individual layers (CONTAINERD.md §12.4). The store on its own subvolume is what gives the
store-level snapshot of CONTAINERD.md §3.3.4. Nothing is libkrun-specific; the guest kernel and initrd come
from libkrunfw and are unaffected by the host filesystem.

## 9. XFS

The same model on XFS (CONTAINERD.md §13): the guest rootfs is an `overlayfs` snapshot, XFS
provides only the `overlayfs`/`native` snapshotters (btrfs/zfs skip), and store
snapshot/revert uses the reflink copies of CONTAINERD.md §13.1.

## 10. Versions

Two version bounds are load-bearing. Both are measured; neither is a preference.

**libkrun 1.x is the pin — `main` is not usable.** crun's krun handler resolves three
libkrun entry points: `krun_set_vm_config`, `krun_set_gpu_options` and `krun_start_enter`.
libkrun `main` (the 2.0 API rewrite) removes them, so a crun built against `main` cannot
resolve them. Pin libkrun to the 1.x line; the
baseline in this file is 1.19.6. Source read: crun `src/libcrun/handlers/krun.c` and
libkrun `main` (RDD7 S3, B.5).

**crun 1.30.1 cannot start passt, and passt is what in-guest CRIU needs.** Measured:
`HANDLER_CONFIGURE_AFTER_MOUNTS: start passt` fails with rc 1, so a krun guest gets no
`virtio-net` interface and §7's in-guest CRIU path fails before its first check. The fix
needs two things in the same crun:

- the passt fix `ca04fdb6`, and
- the `/proc` remount in `src/libcrun/handlers/krun.c:824-838`, which makes passt work
  under a declared PID namespace.

No release carries both, so the passt / in-guest-CRIU path is **main-only until a release
ships them**. A released crun remains correct for containers and for TSI-backed krun
guests; passt is the exception (RDD7 S3/B.5, RDD8 T8).

Everything else in this file is independent of these bounds. Where a recipe needs passt or
in-guest CRIU, it needs the main-only crun.

## Appendix A — building a libkrun launcher

`libkrun.h` comes with libkrun; link with `-lkrun`. The guest kernel and init come from
libkrunfw, so no kernel/initrd paths are needed.

```c
#include <libkrun.h>
#include <stdint.h>
#include <string.h>

int main(int argc, char **argv) {   /* argv: ROOTFS MODE PATH CMD [ARGS...] */
    int ctx = krun_create_ctx();
    krun_set_vm_config(ctx, 1, 512);
    krun_set_root(ctx, argv[1]);
    krun_set_workdir(ctx, "/");

    if (strcmp(argv[2], "tsi") == 0) {
        krun_disable_implicit_vsock(ctx);
        krun_add_vsock(ctx, KRUN_TSI_HIJACK_INET | KRUN_TSI_HIJACK_UNIX);
    } else if (strcmp(argv[2], "g2h") == 0) {
        krun_add_vsock_port(ctx, 5000, argv[3]);
    } else if (strcmp(argv[2], "h2g") == 0) {
        krun_add_vsock_port2(ctx, 5001, argv[3], true);
    } else if (strcmp(argv[2], "disk") == 0) {
        krun_add_disk(ctx, "disk0", argv[3], false);
    } else if (strcmp(argv[2], "tap") == 0) {
        uint8_t mac[6] = {0x5a,0x55,0x5a,0x55,0x5a,0x56};
        krun_add_net_tap(ctx, argv[3], mac, COMPAT_NET_FEATURES, 0);
    } else if (strcmp(argv[2], "gpu") == 0) {
        krun_set_gpu_options(ctx, 1);
    } else if (strcmp(argv[2], "snd") == 0) {
        krun_set_snd_device(ctx, true);
    } else if (strcmp(argv[2], "vsock0") == 0) {
        krun_disable_implicit_vsock(ctx);
        krun_add_vsock(ctx, 0);                       /* no TSI at all */
    } else if (strcmp(argv[2], "vsock0g2h") == 0) {
        krun_disable_implicit_vsock(ctx);
        krun_add_vsock(ctx, 0);
        krun_add_vsock_port(ctx, 5000, argv[3]);
    }

    /* NOTE: argv here is the argument list WITHOUT argv[0]; the exec path is separate. */
    if (krun_set_exec(ctx, argv[4], (const char *const *)&argv[5], NULL) < 0)
        return 1;
    return krun_start_enter(ctx);
}
```

Compile and run:

```sh
gcc -O2 -o lk-launch lk-launch.c -lkrun
sudo ./lk-launch /path/to/rootfs tsi /none /bin/sh -c '/bin/uname -r'
```

`krun_set_exec` is called with `envp = NULL`, which makes the guest inherit the VMM's
environment — including its `PATH`. That `PATH` usually has no `/bin` or `/sbin`, so the
recipe uses absolute binaries inside the guest (`/bin/uname`, `/bin/sh`). Pass an explicit
`envp` array to `krun_set_exec` if you need a different environment.

Two API quirks worth knowing:

- `krun_set_exec` takes the argument list **without** `argv[0]`; passing a full argv shifts
  every argument by one (a `/bin/echo alpha` passed as `{"echo","alpha"}` prints
  `alpha`, while `{"/bin/echo","alpha"}` prints `/bin/echo alpha`).
- `krun_start_enter` only returns when the VM exits; errors inside the guest (a missing exec
  path) are printed by the guest init but can still yield a zero return.

Build the rootfs for testing by unpacking any image (e.g. `docker export` or
`skopeo copy`); the guest needs no init of its own, the exec target is run directly.

## Appendix B — measured test log

Host: libkrun 1.19.6, libkrunfw 5.6.2, guest kernel `6.12.109`, host kernel `7.2.8`.

```
# guest shape in TSI mode
lo; dummy0 203.0.113.1/24; /dev/vsock (10,258); no eth0

# TSI INET
host → 10.4.0.64:9000            → hello-tsi                (guest listener impersonated)
guest → example.com, 192.168.1.1 → ok                      (outbound proxy)
guest → 10.4.0.1:8082            → HTTP 403                 (gateway)
--network none                   → nothing reachable        (VMM netns is isolated)

# TSI UNIX (explicit vsock HIJACK_INET|HIJACK_UNIX)
guest connect /tmp/spike/tsi.sock → host received hello-tsi-unix
strace(VMM): connect(77, {AF_UNIX, "/tmp/spike/tsi.sock"}) = 0     (guest root = host /)
strace(VMM): connect(71, {AF_UNIX, "/tmp/spike/tsi.sock"}) = 0     (guest root = image rootfs)

# vsock port redirection
guest → 2:5000  (krun_add_vsock_port)   → host received hello-from-guest; guest read hello-from-host
host → socket   (krun_add_vsock_port2 listen=true, srwxr-xr-x root) → guest received hello-from-host; host read hello-from-guest
vsock with flags 0                       → guest wget: Network unreachable; vsock still works

# virtio-net tap
eth0 10.99.99.2/24 → ping 10.99.99.1     → 1 packets received

# virtio-fs / block / rng / gpu / console
-v /tmp/spike/share:/share               → guest read host.txt, wrote guest.txt (host sees it)
krun_add_disk("disk0", ext4 image)       → guest mount /dev/vda /mnt; cat → block-data
/dev/hwrng                               → crw------- 10,183; random bytes
krun_set_gpu_options(1)                  → /dev/dri/card0, renderD128
nerdctl logs sdvm                        → guest kernel/systemd lines

# virtio-snd without PipeWire
krun_set_snd_device(true)                → VMM panic: Failed to connect to core: CreationFailed
```

## Appendix C — guest test clients

Static, self-contained programs for the vsock and TSI checks. Compile with
`gcc -static -O2 -o <name> <name>.c` and copy into the guest rootfs (any libc will do; the
guest only needs the binary).

`vsock-client.c` — connect to a host vsock port, send one message, print the reply:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <linux/vm_sockets.h>

int main(int argc, char **argv) {
    if (argc < 4) { fprintf(stderr, "usage: %s CID PORT MSG\n", argv[0]); return 2; }
    unsigned cid = (unsigned)atoi(argv[1]);
    unsigned port = (unsigned)atoi(argv[2]);
    int s = socket(AF_VSOCK, SOCK_STREAM, 0);
    if (s < 0) { perror("socket"); return 1; }
    struct sockaddr_vm sa;
    memset(&sa, 0, sizeof sa);
    sa.svm_family = AF_VSOCK; sa.svm_cid = cid; sa.svm_port = port;
    if (connect(s, (struct sockaddr *)&sa, sizeof sa) < 0) { perror("connect"); return 1; }
    write(s, argv[3], strlen(argv[3]));
    char buf[512]; ssize_t n = read(s, buf, sizeof buf - 1);
    if (n > 0) { buf[n] = 0; printf("reply:%s\n", buf); }
    close(s);
    return 0;
}
```

`vsock-server.c` — listen on a vsock port, print the message, answer:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <linux/vm_sockets.h>

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: %s PORT\n", argv[0]); return 2; }
    unsigned port = (unsigned)atoi(argv[1]);
    int s = socket(AF_VSOCK, SOCK_STREAM, 0);
    if (s < 0) { perror("socket"); return 1; }
    struct sockaddr_vm sa;
    memset(&sa, 0, sizeof sa);
    sa.svm_family = AF_VSOCK; sa.svm_cid = VMADDR_CID_ANY; sa.svm_port = port;
    if (bind(s, (struct sockaddr *)&sa, sizeof sa) < 0) { perror("bind"); return 1; }
    if (listen(s, 4) < 0) { perror("listen"); return 1; }
    int c = accept(s, NULL, NULL);
    if (c < 0) { perror("accept"); return 1; }
    char buf[512]; ssize_t n = read(c, buf, sizeof buf - 1);
    if (n > 0) { buf[n] = 0; printf("guest-received:%s\n", buf); fflush(stdout); }
    write(c, "hello-from-guest", 16);
    close(c); close(s);
    return 0;
}
```

`unix-client.c` — connect to an absolute host path (TSI AF_UNIX), send, print the reply:

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/un.h>

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "usage: %s PATH MSG\n", argv[0]); return 2; }
    int s = socket(AF_UNIX, SOCK_STREAM, 0);
    if (s < 0) { perror("socket"); return 1; }
    struct sockaddr_un sa;
    memset(&sa, 0, sizeof sa);
    sa.sun_family = AF_UNIX;
    strncpy(sa.sun_path, argv[1], sizeof sa.sun_path - 1);
    if (connect(s, (struct sockaddr *)&sa, sizeof sa) < 0) { perror("connect"); return 1; }
    write(s, argv[2], strlen(argv[2]));
    char buf[512]; ssize_t n = read(s, buf, sizeof buf - 1);
    if (n > 0) { buf[n] = 0; printf("reply:%s\n", buf); }
    close(s);
    return 0;
}
```

Host side of the same checks (Python 3; run on the host where the VMM runs):

```python
# one-shot UNIX-socket server: prints what the guest sent, answers "hello-from-host"
import socket, sys
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.bind(sys.argv[1]); s.listen(1)
c, _ = s.accept()
print("host-received:", c.recv(512).decode(errors="replace"))
c.sendall(b"hello-from-host")
```

```python
# one-shot client: connects to the socket libkrun created (listen=true), sends, prints reply
import socket, sys
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.connect(sys.argv[1])
s.sendall(sys.argv[2].encode())
print("host-read:", s.recv(512).decode(errors="replace"))
```

Put `vsock-client` / `vsock-server` / `unix-client` in the rootfs before starting the VM; the
Appendix A launcher expects `/vsock-client`, `/vsock-server` and `/unix-client` inside.

## Sources

- libkrun: https://github.com/libkrun/libkrun (README: virtio device list and TSI description)
- libkrun API: `libkrun.h`, `libkrun_input.h` (installed with libkrun)
- libkrun TSI/vsock source: `src/libkrun/src/lib.rs` (`krun_add_vsock`, `krun_add_vsock_port2`,
  implicit-vsock heuristics)
- libkrun `KRUN_INIT_PID1`: https://github.com/libkrun/libkrun/pull/424
- krun man page (annotations, `.krun_vm.json`): https://codegraph.jelmer.uk/crun/1.28-1/krun.1.md
- crun krun handler (passt invocation, tap): https://github.com/containers/crun/blob/main/src/libcrun/handlers/krun.c
- passt: https://passt.top/passt/about/
- gvproxy: https://github.com/containers/gvisor-tap-vsock
