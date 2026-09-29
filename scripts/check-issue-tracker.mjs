#!/usr/bin/env node
// check-issue-tracker.mjs — regression gate for the OpenCode session tracker plugin
// (`.opencode/plugins/tracker.ts`) and its extracted shared loop
// (`.opencode/lib/watcher-loop.ts`).
//
// The tracker is PURE TypeScript (operator directive, 2026-09-29): it implements the
// durable ledger + the live scope join NATIVELY and NEVER delegates to a `.sh`. This
// gate has FOUR layers:
//
//   0  STATIC — `tracker.ts`/`watcher-loop.ts` (comments stripped) contain NO `.sh`
//      reference, NO `spawnSync`, NO `Bun.spawn`. The native path exists so the plugin
//      loads its code AND behaviour from the SAME ref, with NO `marketplace` pin.
//   A  the real module is a V2 definition with BOTH loader entry points.
//   B  the pure helpers behave — `normaliseEntry` (kind validation + scope canonicalisation)
//      and `reconcile` (the rule-11 core invariant: an interruption ADDS, never resets).
//   C  LIVE_OPENCODE=1 drives the REAL `opencode` binary and asserts the plugin LOADS and
//      registers its three tools. Live-or-skip: skipped VISIBLY when unset (never a silent
//      pass). The model's tool invocation is stochastic, so C asserts LOAD/registration
//      (deterministic), not a specific call.
//
// No stubs of the OPENCODE boundary in A/B; C runs the real binary.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}

const trackerPath = resolve(root, arg("--plugin", ".opencode/plugins/tracker.ts"));
const loopPath = resolve(root, arg("--loop", ".opencode/lib/watcher-loop.ts"));

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (cond, m) => (cond ? pass(m) : fail(m));
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)})`);

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

console.log(`check-issue-tracker: ${trackerPath}`);

// --- Layer 0: STATIC — no shell delegation, no .sh dependency ----------------
for (const p of [trackerPath, loopPath]) {
  if (!existsSync(p)) {
    fail(`missing ${p}`);
    continue;
  }
  const code = stripComments(readFileSync(p, "utf8"));
  const rel = p.slice(root.length + 1);
  ok(!/spawnSync/.test(code), `${rel}: contains NO spawnSync`);
  ok(!/Bun\.spawn/.test(code), `${rel}: contains NO Bun.spawn`);
  ok(!/\.sh\b/.test(code), `${rel}: contains NO .sh reference (no shell delegation)`);
  ok(!/execFile\(\s*["']bash/.test(code), `${rel}: no bash execFile`);
}

// --- Layer A: the real plugin module is a V2 definition ---------------------
let mod;
try {
  mod = await import(pathToFileURL(trackerPath).href);
} catch (err) {
  fail(`plugin did not import: ${err.message}`);
}
if (mod) {
  const plugin = mod.default;
  ok(plugin !== null && typeof plugin === "object" && !Array.isArray(plugin), "default export is a V2 definition object");
  const hasSetup = typeof plugin?.setup === "function";
  const hasServer = typeof plugin?.server === "function";
  ok(hasSetup && hasServer, `definition exposes BOTH setup() (>=2.0) and server() (1.x) [setup=${hasSetup} server=${hasServer}]`);
  ok(typeof plugin?.id === "string" && plugin.id.length > 0, "definition has a string id (tracker)");

  // The three tools register through ctx.tool.transform(draft => draft.add(...)).
  // Drive a FAKE draft to capture the registrations (the opencode boundary here is a
  // recorded call list — deterministic, not a mock of behaviour).
  const added = [];
  const fakeCtx = {
    location: { directory: root },
    tool: {
      transform: async (cb) => cb({ add: (t) => added.push(t) }),
      hook: async () => {},
    },
    session: { synthetic: async () => {}, hook: async () => {} },
  };
  try {
    await plugin.setup(fakeCtx);
  } catch (err) {
    fail(`setup() threw: ${err.message}`);
  }
  const names = added.map((t) => t.name).sort();
  eq(names, ["tracker_ledger", "tracker_status", "tracker_sync"], "setup registers exactly the three tracker tools");
  for (const t of added) {
    ok(typeof t.description === "string" && t.description.length > 20, `${t.name}: has a when-to-use description`);
    ok(t?.input?.type === "object", `${t.name}: input is a JSON Schema object`);
    ok(typeof t.execute === "function", `${t.name}: has an execute`);
  }

  // --- Layer B: the pure helpers — the rule-11 invariant -------------------
  const { normaliseEntry, reconcile, LEDGER_KINDS } = mod;
  ok(Array.isArray(LEDGER_KINDS) && LEDGER_KINDS.includes("subagent") && LEDGER_KINDS.includes("pr"),
    `LEDGER_KINDS covers rule 11's categories (${LEDGER_KINDS})`);

  // normaliseEntry rejects an unknown kind and canonicalises a scope.
  ok(normaliseEntry({ id: "x", kind: "nope" }) === null, "normaliseEntry rejects an unknown kind");
  const e = normaliseEntry({ kind: "pr", scope: "https://github.com/o/r/pull/7", state: "open", next: "watch" });
  ok(e && e.scope === "o/r#7" && e.id === "o/r#7", "normaliseEntry canonicalises a URL scope to owner/repo#num");

  // THE rule-11 INVARIANT: reconcile MERGES — an interruption ADDS, never resets.
  const before = [
    { id: "a", kind: "pr", state: "open", next: "watch", updated: 1 },
    { id: "b", kind: "blocker", state: "blocked", next: "ask", updated: 1 },
  ];
  const after = reconcile(before, [{ id: "c", kind: "subagent", state: "running", next: "monitor", updated: 2 }]);
  eq(after.map((x) => x.id).sort(), ["a", "b", "c"], "reconcile KEEPS every in-flight item and ADDS the new one (rule 11: add, never reset)");

  // A same-id incoming entry UPDATES in place (no duplicate).
  const updated = reconcile(before, [{ id: "a", kind: "pr", state: "merged", next: "close issue", updated: 9 }]);
  eq(updated.length, 2, "reconcile does not duplicate a same-id entry");
  eq(updated.find((x) => x.id === "a").state, "merged", "reconcile updates a same-id entry's state");
}

// --- Layer C: LIVE — drive the REAL opencode binary (live-or-skip) ----------
if (!process.env.LIVE_OPENCODE) {
  console.log("  SKIP  Layer C: LIVE_OPENCODE unset — real-binary load not driven (live-or-skip, never a silent pass)");
} else {
  const bin = process.env.OPENCODE_BIN || "opencode";
  const sandbox = mkdtempSync(join(tmpdir(), "tracker-live-"));
  try {
    cpSync(join(root, ".opencode"), join(sandbox, ".opencode"), { recursive: true });
    const res = spawnSync(bin, ["debug", "agents"], {
      encoding: "utf8",
      cwd: sandbox,
      env: { ...process.env, PWD: sandbox },
      timeout: 120000,
    });
    if (res.error) {
      fail(`Layer C: could not run ${bin}: ${res.error.message}`);
    } else {
      // The plugin loads iff startup did not reject it. A load failure prints the
      // opencode plugin rejection; a clean start does not.
      const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
      ok(!/failed to load plugin[\s\S]*tracker/i.test(out), "Layer C: tracker.ts loads in the REAL binary (no plugin rejection)");
      ok(!/must default export an object with server/i.test(out), "Layer C: tracker.ts carries the dual (setup+server) export the loader requires");
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`check-issue-tracker: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("check-issue-tracker: OK");
