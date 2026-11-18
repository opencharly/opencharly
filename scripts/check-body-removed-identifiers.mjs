#!/usr/bin/env node
// check-body-removed-identifiers.mjs — the body must not name what the diff deleted.
//
// WHY THIS EXISTS. Twelve review findings across one PR line, and the last four were the same
// defect in four costumes:
//
//   9.  the change table named the caller's function and missed the callee's rename;
//   10. the R7 list named a test that had been renamed;
//   11. R5 claimed a rename sweep that had left two test functions behind;
//   12. R5 pasted a grep saying "no matches" — forty lines above an R7 row containing the name.
//
// `check-pr-body-diff.mjs` reads the body's STRUCTURE against the diff: it catches a missing file,
// a stale hash, a wrong count. It does not read the body's CLAIMS against each other. Neither does
// `pr_body_lint.py`. So a body can pass both and still name an identifier the diff removed.
//
// THE CHECK. Extract every identifier the diff REMOVES — from `-func NAME(`, `-type NAME`, and
// `-const/-var NAME`, plus any `NAME` → `OTHER` rename stated in a `## Files changed` row — then
// grep the body's PROSE (fenced code blocks and the file table blanked) for each one.
//
// A hit is a finding UNLESS the sentence it sits in marks it as historical: the check accepts a
// mention preceded, in the same paragraph, by one of the ACCEPTS markers below. That is not a
// loophole; it is the difference between "`scopedCandySecrets` is gone" (a true statement about a
// removal) and "TestScopedCandySecrets… PASS (kept)" (a false one). The marker is what tells the
// reader which it is, and requiring the marker is the point.
//
// Usage:
//   node scripts/check-body-removed-identifiers.mjs --repo <path> --body <file> --base <ref> [--head <ref>]
//
// Exit 0 clean, 1 with findings.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

// A sentence that mentions a removed identifier must say, in the same paragraph, that it is removed.
const ACCEPTS = [
  "→", // the rename arrow: "`old` → `new`"
  "->",
  "renamed",
  "rename",
  "removed",
  "deleted",
  "gone",
  "was",
  "predecessor",
  "no longer",
  "earlier version",
  "the old",
  "old name",
  "swept",
  "replaced",
];

// Every count below TWELVE is spelled out somewhere in this repo's prose, and the map must
// cover what it can read: 'eleven' was missing and the gate could not see the very count this
// file grew to. A word absent from this map is a stated number the gate silently ignores -- the
// same class as the zero that cannot be distinguished from a search that did not run.
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

// Identifiers too generic to check: a rename of `main` or `err` would fire on every sentence.
const IGNORE = new Set([
  "main", "init", "new", "run", "get", "set", "len", "cap", "nil", "err", "ok", "id",
  "name", "type", "func", "test", "file", "path", "data", "text", "body", "head",
]);

// runCheck(diffText, bodyText) -> findings[], so --self-test can drive the SAME code path.
export function runCheck(diffText, bodyText) {
  const removed = collectRemoved(diffText, bodyText);
  // The FENCE-PURITY arm is independent of the identifier arm: a body can annotate a console fence
  // whether or not the diff removed anything. So the findings are the union, and `inapplicable`
  // reports ONLY that the identifier half had nothing to check.
  const declaredOrder = declaredArmOrder();
  const findings = [
    ...scanProse(removed, bodyText),
    ...scanFences(bodyText),
    ...scanCounts(bodyText),
    ...(hasOutOfOrderSelfTest(bodyText, declaredOrder)
      ? ["a pasted self-test block lists its arms out of the order the script prints them."]
      : []),
  ];
  return { removed, findings, inapplicable: removed.size === 0 };
}

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

// ---- self-test -------------------------------------------------------------------------------
//
// The gate must be shown to DISCRIMINATE: a body carrying a removed identifier with no removal
// marker is RED, the same body with a marker is GREEN, and a body naming only surviving
// identifiers is GREEN. The first version of this gate blanked every fenced block and its own
// plant passed — a gate that cannot catch the finding it was built for is the same defect as a
// test that cannot fail, so this arm exists to keep that from silently recurring.
// buildArms returns the arms in source order. BOTH --self-test and --emit-arms call it, so the table
// a body carries is emitted from the same array the self-test runs -- never transcribed. The previous
// two attempts to derive the table from the source text captured only one of the two declaration
// forms, which is the same narrow-reader bug the review found in declaredOrder.
function buildArms() {
  const DIFF = [
    "--- a/x.go",
    "+++ b/x.go",
    "-func TestScopedCandySecretsEndToEnd(t *testing.T) {",
    "+func TestEnsureBoxChainSecretsEndToEnd(t *testing.T) {",
    "-func scopedCandySecrets(raw map[string]string) string {",
    "+func ensureBoxChainSecrets(raw map[string]string) []string {",
  ].join("\n");

  const arms = [];
  const expect = (label, bodyText, wantFindings) => {
    const { findings } = runCheck(DIFF, bodyText);
    arms.push({ label, ok: (findings.length > 0) === wantFindings, verdict: wantFindings ? "FAIL" : "pass", findings });
  };

  // RED: the exact finding that cost opencharly/plugin-deploy-pod#79 a round — the old test name in
  // a bare fenced list, marked "(kept)", with no removal marker anywhere in the paragraph.
  expect(
    "a removed test name in a bare fence, no marker",
    "```\nTestScopedCandySecretsEndToEnd  PASS  a foreign candy contributes nothing (kept)\n```\n",
    true,
  );

  // GREEN: the same sentence with a removal marker — the true statement about a removal.
  expect(
    "a removed test name WITH a removal marker",
    "`TestScopedCandySecretsEndToEnd` was renamed to `TestEnsureBoxChainSecretsEndToEnd`.\n",
    false,
  );

  // GREEN: only surviving identifiers.
  expect(
    "only surviving identifiers",
    "`TestEnsureBoxChainSecretsEndToEnd` PASS, `ensureBoxChainSecrets` returns names.\n",
    false,
  );

  // RED: a removed identifier in PLAIN prose, outside any fence.
  expect(
    "a removed identifier in plain prose",
    "The helper `scopedCandySecrets` builds the map the writer consumes.\n",
    true,
  );

  // GREEN: inside a pasted COMMAND block ($ first) — `git diff` shows removed names legitimately.
  expect(
    "a removed identifier inside a pasted command",
    "```console\n$ git diff\n-func scopedCandySecrets(\n```\n",
    false,
  );

  // THE FENCE-PURITY ARM. A `console` fence may contain only what a command printed. Twice on
  // opencharly/opencharly#1084 the body pasted output with an ANNOTATION column appended — RED and
  // GREEN words the script never prints — inside a fence that claimed to be the program's own
  // output. `cat -A` was already in the body and showed the annotation was never there, which is
  // how the review found it. So the check now reads every console fence and refuses one whose
  // lines carry a word the command could not have printed: a bare RED or GREEN verdict marker.
  const annotatedFence = "```console\n$ node gate.mjs --self-test\n  ok  arm one            RED\n  ok  arm two            GREEN\n```\n";
  const cleanFence = "```console\n$ node gate.mjs --self-test\n  ok  arm one\n  ok  arm two\n```\n";
  arms.push({
    label: "an annotation column inside a console fence",
    verdict: "FAIL",
    ok: hasAnnotatedFence(annotatedFence) && !hasAnnotatedFence(cleanFence),
    findings: [],
  });

  // THE COUNT ARM. A number the body states about a pasted block must equal what the block holds.
  // Measured on opencharly/opencharly#1084: the body said "Five self-test arms" above an output whose
  // last line read "6/6 arms discriminate" and a six-row table. The evidence was in the same body,
  // beside the claim, and nobody compared them until a review did.
  const fiveBody = "Five self-test arms:\n\n```console\n  ok  a\n  ok  b\n  ok  c\n  ok  d\n  ok  e\n  ok  f\n6/6 arms discriminate\n```\n";
  const sixBody = "Six self-test arms:\n\n```console\n  ok  a\n  ok  b\n  ok  c\n  ok  d\n  ok  e\n  ok  f\n6/6 arms discriminate\n```\n";
  arms.push({
    label: "a stated arm count that contradicts the pasted N/M",
    verdict: "FAIL",
    ok: scanCounts(fiveBody).length > 0 && scanCounts(sixBody).length === 0,
    findings: [],
  });

  // THE LINE-COUNT ARM. "<n>-line `path`" must match `wc -l`. Measured on #1085: the body said "a
  // 267-line Node.js gate" over a file of 358. The path must be backticked, because prose like
  // "Node.js" is not a file claim — the first version matched it and reported `e.js`.
  const lineBody = "A 999-line `scripts/x.mjs` gate.\n";
  const realLines = String(readFileSync(resolve("scripts/check-body-removed-identifiers.mjs"), "utf8").split("\n").length - 1);
  const okBody = `A ${realLines}-line \`scripts/check-body-removed-identifiers.mjs\` gate.\n`;
  const inverseBad = "A gate of `scripts/check-body-removed-identifiers.mjs`, measured at `wc -l` -> **1** lines.\n";
  arms.push({
    label: "a path-first line count that contradicts the file",
    verdict: "FAIL",
    ok: scanCounts(inverseBad).length > 0,
    findings: [],
  });

  // THE ORDER ARM. A pasted --self-test block must list the arms in the order the script prints them.
  // Measured on #1085: the body pasted "the script's own output, verbatim" with arms 8 and 9 swapped,
  // because the body was edited after the script's push order changed. "Verbatim" is checkable.
  const labels = arms.map((a) => a.label);
  const inOrder = "```console\n" + labels.map((l) => `  ok    ${l}`).join("\n") + "\n```\n";
  const reversed = "```console\n" + [...labels].reverse().map((l) => `  ok    ${l}`).join("\n") + "\n```\n";
  arms.push({
    label: "a pasted self-test block out of the script's own order",
    verdict: "FAIL",
    ok: !hasOutOfOrderSelfTest(inOrder, labels) && hasOutOfOrderSelfTest(reversed, labels),
    findings: [],
  });

  // THE PRODUCTION-PATH ARM. The order arm above proves `hasOutOfOrderSelfTest` discriminates; it
  // does NOT prove that `runCheck` feeds it the right array. Measured: `declaredArmOrder()` once
  // read only the `arms.push({label:})` form and silently captured five of ten labels, so the
  // SHIPPED order check compared arms 6-10 and passed a body with arms 1-6 swapped -- while every
  // self-test arm stayed green, because the arm built its labels locally. This arm tests the
  // FUNCTION rather than the fixture: the production reader must return every arm's label, in
  // source order, from BOTH declaration forms.
  // The comparison is against the labels that exist BEFORE this arm is pushed: the arm cannot
  // assert its own label, because `declaredArmOrder()` reads them from SOURCE and this arm is in
  // the source it is reading. (Measured: the first version compared against `arms` AFTER the push
  // and failed -- the arm was off by itself.)
  const declared = declaredArmOrder();
  const priorLabels = arms.map((a) => a.label);
  const missing = priorLabels.filter((l) => !declared.includes(l));
  // THE SOURCE-COUNT ARM. A body that states an arm count and pastes NO N/M of its own is judged
  // against the arms the SCRIPT declares. Measured: this body said ten, then eleven, then twelve for
  // a script that grew 10 -> 11 -> 12, and every drift was caught by a reviewer -- because the only
  // check compared the stated count against the PASTE, and a body can paste a number it also states.
  const noPasteBody = "The script has 4 arms.\n\nNo pasted output here at all.\n";
  arms.push({
    label: "a stated arm count that contradicts the script's own source",
    verdict: "FAIL",
    ok: scanCounts(noPasteBody).some((f) => /contradicts its own source/.test(f)),
    findings: [],
  });

  // THE SPELLED-NUMBER ARM. NUMBER_WORDS is the vocabulary a stated count can be written in, and
  // the regex that reads it must be DERIVED from it. Measured: the map gained `eleven` while the
  // regex still said `three|...|ten`, so the gate could not read the count this file grew to.
  // This arm states ELEVEN and pastes FIVE; a gate that cannot spell eleven passes it.
  const spelledBody = "Eleven arms, both directions.\n\n```console\n$ x\n  ok    a\n  ok    b\n" +
    "check-body-removed-identifiers --self-test: OK — 5/5 arms discriminate\n```\n";
  const spelledFindings = scanCounts(spelledBody);
  arms.push({
    label: "a SPELLED count above ten that contradicts the pasted N/M",
    verdict: "FAIL",
    ok: spelledFindings.some((f) => /states 11 arms/.test(f)),
    findings: [],
  });

  arms.push({
    label: "the production order reader returns every arm label, in source order",
    verdict: "pass",
    ok:
      missing.length === 0 &&
      // ...and in SOURCE ORDER, not merely present: the shipped check compares positions.
      declared
        .filter((l) => priorLabels.includes(l))
        .every((l, i) => priorLabels.indexOf(l) === i),
    findings: [],
  });

  arms.push({
    label: "a stated line count that contradicts the file",
    verdict: "FAIL",
    ok: scanCounts(lineBody).length > 0 && scanCounts(okBody).length === 0,
    findings: [],
  });

  return arms;
}

if (process.argv.includes("--self-test")) {
  const arms = buildArms();
  const bad = arms.filter((a) => !a.ok);
  for (const a of arms) console.log(`  ${a.ok ? "ok  " : "FAIL"}  ${a.label}`);
  if (bad.length) {
    for (const b of bad) for (const f of b.findings) console.log(`        ${f}`);
    console.log(`check-body-removed-identifiers --self-test: ${bad.length} arm(s) did not discriminate`);
    process.exit(1);
  }
  console.log(`check-body-removed-identifiers --self-test: OK — ${arms.length}/${arms.length} arms discriminate`);
  process.exit(0);
}

// --emit-arms prints the table the PR body should carry.
if (process.argv.includes("--emit-arms")) {
  const arms = buildArms();
  const width = Math.max(...arms.map((a) => a.label.length), 4);
  arms.forEach((a, i) => console.log(` ${String(i + 1).padStart(2)}  ${a.label.padEnd(width)}  ${a.verdict}`));
  process.exit(0);
}

const repo = resolve(arg("--repo", "."));
const bodyPath = arg("--body");
const base = arg("--base", "origin/main");
const head = arg("--head", "HEAD");

if (!bodyPath) {
  console.error("check-body-removed-identifiers: --body <file> is required");
  process.exit(2);
}

const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });


// hasAnnotatedFence reports whether any ```console fence carries a line ending in a bare RED or
// GREEN verdict marker — a word no gate in this repo prints, and the shape an author's annotation
// takes when it is pasted into an output block by mistake.
function scanFences(bodyText) {
  const out = [];
  for (const m of bodyText.matchAll(/```console\n([\s\S]*?)```/g)) {
    for (const line of m[1].split("\n")) {
      const hit = line.match(/\s+(RED|GREEN)\s*$/);
      if (hit) {
        out.push(
          `a \`\`\`console fence carries a \`${hit[1]}\` annotation column — the program did not ` +
            `print that word. Put the annotation outside the fence, or print it from the code.\n` +
            `      in: ${line.trim().slice(0, 100)}`,
        );
        break;
      }
    }
  }
  return out;
}

function hasAnnotatedFence(bodyText) {
  return scanFences(bodyText).length > 0;
}


// scanCounts reports a body whose prose states "<Number> ... arms" while a console fence in the same
// body ends "N/N arms discriminate" with a different N. That is the shape every count finding on
// this line has taken: the number and its evidence, side by side, disagreeing.

function scanCounts(bodyText) {
  const out = [];
  // Scan only UNQUOTED prose. A body legitimately QUOTES a past finding ("five arms" above 6/6) while
  // making its own claim elsewhere; the first version counted the quotation and fired on its own body.
  const unquoted = bodyText
    .replace(/"[^"\n]{0,120}"/g, " ")
    .replace(/\u201c[^\u201d\n]{0,120}\u201d/g, " ")
    .replace(/`[^`\n]{0,120}`/g, " ")
    // A TABLE row's first cell is a number by design (`| 9 | ... |`). Reading it as a stated count made
    // the gate fire on its own body's arm table.
    .replace(/^\s*\|.*\|\s*$/gm, " ");
  const pasted = [...unquoted.matchAll(/(\d+)\/(\d+) arms?/g)].map((m) => Number(m[1]));
  // NO early return here. The arm-count half needs a pasted N/M to judge against, but the LINE-count
  // half does not — it reads the file. Returning early skipped that half entirely, which is how the
  // self-test's own line-count arm first failed.
  const claimed = [];
  // The alternation is DERIVED from NUMBER_WORDS, not retyped beside it. Measured: the map gained
// `eleven` while this regex still said `three|...|ten`, so the gate could not read the very count
// this file grew to -- the map and the pattern were two copies of one vocabulary, and the copy
// that mattered was the one nobody looked at.
  const numberAlt = Object.keys(NUMBER_WORDS).join("|");
  for (const m of unquoted.matchAll(new RegExp(`\\b(\\d+|${numberAlt})\\b[^.\\n]{0,15}\\barms\\b`, "gi"))) {
    const raw = m[1].toLowerCase();
    const n = NUMBER_WORDS[raw] ?? Number(raw);
    if (Number.isFinite(n)) claimed.push(n);
  }
  // THE SOURCE COUNT. A body's stated arm count must match the arms the SCRIPT has, not only the N/M
  // it pastes beside it. Measured: this session's prose said ten, then eleven, then twelve for a
  // script that grew 10 -> 11 -> 12, and every drift was caught by a reviewer rather than by a check
  // -- because arms 7/10 compared the stated count against the PASTE, and a body can paste a number
  // it also states. `declaredArmOrder()` is the source truth; a stated count that contradicts it is
  // wrong however consistently the body repeats itself.
  // It fires ONLY when the body pastes no N/M of its own. A body that pastes one is judged against
  // the paste -- that is the authority, and the two checks would otherwise double-report, or worse,
  // contradict: a fixture that states 6 and pastes 6/6 is self-consistent and correct even though
  // this script has twelve arms, because it is a FIXTURE, not a description of this script.
  const sourceArms = pasted.length === 0 ? declaredArmOrder().length : 0;
  for (const n of claimed) {
    if (sourceArms > 0 && n !== sourceArms) {
      out.push(
        `the body states ${n} arms, and the script declares ${sourceArms} — ` +
          `a count that contradicts its own source.`,
      );
    }
  }

  for (const n of claimed) {
    if (pasted.length > 0 && !pasted.includes(n)) {
      out.push(
        `the body states ${n} arms, and the pasted output beside it says ${pasted.join("/")} — ` +
          `a count that contradicts its own evidence.`,
      );
    }
  }

  // The SAME rule for the inverse form: "`path`, measured at `wc -l` -> **N** lines". #1085 evaded the
  // arm by writing its claim this way -- the path BEFORE the number -- so the arm now reads both
  // orders. A check that only reads one is a check an author can step around by rewording.
  for (const m of bodyText.matchAll(/`([\w./-]+\.(?:mjs|ts|js|go|py|sh|cue))`[^\n]{0,60}?wc -l`?\s*(?:->|:|=>)?\s*\*?\*?(\d+)\*?\*?\s*lines?/g)) {
    const path = m[1];
    const stated = Number(m[2]);
    try {
      const actual = readFileSync(resolve(path), "utf8").split("\n").length - 1;
      if (actual !== stated) out.push(`the body says \`${path}\` is ${stated} lines; measured \`wc -l\` -> ${actual}.`);
    } catch {
      out.push(`the body says \`${path}\` is ${stated} lines and the file is not readable here.`);
    }
  }

  // And the forward form: "<n>-line <path>" must match `wc -l`. Measured on
  // opencharly/opencharly#1085, where the body said "a 267-line Node.js gate" over a file of 358.
  for (const m of bodyText.matchAll(/\b(\d+)-line[^\n]{0,20}`([\w./-]+\.(?:mjs|ts|js|go|py|sh|cue))`/g)) {
    const stated = Number(m[1]);
    const path = m[2];
    try {
      const actual = readFileSync(resolve(path), "utf8").split("\n").length - 1;
      if (actual !== stated) {
        out.push(
          `the body says \`${path}\` is ${stated} lines; measured \`wc -l\` -> ${actual}.`,
        );
      }
    } catch {
      // A path this tree cannot read is not a claim about this tree; say so rather than passing.
      out.push(`the body says \`${path}\` is ${stated} lines and the file is not readable here.`);
    }
  }
  return out;
}


// hasOutOfOrderSelfTest reports whether a `console` fence that lists `ok    a <label>` lines names them
// out of `expected` order. A fence listing fewer than two known labels is not a self-test paste.
function hasOutOfOrderSelfTest(bodyText, expected) {
  for (const m of bodyText.matchAll(/```console\n([\s\S]*?)```/g)) {
    const seen = m[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^ok\s+\S/.test(l))
      .map((l) => l.replace(/^ok\s+/, "").trim())
      .filter((l) => expected.includes(l));
    if (seen.length < 2) continue;
    const idx = seen.map((l) => expected.indexOf(l));
    for (let k = 1; k < idx.length; k += 1) if (idx[k] < idx[k - 1]) return true;
  }
  return false;
}


// declaredArmOrder reads this file's own arm labels IN SOURCE ORDER. Both declaration forms count:
// `expect("label", …)` (shorthand) and `arms.push({ label: "label", … })`. Reading only the second
// form made the production order check blind to arms 1-5 — the review's finding, and the reason the
// self-test's own order arm passed while the shipped feature did not.
function declaredArmOrder() {
  const src = readFileSync(new URL(import.meta.url), "utf8");
  const out = [];
  for (const m of src.matchAll(/(?:expect\(\s*"([^"]+)",)|(?:label: "([^"]+)")/g)) {
    const label = m[1] ?? m[2];
    // A label is PROSE: it carries a space and no regex metacharacters. The pattern above also
    // matches its own source text -- `label: "..."` inside this very regex, and the `"([^` of an
    // adjacent declaration -- and those are five-character fragments, not arms. Measured: without
    // this filter the reader returned 15 where buildArms() pushes 12, and the source-count check
    // compared a body against a phantom.
    if (label && label.length > 12 && /\s/.test(label) && !/[()\[\]{}|\\^$*+?]/.test(label)) {
      out.push(label);
    }
  }
  // No filtering happens here, deliberately. The caller (`hasOutOfOrderSelfTest`) intersects this
  // against the labels it actually sees in a fence, and arm 11 asserts that this function returns
  // EVERY prior arm's label in source order -- so a filter here would have to be mirrored there,
  // and the two would drift. The earlier version of this comment described a filter that was
  // never written, which is why a review-round note could point at it and be right.
  return out;
}

// ---- the identifiers the diff removes -------------------------------------------------------

function collectRemoved(diff, bodyText) {
  const removed = new Map(); // identifier -> the diff line that removed it
  for (const line of diff.split("\n")) {
    if (!line.startsWith("-") || line.startsWith("---")) continue;
    for (const re of [
      /^-\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
      /^-\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s/,
      /^-\s*(?:const|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s/,
      /^-\s*(?:export\s+)?(?:const|let|function)\s+([A-Za-z_][A-Za-z0-9_]*)/,
      /^-\s*#([A-Za-z_][A-Za-z0-9_]*):\s*\{/,
    ]) {
      const m = line.match(re);
      if (m && !IGNORE.has(m[1])) removed.set(m[1], line.trim());
    }
  }
  // A rename the body itself states also removes the left-hand name.
  for (const m of bodyText.matchAll(/`([A-Za-z_][A-Za-z0-9_]*)`\s*(?:→|->)\s*\*\*?`([A-Za-z_][A-Za-z0-9_]*)`/g)) {
    if (!IGNORE.has(m[1]) && !removed.has(m[1])) removed.set(m[1], `rename ${m[1]} → ${m[2]}`);
  }
  return removed;
}

// ---- the body's prose -----------------------------------------------------------------------
//
// NOT every fenced block is command output. A fence starting with `$`, `>`, `---`, `FAIL`, `PASS  `
// or `#` is a pasted command or its output, where an old name is legitimate (`git diff` shows it).
// A fence that is a BARE LIST — the R7 evidence table, an enumeration — is prose the reader reads
// as a claim, and blanking it let a planted old test name through the first version of this check.

function prose(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      const start = i;
      let j = i + 1;
      while (j < lines.length && !/^\s*(```|~~~)/.test(lines[j])) j += 1;
      const firstContent = lines.slice(start + 1, j).find((l) => l.trim() !== "") ?? "";
      const isCommand = /^\s*(\$|>|---|FAIL|PASS\s{2,}|ok\s|#|==)/.test(firstContent);
      for (let k = start; k <= j; k += 1) out.push(isCommand ? "" : (lines[k] ?? ""));
      i = j + 1;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      out.push("");
      i += 1;
      continue;
    }
    out.push(line);
    i += 1;
  }
  return out;
}

function scanProse(removed, bodyText) {
  const proseLines = prose(bodyText);

  // Group into paragraphs so an acceptance marker anywhere in the paragraph covers its mentions.
  const paragraphs = [];
  let current = [];
  for (const line of proseLines) {
    if (line.trim() === "") {
      if (current.length) paragraphs.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) paragraphs.push(current.join("\n"));

  const findings = [];
  for (const para of paragraphs) {
    const accepted = ACCEPTS.some((a) => para.toLowerCase().includes(a));
    for (const [ident, where] of removed) {
      if (!new RegExp(`\\b${ident.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(para)) continue;
      if (accepted) continue;
      const first = para.split("\n")[0].slice(0, 100);
      findings.push(
        `the body's prose names \`${ident}\`, which the diff REMOVES (${where}) — and the sentence ` +
          `does not say so. Add a rename/removal marker, or use the surviving name.\n` +
          `      in: ${first}`,
      );
    }
  }
  return findings;
}

// ---- verdict -------------------------------------------------------------------------------

const diff = git("diff", `${base}...${head}`, "--", ".");
const body = readFileSync(bodyPath, "utf8");
const { removed, findings, inapplicable } = runCheck(diff, body);

if (findings.length > 0) {
  for (const f of [...new Set(findings)]) console.log(`FAIL  ${f}`);
  process.exit(1);
}

if (inapplicable) {
  console.log(
    "check-body-removed-identifiers: the diff removes no identifier — the identifier arm is " +
      "inapplicable; the fence arm ran and found nothing",
  );
  process.exit(0);
}
