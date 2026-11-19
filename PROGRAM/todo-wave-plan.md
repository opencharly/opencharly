# `TODO.md` — the wave plan for the 122 rows that remain

**Measured at `2026-11-19 19:00`.** Every count comes from a command; estimates say what they rest on.

**Updated with two fresh audits:** `§2` (25 rows re-measured) and `§5` (all 13 rows measured for the
first time). Both are folded in below.

---

## 1. Where the 122 are

| governs | items | done | **open** | moved |
|---|---|---|---|---|
| 0. Preconditions | 4 | 2 | **1** | 1 |
| 1. Decisions | 2 | 1 | **0** | 1 |
| 2. Schema | 26 | 2 | **22** | 2 |
| 3. Parsing and validation | 43 | 2 | **40** | 1 |
| 4. Generation | 6 | 0 | **6** | 0 |
| 5. Modules and the plugin protocol | 13 | 0 | **13** | 0 |
| 6. Plugins and the install IR | 9 | 0 | **8** | 1 |
| 7. Store, state, secrets and concurrency | 6 | 2 | **4** | 0 |
| 8. Command line | 4 | 0 | **3** | 1 |
| 9. Repositories | 2 | 1 | **1** | 0 |
| 10. Documentation | 3 | 0 | **3** | 0 |
| 11. Final proof | 2 | 0 | **2** | 0 |
| 12. OCE alignment | 15 | 2 | **8** | 5 |
| 13. Deployments, drivers, venues and captures | 7 | 0 | **7** | 0 |
| 14. Code rules and enforcement | 4 | 0 | **4** | 0 |

**`§2 + §3 + §5 = 75 of the 122`.**

**The census above is `TODO.md`'s own. The audit verdicts elsewhere in this plan are per-row findings on the subset each agent measured, so the two can differ by one row without either being wrong.** The one place they do differ today is `§2`: the census says 2 done / 22 open, but the audit found `2.5` done — so **`§2` is really 3 / 21**, and recording that is one of the text-only corrections named below.

---

## 2. The cheapest work, named — do this first

**Eleven rows are closable or sharpenable by correcting text alone.** This is the highest
return per round available anywhere in the file, and each one is a one-line diff with a grep behind it:

| row | what is wrong | the fix |
|---|---|---|
| **2.5** | `## Status` says done; the row body still says the runtime schema is assembled by text | **close it** — `schemaconcat` has 0 runtime callers (4 hits = 1 comment + the parity test) |
| **2.12** | **`## Status` makes a FALSE claim**: *"`build`, `produce`, `bootstrap_builder_image`, `enabled` and `network` carry no field at all"* | `bootstrap_builder_image` is still a field at **4 sites**; `build:` 1, `network:` 2. **The row stays open and the record is corrected** |
| **2.13** | names the `kubevirt` clause | `^#Kubevirt` defs = **0** — drop that clause; the other four kinds remain |
| **2.8** | asks to delete three verb-primary places | `plugin.primary` = **0**, so 1 of 3 is done; `verb_primaries` in `spec/schema` = 3 |
| **2.11** | one deployment-level `image?:` left | `schema/deploy.cue:133` — **one site from done** |
| **2.22** | `attempt:` and `retry:` coexist | `attempt?: #Count` landed (`:36`); `retry?: #Retry` still at `:72` — **one deletion from done** |
| **5.4** | `charly.yml` "is 2,216 lines" | it is **5,540**. The four markers are exact, so the premise stands: **count fix only** |
| **5.6** | `NewMeta` "105 sites" | **79**. The refs map is exactly 221: **count fix only** |
| **5.8** | `setCommandContext` "8 files" | **21** across `charly`/`sdk`/`spec`/`plugin-*` (25 if `.worktrees` counts — **the row must state its scope**) |
| **3.31** | marked LANDED on a target that has not arrived | `need?` at `candy.cue:41` **and** `requires_capability?` at `:69` both exist: **open** |
| **3.28 / 3.36 / 3.41 / 3.42** | stale premises | already corrected in `#1179` |

**`2.11` and `2.22` are NOT singular deletions** — the schema side of each is one line, but the cutover behind it is real: `2.22` carries **79 `sdk` retry sites** and `2.11` carries **49 `.Image` consumers across `sdk` and `charly`**. If either lands in Wave 1, §2's done count goes to 5
before any new shape work starts.

---

## 3. The five waves

Order is forced by the pin graph: `spec` → `sdk` → `charly` → candies.

### `§0` Preconditions (1 open) — needs the operator, not a wave
The census records **one open row in `§0`**, and it is a *precondition*: it gates work rather than being work. It has no PR and no gate — it needs a decision from the operator, and it is named first because a precondition that is not met makes every wave below it provisional. **This section was placed in no wave in the plan's first two drafts**, which is exactly the kind of omission a generated census does not catch on its own: the table listed it, and the waves silently skipped it.

### Wave 1 — `§2` schema (22 open) · `spec`
**Blocks everything.** The audits reduced this from "22 unknown rows" to a measured list:
- **4 shape unifications** with exact sites (`from_snapshot?:` 9, `need?`/`use?`/`provide?` 3/4/15, `lease:` 10, `grant:` 10)
- **2 schema-line changes backed by real cutovers** (`2.11`: 49 consumers; `2.22`: 79 sites) — **not** one-liners, and starting either as one would leave the cutover half-done, which the Cutover Sizing Law forbids
- **`2.16` is a ratchet, not a row**: `design-dpat.sh` reports **350 known violations** (close 54, absence 86, open 64, dup 7, union 139) against `design/dpat-baseline.tsv`. **The number to drive down is 350**, and it moves in every wave, not just this one.
- **`2.19`/`2.20`** add `guard:`/`reverse:` and a golden per action — these are new IR surface, and they unblock §6.

**Gate:** `cue vet` + `charly task cue-gen` clean-regeneration is a no-op.
**Estimate: 2–4 days**, ~4 PRs.

### Wave 2 — `§3` parser (40) · `sdk/loaderkit` + `spec`
The largest block and the plan's weak point. Depends on Wave 1's shapes.
- **No cheap corrections**: the audits confirmed §3's text is stable to the digit.
- 5 stale premises need the *rule* behind them checked (`3.41` measured as a rule: **no code compares a need against a grant**).
- ~10 PRs by mechanism (nesting, paths, images, repos, android, publish).
**Estimate: 4–7 days.**

### Wave 3 — `§5` plugin protocol (13) · `sdk`
**All 13 are code, none is a decision** — that is the audit's headline. Depends on Wave 1.
- `5.3` alone: five symbols are **still multiply defined** across `spec`/`sdk`/`charly`
  (`QuadletDir`, `StepDoMode`, `DeployExecutor`, `ComputeCalVer`, `CheckVerbProvider`).
- `5.7` is **exactly right in the row** — 13 provider classes, precisely as listed.
- `5.9` (deadline/error model on plugin calls) and `5.12` (the `api` role) are **new protocol surface**,
  so they need `spec/proto` changes first and are the slowest items in the wave.
- ~4 PRs.
**Estimate: 2–3 days.**

### Wave 4 — `§4 §6 §7` (17) · `sdk`
`§6`'s IR work is the riskiest — it touches every deploy target. `§7.3` stays open (`vm-images` = 12 sites).
**Estimate: 3–5 days**, ~5 PRs.

### Wave 5 — `§8 §9 §10 §11 §13` (16) · mixed
`§11` is by definition last: it is the proof the other eleven sections hold.
**Estimate: 2–4 days**, ~5 PRs.

### `§14` Code rules and enforcement (4 open) — crosses every wave
**The plan omitted this section entirely in its first draft**, which is why its table summed to 140 items while `TODO.md` says 146. It is not a wave: these four rows are the rules the other fourteen sections must satisfy, so each lands *with* the wave it governs rather than after it.

### `§12` OCE alignment (8 open, 5 moved) — parallel, **not yet measured**
**Estimate: 2–3 days, overlapped.**

---

## 4. ETA

| wave | rows | PRs | estimate |
|---|---|---|---|
| 1 · `§2` schema | 21 | ~4 | 2–4 d |
| 2 · `§3` parser | 40 | ~10 | **4–7 d** |
| 3 · `§5` plugin protocol | 13 | ~4 | 2–3 d |
| 4 · `§4 §6 §7` | 17 | ~5 | 3–5 d |
| 5 · the remainder | 16 | ~5 | 2–4 d |
| `§12` (overlapped) | 8 | ~3 | +0 d on the critical path |

**Critical path: 13–23 working days.**

The estimate assumes **one shape family per PR lands in 1–3 verdicts.** The evidence: the two
`sdk` bodies written by the generator passed **first try** (`#581`, `#587`); the `TODO.md` PR took
ten because its body was hand-written and its evidence was described rather than run.

**What would blow it out:** a cutover that turns out to need `spec` + `sdk` + `charly` together is
**one PR with the slowest of three gates**. Two of those in the wrong place and this becomes
4–6 weeks.

**The plan's weak point is Wave 2** — 40 parser rows, no cheap corrections, the largest body of
code in the org. If anything slips, it slips there, and by weeks.

---

## 5. Next, concretely

1. **Landed:** `#1184` merged — 3 closures, 6 re-premised, 2 retractions; `TODO.md` at `12 / 122 / 12`.
2. **Wave 1, in this order:** the `2.12` Status correction (a false claim in the durable record,
   so it goes first) → the four shape unifications → `2.19`/`2.20`.
3. **`charly task init` the four missing plugin repos** — `plugin-builder-*`, `plugin-check`,
   `plugin-kube`, `plugin-vm`. **Until they are materialized, sixteen `§6`/`§12` rows cannot be
   measured at all**, and no amount of grepping substitutes.
4. **Drive the `dpat` census** from 350 down as each wave lands; it is the one number that
   measures the whole objective rather than one section.
