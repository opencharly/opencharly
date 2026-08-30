/**
 * umbrella-verify.ts — the umbrella's charly-specific verification tools.
 *
 * The umbrella is a view of the org: 344 submodules, each a real repo owned
 * elsewhere. Its operational surface is the pinning/sync/verify gate scripts
 * (AGENTS.md R7): `task verify` (the full pinning gate), `task map` (pin +
 * sync state of every submodule), `task sync` (policy-B gitlink sync preview).
 *
 * These tools are THIN WRAPPERS over the canonical scripts (R3 — the scripts
 * own the behavior; the tools only bound output and return a structured
 * verdict). They exist because the raw outputs are long (344-remote branch
 * audit, 344-row pin table) and the agent must run the gate on every final
 * tree — a bounded, structured wrapper keeps the main context small.
 *
 * Tools:
 *   1. umbrella_verify     — run the full R7 pinning gate (`task verify`),
 *                            return PASS/FAIL + the failing pins (bounded).
 *   2. umbrella_sync_status — run `task map`, return the pin/sync state of
 *                            every submodule (bounded).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Type } from "typebox";

const execFileP = promisify(execFile);

/** Run a command with bounded output; never reject on nonzero exit. */
async function runBounded(cmd: string, args: string[], cwd: string, maxBytes = 200_000): Promise<{ code: number; output: string }> {
  try {
    const { stdout, stderr } = await execFileP(cmd, args, { cwd, maxBuffer: maxBytes, timeout: 300_000 });
    return { code: 0, output: (stdout + (stderr ? "\n" + stderr : "")).trim() };
  } catch (e: any) {
    const code = typeof e?.code === "number" ? e.code : 1;
    const out = (e?.stdout?.toString?.() ?? "") + (e?.stderr?.toString?.() ? "\n" + e.stderr.toString() : "");
    return { code, output: out.trim() || e?.message || String(e) };
  }
}

/** Parse the verify output into a verdict + failing pins. */
function parseVerify(output: string): { verdict: string; failing: string[] } {
  const lines = output.split("\n");
  const failing = lines.filter((l) => l.startsWith("FAIL:")).map((l) => l.slice(5).trim());
  const verdict = failing.length === 0 && lines.some((l) => /^OK|PASS|verify.*ok/i.test(l)) ? "PASS" : failing.length > 0 ? "FAIL" : "UNKNOWN";
  return { verdict, failing };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "umbrella_verify",
    label: "Umbrella Pinning Gate (task verify)",
    description:
      "Run the umbrella's full R7 pinning gate (`task verify` = scripts/verify-pins.sh + the gates-syntax check) " +
      "and return a structured verdict: PASS/FAIL plus the failing pins (bounded output). " +
      "This is the mandatory gate on every final tree (AGENTS.md R7) — run it before opening any umbrella PR.",
    promptSnippet: "Run the umbrella pinning gate (task verify)",
    promptGuidelines: [
      "Run umbrella_verify on the final tree before opening any umbrella PR — R7 mandates it and the PR body must paste the output.",
      "A FAIL lists the exact pins that drifted — fix via task sync (a sync, never a hand-pin), never by editing .gitmodules by hand.",
      "The output is bounded; for the full log run 'bash scripts/verify-pins.sh > /tmp/verify.log 2>&1' yourself.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const { code, output } = await runBounded("bash", ["-c", "bash scripts/verify-pins.sh && node --disable-warning=ExperimentalWarning scripts/check-umbrella-gates-syntax.mjs"], ctx.cwd);
      const { verdict, failing } = parseVerify(output);
      const lines = [
        `umbrella_verify: ${verdict} (exit ${code})`,
        ...(failing.length > 0 ? [`failing pins (${failing.length}):`, ...failing.slice(0, 20)] : []),
        `output (${output.split("\n").length} lines, bounded):`,
        output.split("\n").slice(0, 40).join("\n"),
      ];
      return { content: [{ type: "text", text: lines.join("\n") }], details: { verdict, failing, exitCode: code } };
    },
  });

  pi.registerTool({
    name: "umbrella_sync_status",
    label: "Umbrella Pin/Sync State (task map)",
    description:
      "Run `task map` and return the pin + sync state of every submodule (bounded). " +
      "Shows which submodules are ahead/behind their recorded gitlinks before a `task sync`.",
    promptSnippet: "Show umbrella submodule pin/sync state",
    promptGuidelines: [
      "Run umbrella_sync_status before a task sync to see which pins drifted.",
      "A submodule whose checked-out HEAD differs from its gitlink shows as a pin drift — fix via task sync + PR, never a hand-pin.",
    ],
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const { code, output } = await runBounded("bash", ["-c", "task map"], ctx.cwd);
      const lines = output.split("\n");
      const dirty = lines.filter((l) => l.includes("DIRTY"));
      const text = [
        `umbrella_sync_status: ${lines.length - 1} submodules (${dirty.length} dirty)`,
        ...lines.slice(0, 60),
        ...(lines.length > 60 ? [`... (${lines.length - 60} more rows — run 'task map' for the full table)`] : []),
      ].join("\n");
      return { content: [{ type: "text", text }], details: { exitCode: code, submoduleCount: Math.max(0, lines.length - 1), dirtyCount: dirty.length } };
    },
  });
}
