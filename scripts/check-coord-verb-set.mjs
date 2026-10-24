#!/usr/bin/env node
// check-coord-verb-set.mjs — every copy of the coordination closed set is the SAME set.
//
// Why it exists (opencharly/opencharly#567). The coordination grammar's closed set is
// duplicated across the org by design: each repo owns its own copy of the rulebook, and
// the tools that IMPLEMENT the grammar each carry the list too (the shell `coord.sh` and
// the TypeScript `coord.ts`). A rename that lands in some copies and not others leaves a
// grammar with two answers — which is exactly the defect the cutover closed: `BLOCKS` meant
// "this blocks the merge" in the validator's verdict vocabulary AND "I am blocked" in a
// coordination comment, in the same file.
//
// This gate makes the copies comparable, mechanically, in TWO jobs:
//
//   1. Every surface that ENUMERATES the set is extracted, its labels are parsed in order,
//      and the sequence is compared against the canonical nine — same labels, same order.
//      A surface that lost a label, gained one, or reordered them turns this RED.
//
//   2. Every place that STATES the set is COVERED by a surface. Job 1 compares the
//      surfaces somebody remembered to list; job 2 asks the FILES how many places state
//      the set, and a place no surface covers turns this RED.
//
// Why job 2 exists (the same lesson as opencharly/marketplace#526, round 1). The
// marketplace's `scripts/coord.sh` stated the set THREE times — the `VERBS` array, the
// `--help` prose, and a third copy in the header — while every assertion compared the two
// copies somebody had named. The third copy drifted silently. A gate that enumerates
// locations has the same blindness: a copy added to a file nobody listed, or a third copy
// added to a file that IS listed, is invisible to job 1. Job 2 closes both.
//
// The canonical list lives HERE, in the gate, and is not derived from any of the copies:
// a copy that drifts is a finding, not the new truth.
//
// A surface that is not checked out (a submodule in a session worktree) SKIPS visibly;
// a silent pass is forbidden. A surface whose file IS present but whose locator no longer
// matches FAILS: a copy that changed shape must be noticed, not skipped.
//
// Usage: node scripts/check-coord-verb-set.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding
//
// `--self-test` runs the arms in a CHILD process under a controlled TMPDIR and then
// checks, FROM THE OUTSIDE, that the child left no fixture directory behind. The child
// mode is `--self-test-arms`; it is internal, and the observer is what calls it.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);
const skip = (m) => console.log(`  SKIP  ${m}`);

/** THE canonical closed set — nine labels, in order. Not derived from any copy. */
export const CANONICAL = [
  "CLAIM",
  "OWNING",
  "HANDING OVER",
  "TAKING OVER",
  "WAITING",
  "HOLDING",
  "CLEARED",
  "STATUS",
  "RESOLVED",
];

/**
 * How many of the nine a place must name before it counts as a STATEMENT of the set.
 *
 * Seven is the point where a statement is a copy rather than a mention: a prose sentence
 * that says "a `WAITING`, a `HOLDING`, a `TAKING OVER`" names three and is not a copy,
 * while a copy that lost two labels still names seven and IS a copy.
 */
export const MIN_STATEMENT_LABELS = 7;

/**
 * Parse a region's words into the labels it lists, IN ORDER.
 *
 * The separators differ per surface (`·`, `/`, `,`, `|`, plain spaces) and two labels
 * carry an internal space ("HANDING OVER"), so the region is tokenised on every
 * separator and the words are matched against the canonical labels greedily. A word
 * that starts no canonical label is reported as `unknown` — that is how a copy that
 * renamed a label to something else is caught.
 *
 * `|` is a separator because a documented GREP RECIPE states the set as a regex
 * alternation: `grep -E '^(CLAIM|OWNING|…|RESOLVED)\b'`. That recipe is a copy of the
 * set, and a rename that leaves it behind makes the recipe find NOTHING at run time —
 * a silent failure in the one place the grammar is looked up. A parser that cannot
 * read the shape cannot compare it, and a copy nobody compares is a copy free to drift.
 */
export function parseLabels(region) {
  const words = String(region)
    .replace(/[·/,\n|]/g, " ")
    // `"`, `'` and a backtick quote the labels; `*`/`#` are markdown emphasis; `[`/`]`
    // delimit an array literal; `+` is a TypeScript string concatenation. None of them
    // is part of a label, and none may hide a word from the comparison.
    .replace(/[`"'*#[\]+]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const found = [];
  let i = 0;
  while (i < words.length) {
    const matches = CANONICAL.filter((l) => {
      const lw = l.split(" ");
      return lw.every((w, k) => words[i + k] === w);
    });
    if (matches.length === 0) return { found, unknown: words.slice(i).join(" ") };
    // The longest match wins, so "HANDING OVER" is never read as "HANDING" + "OVER".
    matches.sort((a, b) => b.length - a.length);
    found.push(matches[0]);
    i += matches[0].split(" ").length;
  }
  return { found, unknown: null };
}

/**
 * The canonical labels a LINE names, in order of appearance, case-insensitively.
 *
 * A label is only counted when it stands as a word — `status` inside `statuses` is not a
 * label — so ordinary prose about a "status" does not become a copy of the set.
 */
export function labelsInLine(line) {
  const out = [];
  const up = line.toUpperCase();
  let i = 0;
  while (i < up.length) {
    const before = i === 0 ? "" : up[i - 1];
    const hit = CANONICAL.find((l) => {
      if (!up.startsWith(l, i)) return false;
      const after = up[i + l.length] ?? "";
      return !/[A-Z]/.test(before) && !/[A-Z]/.test(after);
    });
    if (hit) {
      out.push(hit);
      i += hit.length;
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * The SMALLEST run of labels, inside a sequence, that names at least
 * MIN_STATEMENT_LABELS DISTINCT canonical labels.
 *
 * The order is deliberately NOT required here. A copy of the set that REORDERED its
 * labels is still a copy — it is the drift this gate exists to catch — and a detector
 * that demands canonical order cannot see it: in a fully reversed list every label
 * starts a new ordered run, so an ordered window stops at ONE label and the copy
 * vanishes. The order is checked where the copy is COMPARED (job 1 compares a listed
 * surface against the canonical nine, order included); the question here is only
 * "does this place state the set at all".
 *
 * The COUNT is what separates a copy from a mention: a prose sentence that names "a
 * `WAITING`, a `HOLDING`, a `TAKING OVER`" names three and is not a copy, while a copy
 * that lost two labels still names seven and IS a copy.
 */
export function distinctWindow(seq) {
  let best = null;
  for (let i = 0; i < seq.length; i += 1) {
    const seen = new Set();
    for (let j = i; j < seq.length; j += 1) {
      seen.add(seq[j].label);
      if (seen.size >= MIN_STATEMENT_LABELS) {
        const window = seq.slice(i, j + 1);
        if (!best || window.length < best.length) best = window;
        break;
      }
    }
  }
  return best ?? [];
}

/**
 * Every STATEMENT of the closed set in a text: a maximal run of consecutive lines that
 * names at least MIN_STATEMENT_LABELS of the nine, in any order.
 *
 * This is the FILE's answer to "how many places state the set" — a property of the file,
 * not a list of places somebody remembered to look.
 */
export function findStatements(text) {
  const lines = text.split("\n");
  const perLine = lines.map((l) => labelsInLine(l).map((label) => ({ label, line: 0 })));
  const statements = [];
  let runStart = -1;
  const flush = (runEnd) => {
    if (runStart === -1) return;
    const seq = [];
    for (let i = runStart; i <= runEnd; i += 1) {
      for (const { label } of perLine[i]) seq.push({ label, line: i });
    }
    const window = distinctWindow(seq);
    if (window.length) {
      const linesOf = window.map((w) => w.line);
      statements.push({
        startLine: Math.min(...linesOf),
        endLine: Math.max(...linesOf),
        labels: [...new Set(window.map((w) => w.label))],
      });
    }
    runStart = -1;
  };
  for (let i = 0; i < lines.length; i += 1) {
    if (perLine[i].length) {
      if (runStart === -1) runStart = i;
    } else {
      flush(i - 1);
    }
  }
  flush(lines.length - 1);
  return statements;
}

/** The first capture group of `re` in `text`, with its character range, or null. */
function capture(text, re) {
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index + m[0].indexOf(m[1]);
  return { region: m[1], start, end: start + m[1].length };
}

/**
 * The verb table's first column: every row after the `| Verb | Means | … |` header,
 * up to the first line that is not a table row — with the range of the rows it read.
 */
function tableVerbs(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^\|\s*Verb\s*\|/m.test(l));
  if (start === -1) return null;
  const cells = [];
  let end = start;
  for (const line of lines.slice(start + 1)) {
    if (!line.trimStart().startsWith("|")) break;
    const cell = line.split("|")[1];
    if (cell === undefined) break;
    // The table's `|---|---|---|` separator row is not a verb.
    if (!/^[\s|:-]+$/.test(cell)) cells.push(cell);
    end += 1;
  }
  if (!cells.length) return null;
  const charStart = lines.slice(0, start + 1).reduce((n, l) => n + l.length + 1, 0);
  const charEnd = lines.slice(0, end + 1).reduce((n, l) => n + l.length + 1, 0);
  return { region: cells.join(" "), start: charStart, end: charEnd };
}

/**
 * Every surface that ENUMERATES the closed set. `file` is relative to the root;
 * `extract` returns the region holding the enumeration WITH ITS RANGE, or null when the
 * locator no longer matches the file.
 */
export const SURFACES = [
  {
    name: "umbrella AGENTS.md (Part II #7, the grammar rule)",
    file: "AGENTS.md",
    extract: (t) => capture(t, /one label from ([^.]*)\./),
  },
  {
    name: "umbrella .pi/APPEND_SYSTEM.md (the pi harness prompt)",
    file: ".pi/APPEND_SYSTEM.md",
    extract: (t) => capture(t, /one label: ([^.]*)\./),
  },
  {
    name: "umbrella .opencode/plugins/coord.ts (the VERBS array)",
    file: ".opencode/plugins/coord.ts",
    extract: (t) => capture(t, /export const VERBS = \[([\s\S]*?)\]/),
  },
  {
    // The tool's DESCRIPTION is a hand-written second copy of the set, in the same
    // file, assembled from concatenated string literals. A copy nothing compares is a
    // copy free to drift — and this one is what an agent reads to learn the grammar.
    name: "umbrella .opencode/plugins/coord.ts (the tool description)",
    file: ".opencode/plugins/coord.ts",
    extract: (t) => capture(t, /Use it for ([\s\S]*?) per AGENTS\.md\./),
  },
  {
    // The plugin's own gate states the canonical nine a second time, to assert the
    // VERBS array against it. THAT statement is a copy too: the org-wide gate is the
    // single owner of the canonical list, and this surface is how the two are compared.
    name: "umbrella scripts/check-opencode-coord.mjs (the gate's own closed set)",
    file: "scripts/check-opencode-coord.mjs",
    extract: (t) => capture(t, /eq\(\s*\[\.\.\.VERBS\],\s*(\[[^\]]*\])/),
  },
  {
    // This gate's own canonical list. It is the DEFINITION, not a copy — but it is
    // still a place that states the set, and a second statement in this file would be
    // exactly the drift this gate exists to catch.
    name: "umbrella scripts/check-coord-verb-set.mjs (this gate's canonical list)",
    file: "scripts/check-coord-verb-set.mjs",
    extract: (t) => capture(t, /export const CANONICAL = \[([\s\S]*?)\]/),
  },
  {
    name: "marketplace scripts/coord.sh (the VERBS array)",
    file: "marketplace/scripts/coord.sh",
    extract: (t) => capture(t, /^VERBS=\((.*)\)$/m),
  },
  {
    name: "marketplace scripts/coord.sh (the --help prose)",
    file: "marketplace/scripts/coord.sh",
    extract: (t) => capture(t, /one of ([^.]*)\./),
  },
  {
    name: "action-review charly.yml (the validator's own closed set)",
    file: "action-review/charly.yml",
    extract: (t) => capture(t, /closed set: ([^.]*)\./),
  },
  {
    // AUTHORED HERE since opencharly/opencharly#672: the coordination grammar lives in
    // THIS repo's `.agents/skills/git-workflow/` — the umbrella is its home (AGENTS.md
    // Part II #5's measured exception), so the surface is a local path. It was
    // `layer-charly-internals/...` while that carrier owned the body, and that path is
    // gone with the carrier: a locator that names a retired repo would SKIP forever and
    // leave these copies uncompared.
    name: "umbrella .agents/skills/git-workflow/SKILL.md (the CLOSED set)",
    file: ".agents/skills/git-workflow/SKILL.md",
    extract: (t) => capture(t, /CLOSED set — ([^.]*)\./),
  },
  {
    name: "umbrella .agents/skills/git-workflow/SKILL.md (the B2 row)",
    file: ".agents/skills/git-workflow/SKILL.md",
    extract: (t) => capture(t, /the (CLAIM\/[^)]*?) verb grammar/),
  },
  {
    name: "umbrella .agents/skills/git-workflow/references/multi-repo-coordination.md (the verb table)",
    file: ".agents/skills/git-workflow/references/multi-repo-coordination.md",
    extract: (t) => tableVerbs(t),
  },
  {
    // The documented GREP RECIPE states the set as a regex alternation. It is a copy
    // of the set like any other, and it is the copy that BREAKS SILENTLY: a rename
    // that misses it leaves a recipe that matches nothing, and the recipe is how an
    // agent looks the grammar up. A recipe nobody compares is a recipe free to drift.
    name: "umbrella .agents/skills/git-workflow/references/multi-repo-coordination.md (the grep recipe)",
    file: ".agents/skills/git-workflow/references/multi-repo-coordination.md",
    extract: (t) => capture(t, /grep -E '\^\(([^)]*)\)/),
  },
  {
    name: "the corpus projection of git-workflow SKILL.md (the CLOSED set)",
    file: "marketplace/internals/skills/git-workflow/SKILL.md",
    extract: (t) => capture(t, /CLOSED set — ([^.]*)\./),
  },
  {
    name: "the corpus projection of git-workflow SKILL.md (the B2 row)",
    file: "marketplace/internals/skills/git-workflow/SKILL.md",
    extract: (t) => capture(t, /the (CLAIM\/[^)]*?) verb grammar/),
  },
  {
    name: "the corpus projection of multi-repo-coordination.md (the verb table)",
    file: "marketplace/internals/skills/git-workflow/references/multi-repo-coordination.md",
    extract: (t) => tableVerbs(t),
  },
  {
    name: "the corpus projection of multi-repo-coordination.md (the grep recipe)",
    file: "marketplace/internals/skills/git-workflow/references/multi-repo-coordination.md",
    extract: (t) => capture(t, /grep -E '\^\(([^)]*)\)/),
  },
];

/** The line number (0-based) of a character offset in a text. */
function lineOf(text, offset) {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text[i] === "\n") line += 1;
  return line;
}

/** The files this gate reads: the repo's own tracked files, plus every surface's file. */
export function scanFiles(dir) {
  const files = new Set();
  const tracked = spawnSync("git", ["-C", dir, "ls-files", "-z"], { encoding: "utf8" });
  if (tracked.status === 0) {
    for (const f of tracked.stdout.split("\0")) {
      if (!f || f.startsWith("CHANGELOG/")) continue;
      try {
        if (statSync(join(dir, f)).isFile()) files.add(f);
      } catch {
        /* a gitlink whose target is not checked out */
      }
    }
  } else {
    // Not a git repository — the self-test's fixture. Walk it instead.
    const walk = (d, prefix) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "CHANGELOG") continue;
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(join(d, entry.name), rel);
        else if (entry.isFile()) files.add(rel);
      }
    };
    walk(dir, "");
  }
  for (const s of SURFACES) files.add(s.file);
  return [...files];
}

function check(dir) {
  console.log(`check-coord-verb-set: ${dir}`);
  let compared = 0;
  let skipped = 0;

  // --- JOB 1: every KNOWN surface states the canonical nine, in order --------------
  /** file -> the surfaces that read it, with the line range each one covers. */
  const covered = new Map();
  for (const s of SURFACES) {
    const path = join(dir, s.file);
    if (!existsSync(path)) {
      skip(`${s.name}: ${s.file} is not checked out (the comparison did not run)`);
      skipped += 1;
      continue;
    }
    const text = readFileSync(path, "utf8");
    const hit = s.extract(text);
    if (hit === null) {
      fail(`${s.name}: ${s.file} no longer matches its locator — the copy changed shape`);
      continue;
    }
    const { found, unknown } = parseLabels(hit.region);
    if (unknown !== null) {
      // The parse STOPS at the first word that names no canonical label, so the rest of
      // the region was never read. Report the first offender, not the whole tail — a
      // retired label must be named as itself, not as a run of words.
      fail(`${s.name}: lists the label '${unknown.split(" ")[0]}', which is not in the closed set`);
      continue;
    }
    if (found.length !== CANONICAL.length || found.some((l, i) => l !== CANONICAL[i])) {
      fail(`${s.name}: lists [${found.join(", ")}] — the canonical set is [${CANONICAL.join(", ")}]`);
      continue;
    }
    ok(`${s.name}: the nine labels, in order`);
    compared += 1;
    if (!covered.has(s.file)) covered.set(s.file, []);
    covered.get(s.file).push({
      name: s.name,
      from: lineOf(text, hit.start),
      to: lineOf(text, hit.end),
    });
  }

  // --- JOB 2: every place that STATES the set is covered by a surface --------------
  let statements = 0;
  for (const rel of scanFiles(dir)) {
    const path = join(dir, rel);
    if (!existsSync(path)) continue;
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const found = findStatements(text);
    if (!found.length) continue;
    const ranges = covered.get(rel) ?? [];
    for (const st of found) {
      statements += 1;
      const isCovered = ranges.some((r) => st.startLine <= r.to && r.from <= st.endLine);
      if (isCovered) continue;
      fail(
        `${rel}:${st.startLine + 1} states the closed set ([${st.labels.join(", ")}]) and no surface ` +
          `covers it — a copy nobody compares. Add it to SURFACES, or delete the copy.`,
      );
    }
  }

  console.log(
    `check-coord-verb-set: ${compared} surface(s) compared, ${skipped} skipped, ` +
      `${statements} statement(s) of the set found, ${failures} failure(s)`,
  );
}

/**
 * The self-test's arms. Returns the number of failed arms — the CALLER exits.
 *
 * The exit is deliberately NOT here: the `finally` below removes this run's fixture
 * directory, and an exit from inside the `try` skips it — the leak
 * opencharly/opencharly#576 names. The caller exits, outside the try.
 */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "check-coord-verb-set-"));
  try {
    const agents = (set) =>
      `# t\n\n- A coordination comment opens with one label from ${set}.\n`;
    // The TypeScript shape, with the set in BOTH places it lives in that file: the
    // VERBS array, and the tool description — the description assembled from TWO
    // concatenated string literals, exactly as the real file writes it, so the
    // comparison is exercised against the shape it will meet.
    const coordTs = (set) => {
      const labels = set.split(" · ");
      const half = Math.ceil(labels.length / 2);
      const head = labels.slice(0, half).join(" / ");
      const tail = labels.slice(half).join(" / ");
      return [
        `export const VERBS = [\n${labels.map((l) => `  "${l}",`).join("\n")}\n];\n`,
        `export default {\n  tools: {\n    coord_comment: {\n      description:\n        "Use it for ${head} / " +\n        "${tail} per AGENTS.md. " +\n    },\n  },\n};\n`,
      ].join("\n");
    };
    const pluginGate = (set) =>
      `eq(\n  [...VERBS],\n  ${JSON.stringify(set.split(" · "))},\n  "VERBS is the nine-label closed set, in order",\n);\n`;
    // A file that states the set and that NO surface reads — the copy nobody compares.
    const unlisted = (set) => `# notes\n\nThe labels are ${set}.\n`;
    /**
     * The surfaces a fixture must carry for job 1 to have something to compare.
     * One writer for every arm: a fixture built twice is a fixture that can drift.
     */
    const writeFixture = (d, set) => {
      writeFileSync(join(d, "AGENTS.md"), agents(set));
      mkdirSync(join(d, ".opencode/plugins"), { recursive: true });
      writeFileSync(join(d, ".opencode/plugins/coord.ts"), coordTs(set));
      mkdirSync(join(d, "scripts"), { recursive: true });
      writeFileSync(join(d, "scripts/check-opencode-coord.mjs"), pluginGate(set));
    };
    const cases = [
      ["the canonical set", CANONICAL.join(" · "), true],
      ["a set that lost CLEARED", CANONICAL.filter((l) => l !== "CLEARED").join(" · "), false],
      ["a set with the retired BLOCKS", [...CANONICAL.slice(0, 4), "BLOCKS", ...CANONICAL.slice(4)].join(" · "), false],
      ["a set in the wrong order", [...CANONICAL.slice(1), CANONICAL[0]].join(" · "), false],
      ["a set with an invented label", [...CANONICAL.slice(0, 2), "BLOCKED", ...CANONICAL.slice(2)].join(" · "), false],
    ];
    let bad = 0;
    for (const [name, set, green] of cases) {
      const d = mkdtempSync(join(tmpdir(), "check-coord-verb-set-case-"));
      try {
        writeFixture(d, set);
        const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", d], {
          encoding: "utf8",
        });
        const gotGreen = r.status === 0;
        if (gotGreen === green) console.log(`  PASS  self-test '${name}' is ${green ? "GREEN" : "RED"}`);
        else {
          bad += 1;
          console.error(
            `  FAIL  self-test '${name}' expected ${green ? "GREEN" : "RED"}, got exit ${r.status}\n${r.stdout}${r.stderr}`,
          );
        }
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    }

    // --- JOB 2's own controls: a copy nobody compares must turn the gate RED -------
    const job2 = [
      [
        "a THIRD copy in a file that IS listed (AGENTS.md)",
        (d, set) => {
          writeFileSync(join(d, "AGENTS.md"), `${agents(set)}\nAnd again: ${set}.\n`);
        },
      ],
      [
        "a copy in a file NOBODY lists (NOTES.md)",
        (d, set) => {
          writeFileSync(join(d, "NOTES.md"), unlisted(set));
        },
      ],
      [
        "a copy in a file NOBODY lists, with the labels in the wrong order",
        (d, set) => {
          const reversed = [...set.split(" · ")].reverse().join(" · ");
          writeFileSync(join(d, "NOTES.md"), unlisted(reversed));
        },
      ],
    ];
    for (const [name, mutate] of job2) {
      const d = mkdtempSync(join(tmpdir(), "check-coord-verb-set-job2-"));
      try {
        const set = CANONICAL.join(" · ");
        writeFixture(d, set);
        mutate(d, set);
        const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", d], {
          encoding: "utf8",
        });
        if (r.status !== 0) console.log(`  PASS  self-test '${name}' is RED`);
        else {
          bad += 1;
          console.error(`  FAIL  self-test '${name}' expected RED, got exit 0\n${r.stdout}${r.stderr}`);
        }
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    }

    // --- the other side of the threshold: a MENTION is not a copy -------------------
    // A file that names a few labels in prose ("a `WAITING`, a `HOLDING`, a `TAKING
    // OVER`") is a mention, not a copy of the set. A detector that fired on it would
    // be a detector authors learn to ignore, so this arm must stay GREEN.
    {
      const d = mkdtempSync(join(tmpdir(), "check-coord-verb-set-mention-"));
      try {
        const set = CANONICAL.join(" · ");
        writeFixture(d, set);
        writeFileSync(join(d, "NOTES.md"), "# notes\n\nA comment may open with CLAIM, OWNING or STATUS.\n");
        const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", d], {
          encoding: "utf8",
        });
        if (r.status === 0) console.log("  PASS  self-test 'a mention of three labels is not a copy' is GREEN");
        else {
          bad += 1;
          console.error(`  FAIL  self-test 'a mention of three labels is not a copy' expected GREEN, got exit ${r.status}\n${r.stdout}${r.stderr}`);
        }
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    }

    // --- the GREP RECIPE: a copy of the set in the shape a recipe takes ------------
    // A documented recipe states the closed set as a regex ALTERNATION, and it is the
    // copy that breaks silently: a rename that misses it leaves a recipe that matches
    // nothing, in the one place the grammar is looked up. These two arms prove the
    // gate READS that shape and COMPARES it — before the fix the recipe was invisible
    // to the gate, and a retired label in it passed unnoticed.
    {
      const refFile = ".agents/skills/git-workflow/references/multi-repo-coordination.md";
      const coordRef = (alternation) => {
        const rows = CANONICAL.map((l) => `| \`${l}\` | it means what it says |`).join("\n");
        return [
          "# coordination",
          "",
          "| Verb | Means | Required fields |",
          "|---|---|---|",
          rows,
          "",
          "```bash",
          "gh pr view <n> --repo <r> --json comments --jq '.comments[].body' \\",
          `  | grep -E '^(${alternation})\\b'`,
          "```",
          "",
        ].join("\n");
      };
      const recipeCases = [
        ["a grep recipe that states the nine labels", CANONICAL.join("|"), true, null],
        [
          "a grep recipe that still carries the retired BLOCKS",
          [...CANONICAL.slice(0, 4), "BLOCKS", ...CANONICAL.slice(4)].join("|"),
          false,
          // The message names the RETIRED LABEL, not the first word of the region. That
          // is what proves the alternation was READ: a parser that cannot split on `|`
          // stops at the first word and reports the whole run instead.
          "lists the label 'BLOCKS'",
        ],
      ];
      for (const [name, alternation, green, expect] of recipeCases) {
        const d = mkdtempSync(join(tmpdir(), "check-coord-verb-set-recipe-"));
        try {
          writeFixture(d, CANONICAL.join(" · "));
          mkdirSync(join(d, dirname(refFile)), { recursive: true });
          writeFileSync(join(d, refFile), coordRef(alternation));
          const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", d], {
            encoding: "utf8",
          });
          const gotGreen = r.status === 0;
          const said = `${r.stdout}${r.stderr}`;
          const sawExpectation = expect === null || said.includes(expect);
          if (gotGreen === green && sawExpectation) {
            console.log(`  PASS  self-test '${name}' is ${green ? "GREEN" : "RED"}`);
          } else {
            bad += 1;
            console.error(
              `  FAIL  self-test '${name}' expected ${green ? "GREEN" : "RED"}, got exit ${r.status}\n${said}`,
            );
          }
        } finally {
          rmSync(d, { recursive: true, force: true });
        }
      }
    }

    console.log(`check-coord-verb-set --self-test: ${bad === 0 ? "OK" : `FAIL (${bad})`}`);
    return bad;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The self-test's OUTER observer.
 *
 * The arms run in a CHILD process under a controlled TMPDIR, and this parent then looks
 * at that directory from the outside. The child removes its fixture directory in a
 * `finally`; a child that exits from inside its `try` skips that `finally` and leaves
 * the directory behind. That is the leak opencharly/opencharly#576 names, and this is
 * the control that catches it — the observer is a DIFFERENT process, so it still runs
 * when the child's exit short-circuits the cleanup. An in-process assertion could not
 * do that: the process that would make it is the one the early exit kills.
 */
function selfTestObserved() {
  const scratch = mkdtempSync(join(tmpdir(), "check-coord-verb-set-run-"));
  let rc = 1;
  try {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--self-test-arms"], {
      encoding: "utf8",
      env: { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch },
    });
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status !== 0) {
      console.error(`  FAIL  the self-test arms exited ${r.status}`);
    } else {
      const leftover = readdirSync(scratch).filter((n) => n.startsWith("check-coord-verb-set-"));
      if (leftover.length === 0) {
        console.log("  PASS  the self-test left no fixture directory behind");
        rc = 0;
      } else {
        console.error(
          `  FAIL  the self-test left ${leftover.length} fixture directory(ies) behind: ${leftover.join(", ")}`,
        );
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return rc;
}

if (argv.includes("--self-test-arms")) process.exit(selfTest() === 0 ? 0 : 1);
if (argv.includes("--self-test")) process.exit(selfTestObserved());
check(root);
console.log(`check-coord-verb-set: ${failures === 0 ? "OK" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
