/**
 * github-pr-status.ts — pi's one-shot PR status tool, a binding of the umbrella's ONE
 * watcher engine (`scripts/gh/lib/watch.ts`, opencharly/opencharly#1140).
 *
 * `gh_pr_status` reports, for each PR: its state, its head, the validator's verdict class
 * on THAT head (PASS / BLOCK / INCONCLUSIVE / PENDING / NONE — a REST re-run included),
 * and the newest verdict check run. The classification is the engine's `classify`, the
 * same one `scripts/gh/cli.ts status` and every harness's watcher use; this file adds no
 * logic of its own.
 *
 * WAITING is not this tool's job: arm the watcher (`watch_arm`, or `.pi/watch.items`),
 * whose wake is a user turn. A poll loop here would be a second, unfloored watcher.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { rateLimitMessage, RateLimitedError } from "../../scripts/gh/lib/github.ts";
import {
  DEFAULT_CHECK,
  DEFAULT_WORKFLOW,
  batchSnapshot,
  classify,
  parseItem,
  type Item,
} from "../../scripts/gh/lib/watch.ts";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "gh_pr_status",
    label: "PR validation status",
    description:
      "One-shot status of one or more PRs: state, head, and the charly/pr-validator verdict on that " +
      "head (PASS / BLOCK / INCONCLUSIVE / PENDING / NONE; a REST re-run included). To WAIT for a " +
      "verdict or a merge, arm the watcher (`watch_arm`) instead.",
    promptSnippet: "Read a PR's validator verdict on its current head",
    promptGuidelines: [
      "After a BLOCK, read the full `## Review` comment on the PR before fixing anything.",
      "Use `watch_arm` to wait; never call this tool in a loop.",
    ],
    parameters: Type.Object({
      items: Type.Array(Type.String({ description: "owner/repo#num or a PR URL" }), { minItems: 1 }),
    }),

    async execute(_toolCallId, params, signal) {
      const items: Item[] = [];
      for (const raw of params.items as string[]) {
        const it = parseItem(raw);
        if (!it) return text(`gh_pr_status: malformed item '${raw}' — want owner/repo#123 or a PR URL`);
        items.push(it);
      }
      try {
        const { snaps } = await batchSnapshot(items, {
          workflow: DEFAULT_WORKFLOW,
          check: DEFAULT_CHECK,
          signal,
        });
        const lines = items.map((it) => {
          const s = snaps.get(it.key);
          if (!s || !s.isPr) return `${it.key}  not a pull request (or not readable)`;
          const run = s.checkRunId ? `${s.checkStatus}${s.checkConclusion ? "/" + s.checkConclusion : ""}` : "none";
          return `${it.key}  state=${s.merged ? "merged" : s.state}  verdict=${classify(s)}  check=${run}  head=${s.headOid.slice(0, 12)}  https://github.com/${it.owner}/${it.repo}/pull/${it.num}`;
        });
        return text(lines.join("\n"));
      } catch (err: any) {
        if (err instanceof RateLimitedError) return text(`gh_pr_status: ${rateLimitMessage(err)}`);
        return text(`gh_pr_status: ${err?.message ?? String(err)}`);
      }
    },
  });
}
