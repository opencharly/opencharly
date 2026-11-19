#!/usr/bin/env node
// check-pi-footer.mjs — regression gate for the pi `coord_footer` tool
// (`.pi/extensions/footer.ts`, opencharly/opencharly#1119), mirroring the other
// `check-pi-*.mjs` gates.
//
// Why it exists (R7/R2). Every agent-authored PR body, issue and comment ends with the
// session footer, and pi exposes its session id only to extensions — so this tool is the
// ONLY way a pi session can write a footer that names its own session. The properties that
// matter, each a real defect class:
//
//   1. FIRED, NOT READ — the shipped module is loaded and the tool executed with a session
//      manager that returns a known id; the output is asserted exactly.
//   2. ONE SHAPE — the extension builds the footer with the shared
//      `scripts/gh/lib/coord.ts` `buildFooter`, and its output is byte-identical to
//      `node scripts/gh/cli.ts footer` for the same inputs, so the pi binding and the CLI
//      every other harness uses cannot drift (opencharly/opencharly#1140).
//   3. FAIL LOUD — no session id, or an unknown tier, is refused by name; a footer is never
//      written with a blank or invented session.
//   4. WIRED — `.pi/settings.json` loads the extension (an unwired extension never loads).
//
// Usage: node scripts/check-pi-footer.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseTypeScript } from "./lib/ts-syntax.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const REL = ".pi/extensions/footer.ts";
const REL_SETTINGS = ".pi/settings.json";

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);
const eq = (got, want, m) => (got === want ? ok(m) : fail(`${m} (want ${JSON.stringify(want)} got ${JSON.stringify(got)})`));

async function check() {
  const file = join(root, REL);
  if (!existsSync(file)) {
    fail(`${REL} exists`);
    return;
  }
  const raw = readFileSync(file, "utf8");
  const parseErr = parseTypeScript(raw);
  if (parseErr) fail(`${REL} parses as TypeScript (${parseErr})`);

  // Wired into the session.
  if (!existsSync(join(root, REL_SETTINGS))) {
    fail(`${REL_SETTINGS} exists`);
  } else {
    const s = JSON.parse(readFileSync(join(root, REL_SETTINGS), "utf8"));
    const list = Array.isArray(s.extensions) ? s.extensions : [];
    if (!list.some((e) => String(e).includes("footer.ts")))
      fail(`${REL_SETTINGS} lists ./extensions/footer.ts (an unwired extension never loads)`);
  }
  if (parseErr) return;

  // Fire the shipped module: a throwaway root carrying it and a minimal `typebox`.
  const scratch = mkdtempSync(join(tmpdir(), "check-pi-footer-"));
  try {
    const dst = join(scratch, REL);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(file, dst);
    // The extension imports the shared toolset from `scripts/gh/lib/`.
    if (existsSync(join(root, "scripts/gh"))) cpSync(join(root, "scripts/gh"), join(scratch, "scripts/gh"), { recursive: true });
    mkdirSync(join(scratch, "node_modules/typebox"), { recursive: true });
    writeFileSync(
      join(scratch, "node_modules/typebox/package.json"),
      JSON.stringify({ name: "typebox", version: "0.0.0-check-pi-footer", type: "module", main: "index.mjs" }),
    );
    writeFileSync(
      join(scratch, "node_modules/typebox/index.mjs"),
      `const mk = (kind) => (opts) => ({ kind, opts });
export const Type = { Object: mk("Object"), String: mk("String"), Optional: mk("Optional"), Array: mk("Array") };
export default { Type };
`,
    );
    const tools = new Map();
    const mod = await import(pathToFileURL(dst).href);
    mod.default({ registerTool: (def) => tools.set(def.name, def), on: () => () => {} });
    const tool = tools.get("coord_footer");
    if (!tool) {
      fail(`${REL} registers the coord_footer tool (loaded and fired)`);
      return;
    }
    ok(`${REL} registers the coord_footer tool (loaded and fired)`);

    const ctx = (id) => ({ sessionManager: { getSessionId: () => id } });
    const out = async (params, id) => (await tool.execute("t", params, undefined, undefined, ctx(id))).content[0].text;
    const base = { agent: "slug-x", model: "M", confidence: "documentation reviewed" };

    eq(
      await out(base, "pi-ses-1"),
      "*Agent: `slug-x` · pi session `pi-ses-1`*\n*Assisted-by: pi M (documentation reviewed)*",
      "FIRED: the footer names this pi session's own id",
    );
    eq(
      await out({ ...base, parent: "lead" }, "pi-ses-1"),
      "*Agent: `slug-x` (subagent of `lead`) · pi session `pi-ses-1`*\n*Assisted-by: pi M (documentation reviewed)*",
      "FIRED: a subagent's footer names its parent",
    );
    const noSession = await out(base, "");
    if (!/coord_footer: missing session/.test(noSession)) fail(`FIRED: a footer with no session id is refused (got ${JSON.stringify(noSession)})`);
    else ok("FIRED: a footer with no session id is refused by name");
    const badTier = await out({ ...base, confidence: "probably fine" }, "pi-ses-1");
    if (!/invalid confidence/.test(badTier)) fail(`FIRED: an unknown tier is refused (got ${JSON.stringify(badTier)})`);
    else ok("FIRED: an unknown confidence tier is refused");

    // ONE SHAPE: the shared builder, and byte-identical to the CLI every other harness runs.
    if (!/from "\.\.\/\.\.\/scripts\/gh\/lib\/coord\.ts"/.test(raw) || /function buildFooter/.test(raw)) {
      fail(`${REL} builds the footer with the shared scripts/gh/lib/coord.ts buildFooter, not a copy of its own`);
    } else {
      ok(`${REL} builds the footer with the shared scripts/gh/lib/coord.ts`);
    }
    const cli = join(root, "scripts/gh/cli.ts");
    for (const parent of [undefined, "lead"]) {
      const args = [cli, "footer", "--agent", "slug-x", "--session", "pi-ses-1", "--harness", "pi", "--model", "M", "--confidence", "documentation reviewed"];
      if (parent) args.push("--parent", parent);
      const sh = spawnSync(process.execPath, args, { encoding: "utf8" });
      eq(sh.stdout, `${await out({ ...base, ...(parent ? { parent } : {}) }, "pi-ses-1")}\n`, `scripts/gh/cli.ts footer vs the pi tool (parent=${parent ?? "none"}) is byte-identical`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ── --self-test: prove each assertion goes RED on a mutation ──────────────────
if (argv.includes("--self-test")) {
  const srcFiles = [REL, REL_SETTINGS, "scripts/gh/cli.ts", "scripts/gh/package.json", "scripts/gh/lib/coord.ts", "scripts/gh/lib/watch.ts", "scripts/gh/lib/github.ts", "scripts/gh/lib/lock.ts"];
  const missing = srcFiles.filter((p) => !existsSync(join(root, p)));
  if (missing.length > 0) {
    console.error(`check-pi-footer --self-test: missing ${missing.join(", ")}`);
    process.exit(1);
  }
  const original = new Map(srcFiles.map((p) => [p, readFileSync(join(root, p), "utf8")]));
  const tmp = mkdtempSync(join(tmpdir(), "check-pi-footer-st-"));
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
    ["no tool", REL, () => ext.replace('name: "coord_footer"', 'name: "coord_footer_X"'), "registers the coord_footer tool"],
    ["own builder", REL, () => ext + "\nfunction buildFooter() {}\n", "builds the footer with the shared"],
    ["session not passed", REL, () => ext.replace("harness, session, model, confidence })", "harness, session: \"\", model, confidence })"), "names this pi session's own id"],
    ["blank session accepted", REL, () => ext.replace("agent, model, confidence, session })", "agent, model, confidence })"), "no session id is refused"],
    ["any tier accepted", REL, () => ext.replace("if (!isTier(confidence))", "if (false)"), "unknown tier is refused"],
    ["unwired", REL_SETTINGS, () => JSON.stringify({ extensions: ["./extensions/charly-gates.ts"] }), "lists ./extensions/footer.ts"],
  ];

  let stFails = 0;
  for (const [name, file, mutate, expect] of mutations) {
    stage();
    const mutated = mutate();
    if (mutated === original.get(file)) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did not APPLY (its anchor is gone)`);
      continue;
    }
    writeFileSync(join(tmp, file), mutated, "utf8");
    if (runGate() === 0) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did NOT go red (expected a '${expect}' finding)`);
    } else {
      console.log(`  PASS  mutation '${name}' is caught`);
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  if (stFails) {
    console.error(`check-pi-footer --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-pi-footer --self-test: OK (every assertion is live)");
  process.exit(0);
}

await check();
if (failures) {
  console.error(`check-pi-footer: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pi-footer: OK");
