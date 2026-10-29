#!/usr/bin/env node
// check-bang-arm-ownership.mjs — the umbrella holds NO copy of the `!`-marker rule, and the
// PINNED corpus linter IS the implementation that enforces it.
//
// WHY THIS EXISTS (opencharly/opencharly#810, review round 1). That change moved the rule
// out of the umbrella: the umbrella's reconciler carried a SECOND implementation of the
// `!`-marker relation (`scripts/check-pr-body-diff.mjs`'s marker arm) and the corpus's
// `scripts/pr_body_lint.py` carried the first. R2 forbids two implementations of one
// behaviour, so the umbrella's copy was deleted — and the review named the two things that
// deletion alone does NOT prove:
//
//   FINDING 1 — "the replacement gate is not demonstrated": the deletion removed the
//     umbrella's own check of the rule, and nothing COMMITTED in this repo showed that the
//     canonical linter is the one that now runs. A PR body that says "the linter checks
//     this" is a claim in prose, not a control.
//
//   FINDING 5 — "R7 is not met": the change deleted the arm's self-test arms and added no
//     committed test that fails if the arm comes BACK. A cutover with no regression check
//     is a cutover that can be silently undone.
//
// So this file is that control, in the repo, and it holds two arms:
//
//   ARM 1 — OWNERSHIP. The umbrella's own tracked tree carries no implementation of the
//     rule: none of the retired arm's identifiers survives outside `CHANGELOG/` (history) and
//     outside this file (which holds the key set itself). The key set is COMMITTED here, so
//     the claim cannot be missed because the wording was written in a PR body.
//
//   ARM 2 — PARITY. The umbrella's OWN prose states the rule's shapes (AGENTS.md, "The `!`
//     marker and the body's breaking-change answer are two halves of ONE question"), and
//     the PINNED corpus linter is what enforces them. This arm proves the two AGREE: the
//     pinned linter must refuse every shape of silence the prose names and accept every
//     shape the prose calls an answer. A prose that outruns its enforcement is the same
//     defect the review found, in the other direction, and it is RED here.
//
// The two arms are the two halves of ONE claim: "the canonical linter is the sole
// implementation of the rule, and it enforces what this repo says it enforces."
//
// A corpus that is NOT checked out (a light session worktree — Part II #2) makes ARM 2
// SKIP VISIBLY. It never passes silently: the umbrella's own rulebook forbids a skip
// nobody can see.
//
// Usage: node scripts/check-bang-arm-ownership.mjs [--root <dir>] [--linter <path>] [--self-test]
// exit 0 clean · 1 finding

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argVal = (name) => {
  const i = argv.indexOf(name);
  return i === -1 || i + 1 >= argv.length ? null : argv[i + 1];
};

const root = resolve(argVal("--root") ?? join(here, ".."));
const SELF_REL = "scripts/check-bang-arm-ownership.mjs";

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);
const skip = (m) => console.log(`  SKIP  ${m}`);

// --- ARM 1: the retired arm's identifiers ----------------------------------------
//
// The five names the deleted arm defined. They are the KEY SET of the R5 sweep: the claim
// is "the umbrella's second copy of the rule is gone", and a claim keyed by a NAME is only
// as good as the names it carries. This file holds them, so the sweep is committed rather
// than written into a PR body, and this file excludes ITSELF from the sweep (a gate that
// found itself could never be green).
const RETIRED = [
  "checkMarkerRelation",
  "subjectCarriesMarker",
  "breakingChangeAnswer",
  "noneAnswer",
  "changeClassification",
];
const RETIRED_RE = new RegExp(`\\b(?:${RETIRED.join("|")})\\b`);

/** The tracked FILES of a tree — gitlinks excluded: another repo's tree is not this repo's. */
function trackedFiles(dir) {
  const out = spawnSync("git", ["-C", dir, "ls-files", "-s", "-z"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (out.status !== 0) throw new Error(`git ls-files failed in ${dir}: ${out.stderr}`);
  const files = [];
  for (const rec of out.stdout.split("\0")) {
    if (!rec) continue;
    const tab = rec.indexOf("\t");
    if (tab === -1) continue;
    if (rec.slice(0, tab).split(/\s+/)[0] === "160000") continue;
    files.push(rec.slice(tab + 1));
  }
  return files;
}

/** Every surviving occurrence of a retired identifier in the tree's own tracked files. */
function scanForRetired(dir) {
  const hits = [];
  for (const rel of trackedFiles(dir)) {
    if (rel === SELF_REL) continue;
    if (rel.startsWith("CHANGELOG/")) continue;
    let text;
    try {
      text = readFileSync(join(dir, rel), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue; // binary
    text.split("\n").forEach((ln, i) => {
      if (RETIRED_RE.test(ln)) hits.push({ file: rel, line: i + 1, text: ln.trim() });
    });
  }
  return hits;
}

// --- ARM 2: the pinned linter's behaviour, against this repo's own prose -----------
//
// The shapes, exactly as AGENTS.md states them. `refuse` is what the umbrella's prose
// PROMISES the pinned linter does. The probe calls the pinned linter's own rule function —
// the implementation under test is the PINNED FILE, run here, not a re-implementation here.
const SHAPES = [
  {
    name: "no answer at all",
    subject: "feat(scope)!: a hard cutover",
    section: ["this section answers nothing"],
    refuse: true,
  },
  {
    name: "a bare `none`",
    subject: "feat(scope)!: a hard cutover",
    section: ["**Breaking change + rollback:** none"],
    refuse: true,
  },
  {
    name: "an EMPTY answer value",
    subject: "feat(scope)!: a hard cutover",
    section: ["**Breaking change + rollback:**"],
    refuse: true,
  },
  {
    name: "a reasoned `none`",
    subject: "feat(scope)!: a hard cutover",
    section: ["**Breaking change + rollback:** none — this change only carries another repo's cutover"],
    refuse: false,
  },
  {
    name: "a real answer",
    subject: "feat(scope)!: a hard cutover",
    section: ["**Breaking change + rollback:** the flag moves from `--podman-jobs` to `--stage-parallelism`"],
    refuse: false,
  },
  {
    name: "a head with no marker",
    subject: "feat(scope): an ordinary change",
    section: ["this section answers nothing"],
    refuse: false,
  },
];

const PROBE = `import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("charly_pr_body_lint", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
cases = json.load(sys.stdin)
out = []
for c in cases:
    findings = mod.bang_findings(c["section"], c["subject"])
    out.append({"name": c["name"], "count": len(findings), "first": findings[0] if findings else ""})
json.dump(out, sys.stdout)
`;

/** Run the pinned linter's rule over the shapes; returns the per-shape finding counts. */
function probeLinter(linterPath) {
  const scratch = mkdtempSync(join(tmpdir(), "charly-bang-probe-"));
  try {
    const probe = join(scratch, "probe.py");
    writeFileSync(probe, PROBE);
    const out = spawnSync("python3", ["-I", probe, linterPath], {
      input: JSON.stringify(SHAPES.map(({ name, subject, section }) => ({ name, subject, section }))),
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (out.status !== 0) {
      throw new Error(`the linter probe failed (rc=${out.status}): ${out.stderr.trim()}`);
    }
    return JSON.parse(out.stdout);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// --- the two arms ------------------------------------------------------------------

function ownershipArm(dir) {
  const hits = scanForRetired(dir);
  if (hits.length === 0) {
    ok(
      `the umbrella's tracked tree carries no copy of the marker rule (${RETIRED.length} retired identifier(s); ` +
        `scope: this tree's tracked files, gitlinks excluded, CHANGELOG/ excluded, this gate's own key set excluded)`,
    );
    return true;
  }
  for (const h of hits) fail(`${h.file}:${h.line} still carries a retired marker-rule identifier: ${h.text}`);
  fail(`${hits.length} retired marker-rule identifier(s) survive in the umbrella's own tracked tree`);
  return false;
}

function canonicalArm(linterPath, { quiet = false } = {}) {
  const problems = [];
  let results;
  try {
    results = probeLinter(linterPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(msg);
    if (!quiet) fail(msg);
    return { good: false, problems };
  }
  let good = true;
  for (const shape of SHAPES) {
    const got = results.find((r) => r.name === shape.name);
    if (!got) {
      const msg = `the pinned linter did not report on the shape "${shape.name}"`;
      problems.push(msg);
      if (!quiet) fail(msg);
      good = false;
      continue;
    }
    const refused = got.count > 0;
    if (refused === shape.refuse) {
      if (!quiet) ok(`the pinned linter ${refused ? "refuses" : "accepts"} ${shape.name}`);
    } else {
      const msg =
        `the pinned linter ${refused ? "refuses" : "accepts"} ${shape.name}, but this repo's prose says it ` +
        `${shape.refuse ? "must refuse" : "must accept"} it` +
        (got.first ? ` — the linter said: ${got.first.slice(0, 160)}` : "");
      problems.push(msg);
      if (!quiet) fail(msg);
      good = false;
    }
  }
  return { good, problems };
}

// --- the self-test: every arm must be able to go RED (R7) ---------------------------

function gitFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "charly-bang-fixture-"));
  spawnSync("git", ["-C", dir, "init", "-q"], { encoding: "utf8" });
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  spawnSync("git", ["-C", dir, "add", "-A"], { encoding: "utf8" });
  return dir;
}

function linterFixture(body) {
  const dir = mkdtempSync(join(tmpdir(), "charly-bang-linter-"));
  const path = join(dir, "pr_body_lint.py");
  writeFileSync(path, body);
  return { dir, path };
}

function selfTest() {
  const scratchDirs = [];
  /** A DELIBERATE red: the failures it causes are the point, so they are counted apart. */
  const deliberateRed = (fn) => {
    const before = failures;
    const { good, problems } = fn();
    const caused = failures > before || problems.length > 0;
    failures = before;
    return { good, caused };
  };
  try {
    // ARM 1 discriminates: a tree that carries a retired identifier is RED, and the same
    // tree without it is GREEN. A sweep that cannot see its own key is a vacuous sweep.
    const dirty = gitFixture({
      "scripts/check-pr-body-diff.mjs": `function ${RETIRED[0]}() { return 1; }\n`,
    });
    scratchDirs.push(dirty);
    const dirtyHits = scanForRetired(dirty);
    if (dirtyHits.length === 0) {
      fail("ARM 1 is VACUOUS: a tree carrying a retired identifier was scanned clean");
    } else {
      ok(`ARM 1 discriminates: a tree carrying "${dirtyHits[0].text.slice(0, 60)}" is RED`);
    }

    const clean = gitFixture({ "scripts/check-pr-body-diff.mjs": "export const arms = 44;\n" });
    scratchDirs.push(clean);
    if (scanForRetired(clean).length !== 0) {
      fail("ARM 1 cries wolf: a tree with no retired identifier was scanned dirty");
    } else {
      ok("ARM 1 is sound: a tree with no retired identifier stays GREEN");
    }

    // ARM 2 discriminates: a linter that refuses nothing, and a linter that refuses
    // everything, each turn the arm RED. Without both, the arm could not tell a pinned
    // linter that enforces the rule from one that enforces nothing.
    const silent = linterFixture("def bang_findings(section_lines, subject):\n    return []\n");
    scratchDirs.push(silent.dir);
    const silentRun = deliberateRed(() => canonicalArm(silent.path, { quiet: true }));
    if (silentRun.good || !silentRun.caused) {
      fail("ARM 2 is VACUOUS: a linter that refuses nothing was judged GREEN");
    } else {
      ok("ARM 2 discriminates: a linter that refuses nothing is RED");
    }

    const deaf = linterFixture(
      'def bang_findings(section_lines, subject):\n    return ["stub: refused"]\n',
    );
    scratchDirs.push(deaf.dir);
    const deafRun = deliberateRed(() => canonicalArm(deaf.path, { quiet: true }));
    if (deafRun.good || !deafRun.caused) {
      fail("ARM 2 is VACUOUS: a linter that refuses everything was judged GREEN");
    } else {
      ok("ARM 2 discriminates: a linter that refuses everything is RED");
    }

    console.log(
      `check-bang-arm-ownership --self-test: OK (${RETIRED.length} retired identifier(s), ${SHAPES.length} shape(s))`,
    );
  } finally {
    for (const d of scratchDirs) rmSync(d, { recursive: true, force: true });
  }
}

// --- the entry point ----------------------------------------------------------------

if (argv.includes("--self-test")) {
  selfTest();
} else {
  ownershipArm(root);

  const linter = argVal("--linter") ?? join(root, "marketplace", "scripts", "pr_body_lint.py");
  if (!existsSync(linter)) {
    skip(
      "marketplace/ is not checked out: the pinned linter's behaviour was NOT checked " +
        "(charly task init materializes it) — the ownership arm above still ran",
    );
  } else {
    canonicalArm(resolve(linter));
  }
}

process.exit(failures === 0 ? 0 : 1);
