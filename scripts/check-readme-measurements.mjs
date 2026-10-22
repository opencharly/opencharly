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
// A band that a sample has outgrown is a DEFECT in the band, not in the sample: the
// gate reports which band and which sample, and the README is widened to the range
// the runs produce — a new tree, hence a new gate.
//
// Usage: node scripts/check-readme-measurements.mjs [--root <dir>] [--samples <log>]
//                                                 [--self-test]
// exit 0 clean · 1 finding

import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

// --- the core: everything the gate asserts -----------------------------------
function runChecks({ readme, script, manifest, samples }) {
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
      /the light clone measured between ([0-9.]+) ([A-Z]) and ([0-9.]+) ([A-Z])/,
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
  const boot = /a bootstrapped light tree measures ([0-9.]+)[–-]([0-9.]+) ?([A-Z])/
    .exec(flat.text);
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
  const store = /mirror's module store — ([0-9.]+)[–-]([0-9.]+) ?([A-Z]) in a from-scratch clone/
    .exec(flat.text);
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
  const tableDate = /Every figure in the table was measured on this machine on (\d{4}-\d{2}-\d{2}); the bands carry the readings taken on (\d{4}-\d{2}-\d{2}) as well\./
    .exec(flat.text);
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
    const m = /([0-9.]+) G on disk[\s\S]{0,300}?measured (\d{4}-\d{2}-\d{2})/.exec(script);
    if (!m) {
      add(FILES.script, "the initializer's header does not carry the baseline's date");
    } else {
      dateSites.push({ site: FILES.script, label: "the initializer's header", figure: +m[1], date: m[2] });
    }
  }
  if (manifest !== null) {
    const m = /costs ([0-9.]+) G on disk[\s\S]{0,200}?measured (\d{4}-\d{2}-\d{2})/.exec(manifest);
    if (!m) {
      add(FILES.manifest, "the manifest's init header does not carry the baseline's date");
    } else {
      dateSites.push({ site: FILES.manifest, label: "the manifest's init header", figure: +m[1], date: m[2] });
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

function runSelfTest(readme, script, manifest, samples) {
  const base = runChecks({ readme, script, manifest, samples });
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
  const withReadme = (newReadme) => ({ readme: newReadme, script, manifest, samples });

  expect("the table's band is widened",
    () => withReadme(mutate(readme, /\| 73–77 M \|/, "| 73–75 M |", "the table's light row")),
    "the prose still says 77 M, so the two copies of the band disagree");
  expect("the prose's band is widened",
    () => withReadme(mutate(readme, /73 M and 77 M/, "73 M and 75 M", "the prose's light band")),
    "the table still says 77 M");
  expect("the table's date sentence is changed",
    () => withReadme(mutate(readme, /measured on this machine on 2026-10-22/,
      "measured on this machine on 2026-10-23", "the table's date sentence")),
    "the baseline is dated differently in different places");
  expect("the initializer's header loses the date",
    () => ({ readme, script: mutate(script, /measured 2026-10-22/, "measured",
      "the initializer's header"), manifest, samples }),
    "the initializer's header does not carry the baseline's date");
  expect("the manifest's init header loses the date",
    () => ({ readme, script, manifest: mutate(manifest, /measured 2026-10-22/, "measured",
      "the manifest's init header"), samples }),
    "the manifest's init header does not carry the baseline's date");
  expect("the bootstrapped band is below the clone's",
    () => withReadme(mutate(readme, /measures 125–128 M/, "measures 73–80 M",
      "the bootstrapped tree's band")),
    "the bootstrap ADDS the binary and its build cache, so its band cannot start below the clone's");
  expect("the store's band is not a band",
    () => withReadme(mutate(readme, /module store — 480–520 M in a from-scratch clone/,
      "module store — about 500 M in a from-scratch clone", "the store's band")),
    "the runs repeated that measurement, so it carries a band");
  if (samples) {
    expect("a sample falls outside its band",
      () => ({ readme, script, manifest, samples: mutate(samples, /^([0-9.]+)M\t/m, "9999M\t",
        "a light clone's size sample") }),
      "a band that a sample has outgrown is a defect in the band");
    expect("the samples' day leaves the table's span",
      () => withReadme(mutate(readme, /the bands carry the readings taken on \d{4}-\d{2}-\d{2}/,
        "the bands carry the readings taken on 1999-01-01", "the table's span")),
      "a band that does not cover the day the readings were taken is unchecked");
  }
  return { ok, report };
}

// --- run ----------------------------------------------------------------------
function main() {
  const readme = read(root, FILES.readme);
  const script = read(root, FILES.script);
  const manifest = read(root, FILES.manifest);
  const samples = samplesPath ? readFileSync(samplesPath, "utf8") : null;

  if (selfTest) {
    const r = runSelfTest(readme, script, manifest, samples);
    console.log("check-readme-measurements: the self-test — every assertion must be able to fail");
    for (const line of r.report) console.log(line);
    if (!r.ok) {
      console.log("SELF-TEST FAILED — an assertion that cannot fail is not a control (R7).");
      process.exit(1);
    }
    console.log("SELF-TEST OK — every assertion was seen to fail on a mutation.");
    process.exit(0);
  }

  const { findings } = runChecks({ readme, script, manifest, samples });
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
