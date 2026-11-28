#!/usr/bin/env node
// sync-skill-bindings.mjs — DERIVE the umbrella's harness skill bindings from the pinned corpus.
//
// WHY THIS EXISTS. The umbrella is a session root (Part II #2), but the skill corpus it needs is
// three levels deep inside the pinned `marketplace` submodule
// (`marketplace/<family>/skills/<name>/SKILL.md`), while each harness looks at the root in its own
// shape. Four bindings bridge that, and they are of TWO DIFFERENT KINDS — a distinction that decides
// what is derivable and what is merely verifiable:
//
//   * A MIRROR — `.dsh/skills/<name>` is a flat symlink per corpus skill, because DSH's
//     `dsh-skill-filesystem` discovers `<projectRoot>/.dsh/skills/<name>/SKILL.md` at rank 100 and
//     `…/.agents/skills/<name>/SKILL.md` at rank 200, both at depth 1. A mirror is an ENUMERATION:
//     one entry per skill, so it drifts silently every time a family is added (opencharly#487).
//   * A PLUGIN SET — `.claude/settings.json`'s `enabledPlugins` names one `<plugin>@charly-plugins` key
//     per entry of the corpus's Claude catalog (`marketplace/.claude-plugin/marketplace.json`), because
//     Claude Code loads a marketplace's skills per PLUGIN, never per directory. It is an enumeration
//     too, and it drifted the same way: hand-maintained, it named 26 of the catalog's 44 plugins while
//     the other three bindings saw every family (opencharly/opencharly#1100). Keys of OTHER
//     marketplaces are not the corpus's to derive, so they are preserved as written.
//   * A REFERENCE — `opencode.json`'s `skills.paths` is a single entry naming the corpus root.
//     A single root entry cannot drift per family at all, so it is verified rather than derived.
//
//   * A PIN — `.pi/settings.json` names the corpus as a git PACKAGE (`git:github.com/opencharly/
//     marketplace@<tag>`), so the harness follows one release of the corpus rather than a directory.
//     It is DERIVED from the corpus checkout's own tag, through the SAME library the harness-config
//     gate judges it with (`scripts/lib/corpus-tag.mjs`): the third surface a pin wave moves, and the
//     one that used to be nobody's job (opencharly/opencharly#1344 — two hand edits in one cutover).
//
// So this script DERIVES two enumerations — the farm and Claude's plugin set — and one pin, and only
// VERIFIES the single-root reference. Nothing here is a count carried by hand: the numbers below are measured
// on every run. This is what makes the bindings derived rather than maintained, and a derived binding
// has no parity burden — which is precisely what Part II #5's "no mirrors, no parity gate" is aimed at.
// (The rule is not against bindings; it is against hand-maintained copies that drift.)
//
// MEASURED at the commit that first derived the farm (2026-10-16) — 353 corpus skills across 41
// families with no name collision. The derivation reproduced the hand-made farm EXACTLY — 0
// entries only on disk, 0 only derivable, 0 with a different target. That is the whole argument
// for this file.
//
// Usage:
//   node scripts/sync-skill-bindings.mjs              # write the derived bindings
//   node scripts/sync-skill-bindings.mjs --check      # exit 1 if a rewrite is needed (the gate's mode)
//   node scripts/sync-skill-bindings.mjs --self-test  # prove each arm can FAIL, on temp fixtures
//   node scripts/sync-skill-bindings.mjs --root <dir> # run against another tree (the self-test's arm)
//
// Exit codes: 0 clean · 1 a binding is stale (--check) or failed · 2 usage.

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUDE_CATALOG, CORPUS_ROOT, CORPUS_NEEDS, corpusFamilies, corpusSkipReason } from "./lib/corpus.mjs";
import { corpusTag } from "./lib/corpus-tag.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const check = argv.includes("--check");
// --require-corpus: a MISSING corpus is a FAILURE, not a visible SKIP. The gate uses the
// default (a light tree must stay green); the pin wave's own derive step uses this flag,
// because that step's contract is "the bump advanced the corpus, so the bindings are
// re-derived" — and a skip there leaves STALE bindings behind a step that still reports
// [pass] (measured: a session worktree whose corpus was unmaterialized kept 45 entries where
// 46 were due, and only the later pin gate caught it). The wave itself is described, with its
// scope, in this repo's `charly.yml`; this file only consumes its output.
const requireCorpus = argv.includes("--require-corpus");
const selfTest = argv.includes("--self-test");
// Each check in the harness-config gate asserts ONE binding, so each invokes the generator scoped to
// it: the collision rule is a property of the FLAT farm only, and an unscoped run would report a
// farm defect under a check that is not about the farm.
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx === -1 ? "all" : argv[onlyIdx + 1];
if (!["all", "farm", "opencode", "claude", "pi"].includes(only)) fail(`--only takes all|farm|opencode|claude|pi, got ${only}`);

const FARM = ".dsh/skills";
const OPENCODE = "opencode.json";
const CLAUDE = ".claude/settings.json";
const PI = ".pi/settings.json";

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

/** The corpus root for the derivation that needs `need`, or `null` after reporting a visible SKIP.
 *
 *  A session worktree (Part II rule 2) has `marketplace/` present and EMPTY — `git worktree add`
 *  creates the mount point — so a derivation that treats that as a corpus derives ZERO skills and
 *  publishes the result as a state: it emptied the 353-entry farm, reporting `exit=0 done`
 *  (opencharly/opencharly#508). Existence is not materialisation. */
function corpusRootOrSkip(r, need, parts) {
  if (!CORPUS_NEEDS[need](r)) {
    if (requireCorpus) fail(corpusSkipReason(r, need));
    parts.push(`SKIP  ${corpusSkipReason(r, need)}`);
    return null;
  }
  return join(r, CORPUS_ROOT);
}

// ---------------------------------------------------------------- derivation

/** Every corpus skill, keyed by its flat name. A name collision across families is a HARD failure:
 *  the farm is flat, so two families publishing one name cannot both be bound, and silently picking
 *  one is exactly how a skill disappears from a session's catalog. */
function corpusSkills(r, market) {
  const found = new Map();
  const collisions = [];
  for (const family of corpusFamilies(r)) {
    const dir = join(market, family, "skills");
    if (!existsSync(dir) || !lstatSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!existsSync(join(dir, name, "SKILL.md"))) continue;
      if (found.has(name)) collisions.push(`${name}: ${found.get(name)} + ${family}`);
      else found.set(name, family);
    }
  }
  if (collisions.length) {
    fail(`corpus skill name collisions across families (a flat farm cannot bind both):\n  ${collisions.join("\n  ")}`);
  }
  return found;
}

/** The farm as it must be: `<name> -> ../../marketplace/<family>/skills/<name>`. */
function desiredFarm(skills) {
  const want = new Map();
  for (const [name, family] of skills) want.set(name, `../../${CORPUS_ROOT}/${family}/skills/${name}`);
  return want;
}

/** The farm as it is. A non-symlink entry is recorded as a target of `null` so it is reported and
 *  removed rather than silently shadowing a derivation. */
function readFarm(r) {
  const dir = join(r, FARM);
  const have = new Map();
  if (!existsSync(dir)) return have;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    have.set(name, lstatSync(p).isSymbolicLink() ? readlinkSync(p) : null);
  }
  return have;
}

/** The Claude plugin set as it must be: the catalog's marketplace name, and one `<plugin>@<market>`
 *  key per catalog entry, in byte order. A catalog without a name or with an unnamed entry is refused:
 *  deriving from it would publish a key Claude Code cannot resolve. */
function desiredClaudePlugins(r) {
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(join(r, CLAUDE_CATALOG), "utf8"));
  } catch (e) {
    fail(`${CLAUDE_CATALOG} does not parse: ${e.message}`);
  }
  const market = catalog?.name;
  if (typeof market !== "string" || !market) fail(`${CLAUDE_CATALOG} carries no marketplace \`name\``);
  const plugins = Array.isArray(catalog.plugins) ? catalog.plugins : [];
  const unnamed = plugins.filter((p) => typeof p?.name !== "string" || !p.name);
  if (unnamed.length) fail(`${CLAUDE_CATALOG}: ${unnamed.length} plugin entr${unnamed.length === 1 ? "y has" : "ies have"} no \`name\``);
  return { market, keys: plugins.map((p) => `${p.name}@${market}`).sort() };
}

/** `enabledPlugins` as it is, plus the exact byte range of its object BODY so the rewrite touches
 *  nothing else in `settings.json` (the hooks, the permissions, the file's own formatting). The object
 *  is flat — `"<plugin>@<market>": <bool>` — so a nested brace or a comment inside it is refused rather
 *  than mis-parsed. */
function readClaude(r) {
  const file = join(r, CLAUDE);
  if (!existsSync(file)) fail(`${CLAUDE} not found in ${r}`);
  const src = readFileSync(file, "utf8");
  let doc;
  try {
    doc = JSON.parse(src);
  } catch (e) {
    fail(`${CLAUDE} does not parse: ${e.message}`);
  }
  const m = src.match(/^([ \t]*)"enabledPlugins"[ \t]*:[ \t]*\{([^{}]*)\n([ \t]*)\}/m);
  if (!m) fail(`${CLAUDE} carries no multi-line \`"enabledPlugins": { … }\` object`);
  const bodyStart = m.index + m[0].indexOf("{") + 1;
  const bodyEnd = bodyStart + m[2].length;
  const indent = `${m[3]}  `;
  return { src, doc, enabled: doc.enabledPlugins ?? {}, bodyStart, bodyEnd, indent };
}

/** The derived keys first, in byte order, then every OTHER marketplace's key in its written order and
 *  with its written value — those are an operator's choice, not a projection of this corpus. */
function renderClaudePlugins(keys, others, indent) {
  const lines = [...keys.map((k) => [k, true]), ...others].map(([k, v]) => `${indent}${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return "\n" + lines.join(",\n");
}

function syncClaude(r, want, { write }) {
  const { src, enabled, bodyStart, bodyEnd, indent } = readClaude(r);
  const suffix = `@${want.market}`;
  const entries = Object.entries(enabled);
  const have = entries.filter(([k]) => k.endsWith(suffix));
  const others = entries.filter(([k]) => !k.endsWith(suffix));
  const wantSet = new Set(want.keys);
  const missing = want.keys.filter((k) => !(k in enabled));
  const extra = have.filter(([k]) => !wantSet.has(k)).map(([k]) => k);
  const disabled = have.filter(([k, v]) => wantSet.has(k) && v !== true).map(([k]) => k);
  const order = have.map(([k]) => k);
  const ordered = order.length === want.keys.length && order.every((k, i) => k === want.keys[i]);
  const same = !missing.length && !extra.length && !disabled.length && ordered;
  if (!same && write) {
    writeFileSync(join(r, CLAUDE), src.slice(0, bodyStart) + renderClaudePlugins(want.keys, others, indent) + src.slice(bodyEnd));
  }
  return { total: want.keys.length, have: have.length, same, missing, extra, disabled, orderOnly: !same && !missing.length && !extra.length && !disabled.length };
}

// --------------------------------------------------------------------- apply

function syncFarm(r, want, { write }) {
  const dir = join(r, FARM);
  const have = readFarm(r);
  const created = [], removed = [], retargeted = [];
  for (const name of want.keys()) if (!have.has(name)) created.push(name);
  for (const name of have.keys()) if (!want.has(name)) removed.push(name);
  for (const [name, target] of want) if (have.has(name) && have.get(name) !== target) retargeted.push(name);
  const changes = created.length + removed.length + retargeted.length;
  if (write && changes) {
    mkdirSync(dir, { recursive: true });
    for (const name of removed) rmSync(join(dir, name), { force: true });
    for (const name of [...created, ...retargeted]) {
      const p = join(dir, name);
      if (existsSync(p) || lstatSync(p, { throwIfNoEntry: false })) rmSync(p, { force: true });
      symlinkSync(want.get(name), p);
    }
  }
  return { total: want.size, have: have.size, created, removed, retargeted, changes };
}

function syncOpencode(r) {
  const file = join(r, OPENCODE);
  if (!existsSync(file)) return { present: false, namesRoot: false };
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail(`${OPENCODE} does not parse: ${e.message}`);
  }
  const paths = doc?.skills?.paths ?? [];
  return { present: true, namesRoot: paths.includes(CORPUS_ROOT), paths };
}

/**
 * syncPi <root> -> { present, changes, pin, want, skip }
 *
 * The marketplace package pin, derived from the corpus tag THIS tree carries. The tag comes from
 * `corpusTag()` — the library `check-harness-config` also reads — so the derivation and the gate are
 * one rule with two consumers, never two copies that drift.
 *
 * SKIPS VISIBLY when the pin cannot be derived: no `.pi/settings.json` (not a pi tree), no marketplace
 * package entry, or no corpus checkout (a session worktree carries an EMPTY `marketplace/`, Part II
 * rule 2). A skip is never a silent pass: every one of those states is named in the output.
 */
function syncPi(r, { write }) {
  const file = join(r, PI);
  if (!existsSync(file)) return { present: false, changes: false };
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail(`${PI} does not parse: ${e.message}`);
  }
  const pkgs = Array.isArray(doc.packages) ? doc.packages : [];
  const at = pkgs.findIndex((p) => /^git:github\.com\/opencharly\/marketplace@.+$/.test(String(p)));
  if (at < 0) return { present: true, changes: false, skip: "it names no marketplace package" };
  const pin = String(pkgs[at]);
  const { tag, reason } = corpusTag(r);
  if (tag === "") return { present: true, changes: false, pin, skip: reason };
  const want = `git:github.com/opencharly/marketplace@${tag}`;
  const changes = pin !== want;
  // THE CHECK MUST NOT MUTATE. `--check` is the gate's mode: it reports and exits 1, and a check that
  // also writes turns "is this tree correct?" into "make this tree correct", which would hide the very
  // staleness the pin wave is supposed to surface (measured: the first version of this function wrote
  // on `--check`, so the failing gate repaired the file and the next run was green).
  if (changes && write) {
    pkgs[at] = want;
    writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  }
  return { present: true, changes, pin, want };
}

// ---------------------------------------------------------------------- main

function run(r, { write, quiet }) {
  const parts = [];
  const stale = [];
  const wantFarm = only === "all" || only === "farm";
  const wantOpencode = only === "all" || only === "opencode";
  const wantClaude = only === "all" || only === "claude";
  const wantPi = only === "all" || only === "pi";

  // The skill NAMES are only needed to derive the flat farm. Skipped entirely otherwise, so a corpus
  // name collision cannot be reported by a check that is not about the farm.
  let skills = null;
  if (wantFarm) {
    const market = corpusRootOrSkip(r, "skills", parts);
    if (market === null) skills = null;
    else {
    skills = corpusSkills(r, market);
    const families = new Set(skills.values());
    const farm = syncFarm(r, desiredFarm(skills), { write });
    if (farm.changes) stale.push(`${FARM} (${farm.created.length} to create, ${farm.removed.length} to remove, ${farm.retargeted.length} to retarget)`);
    parts.push(`sync-skill-bindings: corpus: ${skills.size} skills across ${families.size} families, 0 name collisions`);
    parts.push(`sync-skill-bindings: ${FARM}  ${farm.changes ? `STALE (${farm.total} derived, ${farm.have} on disk)` : `unchanged (${farm.total} entries)`}`);
    if (farm.changes && !quiet) {
      for (const n of farm.created) parts.push(`    + ${n}`);
      for (const n of farm.removed) parts.push(`    - ${n}`);
      for (const n of farm.retargeted) parts.push(`    ~ ${n}`);
    }
    }
  }
  if (wantClaude) {
    if (corpusRootOrSkip(r, "catalog", parts) === null) { /* SKIPPED — the notice is in parts */ }
    else {
    const claude = syncClaude(r, desiredClaudePlugins(r), { write });
    const why = [
      claude.missing.length && `${claude.missing.length} to enable`,
      claude.extra.length && `${claude.extra.length} not in the catalog`,
      claude.disabled.length && `${claude.disabled.length} not \`true\``,
      claude.orderOnly && "order only",
    ].filter(Boolean).join(", ");
    if (!claude.same) stale.push(`${CLAUDE} enabledPlugins (${claude.have} -> ${claude.total} entries; ${why})`);
    parts.push(`sync-skill-bindings: ${CLAUDE} enabledPlugins  ${claude.same ? `unchanged (${claude.total} entries)` : `STALE (${claude.have} -> ${claude.total} entries; ${why})`}`);
    if (!claude.same && !quiet) {
      for (const k of claude.missing) parts.push(`    + ${k}`);
      for (const k of claude.extra) parts.push(`    - ${k}`);
      for (const k of claude.disabled) parts.push(`    ~ ${k}`);
    }
    }
  }
  if (wantPi) {
    const pi = syncPi(r, { write });
    if (!pi.present) parts.push(`sync-skill-bindings: ${PI}  SKIPPED (not a pi tree: no ${PI})`);
    else if (pi.skip) parts.push(`sync-skill-bindings: ${PI} marketplace pin  SKIPPED (${pi.skip})`);
    else {
      if (pi.changes) stale.push(`${PI} marketplace package pin (${pi.pin} -> ${pi.want})`);
      parts.push(
        `sync-skill-bindings: ${PI} marketplace pin  ${pi.changes ? `STALE (${pi.pin} -> ${pi.want})` : "unchanged"}`,
      );
    }
  }
  if (wantOpencode) {
    const opencode = syncOpencode(r);
    if (!opencode.present || !opencode.namesRoot) {
      fail(`${OPENCODE}: skills.paths must name the corpus root \`${CORPUS_ROOT}\` (found ${JSON.stringify(opencode.paths ?? null)})`);
    }
    parts.push(`sync-skill-bindings: ${OPENCODE} skills.paths  unchanged (names the corpus root)`);
  }

  if (!quiet) for (const l of parts) console.log(l);
  return stale;
}

if (selfTest) {
  const { runSelfTest } = await import("./sync-skill-bindings.selftest.mjs");
  process.exit(runSelfTest(run, root) ? 0 : 1);
}

const stale = run(root, { write: !check, quiet: false });
if (check && stale.length) {
  console.error(`FAIL: derived skill bindings are stale:\n  ${stale.join("\n  ")}`);
  console.error("run `node scripts/sync-skill-bindings.mjs` (the pin-advance path runs it)");
  process.exit(1);
}
console.log(check ? "sync-skill-bindings: clean" : "sync-skill-bindings: done");
