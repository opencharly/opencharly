/**
 * lock.ts — one watcher per watch: a single-instance lock keyed on what is watched.
 *
 * The key is a hash of the normalised watch (its items, events and checks), so the same
 * watch armed twice is ONE watcher: a new arm TAKES OVER a live peer (it signals the peer
 * and waits for it to exit), which is how a re-arm REPLACES rather than adds. A peer that
 * will not exit within the grace period is a lock failure (the CLI exits 6). The lock is
 * a pid file in `$XDG_RUNTIME_DIR` (else the system temp dir), removed by its owner on
 * exit.
 */
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The lock directory. */
export function lockDir(env: Record<string, string | undefined> = process.env): string {
  return env.GH_WATCH_RUNTIME_DIR || env.XDG_RUNTIME_DIR || tmpdir();
}

/** The lock file for a watch key. */
export function lockPath(key: string, env: Record<string, string | undefined> = process.env): string {
  return join(lockDir(env), `charly-gh-watch-${createHash("sha1").update(key).digest("hex")}.pid`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire the lock for `key`, taking over a live holder. Returns a release function, or
 * `null` when a live holder would not exit within `graceMs`.
 */
export async function acquireLock(
  key: string,
  opts: { graceMs?: number; env?: Record<string, string | undefined> } = {},
): Promise<(() => void) | null> {
  const path = lockPath(key, opts.env);
  let holder = 0;
  try {
    holder = Number(readFileSync(path, "utf8").trim());
  } catch {
    holder = 0;
  }
  if (holder > 0 && holder !== process.pid && alive(holder)) {
    try {
      process.kill(holder, "SIGTERM");
    } catch {
      /* it exited between the check and the signal */
    }
    const deadline = Date.now() + (opts.graceMs ?? 5000);
    while (alive(holder) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    if (alive(holder)) return null;
  }
  writeFileSync(path, `${process.pid}\n`);
  return () => {
    try {
      if (Number(readFileSync(path, "utf8").trim()) === process.pid) rmSync(path, { force: true });
    } catch {
      /* already gone */
    }
  };
}
