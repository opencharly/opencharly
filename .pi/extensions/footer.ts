/**
 * footer.ts — the pi `coord_footer` tool: the two-line SESSION FOOTER for THIS pi session.
 *
 * Every agent-authored PR body, issue and comment ends with the session footer
 * (AGENTS.md "Session identity and inter-session communication"): the `Agent:` line naming
 * the work slug, an optional parent slug, the harness and the harness's OWN session id,
 * then the `Assisted-by:` trailer LAST. pi exposes its session id only to extensions
 * (`ctx.sessionManager.getSessionId()`), never to the shell, so the shared CLI
 * (`scripts/gh/cli.ts footer`) cannot read it — this tool is pi's binding of the SAME
 * builder, `scripts/gh/lib/coord.ts`'s `buildFooter` (opencharly/opencharly#1140).
 * `scripts/check-pi-footer.mjs` fires this module and asserts its output.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { TIERS, buildFooter, isTier } from "../../scripts/gh/lib/coord.ts";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "coord_footer",
    label: "Session footer",
    description:
      "Return the two-line session footer for THIS pi session — the `Agent:` line (work slug, " +
      "harness, this session's id) then the `Assisted-by:` trailer — to end a PR body, an issue " +
      "or a comment with, per AGENTS.md. Posts nothing.",
    promptSnippet: "Get the session footer that ends every PR body, issue and comment",
    promptGuidelines: [
      "End every PR body, issue and comment you author with the two lines `coord_footer` returns, as the LAST two lines.",
      "Pass `parent` when you are a subagent, naming the slug of the session that spawned you.",
    ],
    parameters: Type.Object({
      agent: Type.String({ description: "The work slug for the `Agent:` line." }),
      model: Type.String({ description: "The provider model name, as the Assisted-by trailer names it." }),
      confidence: Type.String({ description: `One of: ${TIERS.join(" | ")}.` }),
      parent: Type.Optional(Type.String({ description: "The parent slug, for a subagent." })),
      harness: Type.Optional(Type.String({ description: "The harness name (default pi)." })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const session = String(ctx?.sessionManager?.getSessionId?.() ?? "").trim();
      const agent = String(params.agent ?? "").trim();
      const model = String(params.model ?? "").trim();
      const confidence = String(params.confidence ?? "").trim();
      const harness = String(params.harness ?? "").trim() || "pi";
      const parent = String(params.parent ?? "").trim() || undefined;
      const missing = Object.entries({ agent, model, confidence, session })
        .filter(([, v]) => !v)
        .map(([k]) => k);
      if (missing.length) return text(`coord_footer: missing ${missing.join(", ")}`);
      if (!isTier(confidence))
        return text(`coord_footer: invalid confidence '${confidence}' — one of: ${TIERS.join(" | ")}`);
      return text(buildFooter({ agent, parent, harness, session, model, confidence }));
    },
  });
}
