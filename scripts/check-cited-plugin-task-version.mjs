#!/usr/bin/env node
// check-cited-plugin-task-version.mjs — every plugin-task version the umbrella's OWN
// prose cites must be the version the umbrella's PINNED charly actually compiles.
//
// THE DEFECT THIS CLOSES (measured 2026-10-25, on this repo's own tree):
//   scripts/sync-pr-body.sh said "the module the binary is built from — the one
//   charly's own go.mod pins" and named a plugin-task version FIVE RELEASES
//   behind that pin; charly.yml named one TWENTY-NINE DAYS behind it. The
//   umbrella's pinned charly (gitlink f1f85d19) requires a THIRD version, and
//   NOTHING in this repo said so, because a version transcribed into prose is a
//   copy of a fact whose owner (the charly pin) moves on every release. The exact
//   stale literals, the measured commands and the full RCA are at
//   opencharly/opencharly#689.
//
//   THIS FILE HOLDS NO VERSION LITERAL OF ITS OWN, and that is the design, not an
//   accident: a control that quoted the versions it checks would hold a COPY of
//   the fact it derives, and the copy would rot exactly like the prose it
//   polices. Every version the gate needs is DERIVED from the pin at run time —
//   including the ones its own mutations use — so the scan finds no citation
//   here to judge, and no self-exemption is needed to make that true.
//
// WHY THE VERSION IS THE SENTINEL. A citation beside a version is a claim about a
// module's SOURCE ("verbs.go:736", "cli.go:261"), and those line numbers are only
// meaningful against a version. So the version is the thing that must be re-derived:
// when the pinned charly advances, the version changes, the gate goes RED, and the
// citations beside it are re-read. A gate that only checked the version would still
// catch the rot; a gate that checked the line numbers would need the module source
// present, which a light tree does not guarantee.
//
// WHAT IS ASSERTED, and how each is proven able to FAIL (--self-test mutates a COPY
// of the shipped inputs and must see the gate go red for each one):
//   V. Every plugin-task version literal the umbrella's own tracked prose cites equals
//      the version the PINNED charly's own go.mod requires. The version is DERIVED
//      from the pinned commit (the gitlink the index records), never transcribed here.
//   C. COVERAGE: the scan is derived from the tracked file set — never a hand-kept
//      list, because a list of files is itself a claim about a collection that grows —
//      and it skips the gitlinks (another repo's content) and `CHANGELOG/` (history is
//      immutable, and a changelog entry may name any old version). A citation is a
//      version literal on a line that NAMES plugin-task; a line naming a different
//      module is not a citation of this one, so the plugin-candy example in the
//      git-workflow skill is NOT flagged.
//   P. The pinned charly's go.mod is the OWNER of the version. If the checkout is not
//      here, the version cannot be derived and the gate SKIPS VISIBLY (R8: live or
//      skip, never fake) — it never judges against a version it made up.
//   T. WHICH TREE IS JUDGED: a commit ships the INDEX, not the worktree, so the gate
//      judges the INDEX's copy of every file where the worktree and the index
//      disagree, and the worktree's copy where they are identical (where the
//      worktree IS the index). This is not a nicety, and it was not a design choice:
//      MEASURED on 2026-10-25, this very gate was COMMITTED with the stale literals
//      its own docstring quoted, because the file was edited after it was staged and
//      the gate read the worktree — a gate that reads the wrong copy passes the very
//      tree it exists to judge. Proven on a FIXTURE repo with a real index, because
//      the failure is invisible to a self-test that only mutates copies in memory.
//
// Usage: node scripts/check-cited-plugin-task-version.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const selfTest = argv.includes("--self-test");

/** A file larger than this is not prose, and is not read. */
const MAX_BYTES = 1_000_000;

/** The module-version literal shape the org's CalVer module tags use. */
const RE_VERSION = /v0\.\d{7}\.\d{4}/g;

/** The requirement line in a Go module's go.mod, as the org writes it. */
const RE_REQUIREMENT = /github\.com\/opencharly\/plugin-task\/candy\/plugin-task\s+(v0\.\d+\.\d+)/;

/** A citation is a version literal on a line that NAMES plugin-task. */
function citationsIn(text) {
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("plugin-task")) continue;
    for (const m of line.matchAll(RE_VERSION)) {
      out.push({ line: i + 1, version: m[0] });
    }
  }
  return out;
}

/** The tracked REGULAR files of this repo — derived from the index, never hand-kept.
 *  A gitlink is another repo's content, and is skipped. */
function trackedFiles(rootDir) {
  const raw = execFileSync("git", ["ls-files", "-s", "-z"], { cwd: rootDir, encoding: "utf8" });
  const out = [];
  for (const rec of raw.split("\0")) {
    if (!rec) continue;
    const tab = rec.indexOf("\t");
    if (tab === -1) continue;
    const mode = rec.slice(0, tab).split(" ")[0];
    if (mode === "160000") continue;
    out.push(rec.slice(tab + 1));
  }
  return out;
}

/** The files whose WORKING-TREE copy differs from the INDEX copy. For these the
 *  index is the tree a commit ships, so the index is the tree that is judged. */
function differingFiles(rootDir) {
  let raw;
  try {
    raw = execFileSync("git", ["diff", "--name-only", "-z"], { cwd: rootDir, encoding: "utf8" });
  } catch {
    return new Set();
  }
  return new Set(raw.split("\0").filter(Boolean));
}

/** The index's entry for a path: the blob sha a commit would ship. */
function indexEntry(rootDir, rel) {
  let ls;
  try {
    ls = execFileSync("git", ["ls-files", "-s", "--", rel], { cwd: rootDir, encoding: "utf8" }).trim();
  } catch {
    return { error: "unreadable" };
  }
  const sha = (ls.split(/\s+/)[1]) || "";
  if (!/^[0-9a-f]{40}$/.test(sha)) return { error: "absent" };
  return { sha };
}

/** A file's content AS THE INDEX HAS IT — the tree a commit ships. */
function indexContent(rootDir, rel) {
  const entry = indexEntry(rootDir, rel);
  if (entry.error) return null;
  let buf;
  try {
    buf = execFileSync("git", ["cat-file", "blob", entry.sha], {
      cwd: rootDir,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
  if (buf.length > MAX_BYTES) return null;
  if (buf.includes(0)) return null; // binary
  return buf.toString("utf8");
}

/** The content this gate judges for a path: the INDEX's copy where the worktree and
 *  the index disagree (a commit ships the index), and the worktree's copy where they
 *  are identical — where the worktree IS the index, so the two readings agree. */
function contentOf(rootDir, rel, differing) {
  if (differing.has(rel)) return indexContent(rootDir, rel);
  const abs = join(rootDir, rel);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size > MAX_BYTES) return null;
  let buf;
  try {
    buf = readFileSync(abs);
  } catch {
    return null;
  }
  if (buf.includes(0)) return null; // binary
  return buf.toString("utf8");
}

/** Every plugin-task version the umbrella's own prose cites. `overrides` replaces a
 *  file's text (the self-test mutates a COPY of the shipped inputs this way). */
function scanCitations(rootDir, overrides = new Map()) {
  const out = [];
  const differing = differingFiles(rootDir);
  for (const rel of trackedFiles(rootDir)) {
    if (rel.startsWith("CHANGELOG/")) continue; // history is immutable
    let text = overrides.get(rel);
    if (text === undefined) {
      text = contentOf(rootDir, rel, differing);
      if (text === null) continue;
    }
    for (const c of citationsIn(text)) out.push({ file: rel, ...c });
  }
  return out;
}

/** The charly submodule's path, read from the manifest's own `import:` block.
 *  LINE-BASED, because the block's end is a top-level key and a regex over the whole
 *  file cannot tell a key from a word: the block ends at the first line that starts
 *  with a word character (a column-0 comment is not a key and does not end it). */
function charlyPath(rootDir) {
  const text = contentOf(rootDir, "charly.yml", differingFiles(rootDir));
  if (text === null) return null;
  const lines = text.split("\n");
  let inImport = false;
  for (const line of lines) {
    if (/^import:\s*$/.test(line)) {
      inImport = true;
      continue;
    }
    if (!inImport) continue;
    if (/^[A-Za-z0-9_.-]/.test(line)) break; // the next top-level key: the block ended
    const entry = line.match(/^\s*-\s*charly:\s*(\S+)\s*$/);
    if (entry) return entry[1].replace(/^\.\//, "");
  }
  return null;
}

/** The version the PINNED charly compiles, read from the pinned commit's own go.mod.
 *  `gomodOverride` replaces the module's text (the self-test's mutation). */
function readPinned(rootDir, gomodOverride = null) {
  const path = charlyPath(rootDir);
  if (!path) return { notice: "the manifest's import: block names no `charly` path" };
  const entry = indexEntry(rootDir, path);
  if (entry.error === "unreadable") {
    return { notice: `the index could not be read for ${path}` };
  }
  if (entry.error === "absent") {
    return { notice: `the index records no gitlink for ${path}` };
  }
  const sha = entry.sha;
  // NOTE: the gitlink is the INDEX's entry, so the version below is read from the
  // commit the index names — the pin a commit ships, not the pin on disk.
  const repo = join(rootDir, path);
  let tree;
  try {
    tree = execFileSync("git", ["-C", repo, "ls-tree", "-r", "--name-only", sha], { encoding: "utf8" });
  } catch {
    return { notice: `the pinned charly (${sha.slice(0, 7)}) has no checkout here, so its go.mod cannot be read` };
  }
  const mods = tree.split("\n").filter((l) => l.endsWith("go.mod"));
  for (const mod of mods) {
    let text = gomodOverride;
    if (text === null) {
      try {
        text = execFileSync("git", ["-C", repo, "show", `${sha}:${mod}`], { encoding: "utf8" });
      } catch {
        continue;
      }
    }
    const req = text.match(RE_REQUIREMENT);
    if (req) return { version: req[1], sha, path, mod };
  }
  return { notice: `the pinned charly (${sha.slice(0, 7)}) requires no plugin-task version` };
}

/** The contract, in one place, so the gate and --self-test assert the SAME thing. */
function findings(cites, pinned) {
  const out = [];
  if (!pinned.version) {
    out.push({ kind: "P", file: "charly.yml", line: 0, msg: pinned.notice });
    return out;
  }
  for (const c of cites) {
    if (c.version === pinned.version) continue;
    out.push({
      kind: "V",
      file: c.file,
      line: c.line,
      msg:
        `cites plugin-task ${c.version}, but the PINNED charly (${pinned.sha.slice(0, 7)}) ` +
        `compiles ${pinned.version} (${pinned.path}/${pinned.mod}). A citation beside a version ` +
        `is a claim about that module's SOURCE, and it is only meaningful against the ` +
        `version the pin names — re-read the cited lines at ${pinned.version} and re-key`,
    });
  }
  return out;
}

function report(fs) {
  for (const f of fs) {
    const where = f.line ? `${f.file}:${f.line}` : f.file;
    console.error(`  FAIL  ${where}: ${f.msg}`);
  }
  return fs.length;
}

const okLine = (n, version) =>
  `check-cited-plugin-task-version: OK — ${n} plugin-task version citation(s) in this repo's own prose, all naming the version the pinned charly compiles (${version}) — judged on the INDEX, the tree a commit ships`;

/** A version that is DEFINITELY not the pinned one, DERIVED from the pinned one.
 *  The control holds no version literal (see the header): every version it needs
 *  is computed from the pin, so the file cannot rot a copy of the fact it checks. */
function otherVersion(pinnedVersion, salt) {
  const m = pinnedVersion.match(/^(v0\.\d{7}\.)(\d{4})$/);
  if (!m) return null;
  const bumped = String((Number(m[2]) + salt) % 10000).padStart(4, "0");
  if (bumped === m[2]) return null; // the bump wrapped onto itself: refuse it
  return m[1] + bumped;
}

/** A FIXTURE repo with a REAL index: one file is committed carrying a stale citation,
 *  and then the WORKING TREE copy is fixed — so the index and the worktree disagree
 *  and the tree a commit ships still carries the stale citation. Returns what the
 *  scan finds there, so the self-test can prove the INDEX is the tree judged. */
function indexFixtureCitations(staleVersion, goodVersion) {
  const dir = mkdtempSync(join(tmpdir(), "cited-version-fixture-"));
  try {
    const git = (...a) =>
      execFileSync("git", ["-C", dir, ...a], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    execFileSync("git", ["init", "-q", dir], { stdio: ["ignore", "pipe", "ignore"] });
    const rel = "prose.md";
    writeFileSync(join(dir, rel), `# a citation of plugin-task\nplugin-task ${staleVersion}\n`);
    git("add", rel);
    git(
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "user.name=Fixture",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "-m",
      "the staged citation",
    );
    // The worktree is fixed; the INDEX still carries the stale citation.
    writeFileSync(join(dir, rel), `# a citation of plugin-task\nplugin-task ${goodVersion}\n`);
    return scanCitations(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── --self-test: prove each assertion goes RED on a mutation of the shipped inputs ───
if (selfTest) {
  const shipped = scanCitations(root);
  const pinned = readPinned(root);
  let stFails = 0;

  if (!pinned.version) {
    console.error(`  FAIL  the pinned charly's version could not be derived: ${pinned.notice}`);
    process.exit(1);
  }

  const baseline = findings(shipped, pinned);
  if (baseline.length) {
    report(baseline);
    console.error("check-cited-plugin-task-version --self-test: FAIL (the UNMUTATED tree is not green — fix the citations first)");
    process.exit(1);
  }
  console.log(`  PASS  the unmutated tree is GREEN — ${shipped.length} citation(s), all naming ${pinned.version}`);

  // C. The predicate is CALIBRATED: it must match a known positive. An empty result
  //    from an uncalibrated predicate is not evidence.
  if (shipped.length === 0) {
    stFails += 1;
    console.error("  FAIL  the scan found NO citation in the shipped tree — the predicate is not calibrated");
  } else {
    console.log(`  PASS  the predicate is calibrated — it matches ${shipped.length} known positive(s)`);
  }

  // V, mutation 1: THE DEFECT THIS GATE EXISTS FOR — a citation naming a version the
  //    pinned charly does not compile. The mutation is of the SHIPPED text, and the
  //    stale version it writes is DERIVED from the pinned one.
  const stale = otherVersion(pinned.version, 1);
  if (!stale) {
    stFails += 1;
    console.error("  FAIL  the stale version could not be derived from the pinned one");
  }
  const target = shipped[0];
  if (!target) {
    stFails += 1;
    console.error("  FAIL  there is no shipped citation to mutate");
  } else if (stale) {
    // The mutation is of the SHIPPED text — the copy a commit would ship, which is
    // the index's copy wherever the worktree and the index disagree.
    const original = contentOf(root, target.file, differingFiles(root));
    if (original === null) {
      stFails += 1;
      console.error(`  FAIL  the shipped text of ${target.file} could not be read`);
    } else if (original.replace(target.version, stale) === original) {
      stFails += 1;
      console.error(`  FAIL  the citation mutation did not apply — ${target.file} no longer carries ${target.version}`);
    } else {
      const mutated = original.replace(target.version, stale);
      const found = findings(scanCitations(root, new Map([[target.file, mutated]])), pinned);
      if (found.some((f) => f.kind === "V")) {
        console.log(`  PASS  mutation 'a citation names a version the pin does not compile' is caught by assertion V`);
      } else {
        stFails += 1;
        console.error("  FAIL  mutation 'a citation names a version the pin does not compile' was NOT caught by assertion V");
      }
    }
  }

  // V, mutation 2: the pin MOVES — the pinned charly advances to a version the prose
  //    has not been re-keyed to. The version is derived, so this is the common case.
  const movedVersion = otherVersion(pinned.version, 2);
  if (!movedVersion) {
    stFails += 1;
    console.error("  FAIL  the moved version could not be derived from the pinned one");
  }
  const moved = findings(shipped, { ...pinned, version: movedVersion || pinned.version });
  if (movedVersion && moved.some((f) => f.kind === "V")) {
    console.log("  PASS  mutation 'the pinned charly advances to a version the prose has not been re-keyed to' is caught by assertion V");
  } else {
    stFails += 1;
    console.error("  FAIL  mutation 'the pinned charly advances' was NOT caught by assertion V");
  }

  // V, mutation 3: the pinned charly's OWN go.mod names another version — the owner
  //    moved under the citation. The requirement text is built from a DERIVED version,
  //    so this file quotes none.
  const ownerVersion = otherVersion(pinned.version, 3);
  if (!ownerVersion) {
    stFails += 1;
    console.error("  FAIL  the owner's version could not be derived from the pinned one");
  }
  const gomodMutated = readPinned(
    root,
    ownerVersion ? `require github.com/opencharly/plugin-task/candy/plugin-task ${ownerVersion}\n` : null,
  );
  if (!ownerVersion || !gomodMutated.version) {
    stFails += 1;
    console.error("  FAIL  the go.mod mutation did not apply — the requirement line no longer parses");
  } else {
    const found = findings(shipped, gomodMutated);
    if (found.some((f) => f.kind === "V")) {
      console.log("  PASS  mutation 'the pinned charly's go.mod names another version' is caught by assertion V");
    } else {
      stFails += 1;
      console.error("  FAIL  mutation 'the pinned charly's go.mod names another version' was NOT caught by assertion V");
    }
  }

  // C, negative control: a version literal on a line that names ANOTHER module is not
  //    a citation of plugin-task, and must not be flagged. The version it carries is
  //    DERIVED and deliberately NOT the pinned one, so a predicate that flagged every
  //    version literal would catch it — the control cannot pass for the wrong reason.
  const negFile = shipped[0] ? shipped[0].file : "charly.yml";
  const negVersion = otherVersion(pinned.version, 7);
  if (!negVersion) {
    stFails += 1;
    console.error("  FAIL  the negative control's version could not be derived from the pinned one");
  }
  const negText = negVersion
    ? `  # plugin-candy ${negVersion} is a different module's release, not a citation\n`
    : "  # plugin-candy is a different module's release, not a citation\n";
  const negFound = findings(scanCitations(root, new Map([[negFile, negText]])), pinned);
  if (negFound.length === 0) {
    console.log("  PASS  negative control — a version on a line naming another module stays GREEN");
  } else {
    stFails += 1;
    console.error("  FAIL  negative control: a version on a line naming another module was flagged");
  }

  // T, WHICH TREE IS JUDGED: a commit ships the INDEX, so where the worktree and the
  //    index disagree the index must be the copy that is judged. Proven on a FIXTURE
  //    repo with a real index: the file is COMMITTED carrying a stale citation and the
  //    worktree copy is fixed afterwards — so a gate that read the worktree would
  //    report the fixed version, pass, and let the commit ship the stale one.
  const fixtureStale = otherVersion(pinned.version, 11);
  const fixtureFound = fixtureStale ? indexFixtureCitations(fixtureStale, pinned.version) : [];
  const fixtureFindings = fixtureStale ? findings(fixtureFound, pinned) : [];
  if (
    fixtureStale &&
    fixtureFound.length === 1 &&
    fixtureFound[0].version === fixtureStale &&
    fixtureFindings.some((f) => f.kind === "V")
  ) {
    console.log("  PASS  the gate judges the tree a commit SHIPS — where the worktree and the index disagree, the INDEX is judged (fixture)");
  } else {
    stFails += 1;
    console.error("  FAIL  the gate did not judge the INDEX where the worktree and the index disagree");
  }

  if (stFails) {
    console.error(`check-cited-plugin-task-version --self-test: FAIL (${stFails})`);
    process.exit(1);
  }
  console.log("check-cited-plugin-task-version --self-test: OK (every assertion is live)");
  process.exit(0);
}

const cites = scanCitations(root);
const pinned = readPinned(root);
if (!pinned.version) {
  console.log(`check-cited-plugin-task-version: SKIP — ${pinned.notice}; the version cannot be derived, so no citation is judged`);
  process.exit(0);
}
const n = report(findings(cites, pinned));
if (n) {
  console.error(`check-cited-plugin-task-version: ${n} finding(s)`);
  process.exit(1);
}
console.log(okLine(cites.length, pinned.version));
