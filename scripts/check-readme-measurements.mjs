#!/usr/bin/env node
// check-readme-measurements.mjs — the umbrella's MEASURED figures are ONE
// implementation, not one copy per site: the clone-shape table, the prose that quotes
// it, and the date every dated figure carries must AGREE, and a live run's samples
// must fall inside the band the README commits.
//
// THE DEFECT THIS CLOSES (observed 2026-10-22, on this branch's own rounds):
//   1. The table said "73–75 M" and the prose said "the light clone measured between
//      73 M and 75 M" — and the run on the branch's own head measured 76 M, three
//      times. A band in prose is a FENCE about a head: it was true when it was
//      written and the head moved under it, and NOTHING in the repository read it,
//      so the drift was silent.
//   2. The same table's baseline row quoted "9.5 G" with no date of its own, and the
//      date lived in a sentence AFTER the table, while two other sites quoted the
//      same figure on the same line as its date. A figure that is dated in one place
//      and undated in another is one figure with two half-lives.
//   3. The prose's bands and the table's bands were the same numbers TWICE, with no
//      control that said so. Two copies of a number is one copy too many (R2): the
//      second copy is where the drift lives.
//
// So the numbers in the README are not free prose. They are a set of BANDs, and this
// gate is the control that reads them: it parses the table, parses the prose that
// quotes the table, and asserts that the two agree, that a repeated shape carries a
// band and a once-measured shape carries a dated point figure, that every site which
// quotes the baseline carries the SAME date, and — with --samples — that every
// sample a live run produced falls inside the band the README commits.
//
// WHAT IS ASSERTED, and how each is proven able to FAIL (--self-test mutates a COPY
// of the inputs and must see the gate go red for each one):
//   T. The clone-shape table has its three rows, and the two shapes the runs
//      repeated carry BANDS for both size and wall clock, while the baseline —
//      measured once — carries a POINT size and a COARSE wall clock.
//   P. Every prose band equals the table band it quotes: the light clone's size and
//      wall clock, the --all shape's size and wall clock.
//   B. The bootstrapped light tree's band is a band, in the clone's unit, and its
//      LOWER bound is at least the clone band's UPPER bound: the bootstrap adds the
//      binary and its build cache, so it can only add bytes.
//   S. The openclaw module store's from-scratch size is a band, in M.
//   D. ONE date: every site that quotes the baseline (the README's headline, the
//      table's date sentence, the README's sizes paragraph, the initializer's own
//      header, the manifest's task header) quotes the SAME figure and the SAME
//      date.
//   M. With --samples <log>: every sample the run produced — the light clones' size
//      and wall clock, the bootstrapped tree's size, the --all shape's size and wall
//      clock, the openclaw store's from-scratch size — falls inside the band the
//      README commits. This is the arm that catches a band that has gone stale: the
//      band's own samples, checked against the band.
//
//   C. The SHAPE counts: a count of a collection that GROWS with the org — the
//      submodule set, the pin set, the paths they name, the remotes the audit asks —
//      is a claim about a moving target. The day the org gains a repo the number is
//      false, and nothing in the repository says so. So a count is only allowed
//      DERIVED (read from the collection itself at run time) or DATED (a point
//      figure of one measurement, carrying the day it was taken). This family reads
//      every prose and script surface the umbrella OWNS — derived from the tracked
//      file set, never a hand-kept list, because a list of files is itself a claim
//      about a collection that grows — and reports the counts that are neither.
//
// A band that a sample has outgrown is a DEFECT in the band, not in the sample: the
// gate reports which band and which sample, and the README is widened to the range
// the runs produce — a new tree, hence a new gate.
//
// Usage: node scripts/check-readme-measurements.mjs [--root <dir>] [--samples <log>]
//                                                 [--self-test]
// exit 0 clean · 1 finding

import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const samplesIdx = argv.indexOf("--samples");
const samplesPath = samplesIdx === -1 ? null : resolve(argv[samplesIdx + 1]);
const selfTest = argv.includes("--self-test");

const FILES = {
  readme: "README.md",
  script: "scripts/init-submodules.sh",
  manifest: "charly.yml",
  measure: "scripts/measure-clone.sh",
};

/** Collapse a text to one whitespace-normalised line, keeping a map back to the
 *  line each character came from, so a finding can name its site. */
function collapse(text) {
  const lines = text.split("\n");
  let out = "";
  const lineOf = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (i > 0) {
      out += " ";
      lineOf.push(i - 1);
    }
    for (const ch of t) {
      out += ch;
      lineOf.push(i);
    }
  }
  return { text: out, lineOf, lines };
}

function read(rootDir, rel) {
  try {
    return readFileSync(join(rootDir, rel), "utf8");
  } catch {
    return null;
  }
}

// --- the table's rows ---------------------------------------------------------
// A size cell is either a RANGE ("73–76 M"), a POINT ("9.5 G") or a wall clock
// ("15–17 s", "6 m 10 s – 6 m 43 s") or COARSE ("minutes").
const RE_RANGE_SIZE = /^([0-9.]+)[–-]([0-9.]+) ?([A-Z])$/;
const RE_POINT_SIZE = /^([0-9.]+) ?([A-Z])$/;
const RE_RANGE_SEC = /^([0-9]+)[–-]([0-9]+) s$/;
const RE_RANGE_MIN = /^([0-9]+) m ([0-9]+) s [–-] ([0-9]+) m ([0-9]+) s$/;
const RE_COARSE = /^[a-z]+$/;

// The bands the README commits, each named by its own sentence. The self-test
// MUTATES these same values, so each is named ONCE here and read from one place — a
// number the gate and the README both carry is two copies of one number, and the
// second copy is where the drift lives. The boot band has already moved once (the
// runs produced 129 M; the committed band stopped at 128 M) and the hard-coded
// mutation stopped applying, so the self-test said so itself: "the mutation did not
// apply". Every mutation below now READS the value it replaces out of the text.
const RE_BOOT_BAND = /a bootstrapped light tree measures ([0-9.]+)[–-]([0-9.]+) ?([A-Z])/;
const RE_STORE_BAND = /mirror's module store — ([0-9.]+)[–-]([0-9.]+) ?([A-Z]) in a from-scratch clone/;
const RE_LIGHT_PROSE_SIZE = /the light clone measured between ([0-9.]+) ([A-Z]) and ([0-9.]+) ([A-Z])/;
const RE_TABLE_DATES = /Every figure in the table was measured on this machine on (\d{4}-\d{2}-\d{2}); the bands carry the readings taken on (\d{4}-\d{2}-\d{2}) as well\./;
const RE_SCRIPT_BASELINE = /([0-9.]+) G on disk[\s\S]{0,300}?measured (\d{4}-\d{2}-\d{2})/;
const RE_MANIFEST_BASELINE = /costs ([0-9.]+) G on disk[\s\S]{0,200}?measured (\d{4}-\d{2}-\d{2})/;

/** A band, read out of a text by its own sentence. */
function readBand(re, text) {
  const m = re.exec(text);
  if (!m) return null;
  return { lo: +m[1], hi: +m[2], unit: m[3], text: m[0] };
}

/** A literal, as a pattern — the self-test's mutations replace text it READ. */
function literal(s) {
  return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/** A day that is NOT the one committed, derived so a mutation is never a no-op. */
function otherDate(d) {
  return d === "1999-01-01" ? "1998-12-31" : "1999-01-01";
}

function parseSize(cell) {
  const m = RE_RANGE_SIZE.exec(cell);
  if (m) return { kind: "range", lo: +m[1], hi: +m[2], unit: m[3] };
  const p = RE_POINT_SIZE.exec(cell);
  if (p) return { kind: "point", lo: +p[1], hi: +p[1], unit: p[2] };
  return null;
}

function parseClock(cell) {
  const m = RE_RANGE_MIN.exec(cell);
  if (m) {
    return {
      kind: "range",
      lo: +m[1] * 60 + +m[2],
      hi: +m[3] * 60 + +m[4],
      unit: "s",
    };
  }
  const s = RE_RANGE_SEC.exec(cell);
  if (s) return { kind: "range", lo: +s[1], hi: +s[2], unit: "s" };
  if (RE_COARSE.test(cell)) return { kind: "coarse" };
  return null;
}

/** The clone-shape table: three rows, keyed by the shape they describe. */
function parseTable(text) {
  const rows = {};
  for (const line of text.split("\n")) {
    if (!line.startsWith("| `git clone")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 5) continue;
    const [, label, size, clock] = cells;
    let key = null;
    if (label.includes("--recurse-submodules")) key = "baseline";
    else if (label.includes("--all")) key = "all";
    else if (label.includes("the working set")) key = "light";
    if (!key) continue;
    rows[key] = { label, size: parseSize(size), clock: parseClock(clock), raw: line };
  }
  return rows;
}

// --- C. the shape counts ------------------------------------------------------
// A count of a collection that GROWS with the org is a claim about a moving
// target. The org gains repos; a number written in a comment does not move with
// them, and nothing in the tree says so. So a count is allowed in exactly two
// forms: DERIVED (read from the collection itself at run time) or DATED (a point
// figure of one measurement, carrying the day it was taken).
//
// THE FLOOR. Below the floor a number names a handful the author is looking at —
// a fixture, a pair of files, one hop's attempt count — and it does not stand in
// for the fleet's size. At or above it the number IS the fleet's size, and the
// fleet's size is what changes. The floor is a named constant because a number
// the gate and the text both carry is two copies of one number.
const SHAPE_COUNT_FLOOR = 10;

// The nouns are the collections the org's shape is made of. "repos" is NOT among
// them: the org census in the README is DERIVED by `charly task org-map`, which
// reads `.gitmodules` and compares — that number has a control that keeps it
// true, so it needs none of its own. "unmaterialized" IS among them: it names
// the same collection the submodule set is, in the words the tree uses for it.
//
// The CORPUS's shape is made of collections too, and it grows with the org:
// the skill-bearing directories, the families behind them, the agent rosters,
// the `SKILL.md` files. They are named in their PLURAL form only, because their
// singular forms name a THING rather than a collection — and a family that read
// those as counts reported this tree as broken: "the `0700` directory" is a
// file MODE, "`skill.missing_description`" is a diagnostic NAME, and the
// "`skill:` node" of a design table is a field name. Each of the three was a
// live false positive in this tree while the family was blind to the shape it
// names, so the plural form is the whole of the precision.
//
// A NUMBER is read whole, and a number written with a thousands separator is
// one number: a count written as 1,000 is a thousand, not the three digits
// after the separator. The separator used to stop the match there, so the tail
// was judged on its own — a count of 1,000 fell under the floor and the site
// ESCAPED the family, while a count of 3,500 was reported as 500, a finding
// that named the wrong number. The separator is now part of the number, and the
// number is read whole. This is the same defect as the noun list's blindness —
// a bare count of a growing collection that the family cannot see — and it
// reaches every noun, not only the corpus's.
const RE_SHAPE_COUNT =
  /(?<![\w-])(~?)(\d{1,4}(?:,\d{3})*)\s*(?:of\s+(\d{1,4}(?:,\d{3})*)\s*)?[- ]?(submodules?|pins?|paths?|modules?|remotes?|worktrees?|calls?|unmateriali[sz]ed|materiali[sz]ed|directories|skills|families|rosters|SKILL\.md)\b/gi;
const RE_SHAPE_REMAINING = /\bthe remaining (\d{1,4}(?:,\d{3})*)\b/gi;

// A count that is a CAP ("at most N path rows") or a FLOOR ("at least N
// submodule entries") is a policy number, not a measurement: it states a bound
// the collection must meet, and a collection that only GROWS satisfies a floor
// more and a cap less — neither drifts with the org. A bound that also states
// a TOTAL is not a bound but a measurement of that total, so the total is still
// judged.
const RE_SHAPE_CAP =
  /(\bat most\b|\bup to\b|\ba cap of\b|\ba maximum of\b|\bmaximum of\b|\bmax of\b|\blimit of\b|\bat least\b|\bat minimum\b|\ba minimum of\b|\bno fewer than\b|[≥≤])\s*$/i;

const RE_ISO_DATE = /\b20\d{2}-\d{2}-\d{2}\b/;

// Markdown EMPHASIS and CODE SPANS hide a count from a plain match: a `*`
// stands between the number and the noun, so the noun is never reached and the
// count is invisible — and such an instance was live in the tree for a whole
// round. The markers are stripped before the match: the number is the same
// number either way. (The example is NOT written out here, with its numbers:
// this file is one of the surfaces the family reads, so a count written here
// is a finding about the gate that forbids counts.)
/** A text with Markdown emphasis and code spans stripped, and the MAP back to
 *  the original. The stripped text is the one the count family has always read
 *  — a `**` pair, a `__` pair, a lone `*`, a lone backtick — and the map says,
 *  for every character of it, which character of the ORIGINAL that one came
 *  from. The map is what lets a count found in the stripped text be placed in
 *  the ORIGINAL, which is where the clause boundaries are measured. */
function stripEmphasis(text) {
  let out = "";
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "*" || ch === "`") {
      out += " ";
      map.push(i);
      if (ch === "*" && text[i + 1] === "*") i++;   // a pair is one marker
      continue;
    }
    if (ch === "_" && text[i + 1] === "_") {
      out += " ";
      map.push(i);
      i++;
      continue;
    }
    out += ch;
    map.push(i);
  }
  return { text: out, map };
}

/** A line's text with Markdown emphasis and code spans stripped. */
function normaliseEmphasis(text) {
  return stripEmphasis(text).text;
}

// The surfaces: the umbrella's OWN prose and scripts, DERIVED from the tracked
// file set. A gitlink is another repo's tree; a symlink is a projection of
// another repo's content (the corpus farm); CHANGELOG/ is history, and history
// may name the legacy form.
//
// EVERY tracked TEXT file is a surface. An extension allowlist would be a
// second, hand-kept copy of "which files carry prose", and it is wrong the
// moment a file lands: `hooks/pre-commit` carries prose and has no extension
// at all, and the allowlist skipped it in silence. The set is the FILE SET, and
// the file set is derived, never written down.

/** A tracked file's text, or null when the file is not text. A NUL byte is
 *  git's own signal for binary, and a binary file carries no prose. */
function readTextSurface(path) {
  let buf;
  try {
    buf = readFileSync(path);
  } catch {
    return null;
  }
  if (buf.includes(0)) return null;
  return buf.toString("utf8");
}

/** The umbrella's own prose and script surfaces, read from the tracked file set. */
function listShapeSurfaces(rootDir) {
  let listing;
  try {
    listing = execFileSync("git", ["-C", rootDir, "ls-files", "-s", "-z"], { encoding: "utf8" });
  } catch (e) {
    return { surfaces: [], error: `the tracked file set could not be read — git failed in ${rootDir}: ${e.message}` };
  }
  const surfaces = [];
  for (const entry of listing.split("\0")) {
    if (!entry) continue;
    const tab = entry.indexOf("\t");
    if (tab === -1) continue;
    const file = entry.slice(tab + 1);
    if (entry.slice(0, tab).slice(0, 6) === "160000") continue;   // a gitlink
    if (file.startsWith("CHANGELOG/")) continue;                    // history
    const path = join(rootDir, file);
    let st;
    try {
      st = lstatSync(path);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;                             // a projection
    const text = readTextSurface(path);
    if (text === null) continue;                                   // not text
    surfaces.push({ file, text });
  }
  return { surfaces, error: null };
}

/** How a file's prose is read.
 *
 *  - a DOCUMENT (Markdown) is prose in every line it has, and its block is a
 *    PARAGRAPH: a run of lines with no blank line between them.
 *  - a CODE file carries prose in its COMMENTS, in the STRINGS it prints, and
 *    in any line that STATES A COUNT. Its block is a run of such lines: a code
 *    line between two of them ends the run, because a date in one function
 *    does not date a count in another.
 *  - a YAML file is prose in every line it has, and its block is scoped by
 *    INDENTATION: a count belongs to the innermost scope that holds it, so a
 *    date in a SIBLING entry does not date it. The whole subtree of a
 *    top-level key is NOT one block — that put a date anywhere in `verify:`
 *    over every count in it.
 *
 *  A code file with no prose line at all is a DOCUMENT: it is read whole.
 */
const RE_COMMENT_LINE = /^\s*(\/\/|\*|#|<!--)/;

/** A line holds a STRING when it quotes one. A count the tree states in a
 *  string is as much a claim as one it states in a comment: the string is what
 *  a reader sees. */
function holdsString(line) {
  return /["'`]/.test(line);
}

/** The lines a code file calls prose: its comments, the lines that quote a
 *  string, and the lines that state a count. */
/** A boolean test that starts at the BEGINNING of the text.
 *  The shape patterns carry the `g` flag, because the finding pass walks them with
 *  `exec` to collect EVERY count on a line. A global `test()` therefore RESUMES
 *  from wherever the last match ended, so a line's answer could depend on which
 *  line was read before it — a count read after another count could be missed
 *  entirely. A line's answer must depend on the line alone. */
function matches(re, text) {
  re.lastIndex = 0;
  return re.test(text);
}

function isCodeProse(line) {
  if (RE_COMMENT_LINE.test(line)) return true;
  if (holdsString(line)) return true;
  const normalised = normaliseEmphasis(line);
  return matches(RE_SHAPE_COUNT, normalised) || matches(RE_SHAPE_REMAINING, normalised);
}

/** The file's prose, line by line, and the BLOCK each line's prose falls in.
 *  Every item carries the block it belongs to, because the date that makes a
 *  count dated is the date in THAT block. */
function prosePlan(file, lines) {
  const items = [];
  const push = (block) => {
    if (!block.length) return;
    const copy = block.slice();
    for (const i of copy) items.push({ index: i, block: copy });
  };
  const ext = file.includes(".") ? file.split(".").pop() : "";
  if (ext === "yml" || ext === "yaml") {
    // The block of a line is the run of non-blank lines around it that are at
    // least as deeply indented as it is: the innermost scope that holds it.
    const indent = lines.map((l) => (l.trim() === "" ? -1 : l.length - l.trimStart().length));
    const scopes = new Map();
    for (let i = 0; i < lines.length; i++) {
      if (indent[i] < 0) continue;
      const level = indent[i];
      if (scopes.has(`${i}:${level}`)) continue;
      let a = i;
      let b = i;
      while (a - 1 >= 0 && indent[a - 1] >= 0 && indent[a - 1] >= level) a--;
      while (b + 1 < lines.length && indent[b + 1] >= 0 && indent[b + 1] >= level) b++;
      const scope = [];
      for (let j = a; j <= b; j++) scope.push(j);
      scopes.set(`${i}:${level}`, scope);
    }
    for (let i = 0; i < lines.length; i++) {
      if (indent[i] < 0) continue;
      const scope = scopes.get(`${i}:${indent[i]}`);
      items.push({ index: i, block: scope });
    }
    return items;
  }
  if (ext === "md") {
    let block = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "") { push(block); block = []; } else block.push(i);
    }
    push(block);
    return items;
  }
  // A code file. Its blocks are runs of prose lines; a file that carries no
  // prose at all is a document, and is read whole.
  const prose = lines.map((line) => (line.trim() === "" ? false : isCodeProse(line)));
  if (!prose.some(Boolean)) {
    let block = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "") { push(block); block = []; } else block.push(i);
    }
    push(block);
    return items;
  }
  let block = [];
  for (let i = 0; i < lines.length; i++) {
    if (prose[i]) block.push(i);
    else { push(block); block = []; }
  }
  push(block);
  return items;
}

// A DATE excuses the count it was measured with, and nothing else.
//
// The unit a date reached used to be the BLOCK — a paragraph, a run of comment
// lines, an indent scope — so one dated sentence excused every count the block
// held, including counts that were never measured on that day. A count of the
// corpus's own shape sat in a dated block and the family read the date and said
// nothing: the count was false and the exemption was the reason nobody saw it.
//
// The unit a date reaches is now the CLAUSE: the text between a sentence-ending
// mark and the colons, semicolons and commas that follow whitespace. A count is
// excused when ITS OWN clause carries a date. The rule is about MEASUREMENT,
// not about punctuation: a count and the day it was measured are ONE
// measurement, and prose that states them states them in one clause. A date in
// another clause of the same block measured something else.
//
// A sentence-ending mark ends a sentence only when it ENDS one: the mark in
// "3.5" or in "charly.yml" is followed by no whitespace and is not one, and a
// comma that is followed by no whitespace is a thousands separator, not a
// clause boundary.
const RE_CLAUSE_BREAK = /[.!?]/;

/** The clause spans of a block's text: each is [start, end) over the text, and
 *  a mark that ends a clause belongs to the clause it ends. */
function clauseSpans(text) {
  const spans = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : null;
    const endsSentence = RE_CLAUSE_BREAK.test(ch) && (next === null || /\s/.test(next));
    const separates = (ch === ":" || ch === ";" || ch === ",") && next !== null && /\s/.test(next);
    if (!endsSentence && !separates) continue;
    spans.push({ start, end: i + 1 });
    start = i + 1;
  }
  spans.push({ start, end: text.length });
  return spans;
}

/** A block's text, the offset each of its lines starts at, and its clauses. */
function clauseScope(block, lines) {
  const raw = block.map((j) => lines[j]).join("\n");
  const startOf = new Map();
  let at = 0;
  for (const j of block) {
    startOf.set(j, at);
    at += lines[j].length + 1;   // the join's newline
  }
  return { raw, startOf, spans: clauseSpans(raw) };
}

/** The counts that are neither derived nor dated. */
function shapeFindings(surfaces) {
  const findings = [];
  const seen = new Set();
  for (const { file, text } of surfaces) {
    const lines = text.split("\n");
    const scopeOf = new Map();
    for (const item of prosePlan(file, lines)) {
      const i = item.index;
      // The scope is the block; its CLAUSES are what a date reaches.
      let scope = scopeOf.get(item.block);
      if (!scope) {
        scope = clauseScope(item.block, lines);
        scopeOf.set(item.block, scope);
      }
      // The emphasis and the code spans are stripped before the match: a count
      // wrapped in them is the same count, and the wrapper is what hid it. The
      // map places the count back in the original text, where the clauses are.
      const stripped = stripEmphasis(lines[i]);
      const line = stripped.text;
      for (const re of [RE_SHAPE_COUNT, RE_SHAPE_REMAINING]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          const isCount = re === RE_SHAPE_COUNT;
          const rounded = m[0].trim().startsWith("~");
          const n = isCount ? +m[2].replace(/,/g, "") : +m[1].replace(/,/g, "");
          const total = isCount && m[3] !== undefined ? +m[3].replace(/,/g, "") : null;
          const big = total !== null ? total >= SHAPE_COUNT_FLOOR : n >= SHAPE_COUNT_FLOOR;
          if (!big || rounded) continue;
          // The count's own clause decides whether it is excused, and only that
          // clause: a date elsewhere in the block measured something else.
          const at = scope.startOf.get(i) + stripped.map[m.index];
          const span = scope.spans.find((s) => at >= s.start && at < s.end);
          if (span && RE_ISO_DATE.test(scope.raw.slice(span.start, span.end))) continue;
          // A bound ("at most N", "at least N") is a policy number, not a
          // measurement — but a bound that ALSO states a total states a
          // measurement of that total, so the total is still judged.
          if (total === null && RE_SHAPE_CAP.test(line.slice(0, m.index))) continue;
          const key = `${file}:${i + 1}:${m.index}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push({
            site: `${file}:${i + 1}`,
            message: `the count "${m[0].replace(/\s+/g, " ").trim()}" states the size of a collection that grows, ` +
              `and the clause that states it carries no date — derive it from the collection, ` +
              `or state the day it was measured`,
          });
        }
      }
    }
  }
  return findings;
}

// --- the core: everything the gate asserts -----------------------------------
function runChecks({ readme, script, manifest, samples, measure, shapes }) {
  const findings = [];
  const add = (site, message) => findings.push({ site, message });

  if (readme === null) {
    add("README.md", "the file is missing — the gate cannot read the figures it governs");
    return { findings, facts: null };
  }

  const flat = collapse(readme);
  const rows = parseTable(readme);
  const lineOf = (offset) => flat.lines[flat.lineOf[offset]];

  // --- T. the table's shape --------------------------------------------------
  for (const key of ["baseline", "light", "all"]) {
    if (!rows[key]) add("README.md", `the clone-shape table has no ${key} row`);
  }
  if (rows.light && rows.all && rows.baseline) {
    for (const key of ["light", "all"]) {
      const r = rows[key];
      if (!r.size || r.size.kind !== "range") {
        add("README.md",
          `the ${key} row's on-disk cell is not a BAND — a shape the runs repeated ` +
          `carries the range the runs produced, not one number`);
      }
      if (!r.clock || r.clock.kind !== "range") {
        add("README.md",
          `the ${key} row's wall-clock cell is not a BAND — a shape the runs repeated ` +
          `carries the range the runs produced`);
      }
    }
    if (rows.baseline.size && rows.baseline.size.kind !== "point") {
      add("README.md",
        "the baseline row's on-disk cell is a band, but the baseline was measured " +
        "ONCE — it is a dated point figure");
    }
    if (rows.baseline.clock && rows.baseline.clock.kind !== "coarse") {
      add("README.md",
        "the baseline row's wall-clock cell is a band, but that shape was measured " +
        "ONCE — it is stated coarsely");
    }
  }

  // --- P. the prose quotes the table's bands ---------------------------------
  const prose = (re, key) => {
    const m = re.exec(flat.text);
    if (!m) {
      add("README.md", `the prose does not state ${key} — the table's band is stated once`);
      return null;
    }
    return { m, at: m.index };
  };
  if (rows.light) {
    const p = prose(
      RE_LIGHT_PROSE_SIZE,
      "the light clone's size band");
    if (p && rows.light.size) {
      const s = rows.light.size;
      if (+p.m[1] !== s.lo || +p.m[3] !== s.hi || p.m[2] !== s.unit || p.m[4] !== s.unit) {
        add("README.md",
          `the prose states the light clone's size as ${p.m[1]}–${p.m[3]} ${p.m[2]}, ` +
          `but the table states ${s.lo}–${s.hi} ${s.unit} — the two copies of one ` +
          `band disagree (line ${lineOf(p.at) + 1})`);
      }
    }
    const c = prose(
      /the light row's fresh clones measured between ([0-9.]+) s and ([0-9.]+) s/,
      "the light clone's wall-clock band");
    if (c && rows.light.clock && rows.light.clock.kind === "range") {
      const k = rows.light.clock;
      if (+c.m[1] !== k.lo || +c.m[2] !== k.hi) {
        add("README.md",
          `the prose states the light clone's wall clock as ${c.m[1]}–${c.m[2]} s, ` +
          `but the table states ${k.lo}–${k.hi} s (line ${lineOf(c.at) + 1})`);
      }
    }
  }
  if (rows.all) {
    const p = prose(
      /the `--all` shape between ([0-9.]+) ([A-Z]) and ([0-9.]+) ([A-Z])/,
      "the --all shape's size band");
    if (p && rows.all.size) {
      const s = rows.all.size;
      if (+p.m[1] !== s.lo || +p.m[3] !== s.hi || p.m[2] !== s.unit || p.m[4] !== s.unit) {
        add("README.md",
          `the prose states the --all shape's size as ${p.m[1]}–${p.m[3]} ${p.m[2]}, ` +
          `but the table states ${s.lo}–${s.hi} ${s.unit} (line ${lineOf(p.at) + 1})`);
      }
    }
    const c = prose(
      /the `--all` row's from-scratch materializations measured between ([0-9]+) m ([0-9]+) s and ([0-9]+) m ([0-9]+) s/,
      "the --all shape's wall-clock band");
    if (c && rows.all.clock && rows.all.clock.kind === "range") {
      const k = rows.all.clock;
      const lo = +c.m[1] * 60 + +c.m[2];
      const hi = +c.m[3] * 60 + +c.m[4];
      if (lo !== k.lo || hi !== k.hi) {
        add("README.md",
          `the prose states the --all shape's wall clock as ${c.m[1]} m ${c.m[2]} s – ` +
          `${c.m[3]} m ${c.m[4]} s, but the table states ${k.lo}–${k.hi} s ` +
          `(line ${lineOf(c.at) + 1})`);
      }
    }
  }

  // --- B. the bootstrapped tree's band ---------------------------------------
  const boot = RE_BOOT_BAND.exec(flat.text);
  let bootBand = null;
  if (!boot) {
    add("README.md", "the prose does not state the bootstrapped light tree's size band");
  } else {
    bootBand = { lo: +boot[1], hi: +boot[2], unit: boot[3] };
    if (rows.light && rows.light.size) {
      const s = rows.light.size;
      if (bootBand.unit !== s.unit) {
        add("README.md",
          `the bootstrapped tree's band is in ${bootBand.unit} and the clone's in ` +
          `${s.unit} — the two cannot be compared`);
      }
      if (bootBand.lo < s.hi) {
        add("README.md",
          `the bootstrapped tree's band (${bootBand.lo}–${bootBand.hi} ` +
          `${bootBand.unit}) is below the clone's (${s.lo}–${s.hi} ${s.unit}): the ` +
          `bootstrap ADDS the binary and its build cache, so it can only add bytes`);
      }
    }
  }

  // --- S. the openclaw store's band ------------------------------------------
  const store = RE_STORE_BAND.exec(flat.text);
  let storeBand = null;
  if (!store) {
    add("README.md",
      "the prose does not state the openclaw module store's from-scratch size as a " +
      "BAND — the runs repeated that measurement");
  } else {
    storeBand = { lo: +store[1], hi: +store[2], unit: store[3] };
  }

  // --- DATES. the bands are dated, and the samples' day is inside the span ----
  let bandDates = null;

  // --- D. one date, one baseline ---------------------------------------------
  const dateSites = [];
  const push = (re, site, label) => {
    const m = re.exec(flat.text);
    if (!m) {
      add(site, `the ${label} does not carry the baseline's date`);
      return;
    }
    dateSites.push({ site, label, figure: +m[1], date: m[2] });
  };
  push(/not a ([0-9.]+) GB checkout \(measured (\d{4}-\d{2}-\d{2})\)/,
    "README.md", "headline");
  const tableDate = RE_TABLE_DATES.exec(flat.text);
  if (!tableDate) {
    add("README.md", "the clone-shape table carries no date of its own");
  } else {
    dateSites.push({
      site: "README.md",
      label: "the table's date sentence",
      figure: rows.baseline?.size ? rows.baseline.size.lo : null,
      date: tableDate[1],
    });
    // The span of days the table's readings were taken on. The FIRST day is the
    // baseline's own — it was measured once — and the D-check below holds every other
    // site to it. The band dates are the days the REPEATED readings were taken on, and
    // the samples' own day must fall inside them: a band that is older than the
    // readings it governs is a fence about a head that has moved on.
    bandDates = [tableDate[1], tableDate[2]];
  }
  push(/against the ([0-9.]+) G a full checkout occupied on (\d{4}-\d{2}-\d{2})/,
    "README.md", "sizes paragraph");
  if (script !== null) {
    const m = RE_SCRIPT_BASELINE.exec(script);
    if (!m) {
      add(FILES.script, "the initializer's header does not carry the baseline's date");
    } else {
      dateSites.push({ site: FILES.script, label: "the initializer's header", figure: +m[1], date: m[2] });
    }
  }
  if (manifest !== null) {
    const m = RE_MANIFEST_BASELINE.exec(manifest);
    if (!m) {
      add(FILES.manifest, "the manifest's init header does not carry the baseline's date");
    } else {
      dateSites.push({ site: FILES.manifest, label: "the manifest's init header", figure: +m[1], date: m[2] });
    }
  }
  // --- X. the measurement clones the TREE, not the machine's object store -------
  // A band is only as good as the measurement that fills it. The measurement clones
  // the tree under test from THIS checkout, and the LOCAL transport COPIES the
  // source's whole object store — every commit on every branch, including other
  // sessions' pushed branches and their loose objects. A clone made that way
  // measures the machine's accumulated store, so the reading drifts with the org's
  // push traffic while the tree stands still: measured, the light clone read 75 M,
  // then 76 M, then 77 M over six hours, and the bootstrapped tree 126, 127, 128 and
  // 129 M, with the tree, the `charly` pin and the built version stamp all unchanged.
  // The band the README commits rotted with the readings. Over the transport
  // (`--no-local`), on the one branch that holds the tree, the clone carries the
  // TREE's history and a reading is a property of the tree under test.
  if (measure === null) {
    add(FILES.measure,
      "the measurement script is missing — the gate cannot read the measurement that " +
      "fills the bands");
  } else {
    const clones = (measure.match(/git clone[^\n]*/g) || []).filter((l) => l.includes('"$ROOT"'));
    if (clones.length === 0) {
      add(FILES.measure,
        "the measurement clones no superproject — the readings it produces have no source");
    }
    for (const l of clones) {
      if (!l.includes("--no-local")) {
        add(FILES.measure,
          `the measurement clones the tree with the LOCAL transport ("${l.trim()}") — a ` +
          `local clone copies the source's whole object store, so the reading is the ` +
          `machine's accumulated store and not the tree; clone over the transport ` +
          `(--no-local) so the reading is a property of the tree under test`);
      }
    }
  }

  if (dateSites.length) {
    const dates = new Set(dateSites.map((d) => d.date));
    if (dates.size > 1) {
      add("README.md",
        "the baseline is dated differently in different places: " +
        dateSites.map((d) => `${d.label} says ${d.date}`).join(", "));
    }
    const figures = new Set(dateSites.map((d) => d.figure));
    if (figures.size > 1) {
      add("README.md",
        "the baseline is quoted as different figures: " +
        dateSites.map((d) => `${d.label} says ${d.figure} G`).join(", "));
    }
  }

  // --- M. the samples, against the bands -------------------------------------
  const facts = {
    rows,
    bootBand,
    storeBand,
    date: dateSites[0]?.date ?? null,
  };
  if (samples) {
    const s = parseSamples(samples);
    // The DAY the readings were taken. The table states the span of days its readings
    // were taken on, and the samples must fall inside it: a band that predates the
    // readings it governs describes a head that has moved on.
    if (!s.date) {
      add("samples",
        "the samples carry no date — the day they were taken is unstated, so the bands " +
        "are unchecked against it");
    } else if (bandDates && !bandDates.includes(s.date)) {
      add("samples",
        `the samples were taken on ${s.date}, which is outside the table's stated span ` +
        `(${bandDates.join(", ")}) — the bands are older than the readings they govern`);
    }
    const inBand = (name, sample, band, unit) => {
      if (!band) return;
      const value = typeof sample === "number" ? sample : sample.v;
      const su = typeof sample === "number" ? unit : sample.unit;
      if (su !== band.unit) {
        add("samples",
          `${name}: the sample is in ${su} and the band in ${band.unit} — the two ` +
          `cannot be compared`);
        return;
      }
      if (value < band.lo || value > band.hi) {
        add("samples",
          `${name}: ${value} ${su} is OUTSIDE the committed band ` +
          `${band.lo}–${band.hi} ${band.unit} — the band is narrower than the runs ` +
          `produced, so the band must be widened (a new tree, hence a new gate)`);
      }
    };
    if (rows.light?.size) {
      for (const v of s.lightSize) inBand("a light clone", v, rows.light.size, rows.light.size.unit);
      for (const v of s.lightTime) inBand("a light clone's wall clock", v, rows.light.clock, "s");
    }
    if (bootBand) {
      for (const v of s.bootSize) inBand("the bootstrapped light tree", v, bootBand, bootBand.unit);
    }
    if (rows.all?.size) {
      for (const v of s.allSize) inBand("the --all shape", v, rows.all.size, rows.all.size.unit);
      for (const v of s.allTime) inBand("the --all shape's wall clock", v, rows.all.clock, "s");
    }
    if (storeBand) {
      for (const v of s.storeSize) inBand("the openclaw module store", v, storeBand, storeBand.unit);
    }
    for (const [name, count] of [
      ["the light clones", s.lightSize.length],
      ["the light clones' wall clocks", s.lightTime.length],
      ["the bootstrapped light tree", s.bootSize.length],
      ["the --all shape", s.allSize.length],
      ["the --all shape's wall clock", s.allTime.length],
      ["the openclaw module store", s.storeSize.length],
    ]) {
      if (count === 0) add("samples", `${name} produced no sample — the band is unchecked`);
    }
    facts.samples = s;
  }

  // --- C. the shape counts ---------------------------------------------------
  if (!shapes) {
    add("the shape counts", "the surfaces were never read — the family cannot judge a count it did not see");
  } else if (shapes.error) {
    add("the shape counts", shapes.error);
  } else {
    findings.push(...shapeFindings(shapes.surfaces));
  }
  return { findings, facts };
}

/** The end-to-end log's samples, by shape. */
function parseSamples(text) {
  const out = { lightSize: [], lightTime: [], bootSize: [], allSize: [], allTime: [], storeSize: [], date: null };
  const dated = /^MEASURED=(\d{4}-\d{2}-\d{2})$/m.exec(text);
  if (dated) out.date = dated[1];
  const section = (name) => {
    const i = text.indexOf(name);
    if (i === -1) return "";
    const eol = text.indexOf("\n", i);
    const from = eol === -1 ? text.length : eol + 1;
    const j = text.indexOf("\n=====", from);
    return j === -1 ? text.slice(from) : text.slice(from, j);
  };
  const light = section("===== the light shape");
  const boot = section("===== the light tree");
  const all = section("===== the full shape");
  const sizes = (s) => {
    const out = [];
    // a reading is "<value><unit>\t<path>" — the path is whatever tree was measured,
    // so the SHAPE comes from the section the reading is in, never from the path.
    for (const m of s.matchAll(/^([0-9.]+)([MG])\t(\S+)$/gm)) {
      // the module store is measured INSIDE the full shape's section, and it has its
      // own band — a reading of the store is not a reading of the shape.
      if (m[3].includes(".git/modules/")) continue;
      out.push({ v: +m[1], unit: m[2] });
    }
    return out;
  };
  const clocks = (s) => {
    const out = [];
    for (const m of s.matchAll(/rc=0 elapsed=(\d+)s/g)) out.push(+m[1]);
    return out;
  };
  out.lightSize = sizes(light);
  out.lightTime = clocks(light);
  out.bootSize = sizes(boot);
  out.allSize = sizes(all);
  out.allTime = clocks(all);
  for (const m of text.matchAll(/^([0-9.]+)([MG])\t.*\.git\/modules\/openclaw$/gm)) {
    out.storeSize.push({ v: +m[1], unit: m[2] });
  }
  return out;
}

// --- the self-test: every assertion must be able to fail ---------------------
/** Mutate a text, and SAY SO if the pattern is not there: a self-test whose
 *  mutation never applied proves nothing, and a silent no-op mutation is a
 *  self-test that cannot fail (R7). */
function mutate(text, re, replacement, what) {
  if (!re.test(text)) throw new Error(`the mutation did not apply: ${what}`);
  return text.replace(re, replacement);
}

function runSelfTest(readme, script, manifest, samples, measure, shapes) {
  const inputs = { readme, script, manifest, samples, measure, shapes };
  const base = runChecks(inputs);
  if (base.findings.length) {
    return {
      ok: false,
      report: ["the gate is RED on the committed tree, so its self-test proves nothing:",
        ...base.findings.map((f) => `  ${f.site}: ${f.message}`)],
    };
  }
  const report = [];
  let ok = true;
  const expect = (label, mutateInputs, why) => {
    let mutated;
    try {
      mutated = mutateInputs();
    } catch (e) {
      report.push(`  FAIL ${label} — ${e.message}`);
      ok = false;
      return;
    }
    const r = runChecks(mutated);
    const caught = r.findings.length > 0;
    report.push(`  ${caught ? "OK  " : "FAIL"} ${label} — ${why}`);
    if (!caught) ok = false;
  };
  // The mirror of `expect`: a mutation that must STAY green. A family that reports
  // every count would pass this arm's first half and fail here, so the pair is
  // what shows the family DISCRIMINATES rather than merely fires.
  const expectClean = (label, mutateInputs, why) => {
    let mutated;
    try {
      mutated = mutateInputs();
    } catch (e) {
      report.push(`  FAIL ${label} — ${e.message}`);
      ok = false;
      return;
    }
    const r = runChecks(mutated);
    const clean = r.findings.length === 0;
    report.push(`  ${clean ? "OK  " : "FAIL"} ${label} — ${why}`);
    if (!clean) ok = false;
  };
  const withReadme = (newReadme) => ({ ...inputs, readme: newReadme });

  // The mutation targets are READ out of the committed text, never written here: a
  // number the gate and the README both carry is two copies of one number, and the
  // second copy is where the drift lives. The boot band has already moved once — the
  // runs produced 129 M, the committed band stopped at 128 M — and the hard-coded
  // mutation stopped applying, so the self-test said so itself: "the mutation did not
  // apply". Every target below is the value the text itself carries.
  const rows = parseTable(readme);
  const lightCell = rows.light?.raw
    ? /\| ([0-9.]+)([–-])([0-9.]+) ([A-Z]) \|/.exec(rows.light.raw)
    : null;
  const lightProse = RE_LIGHT_PROSE_SIZE.exec(readme);
  const boot = readBand(RE_BOOT_BAND, readme);
  const store = readBand(RE_STORE_BAND, readme);
  const tableDates = RE_TABLE_DATES.exec(readme);
  const scriptDate = script ? RE_SCRIPT_BASELINE.exec(script) : null;
  const manifestDate = manifest ? RE_MANIFEST_BASELINE.exec(manifest) : null;
  // The dash the text itself uses, so a mutation never changes the shape of a band.
  const dash = (s) => (s.includes("–") ? "–" : "-");

  if (lightCell) {
    expect("the light row's cell is a point figure",
      () => withReadme(mutate(readme, literal(lightCell[0]),
        `| ${lightCell[1]} ${lightCell[4]} |`, "the table's light row")),
      "a shape the runs repeated carries a BAND, not one number");
    // The mutation must produce a band the PROSE does not state, whatever the
    // committed band is. Narrowing 71–71 M to 71–71 M is a no-op, and a self-test
    // whose mutation changes nothing proves nothing (R7) — so a band the runs
    // produced at one value is shifted instead of narrowed.
    const narrow = +lightCell[1] < +lightCell[3]
      ? `${lightCell[3]}${lightCell[2]}${lightCell[3]}`
      : `${+lightCell[3] + 1}${lightCell[2]}${+lightCell[3] + 1}`;
    expect("the table's band and the prose disagree",
      () => withReadme(mutate(readme, literal(lightCell[0]),
        `| ${narrow} ${lightCell[4]} |`,
        "the table's light row")),
      "the prose still quotes the other band, so the two copies of one band disagree");
  }
  if (lightProse) {
    expect("the prose's band is narrowed",
      () => withReadme(mutate(readme,
        literal(`${lightProse[1]} ${lightProse[2]} and ${lightProse[3]} ${lightProse[4]}`),
        `${lightProse[1]} ${lightProse[2]} and ${+lightProse[1] + 1} ${lightProse[4]}`,
        "the prose's light band")),
      "the table still quotes the wider band");
  }
  if (tableDates) {
    expect("the table's date sentence names another day",
      () => withReadme(mutate(readme, literal(`measured on this machine on ${tableDates[1]}`),
        `measured on this machine on ${otherDate(tableDates[1])}`,
        "the table's date sentence")),
      "the baseline is dated differently in different places");
  }
  if (scriptDate) {
    expect("the initializer's header loses the date",
      () => ({ ...inputs, script: mutate(script, literal(`measured ${scriptDate[2]}`), "measured",
        "the initializer's header") }),
      "the initializer's header does not carry the baseline's date");
  }
  if (manifestDate) {
    expect("the manifest's init header loses the date",
      () => ({ ...inputs, manifest: mutate(manifest, literal(`measured ${manifestDate[2]}`),
        "measured", "the manifest's init header") }),
      "the manifest's init header does not carry the baseline's date");
  }
  if (measure) {
    expect("the measurement's clone falls back to the local transport",
      () => ({ ...inputs, measure: mutate(measure,
        literal("--no-local --single-branch --branch"), "--no-checkout --single-branch --branch",
        "the measurement's clone invocation") }),
      "a local clone copies the source's whole object store, so the reading would be " +
      "the machine's accumulated store and not the tree");
  }
  if (boot && lightCell) {
    // The mutated band must start STRICTLY BELOW the clone's band, whatever the
    // clone's band is: the clone's hi is the boundary the check compares against,
    // and a band that starts at the clone's lo is not below it when the band is
    // one value wide.
    expect("the bootstrapped band is below the clone's",
      () => withReadme(mutate(readme, literal(boot.text),
        boot.text.replace(`${boot.lo}${dash(boot.text)}${boot.hi} ${boot.unit}`,
          `${+lightCell[1] - 1}${dash(boot.text)}${+lightCell[1] - 1} ${boot.unit}`),
        "the bootstrapped tree's band")),
      "the bootstrap ADDS the binary and its build cache, so its band cannot start below the clone's");
  }
  if (store) {
    expect("the store's band is not a band",
      () => withReadme(mutate(readme, literal(store.text),
        store.text.replace(`${store.lo}${dash(store.text)}${store.hi} ${store.unit}`,
          `${store.lo} ${store.unit}`),
        "the store's band")),
      "the runs repeated that measurement, so it carries a band");
  }
  if (samples) {
    expect("a sample falls outside its band",
      () => ({ ...inputs, samples: mutate(samples, /^([0-9.]+)M\t/m, "9999M\t",
        "a light clone's size sample") }),
      "a band that a sample has outgrown is a defect in the band");
    if (tableDates) {
      expect("the samples' day leaves the table's span",
        () => withReadme(mutate(readme,
          literal(`the bands carry the readings taken on ${tableDates[2]}`),
          `the bands carry the readings taken on ${otherDate(tableDates[2])}`,
          "the table's span")),
        "a band that does not cover the day the readings were taken is unchecked");
    }
  }

  // --- the C family: a count of a growing collection is derived or dated -----
  // The fixture's count is the floor plus one, so the assertion is exercised
  // just above the threshold, and NO count is written into this file: this file
  // is one of the surfaces the family reads, so a count written here would be a
  // finding about the gate that forbids counts.
  const shapeFixture = (n) => `The fleet holds ${n} submodules.`;
  const shapeTarget = shapes
    ? shapes.surfaces.find((s) => s.file.endsWith(".md") && s.file !== FILES.readme)
    : null;
  if (!shapeTarget) {
    report.push("  FAIL the shape-count family has no prose surface to exercise — " +
      "the self-test needs a markdown surface that is not the README");
    ok = false;
  } else {
    const withShape = (text) => ({
      ...inputs,
      shapes: {
        ...shapes,
        surfaces: shapes.surfaces.map((s) => (s.file === shapeTarget.file ? { ...s, text } : s)),
      },
    });
    const withSurface = (file, text) => ({
      ...inputs,
      shapes: {
        ...shapes,
        surfaces: [
          ...shapes.surfaces.map((s) => (s.file === file ? { ...s, text } : s)),
          ...(shapes.surfaces.some((s) => s.file === file) ? [] : [{ file, text }]),
        ],
      },
    });
    const count = SHAPE_COUNT_FLOOR + 1;
    expect("an undated shape count is reported",
      () => withShape(`${shapeTarget.text}\n\n${shapeFixture(count)}\n`),
      "a count of a collection that grows is false the day the org gains one, and " +
      "nothing in the tree says so");
    expectClean("a dated shape count is not reported",
      () => withShape(`${shapeTarget.text}\n\nThe fleet holds ${count} submodules (measured 2026-10-22).\n`),
      "a dated point figure is a measurement of a known tree, not a claim about a " +
      "moving one");
    // The date reaches the CLAUSE that carries the count, and only that clause:
    // these two arms are the ones the block-scoped rule could not pass — under
    // it, a date anywhere in the paragraph excused every count the paragraph
    // held, which is how a count nobody measured escaped the family.
    expect("a count whose OWN clause carries no date is reported, though a later clause of the same block carries one",
      () => withShape(`${shapeTarget.text}\n\nThe fleet holds ${count} submodules. Measured on 2026-10-22, the corpus was verified.\n`),
      "the date measured the corpus, not the fleet — a dated sentence in the same paragraph " +
      "is not a measurement of every count that paragraph holds");
    expect("a count whose OWN clause carries no date is reported, though an earlier clause of the same block carries one",
      () => withShape(`${shapeTarget.text}\n\nMeasured on 2026-10-22, the corpus was verified. The fleet holds ${count} submodules.\n`),
      "the date that precedes the count measured something else — the date reaches the count " +
      "it was measured with, and no other");
    // The CORPUS's shape is a collection that grows like the pin count, and the
    // noun list is what decides whether a count of it is seen at all. It was not
    // seen: `reasonix.toml` stated "42 directories" against the 45 the list
    // below it names (measured 2026-10-28), and the family was green on both.
    expect("a shape count of the CORPUS's shape is reported",
      () => withShape(`${shapeTarget.text}\n\nThe corpus holds ${count} skills.\n`),
      "the corpus's shape grows with the org, and a count of it is false the day " +
      "a family lands — the noun list is what gives the family that reach");
    expectClean("a count whose noun names a THING is not reported",
      () => withShape(`${shapeTarget.text}\n\nThe checkpoint dir is mode 0700 directory.\n`),
      "the singular of a collection noun names a thing — a file mode here — and a " +
      "family that read it as a count would report this tree as broken");
    expectClean("a count whose noun is a diagnostic NAME is not reported",
      () => withShape(`${shapeTarget.text}\n\n500 skill.missing_description warnings.\n`),
      "a diagnostic's name is not a collection, and a number in front of one " +
      "does not make it one");
    // A number written with a thousands separator is ONE number, and the separator
    // used to cut it in two: the digits after it were judged on their own, so a
    // count written as 1,000 was judged as 0 and fell under the floor — the site
    // ESCAPED the family — while a count of 3,500 was reported as 500, a finding
    // that named the wrong number. The same defect as the noun list's blindness:
    // a bare count of a growing collection the family cannot see.
    // The number is a VARIABLE, so this file's own text carries no literal count:
    // a literal one would be a site the gate reads in this very file.
    const grouped = "1,000";
    expect("a shape count written with a thousands separator is reported",
      () => withShape(`${shapeTarget.text}\n\nThe corpus holds ${grouped} skills.\n`),
      "the separator ends a number, it does not divide one — a count of the " +
      "corpus's shape written with a separator is the count, not the count's tail");
    expect("a shape count whose TOTAL is written with a thousands separator is reported",
      () => withShape(`${shapeTarget.text}\n\nThe corpus holds ${count + 1} of ${grouped} skills.\n`),
      "the total is the figure that decides a bound, so a total written with a " +
      "separator is read whole too");
    expectClean("a grouped number that names no collection is not reported",
      () => withShape(`${shapeTarget.text}\n\nThe fleet grew ${grouped} nodes.\n`),
      "a number is only this family's business when it counts a collection that " +
      "grows — the separator must not turn every number into one");

    // The three ways a count used to HIDE from this family, each asserted
    // against the surface that carries it. Every one of them was a live
    // instance in the tree while the family reported the tree as clean.
    expect("a shape count in a STRING is reported",
      () => {
        const target = shapes.surfaces.find((s) => /\.(ts|mjs|js)$/.test(s.file));
        if (!target) throw new Error("no code surface to exercise");
        return withSurface(target.file, `const note = "${shapeFixture(count)}";\n`);
      },
      "a count the tree states in a string is a claim a reader sees, and the " +
      "string is what the family used to skip");
    expect("a shape count in a file with NO extension is reported",
      () => {
        const target = shapes.surfaces.find(
          (s) => !s.file.split("/").pop().includes(".") && s.file !== FILES.readme);
        if (!target) throw new Error("no extensionless surface to exercise");
        return withSurface(target.file, `# ${shapeFixture(count)}\n`);
      },
      "the surface set is the FILE SET, so a file that lands carrying prose is " +
      "covered the moment it lands");
    expect("an EMPHASIS-WRAPPED shape count is reported",
      () => withShape(`${shapeTarget.text}\n\nThe fleet holds **${count}** submodules.\n`),
      "emphasis hides a count from a plain match, and the wrapper is no reason " +
      "for the number to be free");
    expect("a shape count in a YAML SIBLING entry is reported",
      () => withSurface("synthetic-sibling.yaml", [
        "verify:",
        "  - note: measured on 2026-10-22",
        "  - |",
        `    the fleet holds ${count} submodules`,
        "",
      ].join("\n")),
      "a date in a SIBLING entry does not date this one: the whole subtree of a " +
      "top-level key is not one block");

    // DIRECT arm: the same question must get the same answer whatever was asked
    // before it. The count patterns carry the `g` flag — the finding pass walks
    // them with `exec` to collect EVERY count on a line — so a global `test()`
    // RESUMES from wherever the last match ended, and a line read after another
    // line could be read from a stale offset and MISS a count that is there. The
    // probe carries its count at its START, so a reader that resumes past it
    // sees no count at all. Measured: without the reset the second read is false
    // for every offset the first read can leave behind.
    {
      const probe = `${count} pins`;
      const first = isCodeProse("3 submodules");
      const second = isCodeProse(probe);
      const orderFree = first && second;
      report.push(
        `  ${orderFree ? "OK  " : "FAIL"} a count is read the same way whatever was read before it — ` +
        "the shape patterns are global, and a global test resumes from the last match");
      if (!orderFree) ok = false;
    }
  }
  return { ok, report };
}

// --- run ----------------------------------------------------------------------
function main() {
  const readme = read(root, FILES.readme);
  const script = read(root, FILES.script);
  const manifest = read(root, FILES.manifest);
  const measure = read(root, FILES.measure);
  const samples = samplesPath ? readFileSync(samplesPath, "utf8") : null;
  const shapes = listShapeSurfaces(root);

  if (selfTest) {
    const r = runSelfTest(readme, script, manifest, samples, measure, shapes);
    console.log("check-readme-measurements: the self-test — every assertion must be able to fail");
    for (const line of r.report) console.log(line);
    if (!r.ok) {
      console.log("SELF-TEST FAILED — an assertion that cannot fail is not a control (R7).");
      process.exit(1);
    }
    console.log("SELF-TEST OK — every assertion was seen to fail on a mutation.");
    process.exit(0);
  }

  const { findings } = runChecks({ readme, script, manifest, samples, measure, shapes });
  console.log("check-readme-measurements: the umbrella's measured figures, read against each other");
  if (readme) {
    const rows = parseTable(readme);
    for (const key of ["baseline", "light", "all"]) {
      const r = rows[key];
      if (!r) continue;
      const size = r.size ? `${r.size.lo}–${r.size.hi} ${r.size.unit}` : "?";
      const clock = !r.clock ? "?"
        : r.clock.kind === "coarse" ? "coarse"
        : `${r.clock.lo}–${r.clock.hi} s`;
      console.log(`  ${key}: ${size}, ${clock}`);
    }
  }
  if (samples) {
    const s = parseSamples(samples);
    console.log(`  samples: ${s.lightSize.length} light clone(s), ${s.bootSize.length} bootstrapped tree(s), ` +
      `${s.allSize.length} --all shape(s), ${s.storeSize.length} store reading(s)`);
  }
  if (!findings.length) {
    console.log("OK — the table, the prose and the samples agree.");
    process.exit(0);
  }
  for (const f of findings) console.log(`  FINDING ${f.site}: ${f.message}`);
  console.log(`FAILED — ${findings.length} finding(s).`);
  process.exit(1);
}

main();
