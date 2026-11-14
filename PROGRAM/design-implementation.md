# The design programme — the agent-team ledger

> **What this is.** The operating ledger for implementing `DESIGN.md` through `TODO.md`'s work list with an
> agent team: who does what, in which order, on which lane, proven by which gate — and the state of every
> package. It is written for the **Lead** who runs the programme and for the teammate who picks up a package
> cold. **State: `planned`. Nothing is implemented and no agent has been spawned.** Every package below is
> `planned`, and the registers carry no in-flight entries. The first move is §0's three steps.
>
> `DESIGN.md` is normative, `DESIGN.cue` is the single schema copy, `TODO.md` is the work list (146 items,
> 125 open at 2026-11-13; its `## Status` is the item record). This ledger adds no requirement and restates
> none: it assigns, orders and records. It is not a rulebook (`AGENTS.md` R0–R10 and the owning skills own the
> rules) and not a calendar (the waves are dependency order, not dates).

## 0. State, and how a later session resumes cold

| field | value |
|---|---|
| programme state | `planned` — goal armed 2026-11-13; no package started |
| agents spawned | 0 |
| round budget | 600 rounds, sized to the work (44 packages, roughly 150 PR legs across the five lanes, about four rounds each); the operator is asked at 80% |
| packages | 44 (`P00`–`P43`) in 10 waves |
| work items | 125 open `TODO.md` rows, each assigned to exactly one package (§5) |
| tracker | opencharly/opencharly#1005 (the programme); opencharly/opencharly#594 (the `TODO.md` re-derivation); opencharly/spec#304 (`P01`) |
| open operator decisions | 4 (§6.2) |
| registered IOUs | 10 rows, 9 open — IOU-08 was collected by umbrella #1004 (§6.1) |
| blockers | 3 (§6.3) |
| last measurement | 2026-11-13 (§7) |

Resume in three steps: read this table and §7's reading; read the state of the packages in the wave you are
entering and the registers that name them; then **re-measure before trusting** — §10's last falsifier, a recorded
verdict accepted without measurement, is the one that has already fired four times.

## 1. Destination and the completion test

The destination is `DESIGN.md` as it stands — §1's laws, Part I's plugin architecture, Part II's
schema/loader, Part III's authoring model, Part IV's runtime. A teammate reads the section its package's rows
name; this ledger never restates it.

Completion is `TODO.md`'s own final proof, and it is the only definition of done:

| test | gate | row |
|---|---|---|
| every §25 gate passes, and the conformance bed passes on every deployment kind | `scripts/design-check.sh` plus the conformance bed | 11.1 |
| fresh R10 beds on every affected deployment, a `check-roster`, `charly box validate` clean, `design-check.sh` green — then delete `TODO.md` | those gates, on the final tree | 11.2 |

Two invariants hold at **every** merge, not only at the end: the design gate is green, and no new D-PAT
violation exists (§7).

## 2. Instruments and authority — links, not restatements

| instrument | owner |
|---|---|
| the north-star protocol (destination, ordered heuristics, anti-patterns, measured state), the IOU register, per-merge measurement, migration-ledger discipline, crossed-ruling reconciliation, brief verification, stop-and-respawn | `/charly-internals:agents` (`references/program-discipline.md`) |
| topology (×1 orchestrator, ×N teammates, fresh validator per PR), the responsibility matrix, the slot budget, concurrent landing, bidirectional verification | `/charly-internals:agents` (`references/orchestration-model.md`) |
| the landing lifecycle: `feat/` branch, one push after full validation, fresh `pr-validator`, protected merge, merge-time tag | `/charly-internals:git-workflow` |
| R0–R10, the acceptance checklist, the Cutover Sizing Law, "producer first" | `AGENTS.md` (Part I and Part II) |
| `disposable: true` is the only authorization for an autonomous bed this ledger names | `/charly-internals:disposable`, `/charly-check:check` |
| the session ledger (the harness todo primitive) and its interruption rule | `/charly-internals:agents` (`references/hooks-and-lifecycle.md`) |

**Authority order when two of them disagree:** `AGENTS.md` R0–R10, then `DESIGN.md` (normative design), then
`DESIGN.cue` (its schema), then `TODO.md` (the work list), then this ledger (the plan). A contradiction *inside*
`DESIGN.md` is never resolved locally — it is a STOP (§6.2, `D-1`).

## 3. The team

One persistent **Lead** and a pool of **teammates**, exactly as the orchestration model defines (§2). The roles
below name the programme's slots, not new rules.

| role | count | owns | never |
|---|---|---|---|
| `lead` | 1, persistent | the whole PR surface (creates every PR, makes every push), all beds, scope rulings, this ledger, operator escalation, agent and worktree lifecycle | authors a cutover it then validates |
| `impl-<PID>` | one per active package, recycled | one package end to end in its own worktree: implementation, unit gates, R5 sweeps, CHANGELOG, its PR round's findings; **commits** freely | pushes, creates a PR, edits this ledger, touches another package's files |
| `auditor` | transient | one read-only measurement lane — the four-lane instrument (schema/generation, parsing/validation, protocol/plugins, runtime and CLI) that re-derived `TODO.md` on 2026-11-13; reuse it whenever a row's state is in doubt | writes anything in the repo |
| `bed-runner` | transient | one `charly check run` roster the Lead scheduled | chooses the roster, or reads a skip as a pass |
| `rca` | fresh, per anomaly | the R1 root-cause analysis: mechanism, missed control, blast radius, root fix | fixes under analysis |
| `pr-validator` | fresh, per PR | independent R0–R10 verdict, the squash-merge, the merge-time tag | validates its own work |

The roles are harness-neutral; only the spawn, message and task-board verbs differ between harnesses, and the
brief's content does not. A session's own todo ledger — not this file — carries its in-flight items between
turns (§2's last row).

**Spawning.** One teammate per package, named `impl-<PID>` (e.g. `impl-P01`), briefed with exactly one package
and its rows, stopped when the package lands or is handed over. Never one teammate per sub-phase — the same
session compacts and continues. The validator always gets a fresh context.

**Width.** The parallel width is the operator's live-oversight slots: one slot per concurrent *package*, never
per agent. Unset today; the Lead records the granted width in §0 when the run starts. On exhaustion, stop stale
agents — never downgrade the model.

**Stop and rotate.** Only on two re-briefs of the same package, idle past the window with no artifact, or a loop
— never on turn count. Stop, confirm no new turns, then spawn the successor.

## 4. Lanes — what serializes

Every package's legs come from one closed set, and the shared producer repos serialize (one pin wave, one index):

| lane | repos | what lands | what waits on it |
|---|---|---|---|
| `contract` | `spec` | the schema, the contract-backed defs, the wire types | every lane |
| `sdk` | `sdk` | mechanisms, the loader's shared half, generated helpers | `core`, plugins |
| `core` | `charly` | the host, dispatch, the commands | plugins, umbrella |
| `plugins` | `plugin-*` | verbs, kinds, deploy targets | content repos |
| `content` | `distro-*`, candy-bearing `layer-*` | authored boxes and candies | umbrella |
| `umbrella` | `opencharly/opencharly` | pins, this ledger, `TODO.md`, the gate corpus | nothing |

A package's own row cells carry its forcing edge; §5's order column repeats only the lane sequence. Two
packages may run concurrently when their first legs are disjoint. Two whose first leg is `contract` never do.

## 5. The work packages

Ten waves in dependency order. `rows` are `TODO.md` ids and are the package's acceptance surface; `gate` names
what proves the package (usually one R10 bed roster plus the design check); `depends on` is a hard order — a
package does not start while a dependency is not `landed`. A package is one cutover: if one R10 gate cannot
prove it, it is decomposed before dispatch, never landed as a clean slice plus a deferral.

### W0 — unblockers

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P00 | Schema-first-parse spike (the open RDD decision) | 0.3 | one disposable bed + a design record; no repo lane | the spike's own disposable bed and its written answer | none | `planned` |
| P01 | Kind bodies into their plugins (3 units left: `vm`, `candy`, `android`/`deploy`) | 2.1 | spec > sdk > charly > plugin-{substrate,pipeline,task,check,candy,local,kubernetes,kubevirt,vm,android,deploy} > umbrella | kind-value corpus sweep (composed arm) + the affected R10 beds + `charly task verify` | none | `in progress` — unit 6 (`kubevirt`) landed 2026-11-14 across five merged legs; units 1–5 before it, five after |
| P02 | One generation pipeline | 4.1, 4.2, 4.5, 4.6 | spec > sdk > charly | `charly task cue-gen` reproducibility (no-op on a clean tree) + the generator tests | P01 | `planned` |
| P03 | Generation reproducibility gate | 4.4 | dotgithub > two plugin repositories as callers | the reusable workflow green in both callers | none | `planned` |
| P04 | Generated types only | 2.3 | spec > sdk | `cue-gen` diff empty + `go build ./...` + the unit suites | P02 | `planned` |
| P05 | Store: one resolver, five cache phases | 7.2, 7.3 | sdk > charly | one R10 bed per cache phase (store, plugin-build, repo, materialized, vm-images) | none | `planned` |

### W1 — Contract: capabilities, host, drivers, venues, captures

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P06 | The audit record and a transactional state commit | 7.4, 12.12 | spec > sdk > charly | a mutation that appends exactly one record + the `audit` read command in a live bed | P05 | `planned` |
| P07 | Secrets never enter the IR | 7.6 | spec > sdk > plugin-{fleet,deploy-pod} | a live deploy whose rendered IR contains no secret value | P05 | `planned` |
| P09 | Capability solver: need, use, provide | 3.12, 3.29, 2.8 | spec > sdk > plugin candies > charly | solver tests + a bed that authors `need:`/`use:`/`provide:` | none | `planned` |
| P10 | Host grants, leases and versions | 3.23, 3.36, 3.41, 3.42, 12.9 | spec > sdk > plugin-deploy-{pod,vm,kube} > charly | lease preflight refusal + a GPU-less bed + the label round-trip test | P09 | `planned` |
| P11 | The driver table | 13.3 | spec > sdk/core > plugin-{vm,pod,kube,secrets} | driver-table vet + one box run under two drivers | P09, P10 | `planned` |
| P12 | Venue accesses | 13.4, 3.39 | spec > sdk > each deployment kind | a load error naming the venue + a live bed with an absent access | P11 | `planned` |
| P13 | Captures, filesystem and process | 3.24, 13.5, 13.6, 3.38 | spec > sdk > plugin-{pod,vm,check} > charly | capture/restore bed (filesystem and process scope) | P11 | `planned` |
| P14 | Publishing and sizing as needs | 13.2, 3.40 | spec > sdk > plugin-{deploy-pod,deploy-vm} | publish bed (host port reachable) + a load error for an unknown key | P09 | `planned` |
| P15 | Check phases | 13.7 | spec > plugin-check > charly | phase derivation tests + a bed with an `artifact` and a `ready` check | none | `planned` |

### W2 — Contract: sources, forms, schema patterns

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P16 | One `from:` resolver and the forms | 2.10, 2.11, 2.14, 2.15, 3.35 | spec > sdk > plugin-{vm,pod,build} > distro repos > umbrella | image-to-disk-to-vm bed + the form-vs-`os` load error | P11 | `planned` |
| P17 | Nesting and deployment content | 13.1, 3.7, 3.10 | spec > sdk > each deployment kind | a load error for `add_candy:` on a box-backed kind + an inner-node bed | P09 | `planned` |
| P18 | Schema patterns and shared shapes | 2.16, 2.2 | spec > plugin repositories | `design-check.sh` green with the D-PAT census not grown | P01 | `planned` |
| P19 | Authoring shape and vocabulary | 2.24, 2.25, 2.26, 3.43, 2.9 | spec > sdk > charly | one negative case per rule + `box validate` clean on the corpus | P18 | `planned` |

### W3 — The loader: parse, seams, reference graph, grammar

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P20 | Parse on the composed schema | 3.1, 3.2, 3.3, 3.5, 3.6 | spec > sdk > charly | the corpus loads with zero ambiguity + `charly box validate` clean | P00, P01 | `planned` |
| P21 | Envelope and loader seams | 2.7, 3.4, 2.6 | spec > sdk > charly | user config vs state root split proven by a deploy that writes no config | P20 | `planned` |
| P22 | The reference graph in core | 3.33, 3.34, 3.37 | spec > sdk > charly | cycle and unowned-word load errors + a namespaced load bed | P20, P23 | `planned` |
| P23 | One reference grammar | 3.8, 3.9, 3.16, 12.14 | spec > sdk > charly | digest verified at fetch + the positional-grammar CLI bed | none | `planned` |

### W4 — The authoring surface: IR, steps, flows, kinds, renames

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P24 | IR actions: identity, idempotence, goldens | 2.18, 2.19, 2.20, 3.26 | spec > sdk > plugin-build > each verb plugin | per-action goldens + an apply/teardown replay bed | P02, P18 | `planned` |
| P25 | Steps, phases and the `step:` rename | 3.13, 3.32 | spec > sdk > charly | `plan:` gone (claim-keyed grep) + a plan/step bed | P15 | `planned` |
| P26 | Pipeline stages, attempts and asks | 2.21, 2.22, 2.23 | plugin-pipeline > spec | a staged pipeline bed with `attempt:` and an answered ask | none | `planned` |
| P27 | Kinds: one `kubernetes`, the `plugin:` directive, android placement | 3.14, 3.20, 3.21 | spec > plugin-kube + plugin-android > charly | `create: kind` and `create: k3s` beds | P20 | `planned` |
| P28 | Verb inputs: one shape per verb | 3.25, 3.28, 3.18, 3.19 | spec > each verb-owning plugin > charly | operation-registry dispatch + a `kube`/`wl`/`adb` bed | none | `planned` |
| P29 | Collections and paths | 3.11, 3.22, 3.30 | spec > sdk > charly | map-shaped collections + a build from the rewritten corpus | P18 | `planned` |
| P30 | Field names that mislead | 3.27 | spec > sdk > charly | the renames land with a claim-keyed grep + a build | P18 | `planned` |
| P31 | Delete unused fields and kinds | 2.13 | spec > sdk > plugin repositories > distro repos | `box validate` clean on the corpus after the deletion | P18 | `planned` |

### W5 — Runtime: modules and the plugin protocol

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P32 | One transport, five roles, typed protocol | 5.5, 5.6, 5.7, 5.9, 5.10, 5.11, 5.12, 5.13 | sdk > plugin repositories > charly | the protocol conformance suite in sdk + one plugin bed per serve style | P33 | `planned` |
| P33 | Module hygiene: spec, sdk, core | 5.1, 5.2, 5.3, 5.4, 5.8 | sdk > spec > charly > plugin repositories | import-graph assertions (`charly/import_purity_test.go`) + core LOC down | P01 | `planned` |

### W6 — plugins, install IR, command line

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P08 | Image delivery and the served registry | 7.5, 12.15 | sdk > plugin-kube > charly | a locally built image reaching a cluster (registry view and in-venue import) | P05, P27 | `planned` |
| P34 | Plugins declared, not discovered | 6.8, 8.2 | spec > sdk > charly | a project whose `plugin:` declarations are its whole registry + a bed | P32, P36 | `planned` |
| P35 | Plugin consolidation | 6.2, 6.3, 6.4, 6.5, 6.9 | plugin repositories > sdk > charly > umbrella | one builder over `builder` nodes + the consolidated plugin's beds | P33 | `planned` |
| P36 | One install IR and its emitters | 6.1, 6.7 | spec + sdk > charly > plugin repositories | one emitter + all four plugin step paths green in beds | P24 | `planned` |
| P37 | The command line | 8.1, 8.4, 4.3 | spec > sdk > charly > marketplace | the command census shows no duplicate word + `__cli-model` leaves empty | P06, P34 | `planned` |

### W7 — documentation, map and code gates

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P38 | Documentation from the schema | 2.17 | spec > charly > plugin-docs | `charly docs generate` renders from doc comments + the docs build | P02 | `planned` |
| P39 | The documented vocabulary | 3.15, 10.1, 10.2, 10.3 | the owning repositories > marketplace > umbrella | `check-retired-claims` and the docs build green on the swept corpus | none | `planned` |
| P40 | The umbrella's map | 9.2 | marketplace > umbrella | `charly task verify` + `org-map` name the class-canonical set | P39 | `planned` |
| P41 | Code-rule gates | 14.1, 14.2, 14.3, 14.4 | sdk > spec > charly > every plugin repository | each gate red on a fixture, green on the tree, in all three repos | none | `planned` |

### W8 — the OCE rows still open

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P42 | The OCE rows still open | 12.1, 12.4, 12.6, 12.8 | spec > plugin-{pipeline,k8sgen,helm} > charly | each row's own bed (a chart installed one way, a validate-only lowering) | P36 | `planned` |

### W9 — final proof

| id | package | rows | producer-first order | gate | depends on | state |
|---|---|---|---|---|---|---|
| P43 | Final proof, then delete TODO.md | 11.1, 11.2 | all chains > umbrella | every §25 gate + the conformance bed + the check-roster + design-check, then TODO.md removed | every package | `planned` |

**Coverage is checked, not claimed.** Every open row of `TODO.md` is assigned to exactly one package; the
script reads this ledger's `rows` column, so it checks the tables above rather than a claim about them:

```
$ python3 - <<'PY'
import re
from collections import Counter
todo = open('TODO.md').read()
ledger = open('PROGRAM/design-implementation.md').read()
done = {'0.1', '0.2', '1', '2.4', '3.17', '7.1', '9.1', '12.2', '12.7'}
moved = {'0.4', '1.1', '2.5', '2.12', '3.31', '6.6', '8.3', '12.3', '12.5', '12.10', '12.11', '12.13'}
open_rows = {m.group(1) for m in re.finditer(r'^\| (\d+\.\d+) \|', todo, re.M)
             if m.group(1) not in done | moved and m.group(1) != '1.5'}
assigned = []
for line in ledger.splitlines():
    if re.match(r'^\| P\d\d \|', line):
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        assigned += re.findall(r'\d+\.\d+', cells[2])
dup = [r for r, c in Counter(assigned).items() if c > 1]
print(len(open_rows), len(assigned), len(set(assigned)), len(open_rows - set(assigned)), dup)
PY
125 125 125 0 []
```

*Columns: open rows in `TODO.md`, rows assigned here, distinct assigned, unassigned, duplicates.*

## 6. Registers

### 6.1 IOU register — every deferral, with its exact enabler

No wave closes holding an unregistered IOU, and the next wave's plan is built from this table, not from memory.

| id | what is deferred | enabler (the exact surface) | owner | wave | state |
|---|---|---|---|---|---|
| IOU-01 | `2.1`'s remaining eight kinds (units 4–11) | each unit's `InputDef: "#<Word>Value"` plus the corpus sweep taught in the same change; tracker `opencharly/spec#304` | P01 | W0 | open |
| IOU-02 | the D-PAT census's `dup` rows (`#945`: 357 violations, 7 `dup` over 3 names) | the schemas composing by import (P01) and P18's one-home rule; the total may not grow meanwhile | P18 | W2 | open |
| IOU-03 | the `_venue` word-set divergence (`container/ssh/shell/parent/kubevirt/none` against DESIGN §17.7's `container`/`ssh`/`shell`/`kvm`/`adb`/`kube`) | the venue table itself | P12 | W1 | open |
| IOU-04 | `D-CLI-2`'s allowed-writer list against `§22`'s group table | an operator ruling on which text is wrong (D-1); blocks `8.4` | P37 | W6 | **resolved 2026-11-14** — the operator ruled §22 is the incomplete text; its table gained the `candy` and `vm` writer rows plus `config setup` and `udev install` (opencharly/opencharly#1007) |
| IOU-05 | `5.4`'s "about 3.5k lines" and `5.1`'s `exec` figure are unmeasured totals | a per-file boundary-law decomposition of core's domain logic before P33 cuts | P33 | W5 | open |
| IOU-06 | `D-LOAD-6`'s "the document a reference is written in" clause | the reference-graph rows | P22 | W3 | open |
| IOU-07 | `12.14`'s digest preflight for charts | the reference grammar carrying the digest | P23 | W3 | open |
| IOU-08 | the two pins that were `behind` (`sdk`, `dotgithub`) | one pin wave (`charly task sync` — it advances EVERY pin the repo declares, so a wave here rolls all 409 — plus its PR) | Lead | W0 | collected — umbrella #1004 (`4a6111f`) |
| IOU-09 | `TODO.md`'s rows are keyed to their `D-*` requirements but not to DESIGN §1.1's mechanism rows and not to a `design/parity.tsv` row (`opencharly/opencharly#594`'s third scope line) | the parity ledger's shape is settled and green; the key is an umbrella-only analysis over the existing rows | Lead | W7 | open |
| IOU-10 | `distro-cachyos` is `derived-from:charly` and `blocked-by charly:box/cachyos` (not-on-the-served-line), and `sdk`/`charly` trail their tips (opencharly/opencharly#1009) | a `charly` pin wave to the commit that serves `box/cachyos` (the `charly` pin itself trails its tip) | Lead | W0 | open |

### 6.2 Decisions the operator owns

| id | question | blocks | recommendation |
|---|---|---|---|
| D-1 | `DESIGN.md` contradicts itself: `D-CLI-2` lists `config setup`, `candy set`/`add-<fmt>`/`params`, `vm clone`/`import` and `udev install` as writers, and `§22`'s group table omits them while `8.1` retires three of those renames — filed as opencharly/opencharly#1007 | P37's `8.4` leg | **RULED 2026-11-14: §22 is the incomplete text.** Verified against the current `DESIGN.md`, the table omitted THREE whole groups the CLI has (`candy`, `vm`, `udev`) plus `config setup`; the operator extended §22 rather than shrinking `D-CLI-2`, because the writers demonstrably write authored files (the org's own skills document `charly candy set/add-<fmt>/params`, `charly vm`, `charly udev`). `8.4` is unblocked. |
| D-2 | run the schema-first-parse spike (`0.3`) or waive it | P00 → P20 | run it: it can invalidate P20 before a `spec` PR is spent |
| D-3 | `9.2` and `10.2` share one `marketplace` window | P39, P40 | `P39` then `P40` — the corpus is regenerated before the map is pointed at it |
| D-4 | the width grant (slots), and confirming that every bed this programme runs is `disposable: true` | every wave | grant the width once; the disposable rule is not optional |

### 6.3 Blockers

| id | blocker | what it holds | who lifts it |
|---|---|---|---|
| B-1 | the `contract` lane is serial — P01, P09, P18, P19, P24, P29 and more all start in `spec` | every wave's first leg | the Lead, by admitting one `spec` leg at a time |
| B-2 | a pin wave holds the umbrella's index for its whole run | any concurrent git command in that worktree | the Lead, by not overlapping a wave with a wave |
| B-3 | `plugin-firecracker` is not a pinned submodule, so `2.1`'s `firecracker` unit needs a pin first | one unit of P01 | the Lead (the IOU-08 pin wave + PR) |

### 6.4 Risks and the anti-patterns already measured

The list is the north-star protocol's part (c): every mis-step caught so far, named so it is not repeated.

| id | anti-pattern | the measurement behind it | the rule |
|---|---|---|---|
| A-1 | "the record says done" | four rows were retired on false premises (`2.2`, `8.1`, `10.3`, `12.4`) and restored on 2026-11-13 | measure the tip before accepting a recorded verdict |
| A-2 | "the anchor is the truth" | §12.1's anchors are dated; a row's cell wins where the two disagree | read the cell |
| A-3 | "`gs` counts every file" | `#CandyValue` reads 27 all files and 8 in `*.cue`; `@go(` 2,979 against 2,825 | path-scope every schema claim (`-- '*.cue'`) |
| A-4 | "move the def, forget the `InputDef`" | a moved kind falls to the flat plugin-input path and authored bodies start failing | every kind move declares `InputDef` and teaches the corpus sweep in the same change |
| A-5 | "cite another plugin's def" | `#TaskParamSpec` had to stay in `spec` because a sibling plugin cites it; no gate reports it | sweep every pinned plugin's `schema.#` citations before the first leg |
| A-6 | "land the target's spelling" | `3.32`'s migration wrote `phase: build`/`runtime` against DESIGN §16.5's `artifact`/`ready`/`deployment` | check the requirement tag, not the row's prose |
| A-7 | "defer silently" | a deferral with no register row is how scope erodes | every deferral is an IOU row with an exact enabler |
| A-8 | "one big cutover" | the Cutover Sizing Law: one R10 gate must prove the whole package | decompose, with the tracker open until the last unit lands |

### 6.5 Open measurements — claims this programme cannot yet check

| claim | why unmeasured | owner | filed |
|---|---|---|---|
| `5.4`'s "about 3.5k lines" of core domain logic | the row never defines the set; its six markers are measured individually | P33 (IOU-05) | opencharly/opencharly#1008 |
| `5.1`'s `exec` size | 4,166 production Go lines measured; the row's "3.6k" matches no reproducible shape | P33 | opencharly/opencharly#1008 |
| `5.5`'s "five placement paths", "three verb-dispatch branches", "two executor APIs" | not enumerated anywhere | P32 | opencharly/opencharly#1008 |
| `7.2`'s "about 9 hand-built `.cache` paths" | occurrence counts reproduce, a distinct-path count does not | P05 | opencharly/opencharly#1008 |

Rows `11.1` and `11.2` are **not** debt: they are the completion test (§1), unrun by design until the packages have landed, and no issue can retire them before then.

### 6.6 In flight — agents, PRs, beds, threads

One item is in flight: the pin wave that carries unit 4's landed legs. The columns are the ones a session must
fill the moment one is, because the ledger is the resume point after an interruption.

| item | kind | owner | state | artifact (worktree / PR / bed / thread) | next update due |
|---|---|---|---|---|---|
| unit 4's pin wave | umbrella PR | lead | open, waiting on its gate | `chore(pins)!` branch off `origin/main`; ten pins advanced by `charly task sync` | at its merge |

## 7. Measurement — at every merge

The tracked metrics, how each is read, and today's reading. A variance past 20% against a package's projection
is explained at the merge and the residual is reassigned to a named wave; a same-signed variance across two
rounds is an RCA on the estimating method, never another per-row reassignment.

| metric | how | today (2026-11-13) |
|---|---|---|
| the work list | the `## Status` re-sum (`awk` over its table) | 146 items, 9 done, 125 open, 12 moved |
| P01's progress | `spec`'s `KindValueDefs`, its `#<Word>Value` defs, the kind bodies left in `spec/schema` | 8, 9, 11 (3 of 11 units landed) |
| the schema-pattern debt | `scripts/design-dpat.sh`'s census | 357 violations (close 54, absence 86, open 68, opaque 0, dup 7, union 142) — must not grow |
| the design gate | `bash scripts/design-check.sh` | all controls pass |
| the coverage census | the script in `TODO.md`'s `## Status` | 200 requirements, 0 unnamed |
| pin currency | `charly task pins --param MODE=currency`, cross-checked against each repo's `origin/main` | three not current when measured; umbrella #1004 then advanced `sdk` and `dotgithub` (IOU-08 collected). At the `5d81005` base `sdk` (`e44f0ce` → `f5fb1c0`) and `charly` (`8514979` → `d4c1d55`) again trail the tips their remotes serve, and `distro-cachyos` stays blocked — filed as opencharly/opencharly#1009 (IOU-10). The unit-4 pin wave (measured 2026-11-14) then advanced 10 pins and left the question at **4 of 409**: the three `distro-*` edges stay `blocked-by charly:box/<distro>` (a `blocked-by` that names its producer PASSES — the remedy is the served line, not a wave), and `charly` moved again DURING the wave (another session's merge), so its pin is one advance behind and the next wave collects it. |
| core's domain LOC | unmeasured (IOU-05) | — |

## 8. Update protocol

- **Single writer.** The Lead owns this file; a teammate reports and never edits it (two writers are a lost
  update, not a merge).
- **When to update:** package start (`active`, owner, worktree), every push (link the PR), every merge
  (`landed` plus the metric reading), block and unblock, handover, and the end of each round (a dated line in
  §9).
- **State vocabulary:** `planned | ready | active | blocked | in-review | landed | retired`. A package is
  `ready` only when its dependencies are `landed` *and* its brief's premise was re-verified against the tips.
- **Division of truth.** `TODO.md` owns item truth and this ledger owns package truth. When a package lands, its
  rows move in `TODO.md`'s `## Status` in the same change; the ledger never re-states a row's verdict.
- **Coordination grammar.** `CLAIM`, `STATUS`, `WAITING`, `HOLDING`, `CLEARED`, `RESOLVED` per `AGENTS.md`
  Part II #7, on both threads when a block is two-sided.
- **Interruption.** Reconcile this ledger and `TODO.md`'s `## Status` first, then act — an interruption is an
  addition, never a reset. A long bed or a pin wave is written here *before* it starts.
- **The push gate.** `AGENTS.md`, "Before every update push: read everything, fix everything." No push to
  an open PR until every new comment, review and review thread is read IN FULL, the latest full
  `pr-validator` report is read IN FULL, and every finding is fixed (or rebutted on-thread with evidence) in
  ONE commit; then the body is written for the new head and the push happens once. A finding raised on the
  PR is never filed away, and a teammate's report never substitutes for reading the validator's own text.
  The mechanics are `/charly-internals:git-workflow`'s.
- **Budget.** A goal's round budget is sized to the work, and the operator is asked before it runs out
  (`AGENTS.md` Part II #10).
- **The brief.** One package, its rows, the `DESIGN.md` sections those rows name, the gate, the pre-change
  measurement, the R10 bed roster and the pre-validator self-audit — with every volatile fact (a pin, a tag, a
  workflow file name, an issue number) written as the DISCOVERY command, never as the value. A brief that
  leaves a decision to the worker is a Lead defect and is not dispatched.

## 9. Round log

### 2026-11-13 — the ledger is created; nothing is implemented

- `TODO.md` re-derived at the tips: 146 items (39 rows added for unnamed DESIGN.md requirements, four restored,
  26 current-state cells corrected), 125 open.
- Coverage: 86 unnamed requirements became 0 — 52 demanded by the new rows, 21 absorbed, 13 satisfied.
- The design gate passes on that tree (`design-check: all controls pass`), and `check-readme-measurements`
  reports `OK`.
- This ledger: 44 packages covering all 125 open rows, every one `planned`; no agent spawned, no PR opened, no
  code changed.

### 2026-11-13 — round 1: the plan is landed

- `TODO.md` re-derived and this ledger land together as one documentation PR (`feat/design-programme-plan`),
  branched off `origin/main` `5d81005`. The re-derivation's own numbers: 146 items, 9 done, 125 open, 12
  moved; the coverage census 200/200/0.
- `opencharly/opencharly#1004` (`4a6111f`, `chore(pins)!`) landed the `sdk`+`dotgithub` pin advance this
  ledger registered as IOU-08, so IOU-08 is **collected**; `distro-cachyos` stays blocked and is registered
  as IOU-10.
- Tracker claimed: `opencharly/opencharly#1005` (the programme). `opencharly/opencharly#594` (the `TODO.md`
  re-derivation) is claimed with the evidence and stays open for its mechanism/parity keying, now IOU-09.
- Still nothing implemented: every package remains `planned`, 0 teammates, no bed, no package PR.
- Review round 1: the `charly/pr-validator` BLOCKed PR #1006 on two R1 findings — surfaced findings that were
  recorded in this ledger but never FILED (a register entry is not a filed issue), and a body that claimed zero
  findings while the pasted gate carried tracked baselines. Fixed by filing the findings as real issues
  (#1007 the `DESIGN.md` contradiction, #1008 the four unmeasurable totals, #1009 the pin advance) and by
  making every register row name the issue that owns it; `11.1`/`11.2` are stated as the completion test
  rather than as debt.

### 2026-11-13 — the programme goal is armed

- The goal is set for the full implementation of this ledger, with a round budget sized to the work and an
  operator conversation owed at 80% of it.
- The push gate is now an explicit protocol item (§8): every comment, review thread and the full validator
  report are read before a push, and every finding is fixed in one commit before that push.
- The programme state is unchanged by arming it: all 44 packages remain `planned`, no agent exists, and no
  branch, PR, bed or pin wave has been started.

### 2026-11-13/14 — `P01` unit 4 (`local`) landed through SEVEN legs

- The chain was MEASURED, not assumed: unit 4 is seven legs, and `plugin-substrate` — not `plugin-deploy-local` —
  owns `kind:local` (its `substrateWords` serves it, exactly as `pod` taught unit 3). Two corrections are recorded
  on `opencharly/spec#304`: my first consumer survey grepped repo-relative basenames that matched nothing (so the
  count was wrong), and the sdk's `loaderkit` kind table was invisible to any code read and visible to one
  assembled run.
- Legs, in landing order: `plugin-substrate#34`, `plugin-box#78`, `plugin-check#148`, `charly#1142`, `sdk#507`,
  `plugin-loader#13`, `sdk#510` (the `loaderkit` kind table: it named the authored `#Local` and PANICKED once the
  contract leg deleted it; it now names `#ResolvedLocal`, pinned by a test that fails on an assertion), and
  `spec#314` (the contract deletion, with the regenerated artifacts).
- The decisive proof is `spec#314`'s assembled corpus sweep on a MERGED-mains graph: 2,008 bodies judged, every
  PASS/FAIL identical to the run taken while the base still carried `#Local`/`#LocalValue`, `local` = 203 on both
  arms.
- The pin wave in this PR advances the ten pins that were not current (the six legs plus four squash-advanced
  paths) and collects IOU-10's currency question for the six.
- Cost observed: four reviewer BLOCK rounds on two tiny consumer legs, ONE defect behind all of them — a pasted
  proof taken at a head other than the one shipping. §8's push gate now carries that as a rule: create the head,
  run every pasted command AT it, and change no file afterwards.


### 2026-11-14 — `P01` unit 5 (`kubernetes` + `kindcluster`) landed; the assembled graph found what reading did not

- **Seven legs, all merged:** `plugin-substrate`#35 (both bodies + five policy sub-defs + four vocabulary tables + both
  `InputDef`s; the module's single import moved to `kindcluster.cue`, which sorts first), `sdk`#511 (the `loaderkit`
  kind table — the `pod`/`local` precedent, landed BEFORE the deletion so it could never panic), `charly`#1143 (an unused
  test-only alias), `plugin-k8sgen`#6 and `plugin-kube`#36 (each decodes the opaque `cluster_raw` into its OWN view;
  `Cutover K` had already built the wire — and the kube leg pins its projection's JSON against bytes CAPTURED from the
  implementation it replaced, which immediately caught a `kubevirt:{}` key a memory-written golden would have missed),
  `plugin-substrate`#36 (the body's five validation tests moved before the deletion) and `sdk`#512 (`vmshared`'s six
  unused aliases) — then `spec`#316 (bodies, sub-defs, tables, twins, alias and `#KubernetesGenInput`'s typed `cluster`
  field; `cluster_raw` is the ONE path).
- **Counts at the served tree:** `spec.KindValueDefs` 7 → 5, its `#<Word>Value` defs 8 → 6, eight kind bodies remain
  over TODO 2.1's 14-name list.
- **The decisive measurement** (deleted contract + the body's plugin + both decoders + the loader + charly, one
  workspace): **2,014 bodies judged, ZERO verdict classes moved** against the pre-change arm, one `vm` message refinement.
- **What the assembled graph caught that no reading did:** `sdk/vmshared` aliased six of the deleted types (#512);
  charly's `go.mod` still resolved pre-unit-4 `plugin-box`/`plugin-check` versions using `spec.Local`; the pinned plugins
  predate their own legs. The last two are the wave's own first acts — **opencharly/opencharly#1011**.
- **Lessons this unit paid for:** a deferral is a LINK not a noun (#1011 exists because of it); a measurement's SCOPE is
  part of its evidence (`pwd` + counts over both populations); a patch that leaves glued text is worse than the defect it
  fixes; COORD pairs go up WITH the body; and `gofmt` runs before the push, not just the build.
- **The census relocated again** (the unit-4 pattern, now routine): the two kind rows, the `verb:k8sgen` citation and
  three D-PAT rows follow the code; the census stays 357.


### 2026-11-14 — `P01` unit 7 (`firecracker`) landed: the largest body, and the claims a move constructs

- **Three legs, all merged** (two of them as successors after auto-close): `plugin-substrate`#40 — **thirty-two
  defs**: `#Firecracker` + thirty named sub-defs + the `#FirecrackerValue` twin, the `InputDef`, and the module's
  single contract import moved to `firecracker.cue`, the file that now sorts FIRST (the third time a body's arrival
  moved the import; five files' order notes were swept with it) — `plugin-substrate`#41 (the body's five
  `#FirecrackerValue` validation tests moved BEFORE the deletion) and `spec`#319 (the contract deletion: the body,
  its sub-defs, the vocabulary tables and the twin; the `#KindValueDefs` map-entry test deleted with the entry, and
  the three VOCABULARY assertions kept because words are the contract's, not bodies).
- **No consumer legs, measured rather than assumed:** nothing outside the resolve arm ever read the authored Go type
  (`grep -rn 'spec\.Firecracker\b'` over every merged main → no match outside the wire types) and `loaderkit` has no
  firecracker entry; the resolve envelope projects NOTHING (it carries the raw bytes; the venue fills the host).
- **Counts at the served tree:** `spec.KindValueDefs` 4 → 3, `#<Word>Value` defs 5 → 4, six kind bodies remain.
- **The decisive measurement** (the assembled graph): 2,014 bodies judged, ZERO verdict classes moved,
  `firecracker` differing in zero.
- **Six rounds, two auto-closes, two rules.** (a) **A moved body's OWN claims are part of the sweep** — the
  vocabulary owners (`@vocab(spec)` and "compiled into THIS contract module", unit 6's lesson, missed once more),
  every count derived from the file rather than the previous text, and every citation list verified with comments
  EXCLUDED (a regex that counted a prose mention built a header claiming a def the code never cites). (b) **A PR
  body describes the CURRENT tree, never the cutover's end state** — "landed and merged" written while its own
  `WAITING` named an unmerged PR cost one whole thread, and the successor that stated the true order landed.

### 2026-11-14 — `P01` unit 6 (`kubevirt`) landed: the largest consumer, and the sweep-by-subject lesson

- **Five legs, all merged:** `plugin-substrate`#37 (thirteen defs + the twin + the `InputDef`), `sdk`#513 (the
  `loaderkit` entry → `#ResolvedKubeVirt`; the capital V is what a case-folded grep finds), `plugin-kubevirt`#46 —
  **the largest consumer this programme has moved**: 43 references across 11 files, a 26-field view, eleven sub-types
  and the hand-written union, with the renderer's 34 assertions as the behavioural pin and a decode test (plus a
  per-arm source test) as the tag-divergence guard — `plugin-substrate`#38 (the body's tests moved before the deletion)
  and `spec`#317 (the contract deletion, the hand-written union included).
- **Counts at the served tree:** `spec.KindValueDefs` 5 → 4, `#<Word>Value` defs 6 → 5, seven kind bodies remain.
- **The decisive measurement** (the assembled graph, all legs merged): 2,014 bodies, ZERO verdict classes moved,
  `kubevirt` 26/26.
- **Three reviewer rounds, one CI cycle, one rule:** a cutover's record lists SUBJECTS — a def WITH its commentary
  (a four-line rationale left over a deleted `#KubevirtValue`), a FILE WITH each test in it (`kubevirt_test.go` held
  four; I accounted for three), a COUNT as a claim to read ("the four that have moved" vs the five, twice in one file) —
  never lines. And the generator plus the formatter run LAST: `TestGenReproducible` failed because the generated types
  carry the CUE doc comments, so a later comment edit made the committed generation stale.
- **A defect worth carrying forward:** the moved test's first version unified values from two CUE contexts and reported
  an empty disjunction that named nothing. Compile a literal in `v.Context()` — the kindcluster helper's lesson, now
  recorded where the next helper will look.

## 10. What would make this ledger wrong

- **`TODO.md` is re-derived again** (rows added, retired or restored) → §5's assignment must be re-checked; the
  coverage script is the check.
- **A package splits or merges** → ids stay stable; a split adds `Pxx-a`/`Pxx-b` rather than renumbering, so
  every reference in a brief or a PR body keeps resolving.
- **A row's premise is falsified at the tip** → the package's brief changes, §9 records it, and the row goes
  back to `TODO.md` for re-derivation.
- **`DESIGN.md` changes** → the completion test (§1) and every package's gate are re-derived before the next
  dispatch.
- **A recorded verdict is accepted without measurement** → that is A-1 firing, and this ledger's own history
  says it costs a round.
