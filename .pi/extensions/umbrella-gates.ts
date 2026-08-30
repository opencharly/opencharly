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

/** Operating-principles + tool-usage complement injected every turn.
 *  Complements AGENTS.md (the authoritative rulebook, auto-loaded into
 *  context): references rules by name/section/skill, never re-states them,
 *  so it cannot drift from AGENTS.md. */
function buildRulesBlock(): string {
  return `## Operating principles

- **AGENTS.md is the authoritative rulebook.** Always follow the rules in
  AGENTS.md when writing or modifying new code, and always prioritize a clean
  architecture and fully tested and deduplicated code over anything else.
- **All decisions come from AGENTS.md.** When a choice is ambiguous, resolve it
  from AGENTS.md (and the skills it dispatches to) — never from habit,
  convenience, or an unstated assumption. If AGENTS.md does not answer, the
  decision is a blocker to surface, not a guess to make.
- **Goal-driven autonomous completion.** At the start of a task, write and
  activate a goal via \`create_goal\` (pi-goal) with clear success criteria,
  verification steps, and constraints — then loop autonomously until the goal
  is met. The goal is the completion contract: keep working through the todo
  list and sub-tasks without stopping to ask for permission at each step.
- **Completion is defined, not felt.** A task is finished ONLY when (a) every
  todo and sub-task is done and verified, OR (b) the agent encounters an issue
  that cannot be fixed solely from AGENTS.md — in which case stop and surface
  the blocker with the exact AGENTS.md gap. Never stop early because the work
  "seems done" or a step "looks optional".
- **Skills first (R0).** Before the first tool call of a task, load the
  dispatcher-selected skills via \`umbrella_load_skills\` (the dispatcher table
  is in AGENTS.md). Key skills: \`git-workflow\` (PR landing, pinning, sync),
  \`strict-policy\` (R1–R5 discipline), \`root-cause-analyzer\` (RCA every
  anomaly), \`agents\` (sub-agents, validator sessions).
- **RCA every anomaly (R1) — enforced, no exceptions.** Any failure, warning,
  or doc-vs-reality divergence gets root-cause analysis before remediation —
  never "pre-existing" / "out of scope" / "follow-up PR". An issue is not
  "handled" until its root cause is identified and fixed (or explicitly
  allowlisted with evidence). Load the \`root-cause-analyzer\` skill and follow
  its process.
- **ALL issues are fixed — pre-existing or not (R2).** Every issue surfaced
  during a task is fixed in the same working tree, no matter when it was
  introduced. "Pre-existing", "unrelated", "out of scope", and "follow-up PR"
  are FORBIDDEN classifications. A blocking issue is fixed in the same commit;
  a genuinely separable non-blocking issue joins its next thematic batch
  cutover immediately — never parked.
- **Skills are living documents — update them in the SAME change (R1).** Any
  code change that affects a skill, doc, comment, or memory claim updates that
  document in the same commit. A doc-vs-reality divergence discovered by ANY
  means is an incident: fix the stale claim in the same change, and sweep every
  sibling doc/skill/comment carrying the same false claim. Never ship a code
  change that leaves a skill describing the old behavior.
- **Spike on a check bed — never guess.** Any uncertainty about behavior,
  assumptions, or a fix's effect is settled by running a spike on a disposable
  check bed (the \`charly check\` beds) and verifying on a live system — never
  by blind or unverified guesses. If a claim cannot be proven live, it is not
  a claim yet: mark it as unverified and prove it before relying on it.
- **Prove the gate (R7).** Run \`task verify\` on the final tree and paste the
  output; a green \`git status\` proves nothing. Attribution tiers in AGENTS.md
  define what each confidence level requires.
- **Validator verdicts.** Read every validator BLOCK in full and fix ALL
  listed issues before the next push (see the \`git-workflow\` skill). A partial
  fix is a defective cycle.
- **Command hygiene.** Follow AGENTS.md's command-hygiene rules: bound output
  (\`grep -m N\`, redirect to file), never re-issue the same diagnostic in a
  loop, delegate heavy exploration to subagents.

## Tool usage — use the full surface

- \`todo\` — for ANY multi-step task (3+ steps): create tasks, mark
  in_progress before starting, complete immediately when done. Never batch
  completions. The todo list is the task's progress contract — keep it
  accurate until the goal is complete.
- \`create_goal\` / \`update_goal\` / \`get_goal\` (pi-goal) — write and activate
  the task goal at the start (success criteria, verification, constraints),
  update it as the task evolves, and check it before declaring completion.
  This is what enables fully automatic loop completion.
- \`subagent\` — delegate exploration, verification, and long-running
  investigation to keep the main context clean. Use \`subagent_wait\` to
  collect results.
- **Use subagents and fabric whenever possible.** Delegate heavy exploration,
  log archaeology, repo-wide greps, and long-running verification to a
  subagent that returns only a concise verdict + evidence paths. Use
  \`fabric_exec\` to batch independent tool calls into one program and to
  keep the main context small. The main agent plans, decides, and lands; the
  subagent digs. Never burn the main context on raw logs or repeated
  diagnostics.
- \`gh_pr_status\` — the PR verification primitive: \`check\` before
  opening/updating a PR, \`watch\` after pushing (its completion IS the wake).
  Never guess a validator verdict.
- \`umbrella_load_skills\` — R0: load the dispatcher-selected skills before the
  first tool call.
- \`memory_*\` — persist decisions, preferences, and session results
  (memory_write); search before re-deriving (memory_search).
- \`web_search\` / \`fetch_content\` (pi-web-access), \`fabric_exec\` (pi-fabric),
  \`create_goal\` (pi-goal), \`mcp.*\` — available; use when the task calls for
  them.
- \`charly check\` beds — the disposable live-verification primitive: run a
  spike on a check bed to settle any uncertainty about behavior or a fix's
  effect before relying on it (see the \`check\` and \`disposable\` skills).`;
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
        matchedPaths.add("charly-internals:git-workflow");
      }

      // Resolve plugin name -> marketplace source dir from the marketplace manifest.
      // The `.agents/skills/` symlink farm was deleted in the marketplace cutover;
      // the corpus lives in the `marketplace/` submodule (HARNESS-PARITY.md).
      const marketplaceRoot = join(ctx.cwd, "marketplace");
      const pluginSources = new Map<string, string>();
      try {
        const manifest = JSON.parse(
          await readFile(join(marketplaceRoot, ".claude-plugin", "marketplace.json"), "utf8"),
        );
        for (const plugin of manifest.plugins ?? []) {
          pluginSources.set(plugin.name, String(plugin.source).replace(/^\.\//, ""));
        }
      } catch {
        // manifest unreadable — fall back to the `charly-<dir>` naming convention below
      }

      // Read each matching SKILL.md
      const results: string[] = [];
      for (const skillPath of matchedPaths) {
        // Convert dispatcher paths (e.g. /charly-internals:git-workflow) to marketplace
        // paths (e.g. marketplace/internals/skills/git-workflow/SKILL.md)
        const [plugin, skill] = skillPath.replace(/^\//, "").split(":");
        const sourceDir = pluginSources.get(plugin) ?? plugin.replace(/^charly-/, "");
        const globalPath = join(marketplaceRoot, sourceDir, "skills", skill, "SKILL.md");
        try {
          const skillContent = await readFile(globalPath, "utf8");
          results.push(`=== ${plugin}:${skill}/SKILL.md ===\n${skillContent}`);
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
