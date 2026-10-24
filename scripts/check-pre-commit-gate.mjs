#!/usr/bin/env node
// check-pre-commit-gate.mjs — the umbrella's COMMIT GATE's own assertion.
//
// Why it exists (opencharly/opencharly#602, #645, #498). The umbrella's pre-commit
// hook ran its charly-backed pair TWICE per commit — once in the binary branch and
// once under the banner — and decided what to run with a `needs_charly` flag that
// only the NO-BINARY branch consulted, so the binary-present branch ran BOTH legs
// on a diff that could violate neither. Worse, the no-binary branch FELL THROUGH to
// a `run_charly` with an EMPTY binary, so a fresh session worktree — which
// AGENTS.md Part II #2 mandates for every session, and which has no binary of its
// own — could not commit AT ALL: the hook died on a command-not-found. The gate now
// decides by CHANGE CLASS, runs each leg EXACTLY ONCE, and reads the staged diff
// from the index the commit actually carries.
//
// Why firing, not just reading (the same lesson as check-pr-body-gate.mjs): a claim
// about a mechanism must be verified THROUGH the mechanism. A regex cannot see
// whether the gate invokes the pin check once or twice, whether the skip is visible,
// whether the no-binary path fails loud, or whether the index the commit carries is
// the index that is read — only running it can.
//
// Usage: node scripts/check-pre-commit-gate.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const gateRel = "hooks/pre-commit-gate.sh";
const hookRel = "hooks/pre-commit";
const gateFile = join(root, gateRel);
const hookFile = join(root, hookRel);

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);

/** Strip line/block comments so the assertions read CODE, not the prose explaining it. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'`])#.*$/, "$1"))
    .join("\n");
}

const countOf = (haystack, needle) => haystack.split(needle).length - 1;

function executableMode(path) {
  try {
    return Number((spawnSync("stat", ["-c", "%a", path], { encoding: "utf8" }).stdout ?? "").trim());
  } catch {
    return 0;
  }
}

// ── the static readings ───────────────────────────────────────────────────────────
function check() {
  if (!existsSync(gateFile)) {
    fail(`${gateRel} exists`);
    return;
  }
  if (!existsSync(hookFile)) {
    fail(`${hookRel} exists`);
    return;
  }
  const gate = stripComments(readFileSync(gateFile, "utf8"));
  const hook = stripComments(readFileSync(hookFile, "utf8"));

  for (const [rel, path] of [
    [gateRel, gateFile],
    [hookRel, hookFile],
  ]) {
    const mode = executableMode(path);
    if (!(mode & 0o111)) fail(`${rel} is executable (mode ${mode.toString(8)})`);
  }

  // 1. ONE owner for the legs. The hook calls the gate exactly once, and the hook
  //    itself invokes neither charly-backed leg — the duplication the old hook
  //    carried (both legs ran twice per commit) cannot come back.
  const gateCalls = countOf(hook, "pre-commit-gate.sh");
  if (gateCalls !== 1) fail(`hooks/pre-commit calls the gate EXACTLY once (found ${gateCalls})`);
  if (/task pin-check/.test(hook)) fail(`hooks/pre-commit does not invoke the pin check itself (it lives in the gate)`);
  if (/task self-test/.test(hook)) fail(`hooks/pre-commit does not invoke the self-test task itself (it lives in the gate)`);

  // 2. The gate runs each leg EXACTLY once. The count matches the INVOCATION, not
  //    any mention of the command: the skip notice NAMES the command it skipped, and
  //    a count that reads prose as an invocation cannot tell the two apart.
  const pinRuns = countOf(gate, '"$CHARLY" task pin-check');
  if (pinRuns !== 1) fail(`${gateRel} invokes the pin check EXACTLY once (found ${pinRuns})`);
  const selfRuns = countOf(gate, 'bash "$ROOT/scripts/self-test.sh"');
  if (selfRuns !== 1) fail(`${gateRel} invokes the self-test EXACTLY once (found ${selfRuns})`);

  // 3. The skip is VISIBLE and the missing binary FAILS LOUD. A gate that skipped
  //    silently would read green over a check that never ran — the exact defect the
  //    rulebook calls a workaround.
  if (!/SKIPPED/.test(gate)) fail(`${gateRel} says the pin check is SKIPPED when the change class skips it`);
  if (!/bootstrap-charly\.sh/.test(gate)) fail(`${gateRel} names the fix when the pin check cannot run`);

  // 4. NO main-clone fallback (R9: the binary equals the source). The fallback was
  //    the mechanism that killed every docs-only worktree commit: a different
  //    source's build, which in a linked worktree cannot load the project at all.
  if (/git-common-dir/.test(gate)) fail(`${gateRel} does not fall back to the main clone's binary`);
  if (/main clone/.test(gate)) fail(`${gateRel} does not fall back to the main clone's binary`);

  // 5. The index the commit carries. Git sets GIT_INDEX_FILE to a TEMPORARY index
  //    for a path-limited commit, so the hook must capture it BEFORE the scrub and
  //    hand it to the gate; a gate that read the repository's own index would judge
  //    a superset of the commit.
  const capture = hook.indexOf('COMMIT_INDEX="${GIT_INDEX_FILE:-}"');
  const scrub = hook.indexOf("unset GIT_DIR GIT_INDEX_FILE");
  if (capture === -1) fail(`hooks/pre-commit captures GIT_INDEX_FILE before the scrub`);
  if (scrub === -1) fail(`hooks/pre-commit scrubs the git vars at its boundary`);
  if (capture !== -1 && scrub !== -1 && capture > scrub) fail(`hooks/pre-commit captures GIT_INDEX_FILE BEFORE the scrub`);
  if (!/pre-commit-gate\.sh" "\$COMMIT_INDEX"/.test(hook)) fail(`hooks/pre-commit hands the captured index to the gate`);

  // 6. The node gates are still here: the legs were ADDED, not substituted.
  const nodeGates = countOf(hook, 'node "$ROOT/scripts/check-');
  if (nodeGates < 12) fail(`hooks/pre-commit keeps its node gates (found ${nodeGates}, expected at least 12)`);

  if (failures === 0)
    ok(
      `${gateRel} + ${hookRel}: one owner for the legs, each run once, the skip visible, the ` +
        `missing binary loud, no main-clone fallback, and the index the commit carries read`,
    );
}

// ── the fired assertions ───────────────────────────────────────────────────────────
// Every fixture is a REAL git repository; the gate is the REAL shipped gate, run
// against a recording charly and a recording self-test, so the counts are what the
// gate actually did — not what its text says it does.

/** A charly that records every invocation and can be told to fail. */
const FAKE_CHARLY = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_CHARLY_LOG"
exit "\${FAKE_CHARLY_EXIT:-0}"
`;

/** A self-test that records every invocation. It records a MARKER, not its argument
 *  list: the self-test is called with no arguments, and a recorder that wrote an
 *  empty line would make "invoked once" indistinguishable from "not invoked". */
const FAKE_SELFTEST = `#!/usr/bin/env bash
printf 'self-test\\n' >> "$FAKE_SELFTEST_LOG"
exit 0
`;

const GITLINK_SHA = "1111111111111111111111111111111111111111";

function fire() {
  const scratch = mkdtempSync(join(tmpdir(), "check-pre-commit-gate-"));
  const repo = join(scratch, "repo");
  const expect = (cond, msg) => (cond ? ok(msg) : fail(msg));
  try {
    mkdirSync(repo, { recursive: true });
    const git = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "gate@gate");
    git("config", "user.name", "gate");
    writeFileSync(join(repo, "README.md"), "base\n");
    git("add", "-A");
    writeFileSync(join(scratch, "msg.txt"), "base\n");
    git("commit", "-q", "-F", join(scratch, "msg.txt"));

    // The shipped gate travels into the scratch repository, exactly as a clone's does.
    mkdirSync(join(repo, "hooks"), { recursive: true });
    cpSync(gateFile, join(repo, "hooks", "pre-commit-gate.sh"));
    chmodSync(join(repo, "hooks", "pre-commit-gate.sh"), 0o755);
    // The self-test the gate calls is a recorder: the REAL one is plain shell and
    // takes 3.4 s, and what is under test here is the gate's DECISION, not the
    // builders' behaviour (that is `charly task verify`'s job).
    mkdirSync(join(repo, "scripts"), { recursive: true });
    writeFileSync(join(repo, "scripts", "self-test.sh"), FAKE_SELFTEST);
    // The charly the gate calls is a recorder too: it counts the invocations.
    mkdirSync(join(repo, "charly", "bin"), { recursive: true });
    const charlyPath = join(repo, "charly", "bin", "charly");
    writeFileSync(charlyPath, FAKE_CHARLY);
    chmodSync(charlyPath, 0o755);

    const charlyLog = join(scratch, "charly.log");
    const selfLog = join(scratch, "self-test.log");
    const readLog = (p) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "") : []);

    const runGate = (env = {}, args = []) => {
      for (const p of [charlyLog, selfLog]) rmSync(p, { force: true });
      const r = spawnSync("bash", [join(repo, "hooks", "pre-commit-gate.sh"), ...args], {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, FAKE_CHARLY_LOG: charlyLog, FAKE_SELFTEST_LOG: selfLog, ...env },
      });
      return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, charly: readLog(charlyLog), self: readLog(selfLog) };
    };

    // Stage a documentation change, and a gitlink change, separately.
    const stageDoc = () => {
      writeFileSync(join(repo, "README.md"), "changed\n");
      git("add", "README.md");
    };
    const stageGitlink = () => {
      git("update-index", "--add", "--cacheinfo", `160000,${GITLINK_SHA},distro-example`);
    };
    const unstageGitlink = () => {
      git("rm", "--cached", "-q", "distro-example");
    };

    // F1 — a commit that MOVES A GITLINK runs the pin check, exactly once, and the
    //      self-test exactly once.
    stageDoc();
    stageGitlink();
    const f1 = runGate();
    expect(
      f1.code === 0 && f1.charly.length === 1 && f1.charly[0] === "task pin-check" && f1.self.length === 1,
      `the gate FIRED: a commit that moves a gitlink runs the pin check EXACTLY once and the self-test EXACTLY once`,
    );

    // F2 — a commit that moves NO GITLINK skips the pin check, VISIBLY, and runs the
    //      self-test once. Every value the pin check compares is an index entry, so
    //      such a commit cannot violate it.
    unstageGitlink();
    const f2 = runGate();
    expect(
      f2.code === 0 && f2.charly.length === 0 && /SKIPPED/.test(f2.out) && f2.self.length === 1,
      `the gate FIRED: a commit that moves no gitlink SKIPS the pin check visibly (0 invocations) and still runs the self-test once`,
    );

    // F3 — the same docs-only commit in a tree with NO charly binary: the fresh
    //      session worktree (AGENTS.md Part II #2). It must PASS: the old hook died
    //      here with a command-not-found, which is what made a fresh worktree
    //      uncommittable (opencharly/opencharly#498).
    rmSync(charlyPath, { force: true });
    const f3 = runGate();
    expect(
      f3.code === 0 && f3.charly.length === 0 && f3.self.length === 1,
      `the gate FIRED: a docs-only commit in a tree with NO charly binary PASSES (exit 0) — the fresh-worktree path`,
    );

    // F4 — a commit that DOES move a gitlink in a tree with no binary FAILS LOUD: the
    //      assertion that judges exactly that cannot run, and a gate that skipped it
    //      silently would read green over a check that never ran.
    stageGitlink();
    const f4 = runGate();
    expect(
      f4.code === 1 && f4.charly.length === 0 && /bootstrap-charly\.sh/.test(f4.out),
      `the gate FIRED: a commit that moves a gitlink with NO charly binary FAILS LOUD (exit 1) and names the fix`,
    );

    // F5 — the pin check's OWN verdict propagates: the gate does not swallow a
    //      failing assertion.
    writeFileSync(charlyPath, FAKE_CHARLY);
    chmodSync(charlyPath, 0o755);
    const f5 = runGate({ FAKE_CHARLY_EXIT: "1" });
    expect(
      f5.code !== 0 && f5.charly.length === 1,
      `the gate FIRED: a FAILING pin check fails the gate (exit ${f5.code}) — the verdict is not swallowed`,
    );

    // F6 — the index the COMMIT carries is the index that is read. Git builds a
    //      temporary index for a path-limited commit (`git commit <path>`): HEAD plus
    //      the selected paths. The repository's own index still holds the staged
    //      gitlink, so a gate that read the repository's index would fire on a
    //      commit that carries no gitlink at all.
    const partialIndex = join(scratch, "partial-index");
    const gitEnv = { ...process.env, GIT_INDEX_FILE: partialIndex };
    spawnSync("git", ["read-tree", "HEAD"], { cwd: repo, env: gitEnv, encoding: "utf8" });
    spawnSync("git", ["add", "README.md"], { cwd: repo, env: gitEnv, encoding: "utf8" });
    const f6 = runGate({}, [partialIndex]);
    expect(
      f6.code === 0 && f6.charly.length === 0 && /SKIPPED/.test(f6.out),
      `the gate FIRED: a path-limited commit is judged on the index IT carries, not on the repository's own index`,
    );
    const f6b = runGate();
    expect(
      f6b.charly.length === 1,
      `the gate FIRED: with no index given, the repository's own index is judged (the staged gitlink fires the check)`,
    );
  } catch (err) {
    fail(`firing ${gateRel} (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ── --self-test: prove each assertion goes RED on a mutation ──────────────────────
if (argv.includes("--self-test")) {
  if (!existsSync(gateFile) || !existsSync(hookFile)) {
    console.error(`check-pre-commit-gate --self-test: ${gateRel} or ${hookRel} missing`);
    process.exit(1);
  }
  const tmp = mkdtempSync(join(tmpdir(), "check-pre-commit-gate-self-"));
  mkdirSync(join(tmp, "hooks"), { recursive: true });
  mkdirSync(join(tmp, "scripts"), { recursive: true });
  const gateSrc = readFileSync(gateFile, "utf8");
  const hookSrc = readFileSync(hookFile, "utf8");
  const install = (gate, hook) => {
    writeFileSync(join(tmp, gateRel), gate, "utf8");
    chmodSync(join(tmp, gateRel), 0o755);
    writeFileSync(join(tmp, hookRel), hook, "utf8");
    chmodSync(join(tmp, hookRel), 0o755);
  };
  const runFixture = () => spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", tmp], { encoding: "utf8" });

  const mutations = [
    [
      "the change class is ignored",
      "gate",
      (s) => s.replace(/mode_count="\$\(staged_raw[^\n]*\n/, 'mode_count="1"\n'),
    ],
    [
      "the pin check runs twice",
      "gate",
      (s) => s.replace('CHARLY_PLUGIN_ONLY=1 "$CHARLY" task pin-check', 'CHARLY_PLUGIN_ONLY=1 "$CHARLY" task pin-check\nCHARLY_PLUGIN_ONLY=1 "$CHARLY" task pin-check'),
    ],
    [
      "the missing binary does not fail loud",
      "gate",
      (s) => s.replace("  exit 1\n", "  exit 0\n"),
    ],
    [
      "the self-test leg is skipped",
      "gate",
      (s) => s.replace('bash "$ROOT/scripts/self-test.sh"', "true"),
    ],
    [
      "the main-clone binary comes back",
      "gate",
      (s) =>
        s.replace(
          'CHARLY="$ROOT/charly/bin/charly"',
          'common="$(git rev-parse --git-common-dir 2>/dev/null || true)"\nCHARLY="$ROOT/charly/bin/charly"\nif [ -n "$common" ]; then CHARLY="$(cd "$common/.." && pwd)/charly/bin/charly"; fi',
        ),
    ],
    [
      "the hook calls the gate twice",
      "hook",
      (s) => s.replace('bash "$ROOT/hooks/pre-commit-gate.sh" "$COMMIT_INDEX"', 'bash "$ROOT/hooks/pre-commit-gate.sh" "$COMMIT_INDEX"\nbash "$ROOT/hooks/pre-commit-gate.sh" "$COMMIT_INDEX"'),
    ],
    [
      "the hook takes the pin check back",
      "hook",
      (s) => s.replace('bash "$ROOT/hooks/pre-commit-gate.sh" "$COMMIT_INDEX"', 'bash "$ROOT/hooks/pre-commit-gate.sh" "$COMMIT_INDEX"\nCHARLY_PLUGIN_ONLY=1 "$ROOT/charly/bin/charly" task pin-check'),
    ],
  ];

  let stFails = 0;
  for (const [name, target, mutate] of mutations) {
    install(gateSrc, hookSrc);
    const src = target === "gate" ? gateSrc : hookSrc;
    const mutated = mutate(src);
    if (mutated === src) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did not apply (the source it targets moved)`);
      continue;
    }
    if (target === "gate") install(mutated, hookSrc);
    else install(gateSrc, mutated);
    const r = runFixture();
    if (r.status === 0) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did NOT go red (the gate stayed green)`);
    } else {
      console.log(`  PASS  mutation '${name}' is caught (gate red)`);
    }
  }
  install(gateSrc, hookSrc);
  if (runFixture().status !== 0) {
    stFails += 1;
    console.error("  FAIL  the unmutated copy is not green");
  } else {
    console.log("  PASS  the unmutated copy is GREEN");
  }
  rmSync(tmp, { recursive: true, force: true });
  if (stFails) {
    console.error(`check-pre-commit-gate --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log(`check-pre-commit-gate --self-test: OK (${mutations.length} arms)`);
  process.exit(0);
}

await check();
await fire();
if (failures) {
  console.error(`check-pre-commit-gate: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pre-commit-gate: OK");
