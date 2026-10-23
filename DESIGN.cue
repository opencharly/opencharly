// DESIGN.cue — the schema of DESIGN.md (Appendix A), CUE v0.18.0-rc.1. The single copy.
//
//   Part 1  authoring schema (DESIGN Part III)   validate: cue vet -d '#Document' DESIGN.cue charly.yml
//   Part 2  user configuration (DESIGN §17)      validate: cue vet -d '#UserConfig' DESIGN.cue config.yml
//   Part 3  core↔plugin protocol (DESIGN §8)     validate: cue vet -d '#Request' DESIGN.cue request.yaml
//
// Written with the schema patterns of DESIGN §3.1 and nothing else:
//   S1  closed definition       #Endpoint: {port!: #Port, path?: #AbsPath}   (closed, recursively)
//   S2  named scalar            #Name: =~"…"
//   S3  vocabulary table        _x: {word: {row}} @vocab(owner); _xWord: [for w, _ in _x {w}]
//   S4  key-tagged union        #XAlt: {a: {a!: #Payload, #XFields}}   #X: or([for _, a in #XAlt {a}])
//                               one entry may be the default, selected when no tag is written
//   S5  named collection        {[#Name]: #T} for what a node defines; a list for what it refers to
//   S6  shared fragment         #XFields: {…} embedded in S1/S4 definitions
//   S7  conditional field       if from != _|_ {#BoxFields}
//   S8  reserved-name pattern   [#InnerNodeName]: T
//   S9  reference field         from?: #Ref @ref(source, box); a typed-row table states `ref: [...]`
//   S10 foreign payload         config?: #Opaque // S10
//   S11 typed row table         #XRow + _x: {[w]: #XRow}; derived shapes are comprehensions over it
//
// Every struct with named fields is a named definition; an inline struct declares at most one named
// field, its S4 tag, and otherwise only embeddings, patterns and comprehensions (DESIGN §6, C1).
// Every concept is defined once; an instance is a row or a word of its table (D-LAW-8).
//   M1 content → IR      #Content, #ActionAlt               M5 lifecycle and state  _method transition, capture, restore
//   M2 artifact          #ArtifactRef, _method.build        M6 venue                #VenueAlt, _access
//   M3 kind × driver     _deploymentKind, _driver           M7 observation          #FactVerbAlt, #ProtocolVerbAlt
//   M4 need → grant      _capability                        M8 store                _store, _hostMethod get, put
// A derivation has exactly one spelling per form, so the generator (DESIGN §6, D-GEN-8) maps each to
// one Go shape; the design check rejects every other list comprehension:
//   D1 word list      _xWord: [for w, _ in _x {w}]
//   D2 row subset     _qWord: [for w, r in _x if <row predicate> {w}]
//   D3 row grouping   _yX: {for k, _ in _y {(k): [for w, r in _x if <row predicate on k> {w}]}}
//   D4 tag union      #X: or([for _, a in #XAlt {a}])
//   D5 word union     or(_xWord), or(_yX[k]); a default is `*"w" | or(_xWord)` with w a row of _x
//   D6 row selection  or([for v in r.<field> {T[v]}]) inside a definition derived from the rows of r
// and a fragment is composed by spreading it (`#XFields...`, language v0.18.0 strict embedding).
// A `// D-…` comment marks the line that enforces that requirement; every tag has a negative case
// in design/negative/. Rules a single document cannot express are indexed in DESIGN §5.4.
package design

import (
	"list"
	"strings"
)

// ════════════════════════════════════════════════════════════════ Part 1 — authoring

// ── S2 named scalars ─────────────────────────────────────────────────────────
#Name:        =~"^[a-z][a-z0-9]*(-[a-z0-9]+)*$"              // D-NEST-4: a user name, never `--`
#Word:        =~"^[a-z][a-z0-9]*(_[a-z0-9]+)*$"              // D-NAME-2: a schema word
#Ref:         =~"^[a-z][a-z0-9]*(-[a-z0-9]+)*(\\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$"
#Label:       =~"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$"        // an external system's DNS label
#Text:        string & !=""
#Count:       int & >0
#Line:        int & >=1
#Fraction:    number & >=0 & <=1
#Port:        int & >0 & <65536
#Hostname:    =~"^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$"
#Address:     =~"^[a-z0-9]([a-z0-9.-]*[a-z0-9])?:[0-9]+$"
#Url:         =~"^[a-z][a-z0-9+.-]*://[^ ]+$"
#Repo:        =~"^[a-z0-9.-]+/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
#Module:      =~"^[a-z0-9.-]+(/[A-Za-z0-9_.-]+)+$"
#Release:     =~"^v[0-9]{4}\\.[0-9]{3}\\.[0-9]{4}$"
#Digest:      =~"^sha256:[0-9a-f]{64}$"
#Base64:      =~"^[A-Za-z0-9+/]*={0,2}$" // binary data on the JSON wire (D-GEN-6)
#Sha256:      =~"^[0-9a-f]{64}$"
#ImageRef:    =~"^[a-z0-9.-]+(:[0-9]+)?/[a-z0-9._/-]+(:[A-Za-z0-9._-]+)?(@sha256:[0-9a-f]{64})?$"
#ImageTag:    =~"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$"
#RuleId:      =~"^D-[A-Z]+-[0-9]+$"
#Size:        =~"^[0-9]+(Ki|Mi|Gi|Ti)$"
#Duration:    =~"^[0-9]+(ms|s|m|h)$"
#Timestamp:   =~"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$"
#Cron:        =~"^(\\S+\\s+){4}\\S+$"
#EnvName:     =~"^[A-Za-z_][A-Za-z0-9_]*$"
#HeaderName:  =~"^[A-Za-z0-9-]+$"
#FileMode:    =~"^0[0-7]{3}$"
#AbsPath:     =~"^/[^$]*$" // D-SCH-7: a literal absolute path, no variables
#Scalar:      string | number | bool
#InitNeutral: string & !~"%[a-zA-Z(]" // D-CANDY-3
// A package is an OS package name, or `<manager>:<locator>` for a non-OS manager (§7.1); the
// locator is whatever that manager installs from (a name, or a URL for `android:`).
#OsPackage:      =~"^[^: ]+$"
#ManagerLocator: =~"^(\(strings.Join(_managerWord, "|"))):[^ ]+$"
#Package:        #OsPackage | #ManagerLocator

// Lists of references and of plain values (S5): unique items.
#RefSet:  [...#Ref] & list.UniqueItems()
#NameSet: [...#Name] & list.UniqueItems()
#TextSet: [...#Text] & list.UniqueItems()
#RepoSet: [...#Repo] & list.UniqueItems()

// The one open value: a field whose schema another system or plugin owns (S10, D-PAT-1).
#Opaque: {...}

// ── S3 vocabulary tables ─────────────────────────────────────────────────────
// Every closed set of words is a table keyed by word; its rows carry the word's data, and its word
// list is derived. `@vocab` names who owns the set (§7.1): `core` and a plugin owner are closed sets
// compiled into that owner; `registry` is composed from the loaded plugins. An external system's
// own identifier for a word is its row's `native` (D-NAME-3).
#NativeRow: {native?: #Text}

_directive: {repo: {}, plugin: {}, import: {}, discover: {}} @vocab(core)
_directiveWord: [for w, _ in _directive {w}]
_intent: {run: {}, check: {}, harness_check: {}, harness_run: {}} @vocab(core)
_intentWord: [for w, _ in _intent {w}]
// A step's phase: `build` against the artifact, `ready` gating a realization (the readiness
// condition of D-LAW-5), `runtime` against a running deployment, or `any`.
_phase: {any: {}, build: {}, ready: {}, runtime: {}} @vocab(core)
_phaseWord: [for w, _ in _phase {w}]
_scope: {system: {}, user: {}} @vocab(core)
_scopeWord: [for w, _ in _scope {w}]
_form: {image: {}, disk: {}} @vocab(core)
_formWord: [for w, _ in _form {w}]
_capture: {filesystem: {}, process: {}} @vocab(core)
_captureWord: [for w, _ in _capture {w}]
_leaseMode: {shared: {}, exclusive: {}} @vocab(core)
_leaseModeWord: [for w, _ in _leaseMode {w}]
_transport: {tcp: {}, udp: {}} @vocab(core)
_transportWord: [for w, _ in _transport {w}]
_protocol: {http: {}, mcp: {}, grpc: {}} @vocab(core)
_protocolWord: [for w, _ in _protocol {w}]
_onError: {fail: {}, continue: {}, skip: {}} @vocab(agent)
_onErrorWord: [for w, _ in _onError {w}]
_updateGate: {full: {}, restart_only: {}, skip: {}} @vocab(core)
_updateGateWord: [for w, _ in _updateGate {w}]
_severity: {error: {}, warning: {}} @vocab(core)
_severityWord: [for w, _ in _severity {w}]
// A deployment's state; a `transition` targets a state whose row is a `target` (§8.2).
#StateRow: {target: *false | bool}
_state: [#Word]: #StateRow
_state: {absent: {target: true}, stopped: {target: true}, running: {target: true}, failed: {}} @vocab(core)
_stateWord: [for w, _ in _state {w}]
_targetStateWord: [for w, r in _state if r.target {w}]
// What a venue serves (§12.7); a venue lacking one refuses it (D-VENUE-2).
_access: {exec: {}, copy: {}, log: {}, console: {}, display: {}, forward: {}, power: {}} @vocab(core)
_accessWord: [for w, _ in _access {w}]
// Every pluggable subsystem whose driver the user configuration chooses (D-DRV-1).
_subsystem: {pod: {}, vm: {}, kubernetes: {}, agent: {}, secret: {}} @vocab(core)
_subsystemWord: [for w, _ in _subsystem {w}]

// Every manager word and the phase whose work it is (D-IR-7).
_managerPhase: {build: {}, apply: {}} @vocab(build)
_managerPhaseWord: [for w, _ in _managerPhase {w}]
#ManagerRow: {phase!: or(_managerPhaseWord)}
_manager: [#Word]: #ManagerRow
_manager: {
	npm:     {phase: "build"}
	cargo:   {phase: "build"}
	pip:     {phase: "build"}
	aur:     {phase: "build"}
	flatpak: {phase: "build"}
	helm:    {phase: "apply"}
	android: {phase: "apply"}
} @vocab(registry)
_managerWord: [for w, _ in _manager {w}]
_buildManagerWord: [for w, r in _manager if r.phase == "build" {w}]
#BuildManager: or(_buildManagerWord)
_packageManager: {dnf: {}, apt: {}, pacman: {}, apk: {}, zypper: {}} @vocab(registry)
_packageManagerWord: [for w, _ in _packageManager {w}]
_serviceFormat: {systemd: {}, supervisord: {}} @vocab(build)
_serviceFormatWord: [for w, _ in _serviceFormat {w}]
_initRole: {container: {}, system: {}} @vocab(build)
_initRoleWord: [for w, _ in _initRole {w}]
_restart: {always: {}, on_failure: {}, never: {}} @vocab(build)
_restartWord: [for w, _ in _restart {w}]
_platform: [#Word]: #NativeRow
_platform: {amd64: {native: "linux/amd64"}, arm64: {native: "linux/arm64"}} @vocab(build)
_platformWord: [for w, _ in _platform {w}]
_firmware: {uefi: {}, bios: {}, uefi_secure: {}} @vocab(machine)
_firmwareWord: [for w, _ in _firmware {w}]
_recorder: {display: {}, console: {}, log: {}, audio: {}} @vocab(check)
_recorderWord: [for w, _ in _recorder {w}]
_requestMethod: [#Word]: #NativeRow
_requestMethod: {get: {native: "GET"}, post: {native: "POST"}, put: {native: "PUT"}, delete: {native: "DELETE"}, head: {native: "HEAD"}} @vocab(check)
_requestMethodWord: [for w, _ in _requestMethod {w}]
_bus: {session: {}, system: {}} @vocab(desktop)
_busWord: [for w, _ in _bus {w}]
_packageFormat: {rpm: {}, deb: {}, pac: {}, apk: {}} @vocab(operations)
_packageFormatWord: [for w, _ in _packageFormat {w}]
_skillCategory: {development: {}, commands: {}, kind: {}, images: {}} @vocab(documentation)
_skillCategoryWord: [for w, _ in _skillCategory {w}]
_profile: {developer: {}, user: {}, container: {}} @vocab(documentation)
_profileWord: [for w, _ in _profile {w}]
_hookLanguage: {sh: {}, py: {}} @vocab(documentation)
_hookLanguageWord: [for w, _ in _hookLanguage {w}]
_hookEvent: [#Word]: #NativeRow
_hookEvent: {
	session_start:      {native: "SessionStart"}
	user_prompt_submit: {native: "UserPromptSubmit"}
	pre_tool_use:       {native: "PreToolUse"}
	post_tool_use:      {native: "PostToolUse"}
	stop:               {native: "Stop"}
} @vocab(documentation)
_hookEventWord: [for w, _ in _hookEvent {w}]
_docProjection: {recipe: {}, cli: {}, registry: {}, candy: {}, box: {}, plugin: {}, landing: {}} @vocab(documentation)
_docProjectionWord: [for w, _ in _docProjection {w}]

// M4: the host words a need may name (§16).
_gpu: {any: {}, nvidia: {}, amd: {}, intel: {}} @vocab(spec) // any: a need every vendor satisfies
_gpuWord: [for w, _ in _gpu {w}]
_device: [#Word]: #NativeRow
_device: {
	kvm:       {native: "/dev/kvm"}
	render:    {native: "/dev/dri"}
	fuse:      {native: "/dev/fuse"}
	tun:       {native: "/dev/net/tun"}
	vhost_net: {native: "/dev/vhost-net"}
	vsock:     {native: "/dev/vsock"}
	hwrng:     {native: "/dev/hwrng"}
	kfd:       {native: "/dev/kfd"}
} @vocab(spec)
_deviceWord: [for w, _ in _device {w}]
_nesting: {container: {}, vm: {}, userns: {}} @vocab(spec)
_nestingWord: [for w, _ in _nesting {w}]
_isolation: {microvm: {}} @vocab(spec)
_isolationWord: [for w, _ in _isolation {w}]
_privilege: {rootful: {}} @vocab(spec)
_privilegeWord: [for w, _ in _privilege {w}]
_memory: {ram: {}, shm: {}} @vocab(spec)
_memoryWord: [for w, _ in _memory {w}]
_cpu: {core: {}} @vocab(spec)
_cpuWord: [for w, _ in _cpu {w}]
_storage: {root: {}} @vocab(spec)
_storageWord: [for w, _ in _storage {w}]

// M3: the driver table (D-DRV-1, D-DRV-3). A driver is a row: what it consumes, what its venue
// serves, what it can capture, the lease mode each grant it makes imposes (D-HW-8) and its tool.
// A difference between two drivers is a row value, never a code branch outside the row.
#DriverRow: {
	subsystem!: or(_subsystemWord)
	default:    *false | bool
	form?:      [...or(_formWord)] & list.UniqueItems()
	access?:    [...or(_accessWord)] & list.UniqueItems()
	capture?:   [...or(_captureWord)] & list.UniqueItems()
	grant?:     {[or(_leasableWord)]: or(_leaseModeWord)}
	tool?:      #Text
}
_driver: [#Word]: #DriverRow
_driver: {
	podman:         {subsystem: "pod", default: true, tool: "podman", form: ["image"], access: ["exec", "copy", "log", "console", "forward"], capture: ["filesystem", "process"], grant: {gpu: "shared", device: "shared"}}
	docker:         {subsystem: "pod", tool: "docker", form: ["image"], access: ["exec", "copy", "log", "console", "forward"], capture: ["filesystem"], grant: {gpu: "shared", device: "shared"}}
	containerd:     {subsystem: "pod", form: ["image"], access: ["exec", "copy", "log", "console", "forward"], capture: ["filesystem"], grant: {gpu: "shared", device: "shared"}}
	libvirt:        {subsystem: "vm", default: true, tool: "virsh", form: ["disk"], access: ["exec", "copy", "log", "console", "display", "forward", "power"], capture: ["filesystem", "process"], grant: {gpu: "exclusive", device: "exclusive"}}
	qemu:           {subsystem: "vm", form: ["disk"], access: ["exec", "copy", "log", "console", "display", "forward", "power"], capture: ["filesystem"], grant: {gpu: "exclusive", device: "exclusive"}}
	krun:           {subsystem: "vm", form: ["image"], access: ["copy", "log", "console", "forward"], capture: ["filesystem"], grant: {gpu: "shared"}}
	firecracker:    {subsystem: "vm", form: ["disk"], access: ["exec", "copy", "log", "console", "forward", "power"], capture: ["filesystem", "process"]}
	kind:           {subsystem: "kubernetes", default: true, tool: "kind"}
	k3s:            {subsystem: "kubernetes", tool: "k3s"}
	pi:             {subsystem: "agent", default: true}
	tmux:           {subsystem: "agent", tool: "tmux"}
	secret_service: {subsystem: "secret", default: true}
	gpg:            {subsystem: "secret", tool: "gpg"}
	file:           {subsystem: "secret"}
} @vocab(registry)
_driverWord: [for w, _ in _driver {w}]
_subsystemDriver: {for k, _ in _subsystem {(k): [for w, r in _driver if r.subsystem == k {w}]}}
// Exactly one default per subsystem (D-DRV-1); a package-level `cue vet DESIGN.cue` checks it.
_subsystemDefaultDriver: {for k, _ in _subsystem {(k): [for w, r in _driver if r.subsystem == k && r.default {w}] & list.MinItems(1) & list.MaxItems(1)}}

// ── S4 tag tables ────────────────────────────────────────────────────────────
// Every kind word and the node it selects (§10): the data and workflow kinds, then every deployment
// kind a top-level node may be (its row's `top` is not empty).
#KindAlt: {
	source:      {source!: #Source}
	os:          {os!: #Os}
	init:        {init!: #Init}
	builder:     {builder!: #Builder}
	harness:     {harness!: #Harness}
	pipeline:    {pipeline!: #Pipeline}
	skill:       {skill!: #Skill}
	hook:        {hook!: #Hook}
	marketplace: {marketplace!: #Marketplace}
	doc:         {doc!: #Doc}
	for k, r in _deploymentKind if len(r.top) > 0 {(k): _#TopNode[k]}
}
// A top-level node (§4.2 rule 3): the candy is the default entry, selected when no kind key is
// written; it admits no kind key. Registry key `kind:candy` is reserved for it (§8.2).
#NodeAlt: {
	candy: #Candy
	#KindAlt...
}
#Node: or([for _, a in #NodeAlt {a}])

// M7 — every check verb and its input (§20), in exactly two tables. A fact verb observes the state
// of the system its venue reaches; a protocol verb speaks one generic protocol to an endpoint.
#FactVerbAlt: {
	command:      {command!: #Text}
	file:         {file!: #FileCheck}
	package:      {package!: #PackageCheck}
	service:      {service!: #ServiceCheck}
	process:      {process!: #ProcessCheck}
	port:         {port!: #PortCheck}
	user:         {user!: #UserCheck}
	group:        {group!: #GroupCheck}
	mount:        {mount!: #MountCheck}
	kernel_param: {kernel_param!: #KernelParamCheck}
	dns:          {dns!: #DnsCheck}
	interface:    {interface!: #InterfaceCheck}
}
#ProtocolVerbAlt: {
	http:    {http!: #HttpCheck}
	kube:    {kube!: #KubeCheck}
	appium:  {appium!: #AppiumCheck}
	cdp:     {cdp!: #CdpCheck}
	dbus:    {dbus!: #DbusCheck}
	mcp:     {mcp!: #McpCheck}
	display: {display!: #DisplayCheck}
}
#VerbAlt: {#FactVerbAlt..., #ProtocolVerbAlt...} // D-VERB-6: a verb is a fact or a protocol, nothing else
#Verb: or([for _, a in #VerbAlt {a}])

// Field names of the bodies that can hold named nodes. Optional fields cannot be enumerated
// inside CUE, so these lists are written out; design-consistency.sh checks them against the
// definitions.
_candyField: ["description", "from", "step", "require", "need", "provide", "package", "os_override", "file", "package_repo", "env", "path_append", "service", "user", "volume", "export", "module", "packaging", "platform", "build_with", "entrypoint", "tag", "parameter", "with", "capture"]
_deployField: ["description", "step", "disposable", "preemptible", "update_gate", "concurrency", "instrument", "ephemeral", "need", "with", "require", "create", "connect", "from", "publish", "node", "device", "api_level", "config"]

_kindWord: [for w, _ in #KindAlt {w}]
_verbWord: [for w, _ in #VerbAlt {w}]
_reserved: strings.Join(list.Concat([_kindWord, _deploymentKindWord]), "|")

// D-SCH-6: node names never collide with kind words, directives or body field names (S8).
#TopName:        #Name & !~"^(\(strings.Join(_directiveWord, "|"))|\(_reserved))$"
#InnerCandyName: #Name & !~"^(\(strings.Join(_candyField, "|"))|\(_reserved))$"
#InnerNodeName:  #Name & !~"^(\(strings.Join(_deployField, "|"))|\(_reserved))$"
// A namespace is a named scope (§2) and the first segment of a namespaced reference (D-REF-1).
// D-KIND-4: a namespace is never a kind word or a directive, so a plugin's kind cannot shadow a
// first-party one.
#Namespace: #TopName

// ── document (§4.2) ─────────────────────────────────────────────────────────
#Document: {
	repo?:     #Repo
	plugin?:   {[#Name]: #RepositoryRef} // D-PLUG-4
	import?:   {[#Namespace]: #RepositoryRef}
	discover?: #TextSet
	[#TopName]: #Node
}

// D-REF-3: a released repository pinned by release and digest, or a local path.
#PinFields: {release!: #Release, digest!: #Digest}
#RepositoryRefAlt: {
	repo: {repo!: #Repo, #PinFields...}
	path: {path!: #Text}
}
#RepositoryRef: or([for _, a in #RepositoryRefAlt {a}])

// Parameterization: a node declares parameters, a reference supplies values with `with:`. A candy's
// parameter is a bounded choice, never a substitution (D-SCH-7).
#Parameter: {
	description?: #Text
	default?:     #Text
	choice?:      #TextSet
}
#CandyParameter: {#Parameter..., choice!: #TextSet} // D-SCH-7
#With: {[#Name]: #Text}

// ════ M1 — content: what a candy installs; an `os_override` overrides the same shape ════
// D-IR-6: an OS package carries nothing; a manager package may carry its plugin's config.
// D-IR-5: a manager's attributes are that config, never fields of the package entry itself.
#PackageMap: {
	[#OsPackage]:      {}
	[#ManagerLocator]: #ManagerPackage
}
#ManagerPackage: {config?: #Opaque} // S10: the owning manager plugin's config
#Content: {
	package?:      #PackageMap
	package_repo?: {[#Name]: #PackageRepo}
	file?:         {[#AbsPath]: #File}
	env?:          {[#EnvName]: #InitNeutral}
	path_append?:  [...#AbsPath]
	service?:      {[#Name]: #Service}
	user?:         {[#Name]: #User}
	volume?:       {[#Name]: #Volume}
	export?:       {[#Name]: #Export}
}
#CandyFields: {
	description!: #Text // D-KIND-3
	step?:        [...#Step]
	require?:     #RefSet @ref(candy) // D-CANDY-2: candies only, by reference
	need?:        #Need
	provide?:     #Provide
	parameter?:   {[#Name]: #CandyParameter} // the choices this candy declares
	with?:        #With                      // the choices it supplies to its `from:`
	#Content...
	os_override?: {[#Name]: #Content} // per `os` family or node; the most specific key wins
	module?:      #Module             // a plugin candy (§8.1)
	packaging?:   #Packaging
}
// The native-package metadata of charly's own packages (D-CANDY-6), owned by the operations plugin.
#Packaging: {
	name!:   #Name
	format!: [...or(_packageFormatWord)] & list.UniqueItems()
	depend?: {[or(_packageFormatWord)]: #NameSet}
}

// Box build settings: declared only on a box.
#BoxFields: {
	platform?:   [...or(_platformWord)] & list.UniqueItems()
	build_with?: {[#BuildManager]: #Ref} @ref(builder) // D-IR-7: only a build-time manager has a builder
	entrypoint?: [...#Text]
	tag?:        #ImageTag
	capture?:    or(_captureWord) // D-CAPTURE-4: what a capture takes
}

#Candy: { // D-HW-5, D-SCH-5: closed — no raw runtime settings, no removed field
	#CandyFields...
	from?: #Ref @ref(source, box, pod, vm) // a box is a candy with `from:`
	if from != _|_ {#BoxFields...} // D-CANDY-1
	[#InnerCandyName]: #InnerCandy
}
#InnerCandy: { // D-CANDY-2: no `from` — an inner candy never starts a stack
	#CandyFields...
	[#InnerCandyName]: #InnerCandy
}

#PackageRepo: {url!: #Url, gpgkey?: #Url}
// A persistent directory; `encrypted` is granted by the kind as an encrypted filesystem (M4).
#Volume: {path!: #AbsPath, encrypted: *false | bool}
#Export: {path!: #AbsPath, mode?: #FileMode}
// A pinned download: a disk source, an iso source, a downloaded or extracted file.
#Download: {url!: #Url, sha256!: #Sha256}

#FileFields: {mode?: #FileMode, owner?: #Name, linux_capability?: #NameSet}
#FileAlt: { // D-IR-4
	content:  {content!: string, #FileFields...}
	copy:     {copy!: #Text, #FileFields...}
	dir:      {dir!: true, #FileFields...}
	link:     {link!: #AbsPath, #FileFields...}
	download: {download!: #Download, #FileFields...}
	extract:  {extract!: #Download, #FileFields...}
}
#File: or([for _, a in #FileAlt {a}])

#Service: {
	exec?:        #InitNeutral
	user?:        #Name
	restart:      *"always" | or(_restartWord)
	after?:       #NameSet
	env?:         {[#EnvName]: #InitNeutral}
	working_dir?: #AbsPath
	scope:        *"system" | or(_scopeWord)
}
#User: {uid?: #Count, group?: #NameSet, shell?: #AbsPath}

// ════ M4 — capabilities: one table of types; a need and a provide are rows of it (§15, §16) ════
// A capability type: what its entries are keyed by, what a need entry and a provide entry add,
// whether it is a leasable host resource, and — for a type whose keys name nodes — the kinds they
// may name (`ref`, S9). Every need entry is `optional` or not; only a leasable type's entry is
// `exclusive` or not (D-HW-8), so `exclusive` on any other type is not a field.
#CapabilityRow: {
	key!:     _
	need?:    _
	provide?: _
	lease:    *false | bool
	ref?:     [...string]
}
_capability: [#Word]: #CapabilityRow
_capability: {
	env:        {key: #EnvName, need: {}, provide: #EnvProvide}
	secret:     {key: #Name, need: {}}
	endpoint:   {key: #Name, need: #EndpointNeed, provide: #Endpoint}
	network:    {key: #Name, need: {}, provide: {}}
	harness:    {key: #Ref, need: {}, ref: ["harness"]}
	gpu:        {key: or(_gpuWord), need: {}, lease: true}
	device:     {key: or(_deviceWord), need: {}, lease: true}
	cpu:        {key: or(_cpuWord), need: #CountNeed, lease: true}
	memory:     {key: or(_memoryWord), need: #SizeNeed, lease: true}
	storage:    {key: or(_storageWord), need: #SizeNeed, lease: true}
	mount:      {key: #Name, need: #MountNeed, lease: true}
	nesting:    {key: or(_nestingWord), need: {}}
	isolation:  {key: or(_isolationWord), need: {}} // D-HW-7: a boundary is a need, never a runtime setting
	privilege:  {key: or(_privilegeWord), need: {}}
	driver_api: {key: or(_driverWord), need: {}}
	for r, _ in _role {(r): {key: #Word, need: {}, provide: {}}}
} @vocab(spec)
_capabilityWord: [for w, _ in _capability {w}]
_leasableWord: [for w, r in _capability if r.lease {w}]
#NeedFields: {optional: *false | bool}   // D-CAP-1
#LeaseFields: {exclusive: *false | bool} // D-HW-8
#Need: {for t, c in _capability if c.need != _|_ {
	(t)?: {[c.key]: {#NeedFields..., c.need..., if c.lease {#LeaseFields...}}}
}}
#Provide: {for t, c in _capability if c.provide != _|_ {(t)?: {[c.key]: c.provide}}}
#EnvProvide: {value!: string}
#EndpointNeed: {protocol!: or(_protocolWord)}
#CountNeed: {count!: #Count}
#SizeNeed: {size!: #Size}
#MountNeed: {host!: #AbsPath, path!: #AbsPath, writable: *false | bool}
// An endpoint the content serves: its port and transport, and the protocol, path and host name it
// is reached by. A deployment publishes endpoints by name (D-VAL-13).
#Endpoint: {
	port!:     #Port
	transport: *"tcp" | or(_transportWord)
	protocol?: or(_protocolWord)
	path?:     #AbsPath
	host?:     #Hostname
}

// ── steps (§4.2 rule 5, §20) ─────────────────────────────────────────────────
// D-VERB-3: a matcher is exactly one comparison (S4); `not` and `json` compose any matcher.
#MatcherAlt: {
	equals:   {equals!: #Scalar}
	contains: {contains!: #Text}
	matches:  {matches!: #Text}
	not:      {not!: #Matcher}
	json:     {json!: #JsonMatch}
}
#Matcher: or([for _, a in #MatcherAlt {a}])
#JsonMatch: {path!: #Text, match?: #Matcher} // no `match`: the path exists

#StepFields: {
	id?:     #Name
	run_as?: #Name
	phase:   *"any" | or(_phaseWord)
	timeout: *"60s" | #Duration
}
// The one repetition model of a check and a stage: until a deadline, or a bounded attempt count,
// each try `interval` apart (D-VERB-3, D-FLOW-2).
#Retry: {
	until?:   #Duration
	attempt?: #Count // D-FLOW-2
	interval: *"2s" | #Duration
}
// Where a check runs: the venue of the deployment it belongs to (the default), the host charly
// runs on, or another deployment's venue.
#CheckOnAlt: {
	host: {host!: {}}
	node: {node!: #Ref @ref(pod, vm, local, android, kubernetes)}
}
#CheckOn: or([for _, a in #CheckOnAlt {a}])
// A check step without its verb: the loader unifies it with the one verb arm the step names.
#CheckFields: {
	check!: #Text
	#StepFields...
	retry?:      #Retry
	on?:         #CheckOn
	exit_status: *0 | int
	stdout?:     #Matcher
	stderr?:     #Matcher
}
// D-IR-2: an install step declares its idempotence: `creates` or `unless`.
#GuardAlt: {
	creates: {creates!: #AbsPath}
	unless:  {unless!: #Text}
}
#Guard: or([for _, a in #GuardAlt {a}])
#RunFields: {command!: #Text, guard!: #Guard, #StepFields...}
// What a harness is shown besides the deployment's state: the venue accesses it may read.
#HarnessStepFields: {
	harness?:  #Ref @ref(harness)
	evidence?: [...or(_accessWord)] & list.UniqueItems()
	#StepFields...
}

// D-VERB-5, D-VERB-1: one step alternative per intent (`_intent`): `run` carries its `command` and
// `guard`; a check carries exactly one verb; the harness intents carry no verb. The loader selects
// the alternative by the intent key (D-LOAD-5).
#StepAlt: {
	run:           {run!: #Text, #RunFields...}
	check:         {#CheckFields..., #Verb...}
	harness_check: {harness_check!: #Text, #HarnessStepFields...}
	harness_run:   {harness_run!: #Text, #HarnessStepFields...}
}
#Step: or([for _, a in #StepAlt {a}])
// D-DEP-8: a deployment's steps run in its runtime phase.
#RuntimeStep: #Step & {phase: "runtime"}

// The verb inputs (S1), one definition per verb, named #<Verb>Check; an operation table is
// #<Verb>CheckAlt (D-VERB-4). A fact verb's input is the thing it identifies, whether that thing is
// `present` (exists and is active: installed, running, mounted, resolvable, up, listening), and a
// matcher per attribute it observes (D-ROLE-5).
#PresenceFields: {present: *true | bool}
#FileCheck:        {path!: #AbsPath, #PresenceFields..., content?: #Matcher, mode?: #FileMode, owner?: #Name}
#PackageCheck:     {name!: #Package, #PresenceFields..., version?: #Matcher} // an OS or a manager package
#ServiceCheck:     {name!: #Name, #PresenceFields..., enabled?: bool}
#ProcessCheck:     {name!: #Text, #PresenceFields...}
#PortCheck:        {port!: #Port, host?: #Hostname, #PresenceFields..., reachable?: bool}
#UserCheck:        {name!: #Name, #PresenceFields..., uid?: #Count, group?: #NameSet}
#GroupCheck:       {name!: #Name, #PresenceFields..., user?: #NameSet}
#MountCheck:       {path!: #AbsPath, #PresenceFields..., fstype?: #Matcher, writable?: bool}
#KernelParamCheck: {name!: #Text, #PresenceFields..., value?: #Matcher}
#DnsCheck:         {name!: #Hostname, #PresenceFields..., address?: #Matcher}
#InterfaceCheck:   {name!: #Name, #PresenceFields..., address?: #Matcher}
#HttpCheck: {
	url!:           #Url
	request_method: *"get" | or(_requestMethodWord)
	status?:        int
	body?:          #Matcher
	header?:        {[#HeaderName]: #Matcher}
}

// D-VERB-4: one operation key per multi-operation verb; a wait is the `retry` modifier.
#KubeCheckAlt: {
	node:     {node!: #KubeCheckNode}
	resource: {resource!: #KubeCheckResource}
	pod:      {pod!: #KubeCheckPod}
}
#KubeCheck: or([for _, a in #KubeCheckAlt {a}])
#KubeCheckNode:     {count?: #Count}
#KubeCheckResource: {kind!: #Text, name!: #Text, namespace?: #Label, ready: *true | bool}
#KubeCheckPod:      {namespace?: #Label}
#AppiumCheckAlt: {
	status:      {status!: {}}
	page_source: {page_source!: {}}
}
#AppiumCheck: or([for _, a in #AppiumCheckAlt {a}])
#CdpCheckAlt: {
	text:       {text!: #CdpCheckText}
	screenshot: {screenshot!: #CdpCheckScreenshot}
}
#CdpCheck: or([for _, a in #CdpCheckAlt {a}])
#CdpCheckText:       {url!: #Url}
#CdpCheckScreenshot: {url?: #Url}
#DbusCheckAlt: {
	name:     {name!: #DbusCheckName}
	property: {property!: #DbusCheckProperty}
}
#DbusCheck: or([for _, a in #DbusCheckAlt {a}])
#DbusCheckName:     {bus: *"session" | or(_busWord), name!: #Text}
#DbusCheckProperty: {bus: *"session" | or(_busWord), service!: #Text, path!: #AbsPath, interface!: #Text, name!: #Text}
#McpCheckAlt: {
	tool: {tool!: #McpCheckTool}
	call: {call!: #McpCheckCall}
}
#McpCheck: or([for _, a in #McpCheckAlt {a}])
#McpCheckTool: {endpoint!: #Name, name!: #Name}
#McpCheckCall: {endpoint!: #Name, tool!: #Name, config?: #Opaque} // S10: the tool's own input
// One observation of a screen, over whatever display transport the venue serves (VNC, SPICE, a
// compositor, an IP-KVM): its pixels or a window. A recording is `instrument`; a judgement about a
// screen is a `harness_check` whose `evidence` includes `display`.
#DisplayCheckAlt: {
	screenshot: {screenshot!: {}}
	window:     {window!: #DisplayCheckWindow}
}
#DisplayCheck: or([for _, a in #DisplayCheckAlt {a}])
#DisplayCheckWindow: {app_id?: #Text, title?: #Text}

// ════ data nodes: sources, operating systems, inits, builders (§10, §11) ════
#SourceFields: {description!: #Text, os!: #Ref @ref(os)} // D-SRC-2
// D-SRC-1: exactly one origin, remote origins pinned by sha256.
#SourceAlt: {
	oci:       {oci!: #ImageRef, #SourceFields...}
	disk:      {disk!: #Download, #SourceFields...}
	iso:       {iso!: #SourceIso, #SourceFields...}
	bootstrap: {bootstrap!: #SourceBootstrap, #SourceFields...}
}
#Source: or([for _, a in #SourceAlt {a}])
#SourceIso: {#Download..., config?: #Opaque} // S10: the installer's own answer file
#SourceBootstrap: {builder!: #Ref @ref(builder), package?: #PackageMap}

#Os: {
	description!:     #Text
	family!:          #Name
	version?:         #Text
	package_manager!: or(_packageManagerWord)
	init!:            #OsInit // D-CANDY-3: the os owns the init
	boot?:            #Boot
}
#OsInit: {for r, _ in _initRole {(r)!: #Ref @ref(init)}}
// The boot content of the disk form: the firmware it boots under, and the kernel a microVM
// hypervisor boots beside a root drive (§9.2).
#Boot: {firmware: *"uefi" | or(_firmwareWord), kernel?: #AbsPath, initrd?: #AbsPath, command_line?: #Text}
// Vocabulary data (D-KIND-2). One renderer per unit format serves every init.
#Init: {
	description!: #Text
	format!:      or(_serviceFormatWord)
	unit_dir?:    #AbsPath
	entrypoint?:  [...#Text]
}
// One builder implementation serves every row: a root-filesystem bootstrap (its command fills
// /rootfs), or a build-time manager's packages. A manager row always runs in its box; a bootstrap
// runs in its box when it names one, and on the build host otherwise. Each payload names its box.
#BuilderFields: {description!: #Text}
#BuilderAlt: { // D-PLUG-2: a builder row does exactly one thing
	bootstrap: {bootstrap!: #BuilderBootstrap, #BuilderFields...}
	manager:   {manager!: #BuilderManager, #BuilderFields...}
}
#Builder: or([for _, a in #BuilderAlt {a}])
#BuilderBootstrap: {command!: #Text, box?: #Ref @ref(box)}
#BuilderManager:   {name!: #BuildManager, box!: #Ref @ref(box)}

// ════ workflow, harness and documentation kinds (§10) ════
#Harness: {
	description!: #Text
	argv!:        [...#Text]
	model?:       #Text
	need?:        #Need
}
// The one workflow kind (D-FLOW-1): a named set of stages run in the host venue. A named host
// routine is a pipeline of one stage; a gate over beds and an agent loop over a run are pipelines.
#Pipeline: {
	description!: #Text
	parameter?:   {[#Name]: #Parameter} // required exactly when it has no default
	input_file?:  #TextSet
	output_file?: #TextSet
	schedule?:    #Schedule
	stage!:       {[#Name]: #Stage}
}
#Schedule: {cron!: #Cron}
#StageFields: {
	after?:      #NameSet
	when?:       {[#Name]: #Matcher} // the stage runs when every named parameter matches
	timeout?:    #Duration
	retry?:      #Retry
	on_error:    *"fail" | or(_onErrorWord)
	lane?:       #Lane
	concurrency: *1 | #Count // how many lanes or beds run at once
}
#Lane: {over!: #Name} // run once per item of the list a parameter holds
#StageAlt: { // D-FLOW-1: a stage does exactly one thing
	step:     {step!: [...#Step], #StageFields...}
	pipeline: {pipeline!: #Ref @ref(pipeline), #StageFields...}
	bed:      {bed!: #RefSet @ref(pod, vm, local, android, kubernetes), #StageFields...}
	ask:      {ask!: #StageAsk, #StageFields...}
}
#Stage: or([for _, a in #StageAlt {a}])
#StageAsk: {prompt!: #Text}

// A skill's and a hook's body is derived from its name (P3): `.agents/skills/<name>/SKILL.md`,
// `.agents/agents/<name>.md` for an agent definition, `.agents/hooks/<name>.<language>`.
#Skill: {
	description!: #Text
	family!:      #Name
	category:     *"development" | or(_skillCategoryWord)
	trigger?:     #TextSet
	agent?:       #SkillAgent
}
#SkillAgent: {model: *"inherit" | #Text, tool?: #TextSet}
#Hook: {
	description!: #Text
	event!:       or(_hookEventWord)
	matcher?:     #Text
	language:     *"sh" | or(_hookLanguageWord)
}
#Marketplace: {
	description!: #Text
	family!:      {[#Name]: #MarketplaceFamily}
}
#MarketplaceFamily: {
	category:     *"development" | or(_skillCategoryWord)
	description?: #Text
	keyword?:     #TextSet
	profile?:     [...or(_profileWord)] & list.UniqueItems()
	server?:      {[#Name]: #Server} // the MCP servers the family ships to a harness
}
#ServerAlt: {
	url:  {url!: #Url}
	argv: {argv!: [...#Text]}
}
#Server: or([for _, a in #ServerAlt {a}])
#Doc: {
	description!:   #Text
	release_repo?:  #RepoSet
	extra_repo?:    #RepoSet
	projection:     *_docProjectionWord | [...or(_docProjectionWord)] & list.UniqueItems()
	hand_authored?: #TextSet
	landing:        *"README.md" | #Text
}

// ════ M3 — deployments (§12) ════
#DeploymentFields: { // D-DRV-2: no driver field — the driver is user configuration
	description!: #Text
	step?:        [...#RuntimeStep]
	disposable:   *false | bool
	preemptible:  *false | bool
	update_gate:  *"full" | or(_updateGateWord)
	concurrency:  *1 | #Count // how many alongside nodes realize at once (D-NEST-5)
	instrument?:  {[#Name]: #Instrument} // recordings attached to the run
	ephemeral?:   #Ephemeral
	need?:        #Need
	with?:        #With // supplies the `parameter:` choices of the candy this deployment names
}
#Instrument: {record!: or(_recorderWord)}
#Ephemeral: {ttl!: #Duration}
// What a deployment kind takes inside its body: `require:` candies (D-DEP-2).
#ContentFields: {require?: #RefSet @ref(candy)} // D-DEP-2

// The fields a node of each kind writes to create it where it is written (D-DEP-6). A pod and a vm
// are created from a box or a source and publish the endpoints it provides (D-VAL-13).
#MachineFields: { // D-DEP-1, D-DEP-7: pod and vm share one field set; publishing belongs to them only
	from!:    #Ref @ref(box, source)
	publish?: {[#Name]: #Port} // the host port of each provided endpoint it publishes
}
#KubernetesFields: {node?: {[#Name]: #ClusterNode}}
#ClusterNode: {control_plane: *false | bool}
#AndroidFields: {device!: #Text, api_level!: #Count}
#LocalFields: {}
#AgentFields: {
	from!:   #Ref @ref(box, source) // the agent is deployed from a box, like any machine
	config?: #Opaque                // S10: the agent runtime's own configuration
}

// M3, G6: one row per deployment kind (D-DEP-1, D-NEST-2). `create` is what creating it takes;
// `connect` the venues it may be reached through instead (D-DEP-6); `top` how a top-level or
// alongside node of it is placed — created, connected or either (D-NEST-6); an inner node is always
// created where it is written. `admit` is what its body holds inside it, `beside` what may stand
// beside it, and `content` whether it takes `require:` candies.
_placement: {create: {}, connect: {}} @vocab(core)
_placementWord: [for w, _ in _placement {w}]
#DeploymentKindRow: {
	create!:  _
	connect:  *[] | [...or(_venueWord)]
	top:      [...or(_placementWord)] & list.UniqueItems()
	admit:    *[] | [...string]
	beside:   *[] | [...string]
	content:  *false | bool
}
_deploymentKind: [#Word]: #DeploymentKindRow
_deploymentKind: {
	pod:        {create: #MachineFields, top: ["create"], admit: ["pod", "vm", "local", "kubernetes", "android", "agent"], beside: ["pod", "vm", "local"]}
	vm:         {create: #MachineFields, top: ["create"], admit: ["pod", "vm", "local", "kubernetes", "android", "agent"], beside: ["pod", "vm", "local"]}
	kubernetes: {create: #KubernetesFields, connect: ["kube"], top: ["create", "connect"], admit: ["pod", "vm", "agent"]}
	local:      {create: #LocalFields, connect: ["shell", "ssh", "kvm"], top: ["connect"], admit: ["candy", "kubernetes", "android"], content: true}
	android:    {create: #AndroidFields, connect: ["adb"], top: ["create", "connect"], admit: ["candy"], content: true}
	agent:      {create: #AgentFields, top: []}
} @vocab(registry)
// The deployment kinds (§2, §12.1).
_deploymentKindWord: [for w, _ in _deploymentKind {w}]

// The body every placement of a kind shares, and its two placements: created where written (the
// default entry, with the kind's fields) or connected (`connect:`, without them).
_#Body: {for k, r in _deploymentKind {(k): {
	#DeploymentFields...
	if r.content {#ContentFields...}
	[#InnerNodeName]: or([for a in r.admit {_#InnerNode[a]}]) // D-NEST-2
}}}
_#Placed: {for k, r in _deploymentKind {(k): {
	create: {_#Body[k]..., r.create...}
	if len(r.connect) > 0 {connect: {_#Body[k]..., connect!: or([for v in r.connect {#VenueAlt[v]}])}} // D-DEP-6
}}}
// A node inside a body is created there (D-NEST-6); a top-level or alongside node is
// placed as its row's `top` says, and a node that admits nodes beside it holds them.
_#InnerNode: {
	candy: #InnerCandy
	for k, _ in _deploymentKind {(k): {(k)!: _#Placed[k].create}}
}
_#TopBody: {for k, r in _deploymentKind {(k): or([for p in r.top {_#Placed[k][p]}])}} // D-NEST-6
_#BesideNode: {for k, _ in _deploymentKind {(k): {(k)!: _#TopBody[k]}}}
_#TopNode: {for k, r in _deploymentKind {(k): {
	(k)!: _#TopBody[k]
	if len(r.beside) > 0 {[#InnerNodeName]: or([for b in r.beside {_#BesideNode[b]}])}
}}}

// ════════════════════════════════════════════════════════════════ Part 2 — user configuration (§17)
// What the user sets, never an authored document (D-LAW-6).
#UserConfig: {
	driver:          #Driver
	resource?:       {[#Name]: #Resource} // the host resources a lease may take (D-HW-4)
	image_registry?: #Hostname | #Address
	local_install:   *false | bool             // the switch of D-STORE-9
	plugin?:         {[#Name]: #RepositoryRef} // the project-less list of D-PLUG-5
	section?:        {[#Name]: #Opaque}        // S10: each plugin's own section, under its own schema
}
// D-DRV-1: one driver per subsystem, a word of that subsystem's rows of the driver table.
#Driver: {for s, d in _subsystemDefaultDriver {(s): *d[0] | or(_subsystemDriver[s])}}
// A leasable host resource: written as the need it satisfies, with that need's attributes giving
// the resource's capacity (a gpu's vendor, a memory's size).
#ResourceAlt: {for t, c in _capability if c.lease {(t): {(t)!: c.key, c.need...}}}
#Resource: or([for _, a in #ResourceAlt {a}])

// ════════════════════════════════════════════════════════════════ Part 3 — protocol (§8)
// Moves to spec/protocol when implemented. A word payload (a kind's body, a verb's input, a
// subcommand's arguments, an api's messages, a kind's state and grants) is #Opaque here because the
// owning plugin's CUE module defines it (S10); it is validated against that definition on receipt.

_role: {kind: {}, verb: {}, subcommand: {}, type: {}, api: {}} @vocab(core)
_roleWord: [for w, _ in _role {w}]
// D-ROLE-6: a registry key is `<role>:<word>[:<parent>]`; a key word is its part after the role.
#KeyWord: =~"^[a-z][a-z0-9_]*(:[a-z][a-z0-9_]*)?$"
#Key:     =~"^(\(strings.Join(_roleWord, "|"))):[a-z][a-z0-9_]*(:[a-z][a-z0-9_]*)?$"
#ApiKey: #Key & =~"^api:"
#CallId: =~"^[0-9a-f]{32}$"

// ── the audit record (§17.9): one append-only record per mutation and per authority decision ──
_auditEvent: {mutate: {}, authorize: {}, admit: {}, activate: {}, teardown: {}} @vocab(core)
_auditEventWord: [for w, _ in _auditEvent {w}]
_auditOutcome: {ok: {}, refused: {}, failed: {}} @vocab(core)
_auditOutcomeWord: [for w, _ in _auditOutcome {w}]
_detailCode: {reason: {}, path: {}, field: {}, ref: {}, count: {}, duration: {}} @vocab(core)
_detailCodeWord: [for w, _ in _detailCode {w}]
#AuditEvent: {
	at!:        #Timestamp
	event!:     or(_auditEventWord)
	outcome!:   or(_auditOutcomeWord)
	identity!:  #Ref       // who acted (D-AUDIT-2)
	target?:    #Ref       // what was acted on
	action?:    #Word      // a charly verb or mutation word (D-AUDIT-5)
	namespace?: #Namespace // where it held
	revision?:  #Digest
	detail?:    [...#AuditDetail] & list.MaxItems(32)
}
#AuditDetail: {
	code!:  or(_detailCodeWord)
	text!:  #Text
	value?: #Redacted
}
// A record says a value was there without holding it (D-AUDIT-3).
#Redacted: {redacted!: true}

// What a kind observes. A revision is a digest (P3): admitted (validated, no effect), then active.
#StatusOutput: {
	state!:    or(_stateWord)
	revision?: #Digest
	admitted?: #Digest
	message?:  #Text
}

// ── messages shared by several methods ────────────────────────────────────────
#Resolved: {kind!: #Word, digest!: #Digest, value!: #Opaque} // S10
#NodeInput: {
	identity!:  #Ref
	body!:      #Opaque // S10
	reference!: {[#Ref]: #Resolved} // the linked references of the node (§4.1 stage 4)
}
#ArtifactRef: {form!: or(_formWord), digest!: #Digest}
#Done: {}

// The IR (§9.4): one action, tagged by its kind; each action is the content entry it installs.
#ActionAlt: {
	package:      {package!: #ActionPackage, #ActionFields...}
	package_repo: {package_repo!: #ActionPackageRepo, #ActionFields...}
	file:         {file!: #ActionFile, #ActionFields...}
	service:      {service!: #ActionService, #ActionFields...}
	user:         {user!: #ActionUser, #ActionFields...}
	env:          {env!: #ActionEnv, #ActionFields...}
	command:      {command!: #ActionCommand, #ActionFields...}
}
#ActionFields: {scope: *"system" | or(_scopeWord)}
#Action: or([for _, a in #ActionAlt {a}])
#ActionPackage:     {name!: #Package, #ManagerPackage...}
#ActionPackageRepo: {name!: #Name, #PackageRepo...}
#ActionFile:        {path!: #AbsPath, #File...}
#ActionService:     {name!: #Name, #Service...}
#ActionUser:        {name!: #Name, #User...}
#ActionEnv:         {name!: #EnvName, value!: #InitNeutral}
#ActionCommand:     {command!: #Text, guard!: #Guard, run_as?: #Name}

// ── M6 venues: one table; `connect:` writes an arm, a kind's `venue` returns it resolved ──
// D-VENUE-2: a resolved venue declares what it serves (from its driver row); a lacking access is
// refused, never emulated. `via` is the venue it is reached through.
#SecretFields: {secret?: #Name}
#VenueAlt: {
	container: {container!: #VenueContainer}
	ssh:       {ssh!: #VenueSsh}
	shell:     {shell!: {}}
	kvm:       {kvm!: #VenueKvm}
	adb:       {adb!: #VenueAdb}
	kube:      {kube!: #VenueKube}
}
_venueWord: [for w, _ in #VenueAlt {w}]
#VenueContainer: {driver!: or(_subsystemDriver.pod), name!: #Text, namespace: *"default" | #Label, isolation?: or(_isolationWord)}
#VenueSsh:       {host!: #Hostname, port: *22 | #Port, user?: #Name, #SecretFields...}
#VenueKvm:       {address!: #Address, #SecretFields...}
#VenueAdb:       {address!: #Address}
#VenueKube:      {context!: #Text, namespace: *"default" | #Label}
#VenueFields: {via?: #VenueOutput, access!: [...or(_accessWord)] & list.UniqueItems()}
// The resolved venues: every venue alternative with what it serves.
#VenueOutputAlt: {for k, a in #VenueAlt {(k): {a..., #VenueFields...}}}
#VenueOutput: or([for _, a in #VenueOutputAlt {a}])

// ── the method table: every method, the role that serves it, its input and output ──
// D-ROLE-1, D-ROLE-2. A `stream` method also carries a stream (D-PROTO-10).
#CallRow: {input!: _, output!: _, stream: *false | bool}
#MethodRow: {#CallRow..., role!: or(_roleWord)}
_method: [#Word]: #MethodRow
_method: {
	validate:   {role: "kind", input: #NodeInput, output: #ValidateOutput}
	resolve:    {role: "kind", input: #NodeInput, output: #ResolveOutput}
	migrate:    {role: "kind", input: #MigrateInput, output: #MigrateOutput}
	build:      {role: "kind", input: #BuildInput, output: #BuildOutput}
	realize:    {role: "kind", input: #RealizeInput, output: #RealizeOutput}
	transition: {role: "kind", input: #TransitionInput, output: #Done}
	status:     {role: "kind", input: #NodeInput, output: #StatusOutput}
	admit:      {role: "kind", input: #AdmitInput, output: #AdmitOutput}
	activate:   {role: "kind", input: #ActivateInput, output: #Done}
	log:        {role: "kind", input: #LogInput, output: #Done, stream: true}
	venue:      {role: "kind", input: #NodeInput, output: #VenueOutput}
	capture:    {role: "kind", input: #CaptureInput, output: #CaptureOutput}
	restore:    {role: "kind", input: #RestoreInput, output: #Done}
	grant:      {role: "kind", input: #GrantInput, output: #GrantOutput}
	check:      {role: "verb", input: #CheckInput, output: #CheckOutput}
	run:        {role: "subcommand", input: #RunInput, output: #Done, stream: true}
	bind:       {role: "type", input: #BindInput, output: #BindOutput}
	unbind:     {role: "type", input: #UnbindInput, output: #Done}
	call:       {role: "api", input: #CallInput, output: #CallOutput}
} @vocab(core)
_methodWord: [for w, _ in _method {w}]
_roleMethod: {for k, _ in _role {(k): [for w, r in _method if r.role == k {w}]}}
#Method: or(_methodWord)

#ValidateOutput: {diagnostic: [...#Diagnostic]}
#ResolveOutput:  {value!: #Opaque, digest!: #Digest} // S10
#MigrateInput:   {identity!: #Ref, body!: #Opaque} // S10
#MigrateOutput:  {body!: #Opaque, change: [...#Text]} // S10
#BuildInput:     {identity!: #Ref, start!: #ArtifactRef, ir!: [...#Action], form!: or(_formWord)}
#BuildOutput:    {artifact!: #ArtifactRef}
#RealizeInput:   {#NodeInput..., artifact?: #ArtifactRef, ir?: [...#Action], parent?: #VenueOutput}
#RealizeOutput:  {venue!: #VenueOutput}
// M5: one method moves a deployment to a target state — running, stopped, or absent (destroyed).
#TransitionInput: {#NodeInput..., to!: or(_targetStateWord)}
// validate without effect, then make the admitted revision active
#AdmitInput:    {#NodeInput..., ir?: [...#Action]}
#AdmitOutput:   {revision!: #Digest, diagnostic: [...#Diagnostic]}
#ActivateInput: {identity!: #Ref, revision!: #Digest}
#LogInput:      {#NodeInput..., follow: *false | bool}
// M5: a capture takes the deployment's filesystem, or also its processes; restore returns a
// deployment to a capture it took.
#CaptureInput:  {#NodeInput..., capture: *"filesystem" | or(_captureWord)}
#CaptureOutput: {artifact!: #ArtifactRef, process?: #Digest}
#RestoreInput:  {#NodeInput..., artifact!: #ArtifactRef, process?: #Digest}
#GrantInput:    {#NodeInput..., need!: #Need}
#GrantOutput:   {item: [...#GrantItem]}
#CheckInput:    {config!: #Opaque, venue!: #VenueOutput, run_as?: #Name} // S10: the verb's input
#RunInput:      {config!: #Opaque} // S10: the subcommand's arguments
#BindInput:     {need!: #BindNeed, provided_by!: #Ref, deployment!: #Ref}
#BindNeed:      {type!: #Word, name!: #Text, config!: #Opaque} // S10
#BindOutput:    {binding!: #Opaque} // S10
#UnbindInput:   {binding!: #Opaque} // S10
#CallInput:     {request!: #Opaque} // S10
#CallOutput:    {reply!: #Opaque} // S10
// One granted item. A grant that holds a host resource names it and the lease mode its mechanism
// imposes (its driver row's `grant`); core leases it at the stricter of that mode and the need's
// request (D-HW-8).
#GrantItem: {
	need!:  #Text
	grant!: #Opaque // S10: the kind's own grant record
	lease?: #Lease
}
#Lease: {resource!: #Name, mode!: or(_leaseModeWord)}

// D-ROLE-5: one observation; core applies the step's modifiers and step-level matchers.
#CheckOutput: {exit_status?: int, stdout?: string, stderr?: string, observed?: #Opaque} // S10

// D-PROTO-1: the plugin service's control methods beside the role methods.
_pluginMethod: [#Word]: #CallRow
_pluginMethod: {
	describe: {input: #Done, output: #DescribeOutput}
	shutdown: {input: #Done, output: #Done}
} @vocab(core)
_pluginMethodWord: [for w, _ in _pluginMethod {w}]
#PluginRequestAlt: {for m, r in _pluginMethod {(m): {(m)!: r.input}}}
#PluginRequest: or([for _, a in #PluginRequestAlt {a}])

// D-PROTO-5: the methods a plugin reports per key are methods of that key's role.
#DescribeOutput: {
	module!:          #Module
	release?:         #Release // absent for a `path:` plugin
	source_digest!:   #Digest
	schema_digest!:   #Digest
	manifest_digest!: #Digest
	// per role, per word of that role: the methods served, each a method of that role
	method!: {for w, _ in _role {(w)?: {[#KeyWord]: [...or(_roleMethod[w])] & list.UniqueItems()}}}
}

// D-PROTO-8: every call carries its deadline.
#CallHeader: {
	call_id!:  #CallId
	key!:      #Key
	project!:  #Digest
	deadline!: #Duration
}
#RequestFields: {header!: #CallHeader}
#CallFields: {call_id!: #CallId}
// A request: the call header plus one key — the method — holding that method's input (S4).
#RequestAlt: {for m, r in _method {(m): {(m)!: r.input, #RequestFields...}}}
#Request: or([for _, a in #RequestAlt {a}])

// D-PROTO-7: a reply holds exactly one of the method's output or an error.
#ReplyAlt: {
	for m, r in _method {(m): {(m)!: r.output, #CallFields...}}
	error: {error!: #Error, #CallFields...}
}
#Reply: or([for _, a in #ReplyAlt {a}])

_errorCode: {invalid: {}, not_found: {}, unmet: {}, conflict: {}, unavailable: {}, denied: {}, cancelled: {}, deadline: {}, internal: {}} @vocab(core)
_errorCodeWord: [for w, _ in _errorCode {w}]
#Error: {
	code!:       or(_errorCodeWord)
	message!:    #Text
	identity?:   #Ref
	position?:   #Position
	diagnostic?: [...#Diagnostic]
	request?:    #CallId
	detail?:     [...#AuditDetail] & list.MaxItems(32)
}
#Position: {file!: #Text, line!: #Line}
#Diagnostic: {
	severity!: or(_severityWord)
	message!:  #Text
	identity?: #Ref
	position?: #Position
	rule?:     #RuleId
}

// D-PROTO-10: the stream of a `stream` method (terminal I/O for `run`, output for `log` and
// `venue_exec`), tagged by kind.
_stream: {stdin: {}, stdout: {}, stderr: {}} @vocab(core)
_streamWord: [for w, _ in _stream {w}]
#StreamAlt: {
	chunk:  {chunk!: #StreamChunk, #CallFields...}
	resize: {resize!: #StreamResize, #CallFields...}
	exit:   {exit!: #StreamExit, #CallFields...}
}
#Stream: or([for _, a in #StreamAlt {a}])
#StreamChunk:  {stream!: or(_streamWord), data!: #Base64}
#StreamResize: {height!: #Count, width!: #Count}
#StreamExit:   {exit_status!: int}

// ── the host service (§8.6) ────────────────────────────────────────────────────
// D-PROTO-13: the closed set of host methods, with their inputs and outputs. M8: one `get` and one
// `put` reach every store a plugin may use. A store is a row: the key that names an entry, the value
// it holds, whether its key is the digest of its value (`addressed`), and whether a plugin writes it.
#StoreRow: {key!: _, value!: _, addressed: *false | bool, put: *true | bool}
_store: [#Word]: #StoreRow
_store: {
	content: {key: #Digest, value: #Base64, addressed: true} // the content-addressed store (§8.6)
	state:   {key: #StateKey, value: #Opaque}                // S10: the record the calling kind's module defines (D-DEP-5)
	secret:  {key: #Name, value: #Base64}
	config:  {key: {}, value: #Opaque, put: false}           // S10: the caller's own section, under its own schema (D-STORE-2)
} @vocab(core)
_storeWord: [for w, _ in _store {w}]
#StoreKeyAlt: {for s, r in _store {(s): {(s)!: r.key}}}
#StoreKey: or([for _, a in #StoreKeyAlt {a}])
#StoreValueAlt: {for s, r in _store {(s): {(s)!: r.value}}}
#StoreValue: or([for _, a in #StoreValueAlt {a}])
// A put names its store by the value it writes, and its key unless the store is addressed; every
// put returns the digest of its value.
#PutInputAlt: {for s, r in _store if r.put {(s): {(s)!: r.value, if !r.addressed {key!: r.key}}}} // D-PROTO-13
#PutInput: or([for _, a in #PutInputAlt {a}])
#StateKey: {identity!: #Ref, name!: #Name}
_hostMethod: [#Word]: #CallRow
_hostMethod: {
	venue_exec:   {input: #VenueExecInput, output: #VenueExecOutput, stream: true}
	get:          {input: #StoreKey, output: #StoreValue}
	put:          {input: #PutInput, output: #PutOutput}
	project:      {input: #ProjectInput, output: #Resolved}
	call:         {input: #HostCallInput, output: #CallOutput}
	report:       {input: #Event, output: #Done}
	state_commit: {input: #StateCommitInput, output: #Done} // the transaction `put` cannot be
	audit_append: {input: #AuditAppendInput, output: #Done}
} @vocab(core)
_hostMethodWord: [for w, _ in _hostMethod {w}]
#HostMethod: or(_hostMethodWord)
#VenueExecInput:  {identity!: #Ref, command!: [...#Text], run_as?: #Name}
#VenueExecOutput: {exit_status!: int}
#PutOutput:        {digest!: #Digest}
#ProjectInput:     {identity!: #Ref}
#HostCallInput:    {key!: #ApiKey, request!: #Opaque} // S10
#StateCommitInput: {identity!: #Ref, revision!: #Digest, record!: [...#StateRecord]}
#StateRecord:      {name!: #Name, data!: #Base64}
#AuditAppendInput: {event!: #AuditEvent}

// D-PROTO-12: every host request names the core call it serves.
#HostRequestAlt: {for m, r in _hostMethod {(m): {(m)!: r.input, #CallFields...}}}
#HostRequest: or([for _, a in #HostRequestAlt {a}])

#Event: {
	call_id!:  #CallId
	identity?: #Ref
	activity!: #Word
	message!:  #Text
	progress?: #Fraction
}
