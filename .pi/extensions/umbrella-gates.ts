/**
 * umbrella-gates.ts — Pi extension that enforces the umbrella's git-workflow
 * command mechanics AND injects the umbrella rulebook into the system prompt.
 *
 * Fork of charly's `charly-gates.ts` (see HARNESS-PARITY.md — keep in sync
 * with its structure; the mechanical gates are identical by design).
 *
 * ## Mechanical gates (tool_call interception)
 *
 * Pi has no hooks system (unlike Claude Code / reasonix / kimi). This
 * extension is the Pi equivalent of the `.reasonix`/kimi `PreToolUse(Bash)`
 * wiring of `.claude/hooks/pre-commit-gate.sh` and `pre-push-gate.sh`. It
 * intercepts every `bash` tool call and runs both gate scripts against the
 * command, blocking the call when a gate exits 2.
 *
 * The gates guard ONLY deterministic command mechanics (per AGENTS.md "Hooks
 * doctrine"):
 *   - `git commit --no-verify` / `-n` / `core.hooksPath` bypass
 *   - untokenizable commit commands
 *   - `git push --force` / `--force-with-lease` / `-f`
 *   - a direct push to `main`
 *
 * Attribution identity/confidence, change class, rulebook compliance, and
 * policy-B equality are judged once by the fresh pr-validator, never here.
 * Hooks guard mechanics; agents judge policy and evidence.
 *
 * ## System prompt injection (before_agent_start)
 *
 * Injects the condensed umbrella rules, PR body requirements, and attribution
 * tiers into the system prompt every turn. This survives compaction because
 * it is re-injected before every LLM call.
 *
 * ## Custom tools
 *
 * - umbrella_load_skills: reads SKILL.md files matching trigger keywords
 *
 * Deliberately absent vs charly: worktree tools (AGENTS.md rule 4 — no
 * worktrees in the umbrella), Go-lint gates (no Go at the umbrella root).
 *
 * The gate scripts self-gate on a fast path (they exit 0 for commands that
 * do not mention `git commit` / `git push`), so running them for every bash
 * call is cheap and matches the doctrine exactly.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFile, unlink, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

/** Gate scripts, relative to the project root (ctx.cwd). */
const GATE_SCRIPTS = [
  ".claude/hooks/pre-commit-gate.sh",
  ".claude/hooks/pre-push-gate.sh",
];

/** The condensed umbrella rules injected every turn. */
function buildRulesBlock(): string {
  return `## Umbrella Engineering Rules

### R0 — Skills First
Before the first tool call of every task, use \`umbrella_load_skills\` to load the
SKILL.md files whose trigger column matches the task. The dispatcher table is in
AGENTS.md. Load ALL matching skills before acting.

### R1 — RCA Every Anomaly
Every failure, warning, or doc-vs-reality divergence triggers the
root-cause-analyzer process before any remediation. No "pre-existing",
"out of scope", or "follow-up PR" classifications.

### R3 — No Duplication
One canonical implementation owns each behavior (the scripts and harness
configs own theirs; never re-implement policy in prose).

### R4 — No Workarounds
No sleeps, blind retries, hand-pinned gitlinks, or manual CI fixes. A changed
pin is a sync (\`task sync\` + PR), not a hand-pin.

### R5 — Delete Legacy Completely
A cutover removes the old path in the same PR.

### R6 — Git Safety
Check \`git status\` before destructive actions. No force-push, pushed-history
rewrite, hook bypass, or direct push to \`main\`. Run submodule git through
\`git -C <path>\` from the umbrella root. Never edit inside a submodule.

### R7 — Prove the Gate, Not the Plan
Run \`task verify\` (the CI gate) on the final tree and retain the output.

### R10 — Fresh Disposable Proof
Verify only the final committed tree, never an edited state.

### PR Body Requirements
Every PR body must contain:
1. **## Summary** — what changed and why
2. **## How tested** — pasted command + output for every verification step
3. **## Rulebook compliance** — table with every applicable umbrella rule
4. **## Change Classification** — change class, verification gate, attribution tier
5. **CHANGELOG entry** — `CHANGELOG/<calver>.md` placeholder in the diff (the
   pr-validator finalizes it to the merge-time CalVer; rule B19)
6. ***Assisted-by: <Harness> <Provider Full Model Name> (<confidence>)*** — italicized
   footer in the EXACT form, e.g. `*Assisted-by: pi openrouter/deepseek/deepseek-v4-flash-0731 (fully tested and validated)*` (rule A1)

### Attribution Tiers
| Confidence | Required proof |
|---|---|
| \`fully tested and validated\` | \`task verify\` passed on the final tree; changed paths executed live |
| \`analysed on a live system\` | Changed runtime path ran live with retained output; full gate did not pass |
| \`documentation reviewed\` | Docs-only change class (forbidden if pins/scripts changed) |
| \`syntax check only\` | Dry-run only — do not commit |
| \`theoretical suggestion\` | No validation — never ship |

### Validator Verdict Discipline
Every validator BLOCK must be read in full and ALL listed issues fixed before
the next push. A partial fix that addresses only one of several findings is a
defective cycle.`;
}

/** Parse the skill dispatcher table from AGENTS.md content. */
function parseDispatcherTable(content: string): Array<{ triggers: string[]; path: string }> {
  const result: Array<{ triggers: string[]; path: string }> = [];
  // Find the generated dispatcher table
  const tableStart = content.indexOf("<!-- BEGIN GENERATED SKILL DISPATCHER -->");
  const tableEnd = content.indexOf("<!-- END GENERATED SKILL DISPATCHER -->");
  if (tableStart === -1 || tableEnd === -1) return result;

  const table = content.slice(tableStart, tableEnd);
  // Extract rows from the Markdown table: | Trigger | Skill to load |
  const rowRegex = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  let match;
  // Skip the header and separator rows
  let rowIndex = 0;
  while ((match = rowRegex.exec(table)) !== null) {
    rowIndex++;
    if (rowIndex <= 2) continue; // Skip header and separator
    const triggers = match[1].trim();
    const path = match[2].trim().replace(/`/g, ""); // Strip Markdown backticks
    if (triggers && path && !triggers.startsWith("<!--")) {
      result.push({
        triggers: triggers.split("/").map((s) => s.trim()).filter(Boolean).concat(
          triggers.split(",").map((s) => s.trim()).filter(Boolean),
        ),
        path: path.replace(/^\//, ""), // Remove leading /
      });
    }
  }
  return result;
}

export default function (pi: ExtensionAPI) {
  // =========================================================================
  // Layer 1: System prompt injection — every turn
  // =========================================================================
  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt: event.systemPrompt + "\n\n" + buildRulesBlock(),
    };
  });

  // =========================================================================
  // Layer 2: Custom tool — umbrella_load_skills
  // =========================================================================
  pi.registerTool({
    name: "umbrella_load_skills",
    label: "Load Umbrella Skills",
    description:
      "Load the full content of SKILL.md files matching the given trigger keywords. " +
      "Call this at the start of every task after consulting the skill dispatcher " +
      "table in AGENTS.md (R0). Pass the trigger keywords from the user's request.",
    promptSnippet: "Load skill documentation matching the current task",
    promptGuidelines: [
      "Use umbrella_load_skills at the START of every task to load the skills the dispatcher selects (R0).",
      "Pass the trigger keywords from the user's request or AGENTS.md dispatcher: e.g. ['gitlink policy', 'task sync'].",
      "The tool returns the full SKILL.md content for every matching skill.",
      "The tool also loads the /charly-internals:git-workflow skill when the task involves git operations.",
    ],
    parameters: Type.Object({
      triggers: Type.Array(Type.String(), {
        description:
          "Keywords from the user's task that match the skill dispatcher trigger column. " +
          "One trigger per skill line. E.g. ['gitlink policy', 'PR landing', 'task verify'].",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const agentsMd = join(ctx.cwd, "AGENTS.md");
      let content: string;
      try {
        content = await readFile(agentsMd, "utf8");
      } catch {
        return {
          content: [{ type: "text", text: "Error: AGENTS.md not found at project root." }],
          details: { error: "AGENTS.md not found" },
        };
      }

      const dispatcher = parseDispatcherTable(content);
      if (dispatcher.length === 0) {
        return {
          content: [{ type: "text", text: "Error: Could not parse the skill dispatcher table from AGENTS.md." }],
          details: { error: "Dispatcher table not found" },
        };
      }

      // Match trigger keywords against dispatcher
      const matchedPaths = new Set<string>();
      const lowerTriggers = params.triggers.map((t) => t.toLowerCase());

      for (const entry of dispatcher) {
        for (const trigger of entry.triggers) {
          const tl = trigger.toLowerCase();
          for (const keyword of lowerTriggers) {
            if (tl.includes(keyword) || keyword.includes(tl)) {
              matchedPaths.add(entry.path);
              break;
            }
          }
        }
      }

      // Always include git-workflow when git operations are mentioned
      const gitKeywords = ["git", "push", "commit", "branch", "pr", "pull request", "merge", "sync", "gitlink", "pin"];
      const hasGit = lowerTriggers.some((t) => gitKeywords.some((g) => t.includes(g)));
      if (hasGit) {
        matchedPaths.add("charly-internals--git-workflow");
      }

      // Read each matching SKILL.md
      const results: string[] = [];
      for (const skillPath of matchedPaths) {
        // Convert dispatcher paths (e.g. /charly-internals:git-workflow) to
        // filesystem paths (e.g. .agents/skills/charly-internals--git-workflow/SKILL.md)
        const skillDir = skillPath
          .replace(/^\//, "")           // Remove leading /
          .replace(/:/g, "--");          // Convert : to -- (filesystem convention)
        const globalPath = join(ctx.cwd, ".agents", "skills", skillDir, "SKILL.md");
        try {
          const skillContent = await readFile(globalPath, "utf8");
          results.push(`=== ${skillDir}/SKILL.md ===\n${skillContent}`);
        } catch {
          results.push(`[SKILL NOT FOUND: ${skillPath} — tried ${globalPath}]`);
        }
      }

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                `No skills matched triggers: ${params.triggers.join(", ")}. ` +
                `Available dispatcher entries: ${dispatcher.length}. ` +
                `Try broader keywords or check AGENTS.md for the full list.`,
            },
          ],
          details: { matched: [], count: 0, dispatcherCount: dispatcher.length },
        };
      }

      return {
        content: [
          {
            type: "text",
            text:
              `Loaded ${results.length} skill(s) matching your triggers.\n\n` +
              results.join("\n\n"),
          },
        ],
        details: {
          matched: Array.from(matchedPaths),
          count: results.length,
          dispatcherCount: dispatcher.length,
        },
      };
    },
  });

  // =========================================================================
  // Mechanical gates: tool_call interception for bash
  // =========================================================================
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const command = event.input?.command;
    if (typeof command !== "string" || command.length === 0) return undefined;

    // The gate scripts expect the Claude Code PreToolUse input shape on
    // stdin: { "tool_input": { "command": "<command>" } }.
    const input = JSON.stringify({ tool_input: { command } });
    const tmp = join(
      tmpdir(),
      `umbrella-gate-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    await writeFile(tmp, input, "utf8");

    try {
      for (const rel of GATE_SCRIPTS) {
        const script = join(ctx.cwd, rel);
        try {
          await access(script);
        } catch {
          // Gate script absent (e.g. running pi from a subdirectory) — skip.
          continue;
        }

        let result;
        try {
          result = await pi.exec("bash", ["-c", `"${script}" < "${tmp}"`], {
            cwd: ctx.cwd,
          });
        } catch (err) {
          // Fail-open on unexpected execution errors; only the gate's own
          // exit 2 is the block signal.
          continue;
        }

        if (result.code === 2) {
          const detail = (result.stderr ?? "").trim();
          return {
            block: true,
            reason: `umbrella gate (${rel}) BLOCKED: ${detail || "command violates a git-workflow mechanic"}`,
          };
        }
      }
    } finally {
      await unlink(tmp).catch(() => {});
    }

    return undefined;
  });
}
