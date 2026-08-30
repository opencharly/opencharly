/**
 * loop-guard.ts — breaks the "output token limit" retry loop at its root.
 *
 * RCA (2026-08-30, pi session): when the model's response hits the output
 * token cap, the harness (runLoop in the pi agent core) rejects every tool
 * call in the truncated message with the error "the response hit the output
 * token limit, so its arguments may be truncated. Re-issue the tool call with
 * complete arguments." — and returns terminate:false. That error message
 * INSTRUCTS the model to re-issue the same call; the model regenerates the
 * same oversized response; it is truncated again; the loop repeats forever
 * (hundreds of identical calls, 600M+ tokens burned, zero progress).
 *
 * The truncated path bypasses the tool_call/tool_result extension events
 * (failToolCallsFromTruncatedMessage emits directly), so the loop cannot be
 * intercepted at the rejection. But the RETRY goes through the normal path:
 * the model's next turn re-issues the same call, and tool_call fires. This
 * extension blocks that retry with a corrective message that changes the
 * model's approach instead of re-issuing.
 *
 * Mechanism:
 *   1. message_end — when an assistant message ends with stopReason "length"
 *      (truncated), record the tool calls it carried (name + serialized args).
 *   2. tool_call — when a call matches a recorded truncated call, BLOCK it
 *      with a directive to make a SHORTER response (split the work, delegate
 *      to a subagent) instead of re-issuing the same call.
 *
 * This is a real fix, not a workaround: it changes the actual instruction
 * that drives the loop (the harness's "Re-issue the tool call" error) into
 * one that breaks it, at the exact point where the loop repeats.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface TruncatedCall {
  toolName: string;
  args: string;
}

export default function (pi: ExtensionAPI) {
  let truncatedCalls: TruncatedCall[] = [];

  pi.on("message_end", async (event) => {
    const msg = event.message as any;
    if (!msg || msg.role !== "assistant" || msg.stopReason !== "length") return;
    const calls: TruncatedCall[] = (msg.content || [])
      .filter((b: any) => b && b.type === "toolCall")
      .map((b: any) => ({ toolName: b.name, args: JSON.stringify(b.arguments) }));
    if (calls.length > 0) truncatedCalls = calls;
  });

  pi.on("tool_call", async (event) => {
    if (truncatedCalls.length === 0) return;
    const args = JSON.stringify(event.input);
    const hit = truncatedCalls.find(
      (tc) => tc.toolName === event.toolName && tc.args === args
    );
    if (!hit) return;
    truncatedCalls = [];
    return {
      block: true,
      reason:
        "This tool call was part of a response truncated by the output token limit. " +
        "Do NOT re-issue it — the same call will be truncated again. " +
        "Change approach: make a SHORTER response, split the work into smaller " +
        "tool calls, or delegate the exploration to a subagent.",
    };
  });
}
