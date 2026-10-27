#!/usr/bin/env node
// check-pr-body-cap.mjs — the ONE cap on a PR body's size has ONE rule, and BOTH
// readers of it implement that rule.
//
// Why it exists (opencharly/opencharly#720). `scripts/lib/pr-body-cap` is the ONE
// cap, read by TWO readers: the reconciler `scripts/check-pr-body-diff.mjs` (the
// gate the pre-push hook runs on every body) and the builder
// `scripts/sync-pr-body.sh` (the sync PR's own guard). The cap file stated the
// rule in PROSE — "the readers take the first line that is neither blank nor a
// comment" — and only ONE of the two readers implemented it. The bash reader took
// the first content line; the JS reader stripped the comments and whitespace from
// the WHOLE file and concatenated what was left. On a cap file with two content
// lines the two therefore read DIFFERENT numbers from the SAME file:
//
//   65536\n65537   ->  the bash reader: 65536        the JS reader: 6553665537
//
// and the JS reader's size arm then reported `PASS` and named a cap a hundred
// thousand times the platform's, on a body GitHub would have refused. The rule is
// now stated once, in the cap file, and this gate proves the two readers AGREE.
//
// What it does NOT do: it never re-implements the rule. A third implementation
// would be a third thing that can disagree. The gate observes the readers — it
// runs them against the same file and compares what they read and what they
// refuse.
//
// The readers are fired with GITHUB_BODY_MAX REMOVED from their environment. The
// override is a knob on the READER, so an ambient value that reached them would
// decide what the gate judges: the JS reader checks the override BEFORE it reads
// the cap file, so it would report the caller's number instead of the file's, and
// the gate would be comparing the shell it happens to run in rather than the cap
// (opencharly/opencharly#721).
//
// Usage: node scripts/check-pr-body-cap.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

const CAP_REL = join("scripts", "lib", "pr-body-cap");
const JS_READER_REL = join("scripts", "check-pr-body-diff.mjs");
const BASH_READER_REL = join("scripts", "sync-pr-body.sh");
const SELF_REL = "scripts/check-pr-body-cap.mjs";

/**
 * The RETIRED rule's wording. The old cap file's header promised the readers a rule
 * they did not both implement, and the promise is what made the disagreement
 * invisible: a reader that diverged from the prose was diverging from the ONE
 * description of the cap, so nothing but this gate could see it.
 */
const RETIRED_PROMISE = "neither blank nor a comment";

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);

/**
 * A cap file's refusal, as each reader words it. The JS reader's refusals are
 * `FAIL` lines that name the SIZE CAP; the bash reader's are `::error::` lines that
 * name the PR BODY'S SIZE CAP. The GOOD outcomes are worded differently — the JS
 * reader says "the PR body is N bytes (within the N-byte GitHub cap)" — so these
 * patterns cannot match a successful read.
 */
const jsRefusesCap = (out) => /FAIL {2}the body's size cap/.test(out);
const bashRefusesCap = (out) => /::error::the PR body's size cap/.test(out);
const jsCapValue = (out) => /within the (\d+)-byte GitHub cap/.exec(out)?.[1];
const bashCapValue = (out) => /stays under the (\d+)-byte cap/.exec(out)?.[1];

/**
 * The scratch tree the readers are fired in. The readers are fired as COPIES,
 * because the cap file they read is the thing under test: a mutated cap must never
 * reach the tree. The tree's own `.gitmodules` travels with it because the
 * builder's self-test reads the live submodule count from it.
 */
function makeScratch() {
  const dir = mkdtempSync(join(tmpdir(), "check-pr-body-cap-"));
  cpSync(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
  cpSync(join(root, ".gitmodules"), join(dir, ".gitmodules"));
  // The scratch is a real repository, because the tree scan reads the TRACKED set
  // through git — the same set the umbrella's own tracked-file gates read, so a
  // submodule (a repo of its own, with its own rulebook) is out of scope by
  // construction rather than by a name list.
  spawnSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  spawnSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

/** A real repository with a real HEAD and a real base ref, so the reconciler can read a diff. */
function makeRepo(dir) {
  const repo = join(dir, "repo");
  mkdirSync(repo, { recursive: true });
  const git = (...a) => spawnSync("git", a, { cwd: repo, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "gate@gate");
  git("config", "user.name", "gate");
  writeFileSync(join(dir, "msg.txt"), "gate\n");
  writeFileSync(join(repo, "f.txt"), "x\n");
  git("add", "-A");
  git("commit", "-q", "-F", join(dir, "msg.txt"));
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  writeFileSync(join(repo, "f.txt"), "y\n");
  git("add", "-A");
  git("commit", "-q", "-F", join(dir, "msg.txt"));
  return repo;
}

/**
 * The environment a reader is fired with.
 *
 * `GITHUB_BODY_MAX` is REMOVED, and that is the whole point of it. The override is a
 * documented knob on the READER, so an ambient value in the caller's shell would
 * otherwise reach the readers: the JS reader checks the override BEFORE it reads the
 * cap file, so it would report the ambient number instead of the file's, the
 * same-number arm would compare the ambient against the file, and the refusal arms
 * would never see the mutated cap at all — the gate would be judging the shell it
 * happens to run in rather than the cap file. The gate's subject is the FILE, so the
 * file's number is the only number the readers are allowed to see
 * (opencharly/opencharly#721).
 */
function readerEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.GITHUB_BODY_MAX;
  return env;
}

/** The JS reader, fired as the pre-push hook fires it. */
function runJsReader(dir, repo, bodyFile) {
  const r = spawnSync(
    process.execPath,
    [join(dir, JS_READER_REL), "--body", bodyFile, "--repo", repo, "--base", "origin/main"],
    { encoding: "utf8", env: readerEnv() },
  );
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** The bash reader, fired as the builder fires it: the cap is read before anything else. */
function runBashReader(dir) {
  const r = spawnSync("bash", [join(dir, BASH_READER_REL)], {
    cwd: dir,
    encoding: "utf8",
    env: readerEnv(),
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** The bash reader's self-test — the run that reports the cap it read. */
function runBashSelfTest(dir) {
  const r = spawnSync("bash", [join(dir, BASH_READER_REL), "--self-test"], {
    cwd: dir,
    encoding: "utf8",
    env: readerEnv(),
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** Write a cap file into the scratch tree's copy. */
function setCap(dir, content) {
  writeFileSync(join(dir, CAP_REL), content, "utf8");
}

/**
 * A1 — the shipped cap file: BOTH readers read it, and they read the SAME number.
 * The positive control every refusal below depends on: a gate that refused
 * everything would pass every other arm.
 */
function armSameNumber(dir, repo, bodyFile) {
  const js = runJsReader(dir, repo, bodyFile);
  const bash = runBashSelfTest(dir);
  const jsCap = jsCapValue(js.out);
  const bashCap = bashCapValue(bash.out);
  if (!jsCap) {
    fail(`the JS reader must read the shipped cap — it reported no cap (exit ${js.code})`);
  } else if (!bashCap) {
    fail(`the bash reader must read the shipped cap — its self-test reported no cap (exit ${bash.code})`);
  } else if (jsCap !== bashCap) {
    fail(`the two readers must read the SAME number from the shipped cap — the JS reader read ${jsCap} and the bash reader read ${bashCap}`);
  } else {
    ok(`the two readers read the SAME number from the shipped cap (${jsCap} bytes)`);
  }
  if (jsRefusesCap(js.out)) fail("the JS reader must NOT refuse the shipped cap");
  if (bashRefusesCap(bash.out)) fail("the bash reader must NOT refuse the shipped cap");
}

/**
 * A2..A4 — a cap file the rule calls UNREADABLE must be refused by BOTH readers,
 * each naming the cap. A reader that accepted one of these would read a number the
 * other does not, which is the defect this gate closes.
 */
function armRefusedByBoth(dir, repo, bodyFile, label, content) {
  setCap(dir, content);
  const js = runJsReader(dir, repo, bodyFile);
  const bash = runBashReader(dir);
  if (!jsRefusesCap(js.out)) {
    fail(`${label}: the JS reader must REFUSE it — it read no cap and named none`);
  } else if (!bashRefusesCap(bash.out)) {
    fail(`${label}: the bash reader must REFUSE it — it read no cap and named none`);
  } else {
    ok(`${label}: BOTH readers refuse it, and each names the cap`);
  }
}

/**
 * A5 — the reconciler's self-test must be GREEN under an ambient GITHUB_BODY_MAX.
 * The override is a documented knob, and the ambient value must not decide the
 * size of the fixture the self-test builds: the builder's own self-test pins the
 * cap for exactly that reason, and the two self-tests must agree on it (R2).
 */
function armAmbientOverride() {
  const r = spawnSync(process.execPath, [join(root, JS_READER_REL), "--self-test"], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_BODY_MAX: "100" },
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) {
    fail(
      `the reconciler's self-test must be GREEN under an ambient GITHUB_BODY_MAX — it exited ${r.status}: ` +
        `${out.trim().split("\n").slice(0, 3).join(" | ")}`,
    );
  } else {
    ok("the reconciler's self-test is GREEN under an ambient GITHUB_BODY_MAX (the ambient does not size the fixture)");
  }
}

/**
 * A6 — the cap file's header must STATE the rule the readers implement. A rule
 * stated in prose and implemented in code is two things, and they drift; the header
 * is the one place the rule lives, so it must name it.
 */
function armHeaderStatesTheRule() {
  const header = readFileSync(join(root, CAP_REL), "utf8");
  if (!/exactly one/i.test(header)) {
    fail("the cap file's header must state the ONE-content-line rule — it does not name it");
  } else {
    ok("the cap file's header states the ONE-content-line rule");
  }
}

/**
 * The umbrella's own TRACKED text files, as the umbrella's other tracked-file gates
 * read them: gitlinks (mode 160000) are another repo's content and are skipped, and
 * so are symlinks (mode 120000) — every one of them points into `marketplace/`.
 * `CHANGELOG/` is the record of what happened, not a current claim, and this gate
 * excludes ITSELF, because it must NAME the wording it forbids.
 */
function trackedTextFiles(tree) {
  const r = spawnSync("git", ["ls-files", "-s", "-z"], {
    cwd: tree,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    fail(`the tracked set cannot be read from ${tree} — git ls-files exited ${r.status}`);
    return [];
  }
  const out = [];
  for (const entry of (r.stdout ?? "").split("\0")) {
    if (entry === "") continue;
    const tab = entry.indexOf("\t");
    if (tab === -1) continue;
    const mode = entry.slice(0, tab).split(" ")[0];
    if (mode === "160000" || mode === "120000") continue;
    const rel = entry.slice(tab + 1);
    if (rel === SELF_REL) continue;
    if (rel.startsWith("CHANGELOG/")) continue;
    out.push(rel);
  }
  return out;
}

/**
 * A7 — the RETIRED rule's wording must be GONE from the umbrella's own tracked tree
 * (R5), with the two exceptions the scan itself makes, and states in its verdict: THIS
 * GATE, which must name the wording it forbids, and `CHANGELOG/`, which is the record
 * of what happened rather than a current claim. The old header promised the readers a
 * rule they did not both implement, and a promise is what made the disagreement
 * invisible: a reader that diverged from the prose was diverging from the ONE
 * description of the cap, so nothing but this gate could see it. The scan is
 * repo-wide, so a copy of the promise in a reader, a doc or a message is found too.
 */
function armRetiredWordingGone() {
  const rels = trackedTextFiles(root);
  const hits = [];
  for (const rel of rels) {
    let text;
    try {
      text = readFileSync(join(root, rel), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(RETIRED_PROMISE)) hits.push(`${rel}:${i + 1}`);
    }
  }
  if (hits.length) {
    fail(
      `the RETIRED rule's wording must be GONE from every tracked file except this gate, which names it in ` +
        `order to forbid it, and except CHANGELOG/, which is the record of what happened — it survives at ` +
        `${hits.join(", ")}`,
    );
  } else {
    ok(
      `the RETIRED rule's wording is gone from every tracked file EXCEPT this gate — which names it in order ` +
        `to forbid it — and except CHANGELOG/, which is the record of what happened ` +
        `(${rels.length} tracked file(s) scanned)`,
    );
  }
}

// ── the gate ───────────────────────────────────────────────────────────────────────
function runGate() {
  const dir = makeScratch();
  try {
    const repo = makeRepo(dir);
    const bodyFile = join(dir, "body.md");
    writeFileSync(bodyFile, "## Summary\nThe cap gate's fixture body.\n", "utf8");

    armSameNumber(dir, repo, bodyFile);

    // The shipped cap is restored before the refusals, so each arm mutates the copy
    // from a known state rather than from the previous arm's mutation.
    setCap(dir, readFileSync(join(root, CAP_REL), "utf8"));

    armRefusedByBoth(dir, repo, bodyFile, "a cap file with TWO content lines", "65536\n65537\n");
    armRefusedByBoth(
      dir,
      repo,
      bodyFile,
      "a cap file whose content line carries a trailing note",
      "65536 # the platform's cap\n",
    );
    armRefusedByBoth(dir, repo, bodyFile, "a cap file with NO content line", "# only a comment\n");

    armAmbientOverride();
    armHeaderStatesTheRule();
    armRetiredWordingGone();
  } catch (err) {
    fail(`the gate itself failed (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return failures;
}

// ── --self-test: prove each arm is live, by mutating a reader ─────────────────────
// The arms above are fired against the REAL readers, so a reader that stopped
// implementing the rule would take an arm with it. Each mutation puts a reader — or
// this gate's own source — back on a rule it must not have, and the gate must then
// go RED on that arm — otherwise the arm was never watching anything.
//
// Every arm is covered by a mutation, and the self-test SAYS so: it names the arms,
// counts the arms, and fails when one has no mutation. Counting the MUTATIONS and
// calling the count "arms" is how "4/4 arms live" came to describe four mutations of
// seven arms (opencharly/opencharly#721).
if (argv.includes("--self-test")) {
  const selfDir = mkdtempSync(join(tmpdir(), "check-pr-body-cap-self-"));
  let stFails = 0;
  let stLive = 0;
  const covered = new Set();

  const RETIRED_JS_READER =
    'function capContentLines(text) {\n' +
    '  return [text.replace(/#.*$/gm, "").replace(/\\s+/g, "")];\n' +
    '}';

  /**
   * The arms the gate fires, in the order it fires them. Every one of them must be
   * covered by a mutation below: an arm with no mutation is an arm that watches
   * nothing, and this list is what the self-test checks that against.
   */
  const ARMS = [
    ["A1", "the two readers read the SAME number from the shipped cap"],
    ["A2", "a cap file with TWO content lines is refused by BOTH readers"],
    ["A3", "a cap file whose content line carries a trailing note is refused by BOTH readers"],
    ["A4", "a cap file with NO content line is refused by BOTH readers"],
    ["A5", "the reconciler's self-test is GREEN under an ambient GITHUB_BODY_MAX"],
    ["A6", "the cap file's header states the ONE-content-line rule"],
    ["A7", "the RETIRED rule's wording is gone from the tracked tree"],
  ];

  /** Replace one exact substring, or report that the source it targets moved. */
  const swap = (src, from, to) => (src.includes(from) ? src.replace(from, to) : null);

  const mutations = [
    {
      name: "the JS reader concatenates the cap file's content lines (the retired rule)",
      file: "js",
      apply: (src) =>
        src.replace(/function capContentLines\(text\) \{[\s\S]*?\n\}/, RETIRED_JS_READER),
      expect: "a cap file with TWO content lines: the JS reader must REFUSE it",
      arms: ["A2", "A3"],
    },
    {
      name: "the bash reader takes the FIRST content line (the retired rule)",
      file: "bash",
      apply: (src) => src.replace("{ print }", "{ print; exit }"),
      expect: "a cap file with TWO content lines: the bash reader must REFUSE it",
      arms: ["A2"],
    },
    {
      name: "the bash reader takes the number BEFORE the note",
      file: "bash",
      apply: (src) =>
        swap(
          src,
          'PR_BODY_CAP_BYTES="$PR_BODY_CAP_LINES"',
          'PR_BODY_CAP_BYTES="${PR_BODY_CAP_LINES%% *}"',
        ),
      expect: "a cap file whose content line carries a trailing note: the bash reader must REFUSE it",
      arms: ["A3"],
    },
    {
      name: "the bash reader reads a DIFFERENT number from the shipped cap",
      file: "bash",
      apply: (src) =>
        swap(
          src,
          'PR_BODY_CAP_BYTES="$PR_BODY_CAP_LINES"',
          'PR_BODY_CAP_BYTES="$((PR_BODY_CAP_LINES + 1))"',
        ),
      expect: "the two readers must read the SAME number from the shipped cap",
      arms: ["A1"],
    },
    {
      name: "the bash reader falls back to a DEFAULT when the cap file holds no content line",
      file: "bash",
      apply: (src) => {
        const counted = swap(
          src,
          'if [ "$PR_BODY_CAP_COUNT" -ne 1 ]; then',
          'if [ "$PR_BODY_CAP_COUNT" -gt 1 ]; then',
        );
        if (counted === null) return null;
        return swap(
          counted,
          'PR_BODY_CAP_BYTES="$PR_BODY_CAP_LINES"',
          'PR_BODY_CAP_BYTES="${PR_BODY_CAP_LINES:-65536}"',
        );
      },
      expect: "a cap file with NO content line: the bash reader must REFUSE it",
      arms: ["A4"],
    },
    {
      name: "the reconciler's self-test follows the ambient override again",
      file: "js",
      apply: (src) =>
        swap(
          src,
          "const capBytes = readCapBytes({ fromFile: true });",
          "const capBytes = readCapBytes();",
        ),
      expect: "must be GREEN under an ambient GITHUB_BODY_MAX",
      arms: ["A5"],
    },
    {
      name: "the cap file's header stops stating the ONE-content-line rule",
      file: "cap",
      apply: (src) => swap(src, "EXACTLY ONE", "ONE"),
      expect: "the cap file's header must state the ONE-content-line rule",
      arms: ["A6"],
    },
    {
      name: "the cap file's header promises the retired rule again",
      file: "cap",
      apply: (src) =>
        src.replace(
          /^# pr-body-cap/,
          `# pr-body-cap — the readers take the first line that is ${RETIRED_PROMISE}`,
        ),
      expect: "must be GONE from every tracked file except",
      arms: ["A7"],
    },
  ];

  try {
    cpSync(join(root, "scripts"), join(selfDir, "scripts"), { recursive: true });
    cpSync(join(root, ".gitmodules"), join(selfDir, ".gitmodules"));
    // A real repository, so the tracked-file scan reads the same set the umbrella's
    // own tracked-file gates read.
    spawnSync("git", ["init", "-q", "-b", "main"], { cwd: selfDir });
    spawnSync("git", ["add", "-A"], { cwd: selfDir });
    const jsPath = join(selfDir, JS_READER_REL);
    const bashPath = join(selfDir, BASH_READER_REL);
    const capPath = join(selfDir, CAP_REL);
    // The gate's OWN copy. The self-test runs the copy, not the file this script
    // was started from, so the gate's own source can be mutated — the hermeticity
    // case below turns the readers' environment on, and the gate's environment is
    // part of what the gate must prove.
    const gatePath = join(selfDir, SELF_REL);
    const originalJs = readFileSync(jsPath, "utf8");
    const originalBash = readFileSync(bashPath, "utf8");
    const originalCap = readFileSync(capPath, "utf8");
    const originalGate = readFileSync(gatePath, "utf8");

    const pathOf = (kind) =>
      kind === "js" ? jsPath : kind === "bash" ? bashPath : kind === "cap" ? capPath : gatePath;
    const originalOf = (kind) =>
      kind === "js"
        ? originalJs
        : kind === "bash"
          ? originalBash
          : kind === "cap"
            ? originalCap
            : originalGate;

    for (const m of mutations) {
      writeFileSync(jsPath, originalJs, "utf8");
      writeFileSync(bashPath, originalBash, "utf8");
      writeFileSync(capPath, originalCap, "utf8");
      writeFileSync(gatePath, originalGate, "utf8");
      const path = pathOf(m.file);
      const original = originalOf(m.file);
      const mutated = m.apply(original);
      if (mutated === null || mutated === original) {
        stFails += 1;
        console.error(`  FAIL  mutation '${m.name}' did not apply (the source it targets moved)`);
        continue;
      }
      writeFileSync(path, mutated, "utf8");
      stLive += 1;
      const r = spawnSync(process.execPath, [gatePath, "--root", selfDir], {
        encoding: "utf8",
      });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0) {
        stFails += 1;
        console.error(`  FAIL  mutation '${m.name}' did NOT go red (expected a '${m.expect}' finding)`);
      } else if (!out.includes(m.expect)) {
        stFails += 1;
        console.error(`  FAIL  mutation '${m.name}' went red, but not on the arm it targets (expected '${m.expect}')`);
      } else {
        for (const arm of m.arms) covered.add(arm);
        console.log(`  PASS  mutation '${m.name}' is caught (gate red on ${m.arms.join(", ")})`);
      }
    }

    // The whole gate under an ambient GITHUB_BODY_MAX: the readers are fired with
    // the ambient REMOVED, so the gate's verdict is the same whatever the caller's
    // shell carries. The case is proven live by removing that removal.
    writeFileSync(jsPath, originalJs, "utf8");
    writeFileSync(bashPath, originalBash, "utf8");
    writeFileSync(capPath, originalCap, "utf8");
    writeFileSync(gatePath, originalGate, "utf8");
    const ambient = spawnSync(process.execPath, [gatePath, "--root", selfDir], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_BODY_MAX: "100" },
    });
    stLive += 1;
    if (ambient.status !== 0) {
      stFails += 1;
      console.error(
        `  FAIL  the whole gate is NOT green under an ambient GITHUB_BODY_MAX:\n${ambient.stdout ?? ""}${ambient.stderr ?? ""}`,
      );
    } else {
      console.log(
        "  PASS  the whole gate is GREEN under an ambient GITHUB_BODY_MAX (the ambient reaches no reader)",
      );
    }
    const inheriting = swap(originalGate, "  delete env.GITHUB_BODY_MAX;\n", "");
    if (inheriting === null) {
      stFails += 1;
      console.error("  FAIL  the hermeticity mutation did not apply (the source it targets moved)");
    } else {
      writeFileSync(gatePath, inheriting, "utf8");
      stLive += 1;
      const r = spawnSync(process.execPath, [gatePath, "--root", selfDir], {
        encoding: "utf8",
        env: { ...process.env, GITHUB_BODY_MAX: "100" },
      });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      if (r.status === 0 || !out.includes("must read the SAME number from the shipped cap")) {
        stFails += 1;
        console.error(
          `  FAIL  a gate whose readers INHERIT the ambient did NOT go red on the same-number arm:\n${out}`,
        );
      } else {
        console.log(
          "  PASS  a gate whose readers inherit the ambient goes RED on the same-number arm (the case is live)",
        );
      }
      writeFileSync(gatePath, originalGate, "utf8");
    }

    // Every arm must be covered by a mutation: an arm with no mutation is an arm
    // that watches nothing, and the count this self-test prints is the count of
    // ARMS, not the count of mutations.
    for (const [id, what] of ARMS) {
      if (!covered.has(id)) {
        stFails += 1;
        console.error(`  FAIL  arm ${id} (${what}) has NO mutation — it is not proven live`);
      }
    }

    // The unmutated copy must be GREEN: a gate that is red on everything catches
    // nothing.
    writeFileSync(jsPath, originalJs, "utf8");
    writeFileSync(bashPath, originalBash, "utf8");
    writeFileSync(capPath, originalCap, "utf8");
    writeFileSync(gatePath, originalGate, "utf8");
    const green = spawnSync(process.execPath, [gatePath, "--root", selfDir], {
      encoding: "utf8",
    });
    if (green.status !== 0) {
      stFails += 1;
      console.error("  FAIL  the unmutated copy is not GREEN");
    } else {
      console.log("  PASS  the unmutated copy is GREEN");
    }
  } catch (err) {
    stFails += 1;
    console.error(`  FAIL  the self-test itself failed (${err instanceof Error ? err.message : String(err)})`);
  } finally {
    rmSync(selfDir, { recursive: true, force: true });
  }
  if (stFails) {
    console.error(`check-pr-body-cap --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log(
    `check-pr-body-cap --self-test: OK (${covered.size}/${ARMS.length} arms live, 1/1 hermeticity case live)`,
  );
  process.exit(0);
}

if (runGate()) {
  console.error(`check-pr-body-cap: ${failures} finding(s)`);
  process.exit(1);
}
console.log("check-pr-body-cap: OK");
