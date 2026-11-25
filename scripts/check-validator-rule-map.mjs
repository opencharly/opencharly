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
//      SKIP visibly when `gh` is not authenticated, never a mock). ONE difference is REPORTED
//      rather than failed: a live variable that equals the rulebook at the umbrella's PREVIOUS
//      `action-review` pin. That is the producer-first window — the pin has advanced to a merged
//      rulebook and the operator has not yet re-synced the variable — so it is a re-sync
//      pending, the way a `behind` pin passes and is reported. Any other difference (a second
//      advance with no re-sync, a hand-edited variable, a drifted committed copy) still FAILS.
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
const report = (m) => console.log(`  PASS  ${m} (REPORTED: re-sync pending)`);

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

/**
 * How the live variable relates to the committed rulebook: "equal"; "pending" when it equals
 * the rulebook at the previous `action-review` pin (the producer-first window); else "differs".
 */
export function judgeLive(live, committed, previous) {
  if (live === committed) return "equal";
  if (previous !== null && previous !== undefined && live === previous) return "pending";
  return "differs";
}

const git = (cwd, args) => {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
};

/**
 * The rulebook at the umbrella's PREVIOUS `action-review` pin, or null when it cannot be read.
 * An index that moved the gitlink makes HEAD's gitlink the previous one; otherwise it is the
 * gitlink before the last commit that moved it (on a PR branch, the branch's own advance; on
 * `main`, the squash that landed it).
 */
export function previousPrompt(dir) {
  const index = git(dir, ["ls-files", "-s", "--", ":(literal)action-review"]);
  const indexLink = index ? index.split(/\s+/)[1] : null;
  const headLink = git(dir, ["rev-parse", "HEAD:action-review"]);
  let prev = null;
  if (indexLink && headLink && indexLink !== headLink) {
    prev = headLink;
  } else {
    const moved = git(dir, ["log", "-1", "--format=%H", "--", ":(literal)action-review"]);
    if (moved) prev = git(dir, ["rev-parse", `${moved}^:action-review`]);
  }
  if (!prev) return null;
  const yml = git(join(dir, "action-review"), ["show", `${prev}:charly.yml`]);
  if (yml === null) return null;
  const prompt = committedPrompt(yml);
  return prompt === null ? null : { sha: prev, prompt };
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
      const live = gh.stdout.replace(/\n+$/, "");
      const previous = live === prompt ? null : previousPrompt(dir);
      const verdict = judgeLive(live, prompt, previous ? previous.prompt : null);
      if (verdict === "equal") ok("the committed rulebook equals the live AI_REVIEW_PROMPT org variable");
      else if (verdict === "pending")
        report(
          `the live AI_REVIEW_PROMPT is the rulebook at the previous action-review pin ${previous.sha.slice(0, 12)}; ` +
            "set the org variable to the committed rulebook once this pin has merged",
        );
      else fail("the committed rulebook (action-review/charly.yml) differs from the live AI_REVIEW_PROMPT org variable, and from the rulebook at the previous action-review pin");
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
  // The live judgement, on its own: the window is REPORTED, everything else still decides.
  const judged = [
    ["live equals the committed rulebook", "B", "B", "A", "equal"],
    ["live is the previous pin's rulebook (re-sync pending)", "A", "B", "A", "pending"],
    ["live is neither the committed nor the previous rulebook", "X", "B", "A", "differs"],
    ["live differs and no previous pin is readable", "A", "B", null, "differs"],
  ];
  for (const [name, live, committed, previous, want] of judged) {
    const got = judgeLive(live, committed, previous);
    if (got === want) console.log(`  PASS  self-test '${name}' is ${want}`);
    else {
      bad += 1;
      console.error(`  FAIL  self-test '${name}' expected ${want}, got ${got}`);
    }
  }

  // previousPrompt on a REAL git fixture: an umbrella whose action-review gitlink moved from a
  // first rulebook to a second, both in the index and in a commit.
  const fx = mkdtempSync(join(tmpdir(), "check-validator-rule-map-git-"));
  try {
    const run = (cwd, ...args) => {
      const r = spawnSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
      return r.stdout.trim();
    };
    const ar = join(fx, "action-review");
    mkdirSync(ar);
    run(ar, "init", "-q");
    writeFileSync(join(ar, "charly.yml"), rulebook(["R1"]));
    run(ar, "add", "charly.yml");
    run(ar, "commit", "-qm", "one");
    const first = run(ar, "rev-parse", "HEAD");
    writeFileSync(join(ar, "charly.yml"), rulebook(["R1", "R12"]));
    run(ar, "commit", "-qam", "two");
    const second = run(ar, "rev-parse", "HEAD");
    run(fx, "init", "-q");
    writeFileSync(join(fx, "f"), "x\n");
    run(fx, "add", "f");
    run(fx, "update-index", "--add", "--cacheinfo", `160000,${first},action-review`);
    run(fx, "commit", "-qm", "pin one");
    const firstPrompt = committedPrompt(rulebook(["R1"]));
    // the index moved the gitlink: HEAD's pin is the previous one
    run(fx, "update-index", "--cacheinfo", `160000,${second},action-review`);
    const fromIndex = previousPrompt(fx);
    // committed: the commit that moved the gitlink has the previous pin as its parent's
    run(fx, "commit", "-qm", "pin two");
    const fromCommit = previousPrompt(fx);
    for (const [name, got] of [
      ["previous pin read from an index that moved the gitlink", fromIndex],
      ["previous pin read from the commit that moved the gitlink", fromCommit],
    ]) {
      if (got && got.sha === first && got.prompt === firstPrompt) console.log(`  PASS  self-test '${name}'`);
      else {
        bad += 1;
        console.error(`  FAIL  self-test '${name}': got ${JSON.stringify(got)}`);
      }
    }
  } finally {
    rmSync(fx, { recursive: true, force: true });
  }

  console.log(`check-validator-rule-map --self-test: ${bad === 0 ? "OK" : `FAIL (${bad})`}`);
  process.exit(bad === 0 ? 0 : 1);
}

if (argv.includes("--self-test")) selfTest();
check(root);
console.log(`check-validator-rule-map: ${failures === 0 ? "OK" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
