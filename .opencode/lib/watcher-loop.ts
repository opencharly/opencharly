/**
 * watcher-loop.ts — the OpenCode delivery binding of the ONE watcher engine
 * (`scripts/gh/lib/watch.ts`, opencharly/opencharly#1140), shared by `pr-watch.ts` and
 * `tracker.ts`.
 *
 * The engine, its event contract and its loop live in `scripts/gh/lib/watch.ts`; this
 * module adds only what is OpenCode's: capturing the live session id and delivering a
 * wake line into it.
 *
 * DELIVERY — the V2 "inject context without starting a turn" primitive is
 * `ctx.session.synthetic({ sessionID, text })`. The session id is unknown at setup and
 * `session.list` does not exist on V2, so it is CAPTURED from the first tool call
 * (`ctx.tool.hook("execute.before", …)`) or the first prompt
 * (`ctx.session.hook("prompt", …)`). A wake before an id is captured is a logged warning,
 * never a silent drop.
 *
 * It is a plain import target, NOT a plugin: it lives in `.opencode/lib/`, so opencode's
 * plugin discovery never loads it as a plugin.
 */
import {
  DEFAULT_CHECK,
  DEFAULT_INTERVAL_S,
  DEFAULT_STALL_MIN,
  DEFAULT_WORKFLOW,
  checkInterval,
  parseEvents,
  watchStream,
  type Item,
} from "../../scripts/gh/lib/watch.ts";

/** A logger prefixed with the owning plugin's label. */
export function makeWarn(label: string): (message: string) => void {
  return (message: string) => console.warn(`${label}: ${message}`);
}

/** Split a `pr-watch.items`-style file into non-comment lines (order preserved). */
export function parseItems(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
}

/** Read a file as text under both runtimes (Bun's `Bun.file`, else `node:fs`). */
export async function readText(path: string): Promise<string> {
  const bun = (globalThis as { Bun?: any }).Bun;
  if (bun?.file) return bun.file(path).text();
  const { readFileSync } = await import("node:fs");
  return readFileSync(path, "utf8");
}

/** A live session delivery handle. */
export interface SessionSink {
  /** The most recently observed session id ("" until one is captured). */
  sessionID: () => string;
  /** Deliver one wake line to the session. */
  deliver: (line: string) => Promise<void>;
}

/**
 * Capture the live session id from the first tool call or the first prompt.
 * Returns a getter (the id is not known at setup time).
 */
export async function captureSessionID(ctx: any): Promise<() => string> {
  let sessionID = "";
  try {
    if (ctx?.tool?.hook) {
      await ctx.tool.hook("execute.before", (e: any) => {
        if (e?.sessionID) sessionID = e.sessionID;
      });
    }
    if (ctx?.session?.hook) {
      await ctx.session.hook("prompt", (e: any) => {
        if (e?.sessionID) sessionID = e.sessionID;
      });
    }
  } catch {
    /* hook registration unavailable — delivery warns if it wakes first */
  }
  return () => sessionID;
}

/**
 * Build the V2 session sink (`ctx.session.synthetic`). Returns `null` (and warns)
 * when the primitive is unavailable, so the caller can disable its watcher cleanly.
 * `label` prefixes the delivered text (e.g. `PR-watch:`).
 */
export async function v2SessionSink(
  ctx: any,
  label: string,
  warn: (message: string) => void,
): Promise<SessionSink | null> {
  if (!ctx?.session?.synthetic) {
    warn("ctx.session.synthetic unavailable — watcher disabled");
    return null;
  }
  const get = await captureSessionID(ctx);
  return {
    sessionID: get,
    deliver: async (line: string) => {
      const id = get();
      if (!id) {
        warn(`wake with no session id captured yet: ${line}`);
        return;
      }
      try {
        await ctx.session.synthetic({ sessionID: id, text: `${label} ${line}` });
      } catch {
        /* delivery unavailable — the loop keeps watching */
      }
    },
  };
}

export interface WatchLoopOptions {
  /** Comma list of events (the engine's vocabulary). */
  events: string;
  /** The validator workflow (default `charly/pr-validator`). */
  wf?: string;
  /** Poll cadence, seconds (default and floor 300). */
  intervalSec?: number;
  /** Stall window, minutes. */
  stallMin?: number;
  /** Cancellation (the plugin executor's `context.signal`). */
  signal?: AbortSignal;
  /** Deliver one wake line (or ARM report). */
  deliver: (line: string) => Promise<void>;
  /** Logger. */
  warn: (message: string) => void;
  /** Run the loop DETACHED (default; `setup()` returns at once) or await it (`false`). */
  detached?: boolean;
  /** When awaited, return after the FIRST delivered wake. */
  firstOnly?: boolean;
}

/**
 * The OpenCode watch: the engine's continuous `watchStream`, delivering the ARM reports
 * first and then each wake. `detached: false` with `firstOnly` is a bounded wait that
 * returns after its first wake.
 */
export async function watchLoop(items: Item[], opts: WatchLoopOptions): Promise<void> {
  if (items.length === 0) return;
  const abort = new AbortController();
  opts.signal?.addEventListener("abort", () => abort.abort(), { once: true });
  let reports = items.length;
  const deliver = async (line: string) => {
    await opts.deliver(line);
    if (reports > 0 && line.startsWith("ARM")) {
      reports -= 1;
      return;
    }
    if (opts.detached === false && opts.firstOnly) abort.abort();
  };
  const run = watchStream(
    items,
    {
      events: parseEvents(opts.events),
      intervalSec: checkInterval(opts.intervalSec ?? DEFAULT_INTERVAL_S),
      stallMin: opts.stallMin ?? DEFAULT_STALL_MIN,
      workflow: opts.wf ?? DEFAULT_WORKFLOW,
      check: DEFAULT_CHECK,
      signal: abort.signal,
      onNotice: opts.warn,
    },
    deliver,
    opts.warn,
  );
  if (opts.detached !== false) {
    void run;
    return;
  }
  await run;
}
