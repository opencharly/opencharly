#!/usr/bin/env node
// check-governance-reconcile.mjs — run the cross-surface governance reconcile in its
// STRONG form against THIS umbrella checkout: every surface the checkout carries is
// asserted, and a surface whose OWNER REPO is materialized here but whose FILE is
// absent is a STALE POINTER that FAILS (opencharly/.github#246).
//
// WHY THIS EXISTS (opencharly/opencharly#674). The reconcile gate lives in the
// pinned `dotgithub` checkout, and the `.github` repo's own CI runs it in the CI
// FORM — against ITS OWN checkout, where every sibling-repo row SKIPS. The STRONG
// FORM — `--root <the umbrella>` — is the only form that asserts the cross-repo
// rows, and the umbrella is the one checkout that carries the sibling repos. The
// umbrella's own gate never ran it, so a surface that moved out of a sibling repo
// was invisible: by hand, in CI, and in every automated run.
//
// WHY IT IS A SCRIPT AND NOT AN INLINE STEP. The reconcile script lives in the
// PINNED `dotgithub` checkout, and the path the gate READS has to be visible to
// the working-set derivation in scripts/init-submodules.sh (source 4: "a path in a
// string literal that is CODE under scripts/"). A path named only in charly.yml's
// step text is invisible to that derivation, so `dotgithub` would never join the
// derived working set, the step would SKIP on every light tree, and the control
// would be exactly as invisible as it is today — under a name that promises
// otherwise. Naming the path HERE puts it in the derivation's scan, so the
// derived working set carries the repo the gate reads.
//
// WHAT IT DOES NOT DO. It does not re-implement the reconcile: the checker, the
// claims manifest and the stale-pointer control live in the pinned `dotgithub`
// checkout, and this script INVOKES them (R2). It also does not copy that repo's
// logic into this one, so the control's own fixes land in their own repo and
// arrive here with the pin.
//
// THE TWO SHAPES, and what each obliges. A checkout that carries `dotgithub`
// runs the strong form and asserts every surface it holds; a checkout that does
// not carry it reports a visible SKIP and exits clean — the same contract the
// umbrella's other cross-repo gates keep (a gate SKIPS a comparison whose surface
// is not checked out, and a skip is not a failure).
//
// Usage: node scripts/check-governance-reconcile.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const selfTestMode = argv.includes("--self-test");

// The reconcile script's path inside the checkout, ONE literal on purpose: the
// working-set derivation reads a path in a code string literal under scripts/ and
// adds the repo that OWNS it, so the derived working set carries `dotgithub` and
// this gate really runs on a light tree.
const RECONCILE_REL = "dotgithub/scripts/governance-reconcile.sh";
const SKIP_MARK = "governance-reconcile: SKIP";

/** Run the strong form against `rootDir`. Returns the gate's verdict. */
function runGate(rootDir) {
  const script = join(rootDir, RECONCILE_REL);
  if (!existsSync(script)) {
    const out =
      `${SKIP_MARK} — this checkout does not carry ${RECONCILE_REL}, so the strong form cannot run here. ` +
      `Materialize it with: bash scripts/init-submodules.sh  (the derived working set carries the repo the gates read)`;
    return { code: 0, out };
  }
  const r = spawnSync("bash", [script, "--root", rootDir], { encoding: "utf8" });
  if (r.error) {
    return { code: 1, out: `governance-reconcile: FAIL — the reconcile could not be run: ${r.error.message}` };
  }
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd();
  const status = r.status === null ? 1 : r.status;
  return { code: status, out };
}

/** The gate's own verdict, printed as the gate prints it. */
function report(res) {
  if (res.out) console.log(res.out);
  return res.code;
}

// ---------------------------------------------------------------------------
// The self-test: FIXTURES, and every assertion proven able to FAIL.
//
// The fixture is a COPY OF THIS ONE SCRIPT plus a stub of the reconcile script —
// not a copy of the repository, and nothing outside the temp dir is touched. The
// copy is the point: the gate's DEFAULT root resolution (the root is derived
// from the script's own location) is exercised by running the copy from inside
// the fixture, so a broken default cannot hide behind an explicit --root.
//
// The four assertions:
//   A. a reconcile that PASSES        → the gate exits 0
//   B. a reconcile that FAILS         → the gate exits 1  (the negative control:
//                                         the gate CAN fail)
//   C. a checkout that does not carry
//      the reconcile                  → the gate exits 0 and says so
//   D. the strong form is invoked with
//      `--root <the checkout>`        → the stub sees exactly that
//
// Each assertion is paired with a MUTATION of this script that breaks it, and the
// mutated script is judged by the SAME assertion: a mutation that does not break
// its assertion is a failure, because it means the assertion cannot fail (R7).
// Two mechanisms carry that proof, because the code lives in two places — see
// the mutation table below.
//
// The fixture is addressed THROUGH A SYMLINK, so the checkout's path has two
// spellings: the one the caller holds and the one a module that resolves its
// own location sees. A temp root that is itself a symlink (macOS: /var ->
// /private/var) has that property on every run, and the assertion must judge
// the DIRECTORY rather than the spelling of its path.
// ---------------------------------------------------------------------------

/**
 * A fixture checkout: a copy of `source` under scripts/, and a stub reconcile.
 *
 * The fixture is addressed THROUGH A SYMLINK on purpose. A temp root that is
 * itself a symlink (macOS: /var -> /private/var) is named one way by the
 * caller and another by the module that resolves its own path, so the strong
 * form's `--root` and the path the caller holds can differ in SPELLING while
 * naming the same directory. Building the fixture that way HERE makes that
 * asymmetry real on every platform, so assertion D is proved against it rather
 * than assumed away.
 */
function makeFixture(source, { withReconcile, exitCode, marker }) {
  const base = mkdtempSync(join(tmpdir(), "govrec-"));
  const link = join(tmpdir(), `govrec-link-${base.slice(base.lastIndexOf("-") + 1)}`);
  symlinkSync(base, link, "dir");
  const dir = join(link, "fixture");
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts", "check-governance-reconcile.mjs"), source);
  if (withReconcile) {
    mkdirSync(join(dir, "dotgithub", "scripts"), { recursive: true });
    writeFileSync(
      join(dir, "dotgithub", "scripts", "governance-reconcile.sh"),
      `#!/usr/bin/env bash\necho "stub-governance-reconcile: args=[$*] marker=${marker}"\nexit ${exitCode}\n`,
    );
  }
  return { dir, cleanup: [link, base] };
}

/** Run the gate copy inside a fixture checkout. */
function runFixture(dir) {
  const r = spawnSync("node", [join(dir, "scripts", "check-governance-reconcile.mjs")], { encoding: "utf8" });
  return { code: r.status === null ? 1 : r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/**
 * Evaluate every assertion against a given copy of the gate.
 * Returns { A, B, C, D } — true means the assertion HOLDS.
 */
function evaluate(source, dirs) {
  const track = (fixture) => {
    dirs.push(...fixture.cleanup);
    return fixture.dir;
  };

  const passDir = track(makeFixture(source, { withReconcile: true, exitCode: 0, marker: "pass" }));
  const pass = runFixture(passDir);

  const failDir = track(makeFixture(source, { withReconcile: true, exitCode: 1, marker: "fail" }));
  const bad = runFixture(failDir);

  const bareDir = track(makeFixture(source, { withReconcile: false, exitCode: 0, marker: "none" }));
  const bare = runFixture(bareDir);

  return {
    A: pass.code === 0,
    B: bad.code === 1,
    C: bare.code === 0 && bare.out.includes(SKIP_MARK),
    // The stub echoes the arguments it was given, so the strong form's --root
    // value is in its output. Compare the REAL paths: the fixture is addressed
    // through a symlink, so the value the gate resolved and the path the
    // caller holds name the same DIRECTORY in two spellings, and the assertion
    // must judge the directory, not the spelling.
    D: (() => {
      const m = pass.out.match(/--root ([^\s\]]+)/);
      if (!m) return false;
      try {
        return realpathSync(m[1]) === realpathSync(passDir);
      } catch {
        return m[1] === passDir;
      }
    })(),
  };
}

const ASSERTION_TEXT = {
  A: "a reconcile that passes leaves the gate clean",
  B: "a reconcile that fails turns the gate RED",
  C: "a checkout without the reconcile is a visible SKIP",
  D: "the strong form is invoked with --root <the checkout>",
};

/** Run the gate copy in a fixture AS A SELF-TEST, and report what it decided. */
function runSelfTest(dir) {
  const r = spawnSync("node", [join(dir, "scripts", "check-governance-reconcile.mjs"), "--self-test"], {
    encoding: "utf8",
    // The nested run must not recurse: it proves the mutation, and its own
    // "self" mutation is SKIPPED there (visibly, below).
    env: { ...process.env, GOVREC_SELFTEST_NESTED: "1" },
  });
  return { code: r.status === null ? 1 : r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function selfTest() {
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const nested = process.env.GOVREC_SELFTEST_NESTED === "1";
  const dirs = [];
  let fails = 0;
  const fail = (m) => {
    fails += 1;
    console.error(`  FAIL  ${m}`);
  };
  const ok = (m) => console.log(`  PASS  ${m}`);

  // The assertions hold against the shipped script.
  const live = evaluate(source, dirs);
  for (const key of ["A", "B", "C", "D"]) {
    if (live[key]) ok(`${key}: ${ASSERTION_TEXT[key]}`);
    else fail(`${key}: ${ASSERTION_TEXT[key]} — the assertion does not hold against the shipped gate`);
  }

  // The mutations: each breaks exactly one assertion, which is what proves that
  // assertion can fail.
  //
  // TWO MECHANISMS, because the two kinds of code live in different places:
  //   "gate" — the mutation is in the GATE's executed path. The fixture copy
  //            runs it, and the parent judges the copy's BEHAVIOUR.
  //   "self" — the mutation is in THIS HARNESS's own assertion logic, which
  //            the fixture copy never executes (it runs as a gate, not as a
  //            self-test). So the mutated source is run AS a self-test, and
  //            the mutation is caught when that nested self-test FAILS on the
  //            assertion under test. Without this second mechanism, a
  //            mutation of the assertion logic would change nothing the
  //            parent observes, and the assertion would look live when it is
  //            not — a coverage that cannot fail.
  const mutations = [
    [
      "the gate stops propagating the reconcile's exit status",
      (s) => s.replace("const status = r.status === null ? 1 : r.status;", "const status = 0;"),
      "B",
      "gate",
    ],
    [
      "the gate stops passing --root to the strong form",
      (s) => s.replace('spawnSync("bash", [script, "--root", rootDir]', 'spawnSync("bash", [script, "--root", "/nonexistent-root"]'),
      "D",
      "gate",
    ],
    [
      "the gate turns the missing-reconcile skip red",
      (s) => s.replace("return { code: 0, out };", "return { code: 1, out };"),
      "C",
      "gate",
    ],
    [
      "the gate turns a passing reconcile red",
      (s) => s.replace("const status = r.status === null ? 1 : r.status;", "const status = r.status === 0 ? 1 : r.status;"),
      "A",
      "gate",
    ],
    [
      "the D assertion judges the path's SPELLING instead of the directory",
      (s) => s.replace("return realpathSync(m[1]) === realpathSync(passDir);", "return m[1] === passDir;"),
      "D",
      "self",
    ],
  ];
  for (const [name, mutate, mustBreak, kind] of mutations) {
    const mutated = mutate(source);
    if (mutated === source) {
      fail(`mutation '${name}' did not apply — this script no longer contains the text it targets`);
      continue;
    }
    if (kind === "self") {
      if (nested) {
        console.log(`  SKIP  mutation '${name}' — this is a nested self-test, and a nested self-test does not recurse`);
        continue;
      }
      const fixture = makeFixture(mutated, { withReconcile: true, exitCode: 0, marker: "nested" });
      dirs.push(...fixture.cleanup);
      const after = runSelfTest(fixture.dir);
      if (after.code !== 0 && after.out.includes(`FAIL  ${mustBreak}:`)) {
        ok(`mutation '${name}' is caught by assertion ${mustBreak} (${ASSERTION_TEXT[mustBreak]}) — the mutated self-test fails on it`);
      } else {
        fail(`mutation '${name}' was NOT caught by assertion ${mustBreak} — that assertion cannot fail`);
      }
      continue;
    }
    const after = evaluate(mutated, dirs);
    if (after[mustBreak] === false) {
      ok(`mutation '${name}' is caught by assertion ${mustBreak} (${ASSERTION_TEXT[mustBreak]})`);
    } else {
      fail(`mutation '${name}' was NOT caught by assertion ${mustBreak} — that assertion cannot fail`);
    }
  }

  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  if (fails) {
    console.error(`check-governance-reconcile --self-test: FAIL (${fails})`);
    process.exit(1);
  }
  console.log("check-governance-reconcile --self-test: OK (every assertion is live)");
  process.exit(0);
}

if (selfTestMode) {
  selfTest();
} else {
  process.exit(report(runGate(root)));
}
