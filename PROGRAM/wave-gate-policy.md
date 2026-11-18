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

**98 of the 93 open rows ride five waves at ZERO bed runs** — not as a shortcut, but because the
contract says a library module has no bed venue at all.

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
