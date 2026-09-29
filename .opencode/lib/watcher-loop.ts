/**
 * watcher-loop.ts — the ONE detached native watcher loop shared by the OpenCode
 * plugins (`pr-watch.ts`, `tracker.ts`).
 *
 * R3 — extracted from `pr-watch.ts` (which previously held the session-id capture,
 * the delivery binding, the detached `void (async()=>for(;;))` loop, and the
 * rate-limit backoff INLINE). The `tracker` plugin would have made that a THIRD
 * copy; the loop is now defined once here and both plugins import it.
 *
 * It is a plain import target, NOT a plugin: it lives in `.opencode/lib/` (not
 * `plugins/`), so opencode's plugin discovery never loads it as a plugin.
 *
 * The loop is the SAME contract as `marketplace/scripts/gh_watch.sh` (event
 * vocabulary, wake-line format, item grammar) implemented over the shared engine
 * `./watch.ts`. It is PURE TypeScript and NEVER spawns a `.sh` — no dependency on
 * any script file, hence NO `marketplace` submodule pin (the operator directive
 * recorded in `coord.ts` / `instructions.md`).
 *
 * Delivery — the V2 "inject context without starting a turn" primitive is
 * `ctx.session.synthetic({ sessionID, text })` (default `delivery: steer`, so the
 * alert is ADDED to the running session). The session id is unknown at setup and
 * `session.list` does not exist on V2, so it is CAPTURED from the first tool call
 * (`ctx.tool.hook("execute.before", …)`) or the first prompt
 * (`ctx.session.hook("prompt", …)`). If no id is captured before a wake, the wake
 * is a logged warning, never a silent drop.
 */
import {
  BACKOFF_FACTOR,
  DEFAULT_INTERVAL_S,
  DEFAULT_STALL_MIN,
  MAX_BACKOFF_S,
  RATE_FLOOR,
  RateLimitedError,
  parseEvents,
  pollOnce,
  rateLimitMessage,
  seedAll,
  sleepAbortable,
  type Item,
  type Snap,
} from "./watch.ts";

/** A logger prefixed with the owning plugin's label. */
export function makeWarn(label: string): (message: string) => void {
  return (message: string) => console.warn(`${label}: ${message}`);
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
        await ctx.session.synthetic({ sessionID: id, text: `${label}: ${line}` });
      } catch {
        /* delivery unavailable — the loop keeps watching */
      }
    },
  };
}

export interface WatchLoopOptions {
  /** Comma list of events (the `gh_watch.sh` vocabulary). */
  events: string;
  /** The validator workflow name whose COMPLETED runs are the progress signal. */
  wf: string;
  /** Poll cadence, ms (defaults to the floor). */
  intervalMs?: number;
  /** Stall window, minutes. */
  stallMin?: number;
  /** Cancellation (the plugin executor's `context.signal`). */
  signal?: AbortSignal;
  /** Deliver one fired wake line. */
  deliver: (line: string) => Promise<void>;
  /** Logger. */
  warn: (message: string) => void;
}

/**
 * The detached native watch loop: seed, then poll once per interval, delivering the
 * first fired event. A rate limit FAILS HARD (warn + return — never spin); a
 * near-exhausted quota (read FREE from the batched response) backs off VISIBLY.
 * A transient (non-rate-limit) failure skips one poll, never kills the watch.
 *
 * The caller starts this detached (`void watchLoop(...)`) so `setup()` returns
 * immediately; it terminates with the session (`signal`).
 */
export async function watchLoop(items: Item[], opts: WatchLoopOptions): Promise<void> {
  if (items.length === 0) return;
  const events = parseEvents(opts.events, opts.events);
  const wf = opts.wf;
  const stallMin = opts.stallMin ?? DEFAULT_STALL_MIN;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_S * 1000;
  const armEpoch = Math.floor(Date.now() / 1000);

  let seeds: Map<string, Snap>;
  try {
    seeds = await seedAll(items, { wf, signal: opts.signal });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      opts.warn(rateLimitMessage(err));
      return; // fail hard: never spin on a rate limit
    }
    seeds = new Map();
  }

  for (;;) {
    if (opts.signal?.aborted) return;
    try {
      const outcome = await pollOnce(items, seeds, {
        events,
        wf,
        armEpoch,
        stallMin,
        signal: opts.signal,
      });
      // `pollOnce` updates `seeds` in place AND skips fingerprint-unchanged items,
      // so the SAME comment/verdict is never delivered twice.
      if (outcome.fire) await opts.deliver(outcome.fire.line);
      // A near-exhausted quota (FREE header read) → back off VISIBLY.
      if (outcome.rateRemaining !== null && outcome.rateRemaining < RATE_FLOOR) {
        opts.warn(`core quota remaining=${outcome.rateRemaining} < ${RATE_FLOOR} — backing off`);
        await sleepAbortable(
          Math.min((intervalMs / 1000) * BACKOFF_FACTOR, MAX_BACKOFF_S) * 1000,
          opts.signal,
        );
        continue;
      }
    } catch (err) {
      if (err instanceof RateLimitedError) {
        // FAIL HARD: surface the rate limit and STOP this watch — never spin.
        opts.warn(rateLimitMessage(err));
        return;
      }
      /* transient (network) — skip this poll, keep watching */
    }
    await sleepAbortable(intervalMs, opts.signal);
  }
}
