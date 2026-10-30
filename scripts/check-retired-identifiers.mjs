#!/usr/bin/env node
// check-retired-identifiers.mjs — the umbrella's own tracked tree names NO identifier the
// contract has withdrawn, and the names it is judged against are READ FROM the contract.
//
// WHY THE LIST IS READ, NOT WRITTEN HERE (opencharly/opencharly#799): the contract
// publishes the canonical inventory of withdrawn identifiers — opencharly/spec's
// `retired/identifiers.json` — and its own guard judges the contract's tree against it.
// A name that lives only inside the assertion that guards it is a name no other control
// can read, so the next claim class — the same name re-added somewhere else in the org —
// is missed by the same mechanism, by the same accident. So the key set is the CONTRACT'S,
// read from the pinned submodule, and this file spells no withdrawn name of its own: a
// gate whose own source carries the names it forbids would have to exempt its own source,
// and that exemption is a hole.
//
// WHY THE TREE IS THE CONTRACT'S TOO (the umbrella is a VIEW, not an owner): the contract's
// list records each name together with the SURFACE it was withdrawn from — a Go struct
// field, an authored configuration key, an environment variable, a command-line flag —
// and a name can be withdrawn from one surface while it is still legal on another. So the
// list's entries carry a SCOPE: a name confined to one Go type is not withdrawn everywhere
// (`build` is still a legal key on the box schema), and the contract's own rule for a
// surface without Go types is that a SCOPED name is not swept there at all. This gate
// applies the contract's rules to the umbrella's own surfaces, which are all TEXT —
// prose, configuration and scripts — and the contract's rule for a text surface is that
// the prose IS part of the published surface.
//
// WHAT THE RULE IS (the contract's, applied here): a withdrawn name matches where it
// occurs as a TOKEN — not inside a longer word — and only the UNSCOPED entries are swept
// on a text surface, because a scope is a Go type and a text file has no such notion.
// The contract's OTHER half — a withdrawn FIELD is a Go DECLARATION — has no surface in
// this tree: the umbrella declares no Go struct. That is stated in the coverage line the
// gate prints, so a reader never has to guess how far the gate reached.
//
// WHY A HIT IS CLASSIFIED, NOT ASSUMED (the org's own practice, committed): a hit is not
// automatically a carrier. The org's own sweeps classify every hit BY HAND — the corpus's
// own sweep ships the classification table (history; a counter-instance that DENIES the
// name; an explanatory comment that names it; a live claim) — and the distinction is
// semantic: a sentence that denies a name and a sentence that sets its value carry the
// same name and mean opposite things. A control that reported both as a defect would
// cry wolf on the org's own correct documentation, and a control that GUESSED the
// distinction would miss the carriers it exists to catch. So the classification is READ
// from this repo's own records file and every entry carries its WHY: a hit that no record
// covers is a carrier, and a record that covers no hit is ITSELF a finding — the file
// cannot rot into a hole that hides a live use.
//
// THE RECORDS FILE (scripts/retired-records.json) is DATA, shaped like the contract's
// own list: `{"records": [{"file", "identifier", "contains", "why"}]}`. `file` is the path
// the hit is in, `identifier` is the withdrawn name (it must be one the contract
// publishes — a record cannot invent a name), `contains` is the text the record's line
// must carry, and `why` says why the mention is a record rather than a use. A record
// covers every hit that matches all three, and ONLY the identifier it names: a record
// about one name can never excuse another. The file is excluded from the sweep for the
// same reason the contract's own list is: it is where the names are SUPPOSED to appear.
//
// SCOPE: the umbrella's OWN tracked files. A submodule is a repo of its own, with its own
// rulebook and its own gates; the contract's guard judges the contract's tree, and the
// org-ruleset arm reaches the repos this gate cannot. What this gate judges is printed
// with its verdict, because "a sweep that covered the org" is a claim, and a claim nobody
// can re-derive drifts.
//
// A CONTRACT THAT IS NOT CHECKED OUT makes the gate SKIP VISIBLY: the list is the
// contract's, and without it there is nothing to judge. A skip nobody can see is a gate
// that stopped judging (R8).
//
// usage: node scripts/check-retired-identifiers.mjs [--root <dir>] [--self-test]
// exit 0 clean or skipped · 1 a withdrawn name survives in the tree

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { gitFixture, trackedFiles } from "./lib/tracked-tree.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SELF_REL = "scripts/check-retired-identifiers.mjs";
const argv = process.argv.slice(2);
const argVal = (name) => {
  const i = argv.indexOf(name);
  return i === -1 || i + 1 >= argv.length ? null : argv[i + 1];
};
const root = resolve(argVal("--root") ?? join(here, ".."));

// The CONTRACT'S list, at the pinned submodule's path. The path is quoted here in CODE —
// not in a comment — because the umbrella's own working-set derivation (source 4 in
// scripts/init-submodules.sh) reads the paths the gate scripts QUOTE: a gate that reads
// a surface in a submodule must have that submodule materialized, or the light tree's
// gate would skip a comparison the full tree's gate makes.
const LIST_REL = "spec/retired/identifiers.json";

// This repo's own classification of the hits that are RECORDS rather than carriers —
// the org's hand sweep, committed (see the header). It carries the withdrawn names as
// data, so it is excluded from the sweep for the same reason the contract's list is.
const RECORDS_REL = "scripts/retired-records.json";

/* The word rule: a letter, a digit or an underscore — the contract's own definition
 * (`isWordByte` in the contract's retired/scan.go). A name next to one of these is part
 * of a longer word and is not a match, which is what keeps a short name from matching
 * inside the longer name that extends it. */
const isWordByte = (code) =>
  code === 95 /* _ */ ||
  (code >= 48 && code <= 57) /* 0-9 */ ||
  (code >= 97 && code <= 122) /* a-z */ ||
  (code >= 65 && code <= 90) /* A-Z */;

/**
 * The index of the first TOKEN occurrence of name in text, or -1 when there is none.
 *
 * The rule lives here and nowhere else, so the predicate and the line reporter cannot
 * disagree about WHICH occurrence matched: a name whose first substring sits inside a
 * longer word is not a match, and reporting the line of that substring would point the
 * reader at a place the name does not occur.
 */
function tokenIndex(text, name) {
  if (!name || name.length > text.length) return -1;
  for (let from = 0; from + name.length <= text.length; ) {
    const i = text.indexOf(name, from);
    if (i < 0) return -1;
    if (!isWordByte(text.charCodeAt(i - 1)) && !isWordByte(text.charCodeAt(i + name.length))) return i;
    from = i + 1;
  }
  return -1;
}

/** The 1-indexed line the first TOKEN occurrence of name is on. */
function lineOf(text, name) {
  const i = tokenIndex(text, name);
  if (i < 0) return 0;
  return text.slice(0, i).split("\n").length;
}

/**
 * The contract's list, read from the pinned submodule.
 *
 * Returns null when the contract is not checked out — the caller SKIPS visibly then.
 */
function readRegistry(rootDir) {
  const path = join(rootDir, LIST_REL);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed.identifiers)) {
    throw new Error(`${LIST_REL} carries no identifiers array — the contract's list has changed shape`);
  }
  return parsed.identifiers;
}

/**
 * This repo's own records: the hits that are a RECORD of a withdrawal, not a use of it.
 *
 * Returns an empty list when the file is absent — a tree that carries no record yet is
 * a tree whose every hit is a carrier, which is the correct reading, not a skip.
 */
function readRecords(rootDir) {
  const path = join(rootDir, RECORDS_REL);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed.records)) {
    throw new Error(`${RECORDS_REL} carries no records array — the records file has changed shape`);
  }
  return parsed.records;
}

/**
 * The entries a TEXT surface is swept against: the UNSCOPED ones.
 *
 * A scope is a Go type, and a text surface has no Go types — the contract's own rule for
 * its text surfaces ("a scoped name is not swept here"). The scoped entries are counted
 * and reported, never silently dropped: a reader must be able to see that the tree was
 * judged against eight names and not eleven.
 */
function sweptEntries(registry) {
  return registry.filter((id) => !id.type);
}

/** The paths of a tree that are this tree's own content, and TEXT. */
function textFiles(dir) {
  const out = [];
  for (const rel of trackedFiles(dir)) {
    // CHANGELOG/ is HISTORY: it records what happened, including the very cutovers
    // that withdrew the names this gate sweeps. A record of a withdrawal is not a
    // claim that the name is still in use.
    if (rel.startsWith("CHANGELOG/")) continue;
    // The CONTRACT'S LIST is where the names live: it is the one place a withdrawn
    // name is SUPPOSED to appear, so a hit in it is the contract working, not a
    // claim. The list normally sits behind a gitlink and is excluded by that rule
    // already; naming the path here keeps the rule true if the list is ever read
    // from a vendored copy instead.
    if (rel === LIST_REL) continue;
    // THIS REPO'S RECORDS FILE is where a mention of a withdrawn name is SUPPOSED to
    // appear: it classifies the hits that record a withdrawal rather than use it. A hit
    // in it is the classification working, not a claim — the same rule the contract's own
    // list is held to.
    if (rel === RECORDS_REL) continue;
    let text;
    try {
      text = readFileSync(join(dir, rel), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue; // binary
    out.push({ path: rel, text });
  }
  return out;
}

/** Every withdrawn name the tree carries, with where it stands. */
function sweep(dir, registry) {
  const entries = sweptEntries(registry);
  const findings = [];
  for (const file of textFiles(dir)) {
    for (const id of entries) {
      if (tokenIndex(file.text, id.name) < 0) continue;
      const line = lineOf(file.text, id.name);
      findings.push({
        identifier: id,
        file: file.path,
        line,
        text: file.text.split("\n")[line - 1]?.trim() ?? "",
      });
    }
  }
  return { findings, applied: entries };
}

/**
 * Split the hits into CARRIERS (a live use of a withdrawn name) and RECORDS (a mention
 * that records the withdrawal), and report the records that match nothing.
 *
 * The classification is the org's own hand sweep, committed: the corpus's sweep ships the
 * same table in prose, because the distinction is semantic and no mechanical rule reads
 * it. A hit that no record covers is a carrier. A record that covers no hit is itself a
 * finding — a stale record is a hole that has stopped matching the tree it was written
 * for, and a hole that silently stops exempting anything is exactly what this file must
 * never be.
 *
 * A record covers only the identifier it names and only the file it names: a record
 * written about one withdrawn name can never excuse a different one.
 */
function classify(findings, records, registry) {
  const sweptNames = new Set(sweptEntries(registry).map((id) => id.name));
  const carriers = [];
  const recorded = [];
  const stale = [];

  for (const rec of records) {
    const wellFormed =
      rec &&
      typeof rec.file === "string" &&
      rec.file !== "" &&
      typeof rec.identifier === "string" &&
      rec.identifier !== "" &&
      typeof rec.contains === "string" &&
      rec.contains.trim() !== "";
    if (!wellFormed) {
      stale.push({ rec, why: "a record must name a file, an identifier and the text it covers" });
      continue;
    }
    if (!sweptNames.has(rec.identifier)) {
      stale.push({
        rec,
        why:
          `the identifier ${rec.identifier} is not one the contract publishes for a text surface, ` +
          "so the record cannot cover anything",
      });
      continue;
    }
    const hits = findings.filter(
      (f) => f.file === rec.file && f.identifier.name === rec.identifier && f.text.includes(rec.contains),
    );
    if (hits.length === 0) {
      stale.push({ rec, why: "it matches no occurrence of that identifier in the tree" });
      continue;
    }
    for (const hit of hits) recorded.push({ rec, hit });
  }

  const covered = new Set(recorded.map((r) => r.hit));
  for (const f of findings) if (!covered.has(f)) carriers.push(f);
  return { carriers, recorded, stale };
}

/** The coverage line: what the gate judged, and what it did not. */
function coverageLine(registry, applied, recorded) {
  const scoped = registry.length - applied.length;
  return (
    `scope: this tree's tracked text files; gitlinks excluded (another repo's tree), ` +
      `symlinks excluded (another path's content), CHANGELOG/ excluded (history, not a current claim), ` +
      `binary files excluded — and NOT this gate's own file, which is swept like any other` +
      `\n      judged against: ${applied.length} unscoped entr(ies) of ${registry.length} the contract publishes` +
    (scoped > 0
      ? `; ${scoped} scoped entr(ies) name a Go type, and a text surface has no Go types, so they are not swept here`
      : "") +
    `\n      classified: ${recorded} hit(s) are RECORDS — mentions this repo declares in ${RECORDS_REL}, ` +
    `each with its why; a hit no record covers is a carrier, and a record that covers no hit is a finding` +
    `\n      coverage: the list is read from ${LIST_REL} at the pinned gitlink; a submodule is a repo of ` +
    `its own with its own gates, so this gate judges the umbrella's tree and not the org's — ` +
    `the org-ruleset arm reaches the repos this one cannot`
  );
}

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);
const skip = (m) => console.log(`  SKIP  ${m}`);

// --- the small git helper the fixtures need -----------------------------------------

function spawnGit(dir, args) {
  spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
}

// --- the self-test: every rule must be able to go RED (R7) ---------------------------

/**
 * The discrimination cases this gate's self-test exercises.
 *
 * `scenario` is the PHRASE the shipped `charly.yml` step description carries, and the
 * self-test's summary line prints them — so the description and the mechanism can be
 * compared by a reader, which is the defect the umbrella's own marker gate was bitten
 * by (opencharly/opencharly#812: a description is prose, a self-test is a mechanism, and
 * until the two compared themselves a description could name two of the three cases the
 * self-test proved). This gate does NOT assert that comparison against the manifest:
 * the mechanism for that lives in ONE gate (check-bang-arm-ownership.mjs), and a second
 * copy of it would be a second implementation of one behaviour (R2) — so this gate
 * PRINTS the phrases and lets the description carry them.
 */
const CASES = [
  { id: "every-unscoped-entry-is-effective", scenario: "a planted withdrawn name is found" },
  { id: "the-swept-set-is-the-contracts-unscoped-set", scenario: "the swept set is the contract's unscoped set" },
  { id: "a-scoped-name-is-not-swept-here", scenario: "a name scoped to a Go type is not swept on a text surface" },
  { id: "a-name-inside-a-longer-word-is-not-a-match", scenario: "a name inside a longer word is not a match" },
  { id: "a-changelog-entry-is-history", scenario: "a CHANGELOG entry is not a claim" },
  { id: "a-gitlink-is-another-repos-tree", scenario: "a gitlinked path is another repo's tree" },
  { id: "a-symlink-is-another-paths-content", scenario: "a symlinked path is another path's content" },
  { id: "a-binary-file-is-not-text", scenario: "a binary file is not text" },
  { id: "the-gate-sweeps-its-own-source", scenario: "the gate's own source is swept like any other file" },
  { id: "the-contracts-own-list-is-not-a-claim", scenario: "the contract's own list is not a claim" },
  { id: "the-records-file-is-not-a-claim", scenario: "the records file is not a claim" },
  { id: "a-declared-record-is-not-a-carrier", scenario: "a declared record is not a carrier" },
  { id: "a-record-exempt-only-the-identifier-it-names", scenario: "a record exempts only the identifier it names" },
  { id: "a-stale-declared-record-is-a-finding", scenario: "a stale declared record is a finding" },
];

function selfTest(registry) {
  const applied = sweptEntries(registry);
  const scoped = registry.filter((id) => id.type);

  if (applied.length === 0) {
    fail("the sweep is VACUOUS: the contract's list carries no unscoped entry, so nothing is swept");
    return;
  }
  if (scoped.length === 0) {
    fail("the scoping rule is UNPROVABLE: the contract's list carries no scoped entry");
    return;
  }

  const scratchDirs = [];
  try {
    // EVERY unscoped entry is EFFECTIVE: a name the contract publishes, planted in a
    // tracked file, is found. A name the gate cannot see is a name it cannot keep out.
    const plant = (name) => `the planted ${name} must be found\n`;
    let ineffective = 0;
    for (const id of applied) {
      const dir = gitFixture({ "README.md": plant(id.name) }, "charly-retired-fixture-");
      scratchDirs.push(dir);
      const { findings } = sweep(dir, registry);
      if (!findings.some((f) => f.identifier.name === id.name)) {
        ineffective += 1;
        fail(`the sweep is VACUOUS for this entry: ${id.name} was planted in a tracked file and not found`);
      }
    }
    if (ineffective === 0) {
      ok(`every unscoped entry is EFFECTIVE: ${applied.length} planted name(s), each found in a tracked file`);
    }

    // The SWEPT SET is the contract's unscoped set — exactly the entries the contract
    // publishes without a scope. The expectation is stated HERE, in the test, and not
    // recomputed with the implementation it checks: a test that recomputes the answer
    // with the code under test proves nothing (R7 — a test that cannot fail is invalid).
    // Without this case a gate that quietly DROPPED an entry from its swept set would
    // plant nothing for it and stay green — the very defect a withdrawn name needs.
    const expected = registry.filter((id) => !id.type);
    const sweptNames = applied.map((id) => id.name);
    const notSwept = expected.filter((id) => !sweptNames.includes(id.name));
    const sweptAnyway = applied.filter((id) => expected.every((e) => e.name !== id.name));
    if (notSwept.length > 0 || sweptAnyway.length > 0) {
      fail(
        `the swept set is not the contract's unscoped set: ${notSwept.length} entr(ies) the contract ` +
          `publishes without a scope are NOT swept, ${sweptAnyway.length} are swept that should not be`,
      );
    } else {
      ok(
        `the swept set IS the contract's unscoped set: ${expected.length} entr(ies), none missing and none extra`,
      );
    }

    // The SCOPING rule is effective: a name the contract scopes to a Go type has no
    // surface on a text surface, so a text tree never carries it.
    const scopedName = scoped[0].name;
    const scopedDir = gitFixture({ "README.md": plant(scopedName) }, "charly-retired-fixture-");
    scratchDirs.push(scopedDir);
    if (sweep(scopedDir, registry).findings.length !== 0) {
      fail(
        `the scoping rule cries wolf: ${scopedName} is scoped to ${scoped[0].type} and was planted in a ` +
          `tracked file, and the gate reported it anyway`,
      );
    } else {
      ok(
        `the scoping rule is EFFECTIVE: ${scopedName} is scoped to ${scoped[0].type}, and a text surface is not swept for it`,
      );
    }

    // The TOKEN rule is effective: the name inside a longer word is not the name.
    const wordName = applied.find((id) => /[A-Za-z0-9_]$/.test(id.name));
    if (!wordName) {
      fail("the token rule is UNPROVABLE: no unscoped entry ends in a word character");
    } else {
      const longer = `x_${wordName.name}`;
      const tokenDir = gitFixture({ "README.md": `the planted ${longer} must NOT be found\n` }, "charly-retired-fixture-");
      scratchDirs.push(tokenDir);
      const wrong = sweep(tokenDir, registry).findings.find((f) => f.identifier.name === wordName.name);
      if (wrong) {
        fail(`the token rule cries wolf: ${wordName.name} was planted inside ${longer} and the gate reported it`);
      } else {
        ok(`the token rule is EFFECTIVE: ${wordName.name} planted inside ${longer} is not a match`);
      }
    }

    // CHANGELOG/ is history: a record of a withdrawal is not a claim that the name
    // is still in use.
    const changelogDir = gitFixture(
      { "CHANGELOG/2026.001.0001.md": plant(applied[0].name) },
      "charly-retired-fixture-",
    );
    scratchDirs.push(changelogDir);
    if (sweep(changelogDir, registry).findings.length !== 0) {
      fail("the history exclusion cries wolf: a withdrawn name in a CHANGELOG entry was reported");
    } else {
      ok("the history exclusion is EFFECTIVE: a withdrawn name in a CHANGELOG entry is not a claim");
    }

    // A GITLINK is another repo's tree: this repo's rules are not that repo's rules.
    // The name lives ONLY inside the gitlinked path, so the assertion below is not
    // vacuous: a gate that read the gitlink's content would report it.
    const gitlinkDir = gitFixture({ "README.md": "nothing here\n" }, "charly-retired-fixture-");
    scratchDirs.push(gitlinkDir);
    mkdirSync(join(gitlinkDir, "vendor/thing"), { recursive: true });
    writeFileSync(join(gitlinkDir, "vendor/thing/inner.md"), plant(applied[0].name));
    spawnGit(gitlinkDir, ["add", "-A"]);
    spawnGit(gitlinkDir, ["rm", "-r", "--cached", "-q", "vendor/thing"]);
    spawnGit(gitlinkDir, [
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${"1234567890123456789012345678901234567890"},vendor/thing`,
    ]);
    const gitlinkHits = sweep(gitlinkDir, registry);
    if (trackedFiles(gitlinkDir).includes("vendor/thing")) {
      fail("the gitlink exclusion is INEFFECTIVE: the gitlinked path is listed among this tree's files");
    } else if (gitlinkHits.findings.length !== 0) {
      fail("the gitlink exclusion cries wolf: a withdrawn name in a gitlinked path was reported");
    } else {
      ok("the gitlink exclusion is EFFECTIVE: a gitlinked path is another repo's tree, and is not this tree's file");
    }

    // A SYMLINK is another path's content. The name lives ONLY in the link's target,
    // and the target is OUTSIDE this tree: a gate that read through the link would
    // report it, and a gate that sweeps the target as a file of this tree would not
    // see it at all.
    const symlinkDir = gitFixture({ "README.md": "nothing here\n" }, "charly-retired-fixture-");
    scratchDirs.push(symlinkDir);
    const outsideDir = mkdtempSync(join(tmpdir(), "charly-retired-outside-"));
    scratchDirs.push(outsideDir);
    writeFileSync(join(outsideDir, "target.md"), plant(applied[0].name));
    symlinkSync(join(outsideDir, "target.md"), join(symlinkDir, "linked.md"));
    spawnGit(symlinkDir, ["add", "-A"]);
    if (trackedFiles(symlinkDir).includes("linked.md")) {
      fail("the symlink exclusion is INEFFECTIVE: the symlink is listed among this tree's files");
    } else if (sweep(symlinkDir, registry).findings.length !== 0) {
      fail("the symlink exclusion cries wolf: a withdrawn name behind a symlink was reported");
    } else {
      ok("the symlink exclusion is EFFECTIVE: a withdrawn name behind a symlink is another path's content");
    }

    // A BINARY file is not text, and a name inside it is not a claim.
    const binaryDir = gitFixture({ "README.md": "nothing here\n" }, "charly-retired-fixture-");
    scratchDirs.push(binaryDir);
    writeFileSync(join(binaryDir, "blob.bin"), Buffer.from([0x00, 0x01, ...Buffer.from(applied[0].name)]));
    spawnGit(binaryDir, ["add", "-A"]);
    if (sweep(binaryDir, registry).findings.length !== 0) {
      fail("the binary exclusion cries wolf: a withdrawn name in a binary file was reported");
    } else {
      ok("the binary exclusion is EFFECTIVE: a withdrawn name in a binary file is not a claim");
    }

    // The gate sweeps its OWN source: it does not exempt itself, so a name that
    // reached this file would be found here too.
    const ownDir = gitFixture({ [SELF_REL]: plant(applied[0].name) }, "charly-retired-fixture-");
    scratchDirs.push(ownDir);
    if (sweep(ownDir, registry).findings.length === 0) {
      fail("the gate exempts its own source: a withdrawn name planted in the gate's own file was not found");
    } else {
      ok("the gate sweeps its OWN source: a withdrawn name planted in the gate's own file is found");
    }

    // The CONTRACT'S OWN LIST is where the names live: a withdrawn name in it is the
    // contract working, not a claim that the name survives.
    const listDir = gitFixture({ [LIST_REL]: plant(applied[0].name) }, "charly-retired-fixture-");
    scratchDirs.push(listDir);
    if (sweep(listDir, registry).findings.length !== 0) {
      fail(`the list exclusion cries wolf: a withdrawn name in the contract's own list file was reported`);
    } else {
      ok("the list exclusion is EFFECTIVE: a withdrawn name in the contract's own list file is not a claim");
    }

    // The RECORDS FILE is where a mention of a withdrawn name is SUPPOSED to appear: it
    // classifies the hits that record a withdrawal rather than use it, so it carries the
    // names as data. A hit in it is the classification working, not a claim.
    const recordsFileDir = gitFixture({ [RECORDS_REL]: plant(applied[0].name) }, "charly-retired-fixture-");
    scratchDirs.push(recordsFileDir);
    if (sweep(recordsFileDir, registry).findings.length !== 0) {
      fail("the records exclusion cries wolf: a withdrawn name in this repo's records file was reported");
    } else {
      ok("the records exclusion is EFFECTIVE: a withdrawn name in this repo's records file is not a claim");
    }

    // A DECLARED RECORD is not a carrier. The org's hand sweep classifies every hit — a
    // sentence that denies a withdrawn name records the withdrawal, a sentence that sets
    // its value uses it — and this repo commits that classification in its own records
    // file.
    // The case is proven against a REAL records file in a REAL tree, because the
    // classification is only worth anything if the file is read the way it is written.
    const recordName = applied[0].name;
    const recordDir = gitFixture(
      {
        "README.md": `there is no ${recordName} in this tree\n`,
        [RECORDS_REL]: JSON.stringify({
          records: [
            {
              file: "README.md",
              identifier: recordName,
              contains: "there is no",
              why: "the sentence records the withdrawal rather than using the name",
            },
          ],
        }),
      },
      "charly-retired-fixture-",
    );
    scratchDirs.push(recordDir);
    const recordVerdict = classify(sweep(recordDir, registry).findings, readRecords(recordDir), registry);
    if (recordVerdict.carriers.length !== 0) {
      fail("the record exemption is INEFFECTIVE: a declared record was reported as a carrier");
    } else if (recordVerdict.recorded.length !== 1) {
      fail(
        `the record exemption did not classify: ${recordVerdict.recorded.length} hit(s) were classified as ` +
          `records, expected 1`,
      );
    } else {
      ok("the record exemption is EFFECTIVE: a declared record is classified as a record, not a carrier");
    }

    // A record names ONE identifier: a record written about one withdrawn name must not
    // excuse a different one, or the records file is a hole with a why attached.
    const otherEntry = applied.find((id) => id.name !== recordName);
    if (!otherEntry) {
      fail("the record binding is UNPROVABLE: the contract publishes no second unscoped name to bind against");
    } else {
      const bindDir = gitFixture(
        {
          "README.md": `the planted ${otherEntry.name} must be found\n`,
          [RECORDS_REL]: JSON.stringify({
            records: [
              {
                file: "README.md",
                identifier: recordName,
                contains: "the planted",
                why: "a record about a different name",
              },
            ],
          }),
        },
        "charly-retired-fixture-",
      );
      scratchDirs.push(bindDir);
      const bindVerdict = classify(sweep(bindDir, registry).findings, readRecords(bindDir), registry);
      if (bindVerdict.carriers.length !== 1 || bindVerdict.carriers[0].identifier.name !== otherEntry.name) {
        fail(
          `the record binding is INEFFECTIVE: a record about ${recordName} excused a hit of ${otherEntry.name}`,
        );
      } else {
        ok(`the record binding is EFFECTIVE: a record about ${recordName} does not excuse ${otherEntry.name}`);
      }
    }

    // A STALE record is a finding: a record that matches no hit is a hole that stopped
    // exempting, and a hole that silently stops exempting is the one thing this file
    // must never be.
    const staleDir = gitFixture(
      {
        "README.md": "nothing to see here\n",
        [RECORDS_REL]: JSON.stringify({
          records: [
            {
              file: "README.md",
              identifier: recordName,
              contains: "a line that is not in the tree",
              why: "a record for a line that is gone",
            },
          ],
        }),
      },
      "charly-retired-fixture-",
    );
    scratchDirs.push(staleDir);
    const staleVerdict = classify(sweep(staleDir, registry).findings, readRecords(staleDir), registry);
    if (staleVerdict.stale.length !== 1) {
      fail(
        `the stale-record check is INEFFECTIVE: a declared record that matches no hit was not reported ` +
          `(${staleVerdict.stale.length} stale record(s))`,
      );
    } else {
      ok("the stale-record check is EFFECTIVE: a declared record that matches no hit is a finding");
    }

    console.log(
      `check-retired-identifiers --self-test: ${failures === 0 ? "OK" : "FAILED"} (${CASES.length} ` +
        `discrimination case(s), ${applied.length} unscoped entr(ies), ${scoped.length} scoped entr(ies))`,
    );
    console.log(
      `  the shipped step description must carry these phrases: ` +
        CASES.map((c) => c.scenario).join("; "),
    );
  } finally {
    for (const d of scratchDirs) rmSync(d, { recursive: true, force: true });
  }
}

// --- the entry point ----------------------------------------------------------------

const registry = readRegistry(root);

if (!registry) {
  const what = argv.includes("--self-test")
    ? "the discrimination cases did NOT run: every case plants a name the CONTRACT publishes, and without " +
      "the contract there is no name to plant"
    : "the umbrella's tree was NOT judged against the withdrawn identifiers";
  skip(
    `the contract's list is NOT checked out (${LIST_REL} is absent — the pinned spec submodule is not ` +
      `materialized; \`charly task init\` materializes it): ${what}`,
  );
  process.exit(0);
}

if (argv.includes("--self-test")) {
  selfTest(registry);
  process.exit(failures === 0 ? 0 : 1);
}

const { findings, applied } = sweep(root, registry);
const { carriers, recorded, stale } = classify(findings, readRecords(root), registry);

for (const { rec, hit } of recorded) {
  console.log(
    `  RECORD  ${hit.file}:${hit.line}: the withdrawn ${hit.identifier.kind} ${hit.identifier.name} is ` +
      `mentioned — a declared record: ${rec.why}`,
  );
}
for (const { rec, why } of stale) {
  console.error(
    `  FAIL  ${RECORDS_REL}: the declared record for ${rec?.identifier ?? "?"} in ${rec?.file ?? "?"} is ` +
      `stale — ${why}`,
  );
}
if (carriers.length > 0) {
  for (const f of carriers) {
    const id = f.identifier;
    const scope = id.type ? ` (scoped to ${id.type})` : "";
    const replacement = id.replacedBy ? ` — replaced by ${id.replacedBy}` : "";
    console.error(
      `  FAIL  ${f.file}:${f.line}: the withdrawn ${id.kind} ${id.name}${scope} is present${replacement}\n        ${f.text}`,
    );
  }
  fail(
    `${carriers.length} withdrawn identifier(s) survive in the umbrella's tracked tree — the contract's ` +
      `list is the one place the names live, and this tree names them`,
  );
}
if (stale.length > 0) {
  fail(
    `${stale.length} declared record(s) in ${RECORDS_REL} match nothing in the tree — a record that covers ` +
      `no hit is a hole that stopped exempting, and it is reported rather than ignored`,
  );
}
if (carriers.length > 0 || stale.length > 0) {
  process.exit(1);
}

ok(
  `the umbrella's tracked tree carries no CARRIER of the ${applied.length} withdrawn identifier(s) the ` +
    `contract publishes for a text surface` +
    (recorded.length > 0 ? ` — ${recorded.length} mention(s) are declared records` : ""),
);
console.log(`      ${coverageLine(registry, applied, recorded.length)}`);
process.exit(0);
