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
//     A linter that implements NO marker rule at all is RED too — the rule is simply
//     unenforced there — and the arm says so in its own words, not in a traceback.
//
// The two arms are the two halves of ONE claim: "the canonical linter is the sole
// implementation of the rule, and it enforces what this repo says it enforces."
//
// And a third check ties the ARMS to this repo's own PROSE: the `charly.yml` step
// description that tells a reader what the self-test proves must name every
// discrimination case the self-test exercises. The description is prose and the self-test
// is a mechanism, and until now the two never compared themselves — a description that
// enumerated two cases while the self-test proved three was nobody's error and everybody's
// reading (opencharly/opencharly#811).
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

// --- the discrimination cases, ONCE -----------------------------------------------
//
// The cases this gate's self-test exercises, and the phrases this repo's own `charly.yml`
// step description must carry. The description is PROSE and the self-test is a MECHANISM,
// and until now the two never met: the description named only TWO of the THREE ARM 2
// cases the self-test proves, and nothing noticed — the description is read by a human,
// the self-test's output by a machine, and the two never compared themselves. So they
// compare themselves HERE: one list, one source, and the gate goes RED when the shipped
// description stops naming a case the self-test still exercises.
//
// The retired wording is NOT quoted here, and deliberately so: a quotation is a COPY of the
// retired phrasing, and R5 deletes copies in the same phase that names the new wording.
// This comment says HOW MANY cases the old description named; the CASE list below says
// what each case is. (Round 1 of opencharly/opencharly#812 quoted the old phrasing here,
// and the claim-keyed sweep could not see it — a retired phrasing that survives a line
// break is invisible to a line-based grep, so the sweep was proof of nothing.)
//
// `scenario` is the phrase the DESCRIPTION must carry; `proven` is the sentence the
// self-test prints when it has proven the case. They are deliberately separate — the
// description is a summary and need not repeat the gate's whole sentence — but the
// description must NAME the case, and the list says which case is which.
const CASES = [
  { id: "arm1-red", arm: "ARM 1", scenario: "a tree carrying a retired identifier", proven: "a tree carrying a retired identifier is RED" },
  { id: "arm1-green", arm: "ARM 1", scenario: "a tree with no retired identifier", proven: "a tree with no retired identifier stays GREEN" },
  { id: "arm2-refuses-nothing", arm: "ARM 2", scenario: "a linter that refuses nothing", proven: "a linter that refuses nothing is RED" },
  { id: "arm2-refuses-everything", arm: "ARM 2", scenario: "a linter that refuses everything", proven: "a linter that refuses everything is RED" },
  { id: "arm2-no-rule", arm: "ARM 2", scenario: "a linter that implements no marker rule at all", proven: "a linter that implements no marker rule at all is RED" },
];
/** The same list, keyed — the self-test names its case, so no case depends on its INDEX. */
const CASE = Object.fromEntries(CASES.map((c) => [c.id, c]));

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
# A linter that does not implement the marker rule AT ALL is a RED, not a crash: the
# rule is simply not enforced there, and the arm has to say so in its own words.
fn = getattr(mod, "bang_findings", None)
if fn is None:
    json.dump({"implemented": False, "results": []}, sys.stdout)
    raise SystemExit(0)
out = []
for c in cases:
    findings = fn(c["section"], c["subject"])
    out.append({"name": c["name"], "count": len(findings), "first": findings[0] if findings else ""})
json.dump({"implemented": True, "results": out}, sys.stdout)
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
  let probed;
  try {
    probed = probeLinter(linterPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(msg);
    if (!quiet) fail(msg);
    return { good: false, problems };
  }
  if (!probed.implemented) {
    // The linter this repo pins implements no marker rule at all. That is the rule being
    // UNENFORCED here, and it is RED in its own words — not a traceback, and not a skip.
    const msg =
      "the pinned linter does not implement the `!`-marker rule at all — it exposes no `bang_findings`, " +
      "so nothing enforces the marker relation in this tree";
    problems.push(msg);
    if (!quiet) fail(msg);
    return { good: false, problems };
  }
  const results = probed.results;
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

// --- the DESCRIPTION arm: the shipped step description names the cases it exercises ---

/**
 * The `check:` description of the step in `charly.yml` whose command runs THIS gate's
 * self-test — the prose that tells a reader what the self-test proves. `null` when the
 * manifest carries no such step.
 */
function selfTestDescription(dir) {
  const manifest = join(dir, "charly.yml");
  if (!existsSync(manifest)) return null;
  const lines = readFileSync(manifest, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const cmd = lines[i].trim();
    if (!cmd.startsWith("command:")) continue;
    if (!cmd.includes(`${SELF_REL} --self-test`)) continue;
    for (let k = i - 1; k >= 0; k--) {
      const m = lines[k].match(/^\s*-\s+check:\s*(.+)$/);
      if (m) return m[1].trim();
      if (/^\s*-\s+[A-Za-z0-9_.-]+:/.test(lines[k])) return null; // a different step owns it
    }
  }
  return null;
}

/** The cases the description fails to name. ONE implementation of the rule. */
function descriptionProblems(description) {
  return CASES.filter((c) => !description.includes(c.scenario)).map(
    (c) => `the step's description does not name the ${c.arm} discrimination case "${c.scenario}"`,
  );
}

function descriptionArm(dir) {
  const description = selfTestDescription(dir);
  if (description === null) {
    if (!existsSync(join(dir, "charly.yml"))) {
      skip("charly.yml is not present in this tree — the step description was NOT checked");
      return true;
    }
    fail(
      "charly.yml carries no step whose command runs this gate's self-test — the step description " +
        "was NOT checked, so this arm proves nothing here",
    );
    return false;
  }
  const problems = descriptionProblems(description);
  if (problems.length === 0) {
    ok(
      `the step's description names every discrimination case this gate's self-test exercises ` +
        `(${CASES.length} case(s))`,
    );
    return true;
  }
  for (const p of problems) fail(p);
  fail(`${problems.length} discrimination case(s) this gate's self-test exercises are missing from the step's description`);
  return false;
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
      fail(`ARM 1 is VACUOUS: ${CASE["arm1-red"].scenario} was scanned clean`);
    } else {
      ok(
        `ARM 1 discriminates: ${CASE["arm1-red"].proven} — the tree carried ` +
          `"${dirtyHits[0].text.slice(0, 60)}"`,
      );
    }

    const clean = gitFixture({ "scripts/check-pr-body-diff.mjs": "export const arms = 44;\n" });
    scratchDirs.push(clean);
    if (scanForRetired(clean).length !== 0) {
      fail(`ARM 1 cries wolf: ${CASE["arm1-green"].scenario} was scanned dirty`);
    } else {
      ok(`ARM 1 is sound: ${CASE["arm1-green"].proven}`);
    }

    // ARM 2 discriminates: a linter that refuses nothing, a linter that refuses
    // everything, and a linter that implements NO marker rule at all — the shape this
    // repo's own BASE pins — each turn the arm RED, and in its own words rather than in a
    // traceback. Without all three, the arm could not tell a pinned linter that enforces
    // the rule from one that enforces nothing, nor one that does not implement the rule
    // at all.
    const ARM2_FIXTURES = [
      {
        id: "arm2-refuses-nothing",
        body: "def bang_findings(section_lines, subject):\n    return []\n",
      },
      {
        id: "arm2-refuses-everything",
        body: 'def bang_findings(section_lines, subject):\n    return ["stub: refused"]\n',
      },
      {
        id: "arm2-no-rule",
        body: "def subject_carries_marker(subject):\n    return False\n",
      },
    ];
    for (const fixture of ARM2_FIXTURES) {
      const stub = linterFixture(fixture.body);
      scratchDirs.push(stub.dir);
      const run = deliberateRed(() => canonicalArm(stub.path, { quiet: true }));
      if (run.good || !run.caused) {
        fail(`ARM 2 is VACUOUS: ${CASE[fixture.id].scenario} was judged GREEN`);
      } else {
        ok(`ARM 2 discriminates: ${CASE[fixture.id].proven}`);
      }
    }

    // The DESCRIPTION arm discriminates: the SHIPPED description names every case the
    // self-test exercises, and a description with one case removed goes RED. A check that
    // cannot fail reads GREEN forever, so the mutation IS the proof.
    const shipped = selfTestDescription(join(here, ".."));
    if (shipped === null) {
      fail(
        "the description arm is VACUOUS: charly.yml carries no step whose command runs this gate's " +
          "self-test, so there is no shipped description to judge",
      );
    } else {
      const missing = descriptionProblems(shipped);
      if (missing.length !== 0) {
        for (const p of missing) fail(`the shipped step description is short: ${p}`);
        fail("the description arm is VACUOUS: the shipped description does not name every case");
      } else {
        ok(
          `the description arm is sound: the shipped step description names all ${CASES.length} case(s) ` +
            "the self-test exercises",
        );
      }
      const dropped = CASE["arm2-no-rule"];
      const mutated = shipped.replace(dropped.scenario, "a case the description does not carry");
      if (mutated === shipped) {
        fail(
          `the description arm is VACUOUS: the mutation changed nothing — the shipped description does ` +
            `not carry "${dropped.scenario}" for the mutation to remove`,
        );
      } else if (descriptionProblems(mutated).length === 0) {
        fail("the description arm is VACUOUS: a description missing a case was judged GREEN");
      } else {
        ok(`the description arm discriminates: a description that omits "${dropped.scenario}" is RED`);
      }
    }

    console.log(
      `check-bang-arm-ownership --self-test: OK (${RETIRED.length} retired identifier(s), ` +
        `${SHAPES.length} shape(s), ${CASES.length} discrimination case(s))`,
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
  descriptionArm(root);

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
