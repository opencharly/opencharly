#!/usr/bin/env node
// check-code-rules.mjs — D-CODE-1 (D-LAW-5 in code): every non-test `time.Sleep` in
// `charly`, `sdk` and `spec` must be a DECLARED, BOUNDED readiness wait — a site named in
// the committed allowlist below, with the bound that makes it a wait and not a blind sleep.
//
// THE RULE IS DESIGN.md'S OWN, NOT A GUESS. D-LAW-5 (DESIGN.md:41): "No hidden default in
// code, no degrade path, no self-healing, no blind retry or sleep. … A wait is a declared
// readiness condition with a deadline." D-CODE-1 (DESIGN.md:2646): "D-LAW-5 holds in code:
// no `sleep` outside the sdk readiness waits, no retry loop, no suppressed error; a gate
// enforces it." So the gate has ONE job: a non-test sleep must appear in the allowlist,
// and the allowlist IS the readiness-wait list — the row's own phrase — with each entry
// carrying the deadline/attempt bound its function declares.
//
// WHY AN ALLOWLIST AND NOT A SYNTACTIC "bounded in the same scope" TEST: the bound is a
// property of the ENCLOSING FUNCTION (a `deadline` compared in the loop, a `gitOpRetries`
// bound, a test seam that is zero in production), and a regex cannot prove it. The
// allowlist makes the claim REVIEWABLE at one place and EXACT: every entry carries the
// site count it expects, so a second sleep in an allowlisted file fails, a vanished site
// fails (the entry has gone stale), and an unlisted site fails. A ratchet with slack would
// pass all three — the defect this session paid for.
//
// SCOPE: `*_test.go` is out of scope (a test's own waits are not shipped code; D-CODE-1's
// subject is the sleep a BUILD or RUN path carries). Commented-out lines are out of scope
// (they do not run). The gate scans the three PINNED repos' checked-out HEAD (the pin the
// umbrella records) and names the revision it measured; a missing checkout is a VISIBLE
// skip, never a silent pass.
//
// Usage: node scripts/check-code-rules.mjs [--root <dir>] [--self-test]

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const ROOT = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const REPOS = ["charly", "sdk", "spec"];

// The readiness-wait allowlist — the sdk readiness waits D-CODE-1 names plus the two
// bounded polls whose tool exposes no sync primitive (strict-policy/go-quality's named
// legitimate pattern). `count` is the EXACT number of non-test `time.Sleep` sites the file
// carries at the pin: an extra one, or a vanished one, fails.
const ALLOW = [
  {
    repo: "charly",
    file: "charly/plugin_activity.go",
    count: 1,
    why: "TEST SEAM — pluginActivityTouchGate is zero in production (`if pluginActivityTouchGate > 0`)",
  },
  {
    repo: "sdk",
    file: "agentkit/store.go",
    count: 1,
    why: "flockBounded — flock poll bounded by `deadline := time.Now().Add(storeLockTimeout)`, fails naming the holder",
  },
  {
    repo: "sdk",
    file: "deploykit/enc_passphrase.go",
    count: 1,
    why: "passphrase poll bounded by `EncMountDeadline`, fails listing every remediation",
  },
  {
    repo: "spec",
    file: "lock/filelock.go",
    count: 1,
    why: "AcquireFileLock — flock poll bounded by `deadline := time.Now().Add(timeout)`, fails naming the holder",
  },
  {
    repo: "spec",
    file: "refs/git.go",
    count: 1,
    why: "runGitOp — bounded `gitOpRetries` attempts, each under its own `context.WithTimeout`",
  },
];

const SLEEP = /time\.Sleep\(/;
const TEST_FILE = /(?:_test\.go)$/;

const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  failed += 1;
};
const ok = (m) => console.log(`  PASS  ${m}`);
let failed = 0;

/** Run git in one repo; returns "" on any failure (the caller decides how visible that is). */
function git(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/**
 * The scan. `rev` is the revision the gate JUDGES; the caller names it. Returns
 * { skipped: [{repo, reason}], actual: Map "repo:file" -> count, testSites, comments }.
 */
function scan(root, rev) {
  const out = { skipped: [], actual: new Map(), testSites: 0, revisions: new Map(), comments: 0 };
  for (const repo of REPOS) {
    const dir = join(root, repo);
    // A submodule checkout's toplevel IS the repo dir; an EMPTY directory inside the
    // umbrella makes git discover the UMBRELLA, whose HEAD is not this repo's. Judge only
    // a dir that is its own repository (a light worktree is a visible skip, never a
    // false judge of the umbrella's own HEAD).
    const top = git(dir, ["rev-parse", "--show-toplevel"]);
    const head = top === null ? null : git(dir, ["rev-parse", "--verify", `${rev}^{commit}`]);
    if (head === null || resolve(top.trim()) !== resolve(dir)) {
      out.skipped.push({ repo, reason: `${dir} is not its own ${rev} checkout — no checkout to judge` });
      continue;
    }
    out.revisions.set(repo, head.trim());
    const raw = git(dir, ["grep", "-n", "-E", "time\\.Sleep\\(", rev, "--", "*.go"]);
    if (raw === null) continue; // no match
    for (const line of raw.split("\n")) {
      if (line === "") continue;
      // "<rev>:<path>:<line>:<content>"
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
      if (!SLEEP.test(content)) continue;
      if (TEST_FILE.test(path)) {
        out.testSites += 1;
        continue;
      }
      const key = `${repo}:${path}`;
      out.actual.set(key, (out.actual.get(key) ?? 0) + 1);
    }
  }
  return out;
}

function judge(title, result) {
  console.log(`\n${title}`);
  for (const { repo, reason } of result.skipped) console.log(`  SKIP  ${repo}: ${reason}`);
  for (const [repo, rev] of result.revisions) console.log(`  read  ${repo}@${rev.slice(0, 12)}`);

  const expected = new Map(ALLOW.map((a) => [`${a.repo}:${a.file}`, a]));
  for (const [key, count] of [...result.actual].sort()) {
    const a = expected.get(key);
    if (!a) {
      fail(`${key}: ${count} non-test time.Sleep site(s) NOT in the readiness-wait allowlist — a sleep must be a declared wait with a deadline (D-LAW-5)`);
      continue;
    }
    if (count !== a.count) {
      fail(`${key}: ${count} non-test time.Sleep site(s), the allowlist declares ${a.count} — ${a.why}`);
    } else {
      ok(`${key}: ${count} site — ${a.why}`);
    }
  }
  for (const a of ALLOW) {
    if (!result.revisions.has(a.repo)) continue; // the repo was SKIPPED: its allowlist row is unjudged, not stale
    const key = `${a.repo}:${a.file}`;
    if (!result.actual.has(key)) {
      fail(`${key}: the allowlist's readiness wait is GONE (or unreachable) and the entry is stale — remove it or re-anchor it (D-CODE-1)`);
    }
  }
  console.log(`  info  ${result.testSites} test-file site(s) out of scope; ${result.comments} commented-out site(s) out of scope`);
}

// ── the self-test ─────────────────────────────────────────────────────────────────
// Every fixture is a REAL git repository (the org's gate convention): the gate judged the
// same git-grep path it runs on the real tree. Each case asserts the WHOLE verdict —
// a fail case must fail, a pass case must pass — so a gate that never fires and a gate
// that always fires are both caught.

const FIXTURE_FILES = [
  ["charly/charly/plugin_activity.go", "package main\n\nfunc seam(gate int) {\n\tif gate > 0 {\n\t\ttime.Sleep(gate)\n\t}\n}\n"],
  ["sdk/agentkit/store.go", "package agentkit\n\nfunc bounded() {\n\tfor {\n\t\ttime.Sleep(50 * time.Millisecond)\n\t}\n}\n"],
  ["sdk/deploykit/enc_passphrase.go", "package deploykit\n\nfunc poll() {\n\ttime.Sleep(period)\n}\n"],
  ["spec/lock/filelock.go", "package lock\n\nfunc Acquire() {\n\ttime.Sleep(50 * time.Millisecond)\n}\n"],
  ["spec/refs/git.go", "package refs\n\nfunc runGitOp() {\n\tfor attempt := 0; attempt <= retries; attempt++ {\n\t\ttime.Sleep(backoff)\n\t}\n}\n"],
  ["sdk/kit/exercise_test.go", "package kit\n\nfunc testWait() {\n\ttime.Sleep(time.Second)\n}\n"],
  ["scripts/check-code-rules.mjs", "// the gate's OWN source carries the pattern; it must never be scanned\nconst re = /time\\.Sleep\\(/;\n"],
];

function fixture(root, mutate) {
  const dir = join(root, "tree");
  for (const [rel, body] of FIXTURE_FILES) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  for (const repo of REPOS) {
    const d = join(dir, repo);
    mkdirSync(d, { recursive: true });
    execFileSync("git", ["-C", d, "init", "-q", "-b", "main"]);
    execFileSync("git", ["-C", d, "add", "-A"]);
    execFileSync("git", ["-C", d, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "fixture"]);
  }
  if (mutate) mutate(dir);
  return dir;
}

function selfTest() {
  const scratch = mkdtempSync(join(tmpdir(), "check-code-rules-"));
  const cases = [];
  try {
    const base = fixture(scratch);
    cases.push(["the pinned tree agrees: every non-test sleep is an allowlisted bounded wait", base, true]);

    const unlisted = fixture(join(scratch, "a"), (dir) => {
      writeFileSync(join(dir, "spec", "newpoll.go"), "package spec\n\nfunc Spin() {\n\tfor {\n\t\ttime.Sleep(time.Second)\n\t}\n}\n");
      execFileSync("git", ["-C", join(dir, "spec"), "add", "-A"]);
      execFileSync("git", ["-C", join(dir, "spec"), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "mutant"]);
    });
    cases.push(["an UNLISTED non-test sleep turns the gate RED", unlisted, false]);

    const extra = fixture(join(scratch, "b"), (dir) => {
      const p = join(dir, "spec", "lock", "filelock.go");
      writeFileSync(p, "package lock\n\nfunc Acquire() {\n\ttime.Sleep(50 * time.Millisecond)\n\ttime.Sleep(50 * time.Millisecond)\n}\n");
      execFileSync("git", ["-C", join(dir, "spec"), "add", "-A"]);
      execFileSync("git", ["-C", join(dir, "spec"), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "mutant"]);
    });
    cases.push(["a SECOND sleep in an allowlisted file turns the gate RED (the count is exact)", extra, false]);

    const gone = fixture(join(scratch, "c"), (dir) => {
      const p = join(dir, "spec", "refs", "git.go");
      writeFileSync(p, "package refs\n\nfunc runGitOp() {\n\t_ = 1\n}\n");
      execFileSync("git", ["-C", join(dir, "spec"), "add", "-A"]);
      execFileSync("git", ["-C", join(dir, "spec"), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "mutant"]);
    });
    cases.push(["a VANISHED allowlisted site turns the gate RED (no slack)", gone, false]);

    const comments = fixture(join(scratch, "d"), (dir) => {
      writeFileSync(join(dir, "spec", "commented.go"), "package spec\n\n// time.Sleep(time.Second) — retired, do not run\nfunc Noop() {}\n");
      execFileSync("git", ["-C", join(dir, "spec"), "add", "-A"]);
      execFileSync("git", ["-C", join(dir, "spec"), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "mutant"]);
    });
    cases.push(["a COMMENTED-OUT sleep does not fire", comments, true]);

    const skipped = fixture(join(scratch, "e"), (dir) => {
      rmSync(join(dir, "sdk"), { recursive: true, force: true });
    });
    cases.push(["a missing checkout is a VISIBLE skip, not a silent pass", skipped, true]);
  } finally {
    // every case that must be judged runs before this point
  }

  let reds = 0;
  for (const [title, root, wantClean] of cases) {
    failed = 0;
    const r = scan(root, "main");
    judge(`\n== ${title}`, r);
    const clean = failed === 0;
    if (clean === wantClean) {
      console.log(`  PASS  self-test: ${clean ? "PASS" : "RED"} as asserted`);
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
} else {
  const r = scan(ROOT, "HEAD");
  if (r.revisions.size === 0) {
    // A light worktree has no submodule checkouts: the gate cannot judge and says so.
    // It never fails a commit for a tree it could not read (the opencharly#498 defect),
    // and the durable guard is that a full tree HAS the checkouts the scan needs.
    console.log("check-code-rules: SKIP — no pinned checkout to judge; run `charly task init` for the working set");
    process.exit(0);
  }
  judge("check-code-rules: every non-test time.Sleep is an allowlisted bounded readiness wait (D-CODE-1 / D-LAW-5)", r);
  if (failed > 0) {
    console.error(`\ncheck-code-rules: ${failed} finding(s)`);
    process.exit(1);
  }
  console.log("\ncheck-code-rules: OK");
}
