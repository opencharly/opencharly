#!/usr/bin/env node
// check-design-gate.mjs — the DESIGN gate's CALLER, asserted.
//
// Why it exists. `bash scripts/design-check.sh` composes seven controls — four with
// `--self-test` mutations of their own rules, the examples proven by their committed
// negative cases, the toolchain control proving the pinned `cue` (DESIGN.md A.1, A.2) —
// and, until this gate landed, NOTHING in the tree ran it: `git grep -l design-check origin/main -- charly.yml hooks/ .github`
// returned nothing, so the controls ran only when someone remembered. That is the
// "gate with 0 callers" defect the org has paid for twice already (candy-validate.yml,
// and tag-on-merge failing silently). A control nobody runs enforces nothing, however
// green it is — so the WIRING is a claim, and a claim about a mechanism is verified
// THROUGH the mechanism.
//
// What it asserts, in two halves:
//
//   THE WIRING IS THERE — hooks/pre-push runs the gate, decided by the change class in
//   scripts/design-gate-inputs.sh, the class watches every surface the seven controls
//   read, the leg blocks on a failure, and its skips are visible. The leg must sit
//   BEFORE every body condition, because a push with no body file yet must not walk
//   past the TREE assertion.
//
//   THE WIRING FIRES — every fixture is a REAL git repository and the REAL shipped
//   hook, run the way git runs it (by path, with the repository as its cwd, the refs
//   it publishes on stdin) against a RECORDING design-check. Each design input has its
//   own fired case, because a fixture that fires one class cannot falsify the others,
//   and each has a MUTATION ARM: delete the leg from a copy of the hook and the fired
//   case must go red.
//
// Usage: node scripts/check-design-gate.mjs [--root <dir>]
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

const hookRel = "hooks/pre-push";
const inputsRel = "scripts/design-gate-inputs.sh";
const gateRel = "scripts/design-check.sh";
const manifestRel = "charly.yml";
const commitGateRel = "hooks/pre-commit";

const hookFile = join(root, hookRel);
const inputsFile = join(root, inputsRel);
const gateFile = join(root, gateRel);
const manifestFile = join(root, manifestRel);
const commitGateFile = join(root, commitGateRel);

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);

/** Strip `#` comments so the assertions read CODE, not the prose explaining it.
 *
 *  SHELL HAS NO BLOCK COMMENTS, and this hook is why that matters: it carries the glob
 *  `refs/heads/*` in a `case` arm, and a stripper that treated `/*` as an opener deleted
 *  every line up to the next `*` + `/` — the whole design leg, silently, which read as
 *  nine false findings. The stripper knows only the ONE comment form this language has.
 */
function stripComments(src) {
  return src
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .map((l) => l.replace(/\s+#\s.*$/, ""))
    .join("\n");
}

const countOf = (haystack, needle) => haystack.split(needle).length - 1;

function executable(path) {
  const r = spawnSync("stat", ["-c", "%a", path], { encoding: "utf8" });
  return Number((r.stdout ?? "").trim()) & 0o111;
}

// ── the static readings ───────────────────────────────────────────────────────────
function check() {
  for (const [rel, path] of [
    [hookRel, hookFile],
    [inputsRel, inputsFile],
    [gateRel, gateFile],
    [manifestRel, manifestFile],
  ]) {
    if (!existsSync(path)) {
      fail(`${rel} exists`);
      return;
    }
  }
  for (const [rel, path] of [
    [hookRel, hookFile],
    [gateRel, gateFile],
  ]) {
    if (!executable(path)) fail(`${rel} is executable`);
  }

  const raw = readFileSync(hookFile, "utf8");
  const hook = stripComments(raw);
  const inputs = stripComments(readFileSync(inputsFile, "utf8"));
  const manifest = readFileSync(manifestFile, "utf8");

  // 1. THE GATE IS INVOKED, ONCE, FROM THIS HOOK. Two callers would pay the gate's
  //    12 minutes twice, and a copy of the invocation is how "who runs it" drifts.
  const runs = countOf(hook, 'bash "$gate"');
  if (runs !== 1) fail(`${hookRel} invokes the design gate EXACTLY once (found ${runs})`);
  if (!/design-check\.sh/.test(hook)) fail(`${hookRel} names the gate it runs`);
  if (!/design-gate-inputs\.sh/.test(hook)) fail(`${hookRel} sources the ONE definition of its change class`);
  if (/DESIGN_GATE_ROOT_FILES=/.test(hook)) fail(`${hookRel} keeps no copy of the class — it reads ${inputsRel}`);

  // 2. THE LEG CANNOT BE SKIPPED BY A BODY CONDITION. The gate judges the TREE, and
  //    the hook's body legs may all stand down (no body file, no linter, no python3);
  //    a tree assertion that stood down with them would report a pass it never earned.
  const legCall = hook.indexOf("design_gate_leg");
  const bodyGate = hook.indexOf('[ ! -e "$BODY" ]');
  if (legCall === -1) fail(`${hookRel} calls the design leg`);
  if (bodyGate === -1) fail(`${hookRel} still gates on the PR body`);
  if (legCall !== -1 && bodyGate !== -1 && legCall > bodyGate)
    fail(`${hookRel} runs the design leg BEFORE any body condition (a body-less push must not skip the tree assertion)`);
  if (!/if ! design_gate_leg; then/.test(hook)) fail(`${hookRel} BLOCKS the push when the design leg fails`);
  if (!/BLOCKED — the DESIGN controls/.test(hook)) fail(`${hookRel} names the design gate's own refusal`);
  if (!/bash scripts\/design-check\.sh/.test(hook)) fail(`${hookRel} names the one command that runs the gate by hand`);

  // 3. THE LEG'S OWN NAMES — every one it writes is declared, and every one it declares
  //   is read. Two shapes of the same defect have already cost review rounds across this
  //   org: a bare assignment inside a function LEAKS to the hook's global scope, and a
  //   declaration nobody reads is dead code in a file the change touches. The umbrella has
  //   no shell static analysis (opencharly/opencharly#841), so the assertion counts them
  //   here, over the ONE function this change adds.
  const legStart = hook.indexOf("design_gate_leg() {");
  const legEnd = legStart === -1 ? -1 : hook.indexOf("\n}\n", legStart);
  if (legStart === -1 || legEnd === -1) {
    fail(`${hookRel} defines design_gate_leg() as a complete function`);
  } else {
    const body = hook.slice(legStart, legEnd);
    const declared = new Set();
    for (const m of body.matchAll(/\n\s*local ([^\n]*)/g)) {
      // A `local` line declares every NAME it carries, whether the name is written
      // `name=…`, `name+=…`, or bare — and one line can carry both (`local a="" b`) — so
      // the bare words of a MIXED line are taken too, not only the `=`-carrying ones.
      // Array VALUES (`(DESIGN.md …)`) are skipped by dropping each `(…)` group first, so
      // a value that happens to look like an identifier cannot enter the set.
      const line = m[1].replace(/\([^)]*\)/g, " ");
      for (const w of line.split(/\s+/)) {
        const name = w.replace(/\+?=.*$/, "");
        if (/^[a-z_][a-z0-9_]*$/.test(name)) declared.add(name);
      }
    }
    // Every assignment at the start of a word, `name=` or `name+=`, must be declared.
    const assigned = new Set();
    for (const m of body.matchAll(/(?:^|[\s;&|(])([a-z_][a-z0-9_]*)\+?=/gm)) assigned.add(m[1]);
    for (const name of assigned) {
      if (!declared.has(name)) fail(`${hookRel}: design_gate_leg LEAKS '${name}' to the hook's global scope (declare it local)`);
    }
    for (const name of declared) {
      const uses = (body.match(new RegExp(`\\$\\{?${name}\\b`, "g")) ?? []).length;
      if (uses === 0) fail(`${hookRel}: design_gate_leg declares '${name}' and never reads it (dead code)`);
    }

    // 5. THE GUARD READS THE SAME DEFINITION the change set does. The tree-identity guard
    //   compares the published commit against the tree on the surfaces the controls read;
    //   if it RESTATED that list, a surface added to the class would silently leave the
    //   guard behind, and it would then report a pass over a tree that differs from the
    //   published commit on the new surface — a false PASS with no finding anywhere. The
    //   assertion reads the guard's ASSIGNMENT — the `local` DECLARATION
    //   (`local file_surfaces=()`) is not one — and never its prose: the leg's skip notice
    //   names the surfaces to the contributor, which is not a second definition.
    const assigns = [...body.matchAll(/^([^\n]*?)file_surfaces=\(([^\n]*)\)/gm)].filter((m) => !/^\s*local\b/.test(m[1]));
    const assign = assigns.length > 0 ? assigns[assigns.length - 1] : null;
    if (!assign) {
      fail(`${hookRel}: design_gate_leg assigns file_surfaces`);
    } else {
      const spec = assign[2];
      if (!/\$\{DESIGN_GATE_ROOT_FILES\[@\]\}/.test(spec))
        fail(`${hookRel}: the guard derives its file surfaces from \${DESIGN_GATE_ROOT_FILES[@]}`);
      if (!/\$\{?DESIGN_GATE_TREE_PREFIX\}?/.test(spec))
        fail(`${hookRel}: the guard derives the design tree from \${DESIGN_GATE_TREE_PREFIX}`);
      if (!/\$\{?DESIGN_GATE_CONTROL_PREFIX\}?/.test(spec))
        fail(`${hookRel}: the guard derives the controls' prefix from ${inputsRel}`);
      for (const literal of ["DESIGN.md", "DESIGN.cue", "design/", "scripts/design-"])
        if (spec.includes(literal)) fail(`${hookRel}: the guard restates '${literal}' in file_surfaces — it must read the one definition`);
    }
  }

  // 4. ONE CALLER, and it is the push. The commit gate fires per COMMIT and the gate
  //   is measured at ~12 minutes; putting it there would add minutes to the average
  //   commit and teach contributors to work around it — which is how a gate stops
  //   being one. The class keeps the push-time cost off an ordinary diff.
  if (existsSync(commitGateFile)) {
    const commitGate = stripComments(readFileSync(commitGateFile, "utf8"));
    if (/design-check/.test(commitGate))
      fail(`${commitGateRel} does not run the design gate (it runs at push time, by change class — one caller)`);
  }

  // 4. THE CLASS WATCHES EVERY SURFACE THE CONTROLS READ. A class narrower than what
  //    the controls read is a green light over a tree nobody looked at: a gitlink is
  //    enough (the schema-pattern gate reads each `spec`/`plugin-*` pin's CUE and the
  //    pin-tag control reads every pin of the index), and so is a design file.
  if (!/design_gate_touches_input\(\)/.test(inputs)) fail(`${inputsRel} defines the class test`);
  for (const surface of ["DESIGN.md", "DESIGN.cue", "design/", "scripts/design-"]) {
    if (!inputs.includes(surface)) fail(`${inputsRel} watches ${surface} — a surface the controls read`);
  }
  if (!/160000/.test(raw) && !/gitlinks/.test(hook)) fail(`${hookRel} measures the gitlink paths of the pushed commits`);

  // 6. THE CLASS IS DERIVED FROM THE COMMITS THIS PUSH PUBLISHES — each one's OWN diff.
  //   `git log <sha>` walks every ANCESTOR as well, so a change set built with it is the
  //   whole HISTORY's path list: the class matches a design surface on every push, an
  //   ordinary docs push pays the gate, and it can be refused by a finding about pins it
  //   never touched. A TODO.md-only commit read as 1789 paths on 2026-11-11, and
  //   `--root` keeps a ROOT commit's whole tree in the set, so the class still fails
  //   toward RUNNING the gate (opencharly/opencharly#979).
  if (/git log[^\n]*(--name-only|--name-status)/.test(hook))
    fail(`${hookRel} builds the change set from git log (which walks ancestors) — read each published commit's own diff`);
  if (!/diff-tree[^\n]*--root/.test(hook))
    fail(`${hookRel} reads a ROOT commit's whole tree into the change set (git diff-tree --root)`);

  // 5. THE SAME GATE IS REACHABLE THROUGH THE UMBRELLA'S OWN VERB SURFACE — the task a
  //   session pastes as evidence, and the discoverable form of the gate. It DELEGATES:
  //   a task that re-implemented the set would be a second owner of what is enforced.
  // The block runs to the next TOP-LEVEL key, so its body is what a YAML parser would
  // read as the task — not the first line after the name.
  const taskBlock = /\ndesign-check:\n([\s\S]*?)(?=\n\S)/.exec(manifest);
  if (!taskBlock) fail(`${manifestRel} declares a design-check task`);
  else if (!/command: bash scripts\/design-check\.sh/.test(taskBlock[1]))
    fail(`${manifestRel}'s design-check task DELEGATES to scripts/design-check.sh`);

  if (failures === 0)
    ok(
      `${hookRel} runs the DESIGN gate once, before any body condition, decided by ${inputsRel}; ` +
        `it blocks on findings and names the by-hand command, and the same gate is the design-check task`,
    );
}

// ── the fired assertions ──────────────────────────────────────────────────────────
// The real hook, the real class file, and a RECORDING gate: what is under test is the
// CALLER's decision, not the seven controls (that is `bash scripts/design-check.sh`).

const FAKE_GATE = `#!/usr/bin/env bash
printf 'design-check\\n' >> "$FAKE_DESIGN_LOG"
exit "\${FAKE_DESIGN_EXIT:-0}"
`;

const GITLINK_SHA = "2222222222222222222222222222222222222222";

function fire() {
  const expect = (cond, msg) => (cond ? ok(msg) : fail(msg));

  const mkRepo = (commit) => {
    const scratch = mkdtempSync(join(tmpdir(), "check-design-gate-"));
    const repo = join(scratch, "repo");
    mkdirSync(repo, { recursive: true });
    const git = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "gate@gate");
    git("config", "user.name", "gate");
    writeFileSync(join(repo, "README.md"), "base\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    mkdirSync(join(repo, "hooks"), { recursive: true });
    mkdirSync(join(repo, "scripts"), { recursive: true });
    // The shipped hook and the ONE definition of its class travel into the scratch
    // repository, exactly as a clone's do; the gate is a recorder.
    cpSync(hookFile, join(repo, "hooks", "pre-push"));
    chmodSync(join(repo, "hooks", "pre-push"), 0o755);
    cpSync(inputsFile, join(repo, "scripts", "design-gate-inputs.sh"));
    writeFileSync(join(repo, "scripts", "design-check.sh"), FAKE_GATE);
    chmodSync(join(repo, "scripts", "design-check.sh"), 0o755);
    writeFileSync(join(scratch, "msg.txt"), "c\n");
    commit(scratch, repo, git);
    return { scratch, repo, git };
  };

  /** Run the shipped hook the way git runs it: by path, cwd = the repository. */
  const runHook = (fixture, { refs = "", exit = 0 } = {}) => {
    const log = join(fixture.scratch, "design.log");
    rmSync(log, { force: true });
    const r = spawnSync("bash", [join(fixture.repo, "hooks", "pre-push"), "origin", "https://example.invalid/x"], {
      cwd: fixture.repo,
      encoding: "utf8",
      input: refs,
      env: { ...process.env, FAKE_DESIGN_LOG: log, FAKE_DESIGN_EXIT: String(exit), PR_BODY_FILE: join(fixture.scratch, "PR_BODY.md") },
    });
    const ran = existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((l) => l.trim() !== "").length : 0;
    return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, ran };
  };

  const stage = (fixture, path, content) => {
    const full = join(fixture.repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    fixture.git("add", path);
    fixture.git("commit", "-q", "-m", `touch ${path}`);
    return fixture.git("rev-parse", "HEAD").stdout.trim();
  };

  const stageGitlink = (fixture, path) => {
    fixture.git("update-index", "--add", "--cacheinfo", `160000,${GITLINK_SHA},${path}`);
    fixture.git("commit", "-q", "-m", `pin ${path}`);
    return fixture.git("rev-parse", "HEAD").stdout.trim();
  };

  try {
    // Each design input, fired separately: the class must MATCH each one.
    const inputs = [
      ["a DESIGN.md change", (f) => stage(f, "DESIGN.md", "doc\n")],
      ["a DESIGN.cue change", (f) => stage(f, "DESIGN.cue", "x\n")],
      ["a design/ change", (f) => stage(f, "design/parity.tsv", "row\n")],
      ["a scripts/design-*.sh change", (f) => stage(f, "scripts/design-dpat.sh", "#!/bin/sh\n")],
      ["a pinned-module gitlink", (f) => stageGitlink(f, "plugin-example")],
    ];
    for (const [label, mutate] of inputs) {
      const fixture = mkRepo((scratch, repo, git) => {
        writeFileSync(join(scratch, "msg.txt"), "c\n");
        git("commit", "-q", "-F", join(scratch, "msg.txt"));
      });
      mutate(fixture);
      const r = runHook(fixture);
      expect(r.ran === 1, `the gate RUNS on ${label} (ran ${r.ran}x, exit ${r.code})`);
      expect(/OK \(the design controls pass/.test(r.out), `a passing gate is reported GREEN on ${label}`);
      rmSync(fixture.scratch, { recursive: true, force: true });
    }

    // An ordinary change is NOT the class: the gate must not cost 12 minutes for it.
    {
      const fixture = mkRepo((scratch, repo, git) => {
        writeFileSync(join(scratch, "msg.txt"), "c\n");
        git("commit", "-q", "-F", join(scratch, "msg.txt"));
      });
      stage(fixture, "CHANGELOG/README.md", "notes\n");
      const r = runHook(fixture);
      expect(r.ran === 0, `the gate does NOT run on a diff that changes none of its inputs (ran ${r.ran}x)`);
      expect(/changes none of its inputs/.test(r.out), "the class skip SAYS so, with the by-hand command");
      expect(r.code === 0, "a skip is not a failure");
      rmSync(fixture.scratch, { recursive: true, force: true });
    }

    // A DESIGN-BEARING BASE THAT IS ALREADY PUBLISHED, with a docs-only commit on top:
    // the class must judge THE COMMITS THIS PUSH PUBLISHES, not their ancestry. This is
    // the case the whole-history reading missed — every real push sits on a history that
    // touches `design/`, so the class matched unconditionally and a docs push paid (and
    // could be refused by) the gate (opencharly/opencharly#979). A remote-tracking ref is
    // what `--not --remotes` reads; no network is needed to have one.
    {
      const fixture = mkRepo((scratch, repo, git) => {
        writeFileSync(join(scratch, "msg.txt"), "c\n");
        git("commit", "-q", "-F", join(scratch, "msg.txt"));
      });
      const base = stage(fixture, "DESIGN.md", "the published baseline\n");
      fixture.git("update-ref", "refs/remotes/origin/main", base);
      stage(fixture, "TODO.md", "a docs row\n");
      const r = runHook(fixture);
      expect(r.ran === 0, `the gate does NOT run on a docs-only commit above a design-bearing PUBLISHED base (ran ${r.ran}x)`);
      expect(r.code === 0, "a docs-only push above a design-bearing base is not blocked");
      expect(/changes none of its inputs/.test(r.out), "the docs-only push SAYS the class was not touched");
      rmSync(fixture.scratch, { recursive: true, force: true });
    }

    // A FAILING gate BLOCKS the push.
    {
      const fixture = mkRepo((scratch, repo, git) => {
        writeFileSync(join(scratch, "msg.txt"), "c\n");
        git("commit", "-q", "-F", join(scratch, "msg.txt"));
      });
      stage(fixture, "DESIGN.md", "doc\n");
      const r = runHook(fixture, { exit: 1 });
      expect(r.ran === 1, "the blocking case invokes the gate");
      expect(r.code === 1, "a RED design gate BLOCKS the push (exit 1)");
      expect(/BLOCKED — the DESIGN controls/.test(r.out), "the refusal names the design controls");
      rmSync(fixture.scratch, { recursive: true, force: true });
    }

    // A TREE THAT IS NOT THE PUSHED ONE blocks rather than passing: the controls read
    // the working tree, and a push can publish another branch (opencharly#744). ONE
    // FIXTURE PER SURFACE THE GUARD DERIVES, because a guard that watched only the
    // normative pair would pass a tree differing on the design tree or the controls, and
    // one fired case cannot falsify the others.
    for (const [label, path] of [
      ["the normative pair", "DESIGN.md"],
      ["the design tree", "design/parity.tsv"],
      ["the controls", "scripts/design-dpat.sh"],
    ]) {
      const fixture = mkRepo((scratch, repo, git) => {
        writeFileSync(join(scratch, "msg.txt"), "c\n");
        git("commit", "-q", "-F", join(scratch, "msg.txt"));
      });
      const published = stage(fixture, path, "published\n");
      // The checkout moves BACK to the base, so the tree here is not `published`.
      fixture.git("reset", "-q", "--hard", "HEAD~1");
      const r = runHook(fixture, { refs: `refs/heads/feat/x ${published} refs/heads/feat/x ${"0".repeat(40)}\n` });
      expect(r.code === 1, `a checkout that is not the published tree BLOCKS on ${label} (exit 1)`);
      expect(r.ran === 0, `the gate is NOT run on a tree that differs on ${label}`);
      rmSync(fixture.scratch, { recursive: true, force: true });
    }
    {
      const fixture = mkRepo((scratch, repo, git) => {
        writeFileSync(join(scratch, "msg.txt"), "c\n");
        git("commit", "-q", "-F", join(scratch, "msg.txt"));
      });
      const published = stage(fixture, "DESIGN.md", "published\n");
      fixture.git("reset", "-q", "--hard", "HEAD~1");
      const r = runHook(fixture, { refs: `refs/heads/feat/x ${published} refs/heads/feat/x ${"0".repeat(40)}\n` });
      expect(/NOT\b[\s\S]*the commit this push publishes/.test(r.out), "the refusal says the tree is not the pushed one");
      rmSync(fixture.scratch, { recursive: true, force: true });
    }

    // THE MUTATION ARM: delete the leg's CALL from a copy of the hook and the fired
    // class case must go red. A fixture that cannot fail proves nothing.
    {
      const fixture = mkRepo((scratch, repo, git) => {
        writeFileSync(join(scratch, "msg.txt"), "c\n");
        git("commit", "-q", "-F", join(scratch, "msg.txt"));
      });
      const hookPath = join(fixture.repo, "hooks", "pre-push");
      const mutated = readFileSync(hookPath, "utf8").replace(
        /if ! design_gate_leg; then\n\s*exit 1\nfi\n/,
        "",
      );
      if (mutated === readFileSync(hookPath, "utf8")) {
        fail("the mutation arm APPLIES (the leg's call was found in the shipped hook)");
      } else {
        writeFileSync(hookPath, mutated);
        stage(fixture, "DESIGN.md", "doc\n");
        const r = runHook(fixture);
        expect(r.ran === 0, "MUTATION: with the leg's call deleted, a design-class push no longer runs the gate");
      }
      rmSync(fixture.scratch, { recursive: true, force: true });
    }
  } catch (e) {
    fail(`the fired fixtures ran (${e instanceof Error ? e.message : String(e)})`);
  }
}

check();
fire();

if (failures > 0) {
  console.error(`check-design-gate: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-design-gate: the DESIGN gate has a caller, and the caller fires");
