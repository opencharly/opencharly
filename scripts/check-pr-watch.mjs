#!/usr/bin/env node
// check-pr-watch.mjs — unit tests for the pure logic in .opencode/plugins/pr-watch.ts.
//
// pr-watch.ts is the OpenCode delivery binding of the ONE watcher engine
// (`scripts/gh/lib/watch.ts`, opencharly/opencharly#1140), whose behaviour
// `scripts/check-gh-tools.mjs` tests. So it is proven by (a) the real module importing
// cleanly as a V2 definition, (b) the pure helpers (`parseItems`/`pickSessionID`)
// behaving, and (c) the delivery
// AND native-poll primitives being present as CODE (not commented out) on BOTH
// generations:
//   - V2 (opencode >= 2.0, MEASURED 2026-09-28 against v2.0.18): the context has NO
//     `client`; delivery is `ctx.session.synthetic({ sessionID, text })` with the
//     session id captured from `ctx.tool.hook("execute.before", …)`.
//   - V1 (opencode 1.x): the SDK client, `client.tui.showToast` + the noReply
//     context injection.
//   - the watcher: the shared engine's `watchStream` (no shell, no second loop).
//
// Usage: node scripts/check-pr-watch.mjs [--root <dir>] [--self-test]

import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
// --root lets the checks run against another tree; --self-test uses it on mutated copies.
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const pluginPath = join(root, ".opencode/plugins/pr-watch.ts");
const loopPath = join(root, ".opencode/lib/watcher-loop.ts");
// The shared detached loop now lives in `lib/watcher-loop.ts` (R2 extraction) and
// `pr-watch.ts` imports it; the primitive assertions therefore scan the PAIR.
const source =
  readFileSync(pluginPath, "utf8") + "\n" + readFileSync(loopPath, "utf8");

// Strip BOTH block comments (`/* … */`, including the ` *`-prefixed docstring) and
// whole-line `//` comments, so a commented-out call no longer counts as present (the
// exact regression this gate exists for: a "load-bearing" call left as a comment). A
// docstring alone must never satisfy the primitive assertions below.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}
const code = stripComments(source);

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (cond, m) => (cond ? pass(m) : fail(m));
const eq = (a, b, m) =>
  ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)})`);

const mod = await import(pathToFileURL(pluginPath).href);
const { pickSessionID, WATCH_EVENTS } = mod;
const { parseItemsFile } = await import(pathToFileURL(join(root, "scripts", "gh", "lib", "watch.ts")).href);

ok(
  mod.default !== null && typeof mod.default === "object" && typeof mod.default.setup === "function",
  "default export is the V2 { id, setup } definition",
);
ok(typeof pickSessionID === "function", "the pure helper pickSessionID is exported");
// THE ITEM GRAMMAR IS THE ENGINE'S (R2, opencharly/opencharly#1308): the plugin must import the
// shared reader and own no acceptance set — its private copy silently dropped `#issuecomment`
// URLs the engine accepts.
{
  const src = readFileSync(pluginPath, "utf8");
  // Asserted on the IMPORT, not on the name appearing somewhere: a mutation that deletes the
  // import but keeps the calls would leave a dangling identifier and still satisfy a name test.
  ok(
    /import\s*\{[^}]*\bparseItemsFile\b[^}]*\}\s*from\s*["'][^"']*scripts\/gh\/lib\/watch\.ts["']/.test(src),
    "the plugin imports the engine's item reader (parseItemsFile from scripts/gh/lib/watch.ts)",
  );
  // Any local definition counts, whatever the binding form — `function`, `const` or a class.
  ok(
    !/\b(?:function|const|let|var|class)\s+parseItems\b|isGithubItem/.test(src),
    "the plugin owns no item grammar of its own",
  );
}

// THE FIX: the delivered event set MUST include `comment` (the BLOCK/PASS review) AND
// `verdict` (the charly/pr-validator run reaching a status) beside the terminal outcomes.
{
  const set = new Set(String(WATCH_EVENTS).split(",").map((s) => s.trim()));
  for (const ev of ["comment", "verdict", "merged", "closed"]) {
    ok(set.has(ev), `WATCH_EVENTS includes '${ev}' (got ${WATCH_EVENTS})`);
  }
}

eq(
  parseItemsFile("acme/widget#12\n\n# comment\n  acme/other#3  \n"),
  ["acme/widget#12", "acme/other#3"],
  "the shared reader trims, drops blanks and # comments, preserves order",
);
eq(parseItemsFile("# only comments\n\n"), [], "the shared reader yields [] for a comment-only config");
// The forms a binding's private copy dropped: the reader must PASS THEM THROUGH (the engine
// validates by name, exit 5 — a reader that filtered turned that refusal into silence).
eq(
  parseItemsFile("opencharly/opencharly/pull/1301#issuecomment-1\ngithub.com/o/r/pull/5\no/r/pull/5/"),
  ["opencharly/opencharly/pull/1301#issuecomment-1", "github.com/o/r/pull/5", "o/r/pull/5/"],
  "the shared reader passes item forms through verbatim (no private acceptance set)",
);

const dir = "/work";
const sessions = [
  { id: "old-root", directory: dir, time: { updated: 10 } },
  { id: "child", directory: dir, parentID: "old-root", time: { updated: 99 } },
  { id: "new-root", directory: dir, time: { updated: 50 } },
  { id: "other-dir", directory: "/elsewhere", time: { updated: 100 } },
];
eq(
  pickSessionID(sessions, dir),
  "new-root",
  "pickSessionID picks the most recently updated root session in the directory (ignores children and other dirs)",
);
eq(pickSessionID(sessions, "/none"), undefined, "pickSessionID returns undefined when no session matches");
eq(pickSessionID([], dir), undefined, "pickSessionID tolerates an empty list");
eq(
  pickSessionID([{ directory: dir, time: { updated: 1 } }], dir),
  undefined,
  "pickSessionID ignores sessions without a string id",
);

// Negative control: the stripper MUST remove a docstring and a `//` comment, so needles
// that live only there cannot satisfy the positive assertions below.
const synthetic =
  "/** doc: client.tui.showToast + client.session.list + noReply: true + " +
  "ctx.session.synthetic + ctx.tool.hook */\n" +
  "// client.session.prompt\nconst real = 1;\n";
const syntheticCode = stripComments(synthetic);

for (const needle of [
  // V2 delivery (the measured fix): the session domain, not the absent `client`.
  "ctx.session.synthetic",
  "ctx.tool.hook",
  "execute.before",
  "sessionID",
  // V1 delivery (opencode 1.x SDK client).
  "client.tui",
  "showToast",
  "client.session.list",
  "client.session",
  "noReply: true",
  // the ONE engine (scripts/gh/lib/watch.ts) — its continuous loop, no second loop here.
  "scripts/gh/lib/watch.ts",
  "watchStream",
]) {
  ok(
    !syntheticCode.includes(needle),
    `stripComments removes ${needle} from a docstring/comment (negative control)`,
  );
  ok(code.includes(needle), `the shipped code (comments stripped) contains ${needle}`);
}

// ── --self-test: prove the delegation assertions can FAIL ────────────────────
// The two assertions below are the control opencharly/opencharly#1308 needed: the gate used to
// pin the plugin's PRIVATE item grammar, so the duplicate could not be removed without a gate
// going red. A delegation assertion nobody has seen fail is the same defect one step out — so
// each mutation restores one half of the retired shape and must turn the gate RED.
if (argv.includes("--self-test")) {
  const { mkdtempSync, mkdirSync, cpSync, writeFileSync: write } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const stage = mkdtempSync(join(tmpdir(), "check-pr-watch-"));
  const stageTree = () => {
    for (const rel of [".opencode", "scripts/gh", ".pi"]) {
      if (existsSync(join(root, rel))) cpSync(join(root, rel), join(stage, rel), { recursive: true });
    }
  };
  const run = () => spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", stage], { encoding: "utf8" });
  stageTree();
  const base = run();
  if (base.status !== 0) {
    console.error(`check-pr-watch --self-test: the unmutated staged copy is not green:\n${base.stdout}${base.stderr}`);
    rmSync(stage, { recursive: true, force: true });
    process.exit(1);
  }
  console.log("  PASS  the unmutated staged copy is GREEN");
  const plugin = join(stage, ".opencode/plugins/pr-watch.ts");
  const pristine = readFileSync(plugin, "utf8");
  const mutations = [
    [
      "a private item grammar",
      (s) => s.replace("for (const line of parseItemsFile(raw)) {", "const parseItems = (t: string) => t.split(\"\\n\");\n  for (const line of parseItems(raw)) {"),
      "owns no item grammar",
    ],
    [
      "the engine reader is not imported",
      (s) => s.replace("parseItemsFile, ", ""),
      "imports the engine's item reader",
    ],
  ];
  let bad = 0;
  for (const [name, mutate, expect] of mutations) {
    write(plugin, mutate(pristine), "utf8");
    const r = run();
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (r.status === 0) {
      bad += 1;
      console.error(`  FAIL  mutation '${name}' did NOT go red (expected a '${expect}' finding)`);
    } else if (!out.includes(expect)) {
      bad += 1;
      console.error(`  FAIL  mutation '${name}' went red WITHOUT '${expect}'`);
    } else {
      console.log(`  PASS  mutation '${name}' is caught (gate red)`);
    }
    write(plugin, pristine, "utf8");
  }
  rmSync(stage, { recursive: true, force: true });
  if (bad > 0) {
    console.error(`check-pr-watch --self-test: FAIL — ${bad} mutation(s) not caught`);
    process.exit(1);
  }
  console.log("check-pr-watch --self-test: OK (every delegation assertion is live)");
  process.exit(0);
}

if (failures > 0) {
  console.error(`check-pr-watch: FAIL — ${failures} assertion(s)`);
  process.exit(1);
}
console.log("check-pr-watch: OK");
