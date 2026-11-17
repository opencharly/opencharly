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

// Identifiers too generic to check: a rename of `main` or `err` would fire on every sentence.
const IGNORE = new Set([
  "main", "init", "new", "run", "get", "set", "len", "cap", "nil", "err", "ok", "id",
  "name", "type", "func", "test", "file", "path", "data", "text", "body", "head",
]);

// runCheck(diffText, bodyText) -> findings[], so --self-test can drive the SAME code path.
export function runCheck(diffText, bodyText) {
  const removed = collectRemoved(diffText, bodyText);
  if (removed.size === 0) return { removed, findings: [], inapplicable: true };
  return { removed, findings: scanProse(removed, bodyText), inapplicable: false };
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
if (process.argv.includes("--self-test")) {
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
    arms.push({ label, ok: (findings.length > 0) === wantFindings, findings });
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

if (inapplicable) {
  console.log("check-body-removed-identifiers: the diff removes no identifier — inapplicable");
  process.exit(0);
}

if (findings.length === 0) {
  console.log(
    `check-body-removed-identifiers: OK — ${removed.size} removed identifier(s), none named as if ` +
      `they still exist`,
  );
  process.exit(0);
}

for (const f of [...new Set(findings)]) console.log(`FAIL  ${f}`);
process.exit(1);
