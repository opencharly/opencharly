// corpus-tag.mjs — the ONE reading of "the corpus tag this tree pins".
//
// WHY THIS IS A LIBRARY AND NOT TWO COPIES (R2). Two surfaces need the same answer and they must never
// disagree:
//
//   - `scripts/check-harness-config.mjs` (check 14) JUDGES `.pi/settings.json`'s marketplace package pin
//     against it;
//   - `scripts/sync-skill-bindings.mjs` WRITES that pin from it, because `charly task sync` advances the
//     corpus and every harness surface that names it must follow in the same run.
//
// A second implementation is what let the gate and the derivation disagree: the derivation covered the
// DSH farm and `.claude/settings.json`, the gate judged all three surfaces, and the third was invisible
// to both — so every pin wave reddened the gate after its own derivation step had reported success, and
// the pin was corrected by hand twice in one cutover (opencharly/opencharly#1344).
//
// The tag is the nearest one `git describe` reaches from the corpus checkout's HEAD. The REMOTE IS NEVER
// ASKED: the harness config must follow the corpus THIS tree carries, never the newest release
// published, and a gate that reaches the network is not a gate (the same reason the pin-policy checks
// read the index instead of `ls-remote`).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * corpusTag <root> [corpusDir] -> { tag, dir, reason }
 *
 * `tag` is "" when the question cannot be answered, and `reason` then says why in the words the caller
 * reports. Both callers SKIP VISIBLY on an empty tag — a session worktree has `marketplace/` present and
 * EMPTY (Part II rule 2), which is a legitimate state and must never be a failure nor a silent pass.
 */
export function corpusTag(root, corpusDir = "marketplace") {
  const dir = join(root, corpusDir);
  if (!existsSync(join(dir, ".git"))) {
    return { tag: "", dir, reason: `${corpusDir}/ is not checked out in ${root}` };
  }
  const described = spawnSync("git", ["describe", "--tags", "--abbrev=0", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  });
  const tag = (described.stdout ?? "").trim();
  if (described.status !== 0 || tag === "") {
    return { tag: "", dir, reason: `${corpusDir}/ carries no reachable tag in ${root}` };
  }
  return { tag, dir, reason: "" };
}
