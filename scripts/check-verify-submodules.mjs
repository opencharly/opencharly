#!/usr/bin/env node
// check-verify-submodules.mjs — regression gate for the step of the umbrella's own
// `verify` task that stays INLINE, exercised against FIXTURES built in a temp dir.
//
// `charly.yml` now composes the canonical plugin verb `verb:git-submodules {mode: verify}`
// for the module loop. The branch==remote-default audit and charly's nested `box/*` drift
// audit used to share ONE hand-rolled shell step with that loop; the checkout half
// (dirty / at-gitlink / the `git -C` walk-up refusal) is the verb's now and is NOT
// fixture-tested here. What REMAINS inline — and is what this gate guards — is the
// nested-submodule audit plus the uninitialized-charly notice.
//
// Why the nested half exists (opencharly/opencharly#337): charly's nested `box/*` audit
// carried the same bug the module loop did, in its `grep -E '^[+-]'` — git's `-` marker
// means NOT INITIALIZED, not drifted, so the audit reported the ordinary state of a
// session worktree as a FAIL. The inline step now greps only `^[+U]` (`+` = drifted off
// charly's gitlink, `U` = unmerged) and REPORTS the `-` count as a notice, because an
// uninitialized nested submodule is not a violation. The module-loop half of #337 — the
// `[ -d "$path" ]` dead guard, the `git -C` directory walk-up, and the dirty/gitlink
// teeth — is no longer implemented in this repo: it is owned by `verb:git-submodules
// {mode: verify}`, which `charly.yml` composes, and is therefore not fixture-tested here.
//
// The step is EXTRACTED FROM charly.yml, never copied, so a fixture run always
// exercises the shipped text and the two cannot drift (R3).
//
// Asserted — each proven LIVE by --self-test against a mutation of the step:
//   A. a nested submodule left UNINITIALIZED (`-`) is GREEN and REPORTED, not drift (the fix)
//   H. charly/ itself NOT INITIALIZED gets a NOTICE and is GREEN, never a silent pass
//   F. a nested submodule DRIFTED off charly's gitlink (`+`) still FAILS           (teeth kept)
//
// Usage: node scripts/check-verify-submodules.mjs [--root <dir>] [--self-test]
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

/** A bare remote carrying one commit on `main`. */
function makeRemote(base, name) {
  const bare = join(base, `${name}.git`);
  mkdirSync(bare, { recursive: true });
  git(["init", "--bare", "-q", bare], base);
  const seed = join(base, `seed-${name}`);
  mkdirSync(seed);
  git(["init", "-q", seed], base);
  writeFileSync(join(seed, "f.txt"), `${name}\n`);
  git(["add", "f.txt"], seed);
  git(["commit", "-qm", `seed ${name}`], seed);
  git(["push", "-q", bare, "main"], seed);
  return { bare, seed };
}

/**
 * Extract the `command:` block scalar of the nested-submodule step from charly.yml.
 * The step's identity is its `check:` line; the block ends at the first non-blank line
 * indented at or above the `command:` key.
 */
function extractStepCommand(yamlPath) {
  const lines = readFileSync(yamlPath, "utf8").split("\n");
  const stepRe = /^(\s*)-\s*check:\s*charly's own nested submodules are at their gitlinks/;
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

/**
 * A superproject holding ONE submodule, `charly`, whose own remote carries ONE nested
 * submodule, `box/arch` (declared and gitlinked). `opts` then breaks ONE property at a
 * time:
 *   default        — charly is a REAL initialized submodule; `box/arch` is declared and
 *                    gitlinked but left UNINITIALIZED (exactly what `git submodule
 *                    update --init charly` leaves behind in a session worktree).
 *   charlyUninit   — charly is DECLARED in the super's `.gitmodules` AND gitlinked in its
 *                    index, but never initialized: the path is a bare directory with no
 *                    `.git`.
 *   nestedDrift    — `box/arch` is initialized, its remote moved forward, and the local
 *                    checkout advanced onto the new tip, so it drifts off the gitlink
 *                    charly records. charly is configured to ignore its own nested
 *                    submodule (`ignore = all`, a LOCAL config, so charly's tree stays
 *                    clean) — which makes this step the ONLY witness of the drift.
 */
function buildFixture(script, opts = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "check-verify-submodules-")));
  const nested = makeRemote(base, "nested");
  const charly = makeRemote(base, "charly");

  // charly carries one nested submodule (`box/arch`), as the real one does.
  git(["submodule", "add", "-q", "-b", "main", `file://${nested.bare}`, "box/arch"], charly.seed);
  git(["commit", "-qm", "record box/arch"], charly.seed);
  git(["push", "-q", charly.bare, "main"], charly.seed);
  const charlySha = git(["rev-parse", "HEAD"], charly.seed);

  const superDir = join(base, "super");
  mkdirSync(superDir);
  git(["init", "-q", superDir], base);

  if (opts.charlyUninit) {
    // charly is DECLARED and GITLINKED but never initialized — a bare directory the step's
    // `[ -e charly/.git ]` guard must notice rather than silently audit nothing.
    writeFileSync(
      join(superDir, ".gitmodules"),
      `[submodule "charly"]\n\tpath = charly\n\turl = file://${charly.bare}\n\tbranch = main\n`,
      "utf8",
    );
    git(["update-index", "--add", "--cacheinfo", `160000,${charlySha},charly`], superDir);
    mkdirSync(join(superDir, "charly"));
    git(["add", ".gitmodules"], superDir);
    git(["commit", "-qm", "declare charly without initializing it"], superDir);
  } else {
    git(["submodule", "add", "-q", "-b", "main", `file://${charly.bare}`, "charly"], superDir);
    git(["commit", "-qm", "charly"], superDir);
  }

  if (opts.nestedDrift) {
    writeFileSync(join(nested.seed, "f.txt"), "moved\n");
    git(["commit", "-qam", "moved"], nested.seed);
    git(["push", "-q", nested.bare, "main"], nested.seed);
    const arch = join(superDir, "charly", "box", "arch");
    git(["submodule", "update", "--init", "box/arch"], join(superDir, "charly"));
    git(["fetch", "-q", "origin"], arch);
    git(["checkout", "-q", "FETCH_HEAD"], arch);
    // A drifted nested normally also makes charly's OWN `git status` dirty, which the
    // module loop would catch first — so the case that makes the nested audit the ONLY
    // witness is a nested the containing repo is configured to ignore (`ignore = all`,
    // a local config, so the tree stays clean). That is what the `+`/`U` check is for.
    git(["config", "submodule.box/arch.ignore", "all"], join(superDir, "charly"));
  }

  const r = spawnSync("/bin/bash", ["-c", script], { cwd: superDir, encoding: "utf8", env: gitEnv });
  rmSync(base, { recursive: true, force: true });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/** Run every case against ONE version of the step. */
function runCases(script) {
  return {
    A: buildFixture(script),
    H: buildFixture(script, { charlyUninit: true }),
    F: buildFixture(script, { nestedDrift: true }),
  };
}

/** The contract, in one place, so --self-test and the gate assert the SAME expectations. */
function judge(cases) {
  const found = [];
  const need = (name, cond, detail) => {
    if (!cond) found.push(`${name}: ${detail}`);
  };
  const tail = (c) => c.stderr.trim().split("\n").pop();

  need("A", cases.A.status === 0, `an uninitialized nested submodule must be GREEN (exit ${cases.A.status}): ${tail(cases.A)}`);
  need("A", /charly's nested submodules are NOT INITIALIZED/.test(cases.A.stdout), "the nested `-` (uninitialized) must be REPORTED, never counted as drift and never a silent pass");
  need("A", /nested submodules are at their gitlinks, none drifted/.test(cases.A.stdout), "the step must report the OK line");
  need("H", cases.H.status === 0, `an uninitialized charly must be GREEN (exit ${cases.H.status}): ${tail(cases.H)}`);
  need("H", /charly\/ is NOT INITIALIZED: its nested-submodule check is EMPTY/.test(cases.H.stdout), "the step must say charly/ is not initialized rather than checking nothing silently");
  need("F", cases.F.status !== 0, "a nested `box/*` drifted off charly's gitlink must FAIL (teeth)");
  need("F", /charly nested submodules not at their gitlinks/.test(cases.F.stderr), "the nested drift failure must be reported");
  return found;
}

const script = extractStepCommand(join(root, yamlRel));

function check() {
  if (script === null) {
    fail(`${yamlRel}: the 'charly's own nested submodules are at their gitlinks' step (and its command: block) is extractable`);
    return;
  }
  if (!/NOT INITIALIZED/.test(script))
    fail("the step reports an uninitialized path (charly/ or a nested one) — never a silent pass");
  for (const f of judge(runCases(script))) fail(f);
  if (failures === 0) ok(`${yamlRel}: the nested-submodule step reports uninitialized paths and keeps its drift tooth`);
}

// ── --self-test: prove each assertion goes RED on a mutation of the step ─────────────
if (argv.includes("--self-test")) {
  if (script === null) {
    console.error(`check-verify-submodules --self-test: could not extract the step from ${yamlRel}`);
    process.exit(1);
  }
  const baseline = judge(runCases(script));
  if (baseline.length) {
    for (const f of baseline) console.error(`  FAIL  the UNMUTATED step is not green: ${f}`);
    console.error("check-verify-submodules --self-test: FAIL (fix the step first)");
    process.exit(1);
  }
  console.log("  PASS  the unmutated step is GREEN on every fixture");

  // Each mutation reintroduces ONE defect class and names the case that must catch it.
  const mutations = [
    ["uninitialized nested reported as drift (`^[+-]`, the opencharly/opencharly#337 bug)", (s) => s.replace("grep -E '^[+U]'", "grep -E '^[+-]'"), "A"],
    // The fail message spans two lines (the shipped step's `$drift` is on its own line),
    // so remove the WHOLE statement — removing one line would leave a dangling quote and
    // a bash syntax error, which would "fail" case F for the wrong reason.
    ["no nested-drift check", (s) => s.replace(/[ \t]*\[ -z "\$drift" \][\s\S]*?\$drift"\n/, ""), "F"],
    ["the initialization guard cannot see an empty directory (`[ -d ]`, the #337 walk-up bug)", (s) => s.replace("[ -e charly/.git ]", "[ -d charly ]"), "H"],
    // Replace the notice with a no-op so the else branch stays VALID — the plausible
    // defect is a silently removed notice, not a script that no longer parses.
    ["no notice for an uninitialized charly", (s) => s.replace(/[ \t]*echo "verify: notice — charly\/ is NOT INITIALIZED[^\n]*\n/, "  :\n"), "H"],
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
    console.error(`check-verify-submodules --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-verify-submodules --self-test: OK (every assertion is live)");
  process.exit(0);
}

check();
if (failures) {
  console.error(`check-verify-submodules: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-verify-submodules: OK");
