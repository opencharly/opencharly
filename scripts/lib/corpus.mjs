// corpus.mjs — the ONE predicate that decides whether the corpus can be derived from.
//
// `existsSync("marketplace")` is the WRONG predicate on this system, and the failure it caused is
// measured rather than theoretical: `git worktree add` creates the submodule MOUNT POINT, so a session
// worktree (the layout AGENTS.md Part II rule 2 prescribes for every lane) has `marketplace/` PRESENT
// and EMPTY. A derivation that accepts that derives ZERO skills and then publishes the result as if it
// were a state — it emptied the 353-entry `.dsh/skills` farm and rewrote `reasonix.toml`'s `[skills]
// paths` to 0 entries, reporting `exit=0 done`, while the gate's own arm turned RED on the same tree
// (opencharly/opencharly#508). **Existence is not materialisation.**
//
// One predicate, imported by the writer, by `--check`, and by the harness-config gate's skip tests.
// The defect was one predicate with three implementations and only one honest one, so a second copy
// of this function would rebuild the defect it exists to remove.

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const CORPUS_ROOT = "marketplace";

/** The corpus's family directories (`marketplace/<family>`), dot entries excluded.
 *
 *  Dot-prefixed entries are never families: the corpus root also carries the published `.well-known/`
 *  tree, and a bare `readdir` invents a family called `.well-known` whose directory holds generated
 *  JSON rather than skills. MEASURED the first time this ran: the naive version derived 44 entries
 *  where 43 exist. */
export function corpusFamilies(root) {
  const market = join(root, CORPUS_ROOT);
  if (!existsSync(market)) return [];
  return readdirSync(market).filter((d) => !d.startsWith(".")).sort();
}

/** Does the corpus hold FAMILY directories — the input `reasonix.toml`'s `[skills] paths` derives from?
 *
 *  One entry per `marketplace/<family>/{skills,agents}` directory, so a family directory IS the input
 *  that derivation needs. */
export function corpusHasFamilies(root) {
  return corpusFamilies(root).length > 0;
}

/** Does the corpus hold a SKILL — the input the flat `.dsh/skills` farm derives from?
 *
 *  A family directory is NOT that input: a tree can carry family directories and no skill files (a
 *  partial fixture, or a checkout whose corpus was never populated), and the farm derivation with zero
 *  skills would otherwise declare all 353 entries stale — or, in write mode, DELETE them. The two
 *  derivations ask the same question about different inputs, so each names its own need here, once. */
export function corpusHasSkills(root) {
  for (const family of corpusFamilies(root)) {
    const dir = join(root, CORPUS_ROOT, family, "skills");
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (existsSync(join(dir, name, "SKILL.md"))) return true;
    }
  }
  return false;
}

/** What a derivation needs from the corpus, and the ONE message each skip carries — so the writer's
 *  notice, both gate skip tests and the selftest key on the same strings instead of four paraphrases. */
export const CORPUS_NEEDS = {
  skills: (root) => corpusHasSkills(root),
  families: (root) => corpusHasFamilies(root),
};

export function corpusRemedy() {
  return `run: git submodule update --init ${CORPUS_ROOT}`;
}

export function corpusSkipReason(root, need) {
  return `${CORPUS_ROOT}/ carries no ${need} in ${root} — the corpus is the input, and a derivation with nothing to derive from is not a state (${corpusRemedy()})`;
}
