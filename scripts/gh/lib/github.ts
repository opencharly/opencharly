/**
 * github.ts — the ONE GitHub client of the umbrella's watcher and coordination tools
 * (opencharly/opencharly#1140). Every harness reaches GitHub through this module:
 * OpenCode and pi in-process, and Claude Code, Codex, DeepSeek Harness and reasonix
 * through `scripts/gh/cli.ts`.
 *
 * AUTH — `GITHUB_TOKEN` / `GH_TOKEN` when set, else the `gh` CLI's stored token
 * (`gh auth token`, one async `execFile`). REST is `https://api.github.com`; GraphQL is
 * `<REST>/graphql`. `GITHUB_API_URL` overrides the base (GitHub Enterprise, tests).
 *
 * RATE LIMITS — ONE policy, used by every caller:
 *   * a REST 403 whose quota header reads 0, any 429, a GraphQL `RATE_LIMITED` error, or
 *     an error message about a rate limit throws `RateLimitedError`. It is never retried
 *     as "no event": the CLI exits 7 and the in-process callers surface it;
 *   * the remaining quota is read from each response's own `x-ratelimit-remaining`
 *     header (free, no extra call). Below `RATE_FLOOR` the watch backs off by
 *     `BACKOFF_FACTOR`, capped at `MAX_BACKOFF_S`.
 *
 * CANCELLATION — every call takes an optional `AbortSignal`, threaded into `fetch`.
 */
import { execFile } from "node:child_process";

export const DEFAULT_API = "https://api.github.com";

/** Core-quota floor below which a watch backs off instead of polling. */
export const RATE_FLOOR = 200;

/** Backoff multiplier applied to the poll interval when below `RATE_FLOOR`. */
export const BACKOFF_FACTOR = 2;

/** Backoff ceiling, seconds. */
export const MAX_BACKOFF_S = 600;

let cachedToken: string | undefined;

/** Resolve a token: `GITHUB_TOKEN` / `GH_TOKEN`, else the `gh` CLI's stored token. */
export async function resolveToken(): Promise<string | undefined> {
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (env) return env;
  if (cachedToken !== undefined) return cachedToken || undefined;
  cachedToken = await new Promise<string>((resolve) => {
    execFile("gh", ["auth", "token"], { encoding: "utf8" }, (err, stdout) =>
      resolve(err ? "" : String(stdout).trim()),
    );
  });
  return cachedToken || undefined;
}

/** A non-2xx GitHub API response, or a network failure (status 0). */
export class GhError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GhError";
  }
}

/** A rate-limit condition. Never swallowed, never retried as "no event". */
export class RateLimitedError extends Error {
  /** Unix seconds when the quota resets (0 when unknown). */
  resetAt: number;
  kind: "rest" | "graphql";
  constructor(kind: "rest" | "graphql", resetAt: number, message: string) {
    super(message);
    this.resetAt = resetAt;
    this.kind = kind;
    this.name = "RateLimitedError";
  }
}

/** The REST base (overridable) and its GraphQL endpoint. */
export function apiBase(): string {
  return process.env.GITHUB_API_URL || DEFAULT_API;
}
export function graphqlUrl(): string {
  return `${apiBase()}/graphql`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await resolveToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "opencharly-gh-tools",
  };
  if (token) headers.Authorization = `token ${token}`;
  return headers;
}

const headerEpoch = (res: Response): number => {
  const r = res.headers.get("x-ratelimit-reset");
  const n = r ? Number(r) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const headerRemaining = (res: Response): number | null => {
  const r = res.headers.get("x-ratelimit-remaining");
  const n = r ? Number(r) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** A response's rate-limit metadata, read from its headers. */
export interface RateInfo {
  /** Core-quota remaining, or null when the header was absent. */
  remaining: number | null;
  /** Unix seconds when the quota resets, or 0 when unknown. */
  resetAt: number;
}

export interface GhOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

function rateLimitedStatus(res: Response): boolean {
  return res.status === 429 || (res.status === 403 && headerRemaining(res) === 0);
}

/** Perform one REST request, returning the raw `Response` (2xx only). */
export async function ghFetch(path: string, opts: GhOptions = {}): Promise<Response> {
  const headers = await authHeaders();
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err: any) {
    if (opts.signal?.aborted) throw err;
    throw new GhError(0, `network error: ${err?.message ?? String(err)}`);
  }
  if (rateLimitedStatus(res)) {
    throw new RateLimitedError("rest", headerEpoch(res), `REST ${res.status} — rate limited`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GhError(res.status, `${opts.method ?? "GET"} ${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  return res;
}

/** Perform one REST request and parse the JSON body. */
export async function ghJson<T = any>(path: string, opts: GhOptions = {}): Promise<T> {
  return (await ghFetch(path, opts)).json() as Promise<T>;
}

/** Perform one GraphQL query. Partial `data` with field errors is returned as data. */
export async function ghGraphql(
  query: string,
  variables: Record<string, unknown>,
  opts: { signal?: AbortSignal } = {},
): Promise<{ data: any; rate: RateInfo }> {
  const headers = await authHeaders();
  headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(graphqlUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      signal: opts.signal,
    });
  } catch (err: any) {
    if (opts.signal?.aborted) throw err;
    throw new GhError(0, `network error: ${err?.message ?? String(err)}`);
  }
  const rate: RateInfo = { remaining: headerRemaining(res), resetAt: headerEpoch(res) };
  if (rateLimitedStatus(res)) {
    throw new RateLimitedError("rest", rate.resetAt, `GraphQL HTTP ${res.status} — rate limited`);
  }
  const body: any = await res.json().catch(() => ({}));
  const errors: any[] = Array.isArray(body?.errors) ? body.errors : [];
  for (const e of errors) {
    const type = String(e?.type ?? e?.extensions?.code ?? "");
    if (type === "RATE_LIMITED" || /rate limit/i.test(String(e?.message ?? ""))) {
      throw new RateLimitedError("graphql", rate.resetAt, `GraphQL RATE_LIMITED: ${e?.message ?? ""}`);
    }
  }
  if (!body?.data) {
    const msg = errors.map((e) => e?.message).filter(Boolean).join("; ") || `GraphQL HTTP ${res.status}`;
    throw new GhError(res.status, `GraphQL query failed: ${msg}`);
  }
  return { data: body.data, rate };
}

/** Human-readable rate-limit message (used verbatim by every caller). */
export function rateLimitMessage(e: RateLimitedError): string {
  const when = e.resetAt > 0 ? ` resets at ${new Date(e.resetAt * 1000).toISOString()}` : "";
  return `RATE-LIMITED (${e.kind}) — GitHub API rate limit hit.${when} No retry (fail hard).`;
}
