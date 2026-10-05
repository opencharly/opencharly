#!/usr/bin/env node
// check-harness-config.mjs — validates the umbrella's harness-config surfaces (rule 5:
// harness config lives at this root, not in a submodule) and the wiring between them.
//
// It exists because the root carries several per-harness surfaces that nothing else
// reads: a JSON surface that stops parsing, an exec bit lost off a committed gate
// script, a hooks block dropped from .claude/settings.json, or a permission grant that
// widens past read-only is a silent capability loss — none of it is exercised by
// `task verify` (the pinning audit, which does not read these surfaces).
//
// WHICH assertions discriminate. Two classes, and they are NOT the same claim. The split
// below is MEASURED, not intended — `node scripts/check-harness-config.mjs --root <a main
// checkout>` is the measurement, and it is the one to re-run if `main` moves:
//   * DISCRIMINATING — the assertion FAILS on `main`, so going green is evidence the
//     surface is present and wired: check 4 in full, check 3's plugin-set arm (main
//     enables 14 plugins, this branch 28), check 5's POSITIVE `charly status *` arm
//     (main grants no `charly status *` entry and no `charly check *` entry; it DOES grant
//     `charly task *` and `./charly/bin/charly task *`, which this check does not touch),
//     and check 6 in full — `main` carries no `.mcp.json` at all and no `mcp`/`mcp_servers`
//     entry in `opencode.json`/`.codex/config.toml`, so the DeepWiki assertion fails there.
//   * STRUCTURAL — PASSES on `main` too, and NOT claimed to discriminate: check 1's four
//     JSON-parse assertions, check 2's four assertions (both gate scripts pre-exist AND
//     are already executable), check 3's hooks-block arm (main retains it), and check 5's
//     NEGATIVE arms — which pass on `main` precisely BECAUSE `main` grants none of those
//     three verbs, so a tree that grants none of them satisfies them vacuously. They are a
//     regression guard on the positive arm, not evidence of this branch.
// `--self-test` proves that split by EXECUTING it rather than asserting it: every
// mutation must turn the gate RED carrying the mutated check's own message.
//
// Checks:
//   1. Every harness JSON parses (and is an object).                        [structural]
//   2. The two committed gate scripts exist and are executable.            [structural]
//   3. .claude/settings.json retains its hooks block and the enabled
//      plugin set.                                    [hooks: struct | plugins: disc]
//   4. .claude/workflows/audit-deploy-configs.js EXISTS. A Claude workflow is invoked by
//      name, so nothing "lists" it — existence is the whole check, and this comment says
//      exactly that.                                                    [discriminating]
//   5. opencode.json auto-allows the READ-ONLY `charly status *`, and does
//      NOT auto-allow ANY of the three `charly check *` verbs — each runs
//      code an operator would want to approve: `check run *` is the
//      destructive R10 bed gate, `check box *` starts a disposable
//      container, `check live *` checks a running deployment.
//                                                 [status: disc | negative: struct]
//   6. Every harness surface that supports MCP declares the DeepWiki
//      server.                                                       [discriminating]
//   7. SOUL.md is injected into every harness that has an additive mechanism.
//                                                                     [discriminating]
//   8. reasonix.toml wires the marketplace skill root.               [discriminating]
//   9. .reasonix/settings.json uses reasonix's OWN hook key.          [discriminating]
//  10. The Ollama web-search code extension ships as a v2 plugin package AND
//      its sidecar answers `extension/initialize` with the host's registered
//      `InitializeResult` (MEASURED against reasonix v2.28.0: `name`,
//      `version`, `stateSchemaVersion`, `protocolVersion:"2"`, string
//      `tools`; no `capabilities`).                              [discriminating]
//  11. The PR watcher is bound for reasonix.                          [discriminating]
//
// Usage:
//   node scripts/check-harness-config.mjs                 # check this tree
//   node scripts/check-harness-config.mjs --root <dir>    # check another tree
//   node scripts/check-harness-config.mjs --self-test     # prove the split above

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
// --root lets the checks run against another tree; --self-test uses it on mutated copies
// of this tree (and is the only caller that passes it).
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

// The verbs opencode.json must NOT auto-allow, each with the reason, quoted from charly's
// OWN verb help so the characterization here and the product cannot drift apart:
//   check run  — "Run a disposable check bed (R10 sequence)": the destructive gate; it
//                builds, deploys, probes and tears down.
//   check box  — "Pure-box check (disposable container, build-scope checks)": it starts a
//                container (read-only about the PROJECT, but not a no-op on the host).
//   check live — "Full-stack check against a running deployment": it executes checks
//                against a live deployment.
// Only the read-only `charly status *` report is granted. `check box *` is guarded here
// too: an earlier revision claimed three verbs but asserted two, and a claim wider than
// the assertion is the defect class this gate exists to catch.
const MUST_NOT_AUTO_ALLOW = [
  ["charly check run *", "the destructive R10 bed gate — it builds, deploys, probes and tears down"],
  ["charly check box *", "it starts a disposable container to run build-scope checks"],
  ["charly check live *", "it executes a full-stack check against a running deployment"],
];

// ── --self-test: prove the discriminating/structural split by executing it ──────────
// Copies every surface this gate reads into a temp tree, asserts the gate is GREEN there
// (so the copy is faithful), then applies ONE mutation at a time and asserts the gate goes
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
    ".mcp.json",
    "opencode.json",
    ".codex/config.toml",
    ".reasonix/settings.json",
    ".reasonix/soul-inject.sh",
    ".reasonix/plugin/reasonix-plugin.json",
    ".reasonix/plugin/sidecar.py",
    ".reasonix/watch.items",
    "reasonix.toml",
    ".opencode/package.json",
    ".pi/extensions/charly-gates.ts",
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
    // Give check 8's COVERAGE assertion an independent oracle in the staged tree. The
    // expected layout is materialized from the PRISTINE `reasonix.toml` in `root` (whose
    // paths are not mutated — mutations edit the staged `tree`), so a mutation that DROPS
    // a path still finds the directory present and fails coverage. When the real
    // `marketplace` submodule is checked out, its family/{skills,agents} dirs are used
    // instead, which additionally exercises a family ADDED upstream but not yet listed.
    const mkt = join(root, "marketplace");
    if (existsSync(mkt)) {
      for (const fam of readdirSync(mkt, { withFileTypes: true })) {
        if (!fam.isDirectory() || fam.name === ".well-known") continue;
        for (const sub of ["skills", "agents"]) {
          if (existsSync(join(mkt, fam.name, sub))) mkdirSync(join(tree, "marketplace", fam.name, sub), { recursive: true });
        }
      }
    }
    const pristine = readFileSync(join(root, "reasonix.toml"), "utf8");
    for (const m of pristine.matchAll(/"marketplace\/[^"]+"/g)) mkdirSync(join(tree, JSON.parse(m[0])), { recursive: true });
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
    [".claude/settings.json", (p) => writeFileSync(p, "{ nope"), "does not parse", "1"],
    [".claude/hooks/pre-commit-gate.sh", (p) => rmSync(p), "pre-commit-gate.sh exists", "2"],
    [".claude/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); delete s.hooks; writeFileSync(p, JSON.stringify(s)); }, "retains the PreToolUse hooks block", "3"],
    [".claude/workflows/audit-deploy-configs.js", (p) => rmSync(p), "audit-deploy-configs.js exists", "4"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); o.permission.bash["charly check run *"] = "allow"; writeFileSync(p, JSON.stringify(o)); }, 'does not auto-allow "charly check run *"', "5 (negative arm, run — the destructive R10 gate)"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); o.permission.bash["charly check box *"] = "allow"; writeFileSync(p, JSON.stringify(o)); }, 'does not auto-allow "charly check box *"', "5 (negative arm, box — the arm an earlier revision claimed but did not assert)"],
    [".claude/hooks/pre-push-gate.sh", (p) => chmodSync(p, 0o644), "pre-push-gate.sh is executable", "2 (a lost exec bit must FAIL, not pass)"],
    [".claude/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); s.enabledPlugins = {}; writeFileSync(p, JSON.stringify(s)); }, "enables the plugin set", "3 (plugin-set arm)"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); delete o.permission.bash["charly status *"]; writeFileSync(p, JSON.stringify(o)); }, 'grants "charly status *"', "5 (positive arm)"],
    [".mcp.json", (p) => { const m = JSON.parse(readFileSync(p, "utf8")); delete m.mcpServers.deepwiki; writeFileSync(p, JSON.stringify(m)); }, ".mcp.json declares the DeepWiki server", "6"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); delete o.mcp.deepwiki; writeFileSync(p, JSON.stringify(o)); }, "opencode.json declares the DeepWiki server", "6"],
    [".codex/config.toml", (p) => { const t = readFileSync(p, "utf8").split("\n").filter((l) => !/^\[mcp_servers\.deepwiki\]$/.test(l.trim()) && !/^url\s*=/.test(l.trim())).join("\n"); writeFileSync(p, t); }, ".codex/config.toml declares the DeepWiki server", "6"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); o.instructions = [".opencode/instructions.md"]; writeFileSync(p, JSON.stringify(o)); }, "injects SOUL.md for opencode", "7 (opencode arm)"],
    [".pi/extensions/charly-gates.ts", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/readSoul/g, "__soul_removed__")), "injects the SOUL.md identity", "7 (pi arm)"],
    [".reasonix/soul-inject.sh", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/cat "\$SOUL"/, "true")), "injects SOUL.md for reasonix", "7 (reasonix arm — a wired hook whose script stopped emitting must FAIL)"],
    [".reasonix/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); s.hooks.SessionStart = s.hooks.SessionStart.filter((h) => !h.command.includes("soul-inject")); writeFileSync(p, JSON.stringify(s)); }, "injects SOUL.md for reasonix", "7 (reasonix arm — an UNWIRED hook must FAIL)"],
    ["reasonix.toml", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^paths = \[\n[\s\S]*?\n\]/m, "paths = []")), "wires", "8 (empty [skills] paths must FAIL)"],
    ["reasonix.toml", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^paths = \[/m, 'paths = [\n    "marketplace",')), "bare `marketplace` root", "8 (the bare-family-root regression must FAIL)"],
    ["reasonix.toml", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^    "marketplace\/vm\/skills",\n/m, "")), "covers every marketplace skill/agent dir", "8 (a dropped skill path must FAIL on coverage)"],
    [".reasonix/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); s.hooks.PreToolUse[0].match = "*"; writeFileSync(p, JSON.stringify(s)); }, 'native reasonix "match" key', "9 (the Claude `matcher` spelling must not satisfy it)"],
    [".reasonix/plugin/reasonix-plugin.json", (p) => rmSync(p), "reasonix-plugin.json exists", "10"],
    [".reasonix/plugin/sidecar.py", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^\s*"name": MANIFEST_NAME,\n/m, "")), "carries every host-required field", "10 (handshake — a sidecar missing a host-required field must FAIL)"],
    [".reasonix/watch.items", (p) => rmSync(p), "(the reasonix watch binding) exists", "11"],
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
// A missing surface is a FAIL, never a crash: an unguarded readFileSync throws ENOENT out
// of the gate, aborting all remaining checks with a stack trace instead of reporting which
// surfaces are absent.
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
// A minimal, dependency-free TOML section reader: returns the string value of `key` inside
// `[table]` of a TOML document, or undefined. It is deliberately narrow — the gate reads
// ONE scalar (`url`) from ONE table (`mcp_servers.deepwiki`) of `.codex/config.toml` — so
// check 6 guards the Codex surface without pulling in a TOML library.
const tomlString = (p, table, key) => {
  const t = read(p);
  if (t === null) return undefined;
  let inTable = false;
  for (const raw of t.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[") && line.endsWith("]")) {
      inTable = line === `[${table}]`;
      continue;
    }
    if (!inTable) continue;
    const m = line.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`));
    if (m) return m[1];
  }
  return undefined;
};
// The companion array reader: the string elements of `key = ["a", "b"]` inside `[table]`,
// or []. It handles BOTH a single-line array and a multi-line one — `[skills] paths` grew
// past one line, and a line-scoped regex would silently read it as [] (a false FAIL on the
// assertion that uses it). Narrow by design — the gate reads ONE array, so it does not pull
// in a TOML library.
const tomlArray = (p, table, key) => {
  const t = read(p);
  if (t === null) return [];
  let inTable = false;
  let body = null; // the array body, once `key = [` is seen and until its `]`
  for (const raw of t.split("\n")) {
    const line = raw.trim();
    if (body === null) {
      // A table header is a line that is entirely `[name]`. (A bare `]` close-line only
      // appears once `body !== null`, so it is never mistaken for a header here.)
      if (line.startsWith("[") && line.endsWith("]")) {
        inTable = line === `[${table}]`;
        continue;
      }
      if (!inTable) continue;
      const m = line.match(new RegExp(`^${key}\\s*=\\s*\\[(.*)$`));
      if (!m) continue;
      body = m[1];
    } else {
      body += " " + line;
    }
    if (body.includes("]")) {
      return [...body.slice(0, body.indexOf("]")).matchAll(/"([^"]*)"/g)].map((x) => x[1]);
    }
  }
  return [];
};

// Drive the Ollama web-search sidecar through `extension/initialize` over its real stdio
// wire and return the decoded `InitializeResult`, or null when it cannot be produced. This
// is the ONE offline oracle the gate lacked: the installed reasonix host decodes this
// result STRICTLY, so a sidecar that answers with the wrong shape boots to a hard error.
// The params below are the exact shape the installed reasonix v2.28.0 host sends (MEASURED).
const sidecarInitialize = (rootDir) => {
  const script = join(rootDir, ".reasonix/plugin/sidecar.py");
  if (!existsSync(script)) return null;
  const params = {
    protocolVersion: "2",
    protocolId: "reasonix.extension.v2",
    manifest: { tools: ["web_search", "web_fetch"], capabilities: ["tools"] },
    session: { sessionId: "gate-1", workspaceRoot: rootDir, generation: 1 },
    capabilities: { contentRefs: true, uiHost: "headless", protocolVersion: "2" },
  };
  const input =
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "extension/initialize", params }) + "\n" +
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "extension/shutdown", params: {} }) + "\n";
  const r = spawnSync("python3", [script], { input, encoding: "utf8", timeout: 30000 });
  if (r.status !== 0 || !r.stdout) return null;
  for (const line of r.stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id === 1 && msg.result) return msg.result;
    } catch {
      /* a malformed frame is not the handshake result */
    }
  }
  return null;
};

// The fields the host's registered `InitializeResult` REQUIRES, and the one field an
// earlier revision wrongly sent. MEASURED against the installed reasonix v2.28.0: the
// host rejects a result missing any required field or carrying any unregistered field
// with `invalid initialize result`, aborting boot for a `runtime.required: true` plugin.
const INITIALIZE_RESULT_REQUIRED = ["name", "version", "stateSchemaVersion", "protocolVersion"];
const INITIALIZE_RESULT_FORBIDDEN = ["capabilities"];

// 1. Every harness JSON parses. STRUCTURAL: all four exist on `main` too, so this class
//    is not the branch's evidence — read it as "an existing surface stays valid".
for (const p of [
  ".claude/settings.json",
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

// 2. The committed gate scripts exist and are executable. STRUCTURAL: both are on `main`
//    already — an absent script or a lost exec bit is still a silent capability loss, so
//    the assertion is worth keeping even though it is not this branch's evidence.
for (const h of [".claude/hooks/pre-commit-gate.sh", ".claude/hooks/pre-push-gate.sh"]) {
  const p = join(root, h);
  const exists = existsSync(p);
  ok(exists, `${h} exists`);
  if (exists) ok((statSync(p).mode & 0o111) !== 0, `${h} is executable`);
}

// 3. .claude/settings.json keeps its hooks block and the enabled plugin set.
{
  const s = jsonOr(".claude/settings.json");
  ok(Array.isArray(s.hooks?.PreToolUse) && s.hooks.PreToolUse.length > 0, ".claude/settings.json retains the PreToolUse hooks block");
  const plugins = Object.keys(s.enabledPlugins ?? {});
  ok(plugins.length >= 20, `.claude/settings.json enables the plugin set (${plugins.length} plugins)`);
}

// 4. The Claude workflow exists (invoked by name — nothing lists it).
ok(existsSync(join(root, ".claude/workflows/audit-deploy-configs.js")), ".claude/workflows/audit-deploy-configs.js exists");

// 5. opencode.json auto-allows the read-only status report and NOTHING that runs code an
//    operator would want to approve. The negative arm is the point: an auto-allow on
//    `charly check run` would let an agent run the destructive R10 bed gate with no
//    approval prompt, and one on `check box` would let it start containers unprompted.
{
  const o = jsonOr("opencode.json");
  const bash = o.permission?.bash ?? {};
  ok(Object.hasOwn(bash, "charly status *"), 'opencode.json grants "charly status *" (read-only)');
  for (const [g, why] of MUST_NOT_AUTO_ALLOW) {
    ok(!Object.hasOwn(bash, g), `opencode.json does not auto-allow "${g}" — ${why}`);
  }
}

// 6. Every harness surface that supports MCP declares the DeepWiki server. DISCRIMINATING:
//    an unmodified `main` carries no `.mcp.json` at all and no `mcp`/`mcp_servers` entry, so
//    these assertions fail there — going green is evidence the surfaces are wired. The
//    table is [surface, extractor, who] so adding a harness is ONE row and the guarded set
//    is legible in one place. Each surface's syntax was verified against its OWN harness:
//      .mcp.json        — Claude Code's project-scoped HTTP MCP file (a remote server needs
//                         `type: "http"` + `url`); the SAME file is auto-loaded by pi via
//                         pi-mcp-adapter and by Reasonix (Claude-Code-compatible);
//      opencode.json    — opencode's top-level `mcp` map (`{type: "remote", url}`);
//      .codex/config.toml — Codex `[mcp_servers.<name>]` with `url` (streamable HTTP).
{
  const DEEPWIKI_URL = "https://mcp.deepwiki.com/mcp";
  const MCP_SURFACES = [
    [".mcp.json", (v) => v.mcpServers?.deepwiki?.url, "Claude Code, pi and Reasonix (project-scoped .mcp.json)"],
    ["opencode.json", (v) => v.mcp?.deepwiki?.url, "opencode (top-level mcp map)"],
    [".codex/config.toml", (v, p) => tomlString(p, "mcp_servers.deepwiki", "url"), "Codex ([mcp_servers.deepwiki])"],
  ];
  for (const [surface, extract, who] of MCP_SURFACES) {
    const url = extract(jsonOr(surface), surface);
    ok(url === DEEPWIKI_URL, `${surface} declares the DeepWiki server for ${who} (deepwiki.url === ${DEEPWIKI_URL})`);
  }
}

// 7. SOUL.md is INJECTED into every harness's session context (opencharly/opencharly#359):
//    the identity is fed in as content, not merely mentioned for on-request reading.
//    DISCRIMINATING: `main` (pre-fix) wires neither arm, so going green is evidence the
//    injection took. The table is [surface, assertion, who] so adding a harness is ONE row.
//      opencode  — `instructions` is opencode's documented session-instruction list
//                  (each entry is a markdown file injected into the system prompt);
//                  `SOUL.md` sits beside the harness binding with NO harness-specific
//                  file needed, which is the whole point.
//      pi        — `.pi/extensions/charly-gates.ts` reads the project-root SOUL.md inside
//                  its `before_agent_start` handler and injects it every turn.
//      reasonix  — a `SessionStart` hook whose STDOUT is injected into the next user turn
//                  (`.reasonix/soul-inject.sh`, wired in `.reasonix/settings.json`).
//    CORRECTED (opencharly/opencharly#367): this check previously DEFERRED reasonix on the
//    stated ground that "reasonix's documented hooks are Bash-only". That premise is
//    MEASURABLY FALSE — reasonix's hook events include `SessionStart`, and its documented
//    contract is that a `SessionStart` hook's stdout ("plain text, or JSON with
//    `hookSpecificOutput.additionalContext`") "is injected once into the next real user
//    turn", which the host wraps as `<hook-context event="SessionStart">…</hook-context>`.
//    That IS an additive session-context mechanism, so the arm is wired here rather than
//    deferred again. (reasonix has no additive `instructions` config key — opencode's
//    mechanism — so a hook is the right primitive, not a config field.)
//    Codex stays deferred: its `model_instructions_file` REPLACES the base system prompt.
//    Claude Code stays on the `AGENTS.md` pointer (operator decision): no new hook here.
{
  const SOUL_SURFACES = [
    [
      "opencode.json",
      (v) => Array.isArray(v.instructions) && v.instructions.includes("SOUL.md"),
      "opencode (the `instructions` list is injected into the system prompt)",
    ],
    [
      ".pi/extensions/charly-gates.ts",
      (_v, p) => {
        const t = read(p) ?? "";
        return /readSoul/.test(t) && /SOUL\.md/.test(t) && /before_agent_start/.test(t);
      },
      "pi (the before_agent_start handler injects the SOUL.md identity)",
    ],
    [
      ".reasonix/settings.json",
      (v) => {
        // The hook must be WIRED (a SessionStart entry naming the script)…
        const hooks = Array.isArray(v.hooks?.SessionStart) ? v.hooks.SessionStart : [];
        const wired = hooks.some((h) => typeof h?.command === "string" && h.command.includes("soul-inject.sh"));
        // …and the script must actually READ SOUL.md and emit it on stdout, which is
        // what reasonix injects. Both halves are asserted: a wired hook pointing at a
        // script that no longer injects is exactly the silent capability loss here.
        const t = read(".reasonix/soul-inject.sh") ?? "";
        const injects = /SOUL\.md/.test(t) && /cat "\$SOUL"/.test(t) && !/exit 2/.test(t);
        return wired && injects;
      },
      "reasonix (a SessionStart hook whose stdout is injected as <hook-context>)",
    ],
  ];
  for (const [surface, asserts, who] of SOUL_SURFACES) {
    ok(asserts(jsonOr(surface), surface), `${surface} injects SOUL.md for ${who}`);
  }
}

// 8. reasonix.toml wires the marketplace SKILL roots — and NOT the bare marketplace root.
//    DISCRIMINATING: an unmodified `main` carries no `[skills]` table at all, so Reasonix
//    resolves only its builtin + global skills (MEASURED: 12) and none of the
//    `/charly-<family>:<skill>` references in AGENTS.md resolve. The fix scopes `paths` to
//    the directories that actually HOLD skills — every `<family>/skills/` plus the two
//    `<family>/agents/` roster dirs. Pointing at the bare `marketplace` root (the earlier
//    revision) is the regression this asserts against: `marketplace/` is a multi-FAMILY
//    root, so reasonix scans family prose as skills and prints ~3,500 `skill.missing_description`
//    warning lines per boot (MEASURED, reasonix v2.28.0).
{
  const paths = tomlArray("reasonix.toml", "skills", "paths");
  ok(paths.length > 0, "reasonix.toml wires marketplace skill roots ([skills] paths)");
  ok(
    !paths.includes("marketplace"),
    "reasonix.toml does NOT point [skills] paths at the bare `marketplace` root (which scans CHANGELOG/docs prose as skills)",
  );
  const malformed = paths.filter((p) => !/^marketplace\/[^/]+\/(skills|agents)$/.test(p));
  ok(
    malformed.length === 0,
    `every [skills] paths entry is a marketplace <family>/{skills,agents} dir (offenders: ${malformed.join(", ") || "none"})`,
  );
  // Coverage: when the marketplace tree is checked out, every skill-bearing directory
  // must be listed — a family added upstream with a `skills/` dir and no path entry would
  // otherwise load silently as zero skills. Skipped (not faked) when the submodule is
  // absent, e.g. a worktree that did not populate it.
  const mkt = join(root, "marketplace");
  if (existsSync(mkt)) {
    const expected = [];
    for (const fam of readdirSync(mkt, { withFileTypes: true })) {
      if (!fam.isDirectory() || fam.name === ".well-known") continue;
      for (const sub of ["skills", "agents"]) {
        if (existsSync(join(mkt, fam.name, sub))) expected.push(`marketplace/${fam.name}/${sub}`);
      }
    }
    const missing = expected.filter((e) => !paths.includes(e));
    ok(
      missing.length === 0,
      `[skills] paths covers every marketplace skill/agent dir (missing: ${missing.join(", ") || "none"})`,
    );
  } else {
    pass("marketplace submodule not checked out — [skills] coverage check skipped (structural assertions above still hold)");
  }
}

// 9. .reasonix/settings.json uses reasonix's OWN hook key. DISCRIMINATING: `main` uses
//    Claude Code's `"matcher"`, which reasonix does not read — MEASURED, it silently
//    widens to `match: "*"`, so the commit/push gates fire on EVERY tool call instead of
//    only Bash. A hook that cannot be matched is a capability loss nothing else reports.
{
  const s = jsonOr(".reasonix/settings.json");
  const hooks = Array.isArray(s.hooks?.PreToolUse) ? s.hooks.PreToolUse : [];
  ok(hooks.length > 0, ".reasonix/settings.json declares PreToolUse hooks");
  ok(
    hooks.length > 0 && hooks.every((h) => h.match === "Bash"),
    'reasonix/settings.json uses the native reasonix "match" key with value "Bash"',
  );
}

// 10. The Ollama web-search code extension ships as a v2 plugin package AND its sidecar
//     answers `extension/initialize` with the host's registered `InitializeResult`.
//     DISCRIMINATING: `main` has no `.reasonix/plugin/` at all. Reasonix supports NO
//     provider-side web search for Ollama Cloud (MEASURED: no `IsOllamaCloud*WebSearch`
//     symbol; the docs document `web_search = true` only for the DeepSeek/OpenCode-Go
//     presets), so the capability is a code extension whose runtime serves the tools. The
//     handshake is the half that was WRONG once: the result must satisfy the host's
//     registered DTO exactly, so the sidecar is driven over its real stdio wire here.
{
  ok(existsSync(join(root, ".reasonix/plugin/reasonix-plugin.json")), ".reasonix/plugin/reasonix-plugin.json exists");
  const m = jsonOr(".reasonix/plugin/reasonix-plugin.json");
  ok(m.apiVersion === "reasonix.io/plugin/v2", 'the reasonix plugin declares apiVersion "reasonix.io/plugin/v2"');
  const tools = (m.runtime?.tools ?? []).map((t) => t.name);
  ok(
    tools.includes("web_search") && tools.includes("web_fetch"),
    "the reasonix plugin declares the web_search and web_fetch runtime tools",
  );

  const result = sidecarInitialize(root);
  if (result === null) {
    fail("the reasonix sidecar answers extension/initialize over its real stdio wire");
  } else {
    const missing = INITIALIZE_RESULT_REQUIRED.filter((k) => !(k in result));
    ok(
      missing.length === 0,
      `the reasonix sidecar's InitializeResult carries every host-required field (missing: ${missing.join(", ") || "none"})`,
    );
    const extra = INITIALIZE_RESULT_FORBIDDEN.filter((k) => k in result);
    ok(
      extra.length === 0,
      `the reasonix sidecar's InitializeResult sends no unregistered field (unregistered present: ${extra.join(", ") || "none"})`,
    );
    ok(result.protocolVersion === "2", 'the reasonix sidecar sends protocolVersion "2" (the wire major, not the protocol ID)');
    ok(
      Array.isArray(result.tools) && result.tools.every((t) => typeof t === "string"),
      "the reasonix sidecar's InitializeResult.tools is an array of strings",
    );
  }
}

// 11. The PR watcher is bound for reasonix. DISCRIMINATING: `main` carries no reasonix
//     watch binding. The harness-INDEPENDENT watcher is `marketplace/scripts/gh_watch.sh`;
//     the items file is the same `owner/repo#num` grammar the opencode plugin parses.
ok(existsSync(join(root, ".reasonix/watch.items")), ".reasonix/watch.items (the reasonix watch binding) exists");

if (failures > 0) {
  console.error(`check-harness-config: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("check-harness-config: OK");
