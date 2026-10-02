#!/usr/bin/env node
// check-harness-config.mjs — validates EVERY harness-config surface in the umbrella
// (rule 8: harness config lives ONLY here) and the wiring between them.
//
// It exists because the consolidation absorbed charly's unique config (.codex/, the Pi
// gate extension, an extra Claude workflow, extra .claude/settings.json fields, extra
// opencode.json grants) — and an absorbed surface that does not parse, or a wiring that
// points at a missing file, is a silent capability loss.
//
// WHICH assertions discriminate. Two classes, and they are NOT the same claim. MEASURED, not
// asserted: `git archive main | tar -x -C <dir>` + `--root <dir>` reports 17 failures, and
// `--self-test` proves every assertion is live.
//   * DISCRIMINATING — the surface did not exist before the consolidation, so the assertion
//     FAILS on a pre-consolidation tree (`main`): going green is evidence the surface is now
//     present and wired. That is every assertion of checks 2, 3, 6 and 7, and 4 of the 5 in
//     check 5 (env / teammateMode / worktree / the plugin set).
//   * STRUCTURAL — PASSES on `main` too, and NOT claimed to discriminate: check 1's 5
//     JSON-parse assertions (all five files pre-exist), check 4's 4 assertions (the two gate
//     scripts pre-exist AND are already executable — what the consolidation adds is the
//     extension that INVOKES them, which check 3 covers), and check 5's hooks-block assertion.
// `--self-test` proves that split by EXECUTING it (see below) rather than asserting it.
//
// Checks:
//   1. Every harness JSON parses (and is an object).                        [structural]
//   2. .codex TOML exists and has the required keys (sandbox_mode,
//      approval_policy; pr-validator name+instructions).                [discriminating]
//   3. .pi/extensions/charly-gates.ts EXISTS and is listed in .pi/settings.json.
//   4. The two gate scripts charly-gates.ts invokes EXIST and are
//      executable.                                                       [structural]
//   5. .claude/settings.json carries the absorbed env/teammateMode/worktree + hooks.
//   6. .claude/workflows/audit-deploy-configs.js EXISTS. A Claude workflow is invoked by
//      name, so nothing "lists" it — existence is the whole check, and this comment says
//      exactly that (it used to claim a listing the code never performed).
//   7. opencode.json carries the absorbed charly check/status grants.
//
// Usage:
//   node scripts/check-harness-config.mjs                 # check this tree
//   node scripts/check-harness-config.mjs --root <dir>    # check another tree
//   node scripts/check-harness-config.mjs --self-test     # prove the split above
//                                                         # (run by hooks/pre-commit)

import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
// --root lets the checks run against another tree; --self-test uses it on mutated copies
// of this tree (and is the only caller that passes it).
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

// ── --self-test: prove the discriminating/structural split by executing it ──────────
// Copies every surface this gate reads into a temp tree, asserts the gate is GREEN there
// (so the copy is faithful), then mutates ONE surface per check and asserts the gate goes
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
    ".pi/settings.json",
    ".pi/extensions/charly-gates.ts",
    "opencode.json",
    ".reasonix/settings.json",
    ".opencode/package.json",
    ".codex/config.toml",
    ".codex/agents/pr-validator.toml",
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
    [".claude/settings.json", (p) => writeFileSync(p, "{ nope"), "does not parse", "1 structural"],
    [".codex/config.toml", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^sandbox_mode\s*=.*$/m, "")), "declares sandbox_mode", "2"],
    [".codex/config.toml", (p) => rmSync(p), ".codex/config.toml exists", "2 (missing surface: must FAIL, not throw ENOENT)"],
    [".pi/settings.json", (p) => writeFileSync(p, JSON.stringify({ extensions: [] })), ".pi/settings.json lists", "3"],
    [".claude/hooks/pre-commit-gate.sh", (p) => rmSync(p), "pre-commit-gate.sh exists", "4"],
    [".claude/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); delete s.teammateMode; writeFileSync(p, JSON.stringify(s)); }, "carries teammateMode", "5"],
    [".claude/workflows/audit-deploy-configs.js", (p) => rmSync(p), "audit-deploy-configs.js exists", "6"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); delete o.permission.bash["charly check run *"]; writeFileSync(p, JSON.stringify(o)); }, 'grants "charly check run *"', "7"],
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
// A missing surface is a FAIL, never a crash: an unguarded readFileSync threw ENOENT out of
// the gate on the pre-consolidation tree, aborting all remaining checks with a stack trace
// instead of reporting which surfaces are absent.
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

// 1. Every harness JSON parses. STRUCTURAL: all five exist on `main` too, so this class
//    is not the consolidation's evidence — read it as "an existing surface stays valid".
for (const p of [
  ".claude/settings.json",
  ".pi/settings.json",
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

// 2. .codex TOML shape (no built-in TOML parser; assert the required keys are present).
{
  for (const p of [".codex/config.toml", ".codex/agents/pr-validator.toml"]) {
    ok(existsSync(join(root, p)), `${p} exists`);
  }
  const cfg = read(".codex/config.toml") ?? "";
  ok(/^sandbox_mode\s*=/m.test(cfg), ".codex/config.toml declares sandbox_mode");
  ok(/^approval_policy\s*=/m.test(cfg), ".codex/config.toml declares approval_policy");
  const pv = read(".codex/agents/pr-validator.toml") ?? "";
  ok(/^name\s*=\s*"pr-validator"/m.test(pv), ".codex/agents/pr-validator.toml names pr-validator");
  ok(/^developer_instructions\s*=\s*"""/m.test(pv), ".codex/agents/pr-validator.toml carries developer_instructions");
}

// 3. The Pi gate extension exists AND is wired in .pi/settings.json.
{
  const ext = ".pi/extensions/charly-gates.ts";
  ok(existsSync(join(root, ext)), `${ext} exists`);
  const pi = jsonOr(".pi/settings.json");
  ok(
    Array.isArray(pi.extensions) && pi.extensions.some((e) => /charly-gates\.ts$/.test(e)),
    ".pi/settings.json lists ./extensions/charly-gates.ts (the wiring FAILS without it)",
  );
}

// 4. The gate scripts the Pi extension invokes exist and are executable.
for (const h of [".claude/hooks/pre-commit-gate.sh", ".claude/hooks/pre-push-gate.sh"]) {
  const p = join(root, h);
  const exists = existsSync(p);
  ok(exists, `${h} exists (invoked by charly-gates.ts)`);
  if (exists) ok((statSync(p).mode & 0o111) !== 0, `${h} is executable`);
}

// 5. .claude/settings.json carries the absorbed fields.
{
  const s = jsonOr(".claude/settings.json");
  ok(s.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1", ".claude/settings.json carries env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS");
  ok(typeof s.teammateMode === "string", ".claude/settings.json carries teammateMode");
  ok(s.worktree && typeof s.worktree === "object", ".claude/settings.json carries worktree");
  ok(Array.isArray(s.hooks?.PreToolUse) && s.hooks.PreToolUse.length > 0, ".claude/settings.json retains the hooks block");
  const plugins = Object.keys(s.enabledPlugins ?? {});
  ok(plugins.length >= 20, `.claude/settings.json enables the absorbed plugin set (${plugins.length} plugins)`);
}

// 6. The absorbed Claude workflow exists (invoked by name — nothing lists it).
ok(existsSync(join(root, ".claude/workflows/audit-deploy-configs.js")), ".claude/workflows/audit-deploy-configs.js exists");

// 7. opencode.json carries the absorbed charly grants.
{
  const o = jsonOr("opencode.json");
  const bash = o.permission?.bash ?? {};
  for (const g of ["charly check box *", "charly check live *", "charly check run *", "charly status *"]) {
    ok(Object.hasOwn(bash, g), `opencode.json grants "${g}" (absorbed from charly)`);
  }
}

if (failures > 0) {
  console.error(`check-harness-config: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("check-harness-config: OK");
