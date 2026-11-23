# Six grievances

Every tool here exists because something in ordinary DevOps practice is worse than it needs to be.
This document names six of those things, states the status quo without strawmanning it, and shows
what OpenCharly does instead — with the mechanism, not the marketing.

[The vision](VISION.md) says where the project is going. This says what it is running away from.

The first grievance comes first because every later answer is written in its terms: what a **word**
is, who serves it, and the one **IR** that everything compiles to. From the second grievance on, the
examples build **one project**, step by step: your own `charly.yml`, which grows by a few lines in
each section. Every candy that project uses comes from an imported repository,
[opencharly/layer-example](https://github.com/opencharly/layer-example), and every plugin it uses is
a real repository at a real release. A line marked `# new in §N` is the part that section adds and
explains; everything else was explained before.

The examples are written in the grammar
[DESIGN.md](https://github.com/opencharly/opencharly/blob/main/DESIGN.md) defines: the target
architecture, not every part of it implemented yet. The repositories they import write the same
candies in the schema today's charly reads. Each example is a complete `charly.yml` on its own,
written in plain block YAML, and the design check validates every one of them against DESIGN.cue.

---

## 1. Every tool has a fixed vocabulary, and every target needs its own translator.

### The status quo

A configuration tool understands a fixed set of words, compiled into it. Ansible has its modules,
a Containerfile its instructions, Kubernetes its resource kinds. A concept the tool does not have
waits for a release that adds it, for a fork, or for a wrapper script that hides it from the tool.

And each output has its own translator. A Containerfile is translated into an image, a cloud-init
file into a configured VM, a unit file into a running service, a manifest into a cluster object.
Describe one concern for three targets and you write it three times, in three vocabularies, and
the three copies drift. With N concerns and M targets you maintain N×M translations.

None of this is careless design. It is what you get when the tool owns the words and every target
owns its own translation.

### What OpenCharly does

**The core knows no words.** Every key you write in a `charly.yml` that names a thing (`pod:`,
`vm:`, a check's `http`) is a **word**, and every word is served by a **plugin**: a separate
repository that owns the word end to end — its schema, its validation, its behaviour and its
documentation. The core, charly itself, reads your files, finds the plugin that owns each word,
validates, routes the work to that plugin and stores the results. Its own vocabulary is a handful
of structural words: the **directives** `import:` and `plugin:`, and the shape of the check steps
§6 introduces (`check:`, `retry:`, and matchers such as `contains:`). Everything else is a
plugin's.

A project says which plugins it uses in `plugin:`, by repository, release and digest, the same way it
imports anything else. A word that no declared plugin serves is an error at the line it is written
on. So what a project can say is exactly the sum of the plugins it declares: a new concept is a new
plugin, not a new release of charly.

The smallest unit of content is a **candy**: one concern, with its packages, files, services and
checks. This is a candy that the opencharly/layer-example repository ships, as it appears there:

<!-- example: grievance-words -->
```yaml
plugin:
    plugin-candy-kind:
        repo: opencharly/plugin-candy-kind
        release: v2026.318.2233
        digest: sha256:b683a8a90901ad97244a984c4666c667e4c70f6d783691bd9c1d542a394f3e04

search-tools:
    description: Two command-line search tools, installed as packages and nothing else.
    package:
        - ripgrep
        - jq
```

`search-tools` is a node with no kind key, which makes it a candy, and the candy's body — its
`description:` and its `package:` list — is served by `opencharly/plugin-candy-kind`, so the document
declares that plugin. `package:` is a list of names for the operating system's package manager.

**Everything compiles to one IR.** Whatever a candy says, the plugin that owns it compiles it into the
**IR**: an ordered list of install **actions**, each one small, repeatable and reversible. There are
seven kinds of action, and every word that installs something compiles to them:

| Action | What it does |
|---|---|
| `package` | install a package through the operating system's package manager, or through a language manager |
| `package_repo` | add a package repository |
| `file` | write a file, copy one, make a directory or a link, or download and unpack an archive |
| `service` | install a long-running program as a service of the system's init |
| `user` | create a user |
| `env` | set an environment variable or extend the `PATH` |
| `command` | run a command, guarded so that running it twice changes nothing |

`search-tools` compiles to two actions:

```text
package  ripgrep
package  jq
```

The IR has exactly two readers. **build** applies the IR to a starting image or disk and produces an
**artifact**: a container image, or a disk a VM boots. **realize** brings a system to life — it runs
an artifact as a container or a VM, or applies the IR directly to a running host. Every target is one of these two
readers of the same list, so N concerns and M targets cost N + M, not N × M: a new target is one more
reader, and a new concern is one more candy.

### The honest limits

Declared plugins are dependencies you choose, pin and update, like any other import. A word is only
as good as the plugin that serves it. And an action has to be repeatable and reversible, which rules
out some imperative tricks on purpose: what cannot be written as an action has to become a guarded
`command`, and you have to say how it is guarded.

---

## 2. Configuration is written per image, so two images share a piece of it only by copying it or inheriting everything.

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

None of these is wrong. They are what you do when the unit of configuration is the image rather than
the concern.

### What OpenCharly does

A candy is one concern, and a **box** puts candies together. A box is a candy with a `from:`
starting point. `require:` adds another candy to it, with everything that candy carries: its
packages, files, services and checks. The box's IR is the IR of its starting point, then of every
candy it requires, then of its own content, in that order.

This is where your own project starts. It imports two repositories and declares the two plugins its
words need:

<!-- example: grievance-require -->
```yaml
import: # new in §2
    distro-cachyos: # new in §2
        repo: opencharly/distro-cachyos # new in §2
        release: v2026.327.0930 # new in §2
        digest: sha256:d32aa5fae9181727628f2f32b056ca2f7d4e0893d61474e2ccf80387b4fca814 # new in §2
    layer-example: # new in §2
        repo: opencharly/layer-example # new in §2
        release: v2026.327.1754 # new in §2
        digest: sha256:1ee8d0bb20372722fa49bdf27c8f4ffbd3346e59a13f726a3ccaaf6c24c5e7e9 # new in §2

plugin: # new in §2
    plugin-candy-kind: # new in §2
        repo: opencharly/plugin-candy-kind # new in §2
        release: v2026.318.2233 # new in §2
        digest: sha256:b683a8a90901ad97244a984c4666c667e4c70f6d783691bd9c1d542a394f3e04 # new in §2
    plugin-build: # new in §2
        repo: opencharly/plugin-build # new in §2
        release: v2026.327.1034 # new in §2
        digest: sha256:d5082d1a8adac511059769217e96a68f91d9768277f83483fcc4a150fa5b0e24 # new in §2

my-box: # new in §2
    description: A CachyOS box with the example search tools. # new in §2
    from: distro-cachyos.cachyos # new in §2
    require: # new in §2
        - layer-example.search-tools # new in §2
```

**`import:`** names the repositories the project builds on, each at a **release** (a CalVer tag) and
the **digest** of that release, so the same file always means the same content. A repository on
GitHub is written `owner/name`; one on any other host keeps its host, as in `gitlab.com/owner/name`.
Each import binds a **namespace**, here the repository's own name, and a dotted reference walks into
it: `distro-cachyos.cachyos` is the `cachyos` box of the repository imported as `distro-cachyos`, and
`layer-example.search-tools` is the candy from §1.

**`plugin:`** has the same shape. `my-box` is a candy body, so it needs `opencharly/plugin-candy-kind`
again; and because it has a `from:`, it is a box that gets built, which today is the separate
`opencharly/plugin-build`.

The IR of `my-box` is the IR of the CachyOS box it starts from, followed by the two actions of
`search-tools`:

```text
…        the actions of distro-cachyos.cachyos
package  ripgrep
package  jq
```

Any box may require any set of candies, in any combination, without either candy knowing the other
exists. Composition is a set, not a chain.

#### When to write `package:` and when to write `require:`

Use `package:` when the concern is the package and nothing more: the name is the same on every
distribution you target, and it needs no configuration file, no service and no user. Use `require:`
as soon as the concern is more than a package name, or when more than one box needs it, so that it is
written once and shared. When in doubt, start with `package:`; the moment you want the same list in a
second place, move it into a candy, as `search-tools` did, and require it.

### The honest limits

Order still matters when two candies write the same file, and candies are not hermetic: two of them
can install conflicting packages, and you find out at build time. This buys you composability, not
commutativity.

---

## 3. The same software has to be described again for every distribution.

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

A concern is described once, and only what differs is written per distribution. Every starting point
names an **`os` node**: the operating system's **family** (`arch`, `fedora`, `debian`), its package
manager, and its init systems. The `os` node is data that the plugins read, so the same IR becomes
`pacman` commands on CachyOS and `dnf` commands on Fedora without the candy saying which.

When a package's name differs, the candy says so with **`os_override:`**, which replaces only what
differs, for the operating systems where it differs. layer-example ships the Python GObject bindings
this way:

<!-- example: grievance-os-override -->
```yaml
plugin:
    plugin-candy-kind:
        repo: opencharly/plugin-candy-kind
        release: v2026.318.2233
        digest: sha256:b683a8a90901ad97244a984c4666c667e4c70f6d783691bd9c1d542a394f3e04

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

A key of `os_override:` is an operating system's family or its node name, and the most specific key
wins: Ubuntu matches the `debian` family, and a `cachyos:` key would beat the `arch` family CachyOS
belongs to. On CachyOS this candy compiles to one action, `package python-gobject`.

Your project's box now requires it too, and never thinks about the name again:

<!-- example: grievance-distribution -->
```yaml
import:
    distro-cachyos:
        repo: opencharly/distro-cachyos
        release: v2026.327.0930
        digest: sha256:d32aa5fae9181727628f2f32b056ca2f7d4e0893d61474e2ccf80387b4fca814
    layer-example:
        repo: opencharly/layer-example
        release: v2026.327.1754
        digest: sha256:1ee8d0bb20372722fa49bdf27c8f4ffbd3346e59a13f726a3ccaaf6c24c5e7e9

plugin:
    plugin-candy-kind:
        repo: opencharly/plugin-candy-kind
        release: v2026.318.2233
        digest: sha256:b683a8a90901ad97244a984c4666c667e4c70f6d783691bd9c1d542a394f3e04
    plugin-build:
        repo: opencharly/plugin-build
        release: v2026.327.1034
        digest: sha256:d5082d1a8adac511059769217e96a68f91d9768277f83483fcc4a150fa5b0e24

my-box:
    description: A CachyOS box with the example search tools.
    from: distro-cachyos.cachyos
    require:
        - layer-example.search-tools
        - layer-example.python-gobject # new in §3
```

**Init systems follow the same rule.** A candy declares a `service:` and never names an init. The
`os` node names one init for each role: a container init for a container, a system init for a VM or a
host. CachyOS names `supervisord` and `systemd`. The `service` action is rendered by whichever init
the role selects, so the same candy is correct in both places.

### The honest limits

A package that exists on one distribution only is still a per-distribution problem, and a candy that
shells out to `systemctl` is still writing for one init. The claim is that the *common* cases —
package names, services, user identity — are absorbed, so what remains is small and explicit rather
than diffuse.

---

## 4. A container and a VM of the same system are described in different tools that drift apart.

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

A box describes the system once, and says nothing about where it runs. A **deployment** is a node
whose **kind** says where it runs: `pod:` for a rootless container, `vm:` for a virtual machine,
`local:` to apply candies to an existing host, `android:` for a device, `kubernetes:` for a cluster
that runs pods and VMs as workloads. Changing the kind is the whole change:

<!-- example: grievance-pod-and-vm -->
```yaml
import:
    distro-cachyos:
        repo: opencharly/distro-cachyos
        release: v2026.327.0930
        digest: sha256:d32aa5fae9181727628f2f32b056ca2f7d4e0893d61474e2ccf80387b4fca814
    layer-example:
        repo: opencharly/layer-example
        release: v2026.327.1754
        digest: sha256:1ee8d0bb20372722fa49bdf27c8f4ffbd3346e59a13f726a3ccaaf6c24c5e7e9

plugin:
    plugin-candy-kind:
        repo: opencharly/plugin-candy-kind
        release: v2026.318.2233
        digest: sha256:b683a8a90901ad97244a984c4666c667e4c70f6d783691bd9c1d542a394f3e04
    plugin-build:
        repo: opencharly/plugin-build
        release: v2026.327.1034
        digest: sha256:d5082d1a8adac511059769217e96a68f91d9768277f83483fcc4a150fa5b0e24
    plugin-substrate: # new in §4
        repo: opencharly/plugin-substrate # new in §4
        release: v2026.319.1527 # new in §4
        digest: sha256:156cffc050a1904d28393547b8a5c0c06748b3462bb6bfc33ef794d7eb18747e # new in §4
    plugin-deploy-pod: # new in §4
        repo: opencharly/plugin-deploy-pod # new in §4
        release: v2026.326.1924 # new in §4
        digest: sha256:6023ac212f448413515882a9efdbf83585292d022520f3b6929ae072f1c435e9 # new in §4
    plugin-deploy-vm: # new in §4
        repo: opencharly/plugin-deploy-vm # new in §4
        release: v2026.314.0712 # new in §4
        digest: sha256:ff59bc3fa6c148a5cbed683605a591351413082ef8fe6a5eb36909cbd88c9761 # new in §4

my-box:
    description: A CachyOS box with the example search tools.
    from: distro-cachyos.cachyos
    require:
        - layer-example.search-tools
        - layer-example.python-gobject

my-pod: # new in §4
    pod: # new in §4
        description: The box as a rootless container. # new in §4
        from: my-box # new in §4

my-vm: # new in §4
    vm: # new in §4
        description: The same box as a virtual machine. # new in §4
        from: my-box # new in §4
```

The words are a plugin's like any other. `opencharly/plugin-substrate` serves the `pod` and `vm`
kinds, and `opencharly/plugin-deploy-pod` and `opencharly/plugin-deploy-vm` bring each one to life,
so the project declares all three.

`from:` of a deployment names the box it runs. Each kind decides which **form** of that box it needs:
a `pod` runs an image, a `vm` boots a disk. Both are built from the same IR, and the same IR is what a
`local:` deployment applies to a running host:

```text
the IR of my-box   →  build onto the CachyOS image   →  an image    (my-pod)
                   →  build onto the CachyOS disk    →  a disk      (my-vm)
                   →  apply to a running host        →  a configured host   (a local: deployment)
```

Which engine runs the pod and which hypervisor boots the VM is not in the document at all. It is a
**driver**, chosen in your user configuration (podman or another container engine, libvirt or
another hypervisor), so the same project runs unchanged under every driver of its kind. One shared IR,
not a pairwise translation, means neither form is the "real" one, and a new target is one more reader
of the same list.

### The honest limits

A `local:` deployment changes a real machine's packages and units, which is why this project's own
examples run it inside a disposable VM rather than on a workstation. A VM has a kernel and a boot
sequence a container does not. What is portable is the *description*; the targets stay genuinely
different, and charly's job is to make the difference explicit and handled rather than duplicated
across three toolchains.

---

## 5. Isolation is opt-in, and running anything nested means handing over root.

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

**Rootless is the default.** Every pod runs on a rootless container engine as the box's own user,
every VM under your own hypervisor session, with no `--privileged` and no host socket. Root is never
implicit. A deployment gets root only through a **need** — a statement of what it requires from the
host or from other deployments in order to run — for `privilege: rootful`, and only when the host can
**grant** it.

**Nesting is where you write it.** A deployment written *inside* another one runs inside it, and that
position is the whole declaration. layer-example ships a candy with a container engine and a
hypervisor:

<!-- example: grievance-nesting-candy -->
```yaml
plugin:
    plugin-candy-kind:
        repo: opencharly/plugin-candy-kind
        release: v2026.318.2233
        digest: sha256:b683a8a90901ad97244a984c4666c667e4c70f6d783691bd9c1d542a394f3e04

agent-tools:
    description: A container engine and a hypervisor for an agent's work.
    package:
        - podman
        - qemu-base
        - libvirt
```

Your project builds a box on it and nests three deployments: a pod, a VM inside the pod, and a pod
inside the VM.

<!-- example: grievance-candybox -->
```yaml
import:
    distro-cachyos:
        repo: opencharly/distro-cachyos
        release: v2026.327.0930
        digest: sha256:d32aa5fae9181727628f2f32b056ca2f7d4e0893d61474e2ccf80387b4fca814
    layer-example:
        repo: opencharly/layer-example
        release: v2026.327.1754
        digest: sha256:1ee8d0bb20372722fa49bdf27c8f4ffbd3346e59a13f726a3ccaaf6c24c5e7e9

plugin:
    plugin-candy-kind:
        repo: opencharly/plugin-candy-kind
        release: v2026.318.2233
        digest: sha256:b683a8a90901ad97244a984c4666c667e4c70f6d783691bd9c1d542a394f3e04
    plugin-build:
        repo: opencharly/plugin-build
        release: v2026.327.1034
        digest: sha256:d5082d1a8adac511059769217e96a68f91d9768277f83483fcc4a150fa5b0e24
    plugin-substrate:
        repo: opencharly/plugin-substrate
        release: v2026.319.1527
        digest: sha256:156cffc050a1904d28393547b8a5c0c06748b3462bb6bfc33ef794d7eb18747e
    plugin-deploy-pod:
        repo: opencharly/plugin-deploy-pod
        release: v2026.326.1924
        digest: sha256:6023ac212f448413515882a9efdbf83585292d022520f3b6929ae072f1c435e9
    plugin-deploy-vm:
        repo: opencharly/plugin-deploy-vm
        release: v2026.314.0712
        digest: sha256:ff59bc3fa6c148a5cbed683605a591351413082ef8fe6a5eb36909cbd88c9761

my-box:
    description: A CachyOS box with the example search tools.
    from: distro-cachyos.cachyos
    require:
        - layer-example.search-tools
        - layer-example.python-gobject

my-pod:
    pod:
        description: The box as a rootless container.
        from: my-box

my-vm:
    vm:
        description: The same box as a virtual machine.
        from: my-box

agent-box: # new in §5
    description: The box with a container engine and a hypervisor for an agent's work. # new in §5
    from: my-box # new in §5
    require: # new in §5
        - layer-example.agent-tools # new in §5

agent-sandbox: # new in §5
    pod: # new in §5
        description: A rootless pod an agent is handed, with a VM running inside it. # new in §5
        from: agent-box # new in §5
        guest-vm: # new in §5
            vm: # new in §5
                description: A VM on the pod's hypervisor, with a container on the VM's engine. # new in §5
                from: agent-box # new in §5
                worker: # new in §5
                    pod: # new in §5
                        description: A rootless container inside the VM inside the pod. # new in §5
                        from: agent-box # new in §5
```

`agent-box` starts `from: my-box`, so it is everything `my-box` is, plus `agent-tools`.

The outer deployment receives exactly what the inner one needs to run, derived from where it is
written and never typed by hand. Each need is a **capability**: a type and a name, such as
`device: kvm`. Because the `vm` is written inside the `pod`, the pod needs `device: {kvm, vhost_net}`
(the host's `/dev/kvm` and `/dev/vhost-net`) and nothing wider. Because a `pod` is written inside the
`vm`, the VM needs what a rootless container engine needs: `device: {fuse, tun}` and
`isolation: {userns}` (user-namespace sandboxes). Each parent's kind **grants** those needs, the pod's
from the host and the VM's from its own virtual hardware. A VM inside a container and a container
inside a VM are both ordinary trees — **candyboxing**.

**Why this is the load-bearing one.** It lets the security model be *"secure the box, not the
candy"*. If the boundary is kernel-enforced, rootless and nests, you can hand an agent the entire
toolset inside a disposable environment instead of whitelisting the commands it may run. Command
allowlists fail because the interesting attacks are compositions of boring commands. A wall does not
care.

### The honest limits

Rootless nesting needs kernel support — user namespaces, and KVM for VMs — and is not free: there are
performance costs, and some device classes cannot pass through. Some workloads genuinely need root,
such as checkpointing a running process; they get it only by declaring it. The claim is that nesting
and rootlessness are the *default* the boxes are built against, not an exotic configuration you are
on your own with.

---

## 6. The tests stay behind in the repository when the image ships.

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
candies so far needed one — but a candy that has them takes them everywhere it goes. layer-example
ships a small web server with two:

<!-- example: grievance-checks -->
```yaml
plugin:
    plugin-candy-kind:
        repo: opencharly/plugin-candy-kind
        release: v2026.318.2233
        digest: sha256:b683a8a90901ad97244a984c4666c667e4c70f6d783691bd9c1d542a394f3e04
    plugin-file:
        repo: opencharly/plugin-file
        release: v2026.314.0713
        digest: sha256:0ed1f8c856cb44d7219eba58c4515b0346f461668e9774e3b43a2cdddb8f9821
    plugin-http:
        repo: opencharly/plugin-http
        release: v2026.314.0714
        digest: sha256:a71e7cc7235841b15f098a421bf41f7ff5071da606a3b47e324ba3715c203b67

hello-web:
    description: A web server whose page is in the artifact and is served once it runs.
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

What is new here:

- **`file:`** writes files, keyed by their path; each entry compiles to one `file` action.
- **`service:`** declares a program that runs as a service; it compiles to one `service` action,
  which the `os` node's init renders (§3).
- **`provide:`** says what the candy offers to others. An **endpoint** is a port with its protocol and
  path. The two endpoints share port 8080 and protocol `http`, and their paths tell them apart.
- **`step:`** lists the checks. A step's `check:` is its description; its **verb** is the one key that
  says what it observes. `file` and `http` are verbs, and like every word they are served by plugins,
  `opencharly/plugin-file` and `opencharly/plugin-http`, which the document declares. `contains:` is
  a matcher and `retry:` a step modifier, both core's own words: the `http` check is retried until it
  passes or 30 seconds have gone by.

The `http` check names the `hello` endpoint instead of restating its address, so the port and the path
are written once, where the endpoint is provided, and the check follows them when they change. Where
the check runs outside the deployment, the endpoint resolves to the port the deployment publishes.

Every check has a **phase**, which says what it observes. An `artifact` check runs inside the built
image, in a disposable container, before the image is stored; a `ready` check holds a deployment back
until it passes; a `deployment` check runs against the live deployment — its real ports, services and
environment. The phase follows from what the verb can observe: a `file` can be checked in the
artifact, so that check runs there, and an `http` endpoint exists only once something serves it, so
that check runs on the deployment.

Your project's last addition is a box that requires the web server:

<!-- example: grievance-tests -->
```yaml
import:
    distro-cachyos:
        repo: opencharly/distro-cachyos
        release: v2026.327.0930
        digest: sha256:d32aa5fae9181727628f2f32b056ca2f7d4e0893d61474e2ccf80387b4fca814
    layer-example:
        repo: opencharly/layer-example
        release: v2026.327.1754
        digest: sha256:1ee8d0bb20372722fa49bdf27c8f4ffbd3346e59a13f726a3ccaaf6c24c5e7e9

plugin:
    plugin-candy-kind:
        repo: opencharly/plugin-candy-kind
        release: v2026.318.2233
        digest: sha256:b683a8a90901ad97244a984c4666c667e4c70f6d783691bd9c1d542a394f3e04
    plugin-build:
        repo: opencharly/plugin-build
        release: v2026.327.1034
        digest: sha256:d5082d1a8adac511059769217e96a68f91d9768277f83483fcc4a150fa5b0e24
    plugin-substrate:
        repo: opencharly/plugin-substrate
        release: v2026.319.1527
        digest: sha256:156cffc050a1904d28393547b8a5c0c06748b3462bb6bfc33ef794d7eb18747e
    plugin-deploy-pod:
        repo: opencharly/plugin-deploy-pod
        release: v2026.326.1924
        digest: sha256:6023ac212f448413515882a9efdbf83585292d022520f3b6929ae072f1c435e9
    plugin-deploy-vm:
        repo: opencharly/plugin-deploy-vm
        release: v2026.314.0712
        digest: sha256:ff59bc3fa6c148a5cbed683605a591351413082ef8fe6a5eb36909cbd88c9761

my-box:
    description: A CachyOS box with the example search tools.
    from: distro-cachyos.cachyos
    require:
        - layer-example.search-tools
        - layer-example.python-gobject

my-pod:
    pod:
        description: The box as a rootless container.
        from: my-box

my-vm:
    vm:
        description: The same box as a virtual machine.
        from: my-box

agent-box:
    description: The box with a container engine and a hypervisor for an agent's work.
    from: my-box
    require:
        - layer-example.agent-tools

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

hello-box: # new in §6
    description: The box with the example web server. # new in §6
    from: my-box # new in §6
    require: # new in §6
        - layer-example.hello-web # new in §6
```

The project writes no check verb itself, so it declares no check plugin: the checks arrive inside
the candy, and the plugins that run them are declared by layer-example.

The build writes the resolved stack into the image's OCI labels — one label per concern, named
`ai.opencharly.<word>`, each value the JSON form of the same schema the source was written in. A label
carries the checks only, because the install actions are already in the image. These are the labels
`hello-box` carries, decoded and listed by their word (`box` is the label `ai.opencharly.box`, `step`
is `ai.opencharly.step`):

<!-- example: grievance-labels labels -->
```yaml
box: hello-box
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

A check is only as good as the candy that declares it: write a thin candy and the image ships thin
proof. Artifact and deployment checks see different things, so a real gate needs both. The full
destroy-and-rebuild proof is defined only for deployments marked disposable; proving a production
system you must not destroy is a smaller, different claim.

---

## What this adds up to

Each grievance is survivable alone. Together they produce an environment written in one tool's
fixed words, translated separately for every target, copied between images, rewritten per
distribution, described twice for containers and VMs, running as root because nesting was too hard,
and whose proof does not travel with it — an environment nobody can reproduce, that only one person
can rebuild, and that nobody dares hand to an automated agent.

The six answers compose into one property — **a described environment that is disposable**. You can
destroy it because you can rebuild it; you can rebuild it because the description is complete and
written in words you declared, compiled to one IR; you can hand it over because it is rootless and
nests; and the description is complete because it is composed of candies that each carry their own
proof.

For where that leads, see [the vision](VISION.md). For how it works, see
[DESIGN.md](https://github.com/opencharly/opencharly/blob/main/DESIGN.md), the
[skills index](https://github.com/opencharly/marketplace) or [opencharly.ai](https://opencharly.ai).
