# Wave gate policy — ONE gate per change, chosen by change class

**Authority: `.dsh/skills/check/references/beds-and-r10.md` §"R10 gate by change class" (line 481),
which the check skill names as the SOLE OWNER of this matrix.** This page applies it; it does not
redefine it. Where the two disagree, the skill wins.

The R10 principle is **exercise, not ceremony**: *"a gate that cannot fail on the change proves
nothing (wasted verification), and a change whose gate never executed is unproven."* So the rule is
**the smallest gate that genuinely exercises every changed code path — run in full.** Never the
whole roster "to be safe", and never a substitute for the class's mandated gate.

## The matrix, applied to this wave plan

| class | the ONE gate | a bed? |
|---|---|---|
| **Contract / library module** — a Go module with NO `main` and NO `disposable: true` entity (`spec`, `sdk`) | the repo's own committed module CI on the PR head: `go build ./...`, `go test ./...`, `gofmt -l .`, `golangci-lint run ./...` | **NO — "no bed CAN exist"** |
| **Documentation-only** — `*.md`, comment-only | non-runtime standards only | **NO** |
| **Hook / workflow scripts**, harness config (`scripts/`, `hooks/`, `charly.yml`) | `bash -n` / parse, then **execute the changed script live**, plus `--self-test` | **NO** |
| **`charly` Go code** | `go test ./...` + `go vet` + R9 `scripts/bootstrap-charly.sh`, then **one `charly check run <bed>` whose KIND matches the touched code path** | **YES — exactly one, by kind** |
| **Candy / box / pod / vm / k8s / local config** | `charly box validate`, then a bed that composes the changed entity | **YES — the composing bed** |

**Mixed changes take the UNION of their classes' gates**, and docs ride along at the code class's
runtime tier — never `documentation reviewed`.

## Which single bed, for `charly` Go code

The routing, verbatim from the matrix:

| touched code path | the bed |
|---|---|
| box / candy / pod / deploy-target mechanism | the pod-mechanism bed — `check-pod-overlay`, `check-sidecar-pod` |
| `target: local` | `check-local-vm`, `check-local-app` |
| VM / kubernetes | `check-k3s-vm`, `check-kubevirt-vm` |
| a feature surface | **its own feature bed** — `check-feature-app` |
| **cross-cutting** loader / resolver / IR / unified schema | a `kind:check-roster` roster — and a roster missing any matching bed is a PARTIAL roster, never a green gate |
| the install/seam contract | `check-seam-proof` |

**"Beds whose substrate the change cannot reach" are explicitly NOT required.** That column is the
permission to run one bed, not a preference.

## The wave-design consequence — split by SUBSTRATE, not by row number

Because the bed follows the substrate, **a wave whose rows all touch one substrate needs exactly
one bed; a wave touching two substrates should be TWO PRs, not one PR with two beds.**

This is why the wave plan is ordered as it is:

| wave | rows | repo | class | the gate | beds |
|---|---|---|---|---|---|
| **SPEC-SCHEMA** | 27 | `spec` | contract/library | module CI | **0** |
| **SPEC-PARSE** | 43 | `spec` + `sdk/loaderkit` + `candy/plugin-loader` | contract/library | module CI (per repo touched) | **0** |
| **SDK** | 6 | `sdk` | contract/library | module CI | **0** |
| **GATES** | 4 | umbrella `scripts/` | hook/scripts | `bash -n` + execute live + `--self-test` | **0** |
| **DOCS** | 18 | umbrella prose | documentation-only | non-runtime standards | **0** |
| **CHARLY** | ~29 (sections 5, 6, 13) | `charly` + plugins | `charly` Go code / config | pre-flight + **ONE bed by kind** | **1 per PR** |

**98 of the 120 rows the wave plan covers need NO bed at all** — not as a shortcut, but because the contract says a library module has no bed venue. **Three populations are in play here and they must not be compared with each other:**

| population | count | how it was produced |
|---|---|---|
| rows in `TODO.md` | **147** | `git show origin/main:TODO.md | grep -cE '^\| [0-9]+\.[0-9]+ \|'` |
| rows the census measured | **125** | 9 `done` + 20 `corrected` + 3 `reproducing` + 93 `open` — the four groups sum to the measured set |
| rows the wave plan covers | **120** | sections 2 (27) + 3 (43) + 7 (6) + 10 (3) + 12 (15) + 14 (4) = 98 at **zero beds**, plus 5 (13) + 6 (9) = 22 needing **one bed per substrate** |
| rows no wave covers | **27** | sections 0 (4) + 1 (2) + 4 (6) + 8 (4) + 9 (2) + 11 (2) + 13 (7) — 120 + 27 = 147 |

**The census's 93 `open` rows are a SUBSET of the 120 the waves cover, not equal to it**: coverage is by *section*, and a section holds done, corrected and open rows alike. An earlier version of this file compared the zero-bed wave total against the census open-row count and produced a figure LARGER than the population it claimed to be a part of. That is the same self-contradictory-count defect this document exists to prevent, committed in the document itself; **the numbers above are each produced by their own command, and none is derived from another.**

## The premise you must PROVE, not assume

"We are a library, so no bed exists" is a NEGATIVE claim. Paste it:

```console
$ git grep -nE '^[[:space:]]*disposable:' -- '*.yml' '*.yaml'    # no match
```

**Anchor the key at line start.** The bare string also appears in CHANGELOG prose and Go string
literals, and a bare `grep 'charly.yml'` also matches `*.charly.yml.golden` fixtures — either form
makes the premise a false negative.

## And the consumer rule

**A change whose behaviour is observable only at a CONSUMER's live boundary names the consumer PR
running that bed — the bed rides the consumer change, never the library PR.** Producer → consumer
order. A library PR never waits on a bed it cannot host.

## Three rules earned the hard way, which bind every wave

**1. An identifier comes from the command that produced it.** A full 40-character SHA comes from `git rev-parse`, never from an eight-character prefix completed by expectation; an issue number comes from the API's response, never from the shape `#1NNN`. Measured twice in one session: a hand-completed SHA answered `422 No commit found`, and a guessed issue number was five off the one the API returned. **Both were caught by the machine and neither was argued with — which is the argument for the habit, not for the principle.**

**2. A zero needs the control that would have found the word — in the repos you did not think to look at.** A `grep` scoped to `schema/` returning 0 is a true statement about `schema/`, not about the tree. The form that means something:

```console
$ git grep -n '<name>' HEAD -- . ':!CHANGELOG' | wc -l      # gone from this repo — necessary
$ git grep -n '<name>' HEAD~1 -- . ':!CHANGELOG' | wc -l    # the control: what it WOULD have found
```

**3. A deletion's proof is the absence of READERS, not the absence of the name.** `spec` is not the world. A cutover that breaks at a distance — in a repo the PR never touched, on the consumer's next pin bump — has still broken. Before deleting, sweep the CONSUMERS by name:

```console
$ git -C <every consumer repo> grep -n '<the name>' origin/main
```

**And the sharper form, which cost a withdrawn PR:** *the thing that would have stopped you was inside the diff.* The comment that was deleted contained the reason the deletion was wrong. **Prose that explains why a thing exists is load-bearing, so a change that deletes it owes an argument, not a movement.**

**And the methodology that produced the session's best find:** *write the control first, then let it tell you what the row is.* A lockstep test written before the row's disposition was decided found two fields the runtime had been persisting and the validation schema had never checked. **The row was not a documentation row, and only the control could have said so.**

## Rule 6. A proof is only as wide as the instrument's reach, and the reach is invisible in the output

This is the generalisation of rules 2 and 5, and it is the one to carry into every gate, sweep and paste. **Each instrument measures a smaller set than it appears to, and nothing in its output says so.**

| instrument | what it appears to cover | what it actually covers |
|---|---|---|
| `go build ./...` | the module | **only the packages it reached** — a package that fails hides every package that depends on it, so a paste naming ONE package is a **lower bound**, and the rest are **unmeasured, not clean** |
| `grep -c <name> <repo>` | the name | **one repo, one pathspec, one scope** — each can be wrong independently, and a zero from any of them is a claim about the query |
| the compiler | a deletion's consumers | **only readers that compile against the name** — a stale entry in a map whose completeness a *test* gates never appears in a build |
| a test | the contract | **only the property it asserts** — a lockstep test that compares field NAMES proves set equality "and nothing more" |

**So every proof needs two things it cannot contain**: the **reach** it actually had, stated; and a **control** from outside that reach, which would have found the thing had it been there.

- a build paste states **which packages it reached**, and names the ones it did not;
- a grep paste carries **the repo, the pathspec and the scope**, plus a control at a ref where the answer is non-zero;
- a deletion carries a **consumer sweep across instruments** — the compiler for the reads, the owning test for the contract surface;
- a lockstep or equality assertion states **what it proves and what it does not**.

**Measured three times in one evening**: a `grep schema/` that missed the same PR's other file; a `go build` paste that named one package and was reported as the set; and a `spec` deletion that broke `sdk` three files away in the same module. **None was a careless mistake. Each was a correct measurement of a smaller set than it was read as.**

