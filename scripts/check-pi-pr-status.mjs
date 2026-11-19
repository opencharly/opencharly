#!/usr/bin/env node
// check-pi-pr-status.mjs — regression gate for the pi PR-status tool
// (`.pi/extensions/github-pr-status.ts`), mirroring the other `check-pi-*.mjs` gates: static
// assertions over the SHIPPED code (comments stripped), plus a real TypeScript parse, each
// proven to FAIL by a mutation.
//
// Why it exists (R2). The tool once carried its own `gh` shell-outs, its own classifier and
// its own 60 s poll loop — a fourth watcher, with five measured defects of its own. It is now
// a BINDING of the ONE engine (`scripts/gh/lib/watch.ts`, opencharly/opencharly#1140), whose
// behaviour `scripts/check-gh-tools.mjs` tests. This gate holds the binding to that shape:
//
//   1. PARSES as TypeScript.
//   2. DELEGATES — it imports the shared engine and classifies with its `classify`.
//   3. ADDS NO SECOND WATCHER — no `gh` shell-out (`execFile`), no poll loop, no `watch` mode.
//   4. REGISTERED — the `gh_pr_status` tool exists.
//
// Usage: node scripts/check-pi-pr-status.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTypeScript } from "./lib/ts-syntax.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const REL = ".pi/extensions/github-pr-status.ts";

/** Strip line/block comments so the assertions read CODE, not commentary. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);

function check() {
  const file = join(root, REL);
  if (!existsSync(file)) {
    fail(`${REL} exists`);
    return;
  }
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);

  // 0. PARSE (R1: a regex gate cannot see an unparseable extension).
  const parseErr = parseTypeScript(raw);
  if (parseErr) fail(`${REL} parses as TypeScript (${parseErr})`);

  // 2. it delegates to the ONE engine.
  if (!/from "\.\.\/\.\.\/scripts\/gh\/lib\/watch\.ts"/.test(code))
    fail(`imports the shared engine scripts/gh/lib/watch.ts (one classifier for every harness)`);
  if (!/\bclassify\(/.test(code)) fail(`classifies with the engine's classify()`);

  // 3. it adds no second watcher.
  if (/\bexecFile\b|child_process/.test(code)) fail(`does not shell out to gh (the engine owns the GitHub client)`);
  if (/setTimeout|setInterval|while\s*\(|for\s*\(\s*;\s*;/.test(code))
    fail(`has no poll loop of its own (waiting is the watcher's job)`);
  if (/["'`]watch["'`]/.test(code)) fail(`has no watch mode`);

  // 4. the tool is registered.
  if (!/name:\s*["'`]gh_pr_status["'`]/.test(code)) fail(`registers the gh_pr_status tool`);

  if (failures === 0) ok(`${REL}: parses, delegates to scripts/gh/lib/watch.ts, adds no second watcher, registered`);
}

// ── --self-test: prove each assertion goes RED on a mutation ──────────────────
if (argv.includes("--self-test")) {
  const file = join(root, REL);
  if (!existsSync(file)) {
    console.error(`check-pi-pr-status --self-test: ${REL} missing`);
    process.exit(1);
  }
  const original = readFileSync(file, "utf8");
  const tmp = mkdtempSync(join(tmpdir(), "check-pi-pr-status-"));
  mkdirSync(join(tmp, ".pi/extensions"), { recursive: true });
  const stage = (text) => writeFileSync(join(tmp, REL), text, "utf8");
  const runGate = () =>
    spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", tmp], {
      encoding: "utf8",
    }).status;

  stage(original);
  if (runGate() !== 0) {
    console.error("  FAIL  the unmutated staged copy is not green");
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
  console.log("  PASS  the unmutated staged copy is GREEN");

  const mutations = [
    ["unparseable", () => original + "\nconst broken = ;\n", "parses as TypeScript"],
    ["own engine", () => original.replace('from "../../scripts/gh/lib/watch.ts"', 'from "./my-watch.ts"'), "imports the shared engine"],
    ["own classifier", () => original.replace("classify(s)", "myClassify(s)").replace("  classify,\n", ""), "classifies with the engine"],
    ["gh shell-out", () => original + '\nimport { execFile } from "node:child_process";\n', "does not shell out to gh"],
    ["poll loop", () => original + "\nsetTimeout(() => {}, 60000);\n", "no poll loop"],
    ["watch mode", () => original + '\nconst mode = "watch";\n', "no watch mode"],
    ["no tool", () => original.replace('name: "gh_pr_status"', 'name: "gh_pr_status_X"'), "registers the gh_pr_status tool"],
  ];

  let stFails = 0;
  for (const [name, mutate, expect] of mutations) {
    stage(mutate());
    if (runGate() === 0) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did NOT go red (expected a '${expect}' finding)`);
    } else {
      console.log(`  PASS  mutation '${name}' is caught`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  if (stFails) {
    console.error(`check-pi-pr-status --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-pi-pr-status --self-test: OK (every assertion is live)");
  process.exit(0);
}

check();
if (failures) {
  console.error(`check-pi-pr-status: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pi-pr-status: OK");
