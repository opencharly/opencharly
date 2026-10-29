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
//   I. Every 40-character id the body pastes must EXIST. A pasted id is a
//      MEASUREMENT — it is the output of a command — and a measurement that names
//      nothing is not a measurement: it is a fabrication, and no tree can be
//      reconciled with it. This arm exists because a body of this repo's own
//      carried one (opencharly/opencharly#762 — the body the org validator
//      blocked; that PR's body half was fixed in that PR): the pasted
//      `git ls-tree origin/main marketplace` line read
//      `b920b01854379fb4b4d16a0d4a06b7a6a3ff1ba0`, while the tree's own line reads
//      `b920b01854f2981d645cac45920091f0166e20ca` — the first TEN characters are the
//      same and the rest is invented. Every other arm accepted that body, because
//      the id is well-formed, and well-formed is not the same as true.
//      The id is resolved in the stores this tree can SEE: this repo's own object
//      store, the object store of every declared submodule whose checkout is here
//      (a submodule's commits live in ITS store, not in this one), and the pin
//      values the tree records. An id that resolves NOWHERE and that the body
//      attributes to ONE repository the tree can see is a finding; an id the tree
//      cannot attribute — no repository named near it, several named, or one whose
//      checkout is not here — is REPORTED and not judged, because a false finding
//      is worse than no report.
//
//   M. The head's SUBJECT's breaking-change marker and the body's ANSWER agree. The
//      `!` on a subject says the change is part of a HARD CUTOVER (the org rulebook,
//      `/charly-internals:cutover-policy`); the body's `## Change classification` says
//      what breaks for THIS repo's consumers and how to roll it back. Under a `!` the
//      answer is REQUIRED — a body that does not carry it leaves the merged changelog
//      holding the subject and the body side by side, with one of them silent
//      (opencharly/opencharly#802). Measured org-wide: of the 53 bang-marked merged
//      pull requests in the scanned window, 51 carry NO answer at all; the two that
//      do (opencharly/opencharly#801 and opencharly/plugin-box#66) both answer with a
//      REASONED `none`, and not one of the 53 carries a bare `none` — so the bare
//      `none` refusal below is PROPHYLACTIC: it forbids a shape the org has not yet
//      written, because a rule has to hold before the first instance. A bare `none` is
//      not an answer: a cutover that breaks nothing HERE must say WHY it breaks
//      nothing here. The marker is read from the head's subject, which is the sentence
//      the PR title carries: measured over the umbrella's last 24 merged pull
//      requests, the title and the head subject agree on the MARKER in every one —
//      although all 24 differ in wording, the merged subject carrying the pull
//      request's number or the tag-on-merge rewording.
//
// NOT asserted, and why: whether the body's prose about a file is TRUE. A row that says
// the README carries a change the README does not carry is a judgement, and judgement is
// the validator's job — this gate removes only the class that needs none. A COUNT is not
// that class: it is the diff's own arithmetic, so the diff can decide it. A pasted
// OUTPUT LINE is the same class as a count: it is the tree's own text, and the tree can
// decide it. A QUANTITATIVE CLAIM in a record is the same class again: the number is
// the command's own output, and the body can decide whether it shows.
//
// THE HEAD THE BODY IS PUBLISHED WITH. Every arm that reads the tree reads ONE head:
// the head the body is published with, named by `--head`. It defaults to `HEAD`, so
// every other caller — the umbrella's own gate step, a hand-run check — reconciles
// against the checked-out tree, exactly as before. The pre-push hook names the commit
// the push PUBLISHES, because the checked-out tree is NOT the tree a push of another
// branch publishes (opencharly/opencharly#744): `git push origin other` publishes
// `other`'s commit while the checkout still sits on `main`, so a body reconciled
// against `HEAD` was reconciled against a tree the push does not publish.
//
// Usage: node scripts/check-pr-body-diff.mjs [--body <path>] [--repo <dir>] [--base <ref>] [--head <rev>] [--self-test]
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
// The head the body is published with. `HEAD` for every caller that does not name
// one; the pre-push hook names the commit its push publishes.
const headRef = argOf("--head") ?? "HEAD";

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
 * for a tighter local policy or for a self-test that wants a small body. The
 * override is not a second DEFINITION: the number itself lives in the cap file and
 * only there.
 */
const CAP_FILE = join(here, "lib", "pr-body-cap");

/**
 * The cap file's content lines, by the ONE rule the cap file states.
 *
 * The surrounding whitespace is the POSIX space class — spaces, tabs, carriage
 * returns and the rest — and it is spelled out rather than written as `\s`,
 * because `\s` in JavaScript also matches the UNICODE spaces while the reader
 * that must agree with this one strips the POSIX class (`[[:space:]]` in the
 * builder's awk). A rule one reader implements more loosely than the other is a
 * rule the two can disagree on.
 */
function capContentLines(text) {
  return text
    .split("\n")
    .map((l) => l.replace(/^[ \t\n\v\f\r]+/, "").replace(/[ \t\n\v\f\r]+$/, ""))
    .filter((l) => l !== "" && !l.startsWith("#"));
}

/**
 * The EFFECTIVE cap: the environment's override when there is one, else the ONE cap
 * from the FILE. A cap that cannot be read is a hard failure: it is never replaced
 * by a default that is not this number, because a default that is not this number
 * is a SECOND cap, and the two would disagree the first time one of them is
 * changed.
 *
 * `fromFile` reads the FILE's cap and ignores the environment's override. The
 * override is a TIGHTER POLICY, never a second definition of the number, so the cap
 * the file states is the cap the file is read for — the self-test needs that number
 * to size its fixture, and an ambient override in the caller's shell must not decide
 * whether the fixture fits (opencharly/opencharly#720).
 *
 * The rule is the cap file's, stated there and implemented here and in
 * `scripts/sync-pr-body.sh`: exactly ONE content line, and that line is a positive
 * integer and nothing else. A second content line is not a second reading of the
 * cap — it is a cap that cannot be read, and it fails loud here. The earlier
 * reader stripped the comments and whitespace from the WHOLE file and concatenated
 * what was left, so a file with two content lines read as their CONCATENATION
 * while the bash reader read the first of them: the two read different numbers
 * from the same file (opencharly/opencharly#720).
 */
function readCapBytes({ fromFile = false } = {}) {
  const override = (process.env.GITHUB_BODY_MAX ?? "").trim();
  if (!fromFile && override !== "") {
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
  const lines = capContentLines(text);
  if (lines.length !== 1) {
    fail(
      `the body's size cap in ${CAP_FILE} is not exactly one line — the ONE cap is ` +
        `${lines.length} content line(s) (${lines.map((l) => `"${l}"`).join(", ") || "none"}); ` +
        `the rule is one positive integer and nothing else`,
    );
    return null;
  }
  const value = lines[0];
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
 * The diff's line count, as ONE diff algorithm renders it.
 *
 * The algorithm is PINNED on the command line, because a count is a property of the
 * diff only when every reader computes it the same way — and a reader's own
 * `diff.algorithm` setting changes the count whenever the diff carries a MOVED
 * block.
 */
function diffTotals(algorithm, baseRef, headRef) {
  const out = git("diff", "--numstat", `--diff-algorithm=${algorithm}`, `${baseRef}...${headRef}`);
  if (out === null) return null;
  let files = 0;
  let ins = 0;
  let del = 0;
  for (const line of out.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    files += 1;
    if (parts[0] !== "-") ins += Number(parts[0]);
    if (parts[1] !== "-") del += Number(parts[1]);
  }
  return { files, ins, del };
}

/**
 * The diff algorithms the count is compared across. Every one of them is a rendering
 * a reader can hold, so the count that matters is the one they all agree on.
 */
const DIFF_ALGORITHMS = ["myers", "patience", "histogram", "minimal"];

/**
 * The diff's line count must be the SAME under every diff algorithm, so a diffstat
 * stated in a body is true for EVERY reader: the org linter, this gate, GitHub's own
 * rendering, and whoever reads the diff by hand.
 *
 * The count is a fact about the diff only when the diff admits ONE of them. A diff
 * that carries a MOVED block is rendered differently by different algorithms — the
 * Myers family splits the move into three hunks and the histogram family into one —
 * so the same diff counts as 574/26 to one reader and 577/29 to another. A body
 * stating either number is true for one reader and false for the other, and nothing
 * in the tree noticed, because nothing asked the question: this arm is the control
 * that asks it (opencharly/opencharly#721).
 */
function checkDiffCountIsReaderIndependent(baseRef, headRef) {
  const totals = DIFF_ALGORITHMS.map((a) => diffTotals(a, baseRef, headRef));
  if (totals.some((t) => t === null)) {
    notice(
      "the diff could not be read under every diff algorithm — the reader-independence rule is not applied",
    );
    return;
  }
  const rendered = DIFF_ALGORITHMS.map((a, i) => `${a} ${totals[i].ins}/${totals[i].del}`).join(", ");
  const first = totals[0];
  if (totals.some((t) => t.ins !== first.ins || t.del !== first.del)) {
    fail(
      `the diff's line count DEPENDS on the reader's diff algorithm (${rendered}) — a diffstat stated in ` +
        `the body would be true for one reader and false for another; reshape the diff so that every ` +
        `reader computes the same count`,
    );
    return;
  }
  ok(`the diff's line count is the SAME under every diff algorithm (${rendered})`);
}

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
    const type = git("cat-file", "-t", `${headRef}:${path}`);
    if (type !== "blob") {
      cache.set(path, null); // not a file in this tree: a submodule, or absent
      return null;
    }
    const blob = gitRaw("show", `${headRef}:${path}`);
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
 * The ids that are CONVENTIONS rather than claims: git's null id — the "no such
 * object" id — and git's empty tree. A body that pastes either is not claiming a
 * commit, so the arm does not judge it.
 */
const PLACEHOLDER_IDS = new Set([
  "0".repeat(40),
  "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
]);

/**
 * The 40-character ids the body pastes, with the line each is on and that line's
 * text.
 *
 * The match is BOUNDARY-anchored on the hex class, so a 64-character digest (a
 * sha256) is not read as a 40-character id, and an id that is part of a longer hex
 * run is not read either. The id is lower-cased: git's own output is lower case,
 * and the object store holds the same object however the body spells it.
 */
function pastedCommitIds(body) {
  const out = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    for (const m of lines[i].matchAll(/(?<![0-9a-fA-F])([0-9a-fA-F]{40})(?![0-9a-fA-F])/g)) {
      out.push({ sha: m[1].toLowerCase(), line: i + 1, text: lines[i] });
    }
  }
  return out;
}

/**
 * The repositories this tree DECLARES, read from the tree's own `.gitmodules` at the
 * head the body is published with — so the declaration the arm reads is the one the
 * pushed tree carries.
 *
 * Each entry carries the repository's PATH (its directory in this tree), its
 * `owner/name` (parsed from the URL), and whether its CHECKOUT is here: a
 * submodule's own commits live in ITS object store, and that store exists only when
 * the checkout is here.
 */
function declaredRepositories() {
  const raw = gitRaw("show", `${headRef}:.gitmodules`);
  if (raw === null) return [];
  const sections = [];
  let current = null;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t === "" || t.startsWith("#") || t.startsWith(";")) continue;
    const sec = /^\[submodule\s+"(.+)"\]$/.exec(t);
    if (sec) {
      current = { name: sec[1] };
      sections.push(current);
      continue;
    }
    const kv = /^([A-Za-z0-9-]+)\s*=\s*(.*)$/.exec(t);
    if (kv && current) current[kv[1]] = kv[2];
  }
  const out = [];
  for (const s of sections) {
    if (!s.path) continue;
    const m = /[:/]([^/:]+)\/([^/:]+?)(?:\.git)?$/.exec(s.url ?? "");
    const owner = m && /^[A-Za-z0-9_.-]+$/.test(m[1]) ? m[1] : null;
    out.push({
      path: s.path,
      repo: owner ? `${owner}/${m[2]}` : null,
      checkout: existsSync(join(root, s.path, ".git")),
      // The path is matched on word boundaries, so `corpus` is not a mention inside
      // `corpus-absent`, and a path that is a PREFIX of another path does not claim
      // the other one's mentions.
      pathRe: new RegExp(`(?<![\\w-])${s.path.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}(?![\\w-])`),
    });
  }
  return out;
}

/**
 * The declared repositories a text NAMES — by path or by `owner/name`. A body names
 * a repository in the middle of a sentence, so the path is matched on word
 * boundaries and the `owner/name` form as a literal.
 */
function repositoriesNamed(text, repos) {
  const named = new Set();
  for (const r of repos) {
    if (r.pathRe.test(text)) named.add(r);
    else if (r.repo && text.includes(r.repo)) named.add(r);
  }
  return named;
}

/**
 * The COMMAND lines of the fenced block each body line sits in, by line number. The
 * command is what produced the id, so it is where the repository the id belongs to
 * is named: the output line of `git -C corpus rev-parse HEAD` names no repository
 * by itself.
 */
function commandLinesOf(body) {
  const map = new Map();
  for (const block of fencedBlocks(body)) {
    const cmds = block.lines.filter((l) => /^\s*\$\s/.test(l.text)).map((l) => l.text);
    for (const l of block.lines) map.set(l.n, cmds);
  }
  return map;
}

/**
 * The pin values the tree RECORDS — the gitlink ids at the head and at the base. A
 * pin is a measured value: it is what `git ls-tree` reads for that path, and it
 * names a real commit in the pinned repository.
 */
function recordedPinIds() {
  const set = new Set();
  for (const ref of [headRef, baseRef]) {
    const out = gitRaw("ls-tree", "-r", ref);
    if (out === null) continue;
    for (const line of out.split("\n")) {
      const m = /^160000 commit ([0-9a-f]{40})\t/.exec(line);
      if (m) set.add(m[1]);
    }
  }
  return set;
}

/**
 * Which of `shas` exist as objects in the store at `dir` — and whether the store
 * ANSWERED. ONE `git cat-file --batch-check` answers for the whole set, so a tree
 * with many materialized submodules costs one call per store rather than one call
 * per id.
 *
 * A store that could not answer at all — a stale gitdir, a directory that is not a
 * repository, git itself failing — answers NOTHING, and that is not the same answer
 * as "the id is absent". The arm may refuse an id on its ABSENCE; it may not refuse
 * one on a store's failure, so the two answers are kept apart here.
 */
function objectsInStore(dir, shas) {
  const found = new Set();
  if (shas.length === 0) return { found, answered: true };
  const r = spawnSync("git", ["-C", dir, "cat-file", "--batch-check"], {
    encoding: "utf8",
    input: `${shas.join("\n")}\n`,
  });
  if (r.status !== 0) return { found, answered: false };
  for (const line of (r.stdout ?? "").split("\n")) {
    const m = /^([0-9a-f]{40})\s+(\S+)/.exec(line);
    if (!m || m[2] === "missing") continue;
    found.add(m[1]);
  }
  return { found, answered: true };
}

/**
 * I. Every 40-character id the body pastes must exist in a store this tree can see.
 *
 * The arm refuses an id only when the tree can DECIDE: the id resolves nowhere the
 * tree can look, AND the body attributes it to one repository the tree CAN look in.
 * An id the tree cannot attribute is reported instead — a false finding is worse
 * than no report.
 */
function checkCommitIds(body) {
  const ids = pastedCommitIds(body).filter((i) => !PLACEHOLDER_IDS.has(i.sha));
  if (ids.length === 0) {
    notice("the body pastes no 40-character commit id — the commit-id rule is inapplicable");
    return;
  }
  const repos = declaredRepositories();
  const pins = recordedPinIds();
  const cmds = commandLinesOf(body);
  const wanted = [...new Set(ids.map((i) => i.sha))];
  const resolved = new Set();
  for (const s of wanted) if (pins.has(s)) resolved.add(s);
  for (const s of objectsInStore(root, wanted).found) resolved.add(s);
  // A submodule's commits live in ITS store, so the tree looks in every declared
  // repository whose checkout is here. The scan runs only for the ids that are still
  // unresolved, so a body whose every id resolves costs ONE call per store. A store
  // that could not ANSWER is recorded: the tree did not look there, so it did not
  // decide, and an id it did not answer for may not be refused.
  let pending = wanted.filter((s) => !resolved.has(s));
  const unanswered = new Set();
  for (const r of repos) {
    if (pending.length === 0) break;
    if (!r.checkout) continue;
    const res = objectsInStore(join(root, r.path), pending);
    if (!res.answered) unanswered.add(r.path);
    for (const s of res.found) resolved.add(s);
    pending = pending.filter((s) => !resolved.has(s));
  }
  let judged = 0;
  let reported = 0;
  let bad = 0;
  for (const id of ids) {
    if (resolved.has(id.sha)) {
      judged += 1;
      continue;
    }
    // The repository the id belongs to: the line the id is on, and — when that line
    // names none — the command that produced it.
    const own = repositoriesNamed(id.text, repos);
    const named = own.size > 0 ? own : repositoriesNamed((cmds.get(id.line) ?? []).join("\n"), repos);
    const list = [...named];
    if (list.length === 1 && list[0].checkout) {
      // The store that must hold the id could not ANSWER: the tree did not look
      // there, so it did not decide. A store's failure is not an id's absence, and
      // a false finding is worse than no report.
      if (unanswered.has(list[0].path)) {
        reported += 1;
        notice(
          `the body pastes the commit id ${id.sha} (line ${id.line}) as the id of \`${list[0].path}\`, whose object ` +
            `store could not answer — the gate cannot say the id is absent, so it is reported, not judged`,
        );
        continue;
      }
      bad += 1;
      fail(
        `the body pastes the commit id ${id.sha} (line ${id.line}) as the id of \`${list[0].path}\`, and that ` +
          `id is in no object store this tree can see — a pasted id must be a MEASURED 40-character id, ` +
          `never a completed prefix`,
      );
      continue;
    }
    reported += 1;
    if (list.length === 0) {
      notice(
        `the body pastes the commit id ${id.sha} (line ${id.line}) and names no repository near it — the gate ` +
          `cannot say whose object store must hold it, so it is reported, not judged`,
      );
    } else if (list.length > 1) {
      notice(
        `the body pastes the commit id ${id.sha} (line ${id.line}) and names ${list.length} repositories near it ` +
          `(${list.map((r) => r.path).join(", ")}) — the gate cannot say whose object store must hold it, so it is ` +
          `reported, not judged`,
      );
    } else {
      notice(
        `the body pastes the commit id ${id.sha} (line ${id.line}) as the id of \`${list[0].path}\`, whose checkout ` +
          `is not here — the gate cannot look in that store, so it is reported, not judged`,
      );
    }
  }
  if (bad === 0 && reported === 0) {
    ok(`every 40-character id the body pastes resolves in a store this tree can see (${ids.length} id(s))`);
    return;
  }
  notice(
    `${judged} of ${ids.length} pasted id(s) resolve in a store this tree can see, ${reported} could not be ` +
      `judged, ${bad} refused`,
  );
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
function recordAdditions(baseRef, statuses, headRef) {
  const out = [];
  for (const [, file] of statuses) {
    if (!file.startsWith("CHANGELOG/")) continue;
    const diff = gitRaw("diff", `${baseRef}...${headRef}`, "--", file);
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
function checkRecordClaims(body, baseRef, statuses, headRef) {
  const records = recordAdditions(baseRef, statuses, headRef);
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
 * linter owns the presence of the four sections it requires, and this gate
 * implements no rule the linter already owns. The list below is THIS gate's own, and
 * it carries five: the org linter's four, plus `Filed issues`, which the umbrella's
 * reconciler additionally requires. The two lists are different lists, so the
 * comment says which is which.
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

/**
 * The body's `## Change classification` section, as prose lines.
 *
 * The section is the body's own answer about the change's class. The arm below
 * reads ONE fact out of it: whether the body says what breaks for this repo's
 * consumers and how to roll it back. Fenced lines are dropped by `proseLines`, so a
 * heading quoted inside a fence is not a section.
 */
function changeClassification(body) {
  const lines = proseLines(body);
  const start = lines.findIndex((l) => /^##\s+change classification\s*$/i.test(l.text));
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i].text)) break;
    out.push(lines[i]);
  }
  return out;
}

/**
 * The body's breaking-change ANSWER: the line under `## Change classification` that
 * OPENS with the key, so a prose mention of the words is not read as an answer.
 *
 * The key is the org's own — `**Breaking change + rollback:**` — the form the corpus's
 * refresh bot writes and the form the org rulebook names. The value is what follows
 * the first colon after the key.
 */
function breakingChangeAnswer(body) {
  const section = changeClassification(body);
  if (section === null) return null;
  for (const l of section) {
    const m = /^\s*(?:[-*+]\s+)?\**\s*breaking change\b/i.exec(l.text);
    if (!m) continue;
    const after = l.text.slice(m.index + m[0].length);
    const colon = after.indexOf(":");
    const value = (colon === -1 ? after : after.slice(colon + 1)).trim();
    return { line: l.n, value, text: l.text };
  }
  return null;
}

/**
 * The head's SUBJECT carries the breaking-change marker.
 *
 * Only the Conventional Commits HEADER is read — the part before the first colon —
 * because a subject's PROSE may carry a colon and a bang of its own: `docs: correct
 * the 2026.299.0822 entry's false clause about the FAIL: marker` is a documentation
 * fix, not a cutover. The marker sits at the END of the header, where Conventional
 * Commits puts it: `feat(scope)!: …`.
 */
function subjectCarriesMarker(subject) {
  const header = subject.split(":")[0];
  return /!\s*$/.test(header);
}

/**
 * Is the answer a "none", and does it say WHY?
 *
 * "none" alone is not an answer under a marker: the merged changelog carries the
 * subject and the body side by side, and a bare "none" next to a `!` is exactly the
 * sentence a reader cannot resolve. "none — this change only carries another repo's
 * cutover" is an answer, because it names the reason. Returns "bare", "reasoned", or
 * null when the answer is not a "none" at all.
 */
function noneAnswer(plain) {
  const m = /^(none|no|nothing)\b/i.exec(plain);
  if (!m) return null;
  const rest = plain.slice(m[0].length).replace(/^[\s.,:;—–-]+/, "").trim();
  return rest === "" ? "bare" : "reasoned";
}

/**
 * M. The head's subject's breaking-change marker and the body's ANSWER agree.
 *
 * The subject's `!` says this change is part of a HARD CUTOVER (the org rulebook,
 * `/charly-internals:cutover-policy`); the body's `## Change classification` says
 * what breaks for THIS repo's consumers and how to roll it back. Those are two
 * questions, and the second one has no answer in a body that does not carry it — so
 * a `!`-marked subject with no answer leaves the merged changelog holding two signals
 * and one of them silent (opencharly/opencharly#802).
 */
function checkMarkerRelation(body, headRef) {
  const subject = git("log", "-1", "--format=%s", headRef);
  if (!subject) {
    notice("the head's subject could not be read — the marker rule is inapplicable");
    return;
  }
  const marked = subjectCarriesMarker(subject);
  const answer = breakingChangeAnswer(body);
  if (!marked) {
    ok(
      answer === null
        ? "the head's subject carries no breaking-change marker and the body declares no breaking change"
        : `the head's subject carries no breaking-change marker; the body's own answer (line ${answer.line}) stands on its own`,
    );
    return;
  }
  if (answer === null) {
    fail(
      `the head's subject carries the breaking-change marker (\`${subject}\`) and the body's ` +
        `\`## Change classification\` carries NO breaking-change answer — the marker says this change is part ` +
        `of a hard cutover, so the body must say what breaks for this repo's consumers and how to roll it back`,
    );
    return;
  }
  const plain = answer.value.replace(/[*_`]/g, "").trim();
  if (noneAnswer(plain) === "bare") {
    fail(
      `the head's subject carries the breaking-change marker (\`${subject}\`) and the body's answer is a bare ` +
        `\`none\` (line ${answer.line}) — a cutover that breaks nothing HERE must say WHY it breaks nothing here ` +
        `(for example: this change only carries another repo's cutover)`,
    );
    return;
  }
  ok(`the head's subject carries the breaking-change marker and the body answers it (line ${answer.line})`);
}

function check() {
  if (!existsSync(bodyPath)) {
    notice(`no body at ${bodyPath} — nothing to reconcile`);
    return;
  }
  const raw = readFileSync(bodyPath);
  const body = raw.toString("utf8");
  const head = git("rev-parse", headRef);
  if (!head) {
    notice(
      `the head ${headRef} could not be read in ${root} — the diff cannot be read, so nothing is reconciled`,
    );
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

  // ── M. the subject's breaking-change marker and the body's answer ───────────────
  // It reads the section the S arm just proved is prose, and the head's SUBJECT — the
  // sentence that becomes the changelog's permanent heading.
  checkMarkerRelation(body, headRef);

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

  // ── I. the commit ids the body pastes ────────────────────────────────────────────
  // It runs on its own, before the base-ref check: a pasted id is a measurement, and
  // the tree can say whether the thing it measures exists.
  checkCommitIds(body);

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
  const changed = (git("diff", "--name-only", `${baseRef}...${headRef}`) ?? "").split("\n").filter(Boolean);
  const statuses = (git("diff", "--name-status", `${baseRef}...${headRef}`) ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      return [parts[0], parts.slice(1).join("\t")];
    });

  // DI. the diff's line count, under every diff algorithm. It runs before the table
  // arm and independently of it: the count is a property of the DIFF, so it is judged
  // whether or not the body carries a table — and a body that states a diffstat
  // needs that count to be ONE number, not one number per reader.
  checkDiffCountIsReaderIndependent(baseRef, headRef);

  // N. the count the prose states about the diff's new files. It does not need the
  // file table, so it runs whether or not the body carries one.
  checkCounts(body, table, statuses);

  // C. the record's claims, against the body that publishes the correction. It runs
  // before the table arm and independently of it: a body that carries no table still
  // has to show what a rewritten record claims.
  checkRecordClaims(body, baseRef, statuses, headRef);

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
    // A DECLARED SUBMODULE with its OWN object store, so the commit-id arm can be
    // proven live in both directions: an id that lives in that store is accepted, and
    // an invented one is refused. The nested repo is a real git repo with two
    // commits; the superproject records its tip as a gitlink and declares it in
    // `.gitmodules`, so the DECLARATION the arm reads is the one the pushed tree
    // carries. The first commit is the id the green case uses: it is in the
    // submodule's store and it is NOT the pin the tree records, so the store — and
    // not the pin — is what resolves it.
    const corpus = join(repo, "corpus");
    mkdirSync(corpus, { recursive: true });
    const cg = (...a) => spawnSync("git", a, { cwd: corpus, encoding: "utf8" });
    cg("init", "-q", "-b", "main");
    cg("config", "user.email", "gate@gate");
    cg("config", "user.name", "gate");
    writeFileSync(join(corpus, "corpus.md"), "the corpus\n");
    cg("add", "-A");
    cg("commit", "-q", "-m", "corpus one");
    const corpusOld = cg("rev-parse", "HEAD").stdout.trim();
    writeFileSync(join(corpus, "corpus.md"), "the corpus, again\n");
    cg("add", "-A");
    cg("commit", "-q", "-m", "corpus two");
    const corpusHead = cg("rev-parse", "HEAD").stdout.trim();
    // A SECOND declared repository with NO checkout here, so the arm's "cannot judge"
    // path is proven too: the tree cannot look in that store, so it must not refuse.
    // A THIRD, with a checkout whose object store cannot ANSWER: the tree CAN look
    // there, and the look fails. That is a different thing from "the id is absent",
    // and the arm must not refuse on it.
    writeFileSync(
      join(repo, ".gitmodules"),
      [
        '[submodule "corpus"]',
        "\tpath = corpus",
        "\turl = https://github.com/opencharly/corpus.git",
        '[submodule "corpus-absent"]',
        "\tpath = corpus-absent",
        "\turl = https://github.com/opencharly/corpus-absent.git",
        '[submodule "corpus-broken"]',
        "\tpath = corpus-broken",
        "\turl = https://github.com/opencharly/corpus-broken.git",
        "",
      ].join("\n"),
    );
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

    // A SECOND branch, on a DIFFERENT tree, so the head the body is published with
    // is a choice the fixture can make. `git push origin other` publishes `other`'s
    // commit while the checkout still sits on `feat` — so a gate that reads `HEAD`
    // reconciles the body against a tree the push does not publish. The branch
    // changes a DIFFERENT file (`b.txt`) and adds another (`d.txt`), and rewrites no
    // record, so a body that describes it is a body about another tree in every arm
    // that reads the tree.
    g("checkout", "-q", "-b", "other", "main");
    writeFileSync(join(repo, "b.txt"), "b2\n");
    writeFileSync(join(repo, "d.txt"), "d\n");
    g("add", "-A");
    writeFileSync(join(scratch, "msg.txt"), "other\n");
    g("commit", "-q", "-F", join(scratch, "msg.txt"));
    const otherHead = g("rev-parse", "HEAD").stdout.trim();
    // A branch whose SUBJECT carries the breaking-change marker, with a tree that is
    // IDENTICAL to the `feat` branch's — so every arm that reads the diff is green
    // and the marker arm is the ONLY thing that differs between the two branches.
    g("checkout", "-q", "-b", "bang", "main");
    writeFileSync(join(repo, "a.txt"), "a2\n");
    writeFileSync(join(repo, "c.txt"), "c\n");
    writeFileSync(join(repo, "scripts/two.sh"), "#!/bin/sh\n");
    mkdirSync(join(repo, "CHANGELOG"), { recursive: true });
    writeFileSync(
      join(repo, "CHANGELOG/2026.001.0001.md"),
      "## Summary\n\nThe gate script `scripts/one.sh` grew by 2 lines.\n",
    );
    g("add", "-A");
    writeFileSync(join(scratch, "msg.txt"), "feat!: the fixture's breaking change\n");
    g("commit", "-q", "-F", join(scratch, "msg.txt"));
    const bangHead = g("rev-parse", "HEAD").stdout.trim();
    g("checkout", "-q", "feat");
    // The checkout of the THIRD declared repository, made AFTER the commits, so git
    // never sees it: its `.git` file points at a gitdir that is not there, so the
    // store is there and cannot answer. The arm asks it, gets nothing, and must
    // report the id rather than refuse it.
    mkdirSync(join(repo, "corpus-broken"), { recursive: true });
    writeFileSync(join(repo, "corpus-broken", ".git"), "gitdir: ../.git/modules/corpus-broken\n");
    // The file table the OTHER branch's diff actually has, and the evidence lines
    // that resolve in BOTH branches — the two files they share, so the evidence arm
    // is not the discriminator and the TABLE is.
    const OTHER_TABLE = "| `b.txt` | a change |\n| `d.txt` | a change |";
    const OTHER_EVIDENCE = "scripts/blank.sh:2:#!/bin/sh\nscripts/one.sh:1:#!/bin/sh";
    // The template's table carries the fixture's RECORD row, because the record arm
    // needs a body that publishes it. The other branch rewrites no record, so that
    // row is a phantom there — it is removed rather than forked per arm.
    const withoutRecordRow = (t) =>
      t.replace(/^\| `CHANGELOG\/2026\.001\.0001\.md` \| a record \|\n/m, "");

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
    // The MOVED-BLOCK fixture, used by the reader-independence arm's own case below.
    // The base file holds one function; the head file splits it in two and leaves the
    // first half calling the second. That is the shape that makes two diff
    // algorithms count the SAME diff differently: the Myers family aligns the move
    // as three hunks and the histogram family as one, so the counts differ while
    // the diff is the same. Measured on this git: myers 27/10, histogram 30/13.
    const DIVERGE_BASE = `function readCapBytes() {
  const override = (process.env.GITHUB_BODY_MAX ?? "").trim();
  if (override !== "") {
    if (!/^\\d+$/.test(override) || Number(override) <= 0) {
      fail(\`GITHUB_BODY_MAX is not a positive integer (\${override})\`);
      return null;
    }
    return Number(override);
  }
  let text;
  try {
    text = readFileSync(CAP_FILE, "utf8");
  } catch {
    fail(\`the cap is missing\`);
    return null;
  }
  const value = text.replace(/#.*$/gm, "").replace(/\\s+/g, "");
  if (!/^\\d+$/.test(value) || Number(value) <= 0) {
    fail(\`the cap is not a positive integer (\${value})\`);
    return null;
  }
  return Number(value);
}
`;
    const DIVERGE_HEAD = `function capContentLines(text) {
  return text
    .split("\\n")
    .map((l) => l.replace(/^[ \\t\\n\\v\\f\\r]+/, "").replace(/[ \\t\\n\\v\\f\\r]+$/, ""))
    .filter((l) => l !== "" && !l.startsWith("#"));
}
function readCapFileBytes() {
  let text;
  try {
    text = readFileSync(CAP_FILE, "utf8");
  } catch {
    fail(\`the cap is missing\`);
    return null;
  }
  const lines = capContentLines(text);
  if (lines.length !== 1) {
    fail(\`the cap is not exactly one line\`);
    return null;
  }
  const value = lines[0];
  if (!/^\\d+$/.test(value) || Number(value) <= 0) {
    fail(\`the cap is not a positive integer (\${value})\`);
    return null;
  }
  return Number(value);
}
function readCapBytes() {
  const override = (process.env.GITHUB_BODY_MAX ?? "").trim();
  if (override !== "") {
    if (!/^\\d+$/.test(override) || Number(override) <= 0) {
      fail(\`GITHUB_BODY_MAX is not a positive integer (\${override})\`);
      return null;
    }
    return Number(override);
  }
  return readCapFileBytes();
}
`;
    // The cap the size arm reads, and the padding that puts a body at an EXACT byte
    // size. The padding is a run of a word with no digit and no slash, so it cannot be
    // read as a count claim, a path or an evidence line — the size arm is the only
    // thing the padded bodies are for.
    //
    // The cap is the ONE cap FROM THE FILE, never the ambient override. The
    // builder's own self-test pins it for exactly this reason — an ambient
    // GITHUB_BODY_MAX in the caller's shell must not decide whether the fixture
    // fits — and the two self-tests must agree on that (R2). Here the ambient
    // override used to size the fixture, so a tight override made this self-test die
    // on a fixture-size error that named neither the override nor the cap
    // (opencharly/opencharly#720).
    const capBytes = readCapBytes({ fromFile: true });
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
    const runGate = (extra = []) => {
      const r = spawnSync(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          "--body",
          bodyFile,
          "--repo",
          repo,
          "--base",
          "main",
          ...extra,
        ],
        // The cap travels with the child, so the size arm judges the SAME number in
        // the fixture as in the self-test, whatever the ambient environment carries.
        { encoding: "utf8", env: { ...process.env, GITHUB_BODY_MAX: String(capBytes) } },
      );
      return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    };
    const arms = [
      // M. A subject that carries the breaking-change marker, and a body that does
      // not answer it. The body is the GREEN body of every other arm — only the
      // branch (and so the head's subject) and the Change classification differ.
      [
        "a bang-marked subject whose body carries no breaking-change answer",
        body(FULL_TABLE, bangHead, "Test fixture, not a real change."),
        "carries NO breaking-change answer",
        ["--head", "bang"],
      ],
      // M. The marker is present and the body answers — with a bare `none`. No org
      // pull request produces that shape today (0 of the 53 measured), so the arm
      // forbids a form the org has not yet written: a marker beside a sentence that
      // leaves the reader without a reason.
      [
        "a bang-marked subject whose body answers with a bare none",
        body(FULL_TABLE, bangHead, "**Breaking change + rollback:** none"),
        "a bare `none`",
        ["--head", "bang"],
      ],
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
      // The head the body is PUBLISHED WITH. This body describes the OTHER branch's
      // diff, and the head the gate reads is the CHECKOUT's — so the table lists two
      // files the published diff does not change, and the two files it does change
      // are missing from the table.
      [
        "a body that describes another branch's diff is red when the head is the checkout's",
        body(
          OTHER_TABLE,
          otherHead,
          "",
          OTHER_EVIDENCE,
          "",
          BACKTICK_FENCE,
          withoutRecordRow,
        ),
        "does not change it",
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
      // I. The commit ids the body pastes. The id is the one the defect carried
      // (opencharly/opencharly#762): its first TEN characters are the tree's own, and
      // the rest is invented — so the id is well-formed and FALSE, and every other
      // arm accepts it.
      [
        "the body pastes a commit id that exists in no store",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "", BACKTICK_FENCE, (t) =>
          t.replace(
            "\n## Rulebook compliance",
            "\n```\n$ git -C corpus rev-parse HEAD\nb920b01854379fb4b4d16a0d4a06b7a6a3ff1ba0\n```\n\n## Rulebook compliance",
          ),
        ),
        "is in no object store this tree can see",
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
      // M. The marker is present, the body answers, and the answer carries the
      // REASON it breaks nothing here — the shape a pointer advance that carries
      // another repo's cutover must take.
      [
        "a bang-marked subject whose body answers with none AND the reason",
        body(
          FULL_TABLE,
          bangHead,
          "**Breaking change + rollback:** none — the fixture only carries another repo's cutover.",
        ),
        ["--head", "bang"],
      ],
      // The same shape as the red case, with the id the SUBMODULE's own store holds:
      // the arm resolves it there, so the body stays green. This is the half that
      // proves the arm reads a submodule's store and not only this repo's — the id
      // is the submodule's FIRST commit, so it is in that store and it is NOT the
      // pin the tree records, and the pin cannot be what resolved it.
      [
        "a commit id that lives in a submodule's own store is accepted",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "", BACKTICK_FENCE, (t) =>
          t.replace(
            "\n## Rulebook compliance",
            `\n\`\`\`\n$ git -C corpus rev-parse HEAD~1\n${corpusOld}\n\`\`\`\n\n## Rulebook compliance`,
          ),
        ),
      ],
      // A repository with NO checkout here: the gate cannot look in that store, so it
      // must NOT refuse the id — it reports it. A false finding is worse than no
      // report, and this is the case that keeps the arm from blocking a body whose id
      // is real and lives in a tree this clone does not carry.
      [
        "a commit id attributed to a repository with no checkout is reported, not judged",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "", BACKTICK_FENCE, (t) =>
          t.replace(
            "\n## Rulebook compliance",
            "\n```\n$ git -C corpus-absent rev-parse HEAD\nb920b01854379fb4b4d16a0d4a06b7a6a3ff1ba0\n```\n\n## Rulebook compliance",
          ),
        ),
      ],
      // A repository whose checkout IS here, and whose object store cannot ANSWER:
      // the tree looked there and the look failed, so the tree did not decide. The arm
      // reports the id — it may refuse an id on its absence, never on a store's
      // failure, or it would block a body over a broken checkout.
      [
        "a commit id attributed to a repository whose object store cannot answer is reported, not judged",
        body(FULL_TABLE, head, "", DEFAULT_EVIDENCE, "", BACKTICK_FENCE, (t) =>
          t.replace(
            "\n## Rulebook compliance",
            "\n```\n$ git -C corpus-broken rev-parse HEAD\nb920b01854379fb4b4d16a0d4a06b7a6a3ff1ba0\n```\n\n## Rulebook compliance",
          ),
        ),
      ],
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
      // The head the body is published with, NAMED. This body describes the OTHER
      // branch's diff, and the head the gate reads IS that branch — so every arm
      // that reads the tree is green. This is the case that is RED without the
      // `--head` option: the gate would read the CHECKOUT's tree, find two files
      // the published diff does not change, and BLOCK a body that describes the
      // push exactly (opencharly/opencharly#744).
      [
        "a body that describes another branch's diff is green when the head names that branch",
        body(
          OTHER_TABLE,
          otherHead,
          "",
          OTHER_EVIDENCE,
          "",
          BACKTICK_FENCE,
          withoutRecordRow,
        ),
        ["--head", "other"],
      ],
    ];
    for (const [name, text, expect, extra = []] of arms) {
      stLive += 1;
      writeFileSync(bodyFile, text, "utf8");
      const r = runGate(extra);
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
    for (const [name, text, extra = []] of greenArms) {
      stLive += 1;
      writeFileSync(bodyFile, text, "utf8");
      const r = runGate(extra);
      if (r.code !== 0) {
        stFails += 1;
        console.error(`  FAIL  case '${name}' went RED but must stay GREEN:\n${r.out}`);
      } else {
        console.log(`  PASS  case '${name}' stays green`);
      }
    }
    // ── The reader-independence arm, proven live on a diff that DIVERGES ───────────
    // A SECOND fixture repo, whose diff carries a moved block. The ground truth is
    // computed HERE, by git itself, so the case cannot pass by asserting what it
    // wants to see: if the two algorithms count this diff differently, the gate must
    // report it, and if they do not, the case FAILS — a gate whose arm cannot be
    // proven live is not a gate.
    const diverge = join(scratch, "diverge");
    const dg = (...a) => spawnSync("git", a, { cwd: diverge, encoding: "utf8" });
    mkdirSync(diverge, { recursive: true });
    dg("init", "-q", "-b", "main");
    dg("config", "user.email", "gate@gate");
    dg("config", "user.name", "gate");
    writeFileSync(join(diverge, "a.txt"), DIVERGE_BASE);
    writeFileSync(join(diverge, "b.txt"), "b\n");
    mkdirSync(join(diverge, "scripts"), { recursive: true });
    writeFileSync(join(diverge, "scripts/one.sh"), "#!/bin/sh\n");
    writeFileSync(join(diverge, "scripts/blank.sh"), "\n#!/bin/sh\n");
    dg("add", "-A");
    dg("commit", "-q", "-m", "base");
    dg("checkout", "-q", "-b", "feat");
    writeFileSync(join(diverge, "a.txt"), DIVERGE_HEAD);
    writeFileSync(join(diverge, "c.txt"), "c\n");
    writeFileSync(join(diverge, "scripts/two.sh"), "#!/bin/sh\n");
    mkdirSync(join(diverge, "CHANGELOG"), { recursive: true });
    writeFileSync(
      join(diverge, "CHANGELOG/2026.001.0001.md"),
      "## Summary\n\nThe gate script `scripts/one.sh` grew by 2 lines.\n",
    );
    dg("add", "-A");
    dg("commit", "-q", "-m", "feat");
    const divergeHead = dg("rev-parse", "HEAD").stdout.trim();
    const divergeTotals = (algorithm) => {
      const r = spawnSync(
        "git",
        ["-C", diverge, "diff", "--numstat", `--diff-algorithm=${algorithm}`, "main...HEAD"],
        { encoding: "utf8" },
      );
      let ins = 0;
      let del = 0;
      for (const line of (r.stdout ?? "").split("\n")) {
        if (!line) continue;
        const parts = line.split("\t");
        if (parts[0] !== "-") ins += Number(parts[0]);
        if (parts[1] !== "-") del += Number(parts[1]);
      }
      return `${ins}/${del}`;
    };
    const truthMyers = divergeTotals("myers");
    const truthHistogram = divergeTotals("histogram");
    stLive += 1;
    if (truthMyers === truthHistogram) {
      stFails += 1;
      console.error(
        `  FAIL  the moved-block fixture no longer diverges on this git (myers ${truthMyers}, histogram ` +
          `${truthHistogram}) — the reader-independence arm cannot be proven live here, and a gate whose arm ` +
          `cannot be proven live is not a gate`,
      );
    } else {
      writeFileSync(bodyFile, body(FULL_TABLE, divergeHead), "utf8");
      const r = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url), "--body", bodyFile, "--repo", diverge, "--base", "main"],
        { encoding: "utf8", env: { ...process.env, GITHUB_BODY_MAX: String(capBytes) } },
      );
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0 || !out.includes("DEPENDS on the reader's diff algorithm")) {
        stFails += 1;
        console.error(`  FAIL  a diff two algorithms count differently did NOT turn the arm RED:\n${out}`);
      } else {
        console.log(
          `  PASS  a diff two algorithms count differently turns the reader-independence arm RED ` +
            `(myers ${truthMyers}, histogram ${truthHistogram})`,
        );
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
