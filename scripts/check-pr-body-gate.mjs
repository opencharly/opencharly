#!/usr/bin/env node
// check-pr-body-gate.mjs — regression gate for the umbrella's PRE-PUSH body gate
// (`hooks/pre-push`, the clone-level git hook installed by `charly task hooks`).
//
// Why it exists (opencharly/marketplace#404). The org judges PR bodies with its own
// linter (`marketplace/scripts/pr_body_lint.py`), and the validator reads the body
// LIVE — so every body defect that linter can catch mechanically (a missing required
// section, a trailer that is not the last line, a bare `N/A`, an ellipsized fence, a
// pasted head SHA that is not HEAD) was being paid for in review rounds instead of
// seconds. The linter existed; nothing RAN it before the push. This file is the hook's
// assertion, in the shape this wave settled on: static readings over the shipped text
// PLUS assertions that FIRE the real hook against real git repositories, each proven
// to go RED by a mutation.
//
// Why firing, not just reading (the wave's second lesson): a claim about a mechanism
// must be verified THROUGH the mechanism. A regex cannot see whether the hook's
// missing-body branch exits 0, whether the git-dir default actually resolves in a
// linked worktree, or whether a lint finding reaches the push — only running it can.
//
// Usage: node scripts/check-pr-body-gate.mjs [--root <dir>] [--self-test]
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
const rel = "hooks/pre-push";
const file = join(root, rel);

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

function check() {
  if (!existsSync(file)) {
    fail(`${rel} exists`);
    return;
  }
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);

  // 1. Executable, because git silently IGNORES a non-executable hook: a mode bit lost
  //    in a commit turns the gate off with no error anywhere.
  const mode = (() => {
    try {
      return Number((spawnSync("stat", ["-c", "%a", file], { encoding: "utf8" }).stdout ?? "").trim());
    } catch {
      return 0;
    }
  })();
  if (!(mode & 0o111)) fail(`${rel} is executable (mode ${mode.toString(8)})`);

  // 2. The body path convention: the GIT DIR by default, overridable, and never the
  //    tracked tree (a body committed into the worktree is a body that dirties it and
  //    that two worktrees would fight over).
  if (!/--absolute-git-dir/.test(code)) fail(`resolves the body path from the git dir (--absolute-git-dir)`);
  if (!/PR_BODY_FILE/.test(code)) fail(`honours a PR_BODY_FILE override`);
  if (/\$\{PR_BODY_FILE:-\$?ROOT\//.test(code)) fail(`does not default the body path into the tracked tree`);

  // 3. The two SKIPS must not fail closed: a missing body is the discipline failing, and
  //    an unmaterialized `marketplace` submodule would otherwise make every fresh
  //    worktree unlandable. Both branches must exit 0 and SAY what to do.
  const absentBodyBranch = /if \[ ! -e "\$BODY" \]; then([\s\S]*?)\nfi/.exec(code)?.[1] ?? "";
  if (!absentBodyBranch) fail(`has an explicit missing-body branch`);
  else if (!/exit 0/.test(absentBodyBranch)) fail(`a missing body SKIPS (exit 0) instead of failing closed`);
  const absentLintBranch = /if \[ ! -f "\$LINT" \]; then([\s\S]*?)\nfi/.exec(code)?.[1] ?? "";
  if (!absentLintBranch) fail(`has an explicit missing-linter branch`);
  else if (!/exit 0/.test(absentLintBranch)) fail(`a missing linter SKIPS (exit 0) instead of failing closed`);
  if (!/marketplace\/scripts\/pr_body_lint\.py/.test(code)) fail(`names the marketplace body linter it runs`);

  if (failures === 0)
    ok(
      `${rel}: executable, git-dir body path with an override, both skips visible and never fail-closed, ` +
        `and it runs the marketplace body linter`,
    );
}

// ── the fired assertions ────────────────────────────────────────────────────────────
// Every fixture is a REAL git repository and the REAL linter; the hook is run as git
// runs it — by path, with the repository as its cwd. The only thing synthesised is the
// body under test.

/** A body the linter accepts: the four required sections, all rules answered, trailer last. */
const GOOD_BODY = `## Summary
Fixture body proving the pre-push hook's decision.

## How tested
\`\`\`
$ true
\`\`\`

## Rulebook compliance
- **R0 — skills first:** fixture.
- **R1 — RCA every anomaly:** N/A — no anomaly in this fixture.
- **R2 — finish the cutover:** fixture.
- **R3 — no duplication:** fixture.
- **R4 — no workarounds:** fixture.
- **R4a — fix the product first:** fixture.
- **R5 — delete legacy completely:** fixture.
- **R6 — git safety:** fixture.
- **R7 — prove behaviour, not compilation:** fixture.
- **R7a — live or skip:** fixture.
- **R8 — preserve emitted artifacts:** fixture.
- **R9 — binary equals source:** fixture.
- **R10 — fresh disposable proof:** fixture.

## Change classification
Test fixture, not a real change.

*Assisted-by: DeepSeek Harness ollama-cloud/deepseek-v4.1-flash (documentation reviewed)*
`;

/** A body the linter rejects on form alone. */
const BAD_BODY = "# not a PR body\n";

async function fire() {
  // The linter lives in the marketplace SUBMODULE, which a DEFAULT fresh session worktree does
  // not have. SKIP VISIBLY rather than fail: this checker is wired into `hooks/pre-commit`, so a
  // checker that failed closed on an unmaterialized submodule would make every fresh worktree's
  // commit gate red — the exact fail-closed-infrastructure class the hook it asserts exists to
  // avoid, and the contradiction a reviewer caught in the first version of this file. Live-or-
  // skip, never a silent pass: the skip is printed and names the one command that fixes it.
  const lintSrc = join(root, "marketplace/scripts");
  if (!existsSync(join(lintSrc, "pr_body_lint.py"))) {
    console.log(`  SKIP  ${rel} fired assertions: ${lintSrc} is absent (the marketplace submodule is not materialized in this checkout)`);
    console.log(`  SKIP  materialize it with: git -C ${root} submodule update --init --depth 1 marketplace`);
    return;
  }
  const scratch = mkdtempSync(join(tmpdir(), "check-pr-body-gate-"));
  const repo = join(scratch, "repo");
  const expect = (cond, msg) => (cond ? ok(msg) : fail(msg));
  try {
    // A real repository with a real HEAD: the linter reads the head SHA from it, and a
    // repository without one would fail for a reason that has nothing to do with the hook.
    mkdirSync(repo, { recursive: true });
    const git = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "gate@gate");
    git("config", "user.name", "gate");
    writeFileSync(join(repo, "f.txt"), "x\n");
    git("add", "-A");
    writeFileSync(join(scratch, "msg.txt"), "base\n");
    git("commit", "-q", "-F", join(scratch, "msg.txt"));

    // Run the shipped hook (or a mutated copy) with the repository as cwd, as git does.
    const hook = join(scratch, "hook.sh");
    cpSync(file, hook);
    chmodSync(hook, 0o755);
    const run = (env = {}) => {
      const r = spawnSync("bash", [hook], { cwd: repo, encoding: "utf8", env: { ...process.env, ...env } });
      return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    };
    const gitDir = git("rev-parse", "--absolute-git-dir").stdout.trim();
    const defaultBody = join(gitDir, "PR_BODY.md");

    // The linter as the hook finds it: <repo>/marketplace/scripts/pr_body_lint.py — and it
    // imports a SIBLING module (`squash_body.py`), so the directory is copied WHOLE. A
    // one-file copy makes it die with a traceback that ALSO exits 1, which is exactly how an
    // assertion passes for the wrong reason: the first version of this file asserted only
    // "exit 1" for the defective body and was satisfied by a crash, not by a finding.
    const lintDst = join(repo, "marketplace/scripts");
    const installLinter = () => {
      mkdirSync(join(repo, "marketplace"), { recursive: true });
      cpSync(lintSrc, lintDst, { recursive: true });
    };
    const installLinterWithoutSiblings = () => {
      mkdirSync(lintDst, { recursive: true });
      cpSync(join(lintSrc, "pr_body_lint.py"), join(lintDst, "pr_body_lint.py"));
    };

    // F1 — a body with form defects is BLOCKED at the push BY A FINDING, through the DEFAULT
    //      path (no PR_BODY_FILE), which is what proves the git-dir convention end to end.
    installLinter();
    writeFileSync(defaultBody, BAD_BODY);
    const bad = run();
    expect(
      bad.code === 1 && /BLOCKED/.test(bad.out) && /FAIL {2}sections:/.test(bad.out),
      `hooks/pre-push FIRED: a defective body is BLOCKED at the push (exit 1) by the linter's own FAIL finding, found at the git-dir default`,
    );

    // F2 — a well-formed body passes.
    writeFileSync(defaultBody, GOOD_BODY);
    const good = run();
    expect(good.code === 0 && /pre-push: OK/.test(good.out), `hooks/pre-push FIRED: a well-formed body passes (exit 0)`);

    // F3 — NO body: skip visibly and do NOT fail closed (a missing body is the discipline
    //      failing, not a defect in the diff).
    rmSync(defaultBody, { force: true });
    const missing = run();
    expect(
      missing.code === 0 && /SKIPPED/.test(missing.out) && missing.out.includes("PR_BODY.md"),
      `hooks/pre-push FIRED: no body SKIPS visibly (exit 0) and names the path to create`,
    );

    // F4 — the linter is absent (an unmaterialized marketplace submodule in a fresh
    //      worktree): skip visibly, never block the push for a missing tool. The override
    //      is exercised here too.
    const elsewhere = join(scratch, "elsewhere.md");
    writeFileSync(elsewhere, GOOD_BODY);
    rmSync(join(repo, "marketplace"), { recursive: true, force: true });
    const noLint = run({ PR_BODY_FILE: elsewhere });
    expect(
      noLint.code === 0 && /SKIPPED/.test(noLint.out) && /marketplace/.test(noLint.out),
      `hooks/pre-push FIRED: a missing linter SKIPS visibly (exit 0) and names the fix; PR_BODY_FILE is honoured`,
    );

    // F5 — the linter EXISTS but cannot RUN, because its sibling module is missing — the exact
    //      shape a partial submodule materialization produces. A tool that cannot run is NOT a
    //      finding, and exit code alone cannot tell the two apart (a traceback also exits 1),
    //      which is why the hook pre-flights with `--help`. It must skip visibly, never block.
    rmSync(join(repo, "marketplace"), { recursive: true, force: true });
    writeFileSync(defaultBody, GOOD_BODY);
    installLinterWithoutSiblings();
    const brokenLint = run();
    expect(
      brokenLint.code === 0 && /cannot run here/.test(brokenLint.out),
      `hooks/pre-push FIRED: a linter that cannot run SKIPS visibly (exit 0) instead of blocking a legitimate push`,
    );
  } catch (err) {
    fail(`firing ${rel} (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ── --self-test: prove each fired assertion goes RED on a mutation ─────────────────
if (argv.includes("--self-test")) {
  if (!existsSync(file)) {
    console.error(`check-pr-body-gate --self-test: ${rel} missing`);
    process.exit(1);
  }
  const original = readFileSync(file, "utf8");
  const tmp = mkdtempSync(join(tmpdir(), "check-pr-body-gate-self-"));
  mkdirSync(join(tmp, "hooks"), { recursive: true });
  // `fire()` needs the REAL linter — and the linter imports a sibling module, so the whole
  // scripts directory travels with it. When the submodule is absent this root carries no
  // marketplace at all, the fired assertions skip, and the mutations that depend on them are
  // reported as skipped rather than as failures (the check-harness-config.mjs precedent: a
  // surface not materialized in THIS checkout is skipped with a NOTICE, and the report names
  // how many arms were live instead of aborting on an ENOENT).
  const lintPresent = existsSync(join(root, "marketplace/scripts/pr_body_lint.py"));
  if (lintPresent) {
    mkdirSync(join(tmp, "marketplace"), { recursive: true });
    cpSync(join(root, "marketplace/scripts"), join(tmp, "marketplace/scripts"), { recursive: true });
  }
  const runGate = () => {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", tmp], { encoding: "utf8" });
    return r.status;
  };
  const mutations = [
    [
      "missing body fails closed",
      (s) =>
        s.replace(
          /if \[ ! -e "\$BODY" \]; then\n  echo "pre-push: no PR body at \$BODY[^\n]*\n/,
          'if [ ! -e "$BODY" ]; then\n  echo "nope"; exit 1\n  echo "pre-push: no PR body at $BODY',
        ),
      "no body SKIPS visibly",
    ],
    [
      "missing linter fails closed",
      (s) =>
        s.replace(
          /if \[ ! -f "\$LINT" \]; then\n  echo "pre-push: \$LINT is absent[^\n]*\n/,
          'if [ ! -f "$LINT" ]; then\n  echo "nope"; exit 1\n  echo "pre-push: $LINT is absent',
        ),
      "missing linter SKIPS visibly",
    ],
    [
      "a lint finding does not block the push",
      (s) => s.replace(/if python3 "\$LINT" "\$BODY" --repo "\$ROOT"; then/, 'if true; then'),
      "defective body is BLOCKED",
    ],
    [
      "a linter that cannot run blocks the push",
      (s) => s.replace(/if ! python3 "\$LINT" --help >\/dev\/null 2>&1; then/, "if false; then"),
      "linter that cannot run SKIPS visibly",
    ],
    [
      "the body path defaults into the tracked tree",
      (s) => s.replace(/BODY="\$\{PR_BODY_FILE:-\$GITDIR\/PR_BODY\.md\}"/, 'BODY="${PR_BODY_FILE:-$ROOT/PR_BODY.md}"'),
      "found at the git-dir default",
    ],
  ];
  let stFails = 0;
  let stLive = 0;
  let stSkipped = 0;
  for (const [name, mutate, expect] of mutations) {
    if (!lintPresent) {
      // Every mutation here targets a FIRED assertion, and with no linter to fire there is
      // nothing to judge. Skipped VISIBLY: never counted as caught, never a silent pass.
      stSkipped += 1;
      console.log(`  SKIP  mutation '${name}': the marketplace submodule is not materialized, so the fired assertion it targets cannot run`);
      continue;
    }
    const mutated = mutate(original);
    if (mutated === original) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did not apply (the source it targets moved)`);
      continue;
    }
    writeFileSync(join(tmp, rel), mutated, "utf8");
    chmodSync(join(tmp, rel), 0o755);
    stLive += 1;
    if (runGate() === 0) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did NOT go red (expected a '${expect}' finding)`);
    } else {
      console.log(`  PASS  mutation '${name}' is caught (gate red)`);
    }
  }
  writeFileSync(join(tmp, rel), original, "utf8");
  chmodSync(join(tmp, rel), 0o755);
  if (runGate() !== 0) {
    stFails += 1;
    console.error("  FAIL  the unmutated copy is not green");
  } else {
    console.log("  PASS  the unmutated copy is GREEN");
  }
  rmSync(tmp, { recursive: true, force: true });
  if (stFails) {
    console.error(`check-pr-body-gate --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log(
    `check-pr-body-gate --self-test: OK (${stLive}/${mutations.length} arms live` +
      `${stSkipped ? `; ${stSkipped} skipped — the marketplace submodule is not materialized in this checkout` : ""})`,
  );
  process.exit(0);
}

await check();
await fire();
if (failures) {
  console.error(`check-pr-body-gate: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pr-body-gate: OK");
