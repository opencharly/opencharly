#!/usr/bin/env node
// check-retired-claims.mjs — the umbrella's RETIRED claim forms are GONE from its own
// tracked tree, and the KEY SET that names them lives HERE, in the repository, so a
// claim class cannot be missed because the key was written in a PR body.
//
// WHY THIS EXISTS (opencharly/opencharly#710, review round 2): the same class of defect
// was found twice in that PR — a CONDITIONAL behaviour stated as an UNCONDITIONAL one.
// Round 1 corrected ONE surface (scripts/init-submodules.sh's header) and the SAME
// overstatement survived in three others (.pi/README.md, the .pi extension's module
// header and its step 3b comment), plus a fourth, weaker one in
// .claude/workflows/verify-status.js. The sweep that should have caught it named only
// the wording round 1 had RETIRED, so it could not name a claim it had no key for.
//
// A sweep written in a PR body is not a control: nothing in the repository runs it, so
// the next claim class is missed the same way, by the same mechanism. So the key set is
// COMMITTED, the gate scans the tracked tree with it, and the self-test proves every key
// is EFFECTIVE — a key that would match nothing is vacuous, and a vacuous key is this
// defect wearing a different hat.
//
// WHY A CLASS, NOT A WORDING (opencharly/opencharly#710, review round 2): a list of
// EXACT WORDINGS can only name the wordings that have already been written. The very
// defect this gate exists to catch is a CLAIM CLASS, and the class outlives every
// wording it was first written in. MEASURED: the round-1 sweep carried exactly ONE key
// for this class — the wording it had already retired in scripts/init-submodules.sh —
// and that key matches NONE of the TEN sites the class still stood at: the .pi
// extension's module header, its step 3b comment and its fail-closed comment, the
// README's new prose, verify-status.js's `proves`, the .pi gate's own TWO comments, the
// fixture gate's header, the shipped step's comment and the shipped step's own FAILURE
// MESSAGE. A word list would have caught none of the ten. So the patterns below are
// CLASSES: a pattern that matches the shape, not the sentence.
//
// THE SCAN'S UNIT IS A CLAIM, NOT A LINE (opencharly/opencharly#710, review round 2 —
// the missed control, and the root fix that closes it): a claim WRAPS. The prose in a
// comment or a paragraph is wrapped at the column, and the wrap can fall BETWEEN the
// two words of one phrase. MEASURED on the class's own TWO sites in `origin/main`'s
// scripts/init-submodules.sh: the LATER of them (:622) carries it as
//     `... the umbrella's own currency report cannot then JUDGE`
//     `# an edge whose source is a nested pin: it prints ...`
// — the phrase straddles a line break. A line-oriented scan sees ONE of the class's TWO
// sites in that tree, and a self-test whose instances are all single-line cannot see the
// gap: a control that only recognizes a class in the shape it was first written in is
// the defect this gate exists to catch, wearing a different hat. So the scan's unit is
// the CLAIM STREAM: a file's lines with their comment marker stripped, joined by one
// space across a WRAP, and separated by a hard newline where a sentence ENDS or a new
// block BEGINS. The class's own wrapped wording is one of the class's INSTANCES, so the
// self-test proves the wrap-tolerant form is EFFECTIVE, and not merely present.
//
// A BLOCK IS A BOUNDARY, NOT AN EXCLUSION (opencharly/opencharly#710, review round 4 —
// the second missed control, and its root fix): a markdown block start — a heading, a
// list item, a table row, a quote — used to be DROPPED from the claim stream, text and
// all. So a claim a reader sees in a list item was invisible to the scan, and the
// umbrella's own rulebook is written as list items: the shape the claims live in was
// the shape the gate could not see. MEASURED on this PR's own body, whose R1 findings
// are list items: the scan reported ONE hit where the prose carried TWO. So a block
// start's TEXT is a claim and enters the stream, with the block MARKER stripped
// (the marker is syntax; the text is what a reader sees), and a list item CONTINUES on
// the lines indented to its content column, because a claim that wraps inside a list
// item is one claim.
//
// WHAT IS ASSERTED (--self-test must see each one go RED):
//   R. No tracked file, except CHANGELOG/ (the record of what happened, not a current
//      claim), contains any retired claim form. Every hit is a file and a line, and the
//      gate names it.
//   K. Every pattern is EFFECTIVE: each of its INSTANCES — the concrete wordings that
//      class has actually been written in — turns the scan RED when injected into a
//      COPY of a tracked file. A pattern that cannot be made to fail proves nothing.
//   L. Every pattern is EFFECTIVE in the LIST shape: injected as a markdown list item,
//      it turns the scan RED. A shape the self-test never exercises is a shape the
//      scan never proved, and the shape the rulebook is written in is a list item.
//   S. Every pattern is SOUND: each of its COUNTER-INSTANCES — the qualified, TRUE
//      wordings that look like the class and are not it — leaves the scan GREEN. A
//      pattern that cries wolf is a gate that gets disabled, and a disabled gate is this
//      defect wearing a third hat.
//
// The scan is CASE-INSENSITIVE on purpose: the same claim is written in the same
// sentence in two cases ("cannot JUDGE an edge" / "cannot judge an edge"), and a
// case-sensitive key catches only the case its author happened to use. That was not
// hypothetical — the class's own wording appeared in both.
//
// SCOPE: the umbrella's OWN tracked files. A submodule is a repo of its own, with its own
// rulebook and its own gates; this gate speaks for the umbrella's prose only. A tracked
// SYMLINK is skipped for the same reason: every one of them points into `marketplace/`,
// another repo, whose content is not the umbrella's claim to judge.
//
// usage: node scripts/check-retired-claims.mjs [--root <dir>] [--self-test]

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SELF_REL = "scripts/check-retired-claims.mjs";
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

/* The tracked set's own `git ls-files -s -z` grows with the repo, and the default
 * 1 MiB exec buffer throws ENOBUFS on a large tree — a gate that stops judging is a
 * gate that fails silently. ONE ceiling, raised ONCE, and no call may set another
 * (R2: one canonical implementation per behaviour). The ceiling is placed AFTER the
 * spread, so a caller's own `maxBuffer` cannot replace it. */
const MAX_EXEC_BYTES = 64 * 1024 * 1024;

/** Every git call goes through here, so the ceiling above is raised ONCE. */
function gitOut(args, opts = {}) {
  return execFileSync("git", args, { ...opts, maxBuffer: MAX_EXEC_BYTES });
}

// The retired claim forms. Each entry is a CLASS of claim, matched by a pattern, together
// with the concrete wordings that class has been written in — the instances are the
// PROOF MATERIAL: each one must turn the scan RED, or the pattern proves nothing. The
// counter-instances are the qualified, TRUE wordings that must leave the scan GREEN.
const PATTERNS = [
  {
    pattern: "NOT INITIALIZED [(]no checkout[)]; a [+] or U drift would still FAIL",
    instances: ["NOT INITIALIZED (no checkout); a + or U drift would still FAIL"],
    counterInstances: [],
    why: "the shipped step's retired NOTICE form — a MATERIALIZED charly without its nested level now FAILS",
  },
  {
    pattern: "an uninitialized nested path is a NOTICE",
    instances: ["an uninitialized nested path is a NOTICE"],
    counterInstances: [],
    why: "the retired fixture label for that notice",
  },
  {
    pattern: "notinit=",
    instances: ["notinit="],
    counterInstances: [],
    why: "the retired shell variable that carried the notice",
  },
  {
    pattern: "which the pin contract calls a FAILURE",
    instances: ["which the pin contract calls a FAILURE"],
    counterInstances: [],
    why: "the retired classification of an unjudgeable pin — the state table says it PASSES (opencharly/opencharly#713)",
  },
  {
    pattern: "6[.]6 MB",
    instances: ["6.6 MB"],
    counterInstances: [],
    why: "the retired figure this change introduced for the nested level",
  },
  {
    pattern: "9[.]0 MB of the 9[.]5 GB",
    instances: ["9.0 MB of the 9.5 GB"],
    counterInstances: [],
    why: "the retired comparison across two different universes (the .pi cost model vs the umbrella's full clone)",
  },
  {
    // The class: two of the report's own states claimed INDISTINGUISHABLE. The truth:
    // the report's state names them apart — `differs (no checkout of <twin> to judge
    // ancestry)` against `behind` / `unmerged` / `not-on-the-served-line` (the product's
    // own `ancestryClass`, plugin-task v0.2026300.951, candy/plugin-task/verbs.go:981)
    // — and only the VERDICT level, where both read "not current", cannot tell them
    // apart. A claim that the two states cannot be told apart is that defect in any
    // wording, and this change wrote it in four surfaces.
    //
    // The shape is the distinguishing phrase followed by "from a (real|true|genuine)
    // (divergence|state)": that is where the claim puts the comparison. The counter-
    // instances below are the TRUE wordings of the same idea — the verdict level really
    // does not separate them, and the report's own state name really does — so a key
    // that cries wolf on them is a gate that gets switched off.
    pattern:
      "(indistinguishable|not distinguishable|cannot be told apart|cannot tell apart|" +
      "not tell apart|tell apart|told apart) from a (real|true|genuine) (divergence|state)",
    instances: [
      // the retired .pi README claim
      "indistinguishable from a real divergence",
      // the retired claim in the .pi extension's module header, its step 3b comment and
      // the initializer's WHY block
      "which a reader cannot tell apart from a real divergence",
    ],
    counterInstances: [
      // TRUE: at the VERDICT level the two states really do read alike
      "at the VERDICT level the two states are indistinguishable to a reader, because both read not-current",
      // TRUE: the report's own state name really does tell them apart
      "the report's own state name tells a real divergence apart from an unjudgeable one",
      // TRUE: a not-current verdict does not separate the two KINDS of not-current
      "a not-current twin is not distinguishable from a not-current leaf at the verdict level",
    ],
    why: "the retired claim that two of the report's states are INDISTINGUISHABLE — the report's own state names them apart; only the VERDICT level cannot",
  },
  {
    // THE CLASS. The flat overstatement: an edge is said to be UNJUDGEABLE, with no
    // qualifier. The truth: the report judges a twin's CURRENCY from the twin's REMOTE
    // alone and never asks whether the checkout EXISTS, so while that remote has not
    // moved the twin reads `cur` and the absent level is INVISIBLE to the report; the
    // checkout is needed only to CLASSIFY a twin whose remote HAS moved. A claim that
    // says an edge cannot be judged, unqualified, is that defect in any wording.
    //
    // The shape is the ADJACENCY of a judgment word and the bare noun "an edge": the
    // flat claim judges THE EDGE, while the true claim scopes what it judges ("the
    // ANCESTRY of an edge"). So the qualifier — a word BETWEEN the judgment and the
    // noun — is what separates them, and the pattern refuses to match across one.
    // The two guards are the noun phrase: an edge's ANCESTRY is scoped and therefore
    // true, and "an edge case" is a different noun entirely.
    pattern:
      "(judge|judging|judgable|unjudgeable) an edge(?![A-Za-z']| case)" +
      "|an edge (?:cannot|can not|can never|is not|is never|is un) (?:be )?(?:judge|judged|judgable)",
    instances: [
      // the retired initializer sentence — WRAPPED across a comment marker, which is how
      // the class was first written in `origin/main` (MEASURED: a line-oriented scan
      // sees one of the class's two sites there, and misses this one)
      "# cannot then JUDGE\n# an edge whose source is a nested pin: it prints",
      "cannot JUDGE an edge whose source is a nested pin: it prints",
      // the retired .pi claim (the README, the extension's module header, its step 3b comment)
      "cannot JUDGE an edge whose twin is a nested pin",
      // the retired verify-status.js claim
      "cannot judge an edge whose twin is absent",
      // the fixture gate's header, and the .pi gate's own header
      "cannot judge an edge whose twin is a nested pin, and it prints a false `differs (no checkout of box/cachyos ...)` while the gate stays green",
      // the shipped step's own comment
      "cannot have the currency report judge an edge whose source is a nested pin",
      // the shipped step's own FAILURE MESSAGE
      "the currency report cannot judge an edge whose source is one of them",
      // the flat form with NO relative clause at all (the extension's fail-closed comment)
      "cannot judge an edge, and it must never be reported as ready",
      // the REVERSED word order: the same flat claim, with the judgment on the noun
      "an edge cannot be judged by the report",
    ],
    counterInstances: [
      // the TRUE form, with the qualifier BETWEEN the judgment and the noun
      "cannot then JUDGE the ANCESTRY of an edge whose source is a nested pin",
      // the TRUE form, WRAPPED the same way the flat form was
      "# cannot then JUDGE the ANCESTRY\n# of an edge whose source is a nested pin",
      // a SCOPED claim: only the ancestry is unjudgeable, and that is true
      "the currency report cannot judge an edge's ancestry",
      // a different noun entirely: an edge CASE is a corner case
      "we judge an edge case as a corner case, not as a claim",
    ],
    why: "the FLAT overstatement — an edge judged with no qualifier. Every wording of this class that this change retired is one of the instances above, and the class outlives its wordings",
  },
];

const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  process.exitCode = 1;
};
const ok = (m) => console.log(`  PASS  ${m}`);

/**
 * The tracked REGULAR files of a tree — derived from the INDEX, never hand-kept.
 *
 *   - a gitlink (mode 160000) is another repo's content, and is skipped;
 *   - a symlink (mode 120000) is skipped too: every tracked symlink in this umbrella
 *     points into `marketplace/`, another repo, whose prose is not the umbrella's claim
 *     to judge (SCOPE, above).
 */
function trackedFiles(rootDir) {
  const raw = gitOut(["ls-files", "-s", "-z"], { cwd: rootDir, encoding: "utf8" });
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

/** A file's WORKING-TREE text, or null when it is unreadable or binary. */
function readText(abs) {
  let buf;
  try {
    buf = readFileSync(abs);
  } catch {
    return null;
  }
  if (buf.includes(0)) return null; // binary
  return buf.toString("utf8");
}

// A comment marker, at the START of a line, in a code file. The set is the markers the
// languages in this tree actually use: `//` (JS/TS), `#` (shell, YAML, Python), `*`
// (a C-style block comment's continuation) and `<!--` (HTML). `;` is NOT one of them:
// a shell `case` arm's `;;` is code, and reading it as a comment would join it to the
// comment above it.
const CODE_COMMENT = /^\s*(?:\/\/|#|\*|<!--)/;
// A markdown block start: a heading, a list item, a table row, a quote or a fence.
const MD_BLOCK_START = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~)/;
// The block starts whose own TEXT is a claim, and the one whose text is not.
//
// A block start is a BOUNDARY — a claim cannot straddle two blocks — and it is NEVER an
// EXCLUSION: the block's text is what a reader sees, and the umbrella's own rulebook is
// written as LIST ITEMS, so a scan that cannot see a list item cannot see the rulebook.
// The one text that is not a claim is a FENCE MARKER: the marker is syntax, and the
// block's CONTENT is the prose it wraps.
const MD_FENCE = /^\s*(?:```|~~~)/;
const MD_QUOTE = /^\s*>/;
const MD_LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
// A code line that CONTINUES the previous one — the only code lines the stream joins.
const CODE_CONTINUES = /(?:\\|&&|\|\||\+|,|\()\s*$/;

/** Does this text END a sentence? Then the next line is a new sentence, not a wrap. */
function endsSentence(text) {
  const t = text.replace(/[)"'\]’”*`]+$/u, "").trimEnd();
  return t.length > 0 && /[.!?]$/u.test(t);
}

/** The CLAIM a markdown block start carries: its text, with the block marker stripped. */
function mdClaimText(raw) {
  const t = raw.trim();
  if (/^#{1,6}\s+/.test(t)) return t.replace(/^#{1,6}\s+/, "").trim();
  if (MD_LIST_ITEM.test(t)) return t.replace(MD_LIST_ITEM, "").trim();
  if (MD_QUOTE.test(t)) return t.replace(/^>\s?/, "").trim();
  if (/^\|/.test(t)) return t.replace(/^\|/, "").trim();
  return t;
}

/** The column a markdown line's text starts at. */
function mdIndent(raw) {
  return raw.match(/^\s*/)[0].length;
}

/** The column a list item's text starts at — where its CONTINUATION lines are indented. */
function mdContentCol(raw) {
  const marker = raw.trim().match(MD_LIST_ITEM);
  return mdIndent(raw) + (marker ? marker[0].length : 0);
}

/**
 * The CLAIM STREAM of a file: the text a reader SEES, with the line breaks a claim
 * wraps across taken out, and the line breaks a claim is BROKEN at put back.
 *
 *   - a comment marker is stripped, so `# an edge ...` and `an edge ...` are one claim;
 *   - a line that does not END a sentence is joined to the next one with a space,
 *     because a wrap continues the sentence;
 *   - a line that DOES end a sentence, a blank line, a new markdown block, and a
 *     comment/code boundary are hard boundaries, so no pattern can straddle a sentence
 *     or a block;
 *   - in a code file, two CODE lines join only when the first ends with a continuation
 *     operator, so a statement boundary is never mistaken for a wrap.
 *   - in a MARKDOWN file, a block start is a boundary AND a claim: the block's own text
 *     enters the stream, and the marker that made it a block is stripped, because the
 *     marker is syntax and the text is what a reader sees. A list item CONTINUES on the
 *     lines indented to its content column — those lines are the same claim — and a
 *     quote continues on the next quote line. A fence marker enters no stream at all:
 *     it is a marker, and the block's CONTENT is the prose it wraps.
 */
function claimStream(text, isMarkdown) {
  const lines = text.split("\n");
  const segs = []; // {text, line} — the text, and the source line it came from
  let prevKind = null;
  let prevBody = "";
  // The content column a list item's CONTINUATION lines are indented to, or null. A
  // claim that WRAPS inside a list item is one claim, so those lines join it.
  let contCol = null;
  // The previous markdown line was a QUOTE, so the next quote line CONTINUES it.
  let prevQuote = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") {
      segs.push({ text: "\n", line: i + 1 });
      prevKind = null;
      prevBody = "";
      contCol = null;
      prevQuote = false;
      continue;
    }
    let kind;
    let body;
    if (isMarkdown) {
      if (MD_BLOCK_START.test(raw)) {
        if (MD_FENCE.test(raw)) {
          // A fence marker is SYNTAX: it enters no stream, and the block's content is
          // the prose it wraps.
          segs.push({ text: "\n", line: i + 1 });
          prevKind = null;
          prevBody = "";
          contCol = null;
          prevQuote = false;
          continue;
        }
        const claim = mdClaimText(raw);
        if (MD_QUOTE.test(raw) && prevQuote) {
          // A quote's next line CONTINUES the quote: one claim, joined.
          segs.push({ text: " ", line: i + 1 });
        } else {
          segs.push({ text: "\n", line: i + 1 });
        }
        segs.push({ text: claim, line: i + 1 });
        prevKind = "prose";
        prevBody = claim;
        prevQuote = MD_QUOTE.test(raw);
        contCol = MD_LIST_ITEM.test(raw) ? mdContentCol(raw) : null;
        continue;
      }
      kind = "prose";
      body = raw.trim();
    } else {
      const m = CODE_COMMENT.exec(raw);
      if (m) {
        kind = "comment";
        body = raw.slice(m[0].length).trim();
      } else {
        kind = "code";
        body = raw.trim();
      }
    }
    const joins =
      prevKind === kind &&
      !endsSentence(prevBody) &&
      (kind !== "code" || CODE_CONTINUES.test(prevBody)) &&
      // Inside a list item, only the lines indented to its content column CONTINUE it.
      (contCol === null || mdIndent(raw) >= contCol);
    segs.push({ text: joins ? " " : "\n", line: i + 1 });
    segs.push({ text: body, line: i + 1 });
    if (!joins) {
      contCol = null;
      prevQuote = false;
    }
    prevKind = kind;
    prevBody = body;
  }
  let stream = "";
  const starts = []; // the offset at which each segment begins
  for (const s of segs) {
    starts.push(stream.length);
    stream += s.text;
  }
  return { stream, lineAt: (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return segs[lo].line;
  } };
}

/**
 * The scan: every retired claim class, in the tracked tree.
 *
 * Two paths are excluded, and both are exclusions of a DIRECTORY or a FILE, not of a
 * claim:
 *   - `CHANGELOG/` — a past release's gate output is HISTORY, not a current claim.
 *   - THIS FILE — the patterns and their instances live here, so they are IN the tracked
 *     tree by construction. A gate that found itself would be a gate that can never be
 *     green, and the self-test proves every instance is effective against a COPY of a
 *     tracked file, so nothing is lost by excluding the carrier.
 */
function scan(dir) {
  const hits = [];
  for (const rel of trackedFiles(dir)) {
    if (rel === SELF_REL || rel.startsWith("CHANGELOG/")) continue;
    const text = readText(join(dir, rel));
    if (text === null) continue;
    const { stream, lineAt } = claimStream(text, /\.md$/i.test(rel));
    for (const { pattern, why } of PATTERNS) {
      const re = new RegExp(pattern, "giu");
      for (const m of stream.matchAll(re)) {
        const line = lineAt(m.index);
        hits.push({ pattern, why, line: `${rel}:${line}: ${m[0].replace(/\s+/g, " ").trim()}` });
      }
    }
  }
  return hits;
}

/* The two carriers the instances are injected into. A claim's SHAPE decides where it
 * can live: a claim that is written in a comment marker is a CODE claim, and a claim
 * written in prose is a claim that can live anywhere. The carriers are COPIES of
 * tracked files, never the real tree (R6). */
const CARRIERS = [
  { rel: "README.md", code: false },
  { rel: "scripts/init-submodules.sh", code: true },
];

/** Is every line of this instance a comment line? Then it is a CODE-shaped claim. */
function isCodeShape(instance) {
  const lines = instance.split("\n").filter((l) => l.trim() !== "");
  return lines.length > 0 && lines.every((l) => CODE_COMMENT.test(l));
}

/** A fresh git repo carrying a COPY of each carrier, for the self-test. */
function fixture(scratch) {
  const dir = join(scratch, "repo");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const git = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "gate@gate");
  git("config", "user.name", "gate");
  for (const c of CARRIERS) {
    const dest = join(dir, c.rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(root, c.rel), dest);
  }
  git("add", "-A");
  git("commit", "-qm", "carrier");
  return { dir, git };
}

/** Inject an instance into ONE carrier and scan the fixture. */
function injectAndScan(scratch, carrierRel, instance, prefix = "") {
  const { dir, git } = fixture(scratch);
  const dest = join(dir, carrierRel);
  writeFileSync(dest, `${readFileSync(dest, "utf8")}\n${prefix}${instance}\n`);
  git("add", "-A");
  git("commit", "-qm", "injected");
  return scan(dir);
}

function selfTest() {
  const scratch = mkdtempSync(join(tmpdir(), "check-retired-claims-"));
  try {
    // The claim has to be able to FAIL: the real tree must be clean FIRST, or an
    // instance that matches nothing here would look effective for the wrong reason.
    const live = scan(root);
    if (live.length) {
      fail(`the umbrella's own tracked tree still carries a retired claim form: ${live.map((h) => h.line).join("; ")}`);
      return;
    }
    ok(`the umbrella's own tracked tree carries none of the ${PATTERNS.length} retired claim class(es)`);

    // The fixture must be clean before anything is injected, or an instance that
    // matches nothing here would look effective for the wrong reason.
    {
      const { dir } = fixture(scratch);
      const clean = scan(dir);
      if (clean.length) {
        fail(`the fixture is not clean before the injection (${clean.length} hit(s)) — the instance test would prove nothing`);
        return;
      }
    }

    // Every instance must be EFFECTIVE: injected into a copy of a tracked file, it turns
    // the scan RED. The copy is never the real tree (R6).
    const carrier = join(root, "README.md");
    let checked = 0;
    for (const { pattern, instances, why } of PATTERNS) {
      for (const instance of instances) {
        const code = isCodeShape(instance);
        // A comment-shaped claim lives in a CODE file; a prose claim lives anywhere.
        const mustCatch = code ? CARRIERS.filter((c) => c.code) : CARRIERS;
        const mustStayClean = code ? CARRIERS.filter((c) => !c.code) : [];
        for (const c of mustCatch) {
          const hits = injectAndScan(scratch, c.rel, instance);
          const caught = hits.some((h) => h.pattern === pattern);
          if (!caught) {
            fail(`the pattern is INEFFECTIVE — the instance was not caught in ${c.rel}: ${instance} (${why})`);
            return;
          }
          ok(`the pattern is effective: the instance turns the scan RED in ${c.rel} (${instance.slice(0, 52).replace(/\n/g, "⏎")}${instance.length > 52 ? "…" : ""})`);
        }
        // And a comment-shaped claim is a COMMENT: in a markdown file the same marker
        // is a HEADING, which makes no claim at all, and the scan must stay GREEN.
        for (const c of mustStayClean) {
          const hits = injectAndScan(scratch, c.rel, instance);
          if (hits.some((h) => h.pattern === pattern)) {
            fail(`the pattern is INEFFECTIVE about SHAPE — a comment-shaped claim was read as prose in ${c.rel}: ${instance}`);
            return;
          }
          ok(`the pattern reads the shape: the comment-shaped instance stays GREEN in ${c.rel} (a markdown heading is not a comment, and a claim cannot straddle two of them)`);
        }
        checked += 1;
      }
    }

    // Every CLASS must also be effective in the LIST shape: a claim a reader sees in a
    // markdown list item is a claim, and the umbrella's own rulebook is written as list
    // items — so a scan that cannot see a list item cannot see the rulebook. This case
    // is what makes the shape a PROVEN thing: without it, the list shape is an
    // assumption the scan never tests, and a claim in a list item is invisible.
    let shaped = 0;
    for (const { pattern, instances, why } of PATTERNS) {
      const instance = instances.find((x) => !isCodeShape(x));
      if (instance === undefined) continue;
      const hits = injectAndScan(scratch, "README.md", instance, "- ");
      if (!hits.some((h) => h.pattern === pattern)) {
        fail(
          `the pattern is INEFFECTIVE in the LIST shape — the instance was not caught in a markdown list item: ${instance} (${why})`,
        );
        return;
      }
      ok(
        `the pattern is effective in the LIST shape: the instance turns the scan RED in README.md (- ${instance.slice(0, 46).replace(/\n/g, "⏎")}${instance.length > 46 ? "…" : ""})`,
      );
      shaped += 1;
    }

    // Every counter-instance must be SOUND: injected the same way, it leaves the scan
    // GREEN. A pattern that cries wolf is a gate that gets switched off.
    let sounded = 0;
    for (const { pattern, counterInstances, why } of PATTERNS) {
      for (const instance of counterInstances) {
        for (const c of CARRIERS) {
          const hits = injectAndScan(scratch, c.rel, instance);
          if (hits.some((h) => h.pattern === pattern)) {
            fail(`the pattern is UNSOUND — a qualified, TRUE wording was caught in ${c.rel}: ${instance} (${why})`);
            return;
          }
        }
        ok(`the pattern is sound: the qualified wording leaves the scan GREEN (${instance.slice(0, 52).replace(/\n/g, "⏎")}${instance.length > 52 ? "…" : ""})`);
        sounded += 1;
      }
    }
    console.log(
      `check-retired-claims --self-test: OK (${checked} instance(s) and ${sounded} counter-instance(s) across ${PATTERNS.length} pattern(s), and ${shaped} list-shape case(s))`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (argv.includes("--self-test")) {
  selfTest();
} else {
  let hits;
  try {
    hits = scan(root);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    hits = [];
  }
  if (hits.length) {
    for (const h of hits) fail(`a retired claim form survives: ${h.line} — ${h.why}`);
    fail(`${hits.length} retired claim form(s) survive in the umbrella's own tracked tree`);
  } else {
    ok(`no retired claim form survives in the umbrella's own tracked tree (${PATTERNS.length} class(es))`);
  }
}
