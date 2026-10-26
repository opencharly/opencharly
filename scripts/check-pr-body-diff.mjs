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
// asks two questions the linter does not ask.
//
// ASSERTED — each proven LIVE by --self-test against a mutation of a fixture body:
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
//   D. Every CLOSING DIRECTIVE the body opens with — `Closes #N`, `Fixes #N`,
//      `Resolves #N` — must name something the directive CAN close. GitHub's `Closes`
//      closes an ISSUE; a merged pull request cannot be closed, so a directive naming
//      one closes nothing, while the same body usually states, a few lines down, that
//      the number "is already merged". The tree can decide what KIND of thing the
//      number is: GitHub's squash subject is `title (#closed-issue) (#pr)`, so the LAST
//      parenthesised number in a merged commit's subject is the pull request. This arm
//      exists because the `charly/pr-validator` found a body whose `Closes #696` named
//      a MERGED PULL REQUEST (2026-10-26, opencharly/opencharly#697) — the directive
//      closed nothing and the body contradicted itself. It reads only lines that OPEN
//      with the keyword, and never a fenced block: a body that PASTES a directive as
//      evidence is not making one.
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
 * The body's FENCED blocks — the pasted output. A block is a set of lines between
 * ``` fences, with the line each line sits on in the body.
 */
function fencedBlocks(body) {
  const blocks = [];
  let cur = null;
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      if (cur) {
        blocks.push(cur);
        cur = null;
      } else {
        cur = { lines: [] };
      }
      continue;
    }
    if (cur) cur.lines.push({ n: i + 1, text: line });
  }
  if (cur) blocks.push(cur);
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
  let inFence = false;
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*(?:```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push({ n: i + 1, text: lines[i] });
  }
  return out;
}

/**
 * The body's CLOSING DIRECTIVES: a line that OPENS with `Closes`/`Fixes`/`Resolves`
 * followed by a bare `#N`. The line must open with the keyword — that is the directive
 * form, and a file's prose may quote a directive without making one — and the reference
 * must be bare, because `owner/repo#N` names another repository's issue, which this
 * repo's history cannot judge.
 */
function closingDirectives(body) {
  const out = [];
  for (const l of proseLines(body)) {
    const m = /^\s*(?:[-*+]\s+)?(Closes|Fixes|Resolves)\s+#(\d+)\b/.exec(l.text);
    if (m) out.push({ line: l.n, keyword: m[1], n: m[2] });
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
      `the body opens ${d.keyword} #${d.n} (line ${d.line}), and #${d.n} is a merged PULL REQUEST in this repo — ` +
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

function check() {
  if (!existsSync(bodyPath)) {
    notice(`no body at ${bodyPath} — nothing to reconcile`);
    return;
  }
  const body = readFileSync(bodyPath, "utf8");
  const head = git("rev-parse", "HEAD");
  if (!head) {
    notice(`${root} is not a git repository — the diff cannot be read, so nothing is reconciled`);
    return;
  }

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
    const body = (
      tableRows,
      pastedSha,
      claim = "",
      evidence = DEFAULT_EVIDENCE,
      directive = "",
    ) => `${directive}
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

\`\`\`
$ grep -n 'sh' scripts/*.sh | sort
${evidence}
\`\`\`

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
`;
    const runGate = () => {
      const r = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url), "--body", bodyFile, "--repo", repo, "--base", "main"],
        { encoding: "utf8" },
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
          "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
          head,
          "This change adds two new scripts.",
        ),
        "the count in the prose is stale",
      ],
      [
        "the body pastes an evidence line the tree does not have",
        body(
          "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
          head,
          "",
          "scripts/one.sh:7:#!/bin/sh",
        ),
        "that file has 1 line(s) in the tree being pushed",
      ],
      [
        "the body pastes an evidence line whose text is not the tree's",
        body(
          "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
          head,
          "",
          "scripts/one.sh:1:echo something else",
        ),
        "the evidence was taken on another tree",
      ],
      [
        "the body pastes text against a blank line of the tree",
        body(
          "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
          head,
          "",
          "scripts/blank.sh:1:#!/bin/sh",
        ),
        "the evidence was taken on another tree",
      ],
      [
        "the record names a file the body does not name",
        body(
          "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
          head,
          "",
          "scripts/blank.sh:2:#!/bin/sh",
        ),
        "the body does not name it",
      ],
      [
        "the record states a number the body's pasted output does not show",
        body(
          "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
          head,
          "",
          "scripts/one.sh:1:#!/bin/sh",
        ),
        "the body's pasted output does not show it",
      ],
      [
        "the body closes a number this repo merged as a pull request",
        body(
          "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
          head,
          "",
          DEFAULT_EVIDENCE,
          "Closes #7",
        ),
        "is a merged PULL REQUEST",
      ],
    ];
    // The cases that must STAY GREEN: the arm is narrow on purpose, and a gate that
    // fires on a quoted directive or on an issue would be a gate nobody could push
    // through.
    const greenArms = [
      [
        "a closing directive inside a fenced block is evidence, not a directive",
        body(
          "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
          head,
          "",
          DEFAULT_EVIDENCE,
          "```\nCloses #7\n```",
        ),
      ],
      [
        "a closing directive naming an issue is left alone",
        body(
          "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
          head,
          "",
          DEFAULT_EVIDENCE,
          "Closes #3",
        ),
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
        "| `a.txt` | a change |\n| `c.txt` | a change |\n| `scripts/two.sh` | a change |",
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
