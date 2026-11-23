# Five grievances

Every tool here exists because something in ordinary DevOps practice is worse than it needs to be.
This document names five of those things, states the status quo without strawmanning it, and shows
what OpenCharly does instead — with the mechanism, not the marketing.

[The vision](VISION.md) says where the project is going. This says what it is running away from.
The examples are written in the grammar [DESIGN.md](https://github.com/opencharly/opencharly/blob/main/DESIGN.md)
defines — the target architecture, not every part of it implemented yet — on CachyOS. Each one is a
complete `charly.yml` on its own, importing every repository it uses, and the design check validates
every one of them against DESIGN.cue. They are written in plain block YAML, and only the examples of
§5 carry check steps: checks are optional, and §5 is where they are the point.

---

## 1. Configuration is written per-artifact, so nothing composes

### The status quo

A Containerfile describes exactly one image. When two images need the same three tools, you either
copy those install steps into both files, or you build a shared base image and make both inherit
from it.

Each way out costs something. A shared base image is a chain, not a set: an image has one parent and
gets everything in it, whether it needs it or not. A multi-stage `COPY --from` moves build output
well, but not "a package, its configuration and its service" as one unit. A shell script that both
images run hides what it installs from the build cache, from the linter and from anyone asking what
is in the image. And templating with Jinja, Helm or `envsubst` means you now maintain a program that
writes your configuration, whose mistakes show up when it renders rather than when you build.

None of these is wrong. They are what you do when the unit of configuration is the *artifact*
rather than the concern.

### What OpenCharly does

The unit of configuration is a **candy**: one concern, with its own packages, files, services and
checks. A **box** is a candy with a `from:` starting point. Two fields put software into either of
them, and they work at different sizes: `package:` installs packages, and `require:` adds a whole
candy. The two examples below build on each other.

#### `package:` installs packages, and nothing else

`package:` is a list of names the package manager installs. Use it when installing the package
*is* the whole concern: the name is the same on every distribution you target, and it needs no
configuration file, no service and no user. The
[opencharly/layer-example](https://github.com/opencharly/layer-example) repository ships this candy:

<!-- example: grievance-package -->
```yaml
search-tools:
    description: Two command-line search tools, installed as packages and nothing else.
    package:
        - ripgrep
        - jq
```

`ripgrep` and `jq` have one name everywhere and nothing else to them, so the candy lists them and
is done.

#### `require:` adds a candy, with everything it carries

`require:` adds another candy to a box: its packages, its files, its services and users, its
per-distribution package names (`os_override:`, §2) and its checks when it has them. This box
reuses the `search-tools` candy above instead of repeating its package list. `import:` names the
two repositories it builds on, each at a release and the digest of that release:

<!-- example: grievance-require -->
```yaml
import:
    distro-cachyos:
        repo: opencharly/distro-cachyos
        release: v2026.327.0930
        digest: sha256:d32aa5fae9181727628f2f32b056ca2f7d4e0893d61474e2ccf80387b4fca814
    layer-example:
        repo: opencharly/layer-example
        release: v2026.327.1257
        digest: sha256:49af625d74b01c751c8dc1e73dc0e0c5d3cc46faf0a4983092e3f5cbff973289

my-box:
    description: A CachyOS box with the example search tools.
    from: distro-cachyos.cachyos
    require:
        - layer-example.search-tools
```

A namespace is the repository's own name, and a reference walks into it: `layer-example.search-tools`
is the `search-tools` candy of the repository imported as `layer-example`. A repository on GitHub
is written `owner/name`, so `opencharly/layer-example` means `github.com/opencharly/layer-example`;
a repository on any other host keeps its host, as in `gitlab.com/owner/name`. The same form names a
repository everywhere, in a `charly.yml` and on the command line alike.

Any box may require any subset of candies, in any combination, without either candy knowing the
other exists. Composition is a set, not a chain.

#### When to write which

Use `package:` when the concern is the package and nothing more. Use `require:` as soon as the
concern is more than a package name (it brings configuration, a service, or a name that differs
between distributions), or when more than one box needs it, so that it is written once and shared.

When in doubt, start with `package:`. The moment you find yourself wanting the same package list, a
config file or a per-distribution name in a second place, move it into a candy, as `search-tools`
did, and `require:` it.

### The honest limits

Order still matters when two candies write the same file, and candies are not hermetic: two of them
can install conflicting packages, and you find out at build time. This buys you composability, not
commutativity.

---

## 2. The same software has to be described once per distribution

### The status quo

Installing the same tool on two Linux distributions is rarely the same command with a different
package manager. `pacman -S ripgrep` and `dnf install ripgrep` happen to agree, but package names
often drift (`python-gobject` on Arch is `python3-gobject` on Fedora), some packages exist in only
one ecosystem, and the init system, the default user and the filesystem layout differ underneath.

A team that supports two distributions usually ends up with one of three things: two Containerfiles
that slowly diverge, shell scripts full of `if [ -f /etc/debian_version ]` branches, or a
configuration-management layer such as Ansible or Chef. The last is the honest solution — but it is
a large dependency to take on when the real problem is "the package has a different name over
there".

### What OpenCharly does

A package is named once. When the name is the same everywhere — like `ripgrep` and `jq` in §1 — the
package line is the whole declaration, and the same line works whether the box starts from CachyOS,
Arch, Fedora, Debian or Ubuntu.

When the name differs, the package becomes a candy, and `os_override:` replaces only what differs,
for the operating systems where it differs. The Python GObject bindings are `python-gobject` on Arch
and CachyOS, `python3-gobject` on Fedora and `python3-gi` on Debian and Ubuntu; a box that needs them
requires the candy and never thinks about the name again:

<!-- example: grievance-os-override -->
```yaml
python-gobject:
    description: The GObject bindings for the system Python.
    package:
        - python-gobject
    os_override:
        fedora:
            package:
                - python3-gobject
        debian:
            package:
                - python3-gi
```

A key is an operating system's **family** or its **node name**, and the most specific key wins:
Ubuntu matches the `debian` family, and a `cachyos:` key would beat the `arch` family CachyOS belongs
to.

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

Most teams describe the same environment several times over, in different tools. A container image
is a Containerfile. A virtual machine is a Packer template, a cloud-init file, a Kickstart file, or a
golden image someone built by hand two years ago. A configured host is an Ansible playbook. That is
three languages, three ways of running them and three definitions of "done", usually owned by
different people — so the container and the VM drift apart, quietly, until something behaves
differently in one of them.

"Just use containers for everything" stops working the moment you need a different kernel, nested
virtualization, a device that will not pass through to a container, or a full systemd that is not
worth fighting inside one.

### What OpenCharly does

A box is target-neutral; the deployment decides what is built from it. `pod:` and `vm:` are written
identically, and a pod is a rootless container. `my-box` is the box of §1:

<!-- example: grievance-pod-and-vm -->
```yaml
import:
    distro-cachyos:
        repo: opencharly/distro-cachyos
        release: v2026.327.0930
        digest: sha256:d32aa5fae9181727628f2f32b056ca2f7d4e0893d61474e2ccf80387b4fca814
    layer-example:
        repo: opencharly/layer-example
        release: v2026.327.1257
        digest: sha256:49af625d74b01c751c8dc1e73dc0e0c5d3cc46faf0a4983092e3f5cbff973289

my-box:
    description: A CachyOS box with the example search tools.
    from: distro-cachyos.cachyos
    require:
        - layer-example.search-tools

my-pod:
    pod:
        description: The box as a rootless container.
        from: my-box

my-vm:
    vm:
        description: The same box as a virtual machine.
        from: my-box
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

**Containers run as root because it is easier.** Running containers without root privileges is
possible, but it has real friction: user-ID mapping, subordinate UID ranges, storage drivers that
behave differently, and images that quietly assume they run as UID 0. So a lot of tooling still runs
its containers as root, and the isolation you think you have is thinner than it looks.

**Nesting does not really work.** When a container needs to build or run other containers — a CI
runner is the usual example — the common answers are `--privileged` or bind-mounting the host's
Docker socket into it. Both amount to handing the container a root shell on the host. Ask for a VM
inside a container, or a container inside a VM, and the usual answer is "don't".

So the moment you want a genuinely disposable environment — one you can hand to an automated agent,
then destroy and rebuild without a second thought — the boundary is either too weak to trust or too
rigid to nest.

### What OpenCharly does

**Rootless is the default.** Every pod runs on a rootless engine as the box's own user, every VM
under your own hypervisor session, with no `--privileged` and no host socket. Root is never
implicit: the one way to get it is a `need:` for `privilege: rootful` somewhere in the deployment's
stack, and the host must be able to grant it.

**Nesting is where you write it.** A deployment that runs inside another one is written *inside*
it, and that position is the whole declaration. The outer deployment receives exactly what the
inner one needs to run — derived from where it is written, never typed by hand:

<!-- example: grievance-candybox -->
```yaml
import:
    distro-cachyos:
        repo: opencharly/distro-cachyos
        release: v2026.327.0930
        digest: sha256:d32aa5fae9181727628f2f32b056ca2f7d4e0893d61474e2ccf80387b4fca814

agent-box:
    description: A CachyOS box with a container engine and a hypervisor for an agent's work.
    from: distro-cachyos.cachyos
    package:
        - podman
        - qemu-base
        - libvirt

agent-sandbox:
    pod:
        description: A rootless pod an agent is handed, with a VM running inside it.
        from: agent-box
        guest-vm:
            vm:
                description: A VM on the pod's hypervisor, with a container on the VM's engine.
                from: agent-box
                worker:
                    pod:
                        description: A rootless container inside the VM inside the pod.
                        from: agent-box
```

Because the `vm` is written inside the `pod`, the pod gets `/dev/kvm` and `/dev/vhost-net` and
nothing wider; because a `pod` is written inside the `vm`, the VM is given what a rootless container
engine needs — `/dev/fuse`, `/dev/net/tun` and user-namespace sandboxes. A VM inside a
container and a container inside a VM are both ordinary trees — **candyboxing**. `need:` stays what
it says: what a node needs *from other nodes or the host* in order to run, such as an endpoint, a
secret or a GPU — never where it runs.

**Why this is the load-bearing one.** It lets the security model be *"secure the box, not the
candy"*. If the boundary is kernel-enforced, rootless and nests, you can hand an agent the entire
toolset inside a disposable environment instead of whitelisting the commands it may run. Command
allowlists fail because the interesting attacks are compositions of boring commands. A wall does not
care.

### The honest limits

Rootless nesting needs kernel support — user namespaces, and `/dev/kvm` for VMs — and is not free:
there are performance costs, and some device classes cannot pass through. Some workloads genuinely
need root, such as checkpointing a running process; they get it only by declaring it. The claim is
that nesting and rootlessness are the *default* the boxes are built against, not an exotic
configuration you are on your own with.

---

## 5. The tests never travel with the image

### The status quo

In most pipelines the tests and the thing they test live in different places. Unit tests run on a
developer's laptop. Acceptance tests run in a CI pipeline that builds its own copy of the artifact.
Live checks — a smoke script, a staging host, an uptime probe — live somewhere else again, and each
has its own idea of what "pass" means.

Two problems follow. First, the image CI tested and the image you ship are often built separately,
so "it passed CI" is a claim about a build you are not actually running. Second, the checks live in
a file in the repository, not in the image: when you pull an image from a registry, nothing in it
tells you how to verify it, and you cannot re-verify it, because the proof did not travel with it.

### What OpenCharly does

The checks are part of the candy, and the artifact carries them. They are optional — none of the
examples above needs one — but a candy that has them takes them everywhere it goes. Every check has a
**phase** — what it observes:

<!-- example: grievance-checks -->
```yaml
import:
    distro-cachyos:
        repo: opencharly/distro-cachyos
        release: v2026.327.0930
        digest: sha256:d32aa5fae9181727628f2f32b056ca2f7d4e0893d61474e2ccf80387b4fca814

hello-web:
    description: A web server whose page is in the artifact and is served once it runs.
    from: distro-cachyos.cachyos
    package:
        - python
    file:
        /srv/hello/hello:
            content: hello
        /srv/hello/health:
            content: ok
    service:
        hello-web:
            exec: python -m http.server 8080 --directory /srv/hello
    provide:
        endpoint:
            hello:
                port: 8080
                protocol: http
                path: /hello
            health:
                port: 8080
                protocol: http
                path: /health
    step:
        - check: the page is in the artifact
          file:
              path: /srv/hello/hello
              content:
                  contains: hello
        - check: the server answers at the hello endpoint
          http:
              endpoint: hello
              body:
                  contains: hello
          retry:
              until: 30s
```

The two endpoints share port 8080 and protocol `http`, and their paths tell them apart. The `http`
check names the `hello` endpoint instead of restating its address, so the port and the path are
written once, where the endpoint is provided, and the check follows them when they change. Where the
check runs outside the deployment, the endpoint resolves to the port the deployment publishes.

An `artifact` check runs inside the built image, in a disposable container, before the image is
stored; a `ready` check holds a deployment back until it passes; a `deployment` check runs against
the live deployment — its real ports, services and environment. The phase follows from what the
check can observe, so the `file` check above runs on the artifact and the `http` check on the
deployment.

The build writes the resolved stack into the image's OCI labels — one label per concern, named
`ai.opencharly.<word>`, each value the JSON form of the same schema the source was written in. These
are the labels `hello-web` carries, decoded and listed by their word (`box` is the label
`ai.opencharly.box`, `step` is `ai.opencharly.step`):

<!-- example: grievance-labels labels -->
```yaml
box: hello-web
os: distro-cachyos.cachyos-os
service:
    hello-web:
        exec: python -m http.server 8080 --directory /srv/hello
provide:
    endpoint:
        hello:
            port: 8080
            protocol: http
            path: /hello
        health:
            port: 8080
            protocol: http
            path: /health
step:
    - check: the page is in the artifact
      phase: artifact
      file:
          path: /srv/hello/hello
          content:
              contains: hello
    - check: the server answers at the hello endpoint
      phase: deployment
      http:
          endpoint: hello
          body:
              contains: hello
      retry:
          until: 30s
```

Every phase is written out, so a reader needs neither the source nor the defaults to know where a
check runs. `charly check box` and `charly deploy from-box` read these labels and nothing else, so
anyone who pulls the image can verify it and deploy it without the source repository:

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
described in a different language per target, running as root because nesting was too hard, whose
proof does not travel with it, that only one person can rebuild, and that nobody dares hand to an
automated agent.

The five answers compose into one property — **a described environment that is disposable**. You can
destroy it because you can rebuild it; you can rebuild it because the description is complete; you
can hand it over because it is rootless and nests; and the description is complete because it is
composed of candies that each carry their own proof.

For where that leads, see [the vision](VISION.md). For how it works, see
[DESIGN.md](https://github.com/opencharly/opencharly/blob/main/DESIGN.md), the
[skills index](https://github.com/opencharly/marketplace) or [opencharly.ai](https://opencharly.ai).
