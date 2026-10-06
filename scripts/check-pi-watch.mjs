#!/usr/bin/env node
// check-pi-watch.mjs — regression gate for the pi wake binding
// (`.pi/extensions/watch.ts`) and its armed-items file (`.pi/watch.items`), mirroring
// check-pi-gates.mjs and check-pr-watch.mjs: static assertions over the SHIPPED code
// (comments stripped), each proven to FAIL by a mutation.
//
// Why it exists (T3/R4/B12). The pi extension is the ONLY thing that turns a
// harness-neutral watcher event into a pi user turn — pi has no background-completion
// notification, so without it every wait is hand-polled or dropped. The properties this
// gate pins, each a real defect class:
//
//   1. IT DELEGATES — it must spawn the harness-neutral scripts
//      (`marketplace/scripts/gh_watch.sh`, `scripts/check-bed-watch.sh`) and contain NO
//      hand-rolled poll loop (`setInterval` / `while(true)` / `for(;;)` / `pollOnce`). A
//      re-implementation is the R3 duplication this check forbids.
//   2. IT WAKES — delivery is `pi.sendUserMessage(..., {deliverAs:"followUp"})`, and the
//      GitHub watcher is AUTO-ARMED from `.pi/watch.items` at `session_start`.
//   3. IT RE-ARMS — the one-shot watcher is re-armed on its exit (the re-arm invariant);
//      a rate limit (exit 7) or a usage error (exit 5) is terminal, never blind-retried.
//   4. IT CLEANS UP — `session_shutdown` kills every child.
//   5. SHIPPED INERT — `.pi/watch.items` is comment-only, and the extension is listed in
//      `.pi/settings.json` (an unwired extension is the defect this catches).
//
// Usage: node scripts/check-pi-watch.mjs [--root <dir>] [--self-test]
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

const REL_EXT = ".pi/extensions/watch.ts";
const REL_ITEMS = ".pi/watch.items";
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
  const extPath = join(root, REL_EXT);
  if (!existsSync(extPath)) {
    fail(`${REL_EXT} exists`);
    return;
  }
  const raw = readFileSync(extPath, "utf8");
  const code = stripComments(raw);

  // 0. PARSE. A regex gate cannot see an unparseable extension (R1).
  const parseErr = parseTypeScript(raw);
  if (parseErr) fail(`${REL_EXT} parses as TypeScript (${parseErr})`);

  // 1. delegates to the neutral tooling; contains no poll loop of its own.
  if (!/gh_watch\.sh/.test(code)) fail(`spawns the neutral marketplace/scripts/gh_watch.sh`);
  if (!/check-bed-watch\.sh/.test(code)) fail(`spawns the neutral scripts/check-bed-watch.sh`);
  for (const banned of ["setInterval", "while (true)", "while(true)", "for (;;)", "pollOnce"]) {
    if (code.includes(banned)) fail(`contains no hand-rolled poll loop (found '${banned}')`);
  }

  // 2. it wakes: sendUserMessage + auto-arm at session_start.
  if (!/sendUserMessage/.test(code)) fail(`delivers events via pi.sendUserMessage`);
  if (!/deliverAs\s*:\s*["'`]followUp["'`]/.test(code)) fail(`uses deliverAs "followUp" for a busy session`);
  if (!/pi\.on\(\s*["'`]session_start["'`]/.test(code)) fail(`arms the watcher at session_start`);
  if (!/armGh\(/.test(code)) fail(`arms the GitHub watcher (armGh)`);

  // 3. it re-arms on exit; a rate limit / usage error is terminal.
  if (!/proc\.on\(\s*["'`]exit["'`]/.test(code)) fail(`re-arms on the watcher's exit`);
  if (!/rearmTimer/.test(code)) fail(`schedules the re-arm (rearmTimer)`);

  // 3b. ARM GENERATION (the defect of #408). A superseded arm's exit must never be counted as a
  //     failure and must never re-arm: an ALREADY-STOPPED child's exit used to clear the live
  //     arm's slot, re-arm a DUPLICATE, and the duplicate's `watch_lock --takeover` TERMed the
  //     live watcher (silent exit 143 — no stdout, no stderr) → three “fast failures” →
  //     `WATCHER FATAL … last stderr: (none)`, the re-arm loop stopped, and a stray watcher kept
  //     holding the lock. Also: a lock loss (exit 6) is a PEER, not a failure, and never a FATAL.
  if (!/gen\s*!==\s*gh\.gen/.test(code))
    fail(`ignores a SUPERSEDED arm's exit (the arm-generation guard)`);
  if (!/if\s*\(gh\.proc === proc\)\s*gh\.proc = null;/.test(code))
    fail(`clears the tracked slot only for its OWN child (a stale arm must not clear it)`);
  if (!/gh\.gen\+\+;/.test(code))
    fail(`supersedes the running arm BEFORE a restart kills it (armGh may return without arming)`);
  if (!/code === 6/.test(code)) fail(`treats a lock loss (exit 6) as a peer holder, not as a failure`);
  if (!/code\s*===\s*7/.test(code) || !/code\s*===\s*5/.test(code))
    fail(`treats a rate limit (7) / usage error (5) as terminal — never blind-retried`);

  // 4. it cleans up.
  if (!/pi\.on\(\s*["'`]session_shutdown["'`]/.test(code)) fail(`kills its children in session_shutdown`);
  if (!/\.kill\(/.test(code)) fail(`kills the child processes`);

  // 5. the tool surface.
  if (!/name:\s*["'`]watch_arm["'`]/.test(code)) fail(`registers the watch_arm tool`);
  if (!/isGithubItem/.test(code)) fail(`validates the item grammar (isGithubItem)`);

  // 6. shipped inert + wired.
  if (!existsSync(join(root, REL_ITEMS))) {
    fail(`${REL_ITEMS} exists`);
  } else {
    const active = readFileSync(join(root, REL_ITEMS), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    if (active.length > 0)
      fail(`${REL_ITEMS} ships INERT (comment-only) — found an armed item: ${active[0]}`);
  }
  if (!existsSync(join(root, REL_SETTINGS))) {
    fail(`${REL_SETTINGS} exists`);
  } else {
    const s = JSON.parse(readFileSync(join(root, REL_SETTINGS), "utf8"));
    const list = Array.isArray(s.extensions) ? s.extensions : [];
    if (!list.some((e) => String(e).includes("watch.ts")))
      fail(`${REL_SETTINGS} lists ./extensions/watch.ts (an unwired extension never loads)`);
  }

  if (failures === 0) ok(`${REL_EXT}: delegates, wakes, re-arms, cleans up, ships inert + wired`);
}

// ── --self-test: prove each assertion goes RED on a mutation ──────────────────
if (argv.includes("--self-test")) {
  const srcFiles = [REL_EXT, REL_ITEMS, REL_SETTINGS];
  const missing = srcFiles.filter((p) => !existsSync(join(root, p)));
  if (missing.length > 0) {
    console.error(`check-pi-watch --self-test: missing ${missing.join(", ")}`);
    process.exit(1);
  }
  const original = new Map(srcFiles.map((p) => [p, readFileSync(join(root, p), "utf8")]));
  const tmp = mkdtempSync(join(tmpdir(), "check-pi-watch-"));
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

  const ext = original.get(REL_EXT);
  const mutations = [
    ["unparseable", REL_EXT, () => ext + "\nconst broken = ;\n", "parses as TypeScript"],
    ["no gh_watch.sh", REL_EXT, () => ext.replace(/gh_watch\.sh/g, "gh_watch-DISABLED.sh"), "gh_watch.sh"],
    ["no bed watcher", REL_EXT, () => ext.replace(/check-bed-watch\.sh/g, "check-bed-DISABLED.sh"), "check-bed-watch.sh"],
    ["no delivery", REL_EXT, () => ext.replace(/sendUserMessage/g, "__no_send__"), "sendUserMessage"],
    ["poll loop", REL_EXT, () => ext + "\nsetInterval(() => {}, 1);\n", "poll loop"],
    ["no session_start", REL_EXT, () => ext.replace(/pi\.on\(\s*"session_start"/g, 'pi.on("session_start_DISABLED"'), "session_start"],
    ["no shutdown kill", REL_EXT, () => ext.replace(/pi\.on\(\s*"session_shutdown"/g, 'pi.on("session_shutdown_DISABLED"'), "session_shutdown"],
    ["blind retry", REL_EXT, () => ext.replace(/code === 7/g, "false === 7"), "rate limit"],
    ["no tool", REL_EXT, () => ext.replace(/name:\s*"watch_arm"/g, 'name: "watch_arm_DISABLED"'), "watch_arm"],
    ["no arm-generation guard", REL_EXT, () => ext.replace(/if \(gen !== gh\.gen\) return;/g, "if (false) return;"), "SUPERSEDED arm"],
    ["stale arm clears the live slot", REL_EXT, () => ext.replace(/if \(gh\.proc === proc\) gh\.proc = null;/, "gh.proc = null;"), "only for its OWN child"],
    ["no restart supersede", REL_EXT, () => ext.replace(/gh\.gen\+\+;/, ""), "supersedes the running arm"],
    ["lock loss is a failure", REL_EXT, () => ext.replace(/if \(code === 6\) \{/, "if (false) {"), "lock loss (exit 6)"],
    ["armed items", REL_ITEMS, () => "\nacme/widget#12\n", "ships INERT"],
    ["unwired", REL_SETTINGS, () => JSON.stringify({ extensions: ["./extensions/charly-gates.ts"] }), "lists ./extensions/watch.ts"],
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
    console.error(`check-pi-watch --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-pi-watch --self-test: OK (every assertion is live)");
  process.exit(0);
}

check();
if (failures) {
  console.error(`check-pi-watch: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pi-watch: OK");
