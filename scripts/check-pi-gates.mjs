#!/usr/bin/env node
// check-pi-gates.mjs — regression gate for the committed pi gate extension
// (`.pi/extensions/charly-gates.ts`), mirroring check-opencode-plugin.mjs and
// check-pr-watch.mjs: static assertions over the SHIPPED code (comments stripped),
// each proven to FAIL by a mutation.
//
// Why it exists (T3/R4/B12): the pi extension is the harness's git-workflow gate
// wiring — it intercepts every `tool_call` and blocks commands the gate scripts
// reject. `check-harness-config.mjs` only asserts the surfaces PARSE and are wired;
// it does NOT catch a broken gate, so without this file the extension's behaviour is
// unproven. Five properties this gate pins, each a real defect class:
//
//   1. FAIL-CLOSED — a gate whose script ERRORS or is ABSENT must BLOCK, never
//      `continue`. A fail-open wiring is a bypass path (the gate silently does not run).
//   2. RULE-2 PATHS — the worktree tool must use `<umbrella>/.worktrees/<slug>/`,
//      not `.claude/worktrees/`, and name the binary `charly/bin/charly`.
//   3. REGISTERED — the `tool_call` hook and both gate scripts are present.
//   4. SOUL INJECTION (#359) — the identity itself is READ from the project-root SOUL.md
//      and re-injected every turn, never a pointer to it.
//   5. WORKTREE COST MODEL — `charly_worktree_create` materializes a SCOPED module set and
//      BORROWS the main checkout's objects (`--reference`), instead of cloning the whole
//      425-submodule graph into a worktree-private object store. MEASURED: the eager
//      `--init --recursive` cost 376 MB of private objects per worktree at ~0.86 s per
//      module; the scoped `--reference` form costs 1 MB and ~1.4 s, and every commit-time
//      gate passes with 423 of 425 modules unmaterialized.
//
// Usage: node scripts/check-pi-gates.mjs [--root <dir>] [--self-test]
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
const rel = ".pi/extensions/charly-gates.ts";
const file = join(root, rel);

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);

/** Strip line/block comments and string literals so the assertions read CODE, not commentary. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

function check() {
  if (!existsSync(file)) {
    fail(`${rel} exists`);
    return;
  }
  const raw = readFileSync(file, "utf8");
  const code = stripComments(raw);

  // 0. PARSE. A regex gate cannot see an unparseable extension (R1: an unescaped backtick
  //    in the injected rules block stayed green here and only broke when pi loaded it).
  const parseErr = parseTypeScript(raw);
  if (parseErr) fail(`${rel} parses as TypeScript (${parseErr})`);

  // 1. fail-closed: the gate-script exec `catch` MUST block, never continue.
  if (/fail[- ]open/i.test(code)) fail(`does not fail OPEN on an unexpected gate error`);
  if (!/could not run — failing closed/.test(raw))
    fail(`fails CLOSED on an unexpected gate error (the exec catch must block with the fail-closed reason)`);
  if (!/is absent .*failing closed/.test(raw))
    fail(`fails CLOSED when a gate script is ABSENT (the access() miss must block, never continue)`);
  if (!/block:\s*true/.test(code)) fail(`returns a block on a gate failure`);

  // 2. rule-2 paths
  if (/\.claude["'`,\s]*,\s*["'`]worktrees/.test(code) || /join\([^)]*\.claude[^)]*worktrees/.test(code))
    fail(`uses <umbrella>/.worktrees/<slug>/ (rule 2), not .claude/worktrees`);
  if (!/\.worktrees/.test(code)) fail(`uses <umbrella>/.worktrees/<slug>/ (rule 2)`);
  if (!/charly\/bin\/charly/.test(code)) fail(`names the worktree binary charly/bin/charly`);

  // 3. registered
  if (!/pi\.on\(\s*["'`]tool_call["'`]/.test(code)) fail(`intercepts pi's tool_call event`);
  if (!/pre-commit-gate\.sh/.test(code) || !/pre-push-gate\.sh/.test(code))
    fail(`wires both pre-commit-gate.sh and pre-push-gate.sh`);

  // 4. SOUL injection (#359): the `before_agent_start` handler reads the project-root
  //    SOUL.md and injects the IDENTITY itself (not a pointer to it) every turn.
  if (!/readSoul/.test(code) || !/SOUL\.md/.test(code)) fail(`injects the project-root SOUL.md identity (readSoul)`);
  if (!/pi\.on\(\s*["'`]before_agent_start["'`]/.test(code)) fail(`injects SOUL.md via the before_agent_start handler`);

  // 5. WORKTREE COST MODEL. The tool must materialize a SCOPED module set and borrow the
  //    main checkout's objects. A worktree is the session's isolation boundary for MUTABLE
  //    state (tree, index, branch, binary) — never a place to COPY the immutable submodule
  //    graph. Both halves are asserted: the graph must not be cloned, and the cache must be
  //    requested explicitly (the automatic `submodule.alternateLocation=superproject` does
  //    NOT engage for a linked worktree — 0 alternates files, measured). The flag is
  //    asserted as an ARGUMENT (`"--recursive"`), not as prose: the tool's own description
  //    may legitimately name the flag it no longer passes.
  if (/"--recursive"/.test(code))
    fail(`does not pass --recursive to \`git submodule update --init\` (never clone the whole graph)`);
  if (/\[\s*["'`]submodule["'`]\s*,\s*["'`]update["'`]\s*,\s*["'`]--init["'`]\s*,\s*["'`]--recursive/.test(code))
    fail(`does not run a graph-wide \`submodule update --init --recursive\``);
  if (!/push\(\s*["'`]--reference["'`]/.test(code))
    fail(`borrows module objects from the main checkout (an explicit --reference)`);
  if (!/DEFAULT_WORKTREE_MODULES\s*=\s*\[\s*["'`]charly["'`]\s*,\s*["'`]marketplace["'`]\s*\]/.test(code))
    fail(`defaults to exactly the modules the harness's own tools and gates read (charly, marketplace)`);
  if (!/modules:\s*Type\.Optional/.test(code)) fail(`exposes a \`modules\` argument for the modules a cutover actually needs`);

  if (failures === 0)
    ok(
      `${rel}: fails closed, rule-2 paths, gate wiring + SOUL injection present, ` +
        `and the worktree materializes a scoped module set from the shared object cache`,
    );
}

// ── --self-test: prove each assertion goes RED on a mutation ──────────────────
if (argv.includes("--self-test")) {
  if (!existsSync(file)) {
    console.error(`check-pi-gates --self-test: ${rel} missing`);
    process.exit(1);
  }
  const original = readFileSync(file, "utf8");
  const tmp = mkdtempSync(join(tmpdir(), "check-pi-gates-"));
  mkdirSync(join(tmp, ".pi/extensions"), { recursive: true });
  const runGate = () => {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", tmp], {
      encoding: "utf8",
    });
    return r.status;
  };
  const mutations = [
    ["fail-open", (s) => s.replace(/return\s*\{\s*block:\s*true,\s*reason:\s*`charly gate \(\$\{rel\}\) could not run[\s\S]*?\};/, "continue;"), `failing closed`],
    ["fail-open on absent gate", (s) => s.replace(/is absent at \$\{script\} — failing closed: the gate cannot run/, "XXX"), `when a gate script is ABSENT`],
    ["worktree path", (s) => s.replace(/join\(ctx\.cwd, "\.worktrees", slug\)/, 'join(ctx.cwd, ".claude", "worktrees", slug)'), `.worktrees`],
    ["unparseable", (s) => s + "\nconst broken = ;\n", `parses as TypeScript`],
    ["no gate wiring", (s) => s.replace(/pre-push-gate\.sh/g, "pre-push-gate-XXX.sh"), `pre-push-gate.sh`],
    ["no tool_call", (s) => s.replace(/pi\.on\(\s*"tool_call"/g, 'pi.on("tool_calls"'), `tool_call`],
    ["no SOUL injection", (s) => s.replace(/readSoul/g, "__soul_removed__"), `SOUL.md`],
    [
      "graph-wide submodule init",
      (s) => s.replace(/const args = \["submodule", "update", "--init"\];/, 'const args = ["submodule", "update", "--init", "--recursive"];'),
      `whole submodule graph`,
    ],
    [
      "no object cache",
      (s) => s.replace(/args\.push\("--reference", reference\);/, "void reference;"),
      `--reference`,
    ],
    [
      "unscoped default module set",
      (s) => s.replace(/DEFAULT_WORKTREE_MODULES = \["charly", "marketplace"\]/, "DEFAULT_WORKTREE_MODULES = []"),
      `modules the harness's own tools and gates read`,
    ],
    [
      "no modules argument",
      (s) => s.replace(/modules:\s*Type\.Optional\(/, "scopeIgnored: Type.Optional("),
      `modules`,
    ],
  ];
  let stFails = 0;
  for (const [name, mutate, expect] of mutations) {
    writeFileSync(join(tmp, rel), mutate(original), "utf8");
    const code = runGate();
    if (code === 0) {
      stFails += 1;
      console.error(`  FAIL  mutation '${name}' did NOT go red (expected a '${expect}' finding)`);
    } else {
      console.log(`  PASS  mutation '${name}' is caught (gate red)`);
    }
  }
  writeFileSync(join(tmp, rel), original, "utf8");
  if (runGate() !== 0) {
    stFails += 1;
    console.error("  FAIL  the unmutated copy is not green");
  } else {
    console.log("  PASS  the unmutated copy is GREEN");
  }
  rmSync(tmp, { recursive: true, force: true });
  if (stFails) {
    console.error(`check-pi-gates --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-pi-gates --self-test: OK (every assertion is live)");
  process.exit(0);
}

check();
if (failures) {
  console.error(`check-pi-gates: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pi-gates: OK");
