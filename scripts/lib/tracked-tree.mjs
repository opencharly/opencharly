// tracked-tree.mjs — the ONE implementation of "the tracked files of a tree" and of "a
// throwaway git tree to sweep", shared by the umbrella's gates that judge a tree's own
// files.
//
// WHY THIS IS A LIBRARY AND NOT A COPY (R2): a sweep that walks a tree asks the same
// question in every gate — "which files does this tree hold, and which of them are THIS
// repo's to judge?" — and the answers have to agree. Two copies of that walk are two
// answers, and the second one to be written is the one that forgets an exclusion. The
// umbrella already carries this lesson in its own gates: check-bang-arm-ownership.mjs and
// check-retired-claims.mjs each walked the tracked set with their own copy, and the two
// copies had drifted on what a SYMLINK is (one of them read through the link and judged
// another repo's content under this repo's rulebook).
//
// WHAT IS NOT A FILE OF THIS TREE, and why the walk says so once, here:
//
//   - a GITLINK (mode 160000) is another REPO's tree. The umbrella is a VIEW over the org:
//     every submodule is a repo of its own, with its own rulebook and its own gates, and
//     this repo's rules are not that repo's rules. A sweep that read a gitlink's content
//     would judge another repo's prose under this repo's rulebook.
//   - a SYMLINK (mode 120000) is another PATH's content. The umbrella's own symlinks are
//     the harness farm (.dsh/skills/*), and every one of them points into marketplace/ —
//     the corpus, which is another repo. Reading through one reads the corpus, and the
//     corpus has its own gate.
//
// Both exclusions are the umbrella's own rule, stated once, in the one place that walks a
// tree — so a gate that adds a sweep does not get to invent its own scope.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/* The tracked set's own `git ls-files -s -z` grows with the repo, and the default
 * 1 MiB exec buffer throws ENOBUFS on a large tree — a gate that stops judging is a
 * gate that fails silently. ONE ceiling, raised ONCE, and no call may set another
 * (R2: one canonical implementation per behaviour). */
const MAX_EXEC_BYTES = 64 * 1024 * 1024;

/** Every tracked path of a tree, with the mode git records for it. */
export function trackedEntries(dir) {
  const out = spawnSync("git", ["-C", dir, "ls-files", "-s", "-z"], {
    encoding: "utf8",
    maxBuffer: MAX_EXEC_BYTES,
  });
  if (out.status !== 0) throw new Error(`git ls-files failed in ${dir}: ${out.stderr}`);
  const entries = [];
  for (const rec of out.stdout.split("\0")) {
    if (!rec) continue;
    const tab = rec.indexOf("\t");
    if (tab === -1) continue;
    const mode = rec.slice(0, tab).split(/\s+/)[0];
    entries.push({ path: rec.slice(tab + 1), mode });
  }
  return entries;
}

/**
 * The tracked FILES of a tree: the paths this tree holds as its own content.
 *
 * A gitlink and a symlink are excluded — see the header for why — so a caller that
 * sweeps these reads only this repo's own content.
 */
export function trackedFiles(dir) {
  return trackedEntries(dir)
    .filter((e) => e.mode !== "160000" && e.mode !== "120000")
    .map((e) => e.path);
}

/**
 * A throwaway git tree carrying the given files — the fixture a sweep is proven
 * against. The tree is a real git repository, because the sweep reads the tracked set
 * through git: a fixture that were a plain directory would prove the matcher and not
 * the walk.
 */
export function gitFixture(files, prefix = "charly-tree-fixture-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  spawnSync("git", ["-C", dir, "init", "-q"], { encoding: "utf8" });
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  spawnSync("git", ["-C", dir, "add", "-A"], { encoding: "utf8" });
  return dir;
}
