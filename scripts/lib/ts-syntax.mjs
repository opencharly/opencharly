// ts-syntax.mjs — parse a TypeScript source WITHOUT resolving its imports.
//
// WHY (R1). A gate that reads an extension's text with regexes cannot notice the
// extension does not PARSE. Measured: a one-line edit to `charly-gates.ts`'s injected
// rules block left an unescaped backtick inside the template literal; every
// `scripts/check-*.mjs` stayed green and the breakage surfaced only when pi loaded the
// extension (`Failed to load extension … ParseError: Missing semicolon`). This helper
// closes that class: the gates now assert the shipped extension PARSES.
//
// It strips types with Node's own stripper, then runs `node --check` on the result as ESM
// — so `import type`, `typebox`, and `@earendil-works/*` never need to resolve.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The type stripper emits an ExperimentalWarning asynchronously; a deterministic gate's
// stderr must stay clean, so silence Node's default warning printer for this process.
// Runs at import time, before any call to stripTypeScriptTypes below.
process.removeAllListeners("warning");

/**
 * Parse-check a TypeScript source string.
 * @param {string} source
 * @returns {string|null} null when it parses, else a one-line error.
 */
export function parseTypeScript(source) {
  let stripped;
  try {
    stripped = stripTypeScriptTypes(source, { mode: "strip" });
  } catch (err) {
    return `type strip failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  const dir = mkdtempSync(join(tmpdir(), "ts-syntax-"));
  const file = join(dir, "check.mjs");
  try {
    writeFileSync(file, stripped, "utf8");
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    return null;
  } catch (err) {
    const text = String(err?.stderr ?? err?.message ?? err);
    return (
      text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(" ") || "parse failed"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
