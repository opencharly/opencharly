# PROGRAM/ — binding program north stars

This directory is the home for **programme-level** documents: the ones that are about a
body of work rather than about a component, and that therefore belong to no single repo.

The project rulebook names this surface ("Where things are documented") and pointed at it
before it existed. This file is the convention it promises.

## What belongs here

- **Programme ledgers** — the durable record of a multi-repo programme: what it is for, what
  has landed, what is blocked and on whom, and how a later session picks it up cold.
- **North stars** — a binding statement of direction that outlives the sessions working on
  it: what the programme will and will not do, and what would change it.
- **Cross-repo cutover plans** — a change that spans several repos with a producer-first
  order, where the plan itself is the shared artefact.
- **Dated post-mortems** — what a programme learned, addressed to whoever inherits it.

## What does not

| Content | Its home |
|---|---|
| Philosophy, architecture, key rules | the root `AGENTS.md` |
| How to use a command, layer property, image composition | the owning skill (`marketplace/<family>/skills/<name>/`) |
| A single repo's user overview | that repo's `README.md` |
| What changed, why, when | `CHANGELOG/` — history only |

The test is the reader, not the topic. If a session would load it to *do its job in one
repo*, it is a skill or a README. If a session would load it to understand *what a programme
is trying to achieve and where it got to*, it belongs here.

## Naming and shape

- One file per programme or per north star: `<programme-or-theme>.md`, lower-case and
  hyphenated, mirroring how repos are named.
- A file opens by saying **what it is for and who reads it**, then the state, then the
  open questions. A reader arriving cold should know within one screen whether it concerns
  them.
- **Dated round logs are welcome inside them** — a programme ledger is a live document, and
  appending a dated section is the correct way to keep it true. Corrections are appended
  too, naming what was wrong, never edited away silently.
- **A file here states facts it can point at** — a command and its output, a commit, a tag, a
  measurement. A programme document that cannot be checked is an aspiration, not a ledger.

## Lifecycle

- **Current, not historical.** A programme document describes the world as it is and what is
  still open. When a programme finishes, its closing section says so and the document stays
  as the record; its history belongs in the `CHANGELOG/` of the repos it landed in.
- **Update it where the work happens.** A programme document is edited by the session that
  moves the programme, in the same change that moves it, so it never trails the work.
- **Corrections are explicit.** A record with a quiet edit in it is worse than one with a
  visible correction, because the next reader cannot tell which parts have been re-checked.

## Provenance

Written because the rulebook pointed here and the directory did not exist, so a programme
ledger had nowhere sanctioned to land (`opencharly/opencharly#493`). It carries no programme
content of its own — the first real entry is the one that needed it.
