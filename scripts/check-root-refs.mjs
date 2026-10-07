#!/usr/bin/env node
// check-root-refs.mjs — the "referenced root file exists" landing gate.
//
// WHY THIS EXISTS (R1, opencharly/opencharly#356). The four canonical root narratives
// — SOUL.md, VISION.md, GRIEVANCES.md, LIBERATION.md — were relocated from the charly
// SUBMODULE root to the UMBRELLA root (where every agent session is rooted). The
// relocation landed delete-first across two repos: charly#791 removed the four from
// charly's main, and the umbrella PR that added them at the new home was auto-closed at
// the validator's block limit — so for a window the files existed in NO repository's
// main, and every agent surface (AGENTS.md, .opencode/instructions.md,
// .pi/extensions/charly-gates.ts) pointed at `charly/SOUL.md`, a path that no longer
// resolved. Nothing in `task verify` read those surfaces, so no gate saw the loss.
//
// This gate closes that class. It runs inside `charly task verify`.
//
// Checks:
//   1. The four canonical root narratives exist at <root>.                [discriminating]
//   2. A PREFIXED reference to a canonical narrative (`<prefix>/<Name>.md`) whose file
//      lives at the umbrella root is a STALE reference — the #356 shape; the pointer
//      must be repointed. A prefixed reference that resolves at its own path is fine.
//      (A canonical missing at the root is check 1's failure, so this walk does not
//      duplicate it — that would be dead weight, not a second witness.)
//                                                                          [discriminating]
//
// Usage:
//   node scripts/check-root-refs.mjs                 # check this tree
//   node scripts/check-root-refs.mjs --root <dir>    # check another tree
//   node scripts/check-root-refs.mjs --self-test     # prove it discriminates

import { existsSync, readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx >= 0 ? resolve(argv[rootIdx + 1]) : resolve(here, "..");

// The canonical root narratives — the identity surface #356 lost. Hardcoded on
// purpose: the reference walk in check 2 derives its requirements from the surfaces
// themselves, so a cutover that ALSO deletes the reference would go silent; this list
// keeps the gate loud even then. A deliberate retirement of one of these is a
// deliberate edit to this list.
const CANONICAL = ["SOUL.md", "VISION.md", "GRIEVANCES.md", "LIBERATION.md"];

// The agent surfaces that carry root-file references. Existence is tolerated (an older
// tree may lack one); the check runs over whichever are present.
const SURFACES = [
  "AGENTS.md",
  "README.md",
  ".opencode/instructions.md",
  ".pi/extensions/charly-gates.ts",
  ".dsh/README.md",
];

// A root-file reference: an optional path prefix, then a basename whose stem starts with
// an uppercase letter (SOUL.md, VISION.md, …) and ends in `.md`. Lowercase-stem paths
// (marketplace/internals/agents/pr-validator.md) and digit-leading stems (CHANGELOG/
// 2026.277.1539.md) are deliberately NOT matched — they are not root-narrative
// references.
const REF = /(?:^|[\s`'"([{<])((?:[A-Za-z0-9._-]+\/)*)([A-Z][A-Z0-9_-]*)\.md\b/g;

// check(dir) — the ONE implementation. `dir` defaults to the resolved root; the
// self-test drives the SAME code path against a mutated temp tree.
function check(dir = root) {
  const failures = [];

  // Check 1 — the canonical narratives exist at the umbrella root.
  for (const name of CANONICAL) {
    if (!existsSync(join(dir, name))) {
      failures.push(`canonical root narrative MISSING at the umbrella root: ${name}`);
    }
  }

  // Check 2 — a prefixed reference to a canonical narrative whose file is at the
  // umbrella root is STALE (the #356 shape). Scoped to canonical basenames on purpose:
  // a bare `SKILL.md` or `charly/AGENTS.md` is a different, legitimate file, and
  // matching every `<Uppercase>.md` produced exactly those false positives.
  const canon = new Set(CANONICAL);
  const seen = new Set();
  for (const rel of SURFACES) {
    const abs = join(dir, rel);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, "utf8");
    for (const m of text.matchAll(REF)) {
      const prefix = m[1];
      const base = m[2] + ".md";
      if (!canon.has(base)) continue;
      if (!prefix) continue; // a bare canonical ref: existence is check 1's job
      const key = `${rel}:${prefix}${base}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (existsSync(join(dir, prefix, base))) continue; // resolves at its own path
      // The file is not at the prefixed path but IS at the umbrella root: the #356
      // relocation moved it and left the pointer behind.
      if (existsSync(join(dir, base))) {
        failures.push(
          `${rel}: STALE reference \`${prefix}${base}\` — the file lives at the umbrella root \`${base}\`; repoint the reference`,
        );
      }
      // else: absent at the root too — check 1 already FAILs that canonical.
    }
  }

  return failures;
}

function report(failures) {
  if (failures.length) {
    for (const f of failures) console.error(`check-root-refs: FAIL — ${f}`);
    console.error(`check-root-refs: ${failures.length} failure(s)`);
    return 1;
  }
  console.log(`check-root-refs: OK — ${CANONICAL.length} canonical root narratives present; every root-file reference in the agent surfaces resolves`);
  return 0;
}

// selfTest — proves the gate DISCRIMINATES by EXECUTING it against mutated copies of a
// temp tree (never asserting the claim). Every mutation must turn it RED carrying the
// mutated condition; a restored tree must turn it GREEN. Each surviving arm of check()
// has a mutation that fails without it: check 1 by the SOUL.md-removed case, the STALE
// arm by the charly/SOUL.md case.
function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "check-root-refs-"));
  let ok = 0;
  let bad = 0;

  const write = (rel, body) => {
    const p = join(tmp, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  };
  const expect = (label, wantFail) => {
    const failed = check(tmp).length > 0;
    const good = failed === wantFail;
    console.log(`  ${good ? "pass" : "FAIL"} — ${label} (expected ${wantFail ? "RED" : "GREEN"}, got ${failed ? "RED" : "GREEN"})`);
    if (good) ok++; else bad++;
  };

  // baseline: narratives present, AGENTS.md references a bare SOUL.md → GREEN
  for (const n of CANONICAL) write(n, `# ${n}\n`);
  write("AGENTS.md", "read `SOUL.md` first\n");
  expect("baseline: narratives + a bare ref present", false);

  // mutation 1 — check 1: remove SOUL.md → RED (canonical missing at root)
  rmSync(join(tmp, "SOUL.md"));
  expect("SOUL.md removed (check 1)", true);
  write("SOUL.md", "# SOUL\n");

  // mutation 2 — check 2 STALE arm: a prefixed ref whose file is at the umbrella root
  write("AGENTS.md", "read `charly/SOUL.md` first\n");
  expect("stale charly/SOUL.md reference (STALE arm)", true);

  // mutation 3 — SCOPING: a non-canonical uppercase ref (`SKILL.md`) and a prefixed
  // non-narrative ref (`charly/AGENTS.md`) must NOT fire (the false positives the first
  // implementation produced). All narratives stay at root → expected GREEN.
  write("AGENTS.md", "see `SKILL.md` and `charly/AGENTS.md`\n");
  expect("non-narrative refs are ignored (scoping)", false);

  // restored correct tree → GREEN
  write("AGENTS.md", "read `SOUL.md` first\n");
  expect("restored correct tree", false);

  rmSync(tmp, { recursive: true, force: true });
  console.log(`check-root-refs --self-test: ${ok} passed, ${bad} failed`);
  return bad === 0 ? 0 : 1;
}

if (argv.includes("--self-test")) {
  process.exit(selfTest());
}
process.exit(report(check()));
