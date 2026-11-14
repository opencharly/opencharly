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
(re-summed 2026-11-12 at `34a2b9ba0028d3150cdb53d1211304749ddceb86`, where the opening of section 12
re-measured all 87 open rows and retired four of them — two to `done`, two to `moved` — while the two
`DECISION` items kept `open`; re-summed again 2026-11-12 at
`d88dd451463941deef97d38ca23fbfce9ea615ab`, where the operator's ruling on `9.1` — `AGENTS.md`
Part I outranks this work list — retired that item to `done`, leaving `0.3` the one open
`DECISION`): mechanical
greps at each submodule's `origin/main` pin, never at the lagging checkouts. The numbered text
below is unchanged apart from the verdict an answered item carries in its own row, and the eight
figures section 12.6 corrects in place at the 2026-11-12 tips; this table is
the status record.

**Re-derived 2026-11-13 at `6aa375af5dc9384efe4076ac6af8f082b89b53d6`** — the first pass that
measured EVERY row at the tips and closed the coverage gap, so two kinds of change land here. Four
rows the record held as answered were restored to `open`, because the answer rested on a false
premise or on `DESIGN.cue` alone (`2.2`, `8.1`, `10.3`, `12.4` — the Restored block below and
section 12.6's items 14–18). Thirty-nine rows were ADDED for DESIGN.md requirements no row named (the Coverage
block below; sections 13 and 14 are new). Nothing that landed since 2026-11-12 completed a row —
`2.1`'s units 1–3 were already on the record — while 26 current-state cells were rewritten with
figures that no longer reproduced (`2.2`, `2.3`, `2.14`, `2.15`, `3.4`, `3.5`, `3.10`, `3.25`,
`3.30`, `4.1`, `4.2`, `5.1`–`5.4`, `5.6`–`5.8`, `5.11`, `6.3`, `6.7`–`6.9`, `7.3`, `8.1`, `8.2`) and
four rows took a tag or clause append (`2.7`, `3.12`, `5.9`, `6.6`).

**The measurement base is the TIP, not the pin, as of 2026-11-13.** When this pass measured, the
currency question (`charly task pins --param MODE=currency`) named three pins that were not current:
`sdk` and `dotgithub` were `behind` their `upstream:main` (`sdk` carried #362
`f28475f1f30f87bd1b928b26ffa9f2bf525dab11`, `dotgithub` #287 `ecfd748ba8a3612eab35adc84896632338bd57f9`),
and `distro-cachyos` was `derived-from:charly` and `blocked-by charly:box/cachyos`. Umbrella #1004
(`4a6111f`) then advanced the two `behind` pins, and `distro-cachyos` stays blocked. Every figure below
was read at `origin/main` — the file's own rule, never the lagging checkout — and the rows whose two
bases differ say which they used (`sdk` rows: `e44f0ce25431be99b80aa440518a9a43d6916a86`, which is also
the `sdk` pin since #1004).

| section | items | done | open | moved |
|---|---|---|---|---|
| 0. Preconditions | 4 | 2 | 1 | 1 |
| 1. Decisions | 2 | 1 | 0 | 1 |
| 2. Schema | 26 | 1 | 23 | 2 |
| 3. Parsing and validation | 43 | 1 | 41 | 1 |
| 4. Generation | 6 | 0 | 6 | 0 |
| 5. Modules and the plugin protocol | 13 | 0 | 13 | 0 |
| 6. Plugins and the install IR | 9 | 0 | 8 | 1 |
| 7. Store, state, secrets and concurrency | 6 | 1 | 5 | 0 |
| 8. Command line | 4 | 0 | 3 | 1 |
| 9. Repositories | 2 | 1 | 1 | 0 |
| 10. Documentation | 3 | 0 | 3 | 0 |
| 11. Final proof | 2 | 0 | 2 | 0 |
| 12. OCE alignment | 15 | 2 | 8 | 5 |
| 13. Deployments, drivers, venues and captures | 7 | 0 | 7 | 0 |
| 14. Code rules and enforcement | 4 | 0 | 4 | 0 |
| **Total** | **146** | **9** | **125** | **12** |

The Decisions row counts the unnumbered decided block plus item 1.1.

**Moved.** Each item below names what superseded it, or which part no longer holds:

- `0.4` — CUE is v0.18.0-rc.1, not v0.17.1; the `close()` half still holds (0 occurrences in `DESIGN.cue`).
- `1.1` — the naming rule in `AGENTS.md` now makes `distro-`, `layer-`, `pod-`, `plugin-`, `vm-`, `pkg-` and `charly-` the canonical prefixes, so "archive them" contradicts current policy; `*-skills` carriers are already 0.
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
- `8.3` — contradicted by the settled `command:config` target, which persists into `charly.yml`.
- `12.3` — the vocabulary is now `parameter:`, not `input:`/`with:`.
- `12.5` — replaced by D-IR-7 + `build_with:`.
- `12.10` — `#Security` no longer exists in `DESIGN.cue`; the posture lives in the `nesting:` grant.
- `12.11` — `state_put` exists in none of the three tips; deployment state is per-deployment YAML written
  by `SaveDeployState`. The target (a transactional commit plus an audit append) is unmet and is the
  successor item §12.3 names.
- `12.13` — the `## Status` table this row asked for has existed since 2026-11-08, so "`TODO.md` has no
  status column" is false; the `specs/{rfcs,plans,archive}` half survives as the successor SINGLE.

**Restored — four rows the record held as answered, opened again by measurement (2026-11-13):**

- `2.2` — the moved note said "the duplication is gone". Measured at the tips it is not: 113 of 119
  plugin repositories that carry a `candy/*.cue` schema never reference the contract module, and they
  reproduce the matcher shapes under plugin-private names (`#FileMatcher`, `#HttpMatcherList`,
  `#MountMatcher`) against `spec`'s `#Matcher` / `#MatcherList` / `#MatchOpMap`. What still holds is
  only the package half — `spec` has no `envelope` package — so the row's target now names the
  contract module's own `schema` package, and the row is `open`.
- `8.1` — the withdrawal the note records stands and is folded into the row (`candy set`,
  `candy add-<fmt>` and `candy params` keep their spellings, as does `config`, per DESIGN §22 and
  D-CLI-2; `secrets` is a recorded retirement, not a rename). What does not stand is retiring the
  ITEM: the command census at the tips finds every duplicated and kind-specific word still declared
  (`remove` 1, `logs` 1, `settings` 5, `secrets` 6, `feature` 6, `docs` 5, `kubevirt` 3,
  `reap-orphans` 3, `generate-packages` 4, `candy` 7, `labels` 1, `ssh` 3, `tmux` 1, `vm` 5,
  `deploy` 5, `cache` 2, `status` 5), so the work is live and the row is `open`.
- `10.3` — "`PROGRAM/nested-deploy-members.md` no longer exists" is false: the document is in
  `charly`'s `origin/main` (`PROGRAM/nested-deploy-members.md`, blob
  `dc64e8a6fcf4053bf56114f372e00eca57c5c56b`, 292 lines, `charly` #748/#757), and only the
  UMBRELLA's tree lacks it (`PROGRAM/README.md` is all it carries). The item's own instruction —
  rewrite it as completed by §17.2, or retire it once `3.10` lands — is live, so the row is `open`.
- `12.4` — the "done" note is a `DESIGN.cue` fact, not a code one: `#ManagerPackage`,
  `#ActionPackage` and `#PackageMap` are 0 in `spec`'s CUE (3 hits in `DESIGN.cue`), and
  `#PackageSet` is 0 too, so the shipped schema still cannot carry a manager install's attributes.
  The row is `open`, and its answer is design-only until the `spec` half lands.

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

- `9.1` — **done by operator ruling, not by measurement: the rulebook won.** The item ordered the
  archive of the `layer-*`/`pod-*`/`distro-*`/`vm-*`/`pkg-*` repos, and on 2026-11-12 the operator
  ruled that `AGENTS.md` Part I, "Repo classes and naming", outranks this work list: those prefixes
  are canonical, the archive plan is **withdrawn** rather than deferred, and the repos it named are
  the class-canonical set, not a backlog. Its other half — "create the decided candy-family and
  plugin-concept repositories, move the content" — has no decided list to execute (§1's `1.1`, the
  only document that would have carried one, is `moved`), and no candy name has two homes in either
  class the item names. Nothing was archived and nothing needed to be; the surviving-scope census,
  with its commands and their live-word controls, is §12.4.

**In progress — `2.1`'s units 1–3 of eleven are DONE (the `pipeline`, `task` and `pod` kinds), and the
ITEM stays `open`.** `2.1` asks for *each* kind body to move into its plugin's CUE module. Three of the
eleven host-value-gated kinds have moved; the tracker is `opencharly/spec#304`, which stays open for the
remaining eight. **Unit 1 (`pipeline`) landed 2026-11-12** across seven PRs in four repos and one umbrella
pin wave, measured at the pins that wave set (`spec` `9301181`, `sdk` `4aabb80`, `charly` `36c2dc4a`,
`plugin-pipeline` `b32a25e`, `plugin-task` `8faff1f`):

| # | repo | PR | what it did | squash (40) | merge tag |
|---|---|---|---|---|---|
| 1 | `sdk` | #501 | exports `PlanRefs` / `RewritePlanRefs` and lifts `walkScalarValues` beside them (still unexported) | `e91e784332ae4e33b375891deae6b2d5cc84e565` | `v0.2026316.1524` |
| 1.5 | `charly` | #1124 | `validateKindValueCUE` unifies with the def as receiver (`def.Unify(entity)`), so a served def citing `schema.#…` resolves; witness `TestKindValueGate_ValidatesAServedDefCarryingAContractReference` | `b8de0f93d5bbf607c9ad24698eaa3097b20170bd` | `v2026.316.1711` |
| 2 | `plugin-pipeline` | #63 | declares the 13 `#Pipeline*` defs in its own schema (7 → 20) and relocates `workflowkit/{validate,lower,graph}.go` + tests + 8 goldens | `75e5fc903afdbe6a32f382ea9eac4db6122aa457` | `v2026.316.1740` |
| 2.5 | `plugin-pipeline` | #64 | carries `sdk#368`'s lowering fix and the 34-case (`29 + 5`) `#PipelineValue` closedness corpus off `spec` | `fc2cec31b813b2c5a5d079167c24e488ce5eba3a` | `v2026.316.1819` |
| 3 | `sdk` | #502 | deletes `workflowkit/{validate,lower,graph}.go`, their tests and the 8 goldens (16 files, all deletions) | `ca36ca576b39a9ad9cff2767d010725948ba69bf` | `v0.2026316.1848` |
| 4 | `spec` | #305 | deletes the `#Pipeline*` body defs, keeps `#PipelineClassRoutes`, regenerates | `984ca6aa1b9aa03b7a10c3ee03035764744550a2` | `v0.2026316.1928` |
| 4c | `charly` | #1126 | pins `sdk`+`spec` in lockstep and teaches the corpus sweep the provider-declared `InputDef` | `6ee41d87acdb6b65d98367567814a24c42f9737b` | `v2026.316.2018` |
| pin | umbrella | #996 | advances the four pins | `14bee67c50addad260fd1f9934fa4b6ff6f025a0` | `v2026.316.2127` |

**Unit 1 — what it measured.** `KindValueDefs` 11 → 10 (the `pipeline` word gone); the `#<Word>Value` defs
12 → 11; `spec/schema` kept 13 kind bodies and exactly one `#Pipeline*` def (`#PipelineClassRoutes`);
`plugin-pipeline`'s schema went 7 → 20 `#Pipeline*` defs (the 13 moved in). The 8 lowering goldens are
byte-identical across the move (equal blob ids), and the 34-case closedness corpus moved with the defs
rather than being deleted.

**Unit 1's census relocated; it did not grow.** `#945` tolerates 357 D-PAT violations at these pins with every
per-rule count unchanged (close 54, absence 86, open 68, opaque 0, dup 7, union 142), and the emission's
four changed rows are four RE-HOMED keys (`env?`, `charly?`, `approval?`, `entities?`) from
`spec/schema/pipeline.cue` to `plugin-pipeline/candy/plugin-pipeline/schema/pipeline.cue` — four removed,
four added. The pin wave is the first **pin-advance** emission in the record to add rows; `#959` (the
gate's own census reconciliation, 2026-11-09) added three `dup` rows earlier, so "the first emission
ever" would be false. The design ledgers follow with 17 citations re-anchored: twelve `kind:pipeline`
name citations to the plugin's def set, three `plugin-pipeline/…/cli.go` line citations whose bytes
drifted, and the two on the `pooled fan-out (lanes)` row.

**The contract unit 1 proved — it binds every remaining kind.** A kind that moves its body into its
plugin **must** declare that def on the `kind` capability as `InputDef: "#<Word>Value"`. Without it the
kind falls to the flat plugin-input path, which is `Concrete` (not closedness-only), so authored bodies
start failing. `plugin-pipeline` declares `#PipelineValue`; **unit 2 (`task`) added
`InputDef: "#TaskValue"` in its own change**, and **unit 3 (`pod`) added `InputDef: "#PodValue"` in
`plugin-substrate`**, so the rule is held by three kinds now, not one.

**The corpus-sweep trap, measured on one tree.** `charly/kind_value_corpus_sweep_test.go` selected
bodies with `spec.KindValueDefs[pn.Disc]`; with `#PipelineValue` deleted from `spec`, that predicate
drops every pipeline body and the test still PASSES. Run the shipped sweep twice on ONE corpus root
(a fresh umbrella worktree whose working set is materialized — the tree unit 1's leg 2 used): the
composed arm is the production gate, the `base` arm is its pre-change schema-source oracle.

```
$ CHARLY_CORPUS_ROOT=<fresh umbrella worktree> CHARLY_KIND_VALUE_GATE=composed \
    go test ./charly -run TestKindValueCorpusSweep -v -count=1
gate=composed: judged 431 entity bodies (101 files unparsable, 0 bodies the base arm cannot judge)
  android      1
  candy        104
  kindcluster  24
  kubernetes   19
  kubevirt     3
  local        98
  pipeline     13
  pod          27
  task         40
  vm           102
--- PASS: TestKindValueCorpusSweep (46.51s)
$ CHARLY_CORPUS_ROOT=<fresh umbrella worktree> CHARLY_KIND_VALUE_GATE=base \
    go test ./charly -run TestKindValueCorpusSweep -v -count=1
gate=base: judged 418 entity bodies (101 files unparsable, 13 bodies the base arm cannot judge)
--- PASS: TestKindValueCorpusSweep (48.82s)
$ wc -l <composed verdicts>
532
$ grep -c '^PARSE-ERR' <composed verdicts>
101
$ grep -c '|pipeline|' <composed verdicts>
13
$ wc -l <base verdicts>
519
$ grep -c '^PARSE-ERR' <base verdicts>
101
$ grep -c '|pipeline|' <base verdicts>
0
```

The 13 bodies are the whole difference: the verdict file carries one line per judged body plus one per
unparsable file, so `431 + 101 = 532` lines composed and `418 + 101 = 519` lines base, and the base
arm's own log names the gap: `13 bodies the base arm cannot judge`. The silent form — the old
selection, which never counts what it skips — measures the same 418 / 0 with no failing test; the
guard is `TestSweepLoopJudgesAPluginDeclaredGateDef`, which drives the loop over a fixture whose def
only a served unit declares and is red on assertions when the selection reverts. It passes at the pins:

```
$ go test ./charly -run 'TestSweepLoopJudgesAPluginDeclaredGateDef|TestSweepSelectionResolvesAPluginDeclaredGateDef' -v -count=1
--- PASS: TestSweepSelectionResolvesAPluginDeclaredGateDef (0.02s)
    kind_value_corpus_sweep_test.go:195: gate=composed: judged 1 entity bodies (0 files unparsable, 0 bodies the base arm cannot judge)
    kind_value_corpus_sweep_test.go:195:   gateprobe    1
--- PASS: TestSweepLoopJudgesAPluginDeclaredGateDef (0.00s)
```

**Every kind move must teach the sweep in the same change.**

**Unit 2 (`task`) landed 2026-11-13** as four legs in four repos, then one umbrella pin wave. Each
`squash` below is the commit its own merge tag points at, read from the remote:

```
$ git -C plugin-task ls-remote --tags origin | grep -E 'v2026\.316\.2347$|candy/plugin-task/v0\.2026316\.2347$'
b3264bc137e3400b1a717d0ea83a96c0f8b69349	refs/tags/candy/plugin-task/v0.2026316.2347
b3264bc137e3400b1a717d0ea83a96c0f8b69349	refs/tags/v2026.316.2347
$ git -C sdk ls-remote --tags origin | grep 'v0.2026317.18'
44ede404ed382a8aec736497ae8e6cb8b6926ae4	refs/tags/v0.2026317.18
$ git -C spec ls-remote --tags origin | grep 'v0.2026317.51'
906f736b23a0ad12d6b880c0a6cf01a2ab4dfd31	refs/tags/v0.2026317.51
$ git -C charly ls-remote --tags origin | grep 'v2026.317.0159'
6b83a055367966625fa3f3a44337b1f74d460b9c	refs/tags/v2026.317.0159
$ git ls-remote --tags origin | grep 'v2026.317.0355'
fda7f9dd243ac0e87dbc433e098f84b09af8d318	refs/tags/v2026.317.0355
```

| # | repo | PR | what it did | squash (40) | merge tag |
|---|---|---|---|---|---|
| 1 | `plugin-task` | #66 | owns the `kind:task` body (`#Task`, `#TaskValue`, `#TaskInput`) in its own CUE module, declares `InputDef: "#TaskValue"`, takes the task-shaped helpers home | `b3264bc137e3400b1a717d0ea83a96c0f8b69349` | `v2026.316.2347` |
| 2 | `sdk` | #503 | deletes the task-shaped helpers the task plugin now owns (`sdk/workflowkit`) | `44ede404ed382a8aec736497ae8e6cb8b6926ae4` | `v0.2026317.18` |
| 3 | `spec` | #306 | deletes the `#Task`/`#TaskValue` body defs, keeps `#TaskParamSpec`, regenerates | `906f736b23a0ad12d6b880c0a6cf01a2ab4dfd31` | `v0.2026317.51` |
| 4 | `charly` | #1128 | pins `plugin-task`+`sdk`+`spec` in lockstep and retargets the `task`-kind fixtures | `6b83a055367966625fa3f3a44337b1f74d460b9c` | `v2026.317.0159` |
| pin | umbrella | #998 | advances the four pins and re-homes the `#Task` census row | `fda7f9dd243ac0e87dbc433e098f84b09af8d318` | `v2026.317.0355` |

**Unit 2 — what it measured.** Measured at the pins `#998` set, each of them the CHANGELOG commit
one step above the leg's squash — `spec` `64f85a36`, `sdk` `24279093`, `charly` `9a988fe7`,
`plugin-task` `c83a5cac` — and, for the before/after, at unit 1's own pins. `spec.KindValueDefs` fell
10 → 9 and spec's `#<Word>Value` defs 11 → 10, so **12** kind bodies remain in `spec/schema` — 14
before unit 1, 13 before unit 2, over the same 14 kind words `opencharly/spec#304` enumerates.
`spec/schema/task.cue` is **26 lines** at the pin and declares exactly one def, `#TaskParamSpec`;
`plugin-task` owns `#Task` (`task.cue:201`) and `#TaskValue` (`:255`) and declares the capability as
`InputDef: "#TaskValue"` (`plugin.go:52`).

```
$ for rev in 721eac74d13b 9301181694cd 64f85a369c32; do printf '%s KindValueDefs=' "$rev"; git -C spec show $rev:spec/vocab_gen.go | awk '/^var KindValueDefs = map/,/^}/' | grep -cE '^[[:space:]]+"[a-z]+":[[:space:]]+"#'; done
721eac74d13b KindValueDefs=11
9301181694cd KindValueDefs=10
64f85a369c32 KindValueDefs=9
$ for rev in 721eac74d13b 9301181694cd 64f85a369c32; do printf '%s #<Word>Value=' "$rev"; git -C spec grep -hcE '^#[A-Za-z]+Value:' $rev -- 'schema/*.cue' | awk -F: '{s+=$NF} END{print s+0}'; done
721eac74d13b #<Word>Value=12
9301181694cd #<Word>Value=11
64f85a369c32 #<Word>Value=10
$ for rev in 721eac74d13b 9301181694cd 64f85a369c32; do printf '%s kind bodies in spec/schema = ' "$rev"; n=0; for k in Candy Box Deploy Vm Pod Local Kubernetes Android Kindcluster KubeVirt Firecracker Task Pipeline LibvirtDomain; do git -C spec grep -qE "^#$k:" $rev -- 'schema/*.cue' && n=$((n+1)); done; echo $n; done
721eac74d13b kind bodies in spec/schema = 14
9301181694cd kind bodies in spec/schema = 13
64f85a369c32 kind bodies in spec/schema = 12
$ git -C spec show 64f85a369c32:schema/task.cue | wc -l
26
$ git -C spec grep -cE '^#[A-Za-z0-9]+:' 64f85a369c32 -- 'schema/task.cue'
64f85a369c32:schema/task.cue:1
$ git -C plugin-task grep -nE '^#Task(Value)?:' c83a5cac944fd59 -- 'candy/plugin-task/schema/task.cue'
c83a5cac944fd59:candy/plugin-task/schema/task.cue:201:#Task: {
c83a5cac944fd59:candy/plugin-task/schema/task.cue:255:#TaskValue: #Task @go(-)
$ git -C plugin-task grep -n 'InputDef: "#TaskValue"' c83a5cac944fd59 -- '*.go'
c83a5cac944fd59:candy/plugin-task/plugin.go:52:		{Class: "kind", Word: "task", Validates: true, InputDef: "#TaskValue"},
```

**Unit 2's census is a RELOCATION, not a loss.** Both sides carry 301 non-comment lines — 300 violation
rows plus the `file/rule/symbol/count` header — and the last-column sum is **357** both times, with every
per-rule total identical. Exactly **one** row is re-homed: `spec/schema/task.cue`'s
`env?: {PATH?: _|_, [string]: #StrVal}` becomes `plugin-task`'s copy, differing only by the `schema.`
qualification. `#945`'s `dup` rows are still 7 over 3 definition names, so `#950`'s dependency still
holds.

```
$ for rev in 6e7b61f fda7f9d; do printf '%s non-comment lines ' $rev; git show $rev:design/dpat-baseline.tsv | grep -vc '^#\|^$'; done
6e7b61f non-comment lines 301
fda7f9d non-comment lines 301
$ for rev in 6e7b61f fda7f9d; do printf '%s ' $rev; git show $rev:design/dpat-baseline.tsv | awk -F'\t' '!/^#/ && NF>0 && $1!="file" {r++; s+=$4} END {printf "rows %d sum %d\n", r, s}'; done
6e7b61f rows 300 sum 357
fda7f9d rows 300 sum 357
$ for rev in 6e7b61f fda7f9d; do printf '%s  ' $rev; git show $rev:design/dpat-baseline.tsv | awk -F'\t' '!/^#/ && NF>0 && $1!="file" {c[$2]+=$4} END {for (r in c) printf "%s %d  ", r, c[r]}' | tr -s ' '; echo; done
6e7b61f  union 142 dup 7 open 68 absence 86 close 54 
fda7f9d  union 142 dup 7 open 68 absence 86 close 54 
$ git diff 6e7b61f fda7f9d -- design/dpat-baseline.tsv | grep -E '^[+-][a-z]'
+plugin-task/candy/plugin-task/schema/task.cue	absence	env?: {PATH?: _|_, [string]: schema.#StrVal} @go(Env,type=map[string]string)	1
-spec/schema/task.cue	absence	env?: {PATH?: _|_, [string]: #StrVal} @go(Env,type=map[string]string)	1
```

**Unit 2's citations: 5, not 17.** Both ledgers re-anchored the same five keys, and what moved was a
RANGE and a DIGEST, never a def name — `command:task` (its bytes moved, `plugin.go` `59-64` → `50-66`),
`kind:task` (its range is GONE: the citation named `spec/schema/task.cue:41-88` and that file is 26 lines
at the pin, so it now cites `plugin-task`'s `#Task`/`#TaskValue` plus spec's `#TaskParamSpec`), and three
construct-moved rows (`verb:task`, `verb:git-submodules`, `verb:prune`) whose line ranges became the
symbolic def names `#TaskInput`, `#GitSubmodulesInput`, `#PruneInput`. Unit 1 caught 17 anchors and unit 2
caught 5; this file records both counts and does not claim a cause for the difference.

```
$ git diff 6e7b61f fda7f9d -- design/cite-baseline.tsv | grep -E '^[+-][a-z]' | cut -f1 | sed 's/^[+-]//' | sort -u
command:task
kind:task
verb:git-submodules
verb:prune
verb:task
$ git diff 6e7b61f fda7f9d -- design/dulling.tsv | grep -E '^[+-][a-z]' | cut -f1 | sed 's/^[+-]//' | sort -u
command:task
kind:task
verb:git-submodules
verb:prune
verb:task
```

**A category no prior brief anticipated: a pin advance moves a VERSION SENTINEL.** Three prose files cited
a plugin-task module version one release behind the pinned `charly`'s, so `charly.yml`,
`scripts/check-retired-claims.mjs` and `scripts/sync-pr-body.sh` were re-keyed to `v0.2026316.2347` — and the
line citations beside the sentinel drifted with it (`verbs.go:981` → `:987`, `verbs.go:801` → `:807`). **The
pre-commit gate refused the first commit over it**; the retired literal itself is history, kept once in
`CHANGELOG/2026.317.0537.md`, while this live record keeps the rule it taught. The trap is that `plugin-task`
carries TWO tags on one commit — `v2026.316.2347` (the release tag) and
`candy/plugin-task/v0.2026316.2347` (the Go-module tag its subdirectory needs — see the unit-2 tag fence
above) — and the prose sentinel must name the MODULE version, not the release one. The control is
`scripts/check-cited-plugin-task-version.mjs`, which re-derives the version from the pinned `charly`'s
`go.mod`; in a worktree whose pinned `charly` is not checked out it SKIPS visibly rather than judging, so
the reading that counts is the one in a materialized tree.

```
$ git -C charly show 9a988fe793b22a10748cd5fab1c1bef45f868650:charly/go.mod | grep 'plugin-task'
	github.com/opencharly/plugin-task/candy/plugin-task v0.2026316.2347
$ grep -rn 'plugin-task v0\.2026316\.2347' charly.yml scripts/check-retired-claims.mjs scripts/sync-pr-body.sh | cut -d: -f1,2
charly.yml:254
scripts/check-retired-claims.mjs:310
scripts/sync-pr-body.sh:498
```

**Unit 3 (`pod`) landed 2026-11-13 as FIVE legs, not one.** The tracker's row 3 said one; measurement
found five — the kind body had four consumers outside `spec` (two in `sdk`, one in `plugin-check`, one in
`charly`'s test aliases) beside the plugin that owns it. Each `squash` below is the commit its own merge
tag points at, read from the object store the pin resolution uses:

```
$ for t in plugin-substrate:v2026.317.0614 spec:v0.2026317.703 sdk:v0.2026317.712 plugin-check:v2026.317.0744 charly:v2026.317.0814; do r=${t%%:*}; printf '%s %s %s\n' "$r" "${t#*:}" "$(git -C "$r" rev-parse "${t#*:}")"; done
plugin-substrate v2026.317.0614 937a9b07564116b8723a0a2223299bae8508c41c
spec v0.2026317.703 8cceca6924290854600a29cb74b7daf83d7bec01
sdk v0.2026317.712 8dfd54ff07c066f0e60c47d91fc88b0096a7feb1
plugin-check v2026.317.0744 2c7d557d57c45ba07810a59dafcc57c861326693
charly v2026.317.0814 8997c4809d31aa9af16e64e02ab4fbbba380205b
$ git ls-remote --tags origin | grep 'v2026\.317\.1038$'
253b58335b510c45fea233602c739b63a80b239c	refs/tags/v2026.317.1038
```

| # | repo | PR | what it did | squash (40) | merge tag |
|---|---|---|---|---|---|
| 1 | `plugin-substrate` | #32 | owns the `kind:pod` body (`#Pod`, `#PodValue`) in its own CUE module and declares `InputDef: "#PodValue"` on the `kind` capability | `937a9b07564116b8723a0a2223299bae8508c41c` | `v2026.317.0614` |
| 2 | `spec` | #307 | deletes `#Pod` and `#PodValue`, keeps `#PodSidecar`, regenerates | `8cceca6924290854600a29cb74b7daf83d7bec01` | `v0.2026317.703` |
| 3 | `sdk` | #504 | deletes the dead `PodSpec` alias and retargets `loaderkit`'s pod floor at `#ResolvedPod` | `8dfd54ff07c066f0e60c47d91fc88b0096a7feb1` | `v0.2026317.712` |
| 4 | `plugin-check` | #144 | the pod include-splice decodes `spec.ResolvedPod` | `2c7d557d57c45ba07810a59dafcc57c861326693` | `v2026.317.0744` |
| 5 | `charly` | #1130 | pins the four producers in lockstep and drops the test alias that named the deleted type | `8997c4809d31aa9af16e64e02ab4fbbba380205b` | `v2026.317.0814` |
| pin | umbrella | #1002 | advances the five pins, re-homes the census row and the citation | `253b58335b510c45fea233602c739b63a80b239c` | `v2026.317.1038` |

**Unit 3 — what it measured.** The before/after is unit 2's pin (`spec` `64f85a369c32`) against the pin
`#1002` set (`spec` `9cfcc117c572`, the CHANGELOG commit one step above `v0.2026317.703`):

```
$ for rev in 64f85a369c32 9cfcc117c572; do printf '%s KindValueDefs=' "$rev"; git -C spec show $rev:spec/vocab_gen.go | awk '/^var KindValueDefs = map/,/^}/' | grep -cE '^[[:space:]]+"[a-z]+":[[:space:]]+"#'; done
64f85a369c32 KindValueDefs=9
9cfcc117c572 KindValueDefs=8
$ for rev in 64f85a369c32 9cfcc117c572; do printf '%s #<Word>Value=' "$rev"; git -C spec grep -hcE '^#[A-Za-z]+Value:' $rev -- 'schema/*.cue' | awk -F: '{s+=$NF} END{print s+0}'; done
64f85a369c32 #<Word>Value=10
9cfcc117c572 #<Word>Value=9
$ for rev in 64f85a369c32 9cfcc117c572; do printf '%s kind bodies in spec/schema = ' "$rev"; n=0; for k in Candy Box Deploy Vm Pod Local Kubernetes Android Kindcluster KubeVirt Firecracker Task Pipeline LibvirtDomain; do git -C spec grep -qE "^#$k:" $rev -- 'schema/*.cue' && n=$((n+1)); done; echo $n; done
64f85a369c32 kind bodies in spec/schema = 12
9cfcc117c572 kind bodies in spec/schema = 11
```

The eight entries `spec.KindValueDefs` still declares are the eight kinds still gated from the base —
`android`, `candy`, `firecracker`, `kindcluster`, `kubernetes`, `kubevirt`, `local`, `vm` — with no `pod`,
no `task`, no `pipeline`:

```
$ git -C spec show 9cfcc117c572:spec/vocab_gen.go | awk '/^var KindValueDefs = map/,/^}/' | grep -oE '"[a-z]+"' | tr -d '"' | sort | tr '\n' ' '; echo
android candy firecracker kindcluster kubernetes kubevirt local vm 
```

**Two figures differ and BOTH are recorded, because `#307`'s body is pushed and cannot be amended.** This
file's 14-name list (`#Candy #Box #Deploy #Vm #Pod #Local #Kubernetes #Android #Kindcluster #KubeVirt
#Firecracker #Task #Pipeline #LibvirtDomain`) reads **12 → 11**. `spec#307`'s body says **13 → 12**, over a
15-name definition that includes `#Image`. The two do not disagree about the tree: `#Image` is not a kind
body — it is `#CandyValue`'s image arm, and `#CandyValue` is the candy kind's value-gate def:

```
$ for rev in 64f85a369c32 9cfcc117c572; do printf '%s 15-name kind bodies = ' "$rev"; n=0; for k in Candy Box Deploy Vm Pod Local Kubernetes Android Kindcluster KubeVirt Firecracker Task Pipeline LibvirtDomain Image; do git -C spec grep -qE "^#$k:" $rev -- 'schema/*.cue' && n=$((n+1)); done; echo $n; done
64f85a369c32 15-name kind bodies = 13
9cfcc117c572 15-name kind bodies = 12
$ git -C spec grep -nE '^#CandyValue:' 9cfcc117c572 -- 'schema/node.cue'
9cfcc117c572:schema/node.cue:79:#CandyValue: (*#Candy | #Image) @go(-)
```

**The tracker's 14-name list is canonical here, because this file cites it** — so a reader who finds both
numbers has the reason beside them.

**Unit 3's census is a RELOCATION, not a loss.** Both sides carry 301 non-comment lines — 300 violation
rows plus the `file/rule/symbol/count` header — and the last-column sum is **357** both times, with every
per-rule total identical (absence 86, close 54, dup 7, open 68, union 142). Exactly **one** row is
re-homed, and it differs only by the `schema.` qualifier a plugin's CUE module needs:

```
$ diff <(git show 2b6413f:design/dpat-baseline.tsv) design/dpat-baseline.tsv; echo "rc=$?"
174a175
> plugin-substrate/candy/plugin-substrate/schema/pod.cue	union	#PodValue: (#Pod | schema.#DeployValue) @go(-)	1
279d279
< spec/schema/node.cue	union	#PodValue: (#Pod | #DeployValue) @go(-)	1
rc=1
$ for rev in 2b6413f 253b583; do printf '%s non-comment lines ' $rev; git show $rev:design/dpat-baseline.tsv | grep -vc '^#'; done
2b6413f non-comment lines 301
253b583 non-comment lines 301
$ for rev in 2b6413f 253b583; do printf '%s ' $rev; git show $rev:design/dpat-baseline.tsv | grep -v '^#' | awk -F'\t' '$1!="file"{r[$2]+=$4; n[$2]++} END{for(k in r) printf "%s rows=%d count=%d; ", k, n[k], r[k]}' ; echo; done
2b6413f union rows=134 count=142; dup rows=7 count=7; open rows=64 count=68; absence rows=41 count=86; close rows=54 count=54; 
253b583 union rows=134 count=142; dup rows=7 count=7; open rows=64 count=68; absence rows=41 count=86; close rows=54 count=54; 
```

**Unit 3's citation: ONE row, not 17 and not 5.** A line citation cannot survive a body leaving a file:
`spec/schema/pod.cue:10-19`, affirmed against `#Pod`, now sits inside no definition at all. The `kind:pod`
row therefore cites the plugin's copy BY NAME — the form a pin advance cannot falsify (A.13) — naming both
definitions the relocated body carries, and the baseline row it replaces is lowered in the same change:

```
$ git diff 2b6413f 253b583 -- design/cite-baseline.tsv | grep -E '^[+-][a-z]'
-kind:pod	spec/schema/pod.cue	10-19	#Pod	c69c414d1af3795a
$ git show 2b6413f:design/dulling.tsv | awk -F'\t' '$1=="kind:pod"{print $7}'
spec/schema/pod.cue:10-19; plugin-substrate/candy/plugin-substrate/charly.yml; DESIGN.md:§17.1; DESIGN.md:§17.2; DESIGN.md:§8
$ git show 253b583:design/dulling.tsv | awk -F'\t' '$1=="kind:pod"{print $7}'
plugin-substrate/candy/plugin-substrate/schema/pod.cue:#Pod; plugin-substrate/candy/plugin-substrate/schema/pod.cue:#PodValue; plugin-substrate/candy/plugin-substrate/charly.yml; DESIGN.md:§17.1; DESIGN.md:§17.2; DESIGN.md:§8
```

**A THIRD keeper category: the contract's own envelope.** The unit's decisive correction was not a
cross-plugin citation but a CONTRACT-SIDE one. `#PodSidecar` stayed in `spec` because the contract's own
`#ResolvedPod` cites it — a def a kernel-facing wire shape references cannot move into one plugin's CUE
module, because a plugin may import the contract and never the reverse:

```
$ git -C spec grep -nE 'sidecar\?: \[\.\.\.#PodSidecar\]' 9cfcc117c572 -- 'schema/substrate_template.cue'
9cfcc117c572:schema/substrate_template.cue:55:	sidecar?: [...#PodSidecar] @go(Sidecar)
$ git -C spec grep -nE '^#PodSidecar:' 9cfcc117c572 -- 'schema/pod.cue'
9cfcc117c572:schema/pod.cue:21:#PodSidecar: {
```

Three units, three keeper categories, and they are not the same reason: unit 1's `#PipelineClassRoutes`
stays because `spec`'s OWN vocabulary generator extracts it into `spec.PipelineClassRoutes`
(`spec/internal/schemagen` — no sibling plugin cites it by name); unit 2's `#TaskParamSpec` stays because a
SIBLING plugin's CUE cites it; unit 3's `#PodSidecar` stays because the CONTRACT's own envelope cites it.
A keeper is not a leftover: it is a def with a consumer the move cannot carry.

**The invariant, corrected: the base arm's loss is CUMULATIVE.** Unit 1's record read the loss as "the
kind's count" — 13 pipeline bodies on its own tree. That was true only while exactly ONE kind had moved.
On the migrated tree the base arm loses the sum over every moved kind:

```
$ git -C charly show 851497933ae4:CHANGELOG/2026.317.0814.md | sed -n '38p;40,41p;129,130p'
    kind_value_corpus_sweep_test.go:223: gate=base: judged 1695 entity bodies (1646 files unparsable, 309 bodies the base arm cannot judge)
    kind_value_corpus_sweep_test.go:223: gate=composed: judged 2004 entity bodies (1646 files unparsable, 0 bodies the base arm cannot judge)
    kind_value_corpus_sweep_test.go:223:   pod          250
     20 FAIL
   1984 OK
$ git -C charly show 851497933ae4:CHANGELOG/2026.316.1207.md | sed -n '103,105p'
    kind_value_corpus_sweep_test.go:204:   pipeline     12
    kind_value_corpus_sweep_test.go:204:   pod          250
    kind_value_corpus_sweep_test.go:204:   task         47
```

```
composed 2,004 judged · pod 250 · 1,984 OK / 20 FAIL
base     1,695 judged · 309 the base arm cannot judge
2004 − 309 = 1,695 ✓
309 = 250 pod + 47 task + 12 pipeline     ← all three moved kinds
```

**`base loss == Σ(all moved kinds' body counts)`** — the stronger claim, because it covers the migration
rather than one leg: the next unit's count ADDS to 309, and a reading that equals only the last kind's
count is a reading of the leg, not of the tree. The per-kind split is the unit-0 one-tree reading
(`charly`'s `CHANGELOG/2026.316.1207.md`), where all three kinds were still base-gated on this same
2,004-body corpus root. The sweep is the leg's own final-tree run, read here from the merged `CHANGELOG`
because this docs tree has no `charly` checkout to run it from; `CHARLY_KIND_VALUE_GATE=base go test
-count=1 -run TestKindValueCorpusSweep -v .` is the command that re-runs it in a tree that has one.

**`TestKindValueDefs_ComposedEqualsBase` needs NO edit, and that is by construction.** It iterates only the
kinds still declared by the base (`spec.KindValueDefs`), so `pod` drops out the moment the base stops
declaring `#PodValue`; the added `kindValueDefPath(nil, "pod")` assertion is the positive witness that the
kind is no longer fallback-resolvable. **Recorded so a reader does not think it was forgotten.**

```
$ git -C charly show 851497933ae4:charly/kind_value_composed_test.go | sed -n '249,256p'
	discs := make([]string, 0, len(spec.KindValueDefs))
	for disc := range spec.KindValueDefs {
		discs = append(discs, disc)
	}
	sort.Strings(discs)
	for _, disc := range discs {
		defPath := spec.KindValueDefs[disc]
		baseDef := sharedCueSchema().LookupPath(cue.ParsePath(defPath))
$ git -C charly grep -n 'kindValueDefPath(nil, "pod")' 851497933ae4 -- '*.go'
851497933ae4:charly/kind_value_composed_test.go:228:	if def, ok := kindValueDefPath(nil, "pod"); ok {
```

**Two control defects were found on the way, and both made `main` red before this wave.** `#1001`:
`scripts/check-cited-plugin-task-version.mjs` pairs a module MENTION with ANY version literal on the same
line, so a leg table's unrelated version cell and a deliberately-quoted retired literal both read as live
claims — neither line claims that module's version. `#751`: guidance in this repo reached git as a bare
`ls-tree` pathspec where `:(literal)` was required. Both instances are made true in `#1002`, and both
classes are filed rather than papered over. The reason `#1000` could land them is in its own gate record:
`check-cited-plugin-task-version` **SKIPS** when the pinned `charly` is not materialized — so the prose
landed in a tree where the control could not judge it, and every materialized tree then read red:

```
$ sed -n '210,211p' CHANGELOG/2026.317.0537.md
`check-cited-plugin-task-version` **SKIPS visibly** here rather than judging, because this
worktree's pinned `charly` submodule is not checked out — a skip is reported, never counted as
```

**The decisive correction for every kind is a CROSS-PLUGIN REFERENCE, and no gate will tell you.** The
one correction unit 2's own plan needed was `#TaskParamSpec`: `plugin-pipeline`'s schema types a
pipeline's `args:` as `{[string]: schema.#TaskParamSpec}` (`candy/plugin-pipeline/schema/pipeline.cue:354`)
and `plugin-task`'s own body types its `params:` the same way (`task.cue:244`) — and a plugin's CUE module
can import only the CONTRACT module, never another plugin's, so the first such reference moves a def out
of the movable set and pins it in `spec` permanently. Unit 1 hit the same shape from the other side
(`#PipelineClassRoutes` stayed because only spec's own vocabulary generator can extract a table over
spec's own `#ProviderClassNames`). **Finding it requires reading OTHER plugins' schemas, not the one
being moved** — the moving def's own file says nothing about who else cites it — and no gate in the chain
reports it: the move compiles, the corpus sweep passes, and the failure surfaces only when the OTHER
plugin's schema stops resolving. The cheap instrument is one sweep of every pinned plugin module's CUE for
`schema.#` citations, and it is worth running BEFORE the first leg of each remaining unit:

```
$ for p in $(git ls-tree --name-only origin/main | grep '^plugin-'); do s=$(git ls-tree origin/main -- ":(literal)$p" | awk '{print $3}'); git -C "$p" grep -ho 'schema\.[#][A-Za-z0-9_]*' "$s" -- '*.cue' 2>/dev/null; done | sed 's/^schema\.//' | sort | uniq -c | sort -rn
      6 #StrVal
      5 #Step
      4 #WorkflowArgVal
      3 #PodSidecar
      2 #TaskParamSpec
      2 #LLMSpec
      2 #DeploySecret
      2 #CandyRef
      1 #TunnelConfig
      1 #Sidecar
      1 #LLMParams
      1 #EntityRef
      1 #Duration
      1 #DeployValue
```

Fourteen defs are cross-plugin-cited at these pins. Two of them are keeper defs a moved kind left behind
— `#TaskParamSpec`, kept for a sibling plugin's citation, and `#PodSidecar`, kept for the contract's own
envelope — and the other twelve are shared vocabulary, so the remaining eight units have no other
ALREADY-VISIBLE kind-body pin. `#Step` is the one the next eight will need most: at these pins it is cited
5 times (four references from the `plan:` fields of `plugin-pipeline`, `plugin-task` and
`plugin-substrate`, plus one comment), so it stays in the contract module when `candy`+`#Box` — whose
`plan:` uses it — moves.

**What remains: eight of the eleven units**, in `opencharly/spec#304`'s measured order:
`local`, `kubernetes`+`kindcluster`, `kubevirt`, `firecracker` (its plugin is not a
pinned umbrella submodule — `git config -f .gitmodules --get
submodule.plugin-firecracker.path` exits 1, with the `plugin-pipeline` path as the live-word control —
so a pin comes first), `vm`+`#LibvirtDomain`, `candy`+`#Box`, `android` (no owning plugin yet; served
only by `plugin-substrate`'s echo arm), `deploy` (`#Deploy`/`#DeployValue`, the shared disjunct every
substrate arm uses, last). Until those land, `#950`'s dependency holds and `#945`'s census cannot move
past its `dup` rows; `2.1` also gates `4.1`, `2.3` and `2.16`.

**Coverage — the DESIGN.md requirements no row named.** At the 2026-11-12 record, 86 of
DESIGN.md's 200 requirement ids were named by no row. This pass classifies every one of them, and the
census now reads 0. A range (`D-CAP-1..5`) counts as every member:

```
$ python3 - <<'PY'
import re
design, todo = open('DESIGN.md').read(), open('TODO.md').read()
TAG, RANGE = re.compile(r'\bD-([A-Z]+)-(\d+)([a-z]?)\b'), re.compile(r'\bD-([A-Z]+)-(\d+)\.\.(\d+)\b')
def tags(t):
    out = {(f, int(n)) for f, n, _ in TAG.findall(t)}
    for fam, a, b in RANGE.findall(t):
        out |= {(fam, n) for n in range(int(a), int(b) + 1)}
    return out
print(len(tags(design)), len(tags(todo)), len(tags(design) - tags(todo)))
PY
200 200 0
```

- **Demanded by the 39 rows added here.** §2: `2.17` `D-SCH-4`; `2.18` `D-FORM-2`, `D-LAW-7`; `2.19`
  `D-IR-2`; `2.20` `D-IR-3`; `2.21`–`2.23` `D-FLOW-1`–`3`; `2.24` `D-KIND-3`; `2.25` `D-KIND-4`;
  `2.26` `D-CANDY-3`. §3: `3.34`–`3.40` `D-VAL-5`, `6`, `7`, `10`, `11`, `12`, `13`; `3.41` `D-HW-6`,
  `D-HW-7`; `3.42` `D-HW-8`, `D-HW-9`; `3.43` `D-NAME-2`. §4: `4.5` `D-GEN-5`; `4.6` `D-GEN-7`.
  §5: `5.12` `D-API-1`, `D-API-2`; `5.13` `D-MOD-1`. §7: `7.4` `D-AUDIT-1`–`5`; `7.5` `D-STORE-10`;
  `7.6` `D-SEC-1`. §8: `8.4` `D-CLI-2`. §13: `13.1` `D-DEP-2`; `13.2` `D-DEP-7`; `13.3` `D-DRV-1`–`3`,
  `D-FORM-3`; `13.4` `D-VENUE-2`; `13.5` `D-CAPTURE-4`; `13.6` `D-CAPTURE-5`; `13.7` `D-DEP-8`,
  `D-VERB-7`. §14: `14.1` `D-CODE-1`, `D-LAW-5`; `14.2` `D-CODE-2`; `14.3` `D-CODE-4`; `14.4`
  `D-CODE-5`.
- **Absorbed by a row that already demanded the same mechanism (21), with the tag folded into that
  row's `Target` cell.** `D-GEN-4` → `4.1`; `D-LOAD-1` → `3.4`; `D-PROTO-5`, `D-ROLE-6` → `5.7`;
  `D-CAP-6` → `3.12`; `D-LAW-3`, `D-REPO-2` → `5.4`; `D-LAW-4` → `2.3`; `D-LAW-8`, `D-VERB-6` → `6.7`;
  `D-NAME-3` → `6.6`; `D-CLI-3` → `8.2`; `D-CLI-5` → `6.8`; `D-DEP-3` → `2.7`; `D-DEP-4` → `5.9`;
  `D-VENUE-1` → `8.1`; `D-IR-4` → `3.26`; `D-IR-5` → `12.6`; `D-IR-6` → `12.4`; `D-KIND-1` → `3.6`;
  `D-CANDY-7` → `12.9`.
- **Satisfied by the tree today (13), with the proof.** `D-SCH-5` — no version stamp exists
  (`spec/schema/llm.cue:19` says so) and five `design/negative/` cases carry `# rule: D-SCH-5`;
  `D-SCH-7` — `#AbsPath` is `DESIGN.cue:77` and gates `file`/`path_append`/`volume`/`export`, with
  `design/negative/file-variable-path.yaml` proving the refusal (the SHIPPED-schema half is `2.16`'s:
  `spec` carries no `#AbsPath`); `D-GEN-8` — `scripts/design-consistency.sh` rejects every list
  comprehension outside the allowed forms; `D-LOAD-4` — `sdk/loaderkit/load_cache.go` keys a load by
  `cache.KeyDigest` over the schema, config and document hashes; `D-LOAD-6` — the namespace table is
  built before resolution (`namespace_walk.go`, `canonical_ref.go`, `refs_local_namespace_test.go`),
  with the "document it is written in" clause unmeasured; `D-VAL-1`, `D-VAL-8`, `D-VAL-9`, `D-VAL-14`
  — `design/example/rules.cue` plus one committed negative each, and namespaced resolution core-proven
  by `sdk`'s own tests; `D-KIND-5` — `#Opaque` is `DESIGN.cue`'s only open struct and every other use
  carries `// S10`; `D-CANDY-5` — no authored version exists, the digest is the coordinate;
  `D-CONC-1` — store entries are content-addressed and published through one atomic-write helper
  (`sdk/storekit/entry.go:288`); `D-VERB-2` — every fact verb with an authored field of its own name
  matches it (`file`, `package`, `service`, `user`, `port`, `mount`, `interface`, `dns`, `group`), and
  the two without one (`kernel_param`, `process`) observe runtime state directly.

**The table is re-summed from its own rows, never typed, at the base commit and at this tree:**

```
$ git show origin/main:TODO.md | awk -F'|' '/^## Status/{f=1} /^The Decisions row/{f=0} f && NF==7 && $2 !~ /section/ && $2 !~ /---/ && $2 !~ /Total/ {i+=$3; d+=$4; o+=$5; m+=$6} END {printf "items %d done %d open %d moved %d\n", i,d,o,m}'
items 107 done 10 open 82 moved 15
$ awk -F'|' '/^## Status/{f=1} /^The Decisions row/{f=0} f && NF==7 && $2 !~ /section/ && $2 !~ /---/ && $2 !~ /Total/ {i+=$3; d+=$4; o+=$5; m+=$6} END {printf "items %d done %d open %d moved %d\n", i,d,o,m}' TODO.md
items 146 done 9 open 125 moved 12
```

`107 + 39 = 146` items; `10 - 1 = 9` done (`12.4` restored); `15 - 3 = 12` moved (`2.2`, `8.1` and
`10.3` restored); `82 + 4 + 39 = 125` open. The base line is the set this pass started from and the
tree's line is the set it leaves.

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
| 1.1 | **Repository topology (D-REPO-1).** The operator chose aggressive collapse. | The exact repository list (candy families, plugin concepts) needs sign-off before item 9.1. **No longer gating anything:** the operator's 2026-11-12 ruling retired `9.1` (§12.4), so the list it was waiting on is not owed — and Part I's `layer-<family>` answers the naming half. |

## 2. Schema (Part I)

| # | Current state (evidence) | Target | Config migration | Code work |
|---|---|---|---|---|
| 2.1 | Kind schemas (`#Candy`, `#Box`, `#Deploy`, `#Vm`, `#Pod`, `#Local`, `#Kubernetes`, `#Android`, `#LibvirtDomain`, …) live in `spec/schema`, with `#<Kind>Value` twins; plugin-substrate and plugin-candy only echo host-decoded values (`spec/schema/node.cue`). **Measured correction (2026-11-12):** the D-PAT census (`#945`) is the whole census — 382 violations before `plugin-pipeline#60`, 357 after — and this item unblocks only its `dup` rows (19 over 9 definition names before, 7 over 3 after), not 382. Its chain is 13 units, not the four legs summarized in section 12.1: unit 0 is a `charly` host-gate change (`validateKindValueCUE` reads `spec.KindValueDefs` plus a base-only schema while a plugin definition lands in `pluginSchemas.unified`); the full table is at `opencharly/spec#304`. **Units 1–8 of 11 landed:** unit 1 (`pipeline`) on 2026-11-12 — the body is `plugin-pipeline`'s own CUE now (the contract module keeps one `#Pipeline*` def, `#PipelineClassRoutes`), `spec.KindValueDefs` 11 → 10 and its `#<Word>Value` defs 12 → 11; unit 2 (`task`) on 2026-11-13 across `plugin-task` #66, `sdk` #503, `spec` #306, `charly` #1128 and the umbrella pin wave #998 — the body is `plugin-task`'s now and the contract module keeps exactly one def for this kind, `#TaskParamSpec`, because `plugin-pipeline`'s schema types `args:` as `{[string]: schema.#TaskParamSpec}` and a plugin's CUE module can import only the contract module, so `spec.KindValueDefs` reads 10 → 9, its `#<Word>Value` defs 11 → 10, and 12 kind bodies remained in `spec/schema`; unit 3 (`pod`) on 2026-11-13 across `plugin-substrate` #32, `spec` #307, `sdk` #504, `plugin-check` #144, `charly` #1130 and the umbrella pin wave #1002 — the body is `plugin-substrate`'s now, the contract module keeps `#PodSidecar` (a THIRD keeper category: the contract's own `#ResolvedPod` cites it, where unit 1 kept a def `spec`'s own generator extracts and unit 2 a def a sibling plugin cites), `spec.KindValueDefs` reads 9 → 8, its `#<Word>Value` defs 10 → 9, and 11 kind bodies remain in `spec/schema` over this file's 14-name list (`#307`'s pushed body says 13 → 12 over a 15-name list that counts `#Image`, which is `#CandyValue`'s image arm, not a kind body); the census stayed a relocation (one row, `node.cue` → `plugin-substrate`'s `pod.cue`) and one citation was re-anchored to name citations; the base arm's loss is CUMULATIVE — 309 = 250 `pod` + 47 `task` + 12 `pipeline`, against 2,004 judged composed and 1,695 judged on the base arm. **Unit 4 (`local`) landed 2026-11-14 across SEVEN legs, not the one the tracker's table predicted** — `plugin-substrate`#34 (the body + `InputDef: "#LocalValue"`, with the module's single import moved to the file that sorts first, `local.cue`), `plugin-box`#78 and `plugin-check`#148 (each decoded the authored type; both now read the contract's `spec.ResolvedLocal`), `charly`#1142 and `plugin-loader`#13 (test fixtures), `sdk`#507 (an unused `vmshared.LocalSpec` alias), `sdk`#510 (found only by running the ASSEMBLED gate: `loaderkit`'s kind table named the authored `#Local` and PANICKED at first use once the base deleted it — it now names `#ResolvedLocal`, the `pod` precedent, pinned by a test that fails on an assertion) — then `spec`#314 (the contract deletion: `#Local`, `#LocalValue`, the generated `spec.Local` and its `LocalSpec` alias, artifacts regenerated). Counts: `spec.KindValueDefs` 8 → 7, its `#<Word>Value` defs 9 → 8, ten kind bodies remain in `spec/schema` over this file's 14-name list. The decisive measurement, on a graph whose every other member is MERGED: the corpus sweep judged 2,008 bodies with ZERO verdicts moved against the run taken while the base still carried both defs (`local` = 203 on both arms). The unit also corrected the tracker's own table: the chain is seven legs, and `plugin-deploy-local` is not the owner — `plugin-substrate`'s `substrateWords` serves `kind: local`, exactly as `pod` taught it. **Unit 5 (`kubernetes` + `kindcluster`) landed 2026-11-14 across SEVEN legs** — `plugin-substrate`#35 (both bodies + their five `#Kubernetes*` policy sub-defs + four vocabulary tables + both `InputDef`s, with the module's single import moved to the file that now sorts first, `kindcluster.cue`), `sdk`#511 (the `loaderkit` kind table — the `pod`/`local` precedent, before it could panic), `charly`#1143 (an unused test-only `KubernetesSpec` alias), `plugin-k8sgen`#6 and `plugin-kube`#36 (each decodes the opaque `cluster_raw` into its OWN view — `Cutover K` had already built the wire, so no contract type is in either path; the kube leg pins the projection's JSON byte-for-byte), `plugin-substrate`#36 (the body's five validation tests moved BEFORE the deletion, so coverage never lapsed) and `sdk`#512 (`vmshared`'s six unused aliases) — then `spec`#316 (the two bodies, their sub-defs and vocabulary tables, the two `#<Kind>Value` twins, the `KubernetesSpec` alias, and `#KubernetesGenInput`'s typed `cluster` field: `cluster_raw` is the ONE path). Counts: `spec.KindValueDefs` 7 → 5, its `#<Word>Value` defs 8 → 6, eight kind bodies remain in `spec/schema` over this file's 14-name list. The decisive measurement, on the assembled graph the legs produce (the deleted contract, the plugin that owns the bodies, both decoders, the loader and charly): 2,014 bodies judged with ZERO verdict classes moved against the pre-change arm, one `vm` message refinement. The unit also CORRECTED the tracker's table twice: `plugin-substrate`'s `substrateWords` serves both kinds (`plugin-kube` owns the deploy targets), and three consumers that no code reading found — the sdk's alias block, charly's `go.mod` requires, the pinned plugins — surfaced only by assembling the graph; the wave that makes it the served tree is opencharly/opencharly#1011. **Unit 6 (`kubevirt`) landed 2026-11-14 across FIVE legs** — `plugin-substrate`#37 (the thirteen defs: `#KubeVirt` + twelve `#Kubevirt*` sub-defs + the `#KubevirtSource` node sub-def + the `#KubevirtValue` twin, and the `InputDef`), `sdk`#513 (the `loaderkit` kind table → `#ResolvedKubeVirt` — note the capital V, which a case-folded grep finds and a naive one misses), `plugin-kubevirt`#46 (the LARGEST consumer this programme has moved: 43 `spec.KubeVirt` references across 11 files, a 26-field view + eleven sub-types + the hand-written boot-medium union, with the renderer's 34 assertions re-pinned and a decode test over a representative body), `plugin-substrate`#38 (the body's two validation tests moved BEFORE the deletion) and `spec`#317 (the body, sub-defs, vocabulary tables, twin and the hand-written `KubevirtSource`/`KubevirtCloneSource` union; the deployable-kind vocabulary test kept in its own file because it asserts a WORD list, not a body). Counts: `spec.KindValueDefs` 5 → 4, its `#<Word>Value` defs 6 → 5, seven kind bodies remain over this file's 14-name list. The decisive measurement, on the assembled graph the legs produce: 2,014 bodies judged with ZERO verdict classes moved against the pre-change arm (`kubevirt` = 26 on both). The unit's lesson cost three reviewer rounds and one CI cycle: a cutover's record lists SUBJECTS — a def WITH its commentary, a file WITH each test in it, a count as a claim to read — never lines; and the generator and the formatter run LAST, after every edit that can feed them. The wave is opencharly/opencharly#1013. **Unit 7 (`firecracker`) landed 2026-11-14 across THREE legs** — `plugin-substrate`#40 (the thirty-two defs: `#Firecracker` + thirty named sub-defs + the `#FirecrackerValue` twin, and the `InputDef`, with the module's single import moved to `firecracker.cue`, the file that now sorts FIRST), `plugin-substrate`#41 (the body's five `#FirecrackerValue` validation tests moved BEFORE the deletion) and `spec`#319 (the body, sub-defs, vocabulary tables and twin; the `#KindValueDefs` map-entry test deleted with the entry, and the three VOCABULARY assertions kept because words are the contract's, not bodies). This unit needed NO consumer legs, measured rather than assumed: nothing outside the resolve arm ever read the authored Go type (`grep -rn 'spec\.Firecracker\b'` over every merged main → no match outside the wire types), and `loaderkit` has no firecracker entry — the resolve envelope projects NOTHING (it carries the raw bytes; the venue fills the host). Counts: `spec.KindValueDefs` 4 → 3, its `#<Word>Value` defs 5 → 4, six kind bodies remain over this file's 14-name list. The decisive measurement, on the assembled graph the legs produce: 2,014 bodies judged with ZERO verdict classes moved against the pre-change arm (`firecracker` differing in zero). The unit cost six review rounds and TWO auto-closes; both successors landed, and two lessons came out of it: a moved body's OWN claims are part of the sweep (the vocabulary owners — unit 6's lesson, missed once more — every count, and every citation list, which a regex that counts comments builds wrong), and a PR body describes the CURRENT tree, never the cutover's end state. The wave is opencharly/opencharly#1015. **Unit 8 (`vm`) landed 2026-11-14 across NINE legs — the largest unit so far** — `spec#320` (eight public vocabulary re-exports), `plugin-substrate#42` (the body + the contract pins brought current to the merge tags, which exposed four stale test references the old pin had hidden), `plugin-substrate#44` (the envelope-direct arm — which also FIXED a silent `krun` drop in the old fourteen-field copy), `sdk#514` (the loader names `#ResolvedVm`), `plugin-substrate#43`/`#45` (the body's four tests moved before the deletion), `plugin-substrate#46` (the four vocabulary tables only the body cited), `plugin-check#149` (two collectors on the deleted type, found by the ASSEMBLED build) and `spec#321` (the contract deletion). Counts: `spec.KindValueDefs` 3 → 2, five kind bodies remain. The decisive measurement: the assembled graph (charly + the deleted contract + sdk + all 63 plugins at their merged mains) builds clean and the corpus sweep showed ZERO verdict classes moved. The unit's biggest lesson is the PIN: a plugin green against an old spec is not green — the bump exposed `spec.Pod`, `spec.Kindcluster`, `spec.KubeVirt` and `spec.Vm` still referenced in tests, and the contract leg's own census then found SIX defs with two homes (D-PAT-2) that `plugin-substrate#47` removed. The wave is opencharly/opencharly#1024. The other three units and their order are unchanged at `opencharly/spec#304` and the evidence is in `## Status`. | D-SCH-1, D-SCH-3 | none | Move each schema into its plugin's CUE module; delete the twins and the echo plugins. |
| 2.2 | 113 of 119 plugin repositories that carry a `candy/*.cue` schema never reference `opencharly/spec`: their schemas reproduce the shared shapes under plugin-private names — `#FileMatcher` (`plugin-file/candy/plugin-file/schema/file.cue:79`), `#HttpMatcherList` (`plugin-http/candy/plugin-http/schema/http.cue:51`), `#MountMatcher` (`plugin-mount/candy/plugin-mount/schema/mount.cue:45`) — against the contract module's `#Matcher` / `#MatcherList` / `#MatchOpMap` (`spec/schema/00_common.cue:224-228`); 6 of the 119 do import the contract module; counted 2026-11-13. | D-SCH-2 | none | Import the contract module's shapes; delete the copies. `spec` carries no `envelope` package (DESIGN §10.2 names one), so the import lands in the contract module's own `schema` package until that split exists. |
| 2.3 | 402 `@go(...,type=...)` overrides, 2,825 `@go(...)` calls on 2,823 lines of `spec/schema/*.cue`, 76 `@go(-)` uses and hand-written Go types in `spec` (`spec/hand_state_types.go`); counted 2026-11-13. | D-SCH-1, D-GEN-3, D-LAW-4 | none | Generate every type; keep only behaviour methods. |
| 2.4 | A second field gate: the loader's `candyKnownFields` still admits the removed `version` (`sdk/loaderkit/parse_candy_manifest.go:224`). | D-CANDY-1, D-LOAD-2 | none | Delete it. **Answered (tag `v0.2026314.2013`)** — the gate IS the closed `#Candy` schema (`sdk` #495, `9aed46f418a50895f9c75d61966f00a3fd563ced`); the hand-copied set is deleted. |
| 2.5 | **MOVED — see `## Status`.** The runtime schema is assembled by text: `schemaconcat`, plus the `base ++ served` splice in `charly/charly/plugin_loader.go`. At the tips the base is a CUE-module instance (`charly/cue_schema.go`) and each unit's own module is unified as a VALUE (`plugin_loader.go` `unified`), with `schemaconcat` left to the dev-time generator and its parity test. | §10.3 | none | Compose one instance through CUE imports. |
| 2.6 | `#NodeDoc` carries state and vocabulary keys (`cache`, `ledger`, `system`, `providers`, `compiled_plugins`, `context_ignore_baseline`, `ovmf_*`, `verb_primaries`, `provides`). | D-STORE-2, D-KIND-2, D-CORE-3 | `~/.config/charly/charly.yml` splits: settings → user configuration; `cache`/`ledger`/`system` → state or cache | Remove the keys from the envelope. |
| 2.7 | Cross-field rules in Go: ephemeral→disposable fill, android `box`⊻`adb`, preemptible checks, check-bed checks, member checks (`sdk/loaderkit` `LoadSeams`). | D-LOAD-3, D-DEP-3 | none | Move each into CUE or into the owning kind's `validate` (§12.4). D-DEP-3's inheritance half is unbuilt: `IsDisposable` reads only the node's own flag with no parent lookup, so an inner node must inherit `disposable:` and cannot widen it. |
| 2.8 | Verb primaries in three places: `verb_primaries` (`charly/charly.yml`, `spec/schema/node.cue`), manifest `plugin.primary`, and `ProvidedCapability.Primary`. | D-VERB-5, D-LOAD-5 | `plugin.primary` is removed from manifests | Delete all three: a verb input has one shape and the step is dispatched by its keys. |
| 2.9 | Kind words collide with field names: the `distro` kind vs the candy `distro:` field (whose box form is a third, list-typed use), and the `builder` kind vs the box `builder:` field. | D-SCH-6 | `name: {distro: {…}}` definition nodes → `name: {os: {…}}`; candy `distro: {arch: {…}}` → `os_override: {arch: {…}}`; the box `distro: [fedora, "fedora:43"]` list → `os: fedora-43` on the `source` the stack starts from; box `builder: {…}` → `builder_box: {…}` | Add the disjointness gate (Appendix A.4 check 5). |
| 2.10 | Box starting points come in four spellings: `base:` (a box or an OCI ref), `from: builder:<word>` plus `bootstrap_builder_image`, a VM template `source:` block (`cloud_image`, `iso`, `bootstrap`, `container_disk`, `bootc`, `clone`, `imported`), and `distro:` identity lists. | §14.1, §16.3, D-SRC-1..2 | external `base: <oci-ref>` → a `source: {oci: …, os: …}` node with the box's `from:` naming it; `base: <box>` → `from: <box>`; `from: builder:pacstrap` + `bootstrap_builder_image` → `source: {bootstrap: {builder: arch.pacstrap, …}, os: arch.arch}`; vm `source: {kind: cloud_image, url, checksum}` → `source: {disk: {url, sha256}, os: …}`; `iso` → `source: {iso: …}`; `container_disk` and `bootc` → a box `from:` the OCI source; unused `clone` and `imported` are deleted | One `from:` resolver; a `source` kind in the build plugin; the machine plugin builds disks from boxes. |
| 2.11 | A deployment names what it realizes with `from:` (a template, or `name:snapshot`) or `image:` (an image node). | §14.1, §17.1 | `image: <node>` → `from: <node>`; `from: <template>` → `from:` the box or source the template's disk came from (2.14) | Update the deployment schemas. |
| 2.12 | Image build fields `build`, `builder`, `produce`, `bootstrap_builder_image`, `platform`, `enabled`, `tag`, `entrypoint`, `network`: purpose and overlaps unreviewed. | D-LAW-1, D-LAW-2 | per the review | Review them against the fresh corpus and record the result in DESIGN §16.1 (with DESIGN.cue first, Appendix A.7) before implementing. |
| 2.13 | Unused fields and kinds. Kinds: `theme`, `session`, `displaymanager`, `desktopentry`, the `kubevirt` kind (`agent-team` and the `pod` template form are already 0 at 2026-11-12). Fields: most of `#Kubernetes`; deploy `kind`, `replica`, `restart`, `schedule`, `tunnel`, `dns`, `acme_email`, `port`, `resources`, `expose`, `storage`, `probes`; vm sources `bootc`, `clone`, `imported`; most libvirt device lists; unused `#Box` and service fields (full list from inventory 0.1). | D-LAW-2 | none (unused) | Delete them from the schemas. |
| 2.14 | Deployment templates. `vm:` templates (139 nodes over the six distro repos' `charly.yml`, counted 2026-11-13: 7/51/3/9/60/9) carry the disk source, `disk_size`, `ram`, `cpu`, `firmware`, `network`, `ssh`, `cloud_init` and `libvirt`; `local:` templates carry a candy list; `kubernetes:`/`android:` templates carry access and device settings; `pod:` templates are unused. Template versus deployment is decided by whether `from:`/`image:` is present. | §14, §17.1 | per vm template `T`: its `source` block → a `source` node (2.10); `cloud_init` packages, users and runcmd → a candy, and a box `T` = that source plus that candy; `ram`/`cpu`/`disk_size` → the fields of every deployment that used `T`; `firmware` → the deployment's `firmware`; `ssh`/`network` → machine plugin behaviour (port forwards → `port:`); `libvirt` devices → host needs (3.26) or the machine plugin; `local` templates → a box or the deployment's `require:`; android → 3.23 | Delete the template form from every deployment schema. |
| 2.15 | Pod and VM are built differently: a pod runs an image built from a box; a VM boots a template disk and applies candies over ssh at deploy time. Snapshots, consoles and many commands exist only for VMs (`sdk` `Snapshot` 300 lines, `Console` 419; the shared-layer names the target needs, `ApplyCandies` and `BootDisk`, are 0 with control `Snapshot` = 300); counted 2026-11-13. | §14.2, D-DEP-1, D-FORM-1 | none beyond 2.10, 2.14 and 3.27 | Each `os` gains its boot content and root-filesystem export; build a disk from any box and an image from any disk start; both kinds share one field set and one command set; the conformance bed runs every box as both. |
| 2.16 | Schemas use `close()`, open definitions, absence-discriminated unions, unions written out alternative by alternative, mixed lists and validators embedded in structs (the self-contained plugin schemas, `#CandyValue: (*#Candy \| #Image)`, `#<Kind>Value: (#Template \| #DeployValue)`). | §10.1, D-PAT-1..4 | none | Rewrite every schema with the patterns of §10.1: definitions without `close()`, every union derived from a registry definition, enums from word lists. Every enforcing line carries its requirement tag with a negative case (Appendix A). The §25 schema-pattern gate now has one control for the half of each requirement that the pinned CUE text decides (`scripts/design-dpat.sh`, Appendix A.11): D-PAT-1's never-table, D-PAT-2's one-home half (a top-level definition name declared in a second pinned module), and D-PAT-3's form half (a union written out with `\|` instead of derived), green over a census in `design/dpat-baseline.tsv` that the issue linked there lowers as they are fixed. What stays ungated is named there rather than implied: D-PAT-2's ownership half (the word-to-owner registry the loader builds from each plugin's `describe`) and its composition half (§10.3), and D-PAT-3's derivation-source and S5 halves — none of them decidable from CUE text, and all of them decidable once the loader emits its registry or the composed schema as an artifact a control can read. |
| 2.17 | Nothing renders the documentation from CUE doc comments: reference pages come from decoded candy manifests (`plugin-docs/candy/plugin-docs/gen_entities.go` `generateEntities`/`writeCandyPage`), CLI help is hand-written Kong structs (`charly` 23 `alecthomas/kong` lines), and the only doc-comment consumer is the Go type generator's own `emitDocs(val.Doc())` (`spec/schemaparams/gotypes.go:111`, `:389`). | D-SCH-4, §10 | none | Generate reference docs, CLI help and MCP tool descriptions from definition doc comments: one extractor over the composed schema, wired to `charly docs generate` and the command model (4.3). |
| 2.18 | No artifact is named by a digest of its inputs: `irHash`/`IRDigest`/`stepsHash`/`ArtifactDigest` = 0 in `sdk` and `charly` `*.go` (control `content-addressed` = 40, for the plugin-binary cache of 7.1), and an image's name is a clock — `build_overlay.go:294` sets `CalVer: ComputeCalVer()`, which `charly/version.go:16-47` itself calls "a wall-clock readout of the current moment"; a registry manifest digest is the only content identity an artifact has today. | D-FORM-2, D-LAW-7, §14.3 | none | One artifact identity: `digest(start artifact digest, IR digest, form)` computed by the build plugin; CalVer stays the repository release only; delete `ComputeCalVer` from the build path and carry the digest in the label contract (producer-first `plugin-build`, then `sdk/storekit` for the store key). |
| 2.19 | Every compiled action already carries its reverse (`reverse_ops` per step, `sdk` `ReverseOp` = 216 lines, corpus `charly/testdata/deploy_compile_parity_golden.json`), but no action declares idempotence: `creates:`/`unless:`/`guard?:` have 0 sites in `spec`'s CUE, so a `run:` step re-runs on every apply and teardown replays only what a builder recorded. | D-IR-2, §14.4 | `guard: {creates: /path}` or `guard: {unless: <cmd or matcher>}` on a `run:` step; `reverse: none` where an action has no reverse | Add the `guard` and the declared `reverse` to every action in the IR; make apply-mode teardown replay the recorded reverses (producer-first `spec` for the action defs, then `plugin-build` and each deployment kind). |
| 2.20 | No action has a golden of its own: the only corpora are whole-project fixtures (`charly/testdata/deploy_compile_parity_golden.json` — steps with `reverse_ops` — and `plugin-build/.../testdata/resolved_project_golden.json`), and the per-verb plugins that own the actions hold none (`golden` = 0 in `plugin-file` and `plugin-command` `*.go`; control: 545 in `charly`). | D-IR-3, §14.4 | none | One golden per action (IR in; rendered build fragment AND applied effect out), generated from `DESIGN.cue`'s `#ActionAlt` rows so a new action cannot land without one (producer-first `spec` for the corpus shape, then each verb plugin). |
| 2.21 | The `pipeline` kind is a lobster DAG step, not DESIGN's stage: `plugin-pipeline/candy/plugin-pipeline/schema/pipeline.cue` declares `#PipelineStep` with many exec arms (`run`, `pipeline`, `workflow`, `parallel`, `for_each`, `lanes`, `input`, `approval`, `retry`, `plan`, `charly` — `#PipelineArms`, `:240-273`), so one step does several things; there is no `stage:` map ordered by `after:` and no `when:` matcher per parameter (`#StageAlt` = 0, control `#PipelineArms` = 1). | D-FLOW-1, §15.1 | `step:`/`plan:` → `stage:`; a lobster `parallel:`/`for_each:`/`input:` arm → its own stage with `after:`/`lane:`/`concurrency:`; `approval:` → an `ask:` stage (2.23) | One stage = one thing: `#StageAlt` over (steps, pipeline, deployments and checks, ask); `after:` order, `lane:`/`concurrency:`, `when:` as a matcher per parameter; the schedule fires `charly pipeline run` (producer-first `plugin-pipeline`, then `spec` for the kind route). |
| 2.22 | Repetition is a timed retry, not a declared count: `#PipelineRetry {max?, delay_ms?, factor?}` (`plugin-pipeline/.../schema/pipeline.cue:202-206`) and no `attempt:` def (`attempt` = 3 in `*.cue`, prose and unrelated keys only; control `retry` = 6). A failed plugin call is repeated after a sleep — D-LAW-5's "no blind retry or sleep". | D-FLOW-2, §15.1, D-LAW-5 | `retry: {max: 3}` → `attempt: 3` on the stage; `delay_ms`/`factor` dropped | `attempt:` as a declared, bounded count and the only repetition; delete `delay_ms`/`factor` and the retry-of-a-failed-call path (producer-first `plugin-pipeline`). |
| 2.23 | An ask is a free-form input gate, not an answered one: `#PipelineInput {prompt!, response_schema?, defaults?}` (`plugin-pipeline/.../schema/pipeline.cue:273-282`), `#Answer` = 0 and `unanswered` = 0 in `*.cue` (controls `#PipelineInput` = 1, `ask:` = 27), while `paused` (12) and `charly pipeline resume` (19) already exist in `*.go` and are the right state and command. | D-FLOW-3, §15.1 | `input: {prompt, response_schema}` → `ask: {prompt, answer: {expect: <matcher>, unanswered: refused}}`; `approval: true` → the same ask | `#StageAsk` + `#Answer` (`expect:`, `unanswered:` defaulting to `refused`); an answer settles `_answer` (`granted` carries on, `refused`/`cancelled` fail under `on_error:`); `paused` stays a state, `resume` a command (producer-first `plugin-pipeline`, then `spec`). |
| 2.24 | `description:` is required only on the candy: all 4 required sites are in `spec/schema/candy.cue` (`:17,175,195,407`), while every deployment kind, `source`, `os` and `builder` carries the optional form (33 `description?:` sites in `spec`'s CUE), so a `pod:`/`vm:`/`local:`/`kubernetes:` node may land with no description, and nothing stops prose in a node key. | D-KIND-3, §15 | none | `description` required on every node def (candies, boxes, sources, os, builders, deployments, pipeline, harness); a node key is `#Name` only; a step keeps its intent as its description and `id:` as its identity (producer-first `spec` for the base defs, then each kind plugin's own schema). |
| 2.25 | Disjointness is checked only namespace-vs-top-level-node-name: `sdk/loaderkit/namespace_node_disjoint.go` (D-VAL-4, `sdk` #496) refuses an import namespace that is also a node name, and consults no kind word or directive (`KindWord`/`kind word` = 0 in `loaderkit` `*.go`; control `namespace` = 43). `DESIGN.cue`'s `#Namespace: #TopName`, which subtracts `_reserved` (kind words and directives), is design only. | D-KIND-4, D-VAL-4, §15 | none | Extend the disjointness gate: a namespace may not equal a kind word or a directive, so a plugin's kind can never shadow a first-party one (producer-first `spec` for `#Namespace: #TopName`, then `sdk/loaderkit` for the check). |
| 2.26 | A candy can still name an init system: `DESIGN.cue`'s `#InitNeutral` (6 sites, gating `#EnvProvide`/`#EnvUse`) has no counterpart in `spec` (`InitNeutral` = 0 in `spec`'s CUE; control `#EnvDependency` = 3), and the candy env surface is the plain dependency list (`env?: [...#EnvDependency]`), so nothing refuses a `%i`/`%n`-style specifier in an env value or a service string. | D-CANDY-3, §16.1 | none | `#InitNeutral` on every env value, env provide/use default and service string; the init comes from the `os` alone (producer-first `spec` for the refinement, then `plugin-candy`/`plugin-build` for the render). |

## 3. Parsing and validation (§11–§12)

| # | Current state (evidence) | Target | Config migration | Code work |
|---|---|---|---|---|
| 3.1 | The parser classifies keys from `Threaded` word sets (`Kinds`, `DeploySubstrates`, `StructuralKinds`, `ExternalDeploySubstrates`) plus `resourceKindSet`, a value-shape scan (`discEntityPairs`/`isEntityValue`) and declared-field side lists with fallbacks (`sdk/loaderkit/parse.go`). | §11.2, D-LOAD-2 | none | Rewrite the parse rules on the composed schema. |
| 3.2 | Three validate-and-fold paths (`foldSubstrateKind`, `foldCandyKind`, plugin input) (`charly/charly/provider_kind_invoke.go`). | §12.1, D-LOAD-3 | none | One unification per node with the definition its kind key selects, plus `validate`. |
| 3.3 | Steps are typed only by `charly box validate` (`ValidateNodeFormSteps`); unions are tried alternative by alternative, so diagnostics list every alternative's failure. | D-LOAD-3, D-LOAD-5 | none | Validate steps on every load; dispatch every key-tagged union on its tag keys and report "exactly one of …". |
| 3.4 | The `/etc/charly/charly.yml` layer survives as a READ location in the loader (`sdk/loaderkit/config_stack.go:52,73`, `DefaultSystemConfigPath`, `CHARLY_SYSTEM_CONFIG` override); the shipped package no longer WRITES it — `spec` #183 (`863644dfd4b3c9c1c1cc5605f2bbb1b89b34e421`, tag `v0.2026270.938`) dropped the emission (`sdk/packagekit/nfpm_config.go:168-170` records it as DROPPED, `charly/packaging_test.go:309` asserts the package must not ship it). The bootstrap phase survives (`charly/loader_threaded.go:388`) and `plugin-example-bootstrap` is still a pinned submodule. The `config_stack.go` this row cited is `sdk/loaderkit/`, not `charly` (`gs charly config_stack` = 0 in `*.go`; 1 all files = CHANGELOG prose). | §11.3 | the `/etc` layer becomes system configuration | Delete the system read layer from the loader, and the bootstrap phase (the `plugin-example-bootstrap` carrier with it). |
| 3.5 | Per-kind maps in `spec.UnifiedFile` — `Box BoxMap`, `Candy map[string]json.RawMessage`, `Deploy map[string]DeployNode`, `PluginKinds map[string]map[string]json.RawMessage` — plus the opaque per-kind payload maps of `#ProjectTemplates` (`Local`, `Kubernetes`, `Kindcluster`, `KubeVirt`, `Firecracker`, `Pod`, `VM`, `Android`, each `map[string]RawBody`, `spec/cue_types_gen.go:2869-2893`). The `Pod`/`VM` typed fields this row named are gone (`PodMap` = `VMMap` = 0, control `PluginKinds` = 55) after `spec` #306/#307 externalized the kind bodies; counted 2026-11-13. | §12.2 | none | A generic resolved table; typed views move into the consuming plugins. |
| 3.6 | The `candy:` kind key. | §11.2 rule 3 | `name: {candy: {…}}` → `name: {…}` | Make the keyless node the candy. |
| 3.7 | Three composition keys: image `candy:` list, candy-in-candy `candy:`, deployment `add_candy:`. | D-CANDY-2 | each → `require:` | Update the schemas. |
| 3.8 | Two reference forms: inline `@github.com/…:tag` references inside fields (`require:`, `candy:`, `base:`) and `import:` namespaces. | D-REF-1, D-REF-2 | each inline reference → an `import:` namespace plus `<namespace>.<name>`, with the digest added | Delete inline-reference parsing (`spec.ParseRemoteRef` in field position). |
| 3.9 | An `import:` entry is a bare string or `{alias: ref}`, with `@host/org/repo[/sub]:version` pinned by tag only, and a flat-merge form exists. | D-REF-3..6 | `- alias: '@github.com/o/r:vT'` → `alias: {repo: github.com/o/r, release: vT, digest: <computed>}`; the flat-merge form → a namespace plus namespaced references; local paths → `{path: …}`; `box reconcile` computes the digests | Verify the digest at fetch. |
| 3.10 | Nesting by position exists only for deployment kinds; sidecars are still referenced by name (`sidecar` = 61 sites in `spec/schema/*.cue`, 116 in `*.go`). The evidence document this row called retired EXISTS at `charly`'s `origin/main` — `PROGRAM/nested-deploy-members.md`, blob `dc64e8a6fcf4053bf56114f372e00eca57c5c56b`, 292 lines, added 2026-10-03 (`charly` #748/#757) — and is absent only from the UMBRELLA's `origin/main`, which carries `PROGRAM/README.md` alone, so its evidence is re-derivable from `charly`, not gone. | §17.2, D-NEST-1..6 | sidecar references → inner `pod:` nodes; members written beside the kind key but meant to run inside → inner nodes | Each kind's nesting definition declares what it admits; delete the core nesting sets. |
| 3.11 | PATH can be set three ways (`path_append`, `shell.path_append`, `shell.path`). | §16.1 | the `shell.*` path keys → `path_append` | Update the schemas. |
| 3.12 | Provides and requires come in six mechanisms: 11 `*_provide`/`*_require`/`*_accept` fields, `plugin.requires`, `requires_exclusive`/`requires_shared`, init `depends_candy`/`requires_capability`, candy `capability`, and the `provides:` write-back. | §8, D-CAP-1..6 | `env_provide: {X: v}` → `provide: {env: {X: {value: v}}}`; `env_require: [X]` → `need: {env: {X: {}}}`; `*_accept` → `{optional: true}` on the need; `mcp_provide`, `agent_provide`, `terminal_profile` → `provide:` types; `requires_exclusive: [g]` → `need: {gpu: {<vendor>: {lease: exclusive}}}`; `plugin.providers` → `provide:` role types | Build the solver and the `type` role; delete the write-back and `--update-all`. |
| 3.13 | `plan:` names the steps list; `charly check plan`. | §2, §11.2 rule 5 | every `plan:` key → `step:` (candies, boxes, deployments, tasks, beds) | Rename it in the schemas, the loader, the labels and the commands; there is no alias. |
| 3.14 | `kindcluster:` is a separate kind; a local k3s cluster is built from candies (`k3s-server`) plus `kube` post-provisioning; `kind-host` profiles exist. | §15, §17.1, §17.2, D-DEP-6 | `x: {kindcluster: {node_image, nodes}}` → `x: {kubernetes: {create: kind, cluster_node: {<name>: {control_plane: true}}}}`; k3s on a vm or local node → an inner `kubernetes: {create: k3s}` node; workloads → inner `pod:`/`vm:` nodes | Merge the plugins into the kubernetes plugin; implement `create: kind` and `create: k3s` as one kind with lifecycle methods. |
| 3.15 | "image" names both a candy with `base:` and the OCI artifact; the docs say "box", "image" and "image-candy". | §2, §14 | none (wording only) | Rename identifiers, help, docs and skills: box = candy with `from:`; image and disk = the two artifact forms. |
| 3.16 | `--repo OWNER/REPO[@REF]` flag, the `DefaultProjectRepo` fallback (`spec/ref_parse.go`, `spec/repo_identity.go`), and the `@…:ver` CLI form. | D-REF-7..8 | scripts and docs: `--repo o/r@v box build x` → `box build o/r@v:x` | One positional reference grammar; delete the flag and the default-repository fallback. |
| 3.17 | Import namespaces and top-level node names can clash. | D-VAL-4 | rename clashing nodes (report produced in 0.1) | Add the disjointness check to core. **Answered (tag `v0.2026314.2159`)** — `sdk` #496 (`e92958bd887b824b52f792629ca974f8d2782d41`) adds `checkNamespaceNodeDisjoint`. |
| 3.18 | A `command` step that runs on the host is written `in_container: false`, which misreads on VMs and hosts. | D-VERB-3 | `in_container: false` → `on_host: true` | Rename the step modifier. |
| 3.19 | `kube` steps name a hand-made cluster context (`cluster: check-k3s-vm-ctx`, `kube_context: kind-…`). | D-NEST-4 | drop the context keys from `kube` steps written inside a `kubernetes` node | Derive the context from the identity of the enclosing `kubernetes` node. |
| 3.20 | Beds add plugins by hand through `add_candy: ['@github.com/opencharly/plugin-adb/…']`; Android apps are installed through the `apk:` field. | D-PLUG-4, §3.1 | each plugin entry in `add_candy:` → a `plugin:` declaration; `apk: [{apk: url}]` → `package: ["android:<url>"]` | The `plugin:` directive; the `android:` manager. |
| 3.21 | Android devices are `android:` templates naming their host with `box:` xor `adb:` (the xor is enforced in Go). | §17.1, §17.2 | the template's `device`, `api_level` and `adb` move onto the `android` node; an emulator device is written inside the pod that hosts it, so `box:` is dropped | Hosting comes from position. |
| 3.22 | Plural authored keys and directives: `defaults`, kubernetes `nodes`, `install_opts`, and further plural field names (list from inventory 0.1). | D-NAME-1 | `defaults:` → removed (user configuration, D-STORE-2); `nodes:` → `cluster_node:`; `install_opts:` → `install_opt:`; each further plural key → its singular | Rename them in the schemas. |
| 3.23 | Every pod receives every device the host probe finds (GPU via CDI, `/dev/dri/renderD*`, `/dev/kfd`, `/dev/kvm`, `/dev/vhost-*`, `/dev/fuse`, `/dev/net/tun`, `/dev/hwrng`) unless `--no-auto-detect` is passed. Candies and deployments carry raw `security:` blocks (`cap_add`, `security_opt`, `devices`, `shm_size`, `group_add`, `privileged`). The `resource` kind defines lease tokens. | §9, D-HW-1..5 | `security: {devices: [/dev/fuse, /dev/net/tun], cap_add: [ALL], security_opt: [unmask=/proc/*]}` → `need: {nesting: {container: {}}}`; `/dev/kvm` + vhost → `need: {nesting: {vm: {}}}`; a render node → `need: {device: {render: {}}}`; `shm_size: 1g` → the candy field `shm_size: 1Gi`; `requires_exclusive: [nvidia-gpu]` → `need: {gpu: {nvidia: {lease: exclusive}}}`; `resource:` nodes → leasable GPUs in user configuration; podman/docker/libvirt socket bind mounts → `need: {engine_api: {<engine>: {}}}` | Delete auto-detection and the `--no-auto-detect` flag; implement `grant` in each deployment kind as the minimal grant; `charly doctor <node>`. |
| 3.24 | Snapshots are VM-only, spelled as a capture policy (`snapshot: {on_finalize, mode, keep_venue}`), restored with `from: <deployment>:<snapshot>`, plus an unused `from_snapshot:` field and an unused `clone` source. Pods cannot snapshot. | §14.3, §17.3, D-CAPTURE-1..3 | for a deployment `X` with `snapshot: {on_finalize: golden}`, add a box `X-checked: {description: …, from: X}` and rewrite every `from: X:golden` to `from: X-checked`; `mode` and `keep_venue` are dropped (a capture never stops its deployment) | Pod captures as committed images; captures as boxes; delete the snapshot fields and the colon grammar. |
| 3.25 | Multi-operation verbs take a `method:` string plus prefixed fields (`kube: {method: wait-nodes, kube_count: 1}`, `kube_kind`, `kube_resource`, `kube_context`), declared in the verb's OWNING PLUGIN rather than in core (`plugin-kube/candy/plugin-kube/schema/kube.cue:40-72`; `method?:` = 0 in `spec/schema/*.cue`, control 1 in `plugin-kube`); the mutating methods `apply`/`delete` and the `manifest` field are deleted (`plugin-kube` #33, on D-VERB-1's "a verb observes" rule). | D-VERB-4 | `kube: {method: wait-nodes, kube_count: 1}` → `kube: {wait_node: {count: 1}}`; likewise for `adb`, `appium`, `cdp`, `wl`, `vnc`, `spice`, `dbus`, `record`, `jetkvm`, `libvirt`, `mcp`, `helm` (per-verb tables from inventory 0.1) | Each verb input becomes an operation registry with a derived union (S4). |
| 3.26 | State changes are written two ways: candy fields (`package`, `service`, `extract`, `data`, `shell`) and `run:` steps using `mkdir`, `copy`, `write`, `link`, `download`, `setcap` and `config` (which renders `${VAR}`/`var:` substitutions at build time). There is an `include` intent (3 uses). | §14.4, D-VERB-1, D-IR-1 | `run: … mkdir: P` → `file: {P: {dir: true}}`; `write: P, content: C` → `file: {P: {content: C}}`; `copy`/`link`/`download` → `file:` entries keyed by target path; `setcap` → `capability:` on the file entry; `extract:` and `data:` fields → `file:` `extract`/`copy` entries; `shell:` snippets → `file:` writes into the profile directory plus `path_append`; `config` steps and `var:` → literal `file:` writes, with runtime values from `env`; `include` steps → `require:` of the candy that carries those steps | Delete the act verbs, `var`, `include`, `extract`, `data` and `shell`; the `file` action owns every file effect. |
| 3.27 | Field names that collide or mislead: the candy `plugin:` block (vs the `plugin:` directive), the `artifact:` field (vs the artifact concept), `apk:` (vs the `android:` manager), `reboot:`, and the `security:` block. | D-NAME-4, §16.1 | `plugin: {source: M, providers: […]}` → `module: M` plus `provide:` with role types; `artifact:` → `export:`; `apk:` → `package: [android:…]`; `reboot: true` → removed (the deployment kind reboots when an action requires it); `security:` → 3.23 | Rename the schema fields. |
| 3.28 | Verb inputs: `command` is `{command: …, in_container: …}`; `file`, `service`, `package` and `process` repeat the verb name as their primary field; some verbs accept a scalar shorthand as well as a map; matchers are written as scalars and as maps; `http` matchers sit beside the verb (`body:` as a step key). | D-VERB-3, D-VERB-5 | `command: {command: X, in_container: false}` → `command: X` plus `on_host: true`; `file: {file: P, …}` → `file: {path: P, …}`; `service: {service: N}` → `service: {name: N}` (likewise `package`, `process`); every other scalar shorthand → the verb's full input; `stdout: X` → `stdout: {equals: X}`; `http: U` + `body: M` → `http: {url: U, body: M}`; a redundant `exit_status: 0` is dropped | Rewrite the verb inputs; delete the primary-field machinery (2.8). |
| 3.29 | `provide:` items are written as lists (`providers: [verb:http]`) and as maps. | D-CAP-1, S5 | lists → maps of name → attributes (`verb: {http: {}}`) | Update the schema. |
| 3.30 | Collections with identities are lists of maps with a `name:` field: `service?: [...#CandyService]` (`spec/schema/candy.cue:115`), `user:`, `volume?:` (11 sites), `alias?:` (6 sites), package `repo?:` (5 sites); files are a list of one-key entries. The `export:` list this row named has 0 sites in `spec`'s CUE (`export?:` = 0, control `alias?:` = 6; `export` survives only in `DESIGN.cue`'s `_candyField`), and `file?:` in `spec/schema/deploy.cue:785` is the file verb's input, not a file collection. | S5 | `service: [{name: N, …}]` → `service: {N: {…}}` (likewise `user`, `volume`, and the `alias:`/`export:` DESIGN keeps); package `repo: [{name: N, …}]` → `package_repo: {N: {…}}`; `alias:` → the operations plugin's configuration; `file: [{write: P, content: C}]` → `file: {P: {content: C}}` | Rewrite the schemas as maps; duplicate names become impossible by construction. |
| 3.31 | Candies list capabilities and candies in one `require:` list, mixing one-key capability maps into a list of names. | §8, D-CANDY-2 | `require: [a, {env: X}, {gpu: nvidia, lease: exclusive}]` → `require: [a]` plus `need: {env: {X: {}}, gpu: {nvidia: {lease: exclusive}}}` | Split the field; the solver reads `need:`. |
| 3.32 | Field names that carry a second meaning: the step modifier `context:` (also the kube context and the protocol call), the `http` input's `method` (also a protocol method), the android `adb.host` (also the host), the `os` node's `release` (also a repository release), a file's `capability` (also a capability), and node names containing `--`. | D-NAME-4, §2, D-NEST-4 | step `context: [build, runtime]` → `phase: any` (omitted), `context: [runtime]` → `phase: runtime`, `context: [build]` → `phase: build`; `http: {method: M}` → `http: {request_method: M}`; `adb: {host: A}` → `adb: {address: A}`; `release: "43"` on an `os` node → `version: "43"`; file `capability: [c]` → `linux_capability: [c]`; a node name with `--` → the same name with single hyphens, references rewritten | Rename the fields in the schemas. |
| 3.33 | References are not visible to core: the loader resolves them inside kind code, so validation cannot run on a linked graph and cycles are found late. | §11.1 stage 4, §12.1, S9, D-VAL-2..3 | none | Mark every reference field with `@ref(<kinds>)` in its plugin's schema; core builds, checks and orders the reference graph before validation. |
| 3.34 | One repository may enter a load at more than one release: `spec/loadmodel.go:174` states a repository may be "legitimately mounted at multiple alias paths", and no rule rejects two releases of one repository across the import closure (no per-load release ledger; `multiple versions` appears only in prose). | D-VAL-5, §12.4 | none | One release per repository across a load, imports of imports included: a release ledger keyed by repository identity that fails naming both entrants (producer-first `spec`, then `sdk`, then `charly`). |
| 3.35 | A deployment's form is never checked against the `os` at the end of its box's `from:` chain: no load rule reads the chain's terminal `os` (grep `can produce` = 1 hit, prose only), and row 2.10 is still migrating the four starting-point spellings that would give it an `os` to read. | D-VAL-6, §14.2 | none | Reject a deployment whose form the terminal `os` cannot produce, naming the `os` and the form; the build plugin owns it once 2.10's single `from:` resolver exists. |
| 3.36 | Nothing compares a deployment's host needs to what its deployment kind grants: `grant` appears in 0 lines of `spec/schema/*.cue` (control `endpoint` = 97), and the grant table is row 3.23's work. | D-VAL-7, §9.1 | none | A deployment whose `need:` names a kind its deployment kind does not grant is a load error naming the need and the kind; runs per plugin (container, machine, kubernetes, android). Blocked by 3.23. |
| 3.37 | No unowned-word error names the owning plugin: `no plugin provides` = 0 in `spec`/`sdk`/`charly`, and the only neighbouring diagnosis is the unknown-kind message (`sdk/kit/reverse_ops.go:114`). | D-VAL-10, D-PLUG-7, §12.4 | none | An unnamespaced word that no first-party plugin owns is an error naming the plugin that does (producer-first `spec` for the registry data, then `sdk`/`charly` for the message). |
| 3.38 | A capture's scope is never validated against the kind: `ProcessCapture`/`process_capture` = 0 lines in `spec` (control `snapshot` > 0), so `capture: process` cannot name the deployments whose driver row declares process capture. | D-VAL-11, D-CAPTURE-4, §17.3 | none | A `capture: process` capture names a deployment whose driver row declares process capture, and a deployment whose driver cannot is a load error; lands with 13.5 and 13.3. |
| 3.39 | A step's accesses are not checked against its venue: `VenueAccess` = 0 lines in `spec` (control `access` = 133), so a `check` that runs in the guest and needs `exec` is not refused by a venue that serves no `exec`. | D-VAL-12, D-VENUE-2, §12.4 | none | A step's verb needs only accesses the venue of its deployment serves; lands with 13.4's access declaration. |
| 3.40 | A `publish` key is not checked against the stack's provided endpoints: `Publish` is modelled in `spec` (15 Go lines) but no rule ties a published key to a provided `endpoint` of the deployment's stack, so the guest side is not derived from the endpoint's own port. | D-VAL-13, §17.1 | none | Every `publish` key names a provided `endpoint` of the deployment's stack, and the guest side is that endpoint's port; lands with 13.2's `publish:` field. |
| 3.41 | No host-capability grant exists to declare or preflight a version: `spec`'s schema has no `need:`/`use:`/`provide:` key at all (0; control `env_require`/`env_accept`/`env_provide` 15), no `isolation`, `privilege`, `nesting` or `driver_api` capability type (0 each; control `gpu:` 5 and `device:` 5, both ordinary fields rather than capability types), and no driver table — the only `_driver` in `spec` is a libvirt filesystem word list (`schema/vm.cue:1145`) — so `charly doctor` probes host dependencies and never a versioned grant. | D-HW-6, D-HW-7, §9 | none (the authored surface arrives with 3.12/3.23) | Add the driver row that declares the capabilities it grants and the version each needs (13.3); implement the kind's `grant` against it; preflight `nesting`, `driver_api`, `isolation`, `privilege` and `nesting: userns` before anything is realized; under `isolation: microvm`, `device: render` is granted as a paravirtual GPU and a leased GPU is not grantable. |
| 3.42 | Leases are tokens, not modes: the `resource` kind carries `gpu?: #GpuSelector` (`spec/schema/resource.cue:9`) and candies carry `requires_exclusive`/`requires_shared` (6 occurrences in `spec`'s CUE), while no capability-table row carries `lease:` and no need/use entry can be `exclusive` (0 `need:`/`use:` keys in `schema/*.cue`; control 15); `gpu: {}` naming no vendor is not expressible, and no driver row declares the lease mode its mechanism imposes. | D-HW-8, D-HW-9, §9 | `requires_exclusive: [nvidia-gpu]` → `need: {gpu: {nvidia: {exclusive: true}}}`; a bare `gpu: {}` → any leasable GPU from the user configuration (3.23 migrates the same surface) | The `_capability` rows gain `lease:`; the driver row declares the mode its grant imposes; core leases at the stricter of need and grant, refuses a conflicting request before realization naming the holder unless `preemptible`, and the solver picks the GPU for `gpu: {}` and names it in the lease. |
| 3.43 | Four authored field words break the case rule: `srcDir`, `srcLabel`, `rootDir` and `refID` (`spec/schema/loadedproject.cue:28-55`) are camelCase where every charly- or plugin-defined word is snake_case; the hyphenated-key count in `schema/*.cue` is 0 and `#Name` (`DESIGN.cue:49`) is the kebab form a user-chosen name takes, so the two forms cannot collide. No gate enforces the case half. | D-NAME-2, §2 | `srcDir` → `src_dir`, `srcLabel` → `src_label`, `rootDir` → `root_dir`, `refID` → `ref_id` (and their Go field tags) | Rename the four fields in the CUE definition and every consumer; add the case check to the §25 schema-pattern gate (Appendix A.11) with one negative case per form. |

## 4. Generation (§13)

| # | Current state (evidence) | Target | Code work |
|---|---|---|---|
| 4.1 | Three pipelines: `schemagen` concat/params/vocab (`spec/internal/schemagen/main.go`: `concatSchema`, `writeParams`, `writeVocab`), the `schemaretag` struct-tag pass (`spec/schemaparams/schemaparams.go:68`) and `wiregen` (`spec/internal/wiregen`); ad-hoc per-plugin gengotypes (66 of 120 plugin repositories carry `params/cue_types_gen.go`, 2 through `go:generate`: `plugin-omarchy`, `plugin-nerdctl`) — counted 2026-11-13. | D-GEN-1 | One pinned generator and one task in every repository; delete the vocabulary generator and the YAML retag. |
| 4.2 | `params_json` is a GENERATED protobuf field (`spec/proto/plugin.pb.go:690` `ParamsJson []byte`), so the hand-written `json.Unmarshal` of it is gone; 0 hand-written `{Args}` envelopes remain in `charly` (control: 78 `json.Unmarshal` lines, none decoding `params_json`), and `sdk` holds 2 `Args map[string]` sites — counted 2026-11-13. | D-GEN-6, D-PROTO-6 | Generate the typed role and api wrappers; validate every payload on receipt. |
| 4.3 | Four command models: Kong structs, reflected `#CLIModel`, the `CLISubcommand` catalog and `command_model_json`. | D-CLI-4, §13 | Command arguments as CUE definitions in the owning plugin's module; generate the grammar and MCP tools from them. |
| 4.4 | No generation gate in plugin repositories. | D-GEN-2 | A reproducibility gate in every repository. |
| 4.5 | Twenty-two generated `var` word lists live in `spec/vocab_gen.go`, six of them registry-composed (`KindWords`, `ProviderClasses`, `KindValueDefs`, `OpVerbs`, `ResourceKinds`, `DocDirectives`) — the runtime reads Go lists where it could read the composed schema. | D-GEN-5, §13 | Read every list from the composed schema at runtime; keep only the tables CUE cannot express (producer-first `spec`, then `charly`). |
| 4.6 | 627 generated structs in `spec/cue_types_gen.go`, 0 `*Alt struct` and no one-of/`ExactlyOne` decoder in `spec` or `charly`: the S4 one-of struct is hand-written per union, and `schemaparams` is a port of `cue exp gengotypes` rather than the tool itself. | D-GEN-7, §13 | Generate the one-of struct and its exactly-one decoder from the registry's tag tables in core's own generator; run `cue exp gengotypes` in the owning module for the leaf shapes (producer-first `spec`, then `sdk`/`charly`). |

## 5. Modules and the plugin protocol (§3, §4)

| # | Current state (evidence) | Target | Code work |
|---|---|---|---|
| 5.1 | `spec` holds mechanisms: `exec` (4,166 production Go lines), `container`, `sshx`, `proc`, `poll`, `lock`, `cache`, `refs`, `hostenv`. | D-SPEC-1 | Move them to sdk. |
| 5.2 | `sdk` holds domain code (`deploykit` 20,909 production Go lines, `loaderkit` 8,704, `vmshared` 3,471, `buildkit` 1,570, `packagekit` 820) and 64 `type X = ` alias definitions (348 lines carry a `var`/`const`/`func`/`type` alias), counted 2026-11-13 at `sdk` `origin/main` `e44f0ce25431be99b80aa440518a9a43d6916a86`. | D-SDK-2, D-MOD-2 | Move the domain code into the owning plugins and the loader into core; delete the aliases. |
| 5.3 | Symbols defined twice: `QuadletDir` (`sdk/deploykit/quadlet_paths.go` + `spec/spec/quadlet_paths.go`), `StepDoMode` (`sdk/kit/planspec.go` + `spec/spec/verb_context.go`), `DeployExecutor` (`sdk/kit/walk.go` + `spec/spec/deploy_executor.go`), `ComputeCalVer` (`charly/version.go` + `spec/spec/calver.go`), `CheckVerbProvider` three times (`charly/provider_verb.go` + `sdk/kit/kit.go` + `spec/spec/checkcontext.go`). `buildPluginBinary` is resolved — renamed `resolvePluginBinary`, one definition in `charly`; and `sdk` #362 (`f28475f1f30f87bd1b928b26ffa9f2bf525dab11`) collapsed the two container resolvers onto one split helper. | D-MOD-2 | Give each remaining one owner. |
| 5.4 | Core holds about 3.5k lines of domain logic (no definition of the set exists, so the total is unmeasured; the row's markers are measured individually): pod lifecycle options, VNC port `5900` (x10), `libvirt` forced into beds (x93), the podman fallback (x63), GPU allocation (x139), the `""`/`"container"` to `"pod"` rewrite (x1). It embeds a 2,216-line `charly.yml` (distros, builders, OVMF, `verb_primaries`, `compiled_plugins`) and registers 28 host builders (`registerHostBuilder(`); counted 2026-11-13. | D-CORE-1, D-CORE-2, D-LAW-3, D-REPO-2, §3.1 | Move each into its owning plugin (§3.1); replace the seams with the host service methods (§4.6) and `api` calls. OS, init and builder nodes become data in the OS repositories. |
| 5.5 | Five placement paths, three serve styles (`sdk.Serve`, `sdk.Main`, `ServeCheckVerb`), two serve commands (`__plugin`, `__agent-target`), three verb-dispatch branches, two executor APIs. | D-PROTO-1..4 | One transport: `<binary> serve` with an empty environment and the two sockets; compiled-in plugins on an in-memory listener; one generated server. |
| 5.6 | Capabilities are declared in three places: manifest `providers:` (119 plugin candies), Go `NewMeta` (105 hits in `charly`), and the generated refs map (221 entries); CalVer literals in plugin Go (`"2026.181.0001"` x13; e.g. `const calver = "2026.198.2131"` in `plugin-box/plugin.go`). | §4.1, §4.4, D-PLUG-3 | The plugin candy's `provide:` is the manifest; `describe` reports its digest and the handshake verifies it; release stamped from the tag. |
| 5.7 | Thirteen provider classes (`spec/schema/candy.cue:630`: kind, deploy, verb, step, build, builder, command, engine, workflow, loader, refs, agent-runtime, terminal — 12 of them also Go constants in `charly/provider.go`) and 47 string operations over an untyped `Invoke(ctx, &Operation{Reserved: word, Op: op, Params: paramsJSON, Env: env})`; capability flags (`structural` x59, `lifecycle` x166, `preresolve` x27, `validates` x51, `primary`, `interactive` x21, `command_parent` x9, `DeployTraits` x27). | §4.2, D-ROLE-1..6, D-PROTO-5 | The five roles and their methods, with typed inputs and outputs; optional behaviour = a method left out of `describe`; a registry key's `<role>:` is a row of `_role`. `step`, `builder`, `build`, `engine`, `loader`, `refs`, `agent-runtime` and `terminal` map onto `verb`, data nodes or `api` (mapping table produced per class in this item). |
| 5.8 | Helpers copied across plugins: `session_method` x6 repositories (plugin-adb, -appium, -cdp, -spice, -vm, -vnc), `setCommandContext` x8, `shellQuote` x5 (plugin-cstream, -deploy-pod, -punktfunk, -quickshell, -task), `CheckEnv` shared code present in 136 Go lines across the 120 plugin repositories. | D-SDK-1, D-CODE-3 | sdk mechanisms. |
| 5.9 | No error model or deadline on plugin calls; plugins reach the engine, ssh and secrets directly; deployment locks are taken inside plugins. | D-PROTO-6..13, D-DEP-4 | `#Request`/`#Reply` with `#Error` codes; deadlines and cancellation; locks taken by core before mutating methods; the host service as the only reach for venues, store, project, other plugins and secrets, with permissions from the call; one lock held by core for the whole of every mutating command (D-DEP-4). |
| 5.10 | No protocol conformance suite. | §4.7 | The in-memory harness in sdk with the conformance cases; run in every plugin repository's CI. |
| 5.11 | Deployment plugins keep records in their own files (`os.WriteFile` x50 in `plugin-vm`), place ssh key material on disk themselves (4 `id_ed25519`/`id_rsa`/`ssh_key` sites in `plugin-vm` and 4 in `plugin-deploy-vm`; the `ssh-keygen` CLI is not used — 0, control `ssh` x211 in `plugin-vm`), read engine endpoints from the environment (`os.Getenv` x21 in `plugin-vm`), and the candy is built by core-side code (`resolvePluginBinary`, one definition in `charly`). | §4.2, §4.6, D-PROTO-4, D-PROTO-13 | `get`/`put` on the `state` store for kind records, `put` on the `secret` store for generated secrets, `get` on the `config` store for engine endpoints; the candy kind (`kind:candy`) with `build` in the build plugin. |
| 5.12 | No `api` role exists: `spec`'s `#ProviderClassNames` lists 13 classes and none is `api` (`schema/candy.cue:630`), 0 of 119 plugin manifests declare an `api:` capability (control: 119 declare `providers:`), `Host.call` appears 0 times in `charly` (control `HostBuild` 381 — the live plugin-to-plugin path is a host-builder seam or an `external:<word>` step), and the only wire is one untyped `Invoke` whose reply is `bytes result_json = 1` (`spec/proto/plugin.proto:164`), so no `unmet` answer exists anywhere (`unmet` as a protocol code: 0 in `charly`'s Go; control 143 `deadline` hits in `spec`). | D-API-1, D-API-2, §5 | Add the `api` role: `provide: api` in the owner's manifest, one tag table per api in the owner's CUE module keyed by the api's method keys, the caller importing that definition; `Host.call` for a `use:`-listed api nothing provides is answered `unmet` naming the api and never reaches a plugin, while a `need:`-listed api fails the load first. Generate the per-api tag table and the caller wrapper from the owner's module (4.2); bind under `need:`/`use:` in the one solver (3.12); answer `unmet` from the host service; delete the `external:<word>` step path (6.1) in the same phase. |
| 5.13 | The module graph is exact except for two test dependencies: `spec` imports neither `sdk` nor core (0 Go imports; control `deadline` 143), `sdk` imports `spec` only, `charly` imports `sdk`+`spec`, 0 of 119 plugin `go.mod` files name core (control: 119 name `sdk`) and 0 of 120 plugin repositories import it in Go (control: 119 do for `sdk`), and core reaches compiled plugins only through the generated `charly/plugins_generated.go`; but `sdk`'s `go.mod` requires `plugin-egress` and `plugin-init` so `deploykit/render_service_seam_roundtrip_test.go:33-34` can wire two real providers — an `sdk` → plugin edge the import graph does not contain. | D-MOD-1, §3 | Move that R8 seam-roundtrip harness into the owning plugin repositories (or drive it through the generated registry in a bed) and drop the two requires from `sdk/go.mod`, so the module graph is the arrows and nothing else. |

## 6. Plugins and the install IR

| # | Current state (evidence) | Target | Config migration | Code work |
|---|---|---|---|---|
| 6.1 | Three install emitters (`EmitTasks`, `OCITarget`, `WalkPlans`) and two plugin step mechanisms (`ExternalPluginStep`, `external:<word>`). | §14.4, D-IR-1 | `run: … helm-release:` → the `helm:` manager prefix or the `helm` verb | One IR consumer per output; plugins contribute only through kinds and verbs. |
| 6.2 | `plugin-builder-{aur,cargo,npm,pixi}` are the same code with one word changed; `external_builder` is used once. | D-PLUG-2 | `external_builder: mise` → a `builder` node | One builder implementation over `builder` nodes. |
| 6.3 | One concept spread across many plugins: pod (plugin-pod, deploy-pod, substrate, deploykit); vm (plugin-vm, deploy-vm, substrate, vmshared); check (25,586 Go lines in plugin-check) and vm (28,497 in plugin-vm) god-modules, counted 2026-11-13. | D-PLUG-1, §3.1 | none | Consolidate per concept as §3.1 assigns; split by sub-concept inside a plugin. |
| 6.4 | Fourteen example repositories; five examples are compiled into the release. | D-REPO-3, D-CORE-4 | none | One examples repository. |
| 6.5 | Verb duplicates: `addr` vs `port`; `matching` vs the matchers; the `helm` verb vs the `helm-release` step. | D-LAW-1 | `addr: h:p` → `port: {host: h, port: p, reachable: true}`; `matching` steps → matchers | Merge them. |
| 6.6 | Application verbs: `qdrant`, `openclaw`, `crabbox`, `punktfunk`, `agentteams`, `dsh`, `herdr`, `quickshell`, `cstream`, `omarchy`. | D-VERB-1, D-NAME-3, D-CLI-3 | each step → `http:` with JSON-path matchers or `command:` (per-verb mapping tables from inventory 0.1) | Add the `json` matcher to `http`; move the plugins out of the first-party set. |
| 6.7 | Internal operations exposed as verbs: `enc`, `egress`, `gpu`, `k8sgen`, `oci`, `arbiter` (`providerRegistry.resolve(ClassVerb, "arbiter")`), `credential` (`connectPluginByWord(ClassVerb, "credential")`), `nerdctl`, `gh`, `tunnel`, `transcode` (`plugin-media`); `retention` is not a verb but a host-builder seam (`charly/host_build_retention_defaults.go`). Unused: `splice-region`, `module-pins`, the `build` operation, `bpf`. The taxonomy tables are absent too (`#FactVerbAlt` = 0, `#ProtocolVerbAlt` = 0, control `#Verb` > 0), so "a verb is a fact verb or a protocol verb, never both" is convention, not schema. | D-ROLE-3, D-LAW-2, D-LAW-8, D-VERB-6 | none | Turn them into `api` calls or delete them; declare the `#FactVerbAlt`/`#ProtocolVerbAlt` tables so the exclusivity is validated rather than observed. |
| 6.8 | Plugins are found implicitly: a word-to-repository index generated into core (`charly/plugins_refs_generated.go`, 221 entries, kept out of the kernel by `charly/no_provider_ref_map_gate_test.go`) with lazy connect on a registry miss (`TestInvokeProvider_LazyConnectFallback`), `compiled_plugins:` (49 `registerCompiledPlugin` calls) deciding which words exist, `plugin.requires` (x14 in `charly`) + `ExtraRef` (x11 charly, x9 sdk) fetches, and plugins built from source on the host (`resolvePluginBinary`). | §7, D-PLUG-4..6, D-CLI-5 | every project gains a `plugin:` directive listing the plugin repositories its words need (generated by `charly migrate` from the words the project uses); `box reconcile` pins releases and digests | Registry from declarations only; prebuilt per-platform binaries with each plugin release; an embedded plugin runs only on an exact match; delete the refs map and lazy connect. |
| 6.9 | Every OS package a plugin needs is declared in charly's own package instead of by the plugin: `charly/packaging/charly.yml` (444 lines) `packaging.formats.*.depends` names `podman` (the pod plugins), `gocryptfs` + `qemu-full`/`qemu-img` (encrypted volumes, the vm plugins) and the rest of the qemu/libvirt/virtiofsd/swtpm/dnsmasq/edk2-ovmf/xorriso, nerdctl/containerd/cni-plugins, kind, openssh, gnupg/pinentry and rust/font/procps-ng sets, with `tesseract` in `suggests`/`optdepends` (the `artifact_contains_text:` assertion, `sdk/artifact.go`); no plugin candy declares the OS packages it needs to run — the three `package:` blocks in plugin candies are `plugin-marketplace`'s deployment content, `plugin-mise`'s `curl-tar` candy and `plugin-package`'s own manifest field, none a plugin's runtime dependency. There is no way to install a missing package on the host at all, and no switch that would gate it. | D-CANDY-6, §4.1, §16.1, D-STORE-9 | each plugin candy gains `package:`/`os_override:` for the OS packages it needs to run (plugin-vm + plugin-deploy-vm: the qemu/libvirt set; plugin-pod + plugin-deploy-pod: podman, fuse3, fuse-overlayfs, slirp4netns; plugin-nerdctl: the nerdctl stack; plugin-kube: kind; plugin-record: rust, a monospace font, procps-ng; plugin-secrets: gnupg, pinentry); the charly candy's `packaging.formats.*.depends` keeps only core's entries; the user configuration gains `local_install: false` | `charly generate-packages` (sdk/packagekit; later `release-package`) unions the packages of the plugins a `packaging.variants` entry names with the candy's own `depends`; `charly doctor` reports a declared plugin's missing packages on the host; `charly local-install` installs them only while `local_install` is true (or with `--local-install` for one invocation) and every other path reports the missing package by name. |

## 7. Store, state, secrets and concurrency (§20–§21)

| # | Current state (evidence) | Target | Code work |
|---|---|---|---|
| 7.1 | Plugin binaries are keyed by absolute source path (19 GB, 2,025 binaries, 1,762 test stubs in the user cache). | D-STORE-4, D-STORE-8 | Key by content; inject test roots. **Answered 2026-11-11** — keyed by content: `opencharly/sdk` `b77c8a54d2331f77ee7308e43503bb051e7df6b2` (tag `v0.2026287.1747`, PR #389) keeps ONE store entry per binary, keyed by D-STORE-4's whole input set, with the per-key lock outside the store tree, and `opencharly/charly` `125a910988495170e7f2ab4d601fa4e70e1cd3bc` (tag `v2026.288.0051`, PR #910) deletes the loader's path-keyed cluster; the test root is `$XDG_CACHE_HOME/charly` with `$CHARLY_CACHE_DIR` as the sole override (D-STORE-8). The *Current* cell's figures are that OLD root's on-disk residue — 35 GB across 5 126 files, 1 083 of them `.stamp` sidecars, measured on 2026-11-11 — whose purge `7.3` owns. |
| 7.2 | Three cache environment variables still read (`CHARLY_CACHE_DIR`, `_REPO_CACHE`, `_MATERIALIZED_CACHE`; `_BUILD_CACHE` and `_GH_CACHE` are already 0 at 2026-11-12) and about 9 hand-built `.cache` paths mixing `UserCacheDir` and `UserHomeDir`. | D-STORE-1 | One sdk package. The two remaining variables beyond `CHARLY_CACHE_DIR` are deleted in the phase that migrates the cache they serve, and the hand-built paths route through the same resolver — no variable and no hand-built path survives its own phase (R5). |
| 7.3 | Five on-disk caches: per-ref repository exports — 15,568 per-ref directories under `repos/` (1,790 plain exports + 13,778 `.view.*` derived views) with 2,536 `.ref` sidecars, counted 2026-11-13 — that also cache the mutable `@main`; `materialized/` with 6,138 JSON entries each carrying a `"resolved": "<RFC3339>"` timestamp beside its tree (D-STORE-6 payload-rule violation), while the payload/validity-metadata split itself is already implemented (the resolution record lives in the config blob, not in the payload); `vm-images/` with 6 `.sha256` sidecars plus `.lock` files; 452 lock files in `locks/` never collected; and the OCI-layout store with 6 non-test callers. | D-STORE-3, D-STORE-5..7 | The ordered migration below: one cache per cutover, each provable by one honest R10 gate, with each bespoke form deleted in the phase that migrates it (R5, no dual path), and `charly clean` purging the old roots (D-STORE-7). |
| 7.4 | No audit record: `audit_append` = 0 in `spec`/`sdk`/`charly` (controls `audit` = 30/43/135, all prose), no command reads or writes one (no `command:audit` in the command census), and no `#Redacted` type exists (`Redacted` = 0, control `audit` = 30) — the retired `12.11`/`12.12` host-method targets left this area unowned, and DESIGN §12.3's MOVED record asks for exactly this item. | D-AUDIT-1..5, D-CLI-1, §20.1 | The `audit_append` host method plus `#AuditEvent` (identity, action, outcome, a `#Redacted` value), the state-root layout of §20.1, and the read command in the host group with its argument definition (producer-first `spec` for the types, `sdk` for append and read, `charly` for the command; every mutating plugin's call site is the producer side). |
| 7.5 | The store is an OCI layout with no serving path: no registry symbol in `sdk/storekit` (the only `registry` hits are a store named `registry` in `storekit/orphans_test.go:153-165`), and no `command:registry` exists (census; DESIGN §22 lists it in the host group). `12.15` covers only the delivery alternative for clusters (in-venue import), not this read-only view. | D-STORE-10, §20 | The read-only registry view over storekit entries plus the `registry` command in the host group; a built image reaches a cluster through that view or by delivery into the engine store it reads, so nothing it serves is fetched again from a public registry. |
| 7.6 | Secret values enter the install IR: `sdk/deploykit/secret_declare.go:87 InjectSecretsIntoPlans(plans []*InstallPlan, env map[string]string)` writes the resolved values into plan steps "so the heredoc renderer sees the values as regular env exports" (callers: `sdk` 4, `plugin-fleet` 2, `plugin-deploy-pod` 2); the core-side copy was deleted (`charly/build_overlay.go:30-31`), so the values now travel plugin-side instead of not travelling. | D-SEC-1, §21 | Replace plan injection with a reference (`#Redacted`) the executor resolves at the venue; delete `InjectSecretsIntoPlans` and its two plugin call sites (producer-first `spec` for `#Redacted`, `sdk` for the resolve, then the two plugins). |

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
| 8.1 | Duplicated and kind-specific commands still declared at the tips (census of every `command:<word>` in the plugins, `charly` and `marketplace`): `remove` 1, `logs` 1, `settings` 5, `secrets` 6, `feature` 6, `docs` 5, `kubevirt` 3, `reap-orphans` 3, `generate-packages` 4, `candy` 7, `labels` 1, `ssh` 3, `tmux` 1, `vm` 5, `deploy` 5, `cache` 2, `status` 5 → `remove` → `deploy del`; `config setup` → `deploy add`; `config mount/unmount/passwd/status` → `volume`; `box labels` → `box inspect`; `box generate` → `box build --emit`; `box fetch/refresh` and `cache clear` → `cache` and `clean`; `feature` and `box feature` → `check harness`; `deploy status` → `status`; `logs` → `log`; `deploy from-box` → a project with a `source: {oci: …}` node; `tmux` → `agent terminal`; `reap-orphans` → `clean`; `ssh tunnel` → `display`; the `vm` group: `vm build`/`bake` → `box build --form disk`; `vm clone`/`vm snapshot` → capture boxes; `vm ssh`/`vm scp` → `shell`/`cp`; `vm console` → `console`; `vm screenshot`/`sendkey`/`type` → `display` and the display verbs; `vm cp-box` → `box load`; `vm import` → `deploy adopt`; `vm gpu`, `vm seed` and `vm retag` are removed (GPU modes are leases and `doctor`); `vm start/stop/destroy` and `kubevirt …` → the shared lifecycle commands; `secrets` → `secret`; `settings` → `config`; `docs generate` → `doc generate`; `generate-packages` → `release-package`. Three renames of the earlier list are withdrawn: `candy set`/`add-<fmt>`/`params` and `config` keep their spellings (DESIGN §22, D-CLI-2), and `secrets` is a recorded retirement rather than a rename. | Docs, skills and scripts are updated in the same change. No aliases remain. |
| 8.2 | Application commands still declared first-party: `agentteams` (3 decls), `herdr` (3), `dsh` (4), `qdrant` (2), `ollama` (3), `strata` (2), `lobster` (3), `containerd` (2), `marketplace` (3), `mcp` (6); `bpf` (5), `cardwire` (4) and `udev` (4) are still in the first-party set. `nerdctl` has LANDED — its command word is gone (0) and its candy now declares `command:containerd` (`plugin-nerdctl/candy/plugin-containerd/charly.yml:46`); counted 2026-11-13. → `charly cmd <deployment> <tool>` (`command:cmd` 3) for every application word (D-CLI-3), and an application's own commands under its plugin's namespace; `bpf`, `cardwire` and `udev` leave the first-party set. | Same. |
| 8.3 | Writes to `~/.config/charly/charly.yml` by `deploy add`, `config` and `remove` → records in the state root (D-DEP-5, D-LAW-6). | The one-shot conversion of 2.6. |
| 8.4 | Commands outside the allowed-writer set write authored files: `deploy add`/`config`/`remove` write `~/.config/charly/charly.yml` through `spec.DefaultDeployConfigPath` (`sdk/kit/deployconfig.go:12`, `kit/install_ledger.go:53`), and `plugin-box` carries 14 `os.WriteFile` sites (`candy/plugin-box/box.go:393`, `reconcile.go:151`). → only `box new`/`box set`/`box add-candy`/`box rm-candy`/`box write`/`box reconcile`, `candy set`/`candy add-<fmt>`/`candy params`, `config setup`, `deploy adopt`, `udev install`, `vm clone`/`vm import`/`vm import-container-disk` and `migrate` write authored files, and each prints what it changed (D-CLI-2, DESIGN §22) | 8.3's one-shot conversion (config writes to state-root records); the print contract on the 16 commands |

## 9. Repositories (§24, decision 1.1)

| # | Item |
|---|---|
| 9.1 | **RULED 2026-11-12 — the rulebook wins, and the item retires.** The operator ruled that `AGENTS.md` Part I, "Repo classes and naming", outranks this work list: `layer-*`, `pod-*`, `distro-*`, `vm-*`, `plugin-*`, `charly-<distro>` and `pkg-*` are the canonical class prefixes ("a repo that does not fit its class is a defect to fix, not a convention to tolerate"), and a product family is a `layer-<family>` repo. The archive plan is therefore **withdrawn, not deferred** — the repos it named are exactly the class-canonical set: 383 across its seven prefixes, of which 257 are the five unqualified ones and 126 are the qualified pair (`plugin-*` 120, `charly-<distro>` 6). §12.4 counts every one of them and carries the command. What remains is consolidation only, "merge the concept repos that duplicate each other", and that scope measures empty: no candy name has two homes in either class this item names, and the "decided candy-family and plugin-concept repository" list it was waiting on (§1's `1.1`) is recorded nowhere in the org. The census of the set the ruling withdraws, and the surviving-scope count with its commands, are §12.4. |
| 9.2 | Update the umbrella: submodules, the pin contract (the OS repository set), `task map`, `org-map`, the README tables, and the `AGENTS.md` dispatcher. **Unblocked 2026-11-12** — its blocker was `9.1`'s decision and the ruling cleared it, so this item now reads: with no repository archived and none created, the submodule and pin-contract halves carry no change from `9.1`, and what is left is the umbrella's own map surfaces (`task map`, `org-map`, the README org-map tables) and the `AGENTS.md` dispatcher, brought to the class-canonical repository set, with `marketplace` first (§12.1). |

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
several rows did not survive contact, and section 12.6 lists every contradiction.

**Amended 2026-11-12 by the `9.1` ruling.** The operator ruled that Part I's "Repo classes and
naming" outranks this work list, so `9.1` leaves `DECISION` for `DONE` — **by ruling, not by a
measurement's verdict** — and `9.2`, whose only blocker was that decision, becomes schedulable.
`87` is still the number of rows, and every count below is re-derived from them.

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

**The table below is the 2026-11-12 snapshot this classification was measured against.** The current
status table is the one in `## Status` (146 items after the 2026-11-13 re-derivation); the 39 rows
that pass added and the four it restored are outside this schedule and are listed in the "Rows this
pass added and restored" block. The census that follows therefore still counts the 87 rows,
unchanged.

**Census.** Counted from the rows themselves — `grep -c '^| CHAIN |' TODO.md` = 81,
`grep -c '^| DECISION |' TODO.md` = 1, `grep -c '^| MOVED |' TODO.md` = 2,
`grep -c '^| DONE |' TODO.md` = 3, `grep -c '^| LIVE-CLAIM |' TODO.md` = 0,
`grep -c '^| SINGLE |' TODO.md` = 0, total 87. The two zeros carry a live word in the same grep
shape — the identical command returns 81 for `CHAIN` — so they are the tree's, not the grep's.

| bucket | count | what it means here |
|---|---|---|
| `CHAIN` | 81 | needs an ordered producer-first sequence; the legs and the forcing edge are named per row |
| `DECISION` | 1 | an operator call, not work; the question and the options with their costs are named |
| `MOVED` | 2 | the premise no longer resolves at the tip; the change and the proof are named |
| `DONE-ALREADY` | 3 | the tree already satisfies it, or an operator ruling retired it; the proof is named |
| `LIVE-CLAIM` | 0 | no open PR or issue claims any of the 87 scopes |
| `SINGLE` | 0 | the smallest surviving unit is two repositories |
| **total** | **87** | 81 + 1 + 2 + 3 matches the 87 rows `## Status` carried as open before this classification; five of them leave `open` (three `DONE`, two `MOVED`), so 82 remain open — held by the 81 chains and the one remaining `DECISION`, `0.3` |

**Status reconciliation.** The three DONE and the two MOVED items leave `open`; the one remaining
DECISION (`0.3`) stays `open` because an unanswered call is still open work. `9.1` joined the DONE
set by the operator's ruling recorded in §9 and §12.4, not by a measurement's verdict. `## Status`
is updated in the same change, and every row is re-summed, never re-typed.

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
| 9. Repositories | 2 | 1 | 1 | 0 |
| 10. Documentation | 3 | 0 | 2 | 1 |
| 11. Final proof | 2 | 0 | 2 | 0 |
| 12. OCE alignment | 15 | 3 | 7 | 5 |
| **Total** | **107** | **10** | **82** | **15** |

items `4+2+16+33+4+11+9+3+3+2+3+2+15 = 107`, done `2+1+1+1+0+0+0+1+0+1+0+0+3 = 10`, open `1+0+12+31+4+11+8+2+1+1+2+2+7 = 82`, moved `1+1+3+1+0+0+1+0+2+0+1+0+5 = 15`, and `10 + 82 + 15 = 107`. Re-summed from the table's own rows, never typed —
`awk -F'|' '/^## Status/{f=1} /^The Decisions row/{f=0} f && NF==7 && $2 !~ /section/ && $2 !~ /---/ && $2 !~ /Total/ {i+=$3; d+=$4; o+=$5; m+=$6} END {printf "items %d done %d open %d moved %d\n", i,d,o,m}' TODO.md`
→ `items 107 done 10 open 82 moved 15`.

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
item's scope, so no item is blocked by a claim. They do constrain concurrency (section 12.5): they hold
`sdk` and `charly`, so a chain whose next leg is one of those repositories waits on that
repository's window, not on a claim.


### 12.1 CHAIN — 81 items

| bucket | n | item | producer-first legs | forcing edge | measured anchor |
|---|---|---|---|---|---|
| CHAIN | 4 | 2.1 | spec > sdk > charly > plugin repositories | charly cannot compose a plugin CUE module before sdk can fetch and type it | gs spec `^#[A-Za-z]+Value:` = 9 defs (12 before unit 1, 11 before unit 2, 10 before unit 3); 11 kind bodies still in `spec/schema` over this file's 14-name list; units 1–3 (`pipeline`, `task`, `pod`) landed — evidence in `## Status`; the remaining eight and their order: opencharly/spec#304 |
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
| CHAIN | 2 | 3.4 | charly > plugin-example-bootstrap | the bootstrap phase has exactly one consumer, and deleting it is that consumer's removal | gs sdk DefaultSystemConfigPath = 3 (loaderkit/config_stack.go); gs charly config_stack in `*.go` = 0 |
| CHAIN | 2 | 3.5 | sdk > plugin repositories | the generic table must exist before the typed views can leave | gs spec UnifiedFile = 178 |
| CHAIN | 3 | 3.6 | spec > sdk > charly | the keyless node is a schema rule before a loader rule | gs spec "candy" = 17 |
| CHAIN | 3 | 3.7 | spec > sdk > charly | every composition key collapses into require: in the schema | gs spec add_candy = 83 |
| CHAIN | 3 | 3.8 | spec > sdk > charly | the reference grammar is parsed by the contract module | gs spec ParseRemoteRef = 20 |
| CHAIN | 3 | 3.9 | spec > sdk > charly | the import entry shape is schema before resolution | gs spec `alias?:` = 6; `import?:` = 1; `#Import` = 0 |
| CHAIN | 3 | 3.10 | spec > sdk > charly | each kind's nesting definition is schema before the core sets die | evidence doc PROGRAM/nested-deploy-members.md PRESENT at `charly` origin/main (blob dc64e8a6fcf4, 292 lines) and absent only from the umbrella tree; gs spec `nested?:` = 3 (node.cue:138, seam.cue:651, status.cue:62) |
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
| CHAIN | 4 | 5.4 | charly > plugin repositories > spec > umbrella | each seam moves to its owning plugin, then OS/init data becomes repository data | gs charly HostBuild = 381; embedded `charly/charly.yml` = 2,216 lines (the repo-root `charly.yml` is 5,340) |
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
| CHAIN | 2 | 9.2 | marketplace > umbrella | the map must exist before the umbrella points at it — and the one blocker this row carried, `9.1`'s decision, cleared on 2026-11-12, so the chain is now schedulable | gs marketplace org-map = 6; the verb is the umbrella's own task — `git show origin/main:charly.yml \| grep -c '^org-map:'` = 1 — and charly's 2 `org-map` hits are both `CHANGELOG/` history (`git -C charly grep -l -F 'org-map' origin/main` → `CHANGELOG/2026.280.1631.md`, `CHANGELOG/2026.307.1232.md`), which is why this cell no longer claims a charly task count (section 12.6 item 13) |
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

**Anchors are dated.** The column above is the 2026-11-12 measurement unless the row's own
current-state cell was rewritten by the 2026-11-13 pass, in which case the CELL is the record — it
carries its own command and date — and the two disagree wherever a figure moved: `2.3` (402, 2,825 and
76 in `*.cue`, not 486, 2,859 and 82), `2.14` (139 `vm:` lines, not 112), `2.15` (300 and 419, not 248
and 385), `3.4` (the `/etc` layer is an `sdk/loaderkit` READER; `charly` holds 0 in `*.go`), `3.10`
(the evidence document EXISTS), `5.4` (the embedded `charly/charly.yml` is 2,216 lines, not the 5,339
of the repo-root file), `6.8` (221 refs-map entries, not 195), `7.3` (15,568 per-ref directories, not "about 11k"),
`2.16` (`close(` 48 all files and 28 in `*.cue`; `#CandyValue` is 8 top-level defs in `*.cue` and
27 all files, because the CHANGELOGs cite it).
The drift has one mechanism and it is not the tree: `gs <repo> <text>` counts every file, and `spec`'s
own `CHANGELOG/` prose quotes schema symbols, so an all-files symbol count rises without the schema
moving (`#CandyValue` 12 → 27 all files while `spec/schema/*.cue` keeps 8). Schema claims in the
rewritten cells are therefore path-scoped (`-- '*.cue'`) and say so.

### 12.2 DECISION — 1 item

| bucket | item | the question | options and their costs |
|---|---|---|---|
| DECISION | 0.3 | Run the schema-first-parse RDD spike before `3.1` starts, or waive it against `D-LOAD-5`, which `DESIGN.md` already records? | **(a) Run it** — one disposable bed plus a design record; it can invalidate `3.1` before that chain spends a spec PR, and it is the class of spike RDD exists for (a high-risk assumption where being wrong invalidates the plan). **(b) Waive it** — zero cost now; `3.1` then rests on a classifier whose ambiguity is unproven, the one risk the row exists to retire. The measurement that makes this a real question: `gs spec schema-first = 0` with control `gs sdk DeploySubstrates = 94` — no spike record exists, and the parse it would judge has not been rewritten. |

`9.1` was the second `DECISION` and the operator has answered it — option **(a), the rulebook wins**.
Its row is in §12.4, because the answer retires the item rather than scheduling it.

### 12.3 MOVED — 2 items

| bucket | item | what changed | proof |
|---|---|---|---|
| MOVED | 12.11 | The host method the row names no longer exists; deployment state is per-deployment YAML written by `SaveDeployState`, not a key/value `state_put`. The *target* (a transactional commit plus an audit append) is **not** met — the row cannot be executed as written, so it retires and its target needs a new item. | `gs spec state_put = 0`, `gs sdk state_put = 0`, `gs charly state_put = 0`, with control `gs sdk SaveDeployState = 49`; the writer is `sdk/deploykit/deploy_state.go:469`. **Successor:** one item for a transactional state commit plus `audit_append`, in `sdk` then `charly`. |
| MOVED | 12.13 | "`TODO.md` has no status column, so 'is it done?' is unanswerable" is false: this file has carried a `## Status` table since 2026-11-08, derived at umbrella `6f6df4dc40364a62c4e0b7bd17003851bfdbca3e`, and that table is the record the row asked for. The registry half (`specs/{rfcs,plans,archive}`) is untouched. | The `## Status` section at the top of this file, whose own head names the derivation commit; `git cat-file -t 6f6df4dc…` → `commit`. **Successor:** one umbrella-only SINGLE — create `specs/{rfcs,plans,archive}` and point the Status note at it — the one genuine SINGLE this round found. |

### 12.4 DONE-ALREADY — 3 items

| bucket | item | proof |
|---|---|---|
| DONE | 0.1 | The item asks that inventories be taken from fetched `origin/main`, never from lagging checkouts. That question is now a verb: `gs charly MODE=currency = 34` (the pin verb's currency mode), and the pins the umbrella publishes today ARE the tips — `git ls-tree origin/main -- spec` → `721eac74d13b…` equals `git -C spec log -1 --format=%h origin/main` → `721eac7`. The row's own census drifted with it: 424 checkouts claimed, 409 declared by `.gitmodules`. |
| DONE | 1 | The section's "still open" row counts the operator's decided block, but the block is a ledger of decisions already recorded: `git show origin/main:DESIGN.cue \| grep -c -E 'D-\|#Decision'` → 121, and `DESIGN.md` carries `step:` 48 times, `harness` 26, `os_override` 6. The only open question in the section, `1.1`, is already `moved`. Counting a decided ledger as `open 1` is what section 12.6 item 1 reports. |
| DONE | 9.1 | **Done by operator ruling, not by a measurement's verdict.** On 2026-11-12 the operator ruled that `AGENTS.md` Part I, "Repo classes and naming", outranks this work list: the `layer-*`/`pod-*`/`distro-*`/`vm-*`/`plugin-*`/`charly-<distro>`/`pkg-*` prefixes are canonical, so option **(a) of the question this row used to ask is the answer**, the archive plan is **withdrawn** (not deferred), and the repos it named are the class-canonical set. What survived was consolidation only, and that measures empty: no candy name has two homes in either class the item names, and the "decided candy-family and plugin-concept repository" list it was waiting on exists in no document (§1's `1.1` — the only candidate — is `moved`). Nothing was archived, and nothing needed to be. The withdrawn set, counted from `.gitmodules` at `origin/main`, and the surviving-scope census, each with its command and a live-word control, are in the fence below. |

**`9.1`'s measurements — the withdrawn set, and the surviving scope that measures empty.**

The set the ruling withdraws is the item's own archive list. The item names **seven** prefixes —
`layer-*`, `pod-*`, `distro-*`, `vm-*`, the superseded `plugin-*`, `charly-<distro>` and `pkg-*` —
and the census counts every one of them from the umbrella's `.gitmodules` at `origin/main`:
**383 repos**, of which **257** are the five UNQUALIFIED prefixes. So `257` is a subtotal and never
"the item's archive list": the other 126 are `plugin-*` (120 — the item qualifies these as "the
superseded" ones, a subset no measurement defines, so the whole class is counted) and
`charly-<distro>` (6 of the 10 `charly-*` repos, the ones whose suffix names an OS). The `.gitmodules`
path total is the denominator.

```
$ git show origin/main:.gitmodules | awk -F' = ' '
  $1 ~ /path/ { p=$2
    if      (p ~ /^layer-/)                                              n["layer-*"]++
    else if (p ~ /^pod-/)                                                n["pod-*"]++
    else if (p ~ /^distro-/)                                             n["distro-*"]++
    else if (p ~ /^vm-/)                                                 n["vm-*"]++
    else if (p ~ /^pkg-/)                                                n["pkg-*"]++
    else if (p ~ /^plugin-/)                                             n["plugin-*"]++
    else if (p ~ /^charly-(alpine|arch|debian|fedora|openwrt|ubuntu)$/)   n["charly-<distro>"]++
  }
  END { split("layer-* pod-* distro-* vm-* pkg-* plugin-* charly-<distro>", o, " ")
        for (i=1;i<=7;i++) { printf "%-17s %3d\n", o[i], n[o[i]]+0; t+=n[o[i]] }
        for (i=1;i<=5;i++) f+=n[o[i]]
        printf "%-17s %3d   (the five unqualified prefixes)\n", "  of which", f
        printf "%-17s %3d\n", "TOTAL named set", t }'
layer-*           174
pod-*              72
distro-*            6
vm-*                2
pkg-*               3
plugin-*          120
charly-<distro>     6
  of which        257   (the five unqualified prefixes)
TOTAL named set   383

$ git show origin/main:.gitmodules | grep -cP '^\tpath = '
409
```

The list the item waited on — "the exact repository list (candy families, plugin concepts)" — is
absent from the whole org, not merely from this file. The sweep covers every submodule at
`origin/main` (`409` repos scanned), and its control proves the same predicate finds a phrase that IS
there:

```
$ for r in $(git show origin/main:.gitmodules | awk -F' = ' '$1 ~ /path/ {print $2}'); do [ -e "$r/.git" ] || continue; git -C "$r" grep -l -i -E 'candy-family|plugin-concept' origin/main 2>/dev/null; done | wc -l
0
$ for r in $(git show origin/main:.gitmodules | awk -F' = ' '$1 ~ /path/ {print $2}'); do [ -e "$r/.git" ] || continue; git -C "$r" grep -l -i -E 'candy-family|plugin-concept|product family' origin/main 2>/dev/null; done | wc -l
9
```

The surviving scope is consolidation — D-REPO-1's "candies of one family share a repository" and
"one concept's plugin code lives in one repository". Both already hold: no candy name has two homes
in the `layer-` class (164 candy nodes across 158 of the 174 `layer-*` repos, 0 duplicate names) nor
in the `plugin-` class (122 `candy/` directories across 119 of the 120 `plugin-*` repos, 0 duplicate
names). The guard `[ -e "$r/.git" ] || continue` is part of the instrument: without it, an
unmaterialized tree makes `git -C <path>` walk up to the superproject and read the umbrella's own
`charly.yml` once per path, which is how the first run of this census returned a meaningless
`174` — the empty control exposed it. Run these from the materialized root checkout:

```
$ for r in $(git show origin/main:.gitmodules | awk -F' = ' '$1 ~ /path/ {print $2}' | grep '^layer-'); do [ -e "$r/.git" ] || continue; git -C "$r" show origin/main:charly.yml 2>/dev/null | awk -v r="$r" '/^[A-Za-z0-9_.-]+:$/{k=$1} /^    candy:$/{print substr(k,1,length(k)-1)"\t"r}'; done | awk -F'\t' '{n[$1]++; rp[$1]=rp[$1]" "$2; seen[$2]=1; tot++} END {d=0; for (c in n) if (n[c]>1) d++; for (x in seen) nr++; printf "candy nodes %d in %d repos; duplicate names %d; control gh ->%s\n", tot, nr, d, rp["gh"]}'
candy nodes 164 in 158 repos; duplicate names 0; control gh -> layer-gh

$ for r in $(git show origin/main:.gitmodules | awk -F' = ' '$1 ~ /path/ {print $2}' | grep '^plugin-'); do [ -e "$r/.git" ] || continue; git -C "$r" ls-tree origin/main --name-only candy/ 2>/dev/null | sed 's|candy/||' | awk -v r="$r" 'NF{print $0"\t"r}'; done | awk -F'\t' '{n[$1]++; rp[$1]=rp[$1]" "$2; seen[$2]=1; tot++} END {d=0; for (c in n) if (n[c]>1) d++; for (x in seen) nr++; printf "candy dirs %d in %d repos; duplicate names %d; control plugin-dsh ->%s\n", tot, nr, d, rp["plugin-dsh"]}'
candy dirs 122 in 119 repos; duplicate names 0; control plugin-dsh -> plugin-dsh

$ cd .worktrees/todo-91-ruling/opencharly   # this round's session worktree: no submodule materialized
$ for r in $(git show origin/main:.gitmodules | awk -F' = ' '$1 ~ /path/ {print $2}' | grep '^layer-'); do [ -e "$r/.git" ] || continue; git -C "$r" show origin/main:charly.yml 2>/dev/null | awk -v r="$r" '/^[A-Za-z0-9_.-]+:$/{k=$1} /^    candy:$/{print substr(k,1,length(k)-1)"\t"r}'; done | awk -F'\t' '{tot++} END {printf "candy nodes %d (guard held)\n", tot+0}'
candy nodes 0 (guard held)
```

The control is the load-bearing half of both zeros: the same run prints the repo it found for
`gh` and for `plugin-dsh`, so a run that read nothing cannot be mistaken for a class with no
duplicates — as the unmaterialized third run shows, where the count collapses to 0.


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
   (`#945`) is the whole census — 382 violations before `plugin-pipeline#60`, 357 after — and `2.1`
   retires only its `dup` rows (19 over 9 definition names before, 7 over 3 after), not the whole
   set; not one can be retired until the schemas compose by import. `2.1`'s chain is 13 units, not
   the four legs in section 12.1's table: unit 0 is a `charly` host-gate change
   (`validateKindValueCUE` reads `spec.KindValueDefs` plus a base-only schema while a plugin
   definition lands in `pluginSchemas.unified`), and the full table is at `opencharly/spec#304`.
   `2.1` also gates `4.1` (one generator over plugin modules), `2.3` (generated
   types) and `2.16` (schema patterns). No other chain may claim the `spec` window first.
   **Unit 1 of 11 landed 2026-11-12** — the `pipeline` body is `plugin-pipeline`'s now (seven PRs in
   four repos plus the pin wave `#996`; the evidence is in `## Status`). The next `spec` window `2.1`
   needs is unit 2, `task`, which must add `InputDef: "#TaskValue"` in the same change and must teach
   `charly/kind_value_corpus_sweep_test.go`; `opencharly/spec#304` carries the rest of the order.
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
`9.1` was the other decision, and it is answered: the operator ruled on 2026-11-12 that the rulebook
wins, which retires the item and releases `9.2` from this wave. `9.2` is now a schedulable two-leg
chain whose first leg is `marketplace` — the same window `10.2` needs, so those two share it rather
than run beside it.

**Wave 5 — the terminal aggregations.** `11.1` and `11.2` land last; `11.2` deletes this file.

**Do not attempt concurrently.** Any two chains whose first leg is `spec`. `2.1` with `2.3` or
`2.16` (same schema surface). `7.3` with anything (its five phases each claim one cache, and the
phase boundary is the gate). `9.2` with `10.2` (one `marketplace` window); the order `9.2` before
`9.1`'s decision no longer exists, because the decision is answered. Any chain with a live pin wave
(the wave holds the umbrella index; run no other git command in that worktree).

**What unblocks what.** `2.1` → `#950`'s census + `4.1` + `2.3` + `2.16`. `4.4` → every plugin repo's
generation gate. `7.2` → `7.3`. `0.3` → `3.1` → `3.3`. `12.9` → the `D-CANDY-4` violation.
`12.11`'s successor → `12.12`. `9.1`'s decision → `9.2`, and it is answered (2026-11-12: the rulebook
wins, so `9.2` is unblocked and `9.1` itself retires). `3.14` → `12.8` and `12.15` (same plugin,
same venue knowledge).

### 12.6 What contradicts this file

Thirteen measurements disagreed with the prose above them when §12 was written. Eight are corrected in
the numbered rows by that change, and the rest are resolved as a retirement or a decision
(`1`, `12.11`, `12.13` retired; `9.1`, which was a DECISION, has since been retired by the operator's
ruling recorded in §12.4). Item 13 is the anchor this ruling's own round measured false and corrected
in place.

**Items 14–20 are this pass's own**, measured at the 2026-11-13 tips: four rows the record held as
answered are restored (14–18), one migration that contradicted the design is corrected (19), and one
contradiction inside `DESIGN.md` is named for the operator to rule on (20). Each is recorded here
because the next session's premise is whatever this file says, and a corrected figure that leaves no
trace invites the same mistake back.

1. **§1 counts a decided ledger as `open 1`.** The block is the operator's decision list, not work:
   `DESIGN.cue` carries 121 `D-` references and `DESIGN.md` carries every one of its terms.
2. **`2.3` says 442 `@go(…,type=…)` overrides and 103 `@go(-)` uses.** Measured 486 and 82 — the
   override count drifted 10% and the `@go(-)` count 21%. A first reading of this row compared its
   `type=` subset against ALL `@go(…)` calls, 2,859, and reported a 6.5× error that was the
   comparison's; the subset is 486, and the row now states it. **Re-measured 2026-11-13: 402 `type=`
   overrides and 76 `@go(-)` uses** — units 1–3 moved three kind bodies out of `spec`, and the row
   carries the new pair.
3. **`5.4` says charly embeds a 2,085-line `charly.yml`.** The 5,339-line reading this item used to
   report was the REPO-ROOT `charly/charly.yml`'s sibling (`charly.yml`), not the file `//go:embed`
   carries: measured 2026-11-13, the embedded `charly/charly.yml` is **2,216** lines and the repo-root
   one is 5,340, so the row's 2,085 named the right file and it had grown.
4. **`12.13` says "`TODO.md` has no status column".** This file has carried a `## Status` table
   since 2026-11-08.
5. **`9.1` ordered the archive of `layer-*`, `pod-*`, `distro-*`, `vm-*`, `pkg-*`.** Part I's "Repo
   classes and naming" makes those exact prefixes canonical, so the two documents could not both be
   law. **Resolved 2026-11-12 by the operator: the rulebook wins.** The archive plan is **withdrawn**
   rather than deferred; the prefixes stay, and `9.1` retires to `DONE` (§12.4) — a ruling, not a
   measurement's verdict.
6. **`2.13` lists `agent-team` and the `pod` template form as unused kinds.** Measured 0 occurrences
   of either: two of its bullets are already gone, so the item is smaller than it reads.
7. **`2.14` counts 109 `vm:` templates.** Measured 112 across the six distro repos
   (6 + 39 + 3 + 8 + 48 + 8). **Re-measured 2026-11-13: 139** (7 + 51 + 3 + 9 + 60 + 9).
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
    on the five domain directories rather than on the count. **Re-measured 2026-11-13: 348
    alias-carrying lines** (the 64 `type X = ` definitions are unchanged).
13. **`9.2`'s anchor cited a `charly` task count that `charly` does not carry.** The cell read
    `gs charly 'task org-map' = 2`; measured `gs charly 'task org-map' = 0`, and the 2 belongs to
    `gs charly 'org-map'` — whose only hits are `CHANGELOG/2026.280.1631.md` and
    `CHANGELOG/2026.307.1232.md`, i.e. history. `org-map` is the UMBRELLA's own `task:` entity
    (`git show origin/main:charly.yml | grep -c '^org-map:'` = 1, with the live-word control
    `gs marketplace org-map` = 6), so the cell now names the umbrella's declaration instead of a
    `charly` count.

14. **`3.10` says its evidence document is "retired from `origin/main`".** It is not: `charly`'s
    `origin/main` carries `PROGRAM/nested-deploy-members.md` (blob
    `dc64e8a6fcf4053bf56114f372e00eca57c5c56b`, 292 lines, `charly` #748/#757), and only the
    UMBRELLA's tree lacks it — the earlier reading measured the umbrella. The row and the CHAIN table's anchor
    (section 12.1) are corrected in place.
15. **`2.2` was retired because "the duplication is gone".** Measured at the tips it is live: 113 of
    119 plugin schema modules are self-contained and carry plugin-private copies of the matcher
    shapes. Only the package half of the note held (`spec` has no `envelope`). The row is restored,
    with its target re-pointed at the contract module's own `schema` package.
16. **`8.1` was retired on three withdrawn renames.** The withdrawal stands and is folded into the
    row; the retirement does not — every duplicated and kind-specific command word is still declared
    at the tips. Restored.
17. **`10.3` was retired as "the document no longer exists"** — false, by item 14's measurement.
    Restored; its instruction (rewrite it as completed by §17.2, or retire it once `3.10` lands) is
    live.
18. **`12.4` was retired on a `DESIGN.cue` fact.** `#ManagerPackage`, `#ActionPackage`, `#PackageMap`
    and `#PackageSet` are 0 in `spec`'s CUE, so the shipped schema still cannot express a manager
    install's attributes. Restored as a design-only answer.
19. **`3.32` migrates `context: [build]` to `phase: build` and `context: [runtime]` to
    `phase: runtime`** — a different phase vocabulary from DESIGN §16.5's `artifact` / `ready` /
    `deployment`, which `13.7` and D-VERB-7 use. The row's migration now reads `artifact` and
    `deployment`; landing the old mapping would satisfy the row and violate D-DEP-8.
20. **`D-CLI-2`'s allowed-writer list names commands DESIGN §22's group table does not carry**
    (`config setup`, `candy set`/`add-<fmt>`/`params`, `vm clone`/`import`/`import-container-disk`,
    `udev install`), and `8.1` withdraws three of those renames. One of the two texts must be
    corrected before `8.4` can land. It is a DESIGN.md fix, filed as opencharly/opencharly#1007 and
    recorded here because this file does not edit the normative document.

### 12.7 Rulebook compliance

*This section records the change that wrote sections 12.0–12.6 (opencharly/opencharly#992). The round that
recorded the `9.1` ruling carries its own R0–R10 record in its PR body, and the fence below is that
earlier run, not this one's.*

- **R0 — skills first.** HOW: `/charly-internals:git-workflow` was loaded before the first git
  action (it is the dispatcher row for branch/commit/push/PR), and the measurement commands were
  read-only `git grep` at a fetched ref. No submodule checkout was edited.
- **R1 — RCA every anomaly, then fix it or file it.** HOW: three anomalies, each root-caused and
  fixed before the affected number was used, and all twelve contradictions of section 12.6 resolved in this
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
  validator's first round then found a fourth defect this bullet had not: section 12.6 item 2 compared
  `2.3`'s `type=` subset against ALL `@go(…)` calls and reported a 6.5× error that was the
  comparison's; the subset is 486, the row is corrected in place, and the correction is recorded in
  section 12.6 rather than dropped.
- **R2 — no duplication.** HOW: one schedule, one row per item, one canonical statement of each
  number. The section 12.6 contradiction list points at the rows rather than restating their measurements.
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

### Rows this pass added and restored — outside this schedule

**The 39 rows added on 2026-11-13 and the four restored ones are not classified above.** This
schedule's census counts the 87 rows that were `open` at the 2026-11-12 base (section 12.0); everything below
was written after it, at the tips, and each new row's `Code work` cell already names its producer-first
order — the one rule this schedule enforces. They enter the next classification pass as a set.

| bucket | what | rows |
|---|---|---|
| CHAIN | a schema or IR definition, then the plugin that reads it, then the umbrella's pin | 2.17–2.26, 3.34–3.43, 4.5, 4.6, 5.12, 5.13, 13.1–13.7 |
| CHAIN | one host method and its command, then the mutating plugins' call sites | 7.4, 7.5, 7.6, 8.4 |
| CHAIN | one gate over the three repositories, then each plugin repository | 14.1–14.4 |
| unclassified | restored by this pass; bucket not yet assigned | 2.2 (`spec` > plugin schemas), 8.1 (`charly` + docs and skills), 10.3 (`charly` doc > umbrella), 12.4 (`spec` > `sdk`/`charly`) |

> Rows added by the OCE-alignment change. Each closes one gap between today's code and the amended
> `DESIGN.md`, in the dependency order of this file: the spec-layer rows land first because their defect
> exists without OCE. Each row carries its own current-state evidence.

| # | Item |
|---|---|
| 12.1 | **§2.** *Current:* one word, two concepts: `agent` is an evaluator CLI (the kind table's `agent` row) while OCE's Agent is a workload *Target:* `harness` = the evaluator; `agent` = the managed workload *Migration:* every `agent:` kind node → `harness:`; every `need: {agent: …}` → `harness:`; the `agent-check`/`agent-run` **step keywords** → `harness-check`/`harness-run` *Code:* the rename in `_otherKind`, `#Need`, `#StepAlt`; `#InnerOfMachineAlt` gains `agent`; §12.4's prose; §3.1's row; §23's command list |
| 12.2 | **Answered on the design surface; `#Namespace` is also in `spec`'s CUE (16 sites).** **§2/§18.** *Current:* `namespace` carries **four** names in the normative text (`namespace`, `alias`, `import alias`, `import namespace`) across §2's `namespace` row, `D-NAME-1`, `D-VAL-4` and `D-REF-4` and two machine-compared messages; and the namespace set is unguarded against kind words and directives *Target:* **one** term, `namespace`, **defined as a named scope**; the phrase ban in §2's `Not` cell; the reserved-name scalar `#Namespace` *Migration:* none *Code:* the sweep of §10's closing paragraph — and the `rules.cue` messages and the `# expect:` texts change together, or check 3 fails |
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

## 13. Deployments, drivers, venues and captures (§17)

| # | Current state (evidence) | Target | Config migration | Code work |
|---|---|---|---|---|
| 13.1 | `#Deploy` carries `add_candy?: [...#CandyRef]` (`spec/schema/deploy.cue:204`), so a `pod`, `vm` or `kubernetes` deployment composes authored content on top of its box today, and no per-kind `content` row exists to refuse it (`_deploymentKind` = 0; control `add_candy` = 76). | A `pod`, `vm` or `kubernetes` deployment takes no `require:`; content comes from the box, or from an inner `local` node applied to the running venue (D-DEP-2, DESIGN §17.1). | none | The `_deploymentKind` `content` row and the kind validators; 3.7's `add_candy:` to `require:` migration is conditioned on that row (a `local`/`android` deployment admits it, the box-backed kinds do not). |
| 13.2 | No `publish:` field exists in the schema (`publish` matches only comments and the msix `publisher?:` in `spec/schema/candy.cue:213`); port publication is the deploy `port?:` field (3 sites in `spec/schema/deploy.cue`) that 2.13 lists as unused and 2.14 re-homes, and `sizing` appears once in `spec` (control `network` = 234), not as a §8 need. | Publishing belongs to `pod` and `vm` only; sizing and networks are needs of any deployment (D-DEP-7, DESIGN §17.1, §8). | `port:`/`route:` publication to `publish:` on `pod`/`vm`; a `resource:`/network field to `need: {...}` | The `publish:` field on the two box-backed kinds only; the sizing/network need types in the §8 solver (3.12). |
| 13.3 | No driver table: `#Driver` = 0 and `_subsystem` = 0 in `spec/schema` (controls: `driver` = 98, `subsystem` = 12), the only `_driver` is the VM video driver (`spec/schema/vm.cue:1145`), and the user configuration has no `driver:` section — the container engine, hypervisor, cluster tool, agent runtime and secret backend are still expressed by plugin/substrate words in authored documents, and the form a deployment consumes is a code branch, not a row. | Every subsystem takes its driver from the user configuration: one word among that subsystem's rows of the `_driver` table, exactly one row `default` per subsystem; no authored document names a driver; a driver row declares the forms, venues, captures, isolation and lease it gives, and the form a deployment consumes is the one its driver row declares (D-DRV-1..3, D-FORM-3, DESIGN §17.6, §14.2). | `engine:`/`backend:`/`container_engine:`-style selectors and any authored driver name to the user configuration's `driver:` section | The `_driver` table (one row per subsystem), the `#Driver` user-config type, and the kind methods reading the row instead of branching on a driver word (producer-first `spec`, then `sdk`/core, then each kind plugin). |
| 13.4 | No venue-access declaration: `#VenueFields` = 0, `#VenueAlt` = 0 and `venue_exec` = 0 in `spec` (control `venue` = 908); the only venue word set is `_venue: {container, ssh, shell, parent, kubevirt, none}` (`spec/schema/deploy.cue:1047`), which differs from DESIGN §17.7's `container`/`ssh`/`shell`/`kvm`/`adb`/`kube`. An access a venue lacks is not refused by name today. | A venue declares the accesses it serves (`#VenueFields`: exec, copy, log, console, display, forward, power); an access it lacks is refused naming the venue, never emulated, and a step that needs it is a load error (D-VENUE-2, DESIGN §17.7). | none | `#VenueFields` on the venue table (read from the driver row 13.3), the refusal at the dispatch site, and the load-time check against the step's verb (3.39). |
| 13.5 | Capture exists only as a field (`capture?:` = 2, `snapshot?:` = 18 in `spec`); the process scope is absent (`capture: process` = 0, control `process` = 719), so a capture always takes the filesystem and never the running processes, regardless of what the kind's driver row could checkpoint. | A capture takes the filesystem, or with `capture: process` also the running processes, where the kind's driver row declares process capture (D-CAPTURE-4, DESIGN §17.3); a rootful container engine or a microVM checkpointing in its own guest is a driver-row value. | none | The `capture: process` scope on the capture field plus the driver-row capture scopes it reads (13.3); 3.24 is the filesystem half. |
| 13.6 | No `restore`: no repository declares `command:restore` (census over `plugin-*`/`charly`/`marketplace` = 0; control `command:restart` = 1), and the only way back to a known state is the `from: <deployment>:<snapshot>` colon grammar 3.24 deletes. | `restore` returns a deployment to a capture it took, in place and under its lock — filesystem, and processes when the capture holds them; it is the one way back to a known state (D-CAPTURE-5, DESIGN §22); a `kubernetes` deployment captures and restores its cluster state. | `from: <deployment>:<snapshot>` to `restore` against a capture box (3.24) | The `restore` command plus its argument definition (4.3) and the kind's restore method, under the deployment lock (5.9). |
| 13.7 | No check-phase word set exists: the only `_phase` table is the instrument's `build`/`live`/`update`/`teardown` (`spec/schema/instrument.cue:149`), where a check carries a phase it is an untyped `phase?: string` (`spec/schema/deploy.cue:478`), `_verbPhase` = 0 and `validatePhase` = 0 (control `phase?:` = 7) — so a deployment's checks are not distinguishable from artifact checks, and no verb declares the phases it can observe. | A deployment's checks are deployment checks (§16.5): the phase word set is `artifact`, `ready`, `deployment`, derived from what the check's verb can observe; only a check has a phase, and a phase the verb cannot observe is a load error (D-DEP-8, D-VERB-7, DESIGN §16.5, §23). | `context: build/runtime` to the §16.5 phase words (3.32 carries the corrected mapping) | The phase word set plus the derivation and the load-time refusal, and the per-verb phase declaration; the instrument's `build/live/update/teardown` phase stays a separate concept under its own name. |

## 14. Code rules and enforcement (§25)

| # | Current state (evidence) | Target | Code work |
|---|---|---|---|
| 14.1 | D-LAW-5 is not enforced and is violated at the tip: `time.Sleep` = 20 in `charly`, 7 in `sdk`, 15 in `spec`; `nolint` = 61/58/31; no `forbidigo` configuration (0/0/0) and no gate script matching a sleep or a `forbidigo` rule (the grep over `scripts/*.mjs`/`*.sh` returns nothing). | No `sleep` outside the sdk readiness waits, no retry loop, no suppressed error, and a gate enforces it (D-CODE-1, D-LAW-5, DESIGN §25). | The gate (a `forbidigo`/AST rule over the three repos) plus the readiness-wait allowlist; delete the sleeps outside it. |
| 14.2 | A replaced mechanism is not deleted in the change that replaces it, and nothing enforces the rule: `compat` = 69 in `charly`, 76 in `sdk`, 84 in `spec`; `legacy` = 292/208/170; `Deprecated` = 43 in `spec`. No `scripts/check-*` gate names either word. | A replaced mechanism is deleted in the change that replaces it; no compatibility file remains (D-CODE-2, DESIGN §25) — enforced by a gate, not by prose. | The gate (a retired-name/`Deprecated`-marker scan with a committed key set, the shape `scripts/check-retired-claims.mjs` already has) plus the deletions it names. |
| 14.3 | Comments describe history instead of present code: `DELETED` = 254 in `charly`, 95 in `sdk`, 131 in `spec`; `former` = 379/260/326; `was deleted` = 34/23/19 (all measured at the tips), while `CHANGELOG/` is the record the requirement names. | Comments describe present code; history goes to `CHANGELOG/` (D-CODE-4, DESIGN §25), enforced by a review gate rather than by prose. | The gate (a comment-history marker scan, the same committed-key shape as 14.2) plus the sweep of the three repositories. |
| 14.4 | Live boundaries are not gated: visible skips exist (`t.Skip` = 52 in `charly`, 51 in `sdk`, 18 in `spec`), but a mock census reads 97/84/24 across the same repositories and no gate script names the live-boundary rule — so "tested against the real service or skipped visibly" is a convention, not a proven property. | Live boundaries are tested against the real service or skipped visibly (D-CODE-5, DESIGN §25), with the skip visible in the run's output and the mock boundary owned by the gate. | The gate (mock detection over the live-boundary paths plus the visible-skip report) and the allowlist for genuine unit-level test doubles. |
