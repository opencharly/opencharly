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
//
// NOT asserted, and why: whether the body's prose about a file is TRUE. A row that says
// the README carries a change the README does not carry is a judgement, and judgement is
// the validator's job — this gate removes only the class that needs none. A COUNT is not
// that class: it is the diff's own arithmetic, so the diff can decide it.
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
    g("add", "-A");
    writeFileSync(join(scratch, "msg.txt"), "base\n");
    g("commit", "-q", "-F", join(scratch, "msg.txt"));
    g("checkout", "-q", "-b", "feat");
    writeFileSync(join(repo, "a.txt"), "a2\n");
    writeFileSync(join(repo, "c.txt"), "c\n");
    writeFileSync(join(repo, "scripts/two.sh"), "#!/bin/sh\n");
    g("add", "-A");
    g("commit", "-q", "-F", join(scratch, "msg.txt"));
    const head = g("rev-parse", "HEAD").stdout.trim();

    const body = (tableRows, pastedSha, claim = "") => `## Summary

A fixture body.

| file | what it carries |
|---|---|
${tableRows}

## How tested

\`\`\`
$ git rev-parse HEAD
${pastedSha}
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
