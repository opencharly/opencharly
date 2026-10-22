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
// when it cannot resolve (measured 2026-10-22: the step read its parallelism as
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
  const stepRe = /^(\s*)-\s*check:\s*every submodule's branch equals its remote default/;
  const i = lines.findIndex((l) => stepRe.test(l));
  if (i === -1) return null;
  const stepIndent = lines[i].match(stepRe)[1].length;
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
  if (j === -1) return null;
  const body = [];
  for (let k = j + 1; k < lines.length; k++) {
    const ind = lines[k].match(/^\s*/)[0].length;
    if (lines[k].trim() !== "" && ind <= cmdIndent) break;
    body.push(lines[k].trim() === "" ? "" : lines[k].slice(cmdIndent + 2));
  }
  while (body.length && body[body.length - 1] === "") body.pop();
  return body.join("\n") + "\n";
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

  const superDir = join(base, "super");
  mkdirSync(superDir);
  git(["init", "-q", superDir], base);
  const lines = [];
  for (const p of PATHS) {
    let branch = "main";
    if (opts.wrong && WRONG.includes(p)) branch = "not-the-default";
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
  };
}

/** The contract, in one place, so --self-test and the gate assert the SAME expectations. */
function judge(cases) {
  const found = [];
  const need = (name, cond, detail) => {
    if (!cond) found.push(`${name}: ${detail}`);
  };
  const tail = (c) => c.stderr.trim().split("\n").pop();

  need("A", cases.A.status === 0, `every branch= equal to the remote default must be GREEN (exit ${cases.A.status}): ${tail(cases.A)}`);
  need("A", /branch == remote default for every one/.test(cases.A.stdout), "the step must report its OK line");

  need("B", cases.B.status !== 0, "a branch= that is not the remote default must FAIL");
  need("B", /mod-03/.test(cases.B.stderr), `the failing path must be named: ${tail(cases.B)}`);

  // The parallel audit cannot stop at the first mismatch without losing the rest,
  // so EVERY mismatching path is named.
  for (const p of WRONG) {
    need("C", cases.C.status !== 0, "several wrong branch= values must FAIL");
    need("C", new RegExp(p).test(cases.C.stderr), `every mismatching path must be named; ${p} is missing: ${tail(cases.C)}`);
  }

  need("D", cases.D.status !== 0, "a path with no branch= must FAIL");
  need("D", new RegExp(PATHS[0]).test(cases.D.stderr), `the path with no branch= must be named: ${tail(cases.D)}`);
  need("D", /missing branch=/.test(cases.D.stderr), "a path with no branch= must be reported AS a missing branch=, not as a plain mismatch");

  return found;
}

const script = extractStepCommand(join(root, yamlRel));

function check() {
  if (script === null) {
    fail(`${yamlRel}: the 'every submodule's branch equals its remote default' step (and its command: block) is extractable`);
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

  // Each mutation reintroduces ONE defect class and names the case that must catch it.
  const mutations = [
    [
      "the comparison never fails",
      (s) => s.replace('if [ "$branch" != "$default" ]; then', "if false; then"),
      "B",
    ],
    [
      "the audit only inspects the FIRST submodule (the rest are never compared)",
      (s) => s.replace("| awk '{print $2}' > \"$paths\"", "| awk 'NR==1{print $2}' > \"$paths\""),
      "C",
    ],
    [
      "the mismatch message does not name the path",
      (s) => s.replace(/echo "\$path: branch=\$branch but remote default is \$shown"/, 'echo "branch mismatch"'),
      "C",
    ],
    [
      "the step no longer requires a branch= on every path",
      (s) => s.replace(/\[ -n "\$branch" \] \|\| fail "\$path: missing branch= in \.gitmodules"/, 'true'),
      "D",
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
      console.log(`  PASS  mutation '${name}' is caught by case ${mustCatch}`);
    } else {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' was NOT caught by case ${mustCatch}`);
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
