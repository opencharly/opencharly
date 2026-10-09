/**
 * question.ts — a `question` tool so a pi agent can ASK THE OPERATOR and block for the answer.
 *
 * WHY IT EXISTS. The operator asks agents to "use the question tool" when they need a decision.
 * pi ships the PRIMITIVE (`ctx.ui.select` / `ctx.ui.input` / `ctx.ui.confirm`, `docs/tui.md`) but
 * no model-callable tool, and the `.pi/` restore deliberately dropped the `pi-subagents` /
 * question packages (a `typebox` manifest warning). Without it an agent that needs a decision
 * can only ask in prose and stop — which is the behaviour this tool replaces.
 *
 * NEUTRALITY. This is unavoidably pi-SPECIFIC: it binds pi's own UI primitive, and there is no
 * harness-neutral way to prompt a live session. It is exactly the "only if needed" case the
 * operator's neutral-first directive allows. Everything else the umbrella needs is neutral.
 *
 * IT IS DELIBERATELY THIN. It does NOT use the heavy `@earendil-works/pi-tui` custom-widget
 * example (`examples/extensions/question.ts`): the builtin `ctx.ui.select` / `ctx.ui.input`
 * cover the need with **zero new dependency**.
 *
 * HEADLESS MODE. In a non-TUI session (`pi -p`, CI, a subagent) there is nobody to prompt, so the
 * tool returns a CLEAR result saying so and telling the model to ask in prose and stop — it never
 * throws and never pretends it got an answer (R3: no silent fallback that looks like success).
 *
 * The answer is returned as ordinary tool output, so the model can act on it in the same turn.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** The tool's structured `details` payload (stable for callers/tests). */
interface QuestionDetails {
  question: string;
  options: string[];
  /** The chosen option or typed text, or null when the operator cancelled. */
  answer: string | null;
  /** True when the answer was typed rather than picked from `options`. */
  wasCustom: boolean;
  /** Why no answer was obtained, when `answer` is null. */
  reason?: string;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "question",
    label: "Ask the operator a question",
    description:
      "Ask the operator a question and BLOCK until they answer. Pass `options` for a " +
      "pick-one list (the operator can also type a custom answer), or omit it for free text. " +
      "Use this whenever you need a decision, an approval, or a missing fact instead of asking " +
      "in prose and stopping. In a non-interactive session it returns a clear 'no UI' result.",
    promptSnippet: "Ask the operator a question and wait for the answer",
    promptGuidelines: [
      "Use `question` when you need the operator's decision or approval; do not ask in prose and end the turn.",
      "Pass `options` when the choice is a closed set, and omit it for free text.",
      "Only one question per call; call it again for a second question.",
      "In a non-interactive session the tool reports that no UI is available — then ask in prose and stop.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "The question to put to the operator." }),
      options: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional pick-one list. Omit for a free-text answer.",
        }),
      ),
      header: Type.Optional(
        Type.String({ description: "Optional short title shown above the question." }),
      ),
    }),
    // Serialize sibling tool calls: a prompt is exclusive UI, and two concurrent prompts race.
    executionMode: "sequential",

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const question = String(params.question ?? "").trim();
      const options = Array.isArray(params.options)
        ? (params.options as unknown[]).map((o) => String(o)).filter((o) => o.trim() !== "")
        : [];
      const header = String(params.header ?? "").trim();
      const title = header ? `${header}\n\n${question}` : question;

      if (question === "") {
        return {
          content: [{ type: "text", text: "Error: `question` is required." }],
          details: { question: "", options, answer: null, wasCustom: false, reason: "empty question" } as QuestionDetails,
        };
      }

      // Headless: nobody to prompt. Say so plainly; never fake an answer.
      if (ctx.mode !== "tui" || !ctx.hasUI) {
        return {
          content: [
            {
              type: "text",
              text:
                `No interactive UI in this session (mode: ${ctx.mode}). Ask the operator in ` +
                `prose and stop — do not retry this tool here.`,
            },
          ],
          details: { question, options, answer: null, wasCustom: false, reason: "no ui" } as QuestionDetails,
        };
      }

      if (options.length > 0) {
        const picked = await ctx.ui.select(title, options);
        if (picked === null || picked === undefined) {
          return {
            content: [{ type: "text", text: "The operator cancelled the question (no answer)." }],
            details: { question, options, answer: null, wasCustom: false, reason: "cancelled" } as QuestionDetails,
          };
        }
        return {
          content: [{ type: "text", text: `Answer: ${picked}` }],
          details: { question, options, answer: picked, wasCustom: !options.includes(picked) } as QuestionDetails,
        };
      }

      const typed = await ctx.ui.input(title, "Type your answer and press Enter");
      if (typed === null || typed === undefined) {
        return {
          content: [{ type: "text", text: "The operator cancelled the question (no answer)." }],
          details: { question, options, answer: null, wasCustom: true, reason: "cancelled" } as QuestionDetails,
        };
      }
      const answer = String(typed).trim();
      return {
        content: [{ type: "text", text: `Answer: ${answer || "(empty)"}` }],
        details: { question, options, answer, wasCustom: true } as QuestionDetails,
      };
    },
  });
}
