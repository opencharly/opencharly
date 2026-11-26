/**
 * watch.ts — the ONE GitHub watcher engine (opencharly/opencharly#1140).
 *
 * Every harness watches through this module: OpenCode and pi in-process, and Claude Code,
 * Codex, DeepSeek Harness and reasonix through `scripts/gh/cli.ts watch`. It replaced
 * `marketplace/scripts/{gh_watch,pr_watch_many,pr_state_watch}.sh` and the OpenCode-only
 * engine, which disagreed with each other about what a verdict is.
 *
 * THE CONTRACT
 *   * Items: `owner/repo#num`, `owner/repo/pull|issues/num`, or a GitHub URL; PRs and issues.
 *   * Events, evaluated per item in this order (the first match wins):
 *       merged   STATE  the PR is merged; fires from the arm baseline too
 *       closed   STATE  the item is closed without merging
 *       comment  DELTA  the comment count changed since arm
 *       verdict  DELTA  the validator's verdict on the PR HEAD is new and FINAL: the newest
 *                       `<check>` check run (default `validate / validate`) of the
 *                       `<workflow>` suite (default `charly/pr-validator`) is completed, and
 *                       it is a different check run than at arm, or it was not yet completed
 *                       at arm. A REST re-run is a NEW check run (a new id), so a re-run's
 *                       verdict fires (the defect of opencharly/marketplace#628). A run that
 *                       is merely queued or in progress never fires.
 *       stall    STATE  open and unmerged, and no update for `stallMin` minutes
 *   * A verdict carries its CLASS: PASS (the check run succeeded), INCONCLUSIVE (it failed
 *     and the validator's comment for this head says INCONCLUSIVE), or BLOCK (any other
 *     failing conclusion).
 *   * The ARM report is the first emission per item: its state and its current verdict
 *     class. A PR whose head ALREADY carries a BLOCK or INCONCLUSIVE verdict wakes at arm
 *     with that report, so a verdict that landed before the watch armed is never missed.
 *   * One batched GraphQL request per poll for all items; the poll FLOOR is 300 s and a
 *     shorter interval is REFUSED (`ALLOW_FAST_POLL=1` exists for tests only).
 */
import { ghGraphql, RateLimitedError, RATE_FLOOR, BACKOFF_FACTOR, MAX_BACKOFF_S, rateLimitMessage, type RateInfo } from "./github.ts";

/** The poll-interval FLOOR, seconds. */
export const POLL_FLOOR = 300;

/** Default poll cadence, seconds (the floor). */
export const DEFAULT_INTERVAL_S = POLL_FLOOR;

/** Default stall window, minutes. */
export const DEFAULT_STALL_MIN = 60;

/** The validator workflow, and the check run inside it that carries the verdict. */
export const DEFAULT_WORKFLOW = "charly/pr-validator";
export const DEFAULT_CHECK = "validate / validate";

/** The default event set: what you wait for on your OWN PR. */
export const DEFAULT_EVENTS = "verdict,merged,closed,conflict";

/** Every event name the engine knows. */
export const EVENT_NAMES = ["merged", "closed", "conflict", "comment", "verdict", "stall"] as const;
export type WatchEventName = (typeof EVENT_NAMES)[number];

/** A usage error: a bad item, event, interval or flag. The CLI exits 5. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** One normalised watch target. */
export interface Item {
  owner: string;
  repo: string;
  num: number;
  /** Canonical `owner/repo#num` — the wake-line item and the seed-map key. */
  key: string;
}

/** Parse an item in any accepted form, or return `null` for anything malformed. */
export function parseItem(raw: unknown): Item | null {
  let s = String(raw ?? "").trim();
  s = s.replace(/^https?:\/\/github\.com\//i, "");
  s = s.replace(/^github\.com\//i, "");
  s = s.split("?")[0].replace(/\/+$/, "");
  let m = /^([^/\s#]+)\/([^/\s#]+)#([0-9]+)$/.exec(s);
  if (!m) m = /^([^/\s]+)\/([^/\s]+)\/(?:pull|issues)\/([0-9]+)(?:#.*)?$/.exec(s);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  const num = Number(m[3]);
  if (!owner || !repo || !Number.isInteger(num) || num <= 0) return null;
  return { owner, repo, num, key: `${owner}/${repo}#${num}` };
}

/**
 * Read the ITEMS FILE format — the one grammar every harness's watch list shares — into the
 * item strings it carries, in order. A blank line or a `#` comment is skipped; EVERYTHING else
 * is passed through VERBATIM and is NOT validated here.
 *
 * WHY THIS LIVES IN THE ENGINE (R2, measured). `parseItem` above is the item grammar, but there
 * was no file reader beside it, so each harness binding wrote its own — `.pi/extensions/watch.ts`
 * (`parseItems` + `isGithubItem`), `.opencode/lib/watcher-loop.ts` (`parseItems`) and
 * `.reasonix/watch-arm.sh` (a shell `grep -E`) — each with its OWN acceptance set, and they had
 * already drifted: `opencharly/opencharly/pull/1301#issuecomment-42` (the shape `gh pr comment`
 * PRINTS), `github.com/o/r/pull/1301` and a trailing-slash URL were accepted by the engine and
 * SILENTLY DROPPED by pi and reasonix, while `opencharly/opencharly#0` was refused by the engine
 * and passed through by pi. A dropped item is a watcher that never wakes while the session
 * believes it is armed.
 *
 * WHY IT DOES NOT VALIDATE. Validation has exactly ONE home already: `parseItem`, called by the
 * CLI, which REFUSES a malformed item by name and exits 5 (measured: `gh watch: malformed item
 * 'not-an-item' — want owner/repo#123 or a GitHub PR/issue URL`). A binding that pre-filtered
 * turned that loud refusal into silence, which is the defect this reader ends: bindings DELIVER,
 * the engine DECIDES.
 */
export function parseItemsFile(text: string): string[] {
  return String(text ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
}

/** Parse a comma-separated event list; an unknown name is a usage error. */
export function parseEvents(list: string | undefined, dflt: string = DEFAULT_EVENTS): Set<WatchEventName> {
  const out = new Set<WatchEventName>();
  for (const raw of String(list ?? dflt).split(",")) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    if (!(EVENT_NAMES as readonly string[]).includes(name)) {
      throw new UsageError(`unknown event '${name}' — one of: ${EVENT_NAMES.join(", ")}`);
    }
    out.add(name as WatchEventName);
  }
  if (out.size === 0) throw new UsageError(`no events — one or more of: ${EVENT_NAMES.join(", ")}`);
  return out;
}

/**
 * Validate a poll interval: an integer ≥ 1, and ≥ `POLL_FLOOR` unless `ALLOW_FAST_POLL=1`.
 * A sub-floor interval is REFUSED, never clamped: a caller that asked for 60 s and got
 * 300 s silently would misjudge every wait.
 */
export function checkInterval(sec: unknown, env: Record<string, string | undefined> = process.env): number {
  const n = typeof sec === "number" ? sec : Number(sec);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`interval must be an integer >= 1, got '${sec}'`);
  if (n < POLL_FLOOR && env.ALLOW_FAST_POLL !== "1") {
    throw new UsageError(`interval ${n}s is below the ${POLL_FLOOR}s poll floor (ALLOW_FAST_POLL=1 is for tests only)`);
  }
  return n;
}

// --- one observation ----------------------------------------------------------------

/** The validator verdict class on a PR head. */
export type VerdictClass = "PASS" | "BLOCK" | "INCONCLUSIVE" | "PENDING" | "NONE";

/** The observed state of one item at one poll. */
export interface Snap {
  isPr: boolean;
  state: string;
  merged: boolean;
  /**
   * GitHub's mergeability of an open PR against its base: "mergeable", "conflicting" or
   * "unknown" (not yet computed); "" for an issue. A CONFLICTING PR gets no test merge, so
   * no `pull_request` workflow — the validator included — ever runs on it.
   */
  mergeable: string;
  comments: number | null;
  /** First non-blank line of the latest comment ("" when none). */
  latestComment: string;
  updatedEpoch: number;
  headOid: string;
  /** The newest verdict check run on the head: id, status, conclusion (lower-case). */
  checkRunId: string;
  checkStatus: string;
  checkConclusion: string;
  /** The verdict suite's own status — a queued re-run shows here before its check run. */
  suiteStatus: string;
  /** The class the validator's comment for THIS head carries ("" when none). */
  reviewClass: string;
}

const nowEpoch = () => Math.floor(Date.now() / 1000);
const toEpoch = (iso: unknown): number => {
  const ms = Date.parse(String(iso ?? ""));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
};
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** The first non-blank (trimmed) line of a body, or "". */
export function firstNonBlankLine(body: unknown): string {
  for (const raw of String(body ?? "").split("\n")) {
    const line = raw.trim();
    if (line) return line;
  }
  return "";
}

/**
 * The class a validator comment carries: `## Review — PASS|BLOCK`, or `## validator
 * INCONCLUSIVE …`. Anything else is "". The INCONCLUSIVE heading mentions BLOCK in prose
 * and must never read as one, so it is matched first.
 */
export function parseReviewClass(body: unknown): string {
  const first = firstNonBlankLine(body);
  if (/^#{1,6}\s*validator\s+INCONCLUSIVE\b/i.test(first)) return "INCONCLUSIVE";
  const m = /^#{1,6}\s*Review\b[^A-Za-z0-9]{0,4}(BLOCK|PASS)\b/i.exec(first);
  return m ? m[1].toUpperCase() : "";
}

/** The author whose comments carry the validator's verdict. */
export const VALIDATOR_AUTHOR = "github-actions";

/**
 * The verdict class of a snapshot: FINAL only when the newest check run on the head has
 * completed and its suite is not re-running.
 */
export function classify(s: Snap): VerdictClass {
  if (!s.isPr) return "NONE";
  if (!s.checkRunId && !s.suiteStatus) return "NONE";
  if (s.suiteStatus && s.suiteStatus !== "completed") return "PENDING";
  if (s.checkStatus !== "completed") return "PENDING";
  if (s.checkConclusion === "success") return "PASS";
  if (s.reviewClass === "INCONCLUSIVE") return "INCONCLUSIVE";
  return "BLOCK";
}

function emptySnap(): Snap {
  return {
    isPr: false,
    state: "unknown",
    merged: false,
    mergeable: "",
    comments: null,
    latestComment: "",
    updatedEpoch: nowEpoch(),
    headOid: "",
    checkRunId: "",
    checkStatus: "",
    checkConclusion: "",
    suiteStatus: "",
    reviewClass: "",
  };
}

export interface ObserveOptions {
  workflow: string;
  check: string;
  signal?: AbortSignal;
}

/**
 * Observe EVERY item in ONE batched GraphQL query (one alias per item). Partial data with
 * field errors (an issue number queried as a pull request) is tolerated.
 */
export async function batchSnapshot(
  items: Item[],
  opts: ObserveOptions,
): Promise<{ snaps: Map<string, Snap>; rate: RateInfo }> {
  const fields: string[] = [];
  const vars: Record<string, unknown> = { check: opts.check };
  items.forEach((it, i) => {
    vars[`o${i}`] = it.owner;
    vars[`r${i}`] = it.repo;
    vars[`n${i}`] = it.num;
    fields.push(
      `i${i}: repository(owner: $o${i}, name: $r${i}) {
        pullRequest(number: $n${i}) {
          state merged mergeable updatedAt headRefOid
          comments(last: 10) { totalCount nodes { author { login } body } }
          commits(last: 1) { nodes { commit { oid
            checkSuites(last: 20) { nodes { status workflowRun { workflow { name } }
              checkRuns(first: 20, filterBy: { checkName: $check }) { nodes { databaseId status conclusion startedAt } } } } } } }
        }
        issue(number: $n${i}) { state updatedAt comments(last: 1) { totalCount nodes { body } } }
      }`,
    );
  });
  const decl = Object.keys(vars)
    .map((k) => `$${k}: ${k.startsWith("n") ? "Int" : "String"}!`)
    .join(", ");
  const { data, rate } = await ghGraphql(`query(${decl}) { ${fields.join("\n")} }`, vars, { signal: opts.signal });

  const snaps = new Map<string, Snap>();
  items.forEach((it, i) => {
    const node = data?.[`i${i}`] ?? {};
    const pr = node.pullRequest;
    const issue = node.issue;
    const s = emptySnap();
    if (pr) {
      s.isPr = true;
      s.state = lower(pr.state) || "unknown";
      s.merged = pr.merged === true;
      s.mergeable = lower(pr.mergeable);
      s.updatedEpoch = toEpoch(pr.updatedAt) || s.updatedEpoch;
      s.headOid = String(pr.headRefOid ?? "");
      const cnodes: any[] = pr.comments?.nodes ?? [];
      s.latestComment = firstNonBlankLine(cnodes.at(-1)?.body);
      if (typeof pr.comments?.totalCount === "number") s.comments = pr.comments.totalCount;
      // The validator's comment for THIS head: the newest bot comment naming the head SHA.
      for (const c of [...cnodes].reverse()) {
        const login = String(c?.author?.login ?? "");
        const body = String(c?.body ?? "");
        if (!login.startsWith(VALIDATOR_AUTHOR)) continue;
        const cls = parseReviewClass(body);
        if (!cls) continue;
        if (s.headOid && !body.includes(s.headOid)) continue;
        s.reviewClass = cls;
        break;
      }
      // The newest verdict check run of the validator workflow's suites on the head commit.
      const commit = pr.commits?.nodes?.[0]?.commit;
      let newest: any = null;
      let newestStarted = -1;
      for (const suite of commit?.checkSuites?.nodes ?? []) {
        if (suite?.workflowRun?.workflow?.name !== opts.workflow) continue;
        const status = lower(suite?.status);
        if (status && status !== "completed") s.suiteStatus = status;
        else if (!s.suiteStatus) s.suiteStatus = status;
        for (const run of suite?.checkRuns?.nodes ?? []) {
          const started = toEpoch(run?.startedAt);
          if (started >= newestStarted) {
            newest = run;
            newestStarted = started;
          }
        }
      }
      if (newest) {
        s.checkRunId = String(newest.databaseId ?? "");
        s.checkStatus = lower(newest.status);
        s.checkConclusion = lower(newest.conclusion);
      }
    } else if (issue) {
      s.state = lower(issue.state) || "unknown";
      s.updatedEpoch = toEpoch(issue.updatedAt) || s.updatedEpoch;
      if (typeof issue.comments?.totalCount === "number") s.comments = issue.comments.totalCount;
      s.latestComment = firstNonBlankLine(issue.comments?.nodes?.at(-1)?.body);
    }
    snaps.set(it.key, s);
  });
  return { snaps, rate };
}

// --- deciding ----------------------------------------------------------------------

export interface EventOptions {
  /** Unix seconds of this poll. */
  nowEpoch: number;
  /** Stall window, minutes. */
  stallMin: number;
}

/** Whether the verdict between `seed` and `cur` is new and final (see THE CONTRACT). */
export function verdictIsNew(seed: Snap, cur: Snap): boolean {
  const cls = classify(cur);
  if (cls === "PENDING" || cls === "NONE") return false;
  if (cur.checkRunId !== seed.checkRunId) return true;
  return classify(seed) === "PENDING" || cur.checkConclusion !== seed.checkConclusion;
}

/** The first event `cur` fires against `seed`, or `null`. */
export function watchEvent(
  seed: Snap,
  cur: Snap,
  events: Set<string>,
  opts: EventOptions,
): WatchEventName | null {
  if (events.has("merged") && cur.merged) return "merged";
  if (events.has("closed") && cur.state === "closed" && !cur.merged) return "closed";
  if (events.has("conflict") && cur.isPr && cur.state === "open" && cur.mergeable === "conflicting") return "conflict";
  if (events.has("comment") && cur.comments !== null && seed.comments !== null && cur.comments !== seed.comments) {
    return "comment";
  }
  if (events.has("verdict") && verdictIsNew(seed, cur)) return "verdict";
  if (
    events.has("stall") &&
    !cur.merged &&
    cur.state !== "closed" &&
    cur.state !== "" &&
    cur.state !== "unknown" &&
    Math.floor((opts.nowEpoch - cur.updatedEpoch) / 60) >= opts.stallMin
  ) {
    return "stall";
  }
  return null;
}

/** The wake line for a fired event: `<EVENT>  <item>  <detail>  <url>`. */
export function formatWake(
  it: Item,
  event: WatchEventName,
  seed: Snap,
  cur: Snap,
  opts: { stallMin: number; check: string },
): string {
  const url = `https://github.com/${it.owner}/${it.repo}/${cur.isPr ? "pull" : "issues"}/${it.num}`;
  switch (event) {
    case "merged":
      return `MERGED   ${it.key}  (unblocked)  ${url}`;
    case "closed":
      return `CLOSED   ${it.key}  closed without merging — find its successor  ${url}`;
    case "conflict":
      return `CONFLICT ${it.key}  conflicts with its base — the validator cannot run until the base is merged in  ${url}`;
    case "comment":
      return `COMMENT  ${it.key}  new comment (${seed.comments} -> ${cur.comments})  ${url}`;
    case "verdict":
      return `VERDICT  ${it.key}  ${classify(cur)}  ${opts.check} ${cur.checkConclusion || cur.checkStatus} at ${cur.headOid.slice(0, 12)}  ${url}`;
    case "stall":
      return `STALL    ${it.key}  no progress for ${opts.stallMin}m (open, unmerged) — takeover candidate  ${url}`;
  }
  return "";
}

/** The ARM report for one item: the baseline the watch armed on. */
export function armReport(it: Item, cur: Snap): string {
  const url = `https://github.com/${it.owner}/${it.repo}/${cur.isPr ? "pull" : "issues"}/${it.num}`;
  const state = cur.merged ? "merged" : cur.state || "unknown";
  const merge = cur.isPr && !cur.merged && cur.state === "open" ? `  mergeable=${cur.mergeable || "unknown"}` : "";
  return `ARM      ${it.key}  state=${state}  verdict=${classify(cur)}${merge}  ${url}`;
}

/** An arm baseline that already needs action: a BLOCK or INCONCLUSIVE verdict on the head. */
export function armNotable(snap: Snap): boolean {
  const cls = classify(snap);
  return cls === "BLOCK" || cls === "INCONCLUSIVE";
}

/** A fired event plus the seed/observation that produced it. */
export interface Fire {
  item: Item;
  event: WatchEventName;
  line: string;
  seed: Snap;
  snap: Snap;
}

/** One ARM report line and the snapshot behind it. */
export interface ArmReport {
  item: Item;
  line: string;
  snap: Snap;
}

export interface PollOptions extends ObserveOptions {
  events: Set<string>;
  stallMin: number;
}

/**
 * One batched poll over every item, returning the first fire and updating `seeds` in
 * place. An item with no seed adopts its observation as the baseline without firing.
 */
export async function pollOnce(
  items: Item[],
  seeds: Map<string, Snap>,
  opts: PollOptions,
): Promise<{ fire: Fire | null; rate: RateInfo }> {
  const now = nowEpoch();
  const { snaps, rate } = await batchSnapshot(items, opts);
  let fire: Fire | null = null;
  for (const it of items) {
    const cur = snaps.get(it.key) ?? emptySnap();
    const seed = seeds.get(it.key);
    const ev = seed ? watchEvent(seed, cur, opts.events, { nowEpoch: now, stallMin: opts.stallMin }) : null;
    seeds.set(it.key, cur);
    if (ev && !fire) {
      fire = { item: it, event: ev, seed: seed as Snap, snap: cur, line: formatWake(it, ev, seed as Snap, cur, opts) };
    }
  }
  return { fire, rate };
}

/** Seed the baseline for every item and build its ARM report. */
export async function seedAll(
  items: Item[],
  opts: ObserveOptions,
): Promise<{ seeds: Map<string, Snap>; reports: ArmReport[] }> {
  const { snaps } = await batchSnapshot(items, opts);
  const reports: ArmReport[] = [];
  for (const it of items) {
    const snap = snaps.get(it.key);
    if (snap) reports.push({ item: it, line: armReport(it, snap), snap });
  }
  return { seeds: snaps, reports };
}

/** A `setTimeout` that resolves early (without throwing) when `signal` aborts. */
export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RunOptions {
  events: Set<string>;
  intervalSec: number;
  stallMin: number;
  workflow: string;
  check: string;
  /** 0 = no timeout. */
  timeoutSec: number;
  signal?: AbortSignal;
  /** Called with each RATE-LIMIT backoff notice (stderr in the CLI). */
  onNotice?: (line: string) => void;
  /**
   * Called ONCE with every item's ARM baseline, the moment the baseline poll returns —
   * before any event can fire — so a caller can show that the watch is armed and on what.
   */
  onArm?: (reports: ArmReport[]) => void;
  /**
   * Whether a BLOCK/INCONCLUSIVE already on the head at arm ends the watch at once
   * (default true). A continuous watcher re-arms after every wake, so it passes false
   * after its first arm, or the same baseline would wake it forever.
   */
  armWake?: boolean;
}

export interface RunResult {
  fire: Fire | null;
  /** The ARM reports, delivered first. */
  reports: ArmReport[];
  /** True when the ARM baseline alone needed action (a BLOCK/INCONCLUSIVE already on the head). */
  armFired: boolean;
  timedOut: boolean;
  rateLimited?: RateLimitedError;
  /** The seed failed for a reason other than a rate limit. */
  seedError?: Error;
}

/**
 * The ONE watch loop: arm, report the baseline, then poll until the first event, the
 * timeout, a rate limit, or the signal. A state event already in force at arm fires at
 * once; a BLOCK/INCONCLUSIVE already on the head wakes at once with its ARM report.
 * A continuous watcher is this function called again after each wake (`watchStream`).
 */
export async function runWatch(items: Item[], opts: RunOptions): Promise<RunResult> {
  const none: RunResult = { fire: null, reports: [], armFired: false, timedOut: false };
  const observe = { workflow: opts.workflow, check: opts.check, signal: opts.signal };
  let seeds: Map<string, Snap>;
  let reports: ArmReport[];
  try {
    ({ seeds, reports } = await seedAll(items, observe));
  } catch (err: any) {
    if (err instanceof RateLimitedError) return { ...none, rateLimited: err };
    if (opts.signal?.aborted) return none;
    return { ...none, seedError: err };
  }
  opts.onArm?.(reports);
  const now = nowEpoch();
  for (const it of items) {
    const snap = seeds.get(it.key);
    if (!snap) continue;
    const ev = watchEvent(snap, snap, opts.events, { nowEpoch: now, stallMin: opts.stallMin });
    if (ev) {
      return {
        fire: { item: it, event: ev, seed: snap, snap, line: formatWake(it, ev, snap, snap, opts) },
        reports,
        armFired: false,
        timedOut: false,
      };
    }
  }
  if (opts.armWake !== false && opts.events.has("verdict") && reports.some((r) => armNotable(r.snap))) {
    return { fire: null, reports, armFired: true, timedOut: false };
  }
  const start = Date.now();
  let wait = opts.intervalSec;
  for (;;) {
    // Never sleep past the deadline: with the 300 s poll floor, a 60 s timeout used to wait the
    // whole interval before it was even checked (measured: `--timeout 60` returned after 300 s).
    const leftMs = opts.timeoutSec > 0 ? opts.timeoutSec * 1000 - (Date.now() - start) : Infinity;
    await sleepAbortable(Math.max(0, Math.min(wait * 1000, leftMs)), opts.signal);
    wait = opts.intervalSec;
    if (opts.signal?.aborted) return { ...none, reports };
    if (opts.timeoutSec > 0 && Date.now() - start >= opts.timeoutSec * 1000) {
      return { fire: null, reports, armFired: false, timedOut: true };
    }
    let outcome;
    try {
      outcome = await pollOnce(items, seeds, { ...observe, events: opts.events, stallMin: opts.stallMin });
    } catch (err) {
      if (err instanceof RateLimitedError) return { ...none, reports, rateLimited: err };
      if (opts.signal?.aborted) return { ...none, reports };
      continue; // a transient API failure skips this poll
    }
    if (outcome.fire) return { fire: outcome.fire, reports, armFired: false, timedOut: false };
    if (outcome.rate.remaining !== null && outcome.rate.remaining < RATE_FLOOR) {
      wait = Math.min(opts.intervalSec * BACKOFF_FACTOR, MAX_BACKOFF_S);
      opts.onNotice?.(`RATE-LIMIT  core remaining=${outcome.rate.remaining} < ${RATE_FLOOR} — backing off ${wait}s`);
    }
  }
}

/** The events that end a watch for their item: once fired, that item is done. */
export const STATE_EVENTS: ReadonlySet<string> = new Set(["merged", "closed", "conflict", "stall"]);

/**
 * A continuous watch: `runWatch` re-armed after every wake, delivering each ARM report
 * once and each wake line as it fires. An item whose STATE event fired is dropped. It
 * returns when no item is left, the signal aborts, or a rate limit is hit.
 */
export async function watchStream(
  items: Item[],
  opts: Omit<RunOptions, "timeoutSec" | "armWake">,
  deliver: (line: string) => Promise<void>,
  warn: (message: string) => void,
): Promise<void> {
  let open = [...items];
  let first = true;
  while (open.length > 0 && !opts.signal?.aborted) {
    const res = await runWatch(open, { ...opts, timeoutSec: 0, armWake: first });
    if (first) for (const r of res.reports) await deliver(r.line);
    first = false;
    if (res.rateLimited) {
      warn(rateLimitMessage(res.rateLimited));
      return;
    }
    if (res.seedError) {
      warn(`the poll failed: ${res.seedError.message}`);
      await sleepAbortable(opts.intervalSec * 1000, opts.signal);
      continue;
    }
    if (res.fire) {
      await deliver(res.fire.line);
      if (STATE_EVENTS.has(res.fire.event)) open = open.filter((it) => it.key !== res.fire!.item.key);
    }
  }
}
