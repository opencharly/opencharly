#!/usr/bin/env node
// sync-skill-bindings.mjs — DERIVE the umbrella's harness skill bindings from the pinned corpus.
//
// WHY THIS EXISTS. The umbrella is a session root (Part II #2), but the skill corpus it needs is
// three levels deep inside the pinned `marketplace` submodule
// (`marketplace/<family>/skills/<name>/SKILL.md`), while each harness looks at the root in its own
// shape. Three bindings bridge that, and they are of TWO DIFFERENT KINDS — a distinction that decides
// what is derivable and what is merely verifiable:
//
//   * A MIRROR — `.dsh/skills/<name>` is a flat symlink per corpus skill, because DSH's
//     `dsh-skill-filesystem` discovers `<projectRoot>/.dsh/skills/<name>/SKILL.md` at rank 100 and
//     `…/.agents/skills/<name>/SKILL.md` at rank 200, both at depth 1. A mirror is an ENUMERATION:
//     one entry per skill, so it drifts silently every time a family is added (opencharly#487).
//   * A REFERENCE — `reasonix.toml`'s `[skills] paths` is a sorted list of one entry per
//     `marketplace/<family>/{skills,agents}` directory, and `opencode.json`'s `skills.paths` is a
//     single entry naming the corpus root. An enumeration of family directories is the same defect
//     one level up; a single root entry cannot drift per family at all.
//
// So this script DERIVES both enumerations — the farm and `reasonix.toml`'s list — and only VERIFIES
// the single-root reference. Nothing here is a count carried by hand: the numbers below are measured
// on every run. This is what makes the bindings derived rather than maintained, and a derived binding
// has no parity burden — which is precisely what Part II #5's "no mirrors, no parity gate" is aimed at.
// (The rule is not against bindings; it is against hand-maintained copies that drift.)
//
// MEASURED at the commit that first derived them (2026-10-16): 353 corpus skills across 41 families
// with no name collision, and 43 `marketplace/<family>/{skills,agents}` directories. The derivation
// reproduced the hand-made farm EXACTLY — 0 entries only on disk, 0 only derivable, 0 with a different
// target — and found exactly ONE defect in the hand-sorted list: `marketplace/pod/skills` was listed
// before `marketplace/pod-verbs/skills`, which byte order reverses. Nothing could see it, because
// nothing derived the order. That is the whole argument for this file.
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

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const check = argv.includes("--check");
const selfTest = argv.includes("--self-test");
// Each check in the harness-config gate asserts ONE binding, so each invokes the generator scoped to
// it: the collision rule is a property of the FLAT farm only (reasonix enumerates family directories,
// not skill names), and an unscoped run would report a farm defect under the reasonix check's name.
const onlyIdx = argv.indexOf("--only");
const only = onlyIdx === -1 ? "all" : argv[onlyIdx + 1];
if (!["all", "farm", "reasonix", "opencode"].includes(only)) fail(`--only takes all|farm|reasonix|opencode, got ${only}`);

const FARM = ".dsh/skills";
const REASONIX = "reasonix.toml";
const OPENCODE = "opencode.json";
const CORPUS_ROOT = "marketplace";

// The corpus root carries the published `.well-known/` tree as well as the family directories, so a
// bare `readdir` invents a family called `.well-known` and binds `marketplace/.well-known/skills` — a
// directory of generated JSON, not skills. MEASURED the first time this ran: the naive version derived
// 44 entries where 43 exist, and only the gate's own `malformed entry` assertion would have caught it.
// Dot-prefixed entries are never families.
function familiesOf(market) {
  return readdirSync(market).filter((d) => !d.startsWith(".")).sort();
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- derivation

/** Every corpus skill, keyed by its flat name. A name collision across families is a HARD failure:
 *  the farm is flat, so two families publishing one name cannot both be bound, and silently picking
 *  one is exactly how a skill disappears from a session's catalog. */
function corpusSkills(r) {
  const market = join(r, CORPUS_ROOT);
  if (!existsSync(market)) fail(`${CORPUS_ROOT}/ is not checked out in ${r} — the corpus is the input`);
  const found = new Map();
  const collisions = [];
  for (const family of familiesOf(market)) {
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

/** The reasonix list as it must be: one entry per EXISTING `marketplace/<family>/{skills,agents}`
 *  directory, in byte order. The set is what the corpus supports; the order is what makes the file
 *  stable, and byte order is the only order two runs can agree on without a convention. */
function desiredReasonixPaths(r) {
  const market = join(r, CORPUS_ROOT);
  const out = [];
  for (const family of familiesOf(market)) {
    for (const sub of ["agents", "skills"]) {
      const rel = `${CORPUS_ROOT}/${family}/${sub}`;
      if (existsSync(join(r, rel)) && lstatSync(join(r, rel)).isDirectory()) out.push(rel);
    }
  }
  return out.sort();
}

/** The `paths = [ … ]` array as it is, plus the exact byte range of its BODY so the rewrite touches
 *  nothing else. Refuses rather than dropping a comment it cannot re-emit. */
function readReasonix(r) {
  const file = join(r, REASONIX);
  if (!existsSync(file)) fail(`${REASONIX} not found in ${r}`);
  const src = readFileSync(file, "utf8");
  const table = src.match(/^\[skills\][^\n]*\n/m);
  if (!table) fail(`${REASONIX} carries no [skills] table`);
  const from = table.index + table[0].length;
  const body = src.slice(from).match(/^([ \t]*)paths[ \t]*=[ \t]*\[([\s\S]*?)\n([ \t]*)\]/m);
  if (!body) fail(`${REASONIX}: [skills] carries no \`paths = [ … ]\` array`);
  const inner = body[2];
  if (inner.includes("#")) fail(`${REASONIX}: the paths array carries a comment — refusing to rewrite it`);
  const entries = [...inner.matchAll(/"([^"\n]*)"/g)].map((m) => m[1]);
  const bodyStart = from + body.index + body[0].indexOf("[") + 1;
  const bodyEnd = bodyStart + inner.length;
  return { src, entries, bodyStart, bodyEnd };
}

function renderReasonixPaths(paths) {
  // The body ends where the file's own newline before `]` begins: emitting one here too would
  // leave a blank line inside the array, which is a diff the derivation invented.
  return "\n" + paths.map((p) => `    "${p}",`).join("\n");
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

function syncReasonix(r, want, { write }) {
  const { src, entries, bodyStart, bodyEnd } = readReasonix(r);
  const same = entries.length === want.length && entries.every((e, i) => e === want[i]);
  if (!same && write) {
    writeFileSync(join(r, REASONIX), src.slice(0, bodyStart) + renderReasonixPaths(want) + src.slice(bodyEnd));
  }
  return { total: want.length, have: entries.length, same, orderOnly: !same && entries.length === want.length && [...entries].sort().join() === [...want].sort().join() };
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

// ---------------------------------------------------------------------- main

function run(r, { write, quiet }) {
  const parts = [];
  const stale = [];
  const wantFarm = only === "all" || only === "farm";
  const wantReasonix = only === "all" || only === "reasonix";
  const wantOpencode = only === "all" || only === "opencode";

  // The skill NAMES are only needed to derive the flat farm. Skipped entirely otherwise, so a corpus
  // name collision cannot be reported by a check that is not about the farm.
  let skills = null;
  if (wantFarm) {
    skills = corpusSkills(r);
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
  if (wantReasonix) {
    const want = desiredReasonixPaths(r);
    const reasonix = syncReasonix(r, want, { write });
    if (!reasonix.same) stale.push(`${REASONIX} [skills] paths (${reasonix.have} -> ${reasonix.total} entries${reasonix.orderOnly ? ", order only" : ""})`);
    parts.push(`sync-skill-bindings: ${REASONIX} [skills] paths  ${reasonix.same ? `unchanged (${reasonix.total} entries)` : `STALE (${reasonix.have} -> ${reasonix.total} entries${reasonix.orderOnly ? ", order only" : ""})`}`);
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
