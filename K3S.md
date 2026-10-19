# K3S.md

k3s configured against the **one shared containerd** from [CONTAINERD.md](CONTAINERD.md),
with crun as the runtime family and krun for microVM pods — plus a tested backup and restore
procedure for the whole cluster.

Baseline: k3s ≥ 1.30 (tested 1.36.5+k3s1), containerd ≥ 2.3 with the CRI config from
CONTAINERD.md, cgroup v2, systemd, crun/krun.

## 1. Design

- **One daemon.** k3s does not start its bundled containerd; `container-runtime-endpoint`
  points it at the shared `/run/containerd/containerd.sock`. Both workloads share one image
  store and one snapshotter.
- **Namespaces.** k3s uses `k8s.io`, nerdctl uses `default`, on the same socket.
- **Runtime family.** Pods use the CRI default runtime handler (`crun`, from CONTAINERD.md);
  `krun` is an opt-in handler selected per pod with a RuntimeClass.
- **k3s does not manage containerd.** It writes no containerd config, imports no airgap
  images, and does not restart the daemon.

## 2. Configuration

### 2.1 containerd (CRI)

The CRI side of `/etc/containerd/config.toml` is exactly the block in CONTAINERD.md §3.1
(the `io.containerd.cri.v1.runtime` plugin: CNI dirs, `crun` default, `crun`/`krun`
handlers). k3s-specific are the two CNI keys:

```toml
[plugins.'io.containerd.cri.v1.runtime'.cni]
  bin_dirs = ["/var/lib/rancher/k3s/data/current/bin"]
  conf_dir = "/var/lib/rancher/k3s/agent/etc/cni/net.d"
```

They are required: k3s writes its flannel conflist and CNI binaries under its own data dir,
which stock containerd does not read. Without them pods start but have no network.

### 2.2 k3s

`/etc/rancher/k3s/config.yaml`:

```yaml
container-runtime-endpoint: unix:///run/containerd/containerd.sock
```

`https-listen-port: 6444` only if 6443 is taken. `kubelet-arg: cgroup-driver=systemd` is not
needed: k3s takes the driver from the CRI runtime.

### 2.3 Start order

1. containerd configured and running (CONTAINERD.md §3.1).
2. k3s installed/started: `curl -sfL https://get.k3s.io | sh -` (write the config first — the
   installer starts k3s immediately).
3. After any containerd runtime-handler change: `sudo systemctl restart k3s`.

Step 3 matters: k3s asks the CRI for its cgroup driver once, at start. If containerd still has
stock `runc`/`cgroupfs` at that moment, kubelet latches `cgroupfs` and every crun pod sandbox
fails with `bpf pin to '/sys/fs/bpf/crun/kubepods/...': No such file or directory`. Restarting
k3s after the containerd config is in place gives `systemd` and flat scopes.

## 3. Runtime selection

| Pod | Runtime | How |
|---|---|---|
| default | crun (CRI default handler) | no `runtimeClassName` |
| microVM | krun | RuntimeClass `krun` + `runtimeClassName: krun` |

Create the RuntimeClass once, exactly as in CONTAINERD.md §5.2 (`kind: RuntimeClass`,
`metadata.name: krun`, `handler: krun`). `krun.*` annotations on a pod reach the VM because the handler declares
`pod_annotations = ["krun.*"]` (e.g. `krun.ram_mib: "512"`).

## 4. Verification

```sh
# k3s writes the kubeconfig root-only; copy it for your user once
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER" ~/.kube/config
export KUBECONFIG=$HOME/.kube/config

kubectl get nodes -o wide          # Ready, containerd://2.x
```

`kubectl` is a standalone binary (measured: v1.37.1) and reads `~/.kube/config` by default;
the export above (or `--kubeconfig`) is what points it at the k3s copy.

```sh
# pods run crun: kernel is the host kernel
kubectl run c --image=alpine --restart=Never -- sh -c 'uname -r'
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/c --timeout=60s
kubectl logs c && kubectl delete pod c

# microVM pod: guest kernel
kubectl run v --image=alpine --restart=Never \
  --overrides='{"apiVersion":"v1","spec":{"runtimeClassName":"krun","containers":[{"name":"c","image":"alpine","command":["uname","-r"]}]}}'
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/v --timeout=90s
kubectl logs v && kubectl delete pod v

# DNS
kubectl run net --image=alpine --restart=Never -- sh -c \
  'getent hosts kube-dns.kube-system.svc.cluster.local; getent hosts '"$(hostname -s)"'; sleep 20'
kubectl wait --for=condition=Ready pod/net --timeout=60s
kubectl logs net && kubectl delete pod net

# shared containerd
sudo nerdctl -n k8s.io ps
```

## 5. Image handling

Because the image store is shared, images built or loaded with nerdctl are visible to k3s:

```sh
sudo nerdctl -n k8s.io build -t app:dev .
sudo nerdctl -n k8s.io load -i app.tar
kubectl run app --image=app:dev --image-pull-policy=Never --restart=Never -- cat /app.txt
```

k3s does **not** import airgap images when containerd is external — load them yourself
(`sudo nerdctl -n k8s.io load -i k3s-airgap-images-<arch>.tar.zst`). No `--address` is needed
because the external containerd is at its default socket.

## 6. Backup and restore

### 6.1 What the cluster state consists of

| Part | Location | In the cluster backup? |
|---|---|---|
| Kubernetes objects (SQLite, via kine) | `/var/lib/rancher/k3s/server/db/state.db` | yes |
| Cluster token (encrypts secrets) | `/var/lib/rancher/k3s/server/token` | yes, and must match on restore |
| k3s config | `/etc/rancher/k3s/config.yaml`, `config.yaml.d/` | yes |
| Node-local persistent volumes (local-path) | `/var/lib/rancher/k3s/storage/` | yes, if you want PVC contents |
| TLS certificates, admin kubeconfig | `/var/lib/rancher/k3s/server/tls`, `cred` | no — regenerated on start |
| Container images and running containers | shared containerd (`/var/lib/containerd`) | no — separate |

`k3s etcd-snapshot` does not apply to this cluster: with the SQLite datastore the server
answers `etcd datastore disabled` (measured). SQLite backup is a database copy — the k3s docs
say exactly that ("take a copy of /var/lib/rancher/k3s/server/db/"). Also note the snapshot
CLI parses `config.yaml` but skips the k3s-only keys it does not know with an
`Unknown flag --container-runtime-endpoint found in config.yaml, skipping` warning
(`https-listen-port` likewise), so with a custom port it defaults to `127.0.0.1:6443`.

### 6.2 Backup

Online, consistent, no downtime (create the destination first — `sqlite3 .backup` does not
create directories):

```sh
sudo mkdir -p /backup
sudo sqlite3 /var/lib/rancher/k3s/server/db/state.db ".backup '/backup/state.db'"
sudo cp /var/lib/rancher/k3s/server/token /backup/token
sudo cp -a /etc/rancher/k3s/config.yaml /etc/rancher/k3s/config.yaml.d /backup/ 2>/dev/null
sudo mkdir -p /var/lib/rancher/k3s/storage      # exists only after the first PVC
sudo tar czf /backup/storage.tar.gz -C /var/lib/rancher/k3s storage
```

The `storage` directory is created by the local-path provisioner with the first PVC; on a
fresh cluster `mkdir -p` is a no-op and the tar then produces a valid empty archive.

The restore checks below use a `backup-test` workload; create it before taking the backup:

```sh
kubectl create ns backup-test
kubectl -n backup-test create configmap cm --from-literal=k=v
kubectl -n backup-test create secret generic sec --from-literal=p=s
kubectl -n backup-test create deployment web --image=nginx
kubectl -n backup-test expose deployment web --port=80
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: data, namespace: backup-test}
spec: {accessModes: [ReadWriteOnce], storageClassName: local-path, resources: {requests: {storage: 16Mi}}}
---
apiVersion: v1
kind: Pod
metadata: {name: writer, namespace: backup-test}
spec:
  containers:
  - {name: c, image: alpine, command: ["sh","-c","echo spike-data > /data/file; sleep 3600"], volumeMounts: [{name: d, mountPath: /data}]}
  volumes: [{name: d, persistentVolumeClaim: {claimName: data}}]
EOF
kubectl -n backup-test exec writer -- cat /data/file     # spike-data
```

Offline alternative (stop k3s first, then copy `.../server/db/` as a directory). A full
datadir tar (`/var/lib/rancher/k3s` + `/etc/rancher/k3s`) is a valid belt-and-braces copy, but
the DB copy above is the part that matters for a datastore restore.

Keep the token with the backup: a snapshot/DB restored with a different token cannot decrypt
the confidential data inside it.

### 6.3 Restore — logical (objects deleted or corrupted)

```sh
sudo systemctl stop k3s
sudo rm -f /var/lib/rancher/k3s/server/db/state.db-wal \
           /var/lib/rancher/k3s/server/db/state.db-shm
sudo cp /backup/state.db /var/lib/rancher/k3s/server/db/state.db
sudo systemctl start k3s
```

Measured: a deleted namespace came back `Active` with its deployment, pods, service and PVC
after the restart; the PVC content was untouched (the datadir was intact).

### 6.4 Restore — full data-dir loss

```sh
sudo systemctl stop k3s
sudo rm -rf /var/lib/rancher/k3s            # or move it aside
sudo mkdir -p /var/lib/rancher/k3s/server/db /var/lib/rancher/k3s/storage
sudo cp /backup/state.db /var/lib/rancher/k3s/server/db/state.db
sudo cp /backup/token    /var/lib/rancher/k3s/server/token
sudo tar xzf /backup/storage.tar.gz -C /var/lib/rancher/k3s
sudo systemctl restart containerd      # its CNI watch followed the moved dir
sudo systemctl start k3s
```

k3s regenerates TLS material and `/etc/rancher/k3s/k3s.yaml` (the server URL comes from the
config, e.g. `https://127.0.0.1:6444`); the cluster CA is unchanged, so a pre-existing user
kubeconfig keeps working. Measured: node `Ready` in seconds (~3 s), workloads and the PVC object back,
CoreDNS resolving, and pods reusing images already in the shared containerd (no re-pull).

**Recreate pods that mount restored volumes.** A pod that survived the datadir loss keeps the
kubelet bind mount of the *deleted* local-path directory, so it sees an empty or missing
mount (`cat /data/file` → `No such file or directory`) even though the files are back on
disk. Delete and re-apply those pods:

```sh
kubectl -n backup-test delete pod writer
kubectl apply -f writer.yaml        # or re-apply the manifest above
kubectl -n backup-test exec writer -- cat /data/file     # spike-data
```

What is not restored: containerd images and containers (they live in the shared store and
survive a k3s datastore loss), CNI runtime state (recreated by flannel on start), and any
volume data you did not include from `/var/lib/rancher/k3s/storage`.

**Restart containerd too.** The CRI plugin watches the CNI conf dir
(`/var/lib/rancher/k3s/agent/etc/cni/net.d`). If the k3s data dir is moved or removed while
containerd is running, the watch fires and containerd exits fatally:

```
level=fatal msg="Failed to run CRI service" error="cni network conf monitor error: cni conf dir is removed, stop watching"
```

systemd restarts it (`Restart=always`), and the new instance watches the recreated dir. Do it
deliberately — `sudo systemctl restart containerd` after moving the datadir — instead of
relying on the crash-and-restart.

### 6.5 Measured backup/restore log

```
# backup
sqlite3 state.db ".backup /backup/state-pre.db"     → 7.75 MB, kine table present
token (109 B), config.yaml, k3s-admin.yaml, storage.tar.gz saved

# logical loss → restore
kubectl delete ns backup-test                       → namespace Terminating
stop k3s; replace state.db; start k3s (~3 s)         → namespace Active again,
                                                       deployment/service/pods back,
                                                       PVC content: spike-data

# full data-dir loss → restore
stop k3s; mv /var/lib/rancher/k3s → k3s.lost
restore state.db + token + storage; start k3s (~3 s)
kubectl get nodes                                    → a Ready containerd://2.4.1
kubectl -n backup-test get pods,pvc                  → Running, Bound
exec writer -- cat /data/file                        → No such file or directory (stale mount)
kubectl delete pod writer && re-apply                → exec cat /data/file = spike-data
getent hosts kubernetes.default.svc.cluster.local    → 10.43.0.1
nerdctl -n k8s.io ps                                 → k8s://backup-test/... Up
```

### 6.6 Instant snapshot and revert

Instant same-host snapshot and revert is in §10 (BTRFS: §8 setup; XFS: §9 facts). The DB
backup of §6.2 remains the portable path.

## 7. Operating notes

- Restart safety: `systemctl restart containerd` does not stop k3s pods (shims hold them);
  `systemctl restart k3s` does restart kubelet and reschedules containers.
- Change order when updating the runtime layer: edit the containerd config → restart
  containerd → restart k3s (cgroup-driver handshake).
- krun pods cannot be `exec`'d into (`the handler does not support exec`); use logs.
- k3s's `metrics-server` logs transient endpoint errors during startup; they settle once the
  pod is Ready.

## 8. BTRFS: datadir setup

The k3s data dir — objects (SQLite), token, TLS, and the local-path volumes under `storage/`
— must be a btrfs subvolume to use the O(1) snapshot/revert of §10. **This setup is
optional**: k3s itself uses the generic overlayfs snapshotter (§11) on both deployments; the
subvolume only enables the datadir snapshot of §10.1. One-time setup:

```sh
sudo btrfs subvolume show /var/lib/rancher/k3s        # fails: not a subvolume
sudo systemctl stop k3s
sudo mv /var/lib/rancher/k3s /var/lib/rancher/k3s.plain
sudo btrfs subvolume create /var/lib/rancher/k3s
sudo cp -a /var/lib/rancher/k3s.plain/. /var/lib/rancher/k3s/
sudo systemctl restart containerd                     # its CNI watch followed the moved dir
sudo systemctl start k3s
sudo rm -rf /var/lib/rancher/k3s.plain
```

- Keep `/var/lib/rancher/k3s/storage` **inside** the datadir subvolume: btrfs snapshots do
  not descend into nested subvolumes (measured: a snapshot of a parent subvolume shows the
  nested child as an empty directory), so a separate `storage` subvolume would be excluded
  from the datadir snapshot and would need its own snapshot pair.
- The datadir snapshot is atomic at the subvolume level and can be taken while k3s runs; the
  revert needs k3s stopped (§10).
- The containerd side of the same layout is CONTAINERD.md §12.

## 9. XFS: datadir on the single XFS root

On the XFS deployment the data dir is a plain directory on the single XFS root
(CONTAINERD.md §13) — no subvolume, no extra device, and no filesystem snapshot primitive.
XFS reflink copies are the snapshot primitive (§10).

Measured on the deployed host (`reflink=1`, `ftype=1`): the same
`/etc/rancher/k3s/config.yaml` works unchanged, and the cluster runs with the external
containerd exactly as in §2–§4.

## 10. Snapshot and revert

Cluster-level snapshot and revert, tested on both deployments. The portable path remains the
§6.2 backup/restore.

### 10.1 BTRFS

Snapshot (live, atomic at the subvolume level):

```sh
sudo btrfs subvolume snapshot /var/lib/rancher/k3s \
  "/var/lib/rancher/k3s.snap-$(date +%F-%H%M)"
```

Make a change, then revert:

```sh
# ... change the cluster ...
sudo systemctl stop k3s
sudo mv /var/lib/rancher/k3s /var/lib/rancher/k3s.cur
sudo btrfs subvolume snapshot /var/lib/rancher/k3s.snap-<stamp> /var/lib/rancher/k3s
sudo systemctl restart containerd                     # same CNI-watch rule as §6.4
sudo systemctl start k3s

# verify, then clean up
sudo btrfs subvolume delete /var/lib/rancher/k3s.cur
```

Measured: a namespace created after the snapshot was gone after the revert, the node came
back `Ready`, and the workload pods were running again.

### 10.2 XFS

```sh
sudo systemctl stop k3s
sudo cp -a --reflink=auto /var/lib/rancher/k3s /var/lib/rancher/k3s.snap-<stamp>
sudo systemctl start k3s

# ... change the cluster ...

sudo systemctl stop k3s
sudo mv /var/lib/rancher/k3s /var/lib/rancher/k3s.cur
sudo mv /var/lib/rancher/k3s.snap-<stamp> /var/lib/rancher/k3s
sudo systemctl restart containerd      # its CNI watch followed the moved dir (§6.4)
sudo systemctl start k3s
sudo rm -rf /var/lib/rancher/k3s.cur
```

Measured on the deployed host: the copy took 0.07 s; a namespace created after the snapshot
was gone after the revert, the node came back `Ready`, and the system pods were running.

### 10.3 Common

- The snapshot includes the cluster CA and admin credentials, so kubeconfigs keep working
  after the revert (measured).
- Restart containerd after the swap (§6.4).
- The snapshot is only as durable as the disk; for off-host backups use the §6.2
  `sqlite3 .backup` + `storage.tar.gz` pair.

## 11. Containerd snapshotters

k3s does not select a snapshotter: the CRI plugin uses containerd's default, `overlayfs`. The
cluster therefore runs on the generic overlayfs snapshotter on both deployments — on btrfs
(where the btrfs snapshotter is optional and unused here) and on the single XFS root. Every
pod layer is an overlayfs snapshot in the same shared containerd store; the CRI runtime
handler (crun or krun) is chosen independently of the snapshotter.

Verify on a running cluster:

```sh
sudo nerdctl -n k8s.io info | grep -i 'storage driver'       # overlayfs
sudo ctr -n k8s.io snapshots --snapshotter overlayfs list | head
```

Measured: on the btrfs host the plugins show `overlayfs ok` (and `btrfs ok`, unused); on the
XFS host `overlayfs ok` and `btrfs skip`.

Snapshot and revert: the snapshotter model and the per-level recipes — image-level, a
container's writable layer, the whole store, and the snapshotter-API revert (stop, remove the
active snapshot, re-prepare from the parent, start) — are CONTAINERD.md §3.3.4. For
k8s-managed pods the unit of revert is the pod (delete and recreate it); the cluster datadir
snapshot/revert is §10.

## 12. GPU devices

The CRI uses the runtime handlers from containerd's config (CONTAINERD.md §3.1): the default is `crun`, and
the `nvidia` handler is registered by CONTAINERD.md §14.2. k3s ships the RuntimeClasses
`nvidia` and `nvidia-experimental`, so a GPU pod needs only the image and the class.

Measured on the deployed host:

```sh
sudo nerdctl -n k8s.io pull nvidia/cuda:12.6.0-base-ubuntu24.04   # or imagePullPolicy: Never
kubectl run gpu --image=nvidia/cuda:12.6.0-base-ubuntu24.04 --restart=Never \
  --image-pull-policy=Never \
  --overrides='{"apiVersion":"v1","spec":{"runtimeClassName":"nvidia","containers":[{"name":"c","image":"nvidia/cuda:12.6.0-base-ubuntu24.04","command":["nvidia-smi"]}]}}'
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/gpu --timeout=180s
kubectl logs gpu        # NVIDIA GeForce RTX 4080 SUPER, 615.78.08
```

DRM/render devices for pods use a hostPath (measured):

```yaml
spec:
  containers:
    - name: c
      image: alpine
      command: ["ls", "-l", "/dev/dri"]
      volumeMounts: [{name: dri, mountPath: /dev/dri}]
  volumes:
    - name: dri
      hostPath: {path: /dev/dri}
```

That pod listed `card1`, `card2`, `renderD128` and `renderD129` inside the container.

Scheduling GPUs as extended resources (`nvidia.com/gpu`) requires the NVIDIA Kubernetes
device plugin; that was not exercised here and is not specified.

## Sources

- k3s external containerd (`container-runtime-endpoint`): https://github.com/k3s-io/k3s/blob/master/pkg/cli/cmds/agent.go
- k3s backup and restore: https://docs.k3s.io/datastore/backup-restore
- k3s airgap images: https://docs.k3s.io/installation/airgap
- k3s CoreDNS (`NodeHosts`): https://github.com/k3s-io/k3s/blob/master/manifests/coredns.yaml
- containerd CRI config: https://github.com/containerd/containerd/blob/main/docs/cri/config.md
- nerdctl namespace usage: https://github.com/containerd/nerdctl/blob/main/docs/faq.md
