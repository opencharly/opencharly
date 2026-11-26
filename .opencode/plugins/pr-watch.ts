/**
 * pr-watch.ts — OpenCode-native delivery binding for the PR/issue watcher.
 *
 * The watcher is the ONE engine every harness uses, `scripts/gh/lib/watch.ts`
 * (opencharly/opencharly#1140), imported in-process. Its contract — the events, the
 * verdict, the wake lines — is stated there. The OpenCode delivery (session capture,
 * `ctx.session.synthetic`) lives in `../lib/watcher-loop.ts`, which `tracker.ts` shares;
 * this plugin is the `pr-watch.items` CONFIG binding over it.
 *
 * DELIVERY — measured 2026-09-28 against the REAL v2.0.18 binary. The V2 `setup(ctx)`
 * context does NOT carry `client`; the V2 "inject context without starting a turn"
 * primitive is `ctx.session.synthetic({ sessionID, text })` (default `delivery: steer`,
 * so the alert is ADDED to the running session). The session id is CAPTURED from the
 * first tool call (`ctx.tool.hook("execute.before", …)`) or the first prompt
 * (`ctx.session.hook("prompt", …)`). The 1.x `server(input)` path keeps the documented
 * SDK-client shape (`client.tui.showToast` + `noReply: true`).
 *
 * Config: one item per line in `.opencode/pr-watch.items` (blank lines and `#`
 * comments ignored). Absent or comment-only → the plugin watches nothing (inert).
 * opencode loads plugins ONCE at startup — RESTART after editing.
 * `setup()` starts the loop detached and returns immediately.
 *
 * Defensive: if the session domain is unavailable or a poll fails transiently, the
 * plugin logs/skips and no-ops; opencode keeps running.
 */
import { DEFAULT_WORKFLOW, parseItem, parseItemsFile, type Item } from "../../scripts/gh/lib/watch.ts";
import { makeWarn, readText, v2SessionSink, watchLoop } from "../lib/watcher-loop.ts";

// The config-line grammar is the ENGINE's (`parseItemsFile`, over `parseItem`). This plugin
// owns none of it: a private copy here silently dropped `#issuecomment` URLs the engine
// accepts (opencharly/opencharly#1308).

/**
 * The watcher event set delivered to the session. It MUST include `comment` (the
 * BLOCK/PASS review comment) AND `verdict` (the `charly/pr-validator` run reaching a
 * status) — omitting either is the defect that let a BLOCK pass silently — beside the
 * terminal outcomes.
 */
export const WATCH_EVENTS = "comment,merged,closed,conflict,verdict";

/** The validator workflow whose COMPLETED runs are the progress signal. */
const WF = DEFAULT_WORKFLOW;

export function pickSessionID(sessions: any[], directory: string): string | undefined {
  const roots = sessions.filter(
    (s) => s && typeof s.id === "string" && !s.parentID && s.directory === directory,
  );
  roots.sort((a, b) => (b?.time?.updated ?? 0) - (a?.time?.updated ?? 0));
  return roots[0]?.id;
}

export default {
  id: "pr-watch",
  // opencode >= 2.0 definition form: the context carries `session` + `location`.
  async setup(ctx: any) {
    await watchV2(ctx, ctx?.location?.directory ?? ctx?.directory ?? process.cwd());
  },
  // opencode 1.x function form: the input carries the SDK `client` + `directory`.
  async server(input: any) {
    // The watcher runs as a detached side-effect; the 1.x hook surface has no
    // equivalent registration to return, so return an empty hook map.
    void watchV1(input?.client, input?.directory ?? process.cwd());
    return {};
  },
};

const warn = makeWarn("pr-watch");

/** Parse `.opencode/pr-watch.items` into watch targets (inert when absent/empty). */
async function loadItems(dir: string): Promise<Item[]> {
  const file = `${dir}/.opencode/pr-watch.items`;
  let raw: string;
  try {
    raw = await readText(file);
  } catch {
    return []; // no config → watch nothing (inert by default)
  }
  const items: Item[] = [];
  for (const line of parseItemsFile(raw)) {
    const it = parseItem(line);
    if (!it) {
      warn(`ignoring malformed item '${line}' (want owner/repo#num)`);
      continue;
    }
    items.push(it);
  }
  return items;
}

// --- V2 binding (measured opencode >= 2.0) ----------------------------------

async function watchV2(ctx: any, dir: string) {
  const sink = await v2SessionSink(ctx, "PR-watch:", warn);
  if (!sink) return;
  const items = await loadItems(dir);
  if (items.length === 0) return;
  await watchLoop(items, {
    events: WATCH_EVENTS,
    wf: WF,
    deliver: sink.deliver,
    warn,
  });
}

// --- V1 binding (opencode 1.x SDK client) -----------------------------------

async function watchV1(client: any, dir: string) {
  if (!client?.tui?.showToast) {
    warn("1.x SDK client unavailable — watcher disabled");
    return;
  }
  const deliver = async (line: string) => {
    await client.tui
      .showToast({ body: { message: `PR-watch: ${line}`, variant: "info" } })
      .catch(() => {});
    try {
      const res = await client.session.list();
      const sessions = res?.data ?? res ?? [];
      const id = pickSessionID(sessions, dir);
      if (!id) return;
      await client.session
        .prompt({ path: { id }, body: { noReply: true, parts: [{ type: "text", text: line }] } })
        .catch(() => {});
    } catch {
      /* session list/prompt unavailable — the toast already fired */
    }
  };
  const items = await loadItems(dir);
  if (items.length === 0) return;
  await watchLoop(items, { events: WATCH_EVENTS, wf: WF, deliver, warn });
}
