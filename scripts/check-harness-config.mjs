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
//     enables 14 plugins, this branch 28), check 5 in full (main carries the V1
//     `permission` map, which GRANTS `gh pr merge *` and constrains nothing under V2's
//     allow base policy; this tree carries the V2 `permissions` array with the denies the
//     rulebook requires), and check 6 in full — `main` carries no `.mcp.json` at all and
//     no `mcp`/`mcp_servers` entry in `opencode.json`/`.codex/config.toml`, so the
//     DeepWiki assertion fails there.
//   * STRUCTURAL — PASSES on `main` too, and NOT claimed to discriminate: check 1's four
//     JSON-parse assertions, check 2's four assertions (both gate scripts pre-exist AND
//     are already executable), and check 3's hooks-block arm (main retains it).
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
//   3. .claude/settings.json retains its hooks block, auto-allows no
//      `gh pr merge`, and its enabledPlugins ARE their derivation from the
//      corpus catalog (sync-skill-bindings.mjs --only claude).
//                                     [hooks: struct | merge: disc | plugins: disc]
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
//   8. The PR watcher is bound per harness (pi, DSH).                  [discriminating]
//   9. The R0 dispatcher table resolves to real skills, every skill a
//      root .md routes to resolves, and the unrouted-skill count
//      holds under its ratchet.                                      [structural]
//  10. The DSH arm's .dsh/skills farm IS its derivation from the corpus
//      (scripts/sync-skill-bindings.mjs --only farm), every entry is a
//      symlink, and the README signpost is present.               [discriminating]
//
// Usage:
//   node scripts/check-harness-config.mjs                 # check this tree
//   node scripts/check-harness-config.mjs --root <dir>    # check another tree
//   node scripts/check-harness-config.mjs --self-test     # prove the split above

import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { CLAUDE_CATALOG, CORPUS_NEEDS, corpusSkipReason } from "./lib/corpus.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
// --root lets the checks run against another tree; --self-test uses it on mutated copies
// of this tree (and is the only caller that passes it).
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

// The actions opencode.json must DENY, each with the reason, quoted from the rulebook.
//
// opencode V2's ordered base policy starts with `{action:"*", resource:"*", effect:"allow"}`
// (https://opencode.ai/docs/permissions, "Defaults"), so an `allow` rule grants exactly what
// the default already grants. The allow-only block this check used to assert was therefore
// INERT — and it explicitly granted `gh pr merge *`, the one action AGENTS.md forbids
// outright. Only `deny` and `ask` constrain, so this check asserts DENY rules:
//   gh pr merge           — "No agent merges" (AGENTS.md, "Commit, push, land", step 6);
//                           the glob also covers `--admin` and `--auto`, both forbidden by
//                           the git-workflow skill.
//   git push --force      — force-push is forbidden on every branch (R6). The pre-push gate
//                           is the precise enforcement (it parses flags and refspecs); this
//                           is the coarse second belt.
//   git commit --no-verify — hooks are never bypassed (R6). The pre-commit gate parses the
//                           flags precisely; this catches the plain form even if that hook
//                           is not wired.
const MUST_DENY = [
  ["gh pr merge*", "no agent merges (AGENTS.md 'Commit, push, land' step 6); also covers --admin/--auto"],
  ["git push *--force*", "force-push is forbidden on every branch (R6)"],
  ["git commit *--no-verify*", "hooks are never bypassed (R6)"],
];

// The dispatcher-coverage RATCHET (check 9). MEASURED on the tree this gate ships with:
// 355 corpus skills (`marketplace/*/skills/*/SKILL.md`) against 129 `DISPATCHER.md` rows,
// i.e. 226 corpus skills carry no routing row.
//
// MEASURED AGAIN 2026-11-15 after the corpus repair (opencharly/marketplace#616). The gate's own
// line IS the measurement, so these are read from it rather than inferred: `129/355 corpus skills
// routed, 226 unrouted`, where the tree before the repair read `119/352`, 233 unrouted. TWO numbers
// moved — corpus skills 352 → 355 and ROUTED rows 119 → 129 — and the unrouted gap is their
// subtraction both times: 352 − 119 = 233, 355 − 129 = 226. The repair regenerated the corpus —
// eight archived omarchy projections dropped here, while `qwen3-tts`, `openwebui-cli` and other
// corpus additions account for the +3 net — and the endpoints are what the gate printed rather
// than a decomposition nobody measured.
// The ceiling follows it because it may only ever DECREASE — and because at 233 the gate's own
// self-test stopped discriminating: its "dropping a DISPATCHER row must FAIL" arm mutates one row,
// which took the gap to 227, still under the ceiling, so the mutation went unnoticed. `charly task
// verify` caught that, which is the only reason it was found rather than assumed.
//
// MEASURED AGAIN 2026-11-23 when the pins advanced to the retired-corpus tree
// (opencharly/marketplace#644): `134/358 corpus skills routed, 224 unrouted` (358 − 134 = 224).
// The corpus lost `immich-ml` and `immich-ml-layer` to the retirement list, the routed rows did
// not move, and at 226 the self-test's own dropping-a-row arm went green again — exactly the
// slack this ratchet exists to forbid. The ceiling tightened to 224.
//
// MEASURED AGAIN the same day on the NEXT corpus (`135/361`, opencharly/marketplace#644 was
// followed by a corpus that publishes three more skills — `ai-toolkit`, `ai-toolkit-layer`,
// `cachyos-coder-tools` — and one more routing row): `135/361 corpus skills routed, 226
// unrouted` (361 − 135 = 226). This is the ONE direction the comment above forbids taking
// silently, so it is stated: the ceiling rises to follow a corpus that GREW, not to excuse a
// routing regression — the routed set grew too, and the self-test's dropping-a-row arm still
// fails at 227 (227 > 226), which is the property the ceiling exists to preserve. A ceiling
// that cannot follow corpus growth would either block every corpus addition or be bypassed.
//
// MEASURED AGAIN 2026-11-24 when the pins advanced to the corpus after opencharly/marketplace#648
// and #650 retired nine cards (opencharly/opencharly#1266): `130/352 corpus skills routed, 222
// unrouted` (352 − 130 = 222). With the ceiling left at 226 the self-test's dropping-a-row arm
// went green again (223 ≤ 226), the slack this ratchet forbids, so the ceiling tightens to 222.
// MEASURED AGAIN 2026-11-27 on the corpus the harness-retirement pin wave carries
// (opencharly/marketplace#662 and #663; corpus tag `v2026.331.0144`): `123/297 corpus skills
// routed, 174 unrouted` (297 − 123 = 174). The retirement sweep removed 55 skills
// (measured 2026-11-27), so
// the ceiling tightens to 174 — at 222 the self-test's dropping-a-row arm went green
// again, the slack this ratchet forbids.
// MEASURED AGAIN 2026-11-28 on the corpus the branch update carries
// (opencharly/marketplace#667; corpus tag `v2026.331.2137`): `119/292 corpus skills routed,
// 173 unrouted` (292 − 119 = 173). At 174 the ceiling left ONE unit of slack, and the
// self-test's dropping-a-row arm went green again (174 <= 174), so the ceiling tightens
// to 173.
const MAX_UNROUTED = 173;

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
    "AGENTS.md",
    ".claude/settings.json",
    ".claude/workflows/audit-deploy-configs.js",
    ".claude/hooks/pre-commit-gate.sh",
    ".claude/hooks/pre-push-gate.sh",
    ".mcp.json",
    ".pi/mcp.json",
    ".pi/settings.json",
    "opencode.json",
    ".codex/config.toml",
    ".pi/watch.items",
    ".pi/extensions/watch.ts",
    ".pi/extensions/footer.ts",
    ".pi/extensions/question.ts",
    ".pi/extensions/github-pr-status.ts",
    ".opencode/package.json",
    ".opencode/agent",
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
      // uses for this exact case (checks 9/10: "not checked out — <check> skipped") instead
      // of letting cpSync throw ENOENT out of the self-test and abort every remaining arm.
      if (!existsSync(src)) {
        console.log(`  NOTICE  surface ${p} is not materialized in this checkout — not staged`);
        continue;
      }
      const dst = join(tree, p);
      mkdirSync(dirname(dst), { recursive: true });
      // `recursive` so a DIRECTORY surface (the DSH `.dsh/skills` farm) stages too; it is a
      // no-op for the file surfaces. `verbatimSymlinks` is REQUIRED, not decorative: `cpSync`
      // DEREFERENCES symlinks by default, so without it the staged farm is 353 real directories
      // whose contents are copies — a tree no assertion about link-ness can be faithful to. The
      // farm's SHAPE oracle below is what exposed this; the earlier comment claimed the behaviour
      // `cpSync` does not have.
      cpSync(src, dst, { recursive: true, verbatimSymlinks: true });
      chmodSync(dst, statSync(src).mode & 0o777);
    }
    // Materialize the corpus shape the surviving derivations read. When the real
    // `marketplace` submodule is checked out, its families supply the oracle.
    const mkt = join(root, "marketplace");
    if (existsSync(mkt)) {
      // Materialize one PLACEHOLDER SKILL.md per real skill, so check 9's skill inventory in
      // the staged tree matches the real one WITHOUT copying the corpus (346 files, some
      // large). The gate tests only EXISTENCE of `<family>/skills/<name>/SKILL.md`, so an
      // empty file is a faithful stand-in — and without it check 9 would find zero skills
      // in the staged tree and no mutation could ever turn it red (a test that cannot fail).
      //
      // A SKILL IS A DIRECTORY THAT HOLDS A SKILL.md — the gate's own definition (check 9) —
      // never a directory that merely exists. A corpus retirement deletes the SKILL.md and can
      // leave the now-empty directory behind in a working checkout (git tracks no empty dirs,
      // so nothing reports it), and a directory-name oracle turns that leftover into a skill
      // the corpus does not have: nine such leftovers made the staged tree carry 361 skills
      // (measured 2026-11-24) against the real 352, so the unmutated copy was RED (ratchet
      // 231 > 226, and the stale `.dsh/skills` derivation) while the live tree was GREEN.
      // The guard below is what keeps this oracle faithful; `stage()` also plants one
      // deliberate empty directory so the base-green assertion keeps proving it.
      for (const fam of readdirSync(mkt, { withFileTypes: true })) {
        if (!fam.isDirectory()) continue;
        const sk = join(mkt, fam.name, "skills");
        if (!existsSync(sk)) continue;
        for (const s of readdirSync(sk, { withFileTypes: true })) {
          if (!s.isDirectory() || !existsSync(join(sk, s.name, "SKILL.md"))) continue;
          const dst = join(tree, "marketplace", fam.name, "skills", s.name, "SKILL.md");
          mkdirSync(dirname(dst), { recursive: true });
          writeFileSync(dst, "");
        }
      }
      // Check 9(d) asserts every `.opencode/agent/` pointer names an EXISTING corpus agent
      // definition, so the staged tree carries one placeholder per real definition — the
      // `agents/` trees are small, and without them the unmutated copy would be RED for a
      // file it never staged.
      for (const fam of readdirSync(mkt, { withFileTypes: true })) {
        if (!fam.isDirectory()) continue;
        const ag = join(mkt, fam.name, "agents");
        if (!existsSync(ag)) continue;
        for (const a of readdirSync(ag).filter((n) => n.endsWith(".md"))) {
          const dst = join(tree, "marketplace", fam.name, "agents", a);
          mkdirSync(dirname(dst), { recursive: true });
          writeFileSync(dst, "");
        }
      }
      // The CONTROL for the guard above: an empty skill directory that no source produced. It
      // must never reach the gate's skill inventory, so the unmutated-copy assertion goes RED if
      // the oracle ever goes back to counting directories. It sits inside a REAL family, because
      // a phantom FAMILY would change the corpus shape under test for the wrong reason.
      const withSkills = readdirSync(mkt, { withFileTypes: true }).filter(
        (f) => f.isDirectory() && existsSync(join(mkt, f.name, "skills")),
      );
      if (withSkills.length) {
        mkdirSync(join(tree, "marketplace", withSkills[0].name, "skills", "zzz-phantom"), { recursive: true });
      }
    }
    // Check 3 derives from the corpus's Claude catalog, so the staged tree carries the real one — a
    // single generated JSON file, copied as-is — or the plugin-set arm would have no input to fail on.
    const catalog = join(root, CLAUDE_CATALOG);
    if (existsSync(catalog)) {
      mkdirSync(dirname(join(tree, CLAUDE_CATALOG)), { recursive: true });
      cpSync(catalog, join(tree, CLAUDE_CATALOG));
    }
    // CHECK 14's CURRENCY ARM NEEDS A TAGGED CORPUS TO JUDGE. On a tree where `marketplace/` is not
    // a git checkout the currency assertion SKIPS VISIBLY — a legitimate state, and one a session
    // worktree really has — so a scratch tree without one can never exercise the assertion's
    // failure path at all, and an unprovable arm is exactly what the reviewer's BLOCK named. The
    // scratch tree therefore carries a real one-commit repo tagged at the pin `.pi/settings.json`
    // declares: that IS the pristine state check 14 must call GREEN, and the mutation table below
    // moves the pin to make it RED.
    const pinnedTag = (JSON.parse(readFileSync(join(tree, ".pi/settings.json"), "utf8")).packages ?? [])
      .map((p) => /^git:github\.com\/opencharly\/marketplace@(.+)$/.exec(String(p)))
      .find(Boolean)?.[1];
    const corpusTree = join(tree, "marketplace");
    mkdirSync(corpusTree, { recursive: true });
    if (pinnedTag) {
      // One file, so the commit is never empty on a checkout whose corpus was not staged.
      writeFileSync(join(corpusTree, "corpus.gate"), "the corpus this tree pins\n");
      const g = (...a) => spawnSync("git", a, { cwd: corpusTree, encoding: "utf8" });
      g("init", "-q", "-b", "main");
      g("config", "user.email", "gate@gate");
      g("config", "user.name", "gate");
      g("add", "-A");
      g("commit", "-qm", "the corpus at the pin");
      g("tag", pinnedTag);
    }
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
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); o.permissions = o.permissions.filter((r) => r.resource !== "gh pr merge*"); writeFileSync(p, JSON.stringify(o)); }, 'denies "gh pr merge*"', "5 (a dropped deny must FAIL — the forbidden-merge arm)"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); o.permissions.push({ action: "shell", resource: "gh pr merge*", effect: "allow" }); writeFileSync(p, JSON.stringify(o)); }, "does not allow a forbidden action", "5 (an allow appended after the deny must FAIL)"],
    [".claude/hooks/pre-push-gate.sh", (p) => chmodSync(p, 0o644), "pre-push-gate.sh is executable", "2 (a lost exec bit must FAIL, not pass)"],
    [".claude/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); s.permissions.allow.push("Bash(gh pr merge:*)"); writeFileSync(p, JSON.stringify(s, null, 2)); }, "does not auto-allow `gh pr merge`", "3 (the forbidden-merge arm)"],
    [".claude/settings.json", (p) => { const t = readFileSync(p, "utf8"); const k = t.match(/^\s*"charly-[^"]+@charly-plugins": true,\n/m); if (!k) throw new Error("no charly plugin key to drop"); writeFileSync(p, t.replace(k[0], "")); }, "enabledPlugins match their derivation", "3 (plugin-set arm — one dropped plugin must FAIL, which the old `>= 20` floor never could)", true],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); o.permission = { bash: { "charly check run *": "allow" } }; writeFileSync(p, JSON.stringify(o)); }, "uses the V2 `permissions` array", "5 (a lingering V1 permission map must FAIL)"],
    [".mcp.json", (p) => { const m = JSON.parse(readFileSync(p, "utf8")); delete m.mcpServers.deepwiki; writeFileSync(p, JSON.stringify(m)); }, ".mcp.json declares the DeepWiki server", "6"],
    [".pi/mcp.json", (p) => { const m = JSON.parse(readFileSync(p, "utf8")); delete m.mcpServers.deepwiki; writeFileSync(p, JSON.stringify(m)); }, ".pi/mcp.json declares the DeepWiki server", "6"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); delete o.mcp.deepwiki; writeFileSync(p, JSON.stringify(o)); }, "opencode.json declares the DeepWiki server", "6"],
    [".codex/config.toml", (p) => { const t = readFileSync(p, "utf8").split("\n").filter((l) => !/^\[mcp_servers\.deepwiki\]$/.test(l.trim()) && !/^url\s*=/.test(l.trim())).join("\n"); writeFileSync(p, t); }, ".codex/config.toml declares the DeepWiki server", "6"],
    [".codex/config.toml", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^project_doc_max_bytes = .+$/m, "project_doc_max_bytes = 1")), "fits the complete AGENTS.md", "6b (rulebook truncation)"],
    ["opencode.json", (p) => { const o = JSON.parse(readFileSync(p, "utf8")); o.instructions = [".opencode/instructions.md"]; writeFileSync(p, JSON.stringify(o)); }, "injects SOUL.md for opencode", "7 (opencode arm)"],
    [".pi/extensions/charly-gates.ts", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/readSoul/g, "__soul_removed__")), "injects the SOUL.md identity", "7 (pi arm)"],
    [".pi/watch.items", (p) => rmSync(p), "(the pi watch binding) exists", "8 (pi arm — a harness with no watch binding must FAIL)"],
    [".pi/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); s.extensions = s.extensions.filter((e) => !e.includes("footer")); writeFileSync(p, JSON.stringify(s)); }, "registers EXACTLY the committed .pi/extensions", "14 (registration — a dropped extension silently removes a tool AGENTS.md routes work through)"],
    [".pi/settings.json", (p) => { const s = JSON.parse(readFileSync(p, "utf8")); s.packages = s.packages.map((x) => String(x).replace(/@v[0-9.]+$/, "@v1999.001.0001")); writeFileSync(p, JSON.stringify(s)); }, "marketplace package pin matches the corpus this tree pins", "14 (currency — the pin the pi package resolves must be the corpus THIS tree carries; the staged corpus is tagged at the real pin, so this is the drift the check exists for)"],
    // Check 9 has TWO arms that catch different defects, so it needs two mutations.
    // (a) INVARIANT: a row pointing at a skill that does not exist (a dangling
    //     `/charly-<family>:<skill>` ref — the docs build treats that as a hard error).
    ["marketplace/DISPATCHER.md", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^\| .+ \| `\/charly-internals:git-workflow` \|$/m, "| a dropped row | `/charly-internals:no-such-skill` |")), "every DISPATCHER.md row resolves", "9 (a row must resolve to a real skill — the dangling-ref arm)", true],
    // (b) RATCHET: deleting rows leaves their skills unrouted, pushing the count past the ceiling.
    //     This is the arm that makes the gate able to fail at all — so it must not depend on the
    //     TREE's slack. A single-row mutation only bites while the tree sits AT the ceiling; the
    //     2026-11-28 corpus advance left one row of slack (173 unrouted against a 174 ceiling) and
    //     the arm went green-when-mutated, i.e. a control that could not fail. Dropping EVERY row is
    //     data-independent: unrouted becomes the whole corpus, which no ceiling can admit.
    ["marketplace/DISPATCHER.md", (p) => writeFileSync(p, readFileSync(p, "utf8").replace(/^\| .+ \| `\/charly-[^`]+` \|$\n/gm, "")), "dispatcher coverage ratchet holds", "9 (the ratchet — dropping the rows must FAIL, or the gate cannot notice coverage loss)", true],
    // (c) INVARIANT: a skill the hand-curated AGENTS.md table routes to must exist in the corpus.
    ["AGENTS.md", (p) => writeFileSync(p, readFileSync(p, "utf8").replace("`/charly-internals:git-workflow`", "`/charly-internals:no-such-skill`")), "every skill a root .md routes to resolves", "9 (a root-document route must resolve — the hand-curated-table arm)", true],
    [".opencode/agent/root-cause-analyzer.md", (p) => writeFileSync(p, readFileSync(p, "utf8").replace("marketplace/internals/agents/root-cause-analyzer.md", "marketplace/internals/agents/no-such-agent.md")), "every opencode agent pointer names an existing corpus definition", "9 (a dangling corpus-agent pointer must FAIL)"],
    // The DSH arm has three surfaces, so it needs three mutations plus the
    // corpus-level collision arm (the property a flat name-keyed farm can lose).
    [".dsh/watch.items", (p) => rmSync(p), "(the DSH watch binding) exists", "8 (DSH arm — a harness with no watch binding must FAIL)"],
    [".dsh/README.md", (p) => rmSync(p), "the DSH harness-config signpost", "10 (a missing signpost must FAIL)"],
    // COVERAGE: dropping one bound skill leaves its corpus SKILL.md unbound.
    [".dsh/skills", (p) => rmSync(join(p, readdirSync(p).sort()[0]), { recursive: true, force: true }), "matches its derivation", "10 (coverage — an unbound corpus skill must FAIL)", true],
    // COLLISION: a second family offering the same skill directory name. A flat
    // farm is keyed by name, so this would silently shadow one of the two.
    ["marketplace", (p) => { const name = readdirSync(join(tree, ".dsh/skills")).sort()[0]; const dst = join(p, "zzz-collision", "skills", name); mkdirSync(dst, { recursive: true }); writeFileSync(join(dst, "SKILL.md"), ""); }, "collisions", "10 (collision — a duplicate skill name across families must FAIL)", true],
  ];
  // The four corpus-measured arms (check 9's two, check 10's coverage + collision) are
  // measured against `marketplace/DISPATCHER.md`, so they can only be exercised where that
  // submodule is materialized — the same precondition the GATE guards at checks 9 and 10.
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

  // THE CORPUS-ABSENT ARM — the one arm here that must NOT turn the gate red. A session worktree that
  // did not populate its submodules (Part II rule 2) must leave every corpus-dependent check SKIPPING
  // VISIBLY. The regression this exists for is a check that silently loses its skip and inverts from
  // PASS to RED on every such tree, which is what checks 3 and 10 did when their coverage arms were
  // replaced by an unconditional generator call.
  stage();
  // Both surviving derivations read the shared corpus: the farm needs skill FILES, the Claude arm
  // needs the catalog, and this fixture holds neither.
  const skips = ["carries no skills", "carries no catalog", "the .dsh/skills derivation check skipped", "enabledPlugins derivation check skipped"];
  for (const state of ["absent", "present-but-empty"]) {
    // BOTH non-materialised shapes, because they are not the same tree and the difference is the defect:
    // `git worktree add` creates the submodule MOUNT POINT, so a session worktree (Part II rule 2) has
    // `marketplace/` PRESENT and EMPTY, not absent. Testing only the removed directory left the empty
    // one unguarded — and with it the writer published a zero-skill corpus as a state, emptying the
    // 353-entry farm (opencharly/opencharly#508).
    rmSync(join(tree, "marketplace"), { recursive: true, force: true });
    if (state === "present-but-empty") mkdirSync(join(tree, "marketplace"), { recursive: true });
    const r = runGate();
    const missing = skips.filter((m) => !r.out.includes(m));
    if (r.code !== 0) {
      bad(`a tree whose corpus is ${state} is not GREEN — every corpus-dependent check must SKIP, not fail:\n${r.out}`);
    } else if (missing.length) {
      bad(`a tree whose corpus is ${state} is green, but did not report the visible skip(s): ${missing.join(" | ")}`);
    } else {
      console.log(`  PASS  check 3/9/10: a tree whose corpus is ${state} SKIPS every derivation arm visibly and stays green`);
    }
  }

  rmSync(tmp, { recursive: true, force: true });
  if (failures > 0) {
    console.error(`check-harness-config --self-test: ${failures} FAILURE(S)`);
    process.exit(1);
  }
  // The denominator names BOTH kinds of arm: the mutations above, each of which must turn its own
  // check RED, and the one corpus-absent arm below it, which must leave the gate GREEN.
  const arms = mutations.length + 1;
  console.log(`check-harness-config --self-test: OK (${arms - skipped}/${arms} arms live — "${mutations.length - skipped} mutations that must go RED + 1 corpus-absent tree that must stay GREEN"${skipped ? `; ${skipped} skipped — surface not materialized in this checkout` : ""})`);
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
// The ONE derivation of the harness skill bindings, INVOKED rather than re-implemented.
//
// Every coverage assertion that used to live below — check 10's farm — was a
// SECOND implementation of `scripts/sync-skill-bindings.mjs`'s derivation, including its `.well-known`
// exclusion and its collision rule. Two implementations of one derivation drift apart, and the drift
// is invisible because each agrees with itself. So the generator owns the derivation, and the checks
// here own the SHAPE oracles that must hold whatever it emits: a derivation that emitted a bare
// `marketplace` entry, or a farm whose entries do not resolve, would pass its own `--check` and still
// be wrong. `--check` is exit 1 when the artifact on disk is not what the corpus derives — which is
// exactly "was the generator run", the same thing the pin-advance path enforces.
function derivedBindings(binding) {
  const r = spawnSync(process.execPath, [join(here, "sync-skill-bindings.mjs"), "--check", "--only", binding, "--root", root], {
    encoding: "utf8",
  });
  return { rc: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

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
// 1. Every harness JSON parses. STRUCTURAL: all four exist on `main` too, so this class
//    is not the branch's evidence — read it as "an existing surface stays valid".
for (const p of [
  ".claude/settings.json",
  "opencode.json",
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

// 3. .claude/settings.json keeps its hooks block, and its plugin set IS the corpus derivation.
//    The set used to be asserted as `>= 20` — a floor that passed at 26 of the catalog's 44 plugins
//    while every corpus family added since the last hand edit stayed invisible to Claude Code, and
//    the other three bindings saw it (opencharly/opencharly#1100). A count cannot see drift; only
//    the derivation can, so the generator owns it and this check asks "was the generator run" —
//    the same shape as check 10. The one auto-allow a rulebook FORBIDS is asserted absent: no agent
//    merges (AGENTS.md, "Commit, push, land", step 6), so an allow rule that approves a merge with
//    no prompt is a weakened guardrail.
{
  const s = jsonOr(".claude/settings.json");
  ok(Array.isArray(s.hooks?.PreToolUse) && s.hooks.PreToolUse.length > 0, ".claude/settings.json retains the PreToolUse hooks block");
  const allow = s.permissions?.allow ?? [];
  const merges = allow.filter((a) => /^Bash\(gh pr merge\b/.test(a));
  ok(merges.length === 0, `.claude/settings.json does not auto-allow \`gh pr merge\` (offenders: ${merges.join(", ") || "none"})`);
  if (!CORPUS_NEEDS.catalog(root)) {
    pass(`${corpusSkipReason(root, "catalog")} — enabledPlugins derivation check skipped (the hooks assertion above still holds)`);
  } else {
    const gen3 = derivedBindings("claude");
    ok(gen3.rc === 0, ".claude/settings.json enabledPlugins match their derivation (node scripts/sync-skill-bindings.mjs --check --only claude)");
    if (gen3.rc !== 0) for (const l of gen3.out.trim().split("\n")) console.error(`        ${l}`);
  }
}

// 4. The Claude workflow exists (invoked by name — nothing lists it).
ok(existsSync(join(root, ".claude/workflows/audit-deploy-configs.js")), ".claude/workflows/audit-deploy-configs.js exists");

// 5. opencode.json DENIES the actions the rulebook forbids. Under V2's allow base policy
//    only deny/ask constrain, so this asserts the denies themselves — and that the migrated
//    V1 `permission` map (which granted `gh pr merge *`) is gone rather than lingering.
{
  const o = jsonOr("opencode.json");
  ok(!Object.hasOwn(o, "permission"), "opencode.json uses the V2 `permissions` array, not the migrated V1 `permission` map");
  const rules = Array.isArray(o.permissions) ? o.permissions : [];
  for (const [resource, why] of MUST_DENY) {
    ok(rules.some((r) => r?.action === "shell" && r?.resource === resource && r?.effect === "deny"),
      `opencode.json denies "${resource}" — ${why}`);
  }
  const granted = rules.filter((r) => r?.effect === "allow" && MUST_DENY.some(([res]) => res === r?.resource));
  ok(granted.length === 0, `opencode.json does not allow a forbidden action (offenders: ${granted.map((r) => r.resource).join(", ") || "none"})`);
}

// 6. Every harness surface that supports MCP declares the DeepWiki server. DISCRIMINATING:
//    an unmodified `main` carries no `.mcp.json` at all and no `mcp`/`mcp_servers` entry, so
//    these assertions fail there — going green is evidence the surfaces are wired. The
//    table is [surface, extractor, who] so adding a harness is ONE row and the guarded set
//    is legible in one place. Each surface's syntax was verified against its OWN harness:
//      .mcp.json        — Claude Code's project-scoped HTTP MCP file (a remote server needs
//                         `type: "http"` + `url`);
//      .pi/mcp.json     — pi's native project MCP file (same `mcpServers` shape);
//      opencode.json    — opencode's top-level `mcp` map (`{type: "remote", url}`);
//      .codex/config.toml — Codex `[mcp_servers.<name>]` with `url` (streamable HTTP).
{
  const DEEPWIKI_URL = "https://mcp.deepwiki.com/mcp";
  const MCP_SURFACES = [
    [".mcp.json", (v) => v.mcpServers?.deepwiki?.url, "Claude Code (project-scoped .mcp.json)"],
    [".pi/mcp.json", (v) => v.mcpServers?.deepwiki?.url, "pi (project .pi/mcp.json)"],
    ["opencode.json", (v) => v.mcp?.deepwiki?.url, "opencode (top-level mcp map)"],
    [".codex/config.toml", (v, p) => tomlString(p, "mcp_servers.deepwiki", "url"), "Codex ([mcp_servers.deepwiki])"],
  ];
  for (const [surface, extract, who] of MCP_SURFACES) {
    const url = extract(jsonOr(surface), surface);
    ok(url === DEEPWIKI_URL, `${surface} declares the DeepWiki server for ${who} (deepwiki.url === ${DEEPWIKI_URL})`);
  }
}

// 6b. Codex applies the top-level project instruction byte budget before the model sees AGENTS.md.
{
  const config = (read(".codex/config.toml") ?? "").split(/^\s*\[/m, 1)[0];
  const budget = Number(config.match(/^project_doc_max_bytes\s*=\s*(\d+)\s*$/m)?.[1]);
  const rulebook = read("AGENTS.md");
  ok(rulebook !== null && budget >= Buffer.byteLength(rulebook), "Codex project_doc_max_bytes fits the complete AGENTS.md");
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
//    Codex uses its native additive SessionStart context; verify that profile live with the CLI.
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
  ];
  for (const [surface, asserts, who] of SOUL_SURFACES) {
    ok(asserts(jsonOr(surface), surface), `${surface} injects SOUL.md for ${who}`);
  }
}

// 8. The PR watcher is bound per harness. The harness-INDEPENDENT watcher is
//    `scripts/gh/cli.ts`; the items file is the same `owner/repo#num` grammar the opencode
//    plugin parses. The pi arm's items file is inert by design; the extension that arms it
//    is verified by `scripts/check-pi-watch.mjs`.
ok(existsSync(join(root, ".pi/watch.items")), ".pi/watch.items (the pi watch binding) exists");
ok(existsSync(join(root, ".dsh/watch.items")), ".dsh/watch.items (the DSH watch binding) exists");

// 9. Dispatcher coverage: the R0 dispatcher table in `marketplace/DISPATCHER.md` is the
//     routing half of the corpus, emitted one row per `type: skill` entity carrying a
//     `triggers:` list (see `plugin-marketplace/candy/plugin-marketplace/emit_dispatcher.go`).
//     Three assertions, and they catch DIFFERENT defects ((c) is written beside (a), below):
//       (a) INVARIANT — every emitted row resolves to a real `marketplace/<family>/skills/
//           <name>/SKILL.md`. A row pointing at a deleted or renamed skill is a dangling
//           `/charly-<family>:<skill>` reference, which BREAKS the docs build (an
//           unresolvable reference is a hard error there, not a dead link).
//       (b) RATCHET — the number of corpus skills with NO row may not exceed MAX_UNROUTED.
//           The pinned corpus has 233 unrouted skills; the trigger-authoring cutover lowers it.
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

    // (c) every skill a hand-authored root document routes to resolves, by the same rule as (a).
    //     The R0 table in AGENTS.md is hand-curated OUTSIDE the generated markers, so (a) never
    //     reads it: `/charly-tools:generate-podcast` sat in that table for six weeks while the
    //     pinned corpus had no such skill (opencharly/opencharly#1226).
    // The harness-authored documents that route to skills: the root narrative AND the
    // opencode agent pointers. The pointers are hand-authored (`.opencode/agent/*.md`),
    // so their `/charly-…` refs need the same dangling-ref arm as the root table.
    const agentDir = join(root, ".opencode/agent");
    const agentFiles = existsSync(agentDir)
      ? readdirSync(agentDir).filter((n) => n.endsWith(".md")).sort().map((n) => `.opencode/agent/${n}`)
      : [];
    const routedDocs = [...readdirSync(root).filter((n) => n.endsWith(".md")).sort(), ...agentFiles];
    const rootRefs = [];
    for (const f of routedDocs) {
      readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/\/charly-([a-z0-9-]+):([a-z0-9-]+)/g)) {
          rootRefs.push({ where: `${f}:${i + 1}`, family: m[1], name: m[2] });
        }
      });
    }
    const unresolved = rootRefs.filter(
      (r) => !existsSync(join(root, "marketplace", r.family, "skills", r.name, "SKILL.md")),
    );
    ok(
      unresolved.length === 0,
      `every skill a root .md routes to resolves in the pinned corpus (${rootRefs.length} refs; ` +
        `dangling: ${unresolved.map((d) => `${d.where} /charly-${d.family}:${d.name}`).join(", ") || "none"})`,
    );

    // (d) every opencode agent pointer that delegates to a corpus agent definition names a
    //     file that EXISTS. The pointer is thin by design, so a renamed or retired corpus
    //     agent would otherwise leave it delegating to nothing — silently, since no other
    //     check reads `.opencode/agent/`.
    const agentTargets = [];
    for (const f of agentFiles) {
      for (const m of readFileSync(join(root, f), "utf8").matchAll(/marketplace\/([a-z0-9-]+)\/agents\/([a-z0-9-]+)\.md/g)) {
        agentTargets.push({ where: f, path: `marketplace/${m[1]}/agents/${m[2]}.md` });
      }
    }
    const missingTargets = agentTargets.filter((t) => !existsSync(join(root, t.path)));
    ok(
      missingTargets.length === 0,
      `every opencode agent pointer names an existing corpus definition ` +
        `(${agentTargets.length} pointers; missing: ${missingTargets.map((t) => `${t.where} -> ${t.path}`).join(", ") || "none"})`,
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

// 10. The DSH arm. Same contract as check 9 for the other binding: the farm IS its derivation, and
//     the shape arm (every entry a symlink) is the oracle the derivation cannot provide for itself.
//     DSH's ONLY native repo-local config home is `<projectRoot>/.dsh/`:
//     `dsh-skill-filesystem` scans `.dsh/skills` at rank 100 and discovers only depth-1
//     `<name>/SKILL.md` bundles. The marketplace corpus is THREE levels deep
//     (`marketplace/<family>/skills/<name>/SKILL.md`), so the corpus is bound as a flat
//     symlink farm — one entry per skill, following the `marketplace` gitlink, so there is
//     no generated copy and no second pin. Two assertions, catching different defects:
//       (a) COVERAGE — every corpus skill has a `.dsh/skills/<name>` entry resolving to a
//           `SKILL.md`. A newly pinned skill that nobody bound FAILS, so the farm is a
//           ratchet on the corpus (the same coverage assertion as check 9's dispatcher inventory).
//       (b) COLLISION — no two families may share a skill directory name. The farm is keyed
//           by NAME, so a collision would silently shadow one of the two skills. Measured
//           0 across the pinned corpus today; the assertion keeps it that way.
//     Plus the signpost that documents the arm.
//     DISCRIMINATING: `main` carries no `.dsh/` at all, so this fails there.
{
  ok(existsSync(join(root, ".dsh/README.md")), ".dsh/README.md (the DSH harness-config signpost) exists");

  ok(existsSync(join(root, ".dsh/skills")), ".dsh/skills (the flat farm DSH discovers at rank 100) exists");

  // SHAPE, not coverage — an oracle independent of the derivation: every entry must be a symlink
  // into the corpus, because a farm entry that is a real file or a dangling link would be a copy or
  // a lie rather than a binding, and the generator's own `--check` cannot see that it emitted one.
  // This arm needs no corpus, so it always runs.
  const farm = join(root, ".dsh/skills");
  if (existsSync(farm)) {
    const notLinks = readdirSync(farm).filter((n) => !lstatSync(join(farm, n)).isSymbolicLink());
    ok(
      notLinks.length === 0,
      `every .dsh/skills entry is a symlink (real entries: ${notLinks.slice(0, 5).join(", ") || "none"})`,
    );
  }

  // COVERAGE — "was the generator run?", the same arm as check 3 for the other binding, and skipped
  // visibly on the same precondition. The farm is an ENUMERATION (one entry per corpus skill), so it
  // drifts every time a family is added; the derivation is the only thing that can keep it correct,
  // and a collision across families is where the generator hard-fails rather than shadowing one.
  if (!CORPUS_NEEDS.skills(root)) {
    pass(`${corpusSkipReason(root, "skills")} — the .dsh/skills derivation check skipped (the shape arm above still holds)`);
  } else {
    const gen13 = derivedBindings("farm");
    ok(gen13.rc === 0, "the .dsh/skills farm matches its derivation (node scripts/sync-skill-bindings.mjs --check)");
    if (gen13.rc !== 0) for (const l of gen13.out.trim().split("\n")) console.error(`        ${l}`);
  }

}

// 14. The pi PACKAGE — `.pi/settings.json`. It is what makes pi's skill corpus and every
//     custom tool EXIST, and it was the one harness surface this gate did not read at all.
//     Two defect classes, both measured on this tree:
//
//       (a) REGISTRATION. The extensions it declares must be EXACTLY the extensions committed
//           in `.pi/extensions/`. AGENTS.md routes work through `charly_load_skills`,
//           `charly_worktree_create`/`_remove`, `gh_pr_status`, `watch_arm`, `question` and
//           `coord_footer`; dropping one line here removes a tool the rulebook depends on,
//           silently, with no other symptom — `check-pi-gates.mjs` loads an extension directly
//           and never reads `settings.json`, so the file stays green while pi never loads it.
//
//       (b) CURRENCY. The marketplace package pin must be the tag of the corpus the umbrella
//           itself pins — the nearest tag `git describe` reaches from the submodule's HEAD.
//           MEASURED: the pin sat at `v2026.278.1917` while the submodule had advanced to
//           `v2026.329.1509`, so pi's `/skill:` listing was the 278 corpus while the rest of
//           the tree read the 329 one. TWO dispatcher-routed skills were absent from THAT
//           listing — `design` and `generate-podcast`; `design` was still listed from this
//           repo's own `.agents/skills/`, so only `generate-podcast` was unlisted everywhere
//           (reachable through `charly_load_skills`, which reads the corpus DIRECTLY, but
//           unaddressable as a pi skill).
//           Nothing read the pin, so nothing could notice. A harness cache is not a live
//           source (`/charly-internals:marketplace` "Per-harness vendoring"): the pin is the
//           ONLY thing that can hold it in step, so it needs a control.
{
  const settings = jsonOr(".pi/settings.json");
  const declared = (Array.isArray(settings.extensions) ? settings.extensions : [])
    .map((p) => String(p).replace(/^\.\/extensions\//, ""))
    .sort();
  const extensionsDir = join(root, ".pi/extensions");
  const onDisk = existsSync(extensionsDir)
    ? readdirSync(extensionsDir)
        .filter((f) => f.endsWith(".ts"))
        .sort()
    : [];
  ok(
    onDisk.length > 0 && JSON.stringify(declared) === JSON.stringify(onDisk),
    `.pi/settings.json registers EXACTLY the committed .pi/extensions (declared: ${
      declared.join(", ") || "none"
    }; on disk: ${onDisk.join(", ") || "none"})`,
  );

  const pin = (Array.isArray(settings.packages) ? settings.packages : [])
    .map((p) => /^git:github\.com\/opencharly\/marketplace@(.+)$/.exec(String(p)))
    .find(Boolean);
  const corpus = join(root, "marketplace");
  if (!pin) {
    ok(false, ".pi/settings.json pins the marketplace skill corpus (a git package on `packages`)");
  } else if (!existsSync(join(corpus, ".git"))) {
    pass(
      `marketplace/ is not checked out in ${root} — the pi package pin currency check skipped (the registration assertion above still holds)`,
    );
  } else {
    // The corpus tag THIS tree pins: the nearest tag reachable from the submodule's HEAD. The
    // remote is not asked — the pi package must be the corpus this tree carries, never the newest
    // one published, and a gate that reaches the network is not a gate.
    const described = spawnSync("git", ["describe", "--tags", "--abbrev=0", "HEAD"], {
      cwd: corpus,
      encoding: "utf8",
    });
    const tag = (described.stdout ?? "").trim();
    if (described.status !== 0 || tag === "") {
      pass(
        `marketplace/ carries no reachable tag in ${root} — the pi package pin currency check skipped (the registration assertion above still holds)`,
      );
    } else {
      ok(
        pin[1] === tag,
        `.pi/settings.json's marketplace package pin matches the corpus this tree pins (pin: ${pin[1]}, corpus tag: ${tag})`,
      );
    }
  }
}

if (failures > 0) {
  console.error(`check-harness-config: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("check-harness-config: OK");
