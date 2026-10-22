// DESIGN.cue — the schema of DESIGN.md (Appendix A), CUE v0.17.1. The single copy.
//
//   Part 1  authoring schema (DESIGN Part III)   validate: cue vet -d '#Document' DESIGN.cue charly.yml
//   Part 2  user configuration (DESIGN §17)      validate: cue vet -d '#UserConfig' DESIGN.cue config.yml
//   Part 3  core↔plugin protocol (DESIGN §8)     validate: cue vet -d '#Request' DESIGN.cue request.yaml
//
// Written with the schema patterns of DESIGN §3.1 and nothing else:
//   S1 closed definition      #X: {a!: T, b?: U}   (a definition is closed, recursively; close() is never written)
//   S2 named scalar           #Name: =~"…"
//   S3 literal enum           *"system" | "user" inline, or or(_xWord) from a word list that tools read
//   S4 key-tagged union       #XAlt: {a: {a!: …, F}, b: {b!: …, F}}   #X: or([for _, x in #XAlt {x}])
//                             the tag table's keys are the tags; one entry may be the default,
//                             selected when no tag is written, and it admits none of the tags
//   S5 named collection       {[#Name]: #T} for what a node defines; a list for what it refers to
//   S6 shared fragment        #F: {…} embedded in S1/S4 definitions
//   S7 conditional field      if from != _|_ {#BoxFields}   (declared only under the condition)
//   S8 reserved-name pattern  [#InnerNodeName]: T
//   S9 reference field        from?: #Ref @ref(source, box)   (the kinds a reference may name);
//                             a type-table row whose keys name nodes states the kinds as `ref: [...]`
// A field a definition does not declare is rejected by closedness with "field not allowed".
//
// A `// D-…` comment marks the line that enforces that requirement; every tag has a negative case
// in design/negative/. Rules a single document cannot express are indexed in DESIGN §5.4.
// In charly the tag tables below are composed from the declared plugins (§3.3).
//
// Every concept is defined once, generically; an instance is a row or a word of its table, never a
// definition of its own (D-LAW-8). The eight mechanisms of DESIGN §1.1 and their tables:
//   M1 content → IR      #Content, #ActionAlt            M5 lifecycle and state   #MethodIO (capture, restore)
//   M2 artifact          #ArtifactRef, #MethodIO.build   M6 venue                 #VenueOutputAlt, _venueOperationWord
//   M3 kind × driver     #KindNode, _driverWord          M7 observation           #FactVerb, #ProtocolVerb
//   M4 need → grant      #NeedType, #ProvideType          M8 store                 #HostMethodIO store_get, store_put
// `#Opaque` marks only an S10 payload — a field whose schema another system or another plugin's
// module owns. Every use carries `// S10` (design-consistency.sh check 6).
package design

import (
	"list"
	"strings"
)

// ════════════════════════════════════════════════════════════════ Part 1 — authoring

// ── S2 named scalars ─────────────────────────────────────────────────────────
#Name:        =~"^[a-z][a-z0-9]*(-[a-z0-9]+)*$" // D-NEST-4: never `--`
#Ref:         =~"^[a-z][a-z0-9]*(-[a-z0-9]+)*(\\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$"
#TypeName:    =~"^[a-z][a-z0-9_]*$" // D-NAME-2: capability types use underscores
#Text:        string & !=""
#Count:       int & >0
#Line:        int & >=1
#Fraction:    number & >=0 & <=1
#Port:        int & >0 & <65536
#Address:     =~"^[^ :]+:[0-9]+$"
#Hostname:    =~"^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]+)?$"
#Url:         =~"^[a-z][a-z0-9+.-]*://[^ ]+$"
#Repo:        =~"^[a-z0-9.-]+/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
#Module:      =~"^[a-z0-9.-]+(/[A-Za-z0-9_.-]+)+$"
#Release:     =~"^v[0-9]{4}\\.[0-9]{3}\\.[0-9]{4}$"
#Digest:      =~"^sha256:[0-9a-f]{64}$"
#Sha256:      =~"^[0-9a-f]{64}$"
#ImageRef:    =~"^[a-z0-9.-]+(:[0-9]+)?/[a-z0-9._/-]+(:[A-Za-z0-9._-]+)?(@sha256:[0-9a-f]{64})?$"
#ImageTag:    =~"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$"
#RuleId:      =~"^D-[A-Z]+-[0-9]+$"
#Size:        =~"^[0-9]+(Ki|Mi|Gi|Ti)$"
#Duration:    =~"^[0-9]+(ms|s|m|h)$"
#Timestamp:   =~"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$"
#Cron:        =~"^(\\S+\\s+){4}\\S+$"
#EnvName:     =~"^[A-Za-z_][A-Za-z0-9_]*$"
#Platform:    =~"^linux/(amd64|arm64)$"
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
#RefSet:      [...#Ref] & list.UniqueItems()
#NameSet:     [...#Name] & list.UniqueItems()
#TextSet:     [...#Text] & list.UniqueItems()
#RepoSet:     [...#Repo] & list.UniqueItems()
#PlatformSet: [...#Platform] & list.UniqueItems()

// The one open value: a field whose schema another system or plugin owns (S10, D-PAT-1).
#Opaque: {...}

// ── word lists (S3) ─────────────────────────────────────────────────────────
// Written out for the first-party plugins; in charly they are composed from the registry.
_directiveWord: ["repo", "plugin", "import", "discover"]
// Every manager word and the phase whose work it is (D-IR-7); the manager word lists derive from it.
_managerPhase: {
	npm:     "build"
	cargo:   "build"
	pip:     "build"
	aur:     "build"
	flatpak: "build"
	helm:    "apply"
	android: "apply"
}
_managerWord:      [for w, _ in _managerPhase {w}]
_buildManagerWord: [for w, p in _managerPhase if p == "build" {w}]
#BuildManager:     or(_buildManagerWord)
_packageManagerWord: ["dnf", "apt", "pacman", "apk", "zypper"]
_serviceFormatWord:  ["systemd", "supervisord"]
_firmwareWord:       ["uefi", "bios", "uefi-secure"]
_phaseWord:          ["any", "build", "ready", "runtime"]
_scopeWord:          ["system", "user"]
_formWord:           ["image", "disk"]
_captureScopeWord:   ["filesystem", "process"]
_leaseModeWord:      ["shared", "exclusive"]
_transportWord:      ["tcp", "udp"]
_protocolWord:       ["http", "mcp", "grpc"]
_recorderWord:       ["display", "console", "log", "audio"]
_busWord:            ["session", "system"]
_packageFormatWord:  ["rpm", "deb", "pac", "apk"]
_skillCategoryWord:  ["development", "commands", "kind", "images"]
_profileWord:        ["developer", "user", "container"]
_hookLanguageWord:   ["sh", "py"]
_docProjectionWord:  ["recipe", "cli", "registry", "candy", "box", "plugin", "landing"]

// M3: the driver table. Each driven deployment kind lists its drivers and its default; the user
// configuration chooses one per kind (D-DRV-1). A driver's own command-line tool is data of its row.
_driverWord: {
	pod:        ["podman", "docker", "containerd"]
	vm:         ["libvirt", "qemu", "krun", "firecracker"]
	kubernetes: ["kind", "k3s"]
}
_driverDefault: {pod: "podman", vm: "libvirt", kubernetes: "kind"}
_anyDriverWord: list.FlattenN([for _, w in _driverWord {w}], 1)

// M4: the host words a need may name (§16).
_gpuVendorWord: ["nvidia", "amd", "intel"]
_gpuWord:       list.Concat([_gpuVendorWord, ["any"]])
_deviceWord:    ["kvm", "render", "fuse", "tun", "vhost-net", "vsock", "hwrng", "kfd"]
_nestingWord:   ["container", "vm", "userns"]
_isolationWord: ["microvm"]
_privilegeWord: ["rootful"]
_memoryWord:    ["shm"]

// ── tag tables (S4) ─────────────────────────────────────────────────────────
// Every kind word and the node definition it selects (§10).
#KindNode: {
	source:      {source!: #Source}
	os:          {os!: #Os}
	init:        {init!: #Init}
	builder:     {builder!: #Builder}
	pod:         #PodNode
	vm:          #VmNode
	kubernetes:  #KubernetesNode
	local:       #TopLocalNode
	android:     #AndroidNode
	harness:     {harness!: #Harness}
	pipeline:    {pipeline!: #Pipeline}
	skill:       {skill!: #Skill}
	hook:        {hook!: #Hook}
	marketplace: {marketplace!: #Marketplace}
	doc:         {doc!: #Doc}
}
// A top-level node (§4.2 rule 3): the candy is the default entry, selected when no kind key is
// written; it admits no kind key. Registry key `kind:candy` is reserved for it (§8.2).
#NodeAlt: {
	candy: #Candy
	#KindNode
}
#Node: or([for _, n in #NodeAlt {n}])

// M7 — every check verb and its input (§20), in exactly two tables. A fact verb observes the state
// of the system its venue reaches; a protocol verb speaks one generic protocol to an endpoint. An
// application's own checks are `http` or `command`, or a namespaced verb of its plugin (D-PLUG-7).
#FactVerb: {
	command:        #Text
	file:           #FileCheck
	package:        #PackageCheck
	service:        #ServiceCheck
	process:        #ProcessCheck
	port:           #PortCheck
	user:           #UserCheck
	group:          #GroupCheck
	mount:          #MountCheck
	"kernel-param": #KernelParamCheck
	dns:            #DnsCheck
	interface:      #InterfaceCheck
}
#ProtocolVerb: {
	http:    #HttpCheck
	kube:    #KubeCheck
	appium:  #AppiumCheck
	cdp:     #CdpCheck
	dbus:    #DbusCheck
	mcp:     #McpCheck
	display: #DisplayCheck
}
#Verb: {#FactVerb, #ProtocolVerb} // D-VERB-6: a verb is a fact or a protocol, nothing else

// Field names of the bodies that can hold named nodes. Optional fields cannot be enumerated
// inside CUE, so these lists are written out; design-consistency.sh checks them against the
// definitions.
_candyField:  ["description", "from", "step", "require", "need", "provide", "package", "os_override", "file", "package_repo", "env", "path_append", "service", "user", "volume", "export", "module", "packaging", "platform", "build_with", "entrypoint", "tag", "input", "with", "capture_scope"]
_deployField: ["description", "from", "require", "need", "step", "publish", "cpu", "ram", "disk_size", "network", "disposable", "preemptible", "update_gate", "parallel", "instrument", "ephemeral", "create", "connect", "with"]

_kindWord: [for k, _ in #KindNode {k}]
_verbWord: [for k, _ in #Verb {k}]
_alt: {
	kind:      strings.Join(_kindWord, "|")
	directive: strings.Join(_directiveWord, "|")
	candy:     strings.Join(_candyField, "|")
	deploy:    strings.Join(_deployField, "|")
}

// D-SCH-6: node names never collide with kind words, directives or body field names (S8).
#TopName:        #Name & !~"^(\(_alt.directive)|\(_alt.kind))$"
#InnerCandyName: #Name & !~"^(\(_alt.candy)|\(_alt.kind))$"
#InnerNodeName:  #Name & !~"^(\(_alt.deploy)|\(_alt.kind))$"
// A namespace is a named scope (§2) and the first segment of a namespaced reference (D-REF-1).
// D-KIND-4: a namespace is never a kind word or a directive, so a plugin's kind cannot shadow a
// first-party one.
#Namespace:      #TopName

// ── document (§4.2) ─────────────────────────────────────────────────────────
#Document: {
	repo?:     #Repo
	plugin?:   {[#Name]: #RepositoryRef} // D-PLUG-4
	import?:   {[#Namespace]: #RepositoryRef}
	discover?: #TextSet
	[#TopName]: #Node
}

// D-REF-3: a released repository pinned by release and digest, or a local path.
#RepositoryRefAlt: {
	repo: {repo!: #Repo, release!: #Release, digest!: #Digest}
	path: {path!: #Text}
}
#RepositoryRef: or([for _, a in #RepositoryRefAlt {a}])

// Parameterization: a candy declares a bounded choice, a reference supplies one admitted value — a
// choice, never a substitution (D-SCH-7).
#InputAlt: {
	choice: {choice!: #TextSet}
}
#Input: or([for _, a in #InputAlt {a}])
#With:  {[#Name]: #Text}

// ════ M1 — content: what a candy installs; an `os_override` overrides the same shape ════
// D-IR-6: an OS package carries nothing; a manager package may carry its plugin's input.
// D-IR-5: a manager's attributes are that input, never fields of the package entry itself.
#PackageMap: {
	[#OsPackage]:      {}
	[#ManagerLocator]: {input?: #Opaque} // S10: the owning manager plugin's input
}
#Content: {
	package?:      #PackageMap
	package_repo?: {[#Name]: #PackageRepo}
	file?:         {[#AbsPath]: #File}
	env?:          {[#EnvName]: #InitNeutral}
	path_append?:  [...#AbsPath]
	service?:      {[#Name]: #Service}
	user?:         {[#Name]: #User}
	volume?:       {[#Name]: #Volume}
	export?:       {[#Name]: {path!: #AbsPath, mode?: #FileMode}}
}
#CandyFields: {
	description!: #Text // D-KIND-3
	step?:        [...#Step]
	require?:     #RefSet @ref(candy) // D-CANDY-2: candies only, by reference
	need?:        #Need
	provide?:     #Provide
	input?:       {[#Name]: #Input} // the choices this candy declares
	with?:        #With             // the choices it supplies to its `from:`
	#Content
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
	platform?:      #PlatformSet
	build_with?:    {[#BuildManager]: #Ref} @ref(builder) // D-IR-7: only a build-time manager has a builder
	entrypoint?:    [...#Text]
	tag?:           #ImageTag
	capture_scope?: or(_captureScopeWord) // D-CAPTURE-4: what a capture takes
}

#Candy: { // D-HW-5, D-SCH-5: closed — no raw runtime settings, no removed field
	#CandyFields
	from?: #Ref @ref(source, box, pod, vm) // a box is a candy with `from:`
	if from != _|_ {#BoxFields} // D-CANDY-1
	[#InnerCandyName]: #InnerCandy
}
#InnerCandy: { // D-CANDY-2: no `from` — an inner candy never starts a stack
	#CandyFields
	[#InnerCandyName]: #InnerCandy
}

#PackageRepo: {url!: #Url, gpgkey?: #Url}
// A persistent directory; `encrypted` is granted by the kind as an encrypted filesystem (M4).
#Volume: {path!: #AbsPath, encrypted: *false | bool}

#FileAttr: {mode?: #FileMode, owner?: #Name, linux_capability?: #NameSet}
#FileAlt: { // D-IR-4
	content:  {content!: string, #FileAttr}
	copy:     {copy!: #Text, #FileAttr}
	dir:      {dir!: true, #FileAttr}
	link:     {link!: #AbsPath, #FileAttr}
	download: {download!: #Url, sha256!: #Sha256, #FileAttr}
	extract:  {extract!: #Url, sha256!: #Sha256, #FileAttr}
}
#File: or([for _, a in #FileAlt {a}])

#Service: {
	exec?:        #InitNeutral
	user?:        #Name
	restart:      *"always" | "on-failure" | "never"
	after?:       #NameSet
	env?:         {[#EnvName]: #InitNeutral}
	working_dir?: #AbsPath
	scope:        *"system" | or(_scopeWord)
}
#User: {uid?: #Count, group?: #NameSet, shell?: #AbsPath}

// ════ M4 — capabilities: one table of types; a need and a provide are rows of it (§15, §16) ════
// Every need entry, whatever its type, takes the same two attributes. `exclusive` asks for sole use
// of what the grant holds; the grant's mechanism may impose it, and the stricter wins (D-HW-8).
#NeedEntry: {
	optional:  *false | bool // D-CAP-1
	exclusive: *false | bool // D-HW-8
}
// A need type: what its entries are keyed by, the attributes its entries add, and — for a type whose
// keys name nodes — the kinds they may name, as `ref` (S9): the linker reads it as it reads @ref.
#NeedType: {
	env:        {key: #EnvName, entry: {}}
	secret:     {key: #Name, entry: {}}
	endpoint:   {key: #Name, entry: {protocol!: or(_protocolWord)}}
	harness:    {key: #Ref, entry: {}, ref: ["harness"]}
	gpu:        {key: or(_gpuWord), entry: {}}
	device:     {key: or(_deviceWord), entry: {}}
	nesting:    {key: or(_nestingWord), entry: {}}
	isolation:  {key: or(_isolationWord), entry: {}} // D-HW-7: a boundary is a need, never a runtime setting
	privilege:  {key: or(_privilegeWord), entry: {}}
	engine_api: {key: or(_anyDriverWord), entry: {}}
	memory:     {key: or(_memoryWord), entry: {size!: #Size}}
	mount:      {key: #Name, entry: {host!: #AbsPath, path!: #AbsPath, writable: *false | bool}}
	kind:       {key: #Name, entry: {}}
	verb:       {key: #Name, entry: {}}
	command:    {key: #Name, entry: {}}
	type:       {key: #TypeName, entry: {}}
	api:        {key: #Name, entry: {}}
}
#Need: {for t, d in #NeedType {(t)?: {[d.key]: {#NeedEntry, d.entry}}}}
// A provide type: what its entries are keyed by, and what an entry states.
#ProvideType: {
	env:      {key: #EnvName, entry: {value!: string}}
	endpoint: {key: #Name, entry: #Endpoint}
	kind:     {key: #Name, entry: {}}
	verb:     {key: #Name, entry: {}}
	command:  {key: #Name, entry: {}}
	type:     {key: #TypeName, entry: {}}
	api:      {key: #Name, entry: {}}
}
#Provide: {for t, d in #ProvideType {(t)?: {[d.key]: d.entry}}}
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
// D-VERB-3: a matcher is exactly one comparison (S4).
#MatcherAlt: {
	equals:       {equals!: #Scalar}
	contains:     {contains!: #Text}
	matches:      {matches!: #Text}
	not_contains: {not_contains!: #Text}
	not_matches:  {not_matches!: #Text}
	json:         {json!: {path!: #Text, equals!: #Scalar}}
}
#Matcher: or([for _, a in #MatcherAlt {a}])

// A step's phase: `build` against the artifact, `ready` gating a realization (the readiness
// condition of D-LAW-5), `runtime` against a running deployment, or `any`.
#StepFields: {
	id?:     #Name
	run_as?: #Name
	phase:   *"any" | or(_phaseWord)
	timeout: *"60s" | #Duration
}
#CheckFields: {
	#StepFields
	eventually?:    #Duration
	retry_interval: *"2s" | #Duration
	on_host:        *false | bool
	exit_status:    *0 | int
	stdout?:        #Matcher
	stderr?:        #Matcher
}
// D-IR-2: an install step declares its idempotence: `creates` or `unless`.
#GuardAlt: {
	creates: {creates!: #AbsPath}
	unless:  {unless!: #Text}
}
#Guard: or([for _, a in #GuardAlt {a}])

// D-VERB-5, D-VERB-1: every step alternative, keyed by the tag keys that select it: `run`
// carries only `command` and its `guard`; a check carries exactly one verb; the harness intents
// carry no verb. The loader selects the alternative by these keys (D-LOAD-5).
#StepAlt: {
	run: {run!: #Text, command!: #Text, guard!: #Guard, #StepFields}
	for w, input in #Verb {"check \(w)": {check!: #Text, (w)!: input, #CheckFields}}
	"harness-check": {"harness-check"!: #Text, harness?: #Ref @ref(harness), #StepFields}
	"harness-run": {"harness-run"!: #Text, harness?: #Ref @ref(harness), #StepFields}
}
_intentWord: ["run", "check", "harness-check", "harness-run"]
#Step: or([for _, alt in #StepAlt {alt}])
// D-DEP-8: a deployment's steps run in its runtime phase.
#RuntimeStep: #Step & {phase: "runtime"}

// The verb inputs (S1), one definition per verb, named #<Verb>Check; an operation table is
// #<Verb>CheckAlt (D-VERB-4). Comparisons inside an input are the verb's own observation (D-ROLE-5).
#FileCheck:        {path!: #AbsPath, exists?: bool, contains?: #Text, mode?: #FileMode, owner?: #Name}
#PackageCheck:     {name!: #Package, installed: *true | bool, version?: #Text} // an OS or a manager package
#ServiceCheck:     {name!: #Name, running: *true | bool, enabled?: bool}
#ProcessCheck:     {name!: #Text, running: *true | bool}
#PortCheck:        {port!: #Port, host?: #Hostname, listening?: bool, reachable?: bool}
#UserCheck:        {name!: #Name, exists: *true | bool, uid?: #Count, group?: #NameSet}
#GroupCheck:       {name!: #Name, exists: *true | bool, user?: #NameSet}
#MountCheck:       {path!: #AbsPath, mounted: *true | bool, fstype?: #Text, writable?: bool}
#KernelParamCheck: {name!: #Text, value?: #Text}
#DnsCheck:         {name!: #Hostname, resolvable: *true | bool, address?: #Text}
#InterfaceCheck:   {name!: #Name, up: *true | bool, address?: #Text}
#HttpCheck:        {url!: #Url, request_method: *"GET" | "POST" | "PUT" | "DELETE" | "HEAD", status?: int, body?: #Matcher, header?: #Matcher}

// D-VERB-4: one operation key per multi-operation verb; a wait is the `eventually` modifier.
#KubeCheckAlt: {
	node:     {node!: {count?: #Count}}
	resource: {resource!: {kind!: #Text, name!: #Text, namespace?: #Namespace, ready: *true | bool}}
	pod:      {pod!: {namespace?: #Namespace}}
}
#KubeCheck: or([for _, a in #KubeCheckAlt {a}])
#AppiumCheckAlt: {
	status:      {status!: {}}
	page_source: {page_source!: {}}
}
#AppiumCheck: or([for _, a in #AppiumCheckAlt {a}])
#CdpCheckAlt: {
	text:       {text!: {url!: #Url}}
	screenshot: {screenshot!: {url?: #Url}}
}
#CdpCheck: or([for _, a in #CdpCheckAlt {a}])
#DbusCheckAlt: {
	name:     {name!: {bus: *"session" | or(_busWord), name!: #Text}}
	property: {property!: {bus: *"session" | or(_busWord), service!: #Text, path!: #AbsPath, interface!: #Text, name!: #Text}}
}
#DbusCheck: or([for _, a in #DbusCheckAlt {a}])
#McpCheckAlt: {
	tool: {tool!: {endpoint!: #Name, name!: #Name}}
	call: {call!: {endpoint!: #Name, tool!: #Name, argument?: #Opaque}} // S10: the tool's own input
}
#McpCheck: or([for _, a in #McpCheckAlt {a}])
// One observation of a screen, over whatever display transport the venue serves (VNC, SPICE, a
// compositor, an IP-KVM): its pixels, a window, a recording, or a harness's answer about it.
#DisplayCheckAlt: {
	screenshot: {screenshot!: {}}
	window:     {window!: {app_id?: #Text, title?: #Text}}
	record:     {record!: {duration!: #Duration}}
	ask:        {ask!: {prompt!: #Text, harness?: #Ref @ref(harness)}}
}
#DisplayCheck: or([for _, a in #DisplayCheckAlt {a}])

// ════ data nodes: sources, operating systems, inits, builders (§10, §11) ════
#SourceFields: {description!: #Text, os!: #Ref @ref(os)} // D-SRC-2
// D-SRC-1: exactly one origin, remote origins pinned by sha256.
#SourceAlt: {
	oci:       {oci!: #ImageRef, #SourceFields}
	disk:      {disk!: {url!: #Url, sha256!: #Sha256}, #SourceFields}
	iso:       {iso!: {url!: #Url, sha256!: #Sha256, answer?: #Opaque}, #SourceFields} // S10: the installer's own answer file
	bootstrap: {bootstrap!: {builder!: #Ref @ref(builder), package?: #PackageMap}, #SourceFields}
}
#Source: or([for _, a in #SourceAlt {a}])

#Os: {
	description!:     #Text
	family!:          #Name
	version?:         #Text
	package_manager!: or(_packageManagerWord)
	container_init!:  #Ref @ref(init) // D-CANDY-3: the os owns the init
	system_init!:     #Ref @ref(init)
	boot?:            #Boot
}
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
// /rootfs), or a build-time manager's packages, each run in the row's box.
#BuilderAlt: { // D-PLUG-2: a builder row does exactly one thing
	bootstrap: {bootstrap!: {command!: #Text}, description!: #Text, box?: #Ref @ref(box)}
	manager:   {manager!: #BuildManager, description!: #Text, box!: #Ref @ref(box)}
}
#Builder: or([for _, a in #BuilderAlt {a}])

// ════ workflow, harness and documentation kinds (§10) ════
#Harness: {
	description!: #Text
	command!:     [...#Text]
	model?:       #Text
	need?:        #Need
}
// The one workflow kind (D-FLOW-1): a named set of stages run in the host venue. A named host
// routine is a pipeline of one stage; a gate over beds and an agent loop over a run are pipelines.
#Pipeline: {
	description!: #Text
	argument?:    {[#EnvName]: {description?: #Text, default?: #Text}} // required exactly when it has no default
	input_file?:  #TextSet
	output_file?: #TextSet
	schedule?:    {cron!: #Cron}
	stage!:       {[#Name]: #Stage}
}
#StageFields: {
	after?:      #NameSet
	when?:       {[#EnvName]: #Matcher} // the stage runs when every named argument matches
	timeout?:    #Duration
	attempt:     *1 | #Count       // D-FLOW-2
	on_error:    *"fail" | "continue" | "skip"
	lane?:       {over!: #EnvName} // run once per item of the list an argument holds
	concurrency: *1 | #Count       // how many lanes or beds run at once
}
#StageAlt: { // D-FLOW-1: a stage does exactly one thing
	step:     {step!: [...#Step], #StageFields}
	pipeline: {pipeline!: #Ref @ref(pipeline), #StageFields}
	bed:      {bed!: #RefSet @ref(pod, vm, local, android, kubernetes), #StageFields}
	ask:      {ask!: {prompt!: #Text}, #StageFields}
}
#Stage: or([for _, a in #StageAlt {a}])

// A skill's and a hook's body is derived from its name (P3): `.agents/skills/<name>/SKILL.md`,
// `.agents/agents/<name>.md` for an agent definition, `.agents/hooks/<name>.<language>`.
#Skill: {
	description!: #Text
	family!:      #Name
	category:     *"development" | or(_skillCategoryWord)
	trigger?:     #TextSet
	agent?:       {model: *"inherit" | #Text, tool?: #TextSet}
}
#Hook: {
	description!: #Text
	event!:       #Text
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
	url:     {url!: #Url}
	command: {command!: [...#Text]}
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
#DeploymentFields: {
	description!: #Text
	step?:        [...#RuntimeStep]
	disposable:   *false | bool
	preemptible:  *false | bool
	update_gate:  *"full" | "restart-only" | "skip"
	parallel:     *false | bool
	instrument?:  {[#Name]: {record!: or(_recorderWord)}} // recordings attached to the run
	ephemeral?:   {ttl!: #Duration}
	need?:        #Need
	with?:        #With // supplies the `input:` choices of the candy this deployment names
}
// D-DEP-7: publishing, sizing and network belong to pod and vm only.
#MachineOnly: {
	publish?:   {[#Name]: #Port} // the host port of each provided endpoint it publishes (D-VAL-13)
	cpu?:       #Count
	ram?:       #Size
	disk_size?: #Size
	network?:   #Name
}

// D-DEP-1, D-DEP-2: pod and vm share one field set and one inner set; no `require` — content
// comes from the box. No driver field: the engine or hypervisor is user configuration.
#MachineFields: {
	#DeploymentFields
	#MachineOnly
	from!: #Ref @ref(box, source)
	[#InnerNodeName]: #InnerOfMachine
}
#Pod: {#MachineFields} // D-DRV-2: a deployment never names its driver
#Vm:  {#MachineFields}

// A deployment charly does not run from an artifact is created where it is written (`create:`) or
// connected (`connect:`) — exactly one (D-DEP-6). A connection is reached through a venue; its
// alternatives carry the venue alternatives' names, and each kind admits its own.
#ConnectAlt: {
	shell: {shell!: {}}
	ssh:   {ssh!: {host!: #Hostname, user?: #Name, port: *22 | #Port}}
	kvm:   {kvm!: {address!: #Address, secret?: #Name}}
	adb:   {adb!: {address!: #Address}}
	kube:  {kube!: {context!: #Text}}
}

// D-NEST-2: what each body admits, as tag tables keyed by kind word. Only #InnerOfLocalAlt and
// #InnerOfAndroidAlt carry a `candy` entry — the default, selected for an inner node with no kind
// key; the pod/vm, kubernetes and alongside tables admit no keyless node.
#InnerOfMachineAlt: {
	pod:        #PodNode
	vm:         #VmNode
	local:      #InnerLocalNode
	kubernetes: #CreatedKubernetesNode // D-NEST-7
	android:    #AndroidNode
	agent:      #AgentNode
}
#InnerOfMachine: or([for _, a in #InnerOfMachineAlt {a}])
// The deployment kinds (§2, §12.1) are exactly the nodes a pod or vm admits inside it.
_deploymentKind: [for k, _ in #InnerOfMachineAlt {k}]
#InnerOfKubernetesAlt: {
	pod:   #PodNode
	vm:    #VmNode
	agent: #AgentNode
}
#InnerOfLocalAlt: {
	candy:      #InnerCandy
	kubernetes: #CreatedKubernetesNode // D-NEST-7
	android:    #AndroidNode
}
#InnerOfAndroidAlt: {
	candy: #InnerCandy
}
// D-NEST-2: beside a pod or vm — another pod or vm, or a local that connects to its host.
#AlongsideAlt: {
	pod:   #PodNode
	vm:    #VmNode
	local: #TopLocalNode
}

#KubernetesFields: { // D-DEP-2: no `require` — clusters do not take candies
	#DeploymentFields
	[#InnerNodeName]: or([for _, a in #InnerOfKubernetesAlt {a}])
}
#KubernetesAlt: { // D-DEP-6
	create:  {create!: {node?: {[#Name]: {control_plane: *false | bool}}}, #KubernetesFields}
	connect: {connect!: #ConnectAlt.kube, #KubernetesFields}
}
#Kubernetes: or([for _, a in #KubernetesAlt {a}])

#LocalFields: {
	#DeploymentFields
	require?: #RefSet @ref(candy)
	[#InnerNodeName]: or([for _, a in #InnerOfLocalAlt {a}])
}
// D-NEST-6: a top-level or alongside local connects to its host; an inner local applies to its parent.
#TopLocal:   {connect!: #ConnectAlt.shell | #ConnectAlt.ssh | #ConnectAlt.kvm, #LocalFields}
#InnerLocal: {#LocalFields}

#AndroidFields: {
	#DeploymentFields
	require?: #RefSet @ref(candy)
	[#InnerNodeName]: or([for _, a in #InnerOfAndroidAlt {a}])
}
#AndroidAlt: { // D-DEP-6
	create:  {create!: {device!: #Text, api_level!: #Count}, #AndroidFields}
	connect: {connect!: #ConnectAlt.adb, #AndroidFields}
}
#Android: or([for _, a in #AndroidAlt {a}])

#PodNode:               {pod!: #Pod, [#InnerNodeName]: or([for _, a in #AlongsideAlt {a}])}
#VmNode:                {vm!: #Vm, [#InnerNodeName]: or([for _, a in #AlongsideAlt {a}])}
#KubernetesNode:        {kubernetes!: #Kubernetes}
#CreatedKubernetesNode: {kubernetes!: #KubernetesAlt.create}
#TopLocalNode:          {local!: #TopLocal}
#InnerLocalNode:        {local!: #InnerLocal}
#AndroidNode:           {android!: #Android}
#AgentNode:             {agent!: #AgentBody}
#AgentBody: {
	#DeploymentFields
	from!: #Ref @ref(box, source) // the agent is deployed from a box, like any machine
	spec?: #Opaque                // S10: the agent runtime's own configuration
}

// ════════════════════════════════════════════════════════════════ Part 2 — user configuration (§17)
// What the user sets, never an authored document (D-LAW-6).
#UserConfig: {
	driver:          #Driver
	resource?:       {[#Name]: #Resource} // the host resources a lease may take (D-HW-4)
	image_registry?: #Hostname
	secret_backend:  *"secret-service" | "gpg" | "file"
	local_install:   *false | bool             // the switch of D-STORE-9
	plugin?:         {[#Name]: #RepositoryRef} // the project-less list of D-PLUG-5
	section?:        {[#Name]: #Opaque}        // S10: each plugin's own section, under its own schema
}
// D-DRV-1: one driver per driven kind, a word of its row of the driver table.
#Driver: {for k, w in _driverWord {(k): *_driverDefault[k] | or(w)}}
// A leasable host resource: the need type it satisfies and the word it answers to.
#ResourceAlt: {
	gpu:    {gpu!: or(_gpuVendorWord)}
	device: {device!: or(_deviceWord)}
}
#Resource: or([for _, a in #ResourceAlt {a}])

// ════════════════════════════════════════════════════════════════ Part 3 — protocol (§8)
// Moves to spec/protocol when implemented. A word payload (a kind's body, a verb's input, a
// command's arguments, an api's messages, a kind's state and grants) is #Opaque here because the
// owning plugin's CUE module defines it (S10); it is validated against that definition on receipt.

_roleWord: ["kind", "verb", "command", "type", "api"]
#Key:    =~"^(\(strings.Join(_roleWord, "|"))):[a-z][a-z0-9_-]*(:[a-z][a-z0-9_-]*)?$" // D-ROLE-6
#ApiKey: #Key & =~"^api:"
#CallId: =~"^[0-9a-f]{32}$"

// ── the audit record (§17.9): one append-only record per mutation and per authority decision ──
_auditKindWord:    ["mutate", "authorize", "admit", "activate", "teardown"]
_auditOutcomeWord: ["ok", "refused", "failed"]
_detailCodeWord:   ["reason", "path", "field", "ref", "count", "duration"]
#AuditEvent: {
	at!:        #Timestamp
	kind!:      or(_auditKindWord)
	outcome!:   or(_auditOutcomeWord)
	identity!:  #Ref       // who acted (D-AUDIT-2)
	on?:        #Ref       // what was acted on
	operation?: #Name      // a charly verb or mutation word (D-AUDIT-5)
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
	state!:    "absent" | "stopped" | "running" | "failed"
	revision?: #Digest
	admitted?: #Digest
	detail?:   #Text
}

// ── messages shared by several methods ────────────────────────────────────────
#Resolved: {kind!: #Name, digest!: #Digest, value!: #Opaque} // S10
#NodeInput: {
	identity!:  #Ref
	body!:      #Opaque // S10
	reference!: {[#Ref]: #Resolved} // the linked references of the node (§4.1 stage 4)
}
#ArtifactRef: {form!: or(_formWord), digest!: #Digest}
#Done: {}

// The IR (§9.4): one action, tagged by its kind.
#ActionAlt: {
	package:      {package!: {name!: #Package, input?: #Opaque}, #ActionFields} // S10: the manager's input
	package_repo: {package_repo!: {name!: #Name, #PackageRepo}, #ActionFields}
	file:         {file!: {path!: #AbsPath, effect!: #File}, #ActionFields}
	service:      {service!: {name!: #Name, unit!: #Service}, #ActionFields}
	user:         {user!: {name!: #Name, spec!: #User}, #ActionFields}
	env:          {env!: {name!: #EnvName, value!: #InitNeutral}, #ActionFields}
	command:      {command!: {run!: #Text, guard!: #Guard, run_as?: #Name}, #ActionFields}
}
#ActionFields: {scope: *"system" | or(_scopeWord)}
#Action: or([for _, a in #ActionAlt {a}])

// ── M6 venues: where a deployment is reached; `via` is the venue it is reached through ──
_venueOperationWord: ["exec", "copy", "log", "console", "display", "forward", "power"]
// D-VENUE-2: a venue declares the operations it serves; one it lacks is refused, never emulated.
#VenueFields: {via?: #VenueOutput, operation!: [...or(_venueOperationWord)] & list.UniqueItems()}
#VenueOutputAlt: {
	container: {container!: {driver!: or(_driverWord.pod), name!: #Text, namespace: *"default" | #Namespace, isolation?: or(_isolationWord)}, #VenueFields}
	ssh:       {ssh!: {host!: #Hostname, port!: #Port, user!: #Name, key_secret!: #Name}, #VenueFields}
	shell:     {shell!: {}, #VenueFields}
	kvm:       {kvm!: {address!: #Address}, #VenueFields}
	adb:       {adb!: {serial!: #Text}, #VenueFields}
	kube:      {kube!: {context!: #Text, namespace!: #Namespace}, #VenueFields}
}
#VenueOutput: or([for _, a in #VenueOutputAlt {a}])

// ── the method table: every method, the role that serves it, its input and output ──
// D-ROLE-1, D-ROLE-2
#MethodIO: {
	validate: {role: "kind", input: #NodeInput, output: {diagnostic: [...#Diagnostic]}}
	resolve:  {role: "kind", input: #NodeInput, output: {value!: #Opaque, digest!: #Digest}} // S10
	migrate:  {role: "kind", input: {identity!: #Ref, body!: #Opaque}, output: {body!: #Opaque, change: [...#Text]}} // S10
	build:    {role: "kind", input: {identity!: #Ref, start!: #ArtifactRef, ir!: [...#Action], form!: or(_formWord)}, output: {artifact!: #ArtifactRef}}
	realize:  {role: "kind", input: {#NodeInput, artifact?: #ArtifactRef, ir?: [...#Action], parent?: #VenueOutput}, output: {venue!: #VenueOutput}}
	start:    {role: "kind", input: #NodeInput, output: #Done}
	stop:     {role: "kind", input: #NodeInput, output: #Done}
	status:   {role: "kind", input: #NodeInput, output: #StatusOutput}
	// validate without effect, then make the admitted revision active
	admit:    {role: "kind", input: {#NodeInput, ir?: [...#Action]}, output: {revision!: #Digest, diagnostic: [...#Diagnostic]}}
	activate: {role: "kind", input: {identity!: #Ref, revision!: #Digest}, output: #Done}
	log:      {role: "kind", input: {#NodeInput, follow: *false | bool}, output: #Done}
	venue:    {role: "kind", input: #NodeInput, output: #VenueOutput}
	// M5: a capture takes the deployment's filesystem, or also its processes; restore returns a
	// deployment to a capture it took.
	capture:  {role: "kind", input: {#NodeInput, scope: *"filesystem" | or(_captureScopeWord)}, output: {artifact!: #ArtifactRef, process?: #Digest}}
	restore:  {role: "kind", input: {#NodeInput, artifact!: #ArtifactRef, process?: #Digest}, output: #Done}
	grant:    {role: "kind", input: {#NodeInput, need!: #Need}, output: {item: [...#GrantItem]}}
	destroy:  {role: "kind", input: #NodeInput, output: #Done}
	check:    {role: "verb", input: {input!: #Opaque, venue!: #VenueOutput, run_as?: #Name}, output: #CheckOutput} // S10
	run:      {role: "command", input: {argument!: #Opaque}, output: #Done} // S10
	bind:     {role: "type", input: {need!: {type!: #TypeName, name!: #Text, attribute!: #Opaque}, provided_by!: #Ref, deployment!: #Ref}, output: {binding!: #Opaque}} // S10
	unbind:   {role: "type", input: {binding!: #Opaque}, output: #Done} // S10
	call:     {role: "api", input: {request!: #Opaque}, output: {reply!: #Opaque}} // S10
}
_methodWord: [for m, _ in #MethodIO {m}]
#Method: or(_methodWord)
// One granted item. A grant that holds a host resource names it and the lease mode its mechanism
// imposes — a resource that stays the host's is `shared`, one taken from the host is `exclusive`;
// core leases it at the stricter of that mode and the need's request (D-HW-8).
#GrantItem: {
	need!:  #Text
	grant!: #Opaque // S10: the kind's own grant record
	lease?: {resource!: #Name, mode!: or(_leaseModeWord)}
}

// D-ROLE-5: one observation; core applies the step's modifiers and step-level matchers.
#CheckOutput: {exit_status?: int, stdout?: string, stderr?: string, observed?: #Opaque} // S10

// D-PROTO-1: the plugin service's control methods beside the role methods.
#PluginMethodIO: {
	describe: {input: #Done, output: #DescribeReply}
	shutdown: {input: #Done, output: #Done}
}
_pluginMethodWord: [for m, _ in #PluginMethodIO {m}]
#PluginRequestAlt: {for m, io in #PluginMethodIO {(m): {(m)!: io.input}}}
#PluginRequest: or([for _, a in #PluginRequestAlt {a}])

// D-PROTO-5: the methods a plugin reports per key are methods of that key's role.
#DescribeReply: {
	module!:          #Module
	release?:         #Release // absent for a `path:` plugin
	source_digest!:   #Digest
	schema_digest!:   #Digest
	manifest_digest!: #Digest
	method!: {[K=#Key]: [...or([for m, io in #MethodIO if strings.HasPrefix(K, io.role+":") {m}])]}
}

// D-PROTO-8: every call carries its deadline.
#CallHeader: {
	call_id!:  #CallId
	key!:      #Key
	project!:  #Digest
	deadline!: #Duration
}
// A request: the call header plus one key — the method — holding that method's input (S4).
#RequestAlt: {for m, io in #MethodIO {(m): {header!: #CallHeader, (m)!: io.input}}}
#Request: or([for _, a in #RequestAlt {a}])

// D-PROTO-7: a reply holds exactly one of the method's output or an error.
#ReplyAlt: {
	for m, io in #MethodIO {(m): {call_id!: #CallId, (m)!: io.output}}
	error: {call_id!: #CallId, error!: #Error}
}
#Reply: or([for _, a in #ReplyAlt {a}])

_errorCodeWord: ["invalid", "not_found", "unmet", "conflict", "unavailable", "denied", "cancelled", "deadline", "internal"]
#ErrorCode: or(_errorCodeWord)
#Error: {
	code!:       #ErrorCode
	message!:    #Text
	identity?:   #Ref
	position?:   #Position
	diagnostic?: [...#Diagnostic]
	request?:    #CallId
	detail?:     [...#AuditDetail] & list.MaxItems(32)
}
#Position: {file!: #Text, line!: #Line}
#Diagnostic: {
	severity!: "error" | "warning"
	message!:  #Text
	identity?: #Ref
	position?: #Position
	rule?:     #RuleId
}

// D-PROTO-10: the stream of a long-running call (terminal I/O for `run`, output for `log` and
// `venue_exec`), tagged by kind.
#StreamAlt: {
	chunk:  {call_id!: #CallId, chunk!: {stream!: "stdin" | "stdout" | "stderr", data!: bytes}}
	resize: {call_id!: #CallId, resize!: {height!: #Count, width!: #Count}}
	exit:   {call_id!: #CallId, exit!: {exit_status!: int}}
}
#Stream: or([for _, a in #StreamAlt {a}])

// ── the host service (§8.6) ────────────────────────────────────────────────────
// D-PROTO-13: the closed set of host methods, with their inputs and outputs.
#HostMethodIO: {
	venue_exec: {input: {identity!: #Ref, command!: [...#Text], run_as?: #Name}, output: {exit_status!: int}}
	store_get:  {input: {digest!: #Digest}, output: {data!: bytes}}
	store_put:  {input: {data!: bytes}, output: {digest!: #Digest}}
	state_get:  {input: {identity!: #Ref, name!: #Name}, output: {value?: #Opaque}} // S10
	state_put:  {input: {identity!: #Ref, name!: #Name, value!: #Opaque}, output: #Done} // S10
	project:    {input: {identity!: #Ref}, output: #Resolved}
	config_get: {input: #Done, output: {config!: #Opaque}} // S10: the caller's #UserConfig section
	call:       {input: {key!: #ApiKey, request!: #Opaque}, output: {reply!: #Opaque}} // S10
	secret_get: {input: {name!: #Name}, output: {value!: bytes}}
	secret_put: {input: {name!: #Name, value!: bytes}, output: #Done}
	report:     {input: #Event, output: #Done}
	// the transaction state_put cannot be, and the record's write leg
	state_commit: {input: {identity!: #Ref, revision!: #Digest, entry!: [...{name!: #Name, value!: #Opaque}]}, output: #Done} // S10
	audit_append: {input: {event!: #AuditEvent}, output: #Done}
}
_hostMethodWord: [for m, _ in #HostMethodIO {m}]
#HostMethod: or(_hostMethodWord)

// D-PROTO-12: every host request names the core call it serves.
#HostRequestAlt: {for m, io in #HostMethodIO {(m): {call_id!: #CallId, (m)!: io.input}}}
#HostRequest: or([for _, a in #HostRequestAlt {a}])

#Event: {
	call_id!:  #CallId
	identity?: #Ref
	activity!: #Name
	message!:  #Text
	progress?: #Fraction
}
