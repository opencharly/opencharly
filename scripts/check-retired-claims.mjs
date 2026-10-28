#!/usr/bin/env node
// check-retired-claims.mjs — the umbrella's RETIRED claim forms are GONE from its own
// tracked tree, and the KEY SET that names them lives HERE, in the repository, so a
// claim class cannot be missed because the key was written in a PR body.
//
// WHY THIS EXISTS (opencharly/opencharly#710, review round 2): the same class of defect
// was found twice in that PR — a CONDITIONAL behaviour stated as an UNCONDITIONAL one.
// Round 1 corrected ONE surface (scripts/init-submodules.sh's header) and the SAME
// overstatement survived in three others (.pi/README.md, the .pi extension's module
// header and its step 3b comment), plus a fourth, weaker one in
// .claude/workflows/verify-status.js. The sweep that should have caught it named only
// the wording round 1 had RETIRED, so it could not name a claim it had no key for.
//
// A sweep written in a PR body is not a control: nothing in the repository runs it, so
// the next claim class is missed the same way, by the same mechanism. So the key set is
// COMMITTED, the gate scans the tracked tree with it, and the self-test proves every key
// is EFFECTIVE — a key that would match nothing is vacuous, and a vacuous key is this
// defect wearing a different hat.
//
// WHY A CLASS, NOT A WORDING (opencharly/opencharly#710, review round 2): a list of
// EXACT WORDINGS can only name the wordings that have already been written. The very
// defect this gate exists to catch is a CLAIM CLASS, and the class outlives every
// wording it was first written in. MEASURED: the round-1 sweep carried exactly ONE key
// for this class — the wording it had already retired in scripts/init-submodules.sh —
// and that key matches NONE of the TEN sites the class still stood at: the .pi
// extension's module header, its step 3b comment and its fail-closed comment, the
// README's new prose, verify-status.js's `proves`, the .pi gate's own TWO comments, the
// fixture gate's header, the shipped step's comment and the shipped step's own FAILURE
// MESSAGE. A word list would have caught none of the ten. So the patterns below are
// CLASSES: a pattern that matches the shape, not the sentence.
//
// THE SCAN'S UNIT IS A CLAIM, NOT A LINE (opencharly/opencharly#710, review round 2 —
// the missed control, and the root fix that closes it): a claim WRAPS. The prose in a
// comment or a paragraph is wrapped at the column, and the wrap can fall BETWEEN the
// two words of one phrase. MEASURED on the class's own TWO sites in `origin/main`'s
// scripts/init-submodules.sh: the LATER of them (:622) carries it as
//     `... the umbrella's own currency report cannot then JUDGE`
//     `# an edge whose source is a nested pin: it prints ...`
// — the phrase straddles a line break. A line-oriented scan sees ONE of the class's TWO
// sites in that tree, and a self-test whose instances are all single-line cannot see the
// gap: a control that only recognizes a class in the shape it was first written in is
// the defect this gate exists to catch, wearing a different hat. So the scan's unit is
// the CLAIM STREAM: a file's lines with their comment marker stripped, joined by one
// space across a WRAP, and separated by a hard newline where a sentence ENDS or a new
// block BEGINS. The class's own wrapped wording is one of the class's INSTANCES, so the
// self-test proves the wrap-tolerant form is EFFECTIVE, and not merely present.
//
// A BLOCK IS A BOUNDARY, NOT AN EXCLUSION (opencharly/opencharly#710, review round 4 —
// the second missed control, and its root fix): a markdown block start — a heading, a
// list item, a table row, a quote — used to be DROPPED from the claim stream, text and
// all. So a claim a reader sees in a list item was invisible to the scan, and the
// umbrella's own rulebook is written as list items: the shape the claims live in was
// the shape the gate could not see. MEASURED on this PR's own body, whose R1 findings
// are list items: the scan reported ONE hit where the prose carried TWO. So a block
// start's TEXT is a claim and enters the stream, with the block MARKER stripped
// (the marker is syntax; the text is what a reader sees), and a list item CONTINUES on
// the lines indented to its content column, because a claim that wraps inside a list
// item is one claim.
//
// WHAT IS ASSERTED (--self-test must see each one go RED):
//   R. No tracked file, except CHANGELOG/ (the record of what happened, not a current
//      claim), contains any retired claim form. Every hit is a file and a line, and the
//      gate names it.
//   K. Every pattern is EFFECTIVE: each of its INSTANCES — the concrete wordings that
//      class has actually been written in — turns the scan RED when injected into a
//      COPY of a tracked file. A pattern that cannot be made to fail proves nothing.
//   L. Every pattern is EFFECTIVE in the LIST shape: injected as a markdown list item,
//      it turns the scan RED. A shape the self-test never exercises is a shape the
//      scan never proved, and the shape the rulebook is written in is a list item.
//   S. Every pattern is SOUND: each of its COUNTER-INSTANCES — the qualified, TRUE
//      wordings that look like the class and are not it — leaves the scan GREEN. A
//      pattern that cries wolf is a gate that gets disabled, and a disabled gate is this
//      defect wearing a third hat.
//
// The scan is CASE-INSENSITIVE on purpose: the same claim is written in the same
// sentence in two cases ("cannot JUDGE an edge" / "cannot judge an edge"), and a
// case-sensitive key catches only the case its author happened to use. That was not
// hypothetical — the class's own wording appeared in both.
//
// SCOPE: the umbrella's OWN tracked files. A submodule is a repo of its own, with its own
// rulebook and its own gates; this gate speaks for the umbrella's prose only. A tracked
// SYMLINK is skipped for the same reason: every one of them points into `marketplace/`,
// another repo, whose content is not the umbrella's claim to judge.
//
// usage: node scripts/check-retired-claims.mjs [--root <dir>] [--self-test]

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SELF_REL = "scripts/check-retired-claims.mjs";
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

/* The tracked set's own `git ls-files -s -z` grows with the repo, and the default
 * 1 MiB exec buffer throws ENOBUFS on a large tree — a gate that stops judging is a
 * gate that fails silently. ONE ceiling, raised ONCE, and no call may set another
 * (R2: one canonical implementation per behaviour). The ceiling is placed AFTER the
 * spread, so a caller's own `maxBuffer` cannot replace it. */
const MAX_EXEC_BYTES = 64 * 1024 * 1024;

/** Every git call goes through here, so the ceiling above is raised ONCE. */
function gitOut(args, opts = {}) {
  return execFileSync("git", args, { ...opts, maxBuffer: MAX_EXEC_BYTES });
}

// WHY A STATED SCOPE, NOT A STRAY WORD (opencharly/opencharly#775 — the missed
// control, and the root fix that closes it): a claim that STATES whose gate or hook it
// is — "that repo's own", "the umbrella's own" — is true wherever it is read, while a
// claim that names ONE repo's command and states the rule ORG-WIDE is false in every
// repo but one (in opencharly/charly the same command exits 1 with `unknown task
// "verify"`). The guard that tells those two apart is therefore a PHRASE, and it is ONE
// constant shared by every class that needs it (R2): a copy of a rule is a rule with two
// homes, and the two homes drift. MEASURED: the key this file shipped excused any
// claim carrying the word "umbrella" ANYWHERE, so a claim that named the umbrella's
// command and then stated the rule org-wide escaped it.
//
// AND A STATED SCOPE IS DEFEATED BY AN ORG-WIDE MARKER (the validator's round-1 note
// on opencharly/opencharly#776, and the root fix that closes it): a scope phrase says
// WHOSE gate it is, and a claim that says whose gate it is AND then states the rule
// ORG-WIDE says it org-wide — the two clauses cancel, and the claim is false in every
// repo but one exactly as the unscoped form is. So a scope phrase excuses the trigger
// ONLY when the claim carries NO org-wide marker: the exemption is (SCOPE AND NOT
// ORG-WIDE). The markers are REPO-WIDE claims ("in every repo", "org-wide", "across
// the org"), never claims about DIFFS — "any diff" scopes the DIFFS the gate applies
// to, not the repos it applies in, and the umbrella's own true wording uses it.
//
// AND A SWEEP IS ORG-WIDE ONLY WHEN ITS OBJECT IS UNBOUNDED (the validator's round-2
// note on opencharly/opencharly#777, and the root fix that closes it): "in every repo"
// states the rule org-wide, but "in each clone of the umbrella" is BOUND to the
// umbrella's own clones and is true wherever it is read — and the marker set and the
// scope set OVERLAPPED on it, so a true, umbrella-bounded wording was flagged as the
// retired rule. MEASURED: before this fix, "in each clone of the umbrella, run
// ./charly/bin/charly task verify whenever the diff touches a submodule" was RED. So
// the marker fires only on an UNBOUNDED swept object: a BINDER ("of the umbrella",
// "in that repo") ties the sweep back to one repo, and the scope's own swept form
// requires that binder. The two sets are DISJOINT on "each clone" / "each repo":
// swept-and-bound is a SCOPE, swept-and-unbound is a MARKER.
//
// AND A BINDER BINDS ONLY A COPY (the validator's round-3 note on
// opencharly/opencharly#779 — "Whether 'in every repo of the umbrella' should be
// GREEN is a project doctrine call"): a binder ties a swept object back to ONE repo,
// and only a COPY of that repo is one repo. The repos a repo HOLDS are a set of
// their own — the umbrella holds the org's — so tying a sweep to them does not
// narrow it. The org's own rulebook says so in its own words: AGENTS.md (Part II #3)
// calls the umbrella's wave over its declared pins "an ORG-WIDE cutover, not a way
// to move one pin: it advances EVERY pin the repo declares", and the umbrella
// DECLARES the org's repos' pins (Part II #2: "the umbrella pins every OpenCharly
// repo as gitlinks"). So "every repo of the umbrella" is the ORG's repos, and a
// claim that names the umbrella's command over that set is false in every repo but
// one, exactly as the unscoped form is. The word that decides it is the OBJECT: a
// sweep over COPIES is a SCOPE, a sweep over the repos the umbrella holds is a
// MARKER. The binder's own bound noun does not decide it — "of the org" was never
// a binder, and "of the umbrella" binds a copy, not a member repo.
// MEASURED on the umbrella's own tracked tree: 2 lines carry a trigger, both carry a
// scope phrase, and NEITHER carries an org-wide marker — the umbrella's own prose
// stays GREEN.
const ONE_REPO_DET = "(?:a|the|this|that|your|my)";
const EVERY_REPO_DET = "(?:every|all|any|each)";
const REPO_OBJECT = "(?:repo|repos|repository|repositories|clone|clones)";
// A COPY of one repo — the word for one repo's own instance ("a clone of the
// umbrella"). It is the only swept object a binder can tie back to ONE repo.
const COPY_OBJECT = "(?:clone|clones)";
// A BINDER ties a swept object back to ONE repo. It is the org-wide marker's own
// exception, and it is ONE constant, shared by the two sets (R2).
const BOUND_TO_ONE_REPO =
  "\\s+(?:of|in)\\s+(?:the|this|that|your|my)\\s+(?:umbrella|repo(?:sitory)?|clone)\\b";

const STATED_SCOPE_PHRASES =
  "\\b(?:the|that|this|its|your)\\s+(?:repo|repository|umbrella)(?:'s)?\\s+own\\b" +
  "|\\b(?:its|their|your)\\s+own\\b" +
  "|\\b(?:the|that|this|its|your)\\s+(?:umbrella|repo(?:sitory)?)(?:'s)?\\s+(?:own\\s+)?(?:pin\\s+|commit[- ]carried\\s+)?(?:gate|hook|check)\\b" +
  "|\\bin\\s+(?:" +
  ONE_REPO_DET + "\\s+(?:clone\\s+of\\s+the\\s+)?(?:umbrella|repo(?:sitory)?)\\b" +
  "|" + EVERY_REPO_DET + "\\s+" + COPY_OBJECT + BOUND_TO_ONE_REPO +
  ")" +
  "|\\bmember\\s+repo\\b";

// The REPO-WIDE sweep is a MARKER — except a bound sweep over COPIES, which is the
// one form the scope set also admits. The exclusion is stated with the SAME binder
// and the SAME copy object the scope set uses, so the two sets cannot drift apart
// (R2): a sweep that the scope set calls a scope is never also a marker.
const ORG_WIDE_MARKERS =
  "\\b(?!" + EVERY_REPO_DET + "\\s+" + COPY_OBJECT + BOUND_TO_ONE_REPO + ")" +
  EVERY_REPO_DET + "\\s+(?:member\\s+)?" + REPO_OBJECT + "\\b" +
  "|\\borg(?:anization)?[ -]wide\\b" +
  "|\\bacross\\s+the\\s+org\\b" +
  "|\\b(?:in|throughout|through)\\s+the\\s+(?:whole|entire)\\s+org\\b" +
  "|\\bthe\\s+(?:whole|entire)\\s+org\\b" +
  "|\\bin\\s+the\\s+org\\b";

const STATED_SCOPE =
  "(?!(?=[^\\n]*(?:" + STATED_SCOPE_PHRASES + "))(?![^\\n]*(?:" + ORG_WIDE_MARKERS + ")))";

// THE CLASS'S VERBS — each with its BASE and its three inflections (-s/-es, -ed, -ing).
// The base is the form a PLURAL subject takes ("diffs touch a submodule"), and four
// verbs of the class did not carry it, so the class was re-introducible in the shape a
// plural subject forces. The group is OPTIONAL only where the BASE is the bare stem
// (touch, edit, alter, affect); where the base carries an ending (change, modify,
// update) that ending IS the group, so every one of the verb's four forms stays
// visible in the pattern.
const CLASS_VERBS =
  "touch(?:es|ed|ing)?" +
  "|chang(?:e|es|ed|ing)" +
  "|edit(?:s|ed|ing)?" +
  "|alter(?:s|ed|ing)?" +
  "|modif(?:y|ies|ied|ying)" +
  "|updat(?:e|es|ed|ing)" +
  "|affect(?:s|ed|ing)?";

// THE CLASS'S DETERMINER — the one before the pin-class noun. The class's shape is the
// DIRECT OBJECT, so the determiner is the ENGLISH one, not a hand-kept list: every
// determiner that can precede a count noun, and NONE that negates it — "the diff
// touches NO pin" is not a claim that a pin is touched, and the umbrella's own tree
// says exactly that (hooks/pre-commit-gate.sh). The determiner may also be ABSENT:
// "the diff touches submodules" is the class's own condition, plural. MEASURED against
// the tree's wordings: 9 sites carry a class verb beside a pin-class noun, and their
// determiners are "a" (4), "the" (3), a qualifier ("version pins") and "no" (1) — so
// the widening adds no hit to the umbrella's own prose.
const CLASS_DETERMINERS =
  "(?:a|an|the|this|that|these|those|my|your|its|our|their|his|her|" +
  "some|any|each|every|one|two|three|many|several|all|both|other|another|either)";

// The retired claim forms. Each entry is a CLASS of claim, matched by a pattern, together
// with the concrete wordings that class has been written in — the instances are the
// PROOF MATERIAL: each one must turn the scan RED, or the pattern proves nothing. The
// counter-instances are the qualified, TRUE wordings that must leave the scan GREEN.
const PATTERNS = [
  {
    pattern: "NOT INITIALIZED [(]no checkout[)]; a [+] or U drift would still FAIL",
    instances: ["NOT INITIALIZED (no checkout); a + or U drift would still FAIL"],
    counterInstances: [],
    why: "the shipped step's retired NOTICE form — a MATERIALIZED charly without its nested level now FAILS",
  },
  {
    pattern: "an uninitialized nested path is a NOTICE",
    instances: ["an uninitialized nested path is a NOTICE"],
    counterInstances: [],
    why: "the retired fixture label for that notice",
  },
  {
    pattern: "notinit=",
    instances: ["notinit="],
    counterInstances: [],
    why: "the retired shell variable that carried the notice",
  },
  {
    pattern: "which the pin contract calls a FAILURE",
    instances: ["which the pin contract calls a FAILURE"],
    counterInstances: [],
    why: "the retired classification of an unjudgeable pin — the state table says it PASSES (opencharly/opencharly#713)",
  },
  {
    pattern: "6[.]6 MB",
    instances: ["6.6 MB"],
    counterInstances: [],
    why: "the retired figure this change introduced for the nested level",
  },
  {
    pattern: "9[.]0 MB of the 9[.]5 GB",
    instances: ["9.0 MB of the 9.5 GB"],
    counterInstances: [],
    why: "the retired comparison across two different universes (the .pi cost model vs the umbrella's full clone)",
  },
  {
    // The class: two of the report's own states claimed INDISTINGUISHABLE. The truth:
    // the report's state names them apart — `differs (no checkout of <twin> to judge
    // ancestry)` against `behind` / `unmerged` / `not-on-the-served-line` (the product's
    // own `ancestryClass`, plugin-task v0.2026300.951, candy/plugin-task/verbs.go:981)
    // — and only the VERDICT level, where both read "not current", cannot tell them
    // apart. A claim that the two states cannot be told apart is that defect in any
    // wording, and this change wrote it in four surfaces.
    //
    // The shape is the distinguishing phrase followed by "from a (real|true|genuine)
    // (divergence|state)": that is where the claim puts the comparison. The counter-
    // instances below are the TRUE wordings of the same idea — the verdict level really
    // does not separate them, and the report's own state name really does — so a key
    // that cries wolf on them is a gate that gets switched off.
    pattern:
      "(indistinguishable|not distinguishable|cannot be told apart|cannot tell apart|" +
      "not tell apart|tell apart|told apart) from a (real|true|genuine) (divergence|state)",
    instances: [
      // the retired .pi README claim
      "indistinguishable from a real divergence",
      // the retired claim in the .pi extension's module header, its step 3b comment and
      // the initializer's WHY block
      "which a reader cannot tell apart from a real divergence",
    ],
    counterInstances: [
      // TRUE: at the VERDICT level the two states really do read alike
      "at the VERDICT level the two states are indistinguishable to a reader, because both read not-current",
      // TRUE: the report's own state name really does tell them apart
      "the report's own state name tells a real divergence apart from an unjudgeable one",
      // TRUE: a not-current verdict does not separate the two KINDS of not-current
      "a not-current twin is not distinguishable from a not-current leaf at the verdict level",
    ],
    why: "the retired claim that two of the report's states are INDISTINGUISHABLE — the report's own state names them apart; only the VERDICT level cannot",
  },
  {
    // THE CLASS. The flat overstatement: an edge is said to be UNJUDGEABLE, with no
    // qualifier. The truth: the report judges a twin's CURRENCY from the twin's REMOTE
    // alone and never asks whether the checkout EXISTS, so while that remote has not
    // moved the twin reads `cur` and the absent level is INVISIBLE to the report; the
    // checkout is needed only to CLASSIFY a twin whose remote HAS moved. A claim that
    // says an edge cannot be judged, unqualified, is that defect in any wording.
    //
    // The shape is the ADJACENCY of a judgment word and the bare noun "an edge": the
    // flat claim judges THE EDGE, while the true claim scopes what it judges ("the
    // ANCESTRY of an edge"). So the qualifier — a word BETWEEN the judgment and the
    // noun — is what separates them, and the pattern refuses to match across one.
    // The two guards are the noun phrase: an edge's ANCESTRY is scoped and therefore
    // true, and "an edge case" is a different noun entirely.
    pattern:
      "(judge|judging|judgable|unjudgeable) an edge(?![A-Za-z']| case)" +
      "|an edge (?:cannot|can not|can never|is not|is never|is un) (?:be )?(?:judge|judged|judgable)",
    instances: [
      // the retired initializer sentence — WRAPPED across a comment marker, which is how
      // the class was first written in `origin/main` (MEASURED: a line-oriented scan
      // sees one of the class's two sites there, and misses this one)
      "# cannot then JUDGE\n# an edge whose source is a nested pin: it prints",
      "cannot JUDGE an edge whose source is a nested pin: it prints",
      // the retired .pi claim (the README, the extension's module header, its step 3b comment)
      "cannot JUDGE an edge whose twin is a nested pin",
      // the retired verify-status.js claim
      "cannot judge an edge whose twin is absent",
      // the fixture gate's header, and the .pi gate's own header
      "cannot judge an edge whose twin is a nested pin, and it prints a false `differs (no checkout of box/cachyos ...)` while the gate stays green",
      // the shipped step's own comment
      "cannot have the currency report judge an edge whose source is a nested pin",
      // the shipped step's own FAILURE MESSAGE
      "the currency report cannot judge an edge whose source is one of them",
      // the flat form with NO relative clause at all (the extension's fail-closed comment)
      "cannot judge an edge, and it must never be reported as ready",
      // the REVERSED word order: the same flat claim, with the judgment on the noun
      "an edge cannot be judged by the report",
    ],
    counterInstances: [
      // the TRUE form, with the qualifier BETWEEN the judgment and the noun
      "cannot then JUDGE the ANCESTRY of an edge whose source is a nested pin",
      // the TRUE form, WRAPPED the same way the flat form was
      "# cannot then JUDGE the ANCESTRY\n# of an edge whose source is a nested pin",
      // a SCOPED claim: only the ancestry is unjudgeable, and that is true
      "the currency report cannot judge an edge's ancestry",
      // a different noun entirely: an edge CASE is a corner case
      "we judge an edge case as a corner case, not as a claim",
    ],
    why: "the FLAT overstatement — an edge judged with no qualifier. Every wording of this class that this change retired is one of the instances above, and the class outlives its wordings",
  },
  {
    // THE CLASS: a claim that the umbrella's evidence table reads a staged gitlink out
    // of the INDEX with `git rev-parse --verify`. The truth: the index entry is read
    // with `git ls-files -s` (opencharly/opencharly#666).
    //
    // WHY THIS CLASS WAS WORTH KEYING, and not just deleting in one PR: the legend
    // that carried the retired wording states the table's own MECHANISM, so a reader
    // is told how the row's value was obtained. A legend that names a read the code no
    // longer performs is a false claim about the product, and it is the kind that
    // comes BACK — a legend is prose, and prose gets copied forward.
    //
    // The shape is the MECHANISM TOKEN, not the sentence: the claim is about HOW the
    // index is read, and that token names the read wherever the claim is written. The
    // pattern deliberately does NOT require the word "index" nearby, because the
    // legend's claim WRAPS: the two `echo` lines that carried it are separate
    // segments of the claim stream (a shell statement boundary is a boundary), so
    // "from the index" sits in the NEXT segment and a context-anchored pattern would
    // not match the very wording it was written for (MEASURED on the retired legend
    // in origin/main's scripts/sync-pin-evidence.sh).
    //
    // The token pair is `--verify --quiet`, not `--verify` alone: the pair is what the
    // retired read WAS, and a plain `git rev-parse --verify <ref>` — the ordinary
    // idiom for resolving a ref — is a DIFFERENT read, named without `--quiet`. The
    // counter-instances below prove that distinction, and they carry the trap this
    // class has: the code still NAMES the retired read, in the comment that explains
    // why it is wrong (`git rev-parse ":$p"` ECHOES the literal token on failure). A
    // key that matched "rev-parse" alone would fire on that explanation and the gate
    // would be switched off.
    pattern: "rev-parse --verify --quiet",
    instances: [
      // the retired legend clause — the umbrella's own evidence table's mechanism claim
      "the STAGED GITLINK this PR records (`git rev-parse --verify --quiet :<path>` from the index, `git ls-tree HEAD` fallback)",
      // the retired wording in the changelog record of the read's own introduction
      "`staged_gitlink` reads the STAGED INDEX gitlink with `git rev-parse --verify --quiet :<path>` (the index entry)",
    ],
    counterInstances: [
      // TRUE: the index entry is read with `git ls-files -s`
      "the STAGED GITLINK this PR records (`git ls-files -s` from the index, `git ls-tree HEAD` fallback)",
      // TRUE: the code NAMES the retired read, to explain why it is wrong — and that
      // explanation must not be read as a claim that the index is read that way
      "The index read is `git ls-files -s`, NOT `git rev-parse \":$p\"`: bare rev-parse ECHOES the literal `:<path>` token on failure",
      // TRUE: a plain rev-parse of a REF is a different read entirely
      "git rev-parse --verify refs/heads/main",
    ],
    why: "the retired MECHANISM claim — that the staged gitlink is read out of the index with `git rev-parse --verify`. The index entry is read with `git ls-files -s` (opencharly/opencharly#666)",
  },
  {
    // THE CLASS: a claim that the umbrella records a path's gitlink with a BARE
    // `git ls-tree HEAD --` pathspec. The truth: the read is LITERAL, because git
    // reads a path argument as a PATHSPEC and a name that BEGINS WITH `:` is
    // pathspec MAGIC — the plain form then matches NOTHING, silently, with exit 0
    // and no error (opencharly/opencharly#740).
    //
    // WHY THIS CLASS WAS WORTH KEYING, and not just corrected in one PR: the header
    // that carried the retired wording states how the record is OBTAINED, so a reader
    // is told how the value was read. A header that names a read the code no longer
    // performs is a false claim about the product, and it is the kind that comes BACK
    // — a header is prose, and prose gets copied forward.
    //
    // The shape is the PLACEHOLDER: a legend that names the read generically writes
    // the argument as `<path>`. A claim that names a CONCRETE argument is a different
    // thing, and the code's own measured note quotes concrete arguments ON PURPOSE
    // (`'a*b'`, `':colonpath'`) to show the two behaviours apart — so the pattern keys
    // the placeholder, and the counter-instances below are those concrete wordings,
    // which must stay GREEN. A key that matched the bare command would fire on the
    // note that explains why the bare command is wrong, and the gate would be
    // switched off.
    pattern: "ls-tree HEAD -- <",
    instances: [
      // the retired header wording — the umbrella's evidence builder's own header,
      // which stated how the recorded gitlink is obtained
      "the umbrella records (`git ls-tree HEAD -- <path>`); a submodule that is uninitialised or sitting on another commit must not turn a correct pin into a false `not-equal`.",
    ],
    counterInstances: [
      // TRUE: the read is LITERAL — the header's own wording today
      "the umbrella records (`git ls-tree HEAD -- ':(literal)<path>'`); a submodule that is uninitialised or sitting on another commit must not turn a correct pin into a false `not-equal`.",
      // TRUE: the code's own form
      "git -C \"$root\" ls-tree HEAD -- \":(literal)$p\" 2>/dev/null | awk 'NR==1{print $1\" \"$3}'",
      // TRUE: the measured note names a CONCRETE argument, to show the two behaviours apart
      "`ls-tree` does NOT glob: `ls-tree HEAD -- 'a*b'` already returns only the",
      // TRUE: the other measured counter-example — the plain form matches nothing
      "silently, exit 0, no output and no error (measured: `ls-tree HEAD -- ':colonpath'`",
    ],
    why: "the retired MECHANISM claim — that the umbrella records a path's gitlink with a BARE `git ls-tree HEAD --` pathspec. Git reads a path argument as a PATHSPEC, and a name that BEGINS WITH `:` is pathspec MAGIC: the plain form matches NOTHING, silently. The read is `git ls-tree HEAD -- ':(literal)<path>'` (opencharly/opencharly#740)",
  },
  {
    // THE CLASS: the pin-advance operation described as a NON-MUTATING KIND — a
    // preview, a dry run, a read-only report. The truth: the umbrella's pin
    // advance (`charly task sync`, the git-submodules `bump` mode) WRITES — it
    // rolls every leaf submodule that HAS a checkout to its remote's
    // default-branch HEAD, stages those gitlinks, and re-pins the `pin_map`
    // edges. The retired wording introduced it as a thing that changed nothing
    // ("bump pins per the pin contract (preview; does not commit)"), and that is
    // what made it read like a targeted tool (opencharly/opencharly#501).
    //
    // WHY THIS CLASS WAS WORTH KEYING, and not just corrected in one PR: the
    // retired wording is a SHAPE — a parenthetical beside a verb — and shapes get
    // written again. The claim is also a PRODUCT claim (the verb's kind), not a
    // description of the prose, so it belongs beside the other mechanism claims
    // in this file.
    //
    // The ADVANCE token is what pins the class to the ADVANCE operation: the
    // umbrella's OTHER verbs are honestly described as read-only or as a dry run
    // (`charly task prune`'s `MODE=report`), and a key that fired on those would
    // cry wolf. So the pattern requires an advance word — a bump or an advance —
    // within 80 characters of the non-mutating kind, in either order, and the
    // counter-instances below are the true wordings that must stay GREEN.
    //
    // The shapes are NEGATION-SAFE by construction: "it is not read-only" and
    // "(not a preview)" do not match, because the kind word must follow
    // "is/are/as/its" or an opening parenthesis DIRECTLY.
    pattern:
      "(?:\\(\\s*(?:preview|dry[ -]?run|read[ -]?only)\\b" +
      "|\\b(?:is|are|as|its)\\s+(?:an?\\s+)?(?:preview|dry[ -]?run|read[ -]?only)\\b)" +
      "[^\\n]{0,80}?\\b(?:bump(?:s|ed|ing)?|advanc(?:e|es|ed|ing))\\b" +
      "|\\b(?:bump(?:s|ed|ing)?|advanc(?:e|es|ed|ing))\\b[^\\n]{0,80}?" +
      "(?:\\(\\s*(?:preview|dry[ -]?run|read[ -]?only)\\b" +
      "|\\b(?:is|are|as|its)\\s+(?:an?\\s+)?(?:preview|dry[ -]?run|read[ -]?only)\\b)",
    instances: [
      // the retired README row's wording
      "bump pins per the pin contract (preview; does not commit)",
      // the retired charly.yml header comment's wording
      "bump every submodule pin per the pin contract (preview; does not commit).",
      // the retired charly.yml description's wording
      "Bump all submodule pins per the pin contract (preview; does not commit)",
      // the twin wording the charly repo carries for its own task
      "bump all submodule pins per the pin contract (preview only; does not commit)",
      // the PREDICATE shape — the same claim, written as a kind
      "the pin advance is a preview (it does not commit)",
    ],
    counterInstances: [
      // TRUE: the advance is explicitly NOT read-only, and it moves checkouts
      "it does not commit and does not open a PR, and it is **not read-only** — it moves checkouts",
      // TRUE: the PRUNE verb's report mode really is a dry run — a different verb
      "Reap merged-upstream session worktrees + branches (MODE=report is a dry run)",
      // TRUE: "previews" is a verb here, and the pin is bumped AFTER the preview
      "the marketplace previews the corpus before the pin is bumped",
      // TRUE: a preview SERVICE is a noun, not a kind claim about the advance
      "the marketplace preview service shows the corpus before the pin is bumped",
      // TRUE: the pins task's verify mode really is read-only — a mode, not the advance
      "the `pins` task's `verify` mode is read-only",
    ],
    why: "the retired claim that the pin ADVANCE is a non-mutating kind (a preview, a dry run, a read-only report) — it advances EVERY declared pin, rolls the checkouts that exist and stages their gitlinks (opencharly/opencharly#501)",
  },
  {
    // THE CLASS: an ORG-WIDE rule that names ONE repo's command as the command a
    // reader in ANY repo runs, with the repo's scope left unstated. The rulebook is
    // read in every repo of the org, so a rule that says "run ./charly/bin/charly task
    // verify" without saying "in the umbrella" is FALSE in every repo but one, and in
    // opencharly/charly the same command exits 1 with `unknown task "verify"`.
    //
    // THE TRIGGER IS A SHAPE, not a wording list (opencharly/opencharly#775 — the
    // missed control, and the root fix that closes it). The key this class shipped with
    // named TWO spellings of the condition ("the diff touches" and "a diff that
    // touches"), so the class was RE-INTRODUCIBLE: MEASURED, four further wordings of
    // the very class it guards passed it, and PR #774's claim that "the class cannot
    // come back silently" was FALSE. A control that only recognizes a class in the
    // shape it was first written in is the defect this gate exists to catch, wearing a
    // different hat — so the trigger is the class's SHAPE.
    //
    // The shape is a DIFF CONDITION whose DIRECT OBJECT is a pin-class input: a diff
    // (or a patch), one of the org's own verbs for the condition (touch, change, edit,
    // alter, modify, update, affect), and the pin-class noun as that verb's object. The
    // DIRECTNESS is what keeps the umbrella's own prose GREEN: the tree says "the diff
    // touches one of the pin contract's commit-carried inputs" and "a diff that touches
    // NONE of them", which are conditions on a LIST of inputs, not on a pin-class
    // input. MEASURED against the tree's 71 diff-touch wordings: 0 hits.
    //
    // Every verb carries its BASE and its three inflections (-s/-es, -ed, -ing) — the
    // past tense included ("the diff TOUCHED a submodule") and the base included
    // ("diffs TOUCH a submodule"), because a PLURAL subject takes the base and the
    // class's own subject alternation admits the plural. MEASURED before this fix:
    // the key matched "diffs change a submodule" but not "diffs touch a submodule",
    // "diffs edit …", "diffs alter …" or "diffs affect …" — three of the class's seven
    // verbs carried their base and four did not, so the class was re-introducible in
    // the shape a plural subject forces. And the class's SUBJECT did not carry its own
    // singular: `patches?` spells "patch" + "es" + an optional "s", so it matched
    // "patches" and "patchess" and NEVER "patch" — the key did not match "a patch
    // touches a submodule" AT ALL, although the issue's own shape names it ("a diff /
    // the diff / the patch"). That is the SAME defect the class was widened for, in a
    // smaller dress: a control that recognizes a class in only some of its own
    // wordings recognizes it in the shape it was written in.
    //
    // THE SCOPE IS A STATED SCOPE — a PHRASE, not a stray word. The shipped guard
    // excused any claim carrying the word "umbrella" ANYWHERE, so a claim that named
    // the umbrella's command and then stated the rule org-wide escaped; the guard is
    // the shared STATED_SCOPE constant above, and it is ONE constant for both classes
    // (R2).
    //
    // MEASURED on the umbrella's tree at e35485a (the base this change is written
    // against — e35485adc1933d468d0d6ca3af66b82a1130df26): the prefix
    // `./charly/bin/charly task` occurs in 22 places across 10 tracked files, so a
    // PATH-keyed class would cry wolf on the umbrella's own scripts. The trigger is
    // the RULE, not the path; the path is in the instance. The figure is pinned to
    // an immutable commit — the tree grows under a moving reference — and the two
    // commands that produce it are:
    //   $ git grep -o "\./charly/bin/charly task" e35485a -- . ':!CHANGELOG' | wc -l
    //   $ git grep -l "\./charly/bin/charly task" e35485a -- . ':!CHANGELOG' | wc -l
    //
    // A clone is a SCOPE, and it is said as a PHRASE ("in a clone of the umbrella") —
    // the bare word "clone" says nothing: the hook is the clone-level hook wherever it
    // is installed, so that adjective says nothing about WHOSE clone (and the retired
    // wording itself carries it).
    pattern:
      "(?:^|\\n)" + STATED_SCOPE +
      "[^\\n]*?\\b(?:diffs?|patch(?:es)?)\\b[^\\n]{0,60}?\\b(?:" + CLASS_VERBS + ")\\s+" +
      "(?:" + CLASS_DETERMINERS + "\\s+)?(?:submodule|gitlink|pin)s?\\b",
    instances: [
      // the retired rulebook bullet
      "`./charly/bin/charly task verify` whenever the diff touches a submodule, gitlink, or pin",
      // the SAME class without the relative clause — the shipped key's wording list
      // named only "the diff touches" and "a diff that touches"
      "run ./charly/bin/charly task verify whenever a diff touches a submodule",
      // the PARTICIPLE — the same class, written as a gerund
      "run ./charly/bin/charly task verify whenever a diff touching a submodule",
      // the SCOPE-WORD ESCAPE — the claim names the umbrella's command and states the
      // rule org-wide; the shipped key excused it on the word "umbrella"
      "the umbrella's ./charly/bin/charly task verify is the gate whenever the diff touches a submodule",
      // the SAME class in another VERB — the condition is the shape, not "touches"
      "run ./charly/bin/charly task verify whenever the diff changes a submodule",
      // the SAME class in the PAST TENSE — every other verb of the class carries its
      // own inflections, and one that did not was the gap the validator named on #776
      "run ./charly/bin/charly task verify whenever the diff touched a submodule",
      // the ORG-WIDE DEFEATER — the claim STATES whose gate it is AND states the rule
      // org-wide, so the scope phrase and the org-wide clause cancel and the claim is
      // false in every repo but one, exactly as the unscoped form is
      "the umbrella pin gate applies in every repo whenever the diff touches a submodule",
      // the BASE FORM under a PLURAL subject — a plural subject takes the base, and the
      // class's own subject alternation admits the plural. This is the wording the
      // validator named on opencharly/opencharly#777; the three below are its SIBLINGS,
      // the same mechanism in three more verbs, and a control that recognizes a class
      // in only some of its own wordings recognizes it in the shape it was written in
      "run ./charly/bin/charly task verify whenever diffs touch a submodule",
      "run ./charly/bin/charly task verify whenever diffs edit a submodule",
      "run ./charly/bin/charly task verify whenever diffs alter a submodule",
      "run ./charly/bin/charly task verify whenever diffs affect a submodule",
      // the SINGULAR subject — the shape the issue itself names ("a diff / the diff /
      // the patch"), and the spelling the shipped key could not match at all
      "run ./charly/bin/charly task verify whenever a patch touches a submodule",
      // the DEMONSTRATIVE object — the class's shape is the DIRECT OBJECT, and the
      // determiner before it is the English one
      "run ./charly/bin/charly task verify whenever the diff touches that submodule",
      // the BARE PLURAL object — the determiner may be absent
      "run ./charly/bin/charly task verify whenever the diff touches submodules",
      // the SWEEP over the repos the umbrella HOLDS — the OBJECT decides, not the
      // binder: the umbrella holds every org repo, so "every repo of the umbrella" is
      // the ORG's repos and the sweep over them is org-wide. The org's own rulebook
      // calls the umbrella's own wave over exactly those pins "an ORG-WIDE cutover,
      // not a way to move one pin: it advances EVERY pin the repo declares"
      // (AGENTS.md, Part II #3), so a claim that names the umbrella's command over
      // that set is false in every repo but one — the retired rule in a bound-looking
      // dress. The second is its SIBLING: the same sweep with the other determiner
      "in every repo of the umbrella, run ./charly/bin/charly task verify whenever the diff touches a submodule",
      "in each repo of the umbrella, run ./charly/bin/charly task verify whenever the diff touches a submodule",
    ],
    counterInstances: [
      // TRUE: the gate is the REPO's own, and the rule says whose
      "a diff that touches a submodule, a gitlink, or a pin: that repo's own pin gate",
      // TRUE: the same rule, qualified — the scope phrase carries the claim, and this
      // one MATCHES the trigger, so it exercises the scope guard itself
      "run the repo's own gate whenever the diff touches a submodule",
      // TRUE: the same rule, scoped BY PLACE, and naming the umbrella's own command —
      // so the scope guard is exercised on the shape the retired wording had
      "in the umbrella, run ./charly/bin/charly task verify whenever the diff touches a submodule",
      // TRUE: the same rule, scoped by the NOUN — the umbrella's own pin gate, for the
      // umbrella's own diffs
      "the umbrella's own pin gate applies to any diff that touches a submodule",
      // TRUE: the sweep is BOUND to the umbrella's own CLONES, so the rule is not
      // org-wide and the marker must not fire on it. This is the false positive
      // opencharly/opencharly#777 introduced, and the sibling below is its OTHER
      // determiner — the swept object is a COPY, which is what a binder ties back to
      // one repo
      "in each clone of the umbrella, run ./charly/bin/charly task verify whenever the diff touches a submodule",
      "in every clone of the umbrella, run ./charly/bin/charly task verify whenever the diff touches a submodule",
      // TRUE: the condition is NEGATED, so the pin is not touched and the class's rule
      // does not apply. The umbrella's own tree says exactly this
      "the diff touches no pin",
      "the diff touches neither a submodule nor a pin",
      // TRUE: the DIRECTNESS — a qualifier stands between the determiner and the
      // pin-class noun, so the noun is not the verb's direct object
      "the diff touches a commit-carried pin",
      // TRUE: a LIST of inputs, not a pin-class input
      "the diff touches one of the pin contract's commit-carried inputs",
    ],
    why: "the retired ORG-WIDE rule that named the UMBRELLA's gate as the gate for any diff that touches a submodule, a gitlink or a pin, with no repo scope (opencharly/opencharly#648)",
  },
  {
    // THE CLASS, TWIN: the same defect in the imperative voice — a rule that tells
    // EVERY repo to run the UMBRELLA's command. The clone-level hook is the umbrella's
    // own: a member repo has no `hooks/` and no such task, and the command it names is
    // the umbrella's. Same discriminator, same scope guard, and the same rule about
    // shapes: the trigger is the INSTALL IMPERATIVE over the clone-level hook, in
    // either order — the imperative that installs it, or the hook that is installed.
    pattern:
      "(?:^|\\n)" + STATED_SCOPE +
      "[^\\n]*?(?:\\binstall(?:s|ed|ing)?\\s+(?:the|a|an|this|that|your)?\\s*clone[ -]level hook\\b" +
      "|\\bclone[ -]level hook\\b[^\\n]{0,40}?\\binstall(?:s|ed|ing)?\\b)",
    instances: [
      // the retired Hooks-doctrine sentence
      "Install the clone-level hook once with `./charly/bin/charly task hooks`",
      // the SAME class without the hyphen
      "Install the clone level hook once with `./charly/bin/charly task hooks`",
      // the SAME class in the PASSIVE — the hook is what is installed
      "the clone-level hook is installed with `./charly/bin/charly task hooks`",
      // the ORG-WIDE form — a sweep with NO binder, so the marker fires and the claim
      // is the retired rule. This is the wording the binder fix could have broken
      "Install the clone-level hook in every clone of the org",
    ],
    counterInstances: [
      // TRUE: the hook is scoped to the umbrella's own clone
      "The clone-level hook is the umbrella's own: install it once, in a clone of the umbrella, with `./charly/bin/charly task hooks`.",
      // TRUE: the sweep is BOUND to the umbrella's own clones, so it is not org-wide
      // and the marker must not fire on it
      "The clone-level hook is the umbrella's own: install it once, in each clone of the umbrella, with `./charly/bin/charly task hooks`.",
      // TRUE: the same rule, qualified — and this one MATCHES the trigger, so it
      // exercises the scope guard itself
      "the repo's own rule: install the clone-level hook once per clone",
      // TRUE: the same rule, scoped BY PLACE, and naming the umbrella's own command —
      // so the scope guard is exercised on the shape the retired wording had
      "in the umbrella, install the clone-level hook once with `./charly/bin/charly task hooks`",
    ],
    why: "the retired ORG-WIDE imperative that told EVERY repo to install the UMBRELLA's clone-level hook, with no repo scope (opencharly/opencharly#648)",
  },
];

const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  process.exitCode = 1;
};
const ok = (m) => console.log(`  PASS  ${m}`);

/**
 * The tracked REGULAR files of a tree — derived from the INDEX, never hand-kept.
 *
 *   - a gitlink (mode 160000) is another repo's content, and is skipped;
 *   - a symlink (mode 120000) is skipped too: every tracked symlink in this umbrella
 *     points into `marketplace/`, another repo, whose prose is not the umbrella's claim
 *     to judge (SCOPE, above).
 */
function trackedFiles(rootDir) {
  const raw = gitOut(["ls-files", "-s", "-z"], { cwd: rootDir, encoding: "utf8" });
  const out = [];
  for (const rec of raw.split("\0")) {
    if (!rec) continue;
    const tab = rec.indexOf("\t");
    if (tab === -1) continue;
    const mode = rec.slice(0, tab).split(" ")[0];
    if (mode === "160000" || mode === "120000") continue;
    out.push(rec.slice(tab + 1));
  }
  return out;
}

/** A file's WORKING-TREE text, or null when it is unreadable or binary. */
function readText(abs) {
  let buf;
  try {
    buf = readFileSync(abs);
  } catch {
    return null;
  }
  if (buf.includes(0)) return null; // binary
  return buf.toString("utf8");
}

// A comment marker, at the START of a line, in a code file. The set is the markers the
// languages in this tree actually use: `//` (JS/TS), `#` (shell, YAML, Python), `*`
// (a C-style block comment's continuation) and `<!--` (HTML). `;` is NOT one of them:
// a shell `case` arm's `;;` is code, and reading it as a comment would join it to the
// comment above it.
const CODE_COMMENT = /^\s*(?:\/\/|#|\*|<!--)/;
// A markdown block start: a heading, a list item, a table row, a quote or a fence.
const MD_BLOCK_START = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~)/;
// The block starts whose own TEXT is a claim, and the one whose text is not.
//
// A block start is a BOUNDARY — a claim cannot straddle two blocks — and it is NEVER an
// EXCLUSION: the block's text is what a reader sees, and the umbrella's own rulebook is
// written as LIST ITEMS, so a scan that cannot see a list item cannot see the rulebook.
// The one text that is not a claim is a FENCE MARKER: the marker is syntax, and the
// block's CONTENT is the prose it wraps.
const MD_FENCE = /^\s*(?:```|~~~)/;
const MD_QUOTE = /^\s*>/;
const MD_LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
// A code line that CONTINUES the previous one — the only code lines the stream joins.
const CODE_CONTINUES = /(?:\\|&&|\|\||\+|,|\()\s*$/;

/** Does this text END a sentence? Then the next line is a new sentence, not a wrap. */
function endsSentence(text) {
  const t = text.replace(/[)"'\]’”*`]+$/u, "").trimEnd();
  return t.length > 0 && /[.!?]$/u.test(t);
}

/** The CLAIM a markdown block start carries: its text, with the block marker stripped. */
function mdClaimText(raw) {
  const t = raw.trim();
  if (/^#{1,6}\s+/.test(t)) return t.replace(/^#{1,6}\s+/, "").trim();
  if (MD_LIST_ITEM.test(t)) return t.replace(MD_LIST_ITEM, "").trim();
  if (MD_QUOTE.test(t)) return t.replace(/^>\s?/, "").trim();
  if (/^\|/.test(t)) return t.replace(/^\|/, "").trim();
  return t;
}

/** The column a markdown line's text starts at. */
function mdIndent(raw) {
  return raw.match(/^\s*/)[0].length;
}

/** The column a list item's text starts at — where its CONTINUATION lines are indented. */
function mdContentCol(raw) {
  const marker = raw.trim().match(MD_LIST_ITEM);
  return mdIndent(raw) + (marker ? marker[0].length : 0);
}

/**
 * The CLAIM STREAM of a file: the text a reader SEES, with the line breaks a claim
 * wraps across taken out, and the line breaks a claim is BROKEN at put back.
 *
 *   - a comment marker is stripped, so `# an edge ...` and `an edge ...` are one claim;
 *   - a line that does not END a sentence is joined to the next one with a space,
 *     because a wrap continues the sentence;
 *   - a line that DOES end a sentence, a blank line, a new markdown block, and a
 *     comment/code boundary are hard boundaries, so no pattern can straddle a sentence
 *     or a block;
 *   - in a code file, two CODE lines join only when the first ends with a continuation
 *     operator, so a statement boundary is never mistaken for a wrap.
 *   - in a MARKDOWN file, a block start is a boundary AND a claim: the block's own text
 *     enters the stream, and the marker that made it a block is stripped, because the
 *     marker is syntax and the text is what a reader sees. A list item CONTINUES on the
 *     lines indented to its content column — those lines are the same claim — and a
 *     quote continues on the next quote line. A fence marker enters no stream at all:
 *     it is a marker, and the block's CONTENT is the prose it wraps.
 */
function claimStream(text, isMarkdown) {
  const lines = text.split("\n");
  const segs = []; // {text, line} — the text, and the source line it came from
  let prevKind = null;
  let prevBody = "";
  // The content column a list item's CONTINUATION lines are indented to, or null. A
  // claim that WRAPS inside a list item is one claim, so those lines join it.
  let contCol = null;
  // The previous markdown line was a QUOTE, so the next quote line CONTINUES it.
  let prevQuote = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") {
      segs.push({ text: "\n", line: i + 1 });
      prevKind = null;
      prevBody = "";
      contCol = null;
      prevQuote = false;
      continue;
    }
    let kind;
    let body;
    if (isMarkdown) {
      if (MD_BLOCK_START.test(raw)) {
        if (MD_FENCE.test(raw)) {
          // A fence marker is SYNTAX: it enters no stream, and the block's content is
          // the prose it wraps.
          segs.push({ text: "\n", line: i + 1 });
          prevKind = null;
          prevBody = "";
          contCol = null;
          prevQuote = false;
          continue;
        }
        const claim = mdClaimText(raw);
        if (MD_QUOTE.test(raw) && prevQuote) {
          // A quote's next line CONTINUES the quote: one claim, joined.
          segs.push({ text: " ", line: i + 1 });
        } else {
          segs.push({ text: "\n", line: i + 1 });
        }
        segs.push({ text: claim, line: i + 1 });
        prevKind = "prose";
        prevBody = claim;
        prevQuote = MD_QUOTE.test(raw);
        contCol = MD_LIST_ITEM.test(raw) ? mdContentCol(raw) : null;
        continue;
      }
      kind = "prose";
      body = raw.trim();
    } else {
      const m = CODE_COMMENT.exec(raw);
      if (m) {
        kind = "comment";
        body = raw.slice(m[0].length).trim();
      } else {
        kind = "code";
        body = raw.trim();
      }
    }
    const joins =
      prevKind === kind &&
      !endsSentence(prevBody) &&
      (kind !== "code" || CODE_CONTINUES.test(prevBody)) &&
      // Inside a list item, only the lines indented to its content column CONTINUE it.
      (contCol === null || mdIndent(raw) >= contCol);
    segs.push({ text: joins ? " " : "\n", line: i + 1 });
    segs.push({ text: body, line: i + 1 });
    if (!joins) {
      contCol = null;
      prevQuote = false;
    }
    prevKind = kind;
    prevBody = body;
  }
  let stream = "";
  const starts = []; // the offset at which each segment begins
  for (const s of segs) {
    starts.push(stream.length);
    stream += s.text;
  }
  return { stream, lineAt: (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return segs[lo].line;
  } };
}

/**
 * The scan: every retired claim class, in the tracked tree.
 *
 * Two paths are excluded, and both are exclusions of a DIRECTORY or a FILE, not of a
 * claim:
 *   - `CHANGELOG/` — a past release's gate output is HISTORY, not a current claim.
 *   - THIS FILE — the patterns and their instances live here, so they are IN the tracked
 *     tree by construction. A gate that found itself would be a gate that can never be
 *     green, and the self-test proves every instance is effective against a COPY of a
 *     tracked file, so nothing is lost by excluding the carrier.
 */
function scan(dir) {
  const hits = [];
  for (const rel of trackedFiles(dir)) {
    if (rel === SELF_REL || rel.startsWith("CHANGELOG/")) continue;
    const text = readText(join(dir, rel));
    if (text === null) continue;
    const { stream, lineAt } = claimStream(text, /\.md$/i.test(rel));
    for (const { pattern, why } of PATTERNS) {
      const re = new RegExp(pattern, "giu");
      for (const m of stream.matchAll(re)) {
        const line = lineAt(m.index);
        hits.push({ pattern, why, line: `${rel}:${line}: ${m[0].replace(/\s+/g, " ").trim()}` });
      }
    }
  }
  return hits;
}

/* The two carriers the instances are injected into. A claim's SHAPE decides where it
 * can live: a claim that is written in a comment marker is a CODE claim, and a claim
 * written in prose is a claim that can live anywhere. The carriers are COPIES of
 * tracked files, never the real tree (R6). */
const CARRIERS = [
  { rel: "README.md", code: false },
  { rel: "scripts/init-submodules.sh", code: true },
];

/** Is every line of this instance a comment line? Then it is a CODE-shaped claim. */
function isCodeShape(instance) {
  const lines = instance.split("\n").filter((l) => l.trim() !== "");
  return lines.length > 0 && lines.every((l) => CODE_COMMENT.test(l));
}

/** A fresh git repo carrying a COPY of each carrier, for the self-test. */
function fixture(scratch) {
  const dir = join(scratch, "repo");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const git = (...a) => spawnSync("git", a, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "gate@gate");
  git("config", "user.name", "gate");
  for (const c of CARRIERS) {
    const dest = join(dir, c.rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(root, c.rel), dest);
  }
  git("add", "-A");
  git("commit", "-qm", "carrier");
  return { dir, git };
}

/** Inject an instance into ONE carrier and scan the fixture. */
function injectAndScan(scratch, carrierRel, instance, prefix = "") {
  const { dir, git } = fixture(scratch);
  const dest = join(dir, carrierRel);
  writeFileSync(dest, `${readFileSync(dest, "utf8")}\n${prefix}${instance}\n`);
  git("add", "-A");
  git("commit", "-qm", "injected");
  return scan(dir);
}

function selfTest() {
  const scratch = mkdtempSync(join(tmpdir(), "check-retired-claims-"));
  try {
    // The claim has to be able to FAIL: the real tree must be clean FIRST, or an
    // instance that matches nothing here would look effective for the wrong reason.
    const live = scan(root);
    if (live.length) {
      fail(`the umbrella's own tracked tree still carries a retired claim form: ${live.map((h) => h.line).join("; ")}`);
      return;
    }
    ok(`the umbrella's own tracked tree carries none of the ${PATTERNS.length} retired claim class(es)`);

    // The fixture must be clean before anything is injected, or an instance that
    // matches nothing here would look effective for the wrong reason.
    {
      const { dir } = fixture(scratch);
      const clean = scan(dir);
      if (clean.length) {
        fail(`the fixture is not clean before the injection (${clean.length} hit(s)) — the instance test would prove nothing`);
        return;
      }
    }

    // Every instance must be EFFECTIVE: injected into a copy of a tracked file, it turns
    // the scan RED. The copy is never the real tree (R6).
    const carrier = join(root, "README.md");
    let checked = 0;
    for (const { pattern, instances, why } of PATTERNS) {
      for (const instance of instances) {
        const code = isCodeShape(instance);
        // A comment-shaped claim lives in a CODE file; a prose claim lives anywhere.
        const mustCatch = code ? CARRIERS.filter((c) => c.code) : CARRIERS;
        const mustStayClean = code ? CARRIERS.filter((c) => !c.code) : [];
        for (const c of mustCatch) {
          const hits = injectAndScan(scratch, c.rel, instance);
          const caught = hits.some((h) => h.pattern === pattern);
          if (!caught) {
            fail(`the pattern is INEFFECTIVE — the instance was not caught in ${c.rel}: ${instance} (${why})`);
            return;
          }
          ok(`the pattern is effective: the instance turns the scan RED in ${c.rel} (${instance.slice(0, 52).replace(/\n/g, "⏎")}${instance.length > 52 ? "…" : ""})`);
        }
        // And a comment-shaped claim is a COMMENT: in a markdown file the same marker
        // is a HEADING, which makes no claim at all, and the scan must stay GREEN.
        for (const c of mustStayClean) {
          const hits = injectAndScan(scratch, c.rel, instance);
          if (hits.some((h) => h.pattern === pattern)) {
            fail(`the pattern is INEFFECTIVE about SHAPE — a comment-shaped claim was read as prose in ${c.rel}: ${instance}`);
            return;
          }
          ok(`the pattern reads the shape: the comment-shaped instance stays GREEN in ${c.rel} (a markdown heading is not a comment, and a claim cannot straddle two of them)`);
        }
        checked += 1;
      }
    }

    // Every CLASS must also be effective in the LIST shape: a claim a reader sees in a
    // markdown list item is a claim, and the umbrella's own rulebook is written as list
    // items — so a scan that cannot see a list item cannot see the rulebook. This case
    // is what makes the shape a PROVEN thing: without it, the list shape is an
    // assumption the scan never tests, and a claim in a list item is invisible.
    let shaped = 0;
    for (const { pattern, instances, why } of PATTERNS) {
      const instance = instances.find((x) => !isCodeShape(x));
      if (instance === undefined) continue;
      const hits = injectAndScan(scratch, "README.md", instance, "- ");
      if (!hits.some((h) => h.pattern === pattern)) {
        fail(
          `the pattern is INEFFECTIVE in the LIST shape — the instance was not caught in a markdown list item: ${instance} (${why})`,
        );
        return;
      }
      ok(
        `the pattern is effective in the LIST shape: the instance turns the scan RED in README.md (- ${instance.slice(0, 46).replace(/\n/g, "⏎")}${instance.length > 46 ? "…" : ""})`,
      );
      shaped += 1;
    }

    // Every counter-instance must be SOUND: injected the same way, it leaves the scan
    // GREEN. A pattern that cries wolf is a gate that gets switched off.
    let sounded = 0;
    for (const { pattern, counterInstances, why } of PATTERNS) {
      for (const instance of counterInstances) {
        for (const c of CARRIERS) {
          const hits = injectAndScan(scratch, c.rel, instance);
          if (hits.some((h) => h.pattern === pattern)) {
            fail(`the pattern is UNSOUND — a qualified, TRUE wording was caught in ${c.rel}: ${instance} (${why})`);
            return;
          }
        }
        ok(`the pattern is sound: the qualified wording leaves the scan GREEN (${instance.slice(0, 52).replace(/\n/g, "⏎")}${instance.length > 52 ? "…" : ""})`);
        sounded += 1;
      }
    }
    console.log(
      `check-retired-claims --self-test: OK (${checked} instance(s) and ${sounded} counter-instance(s) across ${PATTERNS.length} pattern(s), and ${shaped} list-shape case(s))`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (argv.includes("--self-test")) {
  selfTest();
} else {
  let hits;
  try {
    hits = scan(root);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    hits = [];
  }
  if (hits.length) {
    for (const h of hits) fail(`a retired claim form survives: ${h.line} — ${h.why}`);
    fail(`${hits.length} retired claim form(s) survive in the umbrella's own tracked tree`);
  } else {
    ok(`no retired claim form survives in the umbrella's own tracked tree (${PATTERNS.length} class(es))`);
  }
}
