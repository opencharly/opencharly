/**
 * charly-gates.ts — Pi extension that enforces OpenCharly's git-workflow
 * command mechanics AND injects engineering rules into the system prompt.
 *
 * ## Mechanical gates (tool_call interception)
 *
 * Pi has no hooks system (unlike Claude Code / reasonix / kimi). This
 * extension is the Pi equivalent of the `.reasonix`/kimi `PreToolUse(Bash)`
 * wiring of `.claude/hooks/pre-commit-gate.sh` and `pre-push-gate.sh`. It
 * intercepts every `bash` tool call and runs both gate scripts against the
 * command, blocking the call when a gate exits 2.
 *
 * The gates guard ONLY deterministic command mechanics (per the project
 * rulebook "Hooks" doctrine):
 *   - `git commit --no-verify` / `-n` / `core.hooksPath` bypass
 *   - untokenizable commit commands
 *   - configured Go lint failures for staged Go modules
 *   - new-or-grown `charly/*_aliases.go` files (ZERO-ALIASES gate)
 *   - `git push --force` / `--force-with-lease` / `-f`
 *   - a direct push to `main`
 *
 * Attribution identity/confidence, change class, CHANGELOG coverage,
 * architecture, and R0–R10 proof are judged once by the fresh pr-validator,
 * never here. Hooks guard mechanics; agents judge policy and evidence.
 *
 * ## System prompt injection (before_agent_start)
 *
 * Injects condensed R0–R10 rules, PR body requirements, and attribution
 * tiers into the system prompt every turn — AND the full SOUL.md identity
 * (read from the project root) at every turn, so the injected text is the
 * soul itself, not a pointer to it. This survives compaction because it is
 * re-injected before every LLM call.
 *
 * ## Custom tools
 *
 * - charly_load_skills: reads SKILL.md files matching trigger keywords
 * - charly_worktree_create: creates a linked worktree with the scoped module set + binary
 * - charly_worktree_remove: removes a worktree and its branch
 *
 * The gate scripts self-gate on a fast path (they exit 0 for commands that
 * do not mention `git commit` / `git push`), so running them for every bash
 * call is cheap and matches the doctrine exactly.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { writeFile, unlink, access, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

/** Gate scripts, relative to the project root (ctx.cwd). */
const GATE_SCRIPTS = [
  ".claude/hooks/pre-commit-gate.sh",
  ".claude/hooks/pre-push-gate.sh",
];

/**
 * The modules a session worktree ALWAYS materializes — the two the pi harness's own tools and
 * gates read, and nothing else:
 *
 *   - `charly`      — the binary is built from it (`charly/scripts/bootstrap-charly.sh`),
 *                     and `charly task policy-b` (the pre-commit hook's first step) reads
 *                     its `box/*` gitlinks.
 *   - `marketplace` — the R0 skill corpus `charly_load_skills` reads, and the
 *                     `DISPATCHER.md` the harness-config gate resolves its rows against.
 *
 * Everything else the umbrella carries is a submodule a cutover needs only if it actually
 * reads or edits it, and is named through the tool's `modules` argument, which ADDS to this set.
 * MEASURED: an eager `--init --recursive` over all 425 costs 376 MB of worktree-PRIVATE module
 * objects and ~0.86 s per module, while this scoped set costs 1 MB and ~1.4 s — and the repo's
 * own pin gate (`scripts/check-verify-submodules.mjs`) documents a session worktree as
 * materializing 1 of 424 paths. `charly` can never be dropped: step 4 builds the worktree binary
 * from `charly/scripts/bootstrap-charly.sh`.
 */
const REQUIRED_WORKTREE_MODULES = ["charly", "marketplace"];

/** The condensed engineering rules injected every turn. */
function buildRulesBlock(): string {
  return `## Charly Engineering Rules

### You are charly
You are charly. Who charly is — the identity behind these rules — lives in SOUL.md:
read it first and keep its character as your own. These rules are how that character works.

### R0 — Skills First
Before the first tool call of every task, use \`charly_load_skills\` to load the
SKILL.md files whose trigger column matches the task. The dispatcher table is in
AGENTS.md. Load ALL matching skills before acting.

### R1 — RCA Every Anomaly
Every failure, warning, or doc-vs-reality divergence triggers the
root-cause-analyzer process before any remediation. Skills are living
documents: any code change that affects a skill, doc, comment, or memory
claim updates that document in the SAME change, and sweeps every sibling
carrying the same false claim.

### R2 — Finish the Cutover
Every issue surfaced during a task is fixed — pre-existing or not. No
"pre-existing", "unrelated", "out of scope", or "follow-up PR"
classifications. A blocking issue is fixed in the same commit; a genuinely
separable non-blocking issue joins its next thematic batch cutover
immediately — never parked.

### R2a — Delegate Heavy Work
Delegate heavy exploration, log archaeology, repo-wide greps, and
long-running verification to a subagent that returns only a concise verdict
+ evidence paths. The main agent plans, decides, and lands; the subagent digs.
Never burn the main context on raw logs or repeated diagnostics. (Owner: the
rulebook's "Agents, Workflows & Teams".)

### R3 — No Duplication
One canonical implementation owns each behavior. Extract shared mechanisms on
the second occurrence.

### R4 — No Workarounds
No sleeps, blind retries, magic numbers, manual infrastructure commands, or
fallback branches. Use \`charly\` or fix the missing capability.

### R4a — Fix the Product First
Documentation never routes around a defect. Fix the code before the prose.

### R5 — Delete Legacy Completely
Hard cutover removes the old path and every stale reference, shim, alias, and
TODO in one commit.

### R6 — Git Safety
Check \`git status\` and stashes before destructive actions. No force-push,
pushed-history rewrite, hook bypass, or direct push to \`main\`.

### R7 — Prove Behavior, Not Compilation
A green compile proves nothing. Run the changed path live and retain output.

### R7a — Live or Skip — Never Fake a Live Service
Any test, harness, or gate crossing a live-service boundary (a \`gh\` / GitHub
API call, an LLM or provider endpoint, a network or \`charly\` call) runs against
the REAL service, or SKIPS cleanly when its credential/endpoint is absent —
never a mock, stub, or fake of that boundary. A fake certifies the behaviour its
author imagined, not what the service does, and hides a real break behind green.
Gate the skip on the real credential (\`LIVE_*\` unset → skip, visibly reported).

### R8 — Preserve Emitted Artifacts
Validate labels, plans, configs, schemas, and generated files at their actual
boundary.

### R9 — Binary Equals Source
Build with \`scripts/bootstrap-charly.sh\`, invoke through \`bin/\`, verify version.

### R10 — Fresh Disposable Proof
Verify only on targets explicitly marked \`disposable: true\`. Fresh rebuild
from the final committed tree. Pasted output, zero warnings.

### PR Body Requirements
Every PR body must contain, in this order:
1. **## Summary** — what changed and why
2. **## How tested** — pasted command + output for every verification step
3. **## Rulebook compliance** — a row for every applicable rule (R0-R10)
4. **## Change classification** — change class, R10 gate, attribution tier
5. **Assisted-by: ...** — the italic footer as the FINAL line

### Attribution Tiers
| Confidence | Required proof |
|---|---|
| \`fully tested and validated\` | Every runtime standard + fresh-rebuild R10 on every affected disposable target; changed paths executed live |
| \`analysed on a live system\` | Changed runtime path ran live with retained output; full R10 did not pass |
| \`documentation reviewed\` | Docs-only change class (forbidden if code/config changed) |
| \`syntax check only\` | Compile/unit/dry-run only — R10 incomplete, do not commit |
| \`theoretical suggestion\` | No validation — never ship |

### Validator Verdict Discipline
Every validator BLOCK must be read in full and ALL listed issues fixed before
the next push. A partial fix that addresses only one of several findings is a
defective cycle.

### Waiting — always leave a watcher armed
Never hand-poll and never block a turn on a long wait. The \`watch\` extension arms the
harness-neutral watcher family and delivers every event as a user turn:
- GitHub (PRs + issues): auto-armed at \`session_start\` from \`.pi/watch.items\`
  (\`owner/repo#num\`). Add a scope, then \`watch_arm\` with \`action: "restart"\`.
- R10 beds: \`watch_arm\` with \`action: "bed"\` runs \`charly check run <bed>\` in the
  background through \`scripts/check-bed-watch.sh\` and wakes you with its exit code and
  newest \`summary.yml\`; the authoritative signal is the EXIT CODE (3 = prereq SKIP).
- \`watch_arm\` with \`action: "status"\` reports what is armed.
A wake is an ADDITION to the ledger, never a reset.`;
}

/**
 * Parse the curated skill dispatcher table from AGENTS.md.
 *
 * The curated table lives under `### Skill Dispatcher` (section `## R0. Skills first`)
 * and is deliberately OUTSIDE the `<!-- BEGIN/END GENERATED SKILL DISPATCHER -->`
 * markers — the markers exist only in the generated `marketplace/DISPATCHER.md`, whose
 * region is the FULL table, not this hand-curated subset (opencharly/opencharly#379).
 * So: prefer the marked region when present (a generated table), else the
 * `### Skill Dispatcher` section. A skill cell may hold SEVERAL `/charly-...` refs,
 * split on `,`.
 */
function parseDispatcherTable(content: string): Array<{ triggers: string[]; paths: string[] }> {
  const result: Array<{ triggers: string[]; paths: string[] }> = [];

  let table: string | null = null;
  const markerStart = content.indexOf("<!-- BEGIN GENERATED SKILL DISPATCHER -->");
  const markerEnd = content.indexOf("<!-- END GENERATED SKILL DISPATCHER -->");
  if (markerStart !== -1 && markerEnd !== -1 && markerEnd > markerStart) {
    table = content.slice(markerStart, markerEnd);
  } else {
    // Fall back to the curated `### Skill Dispatcher` section. The section opens with a
    // prose paragraph BEFORE its table, so skip to the first table row, then take rows
    // until the first line that is neither a table row nor blank.
    const heading = content.search(/^###\s+Skill Dispatcher\s*$/m);
    if (heading === -1) return result;
    const lines = content.slice(heading).split("\n");
    let i = 1;
    while (i < lines.length && !lines[i].trim().startsWith("|")) i++;
    const rows: string[] = [];
    for (; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.startsWith("|")) { rows.push(lines[i]); continue; }
      if (t === "") continue;
      break;
    }
    table = rows.join("\n");
  }
  if (!table) return result;

  // Rows are `| Trigger | Skill to load |`.
  const rowRegex = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  let match;
  let rowIndex = 0;
  while ((match = rowRegex.exec(table)) !== null) {
    rowIndex++;
    if (rowIndex <= 2) continue; // header + separator
    const triggers = match[1].trim();
    const paths = match[2]
      .split(",")
      .map((p) => p.trim().replace(/`/g, "").replace(/^\//, ""))
      .filter((p) => p.startsWith("charly-"));
    if (triggers && paths.length && !triggers.startsWith("<!--")) {
      result.push({
        triggers: triggers
          .split("/")
          .map((s) => s.trim())
          .filter(Boolean)
          .concat(triggers.split(",").map((s) => s.trim()).filter(Boolean)),
        paths,
      });
    }
  }
  return result;
}

/** Read the project-root SOUL.md — the identity every charly agent works as. */
async function readSoul(cwd: string): Promise<string | null> {
  try {
    return await readFile(join(cwd, "SOUL.md"), "utf8");
  } catch {
    return null;
  }
}

export default function (pi: ExtensionAPI) {
  // =========================================================================
  // Layer 1: System prompt injection — every turn
  // =========================================================================
  pi.on("before_agent_start", async (event, ctx) => {
    const soul = await readSoul(ctx.cwd);
    const soulBlock = soul
      ? `## Who you are — SOUL.md\n\n${soul.trim()}\n`
      : `## Who you are — SOUL.md\n\n⚠ SOUL.md is NOT present at the project root, so the identity is ` +
        `NOT injected this session. That is the opencharly/opencharly#356 content-loss signature — ` +
        `restore SOUL.md at the umbrella root (opencharly/opencharly#357).\n`;
    return {
      systemPrompt: event.systemPrompt + "\n\n" + soulBlock + "\n" + buildRulesBlock(),
    };
  });

  // =========================================================================
  // Layer 2: Custom tool — charly_load_skills
  // =========================================================================
  pi.registerTool({
    name: "charly_load_skills",
    label: "Load Charly Skills",
    description:
      "Load the full content of SKILL.md files matching the given trigger keywords. " +
      "Call this at the start of every task after consulting the skill dispatcher " +
      "table in AGENTS.md (R0). Pass the trigger keywords from the user's request.",
    promptSnippet: "Load skill documentation matching the current task",
    promptGuidelines: [
      "Use charly_load_skills at the START of every task to load the skills the dispatcher selects (R0).",
      "Pass the trigger keywords from the user's request or AGENTS.md dispatcher: e.g. ['charly box build', 'Containerfile'].",
      "The tool returns the full SKILL.md content for every matching skill.",
      "The tool also loads the /charly-internals:git-workflow skill when the task involves git operations.",
    ],
    parameters: Type.Object({
      triggers: Type.Array(Type.String(), {
        description:
          "Keywords from the user's task that match the skill dispatcher trigger column. " +
          "One trigger per skill line. E.g. ['charly box build', 'Go source work', 'Fedora images'].",
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
              for (const p of entry.paths) matchedPaths.add(p);
              break;
            }
          }
        }
      }

      // Always include git-workflow when git operations are mentioned
      const gitKeywords = ["git", "push", "commit", "branch", "pr", "pull request", "merge", "worktree"];
      const hasGit = lowerTriggers.some((t) => gitKeywords.some((g) => t.includes(g)));
      if (hasGit) {
        matchedPaths.add("charly-internals:git-workflow");
      }

      // Read each matching SKILL.md. Dispatcher entries are canonical
      // `/charly-<family>:<skill>` references; the corpus lives in the pinned
      // `marketplace/` submodule at `marketplace/<family>/skills/<skill>/SKILL.md`.
      // (The former `.agents/skills/<family>--<skill>/SKILL.md` farm was deleted; the
      // path was re-pointed at it by the harness-absorb commit and was broken until
      // this fix — see CHANGELOG.)
      const results: string[] = [];
      for (const skillPath of matchedPaths) {
        const ref = skillPath.replace(/^\//, "");
        const m = ref.match(/^charly-([^:]+):(.+)$/);
        const globalPath = m
          ? join(ctx.cwd, "marketplace", m[1], "skills", m[2], "SKILL.md")
          : join(ctx.cwd, "marketplace", ref, "SKILL.md");
        try {
          const skillContent = await readFile(globalPath, "utf8");
          results.push(`=== ${ref}/SKILL.md ===\n${skillContent}`);
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
  // Layer 7: Custom tool — charly_worktree_create
  // =========================================================================
  const _worktrees: Array<{ slug: string; path: string; branch: string }> = [];

  pi.registerTool({
    name: "charly_worktree_create",
    label: "Create Worktree",
    description:
      "Create a linked worktree for a new feat branch, materialize the modules the cutover " +
      "needs, and build the worktree-local binary. Use this at the start of every cutover " +
      "session. It isolates the MUTABLE half of the session (working tree, index, branch, " +
      "its own binary) while sharing the IMMUTABLE half (object stores), so several sessions " +
      "work from the same umbrella cheaply: ~1.4 s and a few MB, not the ~6 min and ~600 MB " +
      "an eager --init --recursive over all 425 submodules costs.",
    promptSnippet: "Create a worktree for a new feature branch",
    promptGuidelines: [
      "Use charly_worktree_create at the START of every cutover to create an isolated worktree.",
      "Pass a URL-safe kebab-case slug (e.g. 'bump-gitlinks' or 'fix-schema-typo').",
      "The tool fetches origin, creates a feat/<slug> branch off origin/main, materializes the module set, and builds the binary.",
      "Only the modules a cutover actually needs are materialized: `charly` and `marketplace` " +
      "are ALWAYS present (the binary build and the skill corpus need them) and `modules` ADDS " +
      "to that set. Never materialize the whole submodule graph 'just in case': the other 423 " +
      "stay unmaterialized and can be added later without recreating the worktree.",
      "Use charly_worktree_remove when done; `charly task prune` reaps the worktrees whose PR already merged.",
    ],
    parameters: Type.Object({
      slug: Type.String({
        description: "URL-safe kebab-case slug for the branch and worktree directory. E.g. 'bump-gitlinks'.",
      }),
      modules: Type.Optional(
        Type.String({
          description:
            "Comma-separated submodule paths to materialize IN ADDITION to the required " +
            "`charly,marketplace` — e.g. 'box/fedora' or 'docs'. Materialize only what this " +
            "cutover reads or edits; anything else is a worktree-private copy of the graph.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const slug = params.slug.replace(/[^a-z0-9-]/g, "_");
      // AGENTS.md rule 2 / "The development model": a session worktree lives at
      // `<umbrella>/.worktrees/<slug>/` (NOT `.claude/worktrees/`).
      const worktreePath = join(ctx.cwd, ".worktrees", slug);
      const branch = `feat/${slug}`;

      // Check if worktree already exists
      if (existsSync(worktreePath)) {
        return {
          content: [{ type: "text", text: `Worktree already exists at ${worktreePath}.` }],
          details: { path: worktreePath, branch, exists: true },
        };
      }

      try {
        // Step 1: Fetch and ff main
        await pi.exec("git", ["fetch", "origin", "--prune", "--tags"], { cwd: ctx.cwd });

        // Step 2: Create worktree with branch
        await pi.exec("git", ["worktree", "add", worktreePath, "-b", branch, "origin/main"], { cwd: ctx.cwd });

        // Step 3: materialize ONLY the modules this cutover needs — never the whole graph.
        //
        // MEASURED (2026-10-06, on this 425-submodule umbrella): the former
        // `git submodule update --init --recursive` cloned every submodule into a
        // worktree-PRIVATE object store — 376 MB per worktree at ~0.86 s per module, none
        // of it shared with the main checkout. A worktree that materializes nothing is
        // 3.8 MB in 0.016 s; the repo's own pin gate documents a session worktree as
        // materializing 1 of 424 paths; and every gate that runs on a commit here
        // (hooks/pre-commit, `charly task policy-b`, `charly task self-test`,
        // scripts/check-*.mjs) passes with 2 of 425 materialized. `--reference` makes the
        // clone BORROW the main checkout's objects through an `alternates` file instead of
        // copying them (marketplace measured: 1 MB borrowed vs 7 MB copied, 0.5 s).
        const requested = (params.modules ?? "")
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean);
        const modules = [...new Set([...REQUIRED_WORKTREE_MODULES, ...requested])];
        let borrowed = 0;
        for (const modulePath of modules) {
          const reference = join(ctx.cwd, ".git", "modules", modulePath);
          const args = ["submodule", "update", "--init"];
          // Borrow the main checkout's objects when it has them. The guard is not decoration: in a
          // NESTED worktree (a session rooted in one, as a live run here was) `ctx.cwd/.git` is a
          // FILE, so no reference resolves and the clone fetches its own objects — hence the
          // count reported below rather than an unconditional "borrowed" claim.
          if (existsSync(reference)) {
            args.push("--reference", reference);
            borrowed += 1;
          }
          args.push("--", modulePath);
          await pi.exec("git", args, { cwd: worktreePath });
        }

        // Step 4: Build the worktree-local binary (the ONE non-charly entrypoint).
        await pi.exec("bash", ["charly/scripts/bootstrap-charly.sh"], { cwd: worktreePath });

        // Record for cleanup
        _worktrees.push({ slug, path: worktreePath, branch });

        return {
          content: [
            {
              type: "text",
              text:
                `Worktree created at ${worktreePath} on branch ${branch}.\n` +
                `- Binary built at ${worktreePath}/charly/bin/charly\n` +
                `- Modules materialized: ${modules.join(", ")} (${borrowed}/${modules.length} borrowing the main checkout's objects)\n` +
                `- The other submodules stay unmaterialized. Read one of them with:\n` +
                `    git -C ${worktreePath} submodule update --init --reference ${join(ctx.cwd, ".git", "modules")}/<path> <path>\n` +
                `- Use \`cd ${worktreePath}\` to work in this branch\n` +
                `- Use charly_worktree_remove when done`,
            },
          ],
          details: { path: worktreePath, branch, slug },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error creating worktree: ${msg}` }],
          details: { error: msg },
        };
      }
    },
  });

  // =========================================================================
  // Layer 7: Custom tool — charly_worktree_remove
  // =========================================================================
  pi.registerTool({
    name: "charly_worktree_remove",
    label: "Remove Worktree",
    description:
      "Remove a previously created worktree and its feat branch. " +
      "Use this after the PR lands and the branch is merged.",
    promptSnippet: "Remove a worktree and its branch",
    parameters: Type.Object({
      slug: Type.String({
        description: "The slug of the worktree to remove (same as used in charly_worktree_create).",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const slug = params.slug.replace(/[^a-z0-9-]/g, "_");
      // Mirrors charly_worktree_create: `<umbrella>/.worktrees/<slug>/` (rule 2).
      const worktreePath = join(ctx.cwd, ".worktrees", slug);
      const branch = `feat/${slug}`;

      const errors: string[] = [];

      // Remove worktree
      try {
        await pi.exec("git", ["worktree", "remove", worktreePath], { cwd: ctx.cwd });
      } catch (err) {
        // Try force removal
        try {
          await pi.exec("git", ["worktree", "remove", "--force", worktreePath], { cwd: ctx.cwd });
        } catch (err2) {
          errors.push(`worktree remove: ${err2 instanceof Error ? err2.message : String(err2)}`);
        }
      }

      // Delete branch (only if it's fully merged)
      try {
        const merged = await pi.exec("git", ["branch", "--merged", "origin/main"], { cwd: ctx.cwd });
        if (merged.stdout.includes(branch)) {
          await pi.exec("git", ["branch", "-d", branch], { cwd: ctx.cwd });
        }
      } catch {
        // Branch may already be deleted
      }

      // Remove from tracking
      const idx = _worktrees.findIndex((w) => w.slug === slug);
      if (idx !== -1) _worktrees.splice(idx, 1);

      if (errors.length > 0) {
        return {
          content: [{ type: "text", text: `Worktree removal completed with warnings:\n${errors.join("\n")}` }],
          details: { slug, errors },
        };
      }

      return {
        content: [{ type: "text", text: `Worktree ${worktreePath} and branch ${branch} removed.` }],
        details: { slug, path: worktreePath, branch },
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
      `charly-gate-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    await writeFile(tmp, input, "utf8");

    try {
      for (const rel of GATE_SCRIPTS) {
        const script = join(ctx.cwd, rel);
        let scriptPresent = true;
        try {
          await access(script);
        } catch {
          scriptPresent = false;
        }
        if (!scriptPresent) {
          // FAIL CLOSED (T3/R4): the gate cannot run because its script is absent —
          // a wiring that silently proceeds (continue) is a bypass path. Block,
          // naming the missing script.
          return {
            block: true,
            reason: `charly gate (${rel}) is absent at ${script} — failing closed: the gate cannot run`,
          };
        }

        let result;
        try {
          result = await pi.exec("bash", ["-c", `"${script}" < "${tmp}"`], {
            cwd: ctx.cwd,
          });
        } catch (err) {
          // FAIL CLOSED (T3/R4): an unexpected execution error means the gate
          // could not run — a wiring that silently proceeds on its own script's
          // failure is a bypass path. Block, naming the error.
          return {
            block: true,
            reason: `charly gate (${rel}) could not run — failing closed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          };
        }

        if (result.code === 2) {
          const detail = (result.stderr ?? "").trim();
          return {
            block: true,
            reason: `charly gate (${rel}) BLOCKED: ${detail || "command violates a git-workflow mechanic"}`,
          };
        }
        // Any OTHER non-zero exit is also a gate failure (not a clean pass):
        // the gate scripts are exit-0 (allow) / exit-2 (block); anything else
        // is a broken gate and must fail CLOSED.
        if (result.code !== 0) {
          const detail = (result.stderr ?? "").trim();
          return {
            block: true,
            reason: `charly gate (${rel}) exited ${result.code} (not 0/2) — failing closed: ${detail}`,
          };
        }
      }
    } finally {
      await unlink(tmp).catch(() => {});
    }

    return undefined;
  });
}