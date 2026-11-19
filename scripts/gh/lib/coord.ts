/**
 * coord.ts — the ONE coordination toolset (opencharly/opencharly#1140): the closed verb
 * grammar, the coordination comment, the two-line session footer, the session identity,
 * and posting. It replaced `marketplace/scripts/coord.sh` and the OpenCode-only copy.
 *
 * Every agent-authored PR body, issue and comment ends with the session footer
 * (AGENTS.md "Session identity and inter-session communication"):
 *
 *     *Agent: `<slug>` · <Harness> session `<session-id>`*
 *     *Assisted-by: <Harness> <Provider Model> (<confidence>)*
 *
 * The first line is the shape `marketplace/scripts/pr_body_lint.py`'s SESSION_LINE accepts.
 */
import { ghJson } from "./github.ts";
import type { Item } from "./watch.ts";

export const TIERS = [
  "fully tested and validated",
  "analysed on a live system",
  "documentation reviewed",
  "syntax check only",
  "theoretical suggestion",
];

export const VERBS = [
  "CLAIM",
  "OWNING",
  "HANDING OVER",
  "TAKING OVER",
  "WAITING",
  "HOLDING",
  "CLEARED",
  "STATUS",
  "RESOLVED",
];

export function isTier(value: unknown): value is string {
  return typeof value === "string" && TIERS.includes(value);
}

/**
 * Canonicalise a verb: upper-case, `-`/`_` → space, runs of spaces collapsed, trimmed.
 * Returns the canonical label, or "" when it is not one of the closed set.
 */
export function canonicalVerb(verb: unknown): string {
  const canon = String(verb ?? "")
    .toUpperCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return VERBS.includes(canon) ? canon : "";
}

/** A session identity: the work slug, the harness and its session id, the model and tier. */
export interface Identity {
  agent: string;
  session: string;
  harness: string;
  model: string;
  confidence: string;
  /** The parent slug, for a subagent. */
  parent?: string;
}

/** The two-line session footer, `Agent:` FIRST and `Assisted-by:` LAST. */
export function buildFooter(id: Identity): string {
  const sub = id.parent ? ` (subagent of \`${id.parent}\`)` : "";
  return (
    `*Agent: \`${id.agent}\`${sub} · ${id.harness} session \`${id.session}\`*\n` +
    `*Assisted-by: ${id.harness} ${id.model} (${id.confidence})*`
  );
}

/** A coordination comment: the verb on the first line, the optional body, then the footer. */
export function buildComment(verb: string, body: string | undefined, id: Identity): string {
  const footer = buildFooter(id);
  return body ? `${verb}\n\n${body}\n\n${footer}` : `${verb}\n\n${footer}`;
}

/** The first-line verb predicate, derived from `VERBS`. */
export const VERB_RE = new RegExp(`^(${VERBS.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

/** The `Agent:` footer parser: the slug, the authority key. */
export const AGENT_RE = /Agent:\s*`([^`]+)`/;

/** The `Agent:` slug found in a comment body, or "". */
export function parseAgent(body: string): string {
  const m = AGENT_RE.exec(String(body ?? ""));
  return m ? m[1] : "";
}

/** The canonical verb a comment body opens with, or "". */
export function parseVerb(body: string): string {
  const first =
    String(body ?? "")
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.length > 0) ?? "";
  if (!VERB_RE.test(first)) return "";
  return VERBS.find((v) => first.toUpperCase().startsWith(v)) ?? "";
}

/**
 * The harness's OWN session, read from its environment when the caller names neither the
 * harness nor the session. Both halves come from ONE source or neither does, so a named
 * harness never borrows another harness's session id. OpenCode and pi pass their id in
 * process; a session started by a plugin may export `COORD_HARNESS` + `COORD_SESSION`.
 */
export function harnessSession(env: Record<string, string | undefined>): { harness: string; session: string } {
  if (env.COORD_HARNESS && env.COORD_SESSION) return { harness: env.COORD_HARNESS, session: env.COORD_SESSION };
  if (env.CLAUDE_CODE_SESSION_ID) return { harness: "Claude Code", session: env.CLAUDE_CODE_SESSION_ID };
  if (env.DSH_SESSION_ID) return { harness: "DeepSeek Harness", session: env.DSH_SESSION_ID };
  return { harness: "", session: "" };
}

/**
 * Resolve the footer identity. Precedence, highest first: explicit args, then a live
 * in-process session id, then `COORD_*` env and the harness's own environment, then a
 * config file's values. The session id is never taken from a different source than its
 * harness.
 */
export function resolveIdentity(
  args: Partial<Identity>,
  env: Record<string, string | undefined>,
  conf: Record<string, string> = {},
  live?: { harness: string; session: string },
): Identity {
  const pick = (...vals: Array<string | undefined>) => vals.find((v) => typeof v === "string" && v !== "") ?? "";
  let harness = pick(args.harness);
  let session = pick(args.session);
  if (!harness && !session) {
    const own = live?.session ? live : harnessSession(env);
    harness = own.harness || pick(conf.harness);
    session = own.session || pick(conf.session);
  } else if (!session && live?.session && (!harness || harness === live.harness)) {
    session = live.session;
    harness = harness || live.harness;
  }
  return {
    agent: pick(args.agent, env.COORD_AGENT, conf.agent),
    session,
    harness,
    model: pick(args.model, env.COORD_MODEL, conf.model),
    confidence: pick(args.confidence, env.COORD_CONFIDENCE, conf.confidence),
    parent: pick(args.parent, env.COORD_PARENT, conf.parent) || undefined,
  };
}

/** The identity fields still missing, in a fixed order. */
export function missingIdentity(id: Identity): string[] {
  return (["agent", "session", "harness", "model", "confidence"] as const).filter((k) => !id[k]);
}

/** Parse a `key=value` config file (`#` comments and blank lines ignored). */
export function parseConf(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (key) out[key] = line.slice(i + 1).trim();
  }
  return out;
}

/** Post a comment on an issue or PR and return its URL; `assign` also assigns the poster. */
export async function postComment(
  item: Item,
  body: string,
  opts: { assign?: boolean; signal?: AbortSignal } = {},
): Promise<string> {
  const res = await ghJson<{ html_url?: string }>(`/repos/${item.owner}/${item.repo}/issues/${item.num}/comments`, {
    method: "POST",
    body: { body },
    signal: opts.signal,
  });
  if (opts.assign) {
    const me = await ghJson<{ login?: string }>("/user", { signal: opts.signal });
    if (me?.login) {
      await ghJson(`/repos/${item.owner}/${item.repo}/issues/${item.num}/assignees`, {
        method: "POST",
        body: { assignees: [me.login] },
        signal: opts.signal,
      });
    }
  }
  return String(res?.html_url ?? "");
}
