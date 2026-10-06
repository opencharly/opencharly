#!/usr/bin/env node
// check-pi-question.mjs — regression gate for the pi `question` tool
// (`.pi/extensions/question.ts`), mirroring the other `check-pi-*.mjs` gates: static
// assertions over the SHIPPED code (comments stripped), plus a real TypeScript parse, each
// proven to FAIL by a mutation.
//
// Why it exists (R7/R1). The tool is the operator's requested way for an agent to ask a
// question and block for the answer. The properties that matter, each a real defect class:
//
//   1. NO HEAVY DEPENDENCY — it must use the builtin `ctx.ui.select` / `ctx.ui.input`, never
//      `@earendil-works/pi-tui` (the custom-widget example would add a dependency for nothing).
//   2. HEADLESS-SAFE — a non-TUI session has nobody to prompt, so it must return a clear
//      "ask in prose" result, never throw and never fake an answer.
//   3. SERIALIZED — a prompt is exclusive UI, so the tool declares `executionMode: "sequential"`
//      (two concurrent prompts would race).
//   4. REGISTERED + WIRED — the `question` tool exists AND `.pi/settings.json` loads it (an
//      unwired extension never loads).
//
// Usage: node scripts/check-pi-question.mjs [--root <dir>] [--self-test]
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
const REL = ".pi/extensions/question.ts";
const REL_SETTINGS = ".pi/settings.json";

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

  const parseErr = parseTypeScript(raw);
  if (parseErr) fail(`${REL} parses as TypeScript (${parseErr})`);

  // 1. no heavy dependency.
  if (/@earendil-works\/pi-tui/.test(code))
    fail(`uses the builtin ctx.ui primitives, not @earendil-works/pi-tui`);

  // 2. headless-safe.
  if (!/ctx\.mode !== "tui"/.test(code))
    fail(`guards a non-TUI session (a headless call must not throw or fake an answer)`);
  if (!/ctx\.hasUI/.test(code)) fail(`checks ctx.hasUI before prompting`);

  // 3. the two UI primitives.
  if (!/ctx\.ui\.select\(/.test(code)) fail(`uses ctx.ui.select for a pick-one list`);
  if (!/ctx\.ui\.input\(/.test(code)) fail(`uses ctx.ui.input for a free-text answer`);

  // 4. serialized + registered.
  if (!/executionMode:\s*["'`]sequential["'`]/.test(code))
    fail(`declares executionMode "sequential" (two concurrent prompts would race)`);
  if (!/name:\s*["'`]question["'`]/.test(code)) fail(`registers the question tool`);

  // 5. wired into the session.
  if (!existsSync(join(root, REL_SETTINGS))) {
    fail(`${REL_SETTINGS} exists`);
  } else {
    const s = JSON.parse(readFileSync(join(root, REL_SETTINGS), "utf8"));
    const list = Array.isArray(s.extensions) ? s.extensions : [];
    if (!list.some((e) => String(e).includes("question.ts")))
      fail(`${REL_SETTINGS} lists ./extensions/question.ts (an unwired extension never loads)`);
  }

  if (failures === 0) ok(`${REL}: parses, dependency-free, headless-safe, serialized, registered + wired`);
}

// ── --self-test: prove each assertion goes RED on a mutation ──────────────────
if (argv.includes("--self-test")) {
  const srcFiles = [REL, REL_SETTINGS];
  const missing = srcFiles.filter((p) => !existsSync(join(root, p)));
  if (missing.length > 0) {
    console.error(`check-pi-question --self-test: missing ${missing.join(", ")}`);
    process.exit(1);
  }
  const original = new Map(srcFiles.map((p) => [p, readFileSync(join(root, p), "utf8")]));
  const tmp = mkdtempSync(join(tmpdir(), "check-pi-question-"));
  const stage = () => {
    for (const p of srcFiles) {
      const dst = join(tmp, p);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, original.get(p), "utf8");
    }
  };
  const runGate = () =>
    spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", tmp], {
      encoding: "utf8",
    }).status;

  stage();
  if (runGate() !== 0) {
    console.error("  FAIL  the unmutated staged copy is not green");
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
  console.log("  PASS  the unmutated staged copy is GREEN");

  const ext = original.get(REL);
  const mutations = [
    ["unparseable", REL, () => ext + "\nconst broken = ;\n", "parses as TypeScript"],
    ["pi-tui dependency", REL, () => ext.replace('from "typebox"', 'from "typebox";\nimport { Text } from "@earendil-works/pi-tui"'), "not @earendil-works/pi-tui"],
    ["no headless guard", REL, () => ext.replace('ctx.mode !== "tui"', "false"), "non-TUI session"],
    ["no hasUI check", REL, () => ext.replace("!ctx.hasUI", "false"), "ctx.hasUI"],
    ["no select", REL, () => ext.replace("ctx.ui.select(", "ctx.ui.selectX("), "ctx.ui.select"],
    ["no input", REL, () => ext.replace("ctx.ui.input(", "ctx.ui.inputX("), "ctx.ui.input"],
    ["not serialized", REL, () => ext.replace('executionMode: "sequential"', 'executionMode: "parallel"'), 'executionMode "sequential"'],
    ["no tool", REL, () => ext.replace('name: "question"', 'name: "question_X"'), "registers the question tool"],
    ["unwired", REL_SETTINGS, () => JSON.stringify({ extensions: ["./extensions/charly-gates.ts"] }), "lists ./extensions/question.ts"],
  ];

  let stFails = 0;
  for (const [name, file, mutate, expect] of mutations) {
    stage();
    writeFileSync(join(tmp, file), mutate(), "utf8");
    if (runGate() === 0) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did NOT go red (expected a '${expect}' finding)`);
    } else {
      console.log(`  PASS  mutation '${name}' is caught`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  if (stFails) {
    console.error(`check-pi-question --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-pi-question --self-test: OK (every assertion is live)");
  process.exit(0);
}

check();
if (failures) {
  console.error(`check-pi-question: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pi-question: OK");
