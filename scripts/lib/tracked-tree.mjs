// tracked-tree.mjs — the ONE implementation of "the tracked files of a tree", of "a
// tracked file's text", and of "a throwaway git tree to sweep", shared by the umbrella's
// gates that judge a tree's own files.
//
// WHY THIS IS A LIBRARY AND NOT A COPY (R2): a sweep that walks a tree asks the same
// question in every gate — "which files does this tree hold, and which of them are THIS
// repo's to judge?" — and the answers have to agree. Two copies of that walk are two
// answers, and the second one to be written is the one that forgets an exclusion.
//
// The umbrella already carries this lesson in its own gates, and it carried it in NINE of
// its thirty-five gates before this library became the one home (MEASURED on the tree
// this landed on — `git show HEAD:scripts/…`, per file):
//
//   - the WALK — "the tracked files of this tree" — was written out SIX times: in
//     check-cited-plugin-task-version.mjs, check-coord-verb-set.mjs,
//     check-guidance-pathspec.mjs, check-pin-verb-scope.mjs, check-pr-body-cap.mjs and
//     check-readme-measurements.mjs. The copies had already drifted on what a SYMLINK is
//     — one of them read through the link and judged another repo's content under this
//     repo's rulebook — and they read the SAME INDEX under FOUR ceilings: Node's 1 MiB
//     default (twice), 64 MiB (three times) and 256 MiB (once). So the tree one gate
//     could judge, another could fail to read at all.
//   - the TEXT RULE — "a tracked file's text, or nothing when it is binary" — was
//     written out SEVEN times, in two shapes: over a decoded string
//     (`text.includes("\0")`) and over the bytes (`buf.includes(0)`).
//
// Every one of those copies comes here now.
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
//
// THE SCOPE OF THIS OWNERSHIP, stated so a reader can check it: every gate that walks a
// tracked tree gets its file set from `trackedFiles` here, and every gate that reads a
// file's text gets it from `readTextFile`/`textFromBytes` here. A gate may narrow what it
// judges (its own exclusions — a CHANGELOG/ it does not want, a file that names it), but
// it does not re-answer the walk.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
 * BYTES to text, or null when the bytes are not prose.
 *
 * WHY IT LIVES HERE AND NOT IN A GATE. A sweep reads prose, and a BINARY's bytes are
 * not prose: a NUL byte in a file is not a character any reader can match, so a gate
 * that reads a binary as text judges a picture's bytes for a name. The rule was written
 * out SEVEN times over this repo's gates — as `text.includes("\0")` over a decoded
 * string, as `buf.includes(0)` over the bytes, and as a `statSync` size gate — and the
 * copies disagreed on WHICH question they answered, not on any file: a NUL byte is the only
 * thing that makes a file binary, whether it is looked for in the bytes or in the
 * decoded string, because UTF-8 never encodes a NUL inside a multi-byte sequence
 * (MEASURED: the two variants agree on every case — plain text, an ASCII NUL, a NUL
 * after a truncated multi-byte sequence, a BOM then NUL, UTF-16LE, and two overlong
 * encodings — so the divergence was never a file; it was a second place to look).
 * One implementation, one rule: the bytes are read, and a NUL byte is what makes a file
 * binary (R2).
 */
export function textFromBytes(buf) {
  if (buf.includes(0)) return null; // binary
  return buf.toString("utf8");
}

/**
 * A file's WORKING-TREE text, or null when it is unreadable or binary.
 *
 * The binary rule is `textFromBytes`, above — the same rule a gate that reads a blob
 * out of the INDEX applies, so the two readings cannot drift (R2).
 */
export function readTextFile(abs) {
  let buf;
  try {
    buf = readFileSync(abs);
  } catch {
    return null;
  }
  return textFromBytes(buf);
}

/**
 * Make a directory a TRACKED git tree: every file in it becomes a tracked file.
 *
 * The sweep reads the tracked set through git, so a fixture that is a plain directory
 * proves the matcher and not the walk. This is the ONE way a fixture becomes tracked,
 * so a fixture and the production tree are the same shape — a self-test that built a
 * plain directory proved a path the gate never takes in production (R7: coverage must
 * fail without the change, and it must exercise the changed path).
 */
export function gitTrackTree(dir) {
  const init = spawnSync("git", ["-C", dir, "init", "-q"], { encoding: "utf8" });
  if (init.status !== 0) throw new Error(`git init failed in ${dir}: ${init.stderr}`);
  const add = spawnSync("git", ["-C", dir, "add", "-A"], { encoding: "utf8" });
  if (add.status !== 0) throw new Error(`git add failed in ${dir}: ${add.stderr}`);
  return dir;
}

/**
 * A throwaway git tree carrying the given files — the fixture a sweep is proven
 * against. The tree is a real git repository, because the sweep reads the tracked set
 * through git: a fixture that were a plain directory would prove the matcher and not
 * the walk.
 */
export function gitFixture(files, prefix = "charly-tree-fixture-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return gitTrackTree(dir);
}
