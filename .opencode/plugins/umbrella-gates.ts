/**
 * umbrella-gates.ts — opencode plugin running the same mechanical gates as
 * Claude Code (fork of charly's `.opencode/plugins/charly-gates.ts`).
 * Intercepts shell tool calls and runs `.claude/hooks/pre-commit-gate.sh` /
 * `pre-push-gate.sh`; the gates exit 2 to BLOCK.
 *
 * DUAL CONTRACT (R1 fix, 2026-09-28). opencode has TWO plugin shapes and the
 * loader picks by the shape of the default export:
 *   - opencode 1.x  — `default export { id, server(input) }` returning a hooks
 *     object (`"tool.execute.before"`); a definition WITHOUT `server` is
 *     rejected: `must default export an object with server()`.
 *   - opencode >=2.0 — `default export { id, setup(ctx) }` registering via
 *     `ctx.tool.hook(...)`; the function form (`async (input) => ({...})`) does
 *     NOT load.
 * The prior revision shipped ONLY `setup`, so under the installed 1.18.x binary
 * every startup logged `failed to load plugin … must default export an object
 * with server()` and the gates were SILENTLY UNENFORCED. This file exports BOTH
 * so it loads and enforces under either generation; the shared `gate()` keeps the
 * logic single-sourced. `scripts/check-opencode-plugin.mjs` requires BOTH shapes.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

const GATES = [
  { script: "pre-commit-gate.sh", match: /git.*commit/ },
  { script: "pre-push-gate.sh", match: /git.*push/ },
];

const GATE_TIMEOUT_MS = 30000;

function runGate(hooksDir, script, command) {
  const payload = JSON.stringify({ tool_input: { command } });
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [join(hooksDir, script)], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`[${script}] timed out after ${GATE_TIMEOUT_MS}ms`));
    }, GATE_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`[${script}] ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`[${script}] ${stderr.trim()}`));
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

// Shared gate logic. `tool` is the shell tool name — "bash" (1.x) or "shell" (>=2.0);
// `args` is the tool arguments ({ command }).
async function gate(hooksDir, tool, args) {
  if (tool !== "bash" && tool !== "shell") return;
  const command =
    args && typeof args === "object" && "command" in args ? args.command : undefined;
  if (typeof command !== "string") return;
  for (const g of GATES) {
    if (g.match.test(command)) await runGate(hooksDir, g.script, command);
  }
}

export default {
  id: "umbrella-gates",
  // opencode >= 2.0 definition form.
  async setup(ctx) {
    const hooksDir = join(ctx.location.directory, ".claude", "hooks");
    await ctx.tool.hook("execute.before", async (event) => {
      await gate(hooksDir, event.tool, event.input);
    });
  },
  // opencode 1.x function form.
  async server(input) {
    const hooksDir = join(input.directory, ".claude", "hooks");
    return {
      "tool.execute.before": async (event, output) => {
        await gate(hooksDir, event.tool, output && output.args);
      },
    };
  },
};
