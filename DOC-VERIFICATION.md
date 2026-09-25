# DOC-VERIFICATION.md — paragraph-level audit of charly's hand-authored docs

Status: **complete — Batches 1–5 verified; all nine resulting PRs merged (§11).**
Audit date: 2026-09-13
Method owner: this document. Every verdict below is evidence-backed; unproven claims are marked
`UNVERIFIED`, never guessed.

## 0. Pinned inputs (what "the code" means here)

| Input | Pin |
|---|---|
| charly repo | `d507ca5a27eeb35f4001b8af89fd94eb5cfdcccd` (submodule `charly/`) |
| docs repo | submodule `docs/`; charly pinned **CI-time** at `d507ca5a27…` by `docs/.github/workflows/deploy.yml` (NOT `.gitmodules`) |
| spec (CUE schema) | `spec/` submodule, `spec/schema/*.cue`; `charly/go.mod` requires `github.com/opencharly/spec v0.2026254.503` |
| sdk | proxy module `github.com/opencharly/sdk v0.2026254.523` (no submodule) |
| plugin-docs | `v2026.254.1214` (docs generator) |
| pinned binary | `charly/bin/charly`, built via the exact `scripts/bootstrap-charly.sh` recipe (`pluginsgen` → `go build` with `-X main.BuildCalVer`), `charly version` → `2026.254.0903` |

`pluginsgen` regeneration on this clean tree was a **no-op** (`git status` clean after) — SDD drift gate holds.

## 1. Scope

**In scope (hand-authored; no `DO-NOT-EDIT` banner):**

- charly repo: `README.md` (primary), `VISION.md`, `GRIEVANCES.md`, `LIBERATION.md`, `AGENTS.md`,
  `CLAUDE.md`, `charly/charly/CLAUDE.md`, `charly/charly/KERNEL_MANIFEST.md`, `PROGRAM/*.md`,
  `box/*/README.md`, `.pi/README.md`, `.reasonix/README.md`, `.opencode/agent/pr-validator.md`,
  `tests/data/README.md`
- docs site: `start/{install,quickstart}.md`, `concepts/00..12` , `guides/{authoring-a-candy,
  authoring-a-plugin,the-cli,troubleshooting}.md` (19 files)
- docs repo-level: `docs/README.md`, `docs/CLAUDE.md`, `docs/astro.config.mjs` sidebar targets

**Never targets (generated):** `docs/.../{index,vision,grievances,liberation}.md`, `reference/**`,
`recipes/**`, `providers.md`; `charly/go.work`; generated Go/CUE; all `CHANGELOG/**`; marketplace
skill projections.

**Full corroborating corpus (the user's "FULL opencharly code base"):** charly + spec + sdk +
**188 `layer-*` + 74 `pod-*` + 108 `plugin-*` + 6 `distro-*` + 7 `charly-*`** repos + docs +
marketplace. The live provider census (`docs/.../reference/providers.md`) reports **166 words
across 175 plugin candies, 121 compiled into the binary.**

## 2. The generation boundary (re-verified, authoritative)

Definitive split from a full-file `DO-NOT-EDIT` scan of all 1403 content files — **1384 generated,
19 hand-authored** — corroborated by `charly/charly.yml` `docs.output.hand_authored: [start,
concepts, guides]` and `docs/CLAUDE.md`/`docs/README.md`:

| Surface | Status | Source |
|---|---|---|
| `docs/.../index.md` | GENERATED (banner line 30) | projected from `charly/README.md` |
| `docs/.../{vision,grievances,liberation}.md` | GENERATED | from `charly/{VISION,GRIEVANCES,LIBERATION}.md` |
| `docs/.../reference/**`, `recipes/**`, `providers.md` | GENERATED | cli/candy/box/plugin/word projections |
| `docs/.../start/**`, `concepts/**`, `guides/**` | **HAND** (19) | the files themselves |
| `charly/**` (all `.md`) + `docs/README.md`,`docs/CLAUDE.md`,`docs/astro.config.mjs` | **HAND** | the files themselves |

`head -15` banner probing is **unreliable** (index.md's banner is at line 30); classify by full-file grep.

## 3. Method, claim classes, and the corpus index

Every paragraph / table row / code block → ID `<path>:<start>-<end>`; each atomic claim is
classified `C1` CLI surface · `C2` YAML grammar · `C3` architecture/IR · `C4` entity facts ·
`C5` refs/pins · `C6` behavior · `C7` links · `C8` narrative. Truth sources: the pinned binary
(read-only verbs), `spec/schema/*.cue`, Go source, entity `charly.yml` across the full corpus,
`go.mod`/`go.work`/`.gitmodules`, GitHub refs, and the generated provider census.

**Corpus entity index** (regenerable; 901 entity rows):
```bash
cd <umbrella>
for f in layer-*/charly.yml pod-*/charly.yml plugin-*/charly.yml distro-*/charly.yml \
         distro-*/box/*/charly.yml charly/charly.yml; do
  [ -f "$f" ] || continue
  yq -r 'to_entries[] | select(.value|type=="!!map") | .key as $k | (.value|keys|join(",")) as $ks
         | $k + "\t" + $ks + "\t'"$f"'"' "$f"
done | sort -u > /tmp/corpus-index.tsv
```
Note the `!!map` type guard — without it yq aborts on scalar top-level keys (`version`) and silently
under-counts (this audit hit that, then fixed it).

## 4. README ledger (Batch 1)

Verdicts: **VERIFIED / DIVERGENCE / UNVERIFIED**.

| ID | Claim | Class | Truth source | Method | Verdict | Evidence |
|---|---|---|---|---|---|---|
| README:5-10 | one declarative description → five substrates (container, VM, Kubernetes, host, Android); shared install plan | C3 | census + install-plan skill | census sections; skill | MERGED-OK / VERIFIED | census `kind:{pod,vm,local,kubernetes,android}`; `deploy`={android,kubernetes,exampledeploy} |
| README:14-17,229-254 | every word is a plugin; core is word-blind; extend by writing candies | C3 | boundary-law skill, `plugin-candy-kind` | read skill; grep | VERIFIED | `plugin-candy-kind/…/charly.yml:23` registers `kind:candy`; census 166 words |
| README:25-27,34 | `@github.com/opencharly/charly/candy/{ripgrep,sshd,charly}:v2026.251.1947` | C5 | corpus | `charly box generate` on fixture | **DIVERGENCE** | `remote candy github.com/opencharly/charly/candy/ripgrep not found …/charly@v2026.251.1947/candy/ripgrep` |
| README:37-39 | candy list is the whole configuration | C3 | boundary-law | read | VERIFIED | — |
| README:47-51,168-171 | plan baked as OCI label; `check run <bed>` = build→deploy→probe→fresh rebuild→teardown | C6 | check skill `references/beds-and-r10.md` | read | VERIFIED (nuance) | canonical order is build→check image→deploy→check live→**fresh update**→teardown; README "destroys and rebuilds" ≈ fresh update |
| README:57-59 | LLVM heritage (one IR, many backends) | C8 | install-plan | read | VERIFIED (intent) | — |
| README:61-63 | `candy:` is a real keyword and `candy/` a real directory | C2 | corpus | grep | VERIFIED (generic) | e.g. `plugin-mcp/candy/plugin-mcp/`; note charly repo itself vendors none |
| README:84 | install link `https://opencharly.ai/start/install/` | C7 | docs tree | ls | VERIFIED | `docs/.../start/install.md` |
| README:89-101 | `charly --repo opencharly/charly box list boxes` prints `agentteams … arch.arch …` | C1/C4 | pinned binary | live run (warm cache) | VERIFIED | output begins `agentteams [testing]` / `agentteams-manager [testing]` / `agentteams-worker [testing]` / `alpine-repo-box [testing]` / `arch.arch [testing]` (129 boxes) — matches the README |
| README:106-112 | clone + `scripts/bootstrap-charly.sh` + `./bin/charly box build`; own binary per checkout | C1/C3 | `scripts/bootstrap-charly.sh` | read | VERIFIED | sanctioned "work on charly itself" exception |
| README:118 | "This is `box/fedora/box/tutorial-shell/charly.yml`, from `opencharly/distro-fedora`" | C4/C5 | corpus | read | DIVERGENCE (path) | charly-relative path is `charly/box/fedora/box/…`; in the distro repo it is `box/tutorial-shell/charly.yml` |
| README:120-137 | tutorial-shell snippet (refs, plan) | C2/C4 | `distro-fedora/box/tutorial-shell/charly.yml` | diff | **DIVERGENCE** | real refs are `layer-supervisord:v2026.240.0121`, `layer-ripgrep:v2026.235.1653`, `pod-sshd:v2026.239.1637`; full description/comments/plan differ |
| README:142-150 | sshd declares a service → charly injects the destination init; box plan checks only composition | C6/C3 | E1 probe; tutorial-shell file | read + live probe | DIVERGENCE (D14, fixed) | the "init is not listed / auto-injected" premise is false (E1); corrected in charly#604 README + distro-fedora#51 |
| README:153-156 | `--repo opencharly/distro-fedora` `box validate`/`box build`/`shell`/`check run check-tutorial-shell` | C1/C5 | binary; corpus | help; grep | VERIFIED (commands+entity) | `check-tutorial-shell` at `distro-fedora/charly.yml:73`; live run not performed |
| README:159-166 | four stages; substrate keywords; `charly deploy add`, `charly start`; check box/live/run | C1/C2 | binary help; census | help | VERIFIED | `deploy add` help exists; census has `command:deploy`,`command:check` |
| README:180-191 | "real entries in `box/fedora/charly.yml`": `check-tutorial-shell` pod; `check-fedora-vm` vm with `add_candy: …/charly/candy/charly...` | C4/C5 | `distro-fedora/charly.yml` | read | VERIFIED / **DIVERGENCE** | both entities real (`:73`,`:408`); actual `check-fedora-vm.add_candy` is `@github.com/opencharly/layer-charly:v2026.241.1407`, not `charly/candy/charly:v2026.251.1947` |
| README:204-209 | coder boxes + AI CLIs + nested rootless containers/VMs at uid 1000, no `--privileged` | C4/C6 | corpus | yq on `distro-fedora/box/fedora-coder/charly.yml` | VERIFIED | composes `layer-claude-code`, `layer-codex`, `layer-gemini`, `layer-forgecode`, `layer-container-nesting`, `pod-charly-mcp`; boxes exist in all 4 distros |
| README:217-227 | one `candy:` kind, two shapes; `base:`/`from:` switch; mutually exclusive, schema-enforced | C2 | `spec/schema/node.cue`; concepts/00 | read | VERIFIED | concepts/00:79-83 cites `#CandyValue: (*#Candy | #Image)` |
| README:241-248 | class table: substrate/kind/verb/command/step/builder | C3 | provider census | section-scoped parse | **DIVERGENCE** | census classes are `{agent-runtime,build,builder,command,deploy,kind,loader,refs,step,terminal,verb}`; README's "substrate" is `deploy` + part of `kind`; omits 5 classes |
| README:250 | `candy:` registered by `candy/plugin-candy-kind` | C3 | corpus | grep | VERIFIED | `plugin-candy-kind/…/charly.yml:23` |
| README:258-284 | architecture items 1–5 (resolve→plugins over gRPC→build/deploy share IR→OCI labels→CUE upstream) | C3 | skills + `spec/spec/label_consts.go` | read/grep | VERIFIED (minor nuance) | `ai.opencharly.*` consts present; nuance: external plugins are declared by `@github` refs, not only a local `candy/` dir |
| README:286-309 | nesting = position; example `check-group:` with `group:` + nested `check-group-vm`; "real entry … abridged" | C2/C4 | `charly/charly.yml:1399` | diff | **DIVERGENCE** | actual `check-group` is a **`vm:`** node (`from: eval-vm`) — the `group:` kind was unrolled by `charly migrate`; no nested `check-group-vm`; `check-group-member` local remains nested |
| README:311-314 | nested local installs into parent candybox; reversible via ledger; `charly deploy del` | C1/C3 | binary; local-deploy skill | help | VERIFIED | `deploy del` help: `Usage: deploy del <name>` |
| README:316-327 | Podman/Docker first-class; `CHARLY_BUILD_ENGINE`/`CHARLY_RUN_ENGINE`; quadlets `charly-<name>.container`/`.service` | C3 | `spec/hostenv/runtime_config.go:158-159`; deploy skill | grep | VERIFIED | env vars present |
| README:331-367 | Vocabulary table | C2/C3 | concepts/00 + census | diff | **DEFECT** | two rows both labelled **deploy** (`:354`,`:355`); the second is the **fleet** term (`concepts/00:38`), and uses `charly deploy add` where concepts/00 says `charly fleet add` |
| README:370-374 | whole CLI served over MCP (HTTP or stdio) | C1/C3 | charly-mcp-cmd skill | read | VERIFIED | — |
| README:376-381 | "mcp … discovered from a project's candy/plugin-mcp … so point charly at a project that supplies it: `charly --repo opencharly/charly mcp serve`" | C3/C1 | corpus; binary | live run | **DIVERGENCE** | `--repo opencharly/charly mcp serve` → `unexpected argument mcp`; `command:mcp` is served by `plugin-mcp` — `charly --repo opencharly/plugin-mcp mcp serve` → rc=0, `Usage: mcp serve` |
| README:383-385 | AGENTS.md complete rulebook; CLAUDE.md adapter | C3/C7 | files | ls | VERIFIED | both exist, differ as intended |
| README:387-392 | marketplace ships skills + agents; harnesses Claude Code, Cursor, Codex, Kimi, `pi` | C3/C7 | marketplace skill | read | PARTIAL / UNVERIFIED | skills name Claude Code/Codex/Kimi/`pi`; **Cursor not evidenced** in the skills read |
| README:408 | candy link `…/reference/candy/github.com/opencharly/pod-sshd:v2026.239.1637/sshd/` | C7 | docs tree | find | **DIVERGENCE (candidate dead link)** | generated dir is `…/reference/candy/github-com-opencharly-pod-sshd-v2026-239-1637/sshd.md` (hyphenated, no `:`/`.`) |
| README:408 | box link `/reference/box/fedora/tutorial-shell/` | C7 | docs tree | find | VERIFIED | `docs/.../reference/box/fedora/tutorial-shell.md` |
| README:412,416 | CHANGELOG/README.md; MIT | C7 | files | ls/head | VERIFIED | `charly/LICENSE` = MIT |

## 5. Divergence register + RCA (R1)

All divergences below share one root mechanism: the docs predate **three cutovers** — the **candy
de-submodule cutover** (candies moved from `opencharly/charly/candy/*` to standalone
`layer-*`/`pod-*`/`plugin-*` repos), the **group-kind unroll** (`charly migrate`
`unroll-group-deploy`), and the **CI-time charly pin** replacing the docs submodule. Each is
dispositioned per **R2**, never blanket-classified: the README/rulebook/page corrections landed in
the merged PRs (§11); the product-adjacent items were fixed by aligning the docs to **correct**
product behaviour (D19: an external `base:` emits no distro packages, so the guide adds `distro:`;
D21: `pkg` is not a command, so the page drops it); the one remaining product change — retiring the
`group` provider — is the named batch `feat/retire-group-kind`.

| # | Doc | Expected (canonical) | Actual (doc) | Class | Owner repo | Proposed fix |
|---|---|---|---|---|---|---|
| D1 | README:25-34,128-129,191 | `layer-ripgrep:v2026.235.1653`, `pod-sshd:v2026.239.1637`, `layer-charly` (tag from repo) | `charly/candy/{ripgrep,sshd,charly}:v2026.251.1947` | doc-stale | charly | repoint refs to the owning repos + real tags; `sshd` is `pod-*` |
| D2 | README:120-137 | real tutorial-shell file | abridged/stale snippet | doc-stale | charly | quote the real `box/tutorial-shell/charly.yml` |
| D3 | README:180-191 | `check-fedora-vm.add_candy: layer-charly:v2026.241.1407` | `charly/candy/charly:v2026.251.1947` | doc-stale | charly | correct the ref |
| D4 | README:284-309 | `check-group` is a `vm:` node | `group:` + nested `check-group-vm` | doc-stale | charly | update example to the post-migrate shape |
| D5 | README:376-381 | `charly --repo opencharly/plugin-mcp mcp serve` | `--repo opencharly/charly mcp serve` (fails) | doc-stale | charly | fix the repo in the example |
| D6 | README:241-248 | census class `deploy` (+ `build/loader/refs/agent-runtime/terminal`) | "substrate", omits 5 classes | doc-stale | charly | align class names with the live census, or state it is a non-exhaustive teaching grouping |
| D7 | README:354-355; concepts/00:38,43,56; guides/the-cli; guides/troubleshooting | one `deploy` concept (CHANGELOG `2026.250.*`: "fleet vocabulary retires … fleet add/del/show → deploy add/del/show") | two README rows both labelled "deploy"; concepts/00 + guides still use the **retired** `fleet`/`charly fleet add` | doc-stale + doc defect | charly + docs | merge/relabel the duplicate README rows; claim-keyed sweep `fleet` → `deploy` across both repos |
| D8 | README:408 | `…/github-com-opencharly-pod-sshd-v2026-239-1637/sshd/` | `…/github.com/opencharly/pod-sshd:v2026.239.1637/sshd/` | doc-stale (dead link) | charly | point at the generated hyphenated path; confirm via the docs link gate |
| D9 | README:387-392 | harness list evidenced elsewhere | adds "Cursor" | doc-stale (unproven) | charly | verify Cursor support or drop it |
| D10 | `docs/README.md`, `docs/CLAUDE.md` | charly pinned **CI-time** in `deploy.yml` (`.gitmodules` pins only `marketplace`) | "PINS the charly repository as a submodule (`.gitmodules`)" | doc-stale | docs | correct the pin description; also `docs/README.md`'s generated list omits `grievances.md` |

## 6. Duplication register (R3, docs)

| Claim | Surfaces | Class | Canonical owner | Action |
|---|---|---|---|---|
| The full term glossary | `charly/README.md:331-367` **and** `docs/.../concepts/00-vocabulary.md` | DUPLICATE (both hand-authored) | `concepts/00-vocabulary.md` (it states "Each term below is defined once, here. Every other page … links back rather than redefining") | README should summarise + link, not restate; the duplicate `deploy` row (D7) is a symptom |
| Vendor/repo pin tables | README + box READMEs + skills | PROJECTION/MIRROR | generated docs / skills | not a violation (generated), except where a box README restated a distro-skill claim — cured in the merged distro PRs (§11). |
| Rulebook dispatcher tables | `charly/AGENTS.md` **and** `charly/CLAUDE.md` | MIRROR (sanctioned; must stay equivalent) | both root rulebooks | parity-check, never delete (Batch 3) |

## 7. Batches 2–5 findings (all verified, read-only)

Five independent workers, each R0-gated, verified the remaining hand-authored docs against the
pinned binary, `spec/schema/*.cue`, the Go tree, and the full umbrella corpus. Headline divergences
(D-codes continue the register; `D7` above is corrected):

**docs-site hand-authored pages (`docs/src/content/docs/{start,concepts,guides}/`):**

| Code | Doc | Divergence |
|---|---|---|
| D11 | `concepts/00:38,43,56`, `02:29`, `guides/the-cli:21,37`, `guides/troubleshooting:18` | **retired `fleet`** (`charly fleet add/del` → exit 80 "fleet command is retired … use `charly deploy add/del`"); `deploy` must replace it |
| D12 | `concepts/00:164` | `marketplace` listed as a **command** word; it is `kind:marketplace` (`plugin-harness-kind`) plus a project-scoped `command:marketplace` (`plugin-marketplace`) — not resolvable from a bare charly project |
| D13 | `concepts/00:120-131`, `02:53-74`, `quickstart:24-27,136-150` | tutorial-shell excerpt stale on every axis (2 vs 3 candies; dead `charly/candy/*` refs; wrong path); `quickstart:136-150` uses the **removed `group:` kind** (real `check-group` is a `vm:` node) |
| D14 | `concepts/02:79-82` | claims the box lists no init; the actual `distro-fedora/box/tutorial-shell/charly.yml` **explicitly lists** `layer-supervisord` (source contradiction — see escalation E1) |
| D15 | `concepts/00:133-147`, `02:141-154` | `plugin-example` `source:` is `github.com/opencharly/charly/candy/plugin-example`; actual `github.com/opencharly/plugin-example/candy/plugin-example`; link targets the wrong generated page |
| D16 | `concepts/00:98-115`, `02:34-51`, `06:45-67` | ripgrep `plan:` quoted short without ellipsis (1 or 4 of the real 6 checks) |
| D17 | `concepts/08:49` | warning string quoted as `referenced at multiple versions`; actual `Warning: candy %s resolved to multiple versions; using newest …` |
| D18 | `concepts/04:40-42`, `guides/the-cli:51-57` | `charly --repo opencharly/charly mcp serve` (same D5 root) |
| D19 | `guides/authoring-a-candy:112-124` | `box new box --base fedora` on a fresh project yields an **external** base with no distro tags → no package RUN; needs `distro: [fedora]` (reproduced live in `/tmp/audit2`) |
| D20 | `guides/authoring-a-plugin:39` | provider-class list says 7; `#ProviderClassNames` (`spec/schema/candy.cue:531`) defines 11 (adds `loader`,`refs`,`agent-runtime`,`terminal`) |
| D21 | `guides/the-cli:26` | `pkg` documented as a `charly box` child; no such command anywhere |
| D22 | `guides/troubleshooting:18` | both `fleet` retired **and** "VM deploy does not auto-provision" false — `plugin-deploy-vm` auto-boots (`lifecycle.go`) |
| D23 | `concepts/06:75-84`, `08:63-69`, `09:64-69` | pasted bed outputs with no reproducible run; the 06 sample's step count no longer matches the current composition |

**charly rulebooks + repo docs:**

| Code | Doc | Divergence |
|---|---|---|
| D24 | `AGENTS.md:249`,`CLAUDE.md:128`; `PROGRAM/nfpm:52,74` | R9 runtime-deps path `candy/charly/charly.yml` dangling — `candy/` deleted; actual `packaging/charly.yml` (charly) / `layer-charly/charly.yml` |
| D25 | `charly/charly/CLAUDE.md:11-13` | install-plan signpost names deleted files (`install_plan.go`, `install_build.go`, `build_target_oci.go`, `k8s_generate.go`, `deploy_preresolve.go`, `host_build_*`) — relocated to `spec/`/`sdk/deploykit` |
| D26 | `AGENTS.md:52-53`,`CLAUDE.md:34-35` | schema path `sdk/schema/*.cue` → actual `spec/schema/*.cue` (4 occurrences) |
| D27 | `AGENTS.md:56`,`CLAUDE.md:38` | egress paths/`vendor/` category list stale (actual `plugin-fleet/candy/plugin-fleet/egress.go`; schemas one level up; no `units`/`ssh_config` egress) |
| D28 | `AGENTS.md:445`,`CLAUDE.md:216` | docs repo "pins charly in `.gitmodules`" — same as D10; `.gitmodules` pins only `marketplace`, charly is CI-time pinned |
| D29 | `charly/charly/KERNEL_MANIFEST.md` | self-declared "draft" but the enforcing test already exists; ~8 inline `file:line` citations stale; several LOC figures stale (994→1257 etc.) |
| D30 | `box/{arch,cachyos,debian,fedora,ubuntu}/README.md` | stale ref shape `@github.com/opencharly/charly/candy/<name>` (actual `@github.com/opencharly/<layer-*|pod-*|plugin-*>…`); "all refs pin to a single tag" false (23–79 distinct tags) |
| D31 | `box/cachyos/README.md:44,79` | DAG leaf `docker.io/archlinux` should be `quay.io/archlinux/archlinux:base-…`; `renderPacstrapExtraConf` is in `sdk/buildkit/build_helpers.go`, not `charly/build.go` |
| D32 | `box/fedora/README.md:15,30-31` | `charly-fedora`/`fedora-test` called "(disabled)" (no `enabled:false`); "no `candy/` dir here" false (`candy/charly-marketplace` exists) |
| D33 | `box/omarchy/README.md:52,83` | claims `omarchy-keyring`/`omarchy-nvim` composed (absent); `[LICENSE](LICENSE)` dead (no LICENSE in any `box/*`) |
| D34 | `box/{debian,ubuntu}/README.md` | rebuild via `charly update <bed>`; canonical R9 gate is `charly check run <bed>` |
| D35 | `.pi/README.md:44` | "Claude Code … wire `.claude/hooks/*.sh`" — charly's own `.claude/settings.json` has no hooks block; routed to the named `feat/harness-parity` batch (the speculative `.pi` edit was reverted, so the divergence stands) |
| D36 | `PROGRAM/pi-integration.md:236,274-291` | premise that the R0 dispatcher table is generated by `charly marketplace generate` is stale (now hand-maintained prose) |

**MIRROR PARITY (AGENTS ↔ CLAUDE, sanctioned mirrors):** dispatcher tables are byte-identical (64/64
skill refs resolve). Policy drift: **P1 — preemptible standing authorization is present in
`CLAUDE.md:135` but absent from `AGENTS.md` "Disposable-Only Autonomy"** (the harness-neutral
rulebook omits an authorization the adapter grants); P2 — the AGENTS "quiet bed" rule is absent from
CLAUDE; P3/P4 minor wording.

**Foundations (read-only):** all `VISION.md`/`GRIEVANCES.md` links resolve except the source-side
`LIBERATION.md:185` candy URL (dot/colon form; the generator repairs it to the hyphenated route, so
the published page is fine). Mechanism claims in the foundations check out (`five substrates`,
`container-nesting`, the 4 nested beds, `ai.opencharlie.description`, `a11y-tools` distro map).
`GRIEVANCES.md:36-43` is additionally **TRUE at its own date** — `candy/ripgrep` did exist at tag
`v2026.201.0706`; the de-submodule cutover later moved it. **No foundation prose is changed.**

**Duplicates (R3):** README glossary ↔ `concepts/00` (canonical owner); six near-identical
`box/*/README.md` Build/Requirements sections (no owner); box READMEs restating distro skills;
`AGENTS.md` ↔ umbrella `AGENTS.md` restating R1–R10; `charly/{AGENTS,CLAUDE}.md` are a sanctioned
mirror. Dispatcher tables are sanctioned mirrors.

## 8. Escalation register (all resolved)

| # | Crossroad | Why it is not auto-resolved |
|---|---|---|
| E1 | **RESOLVED by RCA probe.** The explicit `layer-supervisord` in `distro-fedora/box/tutorial-shell/charly.yml` is REQUIRED; the box's own description/comments claiming "the INIT is deliberately absent … charly adds that init's own candy automatically" are **stale**. | Evidence: `charly box generate` on a fixture composing `pod-sshd` without a supervisord candy emits `warning: box … resolves init "supervisord", which depends on the "supervisord" candy, but no candy of that name is in this project's scanned set — nothing was injected … Reference the candy directly in the box's candy: list`. Fix = correct the distro-fedora box description/comments (source) + README/concepts prose; no operator ruling needed. |
| E2 | **RESOLVED.** `fleet` was retired in the CLI (`fleet → deploy`); the `fleet` term/vocabulary rows now read `deploy` (docs#119). | No operator ruling was needed. |
| E3 | **RESOLVED.** `KERNEL_MANIFEST.md` and its gate test were deleted; the boundary law is enforced by `import_purity_test.go` (charly#604). | No operator ruling was needed. |

## 9. Remediation plan (executed; landing log in §11)

The original plan was a two-repo cutover; execution split it by owning repo (the `box/*/README.md`
files live in the `distro-*` submodules, each of which required its own PR):

1. **charly PR** (`feat/docs-truth`, #604) — README D1–D9 + D14; rulebooks D24–D28 + mirror P1;
   `charly/charly/CLAUDE.md` D25; `.pi` reverted; `PROGRAM` D24/D36; KERNEL_MANIFEST retired (E3). R5 sweeps.
2. **docs PR** (`feat/retire-fleet`, #119) — hand-authored pages D11–D23; `docs/README.md`/`CLAUDE.md`
   D10/D28; the generated half regenerated at the pinned charly (deploy drift cleared).
3. **six distro PRs** (`feat/docs-refs`) — D30–D34 (`arch#36`, `cachyos#88`, `debian#22`, `fedora#52`,
   `omarchy#50`, `ubuntu#22`).
4. **distro-fedora** `feat/tutorial-shell-desc` (#51) — D14/E1 source fix.
5. **Validation** — every PR passed `charly/pr-validator`; charly#604 additionally ran the R10 bed.

## 10. Reproduction

```bash
charly version                                            # 2026.254.0903 (pinned worktree build)
charly box generate -C /tmp/reftest                       # D1 → remote candy … not found
charly --repo opencharly/charly mcp serve                 # D5 → unexpected argument mcp
charly --repo opencharly/plugin-mcp mcp serve --help      # → Usage: mcp serve
charly fleet add x                                        # D11 → the "fleet" command is retired … use deploy
charly --repo opencharly/charly box list boxes | head -5  # → agentteams/agentteams-manager/agentteams-worker/alpine-repo-box/arch.arch [testing]
```

## 11. Landing log (this run)

| PR | Repo | Result |
|---|---|---|
| #604 | opencharly/charly | **MERGED** — retire KERNEL_MANIFEST + `fleet` tombstone, README/rulebook/PROGRAM corrections. R10: `check-tutorial-shell` 14/14 PASS on `disposable: true`. |
| #51 | opencharly/distro-fedora | **MERGED** — tutorial-shell init description. |
| #36 | opencharly/distro-arch | **MERGED** — box README ref shape/citation/error string (landing rules reverted; only the dead citation fixed). |
| #88 | opencharly/distro-cachyos | **MERGED** — box README ref shape, DAG leaf, `RenderPacstrapExtraConf` location. |
| #22 | opencharly/distro-debian | **MERGED** — box README ref shape, `check run` bed verb. |
| #52 | opencharly/distro-fedora | **MERGED** — box README ref shape, "(disabled)", "no candy/ dir", "vendors no candies". |
| #50 | opencharly/distro-omarchy | **MERGED** — box README `omarchy-keyring`/`omarchy-nvim` claim, dead LICENSE link. |
| #22 | opencharly/distro-ubuntu | **MERGED** — box README ref shape, `check run` bed verb. |
| #119 | opencharly/docs | **MERGED** — `fleet` retirement + de-duplicated entity copies + false-claim fixes on the hand pages, and the generated half regenerated at the pinned charly (drift fixed: `plugin-pipeline`/`plugin-review` re-pinned). validator PASS, deploy PASS. |

### Remaining (1)

All nine PRs validated and merged. Outstanding: D35 (`.pi/README.md` hook-wiring claim) is routed to the named `feat/harness-parity` batch. The `group` provider’s retirement (from `hand`→generated surfaces) is a separate product cutover named `feat/retire-group-kind`; this audit kept `group` wherever the regenerated `providers.md` still listed it.
