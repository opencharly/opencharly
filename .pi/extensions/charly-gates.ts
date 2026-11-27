/**
 * charly-gates.ts — Pi extension that enforces OpenCharly's git-workflow
 * command mechanics AND injects engineering rules into the system prompt.
 *
 * ## Mechanical gates (tool_call interception)
 *
 * Pi has no hooks system (unlike Claude Code / kimi). This
 * extension is the Pi equivalent of the kimi `PreToolUse(Bash)`
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
 * architecture, and R0–R12 proof are judged once by the fresh pr-validator,
 * never here. Hooks guard mechanics; agents judge policy and evidence.
 *
 * ## System prompt injection (before_agent_start)
 *
 * Injects the rulebook sections (R1–R12, "Commit, push, land", the attribution
 * tiers) READ from the project-root AGENTS.md every turn — AND the full SOUL.md identity
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
import { existsSync, realpathSync } from "node:fs";
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
 *                     and `charly task pin-check` (the pre-commit hook's first step) reads
 *                     its `box/*` gitlinks.
 *   - `marketplace` — the R0 skill corpus `charly_load_skills` reads, and the
 *                     `DISPATCHER.md` the harness-config gate resolves its rows against.
 *
 * Everything else the umbrella carries is a submodule a cutover needs only if it actually
 * reads or edits it, and is named through the tool's `modules` argument, which ADDS to this set.
 * MEASURED (2026-10-06, umbrella tree `9501fb0`): an eager `--init --recursive` over the whole
 * submodule graph costs 376 MB of worktree-PRIVATE module objects and ~0.86 s per module, while
 * this scoped set costs 1 MB and ~1.4 s. `charly` can never be dropped: step 4 builds the
 * worktree binary from `charly/scripts/bootstrap-charly.sh`.
 *
 * A materialized module also carries its OWN nested level (step 3b). That is the
 * post-condition `charly task init` guarantees (opencharly/opencharly#647) and the
 * umbrella's gate now ASSERTS (opencharly/opencharly#710). The umbrella's currency
 * report cannot SEE the absence: a twin's currency is judged from the twin's REMOTE
 * alone and the report never asks whether the checkout EXISTS, so while that remote
 * has not moved the twin reads `cur` and the report exits 0 (MEASURED in the
 * reproduced defect state: `0 of 411 pin(s) NOT current [411 cur]` (2026-10-26)). The checkout is
 * needed only to CLASSIFY a twin whose remote HAS moved, and only then does the report
 * print `differs (no checkout of box/cachyos to judge ancestry)` — the twin's class
 * left UNDETERMINED — without the checkout the report cannot say whether the
 * difference is `behind`, `unmerged` or `not-on-the-served-line`, and its own state
 * names the reason it cannot; at the VERDICT level the twin counts as not-current,
 * exactly as a real divergence does.
 * The gate asserts the post-condition itself, precisely because the report cannot. An
 * UNINITIALIZED module at the umbrella level stays a NOTICE — its pin is still audited
 * from the index — but a MATERIALIZED module's nested level is not optional.
 */
const REQUIRED_WORKTREE_MODULES = ["charly", "marketplace"];

/**
 * The rulebook sections re-injected every turn so they survive compaction. They are READ from
 * the project-root AGENTS.md, never copied into this file (R2: a rule is stated once — the
 * hand-copied block this replaces had drifted to a retired numbering).
 */
const INJECTED_SECTIONS = [
  "The ground-truth rules R1–R12",
  "Commit, push, land",
  "AI Attribution (Fedora Policy Compliant)",
];

/** One `## <heading>` section of a markdown file, up to the next `#`/`##` heading. */
export function extractSection(md: string, heading: string): string | null {
  const lines = md.split("\n");
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
  if (end === -1) end = lines.length;
  return lines.slice(start, end).join("\n").trim();
}

/** The pi binding of R0 plus the canonical rulebook sections, read from AGENTS.md. */
async function readRulesBlock(cwd: string): Promise<string> {
  const header =
    "## Charly Engineering Rules — from AGENTS.md\n\n" +
    "### R0 — Skills First (pi binding)\n" +
    "Before the first tool call of every task, use `charly_load_skills` to load the SKILL.md files " +
    "whose trigger column matches the task (the dispatcher table is in AGENTS.md). Load ALL matching " +
    "skills before acting.";
  let md: string;
  try {
    md = await readFile(join(cwd, "AGENTS.md"), "utf8");
  } catch {
    return `${header}\n\n⚠ AGENTS.md is NOT present at the project root, so the rules are NOT injected this session.\n`;
  }
  const parts = INJECTED_SECTIONS.map(
    (h) =>
      extractSection(md, h) ??
      `⚠ AGENTS.md has no "## ${h}" section: the rulebook changed shape. Fix INJECTED_SECTIONS in .pi/extensions/charly-gates.ts.`,
  );
  return [header, ...parts].join("\n\n") + "\n";
}

/**
 * The WORD tokens of a phrase: lowercased runs of alphanumerics, so punctuation, backticks,
 * `/` and `,` are all separators. Used by BOTH halves of trigger matching so a keyword and a
 * dispatcher cell are compared on the same footing.
 *
 * WHY NOT SUBSTRINGS (R1, measured). Matching used to be a bidirectional substring test over
 * chunks produced by splitting a dispatcher cell on `/` and `,`, so a chunk could be a single
 * token taken out of a path: the cell of the `local:`/`vm` row contains `~/.config/charly/`, so
 * splitting it yields the chunk `charly`, and `keyword.includes("charly")` is true for almost
 * every keyword the rulebook uses. MEASURED against the shipped AGENTS.md: `charly box build`
 * pulled in `charly-local:local-deploy` and `charly-vm:vm` on top of its own three refs. (Spiking
 * the generated `marketplace/DISPATCHER.md` as an alternative table showed the same class one step
 * further: a two-letter chunk `nc`, lifted out of a package list, matched the word `maintenance`.)
 * Matching is now token-wise: every token of the caller's phrase must be a PREFIX of a token in
 * the cell (see `phraseMatches`), so no fragment can stand in for a whole trigger.
 */
function tokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Does a trigger PHRASE describe these TEXT tokens? True when every token of the phrase is a
 * prefix of some token of the text, so `sweep` -> `sweeps`, `config` -> `configuration` and
 * `session` -> `sessions`. The tolerance runs ONE way on purpose: the text is the reference
 * spelling (the dispatcher column is what a caller copies a phrase out of), the phrase is what
 * the caller typed. A phrase with no tokens never matches — otherwise the empty prefix would
 * describe every row.
 */
function phraseMatches(phraseTokens: string[], textTokens: string[]): boolean {
  return phraseTokens.length > 0 && phraseTokens.every((t) => textTokens.some((c) => c.startsWith(t)));
}

/**
 * Parse the curated skill dispatcher table from AGENTS.md.
 *
 * The curated table lives under a `Skill Dispatcher` heading and is deliberately OUTSIDE
 * the `<!-- BEGIN/END GENERATED SKILL DISPATCHER -->` markers — the markers exist only in
 * the generated `marketplace/DISPATCHER.md`, whose region is the FULL table, not this
 * hand-curated subset (opencharly/opencharly#379). So: prefer the marked region when
 * present (a generated table), else the `Skill Dispatcher` section.
 *
 * THE HEADING LEVEL IS NOT AN ASSUMPTION (R1, measured). This parse once matched the
 * literal `### Skill Dispatcher` and the rulebook then promoted the table to a top-level
 * `## Skill Dispatcher` section: every call answered "Could not parse the skill dispatcher
 * table", so R0 could not be discharged through this tool at all, and no gate noticed
 * (a text assertion over the extension cannot see a rulebook reshape; the missed control
 * is the FIRED load-skills assertion in `scripts/check-pi-gates.mjs`). Match the heading
 * at ANY level. A skill cell may hold SEVERAL `/charly-...` refs, split on `,`.
 */
function parseDispatcherTable(content: string): Array<{ trigger: string; paths: string[] }> {
  const result: Array<{ trigger: string; paths: string[] }> = [];

  let table: string | null = null;
  const markerStart = content.indexOf("<!-- BEGIN GENERATED SKILL DISPATCHER -->");
  const markerEnd = content.indexOf("<!-- END GENERATED SKILL DISPATCHER -->");
  if (markerStart !== -1 && markerEnd !== -1 && markerEnd > markerStart) {
    table = content.slice(markerStart, markerEnd);
  } else {
    // Fall back to the curated `Skill Dispatcher` section. The section opens with a
    // prose paragraph BEFORE its table, so skip to the first table row, then take rows
    // until the first line that is neither a table row nor blank. `#{1,6}` on purpose:
    // see the function comment — a fixed level is what broke R0.
    const heading = content.search(/^#{1,6}\s+Skill Dispatcher\s*$/m);
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
      result.push({ trigger: triggers, paths });
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
      systemPrompt: event.systemPrompt + "\n\n" + soulBlock + "\n" + (await readRulesBlock(ctx.cwd)),
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

      // Match trigger keywords against dispatcher entries. A row matches when EVERY token of
      // the caller's phrase is a prefix of a token in its trigger cell — never on a fragment,
      // which is what the retired bidirectional substring test did.
      const matchedPaths = new Set<string>();
      const keywordTokens = params.triggers
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => tokens(t));

      for (const entry of dispatcher) {
        const cellTokens = tokens(entry.trigger);
        if (keywordTokens.some((k) => phraseMatches(k, cellTokens))) {
          for (const p of entry.paths) matchedPaths.add(p);
        }
      }

      // Always include git-workflow when git operations are mentioned. The vocabulary below is a
      // CLOSED set of words, so the phrase must CARRY one of them as a word: `prepare a pull
      // request` carries `pull` and `request`, while `improve`, `process` and `prepare` carry none
      // of them — a PREFIX test here would force-load git-workflow for any phrase that merely
      // begins with the two letters `pr`. An inflected form outside this list (`worktrees`) is not
      // lost: the dispatcher row itself carries it, and the row matcher is where inflection lives.
      const gitKeywords = ["git", "push", "commit", "branch", "pr", "pull request", "merge", "worktree"];
      const hasGit = keywordTokens.some((k) => gitKeywords.some((g) => tokens(g).every((t) => k.includes(t))));
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
      "an eager --init --recursive over the whole submodule graph costs.",
    promptSnippet: "Create a worktree for a new feature branch",
    promptGuidelines: [
      "Use charly_worktree_create at the START of every cutover to create an isolated worktree.",
      "Pass a URL-safe kebab-case slug (e.g. 'bump-gitlinks' or 'fix-schema-typo').",
      "The tool fetches origin, creates a feat/<slug> branch off origin/main, materializes the module set, and builds the binary.",
      "Only the modules a cutover actually needs are materialized: `charly` and `marketplace` " +
      "are ALWAYS present (the binary build and the skill corpus need them) and `modules` ADDS " +
      "to that set. Never materialize the whole submodule graph 'just in case': the rest " +
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
        // MEASURED (2026-10-06, umbrella tree `9501fb0`): the former
        // `git submodule update --init --recursive` cloned every submodule into a
        // worktree-PRIVATE object store — 376 MB per worktree at ~0.86 s per module, none
        // of it shared with the main checkout. A worktree that materializes nothing is
        // 3.8 MB in 0.019 s; and every gate that runs on a commit here
        // (hooks/pre-commit, `charly task pin-check`, `charly task self-test`,
        // scripts/check-*.mjs) passes with the rest of the graph left unmaterialized.
        // `--reference` makes the clone BORROW the main checkout's objects through an
        // `alternates` file instead of copying them (marketplace measured: 1 MB borrowed
        // vs 7 MB copied, 0.5 s).
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
          // FAIL CLOSED (R3, opencharly/opencharly#1312). `pi.exec` RESOLVES on a non-zero exit —
          // `code` is the only failure signal there is (the lesson opencharly/opencharly#410 put
          // into `charly_worktree_remove` and step 3b already follows). This call DISCARDED it, so
          // a failed module clone fell through as an empty directory, the nested step then skipped
          // it (an empty module has no `.gitmodules`), the build could not run, and the report
          // below still claimed "Modules materialized" and "Binary built at …". MEASURED three
          // times in one session: `--reference` cloning failed with git's own `fetch-pack: invalid
          // index-pack output` and the worktree came back with 0 entries in both modules.
          const cloned = await pi.exec("git", args, { cwd: worktreePath });
          if (cloned.code !== 0) {
            const why = (cloned.stderr || cloned.stdout || "").trim() || `exit ${cloned.code}`;
            throw new Error(
              `module ${modulePath} did not materialize: ${why} — a worktree whose module clone failed is not a session worktree`,
            );
          }
          // NO effect-guard here, and that is MEASURED (CONC(a)): a clone that exits 0 always leaves
          // a `.git` in the checkout, so `!existsSync(.git)` cannot hold while the exit code is 0.
          // An empty module is exactly what a FAILED clone leaves behind, and the exit code above is
          // what catches it — the same signal `charly_worktree_remove` uses. A guard that cannot fire
          // is an unreachable arm; R5 deletes it rather than keeping it "just in case".
        }

        // Step 3b: the NESTED level of every materialized module.
        //
        // A module's OWN declared submodules, materialized at the gitlinks the module's
        // current tree records — the post-condition `charly task init` guarantees
        // (opencharly/opencharly#647) and the umbrella's gate now ASSERTS
        // (opencharly/opencharly#710). The umbrella's currency report cannot SEE the
        // absence: a twin's currency is judged from the twin's REMOTE alone and the
        // report never asks whether the checkout EXISTS, so while that remote has not
        // moved the twin reads `cur` and the report exits 0 (MEASURED in the reproduced
        // defect state: `0 of 411 pin(s) NOT current [411 cur]` (2026-10-26)). The checkout is needed
        // only to CLASSIFY a twin whose remote HAS moved, and only then does the report
        // print `differs (no checkout of box/cachyos to judge ancestry)` — the twin's
        // class left UNDETERMINED — without the checkout the report cannot say whether
        // the difference is `behind`, `unmerged` or `not-on-the-served-line`, and its own
        // state names the reason it cannot; at the VERDICT level the twin counts as
        // not-current, exactly as a real divergence does.
        // The gate asserts the post-condition itself, precisely because the report cannot.
        //
        // The umbrella's OWN initializer does it, re-rooted at the module: ONE lifecycle
        // implementation at every level (R2). At a module's root, `--all` IS that module's
        // nested level — every submodule path the module's own `.gitmodules` declares —
        // and the whole graph is still never cloned. MEASURED in a real .pi worktree
        // (2026-10-26): charly's six `box/*` twins cost 9.0 MB — 5.2 MB of working trees
        // plus 3.8 MB of blobless object stores — against the ~606 MB (376 MB of
        // worktree-private module objects plus ~230 MB of checkouts) that a FULL
        // RECURSIVE materialization of this graph costs, the figure `.pi/README.md`'s own
        // cost table measures (2026-10-06).
        const nested: string[] = [];
        for (const modulePath of modules) {
          const moduleRoot = join(worktreePath, modulePath);
          // A module with no `.gitmodules` of its own declares no nested level — nothing
          // to materialize, and nothing for the gate to assert.
          if (!existsSync(join(moduleRoot, ".gitmodules"))) continue;
          const res = await pi.exec(
            "bash",
            [join(worktreePath, "scripts", "init-submodules.sh"), "--root", moduleRoot, "--all"],
            { cwd: worktreePath },
          );
          // FAIL CLOSED (property 1): `pi.exec` RESOLVES on a non-zero exit, so the code
          // is read here — a worktree whose nested level is missing is a worktree whose
          // ABSENT nested level the currency report cannot SEE (it judges a twin's
          // currency from the twin's REMOTE alone), and it must never be reported as ready.
          if (res.code !== 0) {
            const why = (res.stderr || res.stdout || "").trim() || `exit ${res.code}`;
            throw new Error(`the nested level of ${modulePath} did not materialize: ${why}`);
          }
          nested.push(modulePath);
        }

        // Step 4: Build the worktree-local binary (the ONE non-charly entrypoint).
        // FAIL CLOSED for the same reason as step 3: an empty `charly/` has no
        // `scripts/bootstrap-charly.sh` at all, so a discarded exit code here reported a binary
        // that could never have been built (opencharly/opencharly#1312).
        const built = await pi.exec("bash", ["charly/scripts/bootstrap-charly.sh"], { cwd: worktreePath });
        const binaryPath = `${worktreePath}/charly/bin/charly`;
        if (built.code !== 0) {
          const why = (built.stderr || built.stdout || "").trim() || `exit ${built.code}`;
          throw new Error(`the worktree binary did not build: ${why}`);
        }
        // The report line names this file, so the file is what decides it — never the exit code
        // alone (a build that exits 0 without producing the binary is the same lie).
        if (!existsSync(binaryPath)) {
          throw new Error(`the build exited 0 but produced no binary at ${binaryPath}`);
        }

        // Record for cleanup
        _worktrees.push({ slug, path: worktreePath, branch });

        return {
          content: [
            {
              type: "text",
              text:
                `Worktree created at ${worktreePath} on branch ${branch}.\n` +
                `- Binary built at ${binaryPath}\n` +
                `- Modules materialized: ${modules.join(", ")} (${borrowed}/${modules.length} borrowing the main checkout's objects)\n` +
                `- Nested levels materialized: ${nested.length ? nested.join(", ") : "none (no materialized module declares one)"}\n` +
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
      "Use this after the PR lands and the branch is merged. " +
      "The branch is deleted only on a patch-id containment proof against origin/main — " +
      "which is true after a SQUASH merge, unlike an ancestry test; an unlanded branch is " +
      "KEPT and reported, never silently dropped. Fails (never prints success) when the " +
      "worktree is still there afterwards.",
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
      const kept: string[] = [];

      // `pi.exec` RESOLVES on a non-zero exit — pi 1.0.4's `exec` delegates to
      // `execCommand`, whose promise resolves `{stdout, stderr, code, killed}` in EVERY
      // branch, including its own internal `.catch` (`resolve({…, code: 1 })`). It never
      // rejects, so a `try/catch` around it can never observe a failed command: `code` is
      // the only failure signal there is. Every recovery step below is therefore driven by
      // the RESULT, never by a rejection (opencharly/opencharly#410 — the `catch`-gated
      // `--force` retry was unreachable, so a refused removal printed success).
      const run = (args: string[]) => pi.exec("git", args, { cwd: ctx.cwd });
      const why = (r: { stdout: string; stderr: string; code: number }) =>
        (r.stderr || r.stdout).trim() || `exit ${r.code}`;

      // Remove the worktree, escalating to `--force` on the ORDINARY refusal: a worktree
      // holding modified or untracked files. A single `--force` is deliberate — a LOCKED
      // worktree needs `-f -f`, and that override is the operator's call, not this tool's.
      let removalFailure: string | null = null;
      const first = await run(["worktree", "remove", worktreePath]);
      if (first.code !== 0) {
        const forced = await run(["worktree", "remove", "--force", worktreePath]);
        if (forced.code !== 0) removalFailure = why(forced);
      }

      // The EFFECT, observed rather than assumed: the worktree is gone only when its
      // directory is absent AND `git worktree list` no longer registers it. MEASURED: those
      // two halves can disagree — `--force` over a non-writable subdirectory exits 255 having
      // already DROPPED the administrative entry while the directory survives. The report
      // therefore carries the OBSERVED effect, so what it says happened is what happened.
      // The EFFECT is compared on REAL paths, because `git worktree list` reports them resolved
      // while `ctx.cwd` may reach the same place through a symlink. `realpathSync` was CALLED
      // here without ever being imported, and the try/catch below turned the resulting
      // ReferenceError into a silent "use the path as given" — a fallback branch hiding a
      // defect (R3), invisible to the syntax-only parse check its gate runs. The import is the
      // fix; `check-pi-gates.mjs` now asserts every `node:fs` identifier the file CALLS is bound.
      const real = (p: string) => {
        try {
          return realpathSync(p);
        } catch {
          return p;
        }
      };
      const listed = await run(["worktree", "list", "--porcelain"]);
      const registered = listed.stdout
        .split("\n")
        .filter((l) => l.startsWith("worktree "))
        .map((l) => real(l.slice("worktree ".length).trim()));
      const removedEffect = !existsSync(worktreePath) && !registered.includes(real(worktreePath));
      if (removalFailure !== null) errors.push(`worktree ${worktreePath}: ${removalFailure}`);

      // Delete the branch only on a proof of CONTENT containment. The retired test
      // (`git branch --merged origin/main`) proved ANCESTRY, which the org's squash landing
      // destroys: after a squash merge the branch's commits are not ancestors of
      // origin/main, so the test never fired and every landed `feat/` branch leaked. `git
      // cherry` compares PATCH IDs, so a squashed commit still reads as contained upstream
      // (`- <sha>`), and `-D` — not `-d`, which re-runs the ancestry test this replaces — is
      // what that proof licenses.
      let branchState: "deleted" | "absent" | "kept" = "absent";
      const head = await run(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
      if (head.code === 0) {
        const cherry = await run(["cherry", "origin/main", branch]);
        const unique = cherry.stdout
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (cherry.code !== 0) {
          branchState = "kept";
          kept.push(`branch ${branch}: \`git cherry origin/main ${branch}\` failed (${why(cherry)})`);
        } else if (unique.some((l) => !l.startsWith("-"))) {
          branchState = "kept";
          kept.push(
            `branch ${branch}: ${unique.filter((l) => !l.startsWith("-")).length} commit(s) NOT contained in ` +
              `origin/main (delete it with \`git branch -D ${branch}\` once it is landed)`,
          );
        } else {
          const del = await run(["branch", "-D", branch]);
          if (del.code !== 0) errors.push(`branch ${branch}: ${why(del)}`);
          else branchState = "deleted";
        }
      }

      // Remove from tracking
      const idx = _worktrees.findIndex((w) => w.slug === slug);
      if (idx !== -1) _worktrees.splice(idx, 1);

      const branchClause =
        branchState === "deleted"
          ? ` and branch ${branch} deleted (patch-contained in origin/main)`
          : branchState === "absent"
            ? ` (branch ${branch} did not exist)`
            : `; branch ${branch} KEPT — not proven contained in origin/main`;

      if (errors.length > 0) {
        return {
          content: [
            {
              type: "text",
              text:
                `Worktree removal FAILED (removed=${removedEffect}):\n` +
                `${errors.map((e) => `  - ${e}`).join("\n")}` +
                (kept.length > 0 ? `\nAlso:\n${kept.map((e) => `  - ${e}`).join("\n")}` : ""),
            },
          ],
          details: { slug, path: worktreePath, branch, removed: removedEffect, branchState, errors, kept },
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text:
              `Worktree ${worktreePath} removed${branchClause}.` +
              (kept.length > 0 ? `\nNote:\n${kept.map((e) => `  - ${e}`).join("\n")}` : ""),
          },
        ],
        details: { slug, path: worktreePath, branch, removed: removedEffect, branchState, kept },
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
          // FAIL CLOSED (T3/R3): the gate cannot run because its script is absent —
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
          // FAIL CLOSED (T3/R3): an unexpected execution error means the gate
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