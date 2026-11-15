# Schema ownership — RCA and RDD

**Status:** diagnosis + design, awaiting the operator's go-ahead on the ordering.
**Measured on:** umbrella `7b3cad5`, spec `57affb9` (after `spec#304` unit 8).
**Prompt:** the operator's ruling — *"deciding that something isn't movable is never an acceptable
outcome; the question must ALWAYS be how to fully implement DESIGN.md"* and *"fix or clarify any
issues you find in DESIGN.md, but never ever reduce its scope and goals."*

This document exists because the last three units of `spec#304` were framed as *"candy — cannot
move"*, *"deploy — a legitimate keeper"*, *"android — the last moveable one"*. Three measurements
(one per unit, run in parallel) produced those verdicts. This RCA shows that two of them were
wrong, that the third was incomplete, and that all three share one root cause which no per-kind
fix can remove.

---

## 1. Root cause analysis (the 8 steps)

### 1.1 Expected behaviour

`DESIGN.md` states the ownership law in four places, and they agree:

- **§10.2** (the shape→home table): *"each kind's body, verb input, capability type, api message,
  command arguments, kind state → **the owning plugin's CUE module (§3.1)**"*.
- **D-SCH-3**: *"A word's schema lives in the CUE module of the plugin that owns the word (§3.1);
  **core holds none**."*
- **D-CORE-2**: *"Core contains no domain data and no kind, verb or capability-type word."*
- **D-PLUG-1**: *"One concept is one plugin; a plugin owns its words end to end: schema, migration,
  validation, behaviour, steps and documentation."*

And §3.1's ownership table assigns the words concretely. The rows that matter here:

| word / concept | owner per §3.1 |
|---|---|
| **the candy body, boxes, sources, the IR and its actions**, the `os`, `init` and `builder` kinds | **build plugin** |
| `pod` (grants, venue, captures, engine driver rows) | container plugin |
| `vm`, `local` (**and their … firmware, the hypervisor driver rows `libvirt`, `qemu`, `krun`, `firecracker`**) | machine plugin |
| `kubernetes` (clusters, workloads, cluster driver rows) | kubernetes plugin |
| `android` (devices, manager, appium verb) | android plugin |
| the capability table (`_capability`) | `spec` (envelope) |
| IR, step results, diagnostics, events | `spec` packages `ir`, `result` |
| persisted state: deployment record, bindings, leases | `spec` package `state` |
| the OCI label contract | `spec` package `labels` |

So the expected end state is precise and checkable: **every authored body lives in the CUE module
of the plugin §3.1 names for it; `spec` holds only the shapes §10.2 assigns it (envelope,
protocol, IR, state, config, labels, capability table).**

### 1.2 Actual behaviour

Eight units moved nine bodies. The measured end state ([inventory run, §6](#6-the-measured-inventory)):

- **9 of 31 kind words** have their body in the owning plugin.
- **10 entities still carry an authored TYPE on the wire** — `deploy` (+ `check`, which *is*
  `#Deploy`), `candy`, `box`/`image`, `builder`, `agent-team`, `pod` (`#PodSidecar`), `vm`
  (seven authored sub-defs, incl. the sixty-def `#Libvirt*` family), `distro` (ten sub-defs),
  `init` (`#InitServiceSchema`), and `#BoxMetadata`'s `#CandyHook`.
- Two kind words (`candy`, `android`) are gated by a **generated base map** (`spec.KindValueDefs`)
  rather than by a plugin declaration.
- Two moved kinds (`kindcluster`, `firecracker`) have **no `cueKindDefs` entry**, so their
  declared-field floor is `nil` and an unsafe value-shape fallback is re-armed.
- Four defs (`#VmBackendNameWord`, `#VmCloudInitWord`, `#VmSmbiosWord`, `#VmStrategyWord`) are
  **proven dead**: zero CUE citations, zero Go consumers, pinned only by a test whose own comment
  asserts a citer that does not exist.
- At least one **stale claim**: `spec/schema/node.cue:94-102` still says `#Vm` is "KEPT … they
  still generate `spec.Vm`", which `spec#321` made false.

### 1.3 Mechanism — how the actual state was produced

The cutover had a correct mechanism available and applied it **per kind, opportunistically**:

1. For a kind whose envelope could be pointed at bytes (`#<Kind>ResolveInput` + `#Resolved<Kind>`
   + `raw`), the unit moved the body and left the wire carrying bytes. Those nine worked.
2. For a kind whose **wire def named the authored type** (`#StandaloneLoad.candy?: #Candy`,
   `#StandaloneLoad.box?: #Box`, `#StandaloneLoad.deploy?: #Deploy`, and fourteen `#Deploy`
   sites besides), the unit had two options: **change the wire** (a contract-shape change with a
   blast radius nobody had measured) or **leave the body in place and record a "keeper"**. Every
   time it faced that choice it took the second — and then justified the second with the citation
   count that the first had produced.
3. The "keeper" verdicts were therefore **observations of the old wire**, not decisions about the
   design. `#Deploy`'s "849 non-test Go references / 17 contract citations" is a true measurement
   of *the cost of the old wire*, and it was read as a property of the word.
4. The same error appears in the twins: `#CandyValue: (*#Candy | #Image)` sits in
   `spec/schema/node.cue` and is the reason `sdk/loaderkit` **panics at init** if `#Candy` leaves.
   The panic is not a law of nature; it is this repo's own table naming a def it should not name.

### 1.4 The missed control

**No control compares `spec`'s CUE against §3.1's ownership table.** `scripts/design-dpat.sh`
proves form (D-PAT-1, D-PAT-3) and D-PAT-2's *one-name-one-home* half — its own header says it
declines the ownership half. `design-cite.sh` proves a ledger row still holds its anchor.
`design-consistency.sh` proves DESIGN.md↔DESIGN.cue prose tables. Nothing answers
*"is this def in the module its §3.1 owner names?"*.

The gap is already registered as a known risk: `PROGRAM/design-implementation.md:282` (risk A-5)
records *"`#TaskParamSpec` had to stay in `spec` because a sibling plugin cites it; no gate
reports it."* The programme has been running with a **judgement where a check belongs**, which is
exactly how ten entities drifted.

### 1.5 Blast radius

- **Scope:** 10 entities / ~9 kind words still carry authored types on the wire; 22 of 31 kind
  words have no §3.1-compliant home yet for at least one of their shapes.
- **Contract size:** `spec/schema` holds 646 top-level defs; the parts §3.1 assigns to plugins
  include the candy body (666 lines), the distro family, the init/builder kinds, the `#Libvirt*`
  family (60 defs), and `#Deploy` (1,117 lines in `deploy.cue`, of which 45 defs of which 33 are
  file-private and 12 are shared).
- **Every future unit** inherits the judgement: without the check, the next kind with a typed arm
  will be declared "a keeper" by the same reasoning.
- **Two real defects are live today**: the `loaderkit` init panic (a landmine under any future
  candy move) and the missing floor for `kindcluster`/`firecracker` (the sdk#221/#223/#225
  regression class).

### 1.6 Root cause

> **The cutover treated the wire's shape as a constraint on the kind, instead of as part of the
> cutover. The mechanism for a uniform wire (bytes + envelope projection) existed and was
> documented, but it was applied only where it was already convenient — so every kind whose wire
> carried its authored type was left in `spec` and named a "keeper", and no control could tell
> the difference between a designed home and a deferred one.**

### 1.7 Root fix (the subject of §2–§5)

Not "move more bodies". **Make the wire uniform, and make ownership mechanically checked**:

- **one invariant** — no authored body type appears in a wire def; the wire carries bytes, and
  gates are declared by the owning plugin and resolved from the composed schema;
- **one acceptance test** driven by the registry (not by a hand-list of kinds), so a new kind
  fails until it complies;
- **one ownership checker** that reads §3.1 and the pinned CUE module graph and prints, per def,
  `KEEPER (with witness) | MOVE (with its §3.1 owner) | NOT_JUDGED (spec-owned shape)`;
- **then** the per-word moves become mechanical — including `candy`, `box`, and every word §3.1
  assigns to a plugin.

### 1.8 Classification

**Blocking for the programme.** `TODO.md` row 11.1 requires every §25 gate and DESIGN.md
"fully realized"; a contract that holds ten plugin-owned bodies and a checker that cannot see them
is not realized. This RCA does not defer a single word; it re-scopes the remaining work to what
§3.1 actually says, and it removes the *category* that let the work stop.

---

## 2. The normative basis, quoted once

Everything below follows from these lines; none of them is new policy.

| source | line |
|---|---|
| DESIGN.md §10.2 | "each kind's body, verb input, capability type, api message, command arguments, kind state → the owning plugin's CUE module (§3.1)" |
| D-SCH-1 | "Every authored, transmitted or persisted shape is defined once, in CUE." |
| D-SCH-2 | "A plugin package imports the `spec` packages it uses and never copies a definition." |
| D-SCH-3 | "A word's schema lives in the CUE module of the plugin that owns the word (§3.1); core holds none." |
| D-SCH-5 | "Compatibility is CUE unification against the current schema; a removed field is reported by the loader" |
| D-MOD-2 | "defined in exactly one module; re-exports and aliases do not exist" |
| D-CORE-2 | "Core contains no domain data and no kind, verb or capability-type word." |
| D-PLUG-1 | "a plugin owns its words end to end: schema, migration, validation, behaviour, steps and documentation" |

**The one-way import is what makes the wire the crux.** A plugin may cite `schema.#X`; the
contract may never cite a plugin def (D-SCH-2/D-MOD-1). So the moment a contract *wire* def cites
an authored body, only two outcomes exist:

- the body stays in `spec` (a designed home if §10.2 assigns it there — IR, state, labels,
  envelope, capability table — otherwise a **deferral**), or
- the wire stops citing it (bytes), and the body moves to its §3.1 owner.

There is no third outcome. The programme has been producing the third.

---

## 3. The design: DECLARED-GATE / OPAQUE-BODY

Five invariants. Each one is a place the tree currently permits divergence.

### I1 — the wire carries bytes or a §10.2-owned shape, never an authored body type

`#StandaloneLoad` today has four arms and three carrier shapes:

```cue
#StandaloneLoad: {
	template?: bytes                 // substrate templates
	deploy?:   #Deploy               // authored type
	box?:      #Box                  // authored type
	candy?:    #Candy                // authored type
}
```

Becomes one carrier plus the shapes §10.2 assigns to `spec`:

```cue
#StandaloneLoad: {
	shape!:  string @go(Shape)
	body?:   bytes  @go(Body,type=RawBody)           // every authored body
}
```

`#Deploy` leaves the wire **not because it is inconvenient, but because it is a kind body**
(§3.1: the deployment kinds own their kind state; the IR lives in `spec`'s `ir` package as a
*projection*, not as the authored node). If the operator prefers to classify `#Deploy` as IR, the
same change carries a `#DeployView` projection in `spec/schema/ir`-equivalent and the authored
node moves to its owner. **Either way the wire stops carrying it** — that is the invariant, and it
is decidable without a judgement call.

### I2 — the gate is DECLARED by the owning plugin

`plugin-substrate/plugin.go:121-129` already declares `#PodValue` … `#VmValue` as `InputDef`s,
each defined in that plugin's `schema/*.cue`. Every `class:kind` provider must do the same;
`plugin-candy-kind/plugin.go:58` declaring `{Class:"kind", Word:"candy"}` with **no** `InputDef`
is the violation.

### I3 — the host resolves that gate from the COMPOSED schema, with no base fallback

`kindValueDefValue` already resolves composed-first (`provider_kind_invoke.go:454-486`); the
permission slip is `kindValueDefPath:431-441` falling through to the generated base map
`spec.KindValueDefs` (`spec/spec/vocab_gen.go:281-284`). Delete the map and the fallback: an
undeclared kind then **cannot validate at all**, which is the intended failure.

### I4 — the gate is process-blind

`sdk/loaderkit/node_validate.go:103` resolves `#CandyValue` from the loader's *private base copy*,
and the branch is hard-coded to `pn.Disc == "candy"` (`:70-104`) — a kind literal inside the SDK.
That single branch is why candy alone cannot leave `spec/schema`; `charly box validate` runs in
`plugin-box`, a different process that cannot see `pluginSchemas`.

**Fix:** `spec.Threaded` gains `KindGates map[string]KindGate` carrying the def path **plus the
served CUE source text**; the loader compiles that source in its own context and gates with it.
Clause-D data, no registry query, no base fallback, and no second private opinion about a kind.

### I5 — ownership is checked, not judged

A new `scripts/check-schema-ownership.mjs`, in `charly task verify`, reads §3.1's table and the
pinned CUE module graph **from each repo's object store at its gitlink** (never a checkout) and
prints per def:

- `NOT_JUDGED` — the def's shape is a §10.2 `spec`-owned one (envelope, protocol, IR, state,
  config, labels, capability table, `@vocab(spec)` table).
- `KEEPER (witness §)` — at least one citation that **cannot be re-pointed by editing one module
  without violating the import graph**: K1 the contract's own resolve/load envelope cites it; K2
  `spec`'s own generator extracts it by name; K3 a sibling plugin's CUE cites `schema.#X`; K4 two
  Go packages on opposite sides of a plugin boundary exchange it as an RPC payload.
- `MOVE (owner §3.1)` — none of the above: the def belongs in the module of the plugin §3.1
  names for its word, and the checker names that plugin.
- `UNJUDGEABLE (not pinned)` — the owning repo is not a submodule; named, never silently green.

**Census direction matters:** a `KEEPER` whose witnesses all disappear **fails** (a keeper with no
citer must be deleted), and a `MOVE` that has not happened is listed with its owner. That reverse
direction is what catches the four dead `#Vm*Word` re-exports.

The four signals are exactly the cases the three measurements hit, and each excludes a class the
briefing wrongly counted as evidence: test-only cites, comments, twin disjuncts, and a single Go
consumer are **not** keeper evidence — the twins are what leave (`#PodValue: (#Pod |
schema.#DeployValue)` now lives in the plugin), and `#KubevirtSource` **moved** despite being a
kind-named def.

### The one acceptance test

`charly/charly/kind_wire_uniformity_test.go::TestEveryKindDeclaresItsGateAndRidesOpaqueBytes` —
one test, registry-driven, no per-kind list:

1. every registered `class:kind` provider declares a non-empty `InputDef` matching `#<Word>Value`;
2. that def resolves in `composedSchema()` **and not** in `sharedCueSchema()` (the no-base-twin
   tooth);
3. `#StandaloneLoad`'s compiled field set is exactly `{shape, body}` and every non-scalar field is
   `bytes` (the wire tooth — a quiet typed arm fails);
4. `spec` declares no `#<Word>Value` and no authored `#<Word>` body for any word a plugin serves —
   driven by the registry, so a new kind is covered without editing the test;
5. a negative control: a stub provider with `InputDef:""` must be rejected by `kindValueDefPath`
   with the documented error.

Paired process-boundary arm (`sdk/loaderkit/node_validate_gate_test.go`): an **empty**
`Threaded.KindGates` must fail loudly when a kind layer is gated — never silently pass.

---

## 4. What this replaces

| today | after |
|---|---|
| a per-kind "keeper" decision, justified by a citation count | a `NOT_JUDGED` (spec-owned shape) or a `MOVE` naming its §3.1 owner |
| `#Candy`, `#Box`, `#Deploy` on the wire as authored types | bytes on the wire; bodies at their owners |
| `spec.KindValueDefs` as the compatibility fallback | deleted; undeclared ⇒ hard load error |
| a hard-coded `pn.Disc == "candy"` in the SDK | a threaded, process-blind gate |
| no control over ownership | `check-schema-ownership.mjs` + the registry-driven test |
| four dead `#Vm*Word` re-exports | deleted by the census's reverse direction |
| `node.cue:94-102` claiming `#Vm` generates `spec.Vm` | corrected (it was deleted by `spec#321`) |

---

## 5. The migration — ordered, generic, one cutover per shape

Each step is a hard cutover (R5, `/charly-internals:cutover-policy`); steps 1–4 are the
*mechanism* and land before any body move depends on them.

| # | change | repos | why this order |
|---|---|---|---|
| **1** | **I1 wire collapse** — `#StandaloneLoad` → `{shape, body}`; every producer/consumer repointed (~12 code sites); regenerate | spec, charly, plugin-substrate, plugin-candy-kind, plugin-kubevirt, plugin-example-structkind | the enabling change: after it no kind's wire can name a body |
| **2** | **I2+I3 declared gate** — delete `KindValueDefs` and the fallback; require `InputDef` on every `class:kind` provider; declare `#CandyValue` on the candy provider (pointing at the still-base-declared def) | spec, charly, plugin-candy-kind, plugin-substrate | declare before move: every step must compile |
| **3** | **I4 threaded gate** — `spec.Threaded.KindGates` (path + served source); delete the `pn.Disc == "candy"` branch and the base lookup | spec, sdk, charly, plugin-box | makes the loader's gate composed, closing the process boundary |
| **4** | **I5 the ownership checker + the two tests** — `scripts/check-schema-ownership.mjs`, `kind_wire_uniformity_test.go`, `node_validate_gate_test.go`; add to `charly task verify` | spec, sdk, charly, umbrella | from here, drift is a red gate, not a review opinion |
| **5** | **the word moves**, in §3.1 order — `candy` (+`box`, IR actions) → build plugin; `pod`→container; `vm`+`local`+libvirt/qemu/krun/firecracker rows→machine; `kubernetes`/`kindcluster`→kubernetes; `android`→android; `distro`/`init`/`builder`/`os`→build | each word's owner | mechanical once 1–4 land; each remains its own cutover with its own R10 |
| **6** | **the census close-out** — every `MOVE` emptied, every `KEEPER` witnessed, the four dead defs deleted, the stale claims corrected | umbrella | `TODO.md` 11.1/11.2 can then be green, and TODO.md deleted |

**Rollback:** steps 1–4 revert as one squash (no body moved; the wire and the maps return and
every plugin compiles). Each step-5 word is its own PR and reverts alone.

**Known risk (unchanged by this design):** `cue_schema.go:98-116` panics at init on a table def
the base lacks, so the `candy` row must leave `cueKindDefs` in the same commit that removes
`#Candy`. Step 3 makes the row unnecessary; step 5 removes it.

---

## 6. The measured inventory (baseline for the checker)

Taken from the parallel measurement at `7b3cad5`; file:line evidence in the agents' reports.

**How the three headline counts were measured** (re-run for this PR):

```console
$ grep -hE '^#[A-Za-z0-9_]*:' spec/schema/*.cue | wc -l
646
$ (grep -rhoP -- '- kind:[a-z0-9-]+' plugin-*/candy/*/charly.yml | sed 's/- kind://'; \
   grep -rhoP 'Class: "kind", Word: "\K[a-z0-9-]+' plugin-*/candy/*/plugin.go) | sort -u | wc -l
31
$ grep -c 'VmBackendNameWord\|VmCloudInitWord\|VmSmbiosWord\|VmStrategyWord' spec/schema/vm.cue
4
```

The four `#Vm*Word` re-exports are the "proven dead" row. The sweep, run repo-wide over `spec/`:

```console
$ for d in VmBackendNameWord VmCloudInitWord VmSmbiosWord VmStrategyWord; do
>   grep -rn "$d" --include='*.cue' --include='*.go' spec/ | grep -v '^spec/CHANGELOG'
> done
spec/schema/vm.cue:979:#VmBackendNameWord: _vmBackendNameWord
spec/schema/vm_vocab_reexports_test.go:24:		"#VmBackendNameWord": "libvirt",
spec/spec/cue_types_gen.go:11318:type VmBackendNameWord []any /* CUE closed list */
... (the same three-site pattern for each of the four)
```

Each name has exactly three sites: its own definition, the GENERATED Go type (a projection of that definition, not a consumer), and the re-export test that pins it. No hand-written Go and no other CUE def cites any of them — and that test's own comment claims a sibling-plugin citer that does not exist.

| measure | value |
|---|---|
| kind words | **31** (29 manifests + `docs` + `check-roster`) |
| bodies moved so far | **9** (8 units; unit 5 moved two) |
| entities carrying an authored type on the wire | **10** (`deploy`+`check`, `candy`, `box`/`image`, `builder`, `agent-team`, `pod`, `vm`, `distro`, `init`, `#BoxMetadata`'s candy sub-def) |
| `#Deploy` wire occurrences | **15** (14 wire + 1 authored-internal) |
| `#Deploy` citing defs | **19** defs / 18 structural refs / 5 files |
| `#<Kind>Value` twins in `spec/schema/node.cue` | **3** (`#CandyValue`, `#AndroidValue`, `#DeployValue`) |
| kinds gated by the base fallback | **2** (`candy`, `android`) |
| kinds with no `cueKindDefs` floor | **2** (`kindcluster`, `firecracker`) |
| defs that are simultaneously generated-Go **and** wire types | **26** |
| proven-dead contract defs | **4** (`#VmBackendNameWord`, `#VmCloudInitWord`, `#VmSmbiosWord`, `#VmStrategyWord`) |
| candy type sites for the move | **100** `spec.*`-qualified sites in 34 files across 8 repos |

---

## 7. DESIGN.md fixes — clarify, never reduce

The ruling asks for exactly this. Three additions and two corrections, none of which narrows a
goal:

**Add — a normative row for the deployment entity.** §3.1 has no row for `deploy` (nor for
`kubernetes`'s `kindcluster`), which is why two separate measurements could not settle it. The
clarification must decide, by shape: the authored deployment node → its owner; the deployment
*view*/IR → `spec`'s `ir` package; the deployment *record* → `spec`'s `state` package (already
implied by §10.2's two rows). **Proposed wording:** *"the deployment node (the authored `deploy:`
body) → the plugin that owns the deployment kind's venue; its IR view and its persisted record →
`spec` packages `ir` and `state` (§10.2)."*

**Add — the wire invariant as a rule.** I1 is implied by D-SCH-2/D-MOD-2 but not stated as a
shape rule. **Proposed:** *"D-SCH-7 — A wire shape never carries an authored body type. A wire
carries bytes plus the envelope projection that the receiving side needs; the gate a plugin
applies to its authored body is a def that plugin declares and the host resolves from the composed
schema."* This is the rule whose absence produced the drift.

**Add — the ownership check to the census.** §25's gate list and `scripts/design-check.sh` should
name `check-schema-ownership.mjs` beside `design-dpat.sh`, with the four witness signals and the
census's reverse direction (a witnessless keeper fails).

**Correct — `spec/schema/node.cue:94-102`.** It states `#Vm` is kept because it "still generates
`spec.Vm`"; `spec#321` deleted both. Correction, not reduction.

**Correct — the four dead `#Vm*Word` re-exports and their test's comment.** The comment claims a
sibling plugin cites them; none does. They are deleted, and the test loses the four rows.

**Explicitly NOT changed:** §3.1's ownership assignments, §10.2's `spec`-owned shape list, the
`spec#304` unit count, and every goal in `PROGRAM/design-implementation.md`. This document adds
work (ten entity moves plus the mechanism) — it removes none.

---

## 7b. The three remaining words — why they are not "just moves"

Measured after the mechanism landed and the census was corrected (opencharly/opencharly#1058's tooling, `1057 defs / 175 keepers / 85 MOVEs`). `candy`, `android` and `deploy` are the three words §3.1 still assigns to a plugin while their bodies sit in `spec`. Each is blocked by the same thing, and it is not inertia:

```
#Candy      spec  KEEPER  witness K3, K5, K1
#Box        spec  KEEPER  witness K3, K5, K1
#CandyValue spec  KEEPER  witness K2, K4
```

K5 is the decisive one. The IR cites the authored shapes **as compiled Go types**:

```cue
// candymodel.cue — #CandyModel, a spec-owned IR shape
service?: [...#CandyService] @go(Service)
hook?:     #CandyHook            @go(Hook,optional=nillable)
// boxmetadata.cue — #BoxMetadata, also spec-owned
hook?: #CandyHook @go(Hook,optional=nillable)
```

`@go(Service)` means the generated Go struct has a `[]CandyService` field. Moving `#CandyService` into `plugin-candy-kind` does not move that field — it removes the type the field is built from.

**So the order inside each of the three words is:**

1. **the IR stops carrying the authored shape.** `#CandyModel.service` becomes an opaque body (`bytes` / a `RawBody` twin), exactly as the WIRE already does (I1, D-SCH-7). This is a `spec` + `charly` Go-type change, and it is the largest piece — the reason unit 8 (`vm`) took a whole wave.
2. **the body moves** into the plugin the manifest declares (`kind:candy` → `plugin-candy-kind`), citing the spec shapes as `schema.#…`.
3. **the consumers re-point**, and the R10 beds prove it.

**This is `DESIGN.md` being implemented, not reduced.** §10.2 already says the IR is `spec`-owned; I1 already says the wire carries bytes. What is left is that the IR still carries ONE shape it should carry opaquely — and until it does, the plugin cannot own its body without the IR losing a type it needs.

**A measured warning about the census.** Its 85 MOVEs are a SCREEN, not a verdict. Four candidates were examined and all four were correctly placed: `#CandyServiceOverrides` is a sub-shape whose citer (`#CandyService`) is a keeper; `#KubeVirtDeploySnapshot` and `#FirecrackerDeploySnapshot` are each cited by `snapshot?: [...]` inside their own file; and `#KindCluster` is an EGRESS schema, which belongs to the egress plugin by §3.1's check-command row, not the substrate's. The census says *look here*; the reader decides.

**One surviving census warning, with its disposition.** Every run also prints `unreadable [pod-qwen3-tts]`: that pin is in the index, but its tree cannot be read at its gitlink (the promisor fetch returns `not our ref`), so its defs are unjudged. It cannot affect any verdict about a repo the census CAN read — `#Candy`, `#Box` and `#CandyValue` all live in `spec` — but it does mean the totals above are a FLOOR rather than a ceiling until that pin is readable. Filed as opencharly/opencharly#1063.

## 8. What the operator is being asked

The diagnosis and the design above are complete and evidence-backed. The open question is the
**order of the first cutover**, because step 1 is the only irreversible-ish one:

- **(A) mechanism first** — land 1–4 (wire collapse, declared gate, threaded gate, checker+tests),
  then grind the ten word moves. Slower to first body, but after step 4 no future unit can drift.
- **(B) one word first as a pilot** — move `candy` end-to-end with the mechanism introduced
  alongside it, proving the mechanism on the hardest case (the init panic, the 100 type sites,
  the three positive controls) before touching the wire for everyone else.
- **(C) checker first** — land only I5, so the census prints every `MOVE` and `KEEPER` before any
  shape changes; the work list becomes machine-generated and the operator sees the full bill.

My recommendation is **(C) then (A)**: the checker is small, additive, and turns the remaining
programme into a list the gate produces rather than a judgement a session makes — which is the
root fix this RCA asks for. (B) is the better shape only if the operator wants one hard case
proven before the wire changes for everyone.
