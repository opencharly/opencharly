#!/usr/bin/env node
// check-pr-body-diff.mjs — the PR body must DESCRIBE the diff it is published with.
//
// THE DEFECT THIS CLOSES (observed 2026-10-23, on this branch's own PR, at the
// `charly/pr-validator`'s BLOCK): the body's file table listed a file the diff did not
// change, the table's README row claimed a change the diff did not carry, and the body's
// gate evidence named a commit that was not the head being pushed. All three are
// DEFECTS OF THE BODY, and the org's body linter could not see any of them: the linter
// judges a body's FORM (sections, trailer, rules, claims, ellipses, self-contradiction,
// the counts of a pasted diff table) and the shape of the head it names — it never
// compared the body against the diff the body is published with.
//
// WHY A SEPARATE GATE, and not a new rule in the org's linter: the org's linter is
// authored in opencharly/marketplace and the umbrella runs it from its submodule
// (AGENTS.md Part II #5 — authored content lives with what it describes). This gate
// belongs to the umbrella because the DIFF it reconciles against is the umbrella's own
// tree and its own base branch, and because a rule that can only be armed after a
// submodule pin bump cannot guard the push that follows the bump. It deliberately
// implements NO rule the linter already owns: it reads the body and the git tree, and
// asks the questions the linter does not ask.
//
// ASSERTED — each proven LIVE by --self-test against a mutation of a fixture body:
//   Z. The body's SIZE is within GitHub's cap for an issue or pull-request body. The
//      cap is ONE number, read from `scripts/lib/pr-body-cap` — the same place
//      `scripts/sync-pr-body.sh` reads it, so the two guards cannot drift (R2). An
//      over-cap body is refused by the API with a 422 AFTER the push has already
//      succeeded, so the branch is pushed and the pull request keeps a STALE body,
//      and the operator finally sees a validator BLOCK about the body instead of
//      about its size (opencharly/opencharly#716).
//   F. The body's FENCES PAIR. The reader answers "where does a fence end", and it
//      answers that well; it was never asked "do the fences pair". A body with one
//      fence too few shifts every later pair by one, so each block's closing fence
//      is consumed as the next block's opening fence — and from that point the arms
//      below read the body's evidence as prose and the body's prose as evidence,
//      each reporting "inapplicable" while the gate says OK (opencharly/opencharly#717,
//      measured on this repo's own published pull request). An unpaired fence is a
//      hard failure naming the line, and the arms that read the body's blocks are
//      SKIPPED: on a mis-paired body every one of them reads the body wrong.
//   S. The sections the body must carry are PROSE. A `## Summary` inside a fenced
//      block renders as CODE, and the org's linter reads the body's LINES, so it
//      counts such a heading as a present section (opencharly/opencharly#717). A
//      section the body hides in a fence is a hard failure naming its line.
//   T. The body's FILE TABLE lists exactly the files the diff changes, against the base
//      ref. A file the diff changes and the table omits is a finding; a file the table
//      lists and the diff does not change is a finding. A body with no file table has
//      nothing to reconcile, and the rule is INAPPLICABLE — not a finding, and not a
//      silent pass either: the report says so.
//   H. Every `git rev-parse HEAD` the body pastes reports THE HEAD BEING PUSHED. The
//      command reports the head of the tree it runs in, so a pasted SHA that is another
//      commit means the evidence was taken on another tree than the body claims. A body
//      that wants to name another tree's head says `git -C <path> rev-parse HEAD` or
//      writes the SHA plainly.
//   N. Every COUNT the body's prose states about the diff's NEW files equals the diff's.
//      The prose and the diff state the same fact twice, and a hand-written count is a
//      second source of truth that rots silently when the diff grows — which is exactly
//      what the `charly/pr-validator` BLOCKed on (2026-10-23, this branch's own PR: the
//      body said "three new executable scripts" and the diff adds six). The count is
//      derived MECHANICALLY — the number, the word "new"/"added" and a noun that names
//      files or scripts — so a claim about anything else ("the four new gates", "a new
//      task") is not read as a claim about the diff's file set. The scope the prose names
//      ("under `scripts/`") narrows the comparison to that directory.
//   E. Every pasted EVIDENCE line that names a file and a line number must RESOLVE in
//      the tree being pushed: the file must exist there, the line must exist in it, and
//      the pasted text must be the text of that line. A pasted grep hit is a claim about
//      a line of a file; the tree can decide it, so it needs no judgement. This arm
//      exists because the `charly/pr-validator` found a body whose pasted sweep was
//      taken on ANOTHER tree (2026-10-24, this branch's own PR: the body pasted
//      `scripts/sync-pin-evidence.sh:290:` with the line's text, and on the head being
//      pushed line 290 read `guard_rc=0`) — a stale paste that H, T and N all accept,
//      because a stale paste is well-formed. It is scoped to FENCED blocks (pasted
//      output) and never to prose: prose may quote a line that has since moved, and
//      that is a judgement, not a mechanical fact.
//   D. Every CLOSING DIRECTIVE the body opens with — `Closes #N`, `Fixed #N`,
//      `Resolves #N`, and every other form GitHub accepts — must name something the
//      directive CAN close. GitHub's `Closes` closes an ISSUE; a merged pull request
//      cannot be closed, so a directive naming one closes nothing, while the same body
//      usually states, a few lines down, that the number "is already merged". The tree
//      can decide what KIND of thing the number is: GitHub's squash subject is
//      `title (#closed-issue) (#pr)`, so the LAST parenthesised number in a merged
//      commit's subject is the pull request. This arm exists because the
//      `charly/pr-validator` found a body whose `Closes #696` named a MERGED PULL
//      REQUEST (2026-10-26, opencharly/opencharly#697) — the directive closed nothing
//      and the body contradicted itself.
//      The KEYWORD SET is GitHub's own, in full — `close`, `closes`, `closed`, `fix`,
//      `fixes`, `fixed`, `resolve`, `resolves`, `resolved`, matched case-
//      insensitively and with the optional colon GitHub allows — because a directive
//      the arm cannot read is a directive the arm cannot judge. The line must still
//      OPEN with the keyword, and the reference must still be bare: `owner/repo#N`
//      names another repository's issue, which this repo's history cannot judge.
//      A FENCED block is never read, and the fence reader follows CommonMark's fence
//      rules — the length rule, and the closing fence's rule that only whitespace may
//      follow it — so a body that PASTES a directive as evidence is not making one, and
//      a directive after a nested fence is still caught.
//   C. Every claim a CHANGED RECORD states is VISIBLE IN THE BODY. A file under
//      `CHANGELOG/` is a record of what happened; a correction PR rewrites one. The
//      record's own claims must be reproducible from the body that publishes the
//      correction, and the BODY is that reproduction:
//        C1. every PATH the record's added prose names must be named in the body — a
//            record that names a file and a body that never shows it is a record whose
//            classification the reader cannot check;
//        C2. every bare NUMBER the record's added prose states must appear in the
//            body's PASTED OUTPUT — a quantity is a measurement, and a measurement is
//            shown by a command's output, not asserted in prose.
//      This arm exists because the `charly/pr-validator` BLOCKed a correction PR
//      (2026-10-26, opencharly/opencharly#696) whose record stated "8 commits behind
//      the corpus's main" and classified two corpus CHANGELOG files as the surviving
//      hits — and whose body ran no command for the first and showed no sweep for the
//      second. T, H, N and E all accepted it: the record's two claims were TRUE, and
//      nothing in them was mechanically FALSE. The defect was REPRODUCIBILITY, and the
//      record's own evidence — the corpus sweep it classified — was in the record while
//      the body carried a different, thinner set. The arm is scoped to files under
//      `CHANGELOG/` and to the diff's ADDED lines: the normal flow never adds one (the
//      merge writes the record FROM the body), so the arm is live only for a
//      correction, which is exactly where the class lives.
//
// NOT asserted, and why: whether the body's prose about a file is TRUE. A row that says
// the README carries a change the README does not carry is a judgement, and judgement is
// the validator's job — this gate removes only the class that needs none. A COUNT is not
// that class: it is the diff's own arithmetic, so the diff can decide it. A pasted
// OUTPUT LINE is the same class as a count: it is the tree's own text, and the tree can
// decide it. A QUANTITATIVE CLAIM in a record is the same class again: the number is
// the command's own output, and the body can decide whether it shows.
//
// Usage: node scripts/check-pr-body-diff.mjs [--body <path>] [--repo <dir>] [--base <ref>] [--self-test]
// exit 0 clean · 1 finding · 2 usage

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const root = resolve(argOf("--repo") ?? resolve(here, ".."));
const bodyPath = resolve(argOf("--body") ?? join(root, "PR_BODY.md"));
const baseRef = argOf("--base") ?? "origin/main";

let findings = 0;
const fail = (m) => {
  findings += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);
const notice = (m) => console.log(`  NOTE  ${m}`);

/**
 * The ONE cap on a PR body's size, in BYTES — GitHub's limit for an issue or
 * pull-request body. It is read from `scripts/lib/pr-body-cap`, the SAME place
 * `scripts/sync-pr-body.sh` reads it, so the two guards cannot drift (R2): one
 * definition, two readers.
 *
 * The environment variable `GITHUB_BODY_MAX` overrides the number, in BOTH readers,
 * for a tighter local policy or for a self-test that wants a small body. A cap that
 * cannot be read is a hard failure: it is never replaced by a default that is not
 * this number, because a default that is not this number is a SECOND cap, and the
 * two would disagree the first time one of them is changed.
 */
const CAP_FILE = join(here, "lib", "pr-body-cap");

function readCapBytes() {
  const override = (process.env.GITHUB_BODY_MAX ?? "").trim();
  if (override !== "") {
    if (!/^\d+$/.test(override) || Number(override) <= 0) {
      fail(`GITHUB_BODY_MAX is not a positive integer (${override}) — the body's size cap cannot be read`);
      return null;
    }
    return Number(override);
  }
  let text;
  try {
    text = readFileSync(CAP_FILE, "utf8");
  } catch {
    fail(`the body's size cap cannot be read from ${CAP_FILE} — the ONE cap is missing`);
    return null;
  }
  const value = text.replace(/#.*$/gm, "").replace(/\s+/g, "");
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    fail(`the body's size cap in ${CAP_FILE} is not a positive integer (${value})`);
    return null;
  }
  return Number(value);
}

/** Run a git command in the repo and return its trimmed stdout, or null on failure. */
const git = (...a) => {
  const r = spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  return r.status === 0 ? (r.stdout ?? "").trim() : null;
};

/**
 * Run a git command and return its stdout UNTRIMMED, or null on failure. A blob must
 * be read this way: trimming it would drop a leading blank line and shift every line
 * number in the file by one, which is exactly the kind of off-by-one this arm exists
 * to catch.
 */
const gitRaw = (...a) => {
  const r = spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  return r.status === 0 ? (r.stdout ?? "") : null;
};

/**
 * The body's FILE TABLE: a markdown table whose header row's first cell is `file`.
 * Returns the rows' first cells' code-spanned paths, or null when the body has no such
 * table (the rule is then INAPPLICABLE — reported, never silently passed).
 */
function fileTable(body) {
  const lines = body.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (cells[0].toLowerCase() === "file") {
      start = i + 2; // skip the header row and its `|---|---|` separator
      break;
    }
  }
  if (start === -1) return null;
  const paths = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) break;
    const first = line.split("|")[1] ?? "";
    for (const m of first.matchAll(/`([^`]+)`/g)) paths.push(m[1].trim());
  }
  return paths;
}

/** The SHAs the body pastes as the output of `git rev-parse HEAD`. */
function pastedHeads(body) {
  const out = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*\$?\s*git rev-parse HEAD\s*$/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const t = lines[j].trim();
      if (t === "") continue;
      const sha = t.match(/\b([0-9a-f]{40})\b/);
      if (sha) out.push({ sha: sha[1], line: j + 1 });
      break;
    }
  }
  return out;
}

/** The number words a count claim may spell. */
const COUNT_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/** A path that is a script by where it lives or by what it ends in. */
const isScriptPath = (p) => p.startsWith("scripts/") || /\.(sh|mjs|cjs|js|py|ts|rb|pl)$/.test(p);

/**
 * The body's PROSE, with the fenced code blocks and the file table's rows blanked
 * out: a pasted gate output and a table row are not the author's claim about the
 * diff. The blanks keep every OFFSET, so a claim keeps its line number.
 */
function claimText(body, table) {
  const noFences = body.replace(/```[\s\S]*?(?:```|$)/g, (m) => m.replace(/[^\n]/g, " "));
  const set = new Set(table ?? []);
  if (set.size === 0) return noFences;
  return noFences
    .split("\n")
    .map((line) => {
      if (!/^\s*\|/.test(line)) return line;
      const paths = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      return paths.some((p) => set.has(p)) ? line.replace(/[^\n]/g, " ") : line;
    })
    .join("\n");
}

/**
 * The counts the prose states about the diff's NEW files: a number, "new" (or
 * "added"), and a noun that names files or scripts. A claim about anything else
 * ("the four new gates", "a new task and new gate steps") is not a claim about the
 * diff's file set, so it is not read as one.
 */
function countClaims(body, table) {
  const text = claimText(body, table);
  const re =
    /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:new|added)\s+(?:[a-z-]+\s+)?(files?|scripts?)\b/gi;
  const claims = [];
  for (const m of text.matchAll(re)) {
    const word = m[1].toLowerCase();
    const n = /^\d+$/.test(word) ? Number(word) : COUNT_WORDS[word];
    if (!n) continue;
    const noun = m[2].toLowerCase();
    const sentence = text.slice(m.index, m.index + 240).split(/(?:\.\s|\n|;)/)[0];
    const scope = sentence.match(/\b(?:under|in|inside|within)\s+`([^`]+)`/);
    claims.push({
      n,
      noun,
      scope: scope ? scope[1] : null,
      text: m[0],
      line: text.slice(0, m.index).split("\n").length,
    });
  }
  return claims;
}

/**
 * N. Every count the body states about the diff's NEW files equals the diff's.
 * The prose and the diff state the same fact twice; a hand-written count is a second
 * source of truth, and it rots silently when the diff grows.
 */
function checkCounts(body, table, statuses) {
  const added = statuses.filter(([s]) => s === "A").map(([, p]) => p);
  const claims = countClaims(body, table);
  if (claims.length === 0) {
    notice("the body states no count of the diff's new files — the count rule is inapplicable");
    return;
  }
  let bad = 0;
  for (const c of claims) {
    let set = added;
    if (c.noun.startsWith("script")) set = set.filter(isScriptPath);
    if (c.scope) set = set.filter((p) => p.startsWith(c.scope));
    if (c.n === set.length) continue;
    bad += 1;
    fail(
      `the body states "${c.text}" (line ${c.line}), and the diff adds ${set.length} new file(s)` +
        `${c.scope ? ` under \`${c.scope}\`` : ""} — the count in the prose is stale`,
    );
  }
  if (bad === 0)
    ok(`every count the body states about the diff's new files matches the diff (${claims.length} claim(s))`);
}

/**
 * The body's FENCE SPANS — the line ranges a fenced block covers, with the fence's
 * opening and closing lines INCLUDED.
 *
 * A fence OPENS with a run of three or more backticks or tildes, and CLOSES with a run
 * of the same character at least as long whose line carries nothing but whitespace
 * after it (CommonMark's closing-fence rule: an info string belongs to the OPENING
 * fence alone). A shorter run — a run of the other character — or a run followed by
 * text is CONTENT inside the open fence, not a fence of its own.
 *
 * Leading whitespace is tolerated on both, because a fence inside a list item is
 * indented and is still a fence.
 *
 * The naive toggle — any ``` line opens, the next ``` line closes — gets that wrong
 * in BOTH directions, and each error is a real body (measured on this repo's merged
 * pull requests, 2026-10-26):
 *   - it CLOSES a four-backtick fence at the three-backtick line inside it, so the rest
 *     of the fence reads as PROSE — and a directive pasted inside that fence trips the
 *     directive arm on the body's own quote;
 *   - it OPENS a fence at a three-backtick line inside a four-backtick one, so a
 *     directive AFTER that line reads as fenced — and a real directive escapes the arm;
 *   - it CLOSES a fence on a run that is followed by text, where CommonMark says the
 *     fence is still open — and the directive inside it is read as a directive.
 * One scanner, so the two readers of a fence — the evidence arm and the directive arm
 * — can never disagree about where a fence ends.
 *
 * The BALANCE question is a different one, and the SAME scanner answers it: a fence
 * that opens a block and is never closed leaves the reader with one block running to
 * the end of the body. Every fence the reader acted on is either an opening or a
 * closing one, so an ODD number of acted-on fences is exactly an unpaired fence, and
 * the line that opens it is the line the finding names.
 */
function scanFences(body) {
  const spans = [];
  const lines = body.split("\n");
  let open = null;
  let acted = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (!m) continue;
    const marker = m[1];
    const rest = m[2];
    if (!open) {
      open = { char: marker[0], len: marker.length, from: i + 1 };
      acted += 1;
      continue;
    }
    if (marker[0] === open.char && marker.length >= open.len && /^\s*$/.test(rest)) {
      spans.push({ from: open.from, to: i + 1 });
      open = null;
      acted += 1;
    }
  }
  const unpaired = open ? { line: open.from, char: open.char, len: open.len } : null;
  if (open) spans.push({ from: open.from, to: lines.length });
  return { spans, unpaired, acted };
}

/** The fence spans — the reader's ONE view of where a fence ends. */
function fenceSpans(body) {
  return scanFences(body).spans;
}

/**
 * The body's FENCED blocks — the pasted output. A block is a set of lines between
 * fences, with the line each line sits on in the body.
 */
function fencedBlocks(body) {
  const blocks = [];
  const lines = body.split("\n");
  for (const span of fenceSpans(body)) {
    const inner = [];
    for (let n = span.from + 1; n < span.to; n += 1) inner.push({ n, text: lines[n - 1] });
    blocks.push({ lines: inner });
  }
  return blocks;
}

/**
 * A block that names ANOTHER tree explicitly (`git show <blob>`, `git -C <dir>`) is
 * about that tree, not about the one being pushed, so it is not judged here. The author
 * says so in the command; that is the escape hatch.
 */
const namesAnotherTree = (block) =>
  block.lines.some((l) => /^\s*\$\s*git\s+(?:show\b|-C\b)/.test(l.text));

/**
 * The evidence lines a block carries: an OUTPUT line of the shape `path:NN:text`, where
 * `path` is repo-relative and names a file. Command lines (`$ …`) are not output and are
 * never judged.
 */
function evidenceRefs(body) {
  const refs = [];
  for (const block of fencedBlocks(body)) {
    if (namesAnotherTree(block)) continue;
    for (const l of block.lines) {
      if (/^\s*\$\s/.test(l.text)) continue;
      const m = /^([A-Za-z0-9_][A-Za-z0-9_.\-/]*\.[A-Za-z0-9]+):(\d+):(.*)$/.exec(l.text);
      if (!m) continue;
      const path = m[1];
      if (path.startsWith("/") || path.includes("..")) continue;
      refs.push({ path, line: Number(m[2]), text: m[3], bodyLine: l.n });
    }
  }
  return refs;
}

/**
 * E. Every pasted evidence line resolves in the tree being pushed.
 */
function checkEvidence(body) {
  const refs = evidenceRefs(body);
  if (refs.length === 0) {
    notice("the body pastes no evidence line that names a file and a line number — the evidence rule is inapplicable");
    return;
  }
  const cache = new Map();
  const linesOf = (path) => {
    if (cache.has(path)) return cache.get(path);
    const type = git("cat-file", "-t", `HEAD:${path}`);
    if (type !== "blob") {
      cache.set(path, null); // not a file in this tree: a submodule, or absent
      return null;
    }
    const blob = gitRaw("show", `HEAD:${path}`);
    const ls = (blob ?? "").split("\n");
    if (ls.length > 0 && ls[ls.length - 1] === "") ls.pop();
    cache.set(path, ls);
    return ls;
  };
  let bad = 0;
  for (const r of refs) {
    const ls = linesOf(r.path);
    if (ls === null) continue; // the tree cannot judge it: absent, or another repo
    if (r.line > ls.length) {
      bad += 1;
      fail(
        `the body pastes ${r.path}:${r.line} (line ${r.bodyLine} of the body), and that file has ` +
          `${ls.length} line(s) in the tree being pushed`,
      );
      continue;
    }
    const pasted = r.text.trim();
    if (pasted === "") continue;
    const actual = ls[r.line - 1].trim();
    // An EMPTY tree line matches nothing but an empty paste: `pasted.startsWith(actual)`
    // is trivially true when `actual` is "", which would let any text claim any blank
    // line of the tree.
    const matches = actual !== "" && (actual.startsWith(pasted) || pasted.startsWith(actual));
    if (matches) continue;
    bad += 1;
    fail(
      `the body pastes ${r.path}:${r.line} as "${pasted}" (line ${r.bodyLine} of the body), and that line ` +
        `reads "${actual}" in the tree being pushed — the evidence was taken on another tree`,
    );
  }
  if (bad === 0)
    ok(`every pasted evidence line resolves in the tree being pushed (${refs.length} reference(s))`);
}

/**
 * The body's lines that are NOT inside a fenced block, with their line numbers. A body
 * that PASTES a closing directive as evidence is not making one, and the gate must not
 * trip on its own quote — the same distinction the evidence arm draws, in the other
 * direction.
 */
function proseLines(body) {
  const out = [];
  const spans = fenceSpans(body);
  const lines = body.split("\n");
  let s = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const n = i + 1;
    while (s < spans.length && n > spans[s].to) s += 1;
    if (s < spans.length && n >= spans[s].from && n <= spans[s].to) continue;
    out.push({ n, text: lines[i] });
  }
  return out;
}

/**
 * The body's CLOSING DIRECTIVES: a line that OPENS with a closing keyword followed by
 * a bare `#N`.
 *
 * The keyword set is GitHub's own, in full: `close`, `closes`, `closed`, `fix`,
 * `fixes`, `fixed`, `resolve`, `resolves`, `resolved` — and GitHub matches them
 * case-insensitively and accepts a colon after them ("The keywords can be followed by
 * colons or in uppercase", GitHub's "Linking a pull request to an issue"). Reading
 * only the three plural forms, case-sensitively, meant a body whose directive said
 * `closes #7` or `Fixed #7` was not read at all — and GitHub reads those, so the arm's
 * claim ("every closing directive names something the directive CAN close") was false
 * for them.
 *
 * The line must OPEN with the keyword — that is the directive form, and a file's prose
 * may quote a directive without making one — and the reference must be bare, because
 * `owner/repo#N` names another repository's issue, which this repo's history cannot
 * judge. GitHub also honours a keyword WITHIN a line, and a second reference on the
 * same line; those are not read here, and the boundary is measured and filed as
 * opencharly/opencharly#701.
 */
function closingDirectives(body) {
  const out = [];
  for (const l of proseLines(body)) {
    const m = /^\s*(?:[-*+]\s+)?(close[sd]?|fix(?:es|ed)?|resolve[sd]?)\b([ \t]*:?[ \t]*)(#\d+)\b/i.exec(
      l.text,
    );
    if (m) out.push({ line: l.n, keyword: m[1], n: m[3].slice(1), text: `${m[1]}${m[2]}${m[3]}` });
  }
  return out;
}

/**
 * The numbers this repo has merged as PULL REQUESTS, read from the base ref's history.
 *
 * GitHub's squash subject is `title (#closed-issue) (#pr)`, so the LAST parenthesised
 * number in a merged commit's subject is the pull request and the earlier one is the
 * issue it closed; a merge commit's subject names the pull request outright. Measured
 * against the API, this signal reproduces the merged-pull-request set exactly (446 of
 * 446 in this repo), while the naive "any `(#N)`" reading yields seven candidates, six
 * of which are issues.
 */
function mergedPullRequests(baseRef) {
  const log = git("log", "--format=%s", baseRef);
  if (log === null) return null;
  const set = new Set();
  for (const line of log.split("\n")) {
    const squash = /\(#(\d+)\)\s*$/.exec(line);
    const merge = /^Merge pull request #(\d+)\b/.exec(line);
    if (squash) set.add(squash[1]);
    else if (merge) set.add(merge[1]);
  }
  return set;
}

/**
 * D. Every closing directive names something the directive CAN close.
 */
function checkClosingDirectives(body, baseRef) {
  const directives = closingDirectives(body);
  if (directives.length === 0) {
    notice("the body carries no closing directive — the directive rule is inapplicable");
    return;
  }
  const merged = mergedPullRequests(baseRef);
  if (merged === null) {
    notice(`the base ref ${baseRef} could not be read — the closing directives are not reconciled`);
    return;
  }
  let bad = 0;
  for (const d of directives) {
    if (!merged.has(d.n)) continue;
    bad += 1;
    fail(
      `the body opens ${d.text} (line ${d.line}), and #${d.n} is a merged PULL REQUEST in this repo — ` +
        `GitHub closes issues, not pull requests, so the directive closes nothing; write \`Refs #${d.n}\``,
    );
  }
  if (bad === 0)
    ok(
      `every closing directive names a number this repo has not merged as a pull request ` +
        `(${directives.length} directive(s)) — a directive naming an OPEN pull request is not decidable from the tree`,
    );
}

/**
 * A path-like token: a slash and an extension (`dir/file.ext`). A record names a file;
 * the body must show the same name, so a reader can find the evidence behind it.
 */
function pathTokens(text) {
  const out = new Set();
  for (const m of text.matchAll(/[A-Za-z0-9_.\-]*\/[A-Za-z0-9_.\-]*\.[A-Za-z0-9_]+/g)) {
    const t = m[0].replace(/[.,;:)]+$/, "");
    if (t.length > 3 && !t.includes("..")) out.add(t);
  }
  return out;
}

/**
 * The bare NUMBERS a text states: integers that are not part of a version-like token
 * (`2026.299.0132`), not part of a letter-adjacent token (`d0d55ccc`, `9540ca5371` —
 * their digits never sit on a word boundary), and not an issue or PR reference
 * (`#185`).
 */
function numberTokens(text) {
  const masked = text.replace(/\b\d+(?:\.\d+)+\b/g, " ").replace(/#\d+\b/g, " ");
  const out = new Set();
  for (const m of masked.matchAll(/\b\d+\b/g)) out.add(m[0]);
  return out;
}

/**
 * The ADDED lines of every changed file under `CHANGELOG/` — the records this diff
 * rewrites. A record is written by the merge FROM a body, so a diff that adds one is
 * a correction: the body publishing the correction must carry the record's claims.
 */
function recordAdditions(baseRef, statuses) {
  const out = [];
  for (const [, file] of statuses) {
    if (!file.startsWith("CHANGELOG/")) continue;
    const diff = gitRaw("diff", `${baseRef}...HEAD`, "--", file);
    if (diff === null) continue;
    const added = diff
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .join("\n");
    if (added.trim() === "") continue;
    out.push({ file, added });
  }
  return out;
}

/**
 * C. Every claim a changed record states is visible in the body.
 */
function checkRecordClaims(body, baseRef, statuses) {
  const records = recordAdditions(baseRef, statuses);
  if (records.length === 0) {
    notice("the diff rewrites no CHANGELOG record — the record-claim rule is inapplicable");
    return;
  }
  const bodyPaths = pathTokens(body);
  const bodyNumbers = numberTokens(
    fencedBlocks(body)
      .map((b) => b.lines.map((l) => l.text).join("\n"))
      .join("\n"),
  );
  let bad = 0;
  for (const r of records) {
    for (const p of pathTokens(r.added)) {
      if (bodyPaths.has(p)) continue;
      bad += 1;
      fail(
        `the record ${r.file} names "${p}", and the body does not name it — the record's evidence ` +
          `is not in the body, so the claim it makes is not reproducible from the PR`,
      );
    }
    for (const n of numberTokens(r.added)) {
      if (bodyNumbers.has(n)) continue;
      bad += 1;
      fail(
        `the record ${r.file} states the number ${n}, and the body's pasted output does not show it — ` +
          `a quantity is a measurement, and a measurement is shown by a command's output`,
      );
    }
  }
  if (bad === 0)
    ok(
      `every claim the ${records.length} rewritten record(s) state is visible in the body ` +
        `(paths and numbers)`,
    );
}

/**
 * Z. The body's size is within GitHub's cap for an issue or pull-request body.
 *
 * The cap is ONE number, read from `scripts/lib/pr-body-cap` — the same place
 * `scripts/sync-pr-body.sh` reads it (R2). The count is BYTES, the way `wc -c`
 * counts, and the message is that guard's message: the offending size, the cap,
 * and which section to bound.
 */
function checkBodySize(bytes) {
  const cap = readCapBytes();
  if (cap === null) return;
  if (bytes > cap) {
    fail(`the PR body is ${bytes} bytes (> ${cap} GitHub cap) — bound the section that grew`);
    return;
  }
  ok(`the PR body is ${bytes} bytes (within the ${cap}-byte GitHub cap)`);
}

/**
 * F. The body's fences pair.
 *
 * The reader answers "where does a fence end"; this asks it the OTHER question —
 * "do the fences pair" — and an unpaired fence is a hard failure naming the line
 * that opens it. It is not a NOTE: a NOTE is how the arms below reported a body
 * whose blocks they could not read, while the gate said OK.
 */
function checkFenceBalance(body) {
  const { unpaired, acted } = scanFences(body);
  if (!unpaired) {
    ok(`the body's fences pair (${acted} fence(s) the reader acted on)`);
    return true;
  }
  fail(
    `the body's fences do not pair: the fence at line ${unpaired.line} is never closed ` +
      `(${acted} fence(s) the reader acted on, and an odd count of fences is an unpaired fence)`,
  );
  return false;
}

/**
 * S. The sections the body must carry are PROSE.
 *
 * A `## Summary` inside a fenced block renders as CODE, and the org's linter reads
 * the body's LINES, so it counts such a heading as a present section — the body
 * passes the linter and shows no section at all (opencharly/opencharly#717).
 *
 * A section the body carries in prose AND quotes inside a fence is NOT a finding:
 * the body shows the section, and the fence is a quote of something else. Only a
 * section the body hides — no prose heading for it anywhere — is a failure.
 *
 * A section the body does not carry AT ALL is not this arm's business: the org's
 * linter owns the presence of the four required sections, and this gate implements
 * no rule the linter already owns.
 */
const REQUIRED_SECTIONS = [
  "Summary",
  "How tested",
  "Rulebook compliance",
  "Change classification",
  "Filed issues",
];

function checkSectionVisibility(body) {
  const spans = fenceSpans(body);
  const lines = body.split("\n");
  const inFence = (n) => spans.some((s) => n >= s.from && n <= s.to);
  const prose = new Set();
  const fenced = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^## +(.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const name = m[1];
    if (!REQUIRED_SECTIONS.includes(name)) continue;
    const n = i + 1;
    if (inFence(n)) {
      if (!fenced.has(name)) fenced.set(name, n);
    } else {
      prose.add(name);
    }
  }
  let bad = 0;
  for (const name of REQUIRED_SECTIONS) {
    if (prose.has(name)) continue;
    const line = fenced.get(name);
    if (line === undefined) continue;
    bad += 1;
    fail(
      `the body's \`## ${name}\` heading is inside a fenced block (line ${line}), and the body ` +
        `carries no \`## ${name}\` in prose — it renders as code, not as a section`,
    );
  }
  if (bad > 0) return;
  if (prose.size === 0) {
    notice("the body carries none of the required section headings — the section-visibility rule is inapplicable");
    return;
  }
  ok(`every required section the body carries is prose (${prose.size} section(s))`);
}

function check() {
  if (!existsSync(bodyPath)) {
    notice(`no body at ${bodyPath} — nothing to reconcile`);
    return;
  }
  const raw = readFileSync(bodyPath);
  const body = raw.toString("utf8");
  const head = git("rev-parse", "HEAD");
  if (!head) {
    notice(`${root} is not a git repository — the diff cannot be read, so nothing is reconciled`);
    return;
  }

  // ── Z. the body's size ───────────────────────────────────────────────────────────
  // It runs first: an over-cap body is refused by the API AFTER the push has
  // succeeded, so what the operator finally sees is a stale body and a validator
  // BLOCK about it — far from the cause.
  checkBodySize(raw.length);

  // ── F. the fences pair ──────────────────────────────────────────────────────────
  // It runs before every other arm, and when it fails the arms that read the body's
  // blocks are SKIPPED rather than run on a body they mis-read: on a mis-paired
  // body each of them reads the evidence as prose and the prose as evidence.
  if (!checkFenceBalance(body)) {
    notice(
      "the body's fences do not pair — the arms that read the body's blocks are skipped, " +
        "because on a mis-paired body each of them reads the evidence as prose and the prose as evidence",
    );
    return;
  }

  // ── S. the required sections are prose ───────────────────────────────────────────
  checkSectionVisibility(body);

  // ── H. the pasted head evidence ───────────────────────────────────────────────────
  const heads = pastedHeads(body);
  if (heads.length === 0) {
    notice("the body pastes no `git rev-parse HEAD` — the head-evidence rule is inapplicable");
  } else {
    let bad = 0;
    for (const h of heads) {
      if (h.sha === head) continue;
      bad += 1;
      fail(
        `the body's pasted \`git rev-parse HEAD\` (line ${h.line}) is ${h.sha}, and the head being pushed is ${head} — ` +
          `the evidence was taken on another tree than the body claims`,
      );
    }
    if (bad === 0) ok(`every pasted \`git rev-parse HEAD\` names the head being pushed (${head.slice(0, 7)})`);
  }

  // ── E. the pasted evidence, against the tree being pushed ─────────────────────────
  // It runs before the base-ref check and independently of the file table: a body that
  // carries no table still pastes evidence, and the tree can judge it either way.
  checkEvidence(body);

  // ── D. the closing directives' targets ────────────────────────────────────────────
  // It runs for the same reason: a body's closing directive is a claim about what the
  // change discharges, and the tree can say what KIND of thing the number names.
  checkClosingDirectives(body, baseRef);

  // ── T + N. the diff the body is published with ────────────────────────────────────
  const table = fileTable(body);
  if (!git("rev-parse", "--verify", `${baseRef}^{commit}`)) {
    notice(`the base ref ${baseRef} is not available here — the diff cannot be read, so the table is not reconciled`);
    return;
  }
  const changed = (git("diff", "--name-only", `${baseRef}...HEAD`) ?? "").split("\n").filter(Boolean);
  const statuses = (git("diff", "--name-status", `${baseRef}...HEAD`) ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      return [parts[0], parts.slice(1).join("\t")];
    });

  // N. the count the prose states about the diff's new files. It does not need the
  // file table, so it runs whether or not the body carries one.
  checkCounts(body, table, statuses);

  // C. the record's claims, against the body that publishes the correction. It runs
  // before the table arm and independently of it: a body that carries no table still
  // has to show what a rewritten record claims.
  checkRecordClaims(body, baseRef, statuses);

  // T. the file table.
  if (table === null) {
    notice("the body carries no file table — the table rule is inapplicable");
    return;
  }
  const listed = new Set(table);
  const missing = changed.filter((f) => !listed.has(f));
  const phantom = [...listed].filter((f) => !changed.includes(f));
  for (const f of missing) fail(`the diff changes ${f}, and the body's file table does not list it`);
  for (const f of phantom) fail(`the body's file table lists ${f}, and the diff does not change it`);
  if (missing.length === 0 && phantom.length === 0)
    ok(`the file table lists exactly the ${changed.length} file(s) the diff changes (against ${baseRef})`);
}

// ── --self-test: prove each assertion goes RED on a mutation ───────────────────────
if (argv.includes("--self-test")) {
  const scratch = mkdtempSync(join(tmpdir(), "check-pr-body-diff-"));
  const repo = join(scratch, "repo");
  const g = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
  const bodyFile = join(scratch, "BODY.md");
  let stFails = 0;
  let stLive = 0;
  try {
    mkdirSync(repo, { recursive: true });
    g("init", "-q", "-b", "main");
    g("config", "user.email", "gate@gate");
    g("config", "user.name", "gate");
    writeFileSync(join(repo, "a.txt"), "a\n");
    writeFileSync(join(repo, "b.txt"), "b\n");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    writeFileSync(join(repo, "scripts/one.sh"), "#!/bin/sh\n");
    // A file that STARTS with a blank line: read trimmed, it would shift every line
    // number by one. The green fixture body cites its line 2, so the green run is the
    // discriminator for that off-by-one.
    writeFileSync(join(repo, "scripts/blank.sh"), "\n#!/bin/sh\n");
    g("add", "-A");
    // The BASE commit's subject carries a pull-request number in GitHub's own squash
    // shape — `title (#closed-issue) (#pr)`, here with the issue part absent — so the
    // fixture repo has a number it has merged AS A PULL REQUEST. The directive arm needs
    // one to be caught against, and #3 stays free to stand for an ISSUE.
    writeFileSync(join(scratch, "msg.txt"), "base (#7)\n");
    g("commit", "-q", "-F", join(scratch, "msg.txt"));
    g("checkout", "-q", "-b", "feat");
    writeFileSync(join(repo, "a.txt"), "a2\n");
    writeFileSync(join(repo, "c.txt"), "c\n");
    writeFileSync(join(repo, "scripts/two.sh"), "#!/bin/sh\n");
    // A RECORD the correction rewrites: it names a file (`scripts/one.sh`) and states a
    // number (2 lines), and both must be visible in the body that publishes it.
    mkdirSync(join(repo, "CHANGELOG"), { recursive: true });
    writeFileSync(
      join(repo, "CHANGELOG/2026.001.0001.md"),
      "## Summary\n\nThe gate script `scripts/one.sh` grew by 2 lines.\n",
    );
    g("add", "-A");
    writeFileSync(join(scratch, "msg.txt"), "feat\n");
    g("commit", "-q", "-F", join(scratch, "msg.txt"));
    const head = g("rev-parse", "HEAD").stdout.trim();

    // The pasted command is a GLOB over the fixture's `scripts` directory, sorted, so
    // the output it claims is exactly the evidence block below it — the command and
    // its output name the same files, in a fixed order (grep's own file order is not
    // stable, so the sort is what makes the pasted output reproducible). It cannot
    // name ONE of them: the record-path mutation below works by REMOVING the
    // record's file from the evidence, and a command that named that file would keep
    // the body naming it, so the mutation would not fire.

    const DEFAULT_EVIDENCE =
      "scripts/blank.sh:2:#!/bin/sh\nscripts/one.sh:1:#!/bin/sh\nscripts/two.sh:1:#!/bin/sh";
    // The fixture's evidence block is a BACKTICK fence by default. One arm renders it
    // with TILDES, because the OLD reader's `fencedBlocks` recognised only backtick
    // fences — so a tilde-fenced evidence block was invisible to the evidence arm, and
    // a body could paste stale evidence in one and the gate never saw it. The fence
    // CHARACTER is a parameter so the arm that needs a tilde block can have one,
    // instead of a tilde block pasted somewhere the arm's name does not describe.
    const BACKTICK_FENCE = "`".repeat(3);
    const TILDE_FENCE = "~".repeat(3);
    // The file table the fixture's diff actually has — the three files it changes. It
    // is named once and used by every arm, so no arm can spell it differently from
    // another and the table stays a fixture of the gate, not a copy per arm.
    const FULL_TABLE =
      "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |";
    // The `mutate` parameter is the LAST one and takes the finished body, so an arm
    // that needs a shape the template cannot express — an unpaired fence, a section
    // hidden in a fence, a body of an exact byte size — states that shape on the
    // finished text instead of forking the template per arm.
    const body = (
      tableRows,
      pastedSha,
      claim = "",
      evidence = DEFAULT_EVIDENCE,
      directive = "",
      fence = BACKTICK_FENCE,
      mutate = (t) => t,
    ) => mutate(`${directive}
## Summary

A fixture body.

| file | what it carries |
|---|---|
${tableRows}
| \`CHANGELOG/2026.001.0001.md\` | a record |

## How tested

\`\`\`
$ git rev-parse HEAD
${pastedSha}
\`\`\`

${fence}
$ grep -n 'sh' scripts/*.sh | sort
${evidence}
${fence}

## Rulebook compliance
- **R0 — skills first:** fixture.
- **R1 — RCA every anomaly:** N/A — no anomaly in this fixture.
- **R2 — no duplication:** fixture.
- **R3 — no workarounds:** fixture.
- **R4 — fix the product first:** fixture.
- **R5 — delete legacy completely:** fixture.
- **R6 — git safety:** fixture.
- **R7 — prove behaviour, not compilation (+ emitted artifacts):** fixture.
- **R8 — live or skip:** fixture.
- **R9 — binary equals source:** fixture.
- **R10 — fresh disposable proof:** fixture.

## Change classification
${claim || "Test fixture, not a real change."}

*Assisted-by: DeepSeek Harness ollama-cloud/deepseek-v4.1-flash (documentation reviewed)*
`);
    // The cap the size arm reads, and the padding that puts a body at an EXACT byte
    // size. The padding is a run of a word with no digit and no slash, so it cannot be
    // read as a count claim, a path or an evidence line — the size arm is the only
    // thing the padded bodies are for.
    const capBytes = readCapBytes();
    if (capBytes === null) {
      throw new Error("the body's size cap could not be read — the size arm cannot be self-tested");
    }
    const sized = (text, target) => {
      const pad = target - Buffer.byteLength(text) - 1;
      if (pad < 0) {
        throw new Error(
          `the fixture body is already ${Buffer.byteLength(text)} bytes, past the ${target}-byte target`,
        );
      }
      const filler = "filler".repeat(Math.ceil(pad / 6)).slice(0, pad);
      return text.replace("## Rulebook compliance", () => `${filler}\n## Rulebook compliance`);
    };
    const runGate = () => {
      const r = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url), "--body", bodyFile, "--repo", repo, "--base", "main"],
        // The cap travels with the child, so the size arm judges the SAME number in
        // the fixture as in the self-test, whatever the ambient environment carries.
        { encoding: "utf8", env: { ...process.env, GITHUB_BODY_MAX: String(capBytes) } },
      );
      return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    };
    const arms = [
      [
        "the table omits a file the diff changes",
        body("| `a.txt` | a change |", head),
        "does not list it",
      ],
      [
        "the table lists a file the diff does not change",
        body("| `a.txt` | a change |\n| `b.txt` | no change |", head),
        "does not change it",
      ],
      [
        "the pasted head is not the head being pushed",
        body("| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |", "0".repeat(40)),
        "another tree than the body claims",
      ],
      [
        "the prose states a stale count of the diff's new files",
        body(
          FULL_TABLE,
          head,
          "This change adds two new scripts.",
        ),
        "the count in the prose is stale",
      ],
      [
        "the body pastes an evidence line the tree does not have",
        body(
          FULL_TABLE,
          head,
          "",
          "scripts/one.sh:7:#!/bin/sh",
        ),
        "that file has 1 line(s) in the tree being pushed",
      ],
      [
        "the body pastes an evidence line whose text is not the tree's",
        body(
          FULL_TABLE,
          head,
          "",
          "scripts/one.sh:1:echo something else",
        ),
        "the evidence was taken on another tree",
      ],
      [
        "the body pastes text against a blank line of the tree",
        body(
          FULL_TABLE,
          head,
          "",
          "scripts/blank.sh:1:#!/bin/sh",
        ),
        "the evidence was taken on another tree",
      ],
      [
        "the record names a file the body does not name",
        body(
          FULL_TABLE,
          head,
          "",
          "scripts/blank.sh:2:#!/bin/sh",
        ),
        "the body does not name it",
      ],
      [
        "the record states a number the body's pasted output does not show",
        body(
          FULL_TABLE,
          head,
          "",
          "scripts/one.sh:1:#!/bin/sh",
        ),
        "the body's pasted output does not show it",
      ],
      [
        "the body closes a number this repo merged as a pull request",
        body(
          FULL_TABLE,
          head,
          "",
          DEFAULT_EVIDENCE,
          "Closes #7",
        ),
        "is a merged PULL REQUEST",
      ],
      // Every closing keyword GitHub accepts, in the form GitHub accepts it. The arm
      // read THREE of the NINE, capitalised — so a body whose directive said `closed
      // #7` was green, and GitHub reads `closed`. Each form gets its own arm, or the
      // arm's claim — "every closing directive names something the directive CAN
      // close" — is false for every form no arm names.
      ...[
        "close",
        "closes",
        "closed",
        "fix",
        "fixes",
        "fixed",
        "resolve",
        "resolves",
        "resolved",
      ].map((kw) => [
        `the body closes a merged pull request with the keyword '${kw}'`,
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, `${kw} #7`),
        "is a merged PULL REQUEST",
      ]),
      [
        "the body closes a merged pull request in UPPERCASE",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "CLOSES #7"),
        "is a merged PULL REQUEST",
      ],
      [
        "the body closes a merged pull request with a COLON",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "Closes: #7"),
        "is a merged PULL REQUEST",
      ],
      [
        "the body closes a merged pull request AFTER a nested fence",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "````\n```\n````\nCloses #7"),
        "is a merged PULL REQUEST",
      ],
      // Two placements, because the OLD reader was blind to a tilde fence in BOTH:
      // `fencedBlocks` recognised only backtick fences, so a tilde-fenced line was
      // no evidence ref at all — wherever the fence sat.
      //
      // In the PROSE (the Change classification section), the OLD reader's `proseLines`
      // DID treat the tilde run as a fence, so the line was invisible to every arm:
      // the body was green. That is the discrimination this arm carries.
      [
        "the body pastes a stale evidence line inside a TILDE fence in the prose",
        body(FULL_TABLE, head, "~~~\nscripts/one.sh:1:echo something else\n~~~"),
        "the evidence was taken on another tree",
      ],
      // As the EVIDENCE BLOCK — the shape a real body has. The OLD reader does not
      // see the block's content either, so it reports a DIFFERENT finding (the record
      // arm, which cannot see the pasted output); what it never reports is the
      // evidence finding. The arm below is about the EVIDENCE arm firing.
      [
        "the body pastes evidence in a TILDE fence the tree does not hold",
        body(
          FULL_TABLE,
          head,
          "",
          "scripts/one.sh:1:echo something else",
          "",
          TILDE_FENCE,
        ),
        "the evidence was taken on another tree",
      ],
      // F. The fences pair. A body whose last fence is never closed hides every
      // block after it: the reader reads the rest of the body as evidence, and the
      // evidence arm then judges prose against the tree.
      [
        "the body leaves a fence open",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "", BACKTICK_FENCE, (t) =>
          t.replace(
            "\n## Rulebook compliance",
            "\n```\n$ a block that is never closed\n\n## Rulebook compliance",
          ),
        ),
        "the body's fences do not pair",
      ],
      // S. The required sections are prose. The linter reads the body's LINES, so a
      // heading inside a fence counts as a present section and the body shows none.
      [
        "the body hides a required section inside a fenced block",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "", BACKTICK_FENCE, (t) =>
          t.replace("## Rulebook compliance", () => "```\n## Rulebook compliance\n```"),
        ),
        "renders as code, not as a section",
      ],
      // Z. The body's size. One byte over the cap is over the cap.
      [
        "the body is over GitHub's cap",
        sized(body(FULL_TABLE, head, "This change adds one new script."), capBytes + 1),
        "GitHub cap",
      ],
    ];
    // The cases that must STAY GREEN: the arm is narrow on purpose, and a gate that
    // fires on a quoted directive or on an issue would be a gate nobody could push
    // through.
    const greenArms = [
      [
        "a closing directive inside a fenced block is evidence, not a directive",
        body(
          FULL_TABLE,
          head,
          "",
          DEFAULT_EVIDENCE,
          "```\nCloses #7\n```",
        ),
      ],
      // The same rule for the OTHER fence character: a tilde fence is a fence, so a
      // directive inside one is the body's own quote and not a directive. The OLD
      // reader already treated a tilde fence as a fence here — it was the evidence
      // reader that did not — and this arm holds that half in place.
      [
        "a closing directive inside a TILDE fence is evidence, not a directive",
        body(
          FULL_TABLE,
          head,
          "",
          DEFAULT_EVIDENCE,
          "~~~\nCloses #7\n~~~",
        ),
      ],
      [
        "a closing directive naming an issue is left alone",
        body(
          FULL_TABLE,
          head,
          "",
          DEFAULT_EVIDENCE,
          "Closes #3",
        ),
      ],
      [
        "a closing directive naming an issue is left alone in a form the arm newly reads",
        body(
          FULL_TABLE,
          head,
          "",
          DEFAULT_EVIDENCE,
          "closed #3",
        ),
      ],
      [
        "a closing directive inside a NESTED fence is evidence, not a directive",
        body(
          FULL_TABLE,
          head,
          "",
          DEFAULT_EVIDENCE,
          "````\n```\nCloses #7\n```\n````",
        ),
      ],
      [
        "a closing directive in the MIDDLE of a line is not a directive",
        body(
          FULL_TABLE,
          head,
          "",
          DEFAULT_EVIDENCE,
          "This PR closes #7 in prose.",
        ),
      ],
      // The CLOSING fence carries nothing but whitespace after the run: a run followed
      // by text is CONTENT inside the open fence, so the directive below it is inside
      // the fence too. The naive toggle closed the fence at that line, and the
      // directive escaped onto the prose — a finding on the body's own quote.
      [
        "a fence whose closing line carries text does not close the fence",
        body(
          FULL_TABLE,
          head,
          "",
          DEFAULT_EVIDENCE,
          "```sh\necho hi\n```still inside\nCloses #7\n```",
        ),
      ],
      // S. A body that SHOWS a section in prose and quotes the same heading inside a
      // fence is not hiding anything: the section is there, and the fence is a quote.
      // The arm is about a section with NO prose heading, so this stays green.
      [
        "a body that quotes a section heading inside a fence is not hiding a section",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "", BACKTICK_FENCE, (t) =>
          t.replace("## How tested", () => "```\n## Summary\n```\n\n## How tested"),
        ),
      ],
      // Z. One byte under the cap is under the cap. The padded body is the same body
      // the red case uses, so the size arm is the ONLY thing that differs.
      [
        "a body just under GitHub's cap stays green",
        sized(body(FULL_TABLE, head, "This change adds one new script."), capBytes - 1),
      ],
    ];
    for (const [name, text, expect] of arms) {
      stLive += 1;
      writeFileSync(bodyFile, text, "utf8");
      const r = runGate();
      if (r.code === 0) {
        stFails += 1;
        console.error(`  FAIL  mutation '${name}' did NOT go red (expected a '${expect}' finding)`);
      } else if (!r.out.includes(expect)) {
        stFails += 1;
        console.error(`  FAIL  mutation '${name}' went red with the WRONG finding (expected '${expect}'):\n${r.out}`);
      } else {
        console.log(`  PASS  mutation '${name}' is caught (gate red)`);
      }
    }
    for (const [name, text] of greenArms) {
      stLive += 1;
      writeFileSync(bodyFile, text, "utf8");
      const r = runGate();
      if (r.code !== 0) {
        stFails += 1;
        console.error(`  FAIL  case '${name}' went RED but must stay GREEN:\n${r.out}`);
      } else {
        console.log(`  PASS  case '${name}' stays green`);
      }
    }
    // The unmutated body is GREEN — and it states a count, so the green run also
    // proves the count rule does not fire on a count that MATCHES the diff.
    stLive += 1;
    writeFileSync(
      bodyFile,
      body(
        FULL_TABLE,
        head,
        "This change adds one new script.",
      ),
      "utf8",
    );
    const clean = runGate();
    if (clean.code !== 0) {
      stFails += 1;
      console.error(`  FAIL  the unmutated fixture body is NOT green:\n${clean.out}`);
    } else {
      console.log("  PASS  the unmutated fixture body is GREEN");
    }
  } catch (err) {
    stFails += 1;
    console.error(`  FAIL  the self-test fixture could not be built (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  if (stFails) {
    console.error(`check-pr-body-diff --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log(`check-pr-body-diff --self-test: OK (${stLive} arms live)`);
  process.exit(0);
}

check();
if (findings) {
  console.error(`check-pr-body-diff: ${findings} finding(s)`);
  process.exit(1);
}
console.log("check-pr-body-diff: OK");
