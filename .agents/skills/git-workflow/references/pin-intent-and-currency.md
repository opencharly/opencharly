## The tracking contract — intent, the two structural rules, and the states

The umbrella records one commit per submodule (a gitlink) and checks it out DETACHED and clean.
That commit is the tip of the branch the submodule's `.gitmodules` entry declares — `main` for
every repo but two vendor forks, which declare `av1` and `stable` — **as of the last
fast-forward**. What that recorded value is ALLOWED to be, and whether it is the value the owning
repo actually serves, is the **tracking contract**. `charly task ff` is the operation that
satisfies it: it fast-forwards EVERY pin this repo declares onto the tip of the branch its
`.gitmodules` entry declares, and `charly task verify` FAILS on any pin that is behind. The
contract lives in ONE verb —
`verb: git-submodules`, owned by `opencharly/plugin-task` — whose `mode` is
`status` | `ff` | `verify` | `currency`.

`ff` is the only mode that writes. `currency` is a first-class mode of the SAME verb, and it is
the mode that answers "is the umbrella at `main`?".

**The mode is the CONTRACT, and it IS in a released binary.** A reader who needs the question
answered does NOT MEASURE it by hand: a hand-built `<path>: <recorded gitlink> vs <remote
default-branch HEAD>` table is a second implementation of a verb that already answers it, and it
drifts. Nor should the guidance carry the verb's COUNTS: they are a LIVE reading of the org's
remotes, not a constant. The counts belong to the verb's own output, where they are stamped.

**`currency` reads NO checkout state, and that is deliberate.** It compares the only two objects
that can answer the question — the recorded gitlink and the REMOTE — so the index-vs-checkout seam
(`opencharly/opencharly#461`) cannot arise in it by construction. Ancestry is the ONE read that
needs local objects, and its ABSENCE is REPORTED (`differs (no checkout to judge ancestry)`)
rather than folded into a verdict.

### A pin declares its INTENT

Every pin declares WHY it holds the value it does, in one of exactly two shapes, and they are not
interchangeable:

| intent | kind | what "current" means |
|---|---|---|
| `upstream:<ref>` | **LEAF** | the owning repo's OWN ref, read from the REMOTE. No local state enters the answer, so a leaf cannot inherit another repo's staleness. |
| `derived-from:<path>` | **EDGE** | the value is `<path>`'s recorded gitlink IN THIS REPO — so it is current exactly when that source is. When the source is not current the pin is `blocked-by`, and the producer leg is NAMED. |

An entry in `pin_map` **IS** an edge — `derived-from:<pinned_from>` — and needs no `intent:`
entry of its own. A path with neither an `intent:` entry nor a `branch=` in `.gitmodules` is
**`unpinned`**: reported as such, never silently treated as a leaf. Conversely a path with no
`intent:` but WITH a `branch=` does have an intent — `upstream:<branch> (implicit: .gitmodules
branch=)` — because `ff` advances every path outside `pin_map` to its own declared branch's tip,
so that IS what such a pin means; it was simply never written down.

**A submodule is BORN `unpinned`.** `git submodule add <url> <path>` writes `path`, `url` and
NOTHING else — no `branch =` — so the freshly added path has no intent, and `charly task verify`
fails STRUCTURALLY on it until the same commit declares one:

```sh
git submodule add <url> <path>
git config -f .gitmodules submodule.<path>.branch main
```

### The two structural rules

1. **An edge may not point at another edge — depth ≤ 2.** The graph is acyclic BY CONSTRUCTION,
   not by a validation that can be skipped, and the check covers EVERY edge source —
   `pinned_from` AND each explicit `derived-from:<path>`. A source that is itself an edge is
   refused BY NAME (`graph depth > 1: … an edge may not point at an edge`).
2. **Every leaf must be remote-verifiable.** A leaf is judged against the remote ref, so a leaf
   no namespace serves is structural (`ref-not-served`), and an edge whose declared source
   records no gitlink is refused rather than inherited from nothing.

### The states, and what each obliges

| state | fails? | what it means, and what it obliges |
|---|---|---|
| `cur` | no | the recorded gitlink IS the tip its intent names. Obliges nothing. |
| `behind` | **YES** | a LEAF whose recorded commit is an ANCESTOR of the served tip. This is the ordinary catch-up case: advance it with `charly task ff`. |
| `blocked-by <source> (<state>)` / `blocked-by <source>:<twin> (<state>)` | **YES, when it names a leg** | an EDGE that cannot advance from HERE because its producer is behind: an explicit `derived-from:<path>` inherits `<source>`'s state, while a `pin_map` edge carries the state of the source's OWN pin at the twin. Either way it NAMES the producer: advance that producer first, and this pin follows. |
| `not-on-the-served-line` | **YES** | neither commit is an ancestor of the other. Charly's history is **squash-merged**, so a pin taken before a merge is unreachable from the served ref — and a hand-pin to an unrelated commit yields the SAME two SHAs. The remedy for both is `charly task ff`, which will refuse the move and name the path if it is not a fast-forward. |
| `differs (no checkout to judge ancestry)` | **no** | the SHAs differ and the ancestry read could not be made, because no local object store holds the commit. Reported, never guessed at — a light tree is full of them, so this state is normal, not alarming. |
| `unpinned` | YES | no intent and no `branch=` — the pin cannot be judged at all. Declare one. |
| `no-source-pin` | YES | an EDGE whose declared source names no path, or records no gitlink in this repo's index. |
| `pin-mismatch` | YES | an EDGE whose recorded gitlink disagrees with its source's. Made to agree by `charly task ff` (or by the producing repo's PR), never by a hand-pin. |
| `unmerged` | YES | the recorded commit is AHEAD of the served tip — the pin names a commit the repo does not serve. Re-point it at a merged commit. |
| `ref-not-served` | YES | a LEAF for which no branch or tag of that name is served by the submodule's URL — the intent ITSELF is wrong. |
| `no-gitlink` / `no-url` | YES | the objects the contract rests on are missing from the index / `.gitmodules`. |
| `blocked-by <source> (not a declared pin)` / `blocked-by <source>:<twin> (no ref declared)` | YES | the edge names a producer that is NOT a declared pin, or a twin its source declares no ref for — so there is no leg to name and the pin is UNJUDGEABLE. The remedy is upstream: declare the producer, or give this pin its own `upstream:` intent. |

**No tag is consulted anywhere.** A pin is at a branch tip, not at a release tag. Whether a landing
minted its CalVer tag is the release workflow's question (`tag-on-merge`), not the pin's, and a pin
one commit above a tag is simply a pin at the branch tip.

### `ff` — the fast-forward, and what it refuses

`ff` fetches each path's remote, then advances a checkout ONLY when its current HEAD is an
ancestor of the target tip (or already equal). It stages the gitlink, materializes nothing it was
not asked to, and COMMITS nothing. It refuses, by name, every move that is not a fast-forward:

- a checkout carrying a local commit (measured: an unconditional detached switch leaves that
  commit in **zero** refs — reflog only, exit 0, nothing reported);
- an EDGE whose twin is BEHIND the checkout's HEAD — that is a rewind, and the remedy is the
  producer's: advance `charly`'s own `box/*` first;
- a dirty working tree (git itself refuses).

A path with NO checkout is advanced IN THE INDEX (`git update-index --add --cacheinfo
160000,<sha>,<path>`): the recorded gitlink IS the index entry, so a wave never has to
materialize a repo to record where it is tracked. The checkout is brought to it afterwards by
`charly task init`.

### The producer-first leg order

`currency` ends with `producer-first legs:` — the ORDER in which the sequence can actually
advance:

1. **the leaves that can advance now**, each `behind` leaf as
   `<path> (<recorded> -> <served>)`;
2. **then the edges those leaves unblock**, each `blocked-by` edge, verbatim.

The two degenerate readings are DISTINCT: `none — every pin is at the ref its intent names`
(nothing is behind) versus `none reachable from this repo` (this repo HAS behind pins, but every
one is blocked by a producer it cannot reach). **Read the legs as the work list:** a `blocked-by`
names the repo whose PR must land first — the same producer-first rule the cross-repo landing
order states: producer PR → merge → tag → consumer ff → umbrella gitlink bump.

### The intents belong in THIS repo's manifest

The umbrella declares its own intents in its `charly.yml`, next to the pins they describe, and the
six `distro-*` edges are the ONE `pin_map` in the `pins` task — never a second copy. Two
consequences worth knowing before editing either:

- **A `distro-*` pin cannot be advanced from the umbrella when charly's own `box/*` gitlink is
  behind.** The verb's source of truth for the edge IS that gitlink. The remedy is one hop
  upstream: advance `opencharly/charly`'s `box/*` (its own `charly task ff`), and the umbrella's
  pin then follows. Never hand-pin a `distro-*`.
- **The verb is domain-neutral by rule.** It knows paths, gitlinks and refs, and nothing about
  what a submodule CONTAINS. A fact about a repository's own composition rather than about a pin —
  a harness-config binding, a marketplace corpus family, a generated file — is that repository's
  own gate's to own, and asking the pin verb to see it would break its reusability for every other
  repository (the same reason its schema bakes in no org name and no distro list). See the
  harness-config half of an advance in `references/umbrella-mechanics.md`.
