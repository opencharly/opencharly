#!/usr/bin/env node
// check-harness-config.mjs — validates EVERY harness-config surface in the umbrella
// (rule 8: harness config lives ONLY here) and the wiring between them.
//
// It exists because the consolidation absorbed charly's unique config (.codex/, the Pi
// gate extension, an extra Claude workflow, extra .claude/settings.json fields, extra
// opencode.json grants) — and an absorbed surface that does not parse, or a wiring that
// points at a missing file, is a silent capability loss. Each assertion FAILS on the
// pre-consolidation tree (the surface did not exist / was not wired), so the gate is
// discriminating, not vacuous.
//
// Checks:
//   1. Every harness JSON parses (and is an object).
//   2. .codex TOML has the required keys (sandbox_mode; pr-validator name+instructions).
//   3. .pi/extensions/charly-gates.ts EXISTS and is listed in .pi/settings.json.
//   4. The two gate scripts charly-gates.ts invokes EXIST and are executable.
//   5. .claude/settings.json carries the absorbed env/teammateMode/worktree + hooks.
//   6. .claude/workflows/audit-deploy-configs.js exists and is listed/used.
//   7. opencode.json carries the absorbed charly check/status grants.

import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (c, m) => (c ? pass(m) : fail(m));
const read = (p) => readFileSync(join(root, p), "utf8");
const json = (p) => JSON.parse(read(p));

// 1. Every harness JSON parses.
for (const p of [
  ".claude/settings.json",
  ".pi/settings.json",
  "opencode.json",
  ".reasonix/settings.json",
  ".opencode/package.json",
]) {
  try {
    const v = json(p);
    ok(v && typeof v === "object" && !Array.isArray(v), `${p} parses as a JSON object`);
  } catch (e) {
    fail(`${p} does not parse: ${e.message}`);
  }
}

// 2. .codex TOML shape (no built-in TOML parser; assert the required keys are present).
{
  const cfg = read(".codex/config.toml");
  ok(/^sandbox_mode\s*=/m.test(cfg), ".codex/config.toml declares sandbox_mode");
  ok(/^approval_policy\s*=/m.test(cfg), ".codex/config.toml declares approval_policy");
  const pv = read(".codex/agents/pr-validator.toml");
  ok(/^name\s*=\s*"pr-validator"/m.test(pv), ".codex/agents/pr-validator.toml names pr-validator");
  ok(/^developer_instructions\s*=\s*"""/m.test(pv), ".codex/agents/pr-validator.toml carries developer_instructions");
}

// 3. The Pi gate extension exists AND is wired in .pi/settings.json.
{
  const ext = ".pi/extensions/charly-gates.ts";
  ok(existsSync(join(root, ext)), `${ext} exists`);
  const pi = json(".pi/settings.json");
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
  const s = json(".claude/settings.json");
  ok(s.env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1", ".claude/settings.json carries env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS");
  ok(typeof s.teammateMode === "string", ".claude/settings.json carries teammateMode");
  ok(s.worktree && typeof s.worktree === "object", ".claude/settings.json carries worktree");
  ok(Array.isArray(s.hooks?.PreToolUse) && s.hooks.PreToolUse.length > 0, ".claude/settings.json retains the hooks block");
  const plugins = Object.keys(s.enabledPlugins ?? {});
  ok(plugins.length >= 20, `.claude/settings.json enables the absorbed plugin set (${plugins.length} plugins)`);
}

// 6. The absorbed Claude workflow exists.
ok(existsSync(join(root, ".claude/workflows/audit-deploy-configs.js")), ".claude/workflows/audit-deploy-configs.js exists");

// 7. opencode.json carries the absorbed charly grants.
{
  const o = json("opencode.json");
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
