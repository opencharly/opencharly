# Five grievances

Every tool here exists because something in ordinary DevOps practice is worse than it needs to be.
This document names five of those things, states the status quo without strawmanning it, and shows
what OpenCharly does instead — with the mechanism, not the marketing.

[The vision](VISION.md) says where the project is going. This says what it is running away from.
The examples are written in the grammar [DESIGN.md](https://github.com/opencharly/opencharly/blob/main/DESIGN.md)
defines, on CachyOS; the released candy repositories are migrating to that grammar.

---

## 1. Configuration is written per-artifact, so nothing composes

### The status quo

A Containerfile describes one image. If two images need the same three tools, you write those tools
twice, or you invent a shared base image and inherit from it. The usual escapes each cost something:

| Escape | What it costs |
|---|---|
| A shared base image | Inheritance is a chain, not a set: one parent, and everything in it. |
| Multi-stage `COPY --from` | Works for build output, not for "a package, its config and its service". |
| A shell script both images run | Opaque to the build cache, the linter, and the question "what is in this image?". |
| Templating (Jinja, Helm, `envsubst`) | A program that emits configuration; errors move from build time to render time. |

None of these is wrong. They are what you do when the unit of configuration is the *artifact*.

### What OpenCharly does

The unit of configuration is a **candy** — one concern, with its own packages, files, services and
checks. A **box** is a candy with a `from:` starting point, and it composes other candies with
`require:`. Composition is a set, not a chain:

```yaml
tutorial-shell:
    description: A CachyOS shell with search tools and an SSH server.
    from: cachyos.cachyos-image
    require: [devtool.ripgrep, devtool.sshd]
```

Any box may require any subset of candies, in any combination, without either candy knowing the
other exists — and each candy brings its own checks along ([§5](#5-the-tests-never-travel-with-the-image)).

### The honest limits

Order still matters when two candies write the same file, and candies are not hermetic: two of them
can install conflicting packages, and you find out at build time. This buys you composability, not
commutativity.

---

## 2. The same software has to be described once per distribution

### The status quo

`pacman -S ripgrep` and `dnf install ripgrep` differ by more than a verb. Package names drift
(`python-gobject` vs `python3-gobject`), some packages exist in one ecosystem only, and the init
system, the default user and the filesystem layout vary underneath. A project that supports two
distributions ends up with two diverged Containerfiles, `if [ -f /etc/debian_version ]` branches in
shell, or a configuration-management layer (Ansible, Chef) whose purpose is papering over this — the
honest solution, and a large dependency for "the package is called something else over there".

### What OpenCharly does

A candy declares a package once. When the name is the same everywhere, that is the whole
declaration, and it works on CachyOS, Arch, Fedora, Debian and Ubuntu:

```yaml
ripgrep:
    description: ripgrep, the recursive search tool.
    package: {ripgrep: {}}
    step:
        - check: ripgrep runs
          command: rg --version
```

When names differ, `os_override:` replaces only the part that differs. A key is an operating
system's **family** or its **node name**, and the most specific key wins:

```yaml
a11y-tools:
    description: The AT-SPI accessibility bindings for the system Python.
    package: {python-atspi: {}, python-gobject: {}}
    os_override:
        fedora:
            package: {python3-pyatspi: {}, python3-gobject: {}}
        debian:
            package: {python3-pyatspi: {}, python3-gi: {}}
    step:
        - check: the system Python imports pyatspi
          command: python3 -c "import pyatspi"

nvidia-open:
    description: The NVIDIA open kernel module and its user space.
    package: {nvidia-open: {}, nvidia-utils: {}}
    os_override:
        cachyos:
            package: {linux-cachyos-nvidia-open: {}, nvidia-utils: {}}
    step:
        - check: the NVIDIA user space is installed
          package: {name: nvidia-utils}
```

CachyOS and Arch take the default; Ubuntu matches the `debian` family. Where CachyOS genuinely
differs — it ships the module prebuilt for its own kernel — its node name beats the `arch` family
it belongs to.

**Init systems follow the same rule.** A candy declares a `service:` and never names an init; the
operating system names its inits — `supervisord` in a container, `systemd` on a machine — so the same
candy is correct on both.

### The honest limits

A package that exists on one distribution only is still a per-distribution problem, and a candy that
shells out to `systemctl` is still writing for one init. The claim is that the *common* cases —
package names, services, user identity — are absorbed, so what remains is small and explicit rather
than diffuse.

---

## 3. Container tooling and VM tooling are separate worlds

### The status quo

You describe a container with a Containerfile, a VM guest with Packer, cloud-init, a Kickstart file
or a golden image someone built by hand two years ago, and a configured host with Ansible. Three
languages, three execution models, three definitions of "done", usually owned by different people —
so the container and the VM drift, invisibly, until something behaves differently in one of them.

"Use containers for everything" stops working the moment you need a different kernel, nested
virtualization, a device that will not pass through, or a full systemd not worth fighting.

### What OpenCharly does

A box is target-neutral; the deployment decides what is built from it. `pod:` and `vm:` are written
identically:

```yaml
my-app:
    description: A CachyOS box with an SSH server.
    from: cachyos.cachyos-image
    require: [devtool.sshd]

my-app-pod:
    pod: {description: The box as a rootless container., from: my-app}
my-app-vm:
    vm: {description: The same box as a virtual machine., from: my-app}
```

Changing the kind is the whole change. `local:` and `android:` apply the same candies to a host or a
device, and `kubernetes:` runs pods and VMs as workloads. All of them compile to one shared **install
plan** that each target executes in its own idiom — an image layer or a running system, a supervisord
program or a systemd unit. A shared plan, not a pairwise translation, means neither form is the
"real" one, and a new target is one more consumer of the same plan.

### The honest limits

A `local:` deployment changes a real machine's packages and units, which is why this project's own
examples run it inside a disposable VM rather than on a workstation. A VM has a kernel and a boot
sequence a container does not. What is portable is the *composition*; the targets stay genuinely
different, and charly's job is to make the difference explicit and handled rather than duplicated
across three toolchains.

---

## 4. Isolation is opt-in, shallow, and stops one level down

### The status quo

**Running as root because it is easier.** Rootless containers have real friction — uid mapping,
subuid ranges, storage drivers, images that assume uid 0 — so much tooling still runs privileged,
and the isolation you believe you have is thinner than advertised.

**Nesting that does not work.** A container that builds containers meets `--privileged` or a
bind-mounted Docker socket — a root shell on the host wearing a costume. A VM inside a container, or
a container inside a VM, usually gets the answer "don't".

So the moment you want a genuinely disposable environment — one an agent can be handed, destroyed and
rebuilt without thought — the boundary is either too weak to trust or too rigid to nest.

### What OpenCharly does

Nesting is a declared need, and the deployment grants the least that satisfies it:

```yaml
nested-podman:
    description: Rootless podman inside a rootless container.
    package: {podman: {}, fuse-overlayfs: {}}
    need:
        nesting: {container: {}}
    step:
        - check: an inner container runs
          phase: deployment
          command: podman run --rm quay.io/libpod/alpine true
```

`nesting: {container: {}}` gets `/dev/fuse`, `/dev/net/tun` and user namespaces; `nesting: {vm: {}}`
gets `/dev/kvm`; `nesting: {userns: {}}` gets a seccomp profile that admits user-namespace sandboxes
and nothing wider, never `unconfined`. Boxes run rootless at uid 1000 by default, so a VM can run
inside a container and a container inside a VM — **candyboxing**.

**Why this is the load-bearing one.** It lets the security model be *"secure the box, not the
candy"*. If the boundary is kernel-enforced and it nests, you can hand an agent the entire toolset
inside a disposable environment instead of whitelisting the commands it may run. Command allowlists
fail because the interesting attacks are compositions of boring commands. A wall does not care.

### The honest limits

Rootless nesting needs kernel support — user namespaces, and `/dev/kvm` for VMs — and is not free:
there are performance costs, and some device classes cannot pass through. The claim is that nesting
and rootlessness are the *default* the boxes are built against, not an exotic configuration you are
on your own with.

---

## 5. The tests never travel with the image

### The status quo

Unit tests run on a developer's machine, acceptance tests in a CI pipeline that builds its own copy
of the artifact, and live checks somewhere else again — a staging host, a smoke script, an uptime
probe — each with its own idea of "pass". The build CI tested and the image that ships come from
different code paths, so "it passed CI" is a claim about a build you are not running. The checks live
in a file in the repository, not in the image: the artifact you pull from a registry is unverified,
and you cannot re-verify it, because the proof did not travel with it.

### What OpenCharly does

The checks are part of the candy, and the artifact carries them. Every check has a **phase** — what
it observes:

```yaml
hello-web:
    description: A web server whose page is in the artifact and is served once it runs.
    package: {python: {}}
    file:
        /srv/hello/index.html: {content: hello}
    service:
        hello-web: {exec: python -m http.server 8080 --directory /srv/hello}
    step:
        - check: the page is in the artifact
          file: {path: /srv/hello/index.html, content: {contains: hello}}
        - check: the server answers
          http: {url: "http://127.0.0.1:8080/", body: {contains: hello}}
          retry: {until: 30s}
```

An `artifact` check runs inside the built image, in a disposable container, before the image is
stored; a `ready` check holds a deployment back until it passes; a `deployment` check runs against
the live deployment — its real ports, services and environment. The phase follows from what the
check can observe, so the `file` check above runs on the artifact and the `http` check on the
deployment. The image's labels carry the resolved checks, so anyone who pulls it can run them
without the source repository:

```bash
charly check box <box>          # the artifact checks, on the built image
charly check live <deployment>  # the deployment checks, on the running deployment
charly check run <deployment>   # realize a disposable deployment from a fresh build and run every phase
```

Unit tests keep their place, but the acceptance is the artifact's own checks; CI is where they run.

### The honest limits

A check is only as good as the plan that declares it: write a thin plan and the image ships thin
proof. Artifact and deployment checks see different things, so a real gate needs both. The full
destroy-and-rebuild proof is defined only for deployments marked disposable; proving a production
system you must not destroy is a smaller, different claim.

---

## What this adds up to

Each grievance is survivable alone. Together they produce an environment nobody can reproduce,
described in a different language per target, whose proof does not travel with it, that only one
person can rebuild, and that nobody dares hand to an automated agent.

The five answers compose into one property — **a described environment that is disposable**. You can
destroy it because you can rebuild it; you can rebuild it because the description is complete; and
the description is complete because it is composed of candies that each carry their own proof.

For where that leads, see [the vision](VISION.md). For how it works, see
[DESIGN.md](https://github.com/opencharly/opencharly/blob/main/DESIGN.md), the
[skills index](https://github.com/opencharly/marketplace) or [opencharly.ai](https://opencharly.ai).
