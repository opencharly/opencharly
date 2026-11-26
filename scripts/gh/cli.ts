#!/usr/bin/env node
/**
 * cli.ts — the ONE command line for the GitHub watcher and coordination tools
 * (opencharly/opencharly#1140). Run it with node from the umbrella root:
 *
 *   node scripts/gh/cli.ts watch   [--events E] [--interval S] [--stallmin M] [--timeout S] [--no-arm-wake] <item>…
 *   node scripts/gh/cli.ts status  <item>…
 *   node scripts/gh/cli.ts items   <file>      (print the items a watch-items file carries)
 *   node scripts/gh/cli.ts footer  [--agent A] [--model M] [--confidence T] [--parent P] [--harness H --session S]
 *   node scripts/gh/cli.ts comment <VERB> <item> [--body T | --body-file F] [--assign] [--dry-run] [identity flags]
 *   node scripts/gh/cli.ts issue   --repo O/R --title T --category category:<v> --type type:<v>
 *                                  --remedy "files/behaviour the remedy will touch" [--cited "<rule|none>"]
 *                                  --blocking | --non-blocking
 *                                  --mechanism M --missed-control C --blast-radius B --root-fix F
 *                                  --evidence E | --evidence-file FILE   --spike "<result|none: reason>"
 *                                  [--body extra] [--dry-run] [identity flags]
 *
 * An issue is the OUTPUT of a finished RCA (AGENTS.md R1): `issue` refuses to file without the
 * RCA's conclusion and its verified evidence, and without a classification. `--blocking` (the
 * issue blocks the filer's own progress) assigns the filer and posts the CLAIM — the filer fixes
 * it; `--non-blocking` leaves it unclaimed for a later session.
 *
 * WHICH WATCH TO ARM — by what you wait for:
 *   your own PR's verdict and landing (also after a REST re-run)   --events verdict,merged,closed,conflict   (the default)
 *   another session's PR or issue that blocks you                  --events merged,closed,stall
 *   a reply on a thread                                            --events comment
 *   several items: list them all in ONE watch (one watcher per session).
 *
 * `watch` prints the ARM baseline to stderr, then ONE wake line to stdout and exits:
 *   MERGED   <item>  (unblocked)  <url>
 *   CLOSED   <item>  closed without merging — find its successor  <url>
 *   CONFLICT <item>  conflicts with its base — the validator cannot run until the base is merged in  <url>
 *   COMMENT  <item>  new comment (<n> -> <m>)  <url>
 *   VERDICT  <item>  PASS|BLOCK|INCONCLUSIVE  <check> <conclusion> at <head>  <url>
 *   STALL    <item>  no progress for <m>m (open, unmerged) — takeover candidate  <url>
 *   ARM      <item>  state=<s>  verdict=BLOCK|INCONCLUSIVE  <url>   (a verdict already on the head at arm)
 *   TIMEOUT  no event within <n>s
 * Run it as the harness's MANAGED background command (never `&`/`disown`): its exit is the
 * wake. Re-arm after acting on a wake; arming the same watch again takes over the old one.
 * A binding that re-arms automatically passes `--no-arm-wake` on every re-arm after the
 * first, so a verdict already reported at arm does not wake it again.
 *
 * Identity for `footer`/`comment`: explicit flags, else `COORD_HARNESS` + `COORD_SESSION`,
 * else the harness's own environment (`CLAUDE_CODE_SESSION_ID`, `DSH_SESSION_ID`); the
 * agent, model and tier from flags or `COORD_AGENT`/`COORD_MODEL`/`COORD_CONFIDENCE`.
 *
 * EXIT  0 event / success · 4 timeout · 5 usage or API error · 6 lock (a peer would not
 *       yield) · 7 rate limit (never retried) · 8 the initial poll failed · 143 terminated
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { GhError, RateLimitedError, ghJson, rateLimitMessage } from "./lib/github.ts";
import {
  DEFAULT_CHECK,
  DEFAULT_EVENTS,
  DEFAULT_INTERVAL_S,
  DEFAULT_STALL_MIN,
  DEFAULT_WORKFLOW,
  UsageError,
  armReport,
  armNotable,
  batchSnapshot,
  checkInterval,
  classify,
  parseEvents,
  parseItem,
  parseItemsFile,
  runWatch,
  type Item,
} from "./lib/watch.ts";
import {
  buildComment,
  buildFooter,
  canonicalVerb,
  isTier,
  missingIdentity,
  postComment,
  resolveIdentity,
  TIERS,
  VERBS,
} from "./lib/coord.ts";
import { acquireLock } from "./lib/lock.ts";

export const EXIT = { OK: 0, TIMEOUT: 4, USAGE: 5, LOCK: 6, RATE: 7, POLL: 8 } as const;

function usage(): string {
  const src = readFileSync(new URL(import.meta.url), "utf8");
  const m = /\/\*\*([\s\S]*?)\*\//.exec(src);
  return (m ? m[1] : "").replace(/^ \* ?/gm, "").trim() + "\n";
}

/** Split argv into flags (`--k v`, `--flag`) and positionals; `--` ends flags. */
export function parseArgs(argv: string[], booleans: string[] = []): { flags: Record<string, string>; pos: string[] } {
  const flags: Record<string, string> = {};
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (booleans.includes(name)) {
        flags[name] = "1";
        continue;
      }
      if (i + 1 >= argv.length) throw new UsageError(`flag --${name} needs a value`);
      flags[name] = argv[++i];
      continue;
    }
    if (a.startsWith("-") && a !== "-") throw new UsageError(`unknown option ${a}`);
    pos.push(a);
  }
  return { flags, pos };
}

function onlyFlags(flags: Record<string, string>, allowed: string[]): void {
  for (const k of Object.keys(flags)) {
    if (!allowed.includes(k)) throw new UsageError(`unknown flag --${k}`);
  }
}

function items(pos: string[]): Item[] {
  if (pos.length === 0) throw new UsageError("no item — want owner/repo#123 or a GitHub PR/issue URL");
  return pos.map((raw) => {
    const it = parseItem(raw);
    if (!it) throw new UsageError(`malformed item '${raw}' — want owner/repo#123 or a GitHub PR/issue URL`);
    return it;
  });
}

function uint(v: string | undefined, dflt: number, name: string): number {
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new UsageError(`--${name} must be an integer >= 0, got '${v}'`);
  return n;
}

async function cmdWatch(argv: string[], out: (s: string) => void, err: (s: string) => void): Promise<number> {
  const { flags, pos } = parseArgs(argv, ["no-arm-wake"]);
  onlyFlags(flags, ["events", "interval", "stallmin", "timeout", "workflow", "check", "no-arm-wake"]);
  const its = items(pos);
  const events = parseEvents(flags.events, DEFAULT_EVENTS);
  const intervalSec = checkInterval(flags.interval ?? DEFAULT_INTERVAL_S);
  const stallMin = uint(flags.stallmin, DEFAULT_STALL_MIN, "stallmin");
  const timeoutSec = uint(flags.timeout, 0, "timeout");
  const workflow = flags.workflow ?? DEFAULT_WORKFLOW;
  const check = flags.check ?? DEFAULT_CHECK;

  const key = JSON.stringify([its.map((i) => i.key).sort(), [...events].sort(), workflow, check]);
  const release = await acquireLock(key);
  if (!release) {
    err("gh watch: could not take over the watch lock — a peer watching the same items would not exit");
    return EXIT.LOCK;
  }
  const abort = new AbortController();
  const onTerm = () => abort.abort();
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onTerm);
  try {
    const res = await runWatch(its, {
      events,
      intervalSec,
      stallMin,
      workflow,
      check,
      timeoutSec,
      signal: abort.signal,
      onNotice: err,
      // The baseline goes to stderr the moment the watch arms, so a session can see it is
      // armed and on what — not only when the watch ends.
      onArm: (reports) => {
        for (const r of reports) err(r.line);
      },
      armWake: flags["no-arm-wake"] !== "1",
    });
    if (abort.signal.aborted) return 143;
    if (res.rateLimited) {
      err(`FATAL gh watch: ${rateLimitMessage(res.rateLimited)}`);
      return EXIT.RATE;
    }
    if (res.seedError) {
      err(`gh watch: the initial poll failed: ${res.seedError.message}`);
      return EXIT.POLL;
    }
    if (res.fire) {
      out(res.fire.line);
      return EXIT.OK;
    }
    if (res.armFired) {
      for (const r of res.reports) if (armNotable(r.snap)) out(r.line);
      return EXIT.OK;
    }
    if (res.timedOut) {
      out(`TIMEOUT  no event within ${timeoutSec}s`);
      return EXIT.TIMEOUT;
    }
    return EXIT.OK;
  } finally {
    process.off("SIGTERM", onTerm);
    process.off("SIGINT", onTerm);
    release();
  }
}

/**
 * Print the item strings a watch-items FILE carries, one per line — the ONE reader for the
 * shared grammar (`parseItemsFile`), exposed so a binding that cannot import TypeScript (the
 * reasonix shell arm) uses the engine's acceptance set instead of writing a fourth copy of it.
 *
 * It deliberately does NOT validate: `watch` does, by name, and exits 5. A reader that filtered
 * would turn that refusal into the silence this verb exists to end (opencharly/opencharly#1308).
 */
function cmdItems(argv: string[], out: (s: string) => void): number {
  const file = argv[0];
  if (!file) throw new UsageError("items needs a file path");
  if (!existsSync(file)) throw new UsageError(`items: no such file: ${file}`);
  for (const item of parseItemsFile(readFileSync(file, "utf8"))) out(item);
  return EXIT.OK;
}

async function cmdStatus(argv: string[], out: (s: string) => void): Promise<number> {
  const { flags, pos } = parseArgs(argv);
  onlyFlags(flags, ["workflow", "check"]);
  const its = items(pos);
  const { snaps } = await batchSnapshot(its, {
    workflow: flags.workflow ?? DEFAULT_WORKFLOW,
    check: flags.check ?? DEFAULT_CHECK,
  });
  for (const it of its) {
    const s = snaps.get(it.key);
    if (!s) continue;
    const run = s.checkRunId ? `${s.checkStatus}${s.checkConclusion ? "/" + s.checkConclusion : ""}` : "none";
    out(
      `STATUS   ${it.key}  state=${s.merged ? "merged" : s.state}  verdict=${classify(s)}  check=${run}  head=${s.headOid.slice(0, 12) || "-"}  ${armReport(it, s).split("  ").at(-1)}`,
    );
  }
  return EXIT.OK;
}

const IDENTITY_FLAGS = ["agent", "model", "confidence", "parent", "harness", "session"];

function identityFrom(flags: Record<string, string>) {
  const id = resolveIdentity(flags, process.env);
  const missing = missingIdentity(id);
  if (missing.length) {
    throw new UsageError(
      `missing ${missing.map((m) => "--" + m).join(", ")} — pass the flags, set COORD_*, or run inside a harness that exports its session (CLAUDE_CODE_SESSION_ID, DSH_SESSION_ID)`,
    );
  }
  if (!isTier(id.confidence)) throw new UsageError(`invalid --confidence '${id.confidence}' — one of: ${TIERS.join(" | ")}`);
  return id;
}

function cmdFooter(argv: string[], out: (s: string) => void): number {
  const { flags, pos } = parseArgs(argv);
  onlyFlags(flags, IDENTITY_FLAGS);
  if (pos.length) throw new UsageError(`footer takes no positional argument (got '${pos[0]}')`);
  out(buildFooter(identityFrom(flags)));
  return EXIT.OK;
}

async function cmdComment(argv: string[], out: (s: string) => void): Promise<number> {
  const { flags, pos } = parseArgs(argv, ["assign", "dry-run"]);
  onlyFlags(flags, [...IDENTITY_FLAGS, "body", "body-file", "assign", "dry-run"]);
  if (pos.length !== 2) throw new UsageError("comment takes <VERB> <item> — quote a two-word verb or write it with '_'");
  const verb = canonicalVerb(pos[0]);
  if (!verb) throw new UsageError(`invalid verb '${pos[0]}' — one of: ${VERBS.join(", ")}`);
  const [item] = items([pos[1]]);
  const body = flags["body-file"] ? readFileSync(flags["body-file"], "utf8").replace(/\n+$/, "") : flags.body;
  const comment = buildComment(verb, body, identityFrom(flags));
  if (flags["dry-run"]) {
    out(comment);
    return EXIT.OK;
  }
  out(await postComment(item, comment, { assign: flags.assign === "1" }));
  return EXIT.OK;
}

const ISSUE_SECTIONS = [
  ["Category", "category"],
  ["Type", "type"],
  ["Remedy / files the remedy will touch", "remedy"],
  ["Cited design decision or org-rulebook rule (or `none`)", "cited"],
  ["Classification", "classification"],
  ["Evidence (verified: commands with output, file:line, measurements)", "evidence"],
  ["Mechanism", "mechanism"],
  ["Missed control", "missed-control"],
  ["Blast radius", "blast-radius"],
  ["Root fix", "root-fix"],
  ["Spike (its result, or `none` with the reason)", "spike"],
] as const;

/** The RCA fields R1 requires before an issue exists; each must be non-empty. */
const RCA_FIELDS = ["mechanism", "missed-control", "blast-radius", "root-fix", "evidence", "spike"] as const;

/**
 * Evidence is VERIFIED only when it carries an instrument's trace: a fenced block of pasted
 * output, a `$ ` command line, or a `path:line` reference. Prose alone ("it seems to fail") is a
 * hypothesis, which means the RCA is not finished. Deliberately minimal: it refuses evidence
 * with no trace at all; it cannot certify that a trace is true — that bar stays the author's.
 */
export function evidenceHasTrace(evidence: string): boolean {
  return /```/.test(evidence) || /^\s*\$ \S/m.test(evidence) || /[\w./-]+\.\w+:\d+/.test(evidence);
}

/**
 * Compose an issue body in the ORG FORM's answer shape (`### <field>` then the value), so the
 * audit's form parser reads a CLI-filed issue exactly like a form-filed one — plus the session
 * footer. Neither axis value is validated against a second copy of the taxonomy here: the
 * labels are passed straight to the API, and only the labels that exist in every repo are the
 * two closed sets, so an unknown value is refused at the boundary that owns it.
 */
function issueBody(flags: Record<string, string>, footer: string): string {
  const parts = ISSUE_SECTIONS.map(([heading, key]) => `### ${heading}\n\n${(flags[key] ?? "").trim()}`);
  const extra = (flags.body ?? "").trim();
  if (extra) parts.push(extra);
  return parts.join("\n\n") + "\n\n" + footer;
}

async function cmdIssue(argv: string[], out: (s: string) => void): Promise<number> {
  const { flags, pos } = parseArgs(argv, ["dry-run", "blocking", "non-blocking"]);
  onlyFlags(flags, [
    ...IDENTITY_FLAGS,
    "repo", "title", "category", "type", "remedy", "cited", "body", "dry-run",
    "blocking", "non-blocking", ...RCA_FIELDS, "evidence-file",
  ]);
  if (pos.length) throw new UsageError(`issue takes no positional argument (got '${pos[0]}')`);
  if (!/^[^/\s]+\/[^/\s]+$/.test(flags.repo ?? "")) throw new UsageError("--repo must be owner/repo");
  if (!(flags.title ?? "").trim()) throw new UsageError("--title is required");
  for (const axis of ["category", "type"] as const) {
    const v = (flags[axis] ?? "").trim();
    if (!v) throw new UsageError(`--${axis} is required (one ${axis}: value from the closed set)`);
    if (!v.startsWith(`${axis}:`) || v === `${axis}:`) throw new UsageError(`--${axis} must be '${axis}:<value>', got '${v}'`);
  }
  if (!(flags.remedy ?? "").trim()) {
    throw new UsageError("--remedy is required (the files/behaviour the remedy will touch) — an issue that names neither its remedy nor its files is under-specified");
  }
  if (!(flags.cited ?? "").trim()) flags.cited = "none";
  const blocking = flags.blocking === "1";
  if (blocking === (flags["non-blocking"] === "1")) {
    throw new UsageError(
      "exactly one of --blocking | --non-blocking is required — a blocker of your own progress is claimed and fixed by you; a non-blocking finding is left unclaimed (AGENTS.md R1)",
    );
  }
  flags.classification = blocking
    ? "**Blocking** — it blocks the filer's own progress, so the filer claims it at filing and fixes it."
    : "**Non-blocking** — genuinely separable; left unclaimed for a later session to pick up.";
  if (flags["evidence-file"]) {
    if ((flags.evidence ?? "").trim()) throw new UsageError("pass --evidence or --evidence-file, not both");
    flags.evidence = readFileSync(flags["evidence-file"], "utf8");
  }
  const missing = RCA_FIELDS.filter((f) => !(flags[f] ?? "").trim());
  if (missing.length) {
    throw new UsageError(
      `an issue is filed only after a full, verified RCA (AGENTS.md R1) — missing ${missing.map((m) => "--" + m).join(", ")}`,
    );
  }
  if (!evidenceHasTrace(flags.evidence)) {
    throw new UsageError(
      "--evidence carries no verified trace — paste the command and its output (a ``` fence or a '$ ' line) or a path:line reference; a claim no instrument produced is a hypothesis, not an issue",
    );
  }
  const id = identityFrom(flags);
  const body = issueBody(flags, buildFooter(id));
  const claim = blocking
    ? buildComment("CLAIM", "Filed as **blocking**: it blocks this session's own progress, so this session claims it at filing and fixes it.", id)
    : "";
  if (flags["dry-run"]) {
    out(body);
    if (claim) out("--- CLAIM (posted after the issue is created) ---\n" + claim);
    return EXIT.OK;
  }
  const res = await ghJson<{ html_url?: string; number?: number }>(`/repos/${flags.repo}/issues`, {
    method: "POST",
    body: { title: flags.title.trim(), body, labels: [flags.category, flags.type] },
  });
  out(String(res?.html_url ?? ""));
  if (blocking) {
    if (typeof res?.number !== "number") throw new GhError(0, "the issue was created but the API returned no number — CLAIM it by hand with `comment CLAIM <item> --assign`");
    const [item] = items([`${flags.repo}#${res.number}`]);
    out(await postComment(item, claim, { assign: true }));
  }
  return EXIT.OK;
}

/** Run the CLI; returns the exit code. */export async function main(
  argv: string[],
  out: (s: string) => void = (s) => process.stdout.write(s + "\n"),
  err: (s: string) => void = (s) => process.stderr.write(s + "\n"),
): Promise<number> {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "watch":
        return await cmdWatch(rest, out, err);
      case "status":
        return await cmdStatus(rest, out);
      case "items":
        return cmdItems(rest, out);
      case "footer":
        return cmdFooter(rest, out);
      case "comment":
        return await cmdComment(rest, out);
      case "issue":
        return await cmdIssue(rest, out);
      case "-h":
      case "--help":
      case "help":
        out(usage());
        return EXIT.OK;
      default:
        err(usage());
        err(`gh: unknown command '${cmd ?? ""}' — watch | status | items | footer | comment | issue`);
        return EXIT.USAGE;
    }
  } catch (e: any) {
    if (e instanceof RateLimitedError) {
      err(`FATAL gh ${cmd}: ${rateLimitMessage(e)}`);
      return EXIT.RATE;
    }
    if (e instanceof UsageError || e instanceof GhError) {
      err(`gh ${cmd}: ${e.message}`);
      return EXIT.USAGE;
    }
    err(`gh ${cmd}: ${e?.stack ?? e}`);
    return EXIT.USAGE;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
