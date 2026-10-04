# DESIGN.md — OpenCharly architecture

> **Status: normative.** This document and its schema `DESIGN.cue` define how charly, its
> contract module `spec`, its author library `sdk`, every plugin and every candy repository work.
> Code, configuration or documentation that diverges from them is a defect. A deviation amends
> them first, with operator sign-off.
>
> Requirements carry stable IDs (`D-<AREA>-<n>`); every sentence of a requirement is binding. A
> rule is stated in exactly one place; other places cite its ID.
>
> `bash scripts/design-check.sh` proves that this document, `DESIGN.cue` and every example agree
> (Appendix A).

## 1. Purpose and laws

charly composes **candies** into **boxes**, builds boxes into **artifacts**, brings them to life
as **deployments** (pods, VMs, Kubernetes clusters, configured hosts and Android devices), and
proves each result with the **steps** its candies carry. It works on disposable deployments, so a
wrong result costs only a rebuild.

| ID | Law |
|---|---|
| D-LAW-1 | **One concept, one name, one form.** No synonyms, aliases, re-exports, fallback branches, dual code paths, or two authored ways to write one statement. |
| D-LAW-2 | **Nothing dead.** A kind, field, verb, command, definition or plugin with no authored use and no caller does not exist. |
| D-LAW-3 | **Core is a plugin host.** It reads, links, validates, routes, solves and stores. Every concrete kind, verb, capability type and behaviour lives in a plugin (§7.1). |
| D-LAW-4 | **Schema first.** Every shape has one CUE definition written with the patterns of §3.1; parsing, validation and Go code derive from it. |
| D-LAW-5 | **Fail loud at the source.** No hidden default in code, no degrade path, no self-healing, no blind retry or sleep. A default exists only where the schema declares it. A wait is a declared readiness condition with a deadline. |
| D-LAW-6 | **Authored files are input; state is output.** charly writes authored files only through the commands whose purpose is editing them (D-CLI-2). Derived state lives in the state root (§17). |
| D-LAW-7 | **Content addressing.** Cache keys and artifact names are digests of all inputs, never paths, clocks or mutable names. |

## 2. Vocabulary — the closed term registry

These are the only terms for these concepts in code, schema, CLI, labels and documentation.
The "Not" column lists words banned outright: none appears in this document outside this
table, nor in any schema, code or CLI word (`scripts/design-consistency.sh` enforces it, plural
forms included). A registered term has one meaning; a second meaning gets its own term.

| Term | Meaning | Not |
|---|---|---|
| **document** | one `charly.yml` file | — |
| **project** | the documents under one root `charly.yml` with `repo:` | workspace |
| **directive** | a reserved top-level key of the root document: `repo`, `plugin`, `import`, `discover` | — |
| **node** | a named entry in a document, or a named mapping inside a body | entity |
| **identity** | a node's dotted path: `<name>[.<inner>…]` in its project; prefixed with `<namespace>.` when reached through an import | — |
| **kind** | a registered word that, as a key of a node, selects the node's schema and owning plugin | class |
| **candy** | a node with no kind key: a unit of content | layer, metalayer |
| **box** | a candy with `from:`: a stack of candies on a starting point | image-candy, template |
| **stack** | the ordered content of a box: its `from:` chain, then `require:`d candies, inner candies and own fields (D-CANDY-2) | — |
| **source** | a `source:` node: an external starting point with an origin and an `os` | base image |
| **origin** | how a source starts: `oci`, `disk`, `iso` or `bootstrap` | — |
| **os** | an `os:` node: an operating system's family, version, package manager and inits | distro |
| **artifact** | the built form of a box: an **image** (OCI) or a **disk** | — |
| **form** | which artifact a deployment needs: image for `pod` and Kubernetes workloads, disk for `vm` | — |
| **capture** | a box whose `from:` names a deployment: that deployment's checked state | snapshot, golden image |
| **deployment** | a node of a deployment kind: `pod`, `vm`, `kubernetes`, `local`, `android` | fleet, member |
| **host** | a machine charly applies to or runs on: `local` (the one charly runs on) or an ssh name | — |
| **guest** | the system inside a `pod` (container) or `vm` | — |
| **venue** | where a deployment's commands execute: container exec, ssh, host shell, adb, or the cluster API | substrate |
| **workload** | a `pod` or `vm` inside a `kubernetes` node | — |
| **inner node** | a node written inside another node's body | child |
| **alongside node** | a node written beside a `pod` or `vm` kind key | peer |
| **bed** | a deployment with `disposable: true`, proven by `charly check run` | — |
| **roster** | a `check-roster` node: a set of beds run as one gate | — |
| **step** | one entry of a `step:` list: one intent, its verb, modifiers | plan, feature |
| **intent** | a step's kind of work: `run`, `check`, `agent-run`, `agent-check` | — |
| **phase** | when a step runs: `build` (against the artifact), `runtime` (against a running deployment), or `any` | — |
| **verb** | the operation a step performs or observes (`command`, `file`, `http`, …) | probe |
| **operation** | one of a multi-operation verb's choices (`kube: {wait_node: …}`) | — |
| **modifier** | a step field shared by every verb (`id`, `timeout`, `eventually`, …) | — |
| **matcher** | a comparison applied to a result (`{contains: …}`) | — |
| **IR** | the ordered install actions a stack compiles to (§9.4) | emit plan |
| **action** | one IR entry | step kind |
| **capability** | a typed thing a node provides (`provide:`) or needs (`need:`) | — |
| **need** | a `need:` entry; a host need asks the host for hardware or access (§16) | — |
| **grant** | what a deployment kind gives a deployment to satisfy a host need | — |
| **lease** | an exclusive or shared hold on a host resource by a live deployment | reservation |
| **plugin** | a candy with `module:`: the code that serves words | provider, kit |
| **role** | one of the five typed plugin services (§8.2) | seam |
| **method** | one RPC of a role, of the plugin service or of the host service (§8) | — |
| **call** | one core→plugin request: a call header plus one method's input, answered by one reply (§8.5) | invoke, op |
| **host service** | the closed service core gives each plugin (§8.6) | host build seam |
| **registry** | the words of a load and the plugin that owns each | — |
| **tag table** | the definition that holds the alternatives of a key-tagged union, keyed by tag (S4) | — |
| **image registry** | an OCI distribution endpoint images are pulled from and pushed to | — |
| **manifest** | a plugin candy's `provide:` of role words | — |
| **repository reference** | an `import:` or `plugin:` entry: `{repo, release, digest}` or `{path}` | — |
| **namespace** | the alias an `import:` binds a repository reference to | — |
| **release** | a repository's CalVer tag `vYYYY.DDD.HHMM` | — |
| **requirement** | a normative rule of this document, identified `D-<AREA>-<n>` | — |
| **digest** | a sha256 content address | — |

### 2.1 Naming rules

| ID | Requirement |
|---|---|
| D-NAME-1 | Every authored key is singular: kind words, verb words, operation names, directives, field names, capability types, aliases, protocol words. A list-valued field is still singular (`package:`, `step:`). Keys ending in `s` that are singular nouns, names or predicates: `os`, `kubernetes`, `dbus`, `status`, `exit_status`, `process`, `progress`, `run_as`, `address`, `exists`, `contains`, `not_contains`, `matches`, `not_matches`, `equals`, `creates`, `unless`. |
| D-NAME-2 | Keys are lowercase, except environment variable names. Kind words, verb words and node names use hyphens; field names, operation names and capability types use underscores. |
| D-NAME-3 | A name says what the thing is in the user's terms; a tool name appears only as a value (`create: kind`). |
| D-NAME-4 | One term per concept everywhere: CLI, schema, Go identifiers, labels, documentation (§2). |

---

# Part I — The foundation: schema, parsing, validation, generation

## 3. Schema

### 3.1 The schema patterns

Every shape in charly — authored, sent between processes, or stored — is written with these CUE
patterns and nothing else. They come first: the authoring language is designed so every
statement is one of them. A statement that cannot be written with them is redesigned; the schema
is never bent.

| # | Pattern | CUE form | Used for |
|---|---|---|---|
| S1 | **Closed definition** | `#X: {a!: T, b?: U}` | every struct. A definition is closed by CUE, recursively, including the struct literals of its unions; `close()` is never written. A field it does not declare is a `field not allowed` error. |
| S2 | **Named scalar** | `#Name: =~"^[a-z][a-z0-9-]*$"`, `#Port`, `#Size` | every constrained scalar; never an inline constraint at the use site |
| S3 | **Literal enum** | `*"system" \| "user"` inline, or `or(_methodWord)` from a word list | closed sets of values (`*` marks the declared default). A set that tools or documents list is a word list, and the enum is derived from it. |
| S4 | **Key-tagged union** | `#SourceAlt: {oci: {oci!: …, F}, disk: {disk!: …, F}}`, `#Source: or([for _, a in #SourceAlt {a}])` | every "exactly one of". The alternatives live in one tag table whose keys are the tags — the keys the author writes — and the union is derived from it. One entry may be the default: selected when no tag is written, it admits none of the tags (the candy in `#NodeAlt`). The loader dispatches on the tags (D-LOAD-5). |
| S5 | **Named collection** | `service?: {[#Name]: #Service}` | collections whose items have identities and attributes; a set of bare names is a list of unique names (`#PackageSet`); other lists only for ordered data |
| S6 | **Shared fragment** | `#StepFields: {id?: #Name, …}` embedded in S1/S4 | fields shared by several definitions, and only fields every embedder allows; never a validator |
| S7 | **Conditional field** | `if from != _\|_ {#BoxFields}` | fields declared only when another field is present; closedness rejects them otherwise. It adds fields to one concept (a box is a candy, §2); it never defines a second one. |
| S8 | **Reserved-name pattern** | `[#InnerNodeName]: #InnerOfMachine` where `#InnerNodeName` is an S2 scalar excluding field names and kind words | bodies that hold named inner or alongside nodes; the admitted nodes are a tag table keyed by kind word |
| S9 | **Reference field** | `from?: #Ref @ref(box, source)` | every field that names a node; the attribute lists the kinds it may name (`box` = a candy with `from:`). Core reads these attributes to link the project (§4.1 stage 4). |

| Never | Why |
|---|---|
| an open struct anywhere except the one `#Opaque` definition, which marks a field another plugin's schema owns | typos pass silently |
| `close()`, or a forbidden field written as `f?: _\|_` | closedness already rejects an undeclared field, with a message that names it; `_\|_` reports no field name, and `close()` around an embedded definition loses closedness inside comprehensions in CUE v0.17.1 |
| a union written out alternative by alternative, or one whose alternatives differ only by the absence of a field | the tags cannot be read by tools, and a missing required field is incomplete, not false, so such a union never resolves |
| looking up a field that may be absent where a pattern constraint matches it | the lookup is incomplete, not bottom; iterate the fields that are present instead |
| a list of differently shaped items | every item becomes a union; use S5 |
| a validator (`matchN`, a count, a comparison) embedded in a struct literal | it re-opens the closed struct, and an "exactly one of" belongs in S4 |
| a scalar shorthand for a struct | a second authored form (D-LAW-1) |

| ID | Requirement |
|---|---|
| D-PAT-1 | Every schema uses only S1–S9 and nothing from the "never" table. |
| D-PAT-2 | Each kind, verb, origin and capability type is one S1 definition in its owning plugin's CUE module; core composes the document schema from the registry with the same patterns (§3.3). |
| D-PAT-3 | The authoring language follows the patterns: a choice is a key the author writes (S4) — the candy is the default node, selected when no kind key is written — a collection with identities is a map (S5), and no two concepts are told apart by a missing field. |
| D-PAT-4 | Every rule about an authored document or a protocol message is either enforced by the schema — tagged with its ID at its enforcing line, with at least one negative case that fails with its expected error — or indexed in §5.4 with where it is proven. Rules about schemas themselves are proven by gates, not by negative cases: D-PAT-1 on `DESIGN.cue` by the design check (Appendix A.4 check 6), and D-PAT-1..3 on every plugin CUE module by the §22 schema-pattern gate. |

### 3.2 Where shapes are defined

| Shape | Defined in |
|---|---|
| document envelope, step fields, matchers, shared scalars, host-need types | `spec` package `envelope` |
| plugin protocol: method table, plugin service, host service, manifest | `spec` package `protocol` |
| IR, step results, diagnostics, events | `spec` packages `ir`, `result` |
| persisted state: deployment record, bindings, leases | `spec` package `state` |
| OCI label contract | `spec` package `labels` |
| each kind's body, verb input, capability type, api message, command arguments, kind state | the owning plugin's CUE module (§7.1) |

| ID | Requirement |
|---|---|
| D-SCH-1 | Every authored, transmitted or persisted shape is defined once, in CUE. No hand-written Go struct mirrors a CUE definition, and no Go validator restates a schema rule. |
| D-SCH-2 | Schemas are CUE packages in CUE modules: `spec` is one module, every plugin repository is one. A plugin package imports the `spec` packages it uses and never copies a definition. |
| D-SCH-3 | A word's schema lives in the CUE module of the plugin that owns the word (§7.1); core holds none. |
| D-SCH-4 | A definition's doc comments are its documentation; reference docs, CLI help and MCP tool descriptions are generated from them. |
| D-SCH-5 | No schema version stamp exists. Compatibility is CUE unification against the current schema; a removed field is reported by the loader as not a field of its kind, naming the nearest declared field (§4.2 rule 4), and `charly migrate` rewrites it through the owning kind's `migrate`. |
| D-SCH-6 | Kind words, directives, and the field names of every body that can hold nodes are disjoint sets. |

### 3.3 Composition at runtime

1. A plugin's CUE module is published with each plugin release and fetched by digest; a plugin
   compiled into the binary embeds the same module.
2. Core builds one CUE instance from the `spec` packages and every registered plugin's package,
   linked by CUE imports.
3. From the registry, core derives with the patterns of §3.1 the tag tables `#NodeAlt` (the
   candy plus every kind's node definition) and `#StepAlt` (every intent and verb), the unions
   derived from them, and the S8 name scalars.
4. The digest of the composed schema is part of every load key (D-LOAD-4).

## 4. Parsing

The loader is schema-first: every schema is available as data before anything is parsed, so the
loader knows which keys are fields and which fields are references before it reads a body, and
never infers meaning from the shape of a value. YAML is decoded into CUE values with source
positions; every diagnostic carries its `file:line`.

### 4.1 Stages

| # | Stage | Input → output | Owner |
|---|---|---|---|
| 1 | Read | the project root, its `discover:` documents and its `import:` closure (each fetched into the store by digest) → documents | core |
| 2 | Register | the `plugin:` declarations of the project and its imports → each plugin's manifest and CUE module, read as data → the registry | core |
| 3 | Parse | documents + registry → node tree, each node dispatched to its definition by its tags (§4.2, D-LOAD-5) | core |
| 4 | Link | node tree + the `@ref` attributes of the composed schema (S9) → the reference graph, checked and topologically ordered (§5.1) | core |
| 5 | Validate | linked nodes + composed schema → diagnostics (§5.2) | core + kind plugins |
| 6 | Resolve | linked nodes, in reference order → resolved project (§5.3) | kind plugins + core solver |

Stages 1–5 execute no command and expand no variable; the only plugin code they run is the
`validate` method of the kinds in use, whose plugins start with the handshake of §8.4.

### 4.2 Parse rules

1. **Root.** The project root is the nearest directory, from the working directory or `-C`, whose
   `charly.yml` has `repo:`.
2. **Document.** A mapping. Directives are legal only in the root document; every other key is a
   node name. A name defined twice in a project is an error naming both locations.
3. **Node.** A mapping that contains one kind word is a node of that kind: the word is its kind
   key, and every other key beside it is an alongside node (legal only beside `pod` or `vm`).
   A mapping with no kind word is a candy (the default entry of `#NodeAlt`).
4. **Body.** Each key of a body is a field its schema declares, or the name of an inner node whose
   value is a node (rule 3) the body's nesting table admits (§12.2). Anything else is an error
   naming the nearest declared field.
5. **Step.** Dispatched by its intent and verb keys (D-VERB-5).
6. **Output.** An immutable node tree; every body is handed on with its inner and alongside nodes
   removed, so each kind's body schema sees only its own fields, and the kind's nesting
   definition (§12.2) sees only the inner and alongside nodes.

### 4.3 What the loader never does

- merge another file into a project document — machine-wide settings are user configuration
  (§17);
- apply deployment state to the project;
- rewrite bytes before parsing;
- classify a key by the shape of its value;
- consult a word list not derived from the registry.

## 5. Linking, validation and resolution

### 5.1 Linking

1. Every field marked `@ref` contributes an edge from its node to the node it names; a dotted
   name walks into inner nodes, and a namespaced name resolves through its import.
2. Core checks every edge against the kinds the attribute admits (D-VAL-2) and the whole graph
   for cycles (D-VAL-3).
3. The graph orders validation and resolution: a node is handled after every node it references.

### 5.2 Validation

1. Each node is unified with the one definition its tags select (D-LOAD-5); each `provide:`/
   `need:` entry with its capability type.
2. Each kind in use runs `validate` with its linked references for the rules §5.4 assigns to it;
   `validate` returns diagnostics and never mutates.
3. All diagnostics of a load are reported together, each with identity and `file:line`.

### 5.3 Resolution

1. In reference order, each kind's `resolve` returns the node's resolved value and digest.
2. The solver binds every `need:` (§15).
3. The resolved project is a table: identity → (kind, resolved value, digest).

### 5.4 Rules the schema cannot express

Everything else is enforced by `DESIGN.cue`. The rules below need the whole project, the registry
or plugin data. The last column says where the design check (Appendix A) proves a rule on the
examples: `rules.cue`, or `—` when it needs what the examples do not carry, and it is proven by its
owner's tests.

| ID | Rule | Owner | Design check |
|---|---|---|---|
| D-VAL-1 | A candy with content of its own — any field besides `description`, `from`, `require` and the box build settings — carries at least one `check:` step. A box that only composes other nodes, and a capture, are proven by the steps of their stack. | build plugin | `rules.cue` |
| D-VAL-2 | Every reference names a node of a kind its `@ref` attribute admits: `from:` of a candy names a source, box, `pod` or `vm` (a capture); `from:` of a `pod` or `vm` a box or source; `require:` candies; a source's `os:` an `os` node; an `os` node's inits `init` nodes; a bootstrap `builder` a `builder` node; `builder_box` boxes; `agent` references `agent` nodes. A namespaced reference resolves through its import. | core | `rules.cue` |
| D-VAL-3 | References form no cycle. | core | — |
| D-VAL-4 | Import aliases and top-level node names are disjoint. | core | `rules.cue` |
| D-VAL-5 | One release per repository across a load, imports of imports included. | core | — |
| D-VAL-6 | A deployment's form is one the `os` at the end of its box's `from:` chain can produce (§9.2). | build plugin | — |
| D-VAL-7 | A deployment's host needs are kinds of need its deployment kind grants (§16.1). | container plugin, machine plugin, kubernetes plugin, android plugin | — |
| D-VAL-8 | A candy has substance: content of its own, `from:`, `require:` or an inner node. A mapping that holds only a `description` is never a node, so a misspelled field cannot pass as an inner candy. | build plugin | `rules.cue` |

The other requirements that need the whole load are stated where their concept lives and checked
by core: a name defined twice (§4.2 rule 2), an undeclared or unused plugin word (D-PLUG-4,
D-PLUG-6), a registry key with two owners (D-ROLE-4), and a non-first-party kind without its
namespace (D-KIND-1). None of them can be shown by a single example document.

| ID | Requirement |
|---|---|
| D-LOAD-1 | §4–§5 are the only way a project is read. |
| D-LOAD-2 | Field-versus-node classification uses only the schema. |
| D-LOAD-3 | Validation is the composed CUE pass plus §5.4; every load validates every step. |
| D-LOAD-4 | A load result is a store entry keyed by the digests of all documents, imports and schemas. |
| D-LOAD-5 | Every key-tagged union (S4) is resolved by dispatch on the tag keys the author wrote — a node by its kind key, an inner node by its kind key within its parent's nesting table, a step by its intent and verb, a file by its effect — and unified only with the alternative they select. No tag (where the table has no default), or two tags, is reported as "exactly one of: <tags>" at its `file:line`; the loader never reports the failures of alternatives the author did not choose. |

## 6. Code generation

| Output | Generated from |
|---|---|
| Go types | every CUE definition in the module |
| protocol messages, gRPC stubs | `spec/protocol` |
| typed role and api clients and servers (JSON on the wire) | the method table and each api definition |
| the plugin's embedded manifest and CUE module | the plugin candy and its CUE package |
| CLI grammar, MCP tool models | each command's argument definition |
| reference documentation | definition doc comments |

| ID | Requirement |
|---|---|
| D-GEN-1 | One generator produces every output above, run by the same task in every module; it is a pinned tool dependency, never an import. |
| D-GEN-2 | Generated files carry `// Code generated … DO NOT EDIT.`, are committed, and regenerate byte for byte; every repository gates on it. |
| D-GEN-3 | Hand-written Go adds behaviour only, as methods in separate files on generated types. |
| D-GEN-4 | Generated code is never post-processed by text substitution. |
| D-GEN-5 | Anything the runtime can read from the composed schema is read from it, never generated into Go lists. |
| D-GEN-6 | A wire payload is a generated Go type, encoded as JSON and validated against its definition on receipt. |

---

# Part II — Modules and plugins

## 7. Modules

```
spec  ←  sdk  ←  charly (core)
              ←  plugins
```

| ID | Requirement |
|---|---|
| D-MOD-1 | The import graph is exactly the arrows above; plugins never import core; core reaches plugins compiled into the binary only through the generated registry. |
| D-MOD-2 | Every type, function and constant is defined in exactly one module; re-exports and aliases do not exist. |
| D-SPEC-1 | `spec` contains the §3.2 packages and the code generated from them; no mechanism, no hand-written logic beyond behaviour methods on generated types. |
| D-SDK-1 | `sdk` contains `Serve` (the one plugin entrypoint, D-PROTO-1), the role interfaces, the typed host client, the protocol conformance harness (§8.7), and the shared mechanisms: executors (shell, ssh, container, adb), the store and its roots (§17), locks, readiness waits, matchers, repository fetching, CalVer, check sessions and recording. |
| D-SDK-2 | `sdk` contains no domain logic or domain type; each package owns one mechanism, has no package-level mutable state, and has tests that fail without it. |
| D-CORE-1 | Core consists of: the CLI shell and its commands (§7.1), the loader and linker (§4–§5), the registry, one gRPC transport, schema composition and validation, the capability solver (§15), the stage driver (§9.3), the store instance (built on the sdk store, §17), the protocol and host service (§8.3–§8.6), and the MCP server. |
| D-CORE-2 | Core contains no domain data and no kind, verb or capability-type word. Its words are the directives, the four intents, the phases, the modifiers and step-level matchers, the five role words, and the command words §7.1 assigns to it. |
| D-CORE-3 | Core uses no package-level singletons, no `os.Setenv`, no re-execution of its own binary and no fallback branch. |
| D-CORE-4 | Which plugins a release binary embeds is packaging data (`release.yml`), an optimization only: an embedded plugin runs only when a project declares that exact module, release and digest. |
| D-PLUG-1 | One concept is one plugin; a plugin owns its words end to end: schema, migration, validation, behaviour, steps and documentation. |
| D-PLUG-2 | Plugins that differ only in data are one plugin plus data nodes. |
| D-PLUG-3 | A plugin's release is stamped from its repository tag at build time. |

### 7.1 Ownership

Every concept and every word has exactly one owner. Other sections cite this table and never
restate it.

| Concept or word | Owner |
|---|---|
| directives, intents, phases, modifiers and step-level matchers, node tree, linking, registry, solver, the store instance, the protocol (§8.3–§8.6), the host service, deployment locks, the five role words, the MCP server | core |
| the commands that drive nodes through the stage driver: `box build`, `box validate`, `box inspect`, `box list`, `box pull`, `box push`, `box load`, `box reconcile`, and every deployment command of §19 | core |
| the commands that edit authored files: `box new`, `box set`, `box add-candy`, `box rm-candy`, `box write`, `box cat`, `box merge`, `migrate` | core |
| `version`, `help`, `mcp serve` | core |
| the candy body, boxes, sources, the IR and its actions, artifact builds, the `os`, `init` and `builder` kinds | build plugin |
| `pod` (and its grants, its venue, its captures, its container engine) | container plugin |
| `vm`, `local` (and their grants, venues, captures, firmware, the hypervisor) | machine plugin |
| `kubernetes` (clusters, workloads, the `kube` and `helm` verbs, the `helm:` manager) | kubernetes plugin |
| `android` (devices, the `android:` manager, the `adb` and `appium` verbs) | android plugin |
| the system verbs `command`, `file`, `package`, `service`, `process`, `port`, `http`, beds, `check-roster`, `instrument`, `iterate`, the `check` command | check plugin |
| the desktop and device verbs `cdp`, `wl`, `vnc`, `spice`, `dbus`, `record`, `cua`, `jetkvm`, `vision`, `mcp`; the `cua` and `jetkvm` kinds | desktop plugin |
| the `agent` and `pipeline` kinds, the `agent`, `tui`, `pipeline` and `review` commands, the `mcp` and `agent` capability types | agent plugin |
| the `task` kind, `packaging`, the `task`, `secret`, `config`, `cache`, `clean`, `doctor`, `preempt`, `alias` and `release-package` commands, the `env` and `secret` capability types | operations plugin |
| the `skill`, `hook`, `marketplace` and `doc` kinds, the `doc generate` and `marketplace generate` commands | documentation plugin |
| the host-need types `gpu`, `device`, `nesting`, `engine_api`, `mount`, and the `port` capability type | `spec` (envelope), granted by each deployment kind's `grant` |
| which init runs services | the `os` node (container init for `pod`, system init for `vm`) |
| a `<manager>:` package prefix | build-time managers (`npm`, `cargo`, `pip`, `aur`, `flatpak`): a `builder` node, run in the box `builder_box` names or the builder's own box; apply-time managers (`helm`, `android`): the deployment kind |

## 8. Plugin contract and the core↔plugin protocol

Everything charly does beyond reading, linking, validating, routing, solving and storing is served
by a plugin (D-LAW-3). This section is the complete contract between core and a plugin: how a
plugin is declared, started and identified, which methods it serves, what every message looks
like, and what a plugin may ask of core. The messages are defined in `spec/protocol` (`DESIGN.cue`,
protocol part); this section names them and never restates their fields.

### 8.1 Declaration

A plugin is a candy with `module:` (the Go module serving it), at the root of its own repository —
exactly one per repository. Its `provide:` of role words is its **manifest**, the only declaration
of what it serves. A project uses a plugin by naming its repository in `plugin:` (§14).

<!-- example: plugin-candy -->
```yaml
plugin-check:
    description: Beds, check rosters, the check command, and the system verbs.
    module: github.com/opencharly/plugin-check
    provide:
        kind: {check-roster: {}}
        command: {check: {}}
        verb: {command: {}, file: {}, package: {}, service: {}, process: {}, port: {}, http: {}}
    step:
        - check: the check command answers
          command: charly check --help
```

A plugin release publishes three things, all addressed by digest: the plugin candy, its CUE module
(every schema it owns: kind bodies and state, verb inputs and observations, capability types, api
messages, command arguments, migrations), and one binary per platform. The CUE module is **data**:
core reads schemas, `@ref` attributes, command grammars and documentation from it without starting
the plugin (D-LOAD-2).

### 8.2 Roles and methods

Every method, the role that serves it, and its input and output are one table, `#MethodIO`.

<!-- schema: _roleWord col=1 -->
<!-- schema: _methodWord col=3 -->
| Role | Serves | Methods |
|---|---|---|
| `kind` | a kind word; `kind:candy` is reserved for the candy (the node with no kind key) | `validate`, `resolve`, `migrate`; the candy adds `build` (an artifact from a start artifact and an IR); deployment kinds add `realize`, `start`, `stop`, `status`, `log`, `venue`, `capture`, `grant`, `destroy` |
| `verb` | a verb word | `check` |
| `command` | a CLI word | `run` (a bidirectional terminal stream) |
| `type` | a capability type | `bind`, `unbind` |
| `api` | an api name | `call` (the api's messages are a tag table in the owning module, tagged by the api's own method keys) |

Registry keys are `<role>:<word>[:<parent>]`; `<parent>` appears only for a command nested under
another plugin's command. A schema is never a method: it is read from the CUE module.

| ID | Requirement |
|---|---|
| D-ROLE-1 | The five roles and the method table are the whole plugin contract. An optional method is one the plugin leaves out of `describe` for a key; core never calls it, and an authored use that needs it is a validation error. There are no capability flags. |
| D-ROLE-2 | Every method has one input and one output definition in the method table; word payloads inside them are defined by the owning module. A request carries exactly one method key; there is no string operation selector and no multiplexed method. |
| D-ROLE-3 | A verb is something an author writes in a step; a plugin reaches another plugin only through an `api` method, by `Host.call`. |
| D-ROLE-4 | A registry key has exactly one owner; a duplicate is a load error naming both. |
| D-ROLE-5 | A verb performs exactly one observation per `check` call, including the comparisons inside its own input (applied with the sdk matchers). Core applies the step's modifiers (D-VERB-3) and its step-level `stdout`, `stderr` and `exit_status` matchers, once, for every verb. |
| D-ROLE-6 | A registry key is `<role>:<word>[:<parent>]` with a role of the five. |

### 8.3 Process model and transport

| ID | Requirement |
|---|---|
| D-PROTO-1 | One transport: gRPC with two generated services, **`Plugin`** (served by the plugin: one RPC per method of the method table, plus `describe` and `shutdown`) and **`Host`** (served by core, §8.6). Messages are the generated types of `spec/protocol`; word payloads travel as JSON. |
| D-PROTO-2 | An out-of-process plugin is started by core as `<binary> serve` with an **empty environment** plus two variables: `CHARLY_PLUGIN_SOCKET` (where it serves `Plugin`) and `CHARLY_HOST_SOCKET` (where core serves `Host` for this plugin only). Both are Unix sockets in the runtime root, mode `0600`. Nothing else is inherited: not the working directory, not credentials, not the terminal. |
| D-PROTO-3 | A plugin compiled into the binary runs the same generated server over an in-memory listener; the call path, validation and permissions are identical (D-CORE-4). |
| D-PROTO-4 | A plugin process is started on the first call to one of its keys within an invocation, serves concurrent calls, and is stopped with `shutdown` when the invocation ends. It keeps no state of its own between calls: persistent records go through `state_put`, content through `store_put`. If it exits during a call, that call fails with `unavailable` naming the plugin; core does not restart it within the invocation. |

### 8.4 Handshake

1. Core starts the plugin and calls `describe`.
2. The reply (`#DescribeReply`) names the module, the release (absent for a `path:` plugin), the
   source, schema and manifest digests, and the methods implemented per key.
3. Core verifies: the module equals the `module:` of the plugin candy in the declared repository;
   for a `{repo, release, digest}` declaration the release equals it and the source digest equals
   the declared digest, for a `{path}` declaration the source digest equals the digest of that
   directory; the schema digest equals the fetched CUE module; the manifest digest equals the
   plugin candy's `provide:`; every listed key is in the manifest (D-PROTO-5). Any difference
   fails the load, naming the plugin and the differing field.

There is no version negotiation. Compatibility is the validation of every message (D-PROTO-6): a
plugin built against a different protocol shape fails at its first message, naming the field.

| ID | Requirement |
|---|---|
| D-PROTO-5 | The methods `describe` lists for a key are methods of that key's role in the method table. |

### 8.5 Calls

Every call is a `#Request`: a call header (call id, registry key, project digest, remaining
deadline) and exactly one method key holding that method's input. Every answer is a `#Reply`: the
method's output under its method key, or an `#Error`.

| ID | Requirement |
|---|---|
| D-PROTO-6 | Both sides validate every message on receipt against its definition: the protocol part for the envelope, the owning module for word payloads. A message that does not validate is answered with `invalid`, naming the definition and field; it is never coerced. |
| D-PROTO-7 | Errors are `#Error` values with one code from `#ErrorCode`, a message, and the identity and `file:line` they concern. The gRPC status carries the same code. Core reports errors as received and never repeats a call that failed; `unavailable` and `deadline` fail the operation. Re-running a `check` while `eventually` is in effect is observation, not a retry (D-VERB-3). |
| D-PROTO-8 | Every call carries a deadline: the step's `timeout` (declared default `60s`), or the deadline the command's argument definition declares. On deadline or cancellation (Ctrl-C, a failed sibling), core cancels the call; the plugin stops its work, releases what it holds, and answers `cancelled` or `deadline`. |
| D-PROTO-9 | Plugin methods are safe to call concurrently for different identities. Locking is core's alone (D-DEP-4). |
| D-PROTO-10 | Long-running methods (`realize`, `capture`, `log`, `run`, and `venue_exec` on the host side) stream `#Stream` messages on the call: output chunks, terminal resizes, and the exit status. Progress goes through `Host.report` as `#Event`s. A plugin's stdout and stderr are not part of the protocol: core writes them to the invocation log. |
| D-PROTO-11 | Core calls the methods in the stage order of §4.1 and §9.3; a plugin never calls another plugin directly (D-ROLE-3). |

### 8.6 The host service

The host service is the only thing a plugin can reach besides the engine its own deployment kind
drives. It is closed: adding a method amends this document.

<!-- schema: _hostMethodWord -->
| Method | Gives | Permitted when |
|---|---|---|
| `venue_exec` | runs a command in a deployment's venue, through the sdk executor for its `#VenueOutput` (following `via` for a nested venue); streams I/O and returns the exit status | the call being served operates on that deployment or a node inside it, or the step is `on_host` (the host venue) |
| `store_get`, `store_put` | content-addressed store entries (D-STORE-3) | always; entries are immutable |
| `state_get`, `state_put` | the state records of a deployment (D-DEP-5), in the shape the calling kind's module defines | the caller's plugin owns that deployment's kind, under the lock core holds (D-DEP-4) |
| `project` | the resolved value of a node (§5.3) | the node is in the call's project |
| `config_get` | the calling plugin's section of the user configuration (D-STORE-2), e.g. which container engine or hypervisor to drive | always |
| `call` | an `api` method of another plugin | the caller's plugin candy lists that api in `need:` (D-CAP-5) |
| `secret_get` | the value of a secret | the secret is bound to the deployment the call operates on (D-CAP-4), or the caller created it |
| `secret_put` | stores a secret the caller generates for a deployment it owns (an ssh key for its venue) in the configured backend | the caller's plugin owns that deployment's kind |
| `report` | events, progress, diagnostics | always |

| ID | Requirement |
|---|---|
| D-PROTO-12 | Every host request carries the `call_id` of the core call it serves; core derives the caller's plugin from the socket the request arrives on and its permissions from that call, never from anything the plugin asserts. A request outside its permission is answered `denied`. |
| D-PROTO-13 | A plugin reaches secrets, state, the store, the project and other plugins only through the host service, and venues of deployments other kinds own only through `venue_exec`. A deployment kind drives its own engine — the container engine, the hypervisor, the cluster API, adb — directly, at the endpoint `config_get` names. |

### 8.7 Conformance

`sdk` ships the in-memory test harness: it hosts a plugin behind the real host service over
temporary roots, replays the plugin's own steps, and runs the protocol conformance suite (handshake
mismatch, invalid message, deadline, cancellation, denied host request, concurrent calls). Every
plugin repository runs it in CI (§22).

---

# Part III — What authors write

## 9. The model

| Concept | Written as | Definition |
|---|---|---|
| candy | a node with no kind key | content: packages, files, services, environment, steps, capabilities |
| source | `source:` node | an external starting point: one origin plus the `os` it provides |
| box | a candy with `from:` | a stack: the `from:` chain, then `require:`d candies, inner candies and own fields |
| artifact | produced, never written | a box's built form: image or disk (§9.2) |
| deployment | `pod:`, `vm:`, `kubernetes:`, `local:` or `android:` node | a box or source brought to life (`pod`, `vm`), a cluster (`kubernetes`), or candies applied to a host or device (`local`, `android`) |
| capture | a box whose `from:` names a deployment | the deployment's state after its runtime checks pass |
| IR | compiled, never written | the ordered actions a stack compiles to (§9.4) |

### 9.1 `from:`

`from:` names the starting point of a stack, by one node name.

<!-- schema: _deploymentKind -->
| Node | `from:` names | Meaning |
|---|---|---|
| box | a source, a box, or a `pod` or `vm` | start the stack there; from a deployment it is a capture |
| `pod`, `vm` | a box or a source | run that box's artifact (a candy without `from:` has no starting point and is not admissible, D-VAL-2) |
| `kubernetes`, `local`, `android` | — | a cluster is created or connected; candies are applied to a host or device |

### 9.2 One box, two forms

A box is target-neutral; the deployment decides which form is built. The `os` of the stack's
source owns both conversions.

| Origin of the stack's source | Image form (`pod`, workloads) | Disk form (`vm`) |
|---|---|---|
| `oci`, `bootstrap` | the IR applied on the image | the image plus the os's boot content, converted to a disk |
| `disk`, `iso` | the root filesystem exported from the disk, plus the IR | the disk (an `iso` installed first), the IR applied in a disposable build VM |
| a capture of a `pod` | the committed image | as `oci` |
| a capture of a `vm` | as `disk` | the captured disk |

| ID | Requirement |
|---|---|
| D-FORM-1 | A box is realizable in every form the `os` at the end of its `from:` chain can produce; an `os` that lacks the boot content or root-filesystem export for a form produces only the other (D-VAL-6). |
| D-FORM-2 | Every artifact is content-addressed by the digests of its start artifact and its IR (D-LAW-7). |

### 9.3 Realizing: one function

```
build(start artifact, IR, form)            → artifact         (kind:candy, the build plugin)
realize(node, artifact | IR, parent venue) → running venue    (the deployment kind)
capture(deployment)                        → artifact         (the deployment kind)
```

- **build** applies the IR on the start artifact in a disposable build environment of the form
  (a container for an image, a VM for a disk) and produces an artifact;
- **realize** brings a deployment to life from an artifact (`pod`, `vm`), or applies the IR live
  through the parent's venue (`local`, `android`, and inner `local` nodes of a running
  deployment); a nested deployment receives its parent's venue;
- **capture** takes a deployment's state as an artifact (a container commit, or a copy-on-write
  disk state).

The stage driver in core runs these methods for every command, in reference order, under the
deployment lock (D-DEP-4); no command has a private path.

### 9.4 The IR

<!-- schema: keys(#ActionAlt) -->
| Action | Produced by | Scope |
|---|---|---|
| `package` | `package:` (OS manager, or a `<manager>:` prefix, §7.1) | system |
| `package_repo` | `package_repo:` | system |
| `file` | `file:` (a map keyed by literal absolute path, one effect per entry) | system |
| `service` | `service:` (a map keyed by service name) | system or user |
| `user` | `user:` (a map keyed by user name) | system |
| `env` | `env:`, `path_append:` | user |
| `command` | a `run:` step | as its `run_as` |

| ID | Requirement |
|---|---|
| D-IR-1 | The IR is the only representation of what gets installed; build mode and apply mode consume the same IR. |
| D-IR-2 | Every action is idempotent and declares its reverse (or that it has none); a `run:` step declares its idempotence with a `guard` (`creates` or `unless`). Teardown in apply mode replays recorded reverses. |
| D-IR-3 | Every action has golden tests: IR in; rendered build fragment and applied effect out. |
| D-IR-4 | A `file:` entry has exactly one effect — `content`, `copy`, `dir`, `link`, `download` or `extract` — and a `download` or `extract` is pinned by `sha256`. |

## 10. Kinds and directives

<!-- schema: _kindWord -->
| Kind | What it is | Owner (§7.1) |
|---|---|---|
| *(no key)* | candy; a box when it has `from:` (registry key `kind:candy`, reserved) | build plugin |
| `source` | an external starting point (§11.3) | build plugin |
| `os` | an operating system (§11.4) | build plugin |
| `pod` | a rootless container deployment | container plugin |
| `vm` | a virtual machine deployment | machine plugin |
| `local` | candies applied to a host | machine plugin |
| `kubernetes` | a cluster, created or existing | kubernetes plugin |
| `android` | candies applied to an Android device | android plugin |
| `init` | an init system's service rendering | build plugin |
| `builder` | a builder: bootstraps a root filesystem or builds a language manager's packages | build plugin |
| `task` | host steps run by `charly task <name>` | operations plugin |
| `check-roster` | a set of beds run as one gate | check plugin |
| `agent` | an AI CLI invocation used by `agent-run`/`agent-check` | agent plugin |
| `pipeline` | a staged agent and evaluation workflow | agent plugin |
| `cua` | a computer-use driver | desktop plugin |
| `jetkvm` | an IP-KVM device | desktop plugin |
| `skill`, `hook`, `marketplace`, `doc` | harness and documentation inputs | documentation plugin |

Directives: `repo`, `plugin`, `import`, `discover`.

| ID | Requirement |
|---|---|
| D-KIND-1 | The table above is the complete first-party kind set; a non-first-party kind is namespaced; `candy` is never a kind word. |
| D-KIND-2 | Vocabulary data — operating systems, inits, builders — is nodes in the repositories that own it, each piece with exactly one owning node. |
| D-KIND-3 | Every node has `description:`. A node's key is only its name, its identity; prose never goes into a key. A step is the inverse: its intent value is its description and `id:` its identity. |

## 11. Candies, boxes, sources and operating systems

### 11.1 The candy body

<!-- schema: #Candy #BoxFields -->
| Field | Meaning |
|---|---|
| `description` | what the candy is and what its steps prove (required) |
| `from` | boxes only: the starting point (§9.1) |
| `step` | the candy's steps |
| `require` | candies this one is built from, by reference |
| `need` | capabilities it needs (§15) |
| `provide` | capabilities it provides (§15) |
| `package` | packages: OS names, or `<manager>:<locator>` (a set of unique names) |
| `os_override` | per-OS overrides of `package` and `package_repo`, keyed by an `os` family or an `os` node name; the most specific key wins |
| `file` | files by literal absolute path, one effect each |
| `package_repo` | package repositories by name |
| `env` | environment variables (init-neutral values) |
| `path_append` | directories appended to `PATH` |
| `service` | services by name |
| `user` | users by name |
| `volume` | persistent directories by name |
| `route` | an HTTP route to a port of the content |
| `export` | files a deployment hands back to the operator, by name |
| `module` | makes the candy a plugin (§8.1) |
| `packaging` | native-package metadata, owned by the operations plugin |
| `shm_size` | the shared-memory size the content needs |
| `platform` | boxes only: target platforms |
| `builder_box` | boxes only: the box that builds each build-time manager's packages |
| `entrypoint` | boxes only: the image entrypoint |
| `tag` | boxes only: the image tag |

| ID | Requirement |
|---|---|
| D-CANDY-1 | The candy definition is the only gate on candy fields; fields marked "boxes only" are an error on a candy without `from:`. |
| D-CANDY-2 | `require:` holds only candy references. A box's stack is, in order: its `from:` chain, its `require:`d candies, its inner candies, its own fields. An inner candy (a keyless node inside the body) defines content in place and never has `from:`. |
| D-CANDY-3 | A candy never names an init system: service strings and environment values are init-neutral (no `%`-specifiers). The init comes from the `os` (§7.1). |
| D-CANDY-4 | An artifact's labels carry its stack's resolved steps, provides and needs, so a pulled artifact can be checked and wired without its project. |
| D-CANDY-5 | A candy has no authored version: its digest addresses its content, and its human-readable coordinate is its repository release. |

### 11.2 Examples

A candy, and a box built on the Fedora source of the `fedora` repository (imported as in §13.2):

<!-- example: candy-and-box uses-context -->
```yaml
redis:
    description: A Redis-compatible server on 127.0.0.1:6379 that answers PING.
    package: [redis]
    os_override:
        arch:
            package: [valkey]
    file:
        /var/lib/redis: {dir: true, owner: redis}
    service:
        redis:
            exec: /usr/bin/redis-server --bind 127.0.0.1 --port 6379 --dir /var/lib/redis
            user: redis
    provide:
        port: {redis: {port: 6379}}
    step:
        - check: redis answers PING
          phase: runtime
          command: redis-cli -p 6379 ping
          stdout: {equals: PONG}
          eventually: 30s

motd-shell:
    description: A Fedora shell with a login banner.
    from: fedora.fedora-43-image
    motd:
        description: Shows the shell's purpose at login.
        file:
            /etc/motd: {content: "motd-shell: a Fedora shell"}
        step:
            - check: the banner is installed
              file: {path: /etc/motd, contains: motd-shell}
```

### 11.3 Sources

A source has exactly one origin and names its `os` node. The nodes of the `arch` repository:

<!-- example: os-repository -->
```yaml
arch-cloud:
    source:
        description: The official Arch Linux cloud image.
        disk:
            url: https://geo.mirror.pkgbuild.com/images/v20260701.551070/Arch-Linux-x86_64-cloudimg-20260701.551070.qcow2
            sha256: a99844dda491606f81f463ce96851ae03d90ca8fa727671cac2da86a07a7cd61
        os: arch

arch-root:
    source:
        description: An Arch root filesystem bootstrapped with pacstrap.
        bootstrap:
            builder: pacstrap
            package: [base]
        os: arch

arch:
    os:
        description: Arch Linux, rolling.
        family: arch
        package_manager: pacman
        container_init: supervisord
        system_init: systemd

pacstrap:
    builder:
        description: Bootstraps an Arch root filesystem with pacstrap.

supervisord:
    init:
        description: supervisord as the container init.

systemd:
    init:
        description: systemd as the system init.
```

| ID | Requirement |
|---|---|
| D-SRC-1 | A source has exactly one origin. A `disk` or `iso` origin is pinned by `sha256`; an `oci` origin is a tag or a digest, a tag resolves to a digest recorded in state (D-STORE-5), and `charly box reconcile` writes that digest back (D-REF-5). |
| D-SRC-2 | `os:` names an `os` node; the `os` fixes the package manager, the `os_override:` keys that match, both inits, and both form conversions. |

### 11.4 Operating systems

<!-- schema: #Os -->
| Field | Meaning |
|---|---|
| `description` | the operating system |
| `family` | the family name `os_override:` keys match after the node's own name |
| `version` | the OS version, e.g. `"43"` |
| `package_manager` | the OS package manager |
| `container_init` | the `init` node that runs services in a `pod` |
| `system_init` | the `init` node that runs services in a `vm` or on a host |
| `boot` | kernel and bootloader content for the disk form, owned by the build plugin |

## 12. Deployments

### 12.1 Deployment kinds

<!-- schema: _deploymentKind -->
| Kind | Takes | Realization | Venue |
|---|---|---|---|
| `pod` | `from:` a box or source | the image form, run rootless | container exec |
| `vm` | `from:` a box or source | the disk form, copy-on-write | ssh |
| `kubernetes` | `create: kind \| k3s` (made where it is written) or `connect:` an existing cluster (top level only) | a cluster; workloads are inner nodes | the cluster API |
| `local` | `require:` candies; top level names its `host:` | the IR applied to that host | host shell or ssh |
| `android` | `require:` candies | `android:` packages applied to the device | adb |

Every deployment kind takes these fields:

<!-- schema: #DeploymentFields -->
| Field | Meaning |
|---|---|
| `description` | what the deployment is |
| `step` | its steps; they run in the runtime phase (D-DEP-8) |
| `disposable` | `true` authorizes unattended destroy and rebuild (default `false`) |
| `preemptible` | `true` lets a non-preemptible lease stop it (default `false`) |
| `update_gate` | how a fresh rebuild is re-verified (default `full`) |
| `parallel` | realize alongside nodes concurrently (default `false`) |
| `instrument` | recorders attached to the run, owned by the check plugin |
| `iterate` | an agent-driven loop over the run, owned by the check plugin |
| `ephemeral` | a time to live |
| `need` | capabilities, including host needs (§16) |

`pod` and `vm` add these (D-DEP-7):

<!-- schema: #MachineOnly -->
| Field | Meaning |
|---|---|
| `port` | published ports: `{host, guest}` |
| `volume` | persistent directories by name |
| `env` | environment variables of the guest |
| `cpu` | CPU count |
| `ram` | memory size |
| `disk_size` | disk size |
| `network` | the network to join |

Kind-specific fields: `pod` and `vm` take `from`; `vm` adds `firmware` (default `uefi`);
`kubernetes` takes `create` or `connect`, and `cluster_node`; `local` and `android` take
`require`; a top-level `local` takes `host`; `android` takes `device`, `api_level` and `adb`.

| ID | Requirement |
|---|---|
| D-DEP-1 | `pod` and `vm` are written identically: the same `from:`, fields, inner nodes and captures; only `firmware` is specific to `vm`. A pattern that works on one and not the other is a defect in the plugins, never a documented limitation. |
| D-DEP-2 | A `pod`, `vm` or `kubernetes` deployment takes no `require:`; content comes from the box, or from an inner `local` node applied to the running venue. |
| D-DEP-3 | `disposable: true` is the only authorization for unattended destroy, rebuild, or apply-and-reverse; inner nodes inherit it and cannot widen it. |
| D-DEP-4 | Core holds a deployment's lock for the whole of every command that mutates it (its argument definition declares `mutates: true`); every method the command calls runs under that one lock, and a second mutator fails immediately naming the holder. |
| D-DEP-5 | Realized state (resolved ports and images, bindings, leases, reverse records, the kind's own records) lives in the state root (§17), written through `state_put`. |
| D-DEP-6 | A `kubernetes` node either creates its cluster where it is written (`create: kind` or `create: k3s`) or connects to an existing one (`connect:`), never both. |
| D-DEP-7 | Ports, volumes, guest environment, sizing and network belong to `pod` and `vm` only. |
| D-DEP-8 | A deployment's steps run in its runtime phase. |

### 12.2 Nesting: where a node is written is what it means

- **Inside** a body, a named node is part of that node: content composed into it, or a
  deployment realized inside its venue.
- **Beside** a `pod` or `vm` kind key, a named node is an alongside node: its own root, sharing
  the parent's lifecycle and network.

Each body's admitted nodes are a tag table keyed by kind word (`#InnerOfMachineAlt`,
`#InnerOfLocalAlt`, `#InnerOfAndroidAlt`, `#InnerOfKubernetesAlt`, `#AlongsideAlt`). Only
`#InnerOfLocalAlt` and `#InnerOfAndroidAlt` carry a `candy` entry — the default, selected for an
inner node with no kind key; a `pod`, `vm` or `kubernetes` body, and the place beside a `pod` or
`vm` kind key, admit no keyless node.

<!-- schema: _deploymentKind -->
| Written inside a… | Admits | Meaning |
|---|---|---|
| candy or box | candies | content composed into it |
| `pod` or `vm` | `pod`, `vm` | a container on the guest's engine, a VM on the guest's hypervisor |
| `pod` or `vm` | `local` (without `host`) | candies applied live inside the running guest |
| `pod` or `vm` | `kubernetes` with `create` | a cluster on the guest |
| `pod` or `vm` | `android` | a device or emulator reached from the guest |
| `local` | candies, `kubernetes` with `create`, `android` | content applied to the host; a cluster on it; a device reached from it |
| `android` | candies | apps applied to the device |
| `kubernetes` | `pod`, `vm` | a workload, or a KubeVirt VM, in the cluster |
| beside a `pod` or `vm` | `pod`, `vm`, `local` (with `host`) | an alongside root |

A top-level node's place is the host: a top-level `kubernetes` with `create: kind` runs on the
host's container engine; a top-level `local` names its host explicitly.

| ID | Requirement |
|---|---|
| D-NEST-1 | Tree position is the only expression of nesting; one loader function derives it and one walk reads it. |
| D-NEST-2 | Each kind's nesting tables declare what its body admits and what may stand beside it; anything else is an error naming both. Core holds no nesting table. |
| D-NEST-3 | `from:` and `require:` name what a node is built from; they never place a node. |
| D-NEST-4 | A node's identity is its dotted path; every foreign name (container, domain, unit, ssh alias, kube context) is the identity with each dot replaced by `--`. A node name never contains `--`, so foreign names never collide. |
| D-NEST-5 | Inner nodes are realized after their parent and destroyed before it; alongside nodes follow the parent's lifecycle as their own roots, concurrently when `parallel: true`. A nested deployment is realized through its parent's venue. |
| D-NEST-6 | A `local` names its host exactly when it is top level or alongside; an inner `local` applies to its parent and has no `host`. |
| D-NEST-7 | A `kubernetes` node inside another node creates its cluster there; `connect:` exists only at top level. |

### 12.3 Beds and captures

A bed is a deployment with `disposable: true`; `charly check run <bed>` runs its cycle:

| Kind | Cycle |
|---|---|
| `pod`, `vm` | build the artifact → build-phase checks in a disposable realization of that artifact by the same kind → realize → runtime checks → destroy → rebuild fresh → realize → runtime checks → destroy |
| `local`, `android` | apply → checks → reverse (replay reverse records) → apply → checks → reverse |
| `kubernetes` with `create` | create → workloads → checks → destroy → recreate → checks → destroy |
| `kubernetes` with `connect` | apply workloads → checks → delete workloads → reapply → checks → delete workloads |

`iterate:` turns a bed into an agent-driven loop, `instrument:` attaches recorders, and a
`check-roster` runs many beds as one gate. Steps receive `CHARLY_BIN`, the path of the running
charly binary.

| ID | Requirement |
|---|---|
| D-CAPTURE-1 | A capture is taken after its deployment's runtime checks first pass, before any teardown of the cycle; the captured artifact is immutable and outlives the deployment. |
| D-CAPTURE-2 | Realizing a node that starts from a capture realizes the captured deployment first if the artifact does not exist. |
| D-CAPTURE-3 | A capture is deleted only when nothing in state references it. |

### 12.4 Examples

The examples from here on assume the `import:` block of §13.2 and the `plugin:` block of §14.1.

One box as a pod and as a VM — written identically:

<!-- example: pod-and-vm uses-context -->
```yaml
web-shell:
    description: A Fedora shell with search tools and an SSH server.
    from: fedora.fedora-43-image
    require: [devtool.ripgrep, devtool.sshd]

web-shell-pod:
    pod:
        description: The shell as a rootless pod.
        from: web-shell
        port: [{host: 2222, guest: 22}]
        disposable: true
        step:
            - check: sshd listens
              phase: runtime
              port: {port: 22, listening: true}

web-shell-vm:
    vm:
        description: The same shell as a VM.
        from: web-shell
        port: [{host: 2223, guest: 22}]
        cpu: 2
        ram: 2Gi
        disposable: true
        step:
            - check: sshd listens
              phase: runtime
              port: {port: 22, listening: true}
```

The omarchy-eval pattern — install once, check, capture, start every lane from the capture:

<!-- example: capture-lanes uses-context -->
```yaml
omarchy-install:
    description: The omarchy system installed from its ISO, with the charly guest candy.
    from: omarchy.omarchy-iso
    require: [charly.guest]

omarchy-base:
    vm:
        description: Boots the omarchy install and checks it before it is captured.
        from: omarchy-install
        disposable: true
        step:
            - check: the guest is omarchy
              phase: runtime
              command: cat /etc/os-release
              stdout: {contains: ID=omarchy}
              eventually: 300s

omarchy-checked:
    description: The checked omarchy install; every evaluation lane starts here.
    from: omarchy-base

omarchy-lane-edge:
    vm:
        description: An evaluation lane booted from the checked capture.
        from: omarchy-checked
        disposable: true
        step:
            - check: the lane boots
              phase: runtime
              command: uname -n
              stdout: {matches: .+}
```

Starting from charly-generated state — the same pattern for pods and VMs, and across them:

<!-- example: capture-cross uses-context -->
```yaml
dev-pod:
    pod:
        description: The shell as a pod, with its package cache warmed at runtime.
        from: dev-box
        disposable: true
        warmup:
            local:
                description: Warms the package cache inside the running pod.
                require: [devtool.dnf-makecache]

dev-pod-warm:
    description: Capture of the warmed pod.
    from: dev-pod

dev-vm:
    vm:
        description: The shell as a VM, with the same warm-up.
        from: dev-box
        disposable: true
        warmup:
            local:
                description: Warms the package cache inside the running VM.
                require: [devtool.dnf-makecache]

dev-vm-warm:
    description: Capture of the warmed VM.
    from: dev-vm

pod-from-pod:
    pod: {description: A pod from the pod capture., from: dev-pod-warm, disposable: true}
vm-from-pod:
    vm: {description: A VM from the pod capture., from: dev-pod-warm, disposable: true}
vm-from-vm:
    vm: {description: A VM from the VM capture., from: dev-vm-warm, disposable: true}
pod-from-vm:
    pod: {description: A pod from the VM capture., from: dev-vm-warm, disposable: true}

dev-box:
    description: A Fedora shell for development.
    from: fedora.fedora-43-image
    require: [devtool.ripgrep]
```

### 12.5 One bed per deployment kind

**pod** — a box built on another box:

<!-- example: bed-pod uses-context -->
```yaml
overlay-app:
    description: The demo app box with ripgrep added.
    from: demo.app
    require: [devtool.ripgrep]

check-pod-overlay:
    pod:
        description: Checks a box built on another box runs as a pod and survives a fresh rebuild.
        from: overlay-app
        disposable: true
        step:
            - check: ripgrep runs inside the pod
              phase: runtime
              command: rg --version
              stdout: {matches: "^ripgrep [0-9]"}
            - check: charly reports the pod as running
              phase: runtime
              command: ${CHARLY_BIN} status --format json
              on_host: true
              stdout: {contains: '"kind": "pod"'}
              timeout: 300s
```

**vm** — a VM whose guest runs a k3s cluster:

<!-- example: bed-vm uses-context -->
```yaml
check-k3s-vm:
    vm:
        description: Checks a k3s cluster created inside a disposable VM.
        from: arch.arch-cloud
        cpu: 2
        ram: 2Gi
        disposable: true
        step:
            - check: the guest is Arch
              phase: runtime
              command: cat /etc/os-release
              stdout: {contains: ID=arch}
        cluster:
            kubernetes:
                description: A single-node k3s cluster in the guest.
                create: k3s
                step:
                    - check: one node becomes ready
                      kube: {wait_node: {count: 1}}
                      timeout: 300s
                    - check: coredns is ready
                      kube: {wait_ready: {resource: deployment, namespace: kube-system, name: coredns}}
                      timeout: 180s
```

The `kube` steps run against the cluster of the node they are written in; its kube context is
derived from its identity (D-NEST-4).

**local** — candies applied to the host:

<!-- example: bed-local uses-context -->
```yaml
check-host-tools:
    local:
        description: Checks command-line tools applied to this host and reversed again.
        host: local
        require: [devtool.ripgrep]
        disposable: true
        step:
            - check: ripgrep runs on the host
              command: rg --version
```

**kubernetes** — a cluster created with `create: kind` on the host, with a workload inside:

<!-- example: bed-kubernetes uses-context -->
```yaml
check-kind-workload:
    kubernetes:
        description: Checks a box deploys as a workload into a disposable kind cluster.
        create: kind
        cluster_node: {control: {control_plane: true}}
        disposable: true
        app:
            pod:
                description: The workload under test.
                from: demo.app
        step:
            - check: the cluster has a ready node
              kube: {wait_node: {count: 1}}
              timeout: 180s
            - check: the workload is scheduled
              kube: {pod: {namespace: default}}
              stdout: {contains: check-kind-workload-app}
```

**android** — apps applied to a device reached over adb:

<!-- example: bed-android uses-context -->
```yaml
fdroid:
    description: The F-Droid app store.
    package: ["android:https://f-droid.org/F-Droid.apk"]
    step:
        - check: F-Droid is installed
          adb: {shell: pm list packages org.fdroid.fdroid}
          stdout: {contains: org.fdroid.fdroid}

check-android-device:
    android:
        description: Checks an app is applied to a device behind an adb endpoint and reversed again.
        adb: {address: 192.0.2.10:5555}
        require: [fdroid]
        disposable: true
        step:
            - check: the device is visible to adb
              phase: runtime
              adb: {device: {}}
              stdout: {contains: device}
```

## 13. Names, references and fetching

### 13.1 Name forms

| Form | Example | Resolves to | Allowed in |
|---|---|---|---|
| short name | `redis`, `check-k3s-vm.cluster` | a node of this project; dots walk into inner nodes | documents and CLI |
| namespaced name | `devtool.ripgrep` | the node of the repository the `import:` binds to that namespace | documents and CLI |
| repository reference (CLI) | `github.com/opencharly/fedora@v2026.276.1200:workstation` | the node in that repository at that release | CLI only |

| ID | Requirement |
|---|---|
| D-REF-1 | These are the only name forms; a dotted name's first segment is a namespace if one with that name exists, otherwise a node of this project (D-VAL-4). |
| D-REF-2 | A short name never resolves outside its project: no search path, no catalog, no fallback. Outside a project, a short name on the CLI is an error. |

### 13.2 Imports

<!-- example: imports context -->
```yaml
repo: github.com/example/lab
import:
    fedora:
        repo: github.com/opencharly/fedora
        release: v2026.276.1200
        digest: sha256:9a0e77c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f809
    arch:
        repo: github.com/opencharly/arch
        release: v2026.276.1200
        digest: sha256:2d44107f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c56
    devtool:
        repo: github.com/opencharly/devtool
        release: v2026.276.1200
        digest: sha256:4f1c9e2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e
    charly:
        repo: github.com/opencharly/charly
        release: v2026.276.1200
        digest: sha256:0c9e12a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f
    omarchy:
        repo: github.com/opencharly/omarchy
        release: v2026.276.1200
        digest: sha256:7e3b5c9d1f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c
    demo:
        path: ../demo
```

| ID | Requirement |
|---|---|
| D-REF-3 | A repository reference is `{repo, release, digest}` or `{path}`. `repo` is `host/owner/name`; `release` is a tag; `digest` is the sha256 of the release's tree, verified on every fetch. |
| D-REF-4 | An alias names its repository, in the singular; its recommended form is the repository's own name. |
| D-REF-5 | `charly box reconcile` is the only writer of `release`, `digest` and the digests that pin `oci` origins; it prints the diff. |
| D-REF-6 | An imported project resolves its own names through its own imports, which the importer does not see. A released project's references are all `{repo, release, digest}`. |

### 13.3 References on the command line

```bash
charly box build web-shell                                            # short name
charly box build fedora.workstation                                   # namespaced
charly box build github.com/opencharly/fedora@v2026.276.1200:workstation  # a released repository
charly box build opencharly/fedora@v2026.276.1200:workstation         # GitHub shorthand
charly box build opencharly/fedora:workstation                        # newest release; prints it and its digest
charly box build opencharly/fedora@main:workstation                   # a branch, development only; prints the commit
```

| ID | Requirement |
|---|---|
| D-REF-7 | A CLI repository reference is `<repo>[@<release or branch>]:<name>`; `owner/repo` means `github.com/owner/repo`. Without `@…` the newest release is used. Every resolution prints the repository, release or commit, and digest it used. |
| D-REF-8 | A repository reference is accepted wherever the CLI takes a node; there is no `--repo` flag. |

## 14. Plugins declared in `charly.yml`

### 14.1 Declaring plugins

<!-- example: plugins context -->
```yaml
plugin:
    plugin-build:
        repo: github.com/opencharly/plugin-build
        release: v2026.276.1100
        digest: sha256:1b7c00d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9
    plugin-container:
        repo: github.com/opencharly/plugin-container
        release: v2026.276.1100
        digest: sha256:8e2100d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9
    plugin-machine:
        repo: github.com/opencharly/plugin-machine
        release: v2026.276.1100
        digest: sha256:c04d00d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9
    plugin-check:
        repo: github.com/opencharly/plugin-check
        release: v2026.276.1100
        digest: sha256:5a9000d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9
    plugin-kubernetes:
        repo: github.com/opencharly/plugin-kubernetes
        release: v2026.276.1100
        digest: sha256:6b1200d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9
    plugin-android:
        repo: github.com/opencharly/plugin-android
        release: v2026.276.1100
        digest: sha256:9d3400d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9
```

| ID | Requirement |
|---|---|
| D-PLUG-4 | A project declares every plugin it uses in `plugin:` (same shape as an import). The registry is exactly the words of the declared plugins of the project and its imports; an undeclared word is an error at its `file:line`. Placement never changes which plugin runs: a declared plugin runs in-process only on the exact match of D-CORE-4; otherwise it is fetched as a prebuilt binary for the host platform, or built from source for a `path:` declaration. |
| D-PLUG-5 | Commands that run without a project (`secret`, `config`, `doctor` without a node, `clean`, `cache`) use the `plugin:` list of the user configuration, or of the system configuration a native package installs. |
| D-PLUG-6 | `charly box validate` reports every declared plugin, the words it provides, whether each is used, and how it runs; a declared plugin whose words are never used is an error (D-LAW-2). |

### 14.2 A complete project

Everything it uses is declared in it, so a freshly installed `charly` runs it as is.

<!-- example: complete-project -->
```yaml
repo: github.com/example/hello
plugin:
    plugin-build:     {repo: github.com/opencharly/plugin-build,     release: v2026.276.1100, digest: "sha256:1b7c00d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9"}
    plugin-container: {repo: github.com/opencharly/plugin-container, release: v2026.276.1100, digest: "sha256:8e2100d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9"}
    plugin-machine:   {repo: github.com/opencharly/plugin-machine,   release: v2026.276.1100, digest: "sha256:c04d00d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9"}
    plugin-check:     {repo: github.com/opencharly/plugin-check,     release: v2026.276.1100, digest: "sha256:5a9000d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9"}

fedora-43:
    os:
        description: Fedora Linux 43.
        family: fedora
        version: "43"
        package_manager: dnf
        container_init: supervisord
        system_init: systemd

supervisord:
    init:
        description: supervisord as the container init.

systemd:
    init:
        description: systemd as the system init.

fedora-43-image:
    source:
        description: The official Fedora 43 container image.
        oci: registry.fedoraproject.org/fedora:43
        os: fedora-43

hello-web:
    description: A tiny web server on port 8080 that serves a greeting.
    package: [python3]
    file:
        /srv/hello/index.html: {content: hello from charly}
    service:
        hello-web:
            exec: python3 -m http.server 8080 --directory /srv/hello
    provide:
        port: {http: {port: 8080}}
    step:
        - check: the page is served
          phase: runtime
          http: {url: "http://127.0.0.1:8080/", body: {contains: hello from charly}}
          eventually: 30s

hello-box:
    description: Fedora 43 with the hello web server; runs as a pod and as a VM.
    from: fedora-43-image
    require: [hello-web]

hello-pod:
    pod:
        description: The hello box as a rootless pod on host port 18080.
        from: hello-box
        port: [{host: 18080, guest: 8080}]
        disposable: true
        step:
            - check: the page answers on the published port
              phase: runtime
              command: curl -fsS http://127.0.0.1:18080/
              on_host: true
              stdout: {contains: hello from charly}

hello-pod-checked:
    description: Capture of hello-pod after its checks pass.
    from: hello-pod

hello-pod-copy:
    pod:
        description: A second pod started from the capture.
        from: hello-pod-checked
        port: [{host: 18081, guest: 8080}]
        disposable: true

hello-vm:
    vm:
        description: The same hello box as a VM.
        from: hello-box
        port: [{host: 18082, guest: 8080}]
        cpu: 2
        ram: 2Gi
        disposable: true
        step:
            - check: the service runs in the guest
              phase: runtime
              service: {name: hello-web}

hello-vm-checked:
    description: Capture of hello-vm after its checks pass.
    from: hello-vm

hello-vm-next:
    vm:
        description: A VM from the capture, with jq added to the running guest.
        from: hello-vm-checked
        disposable: true
        extra:
            local:
                description: Adds jq to the running guest.
                jq:
                    description: The jq JSON processor.
                    package: [jq]
                    step:
                        - check: jq runs
                          command: jq --version
```

```bash
charly box validate                 # the declared plugins, their words, and how each runs
charly check run hello-pod
charly deploy add hello-vm-next     # realizes and captures hello-vm first if needed
```

---

# Part IV — Runtime, CLI and repositories

## 15. Provides and needs

`provide:` and `need:` map a capability type to named entries (S5). `require:` is composition
(D-CANDY-2), not a capability.

<!-- example: provide-need uses-context -->
```yaml
search-agent:
    description: A workstation that serves a search MCP endpoint and runs a GPU-backed agent.
    require: [devtool.sshd]
    provide:
        env: {SEARCH_URL: {value: "http://127.0.0.1:8811/mcp"}}
        mcp: {search: {port: 8811, path: /mcp}}
    need:
        env: {OPENAI_API_KEY: {}}
        mcp: {docs: {optional: true}}
        secret: {openai-key: {}}
        gpu: {nvidia: {lease: exclusive}}
    step:
        - check: the search endpoint listens
          phase: runtime
          port: {port: 8811, listening: true}
```

<!-- schema: #Need -->
| Need type | Names | Bound by |
|---|---|---|
| `env` | environment variable names | env injection |
| `secret` | secret names | secret file and env injection |
| `mcp` | MCP endpoint names | MCP registration |
| `agent` | `agent` nodes | agent launch |
| `gpu` | `nvidia`, `amd`, `intel`, `any` | lease (§16) |
| `device` | `kvm`, `render`, `fuse`, `tun`, `vhost-net`, `vsock`, `hwrng`, `kfd` | grant (§16) |
| `nesting` | `container`, `vm` | grant (§16) |
| `engine_api` | `podman`, `docker`, `nerdctl`, `libvirt` | grant (§16) |
| `mount` | mount names, each `{host, path, writable}` | grant (§16) |
| `kind` | kind words | plugin wiring |
| `verb` | verb words | plugin wiring |
| `command` | command words | plugin wiring |
| `type` | capability types | plugin wiring |
| `api` | api names | plugin wiring |

<!-- schema: #Provide -->
| Provide type | Names |
|---|---|
| `env` | environment variables, each `{value}` |
| `mcp` | MCP endpoints, each `{port, path}` |
| `port` | listening ports, each `{port, protocol}` |
| `kind` | kind words (a plugin manifest) |
| `verb` | verb words (a plugin manifest) |
| `command` | command words (a plugin manifest) |
| `type` | capability types (a plugin manifest) |
| `api` | api names (a plugin manifest) |

| ID | Requirement |
|---|---|
| D-CAP-1 | A need is required unless it says `optional: true`. |
| D-CAP-2 | Each capability type has exactly one owner (§7.1): a plugin's types are bound through its `type` role; the host-need types and `port` are defined in `spec` and satisfied by the deployment kind's `grant` and port publishing; the role words are satisfied by core's registry. |
| D-CAP-3 | One solver binds every need: plugin wiring, deployment wiring, host needs. An unmet need is an error naming the candidates; two candidates for one need is an error; an unmet optional need is recorded as skipped. |
| D-CAP-4 | Bindings are state, delivered by the type's `bind`; they never appear in an authored file. |
| D-CAP-5 | A plugin calls another plugin's api through `Host.call` only when its candy lists that api in `need:`. |

## 16. Host needs

A deployment gets nothing from its host unless a `need:` in its stack asks for it. A need says
**what** is needed; the deployment kind's `grant` decides **how**, as the minimal grant for that
kind, in tested code.

<!-- example: host-need -->
```yaml
nested-podman:
    description: Rootless podman inside a container.
    package: [podman, fuse-overlayfs]
    need:
        nesting: {container: {}}
    step:
        - check: an inner container runs
          phase: runtime
          command: podman run --rm quay.io/libpod/alpine true

gpu-stream:
    description: Hardware video encoding on a render node.
    package: [gst-plugins-bad-free]
    shm_size: 1Gi
    need:
        device: {render: {}}
        gpu: {nvidia: {lease: shared, optional: true}}
    step:
        - check: the GStreamer encoder is installed
          command: gst-inspect-1.0 nvh264enc

virt-host:
    description: Runs VMs with libvirt inside the deployment.
    package: [libvirt-daemon, qemu-kvm]
    need:
        nesting: {vm: {}}
    step:
        - check: libvirt answers
          phase: runtime
          command: virsh -c qemu:///session list
```

### 16.1 Grants

| Need | `pod` | `vm` | `local` | `android` | `kubernetes` workload |
|---|---|---|---|---|---|
| `device: X` | that device node | the guest's virtio equivalent or passthrough | verified present | — (not grantable) | device-plugin request |
| `gpu` | the leased GPU through CDI | the leased GPU through VFIO | verified, leased | — | resource request |
| `nesting: container` | `/dev/fuse`, `/dev/net/tun`, user-namespace capabilities, unmasked `/proc` | nothing: the guest has its own kernel | verified user namespaces | — | pod security context |
| `nesting: vm` | `/dev/kvm`, `/dev/vhost-net` | nested virtualization CPU mode | verified `/dev/kvm` | — | KubeVirt nested virtualization |
| `engine_api: E` | the socket of E mounted | the socket forwarded through ssh | verified reachable | — | — |
| `mount` | bind mount | virtiofs share | verified present | — | hostPath on a single-node cluster |
| `shm_size` (field) | `/dev/shm` size | guest tmpfs size | — | — | memory-backed `emptyDir` |

| ID | Requirement |
|---|---|
| D-HW-1 | Nothing is granted without a need; detection only answers whether the host can satisfy one. |
| D-HW-2 | The grant of a deployment is the union of the needs of the deployment, its box and all their candies; `charly box inspect` and `charly status` show each granted item and the node that needed it. |
| D-HW-3 | An unmet need fails before anything is realized (D-CAP-3); `charly doctor <node>` reports needs against the host. |
| D-HW-4 | A GPU lease names the concrete GPU the solver chose, and only it is granted; the user configuration lists which host GPUs may be leased; a `preemptible` holder yields to a non-preemptible request. |
| D-HW-5 | No candy, box or deployment carries raw runtime settings (capability lists, security options, device paths, libvirt XML); a grant with no need type is added as a new type by its plugin. |

## 17. Store, state and configuration

| ID | Requirement |
|---|---|
| D-STORE-1 | Four roots, resolved by one sdk package: configuration `$XDG_CONFIG_HOME/charly`, cache `$XDG_CACHE_HOME/charly` (single override `CHARLY_CACHE_DIR`), state `$XDG_STATE_HOME/charly`, runtime `$XDG_RUNTIME_DIR/charly`. |
| D-STORE-2 | The user configuration holds only what the user sets — container engine, hypervisor, secret backend, leasable GPUs, image registry, the project-less `plugin:` list, and each plugin's own section — under its own schema. |
| D-STORE-3 | One content-addressed store holds every cached item: fetched repositories, CUE modules, plugin binaries, load results and artifacts. Entries are immutable, keyed by input digest, published by atomic rename; reads take no lock. |
| D-STORE-4 | A plugin binary's key covers its module source, `go.sum`, the toolchain and the platform. |
| D-STORE-5 | A mutable name (a branch) resolves to a commit before it reaches the store; it re-resolves only on `--refresh`. |
| D-STORE-6 | Stored payloads contain no timestamps or absolute paths unless they are inputs. |
| D-STORE-7 | `charly clean` keeps what state references and evicts the rest within a size budget; locks die with their holder. |
| D-STORE-8 | Tests use injected roots and write nothing outside their temporary directory. |

## 18. Secrets, trust, concurrency

| ID | Requirement |
|---|---|
| D-SEC-1 | Secrets come only from the configured backend; they never enter the store, artifacts, labels, IR, state or output. |
| D-CONC-1 | Any number of sessions run concurrently; shared data is content-addressed or lock-guarded; races are fixed at their cause. |

## 19. Command line

| Group | Commands |
|---|---|
| boxes | `box build <box> [--form image\|disk] [--emit]`, `box validate`, `box new`, `box pull`, `box push`, `box inspect`, `box list`, `box load <box> <deployment>`, `box merge`, `box reconcile`, `box set`, `box add-candy`, `box rm-candy`, `box write`, `box cat` |
| deployments (every kind) | `deploy add`, `deploy del`, `deploy adopt`, `update`, `start`, `stop`, `restart`, `status`, `log`, `shell`, `cmd`, `cp`, `console`, `display`, `service`, `volume` |
| checks | `check box`, `check step`, `check live`, `check agent`, `check run`, `check list`, `check report`, `check note`, `check stop`, `check scope`, `check last-tag`, `check self-evaluate`, `check list-agent`, `check sync-credential` |
| agents | `agent …` (runtime, session, run, followup, steer, dispatch, delegate, team, federation, terminal, incident, rca, recover), `tui` |
| project | `task`, `migrate`, `doc generate`, `marketplace generate`, `review`, `pipeline`, `release-package` |
| host | `secret`, `config`, `cache`, `clean`, `doctor`, `preempt`, `alias`, `mcp serve`, `version`, `help` |

A capture needs no command: building a capture box realizes and checks the captured deployment if
needed, then captures it.

| ID | Requirement |
|---|---|
| D-CLI-1 | One command per operation, valid for every deployment kind; no kind-specific command groups. |
| D-CLI-2 | Only `box new`, `box set`, `box add-candy`, `box rm-candy`, `box write`, `box reconcile`, `deploy adopt` and `migrate` write authored files, and each prints what it changed. |
| D-CLI-3 | Tools inside a deployment are reached with `charly cmd <deployment> <tool>`; there are no first-party per-application commands. |
| D-CLI-4 | Every command supports `--format json`; help and MCP tools are generated from the same command definitions. |
| D-CLI-5 | Every command works with only the `charly` binary installed, for projects whose plugins are released `{repo, release, digest}` references. |

## 20. Verbs

<!-- schema: keys(#Verb) col=2 -->
| Owner (§7.1) | Verbs |
|---|---|
| check plugin | `command`, `file`, `package`, `service`, `process`, `port`, `http` |
| kubernetes plugin | `kube`, `helm` |
| android plugin | `adb`, `appium` |
| desktop plugin | `cdp`, `wl`, `vnc`, `spice`, `dbus`, `record`, `cua`, `jetkvm`, `vision`, `mcp` |

| ID | Requirement |
|---|---|
| D-VERB-1 | A first-party verb observes a system fact or speaks a generic protocol; application-specific checking uses `http` (JSON-path matchers) or `command`. State changes are fields (§9.4); a `run:` step carries only `command`. |
| D-VERB-2 | A verb shares its name with the field whose state it checks (`package`, `service`, `file`). |
| D-VERB-3 | Step modifiers are defined once in `spec`: every step takes `id`, `run_as`, `phase` (default `any`) and `timeout` (default `60s`); checks add `eventually` (re-run the check while its result does not match, until the deadline), `retry_interval` (default `2s`), `on_host` (observe from the host venue), `exit_status` (default `0`), `stdout` and `stderr`. A matcher is exactly one comparison. |
| D-VERB-4 | A verb with several operations takes one operation key (`kube: {wait_ready: …}`), never a `method:` string; operation inputs use plain field names. |
| D-VERB-5 | A step has exactly one intent. A `run` step carries only the `command` verb and its `guard` (D-VERB-1, D-IR-2); a `check` step carries exactly one verb; `agent-run` and `agent-check` carry none. |

## 21. Repositories

| ID | Requirement |
|---|---|
| D-REPO-1 | A repository is a unit of ownership and release, never a unit of content; one concept's plugin code lives in one repository; candies of one family share a repository. |
| D-REPO-2 | Vocabulary data nodes live in the repository of the operating system or domain that owns them. |
| D-REPO-3 | Example plugins live in one examples repository and never ship in a release. |

## 22. Code rules and enforcement

| ID | Requirement |
|---|---|
| D-CODE-1 | D-LAW-5 holds in code: no `sleep` outside the sdk readiness waits, no retry loop, no suppressed error; a gate enforces it. |
| D-CODE-2 | A replaced mechanism is deleted in the change that replaces it; no compatibility file remains. |
| D-CODE-3 | A mechanism is extracted on its second occurrence into the module §7 assigns it to. |
| D-CODE-4 | Comments describe present code; history goes to `CHANGELOG/`. |
| D-CODE-5 | Live boundaries are tested against the real service or skipped visibly. |

CI gates: the import graph (D-MOD-1, D-MOD-2); schema patterns on every plugin CUE module (D-PAT-1..3); no domain words in core (D-CORE-2); manifest ≡
`describe` (§8.4); typed protocol (D-ROLE-2, D-PROTO-6); protocol conformance in every plugin repository (§8.7); generation reproducibility (D-GEN-2); store roots
only via sdk (D-STORE-1); test roots (D-STORE-8); no unused kinds or fields (D-LAW-2); the
deployment conformance bed (every deployment kind: realize, venue exec, service start, port
binding, need grants, destroy, fresh rebuild; every box as both `pod` and `vm`); and
`bash scripts/design-check.sh` (Appendix A).

---

## Appendix A — `DESIGN.cue` and the design check

### A.1 What is checked, and why

This document and `DESIGN.cue` state the same design twice: once in prose and tables for readers,
once as schema for machines. Two statements of one thing drift unless something compares them.
The design check is that comparison. It runs locally and on demand — there is no CI gate — and a
change to `DESIGN.md`, `DESIGN.cue`, `TODO.md` or the check itself lands only with its output on
the final committed tree pasted into the PR body. It relies on CUE v0.17.1 alone; no Go, Python or
other toolchain is needed.

`DESIGN.cue`, beside this document, is the single copy of the schema, in two parts: the authoring
schema of Part III, and the core↔plugin protocol of §8. It is written with the patterns of §3.1.
When implemented, its definitions move into their owning modules (§3.2, §7.1). Any document can be
validated with `cue vet -d '#Document' DESIGN.cue charly.yml`.

| File | Role |
|---|---|
| `DESIGN.md` | the design, normative |
| `DESIGN.cue` | the schema, the single copy |
| `scripts/design-check.sh` | runs every control below, in order; the one command to run |
| `scripts/design-cue.sh` | provides the pinned CUE v0.17.1 |
| `scripts/design-consistency.sh` | compares DESIGN.md with DESIGN.cue |
| `scripts/design-examples.sh` | validates every example and every negative case |
| `scripts/design-selftest.sh` | proves that the two checks catch what they claim to |
| `design/example/load.cue` | the loader's view of a document (§4.1 stage 3, D-LOAD-5), in CUE |
| `design/example/rules.cue` | the §5.4 rules that a single document can show, in CUE |
| `design/negative/*.yaml` | one document per rule that breaks exactly that rule |
| `design/consistency/selftest.tsv`, `design/example/selftest.tsv` | the planted defects of the self-tests |

### A.2 `scripts/design-check.sh`

```bash
bash scripts/design-check.sh
```

Runs, in order, and stops at the first failure: the toolchain (A.3), the consistency check (A.4),
the example check (A.5), and the self-test of each check (A.6). It has no logic of its own; each
control lives in exactly one script.

### A.3 `scripts/design-cue.sh` — the toolchain

Prints the path of a CUE v0.17.1 binary; every other script obtains `cue` through it. It uses `cue`
from `PATH` only if `cue version` reports exactly `v0.17.1`. Otherwise it downloads the release
archive for the host platform into `$XDG_CACHE_HOME/charly/tool/cue/v0.17.1/`, verifies its sha256
against a table pinned in the script (the digests GitHub publishes for the release assets), checks
that the unpacked binary reports `v0.17.1`, and publishes it into the cache with an atomic rename.
A digest or version mismatch fails; there is no fallback to another version.

### A.4 `scripts/design-consistency.sh` — DESIGN.md ↔ DESIGN.cue

Six checks. Each failure names the file, the line, and the two disagreeing sides.

1. **Tables.** A table whose content mirrors the schema is preceded by a marker:

   ```text
   <!-- schema: <source> [<source> …] [col=N] -->
   ```

   The table's column `N` (default 1) must list, as backticked words, exactly the names of the
   sources, in both directions. A source is a struct definition `#Def` (its field names), a word
   list `_word`, or `keys(#XAlt)` (the tags of a tag table). Field names come from
   `cue exp gengotypes`, the generator of §6, whose Go structs carry every field, optional ones
   included, as `json` tags; the CUE language itself cannot enumerate optional fields. A marker
   with no table under it fails; marker-shaped lines inside fenced code are illustrations and
   are skipped. An unmarked table whose backticked first column equals the names of any source
   (any struct definition, word list or tag table of DESIGN.cue) fails too, so a table cannot
   mirror the schema without being checked.
2. **Word lists and references.** The word lists in `DESIGN.cue` that mirror definitions —
   `_candyField`, `_deployField`, `_directiveWord` — equal the fields of those definitions; and
   every kind list of an `@ref` attribute (S9) in `DESIGN.cue` equals a `want:` list of
   `design/example/rules.cue`, in both directions, so the executable reference rule cannot drift
   from the schema.
3. **Rules.** Every `// D-…` tag in `DESIGN.cue` names a requirement of this document and has a
   negative case. Every negative case names a tag or a §5.4 rule. The rules `rules.cue` emits are
   exactly the §5.4 rules whose "Design check" column says `rules.cue`; each has a negative case,
   and every owner a §5.4 rule names is an owner in the §7.1 table. The check proves traceability — a tag, a case and an expected error that belong
   together — not that the tagged line is the whole enforcement; that is what review of the tag
   and the case's expected text is for.
4. **Identifiers.** Requirement IDs are unique and numbered `1..n` per area in order of
   appearance. Every ID mentioned in DESIGN.md, TODO.md, DESIGN.cue and the `design/` files —
   ranges `D-X-a..b` included — is defined here, and every `§` reference in DESIGN.md, TODO.md
   and DESIGN.cue names a section.
5. **Words.** No "Not" term of the §2 registry, nor its plural, appears outside §2, in this
   document or in DESIGN.cue (only the text is matched, never a file path). A backticked protocol
   method is spelled as its word list spells it. Every key in DESIGN.cue — fields, tag-table
   keys, word lists — is singular: a key ending in `s` must be one of the singular nouns and
   predicates listed in D-NAME-1. Every schema-pattern reference `S<n>` in DESIGN.md, DESIGN.cue
   and TODO.md names a pattern §3.1 defines, and a range `S1–S<n>` ends at the last one. Kind
   words, directives and the field names of node-bearing bodies are disjoint (D-SCH-6).
6. **Patterns (D-PAT-1).** `DESIGN.cue` contains no `close(`, no `matchN`, no forbidden field
   written as `?: _|_`, and exactly one open struct `{...}` — the `#Opaque` definition.

### A.5 `scripts/design-examples.sh` — examples and negative cases

**Examples.** Every fenced YAML block of this document starts with ```` ```yaml ```` at the start
of a line and is preceded by a marker naming it:

```text
<!-- example: <id> -->               a complete document
<!-- example: <id> context -->       part of the shared project
<!-- example: <id> uses-context -->  a fragment of the shared project
```

A YAML block with no marker, a ```` ```yml ```` fence and an indented YAML fence each fail the
check, so no example escapes validation; example IDs are unique. Each `alone` and `context`
example is a document of its own. The `context` blocks (the imports of §13.2 and the plugins of
§14.1) and every `uses-context` block together form **one** project, validated as one document —
so a name defined twice across examples is caught as in a real project. Every document is extracted into a temporary directory — no copy is kept — and must
pass three stages:

1. **The loader's view** (`design/example/load.cue`), as §4.1 stage 3 and D-LOAD-5 specify: the
   directives are checked against the envelope; each top-level node is unified with the one
   entry of `#NodeAlt` its kind key selects (the candy when it has none); each inner or
   alongside node of a kind body with the one entry of that body's nesting table its kind key
   selects; each step of a top-level node or of its kind body with the one `#StepAlt` entry its
   intent and verb keys select. Two kind keys, a node a body does not admit, and a step with no
   intent, two intents or the wrong number of verbs are reported as "exactly one of …".
   Diagnostics therefore name the field that is wrong in the alternative the author chose.
   Deeper nodes and their steps are unified through their parent's definition: CUE cannot
   recurse over arbitrary data, so the dispatch stops at that depth, and the negative cases below
   it assert the field CUE reports. The loader in core dispatches at every depth.
2. **The root union.** `cue vet -d '#Document'` must give the same verdict. This proves that the
   one-line command of A.1 and the loader's view agree, and it covers nested nodes completely.
3. **Whole-document rules** (`design/example/rules.cue`): the §5.4 rules whose "Design check"
   column says `rules.cue` (A.4 check 3 keeps the two in step), over top-level nodes and the
   candies one level inside them; references are walked through up
   to three dotted segments, and a namespaced reference to its import namespace. The check fails
   on any entry in the resulting `violation` list and prints each with its node.

**Negative cases.** Each `design/negative/*.yaml` is a minimal document that breaks exactly one
rule, with a header:

```text
# rule: D-…        the rule it breaks: a DESIGN.cue tag or a §5.4 rule
# expect: <text>   text the failure must contain
# def: #Request    optional: validate against this definition instead (protocol messages)
```

A §5.4 case must be rejected by `rules.cue` with a violation of its rule. A protocol case must be
rejected by `cue vet -d <def>`. Any other case must be rejected by the loader's view and by the
root union. In every case the output must contain the expected text, so a case rejected for an
incidental reason — not the rule it claims — fails the check.

### A.6 `scripts/design-selftest.sh` — proving the checks

```bash
bash scripts/design-selftest.sh scripts/design-consistency.sh design/consistency/selftest.tsv
bash scripts/design-selftest.sh scripts/design-examples.sh    design/example/selftest.tsv
```

A check that has never failed proves nothing. Each row of a self-test table names a file, a `sed`
expression that plants one defect in a copy of the repository, and the text the check must report.
The self-test runs the check on the copy and requires it to fail with that text; an edit that
changes nothing, a defect the check misses, or a failure without the expected text fails the
self-test. Every check of A.4 and every stage of A.5, and every kind of defect this appendix says
a check catches, has at least one row.

### A.7 Changing the design

A change is made in this order, in one change: `DESIGN.cue` first, then the examples and negative
cases, then the prose, then `bash scripts/design-check.sh` until it passes. A new rule the schema
enforces gets a tag and a negative case; a new rule it cannot express gets a §5.4 row naming its
owner and where it is proven; a new mechanism of the check gets a self-test row.
