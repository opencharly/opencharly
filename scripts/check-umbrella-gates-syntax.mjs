#!/usr/bin/env node
/**
 * check-umbrella-gates-syntax.mjs — zero-dependency regression gate for the pi
 * extension source at .pi/extensions/umbrella-gates.ts.
 *
 * Guarded failure (PR #7): an unescaped backtick inside the buildRulesBlock()
 * template literal (line 100) terminated the template early, so pi's jiti
 * loader rejected the module with "ParseError: Missing semicolon ...:100:7".
 * The extension silently died: no bash gate interception, no
 * umbrella_load_skills tool, no every-turn rules injection.
 *
 * This check runs Node's own TypeScript type-stripping pass over the file and
 * fails when it does not parse. Verified: it THROWS on the pre-fix file
 * ("Expected ';', got 'ident'") and passes on the fixed tree. Wired into
 * `task verify` and .github/workflows/verify.yml so the repo's gate fails on a
 * regression of this defect.
 *
 * Requires Node >= 22.6 (module.stripTypeScriptTypes).
 *
 * Usage: node scripts/check-umbrella-gates-syntax.mjs [path]
 *   (path defaults to the canonical .pi/extensions/umbrella-gates.ts)
 */
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGET = fileURLToPath(
  new URL("../.pi/extensions/umbrella-gates.ts", import.meta.url),
);
const target = process.argv[2] ?? DEFAULT_TARGET;

let src;
try {
  src = readFileSync(target, "utf8");
} catch (err) {
  console.error(`FAIL: cannot read ${target}: ${err.message}`);
  process.exit(1);
}

try {
  stripTypeScriptTypes(src, { mode: "strip" });
} catch (err) {
  console.error(`FAIL: ${target} does not parse:\n${err.message}`);
  process.exit(1);
}

console.log(`OK: ${target} parses (node type-strip pass)`);
