/**
 * loop-guard.ts — breaks agent loops at their root.
 *
 * Two loop classes, two detectors:
 *
 * 1. TRUNCATION-RETRY loop (RCA'd 2026-08-30, first incident): when the
 *    model's response hits the output token cap, the harness (runLoop in the
 *    pi agent core) rejects every tool call in the truncated message with
 *    "the response hit the output token limit, so its arguments may be
 *    truncated. Re-issue the tool call with complete arguments." — and
 *    returns terminate:false. That error INSTRUCTS the model to re-issue the
 *    same call; the model regenerates the same oversized response; it is
 *    truncated again; the loop repeats forever (hundreds of identical calls,
 *    600M+ tokens burned, zero progress).
 *    The truncated path bypasses the tool_call/tool_result extension events
 *    (failToolCallsFromTruncatedMessage emits directly), so the loop cannot
 *    be intercepted at the rejection. But the RETRY goes through the normal
 *    path: the model's next turn re-issues the same call, and tool_call
 *    fires. Detector 1 blocks that retry with a corrective message.
 *
 * 2. BEHAVIORAL-RUT loop (RCA'd 2026-08-30, second incident): the model
 *    re-issues the SAME successful tool call (same tool + same serialized
 *    args) over and over — e.g. re-reading the same file ranges
 *    (sed -n "752,788p" / sed -n "1044,1091p" on the same file, 8+ times)
 *    instead of producing the deliverable. Each response is truncated, the
 *    model "recovers" context by re-running the same diagnostic, and the
 *    deliverable never gets written. These calls SUCCEED, so Detector 1
 *    never fires. Detector 2 counts per-call repeats and blocks the Nth
 *    identical call with a directive to change approach / delegate.
 *
 * Mechanism:
 *   1. message_end — when an assistant message ends with stopReason "length"
 *      (truncated), record the tool calls it carried (name + serialized args).
 *   2. tool_call — (a) when a call matches a recorded truncated call, BLOCK
 *      it with a directive to make a SHORTER response (split the work,
 *      delegate to a subagent) instead of re-issuing the same call;
 *      (b) when the same (tool, args) pair has been issued REPEAT_THRESHOLD
 *      times, BLOCK it with a directive to change approach and delegate.
 *
 * This is a real fix, not a workaround: it changes the actual instruction
 * that drives the loop (the harness's "Re-issue the tool call" error, or the
 * model's own rut) into one that breaks it, at the exact point where the
 * loop repeats.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface TruncatedCall {
  toolName: string;
  args: string;
}

/** Identical (tool, args) calls beyond this count are a behavioral rut. */
const REPEAT_THRESHOLD = 3;

export default function (pi: ExtensionAPI) {
  let truncatedCalls: TruncatedCall[] = [];
  const repeatCounts = new Map<string, number>();

  pi.on("message_end", async (event) => {
    const msg = event.message as any;
    if (!msg || msg.role !== "assistant" || msg.stopReason !== "length") return;
    const calls: TruncatedCall[] = (msg.content || [])
      .filter((b: any) => b && b.type === "toolCall")
      .map((b: any) => ({ toolName: b.name, args: JSON.stringify(b.arguments) }));
    if (calls.length > 0) truncatedCalls = calls;
  });

  pi.on("tool_call", async (event) => {
    const args = JSON.stringify(event.input);

    // Detector 1: exact re-issue of a call from a truncated response.
    if (truncatedCalls.length > 0) {
      const hit = truncatedCalls.find(
        (tc) => tc.toolName === event.toolName && tc.args === args
      );
      if (hit) {
        truncatedCalls = [];
        return {
          block: true,
          reason:
            "This tool call was part of a response truncated by the output token limit. " +
            "Do NOT re-issue it — the same call will be truncated again. " +
            "Change approach: make a SHORTER response, split the work into smaller " +
            "tool calls, or delegate the exploration to a subagent.",
        };
      }
    }

    // Detector 2: behavioral rut — the same call repeated REPEAT_THRESHOLD times.
    const key = event.toolName + "\u0000" + args;
    const n = (repeatCounts.get(key) || 0) + 1;
    repeatCounts.set(key, n);
    if (n >= REPEAT_THRESHOLD) {
      return {
        block: true,
        reason:
          "This exact tool call (" + event.toolName + ") has now been issued " + n +
          " times. You are in a behavioral loop: re-issuing the same call is not " +
          "producing progress. STOP and change approach — delegate the exploration " +
          "to a subagent that returns a concise verdict, or split the work into a " +
          "different, smaller step. Never re-issue the same diagnostic in a loop.",
      };
    }
  });
}
