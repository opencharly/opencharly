// live-github.mjs — the ONE definition of what the umbrella's LIVE gate layers read on real
// GitHub, shared by scripts/check-pi-watch.mjs (LIVE_PI) and scripts/check-gh-tools.mjs
// (LIVE_OPENCODE), so the two cannot drift apart (opencharly/opencharly#1170).

import { spawnSync } from "node:child_process";

/**
 * A real PR that merged on 2026-10-08. Its state never changes, so a live layer that
 * watches it is deterministic against the real service, and it only ever READS it.
 */
export const LIVE_MERGED_PR = "opencharly/dsh-opencharly#3";

/** The wake line the watcher prints for LIVE_MERGED_PR, as a pattern derived from it. */
export const LIVE_MERGED_LINE = new RegExp(`MERGED\\s+${LIVE_MERGED_PR.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\b`);

/**
 * Judge one live tool call from the harness's visible output.
 *
 *   - PASS: the model's own trace shows it CALLED the tool, and the expected result is there;
 *   - FAIL: it called the tool, and the result is NOT there (the binding or the engine broke);
 *   - SKIP: it never called the tool (a provider condition, not a finding).
 *
 * A reply that echoes the expected text with no call behind it is never a PASS.
 */
export function judgeLiveCall(text, calledRe, resultRe) {
  if (!calledRe.test(text)) return "SKIP";
  return resultRe.test(text) ? "PASS" : "FAIL";
}

/**
 * Whether the CLI can authenticate to real GitHub: a token in `env`, or a logged-in `gh`.
 * A live layer SKIPS visibly without one (R8: live or skip, never fake).
 */
export function hasGithubCredential(env = process.env) {
  if (env.GITHUB_TOKEN || env.GH_TOKEN) return true;
  return spawnSync("gh", ["auth", "token"], { stdio: "ignore" }).status === 0;
}
