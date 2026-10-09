// DESIGN.cue — the schema of DESIGN.md (Appendix A), CUE v0.17.1. The single copy.
//
//   Part 1  authoring schema (DESIGN Part III)   validate: cue vet -d '#Document' DESIGN.cue charly.yml
//   Part 2  core↔plugin protocol (DESIGN §8)     validate: cue vet -d '#Request' DESIGN.cue request.yaml
//
// Written with the schema patterns of DESIGN §3.1 and nothing else:
//   S1 closed definition      #X: {a!: T, b?: U}   (a definition is closed, recursively; close() is never written)
//   S2 named scalar           #Name: =~"…"
//   S3 literal enum           *"system" | "user" inline, or or(_xWord) from a word list that tools read
//   S4 key-tagged union       #XAlt: {a: {a!: …, F}, b: {b!: …, F}}   #X: or([for _, x in #XAlt {x}])
//                             the tag table's keys are the tags; one entry may be the default,
//                             selected when no tag is written, and it admits none of the tags
//   S5 named collection       {[#Name]: #T}; a set of bare names is a list of unique names
//   S6 shared fragment        #F: {…} embedded in S1/S4 definitions
//   S7 conditional field      if from != _|_ {#BoxFields}   (declared only under the condition)
//   S8 reserved-name pattern  [#InnerNodeName]: T
//   S9 reference field        from?: #Ref @ref(source, box)   (the kinds a reference may name)
// A field a definition does not declare is rejected by closedness with "field not allowed".
//
// A `// D-…` comment marks the line that enforces that requirement; every tag has a negative case
// in design/negative/. Rules a single document cannot express are indexed in DESIGN §5.4.
// In charly the tag tables below are composed from the declared plugins (§3.3).
package design

import (
	"list"
	"strings"
)

// ════════════════════════════════════════════════════════════════ Part 1 — authoring

// ── S2 named scalars ─────────────────────────────────────────────────────────
#Name:     =~"^[a-z][a-z0-9]*(-[a-z0-9]+)*$" // D-NEST-4: never `--`
#Ref:      =~"^[a-z][a-z0-9]*(-[a-z0-9]+)*(\\.[a-z][a-z0-9]*(-[a-z0-9]+)*)*$"
#TypeName: =~"^[a-z][a-z0-9_]*$" // D-NAME-2: capability types use underscores
#Text:     string & !=""
#Count:    int & >0
#Line:     int & >=1
#Fraction: number & >=0 & <=1
#Port:     int & >0 & <65536
#Address:  =~"^[^ :]+:[0-9]+$"
#Repo:     =~"^[a-z0-9.-]+/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
#Release:  =~"^v[0-9]{4}\\.[0-9]{3}\\.[0-9]{4}$"
#Digest:   =~"^sha256:[0-9a-f]{64}$"
#Sha256:   =~"^[0-9a-f]{64}$"
#RuleId:   =~"^D-[A-Z]+-[0-9]+$"
#Size:     =~"^[0-9]+(Ki|Mi|Gi|Ti)$"
#Duration: =~"^[0-9]+(ms|s|m|h)$"
#EnvName:  =~"^[A-Za-z_][A-Za-z0-9_]*$"
#Platform: =~"^linux/(amd64|arm64)$"
#FileMode: =~"^0[0-7]{3}$"
#AbsPath:  =~"^/[^$]*$" // D-SCH-7: a literal absolute path, no variables
// A package: an OS package name, or `<manager>:<locator>` for a non-OS manager (§7.1), where the
// locator is whatever that manager installs from (a name, or a URL for `android:`).
#Manager: or(_managerWord)
#Package: =~"^((\(strings.Join(_managerWord, "|"))):[^ ]+|[^: ]+)$"
#Scalar:  string | number | bool
#InitNeutral: string & !~"%[a-zA-Z(]" // D-CANDY-3
// Sets of bare names (S5): unique items.
// A manager whose install needs ATTRIBUTES beyond a locator carries them in a body whose payload the
// OWNING PLUGIN owns (#Opaque) — so no core def learns a chart field and none can drift from the
// plugin's schema. `helm` is already a manager word; the gap was generic (§7.1).
#ManagerInput: #Opaque
#ManagerPackage: {
	package!: #Package
	input?:   #ManagerInput
}
// D-IR-5: a manager is a bare locator or a package plus the owning plugin's input — never a
// struct of the manager's own field names, which would put a foreign CLI's vocabulary in core.
#PackageEntry: or([#Package, #ManagerPackage])
// D-IR-7 — WHERE IT ACTUALLY BITES. A candy DECLARES packages of either phase: DESIGN.md's own
// `fdroid` example is a candy whose `package:` names the apply-time manager `android:`, so phase does
// NOT gate declaration. What the phase decides is OWNERSHIP of the work: a build-time manager's
// package is built by a `builder` node and its `builder_box` key must therefore BE a build-time
// manager — a box that builds nothing is meaningless. That is the enforceable site, and it is what
// `_buildManagerWord` is consumed by.
#PackageSet:  [...#PackageEntry] & list.UniqueItems()
#NameSet:     [...#Name] & list.UniqueItems()
#PlatformSet: [...#Platform] & list.UniqueItems()

// The one open value: a field whose schema another plugin owns and validates (D-PAT-1).
#Opaque: {...}
// Parameterization: a candy DECLARES a bounded choice, a reference SUPPLIES one admitted value. A
// CHOICE, never a substitution — a value may not interpolate a path or a port, which is what D-SCH-7
// and #AbsPath forbid and what spike S2 exists to confirm is sufficient.
#InputAlt: {
	choice: {choice!: [...#Text] & list.UniqueItems()}
}
#Input:  or([for _, a in #InputAlt {a}])
#Inputs: {[#Name]: #Input}
#With:   {[#Name]: #Text}

// ── word lists (S3) ─────────────────────────────────────────────────────────
// Written out for the first-party plugins; in charly they are composed from the registry.
_managerWord:        ["npm", "cargo", "pip", "aur", "flatpak", "helm", "android"]
// ONE table, ONE DERIVED set — so adding a manager stays one entry in one place, not three edits that can
// drift. The one set is the BUILD-TIME words; the apply-phase rows serve to EXCLUDE those words from it, so
// the table carries the phase even though the phase does not gate what may be written. The rule this feeds
// is D-IR-7, whose enforcement — and so its tag — is on `#PackageEntry` above.
_managerPhase: {
	npm:     "build"
	cargo:   "build"
	pip:     "build"
	aur:     "build"
	flatpak: "build"
	helm:    "apply"
	android: "apply"
}
#BuildManager: or(_buildManagerWord)
_buildManagerWord: [for w, p in _managerPhase if p == "build" {w}]
_packageManagerWord: ["dnf", "apt", "pacman", "apk", "zypper"]
_gpuWord:            ["nvidia", "amd", "intel", "any"]
_deviceWord:         ["kvm", "render", "fuse", "tun", "vhost-net", "vsock", "hwrng", "kfd"]
_nestingWord:        ["container", "vm"]
_engineWord:         ["podman", "docker", "nerdctl", "libvirt"]
_phaseWord:          ["any", "build", "runtime"]
_directive: {repo: _, plugin: _, import: _, discover: _}
// Kinds owned by plugins outside this schema: only their envelope is checked here.
_otherKind: ["init", "builder", "task", "check-roster", "harness", "pipeline", "cua", "jetkvm", "skill", "hook", "marketplace", "doc"]
// Verbs owned by plugins outside this schema: their input is defined by the owning plugin.
_otherVerb: ["helm", "wl", "vnc", "spice", "dbus", "record", "cua", "jetkvm", "vision", "mcp"]

// ── tag tables (S4) ─────────────────────────────────────────────────────────
// Every kind word and the node definition it selects (§10).
#KindNode: {
	source:     #SourceNode
	os:         #OsNode
	pod:        #PodNode
	vm:         #VmNode
	kubernetes: #KubernetesNode
	local:      #TopLocalNode
	android:    #AndroidNode
	for k in _otherKind {(k): {(k)!: #OtherBody}}
}
// A top-level node (§4.2 rule 3): the candy is the default entry, selected when no kind key is
// written; it admits no kind key. Registry key `kind:candy` is reserved for it (§8.2).
#NodeAlt: {
	candy: #Candy
	#KindNode
}
#Node: or([for _, n in #NodeAlt {n}])

// Every check verb and its input (§20).
#Verb: {
	command: #Text
	file:    #FileCheck
	package: #PackageCheck
	service: #ServiceCheck
	process: #ProcessCheck
	port:    #PortCheck
	http:    #HttpCheck
	kube:    #Kube
	adb:     #Adb
	appium:  #Appium
	cdp:     #Cdp
	for w in _otherVerb {(w): #Opaque}
}

// Field names of the bodies that can hold named nodes. Optional fields cannot be enumerated
// inside CUE, so these lists are written out; design-consistency.sh checks them against the
// definitions.
_candyField:  ["description", "from", "step", "require", "need", "provide", "package", "os_override", "file", "package_repo", "env", "path_append", "service", "user", "volume", "route", "export", "module", "packaging", "shm_size", "platform", "builder_box", "entrypoint", "tag", "input", "with"]
_deployField: ["description", "from", "require", "need", "step", "port", "volume", "env", "cpu", "ram", "disk_size", "network", "disposable", "preemptible", "update_gate", "parallel", "instrument", "iterate", "ephemeral", "firmware", "host", "device", "api_level", "adb", "create", "connect", "cluster_node", "with"]

_kindWord:      [for k, _ in #KindNode {k}]
_directiveWord: [for k, _ in _directive {k}]
_verbWord:      [for k, _ in #Verb {k}]
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
// A namespace is A NAMED SCOPE (ledger §5): the name an `import:` binds a repository reference to, a
// venue's own scope, a deployment's scope. So this scalar guards a namespace WHEREVER one is named —
// and a namespace is the FIRST SEGMENT of every namespaced reference (D-REF-1), exactly where a kind
// word or a directive must not appear.
// D-KIND-4: a namespace is never a kind word or a directive, so a plugin's kind cannot shadow a
// first-party one.
#Namespace:      #Name & !~"^(\(_alt.directive)|\(_alt.kind))$"

// ── document (§4.2) ─────────────────────────────────────────────────────────
#Document: {
	repo?:     #Repo
	plugin?:   {[#Name]: #RepositoryRef} // D-PLUG-4
	import?:   {[#Namespace]: #RepositoryRef}
	discover?: [...#Text]
	[#TopName]: #Node
}

// D-REF-3: a released repository pinned by release and digest, or a local path.
#RepositoryRefAlt: {
	repo: {repo!: #Repo, release!: #Release, digest!: #Digest}
	path: {path!: #Text}
}
#RepositoryRef: or([for _, a in #RepositoryRefAlt {a}])

// ── candy (§11) — one definition ─────────────────────────────────────────────
#CandyFields: {
	description!:  #Text // D-KIND-3
	step?:         [...#Step]
	require?:      [...#Ref] @ref(candy) // D-CANDY-2: candies only, by reference
	need?:         #Need
	provide?:      #Provide
	// A candy DECLARES a bounded choice (`input:`) and SUPPLIES one to its `from:` (`with:`). A
	// CHOICE, never a substitution — D-SCH-7 and #AbsPath forbid interpolating a path or a port.
	input?:        #Inputs
	with?:         #With
	package?:      #PackageSet
	os_override?:  {[#Name]: {package?: #PackageSet, package_repo?: {[#Name]: #PackageRepo}}}
	file?:         {[#AbsPath]: #File}
	package_repo?: {[#Name]: #PackageRepo}
	env?:          {[#EnvName]: #InitNeutral}
	path_append?:  [...#AbsPath]
	service?:      {[#Name]: #Service}
	user?:         {[#Name]: #User}
	volume?:       {[#Name]: {path!: #AbsPath}}
	route?:        {host!: #Text, port!: #Port}
	export?:       {[#Name]: {path!: #AbsPath, mode?: #FileMode}}
	module?:       #Text   // a plugin candy (§8.1)
	packaging?:    #Opaque // owned by the operations plugin
	shm_size?:     #Size
}

// Box build settings: declared only on a box.
#BoxFields: {
	platform?:    #PlatformSet
	builder_box?: {[#BuildManager]: #Ref} @ref(box)   // D-IR-7: a box that builds nothing is meaningless
	entrypoint?:  [...#Text]
	tag?:         #Text
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

#PackageRepo: {url!: #Text, gpgkey?: #Text}

#FileAttr: {mode?: #FileMode, owner?: #Name, linux_capability?: #NameSet}
#FileAlt: { // D-IR-4
	content:  {content!: string, #FileAttr}
	copy:     {copy!: #Text, #FileAttr}
	dir:      {dir!: true, #FileAttr}
	link:     {link!: #AbsPath, #FileAttr}
	download: {download!: #Text, sha256!: #Sha256, #FileAttr}
	extract:  {extract!: #Text, sha256!: #Sha256, #FileAttr}
}
#File: or([for _, a in #FileAlt {a}])

#Service: {
	exec?:        #InitNeutral
	user?:        #Name
	restart:      *"always" | "on-failure" | "never"
	after?:       #NameSet
	env?:         {[#EnvName]: #InitNeutral}
	working_dir?: #AbsPath
	scope:        *"system" | "user"
}

#User: {uid?: #Count, group?: #NameSet, shell?: #AbsPath}

// ── capabilities (§15, §16) — S5 ──────────────────────────────────────────────
#Optional: {optional: *false | bool} // D-CAP-1

#Need: {
	env?:        {[#EnvName]: #Optional}
	secret?:     {[#Ref]: #Optional}
	mcp?:        {[#Name]: #Optional}
	harness?:    {[#Ref]: #Optional} @ref(harness)
	gpu?:        {[or(_gpuWord)]: {lease: *"shared" | "exclusive", optional: *false | bool}}
	device?:     {[or(_deviceWord)]: #Optional}
	nesting?:    {[or(_nestingWord)]: #Optional}
	engine_api?: {[or(_engineWord)]: #Optional}
	mount?:      {[#Name]: {host!: #AbsPath, path!: #AbsPath, writable: *false | bool, optional: *false | bool}}
	kind?:       {[#Name]: #Optional}
	verb?:       {[#Name]: #Optional}
	command?:    {[#Name]: #Optional}
	type?:       {[#TypeName]: #Optional}
	api?:        {[#Name]: #Optional}
}

#Provide: {
	env?:     {[#EnvName]: {value!: string}}
	mcp?:     {[#Name]: {port!: #Port, path?: #AbsPath}}
	port?:    {[#Name]: {port!: #Port, protocol: *"tcp" | "udp"}}
	kind?:    {[#Name]: {}}
	verb?:    {[#Name]: {}}
	command?: {[#Name]: {}}
	type?:    {[#TypeName]: {}}
	api?:     {[#Name]: {}}
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
#RuntimeStep: #Step & {phase: "runtime" | *"runtime"}

// The verb inputs (S1), one definition per verb. Comparisons inside an input are part of the
// verb's own observation (D-ROLE-5).
#FileCheck:    {path!: #AbsPath, exists?: bool, contains?: #Text, mode?: #FileMode, owner?: #Name}
#PackageCheck: {name!: #Text, installed: *true | bool, version?: #Text}
#ServiceCheck: {name!: #Name, running: *true | bool, enabled?: bool}
#ProcessCheck: {name!: #Text, running: *true | bool}
#PortCheck:    {port!: #Port, host?: #Text, listening?: bool, reachable?: bool}
#HttpCheck:    {url!: #Text, request_method: *"GET" | "POST" | "PUT" | "DELETE" | "HEAD", status?: int, body?: #Matcher, header?: #Matcher}

// D-VERB-4: one operation key per multi-operation verb.
#KubeAlt: {
	wait_node:  {wait_node!: {count!: #Count}}
	wait_ready: {wait_ready!: {resource!: #Text, namespace?: #Namespace, name!: #Text}}
	pod:        {pod!: {namespace?: #Namespace}}
	node:       {node!: {}}
}
#Kube: or([for _, a in #KubeAlt {a}])
#AdbAlt: {
	device:  {device!: {}}
	shell:   {shell!: #Text}
	install: {install!: #Text}
}
#Adb: or([for _, a in #AdbAlt {a}])
#AppiumAlt: {
	status:      {status!: {}}
	page_source: {page_source!: {}}
}
#Appium: or([for _, a in #AppiumAlt {a}])
#CdpAlt: {
	text:       {text!: {url!: #Text}}
	screenshot: {screenshot!: {url?: #Text}}
}
#Cdp: or([for _, a in #CdpAlt {a}])

// ── source and os (§11.3, §11.4) ──────────────────────────────────────────────
#SourceNode:   {source!: #Source}
#SourceFields: {description!: #Text, os!: #Ref @ref(os)} // D-SRC-2
// D-SRC-1: exactly one origin, remote origins pinned by sha256.
#SourceAlt: {
	oci:       {oci!: #Text, #SourceFields}
	disk:      {disk!: {url!: #Text, sha256!: #Sha256}, #SourceFields}
	iso:       {iso!: {url!: #Text, sha256!: #Sha256, answer?: #Opaque}, #SourceFields}
	bootstrap: {bootstrap!: {builder!: #Ref @ref(builder), package?: #PackageSet}, #SourceFields}
}
#Source: or([for _, a in #SourceAlt {a}])

#OsNode: {os!: #Os}
#Os: {
	description!:     #Text
	family!:          #Name
	version?:         #Text
	package_manager!: or(_packageManagerWord)
	container_init!:  #Ref @ref(init) // D-CANDY-3: the os owns the init
	system_init!:     #Ref @ref(init)
	boot?:            #Opaque
}

#OtherBody: {description!: #Text, step?: [...#Step], spec?: #Opaque}

// ── deployments (§12) ────────────────────────────────────────────────────────
#DeploymentFields: {
	description!: #Text
	step?:        [...#RuntimeStep]
	disposable:   *false | bool
	preemptible:  *false | bool
	update_gate:  *"full" | "restart-only" | "skip"
	parallel:     *false | bool
	instrument?:  [...#Opaque]
	iterate?:     #Opaque
	ephemeral?:   {ttl!: #Duration}
	need?:        #Need
	with?:        #With   // supplies the `input:` choices of the candy this deployment names
}
// D-DEP-7: ports, volumes, environment, sizing and network belong to pod and vm only.
#MachineOnly: {
	port?:      [...{host!: #Port, guest!: #Port}]
	volume?:    {[#Name]: {path!: #AbsPath}}
	env?:       {[#EnvName]: #InitNeutral}
	cpu?:       #Count
	ram?:       #Size
	disk_size?: #Size
	network?:   #Text
}

// D-DEP-1, D-DEP-2: pod and vm share one field set and one inner set; no `require` — content
// comes from the box.
#MachineFields: {
	#DeploymentFields
	#MachineOnly
	from!: #Ref @ref(box, source)
	[#InnerNodeName]: #InnerOfMachine
}
#Pod: {#MachineFields}
#Vm:  {#MachineFields, firmware: *"uefi" | "bios" | "uefi-secure"}

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
// D-NEST-2: beside a pod or vm — another pod or vm, or a local that names its host.
#AlongsideAlt: {
	pod:   #PodNode
	vm:    #VmNode
	local: #TopLocalNode
}

#KubernetesFields: { // D-DEP-2: no `require` — clusters do not take candies
	#DeploymentFields
	cluster_node?: {[#Name]: {control_plane: *false | bool}}
	[#InnerNodeName]: or([for _, a in #InnerOfKubernetesAlt {a}])
}
// D-DEP-6: a cluster is created where it is written, or an existing one is connected.
#KubernetesAlt: {
	create:  {create!: "kind" | "k3s", #KubernetesFields}
	connect: {connect!: #Text, #KubernetesFields}
}
#Kubernetes: or([for _, a in #KubernetesAlt {a}])

#LocalFields: {
	#DeploymentFields
	require?: [...#Ref] @ref(candy)
	[#InnerNodeName]: or([for _, a in #InnerOfLocalAlt {a}])
}
#TopLocal:   {host!: #Text, #LocalFields} // D-NEST-6: top level names its host
#InnerLocal: {#LocalFields}               // D-NEST-6: inside a pod or vm it has none

#Android: {
	#DeploymentFields
	require?:   [...#Ref] @ref(candy)
	device?:    #Text
	api_level?: #Count
	adb?:       {address!: #Address}
	[#InnerNodeName]: or([for _, a in #InnerOfAndroidAlt {a}])
}

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
	from!:    #Ref @ref(box, source)   // the agent is deployed FROM a box, like any inner kind
	need?:    #Need
	provide?: #Provide
	spec?:    #Opaque
}

// ════════════════════════════════════════════════════════════════ Part 2 — protocol (§8)
// Moves to spec/protocol when implemented. A word payload (a kind's body, a verb's input, a
// command's arguments, an api's messages, a kind's state and grants) is #Opaque here because the
// owning plugin's CUE module defines it; it is validated against that definition on receipt.

_roleWord: ["kind", "verb", "command", "type", "api"]
#Role:   or(_roleWord)
#Key:    =~"^(\(strings.Join(_roleWord, "|"))):[a-z][a-z0-9_-]*(:[a-z][a-z0-9_-]*)?$" // D-ROLE-6
#ApiKey: #Key & =~"^api:"
#CallId: =~"^[0-9a-f]{32}$"

// ── the audit record (D-AUDIT): the ONE genuine absence. charly logs but had no append-only record
// of an action and its outcome, and — like OCE, whose own RFC-0013 is unimplemented — no read path.
// It carries an AUTHORITY decision too: a decision that leaves no record is unverifiable.
_auditKindWord:    ["mutate", "authorize", "admit", "activate", "teardown"]
_auditOutcomeWord: ["ok", "refused", "failed"]
_detailCodeWord:   ["reason", "path", "field", "ref", "count", "duration"]
#AuditEvent: {
	at!:      #Text
	kind!:    or(_auditKindWord)
	outcome!: or(_auditOutcomeWord)
	// WHO acted — an identity (§2). An authority decision and a mutation name the SAME field,
	// because authority IS the grant of a need.
	identity!: #Ref
	// WHAT was acted on, and the operation — a verb (an observation) or a mutation. Never a foreign
	// system's own verb word (decision 42).
	on?:        #Ref
	operation?: #Name
	// WHERE it held — a namespace, a named scope.
	namespace?: #Namespace
	revision?:  #Digest
	detail?:    [...#AuditDetail] & list.MaxItems(32)
}
#AuditDetail: {
	code!:  or(_detailCodeWord)
	text!:  #Text
	value?: #Redacted
}
// A record can say "a value was here" WITHOUT holding it: an audit that holds a secret is a leak with
// a timestamp.
#Redacted: {redacted!: true}

// What a kind observes: the active revision is a DIGEST, so nothing about it is authored or stored as
// a node (P3). ONE term covers the model — a revision is admitted (validated, no effect) and then
// active; those are STATES of a revision, not separate concepts.
#StatusOutput: {
	state!:    "absent" | "stopped" | "running" | "failed"
	revision?: #Digest
	admitted?: #Digest
	detail?:   #Text
}

// ── messages shared by several methods ────────────────────────────────────────
#Resolved: {kind!: #Name, digest!: #Digest, value!: #Opaque}
#NodeInput: {
	identity!:  #Ref
	body!:      #Opaque
	reference!: {[#Ref]: #Resolved} // the linked references of the node (§4.1 stage 4)
}
#ArtifactRef: {form!: "image" | "disk", digest!: #Digest}
#Done: {}

// The IR (§9.4): one action, tagged by its kind.
#ActionAlt: {
	package:      {package!: #PackageEntry, #ActionFields}
	package_repo: {package_repo!: {name!: #Name, #PackageRepo}, #ActionFields}
	file:         {file!: {path!: #AbsPath, effect!: #File}, #ActionFields}
	service:      {service!: {name!: #Name, unit!: #Service}, #ActionFields}
	user:         {user!: {name!: #Name, spec!: #User}, #ActionFields}
	env:          {env!: {name!: #EnvName, value!: #InitNeutral}, #ActionFields}
	command:      {command!: {run!: #Text, guard!: #Guard, run_as?: #Name}, #ActionFields}
}
#ActionFields: {scope: *"system" | "user"}
#Action: or([for _, a in #ActionAlt {a}])

// ── venues: where commands of a deployment run; `via` is the venue it is reached through ──
#Via: {via?: #VenueOutput}
#VenueOutputAlt: {
	container: {container!: {engine!: or(_engineWord), name!: #Text}, #Via}
	ssh:       {ssh!: {host!: #Text, port!: #Port, user!: #Text, key_secret!: #Ref}, #Via}
	shell:     {shell!: {}, #Via}
	adb:       {adb!: {serial!: #Text}, #Via}
	kube:      {kube!: {cluster!: #Text, namespace!: #Namespace}, #Via}
}
#VenueOutput: or([for _, a in #VenueOutputAlt {a}])

// ── the method table: every method, the role that serves it, its input and output ──
// D-ROLE-1, D-ROLE-2
#MethodIO: {
	validate: {role: "kind", input: #NodeInput, output: {diagnostic: [...#Diagnostic]}}
	resolve:  {role: "kind", input: #NodeInput, output: {value!: #Opaque, digest!: #Digest}}
	migrate:  {role: "kind", input: {identity!: #Ref, body!: #Opaque}, output: {body!: #Opaque, change: [...#Text]}}
	build:    {role: "kind", input: {identity!: #Ref, start!: #ArtifactRef, ir!: [...#Action], form!: "image" | "disk"}, output: {artifact!: #ArtifactRef}}
	realize:  {role: "kind", input: {#NodeInput, artifact?: #ArtifactRef, ir?: [...#Action], parent?: #VenueOutput}, output: {venue!: #VenueOutput}}
	start:    {role: "kind", input: #NodeInput, output: #Done}
	stop:     {role: "kind", input: #NodeInput, output: #Done}
	status:   {role: "kind", input: #NodeInput, output: #StatusOutput}
	// validate without effect, then make it active — the split that makes `admit` real for a venue
	// instead of nominal (decision 21).
	admit:    {role: "kind", input: {#NodeInput, ir?: [...#Action]}, output: {revision!: #Digest, diagnostic: [...#Diagnostic]}}
	activate: {role: "kind", input: {identity!: #Ref, revision!: #Digest}, output: #Done}
	log:      {role: "kind", input: {#NodeInput, follow: *false | bool}, output: #Done}
	venue:    {role: "kind", input: #NodeInput, output: #VenueOutput}
	capture:  {role: "kind", input: #NodeInput, output: {artifact!: #ArtifactRef}}
	grant:    {role: "kind", input: {#NodeInput, need!: #Need}, output: {item: [...{need!: #Text, grant!: #Opaque}]}}
	destroy:  {role: "kind", input: #NodeInput, output: #Done}
	check:    {role: "verb", input: {input!: #Opaque, venue!: #VenueOutput, run_as?: #Name}, output: #CheckOutput}
	run:      {role: "command", input: {argument!: #Opaque}, output: #Done}
	bind:     {role: "type", input: {need!: {type!: #TypeName, name!: #Text, attribute!: #Opaque}, provided_by!: #Ref, deployment!: #Ref}, output: {binding!: #Opaque}}
	unbind:   {role: "type", input: {binding!: #Opaque}, output: #Done}
	call:     {role: "api", input: {request!: #Opaque}, output: {reply!: #Opaque}}
}
_methodWord: [for m, _ in #MethodIO {m}]
#Method: or(_methodWord)

// D-ROLE-5: one observation; core applies the step's modifiers and step-level matchers.
#CheckOutput: {exit_status?: int, stdout?: string, stderr?: string, observed?: #Opaque}

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
	module!:          #Text
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
	state_get:  {input: {identity!: #Ref, name!: #Name}, output: {value?: #Opaque}}
	state_put:  {input: {identity!: #Ref, name!: #Name, value!: #Opaque}, output: #Done}
	project:    {input: {identity!: #Ref}, output: #Resolved}
	config_get: {input: #Done, output: {config!: #Opaque}}
	call:       {input: {key!: #ApiKey, request!: #Opaque}, output: {reply!: #Opaque}}
	secret_get: {input: {name!: #Ref}, output: {value!: bytes}}
	secret_put: {input: {name!: #Ref, value!: bytes}, output: #Done}
	report:     {input: #Event, output: #Done}
	// the transaction state_put cannot be, and the record's write leg
	state_commit: {input: {identity!: #Ref, revision!: #Digest, entry!: [...{name!: #Name, value!: #Opaque}]}, output: #Done}
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
