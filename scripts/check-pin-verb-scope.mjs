#!/usr/bin/env node
// check-pin-verb-scope.mjs — every place in the umbrella's OWN tree that presents the
// pin-advance verb to an operator states the verb's SCOPE.
//
// WHY (opencharly/opencharly#501): `charly task sync` is an ORG-WIDE cutover — it
// advances EVERY pin the repo declares, rolls the checkouts that exist to their
// remote's default-branch HEAD and stages their gitlinks — and the guidance
// introduced it as a thing that changed nothing. The RCA's missed control was that
// the reader had NO SCOPE to read: the PERMISSION was legible ("advance pins only
// with `charly task sync`") and the scope was not, so the verb read like a targeted
// tool and turned out to be a wave over EVERY pin the repo declares. A guidance
// defect is a product defect (R4): the fix is a CONTROL that keeps the claim true,
// not a lesson in a comment.
//
// WHAT IS ASSERTED, over the SHIPPED text of the umbrella's own tree:
//
//   A. SCOPE — every claim-maker surface states the scope: the verb advances EVERY
//      pin the repo declares. The marker is a CLAIM, not a keyword: "every" on its
//      own also matches "asks whether every pin is at the ref its intent names",
//      which is a question about CURRENCY, not a statement of what the wave
//      advances. So the marker carries the whole claim — every … pin(s) … declare(s).
//   B. EXISTENCE — every enumerated surface is PRESENT and its anchor is UNIQUE. A
//      surface that moved is a finding, not a silent pass: a gate that cannot see
//      the surface it is checking is worse than no gate.
//   C. COVERAGE — every tracked file that NAMES the pin-advance verb is classified
//      here: a claim-maker file (its surfaces are listed below), a non-claim
//      mention (with the reason it is not a claim-maker), or an exempt control. A
//      file that names the verb and is in NEITHER list is a FINDING: a new
//      claim-maker surface cannot slip in unclassified.
//
// The retired claim is keyed in scripts/check-retired-claims.mjs, which owns the
// claim CLASSES; this gate owns the POSITIVE claim (the scope), and the two
// together are the control #501 asked for.
//
// The run also REPORTS its classification: the claim-maker files, the non-claim
// mentions and the exempt controls, with the file count. The coverage arm judges
// the whole tracked tree, so its claim is a claim about files a reader cannot see
// from a summary line — and a body that states a FILE COUNT had no tool to copy
// it from, which is how a hand-counted number reached a record
// (opencharly/opencharly#767). The count and the three classes are the tool's own
// output, so they are pasted, never counted by hand.
//
// SCOPE: the umbrella's OWN tracked files. A submodule is a repo of its own, with its
// own rulebook and its own gates; this gate speaks for the umbrella's prose only.
//
// usage: node scripts/check-pin-verb-scope.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

const SELF_REL = "scripts/check-pin-verb-scope.mjs";
const RETIRED_GATE_REL = "scripts/check-retired-claims.mjs";

/* The tracked set's own `git ls-files -s -z` grows with the repo, and the default
 * 1 MiB exec buffer throws ENOBUFS on a large tree — a gate that stops judging is a
 * gate that fails silently. ONE ceiling, raised ONCE (R2: one canonical ceiling). */
const MAX_EXEC_BYTES = 64 * 1024 * 1024;

/**
 * The SCOPE claim: the verb advances EVERY pin the repo declares.
 *
 * `[^]` (not `[^\n]`) because a claim WRAPS: the scope sentence runs over a line
 * boundary in several of these surfaces, and a marker that cannot cross a wrap
 * would read a stated scope as an absent one. The windows are small (30 and 40
 * characters), so the match stays inside a sentence or two.
 *
 * The VERB after the pin word is what separates the scope claim from the
 * CURRENCY question: "asks whether every pin is at the ref its intent names" is
 * not a statement of what the wave advances, and no verb in the list follows
 * that sentence's "pin".
 */
const SCOPE_RE =
  /\bevery\b[^]{0,30}\bpin(?:s)?\b[^]{0,40}\b(?:declares?|declared|declaring|records?|recorded|holds|moves|moved|advances|advanced)\b/i;

/** The verb's own spellings — a file that NAMES it is a file the coverage arm classifies. */
const VERB_RE = /charly task sync|charly task pins|MODE=bump/;

/**
 * The claim-maker surfaces: the places whose job is to tell an operator what the
 * pin-advance verb does, so the operator can decide whether to run it. Each states
 * the scope (assertion A) and is located by a STABLE anchor — an anchor that is not
 * part of the claim under test, so the gate's own mutation cannot make the surface
 * vanish instead of failing.
 */
const SURFACES = [
  { id: "charly.yml — the sync task's header comment", rel: "charly.yml", kind: "comment", anchor: /^\s*#\s*sync\s+—\s+advance\s/ },
  { id: "charly.yml — the sync task's description", rel: "charly.yml", kind: "line", anchor: /^\s{4}description:\s*Advance\s/ },
  { id: "charly.yml — the sync task's step name", rel: "charly.yml", kind: "line", anchor: /^\s+- run: advance\s/ },
  { id: "charly.yml — the pins task's description", rel: "charly.yml", kind: "line", anchor: /^\s{4}description:\s*The pin-contract pin operation/ },
  { id: "charly.yml — the pins task's MODE parameter", rel: "charly.yml", kind: "line", anchor: /^\s{8}description:\s*status\|bump\|verify\|currency/ },
  { id: "README.md — the maintenance table's `charly task sync` row", rel: "README.md", kind: "line", anchor: /^\| `charly task sync` \|/ },
  { id: "README.md — the maintenance table's `charly task pins` row", rel: "README.md", kind: "line", anchor: /^\| `charly task pins` \|/ },
  { id: "README.md — the pinning paragraph", rel: "README.md", kind: "block", anchor: /^This umbrella's `\.gitmodules` records `branch = / },
  { id: "README.md — the sanctioned catch-up sequence", rel: "README.md", kind: "line", anchor: /^charly task sync\s+# the pin-contract bump/ },
  { id: "AGENTS.md — Part II #3's permission clause", rel: "AGENTS.md", kind: "block", anchor: /^\s+Advance pins only with\s/ },
  { id: "git-workflow/SKILL.md — the hard rules", rel: ".agents/skills/git-workflow/SKILL.md", kind: "block", anchor: /per-commit gate\. Hard rules/ },
  { id: "umbrella-mechanics.md — the task table's `charly task sync` row", rel: ".agents/skills/git-workflow/references/umbrella-mechanics.md", kind: "line", anchor: /^\| `charly task sync` \|/ },
  { id: "umbrella-mechanics.md — the task table's `charly task pins` row", rel: ".agents/skills/git-workflow/references/umbrella-mechanics.md", kind: "line", anchor: /^\| `charly task pins` \|/ },
  { id: "umbrella-mechanics.md — the `the fix is` paragraph", rel: ".agents/skills/git-workflow/references/umbrella-mechanics.md", kind: "block", anchor: /^records\), never a PR branch/ },
  { id: "branch-and-pr-loop.md — the pin-advance step", rel: ".agents/skills/git-workflow/references/branch-and-pr-loop.md", kind: "block", anchor: /^7\. Advance pins ONLY with/ },
  { id: "pin-intent-and-currency.md — the contract's opening", rel: ".agents/skills/git-workflow/references/pin-intent-and-currency.md", kind: "block", anchor: /^The umbrella records one commit per submodule/ },
  { id: "agents/SKILL.md — the remedy for a pin lag", rel: ".agents/skills/agents/SKILL.md", kind: "block", anchor: /^\*\*Remedy\.\*\* Identify the submodule/ },
  { id: "repo-setup/SKILL.md — the checklist's pin-advance step", rel: ".agents/skills/repo-setup/SKILL.md", kind: "block", anchor: /^5\. Add it to the umbrella as a submodule/ },
];

/**
 * The files that NAME the pin-advance verb without PRESENTING it. The reason is
 * committed here, because "this file is not a claim-maker" is a judgement, and a
 * judgement with no stated reason is a judgement nobody can check.
 */
const NON_CLAIM_MENTIONS = new Map([
  [
    ".dsh/README.md",
    "a table of the DSH skill farm's paths: the cell names the verb's SIDE EFFECT (it re-derives the bindings), and the reader is not being told to run the verb",
  ],
  [
    "scripts/sync-pin-evidence.sh",
    "comments about WHY the sync has no CI run artifact (it is hand-run); the subject is the artifact, not the verb's scope",
  ],
  [
    "scripts/sync-pr-body.sh",
    "the PR-body builder: it PASTES the producer's own summary, and the summary is the verb's report — the body carries the scope from the run itself",
  ],
]);

/** The files exempt from the coverage arm, with the reason. */
const EXEMPT_FILES = new Map([
  [SELF_REL, "this gate itself — a control names the claim it checks"],
  [RETIRED_GATE_REL, "the retired-claim key set — it carries the retired wording on purpose, as the proof material for its own class"],
  [
    ".claude/workflows/verify-status.js",
    "a machine-read target list: the prompt's contract is to return the targets VERBATIM as JSON, so a scope sentence in it would break the contract it serves",
  ],
]);

const indentOf = (l) => l.match(/^\s*/)[0].length;
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;

/**
 * The surface's text: one line, a comment block, a paragraph, or a list item with
 * its continuation lines. A list item CONTINUES on the lines indented to its
 * content column, and a claim that wraps inside a list item is one claim — so the
 * next item at the anchor's own indent ENDS the surface.
 */
function extract(lines, idx, kind) {
  if (kind === "line") return lines[idx];
  const out = [lines[idx]];
  if (kind === "comment") {
    for (let k = idx + 1; k < lines.length; k++) {
      if (!/^\s*#/.test(lines[k])) break;
      out.push(lines[k]);
    }
    return out.join("\n");
  }
  const ind = indentOf(lines[idx]);
  const isItem = LIST_ITEM_RE.test(lines[idx]);
  const nextItem = new RegExp(`^\\s{0,${ind}}(?:[-*+]|\\d+[.)])\\s`);
  for (let k = idx + 1; k < lines.length; k++) {
    const l = lines[k];
    if (l.trim() === "") break;
    if (isItem && nextItem.test(l)) break;
    out.push(l);
  }
  return out.join("\n");
}

/** The tracked REGULAR files of a tree — derived from the INDEX, never hand-kept. */
function trackedFiles(rootDir) {
  const raw = execFileSync("git", ["ls-files", "-s", "-z"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: MAX_EXEC_BYTES,
  });
  const out = [];
  for (const rec of raw.split("\0")) {
    if (!rec) continue;
    const tab = rec.indexOf("\t");
    if (tab === -1) continue;
    const mode = rec.slice(0, tab).split(" ")[0];
    if (mode === "160000" || mode === "120000") continue;
    out.push(rec.slice(tab + 1));
  }
  return out;
}

/** A file's text, or null when it is unreadable or binary. */
function readText(abs) {
  let buf;
  try {
    buf = readFileSync(abs);
  } catch {
    return null;
  }
  if (buf.includes(0)) return null;
  return buf.toString("utf8");
}

/**
 * The findings, over the files the run sees: the tree's tracked files, with
 * `overrides` replacing or adding one (the --self-test's mutations).
 */
function findings(rootDir, overrides = new Map()) {
  const out = [];
  const textOf = (rel) => (overrides.has(rel) ? overrides.get(rel) : readText(join(rootDir, rel)));

  // A + B: every claim-maker surface exists, is unique, and states the scope.
  for (const s of SURFACES) {
    const text = textOf(s.rel);
    if (text === null) {
      out.push({ kind: "B", rel: s.rel, line: 0, msg: `${s.id} — the file is unreadable` });
      continue;
    }
    const lines = text.split("\n");
    const hits = [];
    for (let i = 0; i < lines.length; i++) if (s.anchor.test(lines[i])) hits.push(i);
    if (hits.length === 0) {
      out.push({ kind: "B", rel: s.rel, line: 0, msg: `${s.id} — the surface is GONE (its anchor matches no line)` });
      continue;
    }
    if (hits.length > 1) {
      out.push({
        kind: "B",
        rel: s.rel,
        line: hits[0] + 1,
        msg: `${s.id} — the anchor matches ${hits.length} lines (${hits.map((h) => h + 1).join(", ")}); it must match exactly one`,
      });
      continue;
    }
    const surface = extract(lines, hits[0], s.kind);
    if (!SCOPE_RE.test(surface)) {
      out.push({
        kind: "A",
        rel: s.rel,
        line: hits[0] + 1,
        msg:
          `${s.id} — the surface does not state the verb's SCOPE: it must say the verb advances ` +
          `EVERY pin the repo declares (the claim, not the keyword: "every" alone also matches a ` +
          `question about currency). A reader with no scope is the #501 reader`,
      });
    }
  }

  // C: coverage — every file that NAMES the verb is classified.
  const claimMaker = new Set(SURFACES.map((s) => s.rel));
  const files = new Set(trackedFiles(rootDir));
  for (const rel of overrides.keys()) files.add(rel);
  for (const rel of files) {
    if (rel.startsWith("CHANGELOG/")) continue; // history, not a current claim
    if (claimMaker.has(rel) || NON_CLAIM_MENTIONS.has(rel) || EXEMPT_FILES.has(rel)) continue;
    const text = textOf(rel);
    if (text === null || !VERB_RE.test(text)) continue;
    out.push({
      kind: "C",
      rel,
      line: 0,
      msg:
        `${rel} names the pin-advance verb and is not classified: it is neither a claim-maker file ` +
        `(whose surfaces are listed in this gate), nor a non-claim mention (with a reason), nor an ` +
        `exempt control. A new surface cannot slip in unclassified`,
    });
  }
  // And the classification itself cannot go stale: a file listed as a non-claim
  // mention must still name the verb, or the reason describes a mention that is gone.
  for (const [rel, why] of NON_CLAIM_MENTIONS) {
    const text = textOf(rel);
    if (text === null || !VERB_RE.test(text)) {
      out.push({
        kind: "C",
        rel,
        line: 0,
        msg: `${rel} is classified as a non-claim mention, but it no longer names the verb — the reason ("${why}) describes a mention that is gone`,
      });
    }
  }
  return out;
}

const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  process.exitCode = 1;
};
const ok = (m) => console.log(`  PASS  ${m}`);

function report(fs) {
  for (const f of fs) {
    const where = f.line ? `${f.rel}:${f.line}: ` : `${f.rel}: `;
    console.error(`  FAIL  ${where}${f.msg}`);
  }
  return fs.length;
}

// ── --self-test: prove each assertion goes RED on a mutation of the shipped text ─────
if (argv.includes("--self-test")) {
  const baseline = findings(root);
  if (baseline.length) {
    report(baseline);
    console.error("check-pin-verb-scope --self-test: FAIL (the UNMUTATED tree is not green — fix the files first)");
    process.exit(1);
  }
  ok(`the unmutated tree is GREEN — ${SURFACES.length} claim-maker surface(s) state the scope`);

  /** The surface's char range in its file, so a mutation can be applied to THAT text. */
  function surfaceRange(rel, anchor, kind) {
    const text = readText(join(root, rel));
    const lines = text.split("\n");
    let idx = -1;
    for (let i = 0; i < lines.length; i++) if (anchor.test(lines[i])) { idx = i; break; }
    if (idx === -1) return null;
    const surface = extract(lines, idx, kind);
    const start = text.indexOf(surface);
    return { text, start, end: start + surface.length };
  }

  let stFails = 0;

  // A: every surface's scope can be REMOVED, and the removal is caught.
  for (const s of SURFACES) {
    const range = surfaceRange(s.rel, s.anchor, s.kind);
    if (!range) {
      stFails += 1;
      console.error(`  FAIL  the surface ${s.id} could not be located — the mutation cannot be applied`);
      continue;
    }
    const head = range.text.slice(0, range.start);
    const body = range.text.slice(range.start, range.end);
    const tail = range.text.slice(range.end);
    const mutatedBody = body.replace(new RegExp(SCOPE_RE.source, "gi"), "the pins");
    if (mutatedBody === body) {
      stFails += 1;
      console.error(`  FAIL  the scope mutation did not apply to ${s.id} — the surface carries no scope claim`);
      continue;
    }
    const fs = findings(root, new Map([[s.rel, head + mutatedBody + tail]]));
    if (fs.some((f) => f.kind === "A" && f.msg.includes(s.id))) {
      ok(`the scope claim of ${s.id} is live — dropping it turns the gate RED`);
    } else {
      stFails += 1;
      console.error(`  FAIL  the scope claim of ${s.id} was NOT caught when dropped`);
    }
  }

  // B: a surface that MOVES is caught, not silently skipped.
  {
    const s = SURFACES[0];
    const range = surfaceRange(s.rel, s.anchor, s.kind);
    const head = range.text.slice(0, range.start);
    const body = range.text.slice(range.start, range.end);
    const tail = range.text.slice(range.end);
    const mutated = head + body.replace(s.anchor, "# the surface moved") + tail;
    const fs = findings(root, new Map([[s.rel, mutated]]));
    if (fs.some((f) => f.kind === "B" && f.msg.includes(s.id))) {
      ok("the existence claim is live — a surface whose anchor stops matching turns the gate RED");
    } else {
      stFails += 1;
      console.error("  FAIL  a surface that moved was NOT caught");
    }
  }

  // C: a NEW file that names the verb is caught, so a claim-maker surface cannot slip in.
  {
    const rel = "notes/operator-brief.md";
    const fs = findings(root, new Map([[rel, "# a new brief\n\nrun `charly task sync` to move the pin\n"]]));
    if (fs.some((f) => f.kind === "C" && f.rel === rel)) {
      ok("the coverage claim is live — a new file naming the verb turns the gate RED");
    } else {
      stFails += 1;
      console.error("  FAIL  a new file naming the verb was NOT caught");
    }
  }

  // A gate that flags EVERY change proves nothing: a truthful rewording that KEEPS
  // the scope must stay GREEN.
  {
    const s = SURFACES.find((x) => x.rel === "charly.yml" && /description/.test(x.id));
    const range = surfaceRange(s.rel, s.anchor, s.kind);
    const mutated = range.text.replace("it does not commit", "it never commits");
    if (mutated === range.text) {
      stFails += 1;
      console.error("  FAIL  the negative control did not apply");
    } else {
      const fs = findings(root, new Map([[s.rel, mutated]]));
      if (fs.length !== 0) {
        stFails += 1;
        console.error(`  FAIL  negative control: a truthful rewording that keeps the scope must stay GREEN (${fs.length} finding(s))`);
      } else {
        ok("negative control — a truthful rewording that keeps the scope stays GREEN");
      }
    }
  }

  // D: the classification the gate PRINTS is self-consistent. The report is a
  // measurement a body pastes, so a count that disagrees with the list beside it
  // is the defect class this gate exists to prevent — and it must be caught on
  // the printed TEXT, which is where a reader sees it.
  {
    const printed = classificationLines();
    const clean = countFindings(printed);
    if (clean.length) {
      stFails += 1;
      console.error(
        `  FAIL  the classification the gate prints is not self-consistent (${clean.length} finding(s))`,
      );
    } else {
      let caught = 0;
      for (const line of printed) {
        const mutated = line.replace(/\((\d+)/, (_m, n) => `(${Number(n) + 1}`);
        if (countFindings([mutated]).length === 0) {
          stFails += 1;
          console.error(`  FAIL  a reported count that disagrees with its list was NOT caught: ${line.trim()}`);
        } else {
          caught += 1;
        }
      }
      if (caught === printed.length) {
        ok(
          "the classification the gate prints is self-consistent — a count that disagrees with the list beside it turns the gate RED",
        );
      }
    }
  }

  if (stFails) {
    console.error(`check-pin-verb-scope --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-pin-verb-scope --self-test: OK (every assertion is live)");
  process.exit(0);
}

const n = report(findings(root));
if (n) {
  console.error(`check-pin-verb-scope: ${n} finding(s)`);
  process.exit(1);
}
console.log(
  `check-pin-verb-scope: OK — ${SURFACES.length} claim-maker surface(s) state the pin-advance verb's scope, and every file naming the verb is classified`,
);

/**
 * The CLASSIFICATION this run made, as the lines it prints.
 *
 * The coverage arm's claim is about the whole tracked tree, so the reader needs
 * the tree's answer, not a promise that there is one. The three classes are the
 * gate's own lists, and the file count is the count of the claim-maker files
 * that carry the surfaces — a number a body can PASTE instead of counting by
 * hand (opencharly/opencharly#767).
 *
 * One function, so the run and the self-test read the SAME lines: a second
 * implementation of the report is a second place for the number to drift.
 */
function classificationLines() {
  const claimMakerFiles = [...new Set(SURFACES.map((s) => s.rel))].sort();
  return [
    `  claim-maker file(s) (${claimMakerFiles.length}, carrying ${SURFACES.length} surface(s)): ${claimMakerFiles.join(", ")}`,
    `  non-claim mention(s) (${NON_CLAIM_MENTIONS.size}): ${[...NON_CLAIM_MENTIONS.keys()].sort().join(", ")}`,
    `  exempt control(s) (${EXEMPT_FILES.size}): ${[...EXEMPT_FILES.keys()].sort().join(", ")}`,
  ];
}

/**
 * A reported count that disagrees with the list it describes.
 *
 * The report is now a MEASUREMENT a body pastes, so the count beside a list is a
 * claim a reader checks by eye. This reads the printed TEXT — the boundary the
 * measurement is published at — and compares each count with the list it sits
 * beside. It does not recompute either number: the point is that the two the
 * reader sees agree with each other, which is the defect class opencharly/opencharly#767
 * was about (a hand-made number beside a tool-made one).
 */
function countFindings(lines) {
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s+(.+?) \((\d+)(?:, carrying (\d+) surface\(s\))?\): (.+)$/);
    if (!m) {
      out.push(`the reported line is not in the reporting shape: ${line.trim()}`);
      continue;
    }
    const listed = m[4]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (Number(m[2]) !== listed.length) {
      out.push(
        `the reported count ${m[2]} disagrees with the ${listed.length} file(s) it lists: ${line.trim()}`,
      );
    }
    if (m[3] !== undefined && Number(m[3]) !== SURFACES.length) {
      out.push(
        `the reported surface count ${m[3]} disagrees with the ${SURFACES.length} surface(s) the gate enumerated: ${line.trim()}`,
      );
    }
  }
  return out;
}

// The measurement is checked BEFORE it is published: a count that disagrees with
// the list beside it must never reach a reader as a pasted measurement.
const printed = classificationLines();
const badCounts = countFindings(printed);
if (badCounts.length) {
  for (const f of badCounts) console.error(`  FAIL  ${f}`);
  console.error(`check-pin-verb-scope: ${badCounts.length} finding(s) in the classification it reports`);
  process.exit(1);
}
for (const line of printed) console.log(line);
