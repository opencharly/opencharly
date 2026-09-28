/**
 * pr-watch.ts — opencode delivery for the GENERIC, harness-independent PR watcher.
 *
 * The watcher itself is `marketplace/scripts/gh_watch.sh` (pure shell, no opencode
 * imports). This file is the HARNESS BINDING and uses opencode's OWN SDK primitives —
 * never an `opencode run` subprocess (which starts a separate headless run, can race the
 * live session, and interrupts the in-flight turn):
 *
 *   - `client.tui.showToast(...)`                — the visible signal.
 *   - `client.session.prompt({ noReply: true })` — inject the alert as CONTEXT without
 *     starting a turn (SDK docs: "Inject context without triggering AI response (useful
 *     for plugins)"), so an in-flight turn is NOT interrupted and the alert is handled on
 *     the next turn. Omit `noReply` only when the wake must start a turn immediately.
 *
 * Config: one item per line in `.opencode/pr-watch.items` (blank lines / `#` ignored):
 *     acme/widget#12
 *
 * opencode loads plugins ONCE at startup — RESTART after editing. `setup(ctx)` starts the
 * re-arm loop DETACHED and returns immediately, so it never blocks startup. Defensive: if
 * the SDK client or the Bun shell is unavailable the plugin logs a warning and no-ops;
 * opencode keeps running.
 *
 * RDD note (load-bearing assumption to VERIFY on the next restart): the opencode V2
 * `setup(ctx)` context exposes `ctx.client` (the live SDK client) and Bun's `$`/`Bun`
 * globals. If that assumption is false the plugin is a visible no-op, not a breakage.
 */
export default {
  id: "pr-watch",
  async setup(ctx: any) {
    const client = ctx?.client;
    const dir: string = ctx?.location?.directory ?? ctx?.directory ?? process.cwd();
    if (!client?.tui?.showToast) return; // no SDK client → nothing to deliver with

    let items: string[] = [];
    try {
      items = (await Bun.file(`${dir}/.opencode/pr-watch.items`).text())
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("#"));
    } catch {
      return; // no config → watch nothing
    }
    if (items.length === 0) return;

    const script = `${dir}/marketplace/scripts/gh_watch.sh`;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const once = async () => {
      const proc = Bun.spawn(
        ["bash", script, "--events", "comment,merged,closed", ...items],
        { cwd: dir, stdout: "pipe", stderr: "ignore" },
      );
      const out = (await new Response(proc.stdout).text()).trim();
      await proc.exited;
      const line = out.split("\n").filter(Boolean).pop();
      if (!line) return;
      // 1. visible signal (no session id required)
      await client.tui
        .showToast({ body: { message: `PR-watch: ${line}`, variant: "info" } })
        .catch(() => {});
      // 2. context injection without starting a turn — enable + set the target session id
      //    when a proactive promptless wake is wanted:
      // await client.session.prompt({ path: { id: SESSION_ID },
      //   body: { noReply: true, parts: [{ type: "text", text: line }] } }).catch(() => {});
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
