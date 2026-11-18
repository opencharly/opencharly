#!/usr/bin/env node
// check-verify-branch-audit.mjs — regression gate for the umbrella's own `verify`
// task step that audits every submodule's `branch=` against its remote's default
// branch, exercised against FIXTURES built in a temp dir.
//
// The step is EXTRACTED FROM charly.yml, never copied, so a fixture run always
// exercises the shipped text and the two cannot drift (R2). It stays INLINE in
// charly.yml because no verb owns the clause.
//
// WHAT THIS GATE DOES NOT COVER, and who does: this gate exercises the step's TEXT
// through spawnSync("/bin/sh", …), so it CANNOT see what the PLAN RUNNER does with
// that text — and the plan runner claims a braced reference in it, skipping the step
// when it cannot resolve (observed 2026-10-22: the step read its parallelism as
// `JOBS="${AUDIT_JOBS:-16}"`, the step was SKIPPED, and `charly task verify` exited 0
// while the audit never ran). That half — the text the plan runner would claim — is
// asserted by scripts/check-task-command-vars.mjs, against the same shipped file.
//
// WHAT THE GATE PINS — each proven LIVE by --self-test against a mutation of the
// step:
//   A. every branch= equal to the remote default            → GREEN
//   B. ONE branch= that is not the remote default           → RED, and it NAMES the path
//   C. SEVERAL branch= values that are not the remote default → RED, and it NAMES
//      EVERY ONE of them (the audit runs the remote calls in PARALLEL, so it
//      cannot stop at the first mismatch without losing the rest)
//   D. a path with no branch= in .gitmodules                 → RED, and it NAMES the path
//
// Usage: node scripts/check-verify-branch-audit.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const yamlRel = "charly.yml";

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);

/** The fixture's git environment: isolated from the host, deterministic, no network. */
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "protocol.file.allow",
  GIT_CONFIG_VALUE_0: "always",
  GIT_CONFIG_KEY_1: "init.defaultBranch",
  GIT_CONFIG_VALUE_1: "main",
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} (in ${cwd}) failed: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

/**
 * Extract the `command:` block scalar of the branch-audit step from charly.yml.
 * The step's identity is its `check:` line; the block ends at the first non-blank
 * line indented at or above the `command:` key.
 */
function extractStepCommand(yamlPath) {
  const lines = readFileSync(yamlPath, "utf8").split("\n");
  // The step is identified by its MECHANISM -- a `- check:` whose `command:` block
  // runs git ls-remote -- never by its prose. Matching the description here would
  // make this extractor a second copy of the message it reads: reword the step and
  // the self-test would silently stop finding it, then fail claiming the step is
  // missing. That is the defect that made this function match the description and
  // then broke when the description stated the rule the code had stopped enforcing.
  const stepRe = /^(\s*)-\s*check:/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(stepRe);
    if (!m) continue;
    const stepIndent = m[1].length;
    const cmdIndent = stepIndent + 2;
    const cmdRe = new RegExp(`^\\s{${cmdIndent}}command:\\s*\\|\\s*$`);
    let j = -1;
    for (let k = i + 1; k < lines.length; k++) {
      if (lines[k].trim() === "") continue;
      if (lines[k].match(/^\s*/)[0].length <= stepIndent) break;
      if (cmdRe.test(lines[k])) {
        j = k;
        break;
      }
    }
    if (j === -1) continue;
    const body = [];
    for (let k = j + 1; k < lines.length; k++) {
      const ind = lines[k].match(/^\s*/)[0].length;
      if (lines[k].trim() !== "" && ind <= cmdIndent) break;
      body.push(lines[k].trim() === "" ? "" : lines[k].slice(cmdIndent + 2));
    }
    while (body.length && body[body.length - 1] === "") body.pop();
    const text = body.join("\n") + "\n";
    if (/\bls-remote\b/.test(text)) return text;
  }
  return null;
}

// The step refuses a suspiciously small submodule set, so the fixture declares
// enough paths to clear that guard.
const PATHS = Array.from({ length: 24 }, (_, i) => `mod-${String(i).padStart(2, "0")}`);
const WRONG = ["mod-03", "mod-11", "mod-19"];

/**
 * A superproject whose `.gitmodules` declares every path against ONE local remote
 * whose default branch is `main`. `opts` then breaks ONE property at a time:
 *   default   — every branch= equals the remote default
 *   wrong     — the paths in WRONG carry a branch= that is NOT the default
 *   noBranch  — one path carries no branch= at all
 */
function buildFixture(script, opts = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "check-verify-branch-audit-")));

  // The remote: a bare repo whose HEAD is a symref to refs/heads/main, so
  // `git ls-remote --symref <url> HEAD` reports the default branch.
  const seed = join(base, "seed");
  mkdirSync(seed);
  git(["init", "-q", seed], base);
  writeFileSync(join(seed, "f.txt"), "remote\n");
  git(["add", "f.txt"], seed);
  git(["commit", "-qm", "seed"], seed);
  const bare = join(base, "remote.git");
  git(["clone", "-q", "--bare", seed, bare], base);
  // `legacy` exists on the remote but is NOT its default: the case arm E needs, and the shape
  // pod-ai-toolkit has in the live tree.
  // `seed` is the SOURCE of the clone, not a clone of it -- it has no `origin` -- so the branch is
  // created in the bare repo itself, which is where the audit reads from.
  git(["branch", "-q", "legacy", "main"], bare);

  const superDir = join(base, "super");
  mkdirSync(superDir);
  git(["init", "-q", superDir], base);
  const lines = [];
  for (const p of PATHS) {
    let branch = "main";
    if (opts.wrong && WRONG.includes(p)) branch = "not-the-default";
    if (opts.served && p === PATHS[0]) branch = "legacy";
    lines.push(`[submodule "${p}"]`, `\tpath = ${p}`, `\turl = file://${bare}`);
    if (!(opts.noBranch && p === PATHS[0])) lines.push(`\tbranch = ${branch}`);
  }
  writeFileSync(join(superDir, ".gitmodules"), lines.join("\n") + "\n", "utf8");

  const r = spawnSync("/bin/sh", ["-c", script], { cwd: superDir, encoding: "utf8", env: gitEnv });
  rmSync(base, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** Run every case against ONE version of the step. */
function runCases(script) {
  return {
    A: buildFixture(script),
    B: buildFixture(script, { wrong: true }),
    C: buildFixture(script, { wrong: true }),
    D: buildFixture(script, { noBranch: true }),
    E: buildFixture(script, { served: true }),
  };
}

/** The contract, in one place, so --self-test and the gate assert the SAME expectations.
 *  Each assertion carries a STABLE ID ("C:names-all"), not just a case letter: the
 *  self-test must be able to say WHICH property caught a mutation, or a coarse
 *  assertion can stand in for the sharp one and the test proves nothing. */
function judge(cases) {
  const found = [];
  const need = (id, cond, detail) => {
    if (!cond) found.push(`${id}: ${detail}`);
  };
  const tail = (c) => c.stderr.trim().split("\n").pop();

  need("A:status", cases.A.status === 0, `every branch= equal to the remote default must be GREEN (exit ${cases.A.status}): ${tail(cases.A)}`);
  need("A:ok-line", /every declared branch is either the remote default, or a branch the remote SERVES/.test(cases.A.stdout),
    "the step must report its OK line, and the line must state the rule the step now enforces");

  need("B:status", cases.B.status !== 0, "a branch= that is neither the remote default nor a branch the remote SERVES must FAIL");
  need("B:names", /mod-03/.test(cases.B.stderr), `the failing path must be named: ${tail(cases.B)}`);

  // The parallel audit cannot stop at the first mismatch without losing the rest,
  // so EVERY mismatching path is named. This is the COMPLETENESS property, and
  // it is its own id: a mutation that keeps the step FAILING while it stops
  // NAMING a mismatching path must be caught HERE — the step's own status
  // assertion is satisfied by ANY failure, so it cannot carry that claim.
  need("C:status", cases.C.status !== 0, "several wrong branch= values must FAIL");
  for (const p of WRONG) {
    need("C:names-all", new RegExp(p).test(cases.C.stderr), `every mismatching path must be named; ${p} is missing: ${tail(cases.C)}`);
  }

  need("D:status", cases.D.status !== 0, "a path with no branch= must FAIL");
  need("D:names", new RegExp(PATHS[0]).test(cases.D.stderr), `the path with no branch= must be named: ${tail(cases.D)}`);
  need("D:missing-branch", /missing branch=/.test(cases.D.stderr), "a path with no branch= must be reported AS a missing branch=, not as a plain mismatch");

  // THE ARM THIS RULE EXISTS FOR. A pinned repo whose default branch moves away from the line the
  // pin deliberately tracks is not a defect: `branch=` is an INTENT, and an upstream pin is a leaf
  // judged against the ref it NAMES. pod-ai-toolkit is the live case -- it declares `main` while its
  // remote defaults to `bootstrap-seed`, and the pinned commit is NOT an ancestor of the default
  // tip, so re-pointing would drop commits. So: served-but-not-default must be GREEN, and NAMED.
  // Without this arm the relaxation is UNPROVABLE, and a later simplification back to strict
  // equality would sail through every other assertion in this file.
  need("E:status", cases.E.status === 0, `a branch= that is not the default but IS served must be GREEN (exit ${cases.E.status}): ${tail(cases.E)}`);
  need("E:named", /deliberate, reported, not a failure/.test(cases.E.stderr), `the served non-default branch must be NAMED, not passed silently: ${tail(cases.E)}`);

  return found;
}

const script = extractStepCommand(join(root, yamlRel));

function check() {
  if (script === null) {
    fail(`${yamlRel}: no '- check:' step whose command: block runs git ls-remote is extractable -- the branch-audit step is identified by its MECHANISM, not its description`);
    return;
  }
  for (const f of judge(runCases(script))) fail(f);
  if (failures === 0) ok(`${yamlRel}: the branch-audit step compares against the remote default, names every mismatch, and never stops at the first`);
}

// ── --self-test: prove each assertion goes RED on a mutation of the step ─────────────
if (argv.includes("--self-test")) {
  if (script === null) {
    console.error(`check-verify-branch-audit --self-test: could not extract the step from ${yamlRel}`);
    process.exit(1);
  }
  const baseline = judge(runCases(script));
  if (baseline.length) {
    for (const f of baseline) console.error(`  FAIL  the UNMUTATED step is not green: ${f}`);
    console.error("check-verify-branch-audit --self-test: FAIL (fix the step first)");
    process.exit(1);
  }
  console.log("  PASS  the unmutated step is GREEN on every fixture");

  // Each mutation reintroduces ONE defect class and names the EXACT assertion that
  // must catch it. The id is the point: a mutation caught by a COARSE assertion
  // (the step failed, so "must FAIL" holds) proves nothing about the sharp one
  // (every mismatching path is named).
  //
  // The "first submodule only" mutation is where the two halves of the contract
  // meet: the step's own "suspiciously few submodules" guard counts the paths in
  // .gitmodules, not the paths the audit LOOKED AT, so it does NOT fire — the
  // truncated audit goes GREEN, and the assertion that catches it is the status
  // one (the step must FAIL). The SHARP completeness claim is proven by the other
  // mutation below, which keeps the step failing while it stops naming a
  // mismatching path: only C:names-all can catch that one.
  const mutations = [
    [
      "the comparison never fails",
      (s) => s.replace('if [ "$branch" != "$default" ]; then', "if false; then"),
      "B:status",
    ],
    [
      "the audit only inspects the FIRST submodule (the rest are never compared) — the step's own count guard still passes (it counts .gitmodules' paths, not the audited ones), so the truncated audit goes GREEN",
      (s) => s.replace("printf '%s\\0%s\\0%s\\0' \"$path\" \"$url\" \"$branch\" >> \"$tmp\"", "printf '%s\\0%s\\0%s\\0' \"$path\" \"$url\" \"$branch\" >> \"$tmp\"; break"),
      "C:status",
    ],
    [
      "the mismatch message does not name the path",
      (s) => s.replace(/echo "\$path: branch=\$branch is NOT the remote default \(\$shown\) and the remote does NOT serve it[^"]*"/, 'echo "branch mismatch"'),
      "C:names-all",
    ],
    [
      "the step no longer requires a branch= on every path",
      (s) => s.replace(/\[ -n "\$branch" \] \|\| fail "\$path: missing branch= in \.gitmodules"/, 'true'),
      "D:missing-branch",
    ],
  ];
  let stFails = 0;
  for (const [name, mutate, mustCatch] of mutations) {
    const mutated = mutate(script);
    if (mutated === script) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did not apply — the step no longer contains the text it targets`);
      continue;
    }
    const caught = judge(runCases(mutated)).some((f) => f.startsWith(`${mustCatch}:`));
    if (caught) {
      console.log(`  PASS  mutation '${name}' is caught by assertion ${mustCatch}`);
    } else {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' was NOT caught by assertion ${mustCatch}`);
    }
  }
  if (stFails) {
    console.error(`check-verify-branch-audit --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-verify-branch-audit --self-test: OK (every assertion is live)");
  process.exit(0);
}

check();
if (failures) {
  console.error(`check-verify-branch-audit: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-verify-branch-audit: OK");
