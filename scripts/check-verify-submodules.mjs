#!/usr/bin/env node
// check-verify-submodules.mjs — regression gate for the submodule-cleanliness step of
// the umbrella's own `verify` task, exercised against FIXTURES built in a temp dir.
//
// Why it exists (opencharly/opencharly#337): the step's guard read
//   [ -d "$path" ] || fail "$path: not checked out"
// which cannot see anything — an UNINITIALIZED submodule IS a directory — and every
// `git -C <path>` in the step then resolves the ENCLOSING superproject through git's
// directory walk-up. So the step compared the SUPERPROJECT's HEAD against the
// SUBMODULE's gitlink and reported `FAIL: sdk: HEAD <enclosing-head> != gitlink
// <sdk-pin>` — a state that cannot exist, which is the tell. Every path a root has NOT
// materialized is such a bogus-FAIL site, and that count is a property of the ROOT it is
// measured at, because the checkout audit sees only what THAT root materialized — the same
// metric at two roots gives two numbers. Measured on this clone: 405 of 424 paths at the
// umbrella ROOT (19 of 424 materialized, HEAD `f96e776`) and 423 of 424 in a session
// WORKTREE (1 of 424 materialized, `charly`; HEAD `56775ee`). And because `fail` exits at
// the FIRST offender, the symptom is ONE FAIL line, never 405. Since rule 4 puts every
// session in a worktree (which materializes no submodules) and R7 mandates running this
// gate locally on the final tree, the gate was unsatisfiable by construction. charly's
// nested `box/*` audit carried the same bug in its `grep -E '^[+-]'`: git's `-` marker
// means NOT INITIALIZED, not drifted.
//
// The step is EXTRACTED FROM charly.yml, never copied, so a fixture run always
// exercises the shipped text and the two cannot drift (R3).
//
// Asserted — each proven LIVE by --self-test against a mutation of the step:
//   A. uninitialized paths are GREEN, and the step SAYS how much it audited  (the fix)
//   E. charly's nested submodules, uninitialized, are GREEN and reported     (the fix)
//   B. a DIRTY initialized submodule still FAILS                             (teeth kept)
//   C. a submodule not at its recorded gitlink still FAILS                   (teeth kept)
//   D. a .gitmodules path with no gitlink in the index still FAILS           (teeth kept)
//   F. a nested `box/*` drifted off charly's gitlink still FAILS             (teeth kept)
//   G. a path whose `.git` EXISTS but is not a checkout of its own — so `git -C`
//      resolves to the ENCLOSING SUPERPROJECT — still FAILS                  (teeth kept)
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

// The fixture's shape, declared once so the step's own arithmetic can be checked
// against reality rather than against a remembered number. Case G adds one further
// path (mod-020) on top of this base shape; its assertions are about the walk-up
// FAILING, never about counts.
const EXTRA = 19; // mod-001..mod-019: declared AND gitlinked, never initialized
const TOTAL = EXTRA + 2; // + mod-000 + charly
const CHECKED = 2; // mod-000 (a real checkout) + charly (a real checkout, nested empty)
const UNINIT = TOTAL - CHECKED;

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
 * Extract the `command:` block scalar of the submodule-cleanliness step from charly.yml.
 * The step's identity is its `check:` line; the block ends at the first non-blank line
 * indented at or above the `command:` key.
 */
function extractStepCommand(yamlPath) {
  const lines = readFileSync(yamlPath, "utf8").split("\n");
  const stepRe = /^(\s*)-\s*check:\s*every submodule is clean/;
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
 * A superproject of TOTAL entries. `mod-000` and `charly` are REAL initialized
 * submodules at their gitlinks; `charly`'s own nested submodule is declared and
 * recorded but left uninitialized (exactly what `git submodule update --init charly`
 * leaves behind in a session worktree). mod-001..mod-019 are declared and gitlinked
 * but never initialized — the state `git worktree add` leaves behind. `opts` then
 * breaks ONE property at a time.
 */
function buildFixture(script, opts = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "check-verify-submodules-")));
  const nested = makeRemote(base, "nested");
  const charly = makeRemote(base, "charly");
  const mod = makeRemote(base, "mod");

  // charly carries one nested submodule (`box/arch`), as the real one does.
  git(["submodule", "add", "-q", "-b", "main", `file://${nested.bare}`, "box/arch"], charly.seed);
  git(["commit", "-qm", "record box/arch"], charly.seed);
  git(["push", "-q", charly.bare, "main"], charly.seed);

  const superDir = join(base, "super");
  mkdirSync(superDir);
  git(["init", "-q", superDir], base);
  git(["submodule", "add", "-q", "-b", "main", `file://${mod.bare}`, "mod-000"], superDir);
  git(["submodule", "add", "-q", "-b", "main", `file://${charly.bare}`, "charly"], superDir);
  git(["commit", "-qm", "mod-000 + charly"], superDir);

  const modSha = git(["rev-parse", "HEAD"], mod.seed);
  const extra = [];
  for (let n = 1; n <= EXTRA; n++) {
    const name = `mod-${String(n).padStart(3, "0")}`;
    extra.push(`[submodule "${name}"]\n\tpath = ${name}\n\turl = file://${mod.bare}\n\tbranch = main\n`);
    git(["update-index", "--add", "--cacheinfo", `160000,${modSha},${name}`], superDir);
    mkdirSync(join(superDir, name));
  }
  writeFileSync(join(superDir, ".gitmodules"), readFileSync(join(superDir, ".gitmodules"), "utf8") + extra.join(""), "utf8");
  git(["add", ".gitmodules"], superDir);
  git(["commit", "-qm", "declare the remaining submodule paths"], superDir);

  if (opts.dirty) writeFileSync(join(superDir, "mod-000", "untracked.txt"), "x\n");
  if (opts.wrongHead) {
    writeFileSync(join(mod.seed, "f.txt"), "moved\n");
    git(["commit", "-qam", "moved"], mod.seed);
    git(["push", "-q", mod.bare, "main"], mod.seed);
    git(["fetch", "-q", "origin"], join(superDir, "mod-000"));
    git(["checkout", "-q", "FETCH_HEAD"], join(superDir, "mod-000"));
  }
  if (opts.noGitlink) git(["rm", "-q", "--cached", "mod-000"], superDir);
  if (opts.walkUp) {
    // THE WALK-UP WITNESS. mod-020 is DECLARED and GITLINKED with a `.git` that is an
    // EMPTY DIRECTORY, so the step's initialization test (`[ -e "$path/.git" ]`) PASSES
    // and the `--show-toplevel` guard is the ONLY thing standing between the run and a
    // superproject comparison. `git -C mod-020 rev-parse --show-toplevel` finds no valid
    // gitdir AT the path, so discovery CONTINUES UPWARD and returns the enclosing
    // superproject's root — the exact state the guard refuses, and the state the
    // pre-#337 `[ -d "$path" ]` guard let through (measured: an empty-directory `.git`
    // is the construction that reproduces the walk-up; a gitfile or a symlink does not).
    const name = "mod-020";
    writeFileSync(
      join(superDir, ".gitmodules"),
      readFileSync(join(superDir, ".gitmodules"), "utf8") +
        `[submodule "${name}"]\n\tpath = ${name}\n\turl = file://${mod.bare}\n\tbranch = main\n`,
      "utf8",
    );
    git(["update-index", "--add", "--cacheinfo", `160000,${modSha},${name}`], superDir);
    mkdirSync(join(superDir, name, ".git"), { recursive: true });
    git(["add", ".gitmodules"], superDir);
    git(["commit", "-qm", "declare the walk-up path"], superDir);
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
    B: buildFixture(script, { dirty: true }),
    C: buildFixture(script, { wrongHead: true }),
    D: buildFixture(script, { noGitlink: true }),
    F: buildFixture(script, { nestedDrift: true }),
    G: buildFixture(script, { walkUp: true }),
  };
}

/** The contract, in one place, so --self-test and the gate assert the SAME expectations. */
function judge(cases) {
  const found = [];
  const need = (name, cond, detail) => {
    if (!cond) found.push(`${name}: ${detail}`);
  };
  const tail = (c) => c.stderr.trim().split("\n").pop();

  need("A", cases.A.status === 0, `uninitialized paths must be GREEN (exit ${cases.A.status}): ${tail(cases.A)}`);
  need("A", new RegExp(`${UNINIT} of ${TOTAL} submodule paths are NOT INITIALIZED`).test(cases.A.stdout), "the step must REPORT the uninitialized count (never a silent pass)");
  need("A", new RegExp(`${CHECKED} checkout\\(s\\) at their gitlinks`).test(cases.A.stdout), "the step must report how many checkouts it actually audited");
  need("E", /charly's nested submodules are NOT INITIALIZED/.test(cases.A.stdout), "charly's nested `-` (uninitialized) must be reported, not counted as drift");
  need("B", cases.B.status !== 0, "a DIRTY initialized submodule must still FAIL (teeth)");
  need("B", /dirty working tree/.test(cases.B.stderr), "the dirty failure must name the dirty tree");
  need("C", cases.C.status !== 0, "a submodule not at its gitlink must still FAIL (teeth)");
  need("C", /!= gitlink/.test(cases.C.stderr), "the gitlink mismatch failure must be reported");
  need("D", cases.D.status !== 0, "a .gitmodules path with no gitlink must FAIL (teeth)");
  need("D", /no gitlink recorded in the index/.test(cases.D.stderr), "the missing-gitlink failure must be reported");
  need("F", cases.F.status !== 0, "a nested `box/*` drifted off charly's gitlink must FAIL (teeth)");
  need("F", /charly nested submodules not at their gitlinks/.test(cases.F.stderr), "the nested drift failure must be reported");
  need("G", cases.G.status !== 0, "a path git resolves to the ENCLOSING SUPERPROJECT must FAIL (walk-up refused)");
  need("G", /not a checkout of its own/.test(cases.G.stderr), "the walk-up refusal must say so");
  need("G", /git resolves to '[^']*\/super'/.test(cases.G.stderr), "the refusal must NAME the path git actually resolved to (the superproject)");
  return found;
}

const script = extractStepCommand(join(root, yamlRel));

function check() {
  if (script === null) {
    fail(`${yamlRel}: the 'every submodule is clean' step (and its command: block) is extractable`);
    return;
  }
  if (!/not initialized|NOT INITIALIZED/i.test(script))
    fail("the step distinguishes an uninitialized path (the #337 fix)");
  for (const f of judge(runCases(script))) fail(f);
  if (failures === 0) ok(`${yamlRel}: the submodule step reports uninitialized paths and keeps every tooth`);
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
    ["dead guard: `[ -d ]` cannot see an empty directory", (s) => s.replace('[ ! -e "$path/.git" ]', '[ ! -d "$path" ]'), "A"],
    ["uninitialized nested reported as drift (`^[+-]`, the #337 bug)", (s) => s.replace("grep -E '^[+U]'", "grep -E '^[+-]'"), "A"],
    ["no dirty check", (s) => s.replace(/[ \t]*\[ -z "\$\(git -C "\$path" status --porcelain\)" \][^\n]*\n/, ""), "B"],
    ["no gitlink comparison", (s) => s.replace(/[ \t]*\[ "\$gitlink" = "\$head" \][^\n]*\n/, ""), "C"],
    ["no gitlink presence check", (s) => s.replace(/[ \t]*\[ -n "\$gitlink" \][^\n]*\n/, ""), "D"],
    ["no nested-drift check", (s) => s.replace(/[ \t]*\[ -z "\$drift" \][^\n]*\n/, ""), "F"],
    // The walk-up guard this PR adds. Deleting the comparison leaves `top=` assigned and
    // unused, so the step proceeds into `git -C mod-020 …` and compares the SUPERPROJECT's
    // HEAD against mod-020's gitlink — case G then fails by NOT naming the walk-up.
    ["no walk-up refusal (`git -C` may resolve to the enclosing superproject)", (s) => s.replace(/[ \t]*\[ "\$top" = "\$root\/\$path" \][^\n]*\n/, ""), "G"],
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
