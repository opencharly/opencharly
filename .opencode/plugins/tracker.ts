/**
 * tracker.ts — the OpenCode-native session issue/PR tracker + durable ledger.
 *
 * WHY THIS EXISTS (AGENTS.md rule 9). The rulebook requires a session to keep a
 * DURABLE ledger so an interruption never drops in-flight work. The OpenCode V2 harness
 * exposes NO todo primitive — `todowrite` survives only as a migration shim that maps it
 * into the tool-removed list; there is no todo table, no `/session/:id/todo` endpoint, and
 * no `todo.updated` plugin event. So a durable file is this harness's mechanism, and this
 * plugin is it. It does NOT restate the rule, the verb grammar, or the GitHub workflow —
 * it IMPLEMENTS them and LINKS to their owners (R3: no duplication of rules or code).
 *
 * R3 — this plugin builds on the ALREADY-SHARED modules rather than copying them:
 *   - `.opencode/lib/watch.ts`         — the poll engine / batched GraphQL snapshot /
 *                                        `parseItem` / `ghJson` / the rate-limit contract.
 *   - `.opencode/lib/watcher-loop.ts`  — the detached native watch loop (extracted from
 *                                        `pr-watch.ts`, which previously held it inline).
 *   - `.opencode/plugins/coord.ts`     — the CLOSED verb set (`VERBS`) and the canonical
 *                                        footer parser contract. Every actual POST reuses
 *                                        `coord_comment`; a claim/resolve is a
 *                                        coordination comment, not a second implementation.
 *
 * PURE TYPESCRIPT — no `.sh`, no `spawnSync` / `Bun.spawn`, no `marketplace` pin (the
 * operator directive recorded in `coord.ts` / `.opencode/instructions.md`). The ONE
 * `execFile` (in `watch.ts`'s `resolveToken`) drives the `gh` CLI, a TOOL, never a script.
 *
 * TOOLS
 *   tracker_ledger  the durable ledger: read / reconcile / replace the session's
 *                   itemized entries (rule 9's four categories: running subagents,
 *                   open PRs, blockers, long ops) plus the issue<->PR<->slug binding.
 *                   RECONCILE MERGES — an interruption ADDS, it never resets.
 *   tracker_status  join the ledger against LIVE GitHub: what this session is on, the
 *                   latest `OWNING`/`TAKING OVER` for each scope, and where it must
 *                   comment.
 *   tracker_sync    reconcile merged (unblock) / closed (find successor) / stalled
 *                   (takeover candidate) from LIVE state and update the ledger; with
 *                   `watch: true` it arms the shared loop over the ledger's scopes.
 *
 * STORAGE — `.opencode/ledger/<session>.json`, git-ignored (session-scoped: no write
 * races, survives an interruption, never committed).
 *
 * AUTH — same as `coord.ts`: `GITHUB_TOKEN`/`GH_TOKEN`, else the `gh` CLI's token.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ghJson,
  parseItem,
  rateLimitMessage,
  RateLimitedError,
  type Item,
} from "../lib/watch.ts";
import { makeWarn, v2SessionSink, watchLoop } from "../lib/watcher-loop.ts";
import { VERBS, parseAgent, parseVerb } from "./coord.ts";

/** The default validator workflow — the progress signal (a COMPLETED run). */
export const DEFAULT_WORKFLOW = "charly/pr-validator";

/** Rule 9's four ledger categories + the blocking marker. */
export const LEDGER_KINDS = ["subagent", "pr", "issue", "blocker", "op"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** One durable ledger entry (rule 9: one entry per in-flight thing). */
export interface LedgerEntry {
  /** Stable id within the ledger (a slug for a subagent, a scope for a PR/issue). */
  id: string;
  kind: LedgerKind;
  /** `owner/repo#num` when the entry maps to a GitHub scope. */
  scope?: string;
  /** The agent slug that owns/works this entry. */
  slug?: string;
  /** The session id that owns it (for a running subagent). */
  session?: string;
  /** Free-form state: running / open / merged / blocked / … */
  state: string;
  /** The ONE named next action (rule 9: a PR with no next action is undriven). */
  next: string;
  /** Last touched (unix seconds). */
  updated: number;
}

export interface Ledger {
  session: string;
  slug: string;
  entries: LedgerEntry[];
  updated: number;
}

const nowS = () => Math.floor(Date.now() / 1000);

/** Normalise an arbitrary input entry into a LedgerEntry (defensive — never throws). */
export function normaliseEntry(raw: any): LedgerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = String(raw.kind ?? "").toLowerCase();
  if (!(LEDGER_KINDS as readonly string[]).includes(kind)) return null;
  // A scope is accepted in any item form and canonicalised; a non-scope entry keeps
  // whatever id it was given.
  let scope: string | undefined;
  if (raw.scope) {
    const it = parseItem(raw.scope);
    if (!it) return null;
    scope = it.key;
  }
  const id = String(raw.id ?? scope ?? "").trim();
  if (!id) return null;
  return {
    id,
    kind: kind as LedgerKind,
    scope,
    slug: raw.slug ? String(raw.slug) : undefined,
    session: raw.session ? String(raw.session) : undefined,
    state: String(raw.state ?? "open"),
    next: String(raw.next ?? ""),
    updated: typeof raw.updated === "number" ? raw.updated : nowS(),
  };
}

/**
 * Reconcile `incoming` into `current`: every current entry survives unless an incoming
 * entry names it (same id); incoming entries are added/updated. This is rule 9's
 * core invariant — an interruption is an ADDITION, never a reset.
 */
export function reconcile(current: LedgerEntry[], incoming: LedgerEntry[]): LedgerEntry[] {
  const byId = new Map<string, LedgerEntry>();
  for (const e of current) byId.set(e.id, e);
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

/** The set of `owner/repo#num` scopes the ledger tracks (for status/sync/watch). */
export function ledgerScopes(ledger: Ledger): Item[] {
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const e of ledger.entries) {
    if (!e.scope || seen.has(e.scope)) continue;
    const it = parseItem(e.scope);
    if (it) {
      seen.add(e.scope);
      items.push(it);
    }
  }
  return items;
}

function ledgerPath(dir: string, session: string): string {
  const safe = session.replace(/[^A-Za-z0-9_-]/g, "_") || "default";
  return join(dir, ".opencode", "ledger", `${safe}.json`);
}

async function readLedger(dir: string, session: string): Promise<Ledger> {
  try {
    const raw = await readFile(ledgerPath(dir, session), "utf8");
    const parsed = JSON.parse(raw);
    const entries: LedgerEntry[] = [];
    for (const e of Array.isArray(parsed.entries) ? parsed.entries : []) {
      const n = normaliseEntry(e);
      if (n) entries.push(n);
    }
    return { session, slug: String(parsed.slug ?? ""), entries, updated: Number(parsed.updated ?? 0) };
  } catch {
    return { session, slug: "", entries: [], updated: 0 };
  }
}

async function writeLedger(dir: string, ledger: Ledger): Promise<void> {
  const path = ledgerPath(dir, ledger.session);
  await mkdir(join(dir, ".opencode", "ledger"), { recursive: true });
  ledger.updated = nowS();
  await writeFile(path, JSON.stringify(ledger, null, 2) + "\n", "utf8");
}

// --- live GitHub state (read-only) ------------------------------------------

/** The latest coordination verb + slug observed on an issue/PR thread. */
export interface LiveScope {
  key: string;
  isPr: boolean;
  state: string;
  merged: boolean;
  updatedEpoch: number;
  comments: number | null;
  /** The latest coordination verb (CLAIM/OWNING/…) observed, or "". */
  verb: string;
  /** The slug on that verb's footer, or "". */
  slug: string;
  error?: string;
}

/**
 * Observe ONE scope from LIVE GitHub: its state + the latest coordination verb/slug.
 * Read-only; a missing token or an API error returns `error` rather than throwing.
 */
export async function liveScope(it: Item, signal?: AbortSignal): Promise<LiveScope> {
  const base = `/repos/${it.owner}/${it.repo}`;
  const out: LiveScope = {
    key: it.key,
    isPr: false,
    state: "unknown",
    merged: false,
    updatedEpoch: 0,
    comments: null,
    verb: "",
    slug: "",
  };
  try {
    let node: any;
    try {
      node = await ghJson(`${base}/pulls/${it.num}`, { signal });
      out.isPr = true;
    } catch {
      node = await ghJson(`${base}/issues/${it.num}`, { signal });
    }
    out.state = String(node?.state ?? "unknown").toLowerCase();
    out.merged = node?.merged === true || !!node?.merged_at || !!node?.pull_request?.merged_at;
    out.updatedEpoch = Date.parse(String(node?.updated_at ?? "")) / 1000 || 0;
    out.comments = typeof node?.comments === "number" ? node.comments : null;
    // The latest COORDINATION comment wins — the verb's own `Agent:` footer names the slug.
    const comments = await ghJson<any[]>(`${base}/issues/${it.num}/comments?per_page=100`, { signal });
    if (Array.isArray(comments)) {
      for (const c of comments) {
        const body = String(c?.body ?? "");
        // R3 — the verb/footer grammar is owned by `coord.ts` (the closed VERBS set);
        // this reads through the SHARED parsers, never a hand-copied alternation.
        const verb = parseVerb(body);
        if (verb) {
          out.verb = verb;
          out.slug = parseAgent(body) || out.slug;
        }
      }
    }
  } catch (err: any) {
    out.error = err?.message ?? String(err);
  }
  return out;
}

/** Render one ledger + live report as Markdown (the tool content). */
function renderStatus(ledger: Ledger, live: LiveScope[]): string {
  const lines: string[] = [];
  lines.push(`## Ledger — session \`${ledger.session}\``);
  if (ledger.slug) lines.push(`Slug: \`${ledger.slug}\``);
  if (ledger.entries.length === 0) {
    lines.push("");
    lines.push("_No entries._ Reconcile with `tracker_ledger` before starting work.");
    return lines.join("\n");
  }
  lines.push("");
  for (const e of ledger.entries) {
    const l = e.scope ? live.find((s) => s.key === e.scope) : undefined;
    const bits = [`- **${e.kind}** \`${e.id}\``];
    if (e.scope) bits.push(`scope \`${e.scope}\``);
    if (e.state) bits.push(`state \`${e.state}\``);
    if (e.next) bits.push(`next: ${e.next}`);
    if (l) {
      if (l.error) {
        bits.push(`(live: ERROR ${l.error})`);
      } else {
        bits.push(`(live: ${l.merged ? "MERGED" : l.state}${l.verb ? `, owner \`${l.slug || "?"}\` via ${l.verb}` : ""})`);
        if (l.verb && l.slug && ledger.slug && l.slug !== ledger.slug) {
          bits.push(`\u26a0\ufe0f scope owned by \`${l.slug}\`, NOT \`${ledger.slug}\` \u2014 coordinate, do not push`);
        }
      }
    }
    lines.push(bits.join(" \u2014 "));
  }
  return lines.join("\n");
}

export default {
  id: "tracker",

  async setup(ctx: any) {
    const dir = ctx?.location?.directory ?? process.cwd();
    const warn = makeWarn("tracker");
    // The session delivery sink (used only by tracker_sync's opt-in `watch`).
    const sink = await v2SessionSink(ctx, "tracker", warn);

    await ctx.tool.transform((draft: any) => {
      draft.add({
        name: "tracker_ledger",
        description:
          "The durable session ledger (AGENTS.md rule 9) — REPLACES the missing V2 todo " +
          "primitive on this harness. Read or reconcile the session's itemized in-flight " +
          "state: every running subagent, every open PR, every blocker, every long-running " +
          "op, plus the issue<->PR<->slug binding. RECONCILE MERGES: call it on every " +
          "interruption to ADD items without dropping the ones already open. Use it at " +
          "session start, after any interruption, and before any long-running operation.",
        input: {
          type: "object",
          properties: {
            action: { type: "string", description: "read | reconcile | replace (default read)" },
            slug: { type: "string", description: "this session's work slug (the `Agent:` line value)" },
            entries: {
              type: "array",
              description:
                "entries to reconcile/replace; each { id, kind, scope?, slug?, session?, state, next } " +
                `where kind is one of: ${LEDGER_KINDS.join(" | ")} and scope is any item form`,
              items: { type: "object" },
            },
          },
        },
        execute: async (input: Record<string, any>, toolCtx: any) => {
          const session = toolCtx?.sessionID ?? "default";
          const ledger = await readLedger(dir, session);
          if (input.slug) ledger.slug = String(input.slug);
          const action = String(input.action ?? "read").toLowerCase();
          if (action === "read") {
            return { content: "```json\n" + JSON.stringify(ledger, null, 2) + "\n```" };
          }
          const incoming: LedgerEntry[] = [];
          for (const raw of Array.isArray(input.entries) ? input.entries : []) {
            const e = normaliseEntry(raw);
            if (!e) {
              return {
                content: `tracker_ledger: bad entry ${JSON.stringify(raw)} — need { id, kind (${LEDGER_KINDS.join("|")}), state, next }`,
              };
            }
            incoming.push(e);
          }
          ledger.entries = action === "replace" ? incoming : reconcile(ledger.entries, incoming);
          await writeLedger(dir, ledger);
          return {
            content:
              `ledger ${action}d — ${ledger.entries.length} entr${ledger.entries.length === 1 ? "y" : "ies"}:\n` +
              "```json\n" + JSON.stringify(ledger, null, 2) + "\n```",
          };
        },
      });

      draft.add({
        name: "tracker_status",
        description:
          "What am I correctly working on, and where must I communicate? Joins the durable " +
          "ledger against LIVE GitHub: each scope's real state (open / MERGED / closed) and " +
          "the LATEST coordination verb (`OWNING`/`TAKING OVER` wins) with its `Agent:` slug. " +
          "Flags any scope owned by ANOTHER slug (coordinate on the thread; do not push to " +
          "another session's claim). Use before every push to a PR and before branching.",
        input: {
          type: "object",
          properties: {
            scopes: {
              type: "array",
              items: { type: "string" },
              description: "extra owner/repo#num scopes to check without adding them (optional)",
            },
          },
        },
        execute: async (input: Record<string, any>, toolCtx: any) => {
          const session = toolCtx?.sessionID ?? "default";
          const ledger = await readLedger(dir, session);
          const items = ledgerScopes(ledger);
          for (const raw of Array.isArray(input.scopes) ? input.scopes : []) {
            const it = parseItem(raw);
            if (it && !items.some((x) => x.key === it.key)) items.push(it);
          }
          const live: LiveScope[] = [];
          for (const it of items) live.push(await liveScope(it, toolCtx?.signal));
          return { content: renderStatus(ledger, live) };
        },
      });

      draft.add({
        name: "tracker_sync",
        description:
          "Reconcile the durable ledger against LIVE GitHub and report the B2b events: " +
          "`merged` (unblocked), `closed` (find its successor — carry-forward), and `stall` " +
          "(no progress past the window while open+unmerged → a takeover candidate; comment " +
          "FIRST, wait the 60-minute floor, then TAKING OVER before any push). Updates each " +
          "scope's ledger state from live state. Progress is a COMPLETED validator run, " +
          "never session activity. Set `watch: true` to arm the shared loop over the " +
          "ledger's scopes instead of a one-shot reconcile.",
        input: {
          type: "object",
          properties: {
            workflow: { type: "string", description: `validator run name (default ${DEFAULT_WORKFLOW})` },
            stallmin: { type: "number", description: "stall window, minutes (default 60 — the B2b floor)" },
            apply: { type: "boolean", description: "write the reconciled states back to the ledger (default true)" },
            watch: { type: "boolean", description: "arm the shared watcher over the ledger's scopes (one-shot wait)" },
          },
        },
        execute: async (input: Record<string, any>, toolCtx: any) => {
          const session = toolCtx?.sessionID ?? "default";
          const ledger = await readLedger(dir, session);
          const wf = String(input.workflow ?? DEFAULT_WORKFLOW);
          const stallMin = typeof input.stallmin === "number" && input.stallmin >= 0 ? input.stallmin : 60;

          if (input.watch) {
            if (!sink) return { content: "tracker_sync: session delivery unavailable — cannot watch" };
            const items = ledgerScopes(ledger);
            if (items.length === 0) return { content: "tracker_sync: no scopes in the ledger to watch" };
            let fired: string | null = null;
            // A BOUNDED, session-invoked wait: `detached:false` AWAITS the loop and
            // `firstOnly:true` returns on the first delivered event (the documented
            // one-shot wait) — not a detached arm-and-return.
            await watchLoop(items, {
              events: "merged,closed,stall",
              wf,
              stallMin,
              signal: toolCtx?.signal,
              warn,
              detached: false,
              firstOnly: true,
              deliver: async (line) => {
                fired = line;
                await sink.deliver(line);
              },
            });
            if (toolCtx?.signal?.aborted) return { content: "tracker_sync: aborted (session interrupted)" };
            return { content: fired ? `woke: ${fired}` : "tracker_sync: watch ended with no event" };
          }

          const now = nowS();
          const events: string[] = [];
          for (const it of ledgerScopes(ledger)) {
            const l = await liveScope(it, toolCtx?.signal);
            const entry = ledger.entries.find((e) => e.scope === it.key);
            if (l.error) {
              events.push(`ERROR    ${it.key}  ${l.error}`);
              continue;
            }
            if (l.merged) {
              events.push(`MERGED   ${it.key}  (unblocked)`);
              if (entry) {
                entry.state = "merged";
                entry.next = entry.next || "record MERGED on the thread; close the issue";
              }
            } else if (l.state === "closed") {
              events.push(`CLOSED   ${it.key}  closed without merging — find its successor`);
              if (entry) {
                entry.state = "closed";
                entry.next = "closed without merging — find its successor (carry-forward)";
              }
            } else if (Math.floor((now - l.updatedEpoch) / 60) >= stallMin) {
              events.push(`STALL    ${it.key}  no progress for ${stallMin}m (open, unmerged) — takeover candidate`);
            } else {
              events.push(`OK       ${it.key}  ${l.state}${l.verb ? `, owner \`${l.slug || "?"}\` via ${l.verb}` : ""}`);
              if (entry) entry.state = l.state;
            }
            if (entry) entry.updated = now;
          }
          if (input.apply !== false) await writeLedger(dir, ledger);
          const body = events.length ? events.join("\n") : "no scopes in the ledger to sync";
          return { content: `${body}\n\n(Ledger: ${ledger.entries.length} entries.)` };
        },
      });
    });
  },

  // opencode 1.x function form: loads, but tool registration needs zod → no-op.
  async server(_input: any) {
    return {};
  },
};

// Re-exported so a gate/consumer can assert the contract through this module's surface.
export { VERBS, rateLimitMessage, RateLimitedError };
