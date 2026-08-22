# Changelog

**This `CHANGELOG/` directory is this repository's home for historical content.**
Every repository in the project keeps its **own** `CHANGELOG/` — history is
repo-scoped, never centralized in one file, and split into one file per CalVer
release version so no single file grows without bound.

`README.md`, `AGENTS.md`/`CLAUDE.md`, and `HARNESS-PARITY.md` describe the
**current** state of the umbrella — present tense, forward-looking. Any
reference to a previous version, a past rename, a completed cutover or
migration, a relocated / deleted / retired identifier, a "previously /
formerly / was / no longer", a dated change note, or a commit-referenced
cautionary tale belongs **here** and nowhere else.

## Layout

- **One file per CalVer release version:** `<YYYY.DDD.HHMM>.md` (e.g.
  `2026.234.0347.md`). The CalVer is computed once per landing (merge-time)
  and shared by the umbrella's snapshot tag.
- A PR opens with a placeholder file named for the entry's planned date;
  the org-wide pr-validator finalizes it to the merge-time CalVer before
  landing. Every PR must include a CHANGELOG entry (validator rule B19).
- The entry states what changed in one short paragraph, from the reader's
  perspective.

## Reader's guide

- Want the current contract? Read `README.md` + `AGENTS.md`.
- Want what changed in a snapshot? Read the newest `YYYY.DDD.HHMM.md`.
