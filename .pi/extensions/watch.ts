/**
 * watch.ts — pi's WAKE BINDING for the harness-neutral watcher tooling.
 *
 * WHY IT EXISTS. A pi session is woken ONLY when a tool call returns. It has no
 * background-completion notification and no subagent (the `pi-subagents` package is
 * deliberately not installed), so a long wait — a PR's `charly/pr-validator` verdict, a
 * reviewer's BLOCK comment, a 40-minute R10 bed, an issue reply — is either hand-polled
 * (the R4 band-aid) or dropped. The sibling harnesses bind a watcher (opencode's
 * `pr-watch.ts` + `ctx.session.synthetic`, reasonix's `watch-arm.sh` hook); pi has
 * nothing. This extension is that binding.
 *
 * IT IS DELIBERATELY THIN (R3, "as neutral as possible"). It contains NO watching logic:
 * it SPAWNS the harness-neutral shell tools and turns each line they print into a user
 * turn. All the real behaviour — the poll floor, the single-instance lock, the rate-limit
 * back-off, the stall alarm, the exit-code classification — lives in those scripts, which
 * are usable from bash, Claude Code, Codex, and CI too:
 *
 *   - `marketplace/scripts/gh_watch.sh`      — PRs + issues (the org-wide watcher family)
 *   - `scripts/check-bed-watch.sh`           — R10 check beds (this repo's bed surface)
 *
 * WAKE DELIVERY. The scripts print one line per event and (for `gh_watch.sh`) exit.
 * `pi.sendUserMessage(text, {deliverAs:"followUp"})` delivers that line as a USER TURN, so
 * the agent acts on it in a fresh turn — the pi equivalent of opencode's
 * `ctx.session.synthetic` and reasonix's SessionStart injection. The agent's own re-arm is
 * replaced by the extension re-arming the one-shot watcher on its exit (the re-arm
 * invariant, `marketplace/internals/skills/git-workflow/references/watch-and-wake.md`).
 *
 * AUTO-ARM. On `session_start` the extension arms `gh_watch.sh` from `.pi/watch.items`
 * (comment-only by default, so it is INERT until the operator arms a scope). R10 beds are
 * launched explicitly through the `watch_arm` tool — never auto-launched, because running a
 * `disposable: true` bed is a deliberate, evidence-producing act.
 *
 * `session_shutdown` kills every child (idempotent), so no watcher outlives the session.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "typebox";

// ── the neutral tooling this binding drives (relative to the project root) ─────
/** The GitHub watcher family member (org-wide, harness-neutral). */
const GH_WATCH_REL = "marketplace/scripts/gh_watch.sh";
/** The R10 bed runner/reporter (harness-neutral; this repo's `scripts/`). */
const BED_WATCH_REL = "scripts/check-bed-watch.sh";
/** The pi GitHub watch list (comment-only = inert). */
const ITEMS_REL = ".pi/watch.items";

/** The watcher's poll floor and stall window (`gh_watch.sh` refuses a sub-60s interval). */
const INTERVAL = "60";
const STALL_MIN = "60";
/**
 * The delivered event set. `comment` (a reviewer's BLOCK/PASS on an issue OR PR) and
 * `verdict` (the `charly/pr-validator` run reaching a status) are included because the
 * operator's ask is explicitly "issue, PR and validation comments and results"; `stall`
 * is included because it is the silence alarm (`gh_watch.sh` drops it when `--events` is
 * overridden, so it must be named here).
 */
const EVENTS = "comment,verdict,merged,closed,stall";

/** A child that exits this fast without printing a line is a FAILURE, not a quiet watch. */
const FAST_FAIL_MS = 5000;
/** Consecutive immediate failures tolerated before the binding gives up (no blind retry). */
const MAX_FAST_FAILURES = 3;

// ── module state ──────────────────────────────────────────────────────────────
let projectRoot = "";
let latestCtx: any = null;
let stopping = false;

interface GhState {
  proc: ChildProcess | null;
  /**
   * ARM GENERATION — bumped on every arm (and BEFORE a restart kills the running one). An exit
   * from a superseded generation says nothing about the current arm and is ignored. Without it,
   * the exit handler of an already-stopped child cleared the LIVE arm's slot, counted the
   * deliberate SIGTERM as an immediate failure, and re-armed a DUPLICATE — whose
   * `watch_lock --takeover` then TERMed the live watcher (silent exit 143: no stdout, no stderr)
   * → three “fast failures” in a row → `WATCHER FATAL … last stderr: (none)`, the re-arm loop
   * stopped for good, and a stray watcher kept holding the lock.
   */
  gen: number;
  items: string[];
  /** Items that fired a terminal STATE (MERGED/CLOSED) — never re-armed. */
  done: Set<string>;
  /**
   * Items that fired a STATE fire (STALL) — a one-shot arm must NOT re-arm for them. `gh_watch.sh`
   * sets `WATCH_DONE=1` on every STATE fire (MERGED/CLOSED/STALL) and deliberately does not
   * re-arm, because "the successor would IMMEDIATELY re-fire it (a merged PR stays merged; a
   * stalled item stays stalled), which would livelock and burn the API budget". MERGED/CLOSED
   * land in `done`; STALL must land here, or the extension's own re-arm bypasses that guard and
   * hot-loops at ~2s on a stale item. Cleared on restart. */
  stalled: Set<string>;
  fastFailures: number;
  startedAt: number;
  lastErr: string;
  rearmTimer: ReturnType<typeof setTimeout> | null;
}
const gh: GhState = {
  proc: null,
  gen: 0,
  items: [],
  done: new Set(),
  stalled: new Set(),
  fastFailures: 0,
  startedAt: 0,
  lastErr: "",
  rearmTimer: null,
};

interface BedRun {
  bed: string;
  proc: ChildProcess;
  sawLine: boolean;
}
const beds = new Map<string, BedRun>();

// ── pure helpers (asserted statically by scripts/check-pi-watch.mjs) ───────────

/**
 * Split a `.pi/watch.items` file into non-comment lines (order preserved). The grammar is
 * the SAME as `.reasonix/watch.items` / `.opencode/pr-watch.items`, so a list is portable
 * between harnesses: `owner/repo#num`, `owner/repo/pull|issues/num`, or a full
 * `https://github.com/...` URL.
 */
export function parseItems(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#") && isGithubItem(s));
}

/** True for a well-formed item in any of the three accepted forms. */
export function isGithubItem(raw: string): boolean {
  let s = raw.trim().replace(/^https?:\/\/github\.com\//i, "");
  s = s.split("?")[0];
  return (
    /^[^/\s#]+\/[^/\s#]+#[0-9]+$/.test(s) ||
    /^[^/\s]+\/[^/\s]+\/(?:pull|issues)\/[0-9]+$/.test(s)
  );
}

/** The event token of a watcher line (`MERGED`, `COMMENT`, …), upper-cased. */
export function watcherEvent(line: string): string {
  return (line.trim().split(/\s+/)[0] ?? "").toUpperCase();
}

/** The item token of a watcher line (`owner/repo#num`), or "". */
export function watcherItem(line: string): string {
  return line.trim().split(/\s+/)[1] ?? "";
}

// ── delivery + child plumbing ─────────────────────────────────────────────────

/** Deliver one watcher line as a user turn (the pi wake primitive). */
function deliver(pi: ExtensionAPI, text: string): void {
  try {
    const idle = latestCtx && typeof latestCtx.isIdle === "function" ? latestCtx.isIdle() : false;
    if (idle) pi.sendUserMessage(text);
    else pi.sendUserMessage(text, { deliverAs: "followUp" });
  } catch {
    try {
      pi.sendUserMessage(text, { deliverAs: "followUp" });
    } catch {
      /* the session is gone — nothing to wake */
    }
  }
}

/** Split a child stream into lines and hand each to `onLine` (blank lines dropped). */
function readLines(stream: NodeJS.ReadableStream | null, onLine: (line: string) => void): void {
  if (!stream) return;
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      if (line.trim()) onLine(line);
    }
  });
}

/** Notify in the UI when there is one; never throw. */
function note(ctx: any, msg: string): void {
  try {
    if (ctx?.hasUI) ctx.ui?.notify?.(msg, "info");
  } catch {
    /* no UI */
  }
}

/** Read `.pi/watch.items` (absent/comment-only => inert). */
async function readItems(): Promise<string[]> {
  try {
    return parseItems(await readFile(join(projectRoot, ITEMS_REL), "utf8"));
  } catch {
    return [];
  }
}

// ── GitHub watcher lifecycle ───────────────────────────────────────────────────

function clearRearm(): void {
  if (gh.rearmTimer) {
    clearTimeout(gh.rearmTimer);
    gh.rearmTimer = null;
  }
}

/** Handle one `gh_watch.sh` event line: de-duplicate STATE fires, then deliver. */
function handleGhLine(pi: ExtensionAPI, line: string): void {
  const ev = watcherEvent(line);
  const item = watcherItem(line);
  if (ev === "MERGED" || ev === "CLOSED") gh.done.add(item);
  if (ev === "STALL") {
    // STATE fire: mirror `gh_watch.sh`'s WATCH_DONE — a stalled item is NOT re-armed, so it can
    // never emit a second STALL. The former delivery-dedup map is gone with that guarantee (R5).
    gh.stalled.add(item);
  }
  deliver(pi, `WATCHER ${line.trim()}`);
}

/** Arm (or re-arm) the one-shot `gh_watch.sh` over the items not yet terminal. */
function armGh(pi: ExtensionAPI): void {
  if (stopping) return;
  const active = gh.items.filter((i) => !gh.done.has(i) && !gh.stalled.has(i));
  if (active.length === 0) return;

  const script = join(projectRoot, GH_WATCH_REL);
  if (!existsSync(script)) {
    note(latestCtx, `watch: ${GH_WATCH_REL} not found — the marketplace pin is stale`);
    return;
  }

  const args = [
    script,
    "--interval",
    INTERVAL,
    "--stallmin",
    STALL_MIN,
    "--events",
    EVENTS,
    ...active,
  ];
  const gen = ++gh.gen;
  const proc = spawn("bash", args, { cwd: projectRoot, env: process.env });
  gh.proc = proc;
  gh.startedAt = Date.now();
  gh.lastErr = "";
  let sawLine = false;

  readLines(proc.stdout, (line) => {
    if (gen !== gh.gen) return; // a superseded arm never delivers
    sawLine = true;
    handleGhLine(pi, line);
  });
  readLines(proc.stderr, (line) => {
    if (gen !== gh.gen) return;
    gh.lastErr = line.trim();
  });

  proc.on("error", (err) => {
    if (gen !== gh.gen) return;
    gh.lastErr = String(err);
  });
  proc.on("exit", (code) => {
    // A SUPERSEDED arm (a restart bumped the generation before killing it) is not a failure
    // and must not re-arm — its successor is already running.
    if (gen !== gh.gen) return;
    if (gh.proc === proc) gh.proc = null;
    if (stopping) return;
    // Exit 6 = `gh_watch.sh` could not acquire the watch lock: a PEER holds it. That is the
    // single-instance guard working, never a failure of this arm (and never a FATAL) — but this
    // session's own delivery is not running, so back off and say so.
    if (code === 6) {
      note(latestCtx, "watch: another watcher holds the lock (exit 6) — retrying in 60s");
      clearRearm();
      gh.rearmTimer = setTimeout(() => armGh(pi), 60000);
      return;
    }
    // A rate limit (7) or a usage error (5) is terminal: never blind-retry it (R4).
    if (code === 7 || code === 5) {
      deliver(
        pi,
        `WATCHER FATAL — the GitHub watcher stopped (exit ${code}): ${gh.lastErr || "see stderr"}`,
      );
      return;
    }
    const fast = Date.now() - gh.startedAt < FAST_FAIL_MS && !sawLine;
    gh.fastFailures = fast ? gh.fastFailures + 1 : 0;
    if (gh.fastFailures >= MAX_FAST_FAILURES) {
      deliver(
        pi,
        `WATCHER FATAL — the GitHub watcher failed ${MAX_FAST_FAILURES} times immediately; last stderr: ${
          gh.lastErr || "(none)"
        }`,
      );
      return;
    }
    const delay = fast ? 15000 : 2000;
    clearRearm();
    gh.rearmTimer = setTimeout(() => armGh(pi), delay);
  });
}

/** Re-read the items file and (re)start the watcher from scratch. */
async function restartGh(pi: ExtensionAPI): Promise<string> {
  clearRearm();
  // Supersede the running arm BEFORE killing it. This bump is load-bearing, not decorative:
  // `armGh` may return WITHOUT arming (every item already terminal), so without it the killed
  // child's exit would still match the current generation and be counted as a fast failure.
  gh.gen++;
  if (gh.proc) {
    gh.proc.kill("SIGTERM");
    gh.proc = null;
  }
  gh.items = await readItems();
  gh.done.clear();
  gh.stalled.clear();
  gh.fastFailures = 0;
  armGh(pi);
  return gh.items.length === 0
    ? `${ITEMS_REL} is empty/comment-only — no GitHub watch armed (inert by design).`
    : `GitHub watcher armed on ${gh.items.length} item(s): ${gh.items.join(", ")}`;
}

// ── R10 bed lifecycle (delegated to the neutral check-bed-watch.sh) ────────────

/** Launch one bed through the neutral watcher; its exit lines are delivered as wakes. */
function armBed(pi: ExtensionAPI, bed: string, timeout: number): string {
  if (beds.has(bed)) return `already watching bed '${bed}'`;
  const script = join(projectRoot, BED_WATCH_REL);
  if (!existsSync(script)) return `${BED_WATCH_REL} not found`;
  const charly = join(projectRoot, "charly", "bin", "charly");
  if (!existsSync(charly)) return `charly binary not built at ${charly}`;

  const args = [script, "--charly", charly];
  if (timeout > 0) args.push("--timeout", String(timeout));
  args.push(bed);

  const proc = spawn("bash", args, { cwd: projectRoot, env: process.env });
  const run: BedRun = { bed, proc, sawLine: false };
  beds.set(bed, run);

  readLines(proc.stdout, (line) => {
    run.sawLine = true;
    deliver(pi, `WATCHER ${line.trim()}`);
  });
  readLines(proc.stderr, () => {
    /* progress notices — the wake carries the outcome, not the chatter */
  });
  proc.on("exit", (code) => {
    beds.delete(bed);
    if (stopping) return;
    if (!run.sawLine) {
      deliver(pi, `WATCHER BED ${bed} FAILED TO REPORT (exit ${code ?? "?"})`);
    }
  });
  return `Bed '${bed}' launched; its completion line arrives as a wake.`;
}

// ── extension entry point ─────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, _ctx) => {
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n## Waiting (pi wake binding)\n\n" +
        "Never hand-poll and never block a turn on a long wait. The `watch` extension arms the\n" +
        "harness-neutral watcher family and delivers every event as a user turn:\n\n" +
        "- GitHub (PRs + issues): auto-armed at session start from `.pi/watch.items`.\n" +
        "- R10 beds: `watch_arm` with `action: \"bed\"` (runs `charly check run <bed>` and wakes\n" +
        "  you with its exit code + newest `summary.yml`); never run a bed inline when a wake is\n" +
        "  wanted.\n" +
        "- `watch_arm` with `action: \"status\"` shows what is armed; `\"restart\"` re-reads the\n" +
        "  items file.\n\n" +
        "An `Agent:`/`Assisted-by:` footer and the CLAIM/OWNING/... grammar still apply to any\n" +
        "coordination comment. A wake is an ADDITION to the ledger, never a reset.\n",
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    projectRoot = ctx.cwd;
    latestCtx = ctx;
    stopping = false;
    gh.items = await readItems();
    if (gh.items.length > 0) {
      armGh(pi);
      note(ctx, `watch: GitHub watcher armed on ${gh.items.length} item(s)`);
    }
  });

  pi.on("session_shutdown", async () => {
    stopping = true;
    clearRearm();
    try {
      gh.proc?.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    for (const run of beds.values()) {
      try {
        run.proc.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    }
    beds.clear();
  });

  pi.registerTool({
    name: "watch_arm",
    label: "Arm a background watcher",
    description:
      "Arm the harness-neutral watcher tooling for this pi session and receive every " +
      "event as a user turn. `action: \"status\"` reports what is armed; `\"restart\"` re-reads " +
      "`.pi/watch.items` (GitHub PRs/issues) and re-arms; `\"bed\"` runs `charly check run <bed>` " +
      "in the background through `scripts/check-bed-watch.sh` and wakes you with its exit code " +
      "and newest summary.yml. Use it whenever you would otherwise wait for a PR, an issue " +
      "reply, a validator verdict, or an R10 bed.",
    promptSnippet: "Arm a background watcher (GitHub, or an R10 bed)",
    promptGuidelines: [
      "Whenever you must wait for a PR, an issue reply, a validator verdict, or an R10 bed, ensure a watcher is armed — never hand-poll (R4).",
      "GitHub watching is auto-armed from .pi/watch.items; add a scope to that file (owner/repo#num) and call watch_arm action=restart.",
      "For an R10 bed, call watch_arm action=bed with the bed name instead of running `charly check run` inline — its completion arrives as a wake.",
      "A wake is an ADDITION to the ledger, never a reset; re-arm explicitly only when the wake is a STALL takeover candidate.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "restart", "bed"] as const, {
        description: "status = report armed watchers; restart = re-read .pi/watch.items; bed = run+watch an R10 bed",
      }),
      bed: Type.Optional(Type.String({ description: "the R10 bed name (for action=bed)" })),
      timeoutSeconds: Type.Optional(
        Type.Number({ description: "per-bed deadline in seconds (action=bed; default 0=none)" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const action = params.action as string;
      if (action === "restart") {
        return { content: [{ type: "text", text: await restartGh(pi) }], details: {} };
      }
      if (action === "bed") {
        const bed = (params.bed as string | undefined)?.trim();
        if (!bed) {
          return { content: [{ type: "text", text: "watch_arm: `bed` is required for action=bed" }], details: {} };
        }
        const timeout = (params.timeoutSeconds as number | undefined) ?? 0;
        return { content: [{ type: "text", text: armBed(pi, bed, timeout) }], details: {} };
      }
      const lines = [
        `project:  ${projectRoot}`,
        `GitHub:   ${gh.items.length === 0 ? "inert (.pi/watch.items empty/comment-only)" : `${gh.items.length} item(s)`}`,
        `  items:  ${gh.items.join(", ") || "-"}`,
        `  done:   ${[...gh.done].join(", ") || "-"}`,
        `  stalled: ${[...gh.stalled].join(", ") || "-"} (STATE fire — not re-armed; restart to re-watch)`,
        `  armed:  ${gh.proc ? "yes (this session's arm is tracked)" : gh.rearmTimer ? "re-arm pending" : "no — this session tracks no arm"}`,
        `beds:     ${beds.size === 0 ? "none" : [...beds.keys()].join(", ")}`,
      ];
      return { content: [{ type: "text", text: lines.join("\n") }], details: {} };
    },
  });
}
