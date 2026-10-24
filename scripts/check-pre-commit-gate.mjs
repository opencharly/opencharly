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
// WHY THERE IS ONE FIRED ASSERTION PER INPUT (opencharly/opencharly#661). The
// first version of this fixture asserted that "a commit that moves no gitlink skips
// the pin check" — and it was RIGHT, for the class it was written for. The pin
// check, though, reads three commit-carried inputs: the index's gitlinks, the
// MANIFEST that declares the pin contract (charly.yml's `pin_map` and
// `pinned_from`), and the DECLARED PATH SET (.gitmodules). A fixture that fires
// the class it was written for cannot falsify that class, so a commit that edits
// the declaration slipped through a green gate. Every input now has its own
// fired assertion, and every input has its own mutation arm: drop a leg and the
// gate goes red.
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
const inputsRel = "scripts/pin-contract-inputs.sh";
const gateFile = join(root, gateRel);
const hookFile = join(root, hookRel);
const inputsFile = join(root, inputsRel);

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

  // 7. The change class watches EVERY commit-carried input of the pin check
  //    (opencharly/opencharly#661), and the RULE that says which lives in ONE
  //    place: scripts/pin-contract-inputs.sh. The gate SOURCES it, and the wave
  //    body's coverage decision (scripts/sync-pin-evidence.sh) sources the same
  //    file — because both ask the same question, "can this diff violate the pin
  //    check?", and a second copy of that question is how the shipped class came
  //    to be wrong. The verb reads the index's gitlinks, the manifest that
  //    DECLARES the pin contract, and the declared path set — a class that
  //    watched only the gitlinks would skip the check on a commit that edits the
  //    declaration, which is exactly what the verb exists to catch. Each watched
  //    file must also EXIST here: a name that drifted out of the tree would
  //    watch nothing, silently.
  const inputsFile = join(root, inputsRel);
  if (!existsSync(inputsFile)) {
    fail(`${inputsRel} exists — the one definition of the pin contract's commit-carried inputs`);
  } else {
    const inputs = stripComments(readFileSync(inputsFile, "utf8"));
    if (!gate.includes(inputsRel)) fail(`${gateRel} sources ${inputsRel} — the one definition of the change class`);
    if (/PIN_CONTRACT_FILES=/.test(gate)) fail(`${gateRel} keeps no copy of the declaration-file list — it reads ${inputsRel}`);
    if (!/PIN_CONTRACT_DECLARATION_FILES=/.test(inputs)) fail(`${inputsRel} defines the declaration-file list`);
    for (const f of ["charly.yml", ".gitmodules"]) {
      if (!inputs.includes(f)) fail(`${inputsRel} watches ${f} — a commit-carried input of the pin check`);
      if (!existsSync(join(root, f))) fail(`${f} exists in this repo — the file the class watches`);
    }
  }

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
    // The pin contract's two DECLARATION files, committed at base so that a
    // LATER change to either is a real staged change — the class watches them
    // (opencharly/opencharly#661). `.gitmodules` declares the fixture's
    // submodule path, as the umbrella's own declares its 431.
    writeFileSync(join(repo, "charly.yml"), "pins: {}\n");
    writeFileSync(
      join(repo, ".gitmodules"),
      '[submodule "distro-example"]\n\tpath = distro-example\n\turl = https://example.invalid/distro-example\n',
    );
    git("add", "-A");
    writeFileSync(join(scratch, "msg.txt"), "base\n");
    git("commit", "-q", "-F", join(scratch, "msg.txt"));

    // The shipped gate travels into the scratch repository, exactly as a clone's does.
    mkdirSync(join(repo, "hooks"), { recursive: true });
    cpSync(gateFile, join(repo, "hooks", "pre-commit-gate.sh"));
    chmodSync(join(repo, "hooks", "pre-commit-gate.sh"), 0o755);
    // The ONE definition of the change class travels with it: the gate SOURCES it,
    // so a scratch repo without it would measure a missing file, not the gate.
    mkdirSync(join(repo, "scripts"), { recursive: true });
    cpSync(inputsFile, join(repo, "scripts", "pin-contract-inputs.sh"));
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

    // Stage a documentation change, a gitlink change, and the two DECLARATION
    // changes, separately.
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
    // The manifest that DECLARES the pin contract.
    const stageManifest = () => {
      writeFileSync(join(repo, "charly.yml"), "pins: {}\n# the pin contract moved\n");
      git("add", "charly.yml");
    };
    const unstageManifest = () => {
      git("restore", "--staged", "charly.yml");
    };
    // The declared path set the checkout audit walks.
    const stageGitmodules = () => {
      writeFileSync(
        join(repo, ".gitmodules"),
        '[submodule "distro-example"]\n\tpath = distro-example\n\turl = https://example.invalid/distro-example\n[submodule "distro-other"]\n\tpath = distro-other\n\turl = https://example.invalid/distro-other\n',
      );
      git("add", ".gitmodules");
    };
    const unstageGitmodules = () => {
      git("restore", "--staged", ".gitmodules");
    };

    // F1 — a commit that changes the INDEX's gitlinks — one of the pin contract's
    //      commit-carried inputs — runs the pin check, exactly once, and the
    //      self-test exactly once.
    stageDoc();
    stageGitlink();
    const f1 = runGate();
    expect(
      f1.code === 0 && f1.charly.length === 1 && f1.charly[0] === "task pin-check" && f1.self.length === 1,
      `the gate FIRED: a commit that changes the index's gitlinks runs the pin check EXACTLY once and the self-test EXACTLY once`,
    );

    // F2 — a commit that changes NONE of the pin contract's commit-carried inputs
    //      skips the pin check, VISIBLY, and runs the self-test once. The inputs
    //      are the index's gitlinks, the manifest that DECLARES the pin contract
    //      and the declared path set; a commit that changes none of them leaves
    //      every value the check reads as it was, so it cannot violate it.
    unstageGitlink();
    const f2 = runGate();
    expect(
      f2.code === 0 && f2.charly.length === 0 && /SKIPPED/.test(f2.out) && f2.self.length === 1,
      `the gate FIRED: a commit that changes none of the pin contract's inputs SKIPS the pin check visibly (0 invocations) and still runs the self-test once`,
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

    // F4 — a commit that DOES change the index's gitlinks in a tree with no binary
    //      FAILS LOUD: the assertion that judges exactly that cannot run, and a
    //      gate that skipped it silently would read green over a check that never ran.
    stageGitlink();
    const f4 = runGate();
    expect(
      f4.code === 1 && f4.charly.length === 0 && /bootstrap-charly\.sh/.test(f4.out),
      `the gate FIRED: a commit that changes the index's gitlinks with NO charly binary FAILS LOUD (exit 1) and names the fix`,
    );

    // F9 — a commit that changes the MANIFEST in a tree with no binary FAILS LOUD
    //      too. The declaration is a commit-carried input of the check, so the
    //      check is the leg that cannot run — the loud path is the same one, and
    //      it must not be the gitlink's alone.
    unstageGitlink();
    stageManifest();
    const f9 = runGate();
    expect(
      f9.code === 1 && f9.charly.length === 0 && /bootstrap-charly\.sh/.test(f9.out),
      `the gate FIRED: a commit that changes the manifest with NO charly binary FAILS LOUD (exit 1) and names the fix`,
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

    // F7 — a commit that changes ONLY the MANIFEST runs the pin check, exactly
    //      once. The manifest DECLARES the edge (`pin_map`, `pinned_from`), so a
    //      commit that edits the declaration changes what the check compares —
    //      and the class must see it (opencharly/opencharly#661). This is the
    //      assertion the first version of this fixture was missing.
    unstageManifest();
    stageManifest();
    const f7 = runGate();
    expect(
      f7.code === 0 && f7.charly.length === 1 && f7.charly[0] === "task pin-check" && f7.self.length === 1,
      `the gate FIRED: a commit that changes the manifest runs the pin check EXACTLY once`,
    );

    // F8 — and a commit that changes only the DECLARED PATH SET runs it too: the
    //      checkout audit runs over exactly the paths `.gitmodules` declares, so
    //      a path declared with no recorded gitlink is a violation this check
    //      exists to catch.
    unstageManifest();
    stageGitmodules();
    const f8 = runGate();
    expect(
      f8.code === 0 && f8.charly.length === 1 && f8.charly[0] === "task pin-check" && f8.self.length === 1,
      `the gate FIRED: a commit that changes the declared path set runs the pin check EXACTLY once`,
    );

    // F6 — the index the COMMIT carries is the index that is read. Git builds a
    //      temporary index for a path-limited commit (`git commit <path>`): HEAD plus
    //      the selected paths. The repository's own index still holds the staged
    //      path-set change, so a gate that read the repository's index would fire
    //      on a commit that carries none of the pin contract's inputs at all.
    const partialIndex = join(scratch, "partial-index");
    const gitEnv = { ...process.env, GIT_INDEX_FILE: partialIndex };
    spawnSync("git", ["read-tree", "HEAD"], { cwd: repo, env: gitEnv, encoding: "utf8" });
    spawnSync("git", ["add", "README.md"], { cwd: repo, env: gitEnv, encoding: "utf8" });
    const f6 = runGate({}, [partialIndex]);
    expect(
      f6.code === 0 && f6.charly.length === 0 && /SKIPPED/.test(f6.out),
      `the gate FIRED: a path-limited commit is judged on the index IT carries, not on the repository's own index`,
    );
    unstageGitmodules();
    stageGitlink();
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
  // The synthetic root must carry the SHAPE of the repo the gate watches: the
  // manifest that declares the pin contract and the declared path set. Without
  // them the fixture's own existence reading would fail here, and the arms
  // would measure the harness instead of the gate.
  writeFileSync(join(tmp, "charly.yml"), "pins: {}\n");
  writeFileSync(join(tmp, ".gitmodules"), '[submodule "distro-example"]\n\tpath = distro-example\n\turl = https://example.invalid/distro-example\n');
  const gateSrc = readFileSync(gateFile, "utf8");
  const hookSrc = readFileSync(hookFile, "utf8");
  const inputsSrc = readFileSync(inputsFile, "utf8");
  const install = (gate, hook, inputs = inputsSrc) => {
    writeFileSync(join(tmp, gateRel), gate, "utf8");
    chmodSync(join(tmp, gateRel), 0o755);
    writeFileSync(join(tmp, hookRel), hook, "utf8");
    chmodSync(join(tmp, hookRel), 0o755);
    writeFileSync(join(tmp, inputsRel), inputs, "utf8");
  };
  const runFixture = () => spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", tmp], { encoding: "utf8" });

  const mutations = [
    [
      "the change class is ignored",
      "gate",
      (s) => s.replace('if ! pin_contract_touches_input "$STAGED_NAMES" "$STAGED_GITLINK_PATHS"; then', "if ! true; then"),
    ],
    [
      "the manifest leg is dropped",
      "inputs",
      (s) => s.replace("PIN_CONTRACT_DECLARATION_FILES=(charly.yml .gitmodules)", "PIN_CONTRACT_DECLARATION_FILES=(.gitmodules)"),
    ],
    [
      "the declared path set leg is dropped",
      "inputs",
      (s) => s.replace("PIN_CONTRACT_DECLARATION_FILES=(charly.yml .gitmodules)", "PIN_CONTRACT_DECLARATION_FILES=(charly.yml)"),
    ],
    [
      "the declaration files are never watched",
      "inputs",
      (s) => s.replace("PIN_CONTRACT_DECLARATION_FILES=(charly.yml .gitmodules)", "PIN_CONTRACT_DECLARATION_FILES=()"),
    ],
    [
      "the shared definition is not the one the gate reads",
      "gate",
      (s) => s.replace('. "$ROOT/scripts/pin-contract-inputs.sh"', '. "$ROOT/scripts/no-such-file.sh"'),
    ],
    [
      "the pin check runs twice",
      "gate",
      (s) => s.replace('CHARLY_PLUGIN_ONLY=1 "$CHARLY" task pin-check', 'CHARLY_PLUGIN_ONLY=1 "$CHARLY" task pin-check\nCHARLY_PLUGIN_ONLY=1 "$CHARLY" task pin-check'),
    ],
    [
      "the missing binary does not fail loud",
      "gate",
      (s) => s.replace('bootstrap-charly.sh    (in THIS tree: $ROOT)" >&2\n  exit 1', 'bootstrap-charly.sh    (in THIS tree: $ROOT)" >&2\n  exit 0'),
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
    const src = target === "gate" ? gateSrc : target === "inputs" ? inputsSrc : hookSrc;
    const mutated = mutate(src);
    if (mutated === src) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did not apply (the source it targets moved)`);
      continue;
    }
    if (target === "gate") install(mutated, hookSrc);
    else if (target === "inputs") install(gateSrc, hookSrc, mutated);
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
