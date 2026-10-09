#!/usr/bin/env node
// check-validator-rule-map.mjs — the validator enforces ONLY what the rulebook states.
//
// Why it exists (opencharly/opencharly#446). The org validator (`charly/pr-validator`) reads its
// rulebook from the `AI_REVIEW_PROMPT` org variable, mirrored in `action-review/charly.yml`.
// AGENTS.md "What the validator checks" maps every validator check to the rule it enforces and
// to the skill section that states its full criteria. When the two drift, the validator BLOCKs
// on an obligation no agent could have read before the push. That is the validator instructing
// instead of enforcing. This gate makes that drift non-silent:
//
//   1. the check ids the committed rulebook defines == the ids the AGENTS.md table lists;
//   2. every skill a table row cites resolves to a SKILL.md in the marketplace corpus;
//   3. the committed rulebook == the LIVE org variable (R8: run against the real variable, or
//      SKIP visibly when `gh` is not authenticated, never a mock).
//
// A surface that is not checked out (`action-review/`, `marketplace/` in a session worktree)
// SKIPS visibly; a silent pass is forbidden.
//
// Usage: node scripts/check-validator-rule-map.mjs [--root <dir>] [--self-test]
// exit 0 clean · 1 finding

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const root = rootIdx === -1 ? resolve(here, "..") : resolve(argv[rootIdx + 1]);

let failures = 0;
const fail = (m) => {
  failures += 1;
  console.error(`  FAIL  ${m}`);
};
const ok = (m) => console.log(`  PASS  ${m}`);
const skip = (m) => console.log(`  SKIP  ${m}`);

const CHECK_ID = "(?:T\\d|A\\d|R\\d+|HC|PIL|CONC|ARCH|DISP|QUAL|COORD)";

/** The ids in the first column of the AGENTS.md "What the validator checks" table. */
export function tableIds(agents) {
  const start = agents.indexOf("\n## What the validator checks\n");
  if (start === -1) return null;
  const end = agents.indexOf("\n## ", start + 1);
  const section = agents.slice(start, end === -1 ? undefined : end);
  const ids = [];
  const rows = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\| ([^|]+?) \|/);
    if (!m || m[1] === "Check" || /^-+$/.test(m[1])) continue;
    rows.push(line);
    const range = m[1].match(/^([A-Z]+)(\d+)–\1(\d+)$/);
    if (range) {
      for (let n = Number(range[2]); n <= Number(range[3]); n += 1) ids.push(`${range[1]}${n}`);
    } else {
      ids.push(m[1]);
    }
  }
  return { ids, rows };
}

/** The committed AI_REVIEW_PROMPT block of action-review/charly.yml, dedented. */
export function committedPrompt(yml) {
  const lines = yml.split("\n");
  const at = lines.findIndex((l) => /^\s+AI_REVIEW_PROMPT: \|\s*$/.test(l));
  if (at === -1) return null;
  const indent = lines[at].match(/^(\s*)/)[1].length + 2;
  const out = [];
  for (let i = at + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (l.trim() !== "" && l.match(/^(\s*)/)[1].length < indent) break;
    out.push(l.slice(indent));
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** The check ids the rulebook defines: a line that OPENS with `<ID> — `. */
export function promptIds(prompt) {
  const re = new RegExp(`^(${CHECK_ID}) — `, "gm");
  return [...prompt.matchAll(re)].map((m) => m[1]);
}

function check(dir) {
  const agentsPath = join(dir, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    fail("AGENTS.md exists at the root");
    return;
  }
  const table = tableIds(readFileSync(agentsPath, "utf8"));
  if (!table || table.ids.length === 0) {
    fail('AGENTS.md has a "## What the validator checks" table with check ids');
    return;
  }
  const dupes = table.ids.filter((id, i) => table.ids.indexOf(id) !== i);
  dupes.length === 0
    ? ok(`the AGENTS.md table lists ${table.ids.length} distinct check ids`)
    : fail(`the AGENTS.md table lists a check id twice: ${dupes.join(", ")}`);

  // 1. rulebook ids == table ids
  const rulebookPath = join(dir, "action-review/charly.yml");
  let prompt = null;
  if (!existsSync(rulebookPath)) {
    skip("action-review/ is not checked out: the id comparison did not run (git submodule update --init action-review)");
  } else {
    prompt = committedPrompt(readFileSync(rulebookPath, "utf8"));
    if (prompt === null) {
      fail("action-review/charly.yml declares an AI_REVIEW_PROMPT block");
    } else {
      const defined = promptIds(prompt);
      const missing = defined.filter((id) => !table.ids.includes(id));
      const extra = table.ids.filter((id) => !defined.includes(id));
      missing.length === 0
        ? ok(`every rulebook check id (${defined.length}) has an AGENTS.md row`)
        : fail(`rulebook checks with no AGENTS.md row: ${missing.join(", ")}`);
      extra.length === 0
        ? ok("every AGENTS.md row names a check the rulebook defines")
        : fail(`AGENTS.md rows naming no rulebook check: ${extra.join(", ")}`);
    }
  }

  // 2. every cited skill resolves in the corpus
  if (!existsSync(join(dir, "marketplace/DISPATCHER.md"))) {
    skip("marketplace/ is not checked out: the skill-reference check did not run");
  } else {
    const refs = [...new Set(table.rows.flatMap((r) => [...r.matchAll(/\/charly-([a-z0-9-]+):([a-z0-9-]+)/g)].map((m) => `${m[1]}:${m[2]}`)))];
    const dangling = refs.filter((r) => {
      const [fam, sk] = r.split(":");
      return !existsSync(join(dir, "marketplace", fam, "skills", sk, "SKILL.md"));
    });
    dangling.length === 0
      ? ok(`every skill the table cites (${refs.length}) resolves in the marketplace corpus`)
      : fail(`table cites skills with no SKILL.md: ${dangling.join(", ")}`);
  }

  // 3. committed rulebook == live org variable (R8: live or skip)
  if (prompt !== null && !argv.includes("--no-live")) {
    const gh = spawnSync("gh", ["variable", "get", "AI_REVIEW_PROMPT", "--org", "opencharly"], { encoding: "utf8" });
    if (gh.error || gh.status !== 0) {
      skip(`live AI_REVIEW_PROMPT not readable (gh unauthenticated or no org access): the committed-vs-live comparison did not run`);
    } else {
      gh.stdout.replace(/\n+$/, "") === prompt
        ? ok("the committed rulebook equals the live AI_REVIEW_PROMPT org variable")
        : fail("the committed rulebook (action-review/charly.yml) differs from the live AI_REVIEW_PROMPT org variable");
    }
  }
}

function selfTest() {
  const row = (id) => `| ${id} | x | y | \`/charly-internals:strict-policy\` |`;
  const agents = (ids) =>
    `# t\n\n## What the validator checks\n\n| Check | Verifies | Enforces | Full criteria |\n|---|---|---|---|\n${ids.map(row).join("\n")}\n\n## Next\n`;
  const rulebook = (ids) =>
    `review-contract:\n  candy:\n    var:\n      AI_REVIEW_PROMPT: |\n${ids.map((id) => `        ${id} — a check.\n        more text.`).join("\n")}\n    env_accept: []\n`;
  const cases = [
    ["matching ids", ["T1–T2", "R1", "COORD"], ["T1", "T2", "R1", "COORD"], true],
    ["a rulebook check with no row", ["T1–T2", "R1"], ["T1", "T2", "R1", "COORD"], false],
    ["a row naming no check", ["T1–T2", "R1", "HC"], ["T1", "T2", "R1"], false],
    ["a duplicated row", ["R1", "R1"], ["R1"], false],
  ];
  let bad = 0;
  for (const [name, tableIdsIn, ruleIds, green] of cases) {
    const dir = mkdtempSync(join(tmpdir(), "check-validator-rule-map-"));
    try {
      writeFileSync(join(dir, "AGENTS.md"), agents(tableIdsIn));
      mkdirSync(join(dir, "action-review"));
      writeFileSync(join(dir, "action-review/charly.yml"), rulebook(ruleIds));
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--root", dir, "--no-live"], { encoding: "utf8" });
      const gotGreen = r.status === 0;
      if (gotGreen === green) console.log(`  PASS  self-test '${name}' is ${green ? "GREEN" : "RED"}`);
      else {
        bad += 1;
        console.error(`  FAIL  self-test '${name}' expected ${green ? "GREEN" : "RED"}, got exit ${r.status}\n${r.stdout}${r.stderr}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(`check-validator-rule-map --self-test: ${bad === 0 ? "OK" : `FAIL (${bad})`}`);
  process.exit(bad === 0 ? 0 : 1);
}

if (argv.includes("--self-test")) selfTest();
check(root);
console.log(`check-validator-rule-map: ${failures === 0 ? "OK" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
