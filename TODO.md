# TODO.md — from today's code to DESIGN.md

> Every item gives the current state (with evidence at `origin/main`, fetched 2026-10-03), the
> target (a DESIGN requirement or section), the config migration (before → after; `charly migrate`
> performs every rewrite listed) and the code work. Items run in dependency order — producer first:
> spec → sdk → charly → plugins → candy and OS repositories → umbrella. Each item becomes one
> tracking issue, issue-first per `AGENTS.md`. TODO.md is deleted when the last item lands.
>
> This file describes the current state, so it uses current names (`plan:`, `distro:`, …); DESIGN.md
> never does.

## Status

Derived 2026-11-08 at umbrella commit `6f6df4dc40364a62c4e0b7bd17003851bfdbca3e`
(re-summed 2026-11-12 at `34a2b9ba0028d3150cdb53d1211304749ddceb86`, where §12.0 of section 12
re-measured all 87 open rows and retired four of them — two to `done`, two to `moved` — while the two
`DECISION` items kept `open`): mechanical
greps at each submodule's `origin/main` pin, never at the lagging checkouts. The numbered text
below is unchanged apart from the verdict an answered item carries in its own row, and the eight
figures §12.6 corrects in place at the 2026-11-12 tips; this table is
the status record.

| section | items | done | open | moved |
|---|---|---|---|---|
| 0. Preconditions | 4 | 2 | 1 | 1 |
| 1. Decisions | 2 | 1 | 0 | 1 |
| 2. Schema | 16 | 1 | 12 | 3 |
| 3. Parsing and validation | 33 | 1 | 31 | 1 |
| 4. Generation | 4 | 0 | 4 | 0 |
| 5. Modules and the plugin protocol | 11 | 0 | 11 | 0 |
| 6. Plugins and the install IR | 9 | 0 | 8 | 1 |
| 7. Store | 3 | 1 | 2 | 0 |
| 8. Command line | 3 | 0 | 1 | 2 |
| 9. Repositories | 2 | 0 | 2 | 0 |
| 10. Documentation | 3 | 0 | 2 | 1 |
| 11. Final proof | 2 | 0 | 2 | 0 |
| 12. OCE alignment | 15 | 3 | 7 | 5 |
| **Total** | **107** | **9** | **83** | **15** |

The Decisions row counts the unnumbered decided block plus item 1.1.

**Moved.** Each item below names what superseded it, or which part no longer holds:

- `0.4` — CUE is v0.18.0-rc.1, not v0.17.1; the `close()` half still holds (0 occurrences in `DESIGN.cue`).
- `1.1` — the naming rule in `AGENTS.md` now makes `distro-`, `layer-`, `pod-`, `plugin-`, `vm-`, `pkg-` and `charly-` the canonical prefixes, so "archive them" contradicts current policy; `*-skills` carriers are already 0.
- `2.2` — the duplication is gone but `spec/envelope` was never created: each shared shape now has exactly one definition in its owning plugin.
- `2.5` — the text assembly is gone: `charly` composes the base document schema by importing the `spec` CUE
  module (`opencharly/charly` PR #1114, `CHANGELOG/2026.313.0209.md`), and `schemaconcat` has no runtime
  caller left; a plugin's served schema still arrives as TEXT and is unified as VALUES (`base & served`),
  which the load gate's standalone-compile requirement makes sound, so the plugin half is design, not debt.
- `2.12` — the unreviewed field set no longer exists in that form: `DESIGN.md` §16.1's field table and
  `DESIGN.cue`'s `_candyField` are the same settled list, `builder` became `build_with` (D-IR-7), and
  `build`, `produce`, `bootstrap_builder_image`, `enabled` and `network` carry no field at all, so there is
  nothing left of the nine to review.
- `3.31` — the split landed as `requires_capability:`, not `need:`.
- `6.6` — superseded by D-PLUG-7 (a non-first-party plugin owns a namespaced verb).
- `8.1` — three of its renames are contradicted by the settled ledger: `command:candy` and `command:config` are sharp with their current spellings; `command:secrets` is a recorded retirement.
- `8.3` — contradicted by the settled `command:config` target, which persists into `charly.yml`.
- `10.3` — `PROGRAM/nested-deploy-members.md` no longer exists.
- `12.3` — the vocabulary is now `parameter:`, not `input:`/`with:`.
- `12.5` — replaced by D-IR-7 + `build_with:`.
- `12.10` — `#Security` no longer exists in `DESIGN.cue`; the posture lives in the `nesting:` grant.
- `12.11` — `state_put` exists in none of the three tips; deployment state is per-deployment YAML written
  by `SaveDeployState`. The target (a transactional commit plus an audit append) is unmet and is the
  successor item §12.3 names.
- `12.13` — the `## Status` table this row asked for has existed since 2026-11-08, so "`TODO.md` has no
  status column" is false; the `specs/{rfcs,plans,archive}` half survives as the successor SINGLE.

**Done.** Each item is proven complete at the pin its own proof names — the audit's pin above unless
the entry says otherwise:

- `0.2` — the CUE-module spike ran 2026-11-08 on the pinned CUE v0.18.0-rc.1 and answered what the
  design needed: a plugin CUE module imports a `spec` package and its bounds bite (a violated bound
  fails with `invalid value 99999 (out of bound <=65535)`), with no copies; the module publishes as a
  real OCI artifact with a stable digest and is fetchable by that digest, though `cue mod` records a
  release version only and rejects a `@sha256:` requirement; one composed instance takes `spec` plus
  N plugin modules, with `#Node` derived by `or()` over a registry tag table, a known kind accepted
  and an unknown one rejected; and `cue exp gengotypes` types a module's own definitions but
  collapses a union to `map[string]any`, and its cross-module import is not a Go import path. The
  answer is design now — closure over extension, the one-of struct generated by core, and the
  digest core's record — in DESIGN.md:§10.1 (S1, S6), DESIGN.md:§10.2 (D-SCH-8), DESIGN.md:§10.3
  and DESIGN.md:§13.
- `12.2` — `#Namespace: #TopName` is defined in `DESIGN.cue`, and the two retired phrases sit in the `Not` cell of the one `namespace` row (§2).
- `12.4` — `#ManagerPackage` (`config?: #Opaque`) is the value of a manager package in `#PackageMap`, and `#ActionPackage` carries it, so an install carries the owning plugin's own input.
- `2.4` — the loader's candy field gate IS the closed `#Candy` schema (`opencharly/sdk` `9aed46f4`,
  tag `v0.2026314.2013`, PR #495). The hand-copied 43-key admitted set (`candyKnownFields`) is deleted
  and replaced by `cueDefFields(cueKindDefs["candy"])` — the extraction the parse's declared-fields
  floor already performs — so the gate admits what the schema declares and refuses what it drops, and
  the four retirements (`version`, `libvirt`, `localpkg`, `from`) carry a named diagnosis beside
  `depends`/`directory`/`info`. The copy had drifted BOTH ways: it still admitted those four retired
  fields, and it refused five fields the schema declares (`external_builder`, `skills`, `packaging`,
  `agent_provide`, `terminal_profile`) under a false plural/singular-typo message. Measured:
  `ParseCandyManifest` over the 350 real candy manifests in the materialized tree returns
  byte-identical verdicts before and after (the gate runs only on the legacy kind-keyed form, of which
  the corpus holds none).

- `3.17` — core enforces D-VAL-4 ("namespaces and top-level node names are disjoint"), the rule `DESIGN.md`
  §12.4 assigns to core and `design/example/rules.cue` only proved on the design's own examples
  (`design/negative/namespace-is-node.yaml`). `opencharly/sdk` `e92958bd`, tag `v0.2026314.2159`, PR #496,
  adds `checkNamespaceNodeDisjoint`, run LAST in `walkProject` over the PROJECT scope — the root document,
  every flat import that appends to it, and every discovered manifest — against the walk's own namespace
  index. The row's premise ("can clash") measured stronger than it read: all three shapes loaded CLEAN
  before the change (`Walk accepted a document whose import namespace "tools" is also a top-level node
  name`), and none does after it. No config migration: a scan of the materialized tree (2047 `charly.yml`,
  17 projects carrying a namespace, 285 discovered manifests, plus `charly`'s `charly.yml` re-read at its
  `origin/main`) finds 0 collisions, and `charly`'s whole package suite passes against the new `sdk`
  (280.5 s).

- `7.1` — the plugin build cache is keyed by CONTENT and its tests inject their root.
  `opencharly/sdk` `b77c8a54d2331f77ee7308e43503bb051e7df6b2`, tag `v0.2026287.1747`, PR #389 lands
  `sdk/buildcache`: one store entry per binary, keyed by D-STORE-4's whole input set — the candy's source
  tree plus every local `replace` target, `go.sum`, the toolchain, the build environment and the plugin
  leaf name — with the per-key lock moved OUT of the store tree to the runtime root, so neither a
  `.stamp` sidecar nor an in-cache `bin+".lock"` can exist. `opencharly/charly`
  `125a910988495170e7f2ab4d601fa4e70e1cd3bc`, tag `v2026.288.0051`, PR #910 deletes the loader's own
  cluster (`pluginBuildCacheDir`, `pluginSourceTag`, the cache path inside `buildPluginBinary`, and all
  of `plugin_build_stamp.go` with its `.stamp` sidecar) and repoints both build arms at
  `buildcache.Build`, so the path key has no implementation left — at the pins the deleted names survive
  only inside comments that record the deletion. The test-root half is D-STORE-8 as the code states it:
  the cache root is `$XDG_CACHE_HOME/charly` with `$CHARLY_CACHE_DIR` as the SOLE override, the
  out-of-process e2e suites build through `hostBuildPluginForTest` with a test-local root
  (`charly/plugin_build_testhelper_test.go`: "a test that built into the operator's real cache would be a
  write outside the temp dir"), and `buildcache`'s own tests `t.Setenv("CHARLY_CACHE_DIR", t.TempDir())`.
  No code reads the old per-user `~/.cache/charly/plugins` root any more: that literal appears in no
  `.go` file of `charly` or `sdk` at the pins (both sweeps exit 1 with no output, pasted in the PR
  body). The `/usr/lib/charly/plugins/` hits are a DIFFERENT path — the packaged plugin dir every
  native package bakes beside the binary — so they neither read nor keep the old cache root. What
  the row's *Current* cell states for the user cache is therefore that OLD root's on-disk residue:
  measured on 2026-11-11 it holds 35 GB across 5 126 files, 1 083 of them `.stamp` sidecars, while
  the content-keyed root holds 2.3 GB across 231 files. Its purge is the migration's own phase 5
  (`7.3`: `charly clean` purges the old roots). The keying and the test roots are done; the residue
  is not this row's.

- `0.1` — the question ("are inventories taken from fetched `origin/main`?") is a verb:
  `charly task pins --param MODE=currency` names every pin that is not at the ref its intent names, and
  the umbrella's own pins equal the remote tips at the date of this record.
- `1` — the section's decided block is a ledger, not work: `DESIGN.cue` carries 121 `D-` references and
  `DESIGN.md` carries its terms (`step:` 48, `harness` 26, `os_override` 6). The section's only open
  question, `1.1`, is already `moved`.
- `12.7` — the `kube:` verb carries observation methods ONLY. `opencharly/plugin-kube` PR #33, merge
  `d19e95d1cad420f152a1e983430d437269b9f8d3`, tag `v2026.315.0153`: `apply` (dynamic `Create`, then
  `Update` on `AlreadyExists`) and `delete` (dynamic `Delete`), their `manifest` field, `runApply`,
  `runDelete`, `readYamlDocs`, `gvrForObject` and `kindToPluralResource` are deleted, and the served
  `#KubeInput` refuses both words while admitting the eleven observation methods. The row's premise
  measured TRUE and its blast radius EMPTY: 0 authored uses of either word across the 430 submodule
  `origin/HEAD` tips present on 2026-11-11, in all three authored spellings (the map `method:` key, the `kube: <word>` scalar
  sugar, and a nested key), while the same predicates return 4 and 3 hits for live `nodes` uses, so the
  migration is empty. Zero verdicts moved, measured live through the provider entry the host calls:
  byte-identical `nodes`/`pods` verdicts against a reachable k3s cluster before and after, and
  `unknown kube method "apply"` / `"delete"` for the removed two. Read at `plugin-kube`'s own
  `origin/main` `db0392301c533cb78de35e475d3bcff432bf1dcd` — the basis this file's Status note
  names — which was 4 merged commits ahead of the umbrella gitlink
  `df962299eaeedc4dd83e99ca1e18aef0f4ad203c` when this record was written; opencharly/opencharly#983
  advanced the umbrella to that commit. The refusal is an assertion in the plugin's
  own `methods_observe_test.go`: `TestKubeInput_ObservationMethodsOnly` accepts the 11 observation
  methods and refuses `apply`, `delete` and a `manifest:` field, and
  `TestDispatch_RefusesRemovedMutationMethods` asserts dispatch answers `unknown kube method`.

**How to keep this current.** The status is derived by greps at the submodule pins. Whoever lands an item updates its row and the total in the same PR. TODO.md is deleted only when the last item lands (§11.2).

## 0. Preconditions

| # | Item |
|---|---|
| 0.1 | **Source of truth.** Every inventory is taken from fetched `origin/main`, never from the umbrella's pinned checkouts. On 2026-10-03, 31 of 424 checkouts lagged `origin/main` (`distro-cachyos` 43 commits, `distro-fedora` 31, `distro-omarchy` 28, `charly` 16, `sdk` 16, `distro-arch` 16, `spec` 8). The evidence in this file was re-verified against `origin/main` of `charly`, `sdk` and `spec` on that date; the same field declares 409 checkouts at 2026-11-12. Repeat the fetch before each item starts. |
| 0.2 | **RDD spike — CUE modules (D-SCH-2, §10.3).** Prove on a disposable target that: a plugin CUE module imports `spec` packages; it is published as an OCI artifact and fetched by digest; core composes `spec` plus N plugin modules into one instance at runtime, with registry-derived unions (`or()` over a registry definition, S4); `cue exp gengotypes` emits usable Go across a module import. Everything in sections 2–6 depends on this. If it fails, stop and bring the evidence to the operator. **Answered 2026-11-08** — the spike ran on the pinned CUE and its answer is recorded in `## Status` and in DESIGN.md:§10.1, DESIGN.md:§10.2, DESIGN.md:§10.3 and DESIGN.md:§13. |
| 0.3 | **RDD spike — schema-first parse (§11.2, D-LOAD-5).** Prove that the field-versus-node rule classifies the whole fresh corpus without ambiguity, that tag dispatch selects exactly one alternative for every node, step and file, and that YAML→CUE decoding keeps `file:line` for every diagnostic. |
| 0.4 | **CUE v0.17.1 defect.** Embedding a definition inside `close()` and unifying it with a comprehension-bound value leaves a key-tagged disjunction unresolved: `#S: close({a!: string}) \| close({c!: string})`, `#F: {s: [...#S]}`, `doc: x: {s: [{c: "1"}]}` — `close({#F}) & doc.x` resolves, `{for k, v in doc {(k): close({#F}) & v}}` reports `s.0: incomplete value {c:"1",a!:string} \| {c:"1"}`. DESIGN §10.1 removes `close()` (definitions are closed by CUE), so the design does not depend on it. |

## 1. Decisions

Decided by the operator in the design session:
- `step:` replaces `plan:`;
- one `kubernetes:` kind; local clusters are created with `create: kind` or `create: k3s`;
- the stack model of DESIGN §14: a keyless node is a candy, or a box when it has `from:`; `source` is
  the only external starting point; `from:` is the only start key; a box whose `from:` is a
  deployment is a capture; there are no templates;
- `pod` and `vm` are written and driven identically: every box runs as either, and the `os` owns
  the conversion between image and disk;
- the definition kind `distro` becomes `os`; the candy field `distro:` becomes `os_override:`; the
  box field `builder:` becomes `builder_box:`;
- tree-position nesting for every kind;
- every plugin is declared in `plugin:`, with no built-in set and no catalog;
- the OS packages a plugin needs in order to run are declared by the plugin's own candy
  (`package:`, `os_override:`); charly's own native packages keep only the packages core needs;
- charly installs a plugin's OS packages on the host only when the user configuration enables it
  (`local_install: false` by default); `charly local-install` is the one command that installs them;
- state is declared only in fields, so a `run:` step carries only `command`;
- host access comes only through host needs (§9), never raw runtime settings;
- singular keys; `description:` stays a field;
- everything is provided by plugins over the protocol of §4;
- the schema patterns are those of §10.1: no `close()`, no forbidden-field construct, every union
  derived from a registry definition.

Still open:

| # | Decision | Recommendation |
|---|---|---|
| 1.1 | **Repository topology (D-REPO-1).** The operator chose aggressive collapse. | The exact repository list (candy families, plugin concepts) needs sign-off before item 9.1. |

## 2. Schema (Part I)

| # | Current state (evidence) | Target | Config migration | Code work |
|---|---|---|---|---|
| 2.1 | Kind schemas (`#Candy`, `#Box`, `#Deploy`, `#Vm`, `#Pod`, `#Local`, `#Kubernetes`, `#Android`, `#LibvirtDomain`, …) live in `spec/schema`, with `#<Kind>Value` twins; plugin-substrate and plugin-candy only echo host-decoded values (`spec/schema/node.cue`). | D-SCH-1, D-SCH-3 | none | Move each schema into its plugin's CUE module; delete the twins and the echo plugins. |
| 2.2 | 104 of 117 plugin schemas are "self-contained" and copy shared shapes (`#HttpMatcherList`, `#FileMatcher`, `#MountMatcher`, …). | D-SCH-2 | none | Import `spec/envelope`; delete the copies. |
| 2.3 | 486 `@go(…,type=…)` overrides (2,859 `@go(…)` calls in all), 82 `@go(-)` uses and hand-written Go types in `spec` (e.g. `hand_state_types.go`) — counted 2026-11-12. | D-SCH-1, D-GEN-3 | none | Generate every type; keep only behaviour methods. |
| 2.4 | A second field gate: the loader's `candyKnownFields` still admits the removed `version` (`sdk/loaderkit/parse_candy_manifest.go:224`). | D-CANDY-1, D-LOAD-2 | none | Delete it. |
| 2.5 | The runtime schema is assembled by text: `schemaconcat`, plus the `base ++ served` splice in `charly/charly/plugin_loader.go`. | §10.3 | none | Compose one instance through CUE imports. |
| 2.6 | `#NodeDoc` carries state and vocabulary keys (`cache`, `ledger`, `system`, `providers`, `compiled_plugins`, `context_ignore_baseline`, `ovmf_*`, `verb_primaries`, `provides`). | D-STORE-2, D-KIND-2, D-CORE-3 | `~/.config/charly/charly.yml` splits: settings → user configuration; `cache`/`ledger`/`system` → state or cache | Remove the keys from the envelope. |
| 2.7 | Cross-field rules in Go: ephemeral→disposable fill, android `box`⊻`adb`, preemptible checks, check-bed checks, member checks (`sdk/loaderkit` `LoadSeams`). | D-LOAD-3 | none | Move each into CUE or into the owning kind's `validate` (§12.4). |
| 2.8 | Verb primaries in three places: `verb_primaries` (`charly/charly.yml`, `spec/schema/node.cue`), manifest `plugin.primary`, and `ProvidedCapability.Primary`. | D-VERB-5, D-LOAD-5 | `plugin.primary` is removed from manifests | Delete all three: a verb input has one shape and the step is dispatched by its keys. |
| 2.9 | Kind words collide with field names: the `distro` kind vs the candy `distro:` field (whose box form is a third, list-typed use), and the `builder` kind vs the box `builder:` field. | D-SCH-6 | `name: {distro: {…}}` definition nodes → `name: {os: {…}}`; candy `distro: {arch: {…}}` → `os_override: {arch: {…}}`; the box `distro: [fedora, "fedora:43"]` list → `os: fedora-43` on the `source` the stack starts from; box `builder: {…}` → `builder_box: {…}` | Add the disjointness gate (Appendix A.4 check 5). |
| 2.10 | Box starting points come in four spellings: `base:` (a box or an OCI ref), `from: builder:<word>` plus `bootstrap_builder_image`, a VM template `source:` block (`cloud_image`, `iso`, `bootstrap`, `container_disk`, `bootc`, `clone`, `imported`), and `distro:` identity lists. | §14.1, §16.3, D-SRC-1..2 | external `base: <oci-ref>` → a `source: {oci: …, os: …}` node with the box's `from:` naming it; `base: <box>` → `from: <box>`; `from: builder:pacstrap` + `bootstrap_builder_image` → `source: {bootstrap: {builder: arch.pacstrap, …}, os: arch.arch}`; vm `source: {kind: cloud_image, url, checksum}` → `source: {disk: {url, sha256}, os: …}`; `iso` → `source: {iso: …}`; `container_disk` and `bootc` → a box `from:` the OCI source; unused `clone` and `imported` are deleted | One `from:` resolver; a `source` kind in the build plugin; the machine plugin builds disks from boxes. |
| 2.11 | A deployment names what it realizes with `from:` (a template, or `name:snapshot`) or `image:` (an image node). | §14.1, §17.1 | `image: <node>` → `from: <node>`; `from: <template>` → `from:` the box or source the template's disk came from (2.14) | Update the deployment schemas. |
| 2.12 | Image build fields `build`, `builder`, `produce`, `bootstrap_builder_image`, `platform`, `enabled`, `tag`, `entrypoint`, `network`: purpose and overlaps unreviewed. | D-LAW-1, D-LAW-2 | per the review | Review them against the fresh corpus and record the result in DESIGN §16.1 (with DESIGN.cue first, Appendix A.7) before implementing. |
| 2.13 | Unused fields and kinds. Kinds: `theme`, `session`, `displaymanager`, `desktopentry`, the `kubevirt` kind (`agent-team` and the `pod` template form are already 0 at 2026-11-12). Fields: most of `#Kubernetes`; deploy `kind`, `replica`, `restart`, `schedule`, `tunnel`, `dns`, `acme_email`, `port`, `resources`, `expose`, `storage`, `probes`; vm sources `bootc`, `clone`, `imported`; most libvirt device lists; unused `#Box` and service fields (full list from inventory 0.1). | D-LAW-2 | none (unused) | Delete them from the schemas. |
| 2.14 | Deployment templates. `vm:` templates (112 nodes, counted 2026-11-12) carry the disk source, `disk_size`, `ram`, `cpu`, `firmware`, `network`, `ssh`, `cloud_init` and `libvirt`; `local:` templates carry a candy list; `kubernetes:`/`android:` templates carry access and device settings; `pod:` templates are unused. Template versus deployment is decided by whether `from:`/`image:` is present. | §14, §17.1 | per vm template `T`: its `source` block → a `source` node (2.10); `cloud_init` packages, users and runcmd → a candy, and a box `T` = that source plus that candy; `ram`/`cpu`/`disk_size` → the fields of every deployment that used `T`; `firmware` → the deployment's `firmware`; `ssh`/`network` → machine plugin behaviour (port forwards → `port:`); `libvirt` devices → host needs (3.26) or the machine plugin; `local` templates → a box or the deployment's `require:`; android → 3.23 | Delete the template form from every deployment schema. |
| 2.15 | Pod and VM are built differently: a pod runs an image built from a box; a VM boots a template disk and applies candies over ssh at deploy time. Snapshots, consoles and many commands exist only for VMs. | §14.2, D-DEP-1, D-FORM-1 | none beyond 2.10, 2.14 and 3.27 | Each `os` gains its boot content and root-filesystem export; build a disk from any box and an image from any disk start; both kinds share one field set and one command set; the conformance bed runs every box as both. |
| 2.16 | Schemas use `close()`, open definitions, absence-discriminated unions, unions written out alternative by alternative, mixed lists and validators embedded in structs (the self-contained plugin schemas, `#CandyValue: (*#Candy \| #Image)`, `#<Kind>Value: (#Template \| #DeployValue)`). | §10.1, D-PAT-1..4 | none | Rewrite every schema with the patterns of §10.1: definitions without `close()`, every union derived from a registry definition, enums from word lists. Every enforcing line carries its requirement tag with a negative case (Appendix A). The §25 schema-pattern gate now has one control for the half of each requirement that the pinned CUE text decides (`scripts/design-dpat.sh`, Appendix A.11): D-PAT-1's never-table, D-PAT-2's one-home half (a top-level definition name declared in a second pinned module), and D-PAT-3's form half (a union written out with `\|` instead of derived), green over a census in `design/dpat-baseline.tsv` that the issue linked there lowers as they are fixed. What stays ungated is named there rather than implied: D-PAT-2's ownership half (the word-to-owner registry the loader builds from each plugin's `describe`) and its composition half (§10.3), and D-PAT-3's derivation-source and S5 halves — none of them decidable from CUE text, and all of them decidable once the loader emits its registry or the composed schema as an artifact a control can read. |

## 3. Parsing and validation (§11–§12)

| # | Current state (evidence) | Target | Config migration | Code work |
|---|---|---|---|---|
| 3.1 | The parser classifies keys from `Threaded` word sets (`Kinds`, `DeploySubstrates`, `StructuralKinds`, `ExternalDeploySubstrates`) plus `resourceKindSet`, a value-shape scan (`discEntityPairs`/`isEntityValue`) and declared-field side lists with fallbacks (`sdk/loaderkit/parse.go`). | §11.2, D-LOAD-2 | none | Rewrite the parse rules on the composed schema. |
| 3.2 | Three validate-and-fold paths (`foldSubstrateKind`, `foldCandyKind`, plugin input) (`charly/charly/provider_kind_invoke.go`). | §12.1, D-LOAD-3 | none | One unification per node with the definition its kind key selects, plus `validate`. |
| 3.3 | Steps are typed only by `charly box validate` (`ValidateNodeFormSteps`); unions are tried alternative by alternative, so diagnostics list every alternative's failure. | D-LOAD-3, D-LOAD-5 | none | Validate steps on every load; dispatch every key-tagged union on its tag keys and report "exactly one of …". |
| 3.4 | The `/etc/charly/charly.yml` project layer (`config_stack.go`) and the bootstrap phase (used only by an example plugin). | §11.3 | the `/etc` layer becomes system configuration | Delete both. |
| 3.5 | Per-kind typed maps in `spec.UnifiedFile` (`Box`, `Candy`, `Deploy`, `Pod`, `VM`, `PluginKinds`, …). | §12.2 | none | A generic resolved table; typed views move into the consuming plugins. |
| 3.6 | The `candy:` kind key. | §11.2 rule 3 | `name: {candy: {…}}` → `name: {…}` | Make the keyless node the candy. |
| 3.7 | Three composition keys: image `candy:` list, candy-in-candy `candy:`, deployment `add_candy:`. | D-CANDY-2 | each → `require:` | Update the schemas. |
| 3.8 | Two reference forms: inline `@github.com/…:tag` references inside fields (`require:`, `candy:`, `base:`) and `import:` namespaces. | D-REF-1, D-REF-2 | each inline reference → an `import:` namespace plus `<namespace>.<name>`, with the digest added | Delete inline-reference parsing (`spec.ParseRemoteRef` in field position). |
| 3.9 | An `import:` entry is a bare string or `{alias: ref}`, with `@host/org/repo[/sub]:version` pinned by tag only, and a flat-merge form exists. | D-REF-3..6 | `- alias: '@github.com/o/r:vT'` → `alias: {repo: github.com/o/r, release: vT, digest: <computed>}`; the flat-merge form → a namespace plus namespaced references; local paths → `{path: …}`; `box reconcile` computes the digests | Verify the digest at fetch. |
| 3.10 | Nesting by position exists only for deployment kinds; sidecars are referenced by name. The document this row cited (`PROGRAM/nested-deploy-members.md`) is retired from `origin/main`, so its evidence must be re-derived at the tip before the row starts. | §17.2, D-NEST-1..6 | sidecar references → inner `pod:` nodes; members written beside the kind key but meant to run inside → inner nodes | Each kind's nesting definition declares what it admits; delete the core nesting sets. |
| 3.11 | PATH can be set three ways (`path_append`, `shell.path_append`, `shell.path`). | §16.1 | the `shell.*` path keys → `path_append` | Update the schemas. |
| 3.12 | Provides and requires come in six mechanisms: 11 `*_provide`/`*_require`/`*_accept` fields, `plugin.requires`, `requires_exclusive`/`requires_shared`, init `depends_candy`/`requires_capability`, candy `capability`, and the `provides:` write-back. | §8, D-CAP-1..5 | `env_provide: {X: v}` → `provide: {env: {X: {value: v}}}`; `env_require: [X]` → `need: {env: {X: {}}}`; `*_accept` → `{optional: true}` on the need; `mcp_provide`, `agent_provide`, `terminal_profile` → `provide:` types; `requires_exclusive: [g]` → `need: {gpu: {<vendor>: {lease: exclusive}}}`; `plugin.providers` → `provide:` role types | Build the solver and the `type` role; delete the write-back and `--update-all`. |
| 3.13 | `plan:` names the steps list; `charly check plan`. | §2, §11.2 rule 5 | every `plan:` key → `step:` (candies, boxes, deployments, tasks, beds) | Rename it in the schemas, the loader, the labels and the commands; there is no alias. |
| 3.14 | `kindcluster:` is a separate kind; a local k3s cluster is built from candies (`k3s-server`) plus `kube` post-provisioning; `kind-host` profiles exist. | §15, §17.1, §17.2, D-DEP-6 | `x: {kindcluster: {node_image, nodes}}` → `x: {kubernetes: {create: kind, cluster_node: {<name>: {control_plane: true}}}}`; k3s on a vm or local node → an inner `kubernetes: {create: k3s}` node; workloads → inner `pod:`/`vm:` nodes | Merge the plugins into the kubernetes plugin; implement `create: kind` and `create: k3s` as one kind with lifecycle methods. |
| 3.15 | "image" names both a candy with `base:` and the OCI artifact; the docs say "box", "image" and "image-candy". | §2, §14 | none (wording only) | Rename identifiers, help, docs and skills: box = candy with `from:`; image and disk = the two artifact forms. |
| 3.16 | `--repo OWNER/REPO[@REF]` flag, the `DefaultProjectRepo` fallback (`spec/ref_parse.go`, `spec/repo_identity.go`), and the `@…:ver` CLI form. | D-REF-7..8 | scripts and docs: `--repo o/r@v box build x` → `box build o/r@v:x` | One positional reference grammar; delete the flag and the default-repository fallback. |
| 3.17 | Import namespaces and top-level node names can clash. | D-VAL-4 | rename clashing nodes (report produced in 0.1) | Add the disjointness check to core. |
| 3.18 | A `command` step that runs on the host is written `in_container: false`, which misreads on VMs and hosts. | D-VERB-3 | `in_container: false` → `on_host: true` | Rename the step modifier. |
| 3.19 | `kube` steps name a hand-made cluster context (`cluster: check-k3s-vm-ctx`, `kube_context: kind-…`). | D-NEST-4 | drop the context keys from `kube` steps written inside a `kubernetes` node | Derive the context from the identity of the enclosing `kubernetes` node. |
| 3.20 | Beds add plugins by hand through `add_candy: ['@github.com/opencharly/plugin-adb/…']`; Android apps are installed through the `apk:` field. | D-PLUG-4, §3.1 | each plugin entry in `add_candy:` → a `plugin:` declaration; `apk: [{apk: url}]` → `package: ["android:<url>"]` | The `plugin:` directive; the `android:` manager. |
| 3.21 | Android devices are `android:` templates naming their host with `box:` xor `adb:` (the xor is enforced in Go). | §17.1, §17.2 | the template's `device`, `api_level` and `adb` move onto the `android` node; an emulator device is written inside the pod that hosts it, so `box:` is dropped | Hosting comes from position. |
| 3.22 | Plural authored keys and directives: `defaults`, kubernetes `nodes`, `install_opts`, and further plural field names (list from inventory 0.1). | D-NAME-1 | `defaults:` → removed (user configuration, D-STORE-2); `nodes:` → `cluster_node:`; `install_opts:` → `install_opt:`; each further plural key → its singular | Rename them in the schemas. |
| 3.23 | Every pod receives every device the host probe finds (GPU via CDI, `/dev/dri/renderD*`, `/dev/kfd`, `/dev/kvm`, `/dev/vhost-*`, `/dev/fuse`, `/dev/net/tun`, `/dev/hwrng`) unless `--no-auto-detect` is passed. Candies and deployments carry raw `security:` blocks (`cap_add`, `security_opt`, `devices`, `shm_size`, `group_add`, `privileged`). The `resource` kind defines lease tokens. | §9, D-HW-1..5 | `security: {devices: [/dev/fuse, /dev/net/tun], cap_add: [ALL], security_opt: [unmask=/proc/*]}` → `need: {nesting: {container: {}}}`; `/dev/kvm` + vhost → `need: {nesting: {vm: {}}}`; a render node → `need: {device: {render: {}}}`; `shm_size: 1g` → the candy field `shm_size: 1Gi`; `requires_exclusive: [nvidia-gpu]` → `need: {gpu: {nvidia: {lease: exclusive}}}`; `resource:` nodes → leasable GPUs in user configuration; podman/docker/libvirt socket bind mounts → `need: {engine_api: {<engine>: {}}}` | Delete auto-detection and the `--no-auto-detect` flag; implement `grant` in each deployment kind as the minimal grant; `charly doctor <node>`. |
| 3.24 | Snapshots are VM-only, spelled as a capture policy (`snapshot: {on_finalize, mode, keep_venue}`), restored with `from: <deployment>:<snapshot>`, plus an unused `from_snapshot:` field and an unused `clone` source. Pods cannot snapshot. | §14.3, §17.3, D-CAPTURE-1..3 | for a deployment `X` with `snapshot: {on_finalize: golden}`, add a box `X-checked: {description: …, from: X}` and rewrite every `from: X:golden` to `from: X-checked`; `mode` and `keep_venue` are dropped (a capture never stops its deployment) | Pod captures as committed images; captures as boxes; delete the snapshot fields and the colon grammar. |
| 3.25 | Multi-operation verbs take a `method:` string and prefixed fields (`kube: {method: wait-nodes, kube_count: 1}`, `kube_kind`, `kube_resource`, …). | D-VERB-4 | `kube: {method: wait-nodes, kube_count: 1}` → `kube: {wait_node: {count: 1}}`; likewise for `adb`, `appium`, `cdp`, `wl`, `vnc`, `spice`, `dbus`, `record`, `jetkvm`, `libvirt`, `mcp`, `helm` (per-verb tables from inventory 0.1) | Each verb input becomes an operation registry with a derived union (S4). |
| 3.26 | State changes are written two ways: candy fields (`package`, `service`, `extract`, `data`, `shell`) and `run:` steps using `mkdir`, `copy`, `write`, `link`, `download`, `setcap` and `config` (which renders `${VAR}`/`var:` substitutions at build time). There is an `include` intent (3 uses). | §14.4, D-VERB-1, D-IR-1 | `run: … mkdir: P` → `file: {P: {dir: true}}`; `write: P, content: C` → `file: {P: {content: C}}`; `copy`/`link`/`download` → `file:` entries keyed by target path; `setcap` → `capability:` on the file entry; `extract:` and `data:` fields → `file:` `extract`/`copy` entries; `shell:` snippets → `file:` writes into the profile directory plus `path_append`; `config` steps and `var:` → literal `file:` writes, with runtime values from `env`; `include` steps → `require:` of the candy that carries those steps | Delete the act verbs, `var`, `include`, `extract`, `data` and `shell`; the `file` action owns every file effect. |
| 3.27 | Field names that collide or mislead: the candy `plugin:` block (vs the `plugin:` directive), the `artifact:` field (vs the artifact concept), `apk:` (vs the `android:` manager), `reboot:`, and the `security:` block. | D-NAME-4, §16.1 | `plugin: {source: M, providers: […]}` → `module: M` plus `provide:` with role types; `artifact:` → `export:`; `apk:` → `package: [android:…]`; `reboot: true` → removed (the deployment kind reboots when an action requires it); `security:` → 3.23 | Rename the schema fields. |
| 3.28 | Verb inputs: `command` is `{command: …, in_container: …}`; `file`, `service`, `package` and `process` repeat the verb name as their primary field; some verbs accept a scalar shorthand as well as a map; matchers are written as scalars and as maps; `http` matchers sit beside the verb (`body:` as a step key). | D-VERB-3, D-VERB-5 | `command: {command: X, in_container: false}` → `command: X` plus `on_host: true`; `file: {file: P, …}` → `file: {path: P, …}`; `service: {service: N}` → `service: {name: N}` (likewise `package`, `process`); every other scalar shorthand → the verb's full input; `stdout: X` → `stdout: {equals: X}`; `http: U` + `body: M` → `http: {url: U, body: M}`; a redundant `exit_status: 0` is dropped | Rewrite the verb inputs; delete the primary-field machinery (2.8). |
| 3.29 | `provide:` items are written as lists (`providers: [verb:http]`) and as maps. | D-CAP-1, S5 | lists → maps of name → attributes (`verb: {http: {}}`) | Update the schema. |
| 3.30 | Collections with identities are lists of maps with a `name:` field: `service:`, `user:`, `volume:`, `alias:`, `export:`, package `repo:`; files are a list of one-key entries. | S5 | `service: [{name: N, …}]` → `service: {N: {…}}` (likewise `user`, `volume`, `export`); package `repo: [{name: N, …}]` → `package_repo: {N: {…}}`; `alias:` → the operations plugin's configuration; `file: [{write: P, content: C}]` → `file: {P: {content: C}}` | Rewrite the schemas as maps; duplicate names become impossible by construction. |
| 3.31 | Candies list capabilities and candies in one `require:` list, mixing one-key capability maps into a list of names. | §8, D-CANDY-2 | `require: [a, {env: X}, {gpu: nvidia, lease: exclusive}]` → `require: [a]` plus `need: {env: {X: {}}, gpu: {nvidia: {lease: exclusive}}}` | Split the field; the solver reads `need:`. |
| 3.32 | Field names that carry a second meaning: the step modifier `context:` (also the kube context and the protocol call), the `http` input's `method` (also a protocol method), the android `adb.host` (also the host), the `os` node's `release` (also a repository release), a file's `capability` (also a capability), and node names containing `--`. | D-NAME-4, §2, D-NEST-4 | step `context: [build, runtime]` → `phase: any` (omitted), `context: [runtime]` → `phase: runtime`, `context: [build]` → `phase: build`; `http: {method: M}` → `http: {request_method: M}`; `adb: {host: A}` → `adb: {address: A}`; `release: "43"` on an `os` node → `version: "43"`; file `capability: [c]` → `linux_capability: [c]`; a node name with `--` → the same name with single hyphens, references rewritten | Rename the fields in the schemas. |
| 3.33 | References are not visible to core: the loader resolves them inside kind code, so validation cannot run on a linked graph and cycles are found late. | §11.1 stage 4, §12.1, S9, D-VAL-2..3 | none | Mark every reference field with `@ref(<kinds>)` in its plugin's schema; core builds, checks and orders the reference graph before validation. |

## 4. Generation (§13)

| # | Current state (evidence) | Target | Code work |
|---|---|---|---|
| 4.1 | Three pipelines: `schemagen` concat/retag/vocab with a shell task; ad-hoc per-plugin gengotypes (64 of 117 plugins generate, 1 through `go:generate`); `wiregen` for the protocol. | D-GEN-1 | One pinned generator and one task in every repository; delete the vocabulary generator and the YAML retag. |
| 4.2 | Hand-written `json.Unmarshal` of `params_json`, and 33 hand-written `{Args}` envelopes. | D-GEN-6, D-PROTO-6 | Generate the typed role and api wrappers; validate every payload on receipt. |
| 4.3 | Four command models: Kong structs, reflected `#CLIModel`, the `CLISubcommand` catalog and `command_model_json`. | D-CLI-4, §13 | Command arguments as CUE definitions in the owning plugin's module; generate the grammar and MCP tools from them. |
| 4.4 | No generation gate in plugin repositories. | D-GEN-2 | A reproducibility gate in every repository. |

## 5. Modules and the plugin protocol (§3, §4)

| # | Current state (evidence) | Target | Code work |
|---|---|---|---|
| 5.1 | `spec` holds mechanisms: `exec` (3.6k lines), `container`, `sshx`, `proc`, `poll`, `lock`, `cache`, `refs`, `hostenv`. | D-SPEC-1 | Move them to sdk. |
| 5.2 | `sdk` holds domain code (`deploykit` 18.8k lines, `loaderkit` 7.6k, `vmshared` 3.5k, `buildkit`, `packagekit`) and 64 `type X = ` alias definitions (354 lines carry a `var`/`const`/`func`/`type` alias), counted 2026-11-12. | D-SDK-2, D-MOD-2 | Move the domain code into the owning plugins and the loader into core; delete the aliases. |
| 5.3 | Symbols defined twice: `buildPluginBinary`, `QuadletDir`, `StepDoMode`, `DeployExecutor`, `ComputeCalVer`, `CheckVerbProvider`. | D-MOD-2 | Give each one owner. |
| 5.4 | Core holds about 3.5k lines of domain logic: pod lifecycle options, VNC port 5900, `libvirt` forced into beds, the podman fallback, GPU allocation, the `""`/`"container"`→`"pod"` rewrite. It embeds a 5,339-line `charly.yml` (distros, builders, inits, OVMF, verb primaries; counted 2026-11-12) and runs about 30 `HostBuild` seams. | D-CORE-1, D-CORE-2, §3.1 | Move each into its owning plugin (§3.1); replace the seams with the host service methods (§4.6) and `api` calls. OS, init and builder nodes become data in the OS repositories. |
| 5.5 | Five placement paths, three serve styles (`sdk.Serve`, `sdk.Main`, `ServeCheckVerb`), two serve commands (`__plugin`, `__agent-target`), three verb-dispatch branches, two executor APIs. | D-PROTO-1..4 | One transport: `<binary> serve` with an empty environment and the two sockets; compiled-in plugins on an in-memory listener; one generated server. |
| 5.6 | Capabilities are declared in three places: manifest `providers:`, Go `NewMeta`, and the generated refs map; CalVer literals in plugin Go (`"2026.181.0001"` ×12). | §4.1, §4.4, D-PLUG-3 | The plugin candy's `provide:` is the manifest; `describe` reports its digest and the handshake verifies it; release stamped from the tag. |
| 5.7 | Twelve provider classes and 43 string operations over an untyped `Invoke`; capability flags (`structural`, `lifecycle`, `preresolve`, `validates`, `primary`, `interactive`, `command_parent`, 10 `DeployTraits`). | §4.2, D-ROLE-1..5 | The five roles and their methods, with typed inputs and outputs; optional behaviour = a method left out of `describe`. `step`, `builder`, `build`, `engine`, `loader`, `refs`, `agent-runtime` and `terminal` map onto `verb`, data nodes or `api` (mapping table produced per class in this item). |
| 5.8 | Helpers copied across plugins: `session_method`/`recorder` ×6, `setCommandContext` ×8, `shellQuote` ×4, 20 private CheckEnv subsets. | D-SDK-1, D-CODE-3 | sdk mechanisms. |
| 5.9 | No error model or deadline on plugin calls; plugins reach the engine, ssh and secrets directly; deployment locks are taken inside plugins. | D-PROTO-6..13 | `#Request`/`#Reply` with `#Error` codes; deadlines and cancellation; locks taken by core before mutating methods; the host service as the only reach for venues, store, project, other plugins and secrets, with permissions from the call. |
| 5.10 | No protocol conformance suite. | §4.7 | The in-memory harness in sdk with the conformance cases; run in every plugin repository's CI. |
| 5.11 | Deployment plugins keep records in their own files, generate ssh keys on disk, and read engine endpoints from the environment; the candy is built by core-side code. | §4.2, §4.6, D-PROTO-4, D-PROTO-13 | `get`/`put` on the `state` store for kind records, `put` on the `secret` store for generated secrets, `get` on the `config` store for engine endpoints; the candy kind (`kind:candy`) with `build` in the build plugin. |

## 6. Plugins and the install IR

| # | Current state (evidence) | Target | Config migration | Code work |
|---|---|---|---|---|
| 6.1 | Three install emitters (`EmitTasks`, `OCITarget`, `WalkPlans`) and two plugin step mechanisms (`ExternalPluginStep`, `external:<word>`). | §14.4, D-IR-1 | `run: … helm-release:` → the `helm:` manager prefix or the `helm` verb | One IR consumer per output; plugins contribute only through kinds and verbs. |
| 6.2 | `plugin-builder-{aur,cargo,npm,pixi}` are the same code with one word changed; `external_builder` is used once. | D-PLUG-2 | `external_builder: mise` → a `builder` node | One builder implementation over `builder` nodes. |
| 6.3 | One concept spread across many plugins: pod (plugin-pod, deploy-pod, substrate, deploykit); vm (plugin-vm, deploy-vm, substrate, vmshared); check (14k lines) and vm (17k) god-modules. | D-PLUG-1, §3.1 | none | Consolidate per concept as §3.1 assigns; split by sub-concept inside a plugin. |
| 6.4 | Fourteen example repositories; five examples are compiled into the release. | D-REPO-3, D-CORE-4 | none | One examples repository. |
| 6.5 | Verb duplicates: `addr` vs `port`; `matching` vs the matchers; the `helm` verb vs the `helm-release` step. | D-LAW-1 | `addr: h:p` → `port: {host: h, port: p, reachable: true}`; `matching` steps → matchers | Merge them. |
| 6.6 | Application verbs: `qdrant`, `openclaw`, `crabbox`, `punktfunk`, `agentteams`, `dsh`, `herdr`, `quickshell`, `cstream`, `omarchy`. | D-VERB-1 | each step → `http:` with JSON-path matchers or `command:` (per-verb mapping tables from inventory 0.1) | Add the `json` matcher to `http`; move the plugins out of the first-party set. |
| 6.7 | Internal operations exposed as verbs: `enc`, `egress`, `gpu`, `k8sgen`, `oci`, `arbiter`, `retention`, `credential`, `nerdctl`, `gh`, `tunnel`, `transcode`. Unused: `splice-region`, `module-pins`, the `build` operation, `bpf`. | D-ROLE-3, D-LAW-2 | none | Turn them into `api` calls or delete them. |
| 6.8 | Plugins are found implicitly: a word→repository map generated into core (`plugins_refs_generated.go`, 195 entries) with lazy connect on a registry miss, `compiled_plugins:` deciding which words exist, `plugin.requires` + `extra_ref` fetches, and plugins built from source on the host. | §7, D-PLUG-4..6 | every project gains a `plugin:` directive listing the plugin repositories its words need (generated by `charly migrate` from the words the project uses); `box reconcile` pins releases and digests | Registry from declarations only; prebuilt per-platform binaries with each plugin release; an embedded plugin runs only on an exact match; delete the refs map and lazy connect. |
| 6.9 | Every OS package a plugin needs is declared in charly's own package instead of by the plugin: `charly/packaging/charly.yml`'s `packaging.formats.*.depends` names `podman` (the pod plugins), the `qemu-*`/`libvirt*`/`virtiofsd`/`swtpm`/`dnsmasq`/`edk2-ovmf`/`xorriso` set (the vm plugins), `nerdctl`/`containerd`/`cni-plugins`/`rootlesskit`/`buildkit` (plugin-nerdctl), `kind` (plugin-kube's `kindcluster` kind), `openssh*` (the ssh venues of the vm and local kinds), `gocryptfs`+`fuse3` (encrypted volumes), `gnupg`+`pinentry` (the secrets backend), `rust`+a monospace font+`procps-ng` (building and rendering `agg` for `record: gif`, `pgrep` in `record: start`), with `tesseract` in `suggests`/`optdepends` (the `artifact_contains_text:` assertion, `sdk/artifact.go`); no plugin candy declares an OS package it needs to run — the one package list in a plugin candy (`plugin-marketplace`'s `distro: {fedora: {package: [git]}}`) is deployment content, not the host. There is no way to install a missing package on the host at all, and no switch that would gate it. | D-CANDY-6, §4.1, §16.1, D-STORE-9 | each plugin candy gains `package:`/`os_override:` for the OS packages it needs to run (plugin-vm + plugin-deploy-vm: the qemu/libvirt set; plugin-pod + plugin-deploy-pod: podman, fuse3, fuse-overlayfs, slirp4netns; plugin-nerdctl: the nerdctl stack; plugin-kube: kind; plugin-record: rust, a monospace font, procps-ng; plugin-secrets: gnupg, pinentry); the charly candy's `packaging.formats.*.depends` keeps only core's entries; the user configuration gains `local_install: false` | `charly generate-packages` (sdk/packagekit; later `release-package`) unions the packages of the plugins a `packaging.variants` entry names with the candy's own `depends`; `charly doctor` reports a declared plugin's missing packages on the host; the new `charly local-install` command installs them only while `local_install` is true (or with `--local-install` for one invocation) and every other path reports or fails instead; the transcribed lists are deleted. |

## 7. Store (§20)

| # | Current state (evidence) | Target | Code work |
|---|---|---|---|
| 7.1 | Plugin binaries are keyed by absolute source path (19 GB, 2,025 binaries, 1,762 test stubs in the user cache). | D-STORE-4, D-STORE-8 | Key by content; inject test roots. **Answered 2026-11-11** — keyed by content: `opencharly/sdk` `b77c8a54d2331f77ee7308e43503bb051e7df6b2` (tag `v0.2026287.1747`, PR #389) keeps ONE store entry per binary, keyed by D-STORE-4's whole input set, with the per-key lock outside the store tree, and `opencharly/charly` `125a910988495170e7f2ab4d601fa4e70e1cd3bc` (tag `v2026.288.0051`, PR #910) deletes the loader's path-keyed cluster; the test root is `$XDG_CACHE_HOME/charly` with `$CHARLY_CACHE_DIR` as the sole override (D-STORE-8). The *Current* cell's figures are that OLD root's on-disk residue — 35 GB across 5 126 files, 1 083 of them `.stamp` sidecars, measured on 2026-11-11 — whose purge `7.3` owns. |
| 7.2 | Three cache environment variables still read (`CHARLY_CACHE_DIR`, `_REPO_CACHE`, `_MATERIALIZED_CACHE`; `_BUILD_CACHE` and `_GH_CACHE` are already 0 at 2026-11-12) and about 9 hand-built `.cache` paths mixing `UserCacheDir` and `UserHomeDir`. | D-STORE-1 | One sdk package. The two remaining variables beyond `CHARLY_CACHE_DIR` are deleted in the phase that migrates the cache they serve, and the hand-built paths route through the same resolver — no variable and no hand-built path survives its own phase (R5). |
| 7.3 | Five on-disk caches: per-ref repository exports (about 11k) that also cache the mutable `@main`; `materialized/` JSON carrying timestamps and temporary paths — a D-STORE-6 violation of the payload rule, while the payload/validity-metadata split itself is already implemented (the resolution record lives in the config blob, not in the payload); `vm-images/` with sidecar files; lock files never collected; and the OCI-layout store with 6 callers. | D-STORE-3, D-STORE-5..7 | The ordered migration below: one cache per cutover, each provable by one honest R10 gate, with each bespoke form deleted in the phase that migrates it (R5, no dual path), and `charly clean` purging the old roots (D-STORE-7). |

**The ordered migration — one cache per cutover, deletions inside their own phase:**

0. **The store and the roots** (`sdk/storekit` for the store, `spec/storeroot` for the roots it lives under): the OCI-layout store (D-STORE-3), the four roots from one resolver (D-STORE-1), entries and views. Every phase below depends on it, and none may invent a second on-disk format.
1. **The plugin-build cache** → the store (`sdk/buildcache`): one content-addressed entry per binary, keyed by module source, `go.sum`, the toolchain and the platform (D-STORE-4), with the per-binary lock moved out of the store tree to the runtime root.
2. **The repo cache and its derived views** → the store: `.ref`, `.charly-view-ok` and `.stamp` sidecars die by construction, because a mutable name resolves to a commit before it reaches the store and that resolution record is the entry's config blob (D-STORE-5).
3. **The `materialized/` and load caches** → the store: the JSON-with-timestamps form disappears, and no payload carries a timestamp or an absolute path that is not an input (D-STORE-6).
4. **`vm-images`** → the store, as a directory payload (`PutTree`: per-file blobs plus one manifest blob carrying the tree's own RFC 6838 media type), and the `.sha256` sidecar is deleted.
5. **The residue**: the four extra cache environment variables, the ~9 hand-built `.cache` paths and the remaining sidecars are deleted, and `charly clean` purges the old roots within its budget (D-STORE-7).

## 8. Command line (§22)

| # | Current → target | Migration |
|---|---|---|
| 8.1 | Duplicated and kind-specific commands: `remove` → `deploy del`; `config setup` → `deploy add`; `config mount/unmount/passwd/status` → `volume`; `box labels` → `box inspect`; `box generate` → `box build --emit`; `box fetch/refresh` and `cache clear` → `cache` and `clean`; `candy set/add-*` → `box set`, `box add-candy`; `feature` and `box feature` → `check harness`; `deploy status` → `status`; `logs` → `log`; `deploy from-box` → a project with a `source: {oci: …}` node; `tmux` → `agent terminal`; `reap-orphans` → `clean`; `ssh tunnel` → `display`; the `vm` group: `vm build`/`bake` → `box build --form disk`; `vm clone`/`vm snapshot` → capture boxes; `vm ssh`/`vm scp` → `shell`/`cp`; `vm console` → `console`; `vm screenshot`/`sendkey`/`type` → `display` and the display verbs; `vm cp-box` → `box load`; `vm import` → `deploy adopt`; `vm gpu`, `vm seed` and `vm retag` are removed (GPU modes are leases and `doctor`); `vm start/stop/destroy` and `kubevirt …` → the shared lifecycle commands; `secrets` → `secret`; `settings` → `config` (freed by the moves above); `docs generate` → `doc generate`; `generate-packages` → `release-package` | Docs, skills and scripts are updated in the same change. No aliases remain. |
| 8.2 | Application commands (`agentteams`, `herdr`, `dsh`, `qdrant`, `ollama`, `nerdctl`) → `charly cmd <deployment> <tool>`; `bpf`, `cardwire` and `udev` leave the first-party set. | Same. |
| 8.3 | Writes to `~/.config/charly/charly.yml` by `deploy add`, `config` and `remove` → records in the state root (D-DEP-5, D-LAW-6). | The one-shot conversion of 2.6. |

## 9. Repositories (§24, decision 1.1)

| # | Item |
|---|---|
| 9.1 | Create the decided candy-family and plugin-concept repositories. Move the content, preserving history where practical, and archive `layer-*`, `pod-*`, `distro-*`, `vm-*`, the superseded `plugin-*`, `charly-<distro>` and `pkg-*`. |
| 9.2 | Update the umbrella: submodules, the pin contract (the OS repository set), `task map`, `org-map`, the README tables, and the `AGENTS.md` dispatcher. |

## 10. Documentation

| # | Item |
|---|---|
| 10.1 | `charly/AGENTS.md`, `spec/AGENTS.md` and `sdk/AGENTS.md`: replace the architecture prose (boundary law, SDD) with pointers to DESIGN.md; add the umbrella rule that DESIGN.md is normative. |
| 10.2 | Rewrite the skills to the DESIGN vocabulary. Delete the measured contradictions: 5 vs 7 substrates, `target:` present or absent, `fleet` vs `deploy`, the dot rule, `source: builtin`, `EmitTarget`, the operation counts. |
| 10.3 | Rewrite `PROGRAM/nested-deploy-members.md` as completed by §17.2, or retire it once 3.10 lands. |

## 11. Final proof

| # | Item |
|---|---|
| 11.1 | Every §25 gate passes, and the conformance bed passes on every deployment kind. |
| 11.2 | Fresh R10 beds on every affected deployment; a `check-roster` of all beds; `charly box validate` clean with zero warnings; `bash scripts/design-check.sh` passes. Then delete TODO.md. |

## 12. OCE alignment — the openclaw-enterprise ledger

### 12.0 The measured schedule — all 87 open items, classified at today's tips

**What this is.** Every item `## Status` recorded as `open` before this change (87 of 107), re-measured at the tips
the umbrella's own index pins today, and placed in exactly one bucket: **MOVED**, **DONE-ALREADY**,
**CHAIN(n)**, **DECISION**, **LIVE-CLAIM**, **SINGLE**. The row is a claim, not a specification —
several rows did not survive contact, and §12.6 lists every contradiction.

**The measurement form.** Each `measured anchor` below is one or more calls of the form
`gs <repo> <text>` = `git -C <repo> grep -c -F '<text>' origin/main | awk -F: '{s+=$NF} END{print s+0}'`
(matching lines, summed over files); `gsE` is the same with `-E`. Every zero carries a live-word
control in the same cell, because a zero without a control is a claim about a grep, not about the
tree. Measured 2026-11-12 at `spec` `721eac74`, `sdk` `c68597bf`, `charly` `152dc845`, `plugin-kube`
`db039230`, `marketplace` `e15081ab` — and those are exactly the commits the umbrella's index
records (`git ls-tree origin/main -- spec` → `721eac74d13b…`), so the pin is the remote tip today
and a pin measurement is a tip measurement.

**Why this shape.** `charly#1119` proved the unit of work: a design contradiction — `D-STORE-1`
wants one cache-root resolver while core may not import `sdk` — cannot land as one PR. It resolved
as `spec#303` → `sdk#499` → `charly#1121`, with `plugin-candy` as a fourth leg discovered
mid-flight, then one umbrella pin PR `#991`: four producer PRs, one pin leg, `0 of 409`. Every
CHAIN(n) below is that shape, and its legs are the producer-first order this file already declares:
spec → sdk → charly → plugins → candy and OS repositories → umbrella.

**Two references decide the order.** `#950` is the sequence issue: the D-PAT census (`#945`)
tolerates 26 duplicate definition sites across 5 pinned repos and **not one can be retired until
the schemas compose by import** — so `2.1` is first, not because it is largest but because `#950`'s
count cannot move without it. `#985` is why every number here carries its command: the pre-push gate
reconciles a body against its diff on FORM and on FILE SET and never asks whether a claim is backed
by output, so a schedule that types its counts is precisely the artefact that gate cannot catch.

**Census.** Counted from the rows themselves — `grep -c '^| CHAIN |' TODO.md` = 81,
`grep -c '^| DECISION |' TODO.md` = 2, `grep -c '^| MOVED |' TODO.md` = 2,
`grep -c '^| DONE |' TODO.md` = 2, `grep -c '^| LIVE-CLAIM |' TODO.md` = 0,
`grep -c '^| SINGLE |' TODO.md` = 0, total 87.

| bucket | count | what it means here |
|---|---|---|
| `CHAIN` | 81 | needs an ordered producer-first sequence; the legs and the forcing edge are named per row |
| `DECISION` | 2 | an operator call, not work; the question and the options with their costs are named |
| `MOVED` | 2 | the premise no longer resolves at the tip; the change and the proof are named |
| `DONE-ALREADY` | 2 | the tree already satisfies it; the proof is named |
| `LIVE-CLAIM` | 0 | no open PR or issue claims any of the 87 scopes |
| `SINGLE` | 0 | the smallest surviving unit is two repositories |
| **total** | **87** | 81 + 2 + 2 + 2 matches the 87 rows `## Status` carried as open before this change; 83 remain open after the two DONE and two MOVED retirements, because the two DECISION items stay open |

**Status reconciliation.** The two DONE and the two MOVED items leave `open`; the two DECISION items
stay `open` because an unanswered call is still open work. `## Status` is updated in the same change,
and every row is re-summed, never re-typed.

| section | items | done | open | moved |
|---|---|---|---|---|
| 0. Preconditions | 4 | 2 | 1 | 1 |
| 1. Decisions | 2 | 1 | 0 | 1 |
| 2. Schema | 16 | 1 | 12 | 3 |
| 3. Parsing and validation | 33 | 1 | 31 | 1 |
| 4. Generation | 4 | 0 | 4 | 0 |
| 5. Modules and the plugin protocol | 11 | 0 | 11 | 0 |
| 6. Plugins and the install IR | 9 | 0 | 8 | 1 |
| 7. Store | 3 | 1 | 2 | 0 |
| 8. Command line | 3 | 0 | 1 | 2 |
| 9. Repositories | 2 | 0 | 2 | 0 |
| 10. Documentation | 3 | 0 | 2 | 1 |
| 11. Final proof | 2 | 0 | 2 | 0 |
| 12. OCE alignment | 15 | 3 | 7 | 5 |
| **Total** | **107** | **9** | **83** | **15** |

items `4+2+16+33+4+11+9+3+3+2+3+2+15 = 107`, done `2+1+1+1+0+0+0+1+0+0+0+0+3 = 9`, open `1+0+12+31+4+11+8+2+1+2+2+2+7 = 83`, moved `1+1+3+1+0+0+1+0+2+0+1+0+5 = 15`, and `9 + 83 + 15 = 107`.

**No SINGLE survived.** Round 53 measured zero single-repo items and this round confirms it: the
smallest surviving unit is two repositories (`spec` > `charly`, or `sdk` > `charly`). Two
near-misses were checked and rejected — `12.8` and `12.15` each name `plugin-kube` as the code home,
but `git -C plugin-kube show origin/main:charly.yml | grep -c -E 'disposable|check-'` = 0 (the
repo-wide `gs plugin-kube disposable = 24` counts prose elsewhere and is not the bed question), so each
still needs a bed leg that lives
elsewhere. **One new SINGLE exists, as a successor** rather than as an existing row: the residual
half of `12.13` in §12.3.

**No LIVE-CLAIM.** Three PRs are open across the two shared producer repos — `sdk#368`, `sdk#362`
and `charly#926`, all authored by `aitrawog` and last touched 2026-11-03/05. None claims a TODO
item's scope, so no item is blocked by a claim. They do constrain concurrency (§12.5): they hold
`sdk` and `charly`, so a chain whose next leg is one of those repositories waits on that
repository's window, not on a claim.


### 12.1 CHAIN — 81 items

| bucket | n | item | producer-first legs | forcing edge | measured anchor |
|---|---|---|---|---|---|
| CHAIN | 4 | 2.1 | spec > sdk > charly > plugin repositories | charly cannot compose a plugin CUE module before sdk can fetch and type it | gs spec `^#[A-Za-z]+Value:` = 12 defs; schema/ holds candy.cue, node.cue |
| CHAIN | 3 | 2.3 | spec > sdk > charly | the generator must emit before the hand-written types are deleted | gs spec @go( = 2859; @go(-) = 82; hand_state_types.go = 1 |
| CHAIN | 3 | 2.6 | spec > sdk > charly | the envelope key set is a schema fact before it is a type | gs spec compiled_plugins?: = 1 (schema/node.cue:191); verb_primaries?: = 1 (:206) |
| CHAIN | 3 | 2.7 | spec > sdk > charly | a rule must exist in the schema before the Go seam can be deleted | gs sdk LoadSeams = 41; loaderkit/node_validate.go, cue_validate.go present |
| CHAIN | 4 | 2.8 | spec > sdk > charly > plugin manifests | the loader reads the manifest after the schema drops the key | gs spec verb_primaries = 3 (schema/node.cue); gs charly verb_primaries = 2 |
| CHAIN | 4 | 2.9 | spec > sdk > charly > every manifest | the rename is one vocabulary in three repos and then a config migration | gs spec `#Distro:` = 1; gs spec `distro?:` = 2 (schema/candy.cue:95, :251) |
| CHAIN | 4 | 2.10 | spec > sdk > charly > plugin-vm/plugin-build | one from: resolver needs one source kind before the loader can use it | gs spec base?: = 9; from?: = 13; bootstrap_builder_image = 10; cloud_image = 71; container_disk = 72; bootc = 99; imported = 74 |
| CHAIN | 4 | 2.11 | spec > sdk > charly > plugin-vm/plugin-pod | the deployment field set is schema before it is dispatch | gs spec from?: = 13; image?: = 44; template?: = 29 |
| CHAIN | 4 | 2.13 | spec > sdk > charly > plugin repositories | deletion is schema, then generated Go, then manifests | gs spec `#Theme` = 23; `#Session` = 20; `#DisplayManager` = 10; desktopentry = 6; `#Kubevirt` = 54; agent-team = 0; `#PodTemplate` = 0 |
| CHAIN | 5 | 2.14 | spec > sdk > charly > distro-arch/cachyos/debian/fedora/omarchy/ubuntu > umbrella | the template form must leave the schema before 112 authored templates can be rewritten | gs each distro repo `vm:` lines = 6/39/3/8/48/8 (112 total; control gs distro-fedora `candy:` = 80) |
| CHAIN | 4 | 2.15 | sdk > plugin-vm + plugin-pod > charly > beds | one field set and one command set must exist in the shared layer before either kind can adopt it | gs sdk Snapshot = 248; Console = 385; gs sdk ApplyCandies = 0; BootDisk = 0 |
| CHAIN | 3 | 2.16 | spec > sdk > charly | the schema patterns are the generator's input | gs spec close( = 48; `#CandyValue` = 12 |
| CHAIN | 2 | 3.1 | spec > sdk | the parse rules read the composed schema | gs sdk DeploySubstrates\|StructuralKinds\|ExternalDeploySubstrates\|resourceKindSet\|discEntityPairs\|isEntityValue = 94 |
| CHAIN | 3 | 3.2 | spec > sdk > charly | one unification per node needs the definition the kind key selects | gs charly foldSubstrateKind\|foldCandyKind = 51 |
| CHAIN | 2 | 3.3 | spec > charly | steps are validated against the schema's tag-tagged unions | gs charly ValidateNodeFormSteps = 2 |
| CHAIN | 2 | 3.4 | charly > plugin-example-bootstrap | the bootstrap phase has exactly one consumer, and deleting it is that consumer's removal | gs charly config_stack.go\|/etc/charly/charly.yml = 24 |
| CHAIN | 2 | 3.5 | sdk > plugin repositories | the generic table must exist before the typed views can leave | gs spec UnifiedFile = 178 |
| CHAIN | 3 | 3.6 | spec > sdk > charly | the keyless node is a schema rule before a loader rule | gs spec "candy" = 17 |
| CHAIN | 3 | 3.7 | spec > sdk > charly | every composition key collapses into require: in the schema | gs spec add_candy = 83 |
| CHAIN | 3 | 3.8 | spec > sdk > charly | the reference grammar is parsed by the contract module | gs spec ParseRemoteRef = 20 |
| CHAIN | 3 | 3.9 | spec > sdk > charly | the import entry shape is schema before resolution | gs spec `alias?:` = 6; `import?:` = 1; `#Import` = 0 |
| CHAIN | 3 | 3.10 | spec > sdk > charly | each kind's nesting definition is schema before the core sets die | evidence doc PROGRAM/nested-deploy-members.md ABSENT at origin/main; gs spec `nested?:` = 3 (node.cue:138, seam.cue:651, status.cue:62) |
| CHAIN | 2 | 3.11 | spec > charly | PATH is a field set before it is a resolver | gs spec path_append = 25; gs charly path_append = 2 |
| CHAIN | 4 | 3.12 | spec > sdk > plugin candies > charly | the solver reads need:, which the schema must define first | gs spec `need:` = 0 (control `provide?:` = 14); gs sdk requires_exclusive = 29 |
| CHAIN | 3 | 3.13 | spec > sdk > charly | the key renames in the schema, the loader and the commands | gs spec `plan:` = 70; `step:` = 26 |
| CHAIN | 3 | 3.14 | spec > plugin-kube > charly | kindcluster and k3s must be one kind before the merge | gs spec `#Kindcluster` = 39 |
| CHAIN | 2 | 3.15 | marketplace > docs | the corpus is generated from authored sources | gs marketplace image-candy = 0; gs docs image-candy = 0 |
| CHAIN | 2 | 3.16 | spec > charly | one positional grammar replaces the flag | gs spec DefaultProjectRepo = 4 |
| CHAIN | 2 | 3.18 | spec > charly | the modifier is a schema field before the loader reads it | gs spec in_container: = 3; gs charly in_container = 84; on_host = 0 |
| CHAIN | 2 | 3.19 | spec > charly | the context is derived from the enclosing node, a loader rule | gs spec kube_context = 20 |
| CHAIN | 2 | 3.20 | spec > charly | the plugin: directive is schema before the bed loader reads it | gs spec add_candy = 83 |
| CHAIN | 2 | 3.21 | spec > plugin-android > charly | the device fields move onto the android node in schema | gs spec `adb?:` = 2; `box?:` = 25 |
| CHAIN | 3 | 3.22 | spec > sdk > charly | plural key renames are schema, then generated Go, then loader | gs spec `install_opts:` = 5; `nodes?:` = 6; `defaults?:` = 7; `cluster_node:` = 0 |
| CHAIN | 4 | 3.23 | spec > sdk > plugin candies > charly | grants are a need: type before auto-detection can be deleted | gs spec no-auto-detect = 3; cap_add = 9; devices?: = 8; requires_exclusive = 22 |
| CHAIN | 3 | 3.24 | spec > sdk > charly | captures are boxes in schema before the colon grammar dies | gs spec from_snapshot = 76; on_finalize = 6 |
| CHAIN | 14 | 3.25 | spec > plugin-adb/appium/cdp/wl/vnc/spice/dbus/record/jetkvm/libvirt/mcp/helm/kube > charly | each verb's input is an operation registry in its owning plugin | gs plugin-adb `method:` = 1 (schema/adb.cue:38) + 11 prefixed input fields |
| CHAIN | 3 | 3.26 | spec > sdk > charly | the file action is the IR's vocabulary | gs spec `run?:` = 17; mkdir: = 13; setcap: = 4; `include?:` = 5; `extract?:` = 5; `shell?:` = 9 |
| CHAIN | 3 | 3.27 | spec > sdk > charly | the field renames are one schema change, then generated Go, then loader | gs spec `artifact?:` = 6; `apk?:` = 4; `reboot?:` = 2; `security?:` = 12; `plugin?:` = 8 |
| CHAIN | 3 | 3.28 | spec > sdk > charly | the verb input shape is schema before the primary-field machinery dies | gs spec `command?:` = 12; in_container: = 3; `stdout?:` = 7 |
| CHAIN | 2 | 3.29 | spec > charly | provide: items are maps in the schema | gs spec `providers?:` = 4; `provide?:` = 14 |
| CHAIN | 3 | 3.30 | spec > sdk > charly | collections become maps in schema, then generated Go | gs spec `service?:` = 6; `volume?:` = 11; `alias?:` = 6 |
| CHAIN | 3 | 3.32 | spec > sdk > charly | the disambiguating renames are one schema change | gs spec `context?:` = 17; request_method = 0; `address?:` = 11 |
| CHAIN | 3 | 3.33 | spec > sdk > charly | @ref markers are schema before core can build the graph | gs spec @ref = 0 (control gs spec `#Candy` = 232) |
| CHAIN | 3 | 4.1 | spec > sdk > every plugin repository | one generator must exist before 117 plugin repos adopt it | gs spec schemaconcat = 138; gs sdk = 21; gs charly = 31; gs spec wiregen = 43 |
| CHAIN | 3 | 4.2 | sdk > plugin repositories > charly | the generated role/api wrappers replace the hand-written unmarshal | gs spec params_json = 10; gs sdk = 1; gs charly = 8; literal {Args} = 0 |
| CHAIN | 3 | 4.3 | spec > sdk > charly | command definitions become CUE in the owning plugin, then generate | gs spec CLISubcommand = 62; gs sdk = 13; gs charly = 13; command_model_json = 4/4/1 |
| CHAIN | 2 | 4.4 | dotgithub > every plugin repository | one reusable gate, then a caller per repo | gs charly generate-check = 0 (control gs charly reproducib = 66); umbrella scripts/check-*.mjs has no generation gate |
| CHAIN | 3 | 5.1 | sdk > spec > charly | the mechanisms must land in sdk before spec can drop them | gs spec dirs exec/container/sshx/proc/poll/lock/cache/refs/hostenv all present (9) |
| CHAIN | 3 | 5.2 | plugin repositories > sdk > charly | the domain code needs a home before sdk deletes it | gs sdk dirs deploykit/loaderkit/vmshared/buildkit/packagekit all present (5); gs sdk `^type X = ` = 64 |
| CHAIN | 3 | 5.3 | spec > sdk > charly | one owner per symbol, decided in the contract first | symbols in >=2 repos: buildPluginBinary sdk3/charly4; QuadletDir sdk12/spec10; StepDoMode sdk7/spec2; DeployExecutor 66/49/82; ComputeCalVer 4/19/5; CheckVerbProvider 11/66/8 |
| CHAIN | 4 | 5.4 | charly > plugin repositories > spec > umbrella | each seam moves to its owning plugin, then OS/init data becomes repository data | gs charly HostBuild = 381; charly.yml = 5339 lines |
| CHAIN | 3 | 5.5 | sdk > plugin repositories > charly | one transport before the five placement paths collapse | gs charly __plugin = 27; __agent-target = 6; gs sdk ServeCheckVerb = 13 |
| CHAIN | 3 | 5.6 | plugin candies > sdk > charly | the candy's provide: is the manifest before describe verifies it | gs sdk "2026. = 76; gs charly "2026. = 52 (CalVer literals) |
| CHAIN | 3 | 5.7 | sdk > plugin repositories > charly | the roles and their methods are the SDK's vocabulary | gs sdk ProviderClass = 1 (schema.go:51); gs charly ProviderClass = 91; Invoke( = 8/108/45 |
| CHAIN | 3 | 5.8 | sdk > plugin repositories > charly | a helper moves to sdk, then the copies die | gs sdk shellQuote = 14; gs charly = 2; setCommandContext = 0; session_method = 0 |
| CHAIN | 3 | 5.9 | sdk > plugin repositories > charly | the request/reply error model is the SDK's | gs spec `#Request` = 0 (control gs sdk Serve = 187 (control)); Deadline = 70/61/28 |
| CHAIN | 2 | 5.10 | sdk > every plugin repository | the harness lives in sdk before every plugin's CI runs it | gs sdk conformance = 3; gs charly = 6 (mentions, no suite) |
| CHAIN | 3 | 5.11 | sdk > plugin repositories > charly | the state/secret/config stores are host methods | gs sdk deploy_state.go = 28; gs sdk 'ssh key' = 2 |
| CHAIN | 3 | 6.1 | spec + sdk > charly > plugin repositories | one IR before one emitter | EmitTasks 13/50; OCITarget 44/27/7; WalkPlans 5/29/3; ExternalPluginStep 21/1/17 |
| CHAIN | 2 | 6.2 | plugin-builder (one) > four deletions | one implementation replaces four identical plugins | 4 dirs plugin-builder-aur/cargo/npm/pixi present |
| CHAIN | 4 | 6.3 | plugin-pod + plugin-vm + plugin-check > sdk > charly > umbrella | a concept consolidates in its owning plugin before the others' words move | gs spec plugin-pod = 26; gs sdk = 33; gs charly = 78; plugin-vm 97/95/322 |
| CHAIN | 2 | 6.4 | one examples repository > umbrella | the repository must exist before the submodule entries can collapse | 17 example dirs in `.gitmodules`, counted 2026-11-12 |
| CHAIN | 2 | 6.5 | spec > charly | merged verbs are a schema change then a dispatch change | gs spec matching = 136; gs sdk = 183; gs charly = 219 |
| CHAIN | 3 | 6.7 | spec > plugin repositories > charly | api calls or deletion, decided in the contract | gs charly splice-region = 5 (control gs charly 'func Build' = 1) |
| CHAIN | 3 | 6.8 | spec > sdk > charly | the plugin: directive is schema before the refs map dies | compiled_plugins 27/3/134; plugins_refs_generated = 92 (charly) |
| CHAIN | 4 | 6.9 | plugin candies > sdk > charly > packaging | each plugin declares its packages before the transcription is deleted | gs charly packaging/charly.yml podman\|qemu = 20 |
| CHAIN | 2 | 7.2 | sdk > charly | the one resolver exists (storekit) and the two remaining readers route through it | storekit/roots.go present; CHARLY_REPO_CACHE 6/5/12; CHARLY_MATERIALIZED_CACHE 2/0/0; CHARLY_BUILD_CACHE = 0; CHARLY_GH_CACHE = 0 |
| CHAIN | 5 | 7.3 | sdk > charly | five ordered cache phases, one R10 gate each | materialized 142/46/52; vm-images 9/3/4 |
| CHAIN | 2 | 8.2 | plugin repositories > charly | the plugin leaves the first-party set before charly cmd gains it | gs charly command:agentteams = 4; herdr = 1; dsh = 5; qdrant = 1; ollama = 4; nerdctl = 5 |
| CHAIN | 2 | 9.2 | marketplace > umbrella | the map must exist before the umbrella points at it | gs charly 'task org-map' = 2; gs marketplace org-map = 6 |
| CHAIN | 3 | 10.1 | charly + spec + sdk (parallel, no forcing edge) | three AGENTS.md files name DESIGN.md as normative | gs charly\|spec\|sdk DESIGN in AGENTS.md = 0/0/0 |
| CHAIN | 2 | 10.2 | owning repositories > marketplace | skills are authored where the entity lives, then regenerated | gs marketplace 'source: builtin' = 4; EmitTarget = 12; 'target:' = 152 |
| CHAIN | — | 11.1 | all chains > umbrella | every gate and the conformance bed depend on the chains above | scripts/design-check.sh + 12 design-* controls present; design/ gates present |
| CHAIN | — | 11.2 | all chains > umbrella | the final proof, then TODO.md is deleted | TODO.md = 1 at origin/main |
| CHAIN | 3 | 12.1 | spec > sdk > charly | one word for the evaluator and one for the workload | gs spec `#Harness` = 0; `#Agent` = 41; agent-check = 23; harness-check = 0 |
| CHAIN | 3 | 12.6 | spec > plugin-k8sgen + plugin-helm > charly | one arm must exist before the other is deleted | gs spec helm_charts = 7; gs charly = 7; helm-release = 3; plugin-k8sgen/k8sgen.go:187 discards extra values_files, :207 forces includeCRDs |
| CHAIN | 2 | 12.8 | plugin-kube > bed | the lowering leg and the bed live in one repository | gs charly 'dry-run=server' = 0; gs sdk = 0 |
| CHAIN | 2 | 12.9 | spec > sdk | the row states the order; the label set is a spec type then an sdk map entry | gs spec\|sdk ai.opencharly.host_need = 0; gs sdk CapabilityLabelMap = 27 |
| CHAIN | 2 | 12.12 | sdk > charly | the read needs the record the write does not yet produce | gs spec\|sdk\|charly audit_append = 0/0/0 |
| CHAIN | 2 | 12.14 | spec > charly | the reference carries the digest before a consumer can preflight it | gs spec `digest?:` = 1 (schema/candy.cue:548) + oci.cue:65,:96 |
| CHAIN | 2 | 12.15 | plugin-kube > bed | the in-venue import and its bed live in one repository | gs sdk 'images import' = 3 (kind only); gs charly = 1 (CHANGELOG) |

### 12.2 DECISION — 2 items

| bucket | item | the question | options and their costs |
|---|---|---|---|
| DECISION | 0.3 | Run the schema-first-parse RDD spike before `3.1` starts, or waive it against `D-LOAD-5`, which `DESIGN.md` already records? | **(a) Run it** — one disposable bed plus a design record; it can invalidate `3.1` before that chain spends a spec PR, and it is the class of spike RDD exists for (a high-risk assumption where being wrong invalidates the plan). **(b) Waive it** — zero cost now; `3.1` then rests on a classifier whose ambiguity is unproven, the one risk the row exists to retire. The measurement that makes this a real question: `gs spec schema-first = 0` with control `gs sdk DeploySubstrates = 94` — no spike record exists, and the parse it would judge has not been rewritten. |
| DECISION | 9.1 | Which document wins: `TODO.md`'s order to archive `layer-*`/`pod-*`/`distro-*`/`vm-*`/`pkg-*`, or Part I's "Repo classes and naming", which makes those exact prefixes canonical? | **(a) Rulebook wins** — retire the archive half; `9.1` becomes consolidation-only (merge the concept repos that duplicate each other), cost one docs PR and no repository churn. **(b) Archive plan wins** — amend Part I's naming rule first, then the umbrella's `org-map` control, then move or archive ~257 repositories; cost is an org-wide cutover that no single R10 can prove, which is why the row has never started. **(c) Defer** — leave `9.2` blocked and keep the contradiction recorded here. The census that makes the cost concrete: 174 `layer-*`, 72 `pod-*`, 6 `distro-*`, 3 `pkg-*`, 2 `vm-*` submodules at `origin/main`. |

### 12.3 MOVED — 2 items

| bucket | item | what changed | proof |
|---|---|---|---|
| MOVED | 12.11 | The host method the row names no longer exists; deployment state is per-deployment YAML written by `SaveDeployState`, not a key/value `state_put`. The *target* (a transactional commit plus an audit append) is **not** met — the row cannot be executed as written, so it retires and its target needs a new item. | `gs spec state_put = 0`, `gs sdk state_put = 0`, `gs charly state_put = 0`, with control `gs sdk SaveDeployState = 49`; the writer is `sdk/deploykit/deploy_state.go:469`. **Successor:** one item for a transactional state commit plus `audit_append`, in `sdk` then `charly`. |
| MOVED | 12.13 | "`TODO.md` has no status column, so 'is it done?' is unanswerable" is false: this file has carried a `## Status` table since 2026-11-08, derived at umbrella `6f6df4dc40364a62c4e0b7bd17003851bfdbca3e`, and that table is the record the row asked for. The registry half (`specs/{rfcs,plans,archive}`) is untouched. | The `## Status` section at the top of this file, whose own head names the derivation commit; `git cat-file -t 6f6df4dc…` → `commit`. **Successor:** one umbrella-only SINGLE — create `specs/{rfcs,plans,archive}` and point the Status note at it — the one genuine SINGLE this round found. |

### 12.4 DONE-ALREADY — 2 items

| bucket | item | proof |
|---|---|---|
| DONE | 0.1 | The item asks that inventories be taken from fetched `origin/main`, never from lagging checkouts. That question is now a verb: `gs charly MODE=currency = 34` (the pin verb's currency mode), and the pins the umbrella publishes today ARE the tips — `git ls-tree origin/main -- spec` → `721eac74d13b…` equals `git -C spec log -1 --format=%h origin/main` → `721eac7`. The row's own census drifted with it: 424 checkouts claimed, 409 declared by `.gitmodules`. |
| DONE | 1 | The section's "still open" row counts the operator's decided block, but the block is a ledger of decisions already recorded: `git show origin/main:DESIGN.cue \| grep -c -E 'D-\|#Decision'` → 121, and `DESIGN.md` carries `step:` 48 times, `harness` 26, `os_override` 6. The only open question in the section, `1.1`, is already `moved`. Counting a decided ledger as `open 1` is what §12.6 item 1 reports. |

### 12.5 Execution order — what unblocks what, and what must not overlap

**The one rule that governs everything: the shared producer repos serialize.** Every chain's legs
are drawn from {`spec`, `sdk`, `charly`, the plugin repos, the distro repos, the umbrella}, and a pin
bump lands in the umbrella only after every producer leg. Two chains that both need `spec` cannot
run concurrently: each needs its base to be `origin/main`, and the umbrella holds ONE index for the
pin wave (`AGENTS.md` Part II #3 — a wave holds this worktree's index for the minutes it rolls the
submodules). The distribution that makes this concrete is the table's own legs column:
`grep '^| CHAIN |' TODO.md | awk -F'|' '{print $3}' | sort -n | uniq -c` → 2 terminal, 26 two-leg,
38 three-leg, 12 four-leg, 2 five-leg, 1 fourteen-leg.

**Wave 0 — the four unblockers, in this order.**

1. **`2.1`** (plugin schemas compose by import). `#950` states the dependency: the D-PAT census
   (`#945`) tolerates 26 duplicate definition sites and not one can be retired until the schemas
   compose by import. `2.1` also gates `4.1` (one generator over plugin modules), `2.3` (generated
   types) and `2.16` (schema patterns). No other chain may claim the `spec` window first.
2. **`4.4`** (one reproducibility gate, as a reusable workflow in `dotgithub`, then a caller per
   plugin repo). It touches neither `spec`, `sdk` nor `charly`, so it runs concurrently with wave 0
   step 1 — this is the one genuinely independent unblocker, because it turns 117 plugin repos' CI
   into a mechanical adoption.
3. **`7.2`** (the two remaining cache readers — `sdk/refs/cache.go` and
   `sdk/loaderkit/load_cache.go` — route through `sdk/storekit`, the one resolver `sdk#499` just
   re-exported). It is the tail of the chain that just landed and it gates `7.3`; it is `sdk` >
   `charly`, so it takes the `sdk` window directly after `2.1`'s sdk leg.
4. **`12.9`** (the host-need label). The row already names its two repos and their order
   (`spec`, then `sdk` after the pin bump), it closes a live `D-CANDY-4` violation rather than a
   future one, and it is small. It shares `spec` with `2.1`, so it takes the `spec` window after.

**Wave 1 — the two-leg `spec` > `charly` band (26 chains).** These are field renames whose Go side is
small. Batch by file locality, not by item number: `3.11`, `3.19` and `3.32` all touch
`schema/seam.cue`; `3.27`, `3.28` and `3.30` all touch the verb-input region; `3.7`, `3.20` and `3.22`
all touch the composition keys. One spec PR may carry several items **only if** they are one
coherent cutover under one R10 — otherwise they are separate PRs in the same window.

**Wave 2 — the three-leg `spec` > `sdk` > `charly` band (38 chains).** Each is a schema change whose
generated Go must follow. They serialize on `sdk`. A chain's `sdk` PR and the next chain's `spec` PR
may overlap only when the next spec change does not alter the previous chain's generated surface;
when in doubt, do not overlap.

**Wave 3 — the independent legs, which may run beside waves 1–2 because they touch disjoint repos.**
`3.4` (`charly` + `plugin-example-bootstrap`), `3.14`, `12.8`, `12.15` (`plugin-kube`), `6.2`
(`plugin-builder`), `6.4` (a new examples repo), `10.1` (three `AGENTS.md` files, no forcing edge),
`10.2` (authored skills → `marketplace`), `12.6` (`plugin-k8sgen` + `plugin-helm`).

**Wave 4 — the decisions, before their dependents.** `0.3` must be answered before `3.1` starts.
`9.1` must be answered before `9.2` — and until it is, `9.2` is a chain whose first leg is blocked,
not a chain that can be scheduled.

**Wave 5 — the terminal aggregations.** `11.1` and `11.2` land last; `11.2` deletes this file.

**Do not attempt concurrently.** Any two chains whose first leg is `spec`. `2.1` with `2.3` or
`2.16` (same schema surface). `7.3` with anything (its five phases each claim one cache, and the
phase boundary is the gate). `9.2` before `9.1`'s decision. Any chain with a live pin wave (the
wave holds the umbrella index; run no other git command in that worktree).

**What unblocks what.** `2.1` → `#950`'s census + `4.1` + `2.3` + `2.16`. `4.4` → every plugin repo's
generation gate. `7.2` → `7.3`. `0.3` → `3.1` → `3.3`. `12.9` → the `D-CANDY-4` violation.
`12.11`'s successor → `12.12`. `9.1`'s decision → `9.2`. `3.14` → `12.8` and `12.15` (same plugin,
same venue knowledge).

### 12.6 What contradicts this file

Twelve measurements disagreed with the prose above them when this round began. Eight are corrected in
the numbered rows by this change, and the other four are resolved as a retirement or a decision
(`1`, `12.11`, `12.13` retired; `9.1` a DECISION). Each is recorded here because the next session's
premise is whatever this file says, and a corrected figure that leaves no trace invites the same
mistake back.

1. **§1 counts a decided ledger as `open 1`.** The block is the operator's decision list, not work:
   `DESIGN.cue` carries 121 `D-` references and `DESIGN.md` carries every one of its terms.
2. **`2.3` says 442 `@go(…,type=…)` overrides and 103 `@go(-)` uses.** Measured 486 and 82 — the
   override count drifted 10% and the `@go(-)` count 21%. A first reading of this row compared its
   `type=` subset against ALL `@go(…)` calls, 2,859, and reported a 6.5× error that was the
   comparison's; the subset is 486, and the row now states it.
3. **`5.4` says charly embeds a 2,085-line `charly.yml`.** Measured 5,339 lines.
4. **`12.13` says "`TODO.md` has no status column".** This file has carried a `## Status` table
   since 2026-11-08.
5. **`9.1` orders the archive of `layer-*`, `pod-*`, `distro-*`, `vm-*`, `pkg-*`.** Part I's "Repo
   classes and naming" makes those exact prefixes canonical. The two documents cannot both be law,
   which is why `9.1` is a DECISION and not a chain.
6. **`2.13` lists `agent-team` and the `pod` template form as unused kinds.** Measured 0 occurrences
   of either: two of its bullets are already gone, so the item is smaller than it reads.
7. **`2.14` counts 109 `vm:` templates.** Measured 112 across the six distro repos
   (6 + 39 + 3 + 8 + 48 + 8).
8. **`7.2` counts five cache environment variables.** `CHARLY_BUILD_CACHE` and `CHARLY_GH_CACHE` are
   already 0 — two of the five were deleted in the phases that migrated their caches.
9. **`12.11` names `state_put`.** The symbol exists in none of the three tips, and state is
   per-deployment YAML.
10. **`3.10` cites `PROGRAM/nested-deploy-members.md` as its evidence.** The file is absent at
    `origin/main` — the same retirement that moved `10.3`. The item may still be real work, but its
    stated evidence cannot be re-measured, so it is scheduled as a chain with that caveat.
11. **`0.1` says 424 checkouts; `.gitmodules` at `origin/main` declares 409.** The row's 424 is a
    dated census (`On 2026-10-03, 31 of 424 checkouts lagged`), so it is history rather than a false
    figure; the number a reader needs today is 409, and the row now states it.
12. **`5.2` counts "about 635 alias lines".** Neither alias measure reproduces it: `^type X = ` in
    `sdk`'s Go is 64, and 354 lines carry a `var`/`const`/`func`/`type` alias. The row did not say
    which thing it counted, so it now states both measures with their commands, and it is scheduled
    on the five domain directories rather than on the count.

### 12.7 Rulebook compliance

- **R0 — skills first.** HOW: `/charly-internals:git-workflow` was loaded before the first git
  action (it is the dispatcher row for branch/commit/push/PR), and the measurement commands were
  read-only `git grep` at a fetched ref. No submodule checkout was edited.
- **R1 — RCA every anomaly, then fix it or file it.** HOW: three anomalies, each root-caused and
  fixed before the affected number was used, and all twelve contradictions of §12.6 resolved in this
  diff — eight figures corrected in the numbered rows, three rows retired, one promoted to a
  DECISION. **(a)** The first matrix summed `awk -F: '{s+=$2}'`, but `git grep` against a rev prefixes
  `origin/main:path:`, so the count is the LAST field and every row read 0. The control (`#Candy`, a
  symbol the file defines) also read 0, which is impossible, and the two runs are pasted rather than
  asserted:

  ```
  $ git -C spec grep -c -F '#Candy' origin/main | awk -F: '{s+=$2} END{print s+0}'
  0
  $ git -C spec grep -c -F '#Candy' origin/main | awk -F: '{s+=$NF} END{print s+0}'
  232
  ```

  Root fix: `$NF`, and every zero now sits beside a live-word control. **(b)** `git log -S` returns
  nothing in this blobless clone (historical blobs are never fetched), so the MOVED provenance was
  re-derived from the CHANGELOG index instead; the missed control was "a `-S` search that finds
  nothing must be proven able to find something". **(c)** The pre-commit gate refused the first
  commit — `FINDING TODO.md:496: an undated count names a growing collection` — and the missed control
  was that this document is
  held to the count-and-date rule it reports on other rows; the count left the forcing clause, the
  census carries its measurement day, and `check-readme-measurements.mjs` reports `OK`. The
  validator's first round then found a fourth defect this bullet had not: §12.6 item 2 compared
  `2.3`'s `type=` subset against ALL `@go(…)` calls and reported a 6.5× error that was the
  comparison's; the subset is 486, the row is corrected in place, and the correction is recorded in
  §12.6 rather than dropped.
- **R2 — no duplication.** HOW: one schedule, one row per item, one canonical statement of each
  number. The §12.6 contradiction list points at the rows rather than restating their measurements.
- **R3 — no workarounds.** HOW: no sleep, retry, suppression or hand-rolled poll. The only watch a
  reader is told to arm is `marketplace/scripts/pr_state_watch.sh`.
- **R4 — product before prose; docs never route around a defect.** N/A, reasoned: this change
  documents no new command and asserts no product behavior. The one command it asks a reader to run
  (`charly task pins --param MODE=currency`) is an existing verb, measured at 34 occurrences.
- **R5 — delete legacy completely.** N/A, reasoned: nothing is renamed or removed by this change.
  The document *records* legacy deletions still owed (the rows' own targets); it performs none.
- **R6 — preserve user work and Git safety.** HOW: a session worktree was created off fresh
  `origin/main` (`34a2b9ba`), `git status` was read first, no submodule was edited (every measurement
  used `git -C <subrepo>` read-only at `origin/main`), and no force-push, reset or hook bypass is
  used.
- **R7 — prove behavior, not compilation.** N/A, reasoned: no behavior changes. The proof this
  document owes is that its numbers are reproducible, which is why every number carries its command
  and every zero its control — and why the counters are row counts of the document itself.
- **R8 — live or skip, never fake a live service.** N/A: no service boundary is touched.
- **R9 — binary equals source.** N/A: no runtime change, and no binary was used to produce a number.
  Every measurement is `git grep` over a fetched ref, so this change makes no R9 claim.
- **R10 — fresh disposable proof.** HOW: the change class is documentation. The gate that owns it is
  the umbrella's pre-push gate, which selects the DESIGN class from the diff: a `TODO.md`-only push
  changes none of the seven controls' inputs, so the gate must report `[pre-push-skip]` and pass.
  The pasted output below is that run. No R10 bed is claimed, and the attribution tier is
  `documentation reviewed` because prose-only work cannot claim a runtime tier.

**The evidence fence — the gate this change owes, run on the committed tree.**

```
$ node scripts/check-readme-measurements.mjs --root .
check-readme-measurements: the umbrella's measured figures, read against each other
  baseline: 9.5–9.5 G, coarse
  light: 77–77 M, 14–15 s
  all: 1.9–2.2 G, 344–403 s
OK — the table, the prose and the samples agree.

$ printf 'refs/heads/feat/todo-measured-schedule %s refs/heads/feat/todo-measured-schedule %s\n' \
    "$(git rev-parse HEAD)" 0000000000000000000000000000000000000000 \
  | bash hooks/pre-push origin https://github.com/opencharly/opencharly.git
pre-push: [pre-push-skip] the DESIGN gate SKIPPED: this push changes none of its inputs.
  The seven controls read DESIGN.md, DESIGN.cue, design/, scripts/design-*.sh and the CUE
  of every pinned module (scripts/design-gate-inputs.sh). A push that changes none of
  them cannot violate them. Run it anyway: bash scripts/design-check.sh
pre-push: [pre-push-skip] no PR body at /home/atrawog/Sync/Atrapub/lo/dsh/opencharly/.git/worktrees/opencharly8/PR_BODY.md — body lint SKIPPED (nothing to check).
pre-push: the body IS the changelog; write the whole thing for the head you are about to
pre-push: publish and push again. To lint a body that lives elsewhere: PR_BODY_FILE.
exit 0
```

That run is the gate this change owes, executed on the committed tree. It printed
`[pre-push-skip]`, so the `#981` fix has not regressed: a `TODO.md`-only push changes none of the
seven controls' inputs. The PR body carries the body-lint pass for the text that ships.

*Assisted-by: DeepSeek Harness ollama-cloud/deepseek-v4.1-flash (documentation reviewed)*



The ledger rows this section was written for follow unchanged; their classification is in the tables
above (`12.1`, `12.6`, `12.8`, `12.9`, `12.11`–`12.15`), and `12.11`/`12.13` are the two the
measurement retired.

> Rows added by the OCE-alignment change. Each closes one gap between today's code and the amended
> `DESIGN.md`, in the dependency order of this file: the spec-layer rows land first because their defect
> exists without OCE. Each row carries its own current-state evidence.

| # | Item |
|---|---|
| 12.1 | **§2.** *Current:* one word, two concepts: `agent` is an evaluator CLI (the kind table's `agent` row) while OCE's Agent is a workload *Target:* `harness` = the evaluator; `agent` = the managed workload *Migration:* every `agent:` kind node → `harness:`; every `need: {agent: …}` → `harness:`; the `agent-check`/`agent-run` **step keywords** → `harness-check`/`harness-run` *Code:* the rename in `_otherKind`, `#Need`, `#StepAlt`; `#InnerOfMachineAlt` gains `agent`; §12.4's prose; §3.1's row; §23's command list |
| 12.2 | **§2/§18.** *Current:* `namespace` carries **four** names in the normative text (`namespace`, `alias`, `import alias`, `import namespace`) across §2's `namespace` row, `D-NAME-1`, `D-VAL-4` and `D-REF-4` and two machine-compared messages; and the namespace set is unguarded against kind words and directives *Target:* **one** term, `namespace`, **defined as a named scope**; the phrase ban in §2's `Not` cell; the reserved-name scalar `#Namespace` *Migration:* none *Code:* the sweep of §10's closing paragraph — and the `rules.cue` messages and the `# expect:` texts change together, or check 3 fails |
| 12.3 | **§2.** *Current:* no parameterization at all; `var:` was current-shape only and is absent from `DESIGN.md` *Target:* inputs as **choices** (`input:`/`with:`), never substitutions *Migration:* a box or candy declares `input:`; a reference supplies `with:` *Code:* `#Input`, `#With`, `_candyField`/`_deployField`, and the loader's resolution (a *choice*, not a substitution) |
| 12.4 | **§14.4.** *Current:* no manager install can carry attributes: `#Package` is a scalar (`helm:<locator>`) *Target:* a manager install carries the owning plugin's own input *Migration:* none *Code:* `#ManagerPackage`/`#PackageEntry`/`#ManagerInput`; `#PackageSet` and `#ActionAlt.package` re-typed |
| 12.5 | **§14.4/§3.1.** *Current:* the manager words are **one flat list with two phases** — a build-phase manager installs into an image and an apply-phase one onto a running target — but nothing ties a word to its phase *Target:* `_managerPhase` maps each manager word to its phase, the **build-time** set is derived (`_buildManagerWord`), and a `builder_box` key must therefore be a build-time manager (`#BuildManager`, `D-IR-7`) — while `#PackageSet` stays **unscoped**, because a body may *declare* a package of either phase: the phase decides **who does the work**, never what may be written *Migration:* none *Code:* the `_managerPhase` table + `_buildManagerWord` + `builder_box`'s key type |
| 12.6 | **§16.1.** *Current:* **a chart installs two ways and the arms silently disagree.** `helm-release:` is an `external:` step (`helm upgrade --install`, every values file passed); `helm_charts:` is a kustomize `helmCharts:` entry applied via `kubectl kustomize --enable-helm \| kubectl apply -f -`. A kustomize entry holds exactly **one** `valuesFile`, so the emitter takes the first `values_files` entry and **discards the rest — no error, no warning** (`plugin-k8sgen/k8sgen.go:204-205`), and forces `includeCRDs: true` with no field to turn it off (`:207`) *Target:* **one arm**: a `package:` entry under the `helm` manager, lowered by the kubernetes deployment kind — the kustomize transformer and the `--enable-helm` shell-out leave the path *Migration:* an authored chart install becomes a `package:` entry with a manager input *Code:* both the `helm-release:` step kind and the `helm_charts:` field are deleted (`R5`, claim-keyed grep); the two beds re-pointed |
| 12.7 | **§23.** *Current:* the `kube:` verb exposes `apply` and `delete`, which are **mutations** — and `D-VERB-1` says a verb observes *Target:* `kube:`/`helm:` carry observation methods only *Migration:* none *Code:* remove both methods; what they did is the workload lowering, the `package: helm:` action, or a `command:` step **Answered 2026-11-11** — both methods, their `manifest:` field and every helper they owned are deleted (`opencharly/plugin-kube` PR #33, merge `d19e95d1cad420f152a1e983430d437269b9f8d3`, tag `v2026.315.0153`), and the served `#KubeInput` refuses `apply`, `delete` and `manifest` while admitting the eleven observation methods; 0 authored uses exist across the 430 submodule `origin/HEAD` tips present on 2026-11-11. Read at `plugin-kube`'s own `origin/main` `db0392301c533cb78de35e475d3bcff432bf1dcd`, never at the umbrella gitlink, which was `df962299eaeedc4dd83e99ca1e18aef0f4ad203c` when the row was answered — opencharly/opencharly#983 advanced the umbrella to that commit. |
| 12.8 | **§14.4.** *Current:* no lowering is **validate-only**, so `admit` is nominal for a venue while `kubectl --dry-run=server` is real *Target:* any lowering supports validate-without-persist *Migration:* none *Code:* the lowering leg + a bed that admits a revision and proves nothing changed |
| 12.9 | **§16.1 labels.** *Current:* **host needs are unlabelled** — `grep -i "gpu\|device\|nesting\|engine_api\|mount"` matches nothing in `spec/spec/label_consts.go` or `spec/schema/boxmetadata.cue`, and `sdk/deploykit/capabilities.go` has 48 `CapabilityLabelMap` entries and 48 constants, **none for a host need**. `D-CANDY-4` is therefore **violated today**, independently of OCE: `charly deploy from-box` cannot see any host need *Target:* one label, `ai.opencharly.host_need`, carrying the resolved host-need set (`gpu`, `device`, `nesting`, `engine_api`, `mount`) *Migration:* none *Code:* **two repos, producer-first**: `spec` — `#LabelHostNeedSet` + `#LabelGpuNeed`/`#LabelNamedNeed`/`#LabelMountNeed` on **both** carriers, `LabelHostNeed`, the read path in `container/box_metadata_coneb.go`, a round-trip test, then regenerate; **then** `sdk` (after the spec pin bump) — the `CapabilityLabelMap` entry, the write path in `deploykit/render_prep.go`, and `TestCapabilityLabelCompleteness` green |
| 12.10 | **§16.1 labels.** *Current:* three of OCE's six workload-posture requirements have no typed home (`readOnlyRootFilesystem`, `seccompProfile: RuntimeDefault`, `allowPrivilegeEscalation: false`); `runAsUser`/`runAsGroup` 1000 and `drop: [ALL]` are already covered by `ai.opencharly.uid`/`.gid` and `#Security` *Target:* `#Security` gains `read_only_rootfs?`, `seccomp_profile?`, `no_new_privileges?` — **optional only** *Migration:* none *Code:* extend `#Security`; the typed fields **replace** the raw `security_opt: ["no-new-privileges"]` rather than sitting alongside it — D-HW-5 admits no raw runtime settings — with a test that the field emits the same posture |
| 12.11 | **§20 store.** *Current:* `state_put` writes one name; no transaction; no audit *Target:* `state_commit` + `audit_append`, committing together *Migration:* none *Code:* the two host methods + `#AuditEvent` + the state-root layout |
| 12.12 | **§22 CLI.** *Current:* no command reads the audit record *Target:* the host group gains the read *Migration:* none *Code:* the command and its argument definition; **no** kind-specific group (`D-CLI-1`) |
| 12.13 | **umbrella.** *Current:* no decision registry; `TODO.md` has no status column, so "is it done?" is unanswerable *Target:* `specs/{rfcs,plans,archive}` + an audited status table naming its commit *Migration:* none *Code:* the tree, the table, and A.7's sentence |
| 12.14 | **§22.** *Current:* charly can form and parse `repo@sha256:<digest>` (`spec/container/local_image_coneb.go:307`, with a test asserting a bare `repo` would match a different image) but nothing writes it where a consumer needs it *Target:* a digest is what a reference carries, for charts as for images *Migration:* none *Code:* the delivery leg + a preflight on the consumer's own reference format |
| 12.15 | **§22.** *Current:* `kind load image-archive` delivers a locally-built image to a charly-created kind cluster with no registry (`plugin-kube/candy/plugin-kube/kindcluster.go:495`), proven by the `check-kindcluster-workload` bed; a `create: k3s` venue has no analogue, and **no local-registry capability exists anywhere in the tree** *Target:* the **in-venue import** pattern: `k3s ctr images import` over the deploy's own venue, so no charly-created venue needs a registry *Migration:* none *Code:* the in-venue import step + the bed |
