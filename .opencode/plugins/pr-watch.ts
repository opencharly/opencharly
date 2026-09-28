/**
 * pr-watch.ts — opencode delivery binding for the GENERIC, harness-independent PR watcher.
 *
 * The watcher itself is `marketplace/scripts/gh_watch.sh` (pure shell, no opencode
 * imports). This file is the HARNESS BINDING: `setup(ctx)` starts a DETACHED re-arm
 * loop that runs the watcher via `Bun.spawn` and, on each wake, delivers the alert
 * with opencode's OWN SDK primitives — never an `opencode run` subprocess (which
 * starts a separate headless run, can race the live session, and interrupts the
 * in-flight turn):
 *
 *   1. `client.tui.showToast(...)` — the visible signal.
 *   2. `client.session.prompt({ noReply: true })` — inject the alert as CONTEXT into
 *      the target session without starting a turn (SDK docs: "Inject context without
 *      triggering AI response (useful for plugins)"), so an in-flight turn is NOT
 *      interrupted and the alert is handled on the next turn.
 *
 * The injection target is the most recently updated root session whose `directory`
 * equals this project directory (`client.session.list()`, excluding child sessions);
 * if none resolves, the wake is toast-only.
 *
 * Config: one item per line in `.opencode/pr-watch.items` (blank lines and `#`
 * comments ignored), e.g. `acme/widget#12`. Absent or comment-only → the plugin
 * watches nothing (inert). opencode loads plugins ONCE at startup — RESTART after
 * editing. `setup()` starts the loop detached and returns immediately.
 *
 * Defensive: if the `Bun` runtime, the SDK client (`client.tui.showToast`), or the
 * watcher script is unavailable, the plugin logs a warning (`client.app.log`, else
 * `console.warn`) and no-ops; opencode keeps running.
 *
 * UNPROVEN / INERT BY DEFAULT — this is the LANDED state, not a "verify later" note.
 * This binding has NOT been exercised under opencode's Bun runtime: no opencode V2 /
 * disposable target was available when it landed, so only the module and its pure
 * helpers were unit-tested (under Node). Do NOT rely on it. It watches nothing until
 * `.opencode/pr-watch.items` carries at least one item, and if the `setup(ctx)` context
 * does not expose `ctx.client`, or `Bun` is absent, or the watcher script is missing, it
 * logs a warning and no-ops rather than breaking startup.
 */

export function parseItems(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
}

export function pickSessionID(sessions: any[], directory: string): string | undefined {
  const roots = sessions.filter(
    (s) => s && typeof s.id === "string" && !s.parentID && s.directory === directory,
  );
  roots.sort((a, b) => (b?.time?.updated ?? 0) - (a?.time?.updated ?? 0));
  return roots[0]?.id;
}

export function lastWakeLine(stdout: string): string | undefined {
  return stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
}

export default {
  id: "pr-watch",
  async setup(ctx: any) {
    const client = ctx?.client;
    const dir: string = ctx?.location?.directory ?? ctx?.directory ?? process.cwd();

    const warn = (message: string) => {
      try {
        if (client?.app?.log) {
          void client.app.log({
            body: { service: "pr-watch", level: "warn", message },
          });
          return;
        }
      } catch {
        /* fall through to console */
      }
      console.warn(`pr-watch: ${message}`);
    };

    if (typeof Bun === "undefined") {
      warn("Bun runtime unavailable — watcher disabled");
      return;
    }
    if (!client?.tui?.showToast) {
      warn("SDK client unavailable — watcher disabled");
      return;
    }

    let items: string[] = [];
    try {
      items = parseItems(await Bun.file(`${dir}/.opencode/pr-watch.items`).text());
    } catch {
      return; // no config → watch nothing (inert by default)
    }
    if (items.length === 0) return;

    const script = `${dir}/marketplace/scripts/gh_watch.sh`;
    if (!(await Bun.file(script).exists())) {
      warn(`watcher script missing at ${script} — sync the marketplace pin`);
      return;
    }

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const deliver = async (line: string) => {
      // 1. the visible signal (no session id required)
      await client.tui
        .showToast({ body: { message: `PR-watch: ${line}`, variant: "info" } })
        .catch(() => {});
      // 2. inject the alert as CONTEXT without starting a turn
      try {
        const res = await client.session.list();
        const sessions = res?.data ?? res ?? [];
        const id = pickSessionID(sessions, dir);
        if (!id) return;
        await client.session
          .prompt({
            path: { id },
            body: { noReply: true, parts: [{ type: "text", text: line }] },
          })
          .catch(() => {});
      } catch {
        /* session list/prompt unavailable — the toast already fired */
      }
    };

    const once = async () => {
      const proc = Bun.spawn(
        ["bash", script, "--events", "comment,merged,closed", ...items],
        { cwd: dir, stdout: "pipe", stderr: "ignore" },
      );
      const out = (await new Response(proc.stdout).text()).trim();
      await proc.exited;
      const line = lastWakeLine(out);
      if (line) await deliver(line);
    };

    // re-arm loop, detached so setup() returns at once
    void (async () => {
      for (;;) {
        try {
          await once();
        } catch {
          /* transient (gh/network) — skip this wake, keep watching */
        }
        await sleep(30000);
      }
    })();
  },
};
