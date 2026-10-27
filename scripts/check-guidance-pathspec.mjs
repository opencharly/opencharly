#!/usr/bin/env node
// check-guidance-pathspec.mjs — every path argument in the umbrella's OWN guidance is
// written in the LITERAL pathspec form, so a path that git may REINTERPRET cannot change
// which records a command selects.
//
// WHY THIS EXISTS (opencharly/opencharly#751): a path argument is a PATHSPEC, not a path.
// Git may reinterpret it: `*`, `?` and `[` make it match SEVERAL paths, and a leading `:`
// makes it match NOTHING — and both do it SILENTLY, with exit 0. The umbrella's guidance
// taught the bare form at EIGHTEEN sites (MEASURED on the pre-change tree: 19 path
// arguments over 5 files — the issue's group A enumerated seven of them by hand), so a
// reader following it verbatim can be told the WRONG thing about a submodule's pin.
//
// MEASURED (git 2.56.0; a fixture whose declared paths are `a*b`, its sibling `a!b` and a
// third `:colonpath`, with `a*b` and `a!b` pinned at DIFFERENT commits):
//   git ls-files -s -- 'a*b'          → TWO records — the SIBLING's SHA beside the intended one
//   git ls-files -s -- ':colonpath'   → NOTHING, exit 0
//   git submodule status -- 'a*b'     → TWO submodules
//   git submodule status -- ':colonpath' → exit 1, "pathspec did not match any file(s) known to git"
//   git ls-tree HEAD -- ':colonpath'  → NOTHING, exit 0
// and in the LITERAL form (`':(literal)…'`) each returned exactly the ONE intended record.
//
// THE MISSED CONTROL (the issue's own words): "no gate ASSERTS that a path argument
// carries `:(literal)`". The correct spelling was already in the repository
// (`scripts/init-submodules.sh`'s `pathspec_for`, since opencharly/opencharly#740) — what
// was missing was a control that notices a READER added without it. The PRODUCT side has
// one (that script's `--self-test`, claims 24/25); the GUIDANCE side had none, and the
// guidance is what an agent copies.
//
// WHAT IS ASSERTED (--self-test must see each one go RED):
//   A — the SCAN: over the covered guidance, every path argument of a covered git command
//       that is a PLACEHOLDER (`<…>`) or a VARIABLE (`$…`) is written in the literal form.
//   B — the LIVE ARM: against a hermetic fixture, the literal form returns exactly the ONE
//       intended record and leaves the sibling alone — for a GLOB-named path and for a
//       COLON-named path — and the BARE form does NOT (so the arm can fail).
//   C — the EXCLUSIONS are REPORTED, never silently skipped: the covered surface's
//       exclusions (the generated corpus, the history, the pi harness) are named on every
//       run, because a gate that hides what it does not cover is a gate whose coverage
//       nobody can judge.
//
// THE CLASS IS A RULE, NOT A SITE LIST (opencharly/opencharly#751): the issue enumerated
// seven sites by hand and missed an eighth, and the whole point of the control is that the
// NEXT reader is caught without a sweep. So the gate scans the covered surface with a
// per-command GRAMMAR (below) — the grammar of git's own commands, which is a property of
// git and not a list of sites — and the rule it enforces is the one the guidance states
// once, in the `git-workflow` skill's non-negotiable invariants.
//
// THE RCA OF THE FIRST VERSION OF THIS GATE (measured 2026-10-27, kept because the shape
// can recur in any gate that reads prose): the first version reported GREEN over a tree
// that carried the very defects it exists to catch, and it found only 14 of the 19
// path arguments. Two false-negative mechanisms, both in the EXTRACTOR, not in the rule:
//   1 — the code spans were paired by a REGEX that required a backtick-free content and an
//       IDENTICAL closing run, so ONE unbalanced backtick desynchronized every later pair
//       in the same prose segment. The file `.agents/skills/git-workflow/SKILL.md` carries
//       the code span `Closes \`<owner>/<repo>#N\`` (an ESCAPED backtick inside code), and
//       after it the extractor returned PROSE where code was — the `git rm <path>` and
//       `git add <new>` sites were never scanned at all.
//   2 — a command that WRAPS across lines was split at the newline, so `git\nls-files -s
//       <path>` became two fragments, NEITHER of which parsed as a git command.
// The root fix is in the extractor (CommonMark's pairing, a RECURSION into a span that
// itself contains runs, and a newline that is not a separator) and in the SELF-TEST, which
// now carries an instance for each mechanism — so the control can fail on them.
//
// A KNOWN LIMIT, STATED RATHER THAN HIDDEN: for `git diff`, `git grep`, `git checkout` and
// `git restore`, a path argument is recognised only AFTER a `--` separator, because before
// it the same argument is a REV (a diff), a PATTERN (a grep) or a REF (a checkout) — and
// requiring a REV to carry `:(literal)` would BREAK it. The rule therefore requires the
// separator, and the guidance follows it. `git ls-tree`, `git ls-files`, `git add`,
// `git rm`, `git mv`, `git clean`, `git stash`, `git archive` and `git submodule
// status|update` are unambiguous and are checked in every position.
//
// `git grep`'s PATTERN is the first POSITIONAL, wherever it stands: MEASURED (git 2.56.0),
// `git grep -- hello` searches for the PATTERN "hello", and `git grep -- 'f.txt'` matches
// nothing and exits 1 — it never read "f.txt" as a path. So a path after a `--` separator
// is a path only when a pattern was given BEFORE it.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);
const SELF_REL = "scripts/check-guidance-pathspec.mjs";

const fail = (m) => {
  console.log(`  FAIL  ${m}`);
  process.exitCode = 1;
};
const ok = (m) => console.log(`  PASS  ${m}`);

// The covered surface. Every exclusion is NAMED, and every run reports it: a skipped
// path that is not named is a gap nobody can see.
const EXCLUSIONS = [
  { prefix: "CHANGELOG/", why: "history — generated from merged PR bodies, never edited" },
  { prefix: "marketplace/", why: "the GENERATED corpus projection — the umbrella's .agents/ is its source (leg 2 of #751 regenerates it)" },
  { prefix: "action-review/", why: "the live validator prompt, not the umbrella's guidance" },
  { prefix: ".pi/", why: "the pi harness's own guidance — group B of #751, pending the operator's maintainer-account sign-off" },
];

// git's grammar, per command: where the PATH arguments are.
//   skip: N     — the first N non-flag arguments are REVS; the rest are paths
//   afterSep    — the path arguments are those after a `--` separator
// `sub` names a git subcommand whose own subcommand selects the grammar.
const PATH_ARG_RULES = {
  "ls-tree": { skip: 1 },
  "ls-files": { skip: 0 },
  add: { skip: 0 },
  rm: { skip: 0 },
  mv: { skip: 0 },
  clean: { skip: 0 },
  stash: { skip: 0 },
  archive: { skip: 1 },
  grep: { afterSep: true, firstIsPattern: true },
  diff: { afterSep: true },
  checkout: { afterSep: true },
  restore: { afterSep: true },
  "submodule status": { skip: 0 },
  "submodule update": { skip: 0 },
};

// git's GLOBAL options, which precede the subcommand. `-C <dir>` and `-c <k=v>` take a
// value; `--literal-pathspecs` makes every path argument literal by construction, so a
// command carrying it is exempt.
const GLOBAL_FLAGS = new Set([
  "--no-pager",
  "--paginate",
  "--bare",
  "--literal-pathspecs",
  "--no-replace-objects",
  "--no-lazy-fetch",
  "-p",
]);
const GLOBAL_VALUE_OPTS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

const isPlaceholderish = (text) => text.includes("<") || text.includes("$");
const isLiteral = (text) => text.startsWith(":(literal)");

// A shell-ish tokenizer: whitespace separates, quotes keep their characters so the
// literal form stays visible.
function tokenize(s) {
  const out = [];
  let cur = "";
  let quote = null;
  for (const c of s) {
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

// The EFFECTIVE text of a token: the shell's own expansion of it, with the quote
// characters removed. `':(literal)'"$s"` expands to `:(literal)$s`.
function unquote(tok) {
  let out = "";
  let i = 0;
  while (i < tok.length) {
    const c = tok[i];
    if (c === "'" || c === '"') {
      const j = tok.indexOf(c, i + 1);
      if (j === -1) {
        out += tok.slice(i + 1);
        break;
      }
      out += tok.slice(i + 1, j);
      i = j + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// The units of a file: a fenced code block's LINES, and the inline code spans of the
// prose. A span may WRAP across lines — the guidance's own commands do — so the span is
// the unit, not the line.
//
// THE SPANS ARE PAIRED BY COMMONMARK'S RULE, NOT BY A REGEX (measured 2026-10-27, after
// the first version of this gate reported GREEN over a tree that carried the very defects
// it exists to catch). A run of N backticks opens a span and the next run of EXACTLY N
// closes it; a run of any other length is literal content. The regex this replaced
// required a backtick-free content and an IDENTICAL closing run, so ONE unbalanced
// backtick desynchronized every later pair in the same prose segment: the file
// `.agents/skills/git-workflow/SKILL.md` carries the code span
// `Closes \`<owner>/<repo>#N\`` (an ESCAPED backtick inside code), and after it the
// extractor returned PROSE where code was, so the `git rm <path>` and `git add <new>`
// sites were never scanned at all. Two more rules close the remaining holes:
//   - a span that ITSELF contains backtick runs is a CONTAINER, and the extractor RECURSES
//     into it — the inner runs are what the author marked as code, and without the
//     recursion the container swallows the region it hides;
//   - a command that WRAPS across lines is ONE command, so a span's newlines are joined
//     before it is split into shell pieces (the split used to cut `git\nls-files -s
//     <path>` into two fragments, neither of which parsed as a git command).
function backtickRuns(text) {
  const runs = [];
  const re = /`+/g;
  let m;
  while ((m = re.exec(text)) !== null) runs.push({ len: m[0].length, start: m.index, end: m.index + m[0].length });
  return runs;
}

function countNewlines(text) {
  return (text.match(/\n/g) || []).length;
}

// The spans of a text, by CommonMark's rule, RECURSING into a container span.
function spanUnits(text, lineBase, depth, out) {
  if (depth > 4) return;
  const runs = backtickRuns(text);
  let i = 0;
  while (i < runs.length) {
    const n = runs[i].len;
    let j = i + 1;
    while (j < runs.length && runs[j].len !== n) j++;
    if (j === runs.length) {
      // An opener with no closer is literal text, and the scan continues past it.
      i += 1;
      continue;
    }
    const content = text.slice(runs[i].end, runs[j].start);
    const openLine = lineBase + countNewlines(text.slice(0, runs[i].start));
    if (content.includes("`")) {
      const innerBase = lineBase + countNewlines(text.slice(0, runs[i].end));
      spanUnits(content, innerBase, depth + 1, out);
    } else {
      out.push({ text: content, line: openLine });
    }
    i = j + 1;
  }
}

function unitsOf(text) {
  const lines = text.split("\n");
  const units = [];
  let inFence = false;
  let fenceMark = null;
  let prose = [];
  let proseStart = 1;
  let code = [];
  let codeStart = 1;

  const flushProse = () => {
    if (!prose.length) return;
    spanUnits(prose.join("\n"), proseStart, 0, units);
    prose = [];
  };

  const flushCode = () => {
    // A fence line ending in `\` continues onto the next — the shell's own rule, so a
    // command that wraps inside a fence stays ONE command.
    let pending = "";
    let pendingLine = 0;
    for (let k = 0; k < code.length; k++) {
      const line = code[k];
      const ln = codeStart + k;
      if (/\\\s*$/.test(line)) {
        if (!pending) pendingLine = ln;
        pending += `${line.replace(/\\\s*$/, " ")}`;
        continue;
      }
      units.push({ text: pending + line, line: pending ? pendingLine : ln });
      pending = "";
    }
    if (pending) units.push({ text: pending, line: pendingLine });
    code = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      if (!inFence) {
        flushProse();
        inFence = true;
        fenceMark = fence[1][0];
        code = [];
        codeStart = i + 2;
        continue;
      }
      if (fence[1][0] === fenceMark) {
        inFence = false;
        fenceMark = null;
        flushCode();
        continue;
      }
    }
    if (inFence) {
      code.push(line);
      continue;
    }
    if (!prose.length) proseStart = i + 1;
    prose.push(line);
  }
  flushProse();
  if (inFence) flushCode();
  return units;
}

// One unit's shell commands: split at the separators, so `git add <p>; git commit` is two
// commands and a `$(git …)` sub-shell is one. A NEWLINE is not a separator: a command that
// wraps across lines is ONE command, and splitting it would hide its path argument.
function piecesOf(text) {
  return text
    .replace(/\n/g, " ")
    .split(/;|&&|\|\||\||\$\(/)
    .map((p) => p.replace(/^[\s(){}]+/, "").replace(/[\s)]+$/, ""))
    .filter((p) => p.trim().length > 0);
}

// Parse a git command: the subcommand, its key, and its path arguments.
function parseGit(piece) {
  const tokens = tokenize(piece);
  if (tokens.length === 0 || tokens[0] !== "git") return null;
  let i = 1;
  let literalByFlag = false;
  while (i < tokens.length) {
    const t = tokens[i];
    if (GLOBAL_VALUE_OPTS.has(t)) {
      i += 2;
      continue;
    }
    if (GLOBAL_FLAGS.has(t)) {
      if (t === "--literal-pathspecs") literalByFlag = true;
      i += 1;
      continue;
    }
    if (/^--(git-dir|work-tree|namespace|exec-path)=/.test(t)) {
      i += 1;
      continue;
    }
    break;
  }
  const sub = tokens[i];
  if (!sub || sub.startsWith("-")) return null;
  i += 1;
  let key = sub;
  if (sub === "submodule") {
    const subsub = tokens[i];
    if (!subsub || subsub.startsWith("-")) return null;
    key = `submodule ${subsub}`;
    i += 1;
  }
  const rule = PATH_ARG_RULES[key];
  if (!rule) return null;
  const rest = tokens.slice(i);
  const isFlag = (t) => t.startsWith("-") && t !== "--";
  const nonFlag = rest.filter((t) => !isFlag(t));
  let pathArgs;
  if (rule.afterSep) {
    const sep = rest.indexOf("--");
    const before = sep === -1 ? rest : rest.slice(0, sep);
    const after = sep === -1 ? [] : rest.slice(sep + 1);
    pathArgs = after.filter((t) => !isFlag(t));
    // git's grammar: the PATTERN is the first POSITIONAL. Given before the separator it
    // stays there; given after it, the first positional after it IS the pattern.
    // MEASURED (git 2.56.0): `git grep -- hello` searches for the PATTERN "hello", and
    // `git grep -- 'f.txt'` matches nothing and exits 1 — it never read "f.txt" as a path.
    const patternBefore = before.some((t) => !isFlag(t));
    if (rule.firstIsPattern && !patternBefore && pathArgs.length) {
      pathArgs = pathArgs.slice(1);
    }
  } else {
    pathArgs = nonFlag.slice(rule.skip || 0);
  }
  return { key, pathArgs, literalByFlag };
}

// The SCAN (arm A). Returns one finding per path argument that is a placeholder or a
// variable and is NOT in the literal form.
function scanText(rel, text) {
  const findings = [];
  for (const unit of unitsOf(text)) {
    for (const piece of piecesOf(unit.text)) {
      const parsed = parseGit(piece);
      if (!parsed || parsed.literalByFlag) continue;
      for (const arg of parsed.pathArgs) {
        const eff = unquote(arg);
        if (!isPlaceholderish(eff)) continue;
        if (isLiteral(eff)) continue;
        findings.push({ rel, line: unit.line, key: parsed.key, arg, eff });
      }
    }
  }
  return findings;
}

// The umbrella's tracked files, as the house gate derives them: `git ls-files -s -z`,
// skipping the gitlinks (160000) and the symlinks (120000).
function trackedFiles(dir) {
  const out = execFileSync("git", ["ls-files", "-s", "-z"], { cwd: dir, maxBuffer: 1 << 28 })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const files = [];
  for (const rec of out) {
    const tab = rec.indexOf("\t");
    const meta = rec.slice(0, tab);
    const path = rec.slice(tab + 1);
    const mode = meta.split(" ")[0];
    if (mode === "160000" || mode === "120000") continue;
    files.push(path);
  }
  return files;
}

const isExcluded = (rel) => EXCLUSIONS.find((e) => rel.startsWith(e.prefix));

// The covered surface: the tracked markdown, minus the declared exclusions.
function coveredSurface(dir) {
  const files = trackedFiles(dir).filter((f) => f.endsWith(".md") && !isExcluded(f));
  const excluded = trackedFiles(dir).filter((f) => f.endsWith(".md") && isExcluded(f));
  return { files, excluded };
}

// The LIVE ARM (arm B). A hermetic fixture: a superproject whose declared submodule paths
// are `a*b`, its sibling `a!b` and `:colonpath`, with the two siblings pinned at
// DIFFERENT commits so the reader's answer identifies WHICH record it returned.
function liveArm() {
  const tmp = mkdtempSync(join(tmpdir(), "charly-pathspec-"));
  const problems = [];
  const note = (m) => problems.push(m);
  try {
    const remote = join(tmp, "remote");
    const superp = join(tmp, "super");
    mkdirSync(remote);
    mkdirSync(superp);
    const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    // Both streams: `git submodule update` reports "not initialized" on STDERR while it
    // exits 0, so a stdout-only reader would see an empty answer and prove nothing.
    const gitRaw = (cwd, args) => {
      const r = spawnSync("git", args, { cwd, encoding: "utf8" });
      return { rc: r.status ?? 1, out: `${r.stdout || ""}${r.stderr || ""}` };
    };

    git(remote, ["init", "-q", "-b", "main", "."]);
    git(remote, ["config", "user.email", "gate@example.invalid"]);
    git(remote, ["config", "user.name", "gate"]);
    writeFileSync(join(remote, "f"), "one\n");
    git(remote, ["add", "f"]);
    git(remote, ["commit", "-qm", "one"]);
    const shaA = git(remote, ["rev-parse", "HEAD"]).trim();
    writeFileSync(join(remote, "f"), "two\n");
    git(remote, ["commit", "-qam", "two"]);
    const shaB = git(remote, ["rev-parse", "HEAD"]).trim();

    git(superp, ["init", "-q", "-b", "main", "."]);
    git(superp, ["config", "user.email", "gate@example.invalid"]);
    git(superp, ["config", "user.name", "gate"]);
    writeFileSync(
      join(superp, ".gitmodules"),
      `[submodule "a*b"]\n\tpath = a*b\n\turl = ../remote\n\tbranch = main\n` +
        `[submodule "a!b"]\n\tpath = a!b\n\turl = ../remote\n\tbranch = main\n` +
        `[submodule ":colonpath"]\n\tpath = :colonpath\n\turl = ../remote\n\tbranch = main\n`,
    );
    git(superp, ["update-index", "--add", "--cacheinfo", `160000,${shaA},a*b`]);
    git(superp, ["update-index", "--add", "--cacheinfo", `160000,${shaB},a!b`]);
    git(superp, ["update-index", "--add", "--cacheinfo", `160000,${shaA},:colonpath`]);
    git(superp, ["add", ".gitmodules"]);
    git(superp, ["commit", "-qm", "fixture"]);

    const lines = (out) => out.split("\n").filter((l) => l.trim().length > 0);

    // The LITERAL form: exactly the ONE intended record, and the sibling left alone.
    const lt = gitRaw(superp, ["ls-tree", "HEAD", "--", ":(literal)a*b"]);
    const ltLines = lines(lt.out);
    if (lt.rc !== 0 || ltLines.length !== 1 || !ltLines[0].endsWith("a*b") || !ltLines[0].includes(shaA)) {
      note(`git ls-tree HEAD -- ':(literal)a*b' must return exactly the a*b record (${shaA.slice(0, 8)}) — got ${ltLines.length} line(s): ${JSON.stringify(ltLines)}`);
    }
    const ltColon = gitRaw(superp, ["ls-tree", "HEAD", "--", ":(literal):colonpath"]);
    const ltColonLines = lines(ltColon.out);
    if (ltColon.rc !== 0 || ltColonLines.length !== 1 || !ltColonLines[0].endsWith(":colonpath")) {
      note(`git ls-tree HEAD -- ':(literal):colonpath' must return exactly the :colonpath record — got ${ltColonLines.length} line(s): ${JSON.stringify(ltColonLines)}`);
    }
    const lf = gitRaw(superp, ["ls-files", "-s", "--", ":(literal)a*b"]);
    const lfLines = lines(lf.out);
    if (lf.rc !== 0 || lfLines.length !== 1 || !lfLines[0].includes(shaA) || lfLines[0].includes(shaB)) {
      note(`git ls-files -s -- ':(literal)a*b' must return exactly the a*b record (${shaA.slice(0, 8)}), never the sibling's (${shaB.slice(0, 8)}) — got ${JSON.stringify(lfLines)}`);
    }
    const ss = gitRaw(superp, ["submodule", "status", "--", ":(literal)a*b"]);
    const ssLines = lines(ss.out);
    if (ss.rc !== 0 || ssLines.length !== 1 || !ssLines[0].endsWith("a*b")) {
      note(`git submodule status -- ':(literal)a*b' must return exactly the a*b submodule — got ${ssLines.length} line(s): ${JSON.stringify(ssLines)}`);
    }
    const su = gitRaw(superp, ["submodule", "update", "--", ":(literal)a*b"]);
    const suOut = su.out;
    if (su.rc !== 0 || !suOut.includes("a*b") || suOut.includes("a!b")) {
      note(`git submodule update -- ':(literal)a*b' must name ONLY a*b — got ${JSON.stringify(suOut)}`);
    }

    // The BARE form: the counter-examples that make the arm able to FAIL. Each of these
    // is the defect the guidance's bare form carried.
    const bareLsTree = gitRaw(superp, ["ls-tree", "HEAD", "--", ":colonpath"]);
    if (bareLsTree.rc !== 0 || lines(bareLsTree.out).length !== 0) {
      note(`the counter-example changed: git ls-tree HEAD -- ':colonpath' must return NOTHING with exit 0 — got rc=${bareLsTree.rc} ${JSON.stringify(lines(bareLsTree.out))}`);
    }
    const bareLsFiles = gitRaw(superp, ["ls-files", "-s", "--", "a*b"]);
    if (bareLsFiles.rc !== 0 || lines(bareLsFiles.out).length !== 2) {
      note(`the counter-example changed: git ls-files -s -- 'a*b' must return TWO records — got ${JSON.stringify(lines(bareLsFiles.out))}`);
    }
    const bareStatus = gitRaw(superp, ["submodule", "status", "--", "a*b"]);
    if (bareStatus.rc !== 0 || lines(bareStatus.out).length !== 2) {
      note(`the counter-example changed: git submodule status -- 'a*b' must return TWO submodules — got ${JSON.stringify(lines(bareStatus.out))}`);
    }
    const bareStatusColon = gitRaw(superp, ["submodule", "status", "--", ":colonpath"]);
    if (bareStatusColon.rc === 0) {
      note("the counter-example changed: git submodule status -- ':colonpath' must FAIL (pathspec did not match) — it returned exit 0");
    }
    const bareUpdate = gitRaw(superp, ["submodule", "update", "--", "a*b"]);
    if (!bareUpdate.out.includes("a!b")) {
      note(`the counter-example changed: git submodule update -- 'a*b' must name BOTH paths — got ${JSON.stringify(bareUpdate.out)}`);
    }
  } catch (err) {
    note(`the live arm could not run: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return problems;
}

// The SELF-TEST (R7: a test that cannot fail is invalid). Every instance must turn the
// scan RED; every counter-instance must leave it GREEN.
const INSTANCES = [
  { text: "`git ls-tree HEAD <sub>`", why: "the issue's group-A shape: a placeholder in a gitlink read" },
  { text: "`git ls-tree HEAD \"$s\"`", why: "a VARIABLE carrying a .gitmodules path" },
  { text: "`git ls-files -s <path>`", why: "the index read the guidance's own mechanic uses" },
  { text: "`git submodule update <path>`", why: "the site the issue's enumeration missed" },
  { text: "`git add <sub>`", why: "a staged gitlink whose path comes from .gitmodules" },
  { text: "`git rm <path>`", why: "a removed path" },
  { text: "`git diff --cached --submodule=short -- <sub>`", why: "a diff restricted to one gitlink" },
  { text: "`git grep <pattern> -- <path>`", why: "a grep restricted to one path" },
  // The two shapes the FIRST version of this gate could not see, and therefore reported
  // GREEN over: both are now instances, so the control can fail on them.
  {
    text: "so `Closes \\`<owner>/<repo>#N\\`` in a body — `git add <path>` — and ``a double`` pair",
    why: "a code span holding an ESCAPED backtick must not hide the code spans that follow it",
  },
  { text: "`git\nls-files -s <path>`", why: "a command that WRAPS across lines is ONE command" },
];

const COUNTER_INSTANCES = [
  { text: "`git checkout <ref> -- .`", why: "a REF before the separator, and a fixed path after it" },
  { text: "`git switch <ref>`", why: "a REF, not a path" },
  { text: "`git grep '<deleted-id>'`", why: "a PATTERN, not a path" },
  { text: "`git grep -- '<deleted-id>'`", why: "the first positional after the separator is the PATTERN, not a path" },
  { text: "`git diff --name-only <old-main>..main`", why: "a REV RANGE, not a path" },
  { text: "`git -C <sub> checkout <new>`", why: "a DIRECTORY argument and a REV" },
  { text: "`git commit -m \"<conventional commit>\"`", why: "a message, not a path" },
  { text: "`git mv old new`", why: "two names the author has already fixed" },
  { text: "`git submodule update --init charly`", why: "a repository path with no metacharacter" },
  { text: "`git push origin feat/<slug>`", why: "a BRANCH name, not a path" },
  { text: "`git worktree add <path> -b feat/<slug> origin/main`", why: "a new directory, not a pathspec" },
];

function selfTest() {
  const failures = [];
  for (const { text, why } of INSTANCES) {
    const found = scanText("fixture.md", text);
    if (found.length === 0) {
      failures.push(`the scan is INEFFECTIVE — it did not catch: ${text} (${why})`);
      continue;
    }
    ok(`the scan is effective: it turns RED on ${text} (${why})`);
  }
  for (const { text, why } of COUNTER_INSTANCES) {
    const found = scanText("fixture.md", text);
    if (found.length > 0) {
      failures.push(`the scan is UNSOUND — it caught: ${text} (${why}) — ${JSON.stringify(found[0])}`);
      continue;
    }
    ok(`the scan is sound: it leaves GREEN ${text} (${why})`);
  }
  // The live arm must be able to fail: with the bare form asserted instead of the literal
  // one, the arm MUST report a problem.
  const problems = liveArm();
  if (problems.length) {
    failures.push(`the live arm is RED on the literal form — ${problems.join("; ")}`);
  } else {
    ok("the live arm is GREEN on the literal form: each reader returns exactly the ONE intended record");
  }
  if (failures.length) {
    for (const f of failures) fail(f);
    return;
  }
  console.log(
    `check-guidance-pathspec --self-test: OK (${INSTANCES.length} instance(s), ${COUNTER_INSTANCES.length} counter-instance(s), and the live arm)`,
  );
}

if (argv.includes("--self-test")) {
  selfTest();
} else {
  const { files, excluded } = coveredSurface(root);
  const findings = [];
  for (const rel of files) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    findings.push(...scanText(rel, readFileSync(abs, "utf8")));
  }
  for (const f of findings) {
    fail(`${f.rel}:${f.line} — ${f.key} names the path argument \`${f.arg}\`, which git may REINTERPRET: write it in the literal form \`:(literal)<path>\``);
  }
  if (findings.length) {
    fail(`${findings.length} path argument(s) in the umbrella's guidance are not in the literal pathspec form`);
  } else {
    ok(`every path argument in the umbrella's guidance (${files.length} covered file(s)) is in the literal pathspec form`);
  }
  const problems = liveArm();
  for (const p of problems) fail(`the live arm: ${p}`);
  if (!problems.length) {
    ok("the live arm: the literal form returns exactly the ONE intended record for a glob-named and a colon-named path, and the bare form does not");
  }
  const exCount = new Map();
  for (const rel of excluded) {
    const e = isExcluded(rel);
    exCount.set(e.prefix, (exCount.get(e.prefix) || 0) + 1);
  }
  for (const e of EXCLUSIONS) {
    const n = exCount.get(e.prefix) || 0;
    ok(`the covered surface EXCLUDES ${e.prefix} (${n} tracked file(s)) — ${e.why}`);
  }
}
