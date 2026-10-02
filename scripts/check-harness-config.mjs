#!/usr/bin/env node
// check-harness-config.mjs — validates the umbrella's harness-config surfaces (rule 8:
// harness config lives at this root, not in a submodule) and the wiring between them.
//
// It exists because the root carries several per-harness surfaces that nothing else
// reads: a JSON surface that stops parsing, an exec bit lost off a committed gate
// script, a hooks block dropped from .claude/settings.json, or a permission grant that
// widens past read-only is a silent capability loss — none of it is exercised by
// `task verify` (the pinning audit, which does not read these surfaces).
//
// WHICH assertions discriminate. Two classes, and they are NOT the same claim. The split
// below is MEASURED, not intended — `node scripts/check-harness-config.mjs --root <a main
// checkout>` is the measurement, and it is the one to re-run if `main` moves:
//   * DISCRIMINATING — the assertion FAILS on `main`, so going green is evidence the
//     surface is present and wired: check 4 in full, check 3's plugin-set arm (main
//     enables 14 plugins, this branch 28), and check 5's POSITIVE `charly status *` arm
//     (main grants no `charly status *` entry and no `charly check *` entry; it DOES grant
//     `charly task *` and `./charly/bin/charly task *`, which this check does not touch).
//   * STRUCTURAL — PASSES on `main` too, and NOT claimed to discriminate: check 1's four
//     JSON-parse assertions, check 2's four assertions (both gate scripts pre-exist AND
//     are already executable), check 3's hooks-block arm (main retains it), and check 5's
//     NEGATIVE arms — which pass on `main` precisely BECAUSE `main` grants none of those
//     three verbs, so a tree that grants none of them satisfies them vacuously. They are a
//     regression guard on the positive arm, not evidence of this branch.
// `--self-test` proves that split by EXECUTING it rather than asserting it: every
// mutation must turn the gate RED carrying the mutated check's own message.
//
// Checks:
//   1. Every harness JSON parses (and is an object).                        [structural]
//   2. The two committed gate scripts exist and are executable.            [structural]
//   3. .claude/settings.json retains its hooks block and the enabled
//      plugin set.                                    [hooks: struct | plugins: disc]
//   4. .claude/workflows/audit-deploy-configs.js EXISTS. A Claude workflow is invoked by
//      name, so nothing "lists" it — existence is the whole check, and this comment says
//      exactly that.                                                    [discriminating]
//   5. opencode.json auto-allows the READ-ONLY `charly status *`, and does
//      NOT auto-allow ANY of the three `charly check *` verbs — each runs
//      code an operator would want to approve: `check run *` is the
//      destructive R10 bed gate, `check box *` starts a disposable
//      container, `check live *` checks a running deployment.
//                                                 [status: disc | negative: struct]
//
// Usage:
//   node scripts/check-harness-config.mjs                 # check this tree
//   node scripts/check-harness-config.mjs --root <dir>    # check another tree
//   node scripts/check-harness-config.mjs --self-test     # prove the split above

import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
// --root lets the checks run against another tree; --self-test uses it on mutated copies
// of this tree (and is the only caller that passes it).
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

// The verbs opencode.json must NOT auto-allow, each with the reason, quoted from charly's
// OWN verb help so the characterization here and the product cannot drift apart:
//   check run  — "Run a disposable check bed (R10 sequence)": the destructive gate; it
//                builds, deploys, probes and tears down.
//   check box  — "Pure-box check (disposable container, build-scope checks)": it starts a
//                container (read-only about the PROJECT, but not a no-op on the host).
//   check live — "Full-stack check against a running deployment": it executes checks
//                against a live deployment.
// Only the read-only `charly status *` report is granted. `check box *` is guarded here
// too: an earlier revision claimed three verbs but asserted two, and a claim wider than
// the assertion is the defect class this gate exists to catch.
const MUST_NOT_AUTO_ALLOW = [
  ["charly check run *", "the destructive R10 bed gate — it builds, deploys, probes and tears down"],
  ["charly check box *", "it starts a disposable container to run build-scope checks"],
  ["charly check live *", "it executes a full-stack check against a running deployment"],
];

// ── --self-test: prove the discriminating/structural split by executing it ──────────
// Copies every surface this gate reads into a temp tree, asserts the gate is GREEN there
// (so the copy is faithful), then applies ONE mutation at a time and asserts the gate goes
// RED with that check's own message. Every mutation is reverted by re-copying all surfaces
// from this tree first, so the mutations never compound. Runs BEFORE the checks and exits,
// so `--self-test` output is exactly the self-test's.
if (argv.includes("--self-test")) {
  const { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync } = await import("node:fs");
  const { spawnSync } = await import("node:child_process");
  const { tmpdir } = await import("node:os");

  const surfaces = [
    ".claude/settings.json",
    ".claude/workflows/audit-deploy-configs.js",
    ".claude/hooks/pre-commit-gate.sh",
    ".claude/hooks/pre-push-gate.sh",
    "opencode.json",
    ".reasonix/settings.json",
    ".opencode/package.json",
  ];

  const tmp = mkdtempSync(join(tmpdir(), "check-harness-config-"));
  const tree = join(tmp, "tree");
  const stage = () => {
    rmSync(tree, { recursive: true, force: true });
    for (const p of surfaces) {
      const dst = join(tree, p);
      mkdirSync(dirname(dst), { recursive: true });
      cpSync(join(root, p), dst);
      chmodSync(dst, statSync(join(root, p)).mode & 0o777);
    }
  };
  const runGate = () => {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", tree], {
      encoding: "utf8",
    });
    return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  };

  let failures = 0;
  const bad = (m) => {
    failures += 1;
    console.error(`  FAIL  ${m}`);
  };

  stage();
  const base = runGate();
  if (base.code !== 0) bad(`the unmutated copy of this tree is not green:\n${base.out}`);
  else console.log("  PASS  the unmutated copy of this tree is GREEN (the copy is faithful)");

  // [surface, mutation, the message the mutation must provoke, the check it exercises]
  const mutations = [
    [".claude/settings.json", (p) => writeFileSync(p, "{ nope"), "does not parse", "1"],
    [".claude/hooks/pre-commit-gate.sh", (p) => rmSync(p), "pre-commit-gate.sh exists", "2"],
    [".claude/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); delete s.hooks; writeFileSync(p, JSON.stringify(s)); }, "retains the PreToolUse hooks block", "3"],
    [".claude/workflows/audit-deploy-configs.js", (p) => rmSync(p), "audit-deploy-configs.js exists", "4"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); o.permission.bash["charly check run *"] = "allow"; writeFileSync(p, JSON.stringify(o)); }, 'does not auto-allow "charly check run *"', "5 (negative arm, run — the destructive R10 gate)"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); o.permission.bash["charly check box *"] = "allow"; writeFileSync(p, JSON.stringify(o)); }, 'does not auto-allow "charly check box *"', "5 (negative arm, box — the arm an earlier revision claimed but did not assert)"],
    [".claude/hooks/pre-push-gate.sh", (p) => chmodSync(p, 0o644), "pre-push-gate.sh is executable", "2 (a lost exec bit must FAIL, not pass)"],
    [".claude/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); s.enabledPlugins = {}; writeFileSync(p, JSON.stringify(s)); }, "enables the plugin set", "3 (plugin-set arm)"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); delete o.permission.bash["charly status *"]; writeFileSync(p, JSON.stringify(o)); }, 'grants "charly status *"', "5 (positive arm)"],
  ];
  for (const [surface, mutate, expect, check] of mutations) {
    stage(); // revert everything, then apply exactly this mutation
    mutate(join(tree, surface));
    const r = runGate();
    if (r.code === 0) bad(`check ${check}: mutating ${surface} did NOT make the gate fail`);
    else if (!r.out.includes(expect)) bad(`check ${check}: mutating ${surface} failed, but without "${expect}":\n${r.out}`);
    else console.log(`  PASS  check ${check}: mutating ${surface} is caught (${expect})`);
  }

  rmSync(tmp, { recursive: true, force: true });
  if (failures > 0) {
    console.error(`check-harness-config --self-test: ${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log("check-harness-config --self-test: OK (every check is live; the structural ones are named in the header)");
  process.exit(0);
}

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (c, m) => (c ? pass(m) : fail(m));
// A missing surface is a FAIL, never a crash: an unguarded readFileSync throws ENOENT out
// of the gate, aborting all remaining checks with a stack trace instead of reporting which
// surfaces are absent.
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null);
// A JSON surface reads as {} when missing or malformed: check 1 reports that explicitly, so
// the check using it then fails on the absent field rather than aborting the whole gate.
const jsonOr = (p) => {
  const t = read(p);
  try {
    return t === null ? {} : JSON.parse(t);
  } catch {
    return {};
  }
};

// 1. Every harness JSON parses. STRUCTURAL: all four exist on `main` too, so this class
//    is not the branch's evidence — read it as "an existing surface stays valid".
for (const p of [
  ".claude/settings.json",
  "opencode.json",
  ".reasonix/settings.json",
  ".opencode/package.json",
]) {
  const t = read(p);
  if (t === null) {
    fail(`${p} is missing`);
    continue;
  }
  try {
    const v = JSON.parse(t);
    ok(v && typeof v === "object" && !Array.isArray(v), `${p} parses as a JSON object`);
  } catch (e) {
    fail(`${p} does not parse: ${e.message}`);
  }
}

// 2. The committed gate scripts exist and are executable. STRUCTURAL: both are on `main`
//    already — an absent script or a lost exec bit is still a silent capability loss, so
//    the assertion is worth keeping even though it is not this branch's evidence.
for (const h of [".claude/hooks/pre-commit-gate.sh", ".claude/hooks/pre-push-gate.sh"]) {
  const p = join(root, h);
  const exists = existsSync(p);
  ok(exists, `${h} exists`);
  if (exists) ok((statSync(p).mode & 0o111) !== 0, `${h} is executable`);
}

// 3. .claude/settings.json keeps its hooks block and the enabled plugin set.
{
  const s = jsonOr(".claude/settings.json");
  ok(Array.isArray(s.hooks?.PreToolUse) && s.hooks.PreToolUse.length > 0, ".claude/settings.json retains the PreToolUse hooks block");
  const plugins = Object.keys(s.enabledPlugins ?? {});
  ok(plugins.length >= 20, `.claude/settings.json enables the plugin set (${plugins.length} plugins)`);
}

// 4. The Claude workflow exists (invoked by name — nothing lists it).
ok(existsSync(join(root, ".claude/workflows/audit-deploy-configs.js")), ".claude/workflows/audit-deploy-configs.js exists");

// 5. opencode.json auto-allows the read-only status report and NOTHING that runs code an
//    operator would want to approve. The negative arm is the point: an auto-allow on
//    `charly check run` would let an agent run the destructive R10 bed gate with no
//    approval prompt, and one on `check box` would let it start containers unprompted.
{
  const o = jsonOr("opencode.json");
  const bash = o.permission?.bash ?? {};
  ok(Object.hasOwn(bash, "charly status *"), 'opencode.json grants "charly status *" (read-only)');
  for (const [g, why] of MUST_NOT_AUTO_ALLOW) {
    ok(!Object.hasOwn(bash, g), `opencode.json does not auto-allow "${g}" — ${why}`);
  }
}

if (failures > 0) {
  console.error(`check-harness-config: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("check-harness-config: OK");
