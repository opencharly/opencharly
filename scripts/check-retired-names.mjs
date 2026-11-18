#!/usr/bin/env node
// check-retired-names.mjs — D-CODE-2: a replaced mechanism is DELETED in the change that
// replaces it; no compatibility shim survives as a permanent resident of the tree.
//
// THE RULE IS DESIGN.md'S OWN. D-CODE-2 (DESIGN.md:2647): a replaced mechanism is deleted in
// the change that replaces it — "no compatibility file remains", enforced by a gate and not
// by prose. TODO 14.2's remedy names the shape: a retired-name scan with a COMMITTED key set.
//
// WHY A CENSUS, NOT A 142-ROW ALLOWLIST. The rule is violated today: the committed
// `design/retired-names.tsv` records 12 real code sites in 5 files (charly 2, sdk 10, spec 0)
// at the pins named below — so a hard gate would land red on day one and be waived wholesale.
// The census freezes exactly those sites, per FILE and with an EXACT count, and fails THREE ways:
//   1. a file carrying a retired name with no baseline row (a NEW shim, including a new file);
//   2. a file carrying MORE sites than its row (the shim grew);
//   3. a baseline row whose site is GONE (the row must be lowered — the census reaches zero).
// Direction 3 is what makes a wrong-tree or stale baseline FAIL LOUDLY instead of silently
// mis-freezing debt.
//
// SCOPE: `*_test.go` is out of scope (a test does not ship), and a comment-only line is out
// of scope (it is prose about the code, which is 14.3's subject, not a mechanism). The gate
// reads each repo's PINNED HEAD and names the revision it judged; a missing checkout is a
// VISIBLE skip, never a silent pass.
//
// Usage: node scripts/check-retired-names.mjs [--root <dir>] [--self-test] [--emit-baseline]

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const ROOT = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const REPOS = ["charly", "sdk", "spec"];
const BASELINE = "design/retired-names.tsv";
const RETIRED = /\b(compat|legacy)/; // a LEADING boundary only: `compatLayer` is a shim, `incompatible` is English
const TEST_FILE = /(?:_test\.go)$/;

let failed = 0;
const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  failed += 1;
};
const ok = (m) => console.log(`  PASS  ${m}`);

function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** loadBaseline(root) — Map "repo:path" -> exact count, from the committed census. */
function loadBaseline(root) {
  const p = join(root, BASELINE);
  const out = new Map();
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const [repo, file, count] = line.split("\t");
    if (repo === "repo") continue; // the header row
    const n = Number(count);
    if (!repo || !file || !Number.isInteger(n) || n < 1) continue;
    out.set(`${repo}:${file}`, n);
  }
  return out;
}

/**
 * scan(root, rev) — the census. Returns { skipped, actual: Map "repo:path" -> count,
 * revisions: Map repo -> commit, comments }.
 */
function scan(root, rev) {
  const out = { skipped: [], actual: new Map(), revisions: new Map(), comments: 0 };
  for (const repo of REPOS) {
    const dir = join(root, repo);
    // A submodule checkout's toplevel IS the repo dir; an EMPTY directory inside the umbrella
    // makes git discover the UMBRELLA, whose HEAD is not this repo's. Judge only a dir that is
    // its own repository — a light worktree is a visible skip, never a false judge.
    const top = git(dir, ["rev-parse", "--show-toplevel"]);
    const head = top === null ? null : git(dir, ["rev-parse", "--verify", `${rev}^{commit}`]);
    if (head === null || resolve(top.trim()) !== resolve(dir)) {
      out.skipped.push({ repo, reason: `${dir} is not its own ${rev} checkout — no checkout to judge` });
      continue;
    }
    out.revisions.set(repo, head.trim());
    const raw = git(dir, ["grep", "-n", "-E", "\\b(compat|legacy)", rev, "--", "*.go", ":!*_test.go"]);
    if (raw === null) continue;
    for (const line of raw.split("\n")) {
      if (line === "") continue;
      const first = line.indexOf(":");
      const second = line.indexOf(":", first + 1);
      const third = line.indexOf(":", second + 1);
      if (first === -1 || second === -1 || third === -1) continue;
      const path = line.slice(first + 1, second);
      const content = line.slice(third + 1).trim();
      if (content.startsWith("//") || content.startsWith("*")) {
        out.comments += 1;
        continue;
      }
      if (!RETIRED.test(content) || TEST_FILE.test(path)) continue;
      const key = `${repo}:${path}`;
      out.actual.set(key, (out.actual.get(key) ?? 0) + 1);
    }
  }
  return out;
}

function judge(title, result, baseline) {
  const lines = [];
  const emit = (s) => {
    console.log(s);
    lines.push(s);
  };
  emit(`\n${title}`);
  for (const { repo, reason } of result.skipped) emit(`  SKIP  ${repo}: ${reason}`);
  for (const [repo, rev] of result.revisions) emit(`  read  ${repo}@${rev.slice(0, 12)}`);

  // direction 1 and 2: a site the census does not record, or more of them than it records
  for (const [key, count] of [...result.actual].sort()) {
    const want = baseline.get(key);
    if (want === undefined) {
      fail(`${key}: ${count} retired-name site(s) (compat/legacy) NOT in the census — a replaced mechanism must be DELETED in the change that replaces it (D-CODE-2)`);
    } else if (count !== want) {
      fail(`${key}: ${count} retired-name site(s), the census records ${want} — lower the census when you remove one, never raise it by adding a shim`);
    } else {
      ok(`${key}: ${count} site(s), as the census records`);
    }
  }
  // direction 3: a census row whose site is gone — the ratchet only turns one way, and a
  // baseline generated against the wrong tree fails HERE, loudly, on its first run.
  for (const [key, want] of [...baseline].sort()) {
    const repo = key.slice(0, key.indexOf(":"));
    if (!result.revisions.has(repo)) continue; // the repo was SKIPPED: unjudged, not stale
    if (!result.actual.has(key)) {
      fail(`${key}: the census records ${want} site(s) and the tree carries NONE — lower the census to zero and delete the row (D-CODE-2)`);
    }
  }
  emit(`  info  ${result.comments} comment-only line(s) out of scope (14.3's subject); test files out of scope`);
  return lines.join("\n");
}

function emitBaseline(root) {
  const r = scan(root, "HEAD");
  const rows = [...r.actual].sort().map(([key, count]) => {
    const repo = key.slice(0, key.indexOf(":"));
    return `${repo}\t${key.slice(repo.length + 1)}\t${count}`;
  });
  const pins = [...r.revisions].map(([repo, rev]) => `${repo}@${rev.slice(0, 12)}`).join(" ");
  console.log(`# retired-name census (D-CODE-2) — non-test Go, comment-only lines excluded.`);
  console.log(`# Generated at ${pins} on ${new Date().toISOString().slice(0, 10)} by`);
  console.log(`#   node scripts/check-retired-names.mjs --emit-baseline`);
  console.log(`# The census only ratchets DOWN: removing a site lowers its row; adding one fails.`);
  console.log("repo\tfile\tcount");
  console.log(rows.join("\n"));
}

// ── the self-test ──────────────────────────────────────────────────────────────────
const FIXTURE = [
  ["charly/charly/note.go", "package main\n\nfunc Note() {}\n"],
  ["sdk/kit/compat.go", "package kit\n\n// a compat shim recorded by the census below\nfunc compatLayer() {}\n"],
  ["spec/refs/refs.go", "package refs\n\nfunc Resolve() {}\n"],
  ["spec/refs/kit_test.go", "package refs\n\nfunc legacyWait() {}\n"],
];
const FIXTURE_BASELINE = "repo\tfile\tcount\nsdk\tkit/compat.go\t1\n";

function fixture(root, mutate) {
  const dir = join(root, "tree");
  for (const [rel, body] of FIXTURE) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(join(dir, BASELINE), FIXTURE_BASELINE);
  for (const repo of REPOS) {
    const d = join(dir, repo);
    mkdirSync(d, { recursive: true });
    execFileSync("git", ["-C", d, "init", "-q", "-b", "main"]);
    execFileSync("git", ["-C", d, "add", "-A"]);
    execFileSync("git", ["-C", d, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "fixture"]);
  }
  if (mutate) {
    mutate(dir);
    for (const repo of REPOS) {
      const d = join(dir, repo);
      if (!existsSync(d)) continue; // the missing-checkout arm removes one
      const st = git(d, ["status", "--porcelain"]);
      if (st === null || st.trim() === "") continue; // an untouched fixture repo has nothing to commit
      execFileSync("git", ["-C", d, "add", "-A"]);
      execFileSync("git", ["-C", d, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "mutant"]);
    }
  }
  return dir;
}

function selfTest() {
  const scratch = mkdtempSync(join(tmpdir(), "check-retired-names-"));
  const cases = [];
  try {
    cases.push(["the census agrees with the tree", fixture(scratch), true]);
    cases.push([
      "a NEW shim in a file the census does not know turns the gate RED",
      fixture(join(scratch, "a"), (dir) => writeFileSync(join(dir, "spec", "newshim.go"), "package spec\n\nfunc legacyPath() {}\n")),
      false,
    ]);
    cases.push([
      "a SECOND site in a census file turns the gate RED (the count is exact)",
      fixture(join(scratch, "b"), (dir) => writeFileSync(join(dir, "sdk", "kit", "compat.go"), "package kit\n\nfunc compatLayer() {}\n\nfunc legacyLayer() {}\n")),
      false,
    ]);
    cases.push([
      "a VANISHED site turns the gate RED (the census must be lowered)",
      fixture(join(scratch, "c"), (dir) => writeFileSync(join(dir, "sdk", "kit", "compat.go"), "package kit\n\nfunc plain() {}\n")),
      false,
    ]);
    cases.push([
      "a retired name in a TEST file is out of scope",
      fixture(join(scratch, "d"), (dir) => writeFileSync(join(dir, "sdk", "kit", "more_test.go"), "package kit\n\nfunc compatProbe() {}\n")),
      true,
    ]);
    cases.push([
      "a COMMENT-ONLY mention is out of scope (14.3's subject, not a mechanism)",
      fixture(join(scratch, "e"), (dir) => writeFileSync(join(dir, "spec", "notes.go"), "package spec\n\n// compat: the old path was removed; see CHANGELOG\nfunc Note() {}\n")),
      true,
    ]);
    cases.push([
      "a missing checkout is a VISIBLE skip, not a silent pass",
      fixture(join(scratch, "f"), (dir) => rmSync(join(dir, "sdk"), { recursive: true, force: true })),
      true,
    ]);
  } finally {
    // every case is judged below
  }

  let reds = 0;
  for (const [title, root, wantClean] of cases) {
    failed = 0;
    const r = scan(root, "main");
    const out = judge(`\n== ${title}`, r, loadBaseline(root));
    const clean = failed === 0;
    let armOk = clean === wantClean;
    const wantSkip = title.startsWith("a missing checkout");
    if (armOk && wantSkip && !out.includes("SKIP  sdk:")) {
      armOk = false;
      console.log("  FAIL  self-test: the SKIP line is MISSING — the arm would be a silent pass");
    } else if (armOk && !wantSkip && /^\s*SKIP\s/m.test(out)) {
      armOk = false;
      console.log("  FAIL  self-test: a SKIP line appeared where nothing was skipped");
    }
    if (armOk) {
      console.log(`  PASS  self-test: ${clean ? "PASS" : "RED"} as asserted${wantSkip ? " (the SKIP line is present)" : " (no SKIP line)"}`);
    } else {
      console.log(`  FAIL  self-test: got ${clean ? "PASS" : "RED"}, asserted ${wantClean ? "PASS" : "RED"}`);
      reds += 1;
    }
  }
  rmSync(scratch, { recursive: true, force: true });
  if (reds > 0) {
    console.error(`\nself-test: ${reds} assertion(s) did not hold`);
    process.exit(1);
  }
  console.log("\nself-test: every arm fired as asserted");
}

if (argv.includes("--self-test")) {
  selfTest();
} else if (argv.includes("--emit-baseline")) {
  emitBaseline(ROOT);
} else {
  const r = scan(ROOT, "HEAD");
  if (r.revisions.size === 0) {
    // A light worktree has no submodule checkouts: the gate cannot judge and says so.
    console.log("check-retired-names: SKIP — no pinned checkout to judge; run `charly task init` for the working set");
    process.exit(0);
  }
  judge("check-retired-names: every (compat|legacy) site is a census row, and the census only turns down (D-CODE-2)", r, loadBaseline(ROOT));
  if (failed > 0) {
    console.error(`\ncheck-retired-names: ${failed} finding(s)`);
    process.exit(1);
  }
  console.log("\ncheck-retired-names: OK");
}
