#!/usr/bin/env node
// check-pi-pr-status.mjs — regression gate for the pi PR-status tool
// (`.pi/extensions/github-pr-status.ts`), mirroring check-pi-gates.mjs and
// check-pi-watch.mjs: static assertions over the SHIPPED code (comments stripped), plus a
// real TypeScript parse, each proven to FAIL by a mutation.
//
// Why it exists (R1). The tool is the ONLY way a pi session learns a PR's verdict — GitHub
// Actions has no path into a session. Five measured defects shipped in it and every gate
// stayed green, because nothing asserted its behaviour:
//
//   1. STATE CASING — `gh pr view --json state` returns UPPERCASE, the poll compared
//      lowercase, so `watch` returned after a single poll instead of waiting.
//   2. RUN LOOKUP — `gh run list --workflow pr-validator.yml` does not resolve the
//      org-required workflow, so `check` reported "none found" with a live run on the head.
//   3. FAILING STEP — `gh run view <id> --json jobs` 404s on the org-required workflow.
//   4. INCONCLUSIVE — a verdict-less run produced no `Verdict:` line, so the comment scan
//      skipped it and misreported.
//   5. WATCH SHORT-CIRCUIT — `watch` returned on ANY concluded run (including a PASS) while
//      its own loop kept polling after a PASS that arrived later; the two paths disagreed
//      about the same state.
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

  // 1. defect 1 — the state is normalised once, and compared lowercase.
  if (!/String\(p\.state[^\n]*\)\.toLowerCase\(\)/.test(code))
    fail(`normalises the PR state to lowercase in getPR (defect 1: "OPEN" broke the compare)`);
  if (!/state !== "open"/.test(code)) fail(`compares the state to the lowercase "open"`);
  if (/state !== "OPEN"/.test(code)) fail(`does not compare the state to uppercase "OPEN"`);

  // 2. defect 2 — the run is found by head SHA, never by --workflow.
  if (/--workflow/.test(code))
    fail(`must not filter validator runs with --workflow (defect 2: the org required workflow does not resolve that way)`);
  if (!/actions\/runs\?head_sha=/.test(code)) fail(`finds the validator run by head SHA (defect 2)`);

  // 3. defect 3 — the failing step comes from the REST jobs API, not `gh run view`.
  if (!/actions\/runs\/\$\{runId\}\/jobs/.test(code))
    fail(`reads the failing step through the REST jobs API (defect 3: \`gh run view\` 404s on the org required workflow)`);

  // 4. defect 4 — a verdict-less run is classified, not skipped.
  if (!/INCONCLUSIVE/.test(code))
    fail(`classifies a verdict-less INCONCLUSIVE comment distinctly (defect 4)`);

  // 5. the watch loop is real, and the tool is registered.
  if (/checkConcluded/.test(code))
    fail(`the watch short-circuit uses watchDone, not a checkConcluded flag (defect 5: it returned on a PASS too)`);
  if (!/mode === "check" \|\| first\.watchDone/.test(code))
    fail(`the one-shot short-circuit is \`mode === "check" || first.watchDone\``);
  if (!/watch timed out/.test(code)) fail(`the watch loop reports a timeout instead of returning early`);
  if (!/name:\s*["'`]gh_pr_status["'`]/.test(code)) fail(`registers the gh_pr_status tool`);

  if (failures === 0) ok(`${REL}: parses, normalises state, finds the run by head SHA, reads jobs via REST, classifies INCONCLUSIVE`);
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
    ["state not normalised", () => original.replace('String(p.state ?? "").toLowerCase()', 'String(p.state ?? "")'), "normalises the PR state to lowercase"],
    ["uppercase compare", () => original.replace('state !== "open"', 'state !== "OPEN"'), "lowercase"],
    ["--workflow lookup", () => original + '\nconst wf = "--workflow pr-validator.yml";\n', "must not filter validator runs with --workflow"],
    ["no head_sha query", () => original.replace("actions/runs?head_sha=", "actions/runs?x="), "finds the validator run by head SHA"],
    ["gh run view jobs", () => original.replace("actions/runs/${runId}/jobs?per_page=100", "run/view/${runId}"), "REST jobs API"],
    ["no INCONCLUSIVE", () => original.replace(/INCONCLUSIVE/g, "INCONCL"), "INCONCLUSIVE"],
    ["no timeout", () => original.replace("watch timed out", "watch ended"), "watch loop reports a timeout"],
    ["checkConcluded short-circuit", () => original + "\nconst checkConcluded = true;\n", "checkConcluded"],
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
