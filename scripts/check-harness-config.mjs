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
// mutation must turn the gate RED carrying the mutated check's own message. A surface that
// is not materialized in THIS checkout — `marketplace/DISPATCHER.md`, absent in every
// session worktree (Part II rule 2) and in any CI checkout without submodules — is skipped
// with a NOTICE, the SAME precondition the gate itself guards at checks 8/12/13; the report
// then names how many arms were live instead of aborting on an ENOENT.
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
//  11. The PR watcher is bound per harness (reasonix, pi, DSH).      [discriminating]
//  12. The R0 dispatcher table resolves to real skills and the
//      unrouted-skill count holds under its ratchet.                 [structural]
//  13. The DSH arm binds the R0 skill corpus (.dsh/skills covers every
//      marketplace/<family>/skills/<name>, with no name collision across
//      families) and carries its README signpost.                 [discriminating]
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

// The dispatcher-coverage RATCHET (check 12). MEASURED on the tree this gate ships with:
// 346 corpus skills (`marketplace/*/skills/*/SKILL.md`) against 96 `DISPATCHER.md` rows,
// i.e. 250 corpus skills carry no routing row.
//
// It is a RATCHET, not a hard "every skill has a row", and that is deliberate. A hard
// assertion is RED on the tree it would land on, and `main` is PR-only with required status
// checks — so a permanently-red gate could never merge and would block every unrelated PR
// until ~190 owning repos had authored `triggers:`. The ratchet asserts the gap may not
// GROW: fixing skills passes and lets the ceiling be tightened, while adding an unrouted
// skill (or dropping a row) turns the gate RED. R7 is satisfied by `--self-test`, which
// proves both assertions can fail rather than asserting that they do.
//
// Tighten this number as the trigger-authoring cutover lands. It may only ever DECREASE.
const MAX_UNROUTED = 250;

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
    ".pi/mcp.json",
    "opencode.json",
    ".codex/config.toml",
    ".reasonix/settings.json",
    ".reasonix/soul-inject.sh",
    ".reasonix/plugin/reasonix-plugin.json",
    ".reasonix/plugin/sidecar.py",
    ".reasonix/watch.items",
    ".pi/watch.items",
    ".pi/extensions/watch.ts",
    "reasonix.toml",
    ".opencode/package.json",
    ".pi/extensions/charly-gates.ts",
    ".dsh/skills",
    ".dsh/watch.items",
    ".dsh/README.md",
    "marketplace/DISPATCHER.md",
  ];

  const tmp = mkdtempSync(join(tmpdir(), "check-harness-config-"));
  const tree = join(tmp, "tree");
  const stage = () => {
    rmSync(tree, { recursive: true, force: true });
    for (const p of surfaces) {
      const src = join(root, p);
      // A SUBMODULE surface (`marketplace/DISPATCHER.md`) is ABSENT in a checkout that did not
      // materialize its submodules — the session-worktree layout Part II rule 2 REQUIRES, and
      // any CI checkout without submodules. Skip it in the SAME voice the gate itself already
      // uses for this exact case (checks 8/12/13: "not checked out — <check> skipped") instead
      // of letting cpSync throw ENOENT out of the self-test and abort every remaining arm.
      if (!existsSync(src)) {
        console.log(`  NOTICE  surface ${p} is not materialized in this checkout — not staged`);
        continue;
      }
      const dst = join(tree, p);
      mkdirSync(dirname(dst), { recursive: true });
      // `recursive` so a DIRECTORY surface (the DSH `.dsh/skills` farm) stages too; it is a
      // no-op for the file surfaces. Symlinks within it are copied as symlinks.
      cpSync(src, dst, { recursive: true });
      chmodSync(dst, statSync(src).mode & 0o777);
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
      // Materialize one PLACEHOLDER SKILL.md per real skill, so check 12's skill inventory in
      // the staged tree matches the real one WITHOUT copying the corpus (346 files, some
      // large). The gate tests only EXISTENCE of `<family>/skills/<name>/SKILL.md`, so an
      // empty file is a faithful stand-in — and without it check 12 would find zero skills
      // in the staged tree and no mutation could ever turn it red (a test that cannot fail).
      for (const fam of readdirSync(mkt, { withFileTypes: true })) {
        if (!fam.isDirectory()) continue;
        const sk = join(mkt, fam.name, "skills");
        if (!existsSync(sk)) continue;
        for (const s of readdirSync(sk, { withFileTypes: true })) {
          if (!s.isDirectory()) continue;
          const dst = join(tree, "marketplace", fam.name, "skills", s.name, "SKILL.md");
          mkdirSync(dirname(dst), { recursive: true });
          writeFileSync(dst, "");
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
    [".pi/mcp.json", (p) => { const m = JSON.parse(readFileSync(p, "utf8")); delete m.mcpServers.deepwiki; writeFileSync(p, JSON.stringify(m)); }, ".pi/mcp.json declares the DeepWiki server", "6"],
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
    [".pi/watch.items", (p) => rmSync(p), "(the pi watch binding) exists", "11 (pi arm — a harness with no watch binding must FAIL)"],
    // Check 12 has TWO arms that catch different defects, so it needs two mutations.
    // (a) INVARIANT: a row pointing at a skill that does not exist (a dangling
    //     `/charly-<family>:<skill>` ref — the docs build treats that as a hard error).
    ["marketplace/DISPATCHER.md", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^\| .+ \| `\/charly-internals:git-workflow` \|$/m, "| a dropped row | `/charly-internals:no-such-skill` |")), "every DISPATCHER.md row resolves", "12 (a row must resolve to a real skill — the dangling-ref arm)", true],
    // (b) RATCHET: deleting a row leaves its skill unrouted, pushing the count past the
    //     ceiling. This is the arm that makes the gate able to fail at all.
    ["marketplace/DISPATCHER.md", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^\| .+ \| `\/charly-check:check` \|$\n/m, "")), "dispatcher coverage ratchet holds", "12 (the ratchet — dropping a row must FAIL, or the gate cannot notice coverage loss)", true],
    // The DSH arm has three surfaces, so it needs three mutations plus the
    // corpus-level collision arm (the property a flat name-keyed farm can lose).
    [".dsh/watch.items", (p) => rmSync(p), "(the DSH watch binding) exists", "11 (DSH arm — a harness with no watch binding must FAIL)"],
    [".dsh/README.md", (p) => rmSync(p), "the DSH harness-config signpost", "13 (a missing signpost must FAIL)"],
    // COVERAGE: dropping one bound skill leaves its corpus SKILL.md unbound.
    [".dsh/skills", (p) => rmSync(join(p, readdirSync(p).sort()[0]), { recursive: true, force: true }), "is bound by a .dsh/skills", "13 (coverage — an unbound corpus skill must FAIL)", true],
    // COLLISION: a second family offering the same skill directory name. A flat
    // farm is keyed by name, so this would silently shadow one of the two.
    ["marketplace", (p) => { const name = readdirSync(join(tree, ".dsh/skills")).sort()[0]; const dst = join(p, "zzz-collision", "skills", name); mkdirSync(dst, { recursive: true }); writeFileSync(join(dst, "SKILL.md"), ""); }, "no two families share", "13 (collision — a duplicate skill name across families must FAIL)", true],
  ];
  // The four corpus-measured arms (check 12's two, check 13's coverage + collision) are
  // measured against `marketplace/DISPATCHER.md`, so they can only be exercised where that
  // submodule is materialized — the same precondition the GATE guards at checks 12 and 13.
  const corpus = existsSync(join(root, "marketplace/DISPATCHER.md"));
  let skipped = 0;
  for (const [surface, mutate, expect, check, needsCorpus] of mutations) {
    stage(); // revert everything, then apply exactly this mutation
    const target = join(tree, surface);
    if (!existsSync(target) || (needsCorpus && !corpus)) {
      console.log(`  NOTICE  check ${check}: ${surface} is not materialized in this checkout — arm skipped`);
      skipped += 1;
      continue;
    }
    mutate(target);
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
  console.log(`check-harness-config --self-test: OK (${mutations.length - skipped}/${mutations.length} arms live${skipped ? `; ${skipped} skipped — surface not materialized in this checkout` : ""}; the structural ones are named in the header)`);
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
//                         `type: "http"` + `url`); also read by Reasonix (Claude-Code-compatible);
//      .pi/mcp.json     — pi's native project MCP file (same `mcpServers` shape);
//      opencode.json    — opencode's top-level `mcp` map (`{type: "remote", url}`);
//      .codex/config.toml — Codex `[mcp_servers.<name>]` with `url` (streamable HTTP).
{
  const DEEPWIKI_URL = "https://mcp.deepwiki.com/mcp";
  const MCP_SURFACES = [
    [".mcp.json", (v) => v.mcpServers?.deepwiki?.url, "Claude Code and Reasonix (project-scoped .mcp.json)"],
    [".pi/mcp.json", (v) => v.mcpServers?.deepwiki?.url, "pi (project .pi/mcp.json)"],
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

// 11. The PR watcher is bound per harness. DISCRIMINATING: `main` carries no reasonix
//     watch binding. The harness-INDEPENDENT watcher is `marketplace/scripts/gh_watch.sh`;
//     the items file is the same `owner/repo#num` grammar the opencode plugin parses. The
//     pi arm's items file is inert by design; the extension that arms it is verified by
//     `scripts/check-pi-watch.mjs`.
ok(existsSync(join(root, ".reasonix/watch.items")), ".reasonix/watch.items (the reasonix watch binding) exists");
ok(existsSync(join(root, ".pi/watch.items")), ".pi/watch.items (the pi watch binding) exists");
ok(existsSync(join(root, ".dsh/watch.items")), ".dsh/watch.items (the DSH watch binding) exists");

// 12. Dispatcher coverage: the R0 dispatcher table in `marketplace/DISPATCHER.md` is the
//     routing half of the corpus, emitted one row per `type: skill` entity carrying a
//     `triggers:` list (see `plugin-marketplace/candy/plugin-marketplace/emit_dispatcher.go`).
//     Two assertions, and they catch DIFFERENT defects:
//       (a) INVARIANT — every emitted row resolves to a real `marketplace/<family>/skills/
//           <name>/SKILL.md`. A row pointing at a deleted or renamed skill is a dangling
//           `/charly-<family>:<skill>` reference, which BREAKS the docs build (an
//           unresolvable reference is a hard error there, not a dead link).
//       (b) RATCHET — the number of corpus skills with NO row may not exceed MAX_UNROUTED.
//           It is 250 today; the trigger-authoring cutover lowers it.
//     (a) alone would not notice a skill whose repo was never pinned (it is absent from the
//     corpus entirely, so no row is missing) — that class is caught by the refs-list audit,
//     not here. (b) alone would not notice a row pointing at a skill that no longer exists.
//     STRUCTURAL in the honest sense: both assertions PASS on `main` too, so this check is a
//     regression guard on the corpus's routing, NOT evidence of this branch. It is named
//     structural rather than discriminating for exactly that reason.
{
  const dispPath = join(root, "marketplace/DISPATCHER.md");
  if (!existsSync(dispPath)) {
    pass("marketplace/DISPATCHER.md not checked out — dispatcher-coverage check skipped");
  } else {
    const disp = readFileSync(dispPath, "utf8");
    // A data row is `| <trigger phrase> | `/charly-<family>:<name>` |`. The header and the
    // `|---|` separator do not match, so they are excluded by shape rather than by index.
    const rows = [...disp.matchAll(/^\| (.+?) \| `\/charly-([a-z0-9-]+):([a-z0-9-]+)` \|$/gm)]
      .map((m) => ({ phrase: m[1], family: m[2], name: m[3] }));

    // (a) every row resolves to a real skill directory.
    const dangling = rows.filter(
      (r) => !existsSync(join(root, "marketplace", r.family, "skills", r.name, "SKILL.md")),
    );
    ok(
      dangling.length === 0,
      `every DISPATCHER.md row resolves to a marketplace/<family>/skills/<name>/SKILL.md ` +
        `(dangling: ${dangling.map((d) => `${d.family}:${d.name}`).join(", ") || "none"})`,
    );

    // (b) the ratchet: unrouted corpus skills may not exceed the recorded ceiling.
    const skills = [];
    const mkt = join(root, "marketplace");
    for (const fam of readdirSync(mkt, { withFileTypes: true })) {
      if (!fam.isDirectory()) continue;
      const sk = join(mkt, fam.name, "skills");
      if (!existsSync(sk)) continue;
      for (const s of readdirSync(sk, { withFileTypes: true })) {
        if (s.isDirectory() && existsSync(join(sk, s.name, "SKILL.md"))) skills.push(`${fam.name}:${s.name}`);
      }
    }
    const routed = new Set(rows.map((r) => `${r.family}:${r.name}`));
    const unrouted = skills.filter((s) => !routed.has(s));
    ok(
      unrouted.length <= MAX_UNROUTED,
      `dispatcher coverage ratchet holds: ${skills.length - unrouted.length}/${skills.length} corpus ` +
        `skills routed, ${unrouted.length} unrouted (ceiling ${MAX_UNROUTED})`,
    );
  }
}

// 13. The DSH arm. DSH's ONLY native repo-local config home is `<projectRoot>/.dsh/`:
//     `dsh-skill-filesystem` scans `.dsh/skills` at rank 100 and discovers only depth-1
//     `<name>/SKILL.md` bundles. The marketplace corpus is THREE levels deep
//     (`marketplace/<family>/skills/<name>/SKILL.md`), so the corpus is bound as a flat
//     symlink farm — one entry per skill, following the `marketplace` gitlink, so there is
//     no generated copy and no second pin. Two assertions, catching different defects:
//       (a) COVERAGE — every corpus skill has a `.dsh/skills/<name>` entry resolving to a
//           `SKILL.md`. A newly pinned skill that nobody bound FAILS, so the farm is a
//           ratchet on the corpus (this mirrors check 8's coverage assertion for reasonix).
//       (b) COLLISION — no two families may share a skill directory name. The farm is keyed
//           by NAME, so a collision would silently shadow one of the two skills. Measured
//           0 across the pinned corpus today; the assertion keeps it that way.
//     Plus the signpost that documents the arm.
//     DISCRIMINATING: `main` carries no `.dsh/` at all, so this fails there.
{
  ok(existsSync(join(root, ".dsh/README.md")), ".dsh/README.md (the DSH harness-config signpost) exists");

  const mkt = join(root, "marketplace");
  if (!existsSync(mkt)) {
    pass("marketplace/ not checked out — DSH skill-corpus binding check skipped");
  } else {
    const corpus = [];
    for (const fam of readdirSync(mkt, { withFileTypes: true })) {
      if (!fam.isDirectory()) continue;
      const sk = join(mkt, fam.name, "skills");
      if (!existsSync(sk)) continue;
      for (const s of readdirSync(sk, { withFileTypes: true })) {
        if (s.isDirectory() && existsSync(join(sk, s.name, "SKILL.md"))) {
          corpus.push({ family: fam.name, name: s.name });
        }
      }
    }

    // (b) collision — a flat, name-keyed farm cannot represent two skills with one name.
    const seen = new Map();
    const collisions = [];
    for (const c of corpus) {
      if (seen.has(c.name)) collisions.push(`${c.name} (${seen.get(c.name)} + ${c.family})`);
      else seen.set(c.name, c.family);
    }
    ok(
      collisions.length === 0,
      `no two families share a marketplace skill directory name (collisions: ${collisions.join(", ") || "none"})`,
    );

    // (a) coverage — every corpus skill is bound.
    const missing = corpus.filter((c) => !existsSync(join(root, ".dsh/skills", c.name, "SKILL.md")));
    ok(
      missing.length === 0,
      `every marketplace/<family>/skills/<name>/SKILL.md is bound by a .dsh/skills/<name> entry ` +
        `(${corpus.length} corpus skills, missing: ${missing.map((m) => `${m.family}:${m.name}`).join(", ") || "none"})`,
    );
  }
}

if (failures > 0) {
  console.error(`check-harness-config: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("check-harness-config: OK");
