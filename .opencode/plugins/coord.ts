/**
 * coord.ts — the OpenCode binding of the ONE coordination and watcher toolset
 * (`scripts/gh/lib/`, opencharly/opencharly#1140).
 *
 * The verbs, the comment and footer builders, the identity rules, posting, and the watch
 * engine all live in `scripts/gh/lib/{coord,watch,github}.ts`, which every harness uses —
 * OpenCode and pi in-process, the rest through `scripts/gh/cli.ts`. This plugin only
 * registers them as OpenCode tools and supplies the LIVE session id
 * (`toolCtx.sessionID`) and the `.opencode/coord.conf` defaults.
 *
 * TOOLS
 *   coord_comment  post ONE verb-labelled coordination comment (or claim) with the session
 *                  footer.
 *   coord_footer   return the two-line session footer for THIS session, to end a PR body,
 *                  an issue or a comment with.
 *   coord_watch    a bounded, session-invoked wait for the first event on one or more
 *                  PRs/issues (the engine's `runWatch`). The continuous background watch is
 *                  `pr-watch.ts`.
 *
 * CONFIG (optional; highest first: TOOL ARG > `COORD_*` ENV > `.opencode/coord.conf`)
 *   `.opencode/coord.conf` — `key=value` lines, `#` comments:
 *       model=<provider model>   confidence=<tier>
 *   `agent` has NO config default. Unless an arg/env/conf names one, it is DERIVED per
 *   session as `<session slug>-<full session id>` (e.g. `eager-orchid-ses_de66902b9f…`),
 *   so every session's `Agent:` line is unique by construction. The slug is read from the
 *   same read-only store handle `agent-progress` uses (`session_v2.slug`); a session with
 *   no row degenerates to the bare session id, never to an invented identity.
 *   The harness is `OpenCode` and the session is always the live session.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SQL, databasePath, openReadonly } from "./agent-progress.ts";
import { rateLimitMessage } from "../../scripts/gh/lib/github.ts";
import {
  DEFAULT_CHECK,
  DEFAULT_EVENTS,
  DEFAULT_INTERVAL_S,
  DEFAULT_STALL_MIN,
  DEFAULT_WORKFLOW,
  POLL_FLOOR,
  UsageError,
  checkInterval,
  parseEvents,
  parseItem,
  runWatch,
  type Item,
} from "../../scripts/gh/lib/watch.ts";
import {
  TIERS,
  VERBS,
  buildComment,
  buildFooter,
  canonicalVerb,
  isTier,
  missingIdentity,
  parseConf,
  postComment,
  resolveIdentity,
} from "../../scripts/gh/lib/coord.ts";

/** The harness name this binding writes into every footer. */
export const HARNESS = "OpenCode";

/** The default `coord_watch` deadline (seconds) — a bounded, session-invoked wait. */
export const DEFAULT_WATCH_TIMEOUT_S = 3600;

/**
 * The session-unique `Agent:` slug: `<session_v2.slug>-<full session id>`.
 *
 * AGENTS.md constrains the `Agent:` line to a backticked slug; opencode's own
 * `session_v2.slug` ("eager-orchid") is the readable half and the live session id makes the
 * whole token unique per session, so two sessions can never claim one identity. The read
 * reuses `agent-progress`'s read-only handle — ONE store implementation, not a second
 * sqlite open. Any failure degrades to the bare session id (still unique), never to an
 * invented slug.
 */
export async function sessionAgentSlug(sessionID: string): Promise<string> {
  try {
    const db = await openReadonly(databasePath(process.env));
    try {
      const row = db.all(SQL.oneSession, sessionID)[0] as { slug?: string } | undefined;
      const slug = String(row?.slug ?? "").trim();
      return slug ? `${slug}-${sessionID}` : sessionID;
    } finally {
      db.close();
    }
  } catch {
    return sessionID;
  }
}

async function identity(input: Record<string, any>, conf: Record<string, string>, sessionID: string | undefined) {
  const id = resolveIdentity(input, process.env, conf, sessionID ? { harness: HARNESS, session: sessionID } : undefined);
  if (!id.agent && id.session) id.agent = await sessionAgentSlug(id.session);
  return id;
}

function identityError(tool: string, id: ReturnType<typeof identity>): string | null {
  const missing = missingIdentity(id);
  if (missing.length) {
    return `${tool}: missing ${missing.map((m) => "--" + m).join(", ")} — pass them as tool args, set COORD_* env, or fill .opencode/coord.conf`;
  }
  if (!isTier(id.confidence)) return `${tool}: invalid confidence '${id.confidence}' — one of: ${TIERS.join(" | ")}`;
  return null;
}

export default {
  id: "coord",
  // opencode >= 2.0 definition form: register the coordination tools.
  async setup(ctx: any) {
    const dir = ctx?.location?.directory ?? process.cwd();
    let conf: Record<string, string> = {};
    try {
      conf = parseConf(readFileSync(join(dir, ".opencode", "coord.conf"), "utf8"));
    } catch {
      /* no config → env/args only */
    }

    await ctx.tool.transform((draft: any) => {
      draft.add({
        name: "coord_comment",
        description:
          "Post ONE verb-labelled coordination comment (or claim) on a GitHub issue/PR, ending " +
          "with this session's footer (`Agent:` first, `Assisted-by:` last). Use it for " +
          `${VERBS.join(" / ")} per AGENTS.md.`,
        input: {
          type: "object",
          properties: {
            verb: { type: "string", description: `one of: ${VERBS.join(", ")}` },
            item: { type: "string", description: "owner/repo#num (or owner/repo/pull/num, or a full URL)" },
            body: { type: "string", description: "GitHub-Markdown body (optional)" },
            agent: {
              type: "string",
              description: "work slug for the `Agent:` line (default: this session's `<slug>-<session id>`)",
            },
            parent: { type: "string", description: "the parent slug, for a subagent (optional)" },
            model: { type: "string", description: "provider model name" },
            confidence: { type: "string", description: `one of: ${TIERS.join(" | ")}` },
            assign: { type: "boolean", description: "also assign the posting account (a CLAIM)" },
            dryRun: { type: "boolean", description: "return the comment; do NOT post it" },
          },
          required: ["verb", "item"],
        },
        execute: async (input: Record<string, any>, toolCtx: any) => {
          const verb = canonicalVerb(input.verb);
          if (!verb) return { content: `coord_comment: invalid verb '${input.verb}' — one of: ${VERBS.join(" | ")}` };
          const item = parseItem(input.item);
          if (!item) {
            return { content: `coord_comment: unrecognised target '${input.item}' — want owner/repo#num or owner/repo/pull/num` };
          }
          const id = await identity(input, conf, toolCtx?.sessionID);
          const bad = identityError("coord_comment", id);
          if (bad) return { content: bad };
          const comment = buildComment(verb, input.body ? String(input.body) : undefined, id);
          if (input.dryRun) return { content: comment };
          try {
            const url = await postComment(item, comment, { assign: !!input.assign, signal: toolCtx?.signal });
            return { content: url || "coord_comment: posted (no html_url returned)" };
          } catch (err: any) {
            return { content: `coord_comment: GitHub API error — ${err?.message ?? String(err)}` };
          }
        },
      });

      draft.add({
        name: "coord_footer",
        description:
          "Return the two-line session footer for THIS OpenCode session — the `Agent:` line (work " +
          "slug, harness, live session id) then the `Assisted-by:` trailer — to end a PR body, an " +
          "issue or a comment with, per AGENTS.md. Posts nothing.",
        input: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description: "work slug for the `Agent:` line (default: this session's `<slug>-<session id>`)",
            },
            parent: { type: "string", description: "the parent slug, for a subagent (optional)" },
            model: { type: "string", description: "provider model name" },
            confidence: { type: "string", description: `one of: ${TIERS.join(" | ")}` },
          },
          required: [],
        },
        execute: async (input: Record<string, any>, toolCtx: any) => {
          const id = await identity(input, conf, toolCtx?.sessionID);
          const bad = identityError("coord_footer", id);
          return { content: bad ?? buildFooter(id) };
        },
      });

      draft.add({
        name: "coord_watch",
        description:
          "Wait (one-shot, bounded) for the first GitHub event on one or more PRs/issues — " +
          "merged / closed / comment / verdict / stall — and return the ARM baseline plus the " +
          "wake line, or a TIMEOUT notice. Your own PR: events verdict,merged,closed,conflict (the " +
          "default; sees a REST re-run). A blocker: merged,closed,stall. A reply: comment.",
        input: {
          type: "object",
          properties: {
            items: { type: "array", items: { type: "string" }, description: "owner/repo#num items to watch" },
            events: { type: "string", description: `comma list (default: ${DEFAULT_EVENTS})` },
            interval: {
              type: "number",
              description: `poll cadence, seconds (default and floor ${POLL_FLOOR}; a shorter one is refused)`,
            },
            stallmin: { type: "number", description: `stall window, minutes (default ${DEFAULT_STALL_MIN})` },
            workflow: { type: "string", description: `validator workflow (default ${DEFAULT_WORKFLOW})` },
            timeout: {
              type: "number",
              description: `overall deadline, seconds (default ${DEFAULT_WATCH_TIMEOUT_S}; 0 = until an event or abort)`,
            },
          },
          required: ["items"],
        },
        execute: async (input: Record<string, any>, toolCtx: any) => {
          if (!Array.isArray(input.items) || input.items.length === 0) {
            return { content: "coord_watch: pass at least one item (owner/repo#num)" };
          }
          const items: Item[] = [];
          for (const raw of input.items) {
            const it = parseItem(raw);
            if (!it) return { content: `coord_watch: malformed item '${raw}' — want owner/repo#num` };
            items.push(it);
          }
          let events;
          let intervalSec;
          try {
            events = parseEvents(input.events === undefined ? undefined : String(input.events));
            intervalSec = checkInterval(input.interval ?? DEFAULT_INTERVAL_S);
          } catch (err) {
            if (err instanceof UsageError) return { content: `coord_watch: ${err.message}` };
            throw err;
          }
          const timeoutSec =
            typeof input.timeout === "number" && input.timeout >= 0 ? input.timeout : DEFAULT_WATCH_TIMEOUT_S;
          const res = await runWatch(items, {
            events,
            intervalSec,
            stallMin: typeof input.stallmin === "number" && input.stallmin >= 0 ? input.stallmin : DEFAULT_STALL_MIN,
            workflow: String(input.workflow ?? DEFAULT_WORKFLOW),
            check: DEFAULT_CHECK,
            timeoutSec,
            signal: toolCtx?.signal,
          });
          if (toolCtx?.signal?.aborted) return { content: "coord_watch: aborted (session interrupted)" };
          if (res.rateLimited) return { content: `coord_watch: ${rateLimitMessage(res.rateLimited)}` };
          if (res.seedError) return { content: `coord_watch: the initial poll failed: ${res.seedError.message}` };
          const baseline = res.reports.map((r) => r.line).join("\n");
          const tail = res.fire
            ? res.fire.line
            : res.armFired
              ? ""
              : res.timedOut
                ? `TIMEOUT  no event within ${timeoutSec}s`
                : "coord_watch: watch ended with no event";
          return { content: [baseline, tail].filter(Boolean).join("\n") };
        },
      });
    });
  },
  // opencode 1.x function form: loads, but tool registration needs zod → no-op.
  async server(_input: any) {
    return {};
  },
};
